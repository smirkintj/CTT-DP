import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { badRequest, forbidden, unauthorized } from '@/lib/apiError';
import { createAdminAudit } from '@/lib/adminAudit';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: unauthorized('Unauthorized', 'AUTH_REQUIRED') };
  if (session.user.role !== 'ADMIN') return { error: forbidden('Forbidden', 'ADMIN_REQUIRED') };
  return { session };
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');

  const targetSystems = await prisma.targetSystem.findMany({
    where: {
      isActive: true,
      ...(productId ? { productId } : {})
    },
    orderBy: [{ productId: 'asc' }, { name: 'asc' }]
  });

  return NextResponse.json(targetSystems);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const productId = body?.productId?.toString().trim();
  const name = body?.name?.toString().trim();
  const baseUrl = body?.baseUrl?.toString().trim() || null;

  if (!productId) return badRequest('Product is required', 'PRODUCT_REQUIRED');
  if (!name) return badRequest('Target system name is required', 'TARGET_SYSTEM_NAME_REQUIRED');

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true }
  });
  if (!product) return badRequest('Product does not exist', 'PRODUCT_INVALID');

  const targetSystem = await prisma.targetSystem.upsert({
    where: { productId_name: { productId, name } },
    update: { isActive: true, baseUrl },
    create: { productId, name, baseUrl, isActive: true }
  });

  await createAdminAudit({
    actorId: auth.session.user.id,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} saved target system ${targetSystem.name}.`
  });

  return NextResponse.json(targetSystem);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const productId = body?.productId?.toString().trim();
  const name = body?.name?.toString().trim();

  if (!productId) return badRequest('Product is required', 'PRODUCT_REQUIRED');
  if (!name) return badRequest('Target system name is required', 'TARGET_SYSTEM_NAME_REQUIRED');

  try {
    // Nullify target system reference on tasks before deleting
    const targetSystem = await prisma.targetSystem.findUnique({
      where: { productId_name: { productId, name } },
      select: { id: true }
    });
    if (targetSystem) {
      await prisma.task.updateMany({
        where: { targetSystemId: targetSystem.id },
        data: { targetSystemId: null }
      });
    }

    await prisma.targetSystem.delete({
      where: { productId_name: { productId, name } }
    });

    await createAdminAudit({
      actorId: auth.session.user.id,
      message: `${auth.session.user.name || auth.session.user.email || 'Admin'} deleted target system ${name}.`
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete target system:', error);
    return NextResponse.json({ error: 'Failed to delete target system' }, { status: 500 });
  }
}
