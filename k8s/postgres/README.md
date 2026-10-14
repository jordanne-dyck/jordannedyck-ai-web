# Postgres deployment for chat event logging

Internal-only Postgres for the observability stack. Stores one row per `/api/chat`
request, powering `/dashboard` (aggregates) and `/dashboard/admin` (drill-down).

## One-time setup

### 1. Create credentials secret

Pick a strong password (e.g. `openssl rand -base64 32`):

```bash
oc create secret generic postgres-credentials -n jordbot \
  --from-literal=POSTGRES_USER=jordbot \
  --from-literal=POSTGRES_PASSWORD='<paste-strong-password>' \
  --from-literal=POSTGRES_DB=monitoring
```

### 2. Create app DATABASE_URL secret

The Next.js app reads `DATABASE_URL`. Build it from the values above:

```bash
oc create secret generic app-database-url -n jordbot \
  --from-literal=DATABASE_URL='postgresql://jordbot:<paste-password>@postgres:5432/monitoring'
```

### 3. Apply storage + workload

```bash
oc apply -f k8s/postgres/pvc.yaml
oc apply -f k8s/postgres/deployment.yaml
oc apply -f k8s/postgres/service.yaml
```

Wait for the pod to be ready:

```bash
oc rollout status deployment/postgres -n jordbot
```

### 4. Load the schema

The migration job reads `db/schema.sql` from a ConfigMap. Build the ConfigMap
from the file, then run the job:

```bash
oc create configmap postgres-schema -n jordbot \
  --from-file=schema.sql=db/schema.sql

oc apply -f k8s/postgres/migration-job.yaml
oc wait --for=condition=complete job/postgres-migrate -n jordbot --timeout=120s
```

### Re-running the migration

Schema is `CREATE TABLE IF NOT EXISTS`, safe to re-run. To re-apply:

```bash
oc delete job postgres-migrate -n jordbot
oc create configmap postgres-schema -n jordbot \
  --from-file=schema.sql=db/schema.sql -o yaml --dry-run=client | oc apply -f -
oc apply -f k8s/postgres/migration-job.yaml
```

## Connecting from the app

The Next.js deployment must mount `DATABASE_URL` from the `app-database-url` secret.
Patch the existing deployment env:

```bash
oc set env deployment/jordannedyck-ai-web -n jordbot \
  --from secret/app-database-url
```

## Notes

- Service is `ClusterIP` only. **Do not** create a Route — Postgres should never be
  reachable from outside the cluster.
- Single replica is fine for our traffic. If we ever need HA, switch to the Crunchy
  or CloudNativePG operator.
- Storage: 5Gi NFS RWO. At ~1KB per event row, that holds ~5M events. Plenty.

## Monitoring rollout (site-monitoring plan, Phase 1)

Order matters: the new app code reads columns that only exist after the
migration, so migrate first, then roll out.

1. Re-run the migration (see "Re-running the migration" above). `db/schema.sql`
   now ends with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements, safe to
   re-run.
2. Add `MONITOR_TOKEN` to the `app-observability` secret (any long random
   string, e.g. `openssl rand -hex 32`). The same value goes into Checkly as
   `MONITOR_TOKEN` at `checkly deploy` time. Do not print it in logs.
3. Confirm `IP_HASH_SALT` is set in `app-observability`. `lib/ip.ts` falls back
   to a hardcoded default when it is missing.
4. Roll out the web image built from this branch.
5. Apply the retention job, which deletes `chat_events` rows older than 180 days
   daily at 07:30 UTC:

   ```bash
   oc apply -f k8s/postgres/retention-cronjob.yaml
   ```

Verify:

```bash
oc -n jordbot get cronjob chat-events-retention
curl -s https://www.jordannedyck.com/api/health
# -> {"ok":...,"db":true,"openai":"ok","backend":{...}}
```

## Dashboard v2 rollout (site-monitoring plan, 2026-10-14)

Order matters again: the v2 web image writes `retrieval_ms`, `source`,
`prompt_version`, `index_version` and `admin_login_attempts`, which exist only
after the migration.

1. Test in `jordbot-dev` first (see `k8s/dev/README.md`, "Postgres in dev").
2. Re-run the migration in `jordbot` (see "Re-running the migration").
3. Roll out the v2 web image.
4. Re-apply the retention job, which now also prunes `admin_login_attempts`:
   `oc apply -f k8s/postgres/retention-cronjob.yaml`
5. Backups: decide where dumps live first (see the comment at the top of
   `backup-cronjob.yaml`), then `oc apply -f k8s/postgres/backup-cronjob.yaml`.

Verify the backup by restoring it, not by the job's status:

```bash
oc -n jordbot create job --from=cronjob/postgres-backup postgres-backup-manual
oc -n jordbot wait --for=condition=complete job/postgres-backup-manual --timeout=300s
oc -n jordbot logs job/postgres-backup-manual      # shows the dump file and its size
```

Then restore that dump into a scratch database and compare
`SELECT COUNT(*) FROM chat_events` against the live table. The counts should
match, allowing for rows written since the dump.
