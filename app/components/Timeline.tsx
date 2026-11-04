'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CAREER, EDUCATION, MOMENTS, SIDE_PROJECTS, type Employer } from '@/lib/timeline';
import { track } from '@/lib/analytics';
import { projectBySlug, type Project } from '@/lib/projects';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM' or 'YYYY' as a month count, so spans can be compared. A bare year
// starts in January and ends in December.
function monthOf(date: string, end = false): number {
  const [y, m] = date.split('-').map(Number);
  return y * 12 + (m ? m - 1 : end ? 11 : 0);
}

function label(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : String(y);
}

function span(start: string, end: string | null): string {
  if (end === start) return label(start);
  return `${label(start)} – ${end ? label(end) : 'now'}`;
}

const today = new Date();
const NOW = today.getFullYear() * 12 + today.getMonth();

const startOf = (e: Employer) => monthOf(e.roles.at(-1)!.start);
const endOf = (e: Employer) => {
  const end = e.roles[0].end;
  return end ? Math.min(monthOf(end, true), NOW) : NOW;
};

// Work and education share one column, oldest first: work in the wide lane,
// education in the narrow lane beside it. `dot` is where a moment's dot sits.
type Entry = { e: Employer; kind: 'work' | 'edu'; tone: string; dot: number };
const ENTRIES: Entry[] = [
  ...[...CAREER].reverse().map((e, i): Entry => ({ e, kind: 'work', tone: `var(--d${(i % 3) + 1})`, dot: 51 })),
  ...[...EDUCATION].reverse().map((e): Entry => ({ e, kind: 'edu', tone: 'var(--soft)', dot: 63 })),
];
// Personal projects sit on the axis itself.
const AXIS_DOT = 40;

// Project moments: a job's projects at January of the year their `when`
// starts (or the role's start, if later), and the personal projects.
type Marker = { project: Project; at: number; entry: Entry | null };
const MARKERS: Marker[] = [
  ...ENTRIES.flatMap((entry) =>
    entry.e.roles.flatMap((r) =>
      (r.projects ?? []).flatMap((slug) => {
        const project = projectBySlug(slug);
        const year = Number(project?.when.match(/\d{4}/)?.[0]);
        if (!project || !year) return [];
        return [{ project, at: Math.max(year * 12, monthOf(r.start)), entry }];
      }),
    ),
  ),
  ...SIDE_PROJECTS.flatMap((s) => {
    const project = projectBySlug(s.slug);
    return project ? [{ project, at: monthOf(s.start), entry: null }] : [];
  }),
];

// The earliest start: the top of the full view.
const FIRST = Math.min(...ENTRIES.map((x) => startOf(x.e)));
// Room under today for the last names, which the layout pushes down.
const FULL: [number, number] = [FIRST - 5, NOW + 20];

// The script: the playhead runs from the first start to today. The camera (the
// stretch of months in view) starts close on the first years and follows it
// down, zooms into each moment and holds while its caption shows, then pulls
// back to the whole career. About 25 seconds, paced for reading: each caption
// holds for 300ms a word on top of 1.5 seconds to find it (4 to 6 seconds), plus
// 1 second to take in its image. Camera moves take 0.9 seconds, slow enough to
// follow. Pause and Skip to end are always offered while it plays (WCAG 2.2.2).
type Segment = { dur: number; p: [number, number]; cam: [[number, number], [number, number]]; moment?: number };

const SCRIPT: Segment[] = (() => {
  const segs: Segment[] = [];
  const views = MOMENTS.map((m) => [monthOf(m.view[0]), monthOf(m.view[1])] as [number, number]);
  const ats = MOMENTS.map((m) => monthOf(m.at));
  // Four years in view, the playhead two thirds of the way down so what it
  // has passed stays readable.
  const follow = (m: number): [number, number] => [m - 30, m + 18];
  segs.push({ dur: 4500, p: [FIRST, ats[0] - 10], cam: [follow(FIRST), follow(ats[0] - 10)] });
  let p = ats[0] - 10;
  let cam = follow(p);
  MOMENTS.forEach((_, i) => {
    segs.push({ dur: 900, p: [p, ats[i]], cam: [cam, views[i]] });
    segs.push({ dur: holdFor(MOMENTS[i]), p: [ats[i], ats[i] + 6], cam: [views[i], views[i]], moment: i });
    p = ats[i] + 6;
    cam = views[i];
  });
  segs.push({ dur: 1500, p: [p, NOW], cam: [cam, FULL] });
  return segs;
})();

