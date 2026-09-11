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
