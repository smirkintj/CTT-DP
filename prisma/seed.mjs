import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const seed = async () => {
  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
  const userPasswordHash = await bcrypt.hash('User123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@dksh.com' },
    update: {
      name: 'Admin User',
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      countryCode: null
    },
    create: {
      email: 'admin@dksh.com',
      name: 'Admin User',
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      countryCode: null
    }
  });

  const stakeholder = await prisma.user.upsert({
    where: { email: 'user@dksh.com' },
    update: {
      name: 'Stakeholder User',
      role: 'STAKEHOLDER',
      passwordHash: userPasswordHash,
      countryCode: 'SG'
    },
    create: {
      email: 'user@dksh.com',
      name: 'Stakeholder User',
      role: 'STAKEHOLDER',
      passwordHash: userPasswordHash,
      countryCode: 'SG'
    }
  });

  await prisma.country.createMany({
    data: [
      { code: 'SG', name: 'Singapore', isActive: true },
      { code: 'MY', name: 'Malaysia', isActive: true }
    ],
    skipDuplicates: true
  });

  const taskCount = await prisma.task.count();
  if (taskCount === 0) {
    await prisma.task.createMany({
      data: [
        {
          title: 'Verify Order Creation flow',
          description: 'Ensure wholesale customers get the correct discount applied.',
          status: 'READY',
          priority: 'HIGH',
          countryCode: 'SG',
          module: 'Ordering',
          assigneeId: stakeholder.id,
          dueDate: new Date()
        },
        {
          title: 'Validate Admin Portal Reports',
          description: 'Check reports load and export correctly.',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          countryCode: 'SG',
          module: 'Reporting',
          assigneeId: stakeholder.id,
          dueDate: new Date()
        }
      ]
    });
  }

  console.log('Seed completed');
};

seed()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
