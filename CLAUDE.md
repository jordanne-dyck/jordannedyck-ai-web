# jordbot — Agent Instructions

AI agent reference for developing and deploying jordbot. Read this before taking any action.

## Repos and local paths

| Repo | GitHub | Local path | Purpose |
|---|---|---|---|
| jordannedyck-ai | `github.com/jordanne-dyck/jordannedyck-ai` | `/home/peter/workdir/jordannedyck-ai` | Flask backend, port 5000 |
| jordannedyck-ai-web | `github.com/jordanne-dyck/jordannedyck-ai-web` | `/home/peter/workdir/jordannedyck-ai-web` | Next.js frontend, port 3000 |

Both repos are **public**. The `master` branch is what Shipwright builds from.

## Cluster

- API: `api.ocp-centralis.nekohouse.ca:6443`
- Auth: `oc login` with kubeadmin or run `oc whoami` to verify existing session
- Verify: `oc -n jordbot-dev get pods && oc -n jordbot get pods`

## Architecture

```
Browser → Route (internal) → jordannedyck-ai-web :3000 (Next.js)
                                      ↓
                          jordannedyck-ai :5000 (Flask)
                                      ↓
                          OpenAI API + FAISS index (PVC faiss-db)
```

### Namespaces

| Namespace | Purpose | Images |
|---|---|---|
| `jordbot-dev` | Development — build and test in-cluster | `…/peter/jordbot:dev`, `…/peter/jordbot-web:dev` |
| `jordbot` | Production — public traffic via haproxy droplet | `…/peter/jordbot:vX.Y`, `…/peter/jordbot-web:vX.Y` |

### Key resources (both namespaces share these names)

| Resource | Name | Detail |
|---|---|---|
| Backend deployment | `jordannedyck-ai` | Flask, port 5000, mounts `faiss-db` PVC |
| Frontend deployment | `jordannedyck-ai-web` | Next.js, port 3000 |
| Backend service | `jordannedyck-ai` | ClusterIP :5000 |
| Frontend service | `jordannedyck-ai-web` | ClusterIP :3000 |
| OpenAI secret | `openai-api-key` | Managed by ExternalSecret, do not edit directly |
| FAISS PVC | `faiss-db` | 500Mi RWO nfs-csi, mounted at `/opt/app-root/src/faiss_db` |
| Image pull secret | `quaynekohouse` | `peter+sonarrbot` robot, do not log plaintext credentials |

### Image registry

`quay.nekohouse.ca:8443` — internal to the cluster network. Tags:
- `:dev` — built by Shipwright in `jordbot-dev`, used only in `jordbot-dev`
- `:vX.Y` — manually versioned prod tags, used in `jordbot`

### Chat API contract

`POST /api/chat` (Next.js forwards to Flask)

```json
{"messages": [{"role": "user", "content": "your question"}]}
```

Returns a streaming SSE response.

---

## CI (GitHub Actions)

Both repos have a CI workflow at `.github/workflows/ci.yml` that runs on every push to `master`, every PR, and weekly on Monday 08:00 UTC.

**Jobs (run in parallel):**
- **Lint** — `ruff check` (backend) or `npm run lint` (frontend)
- **Vulnerability scan** — Trivy `fs` scan; HIGH/CRITICAL CVEs block the build; all severities uploaded to the GitHub Security tab as informational

**Backend scan** reads `uv.lock` (31 pinned packages). To update the lockfile after changing `pyproject.toml`:
```bash
cd /home/peter/workdir/jordannedyck-ai
uv lock
git add uv.lock && git commit -m "chore: update uv.lock"
```

**Check CI status** before triggering a Shipwright build:
```bash
gh run list --repo jordanne-dyck/jordannedyck-ai --limit 3
gh run list --repo jordanne-dyck/jordannedyck-ai-web --limit 3
# or watch a specific run:
gh run watch <run-id> --repo jordanne-dyck/jordannedyck-ai
```

CI does not trigger Shipwright — the cluster is not reachable from GitHub runners. Trigger the build manually after CI passes.

---

## Development workflow (jordbot-dev)

Use `jordbot-dev` for all code changes. **Never test directly in `jordbot`.**

### 1. Make and push the change

```bash
# Edit files in the relevant local repo, then:
cd /home/peter/workdir/jordannedyck-ai      # for backend changes
# OR
cd /home/peter/workdir/jordannedyck-ai-web  # for frontend changes

# Always scan before pushing to the public GitHub repos
gitleaks git --no-banner
git push origin master
```

### 2. Wait for CI to pass

```bash
# Check the latest run — both lint and scan must succeed before building
gh run list --repo jordanne-dyck/jordannedyck-ai --limit 1      # backend
gh run list --repo jordanne-dyck/jordannedyck-ai-web --limit 1  # frontend
```

Do not trigger a Shipwright build if CI is failing.

### 3. Trigger a Shipwright build

Build only what changed. If both repos changed, run both commands.

```bash
# Backend
oc create -f - <<EOF
apiVersion: shipwright.io/v1beta1
kind: BuildRun
metadata:
  generateName: jordbot-ai-
  namespace: jordbot-dev
spec:
  build:
    name: jordbot-ai
EOF

# Frontend
oc create -f - <<EOF
apiVersion: shipwright.io/v1beta1
kind: BuildRun
metadata:
  generateName: jordbot-web-
  namespace: jordbot-dev
spec:
  build:
    name: jordbot-web
EOF
```

### 3. Wait for the build

```bash
# Watch until SUCCEEDED=True (takes 3–8 minutes)
oc -n jordbot-dev get buildruns -w
```

A build that stays in `Running` for more than 15 minutes is stalled — check logs:

```bash
oc -n jordbot-dev logs -l buildrun=<name> --all-containers
```

