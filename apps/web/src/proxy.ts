import { type NextRequest, NextResponse } from 'next/server';

// Next.js 16: proxy.ts replaces middleware.ts; export must be named `proxy`
export function proxy(request: NextRequest): NextResponse {
  // Session refresh and route protection added in Phase 3 (Auth)
  void request;
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
