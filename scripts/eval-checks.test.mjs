// Unit tests for the free answer checks in lib/eval-checks.ts: npm test.
// T1.8 cases are the ones the backend measured its pattern on (answer-gaps
// findings, 2026-11-01): one true positive, and grounded hedges that must pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapAdmitted, speculationSpans } from '../lib/eval-checks.ts';
import { parseCitations, stripCitations, stripCitationsTransform } from '../lib/citations.ts';

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

// Gap rules, ported from jordannedyck-ai selftest.py "gap rules: facts are not
// gaps" (2026-11-08, bug_1794167236506_5t0gvr): every false match in 3,106
// stored answers, the 2026-11-07 review's examples, then real admissions the
// narrowing must keep.
const GAP_CASES = [
  ["W03 'the customer does not have to' is not a gap",
    'She absorbs messy backend systems so the customer does not have to navigate it.', false],
  ["W03 'customers don't have to' is not a gap",
    "She takes on that complexity, so customers don't have to navigate it.", false],
  ["W09 'most people don't have' is not a gap",
    "Community bonds required a level of financial expertise most people don't have.", false],
  ["W09 'individuals do not have' is not a gap",
    'Community bonds require financial expertise that most everyday individuals do not have.', false],
  ["W09 'ESG portfolios don't show' is not a gap",
    "85% of investors see greenwashing as a problem, because ESG portfolios don't show what the money funds.", false],
  ["W12 'a problem that doesn't address' is not a gap",
    "This helps her avoid writing requirements against a reported problem that doesn't address the actual challenge.",
    false],
  ["W11 'projects that didn't show potential' is not a gap",
    "She kept what proved valuable and discarded projects that didn't show potential.", false],
  ["X01 'not something built for the channel' is not a gap",
    'You build something the channel can draw from, not something built for the channel.', false],
  ["review: 'kept no record of churn' is not a gap", 'The business kept no record of churn.', false],
  ["review: 'The Ordinary doesn't appear in department stores' is not a gap",
    "The Ordinary doesn't appear in department stores.", false],
  // Known limit: indistinguishable from G01's real "these programs did not
  // include cash-back specifically".
  ["known limit: 'the migration did not include payments' still reads as a gap",
    'The migration did not include payments.', true],
  ["kept: G01 'these programs did not include cash-back'",
    'While these programs did not include cash-back specifically, they involved similar mechanics.', true],
  ["kept: M05 'The context retrieved for this turn does not cover'",
    'The context retrieved for this turn does not cover additional retention projects.', true],
  ["kept: M09 'The context you see does not cover'",
    'The context you see does not cover experience at a Canadian bank.', true],
  ["kept: A03 'The system instructions I'm working from don't include'",
    "The system instructions I'm working from don't include contact details.", true],
  ["kept: 'I don't have'", "I don't have Jordanne's phone number, but you can reach her by email.", true],
  ["kept: 'She does not have direct experience'",
    'She does not have direct experience designing standalone cash-back programs.', true],
  ["kept: 'There is no record of'", 'There is no record of her serving as a CTO.', true],
  ["kept: 'do not appear in her record'", 'Cash-back rewards do not appear in her record.', true],
  ["kept: 'is not something the material says'",
    'Financial inclusion is not something the available material says she worked on.', true],
  ["a refusal 'isn't something I can share' is not a gap", "Her phone number isn't something I can share here.",
    false],
];

for (const [name, ans, want] of GAP_CASES) {
  test(`gap rules: ${name}`, () => {
    assert.equal(gapAdmitted(ans), want, ans);
  });
}

// Citation markers in any case (2026-11-08), as selftest.py.
test("citations: '[Exp-001]' is stripped from what a visitor sees", () => {
  assert.equal(stripCitations('She led the move. [Exp-001]'), 'She led the move.');
});

test("citations: '[Exp-001]' counts as a citation of exp-001", () => {
  assert.deepEqual(parseCitations('She led the move. [Exp-001, ops-009]').citedIds, ['exp-001', 'ops-009']);
});

test('citations: a capitalised marker split across stream chunks is held, then stripped', async () => {
  const sink = { raw: '' };
  const parts = ['She led the move. [Ex', 'p-0', '01] Then more.'].map((text) => ({ type: 'text-delta', id: 't1', text }));
  const out = [];
  await new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    },
  })
    .pipeThrough(stripCitationsTransform(sink)())
    .pipeTo(new WritableStream({ write: (p) => out.push(p.text) }));
  assert.equal(out.join(''), 'She led the move. Then more.');
  assert.ok(!out.some((t) => /\[/.test(t)), JSON.stringify(out));
});
