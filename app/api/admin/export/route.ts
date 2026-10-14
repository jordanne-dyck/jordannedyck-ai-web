import { NextRequest, NextResponse } from 'next/server';
import { isMonitorRequest } from '@/lib/monitor';
import { getExport } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// GET /api/admin/export?since=ISO with x-monitor-token.
// Real traffic since `since` (default 7 days, at most 31), grouped by session,
// then by conversation, in order. Read by the weekly /convo-review command.
// Stored text is already redacted (emails and phone numbers).
export async function GET(req: NextRequest) {
  if (!isMonitorRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const raw = req.nextUrl.searchParams.get('since');
  const parsed = raw ? new Date(raw) : null;
  const floor = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const since =
    parsed && !Number.isNaN(parsed.getTime())
      ? new Date(Math.max(parsed.getTime(), floor))
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const sessions = await getExport(since);
  return NextResponse.json(
    { since: since.toISOString(), generatedAt: new Date().toISOString(), sessions },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
