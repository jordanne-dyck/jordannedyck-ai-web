# GitHub Actions CI Design

**Date:** 2026-06-19
**Repos:** `jordannedyck-ai` (Flask backend), `jordannedyck-ai-web` (Next.js frontend)
**Scope:** Lint and dependency vulnerability scanning

---

## Goal

Add GitHub Actions CI to both repos to block merges on lint errors and known-bad
dependencies (HIGH/CRITICAL CVEs), and run a weekly scheduled scan to catch newly
announced CVEs over time.

## Triggers

Both workflows share identical triggers:

- `push` to `master`
- `pull_request` targeting `master`
- `schedule`: `0 8 * * 1` (Monday 08:00 UTC)

## Jobs

### `jordannedyck-ai` — `.github/workflows/ci.yml`

| Job | Tool | Failure condition |
|-----|------|-------------------|
| `lint` | `ruff check .` | Any lint error |
| `scan` | Trivy (`fs` mode, `requirements.txt`) | HIGH or CRITICAL CVE found |

### `jordannedyck-ai-web` — `.github/workflows/ci.yml`

| Job | Tool | Failure condition |
|-----|------|-------------------|
| `lint` | `npm run lint` (ESLint via `eslint.config.mjs`) | Any lint error |
| `scan` | Trivy (`fs` mode, `package-lock.json`) | HIGH or CRITICAL CVE found |

## Vulnerability Scanner: Trivy

Trivy is used as the single scanner across both repos. It aggregates from multiple
advisory databases including NVD, GitHub Advisory, OSV, and Red Hat RHSA — giving
coverage of OS-level and language-level CVEs from the same tool.

Scan mode: `fs` (filesystem scan against the lockfile, no container build required).

**Severity handling:**
- `HIGH` and `CRITICAL` — fail the build (exit code 1)
- `LOW` and `MEDIUM` — non-blocking; uploaded to GitHub Security tab as informational

**SARIF upload:**
- On the weekly cron run: always upload results to the Security tab (clean runs included,
  for a weekly paper trail)
- On push/PR: upload using `continue-on-error: true` on the Trivy step so the SARIF
  upload runs even when the job fails due to findings

## Permissions & Secrets

Both workflows run with minimal permissions:

```yaml
permissions:
  contents: read
  security-events: write
```

No secrets required. The built-in `GITHUB_TOKEN` is sufficient for SARIF uploads.
Both repos are public so no registry credentials are needed.

## What is NOT in scope

- Container image builds (handled by Shipwright in-cluster)
- Deployment to cluster namespaces
- Type-checking beyond what ESLint catches (can be added later)
