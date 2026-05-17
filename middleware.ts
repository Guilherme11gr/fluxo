import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/auth',
  '/reset-password',
  '/shared',
  '/invite',
  '/experiment',
  '/api/auth',
  '/api/subscriptions/status',
];

const SKIP_PATHS = [
  '/checkout',
  '/_next',
  '/favicon',
  '/icon',
  '/api',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function shouldSkip(pathname: string): boolean {
  return SKIP_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldSkip(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has('better-auth.session_token')
    || request.cookies.has('better-auth.session_token_v2')
    || request.cookies.has('__Secure-better-auth.session_token');

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
