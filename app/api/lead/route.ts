import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/ip';
import { purposeOf, REPLY_TIME } from '@/lib/concierge';
import { parseLeadInput } from '@/lib/leads';
import { insertLead, recordNotify } from '@/lib/lead-store';
import { isMonitorRequest } from '@/lib/monitor';
import { notifyLead, type NotifyResult } from '@/lib/notify';
import { projectBySlug } from '@/lib/projects';

export const dynamic = 'force-dynamic';

// The concierge pilot, phase 2 (lib/leads.ts). GET says whether the "Send to
// Jordanne" form is on; POST {name, email, note, purpose?, project?,
// draftedBy?, edited?, website?} stores the visitor's note as a lead.
//
// Off unless LEADS_ENABLED=1. Prod stays off until its retention CronJob
// deletes leads after the 365 days the consent wording promises
// (nimbalyst-local/plans/concierge-pilot.md). Nothing here logs the name,
// email or note.
//
// Each stored lead is emailed to Jordanne, and the visitor gets a fixed
// confirmation (lib/notify.ts). A failed send never fails the visitor's
// request: the lead is stored, the failure is recorded on it, and
// /api/health?deep=1 counts it as unnotified.
//
// With x-monitor-token (the Checkly lead check, scripts/lead-check.mjs) the
// lead is stored as synthetic, skips the limits, both emails go in Mailgun
// test mode (accepted, not delivered), and the response says what happened.

const enabled = () => process.env.LEADS_ENABLED === '1' && Boolean(process.env.DATABASE_URL);

export async function GET() {
  return NextResponse.json({ enabled: enabled() });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: 'not available' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const input = parseLeadInput(body);
  // The bot trap answers like a success, so a bot learns nothing.
  if (!input.ok && input.trap) return NextResponse.json({ ok: true });
  if (!input.ok) return NextResponse.json({ error: input.reason }, { status: 400 });

  const lead = {
    ...input.lead,
    purpose: purposeOf(input.lead.purpose)?.id ?? null,
    project: input.lead.project && projectBySlug(input.lead.project) ? input.lead.project : null,
  };

  const synthetic = isMonitorRequest(req);
  let id: string;
  try {
    const result = await insertLead(lead, hashIp(getClientIp(req)), { synthetic });
    if (!result.ok) {
      console.warn('Lead refused: limit', result.limit);
      // Which limit, so the panel can say whose it is (lib/leads.ts).
      return NextResponse.json({ error: 'rate limited', limit: result.limit }, { status: 429 });
    }
    id = result.id;
  } catch (err) {
    console.error('Lead insert failed:', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  let sent: NotifyResult = { notified: false, confirmed: false, error: 'record_failed' };
  try {
    sent = await notifyLead(
      { id, name: lead.name, email: lead.email, note: lead.note, purposeLabel: purposeOf(lead.purpose)?.label ?? null, project: lead.project },
      { replyTime: REPLY_TIME, synthetic },
    );
    await recordNotify(id, sent);
    if (sent.error) console.error('Lead notify failed:', id, sent.error);
  } catch (err) {
    console.error('Lead notify record failed:', id, err instanceof Error ? err.name : 'unknown');
  }

  if (synthetic) return NextResponse.json({ ok: true, id, ...sent });
  return NextResponse.json({ ok: true });
}
