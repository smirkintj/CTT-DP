import prisma from './prisma';

export type AdminProductScope = {
  restricted: boolean;
  productIds: string[];
};

export async function getAdminProductScope(userId: string, role?: string): Promise<AdminProductScope> {
  // Short-circuit for ADMIN — no DB query needed
  if (role === 'ADMIN') return { restricted: false, productIds: [] };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      productAccesses: { select: { productId: true } }
    }
  });

  // Admins are never restricted — they can access all products
  if (!user || user.role === 'ADMIN') {
    return { restricted: false, productIds: [] };
  }

  const productIds = user.productAccesses.map((a) => a.productId);
  return {
    restricted: productIds.length > 0,
    productIds
  };
}

export async function adminCanAccessProduct(userId: string, productId: string | null | undefined): Promise<boolean> {
  if (!productId) return false;
  const scope = await getAdminProductScope(userId);
  if (!scope.restricted) return true;
  return scope.productIds.includes(productId);
}
