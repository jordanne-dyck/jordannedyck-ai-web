'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CAREER, EDUCATION, END_ON, MOMENTS, SHORT_PROJECT, SIDE_PROJECTS, type Employer } from '@/lib/timeline';
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
// The entries shown with this one (zoomWith): zooming into it takes them in.
const withOf = (entry: Entry) => ENTRIES.filter((x) => x.e.zoomWith === entry.e.org);
const zoomable = (e: Employer) => e.zoom !== false && !e.zoomWith;
// The earliest start of an entry and the entries shown with it.
const firstOf = (entry: Entry) => Math.min(...[entry, ...withOf(entry)].map((x) => startOf(x.e)));
// The entry the clip ends zoomed into.
const END_ENTRY = ENTRIES.find((x) => x.e.org === END_ON) ?? null;

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
// A year above the first start, so its name sits clear of the frame's faded top
// edge, and room under today for the last names, which the layout pushes down.
const FULL: [number, number] = [FIRST - 12, NOW + 20];
// Where the clip ends: zoomed into END_ON.
const END_VIEW: [number, number] = END_ENTRY ? viewOf(END_ENTRY) : FULL;

// The script: the playhead runs from the first start to today. The camera (the
// stretch of months in view) starts close on the first years and follows it
// down, zooms into each moment and holds while its caption shows, then ends
// zoomed into END_ON (DECIEM). About 25 seconds, paced for reading: each caption
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
  segs.push({ dur: 1500, p: [p, NOW], cam: [cam, END_VIEW] });
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
  return { p: NOW, top: END_VIEW[0], bottom: END_VIEW[1], moment: undefined, fade: 0, held: 0 };
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

