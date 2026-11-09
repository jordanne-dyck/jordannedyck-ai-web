// Unit tests for when an answer gets the career timeline, and the fixed lead (lib/timeline.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asksForCareerHistory, asksForOverview, asksForTimeline, citesCareer, FIXED_LEAD, isTimelineReplay, leadsWithCareer, splitAtTimeline, TIMELINE_REPLAY, withoutTimelineMarker,
} from '../lib/timeline.ts';
import { SUGGESTED_QUESTIONS } from '../lib/suggested-questions.ts';

test('the first suggested question gets the timeline', () => {
  assert.equal(asksForOverview(SUGGESTED_QUESTIONS[0]), true);
  assert.equal(asksForTimeline('Show the timeline again'), true);
});

test('overview questions without the word timeline', () => {
  for (const q of ['What is her career history?', "Walk me through Jordanne's experience", 'Tell me her work history']) {
    console.log(`  ${q} -> ${asksForOverview(q)}`);
    assert.equal(asksForOverview(q), true);
  }
  assert.equal(asksForOverview('What is FundLocal and why did Jordanne build it?'), false);
});

// The 2026-11-05 defect: "before DECIEM" cited only exp-001 and got no card.
test('career-history questions bring the timeline, not the fixed lead', () => {
  const yes = [
    'Where did Jordanne work before DECIEM?',
    'Where has she worked?',
    'Where did she work?',
    'What did she do before DECIEM?',
    'What were her previous roles?',
    'Any past employers I should know about?',
    'Which companies has she worked for?',
  ];
  const no = [
    'Where did she study?',
    'What is she doing now?',
    'Where does she work now?',
    'What did she do at DECIEM?',
    'What roles did she hold at Loblaw Digital?',
    'What is FundLocal and why did Jordanne build it?',
    'Tell me about her education',
  ];
  for (const q of [...yes, ...no]) {
    console.log(`  ${q} -> history=${asksForCareerHistory(q)} overview=${asksForOverview(q)}`);
  }
  for (const q of yes) {
    assert.equal(asksForCareerHistory(q), true, q);
    assert.equal(asksForOverview(q), false, q);
  }
  for (const q of no) assert.equal(asksForCareerHistory(q), false, q);
});

test('leadsWithCareer: only the top retrieved chunk counts', () => {
  assert.equal(leadsWithCareer([{ chunk_id: 'exp-028' }, { chunk_id: 'res-1' }]), true);
  assert.equal(leadsWithCareer([{ chunk_id: 'res-1' }, { chunk_id: 'exp-028' }]), false);
  assert.equal(leadsWithCareer([{ chunk_id: null }]), false);
  assert.equal(leadsWithCareer([]), false);
});

test('citesCareer: exp-042 counts, education (exp-031) does not', () => {
  assert.equal(citesCareer(['exp-042']), true);
  assert.equal(citesCareer(['exp-030']), true);
  assert.equal(citesCareer(['exp-031']), false);
});

test('the fixed lead splits around the timeline', () => {
  const [before, after] = splitAtTimeline(FIXED_LEAD);
  console.log(`  before: ${before}\n  after: ${after}`);
  assert.match(before, /^Jordanne's career runs from the human side/);
  assert.match(before, /4M\+ DTC customers globally\.$/);
  assert.match(after, /^Today she runs Warai Neko/);
  assert.doesNotMatch(withoutTimelineMarker(FIXED_LEAD), /\{\{/);
});

test('replay: only a timeline question, only once shown', () => {
  assert.equal(isTimelineReplay('Show the timeline again', true), true);
  assert.equal(isTimelineReplay('Show the timeline again', false), false);
  assert.equal(isTimelineReplay('What is her career history?', true), false);
  const [before, after] = splitAtTimeline(TIMELINE_REPLAY);
  assert.equal(before, "Here's her timeline again.");
  assert.equal(after, '');
});
