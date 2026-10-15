import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { isMonitorRequest } from '@/lib/monitor';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 1000;
const MAX_THEME_CHARS = 60;

// POST /api/admin/themes {themes: [{id, theme}]} with x-monitor-token.
// Write-back from the weekly /convo-review command (site-monitoring plan,
// Phase 4): the theme the review gave each question, by meaning. Stored in
// flags.theme, not topic_tags: topic_tags[1] is the free KB-category label the
// topic chart reads, and the review compares the two. A later review replaces
// the earlier theme. Synthetic rows are never touched.
export async function POST(req: NextRequest) {
  if (!isMonitorRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { themes?: unknown } | null;
  const list = Array.isArray(body?.themes) ? body.themes : null;
  if (!list || list.length === 0 || list.length > MAX_ROWS) {
    return NextResponse.json({ error: `themes must be 1 to ${MAX_ROWS} entries` }, { status: 400 });
  }

  const ids: string[] = [];
  const themes: string[] = [];
  for (const item of list as { id?: unknown; theme?: unknown }[]) {
    const id = typeof item?.id === 'string' && /^\d{1,18}$/.test(item.id) ? item.id : null;
    const theme = typeof item?.theme === 'string' ? item.theme.trim() : '';
    if (!id || !theme || theme.length > MAX_THEME_CHARS) {
      return NextResponse.json(
        { error: `each entry needs a numeric string id and a theme of 1 to ${MAX_THEME_CHARS} characters` },
        { status: 400 },
      );
    }
    ids.push(id);
    themes.push(theme);
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'no database' }, { status: 503 });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE chat_events c SET flags = c.flags || jsonb_build_object('theme', t.theme)
         FROM unnest($1::BIGINT[], $2::TEXT[]) AS t(id, theme)
        WHERE c.id = t.id AND c.is_synthetic = FALSE`,
      [ids, themes],
    );
    return NextResponse.json({ ok: true, requested: ids.length, updated: rowCount ?? 0 });
  } catch (err) {
    console.error('theme write-back failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
