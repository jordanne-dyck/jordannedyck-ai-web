# OpenShift Containerization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolith container into two optimized multi-stage UBI containers (Flask API + Next.js frontend) with OpenShift manifests, dramatically reducing image size.

**Architecture:** Two separate pods communicating over a ClusterIP Service, with a PVC for the FAISS database, a shared Secret for the OpenAI API key, and a single OpenShift Route exposing the Next.js frontend.

**Tech Stack:** Python/Flask, FAISS, Next.js 16, React 19, OpenShift, UBI9 (ubi9/python-311, ubi9/nodejs-20), podman/docker for local build verification.

---

## File Map

### jordannedyck-ai/ (Flask API repo)
| File | Action | Purpose |
|------|--------|---------|
| `requirements.txt` | Create | Pinned Python dependencies for reproducible builds |
| `api_server.py` | Modify line 57 | Fix `host` and `debug` for cluster-accessible production |
| `.dockerignore` | Create | Exclude venv, faiss_db, pycache, test files from build context |
| `Containerfile` | Create | Multi-stage UBI build: builder (gcc + pip install) → runtime (app only) |

### jordannedyck-ai-web/ (Next.js repo)
| File | Action | Purpose |
|------|--------|---------|
| `next.config.ts` | Modify | Add `output: 'standalone'` for minimal runtime image |
| `app/api/chat/route.ts` | Modify line 11 | Replace hardcoded `localhost:5000` with `FLASK_API_URL` env var |
| `.dockerignore` | Create | Exclude node_modules, .next, .env.local from build context |
| `Containerfile` | Create | Three-stage UBI build: deps → builder → runtime (standalone only) |
| `k8s/secret.yaml` | Create | OPENAI_API_KEY Secret template (placeholder value) |
| `k8s/pvc.yaml` | Create | 500Mi PVC for FAISS database files |
| `k8s/deployment-api.yaml` | Create | Flask Deployment with PVC mount + Secret env |
| `k8s/service-api.yaml` | Create | ClusterIP Service for Flask (port 5000, internal only) |
| `k8s/deployment-web.yaml` | Create | Next.js Deployment with Secret env + FLASK_API_URL |
| `k8s/service-web.yaml` | Create | ClusterIP Service for Next.js (port 3000) |
| `k8s/route.yaml` | Create | OpenShift Route → Next.js service |

---

## Task 1: Flask API — Python dependencies file

**Files:**
- Create: `jordannedyck-ai/requirements.txt`

- [ ] **Step 1: Create requirements.txt**

```
flask>=2.0
flask-cors>=3.0
faiss-cpu>=1.7.0
numpy>=1.20
openai>=1.0
python-dotenv>=0.19
```

Save to `jordannedyck-ai/requirements.txt`.

- [ ] **Step 2: Verify it matches api_server.py imports**

Check that every `import` in `api_server.py` lines 1-8 is covered:
- `flask` → flask
- `flask_cors` → flask-cors
- `faiss` → faiss-cpu
- `numpy` → numpy
- `openai` → openai
- `dotenv` → python-dotenv

- [ ] **Step 3: Commit**

```bash
cd ~/jordannedyck-ai
git add requirements.txt
git commit -m "feat: add requirements.txt for containerized builds"
```

---

## Task 2: Flask API — Fix production server binding

**Files:**
- Modify: `jordannedyck-ai/api_server.py` line 57

- [ ] **Step 1: Update app.run() call**

In `api_server.py`, find line 57:
```python
# Before:
    app.run(port=5000, debug=True)
```

Change to:
```python
# After:
    app.run(host='0.0.0.0', port=5000, debug=False)
```

`host='0.0.0.0'` is required — without it Flask binds to localhost only and is unreachable from other pods in the cluster.

- [ ] **Step 2: Verify change is correct**

Run:
```bash
grep -n "app.run" ~/jordannedyck-ai/api_server.py
```

Expected output:
```
57:    app.run(host='0.0.0.0', port=5000, debug=False)
```

- [ ] **Step 3: Commit**

```bash
cd ~/jordannedyck-ai
git add api_server.py
git commit -m "fix: bind Flask to 0.0.0.0 for cluster accessibility"
```

