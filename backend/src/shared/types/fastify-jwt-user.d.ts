/**
 * Extends Fastify's JWT user type to include our custom JWT payload fields.
 * Supports both tenant users (orgId) and platform admins (isPlatformAdmin).
 * This merges with @fastify/jwt's FastifyJWT interface.
 */
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string; orgId?: string; isPlatformAdmin?: boolean };
    user: { id: string; email: string; role: string; orgId: string; isPlatformAdmin?: boolean };
  }
}
