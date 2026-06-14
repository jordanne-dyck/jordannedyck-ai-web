# jordbot-dev

In-cluster dev mirror of the `jordbot` namespace. See
`docs/superpowers/specs/2026-06-14-jordbot-dev-design.md` and
`docs/superpowers/plans/2026-06-14-jordbot-dev.md`.

## Rebuild after a code change
1. `git push` to the relevant GitHub repo (`master`).
2. Trigger a build:
   `oc create -f k8s/dev/22-buildrun-templates.yaml`
3. Watch: `oc -n jordbot-dev get buildruns` until `SUCCEEDED=True`.
4. Roll out the new image:
   `oc -n jordbot-dev rollout restart deploy/jordannedyck-ai deploy/jordannedyck-ai-web`

## Access
- Internal route: `oc -n jordbot-dev get route jordbot-dev -o jsonpath='{.spec.host}'`
  (resolves on internal DNS only; not exposed on the public haproxy)
- Or: `oc -n jordbot-dev port-forward svc/jordannedyck-ai-web 3000:3000`

## Chat API contract
The web `/api/chat` endpoint expects an OpenAI-style messages array:
`{"messages":[{"role":"user","content":"..."}]}` and returns a streaming SSE response.

## Notes
- Reuses the prod `OPENAI_API_KEY` (Doppler) via an ExternalSecret — dev usage hits the prod key/quota.
- FAISS index (`documents.pkl`, `metadatas.pkl`, `resume.index`) seeded once from prod; re-seed by repeating the clone steps in the plan.
- Not exposed publicly (not on the droplet haproxy).
- Manifests apply in numeric order (`00-` … `50-`).
