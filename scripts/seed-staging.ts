/**
 * Staging seed — restores all base data + UAT + SIT mock data.
 * Safe to re-run: uses upsert everywhere, never truncates.
 *
 * Usage:
 *   DATABASE_URL="..." DIRECT_URL="..." npx tsx scripts/seed-staging.ts
 */

import {
  ActivityType,
  PrismaClient,
  SitCaseStatus,
  SitEvidenceType,
  SitHistoryAction,
  SitTaskStatus,
  StepResult,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const USER_PASSWORD  = process.env.SEED_USER_PASSWORD;
if (!ADMIN_PASSWORD || !USER_PASSWORD) {
  console.error('❌  Set SEED_ADMIN_PASSWORD and SEED_USER_PASSWORD env vars before seeding.');
  process.exit(1);
}

const COUNTRIES = [
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' },
];

const PRODUCTS = [
  {
    name: 'EasyOrder',
    slug: 'easyorder',
    jiraProjectKey: 'EO',
    modules: ['Ordering', 'Pricing', 'Invoicing', 'Checkout', 'User Management'],
    targetSystems: [
      { name: 'Ordering Portal', baseUrl: 'https://ordering.easyorder.example.com' },
      { name: 'Admin Portal', baseUrl: 'https://admin.easyorder.example.com' },
    ],
  },
  {
    name: 'Connect Client',
    slug: 'connect-client',
    jiraProjectKey: 'CC',
    modules: ['Client Management', 'Reporting', 'Onboarding'],
    targetSystems: [
      { name: 'Connect Client Portal', baseUrl: 'https://connect-client.example.com' },
      { name: 'Connect Client Admin', baseUrl: 'https://connect-client-admin.example.com' },
    ],
  },
  {
    name: 'Connect Customer',
    slug: 'connect-customer',
    jiraProjectKey: 'CCU',
    modules: ['Orders', 'Account', 'Support'],
    targetSystems: [
      { name: 'Connect Customer Portal', baseUrl: 'https://connect-customer.example.com' },
      { name: 'Connect Customer Admin', baseUrl: 'https://connect-customer-admin.example.com' },
    ],
  },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting staging seed...\n');

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);

  // ── 1. Countries ────────────────────────────────────────────────────────────
  await prisma.country.createMany({
    data: COUNTRIES.map((c) => ({ code: c.code, name: c.name, isActive: true })),
    skipDuplicates: true,
  });
  console.log('✅ Countries');

  // ── 2. Products + Modules + Target Systems ──────────────────────────────────
  const products: Record<string, { id: string; modules: string[]; targetSystemIds: string[] }> = {};

  for (const cfg of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { slug: cfg.slug },
      update: { name: cfg.name, isActive: true, jiraProjectKey: cfg.jiraProjectKey },
      create: { name: cfg.name, slug: cfg.slug, isActive: true, jiraProjectKey: cfg.jiraProjectKey },
    });

    for (const mod of cfg.modules) {
      await prisma.module.upsert({
        where: { productId_name: { productId: product.id, name: mod } },
        update: { isActive: true },
        create: { productId: product.id, name: mod, isActive: true },
      });
    }

    const tsIds: string[] = [];
    for (const ts of cfg.targetSystems) {
      const saved = await prisma.targetSystem.upsert({
        where: { productId_name: { productId: product.id, name: ts.name } },
        update: { baseUrl: ts.baseUrl },
        create: { productId: product.id, name: ts.name, baseUrl: ts.baseUrl },
      });
      tsIds.push(saved.id);
    }

    products[cfg.slug] = { id: product.id, modules: cfg.modules, targetSystemIds: tsIds };
  }
  console.log('✅ Products, Modules, Target Systems');

  // ── 3. Users ────────────────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: 'putra.mahirudin@dksh.com' },
    update: {},
    create: {
      email: 'putra.mahirudin@dksh.com',
      name: 'Putra Mahirudin',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      mustChangePassword: false,
    },
  });

  const admin2 = await prisma.user.upsert({
    where: { email: 'leong.keen@dksh.com' },
    update: {},
    create: {
      email: 'leong.keen@dksh.com',
      name: 'Leong Keen',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      mustChangePassword: false,
    },
  });

  // Personal admin account — always update passwordHash so it stays in sync
  const adminPersonal = await prisma.user.upsert({
    where: { email: 'putra.mahirudin@gmail.com' },
    update: { passwordHash: adminHash, mustChangePassword: false },
    create: {
      email: 'putra.mahirudin@gmail.com',
      name: 'Putra Mahirudin',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      mustChangePassword: false,
    },
  });

  // Stakeholders
  const stakeholderData = [
    { email: 'uat-my@dksh.com', name: 'Atiqah Razali', countryCode: 'MY' },
    { email: 'uat-sg@dksh.com', name: 'Wei Ling Tan', countryCode: 'SG' },
    { email: 'uat-th@dksh.com', name: 'Somchai Pattana', countryCode: 'TH' },
    { email: 'uat-vn@dksh.com', name: 'Nguyen Thi Mai', countryCode: 'VN' },
    { email: 'uat-hk@dksh.com', name: 'Chan Mei Ling', countryCode: 'HK' },
    { email: 'uat-tw@dksh.com', name: 'Lin Hsiao-Ming', countryCode: 'TW' },
  ];

  const stakeholders: Record<string, { id: string; countryCode: string }> = {};
  for (const s of stakeholderData) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: { countryCode: s.countryCode, name: s.name },   // always keep in sync
      create: {
        email: s.email,
        name: s.name,
        countryCode: s.countryCode,
        passwordHash: userHash,
        role: UserRole.STAKEHOLDER,
        mustChangePassword: false,
      },
    });
    stakeholders[s.countryCode] = { id: u.id, countryCode: s.countryCode };
  }

  // QA users
  const qaUser = await prisma.user.upsert({
    where: { email: 'qa-eo@dksh.com' },
    update: {},
    create: {
      email: 'qa-eo@dksh.com',
      name: 'Nurul Ain',
      passwordHash: userHash,
      role: UserRole.QA,
      mustChangePassword: false,
    },
  });

  const qaUser2 = await prisma.user.upsert({
    where: { email: 'qa-sh@dksh.com' },
    update: {},
    create: {
      email: 'qa-sh@dksh.com',
      name: 'Ravi Kumar',
      passwordHash: userHash,
      role: UserRole.QA,
      mustChangePassword: false,
    },
  });

  console.log('✅ Users (admin, stakeholders, QA)');

  // ── 4. Product Access ───────────────────────────────────────────────────────
  // Admins get all products
  for (const [, p] of Object.entries(products)) {
    for (const admin of [adminUser, admin2, adminPersonal]) {
      await prisma.userProductAccess.upsert({
        where: { userId_productId: { userId: admin.id, productId: p.id } },
        update: {},
        create: { userId: admin.id, productId: p.id },
      });
    }
  }

  // Stakeholders get EasyOrder; TW also gets Connect Client
  for (const [, s] of Object.entries(stakeholders)) {
    await prisma.userProductAccess.upsert({
      where: { userId_productId: { userId: s.id, productId: products.easyorder.id } },
      update: {},
      create: { userId: s.id, productId: products.easyorder.id },
    });
  }
  await prisma.userProductAccess.upsert({
    where: { userId_productId: { userId: stakeholders['TW'].id, productId: products["connect-client"].id } },
    update: {},
    create: { userId: stakeholders['TW'].id, productId: products["connect-client"].id },
  });

  // QA users get EasyOrder; qa2 gets Connect Client
  await prisma.userProductAccess.upsert({
    where: { userId_productId: { userId: qaUser.id, productId: products.easyorder.id } },
    update: {},
    create: { userId: qaUser.id, productId: products.easyorder.id },
  });
  await prisma.userProductAccess.upsert({
    where: { userId_productId: { userId: qaUser2.id, productId: products["connect-client"].id } },
    update: {},
    create: { userId: qaUser2.id, productId: products["connect-client"].id },
  });

  console.log('✅ Product access');

  // ── 5. UAT Tasks ────────────────────────────────────────────────────────────
  const uatTasks = [
    // EasyOrder — MY
    {
      title: 'EasyOrder: Checkout Flow v2',
      module: 'Checkout',
      countryCode: 'MY',
      status: TaskStatus.PASSED,
      priority: TaskPriority.HIGH,
      jiraTicket: 'EO-3020',
      assigneeId: stakeholders['MY'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 14,
      signedOff: true,
    },
    {
      title: 'EasyOrder: Promo Code Validation',
      module: 'Pricing',
      countryCode: 'MY',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      jiraTicket: 'EO-3045',
      assigneeId: stakeholders['MY'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 3,
      signedOff: false,
    },
    {
      title: 'EasyOrder: User Registration Flow',
      module: 'User Management',
      countryCode: 'SG',
      status: TaskStatus.READY,
      priority: TaskPriority.MEDIUM,
      jiraTicket: 'EO-3050',
      assigneeId: stakeholders['SG'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 2,
      signedOff: false,
    },
    {
      title: 'EasyOrder: Invoice Download',
      module: 'Invoicing',
      countryCode: 'SG',
      status: TaskStatus.PASSED,
      priority: TaskPriority.LOW,
      jiraTicket: 'EO-3030',
      assigneeId: stakeholders['SG'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 7,
      signedOff: true,
    },
    {
      title: 'EasyOrder: Order History Pagination',
      module: 'Ordering',
      countryCode: 'TH',
      status: TaskStatus.DRAFT,
      priority: TaskPriority.LOW,
      jiraTicket: null,
      assigneeId: stakeholders['TH'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 1,
      signedOff: false,
    },
    // Connect Client — HK
    {
      title: 'Connect Client: Lead Conversion Flow',
      module: 'Leads',
      countryCode: 'HK',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      jiraTicket: 'CC-210',
      assigneeId: stakeholders['HK'].id,
      productId: products["connect-client"].id,
      targetSystemId: products["connect-client"].targetSystemIds[0],
      daysAgo: 4,
      signedOff: false,
    },
    {
      title: 'Connect Client: Campaign Email Trigger',
      module: 'Campaigns',
      countryCode: 'TW',
      status: TaskStatus.READY,
      priority: TaskPriority.MEDIUM,
      jiraTicket: 'CC-220',
      assigneeId: stakeholders['TW'].id,
      productId: products["connect-client"].id,
      targetSystemId: products["connect-client"].targetSystemIds[0],
      daysAgo: 2,
      signedOff: false,
    },
    {
      title: 'Connect Client: Lead Assignment Rules',
      module: 'Leads',
      countryCode: 'TW',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      jiraTicket: 'CC-231',
      assigneeId: stakeholders['TW'].id,
      productId: products["connect-client"].id,
      targetSystemId: products["connect-client"].targetSystemIds[0],
      daysAgo: 5,
      signedOff: false,
    },
    {
      title: 'EasyOrder: Bulk Order Upload TW',
      module: 'Ordering',
      countryCode: 'TW',
      status: TaskStatus.PASSED,
      priority: TaskPriority.MEDIUM,
      jiraTicket: 'EO-3055',
      assigneeId: stakeholders['TW'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 9,
      signedOff: true,
    },
    {
      title: 'EasyOrder: Payment Gateway TW',
      module: 'Checkout',
      countryCode: 'TW',
      status: TaskStatus.DRAFT,
      priority: TaskPriority.HIGH,
      jiraTicket: 'EO-3072',
      assigneeId: stakeholders['TW'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 1,
      signedOff: false,
    },
    // Connect Customer — VN
    {
      title: 'Connect Customer: Case Escalation Flow',
      module: 'Cases',
      countryCode: 'VN',
      status: TaskStatus.PASSED,
      priority: TaskPriority.HIGH,
      jiraTicket: 'CCU-105',
      assigneeId: stakeholders['VN'].id,
      productId: products["connect-customer"].id,
      targetSystemId: products["connect-customer"].targetSystemIds[0],
      daysAgo: 10,
      signedOff: true,
    },
    // ⚠️ OVERDUE — EasyOrder SG, due 3 days ago
    {
      title: 'EasyOrder: Invoice Reconciliation Report',
      module: 'Invoicing',
      countryCode: 'SG',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      jiraTicket: 'EO-3060',
      assigneeId: stakeholders['SG'].id,
      productId: products.easyorder.id,
      targetSystemId: products.easyorder.targetSystemIds[0],
      daysAgo: 8,
      dueDaysFromNow: -3,   // overdue
      signedOff: false,
    },
  ];

  const now = Date.now();
  for (const t of uatTasks) {
    const createdAt = new Date(now - t.daysAgo * 86400000);
    const signedOffAt = t.signedOff ? new Date(createdAt.getTime() + 2 * 86400000) : null;
    const dueDaysFromNow = (t as any).dueDaysFromNow ?? 7;

    const existing = await prisma.task.findFirst({
      where: { title: t.title, countryCode: t.countryCode },
    });
    if (existing) {
      // Keep assigneeId in sync in case user was re-created with a new UUID
      await prisma.task.update({
        where: { id: existing.id },
        data: { assigneeId: t.assigneeId },
      });
      continue;
    }

    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: `UAT validation for ${t.title}.`,
        module: t.module,
        countryCode: t.countryCode,
        status: t.status,
        priority: t.priority,
        jiraTicket: t.jiraTicket,
        productId: t.productId,
        targetSystemId: t.targetSystemId,
        assigneeId: t.assigneeId,
        updatedById: adminUser.id,
        dueDate: new Date(now + dueDaysFromNow * 86400000),
        signedOffAt,
        signedOffById: signedOffAt ? adminUser.id : null,
        createdAt,
        updatedAt: createdAt,
      },
    });

    await prisma.taskStep.createMany({
      data: [
        {
          taskId: task.id,
          order: 1,
          description: `Verify ${t.module.toLowerCase()} loads correctly and core actions are available.`,
          expectedResult: 'Page loads without errors, all primary actions visible.',
          testData: 'Default dataset',
        },
        {
          taskId: task.id,
          order: 2,
          description: `Complete primary ${t.module.toLowerCase()} user flow with sample data.`,
          expectedResult: 'User can complete the flow and receives a success confirmation.',
          testData: 'Sample record',
        },
        {
          taskId: task.id,
          order: 3,
          description: 'Verify data is persisted and visible in reports/list views.',
          expectedResult: 'Record appears in list within 1 minute.',
          testData: 'Report filter = Today',
        },
      ],
    });
  }
  console.log('✅ UAT Tasks + Steps');

  // ── 5b. UAT Step Progress, Activities & Comments ────────────────────────────
  const allUatTasks = await prisma.task.findMany({
    where: { title: { in: uatTasks.map((t) => t.title) } },
    include: { steps: { orderBy: { order: 'asc' } } },
  });

  for (const task of allUatTasks) {
    // --- Step results ---------------------------------------------------
    const stepsDone = task.steps.filter((s) => s.stepResult !== null).length;
    if (stepsDone === 0) {
      for (const step of task.steps) {
        let data: { actualResult: string; isPassed: boolean; stepResult: StepResult } | null = null;

        if (task.status === TaskStatus.PASSED) {
          data = {
            actualResult: 'Verified and working as expected. No issues found.',
            isPassed: true,
            stepResult: StepResult.PASSED,
          };
        } else if (task.status === TaskStatus.IN_PROGRESS) {
          if (step.order === 1) {
            // Step 1 always done for IN_PROGRESS
            if (task.title.includes('Invoice Reconciliation')) {
              data = {
                actualResult: 'Initial load succeeded. Report filter rendered correctly.',
                isPassed: true,
                stepResult: StepResult.PASSED,
              };
            } else {
              data = {
                actualResult: 'Completed without errors.',
                isPassed: true,
                stepResult: StepResult.PASSED,
              };
            }
          } else if (step.order === 2 && task.title.includes('Invoice Reconciliation')) {
            // Overdue task: step 2 blocked
            data = {
              actualResult: 'Report generation timed out on dataset > 50k rows. Backend bug raised.',
              isPassed: false,
              stepResult: StepResult.FAILED,
            };
          }
        }

        if (data) {
          await prisma.taskStep.update({ where: { id: step.id }, data });
        }
      }
    }

    // --- Activities -----------------------------------------------------
    const existingAct = await prisma.activity.count({ where: { taskId: task.id } });
    if (existingAct === 0) {
      // Assigned
      await prisma.activity.create({
        data: {
          type: ActivityType.TASK_ASSIGNED,
          message: `Task "${task.title}" assigned to ${task.countryCode} team.`,
          taskId: task.id,
          actorId: adminUser.id,
          countryCode: task.countryCode ?? undefined,
          createdAt: task.createdAt,
        },
      });

      // Status changed (non-DRAFT)
      if (task.status !== TaskStatus.DRAFT) {
        await prisma.activity.create({
          data: {
            type: ActivityType.STATUS_CHANGED,
            message: `Status changed to ${task.status} on "${task.title}".`,
            taskId: task.id,
            actorId: adminUser.id,
            countryCode: task.countryCode ?? undefined,
            createdAt: new Date(task.createdAt.getTime() + 12 * 3600000),
          },
        });
      }

      // Signed off
      if (task.signedOffAt) {
        await prisma.activity.create({
          data: {
            type: ActivityType.SIGNED_OFF,
            message: `"${task.title}" signed off by admin.`,
            taskId: task.id,
            actorId: adminUser.id,
            countryCode: task.countryCode ?? undefined,
            createdAt: task.signedOffAt,
          },
        });
      }
    }

    // --- Comments -------------------------------------------------------
    const existingComments = await prisma.comment.count({ where: { taskId: task.id } });
    if (existingComments === 0 && task.status !== TaskStatus.DRAFT) {
      const assigneeId = task.assigneeId ?? adminUser.id;
      const base = task.createdAt.getTime();

      // Admin opens the thread
      await prisma.comment.create({
        data: {
          taskId: task.id,
          authorId: adminUser.id,
          body: `Hi team — please review the test cases for **${task.title}** and confirm all steps are covered before you start testing.`,
          createdAt: new Date(base + 30 * 60000),
        },
      });
      await prisma.activity.create({
        data: {
          type: ActivityType.COMMENT_ADDED,
          message: `Comment added on "${task.title}".`,
          taskId: task.id,
          actorId: adminUser.id,
          countryCode: task.countryCode ?? undefined,
          createdAt: new Date(base + 30 * 60000),
        },
      });

      // Assignee acknowledges
      if (task.status === TaskStatus.IN_PROGRESS || task.status === TaskStatus.PASSED) {
        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: assigneeId,
            body: 'Noted! I\'ve gone through the steps — coverage looks good. Starting the testing session now.',
            createdAt: new Date(base + 4 * 3600000),
          },
        });

        // Admin follows up with environment note
        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: adminUser.id,
            body: 'Make sure you\'re testing against the staging environment — prod data sync runs at midnight.',
            createdAt: new Date(base + 5 * 3600000),
          },
        });
      }

      // Step-specific comment for overdue task
      if (task.title.includes('Invoice Reconciliation')) {
        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: assigneeId,
            stepOrder: 2,
            body: 'Step 2 is failing — the report generation times out when the dataset exceeds 50k rows. I\'ve tested with a smaller range and it works. Looks like a backend limitation.',
            createdAt: new Date(base + 2 * 86400000),
          },
        });
        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: adminUser.id,
            body: '⚠️ **Overdue.** This is blocking deployment. Escalating to engineering — EO-3060 backend timeout. @Wei Ling please hold sign-off until the fix is in.',
            createdAt: new Date(now - 1 * 86400000),
          },
        });
      }

      // Sign-off comment for passed tasks
      if (task.status === TaskStatus.PASSED && task.signedOffAt) {
        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: assigneeId,
            body: 'All steps completed and verified ✅ — approving this for deployment.',
            createdAt: new Date(task.signedOffAt.getTime() - 20 * 60000),
          },
        });
      }
    }
  }
  console.log('✅ UAT Activities, Step Progress & Comments');

  // ── 6. SIT Tasks ────────────────────────────────────────────────────────────
  const eoProduct = products.easyorder;
  const shProduct = products["connect-client"];

  // ── SIT Task A: SIGNED_OFF (complete demo of the full flow) ─────────────────
  const existingSitA = await prisma.sitTask.findUnique({
    where: { jiraTicket_productId: { jiraTicket: 'EO-3000', productId: eoProduct.id } },
  });

  if (!existingSitA) {
    const sitA = await prisma.sitTask.create({
      data: {
        sprintName: 'Sprint 4',
        jiraTicket: 'EO-3000',
        title: 'EasyOrder – Cart & Checkout Phase 1',
        productId: eoProduct.id,
        module: 'Checkout',
        environment: 'Staging',
        status: SitTaskStatus.SIGNED_OFF,
        assigneeId: qaUser.id,
        signedOffAt: new Date(now - 5 * 86400000),
        signedOffById: qaUser.id,
        updatedById: qaUser.id,
        countries: { create: [{ countryCode: 'MY' }, { countryCode: 'SG' }] },
      },
    });

    const sitATCs = await Promise.all([
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitA.id,
          seqId: 1,
          priority: '2-High',
          category: 'Functionality',
          name: 'User can add item to cart',
          description: 'Verify that a logged-in user can add a product to their cart.',
          steps: '1. Log in as buyer\n2. Browse to product catalogue\n3. Click "Add to Cart" on any product\n4. Open cart',
          expectedResult: 'Product appears in cart with correct quantity and price.',
          testData: 'Buyer: buyer-my@test.com | Product: SKU-001',
          actualResult: 'Product added successfully. Cart badge updates to 1.',
          status: SitCaseStatus.PASS,
          testerName: 'Nurul Ain',
          testedAt: new Date(now - 7 * 86400000),
        },
      }),
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitA.id,
          seqId: 2,
          priority: '2-High',
          category: 'Functionality',
          name: 'Promo code applies discount correctly',
          description: 'Verify valid promo codes are applied at checkout.',
          steps: '1. Add items to cart\n2. Go to checkout\n3. Enter promo code SPRINT4TEST\n4. Click Apply',
          expectedResult: '10% discount applied to order subtotal.',
          testData: 'Promo: SPRINT4TEST (10% off)',
          actualResult: 'Discount applied. Subtotal reduced by 10%. Confirmed in order summary.',
          status: SitCaseStatus.PASS,
          testerName: 'Nurul Ain',
          testedAt: new Date(now - 7 * 86400000),
        },
      }),
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitA.id,
          seqId: 3,
          priority: '3-Medium',
          category: 'Functionality',
          name: 'Out-of-stock item shows correct message',
          description: 'Verify OOS items cannot be added and show appropriate message.',
          steps: '1. Browse to an out-of-stock product\n2. Attempt to add to cart',
          expectedResult: '"Out of Stock" badge shown. Add to Cart button disabled.',
          testData: 'Product: SKU-OOS-001',
          actualResult: 'OOS badge shown but button still clickable — shows error toast instead. Functionality correct but UX note raised.',
          status: SitCaseStatus.CONDITIONAL,
          conditionalNote: 'Button should be disabled per design spec, currently shows an error toast instead. Dev team acknowledged as minor UX debt — fix scheduled for Sprint 5.',
          adminAcknowledgedAt: new Date(now - 4 * 86400000),
          adminAcknowledgedById: adminUser.id,
          testerName: 'Nurul Ain',
          testedAt: new Date(now - 6 * 86400000),
        },
      }),
    ]);

    // Add JAM link evidence to TC1
    await prisma.sitEvidence.create({
      data: {
        sitTestCaseId: sitATCs[0].id,
        type: SitEvidenceType.JAM_LINK,
        url: 'https://jam.dev/c/eo-cart-add-demo',
        filename: null,
      },
    });

    // Add defect to TC3
    await prisma.sitDefect.create({
      data: {
        sitTestCaseId: sitATCs[2].id,
        jiraKey: 'EO-3005',
        summary: 'OOS button not disabled — shows error toast instead',
        status: 'In Progress',
        priority: 'Low',
        url: 'https://dksh.atlassian.net/browse/EO-3005',
      },
    });

    // History
    await prisma.sitTaskHistory.createMany({
      data: [
        {
          sitTaskId: sitA.id,
          actorId: qaUser.id,
          action: SitHistoryAction.TASK_CREATED,
          message: 'Nurul Ain created SIT task for EO-3000.',
          createdAt: new Date(now - 10 * 86400000),
        },
        {
          sitTaskId: sitA.id,
          actorId: qaUser.id,
          action: SitHistoryAction.TASK_PUBLISHED,
          message: 'Nurul Ain changed status to READY.',
          before: { status: 'DRAFT' },
          after: { status: 'READY' },
          createdAt: new Date(now - 9 * 86400000),
        },
        {
          sitTaskId: sitA.id,
          actorId: qaUser.id,
          action: SitHistoryAction.TEST_CASE_RESULT_RECORDED,
          message: 'Nurul Ain marked TC#1 as PASS.',
          before: { status: 'NOT_STARTED' },
          after: { status: 'PASS' },
          createdAt: new Date(now - 7 * 86400000),
        },
        {
          sitTaskId: sitA.id,
          actorId: qaUser.id,
          action: SitHistoryAction.TEST_CASE_RESULT_RECORDED,
          message: 'Nurul Ain marked TC#3 as CONDITIONAL.',
          before: { status: 'NOT_STARTED' },
          after: { status: 'CONDITIONAL', conditionalNote: 'Button UX issue noted.' },
          createdAt: new Date(now - 6 * 86400000),
        },
        {
          sitTaskId: sitA.id,
          actorId: adminUser.id,
          action: SitHistoryAction.CONDITIONAL_ACKNOWLEDGED,
          message: 'Putra Mahirudin acknowledged CONDITIONAL TC#3: accepted as minor UX debt, tracked in EO-3005.',
          after: { testCaseId: sitATCs[2].id },
          createdAt: new Date(now - 4 * 86400000),
        },
        {
          sitTaskId: sitA.id,
          actorId: qaUser.id,
          action: SitHistoryAction.SIGNED_OFF,
          message: 'Nurul Ain signed off the SIT task.',
          after: { signedOffAt: new Date(now - 5 * 86400000).toISOString(), signatureCaptured: true },
          createdAt: new Date(now - 5 * 86400000),
        },
      ],
    });
    console.log('  ✅ SIT Task A (SIGNED_OFF): EO-3000');
  }

  // ── SIT Task B: IN_PROGRESS (mixed results, active testing) ─────────────────
  const existingSitB = await prisma.sitTask.findUnique({
    where: { jiraTicket_productId: { jiraTicket: 'EO-3066', productId: eoProduct.id } },
  });

  if (!existingSitB) {
    const sitB = await prisma.sitTask.create({
      data: {
        sprintName: 'Sprint 5',
        jiraTicket: 'EO-3066',
        title: 'EasyOrder – RDD Phase 2 Ordering Flow',
        productId: eoProduct.id,
        module: 'Ordering',
        environment: 'Staging',
        status: SitTaskStatus.IN_PROGRESS,
        assigneeId: qaUser.id,
        updatedById: qaUser.id,
        countries: { create: [{ countryCode: 'MY' }, { countryCode: 'SG' }, { countryCode: 'TH' }] },
      },
    });

    await Promise.all([
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitB.id,
          seqId: 1,
          priority: '2-High',
          category: 'Functionality',
          name: 'Buyer can place a standard order',
          description: 'Verify end-to-end order placement for a logged-in buyer.',
          steps: '1. Log in as buyer\n2. Search for product by SKU\n3. Add to cart\n4. Proceed to checkout\n5. Select delivery address\n6. Confirm order',
          expectedResult: 'Order confirmation screen shown. Order visible in order history with status "Pending".',
          testData: 'Buyer: buyer-my@test.com | SKU: EO-SKU-101',
          actualResult: 'Order placed successfully. Confirmation email received.',
          status: SitCaseStatus.PASS,
          testerName: 'Nurul Ain',
          testedAt: new Date(now - 2 * 86400000),
        },
      }),
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitB.id,
          seqId: 2,
          priority: '2-High',
          category: 'Functionality',
          name: 'Minimum order quantity enforced',
          description: 'Verify MOQ rule blocks orders below minimum.',
          steps: '1. Add product with MOQ=10 to cart\n2. Set quantity to 5\n3. Attempt checkout',
          expectedResult: 'Error message: "Minimum order quantity is 10."',
          testData: 'Product SKU-MOQ-001 (MOQ: 10)',
          actualResult: null,
          status: SitCaseStatus.NOT_STARTED,
          testerName: null,
          testedAt: null,
        },
      }),
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitB.id,
          seqId: 3,
          priority: '3-Medium',
          category: 'Functionality',
          name: 'Order cancellation within grace period',
          description: 'Verify buyer can cancel order within 30-minute grace period.',
          steps: '1. Place an order\n2. Within 30 mins, go to Order History\n3. Click Cancel\n4. Confirm cancellation',
          expectedResult: 'Order status changes to "Cancelled". Refund initiated if paid.',
          testData: 'Recently placed order',
          actualResult: 'Cancellation button present but confirmation modal does not close after confirming. Requires investigation.',
          status: SitCaseStatus.FAIL,
          testerName: 'Nurul Ain',
          testedAt: new Date(now - 1 * 86400000),
        },
      }),
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitB.id,
          seqId: 4,
          priority: '1-Critical',
          category: 'Performance',
          name: 'Order list loads within 3 seconds',
          description: 'Verify order history page load time under standard load.',
          steps: '1. Log in\n2. Navigate to Order History\n3. Measure page load time',
          expectedResult: 'Page fully loaded within 3 seconds on staging.',
          testData: 'Account with 100+ orders',
          actualResult: null,
          status: SitCaseStatus.NOT_STARTED,
          testerName: null,
          testedAt: null,
        },
      }),
      prisma.sitTestCase.create({
        data: {
          sitTaskId: sitB.id,
          seqId: 5,
          priority: '3-Medium',
          category: 'Functionality',
          name: 'Guest checkout not available for B2B',
          description: 'Verify B2B portal does not allow guest checkout.',
          steps: '1. Open checkout page without logging in\n2. Observe available options',
          expectedResult: 'Redirect to login page. No "Continue as Guest" option.',
          testData: 'Unauthenticated session',
          actualResult: 'Correctly redirected to login. No guest option shown.',
          status: SitCaseStatus.PASS,
          testerName: 'Nurul Ain',
          testedAt: new Date(now - 2 * 86400000),
        },
      }),
    ]);

    // Defect linked to TC3
    const tc3 = await prisma.sitTestCase.findFirst({
      where: { sitTaskId: sitB.id, seqId: 3 },
    });
    if (tc3) {
      await prisma.sitDefect.create({
        data: {
          sitTestCaseId: tc3.id,
          jiraKey: 'EO-3071',
          summary: 'Order cancellation modal does not close after confirming',
          status: 'Open',
          priority: 'High',
          url: 'https://dksh.atlassian.net/browse/EO-3071',
        },
      });
      await prisma.sitEvidence.create({
        data: {
          sitTestCaseId: tc3.id,
          type: SitEvidenceType.JAM_LINK,
          url: 'https://jam.dev/c/eo-cancel-bug-repro',
          filename: null,
        },
      });
    }

    // Scope change history note
    await prisma.sitTaskHistory.createMany({
      data: [
        {
          sitTaskId: sitB.id,
          actorId: qaUser.id,
          action: SitHistoryAction.TASK_CREATED,
          message: 'Nurul Ain created SIT task for EO-3066.',
          createdAt: new Date(now - 5 * 86400000),
        },
        {
          sitTaskId: sitB.id,
          actorId: qaUser.id,
          action: SitHistoryAction.TASK_PUBLISHED,
          message: 'Nurul Ain changed status to READY.',
          before: { status: 'DRAFT' },
          after: { status: 'READY' },
          createdAt: new Date(now - 4 * 86400000),
        },
        {
          sitTaskId: sitB.id,
          actorId: qaUser.id,
          action: SitHistoryAction.SCOPE_NOTE_ADDED,
          message: 'Nurul Ain: TC#4 (Performance) added after dev flagged a regression in order list query. Scope expanded on Day 2.',
          createdAt: new Date(now - 3 * 86400000),
        },
        {
          sitTaskId: sitB.id,
          actorId: qaUser.id,
          action: SitHistoryAction.TEST_CASE_RESULT_RECORDED,
          message: 'Nurul Ain marked TC#3 as FAIL.',
          before: { status: 'NOT_STARTED' },
          after: { status: 'FAIL' },
          createdAt: new Date(now - 1 * 86400000),
        },
      ],
    });
    console.log('  ✅ SIT Task B (IN_PROGRESS): EO-3066');
  }

  // ── SIT Task C: READY (test cases written, not started) ─────────────────────
  const existingSitC = await prisma.sitTask.findUnique({
    where: { jiraTicket_productId: { jiraTicket: 'EO-3089', productId: eoProduct.id } },
  });

  if (!existingSitC) {
    const sitC = await prisma.sitTask.create({
      data: {
        sprintName: 'Sprint 5',
        jiraTicket: 'EO-3089',
        title: 'EasyOrder – Invoice Generation & Download',
        productId: eoProduct.id,
        module: 'Invoicing',
        environment: 'Staging',
        status: SitTaskStatus.READY,
        assigneeId: qaUser.id,
        updatedById: qaUser.id,
        countries: { create: [{ countryCode: 'MY' }] },
      },
    });

    await prisma.sitTestCase.createMany({
      data: [
        {
          sitTaskId: sitC.id,
          seqId: 1,
          priority: '2-High',
          category: 'Functionality',
          name: 'Invoice generates after order completion',
          description: 'Verify PDF invoice is auto-generated when order status changes to Completed.',
          steps: '1. Complete an order flow\n2. Admin marks order as Completed\n3. Buyer checks Invoice section',
          expectedResult: 'PDF invoice available for download within 2 minutes of order completion.',
          testData: 'Completed order reference',
          status: SitCaseStatus.NOT_STARTED,
        },
        {
          sitTaskId: sitC.id,
          seqId: 2,
          priority: '3-Medium',
          category: 'Functionality',
          name: 'Invoice contains correct line items',
          description: 'Verify all ordered products, quantities, and prices appear correctly on invoice.',
          steps: '1. Download invoice PDF\n2. Compare line items against order details',
          expectedResult: 'All products, quantities, unit prices, and totals match order summary.',
          testData: 'Order with 3 line items',
          status: SitCaseStatus.NOT_STARTED,
        },
        {
          sitTaskId: sitC.id,
          seqId: 3,
          priority: '4-Low',
          category: 'UI/UX',
          name: 'Invoice download button accessible on mobile',
          description: 'Verify download CTA is visible and functional on mobile viewport.',
          steps: '1. Open invoice page on mobile (375px)\n2. Attempt to tap Download button',
          expectedResult: 'Download button visible without horizontal scroll. Tap initiates file download.',
          testData: 'iPhone 12 viewport',
          status: SitCaseStatus.NOT_STARTED,
        },
      ],
    });

    await prisma.sitTaskHistory.create({
      data: {
        sitTaskId: sitC.id,
        actorId: qaUser.id,
        action: SitHistoryAction.TASK_CREATED,
        message: 'Nurul Ain created SIT task for EO-3089.',
        createdAt: new Date(now - 1 * 86400000),
      },
    });
    console.log('  ✅ SIT Task C (READY): EO-3089');
  }

  // ── SIT Task D: DRAFT (just created, Connect Client) ───────────────────────────
  const existingSitD = await prisma.sitTask.findUnique({
    where: { jiraTicket_productId: { jiraTicket: 'CC-250', productId: shProduct.id } },
  });

  if (!existingSitD) {
    const sitD = await prisma.sitTask.create({
      data: {
        sprintName: 'Sprint 3',
        jiraTicket: 'CC-250',
        title: 'Connect Client – Lead Assignment Rules',
        productId: shProduct.id,
        module: 'Leads',
        environment: 'Staging',
        status: SitTaskStatus.DRAFT,
        assigneeId: qaUser2.id,
        updatedById: qaUser2.id,
        countries: { create: [{ countryCode: 'SG' }] },
      },
    });

    await prisma.sitTaskHistory.create({
      data: {
        sitTaskId: sitD.id,
        actorId: qaUser2.id,
        action: SitHistoryAction.TASK_CREATED,
        message: 'Ravi Kumar created SIT task for CC-250.',
      },
    });
    console.log('  ✅ SIT Task D (DRAFT): CC-250');
  }

  console.log('\n✅ SIT Tasks');

  // ── 7. Portal Settings ───────────────────────────────────────────────────────
  await prisma.portalSetting.upsert({
    where: { key: 'portal_title' },
    update: {},
    create: { key: 'portal_title', value: 'CTT — Change Tracking Tool' },
  });

  console.log('\n🎉 Staging seed complete!\n');
  console.log('─────────────────────────────────────────');
  console.log('CREDENTIALS');
  console.log('─────────────────────────────────────────');
  console.log(`Admin:        putra.mahirudin@dksh.com / ${ADMIN_PASSWORD}`);
  console.log(`Admin:        putra.mahirudin@gmail.com / ${ADMIN_PASSWORD}`);
  console.log(`Admin:        leong.keen@dksh.com / ${ADMIN_PASSWORD}`);
  console.log(`Stakeholder:  uat-my@dksh.com (Atiqah) / ${USER_PASSWORD}`);
  console.log(`Stakeholder:  uat-sg@dksh.com / ${USER_PASSWORD}`);
  console.log(`Stakeholder:  uat-tw@dksh.com (Lin Hsiao-Ming) / ${USER_PASSWORD}`);
  console.log(`QA (pilot):   qa-eo@dksh.com (Nurul Ain) / ${USER_PASSWORD}`);
  console.log(`QA:           qa-sh@dksh.com (Ravi Kumar) / ${USER_PASSWORD}`);
  console.log('─────────────────────────────────────────');
  console.log('\nSIT TASKS SEEDED:');
  console.log('  EO-3000  Sprint 4  SIGNED_OFF  — full flow demo (CONDITIONAL + acknowledged)');
  console.log('  EO-3066  Sprint 5  IN_PROGRESS — mixed PASS/FAIL/NOT_STARTED, scope note, defect');
  console.log('  EO-3089  Sprint 5  READY       — test cases written, not started');
  console.log('  CC-250   Sprint 3  DRAFT       — just created');
  console.log('\nUAT OVERDUE:');
  console.log('  EO-3060  IN_PROGRESS  SG  — Invoice Reconciliation, due 3 days ago, step 2 FAILED');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
