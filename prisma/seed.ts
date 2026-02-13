import { PrismaClient, TaskPriority, TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const countries = [
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' }
];

const stakeholderUsers = [
  { email: 'uat-my@dksh.com', countryCode: 'MY' },
  { email: 'uat-sg@dksh.com', countryCode: 'SG' },
  { email: 'uat-th@dksh.com', countryCode: 'TH' },
  { email: 'uat-vn@dksh.com', countryCode: 'VN' },
  { email: 'uat-hk@dksh.com', countryCode: 'HK' },
  { email: 'uat-tw@dksh.com', countryCode: 'TW' }
];

const modules = ['Ordering', 'Pricing', 'Invoicing'];

const seed = async () => {
  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
  const userPasswordHash = await bcrypt.hash('User123!', 10);

  await prisma.country.createMany({
    data: countries.map((country) => ({
      code: country.code,
      name: country.name,
      isActive: true
    })),
    skipDuplicates: true
  });

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

  const stakeholderRecords = [] as { id: string; email: string; countryCode: string }[];

  for (const stakeholder of stakeholderUsers) {
    const user = await prisma.user.upsert({
      where: { email: stakeholder.email },
      update: {
        name: `UAT ${stakeholder.countryCode} User`,
        role: 'STAKEHOLDER',
        passwordHash: userPasswordHash,
        countryCode: stakeholder.countryCode
      },
      create: {
        email: stakeholder.email,
        name: `UAT ${stakeholder.countryCode} User`,
        role: 'STAKEHOLDER',
        passwordHash: userPasswordHash,
        countryCode: stakeholder.countryCode
      }
    });

    stakeholderRecords.push({ id: user.id, email: user.email, countryCode: stakeholder.countryCode });
  }

  for (const stakeholder of stakeholderRecords) {
    const existingTasks = await prisma.task.count({
      where: { assigneeId: stakeholder.id }
    });

    if (existingTasks > 0) continue;

    const tasks = modules.map((module, index) => ({
      title: `${module} UAT for ${stakeholder.countryCode}`,
      description: `Validate ${module.toLowerCase()} flow for ${stakeholder.countryCode}.`,
      status: index === 0 ? TaskStatus.READY : TaskStatus.IN_PROGRESS,
      priority: index === 0 ? TaskPriority.HIGH : TaskPriority.MEDIUM,
      countryCode: stakeholder.countryCode,
      module,
      assigneeId: stakeholder.id,
      dueDate: new Date(Date.now() + (index + 1) * 86400000)
    }));

    const createdTasks = await prisma.task.createMany({
      data: tasks,
      skipDuplicates: true
    });

    if (createdTasks.count > 0) {
      const seededTasks = await prisma.task.findMany({
        where: { assigneeId: stakeholder.id },
        orderBy: { createdAt: 'asc' },
        take: 2
      });

      for (const task of seededTasks) {
        const existingSteps = await prisma.taskStep.count({
          where: { taskId: task.id }
        });

        if (existingSteps === 0) {
          await prisma.taskStep.createMany({
            data: [
              {
                taskId: task.id,
                order: 1,
                description: 'Verify basic workflow loads correctly.',
                expectedResult: 'The page loads without errors and core actions are visible.',
                testData: 'Default dataset'
              },
              {
                taskId: task.id,
                order: 2,
                description: 'Validate primary user flow with sample data.',
                expectedResult: 'User can complete the flow and see a success confirmation.',
                testData: 'Sample order/customer'
              },
              {
                taskId: task.id,
                order: 3,
                description: 'Confirm records are saved and reflected in reports.',
                expectedResult: 'Saved records appear in the list/report within 1 minute.',
                testData: 'Report filter = Today'
              }
            ],
            skipDuplicates: true
          });
        }

        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: admin.id,
            body: `Please prioritize this ${task.module.toLowerCase()} scenario.`
          }
        });

        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: stakeholder.id,
            body: 'Acknowledged. Starting tests today.'
          }
        });
      }
    }
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
