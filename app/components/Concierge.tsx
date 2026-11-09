'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import type { Project } from '@/lib/projects';
import {
  EMAIL, MAILTO_MAX, REPLY_TIME, mailtoHref, templateBrief, type Trigger, type Turn,
} from '@/lib/concierge';
import { LEAD_CONSENT, leadLimitMessage } from '@/lib/leads';

// A blank the visitor hasn't filled in yet, like "[what you'd like to talk about]".
const BLANK = /\[[^\]\n]+\]/;

// Whether the "Send to Jordanne" form is on here (app/api/lead): asked once
// per page load. Off, or unknown, means email only, as in phase 1.
let leadsEnabled: Promise<boolean> | null = null;
export function formEnabled(): Promise<boolean> {
  leadsEnabled ??= fetch('/api/lead')
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((j: { enabled?: boolean }) => j.enabled === true, () => false);
  return leadsEnabled;
}

// "Talk to the human": the concierge pilot's panel (lib/concierge.ts). The
// note is ready the moment the panel opens: the visitor's questions at once,
// replaced by the AI draft when it arrives unless they've started typing.
// Where the lead form is on (phase 2, lib/leads.ts), the note is sent with
// the form and stored as a lead; email stays as the smaller option. Otherwise
// nothing is stored. One scrolling column with only Send pinned, so a phone
// shows the note (simplified 2026-11-08). A native modal <dialog>, like the
// project panel.
export function ConciergePanel({
  open,
  opener,
  trigger,
  turns,
  project,
  onClose,
}: {
  open: boolean;
  opener: HTMLElement | null;
  trigger: Trigger | null;
  turns: Turn[];
  // Opened from a project panel: named in the note.
  project: Project | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Opened before asking jordbot anything (the footer, the About page): no
  // conversation to draft from, so no AI is called. The note starts empty, or
  // names the project it was opened from.
  const hasChat = turns.some((t) => t.role === 'user');
  const about = project?.title ?? null;
  const [initial] = useState(() => (hasChat || about ? templateBrief(turns, about) : ''));
  const [brief, setBrief] = useState(initial);
  // The note as last drafted, to tell whether the visitor edited it.
  const [drafted, setDrafted] = useState(initial);
  const [drafting, setDrafting] = useState(hasChat);
  const [by, setBy] = useState<'ai' | 'template'>('template');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // The AI draft replaces the note only if the visitor hasn't typed in it.
  const typed = useRef(false);
  const asked = useRef(false);

  useEffect(() => {
    if (open) formEnabled().then(setForm);
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      opener?.focus();
    }
  }, [open, opener]);

  // The AI draft, once per opening.
  useEffect(() => {
    if (!open || !hasChat || asked.current) return;
    asked.current = true;
    (async () => {
      let text: string | null = null;
      try {
        const res = await fetch('/api/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: turns, project: project?.slug }),
        });
        if (res.ok) text = ((await res.json()) as { brief?: string }).brief ?? null;
      } catch {
        // The questions already in the note stand in.
      }
      track({ name: 'brief_drafted', props: { by: text ? 'ai' : 'template' } });
      if (text && !typed.current) {
        setBy('ai');
        setBrief(text);
        setDrafted(text);
      }
      setDrafting(false);
    })();
  }, [open, hasChat, turns, project]);

  const edited = brief.trim() !== drafted.trim();
  const tooLong = mailtoHref(brief).length > MAILTO_MAX;
  const copy = () => {
    navigator.clipboard?.writeText(brief).then(() => {
      setCopied(true);
      track({ name: 'brief_sent', props: { channel: 'copy', edited } });
    }, () => {});
  };

  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // The button is disabled too; this covers Enter in a field.
    if (BLANK.test(brief)) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    setSending(true);
    setSendError(null);
    let status = 0;
    let limit: unknown = null;
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email,
          website: data.get('website'),
          note: brief,
          project: project?.slug,
          draftedBy: hasChat ? by : 'blank',
          edited,
        }),
      });
      status = res.status;
      if (status === 429) limit = ((await res.json().catch(() => ({}))) as { limit?: unknown }).limit;
    } catch {
      // status 0: shown below as "didn't go through".
    }
    setSending(false);
    if (status === 200) {
      track({ name: 'brief_sent', props: { channel: 'form', edited } });
      setSent(email);
    } else {
      setSendError(
        status === 400
          ? 'Check your name and email, and that the note has something in it.'
          : status === 429
            ? leadLimitMessage(limit)
            : "That didn't go through. Please send it by email instead.",
      );
    }
  };

  // Email, the smaller option beside the form (decided 2026-11-07). Copy only
  // when the note is too long for a mail link.
  const mailto = tooLong ? (
    <>
      <span className="hint">Too long for an email link. Copy it and send it to {EMAIL}.</span>
      <button type="button" className="label" onClick={copy}>{copied ? 'Copied' : 'Copy note'}</button>
    </>
  ) : (
    <a
      className={form ? 'alt' : 'send'}
      href={mailtoHref(brief)}
      onClick={() => track({ name: 'brief_sent', props: { channel: 'email', edited } })}
    >
      {form ? 'Or send it from your own email' : 'Send by email →'}
    </a>
  );

  const head = (
    <>
      <h3 id="concierge-title">Talk to the human</h3>
      <p className="lede">
        {trigger === 'intent'
          ? 'That one is a question for her, not jordbot. '
          : trigger === 'uncited'
            ? "jordbot couldn't answer that from her sources, so ask her directly. "
            : ''}
        {REPLY_TIME}
      </p>
    </>
  );

  const note = (
    <div className="field">
      <span className="label">Your note</span>
      <textarea
        value={brief}
        onChange={(e) => {
          typed.current = true;
          setBrief(e.target.value);
        }}
        rows={7}
        placeholder="What would you like to talk to Jordanne about?"
        aria-label="Your note to Jordanne"
        aria-busy={drafting}
      />
      {hasChat && (
        <p className="hint">
          {drafting
            ? 'AI is drafting this from your conversation, which already goes to OpenAI.'
            : by === 'ai'
              ? 'Drafted by AI from your conversation, which already goes to OpenAI. Change anything.'
              : 'Your questions, ready to send. Change anything.'}
        </p>
      )}
    </div>
  );

  return (
    <dialog
      ref={ref}
      className="project concierge"
      aria-labelledby="concierge-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="project-inner">
          <div className="project-top">
            {/* No title here: the heading below is the panel's only one. */}
            <button type="button" className="label" onClick={onClose}>Close ✕</button>
          </div>
          {sent !== null ? (
            <>
              <div className="project-body">
                <h3 id="concierge-title">Sent</h3>
                <p className="sent" role="status">{REPLY_TIME} Her reply goes to {sent}.</p>
              </div>
              <div className="project-foot concierge-foot">
                <button type="button" className="send" onClick={onClose}>Back to jordbot</button>
              </div>
            </>
          ) : form ? (
            <form className="concierge-form" onSubmit={send}>
              <div className="project-body">
                {head}
                {note}
                <div className="lead-fields">
                  <label>
                    <span className="label">Your name</span>
                    <input name="name" autoComplete="name" required maxLength={100} />
                  </label>
                  <label>
                    <span className="label">Your email</span>
                    <input name="email" type="email" autoComplete="email" required maxLength={254} />
                  </label>
                  {/* For bots only: hidden from people and screen readers. */}
                  <input name="website" className="trap" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                </div>
                {!drafting && BLANK.test(brief) && (
                  <p className="hint">Your note still has [brackets]. Fill them in or delete them to send it.</p>
                )}
                <p className="hint">{LEAD_CONSENT}</p>
                {sendError && <p className="hint error" role="alert">{sendError}</p>}
              </div>
              <div className="project-foot concierge-foot">
                <button type="submit" className="send" disabled={sending || brief.trim().length < 10 || BLANK.test(brief)}>
                  {sending ? 'Sending…' : 'Send to Jordanne →'}
                </button>
                {mailto}
              </div>
            </form>
          ) : (
            <>
              <div className="project-body">
                {head}
                {note}
                <p className="hint">The note isn&apos;t saved anywhere. It only reaches Jordanne if you send it.</p>
              </div>
              <div className="project-foot concierge-foot">
                {mailto}
                <span className="label to">To {EMAIL}</span>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
