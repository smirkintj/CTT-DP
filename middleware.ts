import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const isAdminRoute = pathname.startsWith('/admin') || pathname === '/import';
  const isTaskRoute = pathname.startsWith('/tasks');
  const isInboxRoute = pathname.startsWith('/inbox');
  const isKnowledgeBaseRoute = pathname.startsWith('/knowledge-base');

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/import', '/tasks/:path*', '/inbox', '/knowledge-base']
};