// Where to zoom for an entry: its whole span and that of the entries shown with
// it, at least 18 months, ending no later than today.
function viewOf(entry: Entry): [number, number] {
  const s = firstOf(entry);
  const end = Math.max(...[entry, ...withOf(entry)].map((x) => endOf(x.e)));
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
// chosen moments, and it ends zoomed into DECIEM (END_ON), which may be the only
// section a visitor opens (Jordanne, 2026-11-04). It starts when half of it is
// on screen; with paused or reduced motion it shows the end straight away.
//
// Afterwards a name can be tapped to zoom into that job or school. Zoomed in,
// its projects are buttons that open their panel, and the wheel (not a drag on
// a phone) moves along the years at the same zoom. A name with zoom: false
// (University of Toronto) or zoomWith (University of Guelph, shown with early
// career) is plain text. "Full career" in the header, the name again, an
// empty part of the frame or Esc zooms back out (decided 2026-11-04).
// Personal projects open from any view.
export function Timeline({
  explicit,
  paused,
  ready,
  onOpenProject,
}: {
  explicit: boolean;
  paused: boolean;
  ready: boolean;
  onOpenProject: (project: Project, opener: HTMLElement) => void;
}) {
  const [t, setT] = useState(() => (stillWanted(paused) ? TOTAL : 0));
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(t);
  // After the clip: the view, and the entry zoomed into (null for the full
  // view). The clip ends zoomed into END_ON.
  const [cam, setCam] = useState<[number, number]>(END_VIEW);
  const [focus, setFocus] = useState<Entry | null>(END_ENTRY);
  // The frame's height in pixels, set to fit the visible space. It is also the
  // time scale: the camera's months span this many pixels. After the clip the
  // frame can grow below it to fit the rows, without changing the scale.
  const [fit, setFit] = useState(visibleSpace);
  const height = fit.height;
  const [tallest, setTallest] = useState(0);
  const camRef = useRef<[number, number]>(END_VIEW);
  const stage = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  // The entry last zoomed into, so focus can go back to its name.
  const zoomedFrom = useRef<Entry | null>(END_ENTRY);
  // Where keyboard focus goes after the next zoom: set by a tap, not the wheel.
  const focusNext = useRef<'back' | 'name' | null>(null);
  const raf = useRef(0);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    track({ name: 'timeline_shown', props: { explicit } });
  }, [explicit]);

  useEffect(() => {
    // Only a change of width (a turned phone, a resized window) refits. A
    // phone's address bar changes the height alone as the page scrolls, and
    // refitting then re-spaced the whole frame mid-scroll.
    let width = innerWidth;
    const onResize = () => {
      if (innerWidth === width) return;
      width = innerWidth;
      setFit(visibleSpace());
    };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
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
    if (!el || !ready) return;
    // Starts once most of the frame (60%) is in view between the bar and the
    // question box, and only after the answer has finished arriving: the
    // timeline can arrive before the text above it, which then pushes it down
    // (seen on a phone, 2026-11-04). Captions sit at its top or beside it, so
    // a lower edge still behind the question box hides nothing that matters.
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
  }, [play, ready]);

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
    focusNext.current = 'back';
    setFocus(entry);
    moveTo(viewOf(entry));
  };
  const zoomOut = () => {
    focusNext.current = 'name';
    setFocus(null);
    moveTo(FULL);
  };

  // The wheel, zoomed in: moves the view along the years. At either end of
  // her career, or in the full view, the page scrolls as usual. A native
  // listener, as React's can't stop the page scrolling. A drag on a phone
  // always scrolls the page: the frame fills most of the screen, so panning
  // on a drag took over scrolling back up the page (decided 2026-11-04).
  const pan = useRef<(dy: number) => boolean>(() => false);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      const h = el.clientHeight;
      const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * h : ev.deltaY;
      if (pan.current(dy)) ev.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const replay = () => {
    camRef.current = END_VIEW;
    setCam(END_VIEW);
    setFocus(END_ENTRY);
    zoomedFrom.current = END_ENTRY;
    tRef.current = 0;
    setT(0);
    play();
  };

  // Keyboard focus follows the zoom: onto "Full career" going in, back to the
  // name going out. The name buttons are drawn again on the way out, so the
  // button is found by its entry. Moving with the wheel leaves focus alone.
  // preventScroll: moving focus must not scroll the page.
  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    if (next === 'back') back.current?.focus({ preventScroll: true });
    else if (next === 'name' && zoomedFrom.current) {
      const i = ENTRIES.indexOf(zoomedFrom.current);
      stage.current?.querySelector<HTMLElement>('[data-entry="' + i + '"]')?.focus({ preventScroll: true });
    }
  }, [focus]);

  const done = t >= TOTAL;
  const f = frame(t);
  const p = done ? NOW : f.p;
  const [top, bottom] = done ? cam : [f.top, f.bottom];
  // In pixels, not percentages, so a frame grown to fit its rows shows later
  // months below rather than stretching the years.
  const px = (m: number) => ((m - top) / (bottom - top)) * height;
  const y = (m: number) => `${px(m)}px`;
  const h = (a: number, b: number) => `${(Math.max(b - a, 0.6) / (bottom - top)) * height}px`;
  // Role titles and project names only fit when zoomed in. 110 months takes in
  // early career with Guelph.
  const zoomed = bottom - top < 110;
  // After the clip, any view but the full one: zoomed into a name, or moved
  // along with the wheel since.
  const away = done && (focus !== null || cam[0] !== FULL[0] || cam[1] !== FULL[1]);
  // A mouse or trackpad, where the wheel moves along the years.
  const wheel = typeof window !== 'undefined' && matchMedia('(pointer: fine)').matches;
  const firstYear = Math.floor(FIRST / 12);
  const heading = !done
    ? String(Math.floor(p / 12))
    : focus
      ? `${Math.floor(firstOf(focus) / 12)} – ${focus.e.roles[0].end ? focus.e.roles[0].end.slice(0, 4) : 'today'}`
      : away
        ? `${Math.max(Math.ceil(top / 12), firstYear)} – ${bottom >= NOW ? 'today' : Math.floor(bottom / 12)}`
        : `${firstYear} – today`;

  useEffect(() => {
    // Moves the view by `dy` pixels; false when it can't move (the page
    // scrolls instead).
    pan.current = (dy) => {
      const [from, to] = camRef.current;
      if (!away) return false;
      const span = to - from;
      const next = Math.min(Math.max(from + (dy / height) * span, Math.min(FULL[0], from)), Math.max(FULL[1], to) - span);
      if (next === from) return false;
      cancelAnimationFrame(raf.current);
      const c: [number, number] = [next, next + span];
      camRef.current = c;
      setCam(c);
      // Moving along leaves the job zoomed into: nothing is dimmed, every
      // project in view opens, and the header shows the years in view.
      if (focus) setFocus(null);
      return true;
    };
  });

  // The text on the frame. Zoomed out: names and personal projects, with
  // role changes and job projects as bare dots. Zoomed in: everything titled.
  // After the clip, what can be tapped is a row 44px tall with its gap (ask 3,
  // 2026-11-04), and role titles become dividers, so the heights grow. The
  // name is the employer alone; its first role is a divider like the others,
  // so the button doesn't mix an employer with a title (Jordanne, 2026-11-04).
  const items: Item[] = ENTRIES.map((entry, i) => ({
    key: 'n' + i,
    kind: 'name',
    at: startOf(entry.e),
    height: done ? 36 : 18,
    entry,
    text: entry.e.org,
  }));
  if (zoomed) {
    ENTRIES.forEach((entry) =>
      entry.e.roles.forEach((r) =>
        items.push({ key: 'r' + r.title + r.start, kind: 'role', at: monthOf(r.start), height: done ? 28 : 20, entry, text: r.short ?? r.title, dot: entry.dot }),
      ),
    );
  }
  MARKERS.forEach((m) => {
    if (zoomed || !m.entry) {
      items.push({
        key: 'p' + m.project.slug,
        kind: 'project',
        at: m.at,
        height: done ? 44 : 24,
        entry: m.entry,
        text: SHORT_PROJECT[m.project.slug] ?? m.project.title,
        dot: m.entry ? m.entry.dot : AXIS_DOT,
        marker: m,
      });
    }
  });
  const placed = place(items, px);
  // Only after the clip: focus is already END_ON while it plays.
  const dimmed = (entry: Entry | null) =>
    (done && focus !== null && entry !== focus && entry?.e.zoomWith !== focus.e.org) || undefined;
  // After the clip, the frame grows to fit the rows dated in view: zoomed
  // into DECIEM, nine project rows need more than a phone's frame. Dimmed
  // rows don't count. The years carry on below at the same scale.
  // While moving along with the wheel it only grows, so the page below doesn't
  // jump on every step; zooming back out resets it.
  const fits = done
    ? Math.max(
        height,
        ...placed
          .filter((it) => !dimmed(it.entry) && px(it.at) >= 0 && px(it.at) < height)
          .map((it) => Math.ceil(it.top + it.height + 8)),
      )
    : height;
  // Kept in state, adjusted while rendering (React's pattern for state that
  // follows a render's own values), not in an effect.
  const keep = away ? Math.max(tallest, fits) : 0;
  if (keep !== tallest) setTallest(keep);
  const frameHeight = Math.max(fits, keep);
  const shownBottom = top + (frameHeight / height) * (bottom - top);
  const step = (bottom - top) / 12 > 10 ? 2 : 1;
  const years: number[] = [];
  for (let yr = Math.ceil(top / 12); yr * 12 < Math.min(shownBottom - 1, NOW + 1); yr++) if (yr % step === 0) years.push(yr);
  // Projects that open: personal ones always; a job's when zoomed into it, or
  // when moved along with the wheel, where nothing is dimmed.
  const opens = (it: Item) => done && !!it.marker && (!it.entry || it.entry === focus || (zoomed && !focus));
  // Zoomed in with no project to open in view (early career): no hint, as
  // "Tap a project" would point at nothing (Jordanne, 2026-11-05).
  const projectInView = placed.some((it) => opens(it) && it.top + it.height > 0 && it.top < frameHeight);

  return (
    <section
      className="timeline"
      aria-label="Career timeline"
      onKeyDown={(ev) => {
        if (ev.key === 'Escape' && away) {
          ev.stopPropagation();
          zoomOut();
        }
      }}
    >
      <div className="tl-body">
      <div className="tl-main">
      {/* Sticks just under the page's fixed bar, so the way back stays in view */}
      <div className="tl-top" style={{ top: fit.bar }}>
        <span className="tl-where">
          {away && (
            <button type="button" ref={back} className="label tl-back" onClick={zoomOut}>
              ← Full career
            </button>
          )}
          {/* Zoomed in, the frame names the job; the header has no room for both. */}
          {!away && <span className="label">Career</span>}
        </span>
        <span className="tl-year">{heading}</span>
      </div>
      {/* Zoomed in, a click on an empty part of the frame zooms back out. Mouse
          only: the header button and Esc do the same from the keyboard. */}
      <div
        className="tl-stage"
        ref={stage}
        style={{ height: frameHeight }}
        data-away={away || undefined}
        data-done={done || undefined}
        onClick={(ev) => {
          if (away && !(ev.target as HTMLElement).closest('button')) zoomOut();
        }}
      >
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
                  <strong>{it.text}</strong>
                ) : (
                  <span>{it.text}</span>
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
            // The row's dot takes its band's colour.
            style: { top: it.top, '--tone': it.entry?.tone ?? 'var(--soft)' } as CSSProperties,
          };
          if (done && it.kind === 'name' && it.entry !== focus && zoomable(it.entry!.e)) {
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
          // Zoomed into a name, its name again zooms back out.
          if (done && it.kind === 'name' && it.entry === focus) {
            return (
              <button key={it.key} type="button" {...common} data-entry={entryIndex} data-back aria-label="Back to the full career" onClick={zoomOut}>
                {content}
              </button>
            );
          }
          if (it.marker && opens(it)) {
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
                  <span className="tl-media" data-still={!media.endsWith('.mp4') || undefined}>
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
      {/* A second way back under the frame, near the thumb: on a phone the
          header row can sit under the page's fixed bar. */}
      {away && (
        <button type="button" className="label tl-out" onClick={zoomOut}>
          ← Full career
        </button>
      )}
      {done && (!away || projectInView) && (
        <span className="label tl-hint">
          {away ? 'Tap a project to open it' : 'Tap a name to zoom in'}
          {away && wheel && ' · scroll to move along'}
        </span>
      )}
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
