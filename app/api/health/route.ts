import { NextRequest, NextResponse } from 'next/server';
import { isMonitorRequest } from '@/lib/monitor';
import { checkHealth } from '@/lib/health';
import { getAnomalyFlags, getMonitorStats, getLabelCounts24h, getQuality24h } from '@/lib/queries';
import { PROMPT_VERSION } from '@/lib/prompt-version';

export const dynamic = 'force-dynamic';

// Public: GET /api/health -> {ok, db, openai, backend, prompt_version}
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
  // prompt_version: the id on every chat_events row, so an eval run against
  // this deployment records which prompt it was served (release gate).
  const body: Record<string, unknown> = { ...health, prompt_version: PROMPT_VERSION };

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
