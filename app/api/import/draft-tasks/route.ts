import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadAiConfig } from '@/lib/aiProvider';
import { draftTaskFromStory, structuredDraft, type DraftedTask } from '@/lib/draftTask';
import type { StoryGroup } from '@/lib/sitWorkbook';

export type { DraftedTask };

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.stories) ? (body.stories as unknown[]) : null;
  if (!raw || raw.length === 0) {
    return NextResponse.json({ error: 'No stories supplied' }, { status: 400 });
  }
  // Validate before use: toDraftTask and buildPrompt both dereference cases,
  // so a malformed payload would throw a 500 instead of reporting a bad request.
  const groups = raw.filter(
    (g): g is StoryGroup =>
      Boolean(g) &&
      typeof (g as StoryGroup).key === 'string' &&
      Array.isArray((g as StoryGroup).cases) &&
      Array.isArray((g as StoryGroup).countries)
  );
  if (groups.length !== raw.length) {
    return NextResponse.json({ error: 'Malformed story payload' }, { status: 400 });
  }
  if (groups.length > 25) {
    return NextResponse.json({ error: 'Too many stories in one request' }, { status: 400 });
  }

  const productName = typeof body.productName === 'string' ? body.productName : undefined;
  const config = await loadAiConfig();
  const aiAvailable = config.provider !== 'none' && Boolean(config.apiKey);
  const label = `${config.provider}:${config.model || 'default'}`;

  // Each story is drafted independently so one bad reply cannot spoil the rest.
  const tasks: DraftedTask[] = await Promise.all(
    groups.map((group) =>
      aiAvailable
        ? draftTaskFromStory(group, { productName })
        : Promise.resolve(structuredDraft(group, 'no provider configured'))
    )
  );

  const failures = tasks.filter((t) => t.generatedBy === 'structured' && t.fallbackReason);

  return NextResponse.json({
    tasks,
    aiAvailable,
    provider: aiAvailable ? label : 'none',
    // One representative reason so the UI can say what actually went wrong.
    fallbackReason: failures[0]?.fallbackReason ?? null,
    fallbackCount: failures.length
  });
}
