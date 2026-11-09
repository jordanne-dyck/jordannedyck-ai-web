// Unit tests for the lead emails (lib/notify.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailConfig, leadNotification, leadConfirmation, sendMail, notifyLead } from '../lib/notify.ts';

const env = { MAIL_API_KEY: 'key-123', MAIL_DOMAIN: 'jordannedyck.com', LEAD_NOTIFY_TO: 'her@example.com' };
const lead = {
  id: '42',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  note: 'Hi Jordanne,\n\nA role I am hiring for.',
  purposeLabel: 'Hiring for a role',
  project: null,
};

// A fake fetch that records each call and answers with the given statuses in turn.
function fakeFetch(...statuses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, form: Object.fromEntries(init.body) });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    if (status === 'throw') throw Object.assign(new Error('x'), { name: 'TimeoutError' });
    return new Response('{}', { status });
  };
  fn.calls = calls;
  return fn;
}

test('mail config needs the key, domain and her address', () => {
  assert.equal(mailConfig({}), null);
  assert.equal(mailConfig({ ...env, MAIL_API_KEY: ' ' }), null);
  assert.equal(mailConfig({ ...env, LEAD_NOTIFY_TO: undefined }), null);
  const cfg = mailConfig(env);
  assert.equal(cfg.from, 'jordbot <jordbot@jordannedyck.com>');
  assert.equal(cfg.apiBase, 'https://api.mailgun.net');
  assert.equal(cfg.siteUrl, 'https://jordannedyck.com');
  assert.equal(mailConfig({ ...env, SITE_URL: 'https://dev.example/' }).siteUrl, 'https://dev.example');
});

test('the email to Jordanne carries the lead and a link, marked [dev] off prod', () => {
  const prod = leadNotification(lead, 'https://jordannedyck.com');
  assert.equal(prod.subject, 'New lead: Ada Lovelace (Hiring for a role)');
  assert.match(prod.text, /Ada Lovelace <ada@example.com>/);
  assert.match(prod.text, /A role I am hiring for\./);
  assert.match(prod.text, /https:\/\/jordannedyck.com\/dashboard\/admin\/leads \(lead 42\)/);
  const dev = leadNotification({ ...lead, purposeLabel: null }, 'https://dev.example');
  assert.equal(dev.subject, '[dev] New lead: Ada Lovelace');
});

test('the confirmation holds nothing the visitor typed', () => {
  const c = leadConfirmation('Jordanne replies personally within one business day.');
  for (const typed of [lead.name, lead.email, 'hiring for']) {
    assert.ok(!c.subject.includes(typed) && !c.text.includes(typed), typed);
  }
  assert.match(c.text, /within one business day/);
});

test('sendMail posts to Mailgun with basic auth, Reply-To and test mode', async () => {
  const f = fakeFetch(200);
  const r = await sendMail(mailConfig(env), { to: 'x@example.com', subject: 's', text: 't', replyTo: 'r@example.com', testMode: true }, f);
  assert.deepEqual(r, { ok: true });
  const { url, init, form } = f.calls[0];
  assert.equal(url, 'https://api.mailgun.net/v3/jordannedyck.com/messages');
  assert.equal(init.headers.Authorization, `Basic ${Buffer.from('api:key-123').toString('base64')}`);
  assert.equal(form['h:Reply-To'], 'r@example.com');
  assert.equal(form['o:testmode'], 'yes');
  assert.equal(form.to, 'x@example.com');
});

test('sendMail reports failures as short codes', async () => {
  assert.deepEqual(await sendMail(mailConfig(env), { to: 'x', subject: 's', text: 't' }, fakeFetch(401)), { ok: false, error: 'http_401' });
  assert.deepEqual(await sendMail(mailConfig(env), { to: 'x', subject: 's', text: 't' }, fakeFetch('throw')), { ok: false, error: 'timeout' });
});

test('notifyLead sends both emails, and only real leads leave test mode', async () => {
  const f = fakeFetch(200);
  const r = await notifyLead(lead, { replyTime: 'Soon.', synthetic: false }, mailConfig(env), f);
  assert.deepEqual(r, { notified: true, confirmed: true, error: null });
  const toHer = f.calls.find((c) => c.form.to === 'her@example.com');
  const toThem = f.calls.find((c) => c.form.to === 'ada@example.com');
  assert.equal(toHer.form['h:Reply-To'], 'ada@example.com');
  assert.equal(toHer.form['o:testmode'], undefined);
  assert.equal(toThem.form['h:Reply-To'], undefined);

  const s = fakeFetch(200);
  await notifyLead(lead, { replyTime: 'Soon.', synthetic: true }, mailConfig(env), s);
  assert.ok(s.calls.every((c) => c.form['o:testmode'] === 'yes'));
});

test('notifyLead records which send failed, and an unconfigured site', async () => {
  const f = fakeFetch(500, 200);
  const r = await notifyLead(lead, { replyTime: 'Soon.', synthetic: false }, mailConfig(env), f);
  assert.equal(r.notified, false);
  assert.equal(r.confirmed, true);
  assert.equal(r.error, 'notify:http_500');
  assert.deepEqual(await notifyLead(lead, { replyTime: 'Soon.', synthetic: false }, null), {
    notified: false,
    confirmed: false,
    error: 'not_configured',
  });
});
