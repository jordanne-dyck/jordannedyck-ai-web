// Unit tests for the traffic report (lib/traffic-report.ts), its insights
// (lib/traffic-insights.ts) and the beacon's event list (lib/visit.ts): npm test.
// "Reached out" is the contact form sent, a row in leads. "Looked you up" is
// every click or page short of that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrafficReport, DAY_MS } from '../lib/traffic-report.ts';
import { trafficInsights } from '../lib/traffic-insights.ts';
import { SITE_EVENTS, cleanProps } from '../lib/visit.ts';

const NOW = Date.UTC(2026, 10, 20, 12);
// Inside the 7-day window that ends at NOW.
const T = Date.UTC(2026, 10, 14, 15);
const MIN = 60_000;

const view = (visitor, at, path = '/') => ({
  at, viewId: `${visitor}-${at}`, visitor, path, referrer: null, utmSource: null, device: 'desktop', engagedMs: 5000,
});
const event = (visitor, at, name, props = {}) => ({ at, visitor, name, props });
const chat = (session, at, turnIndex) => ({
  at, session, turnIndex, query: 'What does Jordanne do?', rateLimited: false, story: false, timeline: false, projectCard: false, vote: null,
});
const report = (rows) => buildTrafficReport({ days: 7, now: NOW, views: [], events: [], chats: [], leads: [], firstSeen: {}, ...rows });
const step = (r, key) => r.funnel.find((f) => f.key === key).visitors;
const dayRow = (r, day) => {
  const d = r.daily.find((x) => x.day === day);
  return { lookedUp: d.lookedUp, reachedOut: d.reachedOut };
};

test('a LinkedIn click with no lead is looked you up, not reached out (the 2026-11-14 case)', () => {
  const r = report({
    views: [view('a', T)],
    events: [event('a', T + MIN, 'contact_clicked', { where: 'footer', channel: 'linkedin' })],
  });
  assert.equal(r.totals.visitors.cur, 1);
  assert.equal(r.totals.reachedOutRate.cur, 0);
  assert.equal(r.totals.lookedUpRate.cur, 1);
  assert.equal(r.totals.leads.cur, 0);
  assert.equal(Object.hasOwn(r.totals, 'contactClicks'), false);
  assert.equal(step(r, 'looked'), 1);
  assert.equal(step(r, 'panel'), 0);
  assert.equal(step(r, 'reached'), 0);
  assert.deepEqual(r.contacts, { reachedOut: [], lookedUp: [{ key: 'linkedin', label: 'LinkedIn', count: 1 }] });
  assert.deepEqual(dayRow(r, '2026-11-14'), { lookedUp: 1, reachedOut: 0 });
  assert.deepEqual(r.sources.map((s) => [s.source, s.lookedUpRate, s.reachedOutRate]), [['Direct', 1, 0]]);
});

test('a lead that carries the visitor\'s session is reached out', () => {
  const r = report({ views: [view('a', T)], leads: [{ at: T + 2 * MIN, session: 'a' }] });
  assert.equal(r.totals.visitors.cur, 1);
  assert.equal(r.totals.reachedOutRate.cur, 1);
  assert.equal(r.totals.lookedUpRate.cur, 0);
  assert.equal(r.totals.leads.cur, 1);
  assert.equal(step(r, 'looked'), 0);
  assert.equal(step(r, 'panel'), 1);
  assert.equal(step(r, 'reached'), 1);
  assert.deepEqual(r.contacts, { reachedOut: [{ key: 'form', label: 'Contact form', count: 1 }], lookedUp: [] });
  assert.deepEqual(dayRow(r, '2026-11-14'), { lookedUp: 0, reachedOut: 1 });
});

test('a visitor whose only page view is /dashboard looked you up', () => {
  const r = report({ views: [view('a', T, '/dashboard')] });
  assert.equal(r.totals.visitors.cur, 1);
  assert.equal(r.totals.lookedUpRate.cur, 1);
  assert.equal(r.totals.reachedOutRate.cur, 0);
  assert.equal(step(r, 'looked'), 1);
  assert.equal(step(r, 'reached'), 0);
  assert.deepEqual(r.contacts, { reachedOut: [], lookedUp: [{ key: 'dashboard', label: 'Public dashboard', count: 1 }] });
  assert.deepEqual(dayRow(r, '2026-11-14'), { lookedUp: 1, reachedOut: 0 });
});

