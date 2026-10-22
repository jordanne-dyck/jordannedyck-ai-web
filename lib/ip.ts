import { createHash } from 'crypto';
// Takes a request or a bare headers holder, so server actions (which only
// have next/headers) resolve the IP the same way as route handlers.
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    return fwd.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function hashIp(ip: string): string {
  // Salted hash keeps IPs out of the DB in cleartext while still letting us
  // group requests by client. Salt must be stable across pod restarts.
  // In production a missing salt is an error, not a fallback: a salt
  // committed to this public repo would make the hashes reversible.
  let salt = process.env.IP_HASH_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('IP_HASH_SALT is not set; refusing to hash IPs with a public salt');
    }
    salt = 'jordbot-local-dev-salt';
  }
  return createHash('sha256').update(salt).update(ip).digest('hex').slice(0, 32);
}
