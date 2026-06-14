# jordbot-dev Namespace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a `jordbot-dev` namespace that mirrors prod `jordbot`, with in-cluster Shipwright builds, so app code is built/tested in Kubernetes instead of on Windows.

**Architecture:** Two Shipwright `buildah` Builds clone the public GitHub repos, build each `Containerfile`, and push `:dev` tags to Quay. Deployments mirror prod (backend Flask :5000 + FAISS PVC, frontend Next.js :3000), reuse the prod OpenAI key via a Doppler-backed ExternalSecret, and are reachable through an internal-only Route. The FAISS index is cloned once from the prod PVC.

**Tech Stack:** OpenShift 4.20, Shipwright (buildah ClusterBuildStrategy), External Secrets Operator (Doppler ClusterSecretStore), Quay registry, `oc` CLI.

**Spec:** `docs/superpowers/specs/2026-06-14-jordbot-dev-design.md`

**Conventions for this plan:**
- All `oc` commands assume the `kube:admin` context already in use.
- Manifests are created under `k8s/dev/` in the `jordannedyck-ai-web` repo, committed as we go.
- "Verify" steps are the tests: run the command, confirm the expected output before moving on.

---

### Task 1: Namespace + credentials

**Files:**
- Create: `k8s/dev/00-namespace.yaml`
- Create: `k8s/dev/10-externalsecret-openai.yaml`

- [ ] **Step 1: Write the namespace manifest**

`k8s/dev/00-namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: jordbot-dev
  labels:
    app.kubernetes.io/part-of: jordbot
    environment: dev
```

- [ ] **Step 2: Apply and verify**

Run: `oc apply -f k8s/dev/00-namespace.yaml && oc get ns jordbot-dev`
Expected: `namespace/jordbot-dev created` then `jordbot-dev   Active`.

- [ ] **Step 3: Copy the Quay push/pull secret into jordbot-dev**

The `registry-pull-secret` dockerconfigjson (`peter+sonarrbot`, admin) is reused for both image push (Shipwright) and pull (Deployments). Copy it from prod:
```bash
oc -n jordbot get secret registry-pull-secret -o jsonpath='{.data.\.dockerconfigjson}' \
  | base64 -d > /tmp/quay-dockercfg.json
oc -n jordbot-dev create secret generic registry-pull-secret \
  --type=kubernetes.io/dockerconfigjson \
  --from-file=.dockerconfigjson=/tmp/quay-dockercfg.json
rm -f /tmp/quay-dockercfg.json
```

- [ ] **Step 4: Verify the push secret exists**

Run: `oc -n jordbot-dev get secret registry-pull-secret -o jsonpath='{.type}{"\n"}'`
Expected: `kubernetes.io/dockerconfigjson`

- [ ] **Step 5: Write the ExternalSecret (reuses prod OpenAI key)**

`k8s/dev/10-externalsecret-openai.yaml`:
```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: openai-api-key
  namespace: jordbot-dev
spec:
  refreshInterval: 1h0m0s
  secretStoreRef:
    kind: ClusterSecretStore
    name: cluster-secretstore
  target:
    name: openai-api-key
    creationPolicy: Owner
    deletionPolicy: Retain
  data:
  - secretKey: OPENAI_API_KEY
    remoteRef:
      key: OPENAI_API_KEY
      conversionStrategy: Default
      decodingStrategy: None
      metadataPolicy: None
```

- [ ] **Step 6: Apply and verify it syncs**

Run: `oc apply -f k8s/dev/10-externalsecret-openai.yaml && sleep 6 && oc -n jordbot-dev get externalsecret openai-api-key`
Expected: `STATUS` column shows `SecretSynced`, `READY` is `True`.

- [ ] **Step 7: Confirm the synced value matches the prod key suffix**

Run: `oc -n jordbot-dev get secret openai-api-key -o jsonpath='{.data.OPENAI_API_KEY}' | base64 -d | tail -c 4; echo`
Expected: `xJ0A` (the current prod key suffix).

- [ ] **Step 8: Commit**

```bash
git add k8s/dev/00-namespace.yaml k8s/dev/10-externalsecret-openai.yaml
git commit -m "feat(dev): jordbot-dev namespace + OpenAI ExternalSecret"
```

