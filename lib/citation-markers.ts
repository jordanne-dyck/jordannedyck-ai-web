// Places source markers in a finished answer (E.2). The visitor's text never
// carries citations, so the data-sources part lists each cited segment's text
// and source numbers, and this finds the segments in the answer, in order, and
// inserts a markdown link per number: "…lab.[1](#source-1)". page.tsx renders
// those links as superscripts that jump to the sources list.
//
// One marker per run (decided 2026-11-01): consecutive segments citing the same
// sources share one marker, after the last of them. A run ends at a line break
// (a new paragraph, list item or heading), at a change of sources, or at any
// uncited text between two segments, so uncited text never reads as sourced.
//
// A segment that cannot be found (the stream and the parsed text differ) ends
// the run and gets no marker; so does a run whose end falls inside a link or
// inline code. The sources list still shows, so the fallback is the list alone.
// Pure, with no runtime imports, so node --test can load it directly
// (scripts/citation-markers.test.mjs).

export const SOURCE_HREF = '#source-';

export type MarkerSegment = { text: string; n: number[] };

// Punctuation that closes a sentence the citation came before: "lab [x]." is
// parsed as "lab" and ".", and the marker belongs after the full stop.
const TRAILING_RE = /^[.,;:!?)]+/;

export function placeMarkers(
  answer: string,
  segments: MarkerSegment[],
): { text: string; placed: number; missed: number } {
  const inserts: { at: number; marker: string }[] = [];
  let missed = 0;
  // The open run: its sources and where its last segment ends.
  let run: { key: string; n: number[]; at: number } | null = null;
  const close = () => {
    if (!run) return;
    if (safeToInsert(answer, run.at)) {
      // After "!" the link would parse as an image, which the renderer drops; a
      // zero-width space entity keeps them apart.
      const sep = answer[run.at - 1] === '!' ? '&#8203;' : '';
      inserts.push({ at: run.at, marker: sep + run.n.map((n) => `[${n}](${SOURCE_HREF}${n})`).join('') });
    } else {
      missed++;
    }
    run = null;
  };

  let cursor = 0;
  for (const s of segments) {
    if (!s.text || !s.n.length) continue;
    const idx = answer.indexOf(s.text, cursor);
    if (idx < 0) {
      close();
      missed++;
      continue;
    }
    let at = idx + s.text.length;
    at += answer.slice(at).match(TRAILING_RE)?.[0].length ?? 0;
    const key = s.n.join(',');
    // Same sources, and only spaces since the run's last segment on this line.
    if (run && run.key === key && !/\S|\n/.test(answer.slice(run.at, idx))) {
      run.at = at;
    } else {
      close();
      run = { key, n: s.n, at };
    }
    cursor = at;
  }
  close();

  let text = answer;
  for (const { at, marker } of inserts.reverse()) {
    text = text.slice(0, at) + marker + text.slice(at);
  }
  return { text, placed: inserts.length, missed };
}

// False inside inline code, link text or a link URL on the same line, or
// after a backslash escape, where a link would not render as one.
function safeToInsert(answer: string, at: number): boolean {
  const line = answer.slice(answer.lastIndexOf('\n', at - 1) + 1, at);
  if ((line.match(/`/g)?.length ?? 0) % 2) return false;
  if (line.lastIndexOf('[') > line.lastIndexOf(']')) return false;
  if (line.lastIndexOf('](') > line.lastIndexOf(')')) return false;
  if (line.endsWith('\\')) return false;
  return true;
}
