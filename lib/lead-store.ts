import { pool } from './db';
import { leadStats, overLeadLimit, type LeadInput, type LeadRow, type LeadStats, type LeadStatus } from './leads';

// Database side of the concierge leads (lib/leads.ts, db/schema.sql `leads`).

export type InsertLeadResult = { ok: true; id: string } | { ok: false; limit: 'visitor' | 'email' | 'site' };

// Counts and insert in one transaction, under an advisory lock, so two
// requests at once can't both slip under a limit.
export async function insertLead(lead: LeadInput, ipHash: string): Promise<InsertLeadResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('leads_insert'))");
    const { rows } = await client.query<{ visitor: number; email: number; site: number }>(
      `SELECT COUNT(*) FILTER (WHERE ip_hash = $1)::int AS visitor,
              COUNT(*) FILTER (WHERE email = $2)::int   AS email,
              COUNT(*)::int                             AS site
         FROM leads
        WHERE created_at > NOW() - INTERVAL '24 hours'`,
      [ipHash, lead.email],
    );
    const limit = overLeadLimit(rows[0] ?? { visitor: 0, email: 0, site: 0 });
    if (limit) {
      await client.query('ROLLBACK');
      return { ok: false, limit };
    }
    const ins = await client.query<{ id: string }>(
      `INSERT INTO leads (name, email, purpose, project, note, drafted_by, edited, consent_at, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
       RETURNING id::text`,
      [lead.name, lead.email, lead.purpose, lead.project, lead.note, lead.draftedBy, lead.edited, ipHash],
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
});

// Every lead still held: the table is small (a 30-a-day cap, kept 365 days).
export async function getLeads(): Promise<{ rows: LeadRow[]; stats: LeadStats }> {
  const { rows } = await pool.query<DbLead>(
    `SELECT id::text, created_at, name, email, purpose, project, note, drafted_by, edited,
            status, status_at, replied_at
       FROM leads
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
