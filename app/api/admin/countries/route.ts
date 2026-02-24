import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (session.user.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const countries = await prisma.country.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' }
  });

  return NextResponse.json(
    countries.map((country) => ({
      code: country.code,
      name: country.name,
      color: 'bg-slate-100 text-slate-600'
    }))
  );
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const code = body?.code?.toString().trim().toUpperCase();
  const name = body?.name?.toString().trim();

  if (!code || !name) {
    return NextResponse.json({ error: 'Code and name are required' }, { status: 400 });
  }

  const country = await prisma.country.upsert({
    where: { code },
    update: {
      name,
      isActive: true
    },
    create: {
      code,
      name,
      isActive: true
    }
  });

  return NextResponse.json({
    code: country.code,
    name: country.name,
    color: 'bg-slate-100 text-slate-600'
  });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const code = body?.code?.toString().trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  const tasksCount = await prisma.task.count({ where: { countryCode: code } });
  if (tasksCount > 0) {
    return NextResponse.json(
      { error: 'Cannot delete country with existing tasks. Deactivate it in DB if needed.' },
      { status: 400 }
    );
  }

  await prisma.country.delete({ where: { code } });
  return NextResponse.json({ success: true });
}

