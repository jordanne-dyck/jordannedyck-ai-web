// Unit tests for E.2 citation placement: npm test (node --test, which loads
// the .ts files with Node's built-in type stripping; Node 22.18+).
//
// Each case runs the server's path and the client's on one cited answer:
// parseCitations + buildSources on the raw text, as route.ts does, then
// placeMarkers on the stripped text the visitor's stream carries, as page.tsx
// does. The placed markdown is printed so placement can be read, not just
// counted.
//
// Real saved answers (eval answer_cited, same prompt as the site) are read from
// nimbalyst-local/fixtures/cited-answers.json when it exists. That folder is
// gitignored: the answers are unpublished and were not checked against the
// private-names list, so they stay out of this public repo. Without the file
// only the synthetic cases below run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildSources, parseCitations, stripCitations } from '../lib/citations.ts';
import { placeMarkers, SOURCE_HREF } from '../lib/citation-markers.ts';

const MARKER_RE = new RegExp(String.raw`(?:&#8203;)?\[\d+\]\(${SOURCE_HREF}\d+\)`, 'g');

// Titles as the index has them: several chunks share one file title.
const TITLES = {
  'ops-002': 'How I Operate - Systems Thinking, Ownership and Judgment',
  'ops-009': 'How I Operate - Systems Thinking, Ownership and Judgment',
  'ecom-001': 'Ecommerce Platform and Operations',
  'tiktok-001': 'TikTok Shop Integration',
};
const chunksFor = (raw) =>
  [...new Set(parseCitations(raw).citedIds)].map((id) => ({ chunk_id: id, title: TITLES[id] ?? `Title of ${id}` }));

function run(raw, chunks = chunksFor(raw)) {
  const { segments } = parseCitations(raw);
  const data = buildSources(segments, chunks);
  const visible = stripCitations(raw);
  const placed = placeMarkers(visible, data.segments);
  return { data, visible, placed };
}

