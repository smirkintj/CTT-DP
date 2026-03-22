import prisma from './prisma';

export type AdminProductScope = {
  restricted: boolean;
  productIds: string[];
};

export async function getAdminProductScope(userId: string): Promise<AdminProductScope> {
  const accesses = await prisma.userProductAccess.findMany({
    where: { userId },
    select: { productId: true }
  });

  const productIds = accesses.map((access) => access.productId);
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
