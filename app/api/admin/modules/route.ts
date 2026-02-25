import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { badRequest, forbidden, unauthorized } from '../../../../lib/apiError';
import { createAdminAudit } from '../../../../lib/adminAudit';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: unauthorized('Unauthorized', 'AUTH_REQUIRED') };
  }
  if (session.user.role !== 'ADMIN') {
    return { error: forbidden('Forbidden', 'ADMIN_REQUIRED') };
  }
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const modules = await prisma.module.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });

  return NextResponse.json(modules.map((module) => module.name));
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.toString().trim();

  if (!name) {
    return badRequest('Module name is required', 'MODULE_NAME_REQUIRED');
  }

  const moduleItem = await prisma.module.upsert({
    where: { name },
    update: { isActive: true },
    create: { name, isActive: true }
  });

  await createAdminAudit({
    actorId: auth.session.user.id,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} saved module ${moduleItem.name}.`
  });

  return NextResponse.json({ name: moduleItem.name });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.toString().trim();
  if (!name) {
    return badRequest('Module name is required', 'MODULE_NAME_REQUIRED');
  }

  const tasksCount = await prisma.task.count({ where: { module: name } });
  if (tasksCount > 0) {
    return NextResponse.json(
      { error: 'Cannot delete module that is already used by tasks.' },
      { status: 400 }
    );
  }

  await prisma.module.delete({ where: { name } });
  await createAdminAudit({
    actorId: auth.session.user.id,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} deleted module ${name}.`
  });
  return NextResponse.json({ success: true });
}
