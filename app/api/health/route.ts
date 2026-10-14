import { NextRequest, NextResponse } from 'next/server';
import { isMonitorRequest } from '@/lib/monitor';
import { checkHealth } from '@/lib/health';
import { getAnomalyFlags, getMonitorStats, getLabelCounts24h, getQuality24h } from '@/lib/queries';

export const dynamic = 'force-dynamic';

// Public: GET /api/health -> {ok, db, openai, backend}
// Monitor:  GET /api/health?deep=1 with x-monitor-token -> adds anomalies, rates,
// label counts and answer quality over the last 24 hours.
export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('deep') === '1';
  if (deep && !isMonitorRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const health = await checkHealth();

  // Always 200 so Checkly can read the body and assert on each field; `ok`
  // is the single summary flag.
  const body: Record<string, unknown> = { ...health };

  if (deep && health.db) {
    const [anomalies, stats, labels24h, quality24h] = await Promise.all([
      getAnomalyFlags(),
      getMonitorStats(),
      getLabelCounts24h(),
      getQuality24h(),
    ]);
    body.anomalies = anomalies;
    body.stats = stats;
    body.labels24h = labels24h;
    body.quality24h = quality24h;
  }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
