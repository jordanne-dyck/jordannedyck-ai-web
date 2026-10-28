import * as path from 'path'
import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { emailAlert } from './alert-channels'
import { monitorTokenHeader, monitorTokenVariable } from './monitor-token'

// The answer must come from the knowledge base, not the system prompt.
// "Wealthsimple" appears only in knowledge-base/projects/fundlocal-ai-capstone.md
// in the backend repo, never in app/api/chat/route.ts. Do not pick a fact the
// system prompt already contains (e.g. DECIEM): the check would pass with
// retrieval down. The x-monitor-token header marks these rows is_synthetic in
// chat_events and makes the site send the retrieval part.
export const MONITOR_QUESTION = 'What was FundLocal, and which company was it designed for?'

new ApiCheck('chat-grounded', {
  name: 'Chat gives a grounded answer',
  // About $0.008 per run at gpt-4o rates. Do not go hourly.
  frequency: Frequency.EVERY_6H,
  alertChannels: [emailAlert],
  environmentVariables: [monitorTokenVariable],
  degradedResponseTime: 20000,
  // 30000 is the API-check ceiling.
  maxResponseTime: 30000,
  // Rejoins the streamed tokens so the assertions below see plain text.
  tearDownScript: {
    entrypoint: path.join(__dirname, 'reassemble-stream.js'),
  },
  request: {
    method: 'POST',
    url: 'https://www.jordannedyck.com/api/chat',
    headers: [{ key: 'Content-Type', value: 'application/json' }, monitorTokenHeader],
    body: JSON.stringify({ messages: [{ role: 'user', content: MONITOR_QUESTION }] }),
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // Line written by reassemble-stream.js from the retrieval part.
      // status=ok only when at least one chunk came back.
      AssertionBuilder.textBody().contains('[retrieval] status=ok'),
      AssertionBuilder.textBody().notContains('chunks=0'),
      AssertionBuilder.textBody().contains('Wealthsimple'),
      AssertionBuilder.textBody().notContains('Unable to search'),
      AssertionBuilder.textBody().notContains('Internal error'),
      AssertionBuilder.textBody().notContains('Rate limit'),
      AssertionBuilder.textBody().notContains('[stream error]'),
    ],
  },
})
