JSON schemas for the OpenShift and Shipwright kinds in `k8s/`, used by
`.github/workflows/k8s.yml` (kubeconform has no built-in schema for them).

- `route_v1.json`: from `openshift/api` `route/v1/zz_generated.crd-manifests/routes.crd.yaml`
- `build_v1beta1.json`: from the `builds.shipwright.io` CRD on the cluster

Converted like kubeconform's `scripts/openapi2jsonschema.py` (nested objects
reject unknown fields). Regenerate after a Shipwright or OpenShift upgrade that
changes these APIs.
