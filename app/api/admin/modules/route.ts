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

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  const modules = await prisma.module.findMany({
    where: {
      isActive: true,
      ...(productId ? { productId } : {})
    },
    orderBy: [{ productId: 'asc' }, { name: 'asc' }]
  });

  if (!productId) {
    return NextResponse.json(
      Array.from(new Set(modules.map((module) => module.name))).sort((a, b) => a.localeCompare(b))
    );
  }

  return NextResponse.json(
    modules.map((module) => ({
      id: module.id,
      name: module.name,
      productId: module.productId
    }))
  );
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const productId = body?.productId?.toString().trim();

  if (!name) {
    return badRequest('Module name is required', 'MODULE_NAME_REQUIRED');
  }
  if (!productId) {
    return badRequest('Product is required', 'PRODUCT_REQUIRED');
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true }
  });
  if (!product) {
    return badRequest('Product does not exist', 'PRODUCT_INVALID');
  }

  const moduleItem = await prisma.module.upsert({
    where: { productId_name: { productId, name } },
    update: { isActive: true },
    create: { productId, name, isActive: true }
  });

  await createAdminAudit({
    actorId: auth.session.user.id,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} saved module ${moduleItem.name}.`
  });

  return NextResponse.json({ id: moduleItem.id, name: moduleItem.name, productId: moduleItem.productId });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const productId = body?.productId?.toString().trim();
  if (!name) {
    return badRequest('Module name is required', 'MODULE_NAME_REQUIRED');
  }
  if (!productId) {
    return badRequest('Product is required', 'PRODUCT_REQUIRED');
  }

  // Nullify module reference on tasks before deleting
  await prisma.task.updateMany({
    where: { module: name, productId },
    data: { module: null }
  });

  await prisma.module.delete({ where: { productId_name: { productId, name } } });
  await createAdminAudit({
    actorId: auth.session.user.id,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} deleted module ${name}.`
  });
  return NextResponse.json({ success: true });
}
