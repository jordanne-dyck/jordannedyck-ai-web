// Server helpers for /api/visit (traffic dashboard, 2026-11-16). Kept apart from
// the route so the parsing can be checked without a request.

export const OWNER_COOKIE = 'jb_owner';

// Pages the dashboard reports on. Anything else is stored as '/other';
// admin pages are not recorded at all.
const PAGES = ['/', '/about', '/dashboard'] as const;
export type TrackedPage = (typeof PAGES)[number] | '/other';

export function normalizePath(raw: unknown): TrackedPage | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/dashboard/admin' || path.startsWith('/dashboard/admin/')) return null;
  return (PAGES as readonly string[]).includes(path) ? (path as TrackedPage) : '/other';
}

// Known crawlers, link-preview fetchers and headless browsers (Checkly, Playwright).
const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headlesschrome|lighthouse|checkly|playwright|puppeteer|phantomjs|python-requests|curl|wget/i;

export function isBotAgent(ua: string | null): boolean {
  return !ua || BOT_UA.test(ua);
}

export function deviceOf(ua: string | null): 'mobile' | 'desktop' {
  return ua && /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
}

// Host of the referring page, without www. Same-site referrers count as none.
export function referrerHost(raw: unknown, ownHost: string | null): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    const own = (ownHost ?? '').toLowerCase().split(':')[0].replace(/^www\./, '');
    if (!host || host === own) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

const UTM_VALUE = /^[\w. -]{1,60}$/;

export function utmFrom(raw: unknown): { source: string | null; medium: string | null; campaign: string | null } {
  const empty = { source: null, medium: null, campaign: null };
  if (typeof raw !== 'string' || !raw.startsWith('?')) return empty;
  const q = new URLSearchParams(raw);
  const pick = (k: string) => {
    const v = q.get(k)?.trim().toLowerCase() ?? '';
    return UTM_VALUE.test(v) ? v : null;
  };
  return { source: pick('utm_source'), medium: pick('utm_medium'), campaign: pick('utm_campaign') };
}

// The lib/analytics.ts events the dashboard counts, with the props kept for each.
export const SITE_EVENTS: Record<string, readonly string[]> = {
  hero_ask_clicked: [],
  chip_clicked: ['index'],
  message_sent: ['source'],
  project_opened: ['slug', 'from'],
  timeline_shown: ['explicit'],
  story_shown: ['from', 'replay'],
  concierge_opened: ['trigger', 'from'],
  brief_sent: ['channel', 'edited'],
  contact_clicked: ['where', 'channel'],
  feedback: ['vote'],
  answer_copied: [],
  stream_abandoned: [],
};

export function cleanProps(name: string, raw: unknown): Record<string, string | number | boolean> {
  const keep = SITE_EVENTS[name] ?? [];
  const out: Record<string, string | number | boolean> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of keep) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
    else if (typeof v === 'string' && /^[\w-]{1,40}$/.test(v)) out[k] = v;
  }
  return out;
}

export const isViewId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,40}$/.test(v);

// At most this many beacons per visitor per minute, per web pod.
const LIMIT_PER_MINUTE = 120;
const hits = new Map<string, { minute: number; n: number }>();

export function overLimit(visitorId: string, now = Date.now()): boolean {
  const minute = Math.floor(now / 60_000);
  const h = hits.get(visitorId);
  if (!h || h.minute !== minute) {
    if (hits.size > 10_000) hits.clear();
    hits.set(visitorId, { minute, n: 1 });
    return false;
  }
  h.n++;
  return h.n > LIMIT_PER_MINUTE;
}
