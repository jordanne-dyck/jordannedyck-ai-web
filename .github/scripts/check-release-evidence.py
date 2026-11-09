#!/usr/bin/env python3
"""Block a prod change that has no release evidence (2026-11-05).

A pull request that changes a prod image tag (k8s/prod/release/kustomization.yaml)
or prod's FAISS_DIR (k8s/prod/deployment-api.yaml) must add the evidence file
that jordannedyck-ai/release_gate.py writes:

  releases/<image>-<tag>.json         for a tag
  releases/faiss-<folder>.json        for FAISS_DIR

The file must say "status": "pass", and this script re-checks why rather than
trusting it: a full single-turn, multi-turn and dev e2e run named, every failing
check signed off (a tier-1 one only as "checker miss: ...", or "not served: ..."
when the e2e run passed that case) on the run it failed in, every QA item
ticked, the public docs approved by Jordanne at their master commit, COVERAGE.md
regenerated, and no results-log entry left unreviewed, and for jordbot-web a
tested commit that is on this branch.

A rollback needs no evidence: a tag or FAISS_DIR that prod has run before is
allowed through, so reverting a release PR is never blocked.

Runs only on pull requests; needs the full history (checkout fetch-depth: 0).
When an evidence file is checked, it also reads jordannedyck-ai's history from
GitHub, so a backend doc changed on master after Jordanne approved it fails.
"""
import atexit
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile

RELEASE = "k8s/prod/release/kustomization.yaml"
API = "k8s/prod/deployment-api.yaml"
IMAGE_RE = re.compile(r"-\s*name:\s*quay\.nekohouse\.ca:8443/peter/(jordbot(?:-web)?)\s*\n\s*newTag:\s*(\S+)")
FAISS_RE = re.compile(r"name:\s*FAISS_DIR\s*\n\s*value:\s*(\S+)")
# The docs a release brings up to date and Jord approves (2026-11-07). Mirrors
# DOCS in jordannedyck-ai/release_gate.py; "ai" is the backend repo.
REQUIRED_DOCS = [("ai", "README.md"), ("ai", "EVALS.md"), ("ai", "DECISIONS.md"),
                 ("ai", "COVERAGE.md"), ("web", "README.md")]
# The backend repo is public, so its docs are checked against its master too.
# AI_REPO overrides the URL (a local path works) for testing.
AI_REPO = os.environ.get("AI_REPO", "https://github.com/jordanne-dyck/jordannedyck-ai.git")
_ai_clone = []


def git(*args, check=True):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=check)


def ai_last_commit(path):
    """Newest commit on the backend's master that touched `path`, or None when
    the backend can't be fetched. Clones once, history only (no file contents)."""
    if not _ai_clone:
        d = tempfile.mkdtemp(prefix="jordannedyck-ai-")
        # git writes its pack files read-only, which rmtree can't remove on Windows.
        atexit.register(shutil.rmtree, d,
                        onerror=lambda fn, p, _: (os.chmod(p, stat.S_IWRITE), fn(p)))
        r = git("clone", "-q", "--bare", "--filter=blob:none", "--single-branch",
                "--branch", "master", AI_REPO, d, check=False)
        _ai_clone.append(d if r.returncode == 0 else None)
    if _ai_clone[0] is None:
        return None
    return git("-C", _ai_clone[0], "log", "-1", "--format=%H", "master", "--", path,
               check=False).stdout.strip() or None


def at(ref, path):
    r = git("show", f"{ref}:{path}", check=False)
    return r.stdout if r.returncode == 0 else ""


def ran_before(base, path, line):
    """True if `line` was ever in `path` on the base branch: prod has run it."""
    return bool(git("log", base, "--format=%H", "-S", line, "--", path).stdout.strip())


def tier1_ok(f, signoff):
    """'not served:' (2026-11-06): text the site never sends, e.g. A01's model
    refusal, which the site replaces with a fixed reply. It counts only when the
    dev e2e run passed the same case, so the site's own answer was checked."""
    return signoff.startswith("checker miss") or (
        signoff.startswith("not served") and f.get("kind") != "e2e"
        and f.get("e2e_case_passed") is True)


