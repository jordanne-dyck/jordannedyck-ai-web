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
  | { name: 'message_sent'; props: { source: 'chip' | 'typed' | 'project' } }
  // Project cards: opening one, and asking one of its panel questions.
  | { name: 'project_opened'; props: { slug: string; from: 'card' | 'timeline' } }
  // The career timeline appearing under an answer; `explicit` when asked for.
  | { name: 'timeline_shown'; props: { explicit: boolean } }
  | { name: 'timeline_zoomed'; props: { org: string } }
  // Pause or Skip to end during the clip, and how far in (ms).
  | { name: 'timeline_control'; props: { action: 'pause' | 'skip'; ms: number } }
  | { name: 'project_question_clicked'; props: { slug: string; index: number } }
  | { name: 'stream_completed'; props: { ms_elapsed: number } }
  | { name: 'stream_abandoned'; props: { ms_elapsed: number } }
  | { name: 'answer_copied'; props: Record<string, never> }
  | { name: 'feedback'; props: { vote: 'up' | 'down'; has_note: boolean } }
  // Home page acquisition: the first-screen button, and every route to contact her.
  | { name: 'hero_ask_clicked'; props: Record<string, never> }
  | { name: 'contact_clicked'; props: { where: 'hero' | 'after_answer' | 'footer'; channel: 'email' | 'linkedin' | 'github' | 'phone' } }
  | { name: 'answer_retried'; props: Record<string, never> }
  // The build story (lib/build-story.ts): shown, a stop opened by the visitor,
  // the clip's controls, and its links out. `step` counts from 1.
  | { name: 'story_shown'; props: { explicit: true; from: 'chip' | 'typed' | 'card'; replay: boolean } }
  | { name: 'story_step_opened'; props: { step: number } }
  | { name: 'story_control'; props: { action: 'play' | 'pause' | 'skip'; ms: number } }
  | { name: 'story_link_clicked'; props: { target: 'dashboard' | 'repo_web' | 'repo_ai' | 'email' | 'concierge' } }
  // The concierge pilot (lib/concierge.ts): opening the panel, and why it was
  // offered; the note, and who drafted it; sending it. Never the note's text.
  | { name: 'concierge_opened'; props: { trigger: 'intent' | 'uncited' | 'none'; from: 'after_answer' | 'footer' | 'link' | 'bar' | 'error' | 'project' | 'story' } }
  | { name: 'brief_drafted'; props: { by: 'ai' | 'template' } }
  | { name: 'brief_sent'; props: { channel: 'email' | 'copy' | 'form'; edited: boolean } };

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
