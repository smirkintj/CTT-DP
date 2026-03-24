import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { chatWithAssistant } from '../../../../lib/assistant';
import { badRequest, internalError, unauthorized } from '../../../../lib/apiError';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  const body = await req.json().catch(() => null);
  const message = body?.message?.toString().trim();
  const history = Array.isArray(body?.history)
    ? body.history
        .filter((item: unknown) => typeof item === 'object' && item !== null)
        .map((item: any) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: item.content?.toString?.() ?? ''
        }))
        .filter((item: { content: string }) => item.content.trim().length > 0)
    : [];

  if (!message) {
    return badRequest('Message is required', 'ASSISTANT_MESSAGE_REQUIRED');
  }

  try {
    const result = await chatWithAssistant({
      user: {
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        role: session.user.role === 'ADMIN' ? 'ADMIN' : 'STAKEHOLDER',
        countryCode: session.user.countryCode ?? null
      },
      message,
      history
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('POST /api/assistant/chat failed:', error);
    }
    return internalError('Assistant is unavailable right now', 'ASSISTANT_CHAT_FAILED');
  }
}
