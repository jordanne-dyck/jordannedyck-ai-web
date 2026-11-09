import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/ip';
import { purposeOf } from '@/lib/concierge';
import { parseLeadInput } from '@/lib/leads';
import { insertLead } from '@/lib/lead-store';
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
// Jordanne isn't notified yet: a central notification service is planned in
// its own session. Until it exists, leads wait in /dashboard/admin/leads.

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

  try {
    const result = await insertLead(lead, hashIp(getClientIp(req)));
    if (!result.ok) {
      console.warn('Lead refused: limit', result.limit);
      // Which limit, so the panel can say whose it is (lib/leads.ts).
      return NextResponse.json({ error: 'rate limited', limit: result.limit }, { status: 429 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Lead insert failed:', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
