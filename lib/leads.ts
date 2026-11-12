// The concierge pilot, phase 2 (nimbalyst-local/plans/concierge-pilot.md,
// decided 2026-11-07): the note a visitor sends from the "Talk to the human"
// panel is stored as a lead in its own table (db/schema.sql `leads`), for
// Jordanne to reply to and track in /dashboard/admin/leads.
//
// Kept free of '@/' imports so scripts/leads.test.mjs can load it.

// Shown above the Send button. Pressing Send is the consent: no checkbox
// (decided 2026-11-07). The period matches k8s/prod/retention-cronjob.yaml.
export const LEAD_RETENTION_DAYS = 365;
export const LEAD_CONSENT =
  'Jordanne uses your name, email and note only to reply to you. Kept for 1 year, then deleted. Never shared.';

export const LEAD_STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'replied', label: 'Replied' },
  { id: 'conversation', label: 'In conversation' },
  { id: 'closed', label: 'Closed' },
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number]['id'];

export function isLeadStatus(s: unknown): s is LeadStatus {
  return LEAD_STATUSES.some((x) => x.id === s);
}

// A leads.id (BIGSERIAL), as sent by the admin status buttons.
export function isLeadId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{1,18}$/.test(id);
}

// Abuse limits for /api/lead. The per-visitor limit keys on the IP hash,
// which a client can dodge by setting x-forwarded-for until the environment
// sets TRUSTED_PROXY_HOPS or CLIENT_IP_HEADER (lib/ip.ts), so the
// site-wide cap is what actually bounds the table.
export const LEADS_PER_VISITOR_PER_DAY = 3;
export const LEADS_PER_EMAIL_PER_DAY = 3;
export const LEADS_SITE_PER_DAY = 30;

// The panel's message for a 429 from /api/lead, naming whose limit it is.
// Unknown or missing: the general one.
export function leadLimitMessage(limit: unknown): string {
  if (limit === 'visitor') {
    return `You've sent ${LEADS_PER_VISITOR_PER_DAY} notes in the last 24 hours, the most allowed. Please send this one by email.`;
  }
  if (limit === 'email') {
    return `${LEADS_PER_EMAIL_PER_DAY} notes have come from this email address in the last 24 hours, the most allowed. Please send this one by email.`;
  }
  if (limit === 'site') {
    return `The site has taken its ${LEADS_SITE_PER_DAY} notes for today. Please send yours by email.`;
  }
  return 'Too many notes have been sent in the last 24 hours. Please send it by email instead.';
}

const MAX_NAME = 100;
const MAX_EMAIL = 254;
export const MAX_NOTE = 4000;
const MIN_NOTE = 10;

// Deliberately loose: one @, a dot in the domain, no spaces. Jordanne replies
// by hand, so a typo she can read beats a strict check that refuses a real address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LeadInput = {
  name: string;
  email: string;
  note: string;
  // Shape-checked only: the route keeps it only if it is a lib/concierge.ts PURPOSES id.
  purpose: string | null;
  project: string | null;
  draftedBy: 'ai' | 'template' | 'blank' | null;
  edited: boolean;
};

// `website` is a field hidden from people: a bot that fills every input fills
// it too. Such a request is reported as `trap`, so the route can answer as if
// it succeeded and store nothing.
export function parseLeadInput(
  body: unknown,
): { ok: true; lead: LeadInput } | { ok: false; reason: string; trap?: true } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website.trim()) return { ok: false, reason: 'trap', trap: true };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const name = str(b.name).replace(/\s+/g, ' ');
  const email = str(b.email).toLowerCase();
  const note = str(b.note).replace(/\r\n/g, '\n');
  if (!name) return { ok: false, reason: 'name is required' };
  if (name.length > MAX_NAME) return { ok: false, reason: 'name too long' };
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return { ok: false, reason: 'email is not valid' };
  if (note.length < MIN_NOTE) return { ok: false, reason: 'note is too short' };
  if (note.length > MAX_NOTE) return { ok: false, reason: 'note too long' };
  const project = typeof b.project === 'string' && /^[a-z0-9-]{1,60}$/.test(b.project) ? b.project : null;
  const draftedBy = b.draftedBy === 'ai' || b.draftedBy === 'template' || b.draftedBy === 'blank' ? b.draftedBy : null;
  return {
    ok: true,
    lead: { name, email, note, purpose: typeof b.purpose === 'string' && /^[a-z]{1,20}$/.test(b.purpose) ? b.purpose : null, project, draftedBy, edited: b.edited === true },
  };
}

// Which limit, if any, a new lead would cross, given the counts of the last 24 hours.
export function overLeadLimit(c: { visitor: number; email: number; site: number }): 'visitor' | 'email' | 'site' | null {
  if (c.site >= LEADS_SITE_PER_DAY) return 'site';
  if (c.visitor >= LEADS_PER_VISITOR_PER_DAY) return 'visitor';
  if (c.email >= LEADS_PER_EMAIL_PER_DAY) return 'email';
  return null;
}

// The pilot's numbers: leads in, how many she replied to, the median hours
// to her first reply, and the share that became a conversation.
export type LeadRow = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  purpose: string | null;
  project: string | null;
  note: string;
  draftedBy: string | null;
  edited: boolean;
  status: LeadStatus;
  statusAt: string | null;
  repliedAt: string | null;
  // When the email to Jordanne went out (lib/notify.ts), and the latest send error.
  notifiedAt: string | null;
  notifyError: string | null;
};

export type LeadStats = { total: number; replied: number; medianReplyHours: number | null; conversations: number };

export function leadStats(rows: Pick<LeadRow, 'createdAt' | 'repliedAt' | 'status'>[]): LeadStats {
  const hours = rows
    .filter((r) => r.repliedAt)
    .map((r) => (Date.parse(r.repliedAt!) - Date.parse(r.createdAt)) / 3_600_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const median = hours.length === 0 ? null : hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
  return {
    total: rows.length,
    replied: hours.length,
    medianReplyHours: median === null ? null : Math.round(median * 10) / 10,
    conversations: rows.filter((r) => r.status === 'conversation').length,
  };
}
