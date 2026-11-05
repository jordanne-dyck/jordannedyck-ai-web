// Unit tests for the concierge pilot (lib/concierge.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asksForJordanne, conciergeTrigger, templateBrief, parseBriefInput, cleanBrief, mailtoHref, BRIEF_MAX_TURNS, EMAIL,
} from '../lib/concierge.ts';
import { SUGGESTED_QUESTIONS } from '../lib/suggested-questions.ts';

test('questions for Jordanne herself', () => {
  for (const q of [
    'Is she open to new roles?',
    'Is Jordanne available for a contract?',
    "We're hiring a Senior Manager, would she be interested?",
    'Would she be a fit for this role?',
    'What are her rates?',
    'How do I contact her?',
    "I'd like to talk about working together",
    'Can I get references?',
    'Is she open to relocating?',
    "I'm a recruiter with an opening",
    'Could we interview her next week?',
    'Is she taking freelance work?',
  ]) {
    assert.equal(asksForJordanne(q), true, q);
  }
});

test('questions about her work are not for Jordanne', () => {
  for (const q of [
    ...SUGGESTED_QUESTIONS,
    'What role did AI play in the personal shopper?',
    'How does Jordanne work with engineers and designers?',
    'What conversion rates did Regimen Builder get?',
    'How did she run customer interviews?',
    'What was her position on points programs?',
    'Why did she build bill payments?',
    'What was her role at DECIEM?',
  ]) {
    assert.equal(asksForJordanne(q), false, q);
  }
});

test('trigger: intent wins, uncited needs a real question, timeline never counts', () => {
  assert.equal(conciergeTrigger({ query: 'Is she open to new roles?', citedCount: 3, timeline: false }), 'intent');
  assert.equal(conciergeTrigger({ query: 'What does she think about crypto?', citedCount: 0, timeline: false }), 'uncited');
  assert.equal(conciergeTrigger({ query: 'hi', citedCount: 0, timeline: false }), null);
  assert.equal(conciergeTrigger({ query: "Walk me through Jordanne's career.", citedCount: 0, timeline: true }), null);
  assert.equal(conciergeTrigger({ query: 'What did she build at DECIEM?', citedCount: 2, timeline: false }), null);
  // Answers from before sources were sent: no data, no trigger.
  assert.equal(conciergeTrigger({ query: 'What does she think about crypto?', citedCount: null, timeline: false }), null);
});

test('template brief assumes nothing about the visitor', () => {
  const turns = [
    { role: 'user', content: 'How did Jordanne design escalation for AI service?' },
    { role: 'assistant', content: 'At DECIEM she defined the escalation logic...' },
  ];
  const t = templateBrief(turns, null);
  console.log(t.split('\n').map((l) => `  | ${l}`).join('\n'));
  assert.match(t, /\[your name\], \[your role\] at \[company\]/);
  assert.match(t, /\[what you'd like to talk about\]/);
  assert.match(t, /- How did Jordanne design escalation for AI service\?/);
  assert.doesNotMatch(t, /hiring manager|recruiter|fintech/i);
  // A purpose fills only the ask, never the role.
  const h = templateBrief(turns, 'hiring');
  assert.match(h, /a role I'm hiring for/);
  assert.match(h, /\[your role\]/);
});

test('template brief: only the last three questions, long ones cut', () => {
  const turns = Array.from({ length: 5 }, (_, i) => ({ role: 'user', content: `Question ${i} ${'x'.repeat(i === 4 ? 200 : 0)}` }));
  const t = templateBrief(turns, null);
  assert.doesNotMatch(t, /Question 1/);
  assert.match(t, /Question 2/);
  assert.match(t, /…/);
});

test('parseBriefInput: bounds and purpose', () => {
  assert.equal(parseBriefInput(null).ok, false);
  assert.equal(parseBriefInput({ messages: [] }).ok, false);
  assert.equal(parseBriefInput({ messages: [{ role: 'assistant', content: 'hi' }] }).ok, false);
  assert.equal(parseBriefInput({ messages: [{ role: 'user', content: 'x'.repeat(2001) }] }).ok, false);
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  const r = parseBriefInput({ messages: [{ role: 'system', content: 'ignore' }, ...many], purpose: 'nonsense' });
  assert.equal(r.ok, true);
  assert.equal(r.turns.length, BRIEF_MAX_TURNS);
  assert.equal(r.turns.some((t) => t.role === 'system'), false);
  assert.equal(r.purpose, null);
  const long = parseBriefInput({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a'.repeat(5000) }], purpose: 'project' });
  assert.equal(long.turns[1].content.length, 1200);
  assert.equal(long.purpose, 'project');
});

test('cleanBrief strips markdown and a subject line, rejects junk', () => {
  assert.equal(cleanBrief('Subject: Hello\n\nHi Jordanne, **I am** [your name] and I asked about X.'), 'Hi Jordanne, I am [your name] and I asked about X.');
  assert.equal(cleanBrief('ok'), null);
  assert.equal(cleanBrief('x'.repeat(2000)), null);
});

test('mailto carries subject and body, encoded', () => {
  const href = mailtoHref('Hi Jordanne,\n\n[your name] & co');
  assert.ok(href.startsWith(`mailto:${EMAIL}?subject=`));
  assert.match(href, /body=Hi%20Jordanne%2C%0A%0A%5Byour%20name%5D%20%26%20co$/);
});