### 4. Roll out the new image

```bash
oc -n jordbot-dev rollout restart deploy/jordannedyck-ai deploy/jordannedyck-ai-web
oc -n jordbot-dev rollout status deploy/jordannedyck-ai deploy/jordannedyck-ai-web
```

### 5. Verify

```bash
# Get the internal route URL
oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'
# → jordbot-dev-jordbot-dev.apps.ocp-centralis.nekohouse.ca

# Or port-forward from WSL
oc -n jordbot-dev port-forward svc/jordannedyck-ai-web 3000:3000

# Quick API smoke test
curl -s https://jordbot-dev-jordbot-dev.apps.ocp-centralis.nekohouse.ca/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

Check logs if the pods are crashing:

```bash
oc -n jordbot-dev logs deploy/jordannedyck-ai --previous
oc -n jordbot-dev logs deploy/jordannedyck-ai-web --previous
```

---

## Deployment workflow (jordbot / production)

Only promote to production after verifying in `jordbot-dev`.

### 1. Decide the new version tag

Check the current prod tags:

```bash
oc -n jordbot get deploy jordannedyck-ai -o jsonpath='{.spec.template.spec.containers[0].image}'
oc -n jordbot get deploy jordannedyck-ai-web -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Increment the minor version (e.g., `v1.2` → `v1.3`). Patch bumps are fine for small fixes.

### 2. Tag and push the versioned image from the dev build

The `:dev` image that passed testing becomes the prod image — just re-tag it.

```bash
# For backend (example: promoting to v1.3)
podman pull quay.nekohouse.ca:8443/peter/jordbot:dev
podman tag  quay.nekohouse.ca:8443/peter/jordbot:dev \
            quay.nekohouse.ca:8443/peter/jordbot:v1.3
podman push quay.nekohouse.ca:8443/peter/jordbot:v1.3

# For frontend (example: promoting to v1.4)
podman pull quay.nekohouse.ca:8443/peter/jordbot-web:dev
podman tag  quay.nekohouse.ca:8443/peter/jordbot-web:dev \
            quay.nekohouse.ca:8443/peter/jordbot-web:v1.4
podman push quay.nekohouse.ca:8443/peter/jordbot-web:v1.4
```

You must be logged into Quay first:

```bash
# Credentials live in the quaynekohouse secret in the jordbot namespace.
# Do not print or log the password. To login:
oc get secret quaynekohouse -n jordbot -o jsonpath='{.data.\.dockerconfigjson}' \
  | base64 -d \
  | python3 -c "
import sys, json, base64
cfg = json.load(sys.stdin)
auth = cfg['auths']['quay.nekohouse.ca:8443']['auth']
user, pw = base64.b64decode(auth).decode().split(':', 1)
with open('/tmp/.quay_pw', 'w') as f: f.write(pw)
print(f'user: {user}')
"
podman login quay.nekohouse.ca:8443 --username peter+sonarrbot --password-stdin < /tmp/.quay_pw
rm /tmp/.quay_pw
```

### 3. Update the k8s manifests

Edit `k8s/deployment-api.yaml` and/or `k8s/deployment-web.yaml` in this repo to reference the new tag:

```yaml
image: quay.nekohouse.ca:8443/peter/jordbot:v1.3       # backend
image: quay.nekohouse.ca:8443/peter/jordbot-web:v1.4   # frontend
```

### 4. Apply to production

```bash
oc apply -f k8s/deployment-api.yaml -n jordbot
oc apply -f k8s/deployment-web.yaml -n jordbot
oc -n jordbot rollout status deploy/jordannedyck-ai deploy/jordannedyck-ai-web
```

### 5. Verify production

```bash
# Prod is behind the public haproxy — test via the internal route
oc -n jordbot get route jordbot -o jsonpath='{.spec.host}'
# Or: curl https://jordannedyck.com/api/chat ...
```

### 6. Commit and push the manifest change

```bash
cd /home/peter/workdir/jordannedyck-ai-web
gitleaks git --no-banner   # always scan before push
git add k8s/deployment-api.yaml k8s/deployment-web.yaml
git commit -m "chore: bump prod image tags to vX.Y/vX.Z"
git push origin master
```

---

## Security rules — non-negotiable

- **Never commit `.env`, `.env.local`, or any file containing `OPENAI_API_KEY`** to git.
- **Always run `gitleaks git --no-banner`** before any push to these public GitHub repos. If it reports findings, stop and fix before pushing.
- The `quaynekohouse` password must never appear in logs, shell history, or files. Always write it to a temp file and delete it immediately.
- The `openai-api-key` Secret is managed by an ExternalSecret — do not patch or replace it manually, you will cause a sync conflict.
- Do not re-enable the commented-out haproxy backends for `console`, `oauth`, or `keycloak` (they expose the OpenShift control plane publicly).
- The `:dev` tag is shared dev infrastructure — it is overwritten on every build. Do not use `:dev` images in `jordbot` (prod).

---

## Troubleshooting quick reference

| Symptom | First check |
|---|---|
| BuildRun stuck in `Running` | `oc -n jordbot-dev logs -l buildrun=<name> --all-containers` |
| Pod `CrashLoopBackOff` | `oc -n <ns> logs deploy/<name> --previous` |
| `ImagePullBackOff` | Confirm the Quay tag exists; confirm `quaynekohouse` secret is present in the namespace |
| `openai-api-key` secret missing | `oc -n <ns> get externalsecret openai-api-key` — check `READY` column |
| FAISS errors in backend logs | The `faiss-db` PVC may be empty — re-seed it from prod using `oc rsync` |
| Frontend can't reach backend | Backend URL is `http://jordannedyck-ai:5000` within the namespace; verify `FLASK_API_URL` env var |
