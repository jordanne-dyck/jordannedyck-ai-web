import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'

new ApiCheck('dashboard', {
  name: 'Dashboard up',
  // Hourly since 2026-11-12 (was every 30 minutes), to keep all checks near
  // 8,000 runs a month on the free plan.
  frequency: Frequency.EVERY_1H,
  alertChannels: [emailAlert],
  degradedResponseTime: 5000,
  maxResponseTime: 15000,
  request: {
    method: 'GET',
    url: 'https://jordannedyck.com/dashboard',
    followRedirects: true,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // Header in app/dashboard/page.tsx.
      AssertionBuilder.textBody().contains('chatbot observability'),
    ],
  },
})
