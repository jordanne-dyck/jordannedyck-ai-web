#!/usr/bin/env python3
"""Check that k8s/prod/release/kustomization.yaml only sets the two prod image tags.

That file merges without Peter's review (see .github/CODEOWNERS), so it may
not carry anything else: no other images, no newName or digest, no patches,
no resources. Comments and blank lines are ignored.
"""
import re
import sys

PATH = "k8s/prod/release/kustomization.yaml"
TAG = r"v\d+\.\d+(\.\d+)?"
EXPECTED = [
    r"apiVersion: kustomize\.config\.k8s\.io/v1alpha1",
    r"kind: Component",
    r"images:",
    r"  - name: quay\.nekohouse\.ca:8443/peter/jordbot",
    rf"    newTag: {TAG}",
    r"  - name: quay\.nekohouse\.ca:8443/peter/jordbot-web",
    rf"    newTag: {TAG}",
]

lines = []
with open(PATH, encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n").rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        lines.append(line)

errors = []
if len(lines) != len(EXPECTED):
    errors.append(f"expected {len(EXPECTED)} non-comment lines, found {len(lines)}")
for i, (want, got) in enumerate(zip(EXPECTED, lines), 1):
    if not re.fullmatch(want, got):
        errors.append(f"line {i}: {got!r} does not match {want!r}")

if errors:
    print(f"{PATH} may only set newTag (vX.Y or vX.Y.Z) for the two prod images:")
    for e in errors:
        print(f"  {e}")
    sys.exit(1)
print(f"{PATH}: OK")
