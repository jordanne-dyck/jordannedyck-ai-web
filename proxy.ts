import { NextResponse, type NextRequest } from 'next/server';

// Node2Shell (CVE-2026-111497): the Brotli decoder bundled with Node.js
// before 24.22.1 has an out-of-bounds write reachable from a crafted
// compressed stream. The base image (ubi9/nodejs-24) still ships 24.21.0.
// No browser sends a Brotli-compressed request body, so refuse them before
// any route reads one. Remove once the image runs a fixed Node.
export function proxy(request: NextRequest) {
  const encoding = request.headers.get('content-encoding');
  if (encoding && /(^|,)\s*br\s*(,|$)/i.test(encoding)) {
    return new NextResponse('Unsupported Content-Encoding', { status: 415 });
  }
  return NextResponse.next();
}

export const config = {
  // Static build assets are read-only GETs; everything else is checked.
  matcher: '/((?!_next/static).*)',
};
