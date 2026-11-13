#!/usr/bin/env python3
"""Tests for check-release-evidence.py's run and tier-1 rules (2026-11-12).

Stdlib only, no network. Run from the repo root:
    python3 -m unittest discover -s .github/scripts -p "test_*.py" -v

Each test builds an evidence file that passes, breaks one thing, and asserts on
the problems that one change adds, so checks this file does not cover (docs,
tested commit) cannot make a test pass or fail.
"""
import copy
import importlib.util
import json
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cre", os.path.join(HERE, "check-release-evidence.py"))
cre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cre)

COMMIT = "a" * 40
RUNS = {"single": "s1", "multiturn": "m1", "e2e": "e1", "e2e_multiturn": "em1"}


def passing():
    return {
        "faiss_dir": "/faiss/kb-test",
        "status": "pass",
        "evals": {k: {"run_id": v} for k, v in RUNS.items()},
        "failures": [],
        "qa": [{"item": "x", "done": True}],
        # Only backend docs, so no git call against this checkout.
        "docs": [{"repo": r, "path": p, "commit": COMMIT, "approved": True}
                 for r, p in cre.REQUIRED_DOCS if r == "ai"],
        "coverage_generated": True,
        "results_log": {"unreviewed": []},
    }


def failure(kind, check="T1.6_voice", signoff="checker miss: test", passed=False):
    return {"kind": kind, "case": "M04", "check": check, "failed": 1, "of": 3,
            "run_id": RUNS[kind], "e2e_case_passed": passed, "signoff": signoff}


class EvidenceTest(unittest.TestCase):
    def setUp(self):
        self._ai = cre.ai_last_commit
        cre.ai_last_commit = lambda path: COMMIT
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        cre.ai_last_commit = self._ai

    def problems(self, ev):
        path = os.path.join(self.tmp, "ev.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(ev, f)
        out = cre.problems_in(path, {"faiss_dir": ev["faiss_dir"]})
        # The web README is checked against this checkout's git; leave it out.
        return [p for p in out if "web:README.md" not in p]

    def added(self, ev):
        base = set(self.problems(passing()))
        return [p for p in self.problems(ev) if p not in base]

    def test_baseline_passes(self):
        self.assertEqual(self.problems(passing()), [])

    def test_each_run_is_required(self):
        for kind in RUNS:
            for missing in ("absent", "null", "no run_id"):
                ev = passing()
                if missing == "absent":
                    del ev["evals"][kind]
                elif missing == "null":
                    ev["evals"][kind] = None
                else:
                    ev["evals"][kind] = {"run_id": None}
                with self.subTest(kind=kind, missing=missing):
                    self.assertIn(f"no full {kind} run named", self.added(ev))

    def test_evidence_without_multiturn_e2e_fails(self):
        # The shape release_gate.py wrote before backend #42 (v1.16, kb-762b34e).
        ev = passing()
        del ev["evals"]["e2e_multiturn"]
        self.assertEqual(self.added(ev), ["no full e2e_multiturn run named"])

    def test_not_served_refused_for_either_e2e_run(self):
        for kind in cre.E2E_KINDS:
            ev = passing()
            ev["failures"] = [failure(kind, signoff="not served: fixed reply", passed=True)]
            with self.subTest(kind=kind):
                added = self.added(ev)
                self.assertEqual(len(added), 1, added)
                self.assertIn(f"{kind} M04 T1.6_voice is tier 1", added[0])

    def test_not_served_allowed_for_eval_runs_when_e2e_passed(self):
        for kind in ("single", "multiturn"):
            ev = passing()
            ev["failures"] = [failure(kind, signoff="not served: fixed reply", passed=True)]
            with self.subTest(kind=kind):
                self.assertEqual(self.added(ev), [])

    def test_not_served_refused_for_eval_runs_when_e2e_did_not_pass(self):
        ev = passing()
        ev["failures"] = [failure("multiturn", signoff="not served: fixed reply", passed=False)]
        self.assertEqual(len(self.added(ev)), 1)

    def test_checker_miss_allowed_for_multiturn_e2e(self):
        ev = passing()
        ev["failures"] = [failure("e2e_multiturn", signoff="checker miss: regex too wide")]
        self.assertEqual(self.added(ev), [])

    def test_tier2_signoff_allowed_for_multiturn_e2e(self):
        ev = passing()
        ev["failures"] = [failure("e2e_multiturn", check="T2.7_cites", signoff="known defect, accepted")]
        self.assertEqual(self.added(ev), [])

    def test_multiturn_e2e_failure_must_come_from_named_run(self):
        ev = passing()
        f = failure("e2e_multiturn")
        f["run_id"] = "older"
        ev["failures"] = [f]
        added = self.added(ev)
        self.assertEqual(len(added), 1, added)
        self.assertIn("not the e2e_multiturn run named ('em1')", added[0])

    def test_unsigned_multiturn_e2e_failure_fails(self):
        ev = passing()
        ev["failures"] = [failure("e2e_multiturn", signoff="")]
        self.assertEqual(self.added(ev), ["e2e_multiturn M04 T1.6_voice failed and is not signed off"])


if __name__ == "__main__":
    unittest.main()
