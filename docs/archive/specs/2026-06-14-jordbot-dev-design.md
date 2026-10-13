# jordbot-dev Namespace — Design

- **Date:** 2026-06-14
- **Status:** Approved (pending spec review)
- **Author:** Peter (with Claude)

## 1. Goal & Context

Create a `jordbot-dev` namespace that mirrors the production `jordbot`
environment so application code can be **built and tested inside the
cluster** instead of being built on the local Windows machine.

Production today (namespace `jordbot`):

- `jordannedyck-ai` — Flask backend, port 5000, mounts the `faiss-db` PVC at
  `/opt/app-root/src/faiss_db`, image `REGISTRY_PLACEHOLDER/jordbot:v1.2`.
- `jordannedyck-ai-web` — Next.js frontend, port 3000, env
  `FLASK_API_URL=http://jordannedyck-ai:5000`, image
  `REGISTRY_PLACEHOLDER/jordbot-web:v1.3`.
- `openai-api-key` — Secret managed by an ExternalSecret pulling
  `OPENAI_API_KEY` from the Doppler `cluster-secretstore` (ClusterSecretStore).
- `faiss-db` — 500Mi RWO PVC (storageclass `nfs-csi`), the RAG vector index.
- `jordbot` Route — public via the droplet haproxy (out of scope here).
- Legacy `jordbot` Deployment — retired (scaled to 0); **not** recreated.

Both apps build from a root `Containerfile` (multi-stage, public
`registry.access.redhat.com/ubi9/*` base images) and live in **public** GitHub
repos.

## 2. Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Build engine | **Shipwright + `buildah` ClusterBuildStrategy** | Installed, healthy, strategic (classic BuildConfig is feature-frozen); a working example exists (`openshift-builds/recommendarr`). |
| Build source | **Public GitHub repos, HTTPS clone, no secret** | Repos are public — no deploy key/PAT needed. |
| Trigger | **Manual `BuildRun`** (`oc create` / `shp buildrun create`) | Simple, controllable; automation (gitea + Pipelines-as-Code) can be added later. |
| Image registry | **Quay `:dev` tags** in existing repos | Internal registry is `managementState: Removed`. `:dev` tag keeps prod tags (`v1.2`, `v1.3`) untouched. |
| Push credential | **Reuse `registry-pull-secret`** (`peter+sonarrbot`, admin) | Admin covers push; no new robot needed. |
| OpenAI key | **Reuse prod** `OPENAI_API_KEY` (Doppler) via a dev ExternalSecret | Chosen for simplicity. Trade-off: no cost/blast-radius isolation from prod. |
| FAISS index | **Clone once from prod `faiss-db` PVC** | Instant parity, $0 embedding cost. Re-run embed Job later if the knowledge base changes. |
| Exposure | **Internal-only Route** (`*.apps.CLUSTER.example.internal`, edge TLS), **not** added to haproxy | Reachable from LAN/WSL and `oc port-forward`; preserves the public lockdown. |

## 3. Architecture

```
                 jordbot-dev namespace
  ┌─────────────────────────────────────────────────────────┐
  │  Shipwright Build: jordbot-ai   ──BuildRun──┐            │
  │    src: github jordannedyck-ai (master)     │ buildah    │
  │    dockerfile: Containerfile                ▼            │
  │                          REGISTRY_PLACEHOLDER/jordbot:dev          │
  │                                     │                     │
  │  Shipwright Build: jordbot-web  ──BuildRun──┐            │
  │    src: github jordannedyck-ai-web (master) │ buildah    │
  │    dockerfile: Containerfile                ▼            │
  │                       REGISTRY_PLACEHOLDER/jordbot-web:dev         │
  │                                                           │
  │  Deployment jordannedyck-ai      Deployment jordannedyck-ai-web
  │    image …jordbot:dev              image …jordbot-web:dev │
  │    envFrom openai-api-key          env FLASK_API_URL ─────┼─► svc jordannedyck-ai:5000
  │    mounts faiss-db (cloned)        Service :3000          │
  │    Service :5000                          │               │
  │         ▲                                 ▼               │
  │     PVC faiss-db (clone of prod)    Route (internal-only) │
  │                                                           │
  │  ExternalSecret openai-api-key ──► Doppler OPENAI_API_KEY │
  └─────────────────────────────────────────────────────────┘
```

Data flow at runtime: browser → internal Route → `jordannedyck-ai-web` (Next.js)
→ `http://jordannedyck-ai:5000` (Flask) → OpenAI API + local FAISS index.

## 4. Components & Manifests

All manifests added under `jordannedyck-ai-web/k8s/dev/` (prod manifests under
`k8s/` are the templates). Namespace-scoped resources, namespace `jordbot-dev`.

