#!/usr/bin/env python3
"""Block a prod change that has no release evidence (2026-11-05).

A pull request that changes a prod image tag (k8s/prod/release/kustomization.yaml)
or prod's FAISS_DIR (k8s/prod/deployment-api.yaml) must add the evidence file
that jordannedyck-ai/release_gate.py writes:

  releases/<image>-<tag>.json         for a tag
  releases/faiss-<folder>.json        for FAISS_DIR

The file must say "status": "pass", and this script re-checks why rather than
trusting it: a full single-turn, multi-turn and dev e2e run named, every failing
check signed off (a tier-1 one only as "checker miss: ..."), every QA item
ticked, and for jordbot-web a tested commit that is on this branch.

A rollback needs no evidence: a tag or FAISS_DIR that prod has run before is
allowed through, so reverting a release PR is never blocked.

Runs only on pull requests; needs the full history (checkout fetch-depth: 0).
"""
import json
import os
import re
import subprocess
import sys

RELEASE = "k8s/prod/release/kustomization.yaml"
API = "k8s/prod/deployment-api.yaml"
IMAGE_RE = re.compile(r"-\s*name:\s*quay\.nekohouse\.ca:8443/peter/(jordbot(?:-web)?)\s*\n\s*newTag:\s*(\S+)")
FAISS_RE = re.compile(r"name:\s*FAISS_DIR\s*\n\s*value:\s*(\S+)")


def git(*args, check=True):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=check)


def at(ref, path):
    r = git("show", f"{ref}:{path}", check=False)
    return r.stdout if r.returncode == 0 else ""


def ran_before(base, path, line):
    """True if `line` was ever in `path` on the base branch: prod has run it."""
    return bool(git("log", base, "--format=%H", "-S", line, "--", path).stdout.strip())


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
        if not signoff:
            out.append(f"{what} failed and is not signed off")
        elif str(f.get("check", "")).startswith("T1.") and not signoff.lower().startswith("checker miss"):
            # A release needs every tier-1 check (jordannedyck-ai README).
            out.append(f"{what} is tier 1: only a 'checker miss: ...' sign-off lets it through")
    if not ev.get("qa") or not all(q.get("done") is True for q in ev["qa"]):
        out.append("QA items not all ticked")
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