test('an email click, a copied note and an emailed note are looked you up, not reached out', () => {
  const r = report({
    views: [view('a', T), view('b', T), view('c', T)],
    events: [
      event('a', T + MIN, 'contact_clicked', { where: 'footer', channel: 'email' }),
      event('b', T + MIN, 'concierge_opened', { trigger: 'none', from: 'footer' }),
      event('b', T + 2 * MIN, 'brief_sent', { channel: 'copy', edited: false }),
      event('c', T + MIN, 'concierge_opened', { trigger: 'none', from: 'footer' }),
      event('c', T + 2 * MIN, 'brief_sent', { channel: 'email', edited: true }),
    ],
  });
  assert.equal(r.totals.visitors.cur, 3);
  assert.equal(r.totals.lookedUpRate.cur, 1);
  assert.equal(r.totals.reachedOutRate.cur, 0);
  assert.equal(r.totals.leads.cur, 0);
  assert.equal(step(r, 'looked'), 3);
  assert.equal(step(r, 'panel'), 2);
  assert.equal(step(r, 'reached'), 0);
  assert.deepEqual(r.contacts, {
    reachedOut: [],
    lookedUp: [
      { key: 'email', label: 'Email link', count: 1 },
      { key: 'note_copied', label: 'Note copied', count: 1 },
      { key: 'note_emailed', label: 'Note emailed', count: 1 },
    ],
  });
  assert.deepEqual(dayRow(r, '2026-11-14'), { lookedUp: 3, reachedOut: 0 });
});

test('the form event alone is neither: only the lead row counts', () => {
  const r = report({
    views: [view('a', T)],
    events: [
      event('a', T + MIN, 'concierge_opened', { trigger: 'none', from: 'footer' }),
      event('a', T + 2 * MIN, 'brief_sent', { channel: 'form', edited: false }),
    ],
  });
  assert.equal(r.totals.lookedUpRate.cur, 0);
  assert.equal(r.totals.reachedOutRate.cur, 0);
  assert.equal(step(r, 'looked'), 0);
  assert.equal(step(r, 'panel'), 1);
  assert.equal(step(r, 'reached'), 0);
  assert.deepEqual(r.contacts, { reachedOut: [], lookedUp: [] });
  assert.deepEqual(dayRow(r, '2026-11-14'), { lookedUp: 0, reachedOut: 0 });
});

test('build story links: the repos and email count, evidence, the panel and the dashboard link do not', () => {
  const targets = { a: 'repo_web', b: 'evidence', c: 'dashboard', d: 'concierge', e: 'repo_ai', f: 'email' };
  const r = report({
    views: Object.keys(targets).map((id) => view(id, T)),
    events: Object.entries(targets).map(([id, target]) => event(id, T + MIN, 'story_link_clicked', { target })),
  });
  assert.equal(r.totals.visitors.cur, 6);
  assert.equal(r.totals.lookedUpRate.cur, 0.5);
  assert.equal(r.totals.reachedOutRate.cur, 0);
  assert.equal(step(r, 'looked'), 3);
  assert.deepEqual(r.contacts, {
    reachedOut: [],
    lookedUp: [{ key: 'github', label: 'GitHub', count: 2 }, { key: 'email', label: 'Email link', count: 1 }],
  });
  assert.deepEqual(r.flows.map((f) => [f.steps.join(' > '), f.visits]), [
    ['Home', 3],
    ['Home > Clicked code repo', 2],
    ['Home > Clicked email', 1],
  ]);
});

test('the funnel has six steps, in this order', () => {
  const r = report({ views: [view('a', T)] });
  assert.deepEqual(r.funnel.map((f) => [f.key, f.label, f.visitors]), [
    ['visited', 'Visited', 1],
    ['asked', 'Asked the bot', 0],
    ['curated', 'Got a curated answer', 0],
    ['looked', 'Looked you up', 0],
    ['panel', 'Opened the contact panel', 0],
    ['reached', 'Reached out', 0],
  ]);
});

test('conversations carry both flags, counted up to a day after the last question', () => {
  const r = report({
    views: [view('a', T), view('b', T), view('c', T)],
    chats: [chat('a', T + MIN, 1), chat('b', T + MIN, 1), chat('b', T + 2 * MIN, 2), chat('c', T + MIN, 1)],
    events: [
      event('a', T + 3 * MIN, 'contact_clicked', { where: 'after_answer', channel: 'github' }),
      // More than a day after c's conversation ended: counted for the visitor, not the conversation.
      event('c', T + 2 * DAY_MS, 'contact_clicked', { where: 'footer', channel: 'phone' }),
    ],
    leads: [{ at: T + 5 * MIN, session: 'b' }],
  });
  const flags = Object.fromEntries(r.recentConversations.map((c) => [c.visitor, { lookedUp: c.lookedUp, reachedOut: c.reachedOut }]));
  assert.deepEqual(flags, {
    a: { lookedUp: true, reachedOut: false },
    b: { lookedUp: false, reachedOut: true },
    c: { lookedUp: false, reachedOut: false },
  });
  assert.deepEqual(r.convoVsAnswer.map((c) => [c.kind, c.conversations, c.lookedUpRate, c.reachedOutRate]), [
    ['single', 2, 0.5, 0],
    ['multi', 1, 0, 1],
  ]);
  assert.equal(r.totals.lookedUpRate.cur, 2 / 3);
  assert.equal(r.totals.reachedOutRate.cur, 1 / 3);
});