1. **Namespace** `jordbot-dev`.
2. **ExternalSecret** `openai-api-key` — `ClusterSecretStore: cluster-secretstore`,
   `target.creationPolicy: Owner`, data key `OPENAI_API_KEY` ← remoteRef
   `OPENAI_API_KEY`. Mirrors the prod (post-migration) ExternalSecret.
3. **Push secret** `registry-pull-secret` — copy of the prod dockerconfigjson
   (`peter+sonarrbot`) into `jordbot-dev` for Shipwright `output.pushSecret`.
4. **Shipwright Build** `jordbot-ai`:
   - `source.git.url: https://github.com/jordanne-dyck/jordannedyck-ai.git`, `revision: master`
   - `strategy: ClusterBuildStrategy/buildah`, `paramValues: dockerfile=Containerfile`
   - `output.image: REGISTRY_PLACEHOLDER/jordbot:dev`, `output.pushSecret: registry-pull-secret`
5. **Shipwright Build** `jordbot-web`: same shape, repo `jordannedyck-ai-web`,
   output `REGISTRY_PLACEHOLDER/jordbot-web:dev`.
6. **PVC** `faiss-db` — 500Mi, RWO, `nfs-csi` (matches prod).
7. **Deployment** `jordannedyck-ai` — image `REGISTRY_PLACEHOLDER/jordbot:dev`,
   `imagePullPolicy: Always`, port 5000, `envFrom: secretRef openai-api-key`,
   mounts `faiss-db` at `/opt/app-root/src/faiss_db`, imagePullSecret
   `registry-pull-secret`.
8. **Deployment** `jordannedyck-ai-web` — image `REGISTRY_PLACEHOLDER/jordbot-web:dev`,
   `imagePullPolicy: Always`, port 3000, env `FLASK_API_URL=http://jordannedyck-ai:5000`,
   `NODE_ENV=production`, `envFrom: secretRef openai-api-key`, imagePullSecret
   `registry-pull-secret`.
9. **Service** `jordannedyck-ai` (5000) and **Service** `jordannedyck-ai-web` (3000).
10. **Route** `jordbot-dev` — to `jordannedyck-ai-web:3000`, edge TLS, host on
    `*.apps.CLUSTER.example.internal` (internal DNS only).
11. **FAISS clone job/step** — one-time copy of prod `faiss-db` → dev `faiss-db`
    (helper pod mounting the dev PVC + `oc rsync` from a pod mounting the prod
    PVC, or a copy Job). Run once during bring-up.

## 5. Build & Deploy Loop

1. `oc apply` the namespace, secrets, Builds, PVC, Deployments, Services, Route.
2. Seed FAISS (clone from prod) — one-time.
3. Per app: `oc create` a `BuildRun` referencing the `Build` (or
   `shp buildrun create jordbot-ai`). buildah builds from the `Containerfile`
   and pushes `:dev` to Quay.
4. `oc -n jordbot-dev rollout restart deploy/<app>` to pull the new `:dev`
   image (`imagePullPolicy: Always`).
5. Test via the internal Route or `oc port-forward`.

## 6. Pre-flight / Safety

- **`.dockerignore`**: `jordannedyck-ai` already excludes `.env`;
  `jordannedyck-ai-web` excludes `.env.local`/`.env*.local`. Add a plain `.env`
  to the web `.dockerignore` (belt-and-suspenders) so no future build can bake a
  key. Verify before the first build.
- Base images are public UBI → no build pull-secret required.

## 7. Out of Scope / Notes

- **Web crash-loop:** prod `jordannedyck-ai-web` has restarted thousands of
  times. `jordbot-dev` is a good place to diagnose it, but the fix is not part
  of standing up the namespace.
- **Separate dev OpenAI key:** explicitly not chosen; dev shares the prod key.
  Revisit if dev usage/cost or leak risk becomes a concern.
- **Build automation** (gitea mirror + Pipelines-as-Code push-to-build) is a
  possible future enhancement; manual `BuildRun` for now.
- **Public exposure** of dev is intentionally excluded.

## 8. Dependencies

None external. GitHub repos are public, build base images are public, the Quay
push credential and OpenAI key are reused from existing cluster resources.

## 9. Verification

- Both Shipwright `BuildRun`s reach `Succeeded` and push `:dev` to Quay.
- Both Deployments roll out `1/1 Ready` on the `:dev` images.
- Backend pod has `OPENAI_API_KEY` (`…xJ0A`) and a populated
  `/opt/app-root/src/faiss_db`.
- Internal Route serves the web UI; a test chat round-trips web → Flask →
  OpenAI + FAISS.
- `REGISTRY_PLACEHOLDER/jordbot` / `REGISTRY_PLACEHOLDER/jordbot-web` prod tags (`v1.2`/`v1.3`) are unchanged.
