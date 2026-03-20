import { ActivityType, PrismaClient, TaskPriority, TaskStatus } from '@prisma/client';
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

const productConfigs = [
  {
    name: 'EasyOrder',
    slug: 'easyorder',
    modules: ['Ordering', 'Pricing', 'Invoicing'],
    targetSystems: [
      { name: 'Ordering Portal', baseUrl: 'https://ordering.easyorder.example.com' },
      { name: 'Admin Portal', baseUrl: 'https://admin.easyorder.example.com' }
    ]
  },
  {
    name: 'SalesHub',
    slug: 'saleshub',
    modules: ['Campaigns', 'Leads', 'Reporting'],
    targetSystems: [
      { name: 'Sales Portal', baseUrl: 'https://saleshub.example.com' },
      { name: 'Sales Admin', baseUrl: 'https://saleshub-admin.example.com' }
    ]
  },
  {
    name: 'ServicePro',
    slug: 'servicepro',
    modules: ['Cases', 'Scheduling', 'Analytics'],
    targetSystems: [
      { name: 'Service Workspace', baseUrl: 'https://servicepro.example.com' },
      { name: 'Backoffice Console', baseUrl: 'https://servicepro-admin.example.com' }
    ]
  }
];

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

  const seededProducts = [] as Array<{
    id: string;
    name: string;
    slug: string;
    modules: string[];
    targetSystems: Array<{ id: string; name: string; baseUrl: string | null }>;
  }>;

  for (const config of productConfigs) {
    const product = await prisma.product.upsert({
      where: { slug: config.slug },
      update: { name: config.name, isActive: true },
      create: { name: config.name, slug: config.slug, isActive: true }
    });

    for (const moduleName of config.modules) {
      await prisma.module.upsert({
        where: { productId_name: { productId: product.id, name: moduleName } },
        update: { isActive: true },
        create: { productId: product.id, name: moduleName, isActive: true }
      });
    }

    const targetSystems = [] as Array<{ id: string; name: string; baseUrl: string | null }>;
    for (const targetSystem of config.targetSystems) {
      const savedTargetSystem = await prisma.targetSystem.upsert({
        where: { productId_name: { productId: product.id, name: targetSystem.name } },
        update: { isActive: true, baseUrl: targetSystem.baseUrl },
        create: {
          productId: product.id,
          name: targetSystem.name,
          baseUrl: targetSystem.baseUrl,
          isActive: true
        }
      });
      targetSystems.push({
        id: savedTargetSystem.id,
        name: savedTargetSystem.name,
        baseUrl: savedTargetSystem.baseUrl
      });
    }

    seededProducts.push({
      id: product.id,
      name: product.name,
      slug: product.slug,
      modules: config.modules,
      targetSystems
    });
  }

  const admin = await prisma.user.upsert({
    where: { email: 'admin@dksh.com' },
    update: {
      name: 'Admin User',
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      countryCode: null,
      isActive: true,
      mustChangePassword: true
    },
    create: {
      email: 'admin@dksh.com',
      name: 'Admin User',
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      countryCode: null,
      isActive: true,
      mustChangePassword: true
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
        countryCode: stakeholder.countryCode,
        isActive: true,
        mustChangePassword: true
      },
      create: {
        email: stakeholder.email,
        name: `UAT ${stakeholder.countryCode} User`,
        role: 'STAKEHOLDER',
        passwordHash: userPasswordHash,
        countryCode: stakeholder.countryCode,
        isActive: true,
        mustChangePassword: true
      }
    });

    await prisma.userProductAccess.createMany({
      data: seededProducts.map((product) => ({
        userId: user.id,
        productId: product.id
      })),
      skipDuplicates: true
    });

    stakeholderRecords.push({ id: user.id, email: user.email, countryCode: stakeholder.countryCode });
  }

  for (const stakeholder of stakeholderRecords) {
    const existingTasks = await prisma.task.count({
      where: { assigneeId: stakeholder.id }
    });

    if (existingTasks > 0) continue;

    const tasks = seededProducts.flatMap((product, productIndex) =>
      product.modules.slice(0, 2).map((module, index) => ({
      title: `${product.name}: ${module} UAT for ${stakeholder.countryCode}`,
      description: `Validate ${module.toLowerCase()} flow for ${stakeholder.countryCode} in ${product.name}.`,
      status: index === 0 ? TaskStatus.READY : TaskStatus.IN_PROGRESS,
      priority: index === 0 ? TaskPriority.HIGH : TaskPriority.MEDIUM,
      countryCode: stakeholder.countryCode,
      productId: product.id,
      module,
      targetSystemId: product.targetSystems[Math.min(index, product.targetSystems.length - 1)]?.id ?? null,
      assigneeId: stakeholder.id,
      dueDate: new Date(Date.now() + (productIndex + index + 1) * 86400000)
    })));

    const createdTasks = await prisma.task.createMany({
      data: tasks,
      skipDuplicates: true
    });

    const seededTasksForActivity = await prisma.task.findMany({
      where: { assigneeId: stakeholder.id },
      orderBy: { createdAt: 'asc' }
    });

    for (const task of seededTasksForActivity) {
      const existingActivity = await prisma.activity.findFirst({
        where: {
          type: ActivityType.TASK_ASSIGNED,
          taskId: task.id
        }
      });
      if (!existingActivity) {
        await prisma.activity.create({
          data: {
            type: ActivityType.TASK_ASSIGNED,
            taskId: task.id,
            actorId: admin.id,
            countryCode: task.countryCode,
            message: `Admin assigned "${task.title}" to ${stakeholder.email}.`
          }
        });
      }
    }

    if (createdTasks.count > 0) {
      const seededTasks = await prisma.task.findMany({
        where: { assigneeId: stakeholder.id },
        orderBy: { createdAt: 'asc' },
        take: 2
      });

      for (const task of seededTasks) {
        const productName =
          seededProducts.find((product) => product.id === task.productId)?.name ?? 'EasyOrder';
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
            body: `Please prioritize this ${task.module.toLowerCase()} scenario for ${productName}.`
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

  const mockTaskPrefix = 'Mock Task ';
  const mockTaskTargetCount = 100;
  const existingMockCount = await prisma.task.count({
    where: { title: { startsWith: mockTaskPrefix } }
  });

  if (existingMockCount < mockTaskTargetCount) {
    const allStatuses = Object.values(TaskStatus);
    const allPriorities = Object.values(TaskPriority);
    const stakeholderIds = stakeholderRecords.map((record) => record.id);
    const countryCodes = countries.map((country) => country.code);
    const now = Date.now();

    const needed = mockTaskTargetCount - existingMockCount;
    const mockTasks = Array.from({ length: needed }, (_, index) => {
      const sequence = existingMockCount + index + 1;
      const status = allStatuses[sequence % allStatuses.length];
      const priority = allPriorities[sequence % allPriorities.length];
      const assignedCountry =
        stakeholderRecords[sequence % stakeholderRecords.length]?.countryCode ??
        countryCodes[sequence % countryCodes.length];
      const product = seededProducts[sequence % seededProducts.length];
      const moduleName = product.modules[sequence % product.modules.length];
      const isDraft = status === TaskStatus.DRAFT;
      const shouldSignOff =
        status === TaskStatus.PASSED ||
        status === TaskStatus.FAILED ||
        status === TaskStatus.DEPLOYED;
      const createdAt = new Date(now - ((sequence % 30) + 1) * 86400000);
      const updatedAt = new Date(createdAt.getTime() + ((sequence % 10) + 1) * 3600000);
      const signedOffAt = shouldSignOff ? new Date(updatedAt.getTime() + 3600000) : null;
      const assigneeId = isDraft
        ? null
        : sequence % 10 === 0
          ? null
          : stakeholderIds[sequence % stakeholderIds.length];

      return {
        title: `${mockTaskPrefix}${String(sequence).padStart(3, '0')}`,
        description: `Mock task for ${assignedCountry} ${moduleName} (${status}).`,
        status,
        priority,
        countryCode: assignedCountry,
        productId: product.id,
        module: moduleName,
        targetSystemId: product.targetSystems[sequence % product.targetSystems.length]?.id ?? null,
        assigneeId,
        dueDate: new Date(now + ((sequence % 20) + 1) * 86400000),
        createdAt,
        updatedAt,
        updatedById: admin.id,
        signedOffAt,
        signedOffById: signedOffAt ? admin.id : null,
        jiraTicket: sequence % 4 === 0 ? `JIRA-${1000 + sequence}` : null,
        crNumber: sequence % 5 === 0 ? `CR-${2000 + sequence}` : null,
        developer: sequence % 3 === 0 ? `Dev ${((sequence % 7) + 1).toString()}` : null,
        taskGroupId: sequence % 6 === 0 ? `group-${(sequence % 5) + 1}` : null
      };
    });

    await prisma.task.createMany({
      data: mockTasks,
      skipDuplicates: true
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
