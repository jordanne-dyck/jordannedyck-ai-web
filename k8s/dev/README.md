# jordbot-dev

In-cluster dev mirror of the `jordbot` namespace. See
`docs/archive/specs/2026-06-14-jordbot-dev-design.md` and
`docs/archive/plans/2026-06-14-jordbot-dev.md`.

## Rebuild after a code change
1. `git push` to the relevant GitHub repo (`master`).
2. Trigger a build:
   `oc create -f k8s/dev/22-buildrun-templates.yaml`
3. Watch: `oc -n jordbot-dev get buildruns` until `SUCCEEDED=True`.
4. Roll out the new image:
   `oc -n jordbot-dev rollout restart deploy/jordannedyck-ai deploy/jordannedyck-ai-web`

## Access
- Internal route: `oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'`
  (resolves on internal DNS only; not exposed on the public haproxy)
- Or: `oc -n jordbot-dev port-forward svc/jordannedyck-ai-web 3000:3000`

## Chat API contract
The web `/api/chat` endpoint expects an OpenAI-style messages array:
`{"messages":[{"role":"user","content":"..."}]}` and returns a streaming SSE response.

## Notes
- Reuses the prod `OPENAI_API_KEY` (Doppler) via an ExternalSecret — dev usage hits the prod key/quota.
- FAISS index (`documents.pkl`, `metadatas.pkl`, `resume.index`) seeded once from prod; re-seed by repeating the clone steps in the plan.
- Not exposed publicly (not on the droplet haproxy).
- Manifests apply in numeric order (`00-` … `50-`).

## Postgres in dev (added 2026-10-14)

So database changes can be tested before prod. Same setup as
`k8s/postgres/README.md`, in `jordbot-dev`, with a different password.

```bash
oc create secret generic postgres-credentials -n jordbot-dev \
  --from-literal=POSTGRES_USER=jordbot \
  --from-literal=POSTGRES_PASSWORD='<new dev password>' \
  --from-literal=POSTGRES_DB=monitoring
oc create secret generic app-database-url -n jordbot-dev \
  --from-literal=DATABASE_URL='postgresql://jordbot:<new dev password>@postgres:5432/monitoring'
oc create secret generic app-observability -n jordbot-dev \
  --from-literal=IP_HASH_SALT="$(openssl rand -hex 16)" \
  --from-literal=DASHBOARD_ADMIN_PASSWORD='<dev admin password>' \
  --from-literal=MONITOR_TOKEN="$(openssl rand -hex 32)"

oc apply -f k8s/dev/60-postgres.yaml
oc -n jordbot-dev rollout status deployment/postgres
oc create configmap postgres-schema -n jordbot-dev \
  --from-file=schema.sql=db/schema.sql -o yaml --dry-run=client | oc apply -f -
oc apply -f k8s/dev/61-postgres-migrate.yaml
oc -n jordbot-dev wait --for=condition=complete job/postgres-migrate --timeout=120s
oc apply -f k8s/dev/41-deployment-web.yaml
oc -n jordbot-dev rollout restart deploy/jordannedyck-ai-web
```

Verify: `curl -s https://<dev route>/api/health` shows `"db":true`. Then send one
chat and confirm it appears in `/dashboard/admin` on the dev route.
