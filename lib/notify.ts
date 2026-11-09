// Lead notifications (nimbalyst-local/plans/lead-notifications.md, decided
// 2026-11-09): each note a visitor sends is emailed to Jordanne, and the visitor
// gets a fixed confirmation. Sent through Mailgun's HTTP API, which already
// handles mail for jordannedyck.com. notifyLead() is the one entry point, so the
// planned central notification service can replace its inside later.
//
// Kept free of '@/' imports so scripts/notify.test.mjs can load it.

const PROD_SITE = 'https://jordannedyck.com';

export type MailConfig = {
  apiKey: string;
  domain: string;
  from: string;
  notifyTo: string;
  apiBase: string;
  siteUrl: string;
};

// Null while the key, domain or Jordanne's address is missing: leads are
// still stored, and are shown as not emailed in /dashboard/admin/leads.
export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const apiKey = env.MAIL_API_KEY?.trim();
  const domain = env.MAIL_DOMAIN?.trim();
  const notifyTo = env.LEAD_NOTIFY_TO?.trim();
  if (!apiKey || !domain || !notifyTo) return null;
  return {
    apiKey,
    domain,
    notifyTo,
    from: env.MAIL_FROM?.trim() || `jordbot <jordbot@${domain}>`,
    // EU accounts use https://api.eu.mailgun.net.
    apiBase: (env.MAIL_API_BASE?.trim() || 'https://api.mailgun.net').replace(/\/$/, ''),
    siteUrl: (env.SITE_URL?.trim() || PROD_SITE).replace(/\/$/, ''),
  };
}

export type LeadMail = {
  id: string;
  name: string;
  email: string;
  note: string;
  purposeLabel: string | null;
  project: string | null;
};

type Mail = { subject: string; text: string };

// To Jordanne. Leads from dev are marked so they're never mistaken for real ones.
export function leadNotification(lead: LeadMail, siteUrl: string): Mail {
  const tag = siteUrl === PROD_SITE ? '' : '[dev] ';
  const purpose = lead.purposeLabel ? ` (${lead.purposeLabel})` : '';
  return {
    subject: `${tag}New lead: ${lead.name}${purpose}`,
    text: [
      `${lead.name} <${lead.email}> sent you a note from ${siteUrl}.`,
      `Purpose: ${lead.purposeLabel ?? 'not given'}`,
      ...(lead.project ? [`Project: ${lead.project}`] : []),
      '',
      lead.note,
      '',
      '---',
      'Reply to this email to answer them directly.',
      `Then mark it Replied: ${siteUrl}/dashboard/admin/leads (lead ${lead.id})`,
    ].join('\n'),
  };
}

// To the visitor. Fixed text with nothing the visitor typed in it, so the
// form can't be used to send someone else an email of the sender's choosing.
// The reply time is lib/concierge.ts REPLY_TIME, passed in, so the email and
// the panel make the same promise.
export function leadConfirmation(replyTime: string): Mail {
  return {
    subject: 'Your note reached Jordanne',
    text: [
      `Thanks, your note reached Jordanne. ${replyTime}`,
      '',
      "You're getting this because someone sent a note from jordannedyck.com with this address. " +
        "If that wasn't you, ignore this email. Nothing else will be sent.",
    ].join('\n'),
  };
}

export type SendResult = { ok: true } | { ok: false; error: string };

// One message through Mailgun. testMode: Mailgun checks and accepts it but
// doesn't deliver it (the synthetic check). The error is a short code,
// safe to store and log: no addresses, no message text.
export async function sendMail(
  cfg: MailConfig,
  m: Mail & { to: string; replyTo?: string; testMode?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const form = new URLSearchParams({ from: cfg.from, to: m.to, subject: m.subject, text: m.text });
  if (m.replyTo) form.set('h:Reply-To', m.replyTo);
  if (m.testMode) form.set('o:testmode', 'yes');
  form.set('o:tracking', 'no');
  try {
    const res = await fetchImpl(`${cfg.apiBase}/v3/${encodeURIComponent(cfg.domain)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}` },
      body: form,
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `http_${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

export type NotifyResult = { notified: boolean; confirmed: boolean; error: string | null };

// Both emails. Never throws: the visitor's note is already stored, and a failed
// send is recorded on the lead instead (lib/lead-store.ts recordNotify).
export async function notifyLead(
  lead: LeadMail,
  opts: { replyTime: string; synthetic: boolean },
  cfg: MailConfig | null = mailConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<NotifyResult> {
  if (!cfg) return { notified: false, confirmed: false, error: 'not_configured' };
  // In parallel, so the visitor waits for one send at most (8s timeout).
  const [toHer, toThem] = await Promise.all([
    sendMail(
      cfg,
      { ...leadNotification(lead, cfg.siteUrl), to: cfg.notifyTo, replyTo: lead.email, testMode: opts.synthetic },
      fetchImpl,
    ),
    sendMail(cfg, { ...leadConfirmation(opts.replyTime), to: lead.email, testMode: opts.synthetic }, fetchImpl),
  ]);
  const errors = [!toHer.ok && `notify:${toHer.error}`, !toThem.ok && `confirm:${toThem.error}`].filter(Boolean);
  return { notified: toHer.ok, confirmed: toThem.ok, error: errors.length ? errors.join(' ') : null };
}