---

### Task 2: Shipwright Builds

**Files:**
- Create: `k8s/dev/20-build-jordbot-ai.yaml`
- Create: `k8s/dev/21-build-jordbot-web.yaml`

- [ ] **Step 1: Write the backend Build**

`k8s/dev/20-build-jordbot-ai.yaml`:
```yaml
apiVersion: shipwright.io/v1beta1
kind: Build
metadata:
  name: jordbot-ai
  namespace: jordbot-dev
spec:
  source:
    type: Git
    git:
      url: https://github.com/jordanne-dyck/jordannedyck-ai.git
      revision: master
  strategy:
    kind: ClusterBuildStrategy
    name: buildah
  paramValues:
  - name: dockerfile
    value: Containerfile
  output:
    image: REGISTRY_PLACEHOLDER/jordbot:dev
    pushSecret: registry-pull-secret
```

- [ ] **Step 2: Write the frontend Build**

`k8s/dev/21-build-jordbot-web.yaml`:
```yaml
apiVersion: shipwright.io/v1beta1
kind: Build
metadata:
  name: jordbot-web
  namespace: jordbot-dev
spec:
  source:
    type: Git
    git:
      url: https://github.com/jordanne-dyck/jordannedyck-ai-web.git
      revision: master
  strategy:
    kind: ClusterBuildStrategy
    name: buildah
  paramValues:
  - name: dockerfile
    value: Containerfile
  output:
    image: REGISTRY_PLACEHOLDER/jordbot-web:dev
    pushSecret: registry-pull-secret
```

- [ ] **Step 3: Apply both Builds**

Run: `oc apply -f k8s/dev/20-build-jordbot-ai.yaml -f k8s/dev/21-build-jordbot-web.yaml`
Expected: both `build.shipwright.io/... created`.

- [ ] **Step 4: Verify Builds register as valid**

Run: `oc -n jordbot-dev get builds.shipwright.io`
Expected: both `jordbot-ai` and `jordbot-web` show `REGISTERED=True`, `REASON=Succeeded`.

> If `REGISTERED` is `False`, read `.status.message` — usually the pushSecret name or strategy name is wrong. Fix the manifest and re-apply before continuing.

- [ ] **Step 5: Commit**

```bash
git add k8s/dev/20-build-jordbot-ai.yaml k8s/dev/21-build-jordbot-web.yaml
git commit -m "feat(dev): Shipwright buildah Builds for jordbot-ai and jordbot-web"
```

---

### Task 3: Run the builds, push `:dev` images

**Files:**
- Create: `k8s/dev/22-buildrun-templates.yaml` (reference templates; BuildRuns are created with `generateName`)

- [ ] **Step 1: Pre-flight — confirm `.dockerignore` won't bake `.env`**

Run: `grep -i env ../jordannedyck-ai/.dockerignore; grep -i env .dockerignore`
Expected: `jordannedyck-ai/.dockerignore` contains `.env`; web `.dockerignore` contains `.env.local`/`.env*.local`. If the web one lacks a plain `.env` line, add it and commit before building:
```bash
printf '.env\n' >> .dockerignore
git add .dockerignore && git commit -m "chore: ignore .env in web container build context"
git push   # so the public repo the build clones reflects it
```

- [ ] **Step 2: Save BuildRun templates for repeatability**

`k8s/dev/22-buildrun-templates.yaml`:
```yaml
apiVersion: shipwright.io/v1beta1
kind: BuildRun
metadata:
  generateName: jordbot-ai-
  namespace: jordbot-dev
spec:
  build:
    name: jordbot-ai
---
apiVersion: shipwright.io/v1beta1
kind: BuildRun
metadata:
  generateName: jordbot-web-
  namespace: jordbot-dev
spec:
  build:
    name: jordbot-web
```

- [ ] **Step 3: Trigger both BuildRuns**

Run:
```bash
oc create -f k8s/dev/22-buildrun-templates.yaml
```
Expected: two `buildrun.shipwright.io/jordbot-ai-xxxxx created` / `jordbot-web-xxxxx created`.

- [ ] **Step 4: Watch them to completion**

