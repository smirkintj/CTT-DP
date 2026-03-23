import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { badRequest, forbidden, unauthorized } from '@/lib/apiError';
import { createAdminAudit } from '@/lib/adminAudit';
import { adminCanAccessProduct, getAdminProductScope } from '@/lib/adminAccess';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: unauthorized('Unauthorized', 'AUTH_REQUIRED') };
  if (session.user.role !== 'ADMIN') return { error: forbidden('Forbidden', 'ADMIN_REQUIRED') };
  return { session };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const scope = await getAdminProductScope(auth.session.user.id);

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(scope.restricted ? { id: { in: scope.productIds } } : {})
    },
    orderBy: { name: 'asc' }
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.toString().trim();

  if (!name) return badRequest('Product name is required', 'PRODUCT_NAME_REQUIRED');

  const slugBase = slugify(name);
  if (!slugBase) return badRequest('Product name is invalid', 'PRODUCT_NAME_INVALID');

  let slug = slugBase;
  let counter = 2;
  while (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${slugBase}-${counter}`;
    counter += 1;
  }

  const product = await prisma.product.create({
    data: { name, slug, isActive: true }
  });

  await createAdminAudit({
    actorId: auth.session.user.id,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} created product ${product.name}.`
  });

  return NextResponse.json(product);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const productId = body?.productId?.toString().trim();
  if (!productId) return badRequest('Product is required', 'PRODUCT_REQUIRED');
  if (!(await adminCanAccessProduct(auth.session.user.id, productId))) {
    return forbidden('Forbidden', 'ADMIN_PRODUCT_FORBIDDEN');
  }

  const tasksCount = await prisma.task.count({ where: { productId } });
  if (tasksCount > 0) {
    return NextResponse.json({ error: 'Cannot delete product that is already used by tasks.' }, { status: 400 });
  }

  await prisma.product.delete({ where: { id: productId } });
  await createAdminAudit({
    actorId: auth.session.user.id,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} deleted a product.`,
    metadata: { productId }
  });

  return NextResponse.json({ success: true });
}
