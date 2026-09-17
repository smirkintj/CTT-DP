import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit } from './lib/apiRateLimit';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Rate limiting for API routes
  if (req.nextUrl.pathname.startsWith('/api/') &&
      !req.nextUrl.pathname.startsWith('/api/auth/')) {
    // Key on the signed-in user where we have one. Keying on IP alone meant a
    // whole office behind a single NAT egress shared one budget, so colleagues
    // rate-limited each other; anonymous traffic still falls back to IP.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const identity = token?.sub ? `user:${token.sub}` : `ip:${ip}`;
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    // Defaults suit a person clicking around; automated suites need headroom,
    // so they are overridable rather than hard-coded.
    const readLimit = Number(process.env.API_RATE_LIMIT_READ) || 120;
    const writeLimit = Number(process.env.API_RATE_LIMIT_WRITE) || 30;
    const limit = isWrite ? writeLimit : readLimit;
    const { allowed, remaining, resetInMs } = checkRateLimit(`${identity}:${isWrite ? 'w' : 'r'}`, limit);

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
