import { NextResponse } from 'next/server';
import { runSitIntake } from '../../../../lib/sitIntake';

export async function GET(req: Request) {
  // Auth: require CRON_SECRET — hard fail if the var is missing (prevents open cron trigger)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = await runSitIntake();
  return NextResponse.json({ ok: true, processed: summary.results.length, ...summary });
}
