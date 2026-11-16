'use client';

// Page views and counted clicks for the traffic dashboard (2026-11-16), sent to
// /api/visit. First-party, so the visitor counts come from the same server as
// the chat counts and the "% who used the bot" ratio holds up when an ad
// blocker stops PostHog. Only the path, the referring host, utm tags, visible
// time and event names leave the browser; never page text or what was typed.

let viewId: string | null = null;
let path = '/';
let visibleSince: number | null = null;
let visibleMs = 0;

const isAdmin = (p: string) => p === '/dashboard/admin' || p.startsWith('/dashboard/admin/');

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function send(body: Record<string, unknown>, beacon = false): void {
  try {
    const data = JSON.stringify(body);
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/visit', new Blob([data], { type: 'application/json' }));
      return;
    }
    void fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never touch the page.
  }
}

function engagedMs(): number {
  return visibleMs + (visibleSince != null ? Date.now() - visibleSince : 0);
}

// The tab is hiding or closing: report visible time so far. Sent again on each
// hide; the server keeps the largest.
export function flushView(): void {
  if (!viewId) return;
  send({ t: 'leave', v: viewId, ms: engagedMs() }, true);
}

export function visibilityChanged(): void {
  if (document.visibilityState === 'hidden') {
    if (visibleSince != null) visibleMs += Date.now() - visibleSince;
    visibleSince = null;
    flushView();
  } else if (visibleSince == null) {
    visibleSince = Date.now();
  }
}

// A new page: close the old view, open a new one.
export function startView(nextPath: string): void {
  flushView();
  path = nextPath;
  if (isAdmin(nextPath)) {
    viewId = null;
    return;
  }
  viewId = newId();
  visibleMs = 0;
  visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  send({ t: 'view', v: viewId, p: nextPath, r: document.referrer || null, q: location.search || null });
}

// A lib/analytics.ts event the dashboard counts. Props are filtered again on the
// server (lib/visit.ts SITE_EVENTS).
export function siteEvent(name: string, props: object, beacon = false): void {
  if (!viewId) return;
  send({ t: 'event', v: viewId, p: path, n: name, props }, beacon);
}