function holdFor(m: (typeof MOMENTS)[number]): number {
  const words = `${m.head} ${m.text}`.split(/s+/).length;
  return Math.min(Math.max(1500 + words * 300, 4000), 6000) + (m.project ? 1000 : 0);
}
const TOTAL = SCRIPT.reduce((s, x) => s + x.dur, 0);

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

// Where the playhead and camera are at time `t`, how visible the caption is
// (a 0.4 second fade each way), and how long it has shown (for the counters).
function frame(t: number) {
  let start = 0;
  for (const s of SCRIPT) {
    if (t <= start + s.dur) {
      const u = (t - start) / s.dur;
      const e = ease(u);
      const held = t - start;
      const fade = s.moment === undefined ? 0 : Math.min(1, held / 400, (s.dur - held) / 400);
      return {
        p: lerp(s.p[0], s.p[1], s.moment === undefined ? e : u),
        top: lerp(s.cam[0][0], s.cam[1][0], e),
        bottom: lerp(s.cam[0][1], s.cam[1][1], e),
        moment: s.moment,
        fade,
        held,
      };
    }
    start += s.dur;
  }
  return { p: NOW, top: FULL[0], bottom: FULL[1], moment: undefined, fade: 0, held: 0 };
}

// A caption's text with each {number} counted up; `k` runs 0 to 1.
const counted = (text: string, k: number) =>
  text.replace(/\{(\d+)\}/g, (_, n: string) => String(Math.round(Number(n) * ease(k))));

// A caption's still or muted, looping clip, like the project cards'.
function Media({ src }: { src: string }) {
  if (src.endsWith('.mp4')) return <video src={src} muted loop autoPlay playsInline preload="auto" />;
  // eslint-disable-next-line @next/next/no-img-element -- small static images, same as the project cards
  return <img src={src} alt="" />;
}

