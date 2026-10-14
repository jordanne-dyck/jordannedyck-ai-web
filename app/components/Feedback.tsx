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

  const button =
    'p-1 rounded-md text-[#999999] hover:text-[#0055D4] hover:bg-white/60 transition-colors';

  if (state === 'up' || state === 'down') {
    return <p className="mt-1 text-[10px] sm:text-[11px] text-[#999999]">Thanks for the feedback.</p>;
  }
  if (state === 'error') {
    return <p className="mt-1 text-[10px] sm:text-[11px] text-[#999999]">Feedback could not be saved.</p>;
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
          className="flex-1 min-w-0 rounded-lg px-2 py-1 text-[11px] sm:text-xs bg-white/80 border border-[#E0E0DB] focus:outline-none focus:ring-2 focus:ring-[#0055D4]/30 text-[#1A1A1A] placeholder-[#999999]"
        />
        <button
          type="submit"
          className="rounded-lg px-2 py-1 text-[11px] sm:text-xs bg-[#0055D4] hover:bg-[#004ABB] text-white"
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
