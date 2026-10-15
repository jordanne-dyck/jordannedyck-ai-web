import { NextRequest, NextResponse } from 'next/server';
import { isMonitorRequest } from '@/lib/monitor';
import { getEvalCandidates } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// GET /api/admin/eval-candidates?days=N with x-monitor-token.
// Real visitor turns that went wrong in the last N days (default 30, at most
// 180, the retention window), grouped by question. Read by
// scripts/eval-candidates.mjs. Answers come from whichever database this
// deployment points at. Stored text is already redacted (emails and phone numbers).
export async function GET(req: NextRequest) {
  if (!isMonitorRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const raw = Number(req.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 180) : 30;

  const candidates = await getEvalCandidates(days);
  return NextResponse.json(
    { days, generatedAt: new Date().toISOString(), candidates },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