Run: `oc -n jordbot-dev get buildruns -w`
Expected: each reaches `SUCCEEDED=True` (`REASON=Succeeded`). Ctrl-C when both are done.
If one fails, inspect: `oc -n jordbot-dev logs -l buildrun.shipwright.io/name=<buildrun-name> --all-containers --tail=80`.

- [ ] **Step 5: Confirm the `:dev` tags landed in Quay**

Run:
```bash
U=$(oc -n jordbot get secret registry-pull-secret -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d \
  | python3 -c 'import json,sys,base64;a=json.load(sys.stdin)["auths"]["REGISTRY_PLACEHOLDER"]["auth"];print(base64.b64decode(a).decode().split(":")[0])')
for repo in REGISTRY_PLACEHOLDER/jordbot REGISTRY_PLACEHOLDER/jordbot-web; do
  T=$(curl -sk -u "$U:$(oc -n jordbot get secret registry-pull-secret -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d | python3 -c 'import json,sys,base64;a=json.load(sys.stdin)["auths"]["REGISTRY_PLACEHOLDER"]["auth"];print(base64.b64decode(a).decode().split(":",1)[1])')" \
    "https://REGISTRY_PLACEHOLDER/v2/auth?service=REGISTRY_PLACEHOLDER&scope=repository:$repo:pull" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
  echo -n "$repo tags: "; curl -sk -H "Authorization: Bearer $T" "https://REGISTRY_PLACEHOLDER/v2/$repo/tags/list"
  echo
done
```
Expected: `REGISTRY_PLACEHOLDER/jordbot` tags include `dev` (alongside `v1.2` etc.); `REGISTRY_PLACEHOLDER/jordbot-web` tags include `dev`.

- [ ] **Step 6: Commit**

```bash
git add k8s/dev/22-buildrun-templates.yaml
git commit -m "feat(dev): BuildRun templates for jordbot-dev images"
```

---

### Task 4: FAISS PVC + clone from prod

**Files:**
- Create: `k8s/dev/30-pvc-faiss.yaml`

- [ ] **Step 1: Write the dev PVC**

`k8s/dev/30-pvc-faiss.yaml`:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: faiss-db
  namespace: jordbot-dev
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: nfs-csi
  resources:
    requests:
      storage: 500Mi
```

- [ ] **Step 2: Apply and verify it binds**

Run: `oc apply -f k8s/dev/30-pvc-faiss.yaml && sleep 4 && oc -n jordbot-dev get pvc faiss-db`
Expected: `STATUS` is `Bound`.

- [ ] **Step 3: Start a helper pod in PROD mounting the prod index (read source)**

Run:
```bash
oc -n jordbot run faiss-src --image=registry.access.redhat.com/ubi9/ubi-minimal --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"faiss-src","image":"registry.access.redhat.com/ubi9/ubi-minimal","command":["sleep","1800"],"volumeMounts":[{"name":"faiss-db","mountPath":"/data"}]}],"volumes":[{"name":"faiss-db","persistentVolumeClaim":{"claimName":"faiss-db"}}]}}'
oc -n jordbot wait --for=condition=Ready pod/faiss-src --timeout=120s
```
Expected: `pod/faiss-src condition met`.

- [ ] **Step 4: Start a helper pod in DEV mounting the dev index (write target)**

Run:
```bash
oc -n jordbot-dev run faiss-dst --image=registry.access.redhat.com/ubi9/ubi-minimal --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"faiss-dst","image":"registry.access.redhat.com/ubi9/ubi-minimal","command":["sleep","1800"],"volumeMounts":[{"name":"faiss-db","mountPath":"/data"}]}],"volumes":[{"name":"faiss-db","persistentVolumeClaim":{"claimName":"faiss-db"}}]}}'
oc -n jordbot-dev wait --for=condition=Ready pod/faiss-dst --timeout=120s
```
Expected: `pod/faiss-dst condition met`.

- [ ] **Step 5: Copy prod index → local → dev**

Run:
```bash
rm -rf /tmp/faiss_clone && mkdir -p /tmp/faiss_clone
oc -n jordbot rsync faiss-src:/data/ /tmp/faiss_clone/
oc -n jordbot-dev rsync /tmp/faiss_clone/ faiss-dst:/data/
```
Expected: rsync transfers files both directions with no errors.

- [ ] **Step 6: Verify dev index is populated**

Run: `oc -n jordbot-dev exec faiss-dst -- sh -c 'ls -la /data && du -sh /data'`
Expected: same files as prod (e.g. `index.faiss`, metadata files), non-zero size matching prod.

- [ ] **Step 7: Clean up helper pods + local copy**

Run:
```bash
oc -n jordbot delete pod faiss-src
oc -n jordbot-dev delete pod faiss-dst
rm -rf /tmp/faiss_clone
```
Expected: both pods deleted.

- [ ] **Step 8: Commit**

```bash
git add k8s/dev/30-pvc-faiss.yaml
git commit -m "feat(dev): faiss-db PVC (seeded from prod index)"
```

---

### Task 5: Deployments + Services

**Files:**
- Create: `k8s/dev/40-deployment-api.yaml`
- Create: `k8s/dev/41-deployment-web.yaml`
- Create: `k8s/dev/42-services.yaml`

- [ ] **Step 1: Write the backend Deployment**

`k8s/dev/40-deployment-api.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jordannedyck-ai
  namespace: jordbot-dev
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
      imagePullSecrets:
      - name: registry-pull-secret
      containers:
      - name: jordannedyck-ai
        image: REGISTRY_PLACEHOLDER/jordbot:dev
        imagePullPolicy: Always
        ports:
        - containerPort: 5000
        envFrom:
        - secretRef:
            name: openai-api-key
        volumeMounts:
        - name: faiss-db
          mountPath: /opt/app-root/src/faiss_db
      volumes:
      - name: faiss-db
        persistentVolumeClaim:
          claimName: faiss-db
