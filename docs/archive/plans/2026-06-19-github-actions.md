# GitHub Actions CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lint and vulnerability-scanning CI workflows to both jordannedyck-ai (Flask backend) and jordannedyck-ai-web (Next.js frontend).

**Architecture:** Each repo gets a single `.github/workflows/ci.yml`. Each workflow has two jobs — `lint` and `scan` — that run in parallel. Trivy runs twice in `scan`: once to generate a full-severity SARIF for the GitHub Security tab, then once more scoped to HIGH/CRITICAL to fail the job if blocking issues exist.

**Tech Stack:** GitHub Actions, ruff (Python linter), ESLint (JS linter via `npm run lint`), Trivy (CVE scanner, aquasecurity/trivy-action), github/codeql-action (SARIF upload)

## Global Constraints

- All workflow triggers: `push` to `master`, `pull_request` targeting `master`, `schedule: cron: '0 8 * * 1'`, `workflow_dispatch`
- Permissions on every workflow: `contents: read`, `security-events: write`
- No secrets needed — `GITHUB_TOKEN` is sufficient
- Block on: `HIGH` and `CRITICAL` CVEs only
- LOW/MEDIUM findings: upload to Security tab as informational, do not fail the job
- Runner: `ubuntu-latest`
- Pinned action versions: `actions/checkout@v4`, `actions/setup-python@v5`, `actions/setup-node@v4`, `astral-sh/ruff-action@v3`, `aquasecurity/trivy-action@0.28.0`, `github/codeql-action/upload-sarif@v3`

---

## File Structure

| File | Repo | Action |
|------|------|--------|
| `.github/workflows/ci.yml` | `jordannedyck-ai` | Create |
| `.github/workflows/ci.yml` | `jordannedyck-ai-web` | Create |

---

### Task 1: Backend CI workflow — `jordannedyck-ai`

**Files:**
- Create: `jordannedyck-ai/.github/workflows/ci.yml`

**Interfaces:**
- Produces: A passing CI workflow visible in the GitHub Actions tab on `jordannedyck-ai`

- [ ] **Step 1: Create the workflow directory**

```bash
mkdir -p /home/peter/workdir/jordannedyck-ai/.github/workflows
```

- [ ] **Step 2: Write the workflow file**

Create `/home/peter/workdir/jordannedyck-ai/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  schedule:
    - cron: '0 8 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  security-events: write

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/ruff-action@v3

  scan:
    name: Vulnerability scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Trivy scan (all severities → Security tab)
        uses: aquasecurity/trivy-action@0.28.0
        with:
          scan-type: fs
          scan-ref: .
          severity: UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL
          exit-code: '0'
          format: sarif
          output: trivy-results.sarif

      - name: Upload SARIF to GitHub Security tab
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

      - name: Trivy scan (HIGH/CRITICAL → fail if found)
        uses: aquasecurity/trivy-action@0.28.0
        with:
          scan-type: fs
          scan-ref: .
          severity: HIGH,CRITICAL
          exit-code: '1'
          format: table
```

- [ ] **Step 3: Validate the YAML is well-formed**

```bash
python3 -c "import yaml; yaml.safe_load(open('/home/peter/workdir/jordannedyck-ai/.github/workflows/ci.yml'))" && echo "YAML valid"
```

Expected output: `YAML valid`

- [ ] **Step 4: Commit and push**

```bash
cd /home/peter/workdir/jordannedyck-ai
git add .github/workflows/ci.yml
git commit -m "ci: add lint and vulnerability scan workflow"
git push origin master
```

- [ ] **Step 5: Verify the workflow triggers on GitHub**

Go to `https://github.com/jordanne-dyck/jordannedyck-ai/actions`. The commit push should have triggered a workflow run. Wait for it to complete. Both `lint` and `scan` jobs should be green.

If `lint` fails: ruff found style errors in `api_server.py` or `eval/run_eval.py`. Run `ruff check .` locally in the repo root to see them, then fix and push.

If `scan` fails: a HIGH/CRITICAL CVE was found in `requirements.txt`. Run `trivy fs --severity HIGH,CRITICAL .` locally to see the findings (install Trivy: `brew install trivy` or see https://aquasecurity.github.io/trivy). Upgrade the offending package or file an exception in a `.trivyignore` file.

---

### Task 2: Frontend CI workflow — `jordannedyck-ai-web`

**Files:**
- Create: `jordannedyck-ai-web/.github/workflows/ci.yml`

**Interfaces:**
- Produces: A passing CI workflow visible in the GitHub Actions tab on `jordannedyck-ai-web`

- [ ] **Step 1: Create the workflow directory**

```bash
mkdir -p /home/peter/workdir/jordannedyck-ai-web/.github/workflows
```

- [ ] **Step 2: Write the workflow file**

Create `/home/peter/workdir/jordannedyck-ai-web/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  schedule:
    - cron: '0 8 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  security-events: write

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run lint

  scan:
    name: Vulnerability scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Trivy scan (all severities → Security tab)
        uses: aquasecurity/trivy-action@0.28.0
        with:
          scan-type: fs
          scan-ref: .
          severity: UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL
          exit-code: '0'
          format: sarif
          output: trivy-results.sarif

      - name: Upload SARIF to GitHub Security tab
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

      - name: Trivy scan (HIGH/CRITICAL → fail if found)
        uses: aquasecurity/trivy-action@0.28.0
        with:
          scan-type: fs
          scan-ref: .
          severity: HIGH,CRITICAL
          exit-code: '1'
          format: table
```

- [ ] **Step 3: Validate the YAML is well-formed**

```bash
python3 -c "import yaml; yaml.safe_load(open('/home/peter/workdir/jordannedyck-ai-web/.github/workflows/ci.yml'))" && echo "YAML valid"
```

Expected output: `YAML valid`

- [ ] **Step 4: Commit and push**

```bash
cd /home/peter/workdir/jordannedyck-ai-web
git add .github/workflows/ci.yml
git commit -m "ci: add lint and vulnerability scan workflow"
git push origin master
```

- [ ] **Step 5: Verify the workflow triggers on GitHub**

Go to `https://github.com/jordanne-dyck/jordannedyck-ai-web/actions`. Wait for the run to complete. Both `lint` and `scan` jobs should be green.

If `lint` fails: ESLint found errors. Run `npm run lint` locally to see them, fix, push.

If `scan` fails: HIGH/CRITICAL CVE found in `package-lock.json`. Run `trivy fs --severity HIGH,CRITICAL .` locally. Upgrade the offending package (`npm update <pkg>`) or add a `.trivyignore` entry with justification.

---

### Task 3: Verify Security tab and cron path

**Files:** None — verification only

**Interfaces:**
- Consumes: Completed Tasks 1 and 2 (both workflows green on master)

- [ ] **Step 1: Check Security tab on both repos**

Go to each repo → Security → Code scanning alerts:
- `https://github.com/jordanne-dyck/jordannedyck-ai/security/code-scanning`
- `https://github.com/jordanne-dyck/jordannedyck-ai-web/security/code-scanning`

SARIF results from the push-triggered scan should appear here (may take a minute). Even a clean scan with zero findings creates an entry confirming the upload worked.

- [ ] **Step 2: Manually trigger the cron path via workflow_dispatch**

On each repo's Actions tab, select the `CI` workflow → `Run workflow` → `Run workflow` (on master). This exercises the same code path as the Monday cron.

Confirm both `lint` and `scan` jobs complete and Security tab updates.

- [ ] **Step 3: Done**

Both repos have green CI. The Monday cron will run automatically and surface any newly announced CVEs in the Security tab without manual intervention.
