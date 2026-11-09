// Unit tests for the trace's lines (lib/trace.ts) and the release-gate
// sentence (lib/release-gate.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileCount, MAX_CHARS, stopLine } from '../lib/trace.ts';
import { MAX_USER_MESSAGE_CHARS } from '../lib/chat-input.ts';
import { gateSentence, newestWebEvidence, summarizeEvidence } from '../lib/release-gate.ts';

const base = {
  hourly: 4, daily: 9, chars: 33, rewritten: null, search: 'ok', passages: 5, files: 3, searchMs: 142, answer: 'model',
};

test('the trace quotes the limit the server applies', () => {
  assert.equal(MAX_CHARS, MAX_USER_MESSAGE_CHARS);
});

test('stop 1: the question count, when there is one', () => {
  assert.equal(stopLine(0, base).text, 'Question 4 of 20 this hour. 33 of 2,000 characters.');
  assert.equal(stopLine(0, { ...base, hourly: null }).text, '33 of 2,000 characters.');
});

test('stop 2: rewrite, passages and files, timing', () => {
  assert.equal(stopLine(1, base).text, '5 passages from 3 files, in 142 ms.');
  assert.equal(
    stopLine(1, { ...base, rewritten: 'What did Jordanne do at DECIEM?', passages: 1, files: 1 }).text,
    'Searched as "What did Jordanne do at DECIEM?". 1 passage from 1 file, in 142 ms.',
  );
  assert.equal(stopLine(1, { ...base, passages: 0, files: 0 }).text, 'No passages matched, in 142 ms.');
  assert.equal(stopLine(1, { ...base, search: 'error' }).text, 'Search failed.');
  const long = stopLine(1, { ...base, rewritten: 'x'.repeat(300) }).text;
  assert.ok(long.length < 220, long);
});

test('stops 3 and 4: a model answer is written and judged', () => {
  assert.equal(stopLine(2, base).text, 'gpt-4o, writing now.');
  assert.equal(stopLine(2, { ...base, firstWordMs: 1880 }).text, 'gpt-4o. First word 1.9 s after you asked.');
  assert.equal(stopLine(2, base).skipped, undefined);
  assert.equal(stopLine(3, base).skipped, undefined);
});

test('stops 3 and 4: a fixed answer skips both, and says why', () => {
  const fixed = { ...base, answer: 'fixed' };
  assert.equal(stopLine(2, fixed).skipped, true);
  assert.match(stopLine(2, fixed).text, /Jordanne wrote this answer herself/);
  assert.equal(stopLine(3, fixed).skipped, true);
  assert.equal(stopLine(4, fixed), null);
});

test('files are counted once each', () => {
  assert.equal(fileCount([{ filename: 'a.md' }, { filename: 'a.md' }, { filename: 'b.md' }]), 2);
  assert.equal(fileCount([{ filename: null }, { filename: null }]), 2);
});

test('the newest web evidence is picked by version', () => {
  assert.equal(
    newestWebEvidence(['jordbot-web-v1.9.json', 'jordbot-web-v1.16.json', 'faiss-kb-1.json', 'jordbot-v2.0.json']),
    'jordbot-web-v1.16.json',
  );
  assert.equal(newestWebEvidence(['faiss-kb-1.json']), null);
});

test('the gate sentence from the real newest evidence file', () => {
  const dir = new URL('../releases/', import.meta.url);
  const file = newestWebEvidence(readdirSync(dir));
  const summary = summarizeEvidence(JSON.parse(readFileSync(new URL(file, dir), 'utf8')));
  assert.ok(summary, file);
  const s = gateSentence(JSON.stringify(summary));
  console.log(`  ${file}: ${s}`);
  assert.match(s, /^In the release gate for v\d+\.\d+ \(\d{1,2} [A-Z][a-z]{2} \d{4}\), \d+ of \d+ single questions/);
  // Counts, not a rate: the story keeps rates out (build-story.test.mjs).
  assert.doesNotMatch(s, /0\.\d|pass rate|%/);
});

test('no sentence from a failed or incomplete gate', () => {
  assert.equal(summarizeEvidence({ status: 'fail', tag: 'v1.0', generated: '2026-01-01', evals: {} }), null);
  assert.equal(summarizeEvidence({ status: 'pass', tag: 'v1.0', generated: '2026-01-01', evals: { single: { answers: 3, all_checks_pass_rate: 1 } } }), null);
  assert.equal(gateSentence(''), null);
  assert.equal(gateSentence(undefined), null);
  assert.equal(gateSentence('not json'), null);
});