```

- [ ] **Step 2: Write the frontend Deployment**

`k8s/dev/41-deployment-web.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jordannedyck-ai-web
  namespace: jordbot-dev
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
      imagePullSecrets:
      - name: registry-pull-secret
      containers:
      - name: jordannedyck-ai-web
        image: REGISTRY_PLACEHOLDER/jordbot-web:dev
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: FLASK_API_URL
          value: "http://jordannedyck-ai:5000"
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: openai-api-key
```

- [ ] **Step 3: Write the Services**

`k8s/dev/42-services.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: jordannedyck-ai
  namespace: jordbot-dev
spec:
  selector:
    app: jordannedyck-ai
  ports:
  - port: 5000
    targetPort: 5000
---
apiVersion: v1
kind: Service
metadata:
  name: jordannedyck-ai-web
  namespace: jordbot-dev
spec:
  selector:
    app: jordannedyck-ai-web
  ports:
  - port: 3000
    targetPort: 3000
```

- [ ] **Step 4: Apply all three**

Run: `oc apply -f k8s/dev/40-deployment-api.yaml -f k8s/dev/41-deployment-web.yaml -f k8s/dev/42-services.yaml`
Expected: 2 deployments + 2 services created.

- [ ] **Step 5: Verify rollouts**

Run: `oc -n jordbot-dev rollout status deploy/jordannedyck-ai --timeout=180s && oc -n jordbot-dev rollout status deploy/jordannedyck-ai-web --timeout=180s`
Expected: both `successfully rolled out`. If a pod is `ImagePullBackOff`, recheck the `registry-pull-secret` pull secret; if `CreateContainerConfigError`, recheck the `openai-api-key` secret exists.

- [ ] **Step 6: Verify backend has key + index**

Run: `oc -n jordbot-dev exec deploy/jordannedyck-ai -- sh -c 'printenv OPENAI_API_KEY | tail -c 4; echo; ls /opt/app-root/src/faiss_db'`
Expected: `xJ0A` and the FAISS index files listed.

- [ ] **Step 7: Commit**

```bash
git add k8s/dev/40-deployment-api.yaml k8s/dev/41-deployment-web.yaml k8s/dev/42-services.yaml
git commit -m "feat(dev): backend + frontend Deployments and Services"
```

---

### Task 6: Internal Route + end-to-end verification

**Files:**
- Create: `k8s/dev/50-route.yaml`

- [ ] **Step 1: Write the internal-only Route**

`k8s/dev/50-route.yaml`:
```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: jordbot-dev
  namespace: jordbot-dev
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

