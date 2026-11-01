import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'
import { monitorTokenHeader, monitorTokenVariable } from './monitor-token'

// Checkly as the alerting scheduler for getAnomalyFlags(): no cron in the cluster.
// Thresholds, real traffic only, last hour:
//   spend      < $0.50  (same line as the admin page's anomaly banner)
//   errors     < 3
//   top IP     under 10 requests (topIpHashLastHour is null below that)
//   retrieval failure rate < 50%
// Spend this calendar month (UTC) under MONTHLY_SPEND_ALERT_USD in
// lib/thresholds.ts (added 2026-10-28). Once crossed it fails for the rest of
// the month; Checkly emails on the change, and the recovery email arrives
// when the month resets.
// Labels, last 24 hours (Phase 3 thresholds, added 2026-10-14):
//   injection, prompt leak, moderation: none
//   off-topic: at most 5
// Answer quality, last 24 hours: no breaches. The thresholds and the minimum
// number of answers live in lib/thresholds.ts; the site computes the breaches
// because a Checkly assertion cannot say "only when there were enough answers".
// A label stays in the 24-hour window for a day, so the check stays failing
// that long; Checkly emails on the change, not on every run.
new ApiCheck('abuse-thresholds', {
  name: 'Abuse and error thresholds',
  frequency: Frequency.EVERY_15M,
  alertChannels: [emailAlert],
  environmentVariables: [monitorTokenVariable],
  degradedResponseTime: 5000,
  maxResponseTime: 15000,
  request: {
    method: 'GET',
    url: 'https://jordannedyck.com/api/health?deep=1',
    headers: [monitorTokenHeader],
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.anomalies.spendLastHourUsd').lessThan(0.5),
      AssertionBuilder.jsonBody('$.anomalies.errorsLastHour').lessThan(3),
      AssertionBuilder.jsonBody('$.anomalies.topIpHashLastHour').isNull(),
      AssertionBuilder.jsonBody('$.stats.retrievalFailureRateLastHour').lessThan(0.5),
      // Add once a jordbot-web release after v1.7 with spendMonthToDateUsd is
      // live in prod. Keep 10 in step with MONTHLY_SPEND_ALERT_USD.
      // AssertionBuilder.jsonBody('$.anomalies.spendMonthToDateUsd').lessThan(10),
      // Add these once Dashboard v2 (f16878a) is live in prod. jordbot-web v1.7
      // has no labels24h or quality24h in the deep health body, so they would fail.
      // AssertionBuilder.jsonBody('$.labels24h.injection').lessThan(1),
      // AssertionBuilder.jsonBody('$.labels24h.prompt_leak').lessThan(1),
      // AssertionBuilder.jsonBody('$.labels24h.moderation').lessThan(1),
      // AssertionBuilder.jsonBody('$.labels24h.off_topic').lessThan(6),
      // AssertionBuilder.jsonBody('$.quality24h.breachCount').lessThan(1),
    ],
  },
})
