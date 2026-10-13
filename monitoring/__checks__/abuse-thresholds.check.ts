import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'
import { monitorTokenHeader, monitorTokenVariable } from './monitor-token'

// Checkly as the alerting scheduler for getAnomalyFlags(): no cron in the cluster.
// Thresholds, real traffic only, last hour:
//   spend      < $0.50  (same line as the admin page's anomaly banner)
//   errors     < 3
//   top IP     under 10 requests (topIpHashLastHour is null below that)
//   retrieval failure rate < 50%
new ApiCheck('abuse-thresholds', {
  name: 'Abuse and error thresholds',
  frequency: Frequency.EVERY_15M,
  alertChannels: [emailAlert],
  environmentVariables: [monitorTokenVariable],
  degradedResponseTime: 5000,
  maxResponseTime: 15000,
  request: {
    method: 'GET',
    url: 'https://www.jordannedyck.com/api/health?deep=1',
    headers: [monitorTokenHeader],
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.anomalies.spendLastHourUsd').lessThan(0.5),
      AssertionBuilder.jsonBody('$.anomalies.errorsLastHour').lessThan(3),
      AssertionBuilder.jsonBody('$.anomalies.topIpHashLastHour').isNull(),
      AssertionBuilder.jsonBody('$.stats.retrievalFailureRateLastHour').lessThan(0.5),
    ],
  },
})
