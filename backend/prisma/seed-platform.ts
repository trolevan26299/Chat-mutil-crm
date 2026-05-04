/**
 * seed-platform.ts — Seeds the database with:
 *   1. Platform super admin account
 *   2. Two demo tenants with admin users
 *
 * Usage: DATABASE_URL="..." npx tsx prisma/seed-platform.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  console.log('🌱 Seeding platform data...\n');

  // 1. Create Platform Super Admin
  const existingAdmin = await prisma.platformAdmin.count();
  if (existingAdmin === 0) {
    const hash = await bcrypt.hash('admin123', 12);
    const admin = await prisma.platformAdmin.create({
      data: {
        email: 'admin@chatcrm.org',
        passwordHash: hash,
        fullName: 'Super Admin',
        role: 'superadmin',
      },
    });
    console.log(`✅ Platform Admin created: ${admin.email} (password: admin123)`);
  } else {
    console.log('⏭️  Platform Admin already exists, skipping');
  }

  // 2. Create Demo Tenant 1
  const demo1 = await prisma.organization.findUnique({ where: { slug: 'demo1' } });
  if (!demo1) {
    const hash = await bcrypt.hash('demo123', 12);
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: 'Demo Company 1',
          slug: 'demo1',
          plan: 'basic_10_ai',
          status: 'active',
          maxZalo: 10,
          aiEnabled: true,
        },
      });
      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email: 'admin@demo1.chatcrm.org',
          passwordHash: hash,
          fullName: 'Demo1 Admin',
          role: 'owner',
        },
      });
      await tx.aiConfig.create({
        data: { orgId: org.id, enabled: true, model: 'google/gemini-2.0-flash-001', maxDaily: 100 },
      });
      await tx.subscriptionLog.create({
        data: { orgId: org.id, action: 'created', plan: 'basic_10_ai', note: 'Seeded' },
      });
      return { org, user };
    });
    console.log(`✅ Demo Tenant 1: slug=demo1, admin=${result.user.email} (password: demo123)`);
  } else {
    console.log('⏭️  Demo Tenant 1 (demo1) already exists, skipping');
  }

  // 3. Create Demo Tenant 2
  const demo2 = await prisma.organization.findUnique({ where: { slug: 'demo2' } });
  if (!demo2) {
    const hash = await bcrypt.hash('demo123', 12);
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: 'Demo Company 2',
          slug: 'demo2',
          plan: 'pro_30',
          status: 'active',
          maxZalo: 30,
          aiEnabled: false,
        },
      });
      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email: 'admin@demo2.chatcrm.org',
          passwordHash: hash,
          fullName: 'Demo2 Admin',
          role: 'owner',
        },
      });
      await tx.aiConfig.create({
        data: { orgId: org.id, enabled: false, model: 'google/gemini-2.0-flash-001', maxDaily: 0 },
      });
      await tx.subscriptionLog.create({
        data: { orgId: org.id, action: 'created', plan: 'pro_30', note: 'Seeded' },
      });
      return { org, user };
    });
    console.log(`✅ Demo Tenant 2: slug=demo2, admin=${result.user.email} (password: demo123)`);
  } else {
    console.log('⏭️  Demo Tenant 2 (demo2) already exists, skipping');
  }

  console.log('\n🎉 Seed complete!\n');
  console.log('📋 Accounts:');
  console.log('   Platform Admin: admin@chatcrm.org / admin123');
  console.log('   Demo1 Admin:    admin@demo1.chatcrm.org / demo123  (subdomain: demo1)');
  console.log('   Demo2 Admin:    admin@demo2.chatcrm.org / demo123  (subdomain: demo2)');
  console.log('\n💡 Local testing:');
  console.log('   Add to /etc/hosts: 127.0.0.1 admin.localhost demo1.localhost demo2.localhost');
  console.log('   Platform Admin: http://admin.localhost:3003');
  console.log('   Demo1 CRM:      http://demo1.localhost:3002');
  console.log('   Demo2 CRM:      http://demo2.localhost:3002');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
