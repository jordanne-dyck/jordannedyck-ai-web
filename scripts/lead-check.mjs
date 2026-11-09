// The lead pipeline check (nimbalyst-local/plans/lead-notifications.md), the
// same steps as monitoring/__checks__/lead-pipeline.check.ts, for dev, which
// Checkly can't reach:
//
//   MONITOR_TOKEN=... node scripts/lead-check.mjs --base https://jordbot-dev-jordbot-dev.apps.ocp-centralis.nekohouse.ca
//
// 1. Sends a synthetic lead (x-monitor-token): stored apart from real leads,
//    both emails sent in Mailgun test mode, so nothing is delivered.
// 2. Reads the lead counts from /api/health?deep=1.
// Prints the actual values, and exits 1 if any step failed.

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const base = arg('--base', 'https://jordannedyck.com').replace(/\/$/, '');
const token = process.env.MONITOR_TOKEN;
if (!token) {
  console.error('Set MONITOR_TOKEN first.');
  process.exit(2);
}

const failures = [];
const headers = { 'Content-Type': 'application/json', 'x-monitor-token': token };

const res = await fetch(`${base}/api/lead`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'Lead pipeline check',
    email: 'lead-check@example.com',
    note: `Synthetic lead from scripts/lead-check.mjs at ${new Date().toISOString()}.`,
    draftedBy: 'blank',
  }),
});
const sent = await res.json().catch(() => ({}));
console.log(`POST /api/lead -> ${res.status}`, sent);
if (res.status !== 200) failures.push(`lead: HTTP ${res.status}`);
if (!sent.id) failures.push('lead: no id back (not stored, or not a monitor request)');
if (sent.notified !== true) failures.push(`email to Jordanne: not accepted (${sent.error ?? 'no error given'})`);
if (sent.confirmed !== true) failures.push(`confirmation: not accepted (${sent.error ?? 'no error given'})`);

const health = await fetch(`${base}/api/health?deep=1`, { headers }).then((r) => r.json()).catch(() => ({}));
console.log('health.leads ->', health.leads);
if (!health.leads) failures.push('health: no leads block (LEADS_ENABLED off, or the query failed)');
else if (health.leads.unnotified > 0) failures.push(`health: ${health.leads.unnotified} real lead(s) not emailed to Jordanne`);

if (failures.length) {
  console.error('\nFAILED:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\nOK: lead stored, both emails accepted by Mailgun, no real lead waiting unemailed.');
