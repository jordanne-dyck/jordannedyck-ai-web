// Unit tests for the concierge leads (lib/leads.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLeadInput, overLeadLimit, leadStats, isLeadStatus, isLeadId, MAX_NOTE, LEADS_SITE_PER_DAY, leadLimitMessage } from '../lib/leads.ts';

const good = { name: '  Ada   Lovelace ', email: ' Ada@Example.COM ', note: 'Hi Jordanne,\r\n\r\nA role I am hiring for.' };

test('a valid lead is trimmed and normalised', () => {
  const r = parseLeadInput({ ...good, purpose: 'hiring', project: 'ai-resume', draftedBy: 'ai', edited: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lead, {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    note: 'Hi Jordanne,\n\nA role I am hiring for.',
    purpose: 'hiring',
    project: 'ai-resume',
    draftedBy: 'ai',
    edited: true,
  });
});

test('missing or malformed fields are refused', () => {
  for (const [body, reason] of [
    [null, 'name is required'],
    [{ ...good, name: '   ' }, 'name is required'],
    [{ ...good, name: 'x'.repeat(101) }, 'name too long'],
    [{ ...good, email: 'not-an-email' }, 'email is not valid'],
    [{ ...good, email: 'a b@example.com' }, 'email is not valid'],
    [{ ...good, email: 'a@example' }, 'email is not valid'],
    [{ ...good, email: `${'a'.repeat(250)}@x.co` }, 'email is not valid'],
    [{ ...good, note: 'hi' }, 'note is too short'],
    [{ ...good, note: 'x'.repeat(MAX_NOTE + 1) }, 'note too long'],
    [{ ...good, name: 42 }, 'name is required'],
  ]) {
    const r = parseLeadInput(body);
    assert.equal(r.ok, false, JSON.stringify(body)?.slice(0, 60));
    assert.equal(r.reason, reason);
  }
});

test('the bot trap is reported, not stored', () => {
  const r = parseLeadInput({ ...good, website: 'http://spam.example' });
  assert.equal(r.ok, false);
  assert.equal(r.trap, true);
  assert.equal(parseLeadInput({ ...good, website: '' }).ok, true);
});

test('unknown optional fields are dropped, not trusted', () => {
  const r = parseLeadInput({ ...good, purpose: 'DROP TABLE', project: '../etc', draftedBy: 'human', edited: 'yes' });
  assert.equal(r.ok, true);
  assert.equal(r.lead.purpose, null);
  assert.equal(r.lead.project, null);
  assert.equal(r.lead.draftedBy, null);
  assert.equal(r.lead.edited, false);
});

test('limits: site-wide first, then visitor, then email', () => {
  assert.equal(overLeadLimit({ visitor: 0, email: 0, site: 0 }), null);
  assert.equal(overLeadLimit({ visitor: 2, email: 2, site: LEADS_SITE_PER_DAY - 1 }), null);
  assert.equal(overLeadLimit({ visitor: 0, email: 0, site: LEADS_SITE_PER_DAY }), 'site');
  assert.equal(overLeadLimit({ visitor: 3, email: 0, site: 3 }), 'visitor');
  assert.equal(overLeadLimit({ visitor: 0, email: 3, site: 3 }), 'email');
});

test('pilot numbers: median reply time and conversations', () => {
  const at = (h) => new Date(Date.UTC(2026, 10, 2) + h * 3_600_000).toISOString();
  const s = leadStats([
    { createdAt: at(0), repliedAt: at(2), status: 'replied' },
    { createdAt: at(0), repliedAt: at(6), status: 'conversation' },
    { createdAt: at(0), repliedAt: at(30), status: 'closed' },
    { createdAt: at(0), repliedAt: null, status: 'new' },
  ]);
  assert.deepEqual(s, { total: 4, replied: 3, medianReplyHours: 6, conversations: 1 });
  assert.equal(leadStats([]).medianReplyHours, null);
  assert.equal(leadStats([
    { createdAt: at(0), repliedAt: at(1), status: 'replied' },
    { createdAt: at(0), repliedAt: at(4), status: 'replied' },
  ]).medianReplyHours, 2.5);
});

test('statuses', () => {
  assert.equal(isLeadStatus('conversation'), true);
  assert.equal(isLeadStatus('spam'), false);
});

// 2026-11-07 review: /^d{1,18}$/ (no backslash) matched only the letter d, so
// every status button returned early and replied_at was never set.
test('lead ids', () => {
  assert.equal(isLeadId('42'), true);
  assert.equal(isLeadId('123456789012345678'), true);
  assert.equal(isLeadId('d'), false);
  assert.equal(isLeadId(''), false);
  assert.equal(isLeadId('1234567890123456789'), false);
  assert.equal(isLeadId('1 OR 1=1'), false);
  assert.equal(isLeadId(42), false);
});

test('a refused note says whose limit it hit', () => {
  assert.match(leadLimitMessage('visitor'), /^You've sent 3 notes/);
  assert.match(leadLimitMessage('email'), /from this email address/);
  assert.match(leadLimitMessage('site'), /The site has taken its 30 notes/);
  assert.match(leadLimitMessage(undefined), /^Too many notes/);
  for (const l of ['visitor', 'email', 'site', null]) assert.match(leadLimitMessage(l), /by email/);
});
