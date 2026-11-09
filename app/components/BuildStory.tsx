'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STOPS } from '@/lib/build-story';
import { track } from '@/lib/analytics';

const EMAIL = 'jordanne.dyck@gmail.com';
const LINKS = [
  { target: 'dashboard', label: 'Live dashboard', href: 'https://jordannedyck.com/dashboard' },
  { target: 'repo_web', label: 'Frontend code', href: 'https://github.com/jordanne-dyck/jordannedyck-ai-web' },
  { target: 'repo_ai', label: 'Backend code', href: 'https://github.com/jordanne-dyck/jordannedyck-ai' },
] as const;

// Each stop holds long enough to read its detail: 1.5 seconds to find it and
// 250ms a word, between 4 and 9 seconds, as the timeline paces its captions.
const holdFor = (detail: string) => Math.min(Math.max(1500 + detail.split(/\s+/).length * 250, 4000), 9000);
const HOLDS = STOPS.map((s) => holdFor(s.detail));
const TOTAL = HOLDS.reduce((a, b) => a + b, 0);
const LAST = STOPS.length - 1;

const stillWanted = (paused: boolean) =>
  paused || (typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// The stop playing at `t` ms into the clip.
function stopAt(t: number): number {
  let start = 0;
  for (let i = 0; i < HOLDS.length; i++) {
    start += HOLDS[i];
    if (t < start) return i;
  }
  return LAST;
}

// The build story under its fixed lead (lib/build-story.ts): the visitor's own
// question, followed through the five stops it passed on its way to an answer.
// It plays once half of it is on screen: each stop opens in turn and the rail
// fills behind it. Pause and Skip are offered while it plays (WCAG 2.2.2), and
// with the page's pause or reduced motion it starts at the end. At the end the
// fork to Jordanne stays open, and every stop is a button that opens its
// detail. A vertical rail at every width, which suits phones.
export function BuildStory({
  from,
  replay,
  paused,
  ready,
  onTalk,
}: {
  from: 'chip' | 'typed' | 'card';
  replay: boolean;
  paused: boolean;
  ready: boolean;
  // Opens the concierge. Without it, the fork's button is an email link.
  onTalk?: (opener: HTMLElement) => void;
}) {
  const [t, setT] = useState(() => (stillWanted(paused) ? TOTAL : 0));
  const [playing, setPlaying] = useState(false);
  // After the clip: the stops the visitor has open. The fork starts open.
  const [open, setOpen] = useState<Set<number>>(() => new Set([LAST]));
  const tRef = useRef(t);
  const raf = useRef(0);
  const pausedRef = useRef(paused);
  const rail = useRef<HTMLOListElement>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    track({ name: 'story_shown', props: { explicit: true, from, replay } });
  }, [from, replay]);

  const play = useCallback((start = 0) => {
    cancelAnimationFrame(raf.current);
    setPlaying(true);
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now - start;
      const elapsed = stillWanted(pausedRef.current) ? TOTAL : Math.min(now - t0, TOTAL);
      tRef.current = elapsed;
      setT(elapsed);
      if (elapsed < TOTAL) raf.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  const control = (action: 'play' | 'pause' | 'skip') =>
    track({ name: 'story_control', props: { action, ms: Math.round(tRef.current) } });
  const pauseClip = () => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    control('pause');
  };
  const resume = () => {
    control('play');
    play(tRef.current);
  };
  const skip = () => {
    cancelAnimationFrame(raf.current);
    control('skip');
    tRef.current = TOTAL;
    setT(TOTAL);
    setPlaying(false);
  };
  const replayClip = () => {
    control('play');
    setOpen(new Set([LAST]));
    tRef.current = 0;
    setT(0);
    play();
  };

  // Starts once the answer has finished arriving and half the rail is in view.
  useEffect(() => {
    const el = rail.current;
    if (!el || !ready) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [play, ready]);

  const done = t >= TOTAL;
  const cur = done ? -1 : stopAt(t);

  // A tap on a stop: during the clip it stops there and opens it; after, it
  // opens or closes that stop.
  const toggle = (i: number) => {
    if (!done) {
      cancelAnimationFrame(raf.current);
      tRef.current = TOTAL;
      setT(TOTAL);
      setPlaying(false);
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

  return (
    <section className="story" aria-label="How your question was answered">
      <ol className="st-rail" ref={rail}>
        {STOPS.map((s, i) => {
          const isOpen = done ? open.has(i) : i === cur;
          const id = `st-detail-${i}`;
          return (
            <li
              key={s.title}
              className="st-stop"
              data-fork={s.fork || undefined}
              data-passed={done || i < cur || undefined}
              data-cur={i === cur || undefined}
            >
              <span className="st-mark" aria-hidden="true"><i /></span>
              <div className="st-body">
                <button type="button" className="st-head" aria-expanded={isOpen} aria-controls={id} onClick={() => toggle(i)}>
                  <span className="st-title">{i + 1} · {s.title}</span>
                  <span className="label st-parts">{s.parts}</span>
                </button>
                <div className="st-detail" id={id} hidden={!isOpen}>
                  <p>{s.detail}</p>
                  {s.fork &&
                    (onTalk ? (
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
                    ))}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {/* One line under the trace, like the timeline's */}
      <div className="tl-meta st-meta">
        {!done && (
          <div className="tl-controls">
            <button type="button" className="label" onClick={playing ? pauseClip : resume}>
              {playing ? 'Pause ❚❚' : 'Play ▶'}
            </button>
            <button type="button" className="label" onClick={skip}>
              Show all ⏭
            </button>
          </div>
        )}
        {done && !stillWanted(paused) && (
          <button type="button" className="label tl-replay" onClick={replayClip}>
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
  );
}