- [ ] **Step 2: Apply and read the assigned internal host**

Run: `oc apply -f k8s/dev/50-route.yaml && oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}{"\n"}'`
Expected: host like `jordbot-dev-jordbot-dev.apps.CLUSTER.example.internal` (internal DNS only).

- [ ] **Step 3: Verify the web UI serves over the internal route**

Run: `H=$(oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'); curl -sk -o /dev/null -w "HTTP=%{http_code}\n" "https://$H/"`
Expected: `HTTP=200`.

- [ ] **Step 4: Verify it is NOT publicly reachable (lockdown intact)**

Run: `H=$(oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'); nslookup "$H" 1.1.1.1 2>/dev/null | awk '/^Address: /{print $2}' | grep -v '#' || echo "no public DNS (good)"`
Expected: `no public DNS (good)` — the dev host resolves only internally and is not on haproxy.

- [ ] **Step 5: End-to-end chat round-trip**

Run: `H=$(oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'); curl -sk -o /dev/null -w "chat HTTP=%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{"message":"hello"}' "https://$H/api/chat"`
Expected: `HTTP=200` (chat proxied web → Flask → OpenAI + FAISS). If 404/405, confirm the web app's chat path; adjust the test, not the deployment.

- [ ] **Step 6: Commit**

```bash
git add k8s/dev/50-route.yaml
git commit -m "feat(dev): internal-only Route for jordbot-dev"
```

---

### Task 7: README + final review

**Files:**
- Create: `k8s/dev/README.md`

- [ ] **Step 1: Write the dev usage README**

`k8s/dev/README.md`:
```markdown
# jordbot-dev

In-cluster dev mirror of the `jordbot` namespace. See
`docs/superpowers/specs/2026-06-14-jordbot-dev-design.md`.

## Rebuild after a code change
1. `git push` to the relevant GitHub repo (master).
2. Trigger a build:
   `oc create -f k8s/dev/22-buildrun-templates.yaml`
   (or a single one with `oc -n jordbot-dev create -f - <<<'...'`).
3. Watch: `oc -n jordbot-dev get buildruns -w`.
4. Roll out the new image:
   `oc -n jordbot-dev rollout restart deploy/jordannedyck-ai deploy/jordannedyck-ai-web`.

## Access
- Internal route: `oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'`
- Or: `oc -n jordbot-dev port-forward svc/jordannedyck-ai-web 3000:3000`

## Notes
- Reuses the prod `OPENAI_API_KEY` (Doppler) — dev usage hits the prod key/quota.
- FAISS index seeded from prod; re-seed by re-running the clone steps in the plan.
- Not exposed publicly (not on the droplet haproxy).
```

- [ ] **Step 2: Verify full namespace state**

Run: `oc -n jordbot-dev get builds.shipwright.io,deploy,svc,route,pvc,externalsecret`
Expected: 2 Builds (Succeeded), 2 Deployments (1/1), 2 Services, 1 Route, 1 PVC (Bound), 1 ExternalSecret (SecretSynced).

- [ ] **Step 3: Confirm prod is untouched**

Run: `oc -n jordbot get deploy,route && oc -n jordbot get externalsecret openai-api-key`
Expected: prod `jordannedyck-ai`/`jordannedyck-ai-web` still running on `v1.2`/`v1.3`, prod route intact, prod ExternalSecret still `SecretSynced`.

- [ ] **Step 4: Commit**

```bash
git add k8s/dev/README.md
git commit -m "docs(dev): jordbot-dev usage README"
```

---

## Self-Review Notes (author)

- **Spec coverage:** namespace (T1), reused OpenAI ExternalSecret (T1), Shipwright Builds + push secret (T1/T2), `:dev` images via BuildRun (T3), `.dockerignore` safety (T3), FAISS clone (T4), Deployments/Services (T5), internal Route + non-public check (T6), verification (T6/T7). Legacy `jordbot` pod intentionally not recreated. All spec sections mapped.
- **Dependencies:** none external — public repos, public base images, reused Quay + Doppler creds.
- **Open runtime risk:** the web app's chat endpoint path (`/api/chat`) is assumed from prod; Step T6.5 says adjust the test if the path differs, not the deployment.
