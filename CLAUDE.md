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
| Backend deployment / service | `jordannedyck-ai` | Flask :5000, mounts PVC `faiss-db`. Dev also mounts PVC `faiss-share` (RWX, PV `jordbot-faiss-db-dev`) at `/faiss`; `FAISS_DIR` picks the version folder, now `/faiss/kb-762b34e` in dev and prod. Prod: PR #32 |
| Frontend deployment / service | `jordannedyck-ai-web` | Next.js :3000 |
| Database | `postgres` | Deployment, Service, PVC `postgres-data`, ConfigMap `postgres-schema` |
| Route | `jordbot` (prod), `jordbot-dev` (dev) | |
| Shipwright Builds (dev only) | `jordbot-ai`, `jordbot-web` | Build `master` and push `:dev` |
| Secrets (from Doppler) | `openai-api-key`, `app-database-url`, `app-observability`, `postgres-credentials`, `quaynekohouse` | Managed by Peter. A pod reads a rotated secret only after it restarts |

### Chat API contract

`POST /api/chat` (Next.js forwards retrieval to Flask), body `{"messages": [{"role": "user", "content": "your question"}]}`. Returns an AI SDK UI message stream (SSE: `data: {"type":"text-delta","delta":"..."}` lines; types in `lib/chat-message.ts`). Every answer ends with a `data-sources` part (cited source titles and numbers, no chunk ids or text) and, for logged visitor answers, `data-event`. Requests with `x-monitor-token` or `EMIT_RETRIEVAL` also get `data-retrieval` and `data-citations` parts. Before 2026-10-27 this was the AI SDK v4 data stream (`0:` / `8:` lines).

### Observability

