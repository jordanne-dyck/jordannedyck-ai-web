# jordbot-dev

In-cluster dev mirror of the `jordbot` namespace. Argo CD syncs this folder
(`kustomize build k8s/dev`) to `jordbot-dev`, so a change here reaches dev once
it is merged to `master`. Argo reverts manual `oc apply` / `oc edit` changes to
the objects listed in `kustomization.yaml`.

## Rebuild after a code change
1. `git push` to the relevant GitHub repo (`master`).
2. Start a build of both images: `oc create -f k8s/dev/buildruns.yaml`
3. Watch: `oc -n jordbot-dev get buildruns` until `SUCCEEDED=True`.
4. Pick up the new `:dev` image by deleting the pod (Argo leaves this alone):
   `oc -n jordbot-dev delete pod -l app=jordannedyck-ai-web`
   (or `-l app=jordannedyck-ai` for the backend).

## Database migrations
`postgres-schema.yaml` is the schema the migration Job loads. It is what dev
and prod run today, and it can lag `db/schema.sql`. To ship a schema change,
copy `db/schema.sql` into `postgres-schema.yaml`, merge, then run the Job:

```bash
oc -n jordbot-dev delete job postgres-migrate --ignore-not-found
oc -n jordbot-dev create -f k8s/postgres/migration-job.yaml
oc -n jordbot-dev wait --for=condition=complete job/postgres-migrate --timeout=120s
```

## Backups
`backup-cronjob.yaml` dumps the dev database at 06:00 UTC and keeps the newest
14, on the `postgres-backups` PVC (`lvms-vg1`, the node's local disk, so not on
the NFS server that holds `postgres-data`). Each dump has a `.counts` file with
the row count of every table at backup time. Prod gets the same job in its own
PR, reviewed by Peter.

Verify by restoring, not by the job's status:

```bash
oc -n jordbot-dev create job --from=cronjob/postgres-backup postgres-backup-manual
oc -n jordbot-dev wait --for=condition=complete job/postgres-backup-manual --timeout=600s
oc -n jordbot-dev logs job/postgres-backup-manual   # dump size and row counts
scripts/postgres-restore-check.sh jordbot-dev
oc -n jordbot-dev delete job postgres-backup-manual
```

The script restores the newest dump into a throwaway Postgres pod (its own
random password, no app secret), compares row counts table by table and
prints `RESTORE OK` or `RESTORE MISMATCH`. It deletes the pod when done.

## Access
- Internal route: `oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'`
  (resolves on internal DNS only; not exposed on the public haproxy)
- Or: `oc -n jordbot-dev port-forward svc/jordannedyck-ai-web 3000:3000`

## Chat API contract
The web `/api/chat` endpoint expects an OpenAI-style messages array:
`{"messages":[{"role":"user","content":"..."}]}` and returns a streaming SSE response.

## Notes
- Secrets (`openai-api-key`, `app-database-url`, `app-observability`,
  `postgres-credentials`, `quaynekohouse`) come from Doppler and are managed
  outside this repo. Dev uses the prod `OPENAI_API_KEY`, so dev usage hits the
  prod key and quota. A pod only reads a rotated secret after it restarts.
- FAISS index (`documents.pkl`, `metadatas.pkl`, `resume.index`) was seeded once
  from prod; re-seed by repeating the clone steps in
  `docs/archive/plans/2026-06-14-jordbot-dev.md`.
