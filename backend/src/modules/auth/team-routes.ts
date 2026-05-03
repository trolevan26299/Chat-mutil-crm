/**
 * Team management routes — CRUD for teams and member assignment within an org.
 * Members now use the N-N TeamMember join table (one user can belong to many teams).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from './auth-middleware.js';
import { requireRole } from './role-middleware.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../shared/utils/logger.js';

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/teams — list all teams in org
  app.get('/api/v1/teams', async (request: FastifyRequest) => {
    const user = request.user!;
    const teams = await prisma.team.findMany({
      where: { orgId: user.orgId },
      include: {
        members: { select: { userId: true } }, // N-N count
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      teams: teams.map(t => ({
        id: t.id,
        orgId: t.orgId,
        name: t.name,
        description: t.description,
        memberCount: t.members.length,
        createdAt: t.createdAt,
      })),
    };
  });

  // POST /api/v1/teams — create team (owner/admin only)
  app.post(
    '/api/v1/teams',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { name, description } = request.body as { name: string; description?: string };
      if (!name?.trim()) return reply.status(400).send({ error: 'Tên nhóm là bắt buộc' });

      const team = await prisma.team.create({
        data: { id: randomUUID(), orgId: user.orgId, name: name.trim(), description: description?.trim() },
      });
      logger.info(`Team created: ${team.name} by ${user.email}`);
      return reply.status(201).send(team);
    },
  );

  // PUT /api/v1/teams/:id — update team (owner/admin only)
  app.put(
    '/api/v1/teams/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { name, description } = request.body as { name: string; description?: string };
      if (!name?.trim()) return reply.status(400).send({ error: 'Tên nhóm là bắt buộc' });

      try {
        const team = await prisma.team.update({
          where: { id, orgId: user.orgId },
          data: { name: name.trim(), description: description?.trim() ?? null },
        });
        return team;
      } catch {
        return reply.status(404).send({ error: 'Team not found' });
      }
    },
  );

  // DELETE /api/v1/teams/:id — delete team (owner only)
  app.delete(
    '/api/v1/teams/:id',
    { preHandler: requireRole('owner') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const team = await prisma.team.findFirst({ where: { id, orgId: user.orgId } });
      if (!team) return reply.status(404).send({ error: 'Team not found' });

      // Unassign legacy teamId references
      await prisma.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
      await prisma.team.delete({ where: { id } });

      logger.info(`Team deleted: ${team.name} by ${user.email}`);
      return reply.status(204).send();
    },
  );

  // GET /api/v1/teams/:id/members — list members via N-N TeamMember
  app.get('/api/v1/teams/:id/members', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const team = await prisma.team.findFirst({ where: { id, orgId: user.orgId } });
    if (!team) return reply.status(404).send({ error: 'Team not found' });

    const members = await prisma.teamMember.findMany({
      where: { teamId: id },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true, isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      fullName: m.user.fullName,
      email: m.user.email,
      isActive: m.user.isActive,
    }));
  });

  // POST /api/v1/teams/:id/members — add user to team via N-N (owner/admin only)
  app.post(
    '/api/v1/teams/:id/members',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { userId, role } = request.body as { userId: string; role?: string };
      if (!userId) return reply.status(400).send({ error: 'userId là bắt buộc' });

      const team = await prisma.team.findFirst({ where: { id, orgId: user.orgId } });
      if (!team) return reply.status(404).send({ error: 'Team not found' });

      const targetUser = await prisma.user.findFirst({ where: { id: userId, orgId: user.orgId } });
      if (!targetUser) return reply.status(404).send({ error: 'User not found in org' });

      const member = await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: id, userId } },
        create: { id: randomUUID(), teamId: id, userId, role: role || 'member' },
        update: { role: role || 'member' },
        include: { user: { select: { id: true, fullName: true, email: true } } },
      });

      return reply.status(201).send(member);
    },
  );

  // DELETE /api/v1/teams/:id/members/:userId — remove user from team (owner/admin only)
  app.delete(
    '/api/v1/teams/:id/members/:userId',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id, userId } = request.params as { id: string; userId: string };

      const team = await prisma.team.findFirst({ where: { id, orgId: user.orgId } });
      if (!team) return reply.status(404).send({ error: 'Team not found' });

      await prisma.teamMember.deleteMany({ where: { teamId: id, userId } });
      return { success: true };
    },
  );
}
