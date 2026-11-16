# Postgres jobs

Postgres itself (Deployment, Service, PVC, `postgres-schema` ConfigMap) is part
of `k8s/prod` and `k8s/dev`, and Argo CD keeps it in sync. The database stores
one row per `/api/chat` request in `chat_events`, powering `/dashboard` and
`/dashboard/admin`. Credentials (`postgres-credentials`, `app-database-url`)
come from Doppler and are managed outside this repo.

This folder holds the job that Argo CD does **not** sync:

| File | What | Status |
|---|---|---|
| `migration-job.yaml` | Loads `postgres-schema` into the database | Run by hand after a schema change |

The retention CronJob is `k8s/prod/retention-cronjob.yaml`, synced by Argo CD in
prod: chats and admin logins after 180 days, leads after 365. Dev has none.

The backup CronJob is `k8s/prod/backup-cronjob.yaml` (and
`k8s/dev/backup-cronjob.yaml`), synced by Argo CD: a nightly `pg_dump` at 06:00
UTC, keeping 14, on a `postgres-backups` PVC on `lvms-vg1` (the node's local
disk), so losing the NFS server that holds `postgres-data` does not also lose
the backups. It does not survive losing the node; an off-site copy is not built.

The retention and backup periods are stated to visitors in `app/page.tsx` and
`lib/leads.ts`. Change them together.

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

Verify by restoring, not by the job's status. Each dump has a `.counts` file
beside it with every table's row count at backup time.
`scripts/postgres-restore-check.sh <namespace>` restores the newest dump into a
throwaway Postgres pod (its own random password, no app secret), compares the
counts table by table, prints `RESTORE OK` or `RESTORE MISMATCH`, and deletes
the pod.

In prod the agent cannot create Jobs or pods, so Peter runs this:

```bash
oc -n jordbot create job --from=cronjob/postgres-backup postgres-backup-manual
oc -n jordbot wait --for=condition=complete job/postgres-backup-manual --timeout=600s
oc -n jordbot logs job/postgres-backup-manual      # dump size and row counts
scripts/postgres-restore-check.sh jordbot
oc -n jordbot delete job postgres-backup-manual
```

In dev, see `k8s/dev/README.md`.

## Notes

- Service is `ClusterIP` only. **Do not** create a Route: Postgres should never
  be reachable from outside the cluster.
- Single replica is fine for our traffic. For HA, switch to the Crunchy or
  CloudNativePG operator.
- Storage: 5Gi NFS RWO, ~5M rows at ~1KB each.
