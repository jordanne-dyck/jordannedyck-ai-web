import { pool } from './db';
import { buildTrafficReport, type TrafficReport } from './traffic-report';

const LIMIT = 100_000;

// The traffic report for /dashboard/admin/traffic: two windows of rows, from
// (now - 2 * days), passed to lib/traffic-report.ts. Bots and Jordanne's own
// browsers are left out of page views and clicks; her chats are left out by
// visitor id. Returns an error message when page_views doesn't exist yet (before the
// migration) or the database fails, so the page can say so.
export async function getTrafficReport(days: number): Promise<{ report: TrafficReport } | { error: string }> {
  const since = `NOW() - INTERVAL '${days * 2} days'`;
  try {
    const [views, events, owners, firstSeen, chats, leads] = await Promise.all([
      pool.query<{ at: Date; view_id: string; visitor_id: string; path: string; referrer_host: string | null; utm_source: string | null; device: string | null; engaged_ms: number | null }>(
        `SELECT created_at AS at, view_id, visitor_id, path, referrer_host, utm_source, device, engaged_ms
           FROM page_views
          WHERE created_at >= ${since} AND is_bot = FALSE AND is_owner = FALSE
          ORDER BY created_at LIMIT ${LIMIT}`,
      ),
      pool.query<{ at: Date; visitor_id: string; name: string; props: Record<string, unknown> }>(
        `SELECT created_at AS at, visitor_id, name, props
           FROM site_events
          WHERE created_at >= ${since} AND is_bot = FALSE AND is_owner = FALSE
          ORDER BY created_at LIMIT ${LIMIT}`,
      ),
      pool.query<{ visitor_id: string }>(
        `SELECT DISTINCT visitor_id FROM page_views WHERE is_owner = TRUE`,
      ),
      pool.query<{ visitor_id: string; first: Date }>(
        `SELECT visitor_id, MIN(created_at) AS first
           FROM page_views
          WHERE is_bot = FALSE
          GROUP BY visitor_id
         HAVING MAX(created_at) >= ${since}`,
      ),
      pool.query<{ at: Date; session_id: string; turn_index: number | null; query: string; rate_limited: boolean; story: boolean; timeline: boolean; project_card: boolean; vote: string | null }>(
        `SELECT created_at AS at, session_id, turn_index, query, rate_limited,
                flags ? 'story' AS story, flags ? 'timeline' AS timeline,
                flags ? 'project_card' AS project_card, flags->'feedback'->>'vote' AS vote
           FROM chat_events
          WHERE created_at >= ${since} AND is_synthetic = FALSE
          ORDER BY created_at LIMIT ${LIMIT}`,
      ),
      pool.query<{ at: Date; session_id: string | null }>(
        `SELECT created_at AS at, session_id FROM leads
          WHERE created_at >= ${since} AND is_synthetic = FALSE`,
      ),
    ]);
    const owner = new Set(owners.rows.map((r) => r.visitor_id));
    const report = buildTrafficReport({
      days,
      now: Date.now(),
      views: views.rows.map((r) => ({
        at: r.at.getTime(), viewId: r.view_id, visitor: r.visitor_id, path: r.path,
        referrer: r.referrer_host, utmSource: r.utm_source, device: r.device ?? 'desktop', engagedMs: r.engaged_ms,
      })),
      events: events.rows.map((r) => ({ at: r.at.getTime(), visitor: r.visitor_id, name: r.name, props: r.props ?? {} })),
      chats: chats.rows
        .filter((r) => !owner.has(r.session_id))
        .map((r) => ({
          at: r.at.getTime(), session: r.session_id, turnIndex: r.turn_index, query: r.query, rateLimited: r.rate_limited,
          story: r.story, timeline: r.timeline, projectCard: r.project_card,
          vote: r.vote === 'up' || r.vote === 'down' ? r.vote : null,
        })),
      leads: leads.rows
        .filter((r) => !r.session_id || !owner.has(r.session_id))
        .map((r) => ({ at: r.at.getTime(), session: r.session_id })),
      firstSeen: Object.fromEntries(firstSeen.rows.map((r) => [r.visitor_id, r.first.getTime()])),
    });
    return { report };
  } catch (err) {
    const msg = (err as Error).message ?? 'unknown';
    console.error('traffic report failed:', msg);
    return {
      error: /page_views|site_events|session_id/.test(msg)
        ? 'The traffic tables are not in this database yet. Run the schema migration (k8s/postgres/README.md).'
        : 'The traffic query failed. Check the web pod logs.',
    };
  }
}
