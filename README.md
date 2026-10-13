# jordannedyck-ai-web

The frontend for [jordannedyck.com](https://jordannedyck.com): a chat interface where visitors ask about my professional experience. Answers are grounded in a knowledge base served by the [jordannedyck-ai](https://github.com/jordanne-dyck/jordannedyck-ai) backend.

## How a question is answered

1. The browser sends the conversation to `POST /api/chat`.
2. The route checks the input (user and assistant turns only, 20 turns, 2,000 characters per message) and a per-IP rate limit (20 an hour, 100 a day).
3. It sends the latest question to the backend's `/search`, which returns the 5 closest knowledge-base chunks.
4. Those chunks go into the system prompt (`lib/system-prompt.ts`), and GPT-4o streams the answer back.
5. Each request is logged to Postgres: question, answer, retrieval result, tokens, cost and latency. Rows are deleted after 180 days.

## Other pages

- `/dashboard`: public request, latency and cost metrics.
- `/dashboard/admin`: per-request log, password protected.
- `/api/health`: database, OpenAI key and backend status, polled by Checkly (`monitoring/`).

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Vercel AI SDK 4 with the OpenAI provider, Postgres, Recharts. Runs on OpenShift; built with Shipwright.

## Run it locally

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # then add OPENAI_API_KEY
npm run dev
```

Start the [jordannedyck-ai](https://github.com/jordanne-dyck/jordannedyck-ai) backend first on `localhost:5000`. Without `DATABASE_URL`, logging and rate limiting are skipped.

Open [http://localhost:3000](http://localhost:3000).

## Layout

```
app/            pages and API routes (api/chat, api/health, dashboard)
lib/            server code: input checks, rate limit, logging, queries, system prompt
db/schema.sql   chat_events table
k8s/prod/       production manifests
k8s/dev/        dev namespace and Shipwright builds
k8s/postgres/   Postgres, migration job, retention cronjob
monitoring/     Checkly checks
docs/           deploy notes; docs/archive holds finished plans
```

Deployment steps are in `CLAUDE.md`.
