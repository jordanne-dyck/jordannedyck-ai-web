import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'

new ApiCheck('homepage', {
  name: 'Homepage up',
  // Every 30 minutes since 2026-11-12 (was 10), to keep all checks near 8,000
  // runs a month on the free plan. health.check.ts still runs every 10.
  frequency: Frequency.EVERY_30M,
  alertChannels: [emailAlert],
  degradedResponseTime: 5000,
  maxResponseTime: 15000,
  request: {
    method: 'GET',
    url: 'https://jordannedyck.com',
    followRedirects: true,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // Chat intro heading in app/page.tsx.
      AssertionBuilder.textBody().contains('Ask me anything'),
    ],
  },
})
