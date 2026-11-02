// Unit tests for the free answer checks in lib/eval-checks.ts: npm test.
// T1.8 cases are the ones the backend measured its pattern on (answer-gaps
// findings, 2026-11-01): one true positive, and grounded hedges that must pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speculationSpans } from '../lib/eval-checks.ts';

test('T1.8 catches the M05 turn 2 hedge', () => {
  const ans =
    'She enabled lead generation tools, which likely supported loyalty indirectly ' +
    'through improved customer relationships and engagement [exp-029].';
  assert.deepEqual(speculationSpans(ans), ['which likely']);
});

test('T1.8 catches a guess at her current work', () => {
  assert.deepEqual(speculationSpans('Her role likely focuses on digital strategies.'), [
    'likely focuses',
  ]);
  assert.deepEqual(speculationSpans('She probably led the rollout.'), ['She probably']);
});

test('T1.8 passes grounded counterfactuals and facts', () => {
  for (const ans of [
    'A points program would have added a permanent liability.',
    'Repeat customers were twice as likely to buy again.',
    'The migration may have been the largest project on the platform.',
  ]) {
    assert.deepEqual(speculationSpans(ans), [], ans);
  }
});

test('T1.8 is stateless across calls (global flag)', () => {
  const ans = 'This likely helped. It probably did.';
  assert.equal(speculationSpans(ans).length, 2);
  assert.equal(speculationSpans(ans).length, 2);
});
