/**
 * Main application entry point.
 * Bootstraps Fastify server with all plugins, Socket.IO, and route handlers.
 * The process never exits — all errors are caught and logged.
 */
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { config } from './config/index.js';
import { prisma } from './shared/database/prisma-client.js';
import { logger } from './shared/utils/logger.js';
import { authRoutes } from './modules/auth/auth-routes.js';
import { zaloRoutes } from './modules/zalo/zalo-routes.js';
import { chatRoutes } from './modules/chat/chat-routes.js';
import { contactRoutes } from './modules/contacts/contact-routes.js';
import { contactSubResourceRoutes } from './modules/contacts/contact-sub-resource-routes.js';
import { appointmentRoutes } from './modules/contacts/appointment-routes.js';
import { startAppointmentReminder } from './modules/contacts/appointment-reminder.js';
import { dashboardRoutes } from './modules/dashboard/dashboard-routes.js';
import { reportRoutes } from './modules/dashboard/report-routes.js';
import { userRoutes } from './modules/auth/user-routes.js';
import { teamRoutes } from './modules/auth/team-routes.js';
import { orgRoutes } from './modules/auth/org-routes.js';
import { zaloAccessRoutes } from './modules/zalo/zalo-access-routes.js';
import { zaloSyncRoutes } from './modules/zalo/zalo-sync-routes.js';
import { zaloPool } from './modules/zalo/zalo-pool.js';
import { registerZaloSocketHandlers } from './modules/zalo/zalo-socket.js';
import { notificationRoutes } from './modules/notifications/notification-routes.js';
import { searchRoutes } from './modules/search/search-routes.js';
import { startZaloHealthCheck } from './modules/zalo/zalo-health-check.js';
import { publicApiRoutes } from './modules/api/public-api-routes.js';
import { webhookSettingsRoutes } from './modules/api/webhook-settings-routes.js';
import { startContactIntelligence } from './modules/contacts/contact-intelligence.js';
import { analyticsRoutes } from './modules/analytics/analytics-routes.js';
import { savedReportRoutes } from './modules/analytics/saved-report-routes.js';
import { integrationRoutes } from './modules/integrations/integration-routes.js';
import { automationRoutes } from './modules/automation/automation-routes.js';
import { templateRoutes } from './modules/automation/template-routes.js';
import { aiRoutes } from './modules/ai/ai-routes.js';
import { campaignRoutes } from './modules/campaign/campaign-routes.js';
import { startCampaignScheduler } from './modules/campaign/campaign-scheduler.js';
import { knowledgeRoutes } from './modules/knowledge/knowledge-routes.js';
import { tenantResolver } from './modules/platform/tenant-resolver.js';
import { platformRoutes } from './modules/platform/platform-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const app = Fastify({ 
    logger: false, 
    bodyLimit: 50 * 1024 * 1024,
    rewriteUrl: (req) => {
      // Don't touch API routes
      if (!req.url || req.url.startsWith('/api/')) return req.url || '/';
      
      const host = req.headers.host || '';
      const isDevSubdomain = host.startsWith('admin.localhost');
      const isProdSubdomain = host.startsWith('admin.');
      
      // If it's the admin subdomain, rewrite URL to point to /admin-static/ prefix
      if (isDevSubdomain || isProdSubdomain) {
        // Map SPA routes to index.html
        if (req.url === '/' || !req.url.includes('.')) {
          return '/admin-static/index.html';
        }
        return `/admin-static${req.url}`;
      }
      
      return req.url;
    }
  }); // 50MB limit for image/file uploads

  // Multipart plugin for file uploads (PDF knowledge base)
  const fastifyMultipart = (await import('@fastify/multipart')).default;
  await app.register(fastifyMultipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max file

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: config.isProduction ? config.appUrl : true,
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
    // Skip rate limiting for static assets — only limit API routes
    allowList: (request: { url: string }) => !request.url.startsWith('/api/'),
  });

  // Serve compiled frontend assets in production
  if (config.isProduction) {
    // 1. Register fastify-static for tenant frontend
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../static'),
      prefix: '/',
    });

    // 2. Register fastify-static for admin frontend with prefix /admin-static
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../static-admin'),
      prefix: '/admin-static/',
      decorateReply: false,
    });
  }

  // ── Socket.IO ─────────────────────────────────────────────────────────────

  // Allowed origins: localhost (dev) + tất cả subdomain của domain production
  const allowedOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true); // server-to-server, allow
    if (!config.isProduction) return callback(null, true); // dev: allow all
    // Cho phép chatcrm.org và *.chatcrm.org (mọi tenant subdomain)
    const prodDomain = config.appUrl.replace(/^https?:\/\//, '').split('/')[0];
    const baseDomain = prodDomain.includes('.') ? prodDomain.split('.').slice(-2).join('.') : prodDomain;
    const isAllowed = origin === `https://${baseDomain}` || origin.endsWith(`.${baseDomain}`);
    return callback(isAllowed ? null : new Error('CORS not allowed'), isAllowed);
  };

  const io = new Server(app.server, {
    cors: { origin: allowedOrigin, credentials: true },
    // Giữ connection qua Cloudflare (Cloudflare drop idle WS sau 100s)
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    transports: ['websocket', 'polling'],
    path: '/socket.io/',
  });

  // ── Redis Adapter — bắt buộc để sync events giữa nhiều ECS tasks ──────────
  // API container và Worker container dùng chung Redis → event lan ra đúng client
  try {
    const pubClient = createClient({ url: config.redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('[socket.io] Redis adapter connected — multi-instance sync enabled');
  } catch (err) {
    logger.error('[socket.io] Redis adapter FAILED — falling back to in-memory (single instance only):', err);
  }

  // Attach io to app so route handlers can emit events
  app.decorate('io', io);

  // Pass io to zalo pool for real-time event emission
  zaloPool.setIO(io);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Register Zalo Socket.IO event handlers
  registerZaloSocketHandlers(io);

  // ── Routes ────────────────────────────────────────────────────────────────

  // Tenant resolution: subdomain → orgId (runs before all route handlers)
  app.addHook('preHandler', tenantResolver);

  // Platform admin routes (super admin — separate from tenant routes)
  await app.register(platformRoutes);

  await app.register(authRoutes);
  await app.register(zaloRoutes);
  await app.register(chatRoutes);
  await app.register(contactRoutes);
  await app.register(contactSubResourceRoutes);
  await app.register(appointmentRoutes);
  await app.register(dashboardRoutes);
  await app.register(reportRoutes);
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(orgRoutes);
  await app.register(zaloAccessRoutes);
  await app.register(zaloSyncRoutes);
  await app.register(notificationRoutes);
  await app.register(searchRoutes);
  await app.register(publicApiRoutes);
  await app.register(webhookSettingsRoutes);
  await app.register(analyticsRoutes);
  await app.register(savedReportRoutes);
  await app.register(integrationRoutes);
  await app.register(automationRoutes);
  await app.register(templateRoutes);
  await app.register(aiRoutes);
  await app.register(campaignRoutes);
  await app.register(knowledgeRoutes);

  // ── Public sticker image proxy (no auth needed — browser img tag) ──────────
  app.get('/api/v1/sticker-image', async (request, reply) => {
    const { eid, size } = request.query as { eid?: string; size?: string };
    if (!eid) return reply.status(400).send({ error: 'Missing eid' });
    const url = `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${eid}&size=${size || 130}`;
    try {
      const fetchRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://chat.zalo.me/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        }
      });
      if (!fetchRes.ok) return reply.status(fetchRes.status).send({ error: 'CDN error' });
      reply.header('Content-Type', fetchRes.headers.get('content-type') || 'image/webp');
      reply.header('Cache-Control', 'public, max-age=86400');
      reply.header('Access-Control-Allow-Origin', '*');
      const buffer = await fetchRes.arrayBuffer();
      return reply.send(Buffer.from(buffer));
    } catch (err: any) {
      return reply.status(500).send({ error: 'Proxy failed' });
    }
  });

  // Liveness/readiness probe — also checks DB connectivity
  app.get('/health', async () => {

    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', db: 'disconnected', timestamp: new Date().toISOString() };
    }
  });

  // API version banner
  app.get('/api/v1/status', async () => {
    return { version: '1.0.0', name: 'Zalo CRM' };
  });

  // SPA fallback — serve index.html for non-API routes in production
  if (config.isProduction) {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        reply.status(404).send({ error: 'not_found' });
        return;
      }
      
      // Due to rewriteUrl, admin SPA fallback is handled!
      // This is for the main tenant app fallback.
      reply.sendFile('index.html');
    });
  }

  // ── Error handler ─────────────────────────────────────────────────────────

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    logger.error('Request error:', error.message);
    reply.status(error.statusCode ?? 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  // ── Start ─────────────────────────────────────────────────────────────────

  const isWorkerMode = process.env.WORKER_MODE === 'true';
  logger.info(`Mode: ${isWorkerMode ? 'WORKER (ZaloPool + Schedulers)' : 'API only'}`);

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Zalo CRM running on http://${config.host}:${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);

    // Schedulers & ZaloPool chỉ chạy trên WORKER container
    // API container (scale tự do) KHÔNG chạy những thứ này
    if (isWorkerMode) {
      logger.info('[worker] Starting background workers...');
      startAppointmentReminder(io);
      startZaloHealthCheck();
      startContactIntelligence();
      startCampaignScheduler();

      // Reconnect Zalo accounts that have saved sessions (only for active orgs)
      try {
        const accounts = await prisma.zaloAccount.findMany({
          where: {
            sessionData: { not: Prisma.JsonNull },
            org: { status: 'active' },
          },
          select: { id: true, sessionData: true },
        });
        logger.info(`[worker] Attempting reconnect for ${accounts.length} Zalo account(s)`);
        for (const account of accounts) {
          const session = account.sessionData as {
            cookie: any;
            imei: string;
            userAgent: string;
          } | null;
          if (session?.imei) {
            zaloPool.reconnect(account.id, session).catch((err) => {
              logger.warn(`Auto-reconnect failed for account ${account.id}:`, err);
            });
          }
        }
      } catch (err) {
        logger.error('[worker] Failed to load accounts for reconnect:', err);
      }
    } else {
      logger.info('[api] Running in API-only mode — ZaloPool & schedulers are on worker container');
    }
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Keep process alive — log but never crash on unhandled errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
// ECS gửi SIGTERM khi rolling deploy hoặc scale-in.
// Tini (PID 1 trong Docker) sẽ forward SIGTERM về đây.
// Cho phép request đang xử lý hoàn tất trước khi đóng.
let appInstance: Awaited<ReturnType<typeof Fastify>> | null = null;

async function gracefulShutdown(signal: string) {
  logger.info(`[shutdown] Received ${signal} — starting graceful shutdown...`);
  try {
    // 1. Ngừng nhận request mới (Fastify close)
    if (appInstance) await appInstance.close();

    // 2. Ngắt kết nối Zalo (chỉ trên worker)
    if (process.env.WORKER_MODE === 'true') {
      logger.info('[shutdown] Disconnecting ZaloPool...');
      zaloPool.disconnectAll?.();
    }

    // 3. Đóng DB connection pool
    await prisma.$disconnect();

    logger.info('[shutdown] Done. Process exiting.');
    process.exit(0);
  } catch (err) {
    logger.error('[shutdown] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

bootstrap();
