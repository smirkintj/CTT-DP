import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit } from './lib/apiRateLimit';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate limiting for API routes
  if (req.nextUrl.pathname.startsWith('/api/') &&
      !req.nextUrl.pathname.startsWith('/api/auth/')) {
    // Prefer x-real-ip (set by Vercel edge, not overrideable by clients) over
    // x-forwarded-for which clients can prepend arbitrary values to.
    const ip = req.headers.get('x-real-ip')?.trim()
            || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
            || 'unknown';
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

  // Server-side mustChangePassword enforcement — block all access except the
  // password-change endpoint itself so the gate can't be bypassed via API calls.
  if (token?.mustChangePassword) {
    const isChangePasswordApi = pathname === '/api/users/change-password';
    const isAuthApi = pathname.startsWith('/api/auth/');
    if (pathname.startsWith('/api/') && !isChangePasswordApi && !isAuthApi) {
      return new NextResponse(
        JSON.stringify({ error: 'Password change required', code: 'MUST_CHANGE_PASSWORD' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

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
