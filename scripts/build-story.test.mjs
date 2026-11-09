// Unit tests for when an answer gets the build story, and its fixed lead (lib/build-story.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  asksForBuildStory, splitAtStory, STOPS, STORY_CARD, storyLead, STORY_MARKER, STORY_REPLAY, storyFromCard, withoutStoryMarker,
} from '../lib/build-story.ts';
import { asksForOverview, asksForTimeline } from '../lib/timeline.ts';
import { SUGGESTED_QUESTIONS } from '../lib/suggested-questions.ts';
import { projectBySlug } from '../lib/projects.ts';

const STORY_LEAD = storyLead(null);

// The must / must-not table in the plan (nimbalyst-local/plans/build-story.md, section 1).
const MUST = [
  'How did Jordanne build this site?',
  'How was jordannedyck.com built?',
  'How was this chatbot built?',
  'How was this website built?',
  'How was this site built?',
  'Tell me about jordannedyck.com',
  'Tell me about jordbot',
  'How does jordbot work?',
  "What's the architecture behind this site?",
  'How is this AI resume built?',
  'How were you built?',
];
const MUST_NOT = [
  'What did Jordanne build herself, hands on keyboard?',
  'What is FundLocal and why did Jordanne build it?',
  'How did Regimen Builder help new customers know where to start?',
  'How did she build the AI Personal Shopper?',
  'How did she build it?',
  "Walk me through Jordanne's career.",
  'Show me her timeline.',
  'Is Jordanne available to build a site for us?',
  'Could she build a website for my brand?',
  'What is the instinct that drives Jordanne to build?',
  "What is Jordanne's process for moving from concept to production?",
];

test('story questions match', () => {
  for (const q of MUST) {
    console.log(`  ${q} -> ${asksForBuildStory(q)}`);
    assert.equal(asksForBuildStory(q), true, q);
  }
});

test('other questions do not', () => {
  for (const q of MUST_NOT) {
    console.log(`  ${q} -> ${asksForBuildStory(q)}`);
    assert.equal(asksForBuildStory(q), false, q);
  }
});

test('suggested question [1] is the story, and only it', () => {
  assert.equal(SUGGESTED_QUESTIONS[1], 'How did Jordanne build this site?');
  assert.equal(asksForBuildStory(SUGGESTED_QUESTIONS[1]), true);
  assert.equal(SUGGESTED_QUESTIONS[2], 'How has Jordanne demonstrated systems thinking?');
  assert.ok(!SUGGESTED_QUESTIONS.includes('What did Jordanne build herself, hands on keyboard?'));
  SUGGESTED_QUESTIONS.forEach((q, i) => {
    if (i !== 1) assert.equal(asksForBuildStory(q), false, q);
  });
});

test('story questions never bring the career timeline', () => {
  for (const q of MUST) {
    assert.equal(asksForOverview(q), false, q);
    assert.equal(asksForTimeline(q), false, q);
  }
});

test('the ai-resume card question opens the story from that card only', () => {
  assert.equal(projectBySlug(STORY_CARD.slug)?.questions[0], STORY_CARD.question);
  assert.equal(storyFromCard('ai-resume', 'How did she build it?'), true);
  assert.equal(storyFromCard(null, 'How did she build it?'), false);
  assert.equal(storyFromCard('agentic-personal-shopper', 'How did she build it?'), false);
  assert.equal(storyFromCard('ai-resume', 'What would she change?'), false);
});

test('the lead holds the marker once, first, and the log never sees it', () => {
  assert.equal(STORY_LEAD.split(STORY_MARKER).length, 2);
  assert.equal(STORY_REPLAY.split(STORY_MARKER).length, 2);
  assert.ok(!withoutStoryMarker(STORY_LEAD).includes('{{'));
  // The trace comes first, as what just happened; the text follows it.
  const [before, after] = splitAtStory(STORY_LEAD);
  assert.equal(before, '');
  assert.ok(after?.startsWith("**What it is.**"));
  assert.match(after, /\*\*Why she built it\.\*\*[\s\S]*\*\*Built as a system\.\*\*[\s\S]*\*\*What's inside\*\*/);
  assert.deepEqual(splitAtStory('No marker here.'), ['No marker here.', null]);
});

// Claims kept out (plan, section 4): retention and backups, unit test counts,
// the pass-rate trend, and Peter's name.
test('the lead and stops keep out the excluded claims', () => {
  const all = [STORY_LEAD, ...STOPS.map((s) => `${s.title} ${s.parts} ${s.detail}`)].join('\n');
  for (const re of [/180 days/i, /backup/i, /retention/i, /unit tests?/i, /0\.722|0\.972|pass rate/i, /\bpeter\b/i]) {
    assert.doesNotMatch(all, re);
  }
});

test('the release-gate sentence goes in the Evals bullet only when there is one', () => {
  assert.match(STORY_LEAD, /- \*\*Evals\.\*\* 90\+ test cases, with automated and human checks\.\n/);
  const withGate = storyLead('In the release gate for v1.16 (6 Nov 2026), all passed.');
  assert.match(withGate, /checks\. In the release gate for v1\.16/);
});

test('every stop links to its evidence in a public repo', () => {
  for (const s of STOPS) {
    assert.match(s.evidence.href, /^https:\/\/github\.com\/jordanne-dyck\/jordannedyck-ai(-web)?\/blob\/master\/\S+$/, s.title);
    assert.ok(s.evidence.label, s.title);
  }
});

test('local evidence files exist', () => {
  for (const s of STOPS) {
    const m = s.evidence.href.match(/jordannedyck-ai-web\/blob\/master\/(.+)$/);
    if (m) assert.ok(existsSync(new URL(`../${m[1]}`, import.meta.url)), m[1]);
  }
});

test('five stops, ending at the fork', () => {
  assert.equal(STOPS.length, 5);
  assert.equal(STOPS.at(-1).fork, true);
  assert.equal(STOPS.filter((s) => s.fork).length, 1);
});

// lib/concierge.ts belongs to the concierge session and isn't on master yet.
// Once it is, story questions must not open the concierge's hand-off.
const CONCIERGE = new URL('../lib/concierge.ts', import.meta.url);
test('story questions do not trip the concierge intent', { skip: !existsSync(CONCIERGE) && 'lib/concierge.ts not on this branch yet' }, async () => {
  const { asksForJordanne } = await import(CONCIERGE.href);
  for (const q of [...MUST, SUGGESTED_QUESTIONS[1], STORY_CARD.question]) {
    assert.equal(asksForJordanne(q), false, q);
  }
});
