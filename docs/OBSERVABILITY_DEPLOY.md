# Observability rollout — deployment notes

End-to-end steps to ship the chat-event logging stack to the OpenShift cluster
(`ocp-centralis`, namespace `jordbot`).

Order matters: Postgres → secrets → image → app rollout → smoke test.

---

## 1. Postgres (one-time)

Follow `k8s/postgres/README.md`. Result:

- Deployment `postgres` running (1 replica, RWO PVC)
- Service `postgres.jordbot.svc.cluster.local:5432`
- `chat_events` table created via `postgres-migrate` Job
- Secrets `postgres-credentials` and `app-database-url` present

Verify:

```bash
oc get pods -n jordbot -l app=postgres
oc exec -n jordbot deploy/postgres -- \
  psql -U jordbot -d monitoring -c '\d chat_events'
```

---

## 2. App secrets

The Next.js app needs three new env vars on top of `OPENAI_API_KEY`:

| Variable                    | Purpose                                        |
|-----------------------------|------------------------------------------------|
| `DATABASE_URL`              | Postgres connection (mounted from secret)      |
| `IP_HASH_SALT`              | Salt for SHA-256 IP hashing — pick once, keep  |
| `DASHBOARD_ADMIN_PASSWORD`  | Password for `/dashboard/admin`                |

Create the app secret (or update if it already exists):

```bash
oc create secret generic app-observability -n jordbot \
  --from-literal=IP_HASH_SALT="$(openssl rand -hex 32)" \
  --from-literal=DASHBOARD_ADMIN_PASSWORD='<pick-a-password>'
```

`DATABASE_URL` already lives in `app-database-url` from the Postgres setup.
`MONITOR_TOKEN` also goes in `app-observability`; see `k8s/postgres/README.md`.

---

## 3. Build the image

There is no local build and no BuildConfig. Images are built by Shipwright in
`jordbot-dev` and pushed to `quay.nekohouse.ca:8443/peter/jordbot-web:dev`.
Follow "Development workflow (jordbot-dev)" in `CLAUDE.md`: push to `master`,
wait for CI, create a `jordbot-web` BuildRun, roll out and test in `jordbot-dev`.

Then promote the tested `:dev` image by retagging it `vX.Y`. Follow
"Deployment workflow (jordbot / production)", steps 1–2, in `CLAUDE.md`.

---

## 4. Roll out the app

The env vars are already wired in `k8s/prod/deployment-web.yaml`. Its
`envFrom` mounts `openai-api-key`, `app-database-url` and `app-observability`,
so do not use `oc set env`. Set the image tag in that file to the `vX.Y` from
step 3. Replace `REGISTRY_PLACEHOLDER` and `PULL_SECRET_PLACEHOLDER` locally,
without committing them, then apply:

```bash
oc apply -f k8s/prod/deployment-web.yaml -n jordbot
oc rollout status deployment/jordannedyck-ai-web -n jordbot
```

Commit and push the tag change afterwards. This is step 6 of the deployment
workflow in `CLAUDE.md`.

---

## 5. Smoke test

1. **Chat endpoint logs to Postgres**
   ```bash
   curl -sS https://www.jordannedyck.com/api/chat \
     -H 'content-type: application/json' \
     -d '{"messages":[{"role":"user","content":"hello"}]}' > /dev/null

   oc exec -n jordbot deploy/postgres -- \
     psql -U jordbot -d monitoring -c \
     "SELECT created_at, query, cost_usd, latency_ms FROM chat_events ORDER BY created_at DESC LIMIT 1;"
   ```

2. **Public dashboard renders** — visit `https://www.jordannedyck.com/dashboard`. Stat
   cards should show the request from step 1.

3. **Admin gate works** — visit `https://www.jordannedyck.com/dashboard/admin`. Login
   form appears. Wrong password → "Incorrect password". Right password →
   event table.

4. **Rate limit kicks in** — fire 25 requests in a minute from one IP. The 21st
   should return HTTP 429 with a `Retry-After` header, and the event row should
   have `rate_limited = TRUE`.

---

## Rollback

If the rollout misbehaves, the previous image is still in the ReplicaSet history:

```bash
oc rollout undo deployment/jordannedyck-ai-web -n jordbot
```

Postgres and its data persist independently — rolling back the app does not
touch event rows.

---

## Operational notes

- **Logging is fire-and-forget.** If Postgres is down, chat responses still
  succeed; only the analytics row is dropped. Watch the pod logs for
  `logChatEvent failed:` lines.
- **Rate-limit window is per-IP-hash.** Hashing uses `IP_HASH_SALT`, so rotating
  the salt resets all rate-limit counters and breaks correlation with
  historical rows. Only rotate when intentional.
- **Admin cookie binds to the password.** Rotating `DASHBOARD_ADMIN_PASSWORD`
  invalidates all existing admin sessions automatically (HMAC signature
  changes).
- **Personal details are redacted before storage.** Emails and phone numbers
  in the question and the stored answer become `[email]` / `[phone]` and are
  labelled `flags.pii` (`lib/classify.ts`). The original still goes to OpenAI.
  The notice under the chat box in `app/page.tsx` states the 180-day retention
  and the 14-day backup window. If you ever add authenticated user input,
  revisit before logging query text.