---

## Task 3: Flask API — .dockerignore

**Files:**
- Create: `jordannedyck-ai/.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
venv/
.venv/
faiss_db/
chroma_db/
__pycache__/
*.pyc
*.pyo
.git/
.gitignore
test_*.py
*.egg-info/
.env
mcp_server/
scripts/
knowledge-base/
```

Save to `jordannedyck-ai/.dockerignore`.

Excluding `faiss_db/` is critical — this will be on the PVC, and including it in the build context would bloat the image and is wrong.
Excluding `mcp_server/` keeps dev tooling out of the production runtime.

- [ ] **Step 2: Commit**

```bash
cd ~/jordannedyck-ai
git add .dockerignore
git commit -m "feat: add .dockerignore for Flask API container"
```

---

## Task 4: Flask API — Containerfile

**Files:**
- Create: `jordannedyck-ai/Containerfile`

- [ ] **Step 1: Create Containerfile**

```dockerfile
# Stage 1: builder — installs gcc and compiles Python packages
FROM registry.access.redhat.com/ubi9/python-311 AS builder

USER root
RUN dnf install -y gcc python3-devel && dnf clean all

WORKDIR /install
COPY requirements.txt .
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt


# Stage 2: runtime — lean image with no build tools
FROM registry.access.redhat.com/ubi9/python-311

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy only the application entrypoint
COPY api_server.py .

# faiss_db/ is NOT copied here — it is mounted from a PVC at /app/faiss_db at runtime
# api_server.py uses relative path "faiss_db/resume.index" so WORKDIR must stay /app

EXPOSE 5000

CMD ["python3", "api_server.py"]
```

Save to `jordannedyck-ai/Containerfile`.

- [ ] **Step 2: Verify build succeeds**

From the `jordannedyck-ai/` directory:
```bash
cd ~/jordannedyck-ai
podman build -f Containerfile -t jordannedyck-ai:test .
```

Expected: build completes, Stage 2 image is produced. No gcc or python-devel in the final layer.

If `podman` isn't available, use `docker build` instead.

