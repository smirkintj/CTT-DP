// app/api/sit-tasks/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction, SitTaskStatus } from '@prisma/client';

const sitTaskInclude = {
  product: { select: { name: true } },
  assignee: { select: { name: true, email: true } },
  countries: { select: { countryCode: true } },
  testCases: { select: { status: true, adminAcknowledgedAt: true } },
} as const;

function mapSitTask(t: any) {
  const tcs: Array<{ status: string; adminAcknowledgedAt: Date | null }> = t.testCases ?? [];
  return {
    id: t.id,
    sprintName: t.sprintName,
    jiraTicket: t.jiraTicket,
    title: t.title,
    productId: t.productId,
    productName: t.product.name,
    module: t.module,
    environment: t.environment,
    status: t.status,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? t.assignee?.email ?? null,
    signedOffAt: t.signedOffAt?.toISOString() ?? null,
    countryCodes: t.countries.map((c: any) => c.countryCode),
    testCaseCount: tcs.length,
    passCount: tcs.filter((tc) => tc.status === 'PASS').length,
    failCount: tcs.filter((tc) => tc.status === 'FAIL').length,
    conditionalCount: tcs.filter((tc) => tc.status === 'CONDITIONAL').length,
    blockedCount: tcs.filter((tc) => tc.status === 'BLOCKED').length,
    notStartedCount: tcs.filter((tc) => tc.status === 'NOT_STARTED').length,
    hasUnacknowledgedConditionals: tcs.some((tc) => tc.status === 'CONDITIONAL' && !tc.adminAcknowledgedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();

  const role = session.user.role;
  if (role !== 'QA' && role !== 'ADMIN') return forbidden();

  // Scope to products this user can access (QA is always product-scoped; admin sees all)
  let productFilter: { productId?: { in: string[] } } = {};
  if (role === 'QA') {
    const productAccesses = await prisma.userProductAccess.findMany({
      where: { userId: session.user.id },
      select: { productId: true },
    });
    const productIds = productAccesses.map((p) => p.productId);
    if (productIds.length === 0) return NextResponse.json([]);
    productFilter = { productId: { in: productIds } };
  }

  const tasks = await prisma.sitTask.findMany({
    where: productFilter,
    include: sitTaskInclude,
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(tasks.map(mapSitTask));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const body = await req.json().catch(() => null);
  const { jiraTicket, title, productId, sprintName, module: mod, environment, countryCodes } = body ?? {};

  if (!jiraTicket || !title || !productId || !sprintName) {
    return badRequest('jiraTicket, title, productId, sprintName are required');
  }
  if (!Array.isArray(countryCodes) || countryCodes.length === 0) {
    return badRequest('At least one countryCode required');
  }

  // Check QA has access to this product
  const access = await prisma.userProductAccess.findFirst({
    where: { userId: session.user.id, productId },
  });
  if (!access) return forbidden();

  // Enforce unique jiraTicket + productId
  const existing = await prisma.sitTask.findUnique({
    where: { jiraTicket_productId: { jiraTicket, productId } },
  });
  if (existing) return badRequest('A SIT task already exists for this Jira ticket and product');

  const task = await prisma.sitTask.create({
    data: {
      jiraTicket,
      title,
      productId,
      sprintName,
      module: mod ?? null,
      environment: environment ?? null,
      status: SitTaskStatus.DRAFT,
      assigneeId: session.user.id,
      updatedById: session.user.id,
      countries: { create: countryCodes.map((code: string) => ({ countryCode: code })) },
    },
    include: sitTaskInclude,
  });

  await createSitHistory({
    sitTaskId: task.id,
    actorId: session.user.id,
    action: SitHistoryAction.TASK_CREATED,
    message: `${session.user.name ?? session.user.email} created SIT task for ${jiraTicket}.`,
    after: { jiraTicket, title, productId, sprintName, countryCodes },
  });

  return NextResponse.json(mapSitTask(task), { status: 201 });
}
