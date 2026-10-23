# jordbot — Agent Instructions

How to develop, test and release jordbot (jordannedyck.com). Read this before taking any action. The companion repo `jordannedyck-ai` points here.

## How deploys work (read first)

- **Git is the deploy mechanism.** Argo CD renders `k8s/prod` (namespace `jordbot`) and `k8s/dev` (namespace `jordbot-dev`) from `master` of this repo and keeps the cluster matching them. Both apps self-heal: a manual `oc apply`, `oc edit`, `oc scale` or `oc set image` on an object Argo tracks is reverted within minutes.
- **Prod changes only through a pull request.** A release is a PR that changes `k8s/prod/release/kustomization.yaml`. A rollback is reverting that PR.
- **Images are built in the cluster** by Shipwright in `jordbot-dev`. You never run podman, and you never handle Quay credentials.
- **Peter owns the cluster.** The namespaces, RBAC, ExternalSecrets and the Argo apps live in his repos, not here. See [Needs Peter](#needs-peter).

## Preflight: run before any cluster command

```bash
oc whoami --request-timeout=5s
```

- Expected output: `system:serviceaccount:jordbot-dev:jordbot-agent`.
- **Timeout, connection refused or DNS error:** the cluster API is only reachable from the home LAN. Stop and tell Jordanne to switch to the home network. Do not retry, and do not work around it (no VPN, proxy or other cluster).
- **Any other identity:** stop. Do not run cluster commands until the kubeconfig below is active.

## Identity and limits

Use only the `jordbot-agent` kubeconfig (service account `jordbot-dev/jordbot-agent`). Never use `kubeadmin`, `oc login` with a password, or anyone else's token.

| | `jordbot-dev` (dev) | `jordbot` (prod) |
|---|---|---|
| Read pods, logs, deployments, routes, events | yes | yes |
| Start BuildRuns, restart deployments, delete pods | yes | delete pods only |
| `oc apply` / edit objects | yes (experiments; see dev loop) | **no** (use a PR) |
| `oc exec` | yes | read-only diagnostics only |
| ExternalSecrets | **no** (blocked by policy) | no |

Hard rules, whatever the RBAC allows:

- **Never read Secrets.** Not with `oc get secret`, `oc extract`, `-o yaml`, `env`/`printenv` in an `oc exec`, or by mounting them into a pod. This includes `quaynekohouse` in dev, which your role can technically read.
- **Never handle Quay credentials.** No `podman login`, no copying `.dockerconfigjson`.
- **Never create or edit ExternalSecrets or PushSecrets.** New secrets go through Peter.
- **In prod, deleting a pod is the only action** that changes anything. Everything else in `jordbot` is read-only.
- Nothing outside `jordbot` and `jordbot-dev`. A `Forbidden` error means you are outside your scope: stop and ask, don't look for another way.

## Repos and local paths

| Repo | GitHub | Local path (Windows) | Purpose |
|---|---|---|---|
| jordannedyck-ai | `github.com/jordanne-dyck/jordannedyck-ai` | `C:\Users\Jord\jordannedyck-ai` | Flask backend, port 5000 (image `jordbot`) |
| jordannedyck-ai-web | `github.com/jordanne-dyck/jordannedyck-ai-web` | `C:\Users\Jord\jordannedyck-ai-web` | Next.js frontend, port 3000 (image `jordbot-web`), and the `k8s/` manifests |

Both repos are **public**. Commands below are bash (WSL or Git Bash).

`master` of `jordannedyck-ai-web` is protected:

- Every change goes through a PR, and the `Validate k8s manifests` check must pass.
- Peter must review any change under `k8s/prod/`, `k8s/postgres/` or `.github/`, **except** `k8s/prod/release/kustomization.yaml` (`.github/CODEOWNERS`).
- App code, docs, `k8s/dev/` and this file merge without his review.

## Architecture

```
Browser → Route → jordannedyck-ai-web :3000 (Next.js)
                          ↓
              jordannedyck-ai :5000 (Flask)
                          ↓
              OpenAI API + FAISS index (PVC faiss-db)
```

| Namespace | Purpose | Images | URL |
|---|---|---|---|
| `jordbot-dev` | Development, build and test | `…/peter/jordbot:dev`, `…/peter/jordbot-web:dev` | https://jordbot-dev-jordbot-dev.apps.ocp-centralis.nekohouse.ca (home LAN only) |
| `jordbot` | Production | `…/peter/jordbot:vX.Y`, `…/peter/jordbot-web:vX.Y` | https://jordannedyck.com |

Registry: `quay.nekohouse.ca:8443/peter/...`. `:dev` is overwritten by every dev build. `vX.Y` tags are immutable: never reuse one.

### Key resources (same names in both namespaces)

| Resource | Name | Detail |
|---|---|---|
| Backend deployment / service | `jordannedyck-ai` | Flask :5000, mounts PVC `faiss-db`. Dev also mounts PVC `faiss-share` (RWX, PV `jordbot-faiss-db-dev`) at `/faiss`; `FAISS_DIR` picks the version folder, now `/faiss/kb-a69ceae`. Prod: PR #32 |
| Frontend deployment / service | `jordannedyck-ai-web` | Next.js :3000 |
| Database | `postgres` | Deployment, Service, PVC `postgres-data`, ConfigMap `postgres-schema` |
| Route | `jordbot` (prod), `jordbot-dev` (dev) | |
| Shipwright Builds (dev only) | `jordbot-ai`, `jordbot-web` | Build `master` and push `:dev` |
| Secrets (from Doppler) | `openai-api-key`, `app-database-url`, `app-observability`, `postgres-credentials`, `quaynekohouse` | Managed by Peter. A pod reads a rotated secret only after it restarts |

### Chat API contract

`POST /api/chat` (Next.js forwards retrieval to Flask), body `{"messages": [{"role": "user", "content": "your question"}]}`. Returns a streaming SSE response.

### Observability

| Piece | Where | Detail |
|---|---|---|
| Chat event log | Postgres, table `chat_events` | One row per `/api/chat` request. Schema: `db/schema.sql`; the deployed schema is `k8s/*/postgres-schema.yaml`. See `k8s/postgres/README.md` |
| Retention and backups | `k8s/postgres/*-cronjob.yaml` | 180 days and 14 days of backups, as stated in `app/page.tsx`. **Not deployed yet**; deploying them needs Peter |
| Public dashboard | `/dashboard` | Aggregates only |
| Admin view | `/dashboard/admin` | Per-request drill-down, behind `DASHBOARD_ADMIN_PASSWORD` (Jordanne logs in herself; don't read it from the secret) |
| Health | `/api/health` | Public summary; `?deep=1` with `x-monitor-token` adds anomaly stats |
| Checkly checks | `monitoring/` | Own `package.json`; `npm test` / `npm run deploy` from that folder |

Frontend environment: `OPENAI_API_KEY`, `DATABASE_URL`, `IP_HASH_SALT`, `DASHBOARD_ADMIN_PASSWORD`, `MONITOR_TOKEN`, `FLASK_API_URL`, and optional `EMIT_RETRIEVAL` (exposes retrieved chunks in the stream; evals only, never in prod).

### Repo layout

| Path | What |
|---|---|
| `app/` | Next.js pages and API routes (`api/chat`, `api/health`, `dashboard`) |
| `lib/` | Server code. `system-prompt.ts` must stay byte-identical to `SYSTEM_PROMPT` in `jordannedyck-ai/run_eval.py` |
| `k8s/prod/` | Prod kustomize root. `release/kustomization.yaml` holds the two prod image tags |
| `k8s/dev/` | Dev kustomize root, Shipwright Builds, `buildruns.yaml` |
| `k8s/postgres/` | Migration Job and retention/backup CronJobs (not synced by Argo) |
| `monitoring/` | Checkly checks |
| `docs/archive/` | Finished plans, specs and old runbooks, kept for history. Don't follow their deploy steps |

---

## CI (GitHub Actions)

- `ci.yml` (both repos): lint (`ruff check` / `npm run lint`) and a Trivy scan. HIGH/CRITICAL CVEs fail it. Runs on pushes to `master`, PRs and weekly.
- `k8s.yml` (this repo): `kustomize build` and `kubeconform` for both roots, plus a check that the release file only sets the two `vX.Y` tags. Required on every PR.
- Backend dependency changes: edit `pyproject.toml`, run `uv lock`, commit both files.

```bash
gh run list --repo jordanne-dyck/jordannedyck-ai --limit 3
gh run list --repo jordanne-dyck/jordannedyck-ai-web --limit 3
```

CI can't reach the cluster, so it never builds or deploys. Don't start a build from a commit whose CI is failing.

---

## Dev loop (`jordbot-dev`)

Do all testing in dev. **Never test in prod.**

### 1. Push the change

```bash
gitleaks git --no-banner          # always, before pushing to these public repos
git push origin <branch>          # a branch, or master where the repo allows it
SHA=$(git rev-parse HEAD)         # the exact commit under test; you need it for the release
```

### 2. Start a BuildRun

Build only the image that changed. This builds the exact `$SHA` (from any branch) and pushes `:dev`:

```bash
# Backend: REPO=jordannedyck-ai     IMAGE=jordbot      BUILD=jordbot-ai
# Frontend: REPO=jordannedyck-ai-web IMAGE=jordbot-web  BUILD=jordbot-web
oc create -o name -f - <<EOF
apiVersion: shipwright.io/v1beta1
kind: BuildRun
metadata:
  generateName: ${BUILD}-${SHA:0:7}-
  namespace: jordbot-dev
spec:
  build:
    spec:
      source:
        type: Git
        git:
          url: https://github.com/jordanne-dyck/${REPO}.git
          revision: ${SHA}
      strategy:
        kind: ClusterBuildStrategy
        name: buildah-lvms
      paramValues:
        - name: dockerfile
          value: Containerfile
      output:
        image: quay.nekohouse.ca:8443/peter/${IMAGE}:dev
        pushSecret: quaynekohouse
EOF
```

Shortcut when `master` is what you want to test: `oc create -f k8s/dev/buildruns.yaml` builds both images from `master` with the `jordbot-ai` / `jordbot-web` Builds.

Wait for it (usually 5–20 minutes; the frontend `npm ci` step is the slow part):

```bash
oc -n jordbot-dev wait --for=condition=Succeeded buildrun/<name> --timeout=30m
oc -n jordbot-dev get buildrun <name>      # SUCCEEDED must be True
```

If it fails or runs past 30 minutes:
`oc -n jordbot-dev logs -l buildrun.shipwright.io/name=<name> --all-containers`

### 3. Roll out the new `:dev` image

Deployments pull with `imagePullPolicy: Always`, so a restart picks up the new `:dev`. Argo ignores dev restarts.

```bash
oc -n jordbot-dev rollout restart deploy/jordannedyck-ai-web      # and/or deploy/jordannedyck-ai
oc -n jordbot-dev rollout status  deploy/jordannedyck-ai-web --timeout=5m
```

Deleting the pod also works: `oc -n jordbot-dev delete pod -l app=jordannedyck-ai-web`.

### 4. Check

```bash
DEV=https://jordbot-dev-jordbot-dev.apps.ocp-centralis.nekohouse.ca
curl -s $DEV/api/health                                   # "ok":true, "db":true
curl -sN $DEV/api/chat -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What does Jordanne do?"}]}' | head -c 600
curl -s -o /dev/null -w '%{http_code}\n' $DEV/dashboard/admin   # 200 (login page)
```

Check that the chat answer makes sense, not just that it returns. If a pod crashes:
`oc -n jordbot-dev logs deploy/jordannedyck-ai-web --previous`.

### Experiments in dev

- You may `oc apply` or edit things in `jordbot-dev` to try something out.
- Argo resets every object defined in `k8s/dev` back to git within minutes. Anything you want to keep must be committed and merged; changes under `k8s/dev` merge without Peter, `k8s/prod` and `k8s/postgres` need his review.
- Extra objects you create (a test pod or ConfigMap) aren't removed by Argo. Delete them when you're done.

### Schema changes

Follow `k8s/postgres/README.md`. In dev you can run the migration Job yourself. Prod needs Peter, because you can't create Jobs in `jordbot`.

---

## Prod release

Only release commits that passed the dev checks and are merged to `master`.

### 1. Pick the next unused tag

Tags are immutable, so pick a tag that doesn't exist yet. Quay needs credentials, so list its tags through a throwaway ImageStream instead:

```bash
for r in jordbot jordbot-web; do
  oc -n jordbot-dev import-image tagcheck-$r --from=quay.nekohouse.ca:8443/peter/$r --all --confirm >/dev/null
  echo "$r: $(oc -n jordbot-dev get is tagcheck-$r -o jsonpath='{.status.tags[*].tag}')"
  oc -n jordbot-dev delete is tagcheck-$r >/dev/null
done
cat k8s/prod/release/kustomization.yaml        # what prod runs now
```

The next tag is one minor above the highest existing tag of that image, even if prod runs an older one. Example: the highest is `v1.7`, so the next is `v1.8`. Backend and frontend are numbered separately. If the tag already appears in Quay, pick the next one; never overwrite it.

### 2. Build `vX.Y` at the tested commit

Use the same `$SHA` you tested in dev:

```bash
git fetch origin && git merge-base --is-ancestor $SHA origin/master && echo "on master"
```

Then run the step 2 BuildRun from the dev loop with two changes:

- `generateName: ${BUILD}-release-`
- `image: quay.nekohouse.ca:8443/peter/${IMAGE}:vX.Y`

Wait until `SUCCEEDED=True`, the same as in dev. No podman and no Quay login.

### 3. Open the bump PR

```bash
git switch -c release/<image>-vX.Y origin/master
# edit only newTag for that image in k8s/prod/release/kustomization.yaml
gitleaks git --no-banner
git commit -am "release: <image> vX.Y" && git push origin HEAD
gh pr create --repo jordanne-dyck/jordannedyck-ai-web --fill
```

- Change nothing else in the PR. CI rejects anything in that file except the two tags, and any other `k8s/` change waits for Peter.
- Merge once `Validate k8s manifests` passes.

### 4. Verify

Argo syncs within about 3 minutes of the merge.

```bash
oc -n jordbot get deploy jordannedyck-ai jordannedyck-ai-web \
  -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image
oc -n jordbot rollout status deploy/jordannedyck-ai-web --timeout=5m
curl -s https://jordannedyck.com/api/health
```

Then send one chat on https://jordannedyck.com.

## Rollback

Revert the bump PR:

```bash
git switch -c revert/<image>-vX.Y origin/master
git revert <merge-commit-of-the-bump-PR>
git push origin HEAD && gh pr create --repo jordanne-dyck/jordannedyck-ai-web --fill
```

- Merge it, and Argo rolls prod back to the previous tag. Never retag or overwrite an image to roll back.
- A stuck prod pod can be deleted (`oc -n jordbot delete pod <name>`). That is the only prod action allowed on the cluster.

## Needs Peter

Don't attempt these. Write Jordanne a short request for Peter: what you need, why, and the exact change.

- New or changed secrets or environment values from Doppler, including key rotation.
- RBAC, ServiceAccounts, or anything outside `jordbot` and `jordbot-dev`.
- Structural changes under `k8s/prod/`, `k8s/postgres/` or `.github/`: new objects, env vars, resources, replicas, routes. These are PRs he must approve (CODEOWNERS).
- Anything in prod beyond a release, a rollback or deleting a pod. That includes schema migrations, re-seeding the FAISS PVC and deploying the retention/backup CronJobs.
- The cluster, Argo CD, Quay, DNS or haproxy.

---

## Security rules (non-negotiable)

- Never commit `.env`, `.env.local`, or anything containing `OPENAI_API_KEY`.
- Run `gitleaks git --no-banner` before every push to these public repos. If it reports findings, stop and fix them first.
- Never read, print or copy Secrets, tokens or the kubeconfig contents.
- Never use `:dev` images in prod.

## Troubleshooting

| Symptom | First check |
|---|---|
| `oc whoami` times out or can't resolve the host | Not on the home LAN. Stop and ask Jordanne to switch networks |
| `Forbidden` | The action is outside your scope. Stop; if it's needed, it goes to Peter |
| Your manual change in a namespace disappeared | Argo self-heal. Commit it to git instead |
| BuildRun failed or stuck in `Running` > 30 min | `oc -n jordbot-dev logs -l buildrun.shipwright.io/name=<name> --all-containers` |
| Release PR fails `Validate k8s manifests` | It changed something other than a `newTag`, or the tag isn't `vX.Y` |
| Prod still on the old image after merge | Wait 3 min, then `oc -n jordbot get deploy -o wide`. Still old after 10 min: ask Peter to check Argo |
| Pod `CrashLoopBackOff` | `oc -n <ns> logs deploy/<name> --previous` |
| `ImagePullBackOff` | The tag doesn't exist in Quay (check with the tag listing in release step 1) |
| Secret missing or `CreateContainerConfigError` | `oc -n <ns> get externalsecret`. If not `READY`, ask Peter |
| Rotated key not picked up | Restart the pod (dev: `rollout restart`; prod: delete the pod) |
| FAISS errors in backend logs | The `faiss-db` PVC may be empty. Dev: re-seed (`docs/archive/plans/2026-06-14-jordbot-dev.md`). Prod: ask Peter |
| Frontend can't reach backend | `FLASK_API_URL` should be `http://jordannedyck-ai:5000` |
