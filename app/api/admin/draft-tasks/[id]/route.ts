import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import prisma from '../../../../../lib/prisma';
import { unauthorized, forbidden, badRequest, notFound } from '../../../../../lib/apiError';
import { createAdminAudit } from '../../../../../lib/adminAudit';
import type { GeneratedTaskData } from '../../../../../lib/generateDraftTask';

type ApproveBody = {
  action: 'approve';
  taskData: {
    title: string;
    description?: string;
    module?: string;
    priority?: string;
    dueDate?: string;
    countries: string[];
    assigneeByCountry?: Record<string, string>;
    steps?: Array<{ description: string; expectedResult?: string }>;
  };
};

type RejectBody = {
  action: 'reject';
  reason?: string;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const { id } = await params;
  const body = (await req.json()) as ApproveBody | RejectBody;

  const draft = await prisma.draftTask.findUnique({
    where: { id },
    include: { product: { select: { id: true, name: true, jiraProjectKey: true } } }
  });

  if (!draft) return notFound('Draft task not found', 'DRAFT_NOT_FOUND');
  if (draft.status !== 'PENDING') {
    return badRequest('Draft has already been reviewed', 'DRAFT_ALREADY_REVIEWED');
  }

  if (body.action === 'reject') {
    await prisma.draftTask.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: (body as RejectBody).reason ?? null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      }
    });

    await createAdminAudit({
      actorId: session.user.id,
      message: `${session.user.name || session.user.email || 'Admin'} rejected AI draft task for ${draft.jiraTicket}.`,
      metadata: { draftTaskId: id, jiraTicket: draft.jiraTicket, reason: (body as RejectBody).reason ?? null }
    });

    return NextResponse.json({ ok: true, status: 'REJECTED' });
  }

  if (body.action === 'approve') {
    const { taskData } = body as ApproveBody;

    if (!taskData.countries?.length) {
      return badRequest('At least one country is required', 'COUNTRIES_REQUIRED');
    }

    const generatedData = draft.generatedData as GeneratedTaskData;
    const editedData = { ...generatedData, ...taskData };

    // Save edited data before task creation
    await prisma.draftTask.update({
      where: { id },
      data: { editedData: editedData as object }
    });

    // Find the module ID (or use first available)
    const product = await prisma.product.findUnique({
      where: { id: draft.productId },
      include: { modules: { where: { isActive: true }, take: 1 } }
    });

    const moduleRecord = product?.modules[0];

    // Create tasks (one per country, matching existing task creation pattern)
    const taskGroupId = `grp_${Date.now()}`;
    const createdIds: string[] = [];

    for (const countryCode of taskData.countries) {
      const assigneeId = taskData.assigneeByCountry?.[countryCode] ?? null;

      const task = await prisma.task.create({
        data: {
          taskGroupId,
          title: taskData.title || generatedData.title,
          description: taskData.description ?? generatedData.description,
          module: taskData.module ?? generatedData.module ?? 'General',
          priority: (taskData.priority as 'HIGH' | 'MEDIUM' | 'LOW') ?? generatedData.priority ?? 'MEDIUM',
          status: 'READY',
          productId: draft.productId,
          countryCode,
          jiraTicket: draft.jiraTicket,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
          assigneeId: assigneeId || null,
          updatedById: session.user.id,
          steps: {
            create: (taskData.steps ?? generatedData.steps).map((s, idx) => ({
              order: idx + 1,
              description: s.description,
              expectedResult: (s as { expectedResult?: string }).expectedResult ?? '',
            }))
          }
        }
      });

      // Activity log
      await prisma.activity.create({
        data: {
          type: 'TASK_ASSIGNED',
          message: `UAT task created from SIT intake (${draft.jiraTicket})`,
          taskId: task.id,
          actorId: session.user.id,
          countryCode,
        }
      });

      createdIds.push(task.id);
    }

    await prisma.draftTask.update({
      where: { id },
      data: {
        status: 'APPROVED',
        resultTaskIds: createdIds,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      }
    });

    await createAdminAudit({
      actorId: session.user.id,
      message: `${session.user.name || session.user.email || 'Admin'} approved AI draft task for ${draft.jiraTicket}, creating ${createdIds.length} UAT task(s).`,
      metadata: {
        draftTaskId: id,
        jiraTicket: draft.jiraTicket,
        countries: taskData.countries,
        taskIds: createdIds
      }
    });

    return NextResponse.json({ ok: true, status: 'APPROVED', taskIds: createdIds });
  }

  return badRequest('Invalid action', 'INVALID_ACTION');
}
