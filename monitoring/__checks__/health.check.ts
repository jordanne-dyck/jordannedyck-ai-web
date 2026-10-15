import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'

// The check that would have caught the October 2026 expired-key outage.
// /api/health lists models with the site's OpenAI key: no tokens, no cost,
// so it can run every 5 minutes.
new ApiCheck('health', {
  name: 'Health: database, OpenAI key, backend',
  frequency: Frequency.EVERY_5M,
  alertChannels: [emailAlert],
  degradedResponseTime: 5000,
  maxResponseTime: 15000,
  request: {
    method: 'GET',
    url: 'https://www.jordannedyck.com/api/health',
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.db').equals(true),
      AssertionBuilder.jsonBody('$.openai').equals('ok'),
      // Backend GET /health, live in prod since jordbot v1.4 (131 chunks on 2026-10-15).
      AssertionBuilder.jsonBody('$.ok').equals(true),
      AssertionBuilder.jsonBody('$.backend.ok').equals(true),
      AssertionBuilder.jsonBody('$.backend.openai').equals('ok'),
      AssertionBuilder.jsonBody('$.backend.chunks').greaterThan(130),
    ],
  },
})
