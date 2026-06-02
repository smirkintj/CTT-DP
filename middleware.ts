import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit } from './lib/apiRateLimit';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate limiting for API routes
  if (req.nextUrl.pathname.startsWith('/api/') &&
      !req.nextUrl.pathname.startsWith('/api/auth/')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const limit = isWrite ? 30 : 120;
    const { allowed, remaining, resetInMs } = checkRateLimit(`${ip}:${isWrite ? 'w' : 'r'}`, limit);

    if (!allowed) {
      return new NextResponse(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(Math.ceil(resetInMs / 1000)),
        },
      });
    }
    void remaining;
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const isAdminRoute = pathname.startsWith('/admin') || pathname === '/import';
  const isTaskRoute = pathname.startsWith('/tasks');
  const isInboxRoute = pathname.startsWith('/inbox');
  const isKnowledgeBaseRoute = pathname.startsWith('/knowledge-base');
  const isQaRoute = pathname.startsWith('/qa');

  if (isAdminRoute) {
    if (!token || token.role !== 'ADMIN') {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  if (isTaskRoute || isInboxRoute || isKnowledgeBaseRoute) {
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  if (isQaRoute) {
    if (!token || token.role !== 'QA') {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/import', '/tasks/:path*', '/inbox', '/knowledge-base', '/qa/:path*', '/api/:path*']
};
