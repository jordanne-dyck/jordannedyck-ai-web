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

---

## 3. Build and push the image

Build locally and push to Quay (using existing `quaynekohouse` pull secret):

```bash
# from repo root
docker build -t quay.io/nekohouse/jordannedyck-ai-web:obs-1 .
docker push quay.io/nekohouse/jordannedyck-ai-web:obs-1
```

If you'd rather use OpenShift's in-cluster build, trigger the existing
BuildConfig instead:

```bash
oc start-build jordannedyck-ai-web -n jordbot --follow
```

---

## 4. Roll out the app

Wire the new env vars to the deployment, point at the new image, and restart:

```bash
# Env: DATABASE_URL (from postgres setup) + IP_HASH_SALT + DASHBOARD_ADMIN_PASSWORD
oc set env deployment/jordannedyck-ai-web -n jordbot \
  --from secret/app-database-url
oc set env deployment/jordannedyck-ai-web -n jordbot \
  --from secret/app-observability

# Update image (skip if using BuildConfig — it patches automatically)
oc set image deployment/jordannedyck-ai-web -n jordbot \
  jordannedyck-ai-web=quay.io/nekohouse/jordannedyck-ai-web:obs-1

oc rollout status deployment/jordannedyck-ai-web -n jordbot
```

---

## 5. Smoke test

1. **Chat endpoint logs to Postgres**
   ```bash
   curl -sS https://jordanedyck.com/api/chat \
     -H 'content-type: application/json' \
     -d '{"messages":[{"role":"user","content":"hello"}]}' > /dev/null

   oc exec -n jordbot deploy/postgres -- \
     psql -U jordbot -d monitoring -c \
     "SELECT created_at, query, cost_usd, latency_ms FROM chat_events ORDER BY created_at DESC LIMIT 1;"
   ```

2. **Public dashboard renders** — visit `https://jordanedyck.com/dashboard`. Stat
   cards should show the request from step 1.

3. **Admin gate works** — visit `https://jordanedyck.com/dashboard/admin`. Login
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
- **No PII.** Queries are stored verbatim because the bot is public-facing and
  this is documented in the dashboard footer. If you ever add authenticated
  user input, revisit before logging raw query text.
