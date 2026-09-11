import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    return fwd.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function hashIp(ip: string): string {
  // Salted hash keeps IPs out of the DB in cleartext while still letting us
  // group requests by client. Salt must be stable across pod restarts.
  const salt = process.env.IP_HASH_SALT ?? 'jordbot-default-salt-set-me';
  return createHash('sha256').update(salt).update(ip).digest('hex').slice(0, 32);
}
