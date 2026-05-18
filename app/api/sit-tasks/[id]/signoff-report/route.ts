// app/api/sit-tasks/[id]/signoff-report/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { generateSitSignoffReportHtml } from '@/lib/sitSignoffReport';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const autoPrint = new URL(req.url).searchParams.get('autoprint') === '1';
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();

  const task = await prisma.sitTask.findUnique({
    where: { id },
    select: { productId: true },
  });
  if (!task) return notFound();

  const role = session.user.role;
  if (role !== 'ADMIN') {
    const access = await prisma.userProductAccess.findFirst({
      where: { userId: session.user.id, productId: task.productId },
    });
    if (!access) return forbidden();
  }

  const html = await generateSitSignoffReportHtml(id, { autoPrint });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
