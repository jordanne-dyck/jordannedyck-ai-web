import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getOrCreateSessionId } from '@/lib/session';
import { isMonitorRequest } from '@/lib/monitor';
import {
  OWNER_COOKIE, SITE_EVENTS, cleanProps, deviceOf, isBotAgent, isViewId,
  normalizePath, overLimit, referrerHost, utmFrom,
} from '@/lib/visit';

export const dynamic = 'force-dynamic';

const MAX_ENGAGED_MS = 30 * 60 * 1000;
const done = () => new NextResponse(null, { status: 204 });

// POST /api/visit: page views and clicks for the traffic dashboard, sent by
// app/components/SiteBeacon.tsx. Three kinds:
//   {t:'view', v, p, r, q}       a page view: view id, path, referrer, ?query
//   {t:'leave', v, ms}           visible time on that view, sent as the tab hides
//   {t:'event', v, p, n, props}  a lib/analytics.ts event the dashboard counts
// Always answers 204, including on a database error: analytics must never
// surface to a visitor. Before the page_views migration has run, writes fail
// and are dropped, so this is safe to ship ahead of the schema change.
export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL || isMonitorRequest(req)) return done();
  const text = await req.text().catch(() => '');
  if (!text || text.length > 2000) return done();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return done();
  }
  if (!body || typeof body !== 'object' || !isViewId(body.v)) return done();

  // The chat's own visitor cookie, so a visit joins chat_events.session_id.
  const { sessionId: visitorId } = await getOrCreateSessionId();
  if (overLimit(visitorId)) return done();
  const ua = req.headers.get('user-agent');
  const isBot = isBotAgent(ua);
  const isOwner = (await cookies()).get(OWNER_COOKIE)?.value === '1';

  try {
    if (body.t === 'view') {
      const path = normalizePath(body.p);
      if (!path) return done();
      const utm = utmFrom(body.q);
      await pool.query(
        `INSERT INTO page_views (view_id, visitor_id, path, referrer_host, utm_source, utm_medium, utm_campaign, device, is_bot, is_owner)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (view_id) DO NOTHING`,
        [body.v, visitorId, path, referrerHost(body.r, req.headers.get('host')), utm.source, utm.medium, utm.campaign, deviceOf(ua), isBot, isOwner],
      );
    } else if (body.t === 'leave') {
      const ms = typeof body.ms === 'number' && Number.isFinite(body.ms) ? Math.round(body.ms) : null;
      if (ms == null || ms < 0) return done();
      // A view sends this each time its tab hides; keep the largest.
      await pool.query(
        `UPDATE page_views SET engaged_ms = GREATEST(COALESCE(engaged_ms, 0), $3)
          WHERE view_id = $1 AND visitor_id = $2`,
        [body.v, visitorId, Math.min(ms, MAX_ENGAGED_MS)],
      );
    } else if (body.t === 'event') {
      const name = typeof body.n === 'string' && Object.hasOwn(SITE_EVENTS, body.n) ? body.n : null;
      const path = normalizePath(body.p);
      if (!name || !path) return done();
      await pool.query(
        `INSERT INTO site_events (visitor_id, view_id, path, name, props, is_bot, is_owner)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [visitorId, body.v, path, name, JSON.stringify(cleanProps(name, body.props)), isBot, isOwner],
      );
    }
  } catch (err) {
    console.warn('visit beacon dropped:', (err as Error).message);
  }
  return done();
}
