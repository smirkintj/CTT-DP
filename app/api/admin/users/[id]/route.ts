import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/apiError';
import { createAdminAudit } from '@/lib/adminAudit';

type UpdateUserBody = {
  name?: string;
  countryCode?: string | null;
  isActive?: boolean;
  role?: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  let body: UpdateUserBody;
  try {
    body = (await req.json()) as UpdateUserBody;
  } catch {
    return badRequest('Invalid payload', 'INVALID_JSON');
  }

  const { id: userId } = await params;
  const name = body.name?.trim();
  const countryCode = body.countryCode?.trim().toUpperCase();
  const requestedRole = body.role?.trim().toUpperCase();
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : undefined;

  if (!userId) return badRequest('User id is required', 'USER_ID_REQUIRED');

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    if (!targetUser) return notFound('User not found', 'USER_NOT_FOUND');

    if (targetUser.id === session.user.id && isActive === false) {
      return badRequest('You cannot disable your own account', 'SELF_DISABLE_BLOCKED');
    }

    if (requestedRole === UserRole.ADMIN && targetUser.role !== UserRole.ADMIN) {
      return forbidden('Creating admin users is disabled', 'ADMIN_CREATE_DISABLED');
    }

    const nextRole = requestedRole === UserRole.ADMIN ? UserRole.ADMIN : UserRole.STAKEHOLDER;
    const updates: { name?: string; countryCode?: string | null; isActive?: boolean; role?: UserRole } = {};

    if (name !== undefined) {
      if (!name) return badRequest('Name cannot be empty', 'NAME_REQUIRED');
      updates.name = name;
    }
    if (countryCode !== undefined) {
      if (nextRole === UserRole.STAKEHOLDER && !countryCode) {
        return badRequest('Country is required for stakeholders', 'COUNTRY_REQUIRED');
      }
      if (countryCode) {
        const countryExists = await prisma.country.findUnique({
          where: { code: countryCode },
          select: { code: true }
        });
        if (!countryExists) return badRequest('Country does not exist', 'COUNTRY_INVALID');
        updates.countryCode = countryCode;
      } else {
        updates.countryCode = null;
      }
    }
    if (isActive !== undefined) updates.isActive = isActive;
    if (requestedRole !== undefined) updates.role = nextRole;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updates
    });

    await createAdminAudit({
      actorId: session.user.id,
      message: `Admin updated user ${updated.email}.`,
      countryCode: updated.countryCode,
      metadata: { action: 'USER_UPDATED', userId: updated.id, updates }
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      countryCode: updated.countryCode,
      isActive: updated.isActive,
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    return internalError('Failed to update user', 'USER_UPDATE_FAILED', String(error));
  }
}
