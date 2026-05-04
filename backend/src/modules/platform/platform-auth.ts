/**
 * platform-auth.ts — Authentication for platform super admins.
 * Uses separate JWT namespace to prevent token reuse between tenant users and platform admins.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/database/prisma-client.js';

export interface PlatformJwtPayload {
  id: string;
  email: string;
  role: string;
  isPlatformAdmin: true;
}

/** Verify credentials for platform admin login */
export async function platformLogin(email: string, password: string): Promise<PlatformJwtPayload> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!admin || !admin.isActive) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    const err = new Error('Invalid credentials') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return { id: admin.id, email: admin.email, role: admin.role, isPlatformAdmin: true };
}

/**
 * Middleware to verify request is from a platform admin.
 * Checks JWT payload has isPlatformAdmin: true.
 */
export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as any;
    if (!payload?.isPlatformAdmin) {
      return reply.status(403).send({ error: 'Platform admin access required' });
    }
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}
