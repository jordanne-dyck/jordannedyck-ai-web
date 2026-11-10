# Lead email (Mailgun): DNS and secrets

The concierge lead form (`app/api/lead`, `lib/notify.ts`) emails each lead to Jordanne and a
confirmation to the visitor through Mailgun, sending as `jordbot@jordannedyck.com`. Without a
working key, leads are still stored and show as not emailed in `/dashboard/admin/leads`.

Status 2026-11-10: dev has `MAIL_API_KEY` and `LEAD_NOTIFY_TO`, but Mailgun answers 401
(`scripts/lead-check.mjs`, lead id 6). The key in Doppler is not from the Mailgun account
that now owns `jordannedyck.com`.

## 1. DNS (Cloudflare)

Mailgun's records for `jordannedyck.com`, compared with public DNS on 2026-11-10 (`nslookup`
against 1.1.1.1):

| Type | Host | Value | Priority | Now in DNS | Change |
|---|---|---|---|---|---|
| TXT (SPF) | `jordannedyck.com` | `v=spf1 include:mailgun.org ~all` | | same | none |
| TXT (DKIM) | `pic._domainkey.jordannedyck.com` | see below | | **different key** (`...MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDMD6p...`) | **replace** |
| MX | `jordannedyck.com` | `mxa.mailgun.org` | 10 | priority 60 | set priority to 10 |
| MX | `jordannedyck.com` | `mxb.mailgun.org` | 10 | priority 60 | set priority to 10 |
| CNAME | `email.jordannedyck.com` | `mailgun.org` | | missing | **add** |

DKIM value (one line):

```
k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBM7jCc4J24eEvQIIeqC4ErP3TIEZ7III5AuOIOP1mW9EgRqlq7Lktu41pn35FCJWyqCZfwZGF8JZLDtSTexlD2wimpwaTTf+vQPLpiHBEM/ELrDy+ZqF426VC3Wb7Qyyk1kcHLGBzkFfm3EK4K0OO82XTEUOSuQD9e2wy4YSAeQIDAQAB
```

The existing DKIM key belongs to an earlier Mailgun setup. Replacing it is what lets the new
account sign mail for the domain. The MX records already point at Mailgun, so the priority
change does not move inbound mail anywhere new.

## 2. Doppler

- `MAIL_API_KEY`: the Mailgun API key in the shared 1Password. Replace the current value in
  the dev and prod configs; both sync into `app-observability`.
- `LEAD_NOTIFY_TO`: already set in dev. Check prod has it too.
- `MAIL_API_BASE`: only if the Mailgun account is in the EU region. Set it to
  `https://api.eu.mailgun.net`; the US default needs nothing.

A pod reads a changed secret only after it restarts.

## 3. Check

1. In Mailgun, the domain `jordannedyck.com` shows as verified.
2. Restart dev and run the lead check:

   ```bash
   oc -n jordbot-dev rollout restart deploy/jordannedyck-ai-web
   MONITOR_TOKEN=... node scripts/lead-check.mjs --base https://jordbot-dev-jordbot-dev.apps.ocp-centralis.nekohouse.ca
   ```

   It works when the output ends `OK: lead stored, both emails accepted by Mailgun`. The check
   uses Mailgun test mode, so nothing is delivered.
3. Jordanne sends one real lead from the dev site and receives it.

Prod gets the key when v1.17 rolls out. The lead form ships live in prod with v1.17 (#112), so
dev must pass step 2 first.
