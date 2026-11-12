import { createHash } from 'crypto';
import { isIP } from 'net';

// Takes a request or a bare headers holder, so server actions (which only
// have next/headers) resolve the IP the same way as route handlers.
type HeaderSource = { headers: { get(name: string): string | null } };

// Which IP a request is counted against, for the chat, brief and lead limits
// and the admin login lockout.
//
// X-Forwarded-For is a list. Each proxy that appends adds the address it was
// connected from to the right-hand end. Everything to the left of what our own
// proxies added came from the client, and the client can write anything there.
// So the left-most entry (what this file used before) is attacker-controlled
// whenever the first proxy appends rather than replaces.
//
// Set one of these per environment, from how that environment's proxies
// actually behave:
//
//   CLIENT_IP_HEADER=x-client-ip
//     Read one header that the outermost proxy sets itself (HAProxy:
//     `http-request set-header X-Client-IP %[src]`), which overwrites any
//     value the client sent. Use when no X-Forwarded-For position is reliable,
//     e.g. the OpenShift router replaces the header.
//
//   TRUSTED_PROXY_HOPS=N
//     The number of proxies in front of the pod that append to
//     X-Forwarded-For. The client is the N-th entry from the right: the address
//     the outermost proxy saw. Public HAProxy (appends or replaces) + OpenShift
//     router (appends) = 2.
//
// Neither set: the old left-most rule, unchanged, so this code can merge before
// the setting is known. That default is spoofable and warns once in
// production.
//
// Headers.get() joins repeated header lines with ", ", in arrival order, so a
// proxy that adds a second X-Forwarded-For line (HAProxy `option forwardfor`)
// reads the same as one that appends to the existing line.

let warnedLegacy = false;

export function getClientIp(req: HeaderSource): string {
  const header = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (header) {
    // One value, set by our proxy. If a proxy appended to it anyway, the
    // right-most entry is the one it wrote.
    return validIp(lastEntry(req.headers.get(header)));
  }

  const fwd = req.headers.get('x-forwarded-for');
  const hops = parseHops(process.env.TRUSTED_PROXY_HOPS);
  if (hops !== null) {
    const parts = splitList(fwd);
    if (parts.length === 0) return 'unknown';
    // Fewer entries than trusted hops: every entry was added by our proxies,
    // so the left-most one is the furthest out we can see.
    return validIp(parts[Math.max(0, parts.length - hops)]);
  }

  if (process.env.NODE_ENV === 'production' && !warnedLegacy) {
    warnedLegacy = true;
    console.warn(
      'getClientIp: neither CLIENT_IP_HEADER nor TRUSTED_PROXY_HOPS is set; using the left-most X-Forwarded-For entry, which the client controls',
    );
  }
  const first = splitList(fwd)[0];
  if (first) return first;
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function lastEntry(value: string | null): string | undefined {
  const parts = splitList(value);
  return parts[parts.length - 1];
}

// A positive whole number, or null when unset. A set but malformed value is a
// deploy mistake: fail loudly rather than fall back to the spoofable default.
function parseHops(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`TRUSTED_PROXY_HOPS must be a whole number of 1 or more, got "${value}"`);
  }
  return n;
}

// Only a bare IPv4 or IPv6 address counts. Anything else (a port, a hostname,
// "unknown" from a proxy) shares the "unknown" bucket rather than giving each
// garbage value its own.
function validIp(value: string | undefined): string {
  if (!value) return 'unknown';
  return isIP(value) ? value : 'unknown';
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
