import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runSitIntake } from '@/lib/sitIntake';
import { createAdminAudit } from '@/lib/adminAudit';

/**
 * Run the SIT intake on demand. Same work as the daily cron — the cron is a
 * once-a-day loop, which is too slow to confirm a Jira or workbook change
 * actually produces a draft.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const summary = await runSitIntake();

    await createAdminAudit({
      actorId: session.user.id,
      message: `${session.user.name || session.user.email || 'Admin'} ran SIT intake manually — ${summary.created} draft(s) created from ${summary.issuesSeen} Jira issue(s).`,
      metadata: {
        productsScanned: summary.productsScanned,
        issuesSeen: summary.issuesSeen,
        created: summary.created
      }
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[admin/sit-intake/run] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'SIT intake failed' },
      { status: 500 }
    );
  }
}
