'use client';

import posthog from 'posthog-js';

// Client-side friction events (site-monitoring plan, Phase 2, decided
// 2026-10-14). PostHog holds behaviour, never conversation text: autocapture
// is off, autocapture text is masked, and the chat log carries the `ph-mask`
// class so session replay shows the layout without the words. The join to
// chat_events is client_id, set from posthog.get_distinct_id().

let ready = false;
let started = false;

export async function initAnalytics(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const res = await fetch('/api/analytics-config', { cache: 'no-store' });
    const cfg = (await res.json()) as { token: string | null; host?: string };
    if (!cfg.token) return;
    posthog.init(cfg.token, {
      api_host: cfg.host,
      defaults: '2026-05-30',
      person_profiles: 'identified_only',
      autocapture: false,
      mask_all_text: true,
      disable_surveys: true,
      session_recording: { maskAllInputs: true },
    });
    ready = true;
  } catch {
    // Analytics is optional; a failure here must never touch the chat.
  }
}

export type AnalyticsEvent =
  | { name: 'chip_clicked'; props: { index: number; text: string } }
  | { name: 'message_sent'; props: { source: 'chip' | 'typed' } }
  | { name: 'stream_completed'; props: { ms_elapsed: number } }
  | { name: 'stream_abandoned'; props: { ms_elapsed: number } }
  | { name: 'answer_copied'; props: Record<string, never> }
  | { name: 'feedback'; props: { vote: 'up' | 'down'; has_note: boolean } };

// `beacon` for events sent while the page is closing, when a normal request
// would be cancelled.
export function track(event: AnalyticsEvent, opts: { beacon?: boolean } = {}): void {
  if (!ready) return;
  posthog.capture(event.name, event.props, opts.beacon ? { transport: 'sendBeacon' } : undefined);
}

// PostHog's anonymous id for this browser, or null when PostHog is not loaded.
export function clientId(): string | null {
  if (!ready) return null;
  return posthog.get_distinct_id() ?? null;
}
