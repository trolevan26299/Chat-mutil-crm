/**
 * tenant-limits.ts — Middleware factories to enforce per-tenant resource limits.
 * Usage: add as preHandler on routes that create new resources.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import type { TenantOrg } from './tenant-resolver.js';

/**
 * Check if the tenant can add more Zalo accounts.
 * Use as preHandler on POST /api/v1/zalo/accounts
 */
export async function checkZaloLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) return;

  const tenantOrg = (request as any).tenantOrg as TenantOrg | undefined;
  const orgId = user.orgId;

  // Get maxZalo from tenant org (injected by tenantResolver) or from DB
  let maxZalo = tenantOrg?.maxZalo ?? 2;
  if (!tenantOrg) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { maxZalo: true },
    });
    maxZalo = org?.maxZalo ?? 2;
  }

  const currentCount = await prisma.zaloAccount.count({ where: { orgId } });
  if (currentCount >= maxZalo) {
    return reply.status(403).send({
      error: `Đã đạt giới hạn ${maxZalo} tài khoản Zalo. Vui lòng nâng cấp gói để thêm tài khoản.`,
      code: 'ZALO_LIMIT_REACHED',
    });
  }
}

/**
 * Check if AI is enabled for this tenant.
 * Use as preHandler on AI routes.
 */
export async function checkAiEnabled(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) return;

  const tenantOrg = (request as any).tenantOrg as TenantOrg | undefined;
  let aiEnabled = tenantOrg?.aiEnabled ?? false;

  if (!tenantOrg) {
    const org = await prisma.organization.findUnique({
      where: { id: user.orgId },
      select: { aiEnabled: true },
    });
    aiEnabled = org?.aiEnabled ?? false;
  }

  if (!aiEnabled) {
    return reply.status(403).send({
      error: 'Gói hiện tại không bao gồm tính năng AI. Vui lòng nâng cấp gói để sử dụng.',
      code: 'AI_NOT_ENABLED',
    });
  }
}

/**
 * Check if the tenant can add more users.
 * Use as preHandler on POST /api/v1/users
 */
export async function checkUserLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) return;

  const org = await prisma.organization.findUnique({
    where: { id: user.orgId },
    select: { plan: true },
  });

  // Derive max users from plan
  const plan = org?.plan || 'trial';
  let maxUsers = 3; // trial default
  if (plan.startsWith('basic_10')) maxUsers = 10;
  else if (plan.startsWith('pro_30')) maxUsers = 30;
  else if (plan.startsWith('enterprise')) maxUsers = 999;

  const currentCount = await prisma.user.count({
    where: { orgId: user.orgId, isActive: true },
  });

  if (currentCount >= maxUsers) {
    return reply.status(403).send({
      error: `Đã đạt giới hạn ${maxUsers} nhân viên. Vui lòng nâng cấp gói để thêm nhân viên.`,
      code: 'USER_LIMIT_REACHED',
    });
  }
}
