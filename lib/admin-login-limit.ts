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

// An attempt is recorded as a failure BEFORE the password is checked, then the
// failures are counted including it. Checking first and recording
// after let parallel requests all pass the check at MAX_FAILURES - 1. Each
// insert commits before its own count, so the k-th concurrent attempt sees at
// least k rows: at most MAX_FAILURES attempts per window reach the password.
//
// Locked: the claimed row is deleted again, so refused attempts don't extend
// the lockout (the same as before, when they were never recorded).
// Not locked: the caller checks the password and calls settleLoginAttempt.
//
// With no database (local development) there is nothing to count against, so
// logins are not limited. Every deployed environment sets DATABASE_URL. A
// database error must not make the login itself throw, so it lets the attempt
// through, as before.
export type LoginClaim = { locked: boolean; id: string | null };

export async function claimLoginAttempt(ipHash: string): Promise<LoginClaim> {
  if (!process.env.DATABASE_URL) return { locked: false, id: null };
  try {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO admin_login_attempts (ip_hash, success) VALUES ($1, FALSE) RETURNING id::TEXT AS id`,
      [ipHash],
    );
    const id = inserted.rows[0]?.id ?? null;
    const { rows } = await pool.query<{ failures: number }>(
      `SELECT COUNT(*)::INT AS failures
         FROM admin_login_attempts
         WHERE ip_hash = $1 AND success = FALSE
           AND created_at > NOW() - INTERVAL '${WINDOW_MINUTES} minutes'`,
      [ipHash],
    );
    // This attempt is one of the counted failures, so the limit is
    // "more than MAX_FAILURES", which equals the old ">= MAX_FAILURES before it".
    if ((rows[0]?.failures ?? 0) > MAX_FAILURES) {
      if (id) await pool.query(`DELETE FROM admin_login_attempts WHERE id = $1`, [id]);
      return { locked: true, id: null };
    }
    return { locked: false, id };
  } catch (err) {
    console.error('claimLoginAttempt failed:', err);
    return { locked: false, id: null };
  }
}

// A wrong password leaves the claimed row as a failure; a right one marks it.
export async function settleLoginAttempt(claim: LoginClaim, success: boolean): Promise<void> {
  if (!success || !claim.id || !process.env.DATABASE_URL) return;
  try {
    await pool.query(`UPDATE admin_login_attempts SET success = TRUE WHERE id = $1`, [claim.id]);
  } catch (err) {
    console.error('settleLoginAttempt failed:', err);
  }
}
