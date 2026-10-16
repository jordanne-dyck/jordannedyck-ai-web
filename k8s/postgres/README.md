# Postgres jobs

Postgres itself (Deployment, Service, PVC, `postgres-schema` ConfigMap) is part
of `k8s/prod` and `k8s/dev`, and Argo CD keeps it in sync. The database stores
one row per `/api/chat` request in `chat_events`, powering `/dashboard` and
`/dashboard/admin`. Credentials (`postgres-credentials`, `app-database-url`)
come from Doppler and are managed outside this repo.

This folder holds the jobs that Argo CD does **not** sync:

| File | What | Status |
|---|---|---|
| `migration-job.yaml` | Loads `postgres-schema` into the database | Run by hand after a schema change |
| `retention-cronjob.yaml` | Deletes rows older than 180 days, daily | Not deployed |
| `backup-cronjob.yaml` | Nightly `pg_dump`, keeps 14 | Not deployed; storage is Peter's call (see the file header) |

The retention and backup periods are stated to visitors in `app/page.tsx`.
Neither job runs today, so deploying them (through `k8s/prod`, with Peter's
review) is still open.

## Running a migration

The schema is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, safe to
re-run. Order matters: migrate before rolling out an image that reads new
columns.

1. Copy `db/schema.sql` into `k8s/dev/postgres-schema.yaml`, merge, run the Job
   in `jordbot-dev` (see `k8s/dev/README.md`) and test.
2. Do the same with `k8s/prod/postgres-schema.yaml` and run the Job in `jordbot`:

```bash
oc -n jordbot delete job postgres-migrate --ignore-not-found
oc -n jordbot create -f k8s/postgres/migration-job.yaml
oc -n jordbot wait --for=condition=complete job/postgres-migrate --timeout=120s
```

3. Release the image that needs the new columns.

## Verifying a backup

Verify by restoring, not by the job's status:

```bash
oc -n jordbot create job --from=cronjob/postgres-backup postgres-backup-manual
oc -n jordbot wait --for=condition=complete job/postgres-backup-manual --timeout=300s
oc -n jordbot logs job/postgres-backup-manual      # shows the dump file and its size
```

Then restore that dump into a scratch database and compare
`SELECT COUNT(*) FROM chat_events` against the live table.

## Notes

- Service is `ClusterIP` only. **Do not** create a Route: Postgres should never
  be reachable from outside the cluster.
- Single replica is fine for our traffic. For HA, switch to the Crunchy or
  CloudNativePG operator.
- Storage: 5Gi NFS RWO, ~5M rows at ~1KB each.