test('the window before is counted apart', () => {
  const before = T - 7 * DAY_MS;
  const r = report({
    views: [view('old', before), view('new', T)],
    events: [event('old', before + MIN, 'contact_clicked', { where: 'hero', channel: 'linkedin' })],
    leads: [{ at: before + 2 * MIN, session: 'old' }],
  });
  assert.deepEqual(r.totals.visitors, { cur: 1, prev: 1 });
  assert.deepEqual(r.totals.lookedUpRate, { cur: 0, prev: 1 });
  assert.deepEqual(r.totals.reachedOutRate, { cur: 0, prev: 1 });
  assert.deepEqual(r.totals.leads, { cur: 0, prev: 1 });
  assert.deepEqual(r.contacts, { reachedOut: [], lookedUp: [] });
  assert.equal(step(r, 'looked'), 0);
  assert.equal(step(r, 'reached'), 0);
});

test('insights: the contact panel is compared with form sends, by funnel key', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const r = report({
    views: ids.map((id) => view(id, T)),
    events: ids.map((id) => event(id, T + MIN, 'concierge_opened', { trigger: 'none', from: 'footer' })),
    leads: [{ at: T + 2 * MIN, session: 'p0' }],
  });
  assert.equal(step(r, 'panel'), 12);
  assert.equal(step(r, 'reached'), 1);
  const headlines = trafficInsights(r).map((i) => i.headline);
  assert.deepEqual(headlines, [
    '12 visitors opened the contact panel, 1 sent the form',
    '12 visitors in the last 7 days',
  ]);
});

test('insights: no funnel drop is reported between steps that are not part of each other', () => {
  // 25 visitors ask and get a curated answer, one clicks LinkedIn, two others
  // open the panel. Nothing here drops between two nested steps.
  const ids = Array.from({ length: 25 }, (_, i) => `q${i}`);
  const r = report({
    views: ids.map((id) => view(id, T)),
    chats: ids.map((id) => ({ ...chat(id, T + MIN, 1), story: true })),
    events: [
      event('q0', T + 2 * MIN, 'contact_clicked', { where: 'after_answer', channel: 'linkedin' }),
      event('q1', T + 2 * MIN, 'concierge_opened', { trigger: 'none', from: 'after_answer' }),
      event('q2', T + 2 * MIN, 'concierge_opened', { trigger: 'none', from: 'after_answer' }),
    ],
  });
  assert.deepEqual(r.funnel.map((f) => f.visitors), [25, 25, 25, 1, 2, 0]);
  assert.deepEqual(trafficInsights(r).filter((i) => /go from/.test(i.headline)), []);
});

test('the beacon keeps build story link clicks, with target and step only', () => {
  assert.deepEqual(SITE_EVENTS.story_link_clicked, ['target', 'step']);
  assert.deepEqual(cleanProps('story_link_clicked', { target: 'repo_web', step: 2, text: 'x' }), { target: 'repo_web', step: 2 });
  assert.deepEqual(cleanProps('contact_clicked', { where: 'about', channel: 'github', href: 'https://github.com/x' }), { where: 'about', channel: 'github' });
});

test('insights: one form send is too few to compare conversations with single answers', () => {
  const chats = [];
  for (let i = 0; i < 10; i++) {
    chats.push(chat(`s${i}`, T + i * MIN, 0));
    chats.push(chat(`m${i}`, T + i * MIN, 0), chat(`m${i}`, T + (i + 1) * MIN, 1));
  }
  const lead = (session) => ({ at: T + 30 * MIN, session });
  const compared = (leads) =>
    trafficInsights(report({ chats, leads })).map((i) => i.headline).filter((h) => h.startsWith('Conversations reach out'));
  assert.deepEqual(compared([lead('m0')]), []);
  assert.deepEqual(compared([lead('m0'), lead('m1'), lead('m2')]), ['Conversations reach out 30%, single answers 0%']);
});
