import { headers } from 'next/headers';
import { pool } from './db';
import { getClientIp, hashIp } from './ip';

// Admin login limit (decided 2026-10-14). The admin pages show every stored
// conversation, and the login accepted unlimited guesses. After MAX_FAILURES
// wrong passwords from one IP hash within WINDOW_MINUTES, that IP is refused
// until the window has passed. Attempts are stored in admin_login_attempts and
// shown in the admin anomaly banner.
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;

export async function currentIpHash(): Promise<string> {
  return hashIp(getClientIp({ headers: await headers() }));
}

// With no database (local development) there is nothing to count against, so
// logins are not limited. Every deployed environment sets DATABASE_URL.
export async function isLockedOut(ipHash: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  // A database error must not make the login itself throw; recordLoginAttempt
  // handles its errors the same way.
  try {
    const { rows } = await pool.query<{ failures: number }>(
      `SELECT COUNT(*)::INT AS failures
         FROM admin_login_attempts
         WHERE ip_hash = $1 AND success = FALSE
           AND created_at > NOW() - INTERVAL '${WINDOW_MINUTES} minutes'`,
      [ipHash],
    );
    return (rows[0]?.failures ?? 0) >= MAX_FAILURES;
  } catch (err) {
    console.error('isLockedOut failed:', err);
    return false;
  }
}

export async function recordLoginAttempt(ipHash: string, success: boolean): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(`INSERT INTO admin_login_attempts (ip_hash, success) VALUES ($1, $2)`, [
      ipHash,
      success,
    ]);
  } catch (err) {
    console.error('recordLoginAttempt failed:', err);
  }
}
