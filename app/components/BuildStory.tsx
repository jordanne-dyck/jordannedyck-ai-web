'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { STOPS, type Stop } from '@/lib/build-story';
import { stopLine, type TraceData } from '@/lib/trace';
import { track } from '@/lib/analytics';

const EMAIL = 'jordanne.dyck@gmail.com';
const LINKS = [
  { target: 'dashboard', label: 'Live dashboard', href: 'https://jordannedyck.com/dashboard' },
  { target: 'repo_web', label: 'Frontend code', href: 'https://github.com/jordanne-dyck/jordannedyck-ai-web' },
  { target: 'repo_ai', label: 'Backend code', href: 'https://github.com/jordanne-dyck/jordannedyck-ai' },
] as const;

const LAST = STOPS.length - 1;
// When each stop is reached, in ms from the start: the first two hold long
// enough to read their one line, then the answer appears at stop 3. Under
// five seconds in all, so no pause control is needed (WCAG 2.2.2).
const AT = [0, 1000, 2000, 2500, 3000];
// The answer text shows from this stop on: where it is written.
const WRITE = 2;

const stillWanted = (paused: boolean) =>
  paused || (typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

type State = 'pending' | 'current' | 'done' | 'skipped';

function stateOf(i: number, step: number, trace: TraceData | null): State {
  if (i > step || (i === step && i < LAST)) return i === step ? 'current' : 'pending';
  return trace && stopLine(i, trace)?.skipped ? 'skipped' : 'done';
}

// One stop on the rail: its mark, title, this question's line, and on opening
// the decision behind it with a link to check it.
function StopRow({
  stop, i, state, line, open, onToggle, extra,
}: {
  stop: Stop;
  i: number;
  state: State;
  line: string | null;
  open: boolean;
  onToggle: () => void;
  extra?: ReactNode;
}) {
  const id = `st-detail-${i}`;
  return (
    <li className="st-stop" data-state={state} data-fork={stop.fork || undefined}>
      <span className="st-mark" aria-hidden="true"><i /></span>
      <div className="st-body">
        <button type="button" className="st-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="st-title">{i + 1} · {stop.title}</span>
          <span className="label st-parts">{stop.parts}</span>
        </button>
        {line && <p className="st-line">{line}</p>}
        <div className="st-detail" id={id} hidden={!open}>
          <p>{stop.detail}</p>
          <a
            className="st-evidence"
            href={stop.evidence.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track({ name: 'story_link_clicked', props: { target: 'evidence', step: i + 1 } })}
          >
            {stop.evidence.label} ↗
          </a>
          {extra}
        </div>
      </div>
    </li>
  );
}

// The build story's trace (lib/build-story.ts, lib/trace.ts): what just
// happened to the visitor's question, stop by stop, with its real figures.
// It plays once the answer has arrived, and the lead under it (`children`)
// appears when the trace reaches the stop that writes it. With the page's
// pause or reduced motion it starts at the end. Each stop is a button that
// opens the decision behind it; the fork to Jordanne starts open.
export function BuildStory({
  from,
  replay,
  paused,
  ready,
  trace,
  onTalk,
  children,
}: {
  from: 'chip' | 'typed' | 'card';
  replay: boolean;
  paused: boolean;
  ready: boolean;
  // Absent on answers from before the trace existed: the stops show without figures.
  trace: TraceData | null;
  // Opens the concierge. Without it, the fork's button is an email link.
  onTalk?: (opener: HTMLElement) => void;
  // The lead, shown from the writing stop on.
  children?: ReactNode;
}) {
  // The stop reached: -1 before the answer has arrived.
  const [played, setPlayed] = useState(-1);
  // Once shown, the text stays, so a replay doesn't pull it from under the reader.
  const [revealed, setRevealed] = useState(false);
  const reach = useCallback((k: number) => {
    setPlayed(k);
    if (k >= WRITE) setRevealed(true);
  }, []);
  const [open, setOpen] = useState<Set<number>>(() => new Set([LAST]));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    track({ name: 'story_shown', props: { explicit: true, from, replay } });
  }, [from, replay]);

  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = AT.map((ms, k) => setTimeout(() => reach(k), ms));
  }, [reach]);

  useEffect(() => {
    if (!ready) return;
    play();
    const t = timers;
    return () => t.current.forEach(clearTimeout);
  }, [ready, play]);

  // With the page's pause or reduced motion, the end, even if pressed mid-play.
  const step = stillWanted(paused) ? LAST : played;
  const done = step >= LAST;

  const toggle = (i: number) => {
    // Mid-play, a tap finishes the trace and opens that stop.
    if (!done) {
      timers.current.forEach(clearTimeout);
      reach(LAST);
      setOpen(new Set([i, LAST]));
      track({ name: 'story_step_opened', props: { step: i + 1 } });
      return;
    }
    const next = new Set(open);
    if (next.has(i)) next.delete(i);
    else {
      next.add(i);
      track({ name: 'story_step_opened', props: { step: i + 1 } });
    }
    setOpen(next);
  };

  const talk = onTalk ? (
    <button
      type="button"
      className="st-talk"
      onClick={(ev) => {
        track({ name: 'story_link_clicked', props: { target: 'concierge' } });
        onTalk(ev.currentTarget);
      }}
    >
      Talk to Jordanne →
    </button>
  ) : (
    <a
      className="st-talk"
      href={`mailto:${EMAIL}`}
      onClick={() => track({ name: 'story_link_clicked', props: { target: 'email' } })}
    >
      Talk to Jordanne →
    </a>
  );

  return (
    <>
      <section className="story" aria-label="What just happened to your question">
        <p className="label st-kicker">What just happened to your question</p>
        <ol className="st-rail">
          {STOPS.map((s, i) => {
            const state = step < 0 ? 'pending' : stateOf(i, step, trace);
            const shown = state !== 'pending';
            return (
              <StopRow
                key={s.title}
                stop={s}
                i={i}
                state={state}
                line={shown && trace ? stopLine(i, trace)?.text ?? null : null}
                open={done && open.has(i)}
                onToggle={() => toggle(i)}
                extra={s.fork ? talk : undefined}
              />
            );
          })}
        </ol>
        <div className="tl-meta st-meta">
          {done && !stillWanted(paused) && (
            <button
              type="button"
              className="label tl-replay"
              onClick={() => {
                track({ name: 'story_control', props: { action: 'play', ms: 0 } });
                setOpen(new Set([LAST]));
                play();
              }}
            >
              Replay ↺
            </button>
          )}
          {LINKS.map((l) => (
            <a
              key={l.target}
              className="label"
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track({ name: 'story_link_clicked', props: { target: l.target } })}
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      </section>
      {(revealed || step >= WRITE) && children}
    </>
  );
}

// Under every other answer: the same trace, folded, with this answer's figures.
export function AnswerTrace({ trace }: { trace: TraceData }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) => {
    const next = new Set(open);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setOpen(next);
  };
  return (
    <details
      className="story answer-trace"
      onToggle={(e) => {
        if (e.currentTarget.open) track({ name: 'trace_opened', props: { answer: trace.answer } });
      }}
    >
      <summary className="label">How this answer was made</summary>
      <ol className="st-rail">
        {STOPS.map((s, i) => (
          <StopRow
            key={s.title}
            stop={s}
            i={i}
            state={stateOf(i, LAST, trace)}
            line={stopLine(i, trace)?.text ?? null}
            open={open.has(i)}
            onToggle={() => toggle(i)}
          />
        ))}
      </ol>
    </details>
  );
}
