/**
 * Auth service — handles setup, login, and profile operations.
 * Uses bcryptjs for password hashing and Fastify JWT for token signing.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  orgId: string;
}

// Check if any users exist — true means first-run setup is needed
export async function checkSetupStatus(): Promise<{ needsSetup: boolean }> {
  const count = await prisma.user.count();
  return { needsSetup: count === 0 };
}

// Create the initial organization + owner user, return JWT payload
export async function setup(
  orgName: string,
  fullName: string,
  email: string,
  password: string,
): Promise<JwtPayload> {
  const existing = await prisma.user.count();
  if (existing > 0) {
    const err = new Error('Setup already completed') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    // Generate a URL-safe slug from the org name
    const slug = orgName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'org';

    // Ensure slug uniqueness
    const existingSlug = await tx.organization.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

    const org = await tx.organization.create({
      data: { name: orgName, slug: finalSlug },
    });
    const user = await tx.user.create({
      data: {
        orgId: org.id,
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName,
        role: 'owner',
      },
    });
    return { org, user };
  });

  logger.info(`Setup complete — org=${result.org.id}, user=${result.user.id}`);

  return {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    orgId: result.org.id,
  };
}

// Verify credentials, return JWT payload
export async function login(email: string, password: string): Promise<JwtPayload> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { org: { select: { status: true, expiresAt: true } } },
  });

  if (!user || !user.isActive) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  // Check org status (multi-tenant)
  if (user.org.status === 'suspended') {
    const err = new Error('Tài khoản tổ chức đã bị tạm ngưng. Vui lòng liên hệ quản trị viên.') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  if (user.org.status === 'expired' || (user.org.expiresAt && new Date() > user.org.expiresAt)) {
    const err = new Error('Tài khoản tổ chức đã hết hạn. Vui lòng liên hệ để gia hạn.') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return { id: user.id, email: user.email, role: user.role, orgId: user.orgId };
}

// Return safe user profile (no password hash)
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      orgId: true,
      teamId: true,
      isActive: true,
      createdAt: true,
      org: { select: { id: true, name: true, slug: true, plan: true, status: true, aiEnabled: true, logoUrl: true, primaryColor: true } },
    },
  });

  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return user;
}
