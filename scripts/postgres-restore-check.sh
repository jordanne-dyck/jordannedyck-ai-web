#!/usr/bin/env bash
# Proves a Postgres backup restores: starts a throwaway Postgres pod that mounts
# the postgres-backups PVC read-only, restores a dump into its own empty
# database, and compares row counts per table with the .counts file the backup
# job wrote beside the dump. Deletes the pod when done.
#
# The throwaway database gets its own random password; no app secret is read.
#
# Usage (Git Bash, jordbot-agent kubeconfig active):
#   scripts/postgres-restore-check.sh [namespace] [dump file name]
# Defaults: jordbot-dev, the newest monitoring-*.dump.
# Prod (jordbot) needs Peter: the agent cannot create pods there.
set -euo pipefail

ns="${1:-jordbot-dev}"
dump="${2:-}"
pod="postgres-restore-check"

# Git Bash rewrites /paths in arguments to Windows paths; oc must see them as
# written. Convert KUBECONFIG first so it still resolves.
if command -v cygpath >/dev/null 2>&1 && [ -n "${KUBECONFIG:-}" ]; then
  export KUBECONFIG="$(cygpath -m "$KUBECONFIG")"
fi
export MSYS_NO_PATHCONV=1

pw="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"

cleanup() { oc -n "$ns" delete pod "$pod" --ignore-not-found --wait=false >/dev/null; }
trap cleanup EXIT

oc -n "$ns" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $pod
  labels:
    app: postgres-restore-check
spec:
  restartPolicy: Never
  containers:
    - name: postgres
      image: quay.io/sclorg/postgresql-16-c9s:latest
      env:
        - {name: POSTGRESQL_USER, value: restore}
        - {name: POSTGRESQL_PASSWORD, value: "$pw"}
        - {name: POSTGRESQL_DATABASE, value: restore}
      resources:
        requests: {cpu: 50m, memory: 128Mi}
        limits: {cpu: 500m, memory: 512Mi}
      volumeMounts:
        - {name: data, mountPath: /var/lib/pgsql/data}
        - {name: backups, mountPath: /backups, readOnly: true}
  volumes:
    - name: data
      emptyDir: {}
    - name: backups
      persistentVolumeClaim:
        claimName: postgres-backups
        readOnly: true
EOF

echo "Waiting for the throwaway Postgres in $ns..."
oc -n "$ns" wait --for=condition=Ready "pod/$pod" --timeout=300s >/dev/null
# The image's first-start setup runs a temporary server on the local socket
# only; checking over TCP waits for the real one.
ready=""
for _ in $(seq 1 90); do
  if oc -n "$ns" exec "$pod" -- pg_isready -q -h 127.0.0.1 -d restore 2>/dev/null; then
    ready=1; break
  fi
  sleep 2
done
[ -n "$ready" ] || { echo "Throwaway Postgres never became ready." >&2; exit 1; }

oc -n "$ns" exec -i "$pod" -- env DUMP="$dump" bash -s <<'EOF'
set -euo pipefail
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t /backups/monitoring-*.dump | head -n 1)"
else
  DUMP="/backups/$DUMP"
fi
echo "Dump:     $DUMP ($(stat -c %s "$DUMP") bytes)"
pg_restore --no-owner --no-privileges --exit-on-error -d restore "$DUMP"
psql -d restore -v ON_ERROR_STOP=1 -At -F ' ' -c "
  SELECT table_name,
         (xpath('/row/c/text()', query_to_xml(format(
           'SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
           false, true, '')))[1]::text
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name;" > /tmp/restored
echo
echo "table  rows-at-backup  rows-restored"
join -a1 -a2 -e MISSING -o 0,1.2,2.2 <(grep -v '^#' "$DUMP.counts" | sort) <(sort /tmp/restored)
echo
if grep -q '^# approximate' "$DUMP.counts"; then
  echo "NOTE: rows changed during that dump, so its counts are approximate."
fi
if [ "$(grep -v '^#' "$DUMP.counts" | sort)" = "$(sort /tmp/restored)" ]; then
  echo "RESTORE OK: every table restored with the row count it had at backup time."
else
  echo "RESTORE MISMATCH: see the table above." >&2
  exit 1
fi
EOF
