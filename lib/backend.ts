// Base URL of the Flask backend (jordannedyck-ai). Read at request time, not
// module scope, so the pod's FLASK_API_URL is used rather than a build-time value.
export function backendUrl(): string {
  return process.env.FLASK_API_URL ?? 'http://localhost:5000';
}
