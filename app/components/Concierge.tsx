'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import type { Project } from '@/lib/projects';
import {
  EMAIL, HANDLES, MAILTO_MAX, PURPOSES, REPLY_TIME, mailtoHref, templateBrief, type PurposeId, type Trigger, type Turn,
} from '@/lib/concierge';
import { LEAD_CONSENT } from '@/lib/leads';

// A blank the visitor hasn't filled in yet, like "[your role]".
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
// visitor picks why they're getting in touch, if they like, and gets a note
// drafted from their conversation to edit and send. Where the lead form is on
// (phase 2, lib/leads.ts), the note is sent with the form and stored as a
// lead; email stays as the smaller option. Otherwise nothing is stored. A
// native modal <dialog>, like the project panel.
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
  // conversation to draft from, so the note starts as the blank template and
  // no AI is called.
  const hasChat = turns.some((t) => t.role === 'user');
  const [purpose, setPurpose] = useState<PurposeId | null>(null);
  const about = project?.title ?? null;
  const [brief, setBrief] = useState(() => (hasChat ? '' : templateBrief([], null, about)));
  // The note as drafted, to tell whether the visitor edited it.
  const [drafted, setDrafted] = useState<string | null>(() => (hasChat ? null : templateBrief([], null, about)));
  const [drafting, setDrafting] = useState(false);
  const [by, setBy] = useState<'ai' | 'template'>('ai');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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

  const draft = async () => {
    setDrafting(true);
    setCopied(false);
    let text: string | null = null;
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: turns, purpose, project: project?.slug }),
      });
      if (res.ok) text = ((await res.json()) as { brief?: string }).brief ?? null;
    } catch {
      // The template below stands in.
    }
    const by = text ? 'ai' : 'template';
    const note = text ?? templateBrief(turns, purpose, about);
    track({ name: 'brief_drafted', props: { by, purpose } });
    setBy(by);
    setBrief(note);
    setDrafted(note);
    setDrafting(false);
  };

  const edited = drafted !== null && brief.trim() !== drafted.trim();
  const tooLong = mailtoHref(brief).length > MAILTO_MAX;
  const copy = () => {
    navigator.clipboard?.writeText(brief).then(() => {
      setCopied(true);
      track({ name: 'brief_sent', props: { channel: 'copy', edited } });
    }, () => {});
  };

  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    setSending(true);
    setSendError(null);
    let status = 0;
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email,
          website: data.get('website'),
          note: brief,
          purpose,
          project: project?.slug,
          draftedBy: hasChat ? by : 'blank',
          edited,
        }),
      });
      status = res.status;
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
            ? 'Too many notes have been sent today. Please send it by email instead.'
            : "That didn't go through. Please send it by email instead.",
      );
    }
  };

  const mailto = tooLong ? (
    <span className="hint">Too long for an email link. Copy it and send it to {EMAIL}.</span>
  ) : (
    <a
      className={form ? 'alt' : 'send'}
      href={mailtoHref(brief)}
      onClick={() => track({ name: 'brief_sent', props: { channel: 'email', edited } })}
    >
      {form ? 'Or send it from your own email' : 'Send by email →'}
    </a>
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
            <span className="label">Talk to Jordanne</span>
            <button type="button" className="label" onClick={onClose}>Close ✕</button>
          </div>
          <div className="project-body">
            <h3 id="concierge-title">Talk to the human</h3>
            <p className="lede">
              {trigger === 'intent'
                ? 'That one is a question for her, not jordbot. '
                : trigger === 'uncited'
                  ? "jordbot couldn't answer that from her sources, so ask her directly. "
                  : ''}
              {REPLY_TIME}
            </p>

            <div className="sec">
              <span className="label">jordbot handles</span>
              <ul>{HANDLES.jordbot.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
            <div className="sec">
              <span className="label">Jordanne handles</span>
              <ul>{HANDLES.jordanne.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>

            <div className="sec">
              <span className="label">Getting in touch about</span>
              <div>
                <div className="chips purposes" role="radiogroup" aria-label="Getting in touch about (optional)">
                  {PURPOSES.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      role="radio"
                      aria-checked={purpose === p.id}
                      onClick={() => {
                        const next = purpose === p.id ? null : p.id;
                        setPurpose(next);
                        // The blank template follows the purpose until the visitor edits it.
                        if (!hasChat && !edited) {
                          const note = templateBrief([], next, about);
                          setBrief(note);
                          setDrafted(note);
                        }
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="hint">Optional.</p>
              </div>
            </div>

            <div className="sec">
              <span className="label">Your note</span>
              <div>
                {drafted === null ? (
                  <button type="button" className="draft" onClick={draft} disabled={drafting}>
                    {drafting ? 'Writing your note…' : 'Write my note from this conversation'}
                  </button>
                ) : (
                  <>
                    <textarea
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      rows={12}
                      aria-label="Your note to Jordanne"
                      aria-busy={drafting}
                    />
                    <p className="hint">
                      {!hasChat
                        ? 'Fill in the [brackets] and change anything before you send it.'
                        : by === 'ai'
                        ? 'Drafted by AI from your conversation. Fill in the [brackets] and change anything before you send it.'
                        : "The AI draft isn't available right now, so this is a template with your questions. Fill in the [brackets]."}{' '}
                      {hasChat && <button type="button" onClick={draft} disabled={drafting}>{drafting ? 'Rewriting…' : 'Rewrite it'}</button>}
                    </p>
                  </>
                )}
                <p className="hint">
                  {hasChat && <>To write it, your conversation goes to OpenAI, as your questions already do. </>}
                  {form
                    ? <>The note isn&apos;t saved until you send it.</>
                    : <>The note isn&apos;t saved anywhere. It only reaches Jordanne if you send it.</>}
                </p>
              </div>
            </div>
          </div>
          {drafted !== null && sent !== null && (
            <div className="project-foot concierge-foot" role="status">
              <p className="sent">
                Sent. {REPLY_TIME} Her reply goes to {sent}.
              </p>
            </div>
          )}
          {drafted !== null && sent === null && form && (
            <form className="project-foot concierge-foot lead-form" onSubmit={send}>
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
              {BLANK.test(brief) && (
                <p className="hint consent">Your note still has [brackets]. Fill them in or delete them before you send it.</p>
              )}
              <p className="hint consent">{LEAD_CONSENT}</p>
              {sendError && <p className="hint error" role="alert">{sendError}</p>}
              <div className="lead-actions">
                <button type="submit" className="send" disabled={sending || brief.trim().length < 10}>
                  {sending ? 'Sending…' : 'Send to Jordanne →'}
                </button>
                {mailto}
                <button type="button" className="label" onClick={copy}>{copied ? 'Copied' : 'Copy note'}</button>
              </div>
            </form>
          )}
          {drafted !== null && sent === null && !form && (
            <div className="project-foot concierge-foot">
              {mailto}
              <button type="button" className="label" onClick={copy}>{copied ? 'Copied' : 'Copy note'}</button>
              <span className="label to">To {EMAIL}</span>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
