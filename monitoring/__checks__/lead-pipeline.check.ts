import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'
import { monitorTokenHeader, monitorTokenVariable } from './monitor-token'

// The concierge lead pipeline (nimbalyst-local/plans/lead-notifications.md):
// a visitor's note is stored, emailed to Jordanne, and confirmed to the visitor.
// Sends a synthetic lead with x-monitor-token: stored apart from real leads
// (no limits, not in the admin list, deleted after 7 days), and both emails go
// in Mailgun test mode, so Mailgun checks the key and domain and accepts them
// without delivering. Two test-mode messages a run, 8 a day.
// The 30-minute "real lead not emailed" alert is in abuse-thresholds.check.ts.
// Dev, which Checkly can't reach: scripts/lead-check.mjs.
new ApiCheck('lead-pipeline', {
  name: 'Lead pipeline: stored and emailed',
  // Off until prod has the lead form (LEADS_ENABLED=1) and a jordbot-web
  // release with lib/notify.ts: prod's /api/lead is a 404 until then.
  activated: false,
  frequency: Frequency.EVERY_6H,
  alertChannels: [emailAlert],
  environmentVariables: [monitorTokenVariable],
  degradedResponseTime: 8000,
  maxResponseTime: 20000,
  request: {
    method: 'POST',
    url: 'https://jordannedyck.com/api/lead',
    headers: [{ key: 'Content-Type', value: 'application/json' }, monitorTokenHeader],
    body: JSON.stringify({
      name: 'Lead pipeline check',
      email: 'lead-check@example.com',
      note: 'Synthetic lead from the Checkly lead-pipeline check.',
      draftedBy: 'blank',
    }),
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.id').isNotNull(),
      AssertionBuilder.jsonBody('$.notified').equals(true),
      AssertionBuilder.jsonBody('$.confirmed').equals(true),
    ],
  },
})
