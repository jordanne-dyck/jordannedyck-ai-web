import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'

new ApiCheck('homepage', {
  name: 'Homepage up',
  frequency: Frequency.EVERY_10M,
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
