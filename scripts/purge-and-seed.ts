import { PrismaClient, UserRole } from '@prisma/client';
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

const adminEmails = [
  'leong.keen@dksh.com',
  'putra.mahirudin@dksh.com',
  'asvin.sraatharan@dksh.com'
];

const marketUsers = [
  { email: 'uat-tw@dksh.com', countryCode: 'TW', name: 'UAT TW User' },
  { email: 'uat-hk@dksh.com', countryCode: 'HK', name: 'UAT HK User' },
  { email: 'uat-sg@dksh.com', countryCode: 'SG', name: 'UAT SG User' },
  { email: 'uat-my@dksh.com', countryCode: 'MY', name: 'UAT MY User' },
  { email: 'uat-th@dksh.com', countryCode: 'TH', name: 'UAT TH User' },
  { email: 'uat-vn@dksh.com', countryCode: 'VN', name: 'UAT VN User' }
];

const seed = async () => {
  if (process.env.CONFIRM_PURGE !== 'YES') {
    throw new Error('Refusing to purge DB. Set CONFIRM_PURGE=YES to proceed.');
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin123@';
  const userPassword = process.env.USER_PASSWORD ?? 'User123@';

  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const userPasswordHash = await bcrypt.hash(userPassword, 10);

  const knownTables = [
    'ActivityRead',
    'Activity',
    'CommentRead',
    'Comment',
    'TaskStep',
    'TaskHistory',
    'Task',
    'MagicLoginToken',
    'NotificationConfig',
    'PortalSetting',
    'User',
    'UserProductAccess',
    'TargetSystem',
    'Product',
    'Module',
    'Country'
  ];

  const existingTables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `;

  const existingTableNames = new Set(existingTables.map((table) => table.tablename));
  const tablesToTruncate = knownTables.filter((table) => existingTableNames.has(table));

  if (tablesToTruncate.length === 0) {
    throw new Error('No known application tables were found to purge.');
  }

  const truncateList = tablesToTruncate.map((table) => `"${table}"`).join(',\n      ');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      ${truncateList}
    RESTART IDENTITY CASCADE;
  `);

  await prisma.country.createMany({
    data: countries.map((country) => ({
      code: country.code,
      name: country.name,
      isActive: true
    })),
    skipDuplicates: true
  });

  const products = [] as Array<{ id: string }>;
  for (const config of productConfigs) {
    const product = await prisma.product.create({
      data: {
        name: config.name,
        slug: config.slug,
        isActive: true,
        modules: {
          create: config.modules.map((name) => ({
            name,
            isActive: true
          }))
        },
        targetSystems: {
          create: config.targetSystems.map((targetSystem) => ({
            name: targetSystem.name,
            baseUrl: targetSystem.baseUrl,
            isActive: true
          }))
        }
      }
    });
    products.push({ id: product.id });
  }

  await prisma.user.createMany({
    data: adminEmails.map((email) => ({
      email,
      name: email.split('@')[0].replace('.', ' ').toUpperCase(),
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash,
      countryCode: null,
      isActive: true,
      mustChangePassword: true
    }))
  });

  await prisma.user.createMany({
    data: marketUsers.map((user) => ({
      email: user.email,
      name: user.name,
      role: UserRole.STAKEHOLDER,
      passwordHash: userPasswordHash,
      countryCode: user.countryCode,
      isActive: true,
      mustChangePassword: true
    }))
  });

  const createdUsers = await prisma.user.findMany({
    where: {
      email: {
        in: marketUsers.map((user) => user.email)
      }
    },
    select: { id: true }
  });

  await prisma.userProductAccess.createMany({
    data: createdUsers.flatMap((user) =>
      products.map((product) => ({
        userId: user.id,
        productId: product.id
      }))
    ),
    skipDuplicates: true
  });

  console.log('Purge and seed completed');
};

seed()
  .catch((error) => {
    console.error('Purge and seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