const stillWanted = (paused: boolean) =>
  paused || (typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// The visible space for the frame: the window less the page's fixed bar, the
// sticky question box and the timeline's own header row. Captions sit inside or
// beside the frame, so the whole of it must fit.
function visibleSpace() {
  if (typeof window === 'undefined') return { height: 480, bar: 0, composer: 0 };
  const bar = document.querySelector('.home .bar')?.getBoundingClientRect().height ?? 0;
  const composer = document.querySelector<HTMLElement>('.home .composer')?.offsetHeight ?? 0;
  const max = matchMedia('(min-width: 761px)').matches ? 560 : 600;
  return { height: Math.round(Math.min(Math.max(innerHeight - bar - composer - 72, 320), max)), bar, composer };
}

// Where to zoom for an entry: its whole span, at least 18 months, ending no
// later than today.
function viewOf(e: Employer): [number, number] {
  const s = startOf(e);
  const end = endOf(e);
  const pad = Math.max(4, (18 - (end - s)) / 2);
  let top = s - pad;
  let bottom = end + pad + 4;
  if (bottom > NOW + 2) [top, bottom] = [top - (bottom - NOW - 2), NOW + 2];
  return [top, bottom];
}

// One text line on the frame. Lines are placed at their month, then pushed
// down just enough not to overlap the line above.
type Item = {
  key: string;
  kind: 'name' | 'role' | 'project';
  at: number;
  height: number;
  entry: Entry | null;
  text: string;
  sub?: string;
  dot?: number;
  marker?: Marker;
};
const RANK = { name: 0, role: 1, project: 2 };

function place(items: Item[], px: (m: number) => number) {
  let floor = -Infinity;
  return [...items]
    .sort((a, b) => a.at - b.at || RANK[a.kind] - RANK[b.kind])
    .map((it) => {
      const top = Math.max(px(it.at) - 3, floor);
      floor = top + it.height + 2;
      return { ...it, top };
    });
}

// Every role as text, with its projects. Closed under the animation; it is
// also what a screen reader gets.
function Group({
  list,
  onOpenProject,
}: {
  list: Employer[];
  onOpenProject: (project: Project, opener: HTMLElement) => void;
}) {
  return (
    <ol className="tl-list">
      {list.map((e) => (
        <li key={e.org + e.roles[0].start}>
          <div className="tl-org">
            <strong>{e.org}</strong>
            {e.line && <span>{e.line}</span>}
          </div>
          <ol>
            {e.roles.map((r) => {
              const projects = (r.projects ?? []).map(projectBySlug).filter((p): p is Project => p !== null);
              return (
                <li key={r.title + r.start}>
                  <span className="label">{span(r.start, r.end)}</span>
                  <span>{r.title}</span>
                  {projects.length > 0 && (
                    <div className="chips" role="group" aria-label={`Projects as ${r.title}`}>
                      {projects.map((p) => (
                        <button type="button" key={p.slug} aria-haspopup="dialog" onClick={(ev) => onOpenProject(p, ev.currentTarget)}>
                          {p.title}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}

// The career under an answer, as a short vertical clip: years run down the
// frame, each job's and school's block grows as the playhead passes, its
// moments (role changes and projects) appear on it, the view zooms into the
// chosen moments, and it ends on the whole career. It starts when half of it
// is on screen; with paused or reduced motion it shows the end straight away.
//
// Afterwards a name can be tapped to zoom into that job or school. Zoomed in,
// its projects are buttons that open their panel; "Full career" zooms back
// out. Personal projects open from any view.
export function Timeline({
  explicit,
  paused,
  onOpenProject,
}: {
  explicit: boolean;
  paused: boolean;
  onOpenProject: (project: Project, opener: HTMLElement) => void;
}) {
  const [t, setT] = useState(() => (stillWanted(paused) ? TOTAL : 0));
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(t);
  // After the clip: the view, and the entry zoomed into (null for the full view).
  const [cam, setCam] = useState<[number, number]>(FULL);
  const [focus, setFocus] = useState<Entry | null>(null);
  // The frame's height in pixels: set to fit the visible space, and read back
  // for placing the labels.
  const [fit, setFit] = useState(visibleSpace);
  const [height, setHeight] = useState(fit.height);
  const camRef = useRef<[number, number]>(FULL);
  const stage = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  // The entry last zoomed into, so focus can go back to its name.
  const zoomedFrom = useRef<Entry | null>(null);
  const raf = useRef(0);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    track({ name: 'timeline_shown', props: { explicit } });
  }, [explicit]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    const onResize = () => setFit(visibleSpace());
    addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      removeEventListener('resize', onResize);
    };
  }, []);

// Plays from `from` ms. The page's pause switch jumps to the end rather than
  // freezing half-zoomed; the clip's own Pause holds the frame.
  const play = useCallback((from = 0) => {
    cancelAnimationFrame(raf.current);
    setPlaying(true);
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now - from;
      const elapsed = stillWanted(pausedRef.current) ? TOTAL : Math.min(now - t0, TOTAL);
      tRef.current = elapsed;
      setT(elapsed);
      if (elapsed < TOTAL) raf.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(step);
  }, []);
  const pauseClip = () => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    track({ name: 'timeline_control', props: { action: 'pause', ms: Math.round(tRef.current) } });
  };
  const skip = () => {
    cancelAnimationFrame(raf.current);
    track({ name: 'timeline_control', props: { action: 'skip', ms: Math.round(tRef.current) } });
    tRef.current = TOTAL;
    setT(TOTAL);
    setPlaying(false);
  };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    // Starts once most of the frame (60%) is in view between the bar and the
    // question box. Captions sit at its top or beside it, so a lower edge
    // still behind the question box hides nothing that matters.
    const { bar, composer } = visibleSpace();
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.6, rootMargin: `-${Math.round(bar)}px 0px -${Math.round(composer)}px 0px` },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [play]);

  // The camera move for a tap: the clip's easing, 0.6 seconds.
  const moveTo = (target: [number, number]) => {
    cancelAnimationFrame(raf.current);
    const from = camRef.current;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const u = stillWanted(pausedRef.current) ? 1 : Math.min((now - t0) / 600, 1);
      const c: [number, number] = [lerp(from[0], target[0], ease(u)), lerp(from[1], target[1], ease(u))];
      camRef.current = c;
      setCam(c);
      if (u < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const zoomInto = (entry: Entry) => {
    track({ name: 'timeline_zoomed', props: { org: entry.e.org } });
    zoomedFrom.current = entry;
    setFocus(entry);
    moveTo(viewOf(entry.e));
  };
  const zoomOut = () => {
    setFocus(null);
    moveTo(FULL);
  };
  const replay = () => {
    camRef.current = FULL;
    setCam(FULL);
    setFocus(null);
    zoomedFrom.current = null;
    tRef.current = 0;
    setT(0);
    play();
  };

  // Keyboard focus follows the zoom: onto "Full career" going in, back to the
  // name going out. The name buttons are drawn again on the way out, so the
  // button is found by its entry.
  useEffect(() => {
    if (focus) back.current?.focus();
    else if (zoomedFrom.current) {
      const i = ENTRIES.indexOf(zoomedFrom.current);
      stage.current?.querySelector<HTMLElement>('[data-entry="' + i + '"]')?.focus();
    }
  }, [focus]);

  const done = t >= TOTAL;
  const f = frame(t);
  const p = done ? NOW : f.p;
  const [top, bottom] = done ? cam : [f.top, f.bottom];
  const y = (m: number) => `${((m - top) / (bottom - top)) * 100}%`;
  const h = (a: number, b: number) => `${(Math.max(b - a, 0.6) / (bottom - top)) * 100}%`;
  const px = (m: number) => ((m - top) / (bottom - top)) * height;
  // Role titles and project names only fit when zoomed in.
  const zoomed = bottom - top < 100;
  const step = (bottom - top) / 12 > 10 ? 2 : 1;
  const years: number[] = [];
  for (let yr = Math.ceil(top / 12); yr * 12 < Math.min(bottom - 1, NOW + 1); yr++) if (yr % step === 0) years.push(yr);
  const firstYear = Math.floor(FIRST / 12);
  const heading = !done
    ? String(Math.floor(p / 12))
    : focus
      ? `${Math.floor(startOf(focus.e) / 12)} – ${focus.e.roles[0].end ? focus.e.roles[0].end.slice(0, 4) : 'today'}`
      : `${firstYear} – today`;

  // The text on the frame. Zoomed out: names and personal projects, with
  // role changes and job projects as bare dots. Zoomed in: everything titled.
  const items: Item[] = ENTRIES.map((entry, i) => ({
    key: 'n' + i,
    kind: 'name',
    at: startOf(entry.e),
    height: zoomed ? 34 : 18,
    entry,
    text: entry.e.org,
    sub: entry.e.roles.at(-1)!.title,
  }));
  if (zoomed) {
    ENTRIES.forEach((entry) =>
      entry.e.roles.slice(0, -1).forEach((r) =>
        items.push({ key: 'r' + r.title + r.start, kind: 'role', at: monthOf(r.start), height: 20, entry, text: r.title, dot: entry.dot }),
      ),
    );
  }
  MARKERS.forEach((m) => {
    if (zoomed || !m.entry) {
      items.push({
        key: 'p' + m.project.slug,
        kind: 'project',
        at: m.at,
        height: 24,
        entry: m.entry,
        text: m.project.title,
        dot: m.entry ? m.entry.dot : AXIS_DOT,
        marker: m,
      });
    }
  });
  const placed = place(items, px);
  const dimmed = (entry: Entry | null) => (focus !== null && entry !== focus) || undefined;

  return (
    <section className="timeline" aria-label="Career timeline">
      <div className="tl-body">
      <div className="tl-main">
      <div className="tl-top">
        <span className="label">{focus ? focus.e.org : 'Career'}</span>
        <span className="tl-year">{heading}</span>
      </div>
      <div className="tl-stage" ref={stage} style={{ height: fit.height }}>
        <div aria-hidden="true">
          {years.map((yr) => (
            <span key={yr} className="tl-tick" style={{ top: y(yr * 12) }}>{yr}</span>
          ))}
          <span className="tl-axis" />
          {ENTRIES.map((entry, i) => {
            const s = startOf(entry.e);
            if (p < s) return null;
            return (
              <span
                key={'b' + i}
                className="tl-band"
                data-kind={entry.kind}
                data-dim={dimmed(entry)}
                style={{ top: y(s), height: h(s, Math.min(endOf(entry.e), p)), background: entry.tone }}
              />
            );
          })}
          {!zoomed &&
            [
              ...ENTRIES.flatMap((entry) => entry.e.roles.slice(0, -1).map((r) => ({ at: monthOf(r.start), entry, kind: 'role' }))),
              ...MARKERS.filter((m) => m.entry).map((m) => ({ at: m.at, entry: m.entry!, kind: 'project' })),
            ].map((d, i) => (
              <i
                key={'d' + i}
                className="tl-dot"
                data-kind={d.kind}
                data-on={p >= d.at || undefined}
                data-dim={dimmed(d.entry)}
                style={{ top: y(d.at), left: d.entry.dot }}
              />
            ))}
          {!done && <span className="tl-playhead" style={{ top: y(p) }} />}
        </div>

        {placed.map((it) => {
          const entryIndex = it.entry ? ENTRIES.indexOf(it.entry) : -1;
          const content = (
            <>
              {it.dot !== undefined && <i className="tl-dot" data-kind={it.kind} data-on style={{ left: it.dot }} />}
              <span className="tl-txt">
                {it.kind === 'name' ? (
                  <>
                    <strong>{it.text}</strong>
                    {zoomed && <em>{it.sub}</em>}
                  </>
                ) : (
                  it.text
                )}
              </span>
            </>
          );
          const common = {
            className: 'tl-item',
            'data-kind': it.kind,
            'data-edu': it.entry?.kind === 'edu' || undefined,
            'data-on': p >= it.at || undefined,
            'data-dim': dimmed(it.entry),
            style: { top: it.top },
          };
          if (done && it.kind === 'name' && !focus) {
            return (
              <button
                key={it.key}
                type="button"
                {...common}
                data-entry={entryIndex}
                aria-label={`Zoom into ${it.text}, ${span(it.entry!.e.roles.at(-1)!.start, it.entry!.e.roles[0].end)}`}
                onClick={() => zoomInto(it.entry!)}
              >
                {content}
              </button>
            );
          }
          if (done && it.marker && (!it.entry || it.entry === focus)) {
            const project = it.marker.project;
            return (
              <button key={it.key} type="button" {...common} aria-haspopup="dialog" onClick={(ev) => onOpenProject(project, ev.currentTarget)}>
                {content}
              </button>
            );
          }
          return (
            <span key={it.key} aria-hidden="true" {...common}>
              {content}
            </span>
          );
        })}

        {done && focus && (
          <button type="button" ref={back} className="label tl-back" onClick={zoomOut}>
            ← Full career
          </button>
        )}

      </div>
      </div>
        {/* Every caption is drawn for the whole clip, so its image or clip has
            loaded by the time it shows. Beside the frame on desktop, over its
            top on phones. */}
        <div className="tl-captions" aria-hidden="true">
        {!done &&
          MOMENTS.map((m, i) => {
            const on = f.moment === i;
            const media = m.project ? projectBySlug(m.project)?.images[0] : undefined;
            return (
              <div key={m.at} className="tl-caption" style={{ opacity: on ? f.fade : 0 }}>
                {media && (
                  <span className="tl-media">
                    <Media src={media} />
                  </span>
                )}
                <span className="label">{m.when}</span>
                <strong>{m.head}</strong>
                <span>{counted(m.text, on ? Math.min(f.held / 1500, 1) : 0)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* One line under the timeline, like the answer's Sources line. */}
      <div className="tl-meta">
      {!done && (
        <div className="tl-controls">
          <button type="button" className="label" onClick={playing ? pauseClip : () => play(tRef.current)}>
            {playing ? 'Pause ❚❚' : 'Play ▶'}
          </button>
          <button type="button" className="label" onClick={skip}>
            Skip to end ⏭
          </button>
        </div>
      )}
      {done && <span className="label tl-hint">{focus ? 'Tap a project to open it' : 'Tap a name to zoom in'}</span>}
        {done && !stillWanted(paused) && (
          <button type="button" className="label tl-replay" onClick={replay}>
            Replay ↺
          </button>
        )}
        <details>
          <summary className="label">See every role</summary>
          <Group list={CAREER} onOpenProject={onOpenProject} />
          <span className="label tl-edu-head">Education & certifications</span>
          <Group list={EDUCATION} onOpenProject={onOpenProject} />
          <span className="label tl-edu-head">Personal projects</span>
          <div className="tl-list">
            <div className="chips" role="group" aria-label="Personal projects">
              {MARKERS.filter((m) => !m.entry).map((m) => (
                <button type="button" key={m.project.slug} aria-haspopup="dialog" onClick={(ev) => onOpenProject(m.project, ev.currentTarget)}>
                  {m.project.title}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
