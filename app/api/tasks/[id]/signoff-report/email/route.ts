import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { sendTaskReportEmail } from '@/lib/email';
import { adminCanAccessProduct } from '@/lib/adminAccess';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (!session.user.email) {
    return NextResponse.json({ error: 'Current user email is missing' }, { status: 400 });
  }

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      product: { select: { name: true } }
    }
  });

  if (!task) return notFound('Task not found', 'TASK_NOT_FOUND');
  if (!task.signedOffAt) {
    return NextResponse.json({ error: 'Task must be signed off before emailing the report' }, { status: 409 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return forbidden('Forbidden', 'TASK_FORBIDDEN');
    }
  } else if (!(await adminCanAccessProduct(session.user.id, task.productId))) {
    return forbidden('Forbidden', 'ADMIN_PRODUCT_FORBIDDEN');
  }

  const ok = await sendTaskReportEmail({
    to: session.user.email,
    recipientName: session.user.name || session.user.email,
    taskTitle: task.title,
    taskId: task.id,
    productName: task.product.name,
    signedOffAt: task.signedOffAt
  });

  if (!ok) {
    return NextResponse.json({ error: 'Failed to send report email' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