| Piece | Where | Detail |
|---|---|---|
| Chat event log | Postgres, table `chat_events` | One row per `/api/chat` request. Schema: `db/schema.sql`; the deployed schema is `k8s/*/postgres-schema.yaml`. See `k8s/postgres/README.md` |
| Retention and backups | `k8s/postgres/*-cronjob.yaml` | 180 days and 14 days of backups, as stated in `app/page.tsx`. **Not deployed yet**; deploying them needs Peter |
| Public dashboard | `/dashboard` | Aggregates only |
| Admin view | `/dashboard/admin` | Per-request drill-down, behind `DASHBOARD_ADMIN_PASSWORD` (Jordanne logs in herself; don't read it from the secret). Traffic filter: Real (default), Smoke tests (`flags ? 'smoke'`), All synthetic |
| Health | `/api/health` | Public summary, including `prompt_version` and `release` (the image tag, `dev` on dev builds); `?deep=1` with `x-monitor-token` adds anomaly stats |
| Prod smoke test | `scripts/smoke-prod.mjs` | After every release; see [Prod release step 4](#4-verify). Requests with a valid `x-monitor-token` and `x-smoke-run: <tag>` are stored with `flags.smoke`; without the token the header is ignored |
| Checkly checks | `monitoring/` | Own `package.json`; `npm test` / `npm run deploy` from that folder |

Frontend environment: `OPENAI_API_KEY`, `DATABASE_URL`, `IP_HASH_SALT`, `DASHBOARD_ADMIN_PASSWORD`, `MONITOR_TOKEN` (Checkly: synthetic marker and `/api/health?deep=1` only), `ADMIN_API_TOKEN` (`/api/admin/*` via `x-admin-token`; must differ from `MONITOR_TOKEN`), `FLASK_API_URL`, and optional `EMIT_RETRIEVAL` (exposes retrieved chunks in the stream; evals only, never in prod).

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

- `ci.yml` (both repos): lint (`ruff check` / `npm run lint`), a gitleaks scan of the whole git history, and a Trivy scan. A leaked secret or a HIGH/CRITICAL CVE fails it. The CI scan catches a missed pre-push `gitleaks` run after the push, so the local run is still required. Runs on pushes to `master`, PRs and weekly.
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

Only release commits that passed the dev checks and the release gate, and are merged to `master`.

### 0. Release gate (required, CI-enforced)

Every prod change, meaning a new image tag or a new prod `FAISS_DIR`, needs an evidence file in the same PR: `releases/<image>-<tag>.json` or `releases/faiss-<folder>.json`. The `Validate k8s manifests` check (`.github/scripts/check-release-evidence.py`) fails the PR without it. Rollbacks to a tag or index prod has already run need no file.

The dev checks above prove the site responds. They are not the gate. The gate needs all of this, for the exact prompt and index prod will run:

1. **Dev runs the release candidate.** Build `$SHA` to `:dev`, roll it out, and have dev's `FAISS_DIR` set to the index going to prod. `curl -s $DEV/api/health` shows the `prompt_version` you expect.
2. **Full evals, which are paid and need Jordanne's go first.** Run each with `--estimate` first. From `jordannedyck-ai`: a full single-turn `run_eval.py` run and a full `run_eval.py --multiturn` run, both without `--only`, on that prompt and index. Then a full `run_e2e.py --source-system dev` run against dev. It is paced over several sittings with `--resume`, and only the final sitting counts as full.
3. **Generate the evidence.** In `jordannedyck-ai`:
   `uv run python release_gate.py --image jordbot-web --tag vX.Y --sha $SHA --prompt <prompt_version> --index <index id>`
   For an index promotion, use `--faiss-dir /faiss/kb-<commit>` instead of `--image/--tag/--sha`. The script writes into `releases/` here and prints every failing check by case.
4. **Read every failure and get Jordanne's ruling.** Open the answers themselves, not the pass rate. Write her ruling into that failure's `signoff` in her words: a checker miss, a known defect she accepts for this release, or a blocker. A blocker stops the release. A tier-1 failure (`T1.*`) can only be signed off as `checker miss: <why>`, or as `not served: <why>` when the site never sends that text and the dev e2e run passed the same case (A01: the site's fixed reply replaces the model's refusal). CI rejects any other ruling. Don't write a sign-off for her.
   A sign-off holds only for the run and failure count it was given on. A new run clears it (the old ruling stays as `previous_signoff`, which nothing checks), so Jordanne rules again. CI rejects a failure that isn't from the run the evidence names.
5. **Docs, reviewed and approved by Jordanne.** The gate lists the docs it needs: README, EVALS, DECISIONS and COVERAGE in `jordannedyck-ai`, and this repo's README. Jordanne first reviews every results-log entry still `reviewed: no`, since the docs draw on them. Then the docs are updated from the reviewed results, the release's runs and the commits that shipped, and she gets a review packet: per doc, only what was added or changed, each new fact with its source. She edits or approves. The approved text is merged to master in each repo, the gate is re-run so each doc's `commit` is the merged one, and she sets `"approved": true`. A doc that changes on master after approval needs approving again. COVERAGE.md must be exactly what `coverage_report.py --write` produces. CI rejects the PR otherwise.
6. **QA on dev.** Jordanne ticks each `qa` item (`"done": true`) once it is done on dev, on a phone where the item says so.
7. **Re-run the gate.** It keeps sign-offs, ticks and approved docs. Then add the evidence file to the release PR (step 3 below) or the `FAISS_DIR` PR. It must say `"status": "pass"`.

An index promotion and the frontend release it was tested with go out together. Merge the `FAISS_DIR` PR, then the release PR straight after.

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

Then run the step 2 BuildRun from the dev loop with these changes:

- `generateName: ${BUILD}-release-`
- `image: quay.nekohouse.ca:8443/peter/${IMAGE}:vX.Y`
- For `jordbot-web` only, bake the tag in, so `/api/health` reports it as `release` (the smoke test in step 4 waits for it). Add to `paramValues`:

  ```yaml
        - name: build-args
          values:
            - value: RELEASE=vX.Y
  ```

  Without it the image reports `"release": "dev"`, and the smoke test fails once its wait runs out.

Wait until `SUCCEEDED=True`, the same as in dev. No podman and no Quay login.

### 3. Open the bump PR

```bash
git switch -c release/<image>-vX.Y origin/master
# edit only newTag for that image in k8s/prod/release/kustomization.yaml
# add the gate's evidence file: releases/<image>-vX.Y.json (status "pass")
git add releases/<image>-vX.Y.json
gitleaks git --no-banner
git commit -am "release: <image> vX.Y" && git push origin HEAD
gh pr create --repo jordanne-dyck/jordannedyck-ai-web --fill
```

- Change nothing else in the PR except the evidence file. CI rejects anything in the release file except the two tags, fails without passing evidence, and any other `k8s/` change waits for Peter.
- Merge once `Validate k8s manifests` passes.

### 4. Verify

Argo syncs within about 3 minutes of the merge.

```bash
oc -n jordbot get deploy jordannedyck-ai jordannedyck-ai-web \
  -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image
oc -n jordbot rollout status deploy/jordannedyck-ai-web --timeout=5m
curl -s https://jordannedyck.com/api/health        # "release" shows the new jordbot-web tag
```

Then run the smoke test and read every answer it prints: `MONITOR_TOKEN=... node scripts/smoke-prod.mjs --tag vX.Y --wait 600`. It checks health, `prompt_version` against the evidence file, and 7 chats. It exits 1 on a failed check; red means prod is broken, so go to [Rollback](#rollback). Its chats are stored with `is_synthetic = TRUE` and `flags.smoke = <tag>`, so the public dashboard never counts them, and they show under **Smoke tests** in `/dashboard/admin`. Each run is 5 gpt-4o answers, a few cents.

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
