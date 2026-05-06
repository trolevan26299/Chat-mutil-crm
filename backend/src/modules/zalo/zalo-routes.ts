import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { proxyPostToWorker, isZaloPoolLocal } from './zalo-pool-proxy.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { checkZaloLimit } from '../platform/tenant-limits.js';

export async function zaloRoutes(app: FastifyInstance): Promise<void> {
  // All routes in this plugin require auth
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/zalo-accounts — list accounts with live status from pool
  app.get('/api/v1/zalo-accounts', async (request) => {
    const user = request.user!;
    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId: user.orgId },
      select: {
        id: true,
        zaloUid: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        status: true,
        proxyUrl: true,
        lastConnectedAt: true,
        createdAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Merge live status from pool (Worker) or from DB (API container)
    return accounts.map((a) => ({
      ...a,
      liveStatus: isZaloPoolLocal() ? zaloPool.getStatus(a.id) : a.status,
      // Mask password in proxy URL for safety
      proxyUrl: a.proxyUrl ? a.proxyUrl.replace(/:[^:@]+@/, ':***@') : null,
    }));
  });

  // POST /api/v1/zalo-accounts — create a new account record
  app.post<{ Body: { displayName?: string; proxyUrl?: string } }>(
    '/api/v1/zalo-accounts',
    { preHandler: checkZaloLimit },
    async (request, reply) => {
      const user = request.user!;
      const { displayName, proxyUrl } = request.body ?? {};

      const account = await prisma.zaloAccount.create({
        data: {
          orgId: user.orgId,
          ownerUserId: user.id,
          displayName: displayName ?? null,
          status: 'qr_pending',
          proxyUrl: proxyUrl ?? null,
        },
      });

      return reply.status(201).send(account);
    },
  );

  // POST /api/v1/zalo-accounts/:id/login — initiate QR login
  app.post<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/login',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      // Fire-and-forget — QR delivered via Socket.IO
      if (isZaloPoolLocal()) {
        zaloPool.loginQR(id).catch(() => {});
      } else {
        proxyPostToWorker(`/api/v1/zalo-accounts/${id}/login`, {}, (request.headers.authorization || '').replace('Bearer ', '')).catch(() => {});
      }

      return { message: 'QR login initiated — subscribe to account:' + id + ' socket room' };
    },
  );

  // POST /api/v1/zalo-accounts/:id/reconnect — force reconnect using saved session
  app.post<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/reconnect',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      const session = account.sessionData as {
        cookie: any;
        imei: string;
        userAgent: string;
      } | null;

      if (!session?.imei) {
        return reply.status(400).send({ error: 'No saved session — please login with QR first' });
      }

      // Fire-and-forget — result emitted via Socket.IO
      if (isZaloPoolLocal()) {
        zaloPool.reconnect(id, session).catch(() => {});
      } else {
        proxyPostToWorker(`/api/v1/zalo-accounts/${id}/reconnect`, {}, (request.headers.authorization || '').replace('Bearer ', '')).catch(() => {});
      }

      return { message: 'Reconnect initiated' };
    },
  );

  // DELETE /api/v1/zalo-accounts/:id — disconnect and delete record
  app.delete<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      zaloPool.disconnect(id);
      await prisma.zaloAccount.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // GET /api/v1/zalo-accounts/:id/status — live status from pool
  app.get<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/status',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, status: true },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      return {
        accountId: id,
        liveStatus: isZaloPoolLocal() ? zaloPool.getStatus(id) : account.status,
      };
    },
  );

  // PATCH /api/v1/zalo-accounts/:id/proxy — set or clear proxy for account
  app.patch<{ Params: { id: string }; Body: { proxyUrl: string | null } }>(
    '/api/v1/zalo-accounts/:id/proxy',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;
      const { proxyUrl } = request.body ?? {};

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      await prisma.zaloAccount.update({
        where: { id },
        data: { proxyUrl: proxyUrl || null },
      });

      return { success: true, proxyUrl: proxyUrl ? proxyUrl.replace(/:[^:@]+@/, ':***@') : null };
    },
  );
}
