import { defineConfig } from 'checkly'
import { Frequency } from 'checkly/constructs'

// Account id and API key come from the environment (CHECKLY_ACCOUNT_ID,
// CHECKLY_API_KEY). Never commit them: this repo is public.
export default defineConfig({
  projectName: 'jordannedyck.com',
  logicalId: 'jordannedyck-com',
  repoUrl: 'https://github.com/jordanne-dyck/jordannedyck-ai-web',
  checks: {
    activated: true,
    muted: false,
    frequency: Frequency.EVERY_10M,
    // One location keeps the Hobby plan's monthly API-run allowance in reach.
    locations: ['us-east-1'],
    tags: ['jordbot'],
    checkMatch: '**/__checks__/**/*.check.ts',
  },
  cli: {
    runLocation: 'us-east-1',
  },
})
