import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  let dbOk = false;
  let dbError: string | undefined;
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    dbOk = true;
  } catch (error) {
    dbError = error instanceof Error ? error.message : 'DB check failed';
  }

  const authConfigured = Boolean(process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_URL);
  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const checksOk = dbOk && authConfigured && databaseConfigured;

  const payload = {
    status: checksOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      database: dbOk ? 'ok' : 'fail',
      authConfig: authConfigured ? 'ok' : 'fail',
      emailConfig: emailConfigured ? 'ok' : 'warn',
      databaseConfig: databaseConfigured ? 'ok' : 'fail'
    },
    queryTimeMs: Date.now() - startedAt,
    ...(process.env.NODE_ENV !== 'production' && dbError ? { detail: dbError } : {})
  };

  return NextResponse.json(payload, {
    status: checksOk ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
