import { NextRequest, NextResponse } from 'next/server';
import { isMonitorRequest } from '@/lib/monitor';
import { checkHealth } from '@/lib/health';
import { getLeadPipelineStats } from '@/lib/lead-store';
import { getAnomalyFlags, getMonitorStats, getLabelCounts24h, getQuality24h } from '@/lib/queries';
import { PROMPT_VERSION } from '@/lib/prompt-version';

export const dynamic = 'force-dynamic';

// Public: GET /api/health -> {ok, db, openai, backend, prompt_version, release}
// Monitor:  GET /api/health?deep=1 with x-monitor-token -> adds anomalies, rates,
// label counts and answer quality over the last 24 hours, and the lead
// pipeline (`leads`) where the lead form is on.
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
  // release: the image tag, baked in by the BuildRun's RELEASE build arg
  // ("dev" without one). The prod-smoke Action waits for it to show the new tag.
  const body: Record<string, unknown> = {
    ...health,
    prompt_version: PROMPT_VERSION,
    release: process.env.RELEASE || null,
  };

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
    // The lead pipeline (lib/notify.ts), only where the form is on: prod has
    // no leads table until its migration runs. Null if the query fails, so a
    // missing column can't take the rest of the deep view down.
    if (process.env.LEADS_ENABLED === '1') {
      body.leads = await getLeadPipelineStats().catch(() => null);
    }
  }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
