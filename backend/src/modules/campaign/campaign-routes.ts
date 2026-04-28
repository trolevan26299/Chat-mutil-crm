/**
 * Campaign Routes — CRUD for CampaignGroup + Campaign, plus run/pause/queue actions.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { enqueueCampaign } from './campaign-runner.js';
import { calcNextRun } from './campaign-scheduler.js';

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try { await request.jwtVerify(); }
  catch { return reply.status(401).send({ error: 'unauthorized' }); }
}

async function getOrgId(request: FastifyRequest): Promise<string> {
  const payload = request.user as { id: string; orgId: string };
  return payload.orgId;
}

export async function campaignRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────────
  // CAMPAIGN GROUPS
  // ──────────────────────────────────────────────────────────────

  // List groups
  app.get('/api/v1/campaign-groups', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const groups = await prisma.campaignGroup.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { campaigns: true } } },
    });
    return reply.send(groups);
  });

  // Create group
  app.post('/api/v1/campaign-groups', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { name, description, mode, contactIds } = req.body as any;
    if (!name) return reply.status(400).send({ error: 'name required' });
    const group = await prisma.campaignGroup.create({
      data: { orgId, name, description, mode: mode || 'manual', contactIds: contactIds || [] },
    });
    return reply.status(201).send(group);
  });

  // Get group
  app.get('/api/v1/campaign-groups/:id', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const group = await prisma.campaignGroup.findFirst({
      where: { id, orgId },
      include: { campaigns: { select: { id: true, title: true, status: true } } },
    });
    if (!group) return reply.status(404).send({ error: 'not_found' });
    return reply.send(group);
  });

  // Update group
  app.put('/api/v1/campaign-groups/:id', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const { name, description, mode, contactIds } = req.body as any;
    const group = await prisma.campaignGroup.updateMany({
      where: { id, orgId },
      data: { name, description, mode, contactIds: contactIds || [] },
    });
    if (!group.count) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ ok: true });
  });

  // Delete group
  app.delete('/api/v1/campaign-groups/:id', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    await prisma.campaignGroup.deleteMany({ where: { id, orgId } });
    return reply.send({ ok: true });
  });

  // Resolve contact count for a group
  app.get('/api/v1/campaign-groups/:id/contacts', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const group = await prisma.campaignGroup.findFirst({ where: { id, orgId } });
    if (!group) return reply.status(404).send({ error: 'not_found' });
    const contacts = await resolveGroupContacts(group, orgId);
    return reply.send({ total: contacts.length, contacts });
  });

  // ──────────────────────────────────────────────────────────────
  // CAMPAIGNS
  // ──────────────────────────────────────────────────────────────

  // List campaigns
  app.get('/api/v1/campaigns', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const campaigns = await prisma.campaign.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        group: { select: { id: true, name: true, mode: true } },
      },
    });

    if (campaigns.length > 0) {
      const stats = await prisma.campaignQueue.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: campaigns.map(c => c.id) } },
        _count: { status: true },
      });
      return reply.send(campaigns.map(c => ({
        ...c,
        queueStats: stats.filter(s => s.campaignId === c.id),
      })));
    }
    
    return reply.send(campaigns);
  });

  // Create campaign
  app.post('/api/v1/campaigns', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { title, groupId, content, scheduleType, scheduleTime, scheduleValue, isRecurring } = req.body as any;
    if (!title || !groupId) return reply.status(400).send({ error: 'title and groupId required' });
    // Verify group belongs to org
    const group = await prisma.campaignGroup.findFirst({ where: { id: groupId, orgId } });
    if (!group) return reply.status(400).send({ error: 'invalid groupId' });

    const nextRunAt = calcNextRun({ scheduleType, scheduleTime, scheduleValue });
    const campaign = await prisma.campaign.create({
      data: {
        orgId, groupId, title,
        content: content || [],
        scheduleType: scheduleType || 'once',
        scheduleTime, scheduleValue,
        isRecurring: !!isRecurring,
        status: 'draft',
        nextRunAt,
      },
    });
    return reply.status(201).send(campaign);
  });

  // Get campaign detail + queue summary
  app.get('/api/v1/campaigns/:id', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const campaign = await prisma.campaign.findFirst({
      where: { id, orgId },
      include: {
        group: true,
        _count: { select: { queueItems: true } },
      },
    });
    if (!campaign) return reply.status(404).send({ error: 'not_found' });
    // Queue stats
    const stats = await prisma.campaignQueue.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { status: true },
    });
    return reply.send({ ...campaign, queueStats: stats });
  });

  // Update campaign
  app.put('/api/v1/campaigns/:id', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const { title, groupId, content, scheduleType, scheduleTime, scheduleValue, isRecurring, status } = req.body as any;
    const nextRunAt = calcNextRun({ scheduleType, scheduleTime, scheduleValue });
    await prisma.campaign.updateMany({
      where: { id, orgId },
      data: { title, groupId, content, scheduleType, scheduleTime, scheduleValue, isRecurring, status, nextRunAt },
    });
    return reply.send({ ok: true });
  });

  // Delete campaign
  app.delete('/api/v1/campaigns/:id', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    await prisma.campaign.deleteMany({ where: { id, orgId } });
    return reply.send({ ok: true });
  });

  // Activate campaign
  app.post('/api/v1/campaigns/:id/activate', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const campaign = await prisma.campaign.findFirst({ where: { id, orgId } });
    if (!campaign) return reply.status(404).send({ error: 'not_found' });
    const nextRunAt = calcNextRun({
      scheduleType: campaign.scheduleType,
      scheduleTime: campaign.scheduleTime,
      scheduleValue: campaign.scheduleValue,
    });
    await prisma.campaign.updateMany({ where: { id, orgId }, data: { status: 'active', nextRunAt } });
    return reply.send({ ok: true });
  });

  // Pause campaign
  app.post('/api/v1/campaigns/:id/pause', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    await prisma.campaign.updateMany({ where: { id, orgId }, data: { status: 'paused' } });
    return reply.send({ ok: true });
  });

  // Run campaign immediately
  app.post('/api/v1/campaigns/:id/run', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const campaign = await prisma.campaign.findFirst({
      where: { id, orgId },
      include: { group: true },
    });
    if (!campaign) return reply.status(404).send({ error: 'not_found' });
    // Enqueue async — don't await so API returns quickly
    enqueueCampaign(campaign as any).catch(console.error);
    return reply.send({ ok: true, message: 'Campaign queued' });
  });

  // Get queue items for a campaign
  app.get('/api/v1/campaigns/:id/queue', { preHandler: authenticate }, async (req, reply) => {
    const orgId = await getOrgId(req);
    const { id } = req.params as { id: string };
    const { page = '1', limit = '50' } = req.query as any;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      prisma.campaignQueue.findMany({
        where: { campaignId: id, campaign: { orgId } },
        orderBy: [{ chunkIndex: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: parseInt(limit),
        include: {
          contact: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
          zaloAccount: { select: { id: true, displayName: true } },
        },
      }),
      prisma.campaignQueue.count({ where: { campaignId: id, campaign: { orgId } } }),
    ]);
    return reply.send({ items, total, page: parseInt(page), limit: parseInt(limit) });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function resolveGroupContacts(group: any, orgId: string) {
  const mode = group.mode as 'all' | 'exclude' | 'manual';
  const storedIds = (group.contactIds || []) as string[];

  if (mode === 'all') {
    return prisma.contact.findMany({
      where: { orgId },
      select: { id: true, fullName: true, phone: true, avatarUrl: true,
        conversations: { select: { id: true, zaloAccountId: true }, take: 5 } },
    });
  }

  if (mode === 'exclude') {
    return prisma.contact.findMany({
      where: { orgId, id: { notIn: storedIds } },
      select: { id: true, fullName: true, phone: true, avatarUrl: true,
        conversations: { select: { id: true, zaloAccountId: true }, take: 5 } },
    });
  }

  // manual
  if (!storedIds.length) return [];
  return prisma.contact.findMany({
    where: { orgId, id: { in: storedIds } },
    select: { id: true, fullName: true, phone: true, avatarUrl: true,
      conversations: { select: { id: true, zaloAccountId: true }, take: 5 } },
  });
}