// Invariants on every answer: the markers are the only change to the text,
// every segment is found, every listed source is marked somewhere, no marker
// starts a line (which would break a list item or heading), and no line that
// has cited segments ends its last one without a marker.
function checkPlacement(name, raw) {
  const { data, visible, placed } = run(raw);
  console.log(`\n--- ${name}: ${data.segments.length} cited segments, ${placed.placed} markers, ${placed.missed} missed, ${data.sources.length} sources`);
  console.log(placed.text);
  assert.equal(placed.text.replace(MARKER_RE, ''), visible, 'markers are the only change');
  assert.equal(placed.missed, 0, 'every cited segment is placed');
  assert.ok(placed.placed <= data.segments.length);
  for (const s of data.sources) {
    assert.ok(placed.text.includes(`(${SOURCE_HREF}${s.n})`), `source ${s.n} has no marker`);
  }
  for (const line of placed.text.split('\n')) {
    assert.ok(!/^\s*(?:&#8203;)?\[\d+\]\(/.test(line), `marker starts a line: ${line}`);
  }
  return { data, placed };
}

test('a run of sentences citing the same source gets one marker, after the last', () => {
  const { placed } = checkPlacement('run', 'One. [ops-002] Two. [ops-009] Three. [ecom-001]');
  // ops-002 and ops-009 share a title, so the first two sentences are one run.
  assert.equal(placed.text, `One. Two.[1](${SOURCE_HREF}1) Three.[2](${SOURCE_HREF}2)`);
});

// parseCitations gives text before a citation to that citation's segment, so
// within a line the parser never leaves uncited text between two segments.
// This guards the case where the segments and the visible text differ.
test('a run ends at text no segment covers, so that text is not marked', () => {
  const placed = placeMarkers('One. Gap, not in the record. Two.', [
    { text: 'One.', n: [1] },
    { text: 'Two.', n: [1] },
  ]);
  assert.equal(placed.text, `One.[1](${SOURCE_HREF}1) Gap, not in the record. Two.[1](${SOURCE_HREF}1)`);
});

test('a run ends at a new line: each list item keeps its marker', () => {
  const { placed } = checkPlacement('run broken by line', '- One. [ops-002]\n- Two. [ops-002] Three. [ops-002]\n\nFour. [ops-002]');
  assert.equal(
    placed.text,
    `- One.[1](${SOURCE_HREF}1)\n- Two. Three.[1](${SOURCE_HREF}1)\n\nFour.[1](${SOURCE_HREF}1)`,
  );
});

test('citation after the full stop: marker after it', () => {
  const { placed } = checkPlacement('after stop', 'She built an innovation lab. [ops-009] It shipped.');
  assert.equal(placed.text, `She built an innovation lab.[1](${SOURCE_HREF}1) It shipped.`);
});

test('citation before the full stop: marker moves past it', () => {
  const { placed } = checkPlacement('before stop', 'She built a lab [ops-009]. Then more.');
  assert.equal(placed.text, `She built a lab.[1](${SOURCE_HREF}1) Then more.`);
});

test('chunks sharing a title share a number; numbers follow first citation', () => {
  const { data, placed } = checkPlacement(
    'shared title',
    'TikTok went to $30M. [tiktok-001] She owned the P&L. [ops-002, ecom-001] And ran it. [ops-009]',
  );
  assert.deepEqual(data.sources, [
    { n: 1, title: TITLES['tiktok-001'] },
    { n: 2, title: TITLES['ops-002'] },
    { n: 3, title: TITLES['ecom-001'] },
  ]);
  assert.deepEqual(data.segments.map((s) => s.n), [[1], [2, 3], [2]]);
  assert.match(placed.text, /P&L\.\[2\]\(#source-2\)\[3\]\(#source-3\)/);
});

test('ids not retrieved this turn are dropped, and so are their segments', () => {
  const raw = 'Real claim. [ops-002] Invented claim. [made-up-001]';
  const { data, placed } = run(raw, [{ chunk_id: 'ops-002', title: 'How I Operate' }]);
  assert.deepEqual(data.sources, [{ n: 1, title: 'How I Operate' }]);
  assert.equal(data.segments.length, 1);
  assert.equal(placed.text, `Real claim.[1](${SOURCE_HREF}1) Invented claim.`);
});

test('visitor payload carries titles and answer text only, no ids', () => {
  const { data } = run('A claim. [ops-002] Another. [ecom-001]');
  const json = JSON.stringify(data);
  assert.ok(!/ops-002|ecom-001/.test(json), json);
  assert.deepEqual(Object.keys(data).sort(), ['segments', 'sources']);
});

test('markdown heading, bold heading and list items', () => {
  checkPlacement(
    'heading + list',
    [
      '## What she owned',
      '',
      '**Commerce**',
      '',
      '- **eCommerce P&L**, run at **$150M+** in DTC revenue. [ops-002]',
      '- The platform layer [ecom-001].',
      '1. TikTok Shop, from zero to **$30M**. [tiktok-001]',
      '',
      'She runs it end to end. [ops-002]',
    ].join('\n'),
  );
});

test('a segment that does not match: no marker for it, others still placed', () => {
  const { data } = run('First claim. [ops-002] Second claim. [ecom-001]');
  // The model's text and the parsed segment differ, e.g. a reworded stream.
  const placed = placeMarkers('First claim. Second claim, reworded.', data.segments);
  assert.equal(placed.placed, 1);
  assert.equal(placed.missed, 1);
  assert.equal(placed.text, `First claim.[1](${SOURCE_HREF}1) Second claim, reworded.`);
});

test('no marker inside a link or inline code', () => {
  const segments = [
    { text: 'See [the post', n: [1] },
    { text: 'run `npm', n: [2] },
  ];
  const placed = placeMarkers('See [the post](https://x.y) and run `npm test` now.', segments);
  assert.equal(placed.placed, 0);
  assert.equal(placed.missed, 2);
  assert.equal(placed.text, 'See [the post](https://x.y) and run `npm test` now.');
});

test('after "!" a zero-width space keeps the marker from parsing as an image', () => {
  const { placed } = checkPlacement('exclamation', 'It worked! [ops-002] Next.');
  assert.equal(placed.text, `It worked!&#8203;[1](${SOURCE_HREF}1) Next.`);
});

const FIXTURES = new URL('../nimbalyst-local/fixtures/cited-answers.json', import.meta.url);
const saved = existsSync(FIXTURES) ? JSON.parse(readFileSync(FIXTURES, 'utf8')) : [];
test('saved answers (local fixtures)', { skip: saved.length ? false : 'no local fixtures' }, async (t) => {
  for (const a of saved) {
    await t.test(`${a.id} run ${a.run} (${a.shape.join('+')})`, () => {
      checkPlacement(`${a.id} run ${a.run}`, a.answer_cited);
    });
  }
});
