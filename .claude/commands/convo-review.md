---
description: Weekly review of real jordbot conversations, written to nimbalyst-local/reviews/
---

Write this week's conversation review for jordannedyck.com.

## 1. Pull the export

Run this in PowerShell from the repo root. `MONITOR_TOKEN` must be set in the session first (the same value as the `app-observability` secret); never print it.

```powershell
New-Item -ItemType Directory -Force nimbalyst-local/reviews | Out-Null
$since = (Get-Date).ToUniversalTime().AddDays(-7).ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-RestMethod -Uri "https://www.jordannedyck.com/api/admin/export?since=$since" `
  -Headers @{ "x-monitor-token" = $env:MONITOR_TOKEN } |
  ConvertTo-Json -Depth 20 | Out-File -Encoding utf8 nimbalyst-local\reviews\export-latest.json
```

If the call returns 401, stop and say the token is missing or wrong. If it returns an error, stop and report it; do not write a review from partial data.

## 2. Read every conversation

Read the export in full. At this volume every conversation is read, not sampled. Each turn has an `id`; cite it for every claim below.

## 3. Write `nimbalyst-local/reviews/YYYY-MM-DD.md` (today's date)

Sections, in this order:

1. **Volume**: conversations, questions and spend (sum `costUsd` plus `flags.label_cost_usd`). Compare with the previous review in `nimbalyst-local/reviews/` if one exists.
2. **Themes**: group the questions by meaning, not by text. Name each theme, count it, list the row ids. Note where the free topic label (`topicTags`) disagrees with the meaning.
3. **Friction**, each with row ids:
   - `gap_declared` answers where the knowledge base returned a strong match (`topSimilarity` 0.8 or more).
   - Rephrased follow-ups (the next turn asks the same thing soon after).
   - Judge verdicts `partial` or `not_grounded`, with the judge's reason.
   - Slow turns (time to first token over 5 seconds), split into search time (`retrievalMs`) and model time.
   - Weak or empty retrieval: likely gaps in the knowledge base.
4. **Abuse**: injection, prompt leak, off-topic, moderation, personal details. Counts and row ids.
5. **Candidate eval cases**, in `eval_set.json` shape. Each one names the row id it came from and what the right answer must do.

## Rules

- Every claim cites a row id. No claim without one.
- Never edit `eval_set.json`, the prompt, the knowledge base or any code. This command only writes the review file. Jord decides what to act on.
- Quote questions and answers as stored. Emails and phone numbers were already redacted before storage; keep them redacted.
- Delete `nimbalyst-local\reviews\export-latest.json` when the review is written.