Note: The image will not start correctly without the PVC mounted (faiss_db/ won't exist), but the build itself should succeed.

- [ ] **Step 3: Check final image size**

```bash
podman images jordannedyck-ai:test
```

Expected: significantly smaller than the current monolith. Typical ubi9/python-311 + faiss-cpu image is ~500-700MB.

- [ ] **Step 4: Commit**

```bash
cd ~/jordannedyck-ai
git add Containerfile
git commit -m "feat: add multi-stage UBI Containerfile for Flask API"
```

---

## Task 5: Next.js — Enable standalone output

**Files:**
- Modify: `jordannedyck-ai-web/next.config.ts`

- [ ] **Step 1: Update next.config.ts**

Current content:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

Replace with:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 2: Verify standalone build works locally**

```bash
cd ~/jordannedyck-ai-web
npm run build
```

Expected: build succeeds and `.next/standalone/` directory is created containing `server.js`.

```bash
ls .next/standalone/
```

Expected output includes: `server.js`, `node_modules/`, `package.json`

- [ ] **Step 3: Commit**

```bash
cd ~/jordannedyck-ai-web
git add next.config.ts
git commit -m "feat: enable Next.js standalone output for container builds"
```

---

## Task 6: Next.js — Replace hardcoded Flask URL

**Files:**
- Modify: `jordannedyck-ai-web/app/api/chat/route.ts` line 11

- [ ] **Step 1: Update the fetch call**

In `app/api/chat/route.ts`, find the `searchExperience` function. Change:

```typescript
// Before (line 11):
    const response = await fetch('http://localhost:5000/search', {
```

To:
```typescript
// After:
    const apiUrl = process.env.FLASK_API_URL ?? 'http://localhost:5000';
    const response = await fetch(`${apiUrl}/search`, {
```

- [ ] **Step 2: Verify the change**

```bash
grep -n "localhost\|FLASK_API_URL\|apiUrl" ~/jordannedyck-ai-web/app/api/chat/route.ts
```

Expected: `localhost:5000` no longer appears as a hardcoded string. `FLASK_API_URL` and `apiUrl` appear.

- [ ] **Step 3: Commit**

```bash
cd ~/jordannedyck-ai-web
git add app/api/chat/route.ts
git commit -m "feat: use FLASK_API_URL env var instead of hardcoded localhost"
```

---

## Task 7: Next.js — .dockerignore

**Files:**
- Create: `jordannedyck-ai-web/.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
node_modules/
.next/
.git/
.gitignore
.env.local
.env*.local
coverage/
*.log
README.md
docs/
```

Save to `jordannedyck-ai-web/.dockerignore`.

`node_modules/` is the critical exclusion — without it the build context would transfer hundreds of MB before the `npm ci` step.

- [ ] **Step 2: Commit**

```bash
cd ~/jordannedyck-ai-web
git add .dockerignore
git commit -m "feat: add .dockerignore for Next.js container"
```

---

## Task 8: Next.js — Containerfile

**Files:**
- Create: `jordannedyck-ai-web/Containerfile`

- [ ] **Step 1: Create Containerfile**

```dockerfile
# Stage 1: deps — install dependencies from lockfile
FROM registry.access.redhat.com/ubi9/nodejs-20 AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev


# Stage 2: builder — build the Next.js standalone output
FROM registry.access.redhat.com/ubi9/nodejs-20 AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


# Stage 3: runtime — only the standalone output (~150MB final image)
FROM registry.access.redhat.com/ubi9/nodejs-20

WORKDIR /app

# Copy standalone server and its minimal node_modules
COPY --from=builder /app/.next/standalone ./
# Copy static assets (CSS, JS chunks) into the expected location
COPY --from=builder /app/.next/static ./.next/static
# Copy public assets (images, icons, robots.txt, etc.)
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
```

Save to `jordannedyck-ai-web/Containerfile`.

- [ ] **Step 2: Verify build succeeds**

```bash
cd ~/jordannedyck-ai-web
podman build -f Containerfile -t jordannedyck-ai-web:test .
```

Expected: three stages complete, final image produced.

- [ ] **Step 3: Check final image size**

```bash
podman images jordannedyck-ai-web:test
```

Expected: substantially smaller than the monolith. UBI nodejs-20 + standalone is typically 250-400MB.

- [ ] **Step 4: Smoke test the runtime image**

Run the container locally (without a real Flask backend, just verify it starts):
```bash
podman run --rm -p 3000:3000 \
  -e OPENAI_API_KEY=test \
  -e FLASK_API_URL=http://localhost:5000 \
  jordannedyck-ai-web:test
```

Expected: Next.js server starts and logs `Ready on http://0.0.0.0:3000`. (Chat won't work without a real backend — that's fine.)

Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
cd ~/jordannedyck-ai-web
git add Containerfile
git commit -m "feat: add three-stage UBI Containerfile for Next.js frontend"
```

---

## Task 9: OpenShift manifests — Secret and PVC

**Files:**
- Create: `jordannedyck-ai-web/k8s/secret.yaml`
- Create: `jordannedyck-ai-web/k8s/pvc.yaml`

- [ ] **Step 1: Create k8s/ directory**

```bash
mkdir -p ~/jordannedyck-ai-web/k8s
```

- [ ] **Step 2: Create secret.yaml**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: openai-api-key
type: Opaque
stringData:
  OPENAI_API_KEY: REPLACE_WITH_REAL_KEY
```

Save to `jordannedyck-ai-web/k8s/secret.yaml`.

The `stringData` field accepts plain text — OpenShift base64-encodes it automatically on apply.
**Never commit with a real key.** Apply it manually:
```bash
# Edit the file first, then:
oc apply -f k8s/secret.yaml
# Then revert the file to the placeholder before committing
```

- [ ] **Step 3: Create pvc.yaml**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: faiss-db
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 500Mi
```

Save to `jordannedyck-ai-web/k8s/pvc.yaml`.

500Mi is sufficient for the FAISS index + pickle files. `storageClassName` is omitted to use the cluster default.

- [ ] **Step 4: Commit**

```bash
cd ~/jordannedyck-ai-web
git add k8s/secret.yaml k8s/pvc.yaml
git commit -m "feat: add OpenShift Secret and PVC manifests"
```

---

## Task 10: OpenShift manifests — Flask Deployment and Service

**Files:**
- Create: `jordannedyck-ai-web/k8s/deployment-api.yaml`
- Create: `jordannedyck-ai-web/k8s/service-api.yaml`

- [ ] **Step 1: Create deployment-api.yaml**

Replace `YOUR_REGISTRY/jordannedyck-ai:latest` with your actual image registry path.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jordannedyck-ai
  labels:
    app: jordannedyck-ai
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jordannedyck-ai
  template:
    metadata:
      labels:
        app: jordannedyck-ai
    spec:
      containers:
        - name: jordannedyck-ai
          image: YOUR_REGISTRY/jordannedyck-ai:latest
          ports:
            - containerPort: 5000
          envFrom:
            - secretRef:
                name: openai-api-key
          volumeMounts:
            - name: faiss-db
              mountPath: /app/faiss_db
          readinessProbe:
            tcpSocket:
              port: 5000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            tcpSocket:
              port: 5000
            initialDelaySeconds: 30
            periodSeconds: 30
      volumes:
        - name: faiss-db
          persistentVolumeClaim:
            claimName: faiss-db
```

Save to `jordannedyck-ai-web/k8s/deployment-api.yaml`.

- [ ] **Step 2: Create service-api.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: jordannedyck-ai
spec:
  selector:
    app: jordannedyck-ai
  ports:
    - port: 5000
      targetPort: 5000
  type: ClusterIP
```

Save to `jordannedyck-ai-web/k8s/service-api.yaml`.

The Service name `jordannedyck-ai` is what the Next.js pod resolves via DNS as `http://jordannedyck-ai:5000`.

- [ ] **Step 3: Commit**

```bash
cd ~/jordannedyck-ai-web
git add k8s/deployment-api.yaml k8s/service-api.yaml
git commit -m "feat: add Flask API Deployment and Service manifests"
```

---

## Task 11: OpenShift manifests — Next.js Deployment, Service, and Route

**Files:**
- Create: `jordannedyck-ai-web/k8s/deployment-web.yaml`
- Create: `jordannedyck-ai-web/k8s/service-web.yaml`
- Create: `jordannedyck-ai-web/k8s/route.yaml`

- [ ] **Step 1: Create deployment-web.yaml**

Replace `YOUR_REGISTRY/jordannedyck-ai-web:latest` with your actual image registry path.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jordannedyck-ai-web
  labels:
    app: jordannedyck-ai-web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jordannedyck-ai-web
  template:
    metadata:
      labels:
        app: jordannedyck-ai-web
    spec:
      containers:
        - name: jordannedyck-ai-web
          image: YOUR_REGISTRY/jordannedyck-ai-web:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: openai-api-key
          env:
            - name: FLASK_API_URL
              value: "http://jordannedyck-ai:5000"
            - name: NODE_ENV
              value: "production"
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 30
```

Save to `jordannedyck-ai-web/k8s/deployment-web.yaml`.

- [ ] **Step 2: Create service-web.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: jordannedyck-ai-web
spec:
  selector:
    app: jordannedyck-ai-web
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

Save to `jordannedyck-ai-web/k8s/service-web.yaml`.

- [ ] **Step 3: Create route.yaml**

```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: jordannedyck-ai-web
spec:
  to:
    kind: Service
    name: jordannedyck-ai-web
  port:
    targetPort: 3000
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
```

Save to `jordannedyck-ai-web/k8s/route.yaml`.

`tls.termination: edge` means TLS is terminated at the OpenShift router (your cluster handles the cert). Traffic inside the cluster is plain HTTP. `insecureEdgeTerminationPolicy: Redirect` redirects HTTP → HTTPS automatically.

- [ ] **Step 4: Commit**

```bash
cd ~/jordannedyck-ai-web
git add k8s/deployment-web.yaml k8s/service-web.yaml k8s/route.yaml
git commit -m "feat: add Next.js Deployment, Service, and OpenShift Route manifests"
```

---

## Task 12: Populate PVC and deploy

This task is manual — it requires an active OpenShift session.

- [ ] **Step 1: Log into your OpenShift cluster**

```bash
oc login <your-cluster-url>
oc project <your-project-name>
```

- [ ] **Step 2: Apply the Secret (with real key)**

Edit `k8s/secret.yaml`, replace `REPLACE_WITH_REAL_KEY` with your actual OpenAI API key, then:
```bash
oc apply -f k8s/secret.yaml
```

Immediately revert the file to the placeholder so you don't accidentally commit the real key:
```bash
# Restore placeholder manually or:
git checkout k8s/secret.yaml
```

- [ ] **Step 3: Apply the PVC**

```bash
oc apply -f k8s/pvc.yaml
```

Verify it's created:
```bash
oc get pvc faiss-db
```

Expected: `STATUS` shows `Bound` (may show `Pending` briefly on first apply).

- [ ] **Step 4: Populate the PVC with the FAISS database**

The FAISS index files need to be on the PVC before Flask starts. Copy them from your local `jordannedyck-ai/faiss_db/`:

```bash
# Create a temporary pod to mount the PVC for copying
oc run faiss-loader --image=registry.access.redhat.com/ubi9/python-311 \
  --overrides='{"spec":{"volumes":[{"name":"faiss-db","persistentVolumeClaim":{"claimName":"faiss-db"}}],"containers":[{"name":"faiss-loader","image":"registry.access.redhat.com/ubi9/python-311","command":["sleep","3600"],"volumeMounts":[{"name":"faiss-db","mountPath":"/app/faiss_db"}]}]}}' \
  --restart=Never

# Wait for it to be running
oc wait --for=condition=Ready pod/faiss-loader --timeout=60s

# Copy the FAISS files into the PVC
oc cp /mnt/c/Users/apete/Documents/jordbot/jordbot/jordannedyck-ai/faiss_db/. faiss-loader:/app/faiss_db/

# Verify files are there
oc exec faiss-loader -- ls /app/faiss_db/

# Clean up the loader pod
oc delete pod faiss-loader
```

Expected files in PVC: `resume.index`, `documents.pkl`, `metadatas.pkl`

- [ ] **Step 5: Build and push images to your registry**

Build and push both images to whichever registry your OpenShift cluster pulls from:
```bash
# Flask API
cd ~/jordannedyck-ai
podman build -f Containerfile -t YOUR_REGISTRY/jordannedyck-ai:latest .
podman push YOUR_REGISTRY/jordannedyck-ai:latest

# Next.js frontend
cd ~/jordannedyck-ai-web
podman build -f Containerfile -t YOUR_REGISTRY/jordannedyck-ai-web:latest .
podman push YOUR_REGISTRY/jordannedyck-ai-web:latest
```

- [ ] **Step 6: Update image references in manifests**

In `k8s/deployment-api.yaml` and `k8s/deployment-web.yaml`, replace `YOUR_REGISTRY/...` with the actual pushed image URLs.

- [ ] **Step 7: Apply all manifests**

```bash
cd ~/jordannedyck-ai-web
oc apply -f k8s/service-api.yaml
oc apply -f k8s/deployment-api.yaml
oc apply -f k8s/service-web.yaml
oc apply -f k8s/deployment-web.yaml
oc apply -f k8s/route.yaml
```

- [ ] **Step 8: Verify pods are running**

```bash
oc get pods
```

Expected: both `jordannedyck-ai-*` and `jordannedyck-ai-web-*` pods show `Running`.

If a pod is crashing, check logs:
```bash
oc logs deployment/jordannedyck-ai
oc logs deployment/jordannedyck-ai-web
```

- [ ] **Step 9: Get the Route URL and smoke test**

```bash
oc get route jordannedyck-ai-web
```

Open the URL in a browser. The chat interface should load and respond to questions.

- [ ] **Step 10: Commit updated manifests with real image references**

```bash
cd ~/jordannedyck-ai-web
git add k8s/deployment-api.yaml k8s/deployment-web.yaml
git commit -m "chore: update manifests with actual image registry references"
```
