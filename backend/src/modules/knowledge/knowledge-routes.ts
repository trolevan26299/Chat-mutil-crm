/**
 * knowledge-routes.ts
 * REST API for team knowledge management (RAG knowledge base).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  createKnowledge,
  listKnowledge,
  deleteKnowledge,
  reindexKnowledge,
} from '../knowledge/knowledge-service.js';
import { config } from '../../config/index.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

async function assertTeamAccess(request: FastifyRequest, reply: FastifyReply, teamId: string): Promise<boolean> {
  const user = request.user!;
  const team = await prisma.team.findFirst({ where: { id: teamId, orgId: user.orgId } });
  if (!team) {
    reply.status(404).send({ error: 'Team not found' });
    return false;
  }
  return true;
}

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ─── Knowledge CRUD ───────────────────────────────────────────────────────

  /** List all knowledge documents for a team */
  app.get('/api/v1/teams/:teamId/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const { teamId } = request.params as { teamId: string };
    const user = request.user!;
    if (!await assertTeamAccess(request, reply, teamId)) return;
    return listKnowledge(teamId, user.orgId);
  });

  /** Create new knowledge document (text or URL) */
  app.post('/api/v1/teams/:teamId/knowledge',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = request.params as { teamId: string };
      const user = request.user!;
      if (!await assertTeamAccess(request, reply, teamId)) return;

      const body = request.body as {
        title: string;
        sourceType: 'text' | 'url';
        content?: string;
        sourceUrl?: string;
        crawlLimit?: number | 'all';
      };

      if (!body.title) return reply.status(400).send({ error: 'Title is required' });
      if (body.sourceType === 'text' && !body.content) return reply.status(400).send({ error: 'Content is required for text type' });
      if (body.sourceType === 'url' && !body.sourceUrl) return reply.status(400).send({ error: 'URL is required for url type' });

      try {
        const knowledge = await createKnowledge({
          orgId: user.orgId,
          teamId,
          title: body.title,
          sourceType: body.sourceType,
          content: body.content,
          sourceUrl: body.sourceUrl,
          crawlLimit: body.crawlLimit === 'all' ? 10000 : (body.crawlLimit || 50),
        });
        return reply.status(201).send(knowledge);
      } catch (err) {
        logger.error('[knowledge-routes] Create error:', err);
        return reply.status(500).send({ error: String(err) });
      }
    },
  );

  /** Upload PDF file and create knowledge document */
  app.post('/api/v1/teams/:teamId/knowledge/upload',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId } = request.params as { teamId: string };
      const user = request.user!;
      if (!await assertTeamAccess(request, reply, teamId)) return;

      try {
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file uploaded' });

        const title = (request.query as any).title || data.filename;
        const buffer = await data.toBuffer();

        // Save file to disk
        const uploadDir = path.join(config.uploadDir, 'knowledge', teamId);
        await fs.mkdir(uploadDir, { recursive: true });
        const fileName = `${randomUUID()}_${data.filename}`;
        const filePath = path.join(uploadDir, fileName);
        await fs.writeFile(filePath, buffer);
        const fileUrl = `/files/knowledge/${teamId}/${fileName}`;

        const knowledge = await createKnowledge({
          orgId: user.orgId,
          teamId,
          title,
          sourceType: 'file',
          fileBuffer: buffer,
          fileUrl,
        });

        return reply.status(201).send(knowledge);
      } catch (err) {
        logger.error('[knowledge-routes] Upload error:', err);
        return reply.status(500).send({ error: 'Failed to process uploaded file' });
      }
    },
  );

  /** Delete a knowledge document */
  app.delete('/api/v1/teams/:teamId/knowledge/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId, id } = request.params as { teamId: string; id: string };
      const user = request.user!;
      if (!await assertTeamAccess(request, reply, teamId)) return;
      await deleteKnowledge(id, user.orgId);
      return { success: true };
    },
  );

  /** Re-index a knowledge document */
  app.post('/api/v1/teams/:teamId/knowledge/:id/reindex',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { teamId: string; id: string };
      const user = request.user!;
      await reindexKnowledge(id, user.orgId);
      return { success: true };
    },
  );

  /** Get content of a knowledge document */
  app.get('/api/v1/teams/:teamId/knowledge/:id/content', async (request: FastifyRequest, reply: FastifyReply) => {
    const { teamId, id } = request.params as { teamId: string; id: string };
    const user = request.user!;
    if (!await assertTeamAccess(request, reply, teamId)) return;

    const doc = await prisma.teamKnowledge.findFirst({
      where: { id, orgId: user.orgId },
      select: { content: true },
    });

    if (!doc) return reply.status(404).send({ error: 'Document not found' });
    return { content: doc.content };
  });
}
