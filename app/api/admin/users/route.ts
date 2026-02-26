import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { badRequest, conflict, forbidden, internalError, unauthorized } from '@/lib/apiError';
import { createAdminAudit } from '@/lib/adminAudit';

type CreateUserBody = {
  name?: string;
  email?: string;
  countryCode?: string;
  role?: string;
  temporaryPassword?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRole(role?: string): UserRole {
  if (role?.toUpperCase() === 'ADMIN') return UserRole.ADMIN;
  return UserRole.STAKEHOLDER;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  try {
    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: { assignedTasks: true }
        }
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }]
    });

    return NextResponse.json(
      users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        countryCode: user.countryCode,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        assignedTaskCount: user._count.assignedTasks
      }))
    );
  } catch (error) {
    return internalError('Failed to load users', 'USERS_FETCH_FAILED', String(error));
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  let body: CreateUserBody;
  try {
    body = (await req.json()) as CreateUserBody;
  } catch {
    return badRequest('Invalid payload', 'INVALID_JSON');
  }

  const name = body.name?.trim() || '';
  const email = body.email?.trim().toLowerCase() || '';
  const countryCode = body.countryCode?.trim().toUpperCase() || '';
  const role = normalizeRole(body.role);
  const temporaryPassword = body.temporaryPassword?.trim() || '';

  if (!name) return badRequest('Name is required', 'NAME_REQUIRED');
  if (!EMAIL_REGEX.test(email)) return badRequest('Valid email is required', 'EMAIL_INVALID');
  if (role === UserRole.ADMIN) return forbidden('Creating admin users is disabled', 'ADMIN_CREATE_DISABLED');
  if (!countryCode) return badRequest('Country is required for stakeholders', 'COUNTRY_REQUIRED');
  if (temporaryPassword.length < 8) return badRequest('Temporary password must be at least 8 characters', 'PASSWORD_TOO_SHORT');

  try {
    const countryExists = await prisma.country.findUnique({
      where: { code: countryCode },
      select: { code: true }
    });
    if (!countryExists) return badRequest('Country does not exist', 'COUNTRY_INVALID');

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });
    if (existing) return conflict('Email already exists', 'EMAIL_EXISTS');

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        role,
        countryCode,
        isActive: true,
        mustChangePassword: true,
        passwordHash
      }
    });

    await createAdminAudit({
      actorId: session.user.id,
      message: `Admin created stakeholder user ${created.email} (${created.countryCode || 'N/A'}).`,
      countryCode: created.countryCode,
      metadata: { action: 'USER_CREATED', userId: created.id }
    });

    return NextResponse.json({
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      countryCode: created.countryCode,
      isActive: created.isActive,
      lastLoginAt: created.lastLoginAt,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      assignedTaskCount: 0
    });
  } catch (error) {
    return internalError('Failed to create user', 'USER_CREATE_FAILED', String(error));
  }
}
