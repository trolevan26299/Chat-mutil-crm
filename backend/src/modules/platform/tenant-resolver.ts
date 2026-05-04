/**
 * tenant-resolver.ts — Fastify preHandler that resolves the current tenant
 * from the request's Host header (subdomain) or X-Tenant-Slug header (dev).
 *
 * Flow:
 *   1. Extract subdomain from Host header (e.g., "abc.chatcrm.org" → "abc")
 *   2. Fallback: X-Tenant-Slug header (for local dev / Postman)
 *   3. Lookup Organization by slug
 *   4. Check org status + expiry
 *   5. Inject request.tenantOrg into the request
 *
 * Special subdomains "admin" and "api" are handled separately.
 * Routes that don't need tenant context (health, platform admin) skip this.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface TenantOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  maxZalo: number;
  aiEnabled: boolean;
  expiresAt: Date | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

// In-memory cache for tenant lookups (TTL 60s) — avoids DB hit on every request
const tenantCache = new Map<string, { org: TenantOrg; cachedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/** Subdomains that are reserved and NOT tenant slugs */
const RESERVED_SUBDOMAINS = new Set(['admin', 'api', 'www', 'app', 'mail', 'static', 'cdn']);

/** Routes that skip tenant resolution */
const SKIP_PATHS = ['/health', '/api/platform/'];

function shouldSkip(url: string): boolean {
  return SKIP_PATHS.some(p => url.startsWith(p));
}

/**
 * Extract subdomain from Host header.
 * Examples:
 *   "abc.chatcrm.org"     → "abc"
 *   "abc.localhost:3002"   → "abc"
 *   "localhost:3002"       → null
 *   "chatcrm.org"          → null
 */
function extractSubdomain(host: string): string | null {
  // Remove port
  const hostname = host.split(':')[0];

  // Local dev: abc.localhost → "abc"
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace('.localhost', '');
    return sub || null;
  }

  // Production: abc.chatcrm.org → "abc"
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

async function lookupTenant(slug: string): Promise<TenantOrg | null> {
  // Check cache first
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.org;
  }

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      status: true,
      maxZalo: true,
      aiEnabled: true,
      expiresAt: true,
      logoUrl: true,
      primaryColor: true,
    },
  });

  if (org) {
    tenantCache.set(slug, { org, cachedAt: Date.now() });
  }

  return org;
}

/** Clear cached tenant (call after updating org in platform admin) */
export function invalidateTenantCache(slug: string): void {
  tenantCache.delete(slug);
}

/** Clear all cached tenants */
export function clearTenantCache(): void {
  tenantCache.clear();
}

/**
 * Fastify preHandler middleware — resolves tenant from subdomain.
 * Injects `request.tenantOrg` for downstream handlers.
 */
export async function tenantResolver(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Skip for health checks and platform admin routes
  if (shouldSkip(request.url)) return;

  const host = request.headers.host || '';
  let slug = extractSubdomain(host);

  // Fallback: X-Tenant-Slug header (dev / testing)
  if (!slug) {
    slug = (request.headers['x-tenant-slug'] as string) || null;
  }

  // If no subdomain and no header → could be root domain or admin
  if (!slug) {
    // Allow non-tenant requests to pass through (root domain, setup, etc.)
    // The auth layer will still enforce orgId from JWT
    return;
  }

  // Reserved subdomains — skip tenant resolution
  if (RESERVED_SUBDOMAINS.has(slug)) {
    (request as any).isAdminSubdomain = slug === 'admin';
    return;
  }

  // Lookup tenant
  const org = await lookupTenant(slug);
  if (!org) {
    logger.warn(`[tenant] Unknown tenant slug: ${slug}`);
    return reply.status(404).send({ error: 'Tổ chức không tồn tại' });
  }

  // Check status
  if (org.status === 'suspended') {
    return reply.status(403).send({ error: 'Tài khoản đã bị tạm ngưng. Vui lòng liên hệ quản trị viên.' });
  }

  if (org.status === 'expired') {
    return reply.status(403).send({ error: 'Tài khoản đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.' });
  }

  // Check expiry
  if (org.expiresAt && new Date() > org.expiresAt) {
    // Auto-update status to expired
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: 'expired' },
    });
    invalidateTenantCache(slug);
    return reply.status(403).send({ error: 'Tài khoản đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.' });
  }

  // Inject tenant org into request
  (request as any).tenantOrg = org;
}
