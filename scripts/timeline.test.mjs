// Unit tests for when an answer gets the career timeline (lib/timeline.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asksForOverview, asksForTimeline, leadsWithCareer } from '../lib/timeline.ts';
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

test('leadsWithCareer: only the top retrieved chunk counts', () => {
  assert.equal(leadsWithCareer([{ chunk_id: 'exp-028' }, { chunk_id: 'res-1' }]), true);
  assert.equal(leadsWithCareer([{ chunk_id: 'res-1' }, { chunk_id: 'exp-028' }]), false);
  assert.equal(leadsWithCareer([{ chunk_id: null }]), false);
  assert.equal(leadsWithCareer([]), false);
});
