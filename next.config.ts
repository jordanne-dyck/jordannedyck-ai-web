import type { NextConfig } from "next";
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newestWebEvidence, summarizeEvidence } from './lib/release-gate';

// The latest frontend release's gate result, fixed into the build for the
// build story (lib/release-gate.ts). Empty when there is none to read.
function releaseGate(): string {
  try {
    const dir = join(process.cwd(), 'releases');
    const file = newestWebEvidence(readdirSync(dir));
    if (!file) return '';
    const summary = summarizeEvidence(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    return summary ? JSON.stringify(summary) : '';
  } catch {
    return '';
  }
}

// No script-src CSP yet: Next.js inline scripts need a tested policy first.
// frame-ancestors alone does not touch scripts.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  poweredByHeader: false,
  env: { RELEASE_GATE: releaseGate() },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
