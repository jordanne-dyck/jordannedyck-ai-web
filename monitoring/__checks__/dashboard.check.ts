import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'

new ApiCheck('dashboard', {
  name: 'Dashboard up',
  frequency: Frequency.EVERY_30M,
  alertChannels: [emailAlert],
  degradedResponseTime: 5000,
  maxResponseTime: 15000,
  request: {
    method: 'GET',
    url: 'https://www.jordannedyck.com/dashboard',
    followRedirects: true,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // Header in app/dashboard/page.tsx.
      AssertionBuilder.textBody().contains('chatbot observability'),
    ],
  },
})
