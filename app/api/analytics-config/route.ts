import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// PostHog settings for the browser, read at request time. The image is built
// once by Shipwright and promoted unchanged from :dev to prod, so a
// NEXT_PUBLIC_ variable baked in at build time could not differ between the
// two namespaces. With POSTHOG_PROJECT_TOKEN unset the client gets no token and
// PostHog never loads. The project token is public by design; it can only send
// events, not read them.
export function GET() {
  const token = process.env.POSTHOG_PROJECT_TOKEN || null;
  // The project is in the EU region (checked 2026-10-14); k8s sets this explicitly.
  const host = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
  return NextResponse.json(token ? { token, host } : { token: null });
}
