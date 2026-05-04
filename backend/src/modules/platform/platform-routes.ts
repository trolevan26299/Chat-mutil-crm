/**
 * platform-routes.ts — Super admin API for managing tenants (organizations).
 * All routes require platform admin JWT (isPlatformAdmin: true).
 * Prefix: /api/platform/
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { platformLogin, requirePlatformAdmin } from './platform-auth.js';
import { invalidateTenantCache } from './tenant-resolver.js';
import { PLAN_NAMES, getPlanLimits } from './plan-config.js';

export async function platformRoutes(app: FastifyInstance): Promise<void> {

  // ── Platform Admin Auth ─────────────────────────────────────────────────

  app.post('/api/platform/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as { email: string; password: string };
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password required' });
    }

    const payload = await platformLogin(email, password);
    const token = app.jwt.sign(payload, { expiresIn: '24h' });
    return { token, user: payload };
  });

  // ── All routes below require platform admin ─────────────────────────────
  // Check if platform admin exists (for first-run setup)
  app.get('/api/platform/setup/status', async () => {
    const count = await prisma.platformAdmin.count();
    return { needsSetup: count === 0 };
  });

  // First-run: create platform super admin
  app.post('/api/platform/setup', async (request: FastifyRequest, reply: FastifyReply) => {
    const existing = await prisma.platformAdmin.count();
    if (existing > 0) {
      return reply.status(400).send({ error: 'Platform admin already exists' });
    }

    const { email, password, fullName } = request.body as { email: string; password: string; fullName: string };
    if (!email || !password || !fullName) {
      return reply.status(400).send({ error: 'email, password, fullName required' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.platformAdmin.create({
      data: { email: email.toLowerCase().trim(), passwordHash, fullName },
    });

    const payload = { id: admin.id, email: admin.email, role: admin.role, isPlatformAdmin: true as const };
    const token = app.jwt.sign(payload, { expiresIn: '24h' });

    logger.info(`[platform] Super admin created: ${admin.email}`);
    return { token, user: payload };
  });

  // ── Protected platform routes ───────────────────────────────────────────

  app.get('/api/platform/stats', { preHandler: requirePlatformAdmin }, async () => {
    const [totalOrgs, activeOrgs, totalUsers, totalZalo] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.zaloAccount.count(),
    ]);

    return { totalOrgs, activeOrgs, totalUsers, totalZalo };
  });

  // ── Tenant CRUD ─────────────────────────────────────────────────────────

  // List all tenants
  app.get('/api/platform/tenants', { preHandler: requirePlatformAdmin }, async (request: FastifyRequest) => {
    const { search = '', status = '', plan = '' } = request.query as Record<string, string>;

    const where: any = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tenants = await prisma.organization.findMany({
      where,
      select: {
        id: true, name: true, slug: true, plan: true, status: true,
        maxZalo: true, aiEnabled: true, expiresAt: true, createdAt: true,
        _count: { select: { users: true, zaloAccounts: true, contacts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { tenants };
  });

  // Get single tenant detail
  app.get('/api/platform/tenants/:id', { preHandler: requirePlatformAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const tenant = await prisma.organization.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        zaloAccounts: { select: { id: true, displayName: true, status: true, createdAt: true } },
        subscriptionLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { contacts: true, conversations: true, campaigns: true } },
      },
    });

    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    return tenant;
  });

  // Create new tenant (org + admin user)
  app.post('/api/platform/tenants', { preHandler: requirePlatformAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, slug, plan = 'trial', adminEmail, adminPassword, adminFullName, expiresAt, contactName, contactPhone, notes } = request.body as {
      name: string;
      slug: string;
      plan?: string;
      adminEmail: string;
      adminPassword: string;
      adminFullName: string;
      expiresAt?: string;
      contactName?: string;
      contactPhone?: string;
      notes?: string;
    };

    // Validate required fields
    if (!name || !slug || !adminEmail || !adminPassword || !adminFullName) {
      return reply.status(400).send({ error: 'name, slug, adminEmail, adminPassword, adminFullName are required' });
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
      return reply.status(400).send({ error: 'Slug phải từ 3-50 ký tự, chỉ chứa a-z, 0-9, dấu gạch ngang' });
    }

    // Validate plan
    if (!PLAN_NAMES.includes(plan)) {
      return reply.status(400).send({ error: `Plan không hợp lệ. Các plan: ${PLAN_NAMES.join(', ')}` });
    }

    // Check slug uniqueness
    const existingSlug = await prisma.organization.findUnique({ where: { slug } });
    if (existingSlug) {
      return reply.status(400).send({ error: 'Slug đã được sử dụng' });
    }

    // Check admin email uniqueness
    const existingEmail = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase().trim() } });
    if (existingEmail) {
      return reply.status(400).send({ error: 'Email admin đã tồn tại trong hệ thống' });
    }

    const planLimits = getPlanLimits(plan);
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          plan,
          status: 'active',
          maxZalo: planLimits.maxZalo,
          aiEnabled: planLimits.aiEnabled,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          contactName: contactName || null,
          contactPhone: contactPhone || null,
          notes: notes || null,
        },
      });

      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          orgId: org.id,
          email: adminEmail.toLowerCase().trim(),
          passwordHash,
          fullName: adminFullName,
          role: 'owner',
        },
      });

      // Create AI config for the org
      await tx.aiConfig.create({
        data: {
          orgId: org.id,
          enabled: planLimits.aiEnabled,
          model: 'google/gemini-2.0-flash-001',
          maxDaily: planLimits.aiMaxDaily,
        },
      });

      // Log creation
      await tx.subscriptionLog.create({
        data: {
          orgId: org.id,
          action: 'created',
          plan,
          note: `Tenant created by platform admin`,
          createdBy: (request.user as any)?.id,
        },
      });

      return { org, user };
    });

    logger.info(`[platform] Tenant created: ${result.org.slug} (${result.org.id}), admin: ${result.user.email}`);
    return reply.status(201).send({
      tenant: { id: result.org.id, name: result.org.name, slug: result.org.slug, plan: result.org.plan },
      admin: { id: result.user.id, email: result.user.email },
    });
  });

  // Update tenant (plan, status, limits)
  app.put('/api/platform/tenants/:id', { preHandler: requirePlatformAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true, slug: true, plan: true } });
    if (!existing) return reply.status(404).send({ error: 'Tenant not found' });

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.plan !== undefined) {
      if (!PLAN_NAMES.includes(body.plan)) {
        return reply.status(400).send({ error: 'Plan không hợp lệ' });
      }
      data.plan = body.plan;
      // Update limits based on new plan
      const limits = getPlanLimits(body.plan);
      data.maxZalo = limits.maxZalo;
      data.aiEnabled = limits.aiEnabled;
    }
    if (body.status !== undefined) data.status = body.status;
    if (body.maxZalo !== undefined) data.maxZalo = body.maxZalo;
    if (body.aiEnabled !== undefined) data.aiEnabled = body.aiEnabled;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl;
    if (body.primaryColor !== undefined) data.primaryColor = body.primaryColor;
    if (body.contactName !== undefined) data.contactName = body.contactName;
    if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone;
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await prisma.organization.update({ where: { id }, data });

    // Log if plan or status changed
    if (body.plan && body.plan !== existing.plan) {
      await prisma.subscriptionLog.create({
        data: {
          orgId: id,
          action: body.plan > existing.plan ? 'upgraded' : 'downgraded',
          plan: body.plan,
          note: body.note || null,
          createdBy: (request.user as any)?.id,
        },
      });
    }

    // Clear cache
    invalidateTenantCache(existing.slug);
    if (body.slug && body.slug !== existing.slug) {
      invalidateTenantCache(body.slug);
    }

    logger.info(`[platform] Tenant updated: ${updated.slug} (${id})`);
    return updated;
  });

  // Suspend tenant
  app.post('/api/platform/tenants/:id/suspend', { preHandler: requirePlatformAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { note } = (request.body as any) || {};

    const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, slug: true, plan: true } });
    if (!org) return reply.status(404).send({ error: 'Tenant not found' });

    await prisma.organization.update({ where: { id }, data: { status: 'suspended' } });
    await prisma.subscriptionLog.create({
      data: { orgId: id, action: 'suspended', plan: org.plan, note, createdBy: (request.user as any)?.id },
    });

    invalidateTenantCache(org.slug);
    logger.info(`[platform] Tenant suspended: ${org.slug}`);
    return { success: true };
  });

  // Activate tenant
  app.post('/api/platform/tenants/:id/activate', { preHandler: requirePlatformAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, slug: true, plan: true } });
    if (!org) return reply.status(404).send({ error: 'Tenant not found' });

    await prisma.organization.update({ where: { id }, data: { status: 'active' } });
    await prisma.subscriptionLog.create({
      data: { orgId: id, action: 'activated', plan: org.plan, createdBy: (request.user as any)?.id },
    });

    invalidateTenantCache(org.slug);
    logger.info(`[platform] Tenant activated: ${org.slug}`);
    return { success: true };
  });

  // Get available plans
  app.get('/api/platform/plans', { preHandler: requirePlatformAdmin }, async () => {
    return { plans: PLAN_NAMES.map(name => ({ name, ...getPlanLimits(name) })) };
  });
}