def problems_in(path, want):
    if not os.path.exists(path):
        return [f"{path} is missing; run release_gate.py and add the file to this PR"]
    try:
        ev = json.load(open(path, encoding="utf-8"))
    except ValueError as e:
        return [f"{path} is not JSON: {e}"]
    out = []
    for k, v in want.items():
        if ev.get(k) != v:
            out.append(f"{k} is {ev.get(k)!r}, this PR sets {v!r}")
    if ev.get("status") != "pass":
        out.append(f"status is {ev.get('status')!r}: {ev.get('problems')}")
    for kind in ("single", "multiturn", "e2e"):
        if not (ev.get("evals") or {}).get(kind, {}) or not ev["evals"][kind].get("run_id"):
            out.append(f"no full {kind} run named")
    for f in ev.get("failures", []):
        signoff = str(f.get("signoff") or "").strip()
        what = f"{f.get('kind')} {f.get('case')} {f.get('check')}"
        # A sign-off holds only for the run it was given on (2026-11-08): the gate
        # clears it on a new run and keeps the old one as "previous_signoff", which
        # this check never reads. So each failure must come from the run named.
        run = ((ev.get("evals") or {}).get(f.get("kind")) or {}).get("run_id")
        if f.get("run_id") != run:
            out.append(f"{what} is from run {f.get('run_id')!r}, not the {f.get('kind')} "
                       f"run named ({run!r}); re-run release_gate.py")
        if not signoff:
            out.append(f"{what} failed and is not signed off")
        elif str(f.get("check", "")).startswith("T1.") and not tier1_ok(f, signoff.lower()):
            # A release needs every tier-1 check (jordannedyck-ai README).
            out.append(f"{what} is tier 1: only 'checker miss: ...', or 'not served: ...' "
                       "with the e2e run passing that case, lets it through")
    if not ev.get("qa") or not all(q.get("done") is True for q in ev["qa"]):
        out.append("QA items not all ticked")
    docs = {(d.get("repo"), d.get("path")): d for d in ev.get("docs") or []}
    for repo, path in REQUIRED_DOCS:
        d = docs.get((repo, path))
        if d is None:
            out.append(f"doc {repo}:{path} is not in the evidence; re-run release_gate.py")
            continue
        commit = str(d.get("commit") or "")
        if d.get("approved") is not True:
            out.append(f"doc {repo}:{path} is not approved by Jordanne")
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            out.append(f"doc {repo}:{path} commit {commit!r} is not a full commit id")
        elif repo == "web":
            # Checkable here: the approved README is on this branch and unchanged since.
            if git("merge-base", "--is-ancestor", commit, "HEAD", check=False).returncode != 0:
                out.append(f"approved {path} {commit[:7]} is not on this branch")
            elif git("diff", "--quiet", commit, "HEAD", "--", path, check=False).returncode != 0:
                out.append(f"{path} changed after Jordanne approved it at {commit[:7]}")
        else:
            latest = ai_last_commit(path)
            if latest is None:
                out.append(f"could not read jordannedyck-ai master to check {path}; re-run this check")
            elif latest != commit:
                out.append(f"jordannedyck-ai {path} is at {latest[:7]} on master, "
                           f"Jordanne approved {commit[:7]}; re-run release_gate.py and approve again")
    if ev.get("coverage_generated") is not True:
        out.append("COVERAGE.md is not what coverage_report.py generates")
    unrev = (ev.get("results_log") or {}).get("unreviewed")
    if unrev != []:
        out.append(f"results-log entries not reviewed by Jordanne: {unrev}")
    if want.get("image") == "jordbot-web":
        sha = ev.get("sha") or ""
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            out.append(f"sha {sha!r} is not a full commit id")
        elif git("merge-base", "--is-ancestor", sha, "HEAD", check=False).returncode != 0:
            out.append(f"tested commit {sha[:7]} is not on this branch, so not on master")
    return out


def main():
    base_ref = os.environ.get("GITHUB_BASE_REF")
    if not base_ref:
        print("not a pull request: nothing to check")
        return
    base = f"origin/{base_ref}"

    errors, checked = [], []
    old_tags = dict(IMAGE_RE.findall(at(base, RELEASE)))
    for image, tag in IMAGE_RE.findall(open(RELEASE, encoding="utf-8").read()):
        if old_tags.get(image) == tag:
            continue
        if tag in at_history(base, image):
            print(f"{image} {tag}: rollback to a tag prod has run, no evidence needed")
            continue
        path = f"releases/{image}-{tag}.json"
        checked.append(path)
        errors += [f"{path}: {p}" for p in problems_in(path, {"image": image, "tag": tag})]

    old_dir = FAISS_RE.search(at(base, API))
    new_dir = FAISS_RE.search(open(API, encoding="utf-8").read())
    if new_dir and (not old_dir or old_dir.group(1) != new_dir.group(1)):
        d = new_dir.group(1)
        if ran_before(base, API, f"value: {d}"):
            print(f"FAISS_DIR {d}: rollback to an index prod has run, no evidence needed")
        else:
            path = f"releases/faiss-{d.rstrip('/').rsplit('/', 1)[-1]}.json"
            checked.append(path)
            errors += [f"{path}: {p}" for p in problems_in(path, {"faiss_dir": d})]

    if errors:
        print("Prod change without release evidence (see CLAUDE.md, Release gate):")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    print("release evidence: " + (", ".join(checked) + " OK" if checked else "no new tag or FAISS_DIR"))


def at_history(base, image):
    """Every tag `image` has had in the release file on the base branch."""
    tags = set()
    for sha in git("log", base, "--format=%H", "--", RELEASE).stdout.split():
        tags.update(t for i, t in IMAGE_RE.findall(at(sha, RELEASE)) if i == image)
    return tags


if __name__ == "__main__":
    main()
