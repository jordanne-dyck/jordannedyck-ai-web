# OpenShift Containerization Design

**Date**: 2026-03-23
**Repos**: jordannedyck-ai-web (Next.js frontend), jordannedyck-ai (Flask API)
**Goal**: Replace the current single monolith container with two optimized, separate containers suitable for OpenShift deployment. Primary driver is image size reduction.

---

## Problem Statement

The current setup uses a single Containerfile (in a separate local directory) that:
- Uses a full Fedora base image
- Installs both Python and Node.js toolchains plus build tools (gcc, clang, cc) in a single layer
- Installs `@anthropic-ai/claude-code` globally (not needed in production)
- Runs `npm run dev` (development server) in production
- Bundles `venv/`, `node_modules/`, `faiss_db/`, and `chroma_db/` into the image context
- Runs both services via a `kick-off.sh` entrypoint in one container

This produces a multi-GB image and couples two independent services together.

---

## Architecture

Two pods, one PVC, one Secret, one Route:

```
Internet
   │
   ▼
[OpenShift Route]
   │
   ▼
[Service: jordannedyck-ai-web]   ← Next.js (port 3000)
   │  (internal cluster call)
   ▼
[Service: jordannedyck-ai]       ← Flask API (port 5000)
   │
   ▼
[PVC: faiss-db]                  ← mounted at /app/faiss_db (ReadWriteOnce)

[Secret: openai-api-key]         ← injected into both pods as env var
```

- The Route exposes only the Next.js frontend externally. Flask is ClusterIP-only (no Route).
- Next.js calls Flask internally via `http://jordannedyck-ai:5000` using the `FLASK_API_URL` env var.
- The PVC holds pre-generated `faiss_db/` files, populated once via Job or `oc cp`.
- One `OPENAI_API_KEY` Secret referenced by both Deployments.

---

## Containerfiles

### Flask API (`jordannedyck-ai/Containerfile`)

Multi-stage build:

**Stage 1 — builder** (`ubi9/python-311`):
- Install gcc, python-devel (required to compile faiss-cpu)
- `pip install` all dependencies into `/install`

**Stage 2 — runtime** (`ubi9/python-311`):
- Copy `/install` from builder (build tools absent from final image)
- Copy `api_server.py` only (`mcp_server/` is dev/testing tooling, excluded from runtime image)
- No `faiss_db/` (mounted from PVC at runtime)
- No `venv/`, `chroma_db/`, `scripts/`, test files
- `WORKDIR /app` — `api_server.py` uses relative path `faiss_db/resume.index`, so the PVC must be mounted at `/app/faiss_db` and `WORKDIR` must be `/app`
- Runs as non-root (OpenShift default)
- `CMD: python3 api_server.py`

**`.dockerignore`**: excludes `venv/`, `faiss_db/`, `chroma_db/`, `__pycache__/`, `*.pyc`, `.git/`, test files, `.env`.

### Next.js Frontend (`jordannedyck-ai-web/Containerfile`)

Three-stage build:

**Stage 1 — deps** (`ubi9/nodejs-20`):
- `npm ci` (clean install from `package-lock.json`)

**Stage 2 — builder** (`ubi9/nodejs-20`):
- Copy `node_modules` from deps stage
- `npm run build` (produces `.next/standalone/` via `output: 'standalone'`)

**Stage 3 — runtime** (`ubi9/nodejs-20`):
- Copy only `.next/standalone/`, `.next/static/`, `public/`
- No `node_modules` in final image
- Target size: ~150MB
- `CMD: node server.js`

**`.dockerignore`**: excludes `node_modules/`, `.next/`, `.git/`, `.env.local`, `coverage/`.

---

## Code Changes Required

### `jordannedyck-ai-web/next.config.ts`
Add `output: 'standalone'` to enable the standalone build output used by the runtime stage.

### `jordannedyck-ai-web/app/api/chat/route.ts`
Replace hardcoded `http://localhost:5000/search` with:
```ts
const apiUrl = process.env.FLASK_API_URL ?? 'http://localhost:5000';
// ...
const response = await fetch(`${apiUrl}/search`, { ... });
```

### `jordannedyck-ai/api_server.py`
Change the `app.run()` call from dev defaults to cluster-accessible production settings:
```python
# Before:
app.run(port=5000, debug=True)

# After:
app.run(host='0.0.0.0', port=5000, debug=False)
```
Without `host='0.0.0.0'`, Flask binds to localhost only and is unreachable from other pods.

### `jordannedyck-ai/requirements.txt` (new file)
Create a `requirements.txt` since none currently exists:
```
flask>=2.0
flask-cors>=3.0
faiss-cpu>=1.7.0
numpy>=1.20
openai>=1.0
python-dotenv>=0.19
```

---

## Kubernetes / OpenShift Manifests

All manifests live in `jordannedyck-ai-web/k8s/`:

| File | Purpose |
|------|---------|
| `secret.yaml` | `OPENAI_API_KEY` — template with placeholder, never committed with real value |
| `pvc.yaml` | `faiss-db` PVC, `ReadWriteOnce` |
| `deployment-api.yaml` | Flask Deployment — mounts PVC at `/app/faiss_db`, injects Secret |
| `service-api.yaml` | ClusterIP Service for Flask (port 5000, internal only) |
| `deployment-web.yaml` | Next.js Deployment — injects Secret + `FLASK_API_URL` env var |
| `service-web.yaml` | ClusterIP Service for Next.js (port 3000) |
| `route.yaml` | OpenShift Route → `service-web` |

**Notes:**
- `secret.yaml` uses a placeholder value (`OPENAI_API_KEY: <base64-encoded-value>`); real key is applied manually via `oc apply -f secret.yaml` after editing — never committed with a real value
- PVC is `ReadWriteOnce`; to re-run embeddings, scale Flask to 0, run a Job, scale back up
- Both Deployments use `envFrom` to reference the Secret — both Flask (`os.getenv("OPENAI_API_KEY")`) and Next.js (`process.env.OPENAI_API_KEY`) need it
- `deployment-web.yaml` also sets `FLASK_API_URL=http://jordannedyck-ai:5000` as a plain env var (not from Secret)
- PVC size: 500Mi is sufficient for the FAISS index + pickle files; `storageClassName` left to cluster default
- Readiness probes: Flask — HTTP GET `/search` is stateful; use a TCP probe on port 5000. Next.js — HTTP GET on port 3000 path `/`

---

## File Layout After Refactor

```
jordannedyck-ai-web/
  Containerfile               ← new (Next.js multi-stage)
  .dockerignore               ← new
  next.config.ts              ← modified (add standalone output)
  app/api/chat/route.ts       ← modified (FLASK_API_URL env var)
  k8s/
    secret.yaml
    pvc.yaml
    deployment-api.yaml
    service-api.yaml
    deployment-web.yaml
    service-web.yaml
    route.yaml
  docs/superpowers/specs/
    2026-03-23-openshift-containerization-design.md

jordannedyck-ai/
  Containerfile               ← new (Flask multi-stage)
  .dockerignore               ← new
```

---

## Out of Scope

- CI/CD pipeline automation (image builds, pushes)
- TLS termination on the Route (assumed handled by cluster)
- Re-running the embedding script in-cluster (manual for now)
- The `jordbot/` working directory in `C:\Users\apete\Documents\jordbot\` — superseded by Containerfiles committed to each repo
