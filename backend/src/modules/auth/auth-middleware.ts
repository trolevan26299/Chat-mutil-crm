/**
 * Auth middleware — verifies JWT on protected routes.
 * JWT user shape is defined in shared/types/fastify-jwt-user.d.ts.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as any;
    if (query?.token) {
      request.user = request.server.jwt.verify(query.token) as any;
      return;
    }
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
