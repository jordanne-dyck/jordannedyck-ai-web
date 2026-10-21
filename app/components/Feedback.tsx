'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { track } from '@/lib/analytics';

type State = 'idle' | 'up' | 'asking' | 'down' | 'error';

// Thumbs up/down under one answer, written to chat_events.flags.feedback
// through POST /api/feedback. `rowId` comes from the `event` annotation the
// chat route sends once the answer is logged; without it nothing renders.
export function Feedback({ rowId }: { rowId: string }) {
  const [state, setState] = useState<State>('idle');
  const [note, setNote] = useState('');

  // A thumbs-down is saved on the click, then again with the note if one is
  // sent, so skipping the note still records the vote.
  const send = async (vote: 'up' | 'down', text?: string, next: State = vote) => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, vote, note: text || undefined }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // The note stays out of PostHog: it is the visitor's own words.
      track({ name: 'feedback', props: { vote, has_note: Boolean(text) } });
      setState(next);
    } catch {
      setState('error');
    }
  };

  // At least 24px everywhere, 44px on touch screens.
  const button =
    'inline-flex items-center justify-center min-w-7 min-h-7 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:min-h-11 rounded-md text-[var(--soft)] hover:text-[var(--text)] hover:bg-[var(--fill)] transition-colors';

  if (state === 'up' || state === 'down') {
    return <p className="mt-1 text-[10px] sm:text-[11px] text-[var(--soft)]">Thanks for the feedback.</p>;
  }
  if (state === 'error') {
    return <p className="mt-1 text-[10px] sm:text-[11px] text-[var(--soft)]">Feedback could not be saved.</p>;
  }
  if (state === 'asking') {
    return (
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) send('down', note.trim());
          else setState('down');
        }}
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          autoFocus
          placeholder="What was wrong? (optional)"
          aria-label="What was wrong with this answer"
          className="flex-1 min-w-0 rounded-lg px-2 py-1 text-[11px] sm:text-xs bg-[var(--input)] border border-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--d1)] text-[var(--text)] placeholder-[var(--soft)]"
        />
        <button
          type="submit"
          className="rounded-lg px-2 py-1 text-[11px] sm:text-xs bg-[var(--send)] hover:opacity-90 text-[var(--send-ink)]"
        >
          Send
        </button>
      </form>
    );
  }
  return (
    <div className="mt-1 flex gap-1" aria-label="Rate this answer">
      <button type="button" className={button} onClick={() => send('up')} aria-label="Good answer">
        <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button type="button" className={button} onClick={() => send('down', undefined, 'asking')} aria-label="Bad answer">
        <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
