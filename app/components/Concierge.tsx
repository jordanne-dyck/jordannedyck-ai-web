'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import {
  EMAIL, HANDLES, MAILTO_MAX, PURPOSES, REPLY_TIME, mailtoHref, templateBrief, type PurposeId, type Trigger, type Turn,
} from '@/lib/concierge';

// "Talk to the human": the concierge pilot's panel (lib/concierge.ts). The
// visitor picks why they're getting in touch, if they like, and gets a note
// drafted from their conversation to edit and send by email. Nothing is
// stored. A native modal <dialog>, like the project panel.
export function ConciergePanel({
  open,
  opener,
  trigger,
  turns,
  onClose,
}: {
  open: boolean;
  opener: HTMLElement | null;
  trigger: Trigger | null;
  turns: Turn[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [purpose, setPurpose] = useState<PurposeId | null>(null);
  const [brief, setBrief] = useState('');
  // The note as drafted, to tell whether the visitor edited it.
  const [drafted, setDrafted] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [by, setBy] = useState<'ai' | 'template'>('ai');
  const [copied, setCopied] = useState(false);

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
        body: JSON.stringify({ messages: turns, purpose }),
      });
      if (res.ok) text = ((await res.json()) as { brief?: string }).brief ?? null;
    } catch {
      // The template below stands in.
    }
    const by = text ? 'ai' : 'template';
    const note = text ?? templateBrief(turns, purpose);
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
                      onClick={() => setPurpose(purpose === p.id ? null : p.id)}
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
                      {by === 'ai'
                        ? 'Drafted by AI from your conversation. Fill in the [brackets] and change anything before you send it.'
                        : "The AI draft isn't available right now, so this is a template with your questions. Fill in the [brackets]."}{' '}
                      <button type="button" onClick={draft} disabled={drafting}>{drafting ? 'Rewriting…' : 'Rewrite it'}</button>
                    </p>
                  </>
                )}
                <p className="hint">
                  To write it, your conversation goes to OpenAI, as your questions already do. The note isn&apos;t saved
                  anywhere. It only reaches Jordanne if you send it.
                </p>
              </div>
            </div>
          </div>
          {drafted !== null && (
            <div className="project-foot concierge-foot">
              {tooLong ? (
                <span className="hint">Too long for an email link. Copy it and send it to {EMAIL}.</span>
              ) : (
                <a
                  className="send"
                  href={mailtoHref(brief)}
                  onClick={() => track({ name: 'brief_sent', props: { channel: 'email', edited } })}
                >
                  Send by email →
                </a>
              )}
              <button type="button" className="label" onClick={copy}>{copied ? 'Copied' : 'Copy note'}</button>
              <span className="label to">To {EMAIL}</span>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
