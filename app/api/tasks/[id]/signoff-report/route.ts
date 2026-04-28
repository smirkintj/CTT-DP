import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { forbidden, notFound, unauthorized } from '@/lib/apiError';
import { adminCanAccessProduct } from '@/lib/adminAccess';
import { generateSignoffReportHtml } from '@/lib/signoffReport';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const autoPrint = new URL(_req.url).searchParams.get('autoprint') === '1';
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      assigneeId: true,
      countryCode: true,
      productId: true
    }
  });

  if (!task) return notFound('Task not found', 'TASK_NOT_FOUND');

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return forbidden('Forbidden', 'TASK_FORBIDDEN');
    }
  } else if (!(await adminCanAccessProduct(session.user.id, task.productId))) {
    return forbidden('Forbidden', 'ADMIN_PRODUCT_FORBIDDEN');
  }

  const html = await generateSignoffReportHtml(id, { autoPrint });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
