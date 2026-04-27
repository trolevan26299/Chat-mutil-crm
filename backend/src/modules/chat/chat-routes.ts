/**
 * chat-routes.ts — REST API for conversations and messages.
 * All routes require JWT auth and are scoped to the user's org.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';

type QueryParams = Record<string, string>;

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── Conversation filter counts (unread, unreplied, total) ───────────────
  // NOTE: Must be registered BEFORE /api/v1/conversations/:id to avoid route conflict
  app.get('/api/v1/conversations/counts', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { accountId = '', tab = '' } = request.query as QueryParams;

    const baseWhere: any = { orgId: user.orgId };
    if (accountId) baseWhere.zaloAccountId = accountId;
    if (tab) baseWhere.tab = tab;

    // Members can only see conversations from Zalo accounts they have access to
    if (user.role === 'member') {
      const accessibleAccounts = await prisma.zaloAccountAccess.findMany({
        where: { userId: user.id },
        select: { zaloAccountId: true },
      });
      const accessibleIds = accessibleAccounts.map((a) => a.zaloAccountId);
      // Intersect with user-selected account filter if present
      if (accountId && accessibleIds.includes(accountId)) {
        baseWhere.zaloAccountId = accountId;
      } else {
        baseWhere.zaloAccountId = { in: accessibleIds };
      }
    }

    const [unread, unreplied, total] = await Promise.all([
      prisma.conversation.count({ where: { ...baseWhere, unreadCount: { gt: 0 } } }),
      prisma.conversation.count({ where: { ...baseWhere, isReplied: false } }),
      prisma.conversation.count({ where: baseWhere }),
    ]);

    return { unread, unreplied, total };
  });

  // ── List conversations (paginated, filterable) ──────────────────────────
  app.get('/api/v1/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const {
      page = '1',
      limit = '50',
      search = '',
      accountId = '',
      // Filter params
      unread = '',
      unreplied = '',
      from = '',
      to = '',
      tags = '',
      tab = '',
    } = request.query as QueryParams;

    const where: any = { orgId: user.orgId };
    if (tab) where.tab = tab;
    if (accountId) where.zaloAccountId = accountId;
    if (search) {
      where.contact = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { crmName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      };
    }

    // Advanced filters
    if (unread === 'true') where.unreadCount = { gt: 0 };
    if (unreplied === 'true') where.isReplied = false;
    if (from || to) {
      where.lastMessageAt = {};
      if (from) {
        const d = new Date(from);
        if (!isNaN(d.getTime())) where.lastMessageAt.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!isNaN(d.getTime())) where.lastMessageAt.lte = d;
      }
      // Remove empty filter if both dates invalid
      if (Object.keys(where.lastMessageAt).length === 0) delete where.lastMessageAt;
    }
    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        // Merge with any existing contact filter from search
        where.contact = {
          ...where.contact,
          tags: { array_contains: tagList },
        };
      }
    }

    // Members can only see conversations from Zalo accounts they have access to
    if (user.role === 'member') {
      const accessibleAccounts = await prisma.zaloAccountAccess.findMany({
        where: { userId: user.id },
        select: { zaloAccountId: true },
      });
      const accessibleIds = accessibleAccounts.map((a) => a.zaloAccountId);
      if (accountId && accessibleIds.includes(accountId)) {
        where.zaloAccountId = accountId;
      } else {
        where.zaloAccountId = { in: accessibleIds };
      }
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true, crmName: true, phone: true, avatarUrl: true, zaloUid: true } },
          zaloAccount: { select: { id: true, displayName: true, zaloUid: true } },
          messages: {
            take: 1,
            orderBy: { sentAt: 'desc' },
            select: { content: true, contentType: true, senderType: true, sentAt: true, isDeleted: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (parseInt(page) - 1) * Math.min(parseInt(limit), 200),
        take: Math.min(parseInt(limit), 200),
      }),
      prisma.conversation.count({ where }),
    ]);

    return { conversations, total, page: parseInt(page), limit: Math.min(parseInt(limit), 200) };
  });

  // ── Get single conversation ──────────────────────────────────────────────
  app.get('/api/v1/conversations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        contact: true,
        zaloAccount: { select: { id: true, displayName: true, zaloUid: true, status: true } },
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Not found' });

    return conversation;
  });

  // ── List messages for a conversation (paginated, newest first) ──────────
  app.get('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { page = '1', limit = '50' } = request.query as QueryParams;

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { sentAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ]);

    return { messages: messages.reverse(), total, page: parseInt(page), limit: parseInt(limit) };
  });

  // ── Send message ─────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { content, attachments, sticker } = request.body as { 
      content?: string; 
      attachments?: { type: string; filename: string; base64: string; size: number; width?: number; height?: number }[];
      sticker?: { id: number; cateId: number; type: number };
    };

    if ((!content || !content.trim()) && (!attachments || attachments.length === 0) && !sticker) {
      return reply.status(400).send({ error: 'Content, attachments, or sticker required' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: { zaloAccount: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    // Rate limit check — prevent account blocking
    const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
    if (!limits.allowed) {
      return reply.status(429).send({ error: limits.reason });
    }

    try {
      const threadId = conversation.externalThreadId || '';
      // zca-js sendMessage(message, threadId, type) — type: 0=User, 1=Group
      const threadType = conversation.threadType === 'group' ? 1 : 0;

      zaloRateLimiter.recordSend(conversation.zaloAccountId);
      
      if (attachments && attachments.length > 0) {
        const zaloAttachments = attachments.map(att => {
          const base64Data = att.base64.split(',')[1] || att.base64;
          const buffer = Buffer.from(base64Data, 'base64');
          const metadata: any = { totalSize: att.size };
          if (att.width) metadata.width = att.width;
          if (att.height) metadata.height = att.height;
          return { data: buffer, filename: att.filename as any, metadata };
        });

        await instance.api.sendMessage({
          msg: content || '',
          attachments: zaloAttachments
        }, threadId, threadType);

        await prisma.conversation.update({
          where: { id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });

        // Do not save attachment message locally — let zalo-listener catch the self-echo
        // to retrieve the precise Zalo CDN URL and ensure consistency.
        return reply.status(202).send({ status: 'queued' });
      }

      // Sticker flow
      if (sticker) {
        const sendResult = await (instance.api as any).sendSticker(
          { id: sticker.id, cateId: sticker.cateId, type: sticker.type },
          threadId,
          threadType
        );
        
        await prisma.conversation.update({
          where: { id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });

        const storedMsg = await prisma.message.create({
          data: {
            id: randomUUID(),
            conversationId: id,
            zaloMsgId: sendResult?.msgId?.toString() || null,
            senderType: 'self',
            senderUid: conversation.zaloAccount.zaloUid || '',
            senderName: 'Staff',
            content: JSON.stringify({ href: `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${sticker.id}&size=130` }),
            contentType: 'image',
            sentAt: new Date(),
            repliedByUserId: user.id,
          },
        });

        const io = (app as any).io as Server;
        io?.emit('chat:message', { accountId: conversation.zaloAccountId, message: storedMsg, conversationId: id });

        return storedMsg;
      }

      // Existing text-only flow
      const sendResult = await instance.api.sendMessage({ msg: content || '' }, threadId, threadType);
      // Extract zaloMsgId from sendMessage response for dedup with selfListen
      const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');

      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: id,
          zaloMsgId: zaloMsgId || null,
          senderType: 'self',
          senderUid: conversation.zaloAccount.zaloUid || '',
          senderName: 'Staff',
          content: content || '',
          contentType: 'text',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      await prisma.conversation.update({
        where: { id },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
      });

      const io = (app as any).io as Server;
      io?.emit('chat:message', { accountId: conversation.zaloAccountId, message, conversationId: id });

      return message;
    } catch (err) {
      logger.error('[chat] Send message error:', err);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });

  // ── Mark conversation as read ────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/mark-read', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    await prisma.conversation.updateMany({
      where: { id, orgId: user.orgId },
      data: { unreadCount: 0 },
    });

    return { success: true };
  });

  // ── Move conversation to a different tab (main / other) ────────────────
  app.patch('/api/v1/conversations/:id/tab', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { tab } = request.body as { tab: string };

    if (!tab || !['main', 'other'].includes(tab)) {
      return reply.status(400).send({ error: 'tab must be "main" or "other"' });
    }

    const updated = await prisma.conversation.updateMany({
      where: { id, orgId: user.orgId },
      data: { tab },
    });

    if (updated.count === 0) return reply.status(404).send({ error: 'Conversation not found' });
    return { success: true, tab };
  });

  // ── Proxy file downloads ──────────────────────────────────────────────────
  app.get('/api/v1/conversations/:id/proxy-file', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { url } = request.query as { url: string };
    if (!url) return reply.status(400).send({ error: 'URL required' });

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: request.user!.orgId },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account disconnected' });

    try {
      const api = instance.api;
      const ctx = api.ctx || api.context;
      const cookiesStr = ctx?.cookie?.getCookieStringSync?.('https://chat.zalo.me') || '';

      const fetchRes = await fetch(url, {
        headers: {
          'Cookie': cookiesStr,
          'User-Agent': ctx?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://chat.zalo.me/'
        }
      });

      if (!fetchRes.ok) {
        return reply.status(fetchRes.status).send({ error: `Failed to fetch file: ${fetchRes.statusText}` });
      }

      const contentType = fetchRes.headers.get('content-type');
      if (contentType) reply.header('Content-Type', contentType);
      const disposition = fetchRes.headers.get('content-disposition');
      if (disposition) reply.header('Content-Disposition', disposition);

      const buffer = await fetchRes.arrayBuffer();
      return reply.send(Buffer.from(buffer));
    } catch (err: any) {
      logger.error('Proxy file error:', err.message);
      return reply.status(500).send({ error: 'Failed to proxy file' });
    }
  });

  // ── Search Zalo Stickers ─────────────────────────────────────────────────
  app.get('/api/v1/conversations/:id/stickers/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { keyword } = request.query as { keyword?: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: request.user!.orgId },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account disconnected' });

    try {
      const q = keyword?.trim() || 'hi';
      const result = await (instance.api as any).searchSticker(q);
      return reply.send(Array.isArray(result) ? result : []);
    } catch (err: any) {
      logger.error('Search sticker error:', err.message);
      return reply.status(500).send({ error: 'Failed to search sticker' });
    }
  });
}
