import { pool } from './db';
import type { NotifyResult } from './notify';
import { leadStats, overLeadLimit, type LeadInput, type LeadRow, type LeadStats, type LeadStatus } from './leads';

// Database side of the concierge leads (lib/leads.ts, db/schema.sql `leads`).

export type InsertLeadResult = { ok: true; id: string } | { ok: false; limit: 'visitor' | 'email' | 'site' };

// Counts and insert in one transaction, under an advisory lock, so two
// requests at once can't both slip under a limit. A synthetic lead (the
// monitoring check, x-monitor-token) skips the limits, isn't counted by them,
// and is deleted after 7 days by the next synthetic insert.
export async function insertLead(
  lead: LeadInput,
  ipHash: string,
  opts: { synthetic?: boolean } = {},
): Promise<InsertLeadResult> {
  const synthetic = opts.synthetic === true;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('leads_insert'))");
    if (synthetic) {
      await client.query(`DELETE FROM leads WHERE is_synthetic AND created_at < NOW() - INTERVAL '7 days'`);
    }
    const { rows } = await client.query<{ visitor: number; email: number; site: number }>(
      `SELECT COUNT(*) FILTER (WHERE ip_hash = $1)::int AS visitor,
              COUNT(*) FILTER (WHERE email = $2)::int   AS email,
              COUNT(*)::int                             AS site
         FROM leads
        WHERE created_at > NOW() - INTERVAL '24 hours' AND NOT is_synthetic`,
      [ipHash, lead.email],
    );
    const limit = synthetic ? null : overLeadLimit(rows[0] ?? { visitor: 0, email: 0, site: 0 });
    if (limit) {
      await client.query('ROLLBACK');
      return { ok: false, limit };
    }
    const ins = await client.query<{ id: string }>(
      `INSERT INTO leads (name, email, purpose, project, note, drafted_by, edited, consent_at, ip_hash, is_synthetic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
       RETURNING id::text`,
      [lead.name, lead.email, lead.purpose, lead.project, lead.note, lead.draftedBy, lead.edited, ipHash, synthetic],
    );
    await client.query('COMMIT');
    return { ok: true, id: ins.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

type DbLead = {
  id: string;
  created_at: Date;
  name: string;
  email: string;
  purpose: string | null;
  project: string | null;
  note: string;
  drafted_by: string | null;
  edited: boolean;
  status: LeadStatus;
  status_at: Date | null;
  replied_at: Date | null;
  notified_at: Date | null;
  notify_error: string | null;
};

const toRow = (r: DbLead): LeadRow => ({
  id: r.id,
  createdAt: r.created_at.toISOString(),
  name: r.name,
  email: r.email,
  purpose: r.purpose,
  project: r.project,
  note: r.note,
  draftedBy: r.drafted_by,
  edited: r.edited,
  status: r.status,
  statusAt: r.status_at?.toISOString() ?? null,
  repliedAt: r.replied_at?.toISOString() ?? null,
  notifiedAt: r.notified_at?.toISOString() ?? null,
  notifyError: r.notify_error,
});

// Every real lead still held: the table is small (a 30-a-day cap, kept 365
// days). Synthetic leads from the monitoring check are left out.
export async function getLeads(): Promise<{ rows: LeadRow[]; stats: LeadStats }> {
  const { rows } = await pool.query<DbLead>(
    `SELECT id::text, created_at, name, email, purpose, project, note, drafted_by, edited,
            status, status_at, replied_at, notified_at, notify_error
       FROM leads
      WHERE NOT is_synthetic
      ORDER BY created_at DESC`,
  );
  const leads = rows.map(toRow);
  return { rows: leads, stats: leadStats(leads) };
}

// The first move off 'new' is her reply, and fixes the reply time.
export async function setLeadStatus(id: string, status: LeadStatus): Promise<void> {
  await pool.query(
    `UPDATE leads
        SET status = $2,
            status_at = NOW(),
            replied_at = CASE WHEN replied_at IS NULL AND $2 <> 'new' THEN NOW() ELSE replied_at END
      WHERE id = $1`,
    [id, status],
  );
}

// What lib/notify.ts notifyLead() did for a lead. notified_at and confirmed_at
// are set once and kept; notify_error holds the latest failure, or NULL.
export async function recordNotify(id: string, r: NotifyResult): Promise<void> {
  await pool.query(
    `UPDATE leads
        SET notified_at  = CASE WHEN $2 THEN COALESCE(notified_at, NOW()) ELSE notified_at END,
            confirmed_at = CASE WHEN $3 THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
            notify_error = $4
      WHERE id = $1`,
    [id, r.notified, r.confirmed, r.error],
  );
}

// For /api/health?deep=1 and the Checkly lead checks. `unnotified`: real leads
// still New whose email to Jordanne never went out, 10 minutes on. Moving one
// off New clears it, so it stops alerting once she has dealt with it.
export type LeadPipelineStats = {
  real24h: number;
  synthetic24h: number;
  syntheticNotified24h: number;
  unnotified: number;
};

export async function getLeadPipelineStats(): Promise<LeadPipelineStats> {
  const { rows } = await pool.query<LeadPipelineStats>(
    `SELECT COUNT(*) FILTER (WHERE NOT is_synthetic AND created_at > NOW() - INTERVAL '24 hours')::int AS "real24h",
            COUNT(*) FILTER (WHERE is_synthetic AND created_at > NOW() - INTERVAL '24 hours')::int     AS "synthetic24h",
            COUNT(*) FILTER (WHERE is_synthetic AND notified_at IS NOT NULL
                               AND created_at > NOW() - INTERVAL '24 hours')::int                      AS "syntheticNotified24h",
            COUNT(*) FILTER (WHERE NOT is_synthetic AND notified_at IS NULL AND status = 'new'
                               AND created_at < NOW() - INTERVAL '10 minutes')::int                    AS unnotified
       FROM leads`,
  );
  return rows[0];
}
