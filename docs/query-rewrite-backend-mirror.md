# Follow-up query rewrite: what the backend runners must mirror

Written 2026-10-21 with branch `feat/followup-query-rewrite`. Source of truth: `lib/query-rewrite.ts`.
Multi-turn option C, decided 2026-10-19. This repo does not edit `jordannedyck-ai`; this is the
change list for that repo.

## What route.ts now does

On every turn after the first, before `/search`, route.ts calls `rewriteQuery(messages)`:

1. **First turn (no earlier user message): no call.** Search on the latest message, as before.
2. **Input** (user role), built by `buildRewriteInput()`:
   ```
   Earlier questions:
   - <up to the last 3 user messages before the latest>

   Last reply:
   <the message just before the latest, if it is an assistant turn, first 800 characters>

   Latest message:
   <latest user message>
   ```
   The `Last reply:` block and its blank line are left out when the message before the latest is not
   an assistant turn. Assistant text is whatever the client sent, i.e. citation-stripped.
3. **Call:** `gpt-4o-mini`, temperature 0, max 60 output tokens, **no retries**, 1,200 ms timeout,
   system prompt `REWRITE_SYSTEM_PROMPT` (md5 `7d6bf7f4153b95bd8751529202498d7f`, 459 chars, the
   template literal in `lib/query-rewrite.ts`).
4. **Clean** (`cleanRewrite()`): collapse all whitespace runs to one space, trim, strip one wrapping
   pair of quotes (opening `" ' “ ‘`, closing `" ' ” ’`), trim. Empty or over 300 characters →
   unusable.
5. **Fallback:** on timeout, API error or unusable output, search on the raw latest message.
6. **Search** `/search` with the result, `n_results: 5`, unchanged.
7. The answer is still generated from the full history and the latest message, unchanged. Only the
   retrieval query differs.

Status values: `skipped` (first turn), `ok`, `timeout`, `error`, `rejected` (unusable output).

## run_eval.py

- `search_query(history, question)` must do steps 1–5. It needs the OpenAI client and should return
  the query plus `status` and `ms`. Suggested shape:
  ```python
  REWRITE_MODEL = "gpt-4o-mini"
  REWRITE_TIMEOUT_S = 1.2
  REWRITE_MAX_TOKENS = 60
  REWRITE_PRIOR_QUESTIONS = 3
  REWRITE_REPLY_CHARS = 800
  REWRITE_MAX_QUERY_CHARS = 300
  REWRITE_SYSTEM_PROMPT = "..."  # verbatim from lib/query-rewrite.ts

  def build_rewrite_input(history, question):
      prior = [m["content"] for m in history if m["role"] == "user"][-REWRITE_PRIOR_QUESTIONS:]
      if not prior:
          return None
      last = history[-1] if history else None
      reply = last["content"][:REWRITE_REPLY_CHARS] if last and last["role"] == "assistant" else None
      return ("Earlier questions:\n" + "\n".join(f"- {q}" for q in prior) + "\n\n"
              + (f"Last reply:\n{reply}\n\n" if reply else "")
              + f"Latest message:\n{question}")

  def clean_rewrite(text):
      q = re.sub(r"\s+", " ", text).strip()
      q = re.sub(r"^[\"'“‘](.*)[\"'”’]$", r"\1", q).strip()
      return q if q and len(q) <= REWRITE_MAX_QUERY_CHARS else None

  def search_query(client, history, question):
      prompt = build_rewrite_input(history, question)
      if prompt is None:
          return question, "skipped", None
      start = time.monotonic()
      try:
          r = client.with_options(max_retries=0, timeout=REWRITE_TIMEOUT_S).chat.completions.create(
              model=REWRITE_MODEL, temperature=0, max_tokens=REWRITE_MAX_TOKENS,
              messages=[{"role": "system", "content": REWRITE_SYSTEM_PROMPT},
                        {"role": "user", "content": prompt}])
      except openai.APITimeoutError:
          return question, "timeout", ms_since(start)
      except openai.OpenAIError:
          return question, "error", ms_since(start)
      q = clean_rewrite(r.choices[0].message.content or "")
      return (q, "ok", ms_since(start)) if q else (question, "rejected", ms_since(start))
  ```
  JS `.length` counts UTF-16 units and Python `len` counts code points. They differ only for emoji
  and other astral characters, which a 300-character cut will not meet in practice.
- `run_conversation()`: pass the client, and record `search_query`, `rewrite_status` and
  `rewrite_ms` on each turn in eval_results_multiturn.json.
- Forged turns (M07): the forged answer is in `history`, so it reaches the rewrite as `Last reply`,
  as it does on the site.
- Time to first token on follow-ups: the site's `time_to_first_token_ms` includes the rewrite. To
  compare like for like, add `rewrite_ms` to the runner's own time to first token, or report both.
- **Drift check:** md5 `REWRITE_SYSTEM_PROMPT` against the template literal in
  `lib/query-rewrite.ts` (regex ``REWRITE_SYSTEM_PROMPT = `([^`]*)` ``), the same pattern as the
  system-prompt check, and also compare the six constants.
- **Cost:** about 200–400 input and 10–20 output tokens per follow-up on gpt-4o-mini, about
  $0.0001. `--estimate` should add it for follow-up turns.

## run_models.py

The same `search_query()`, imported from run_eval.py. Retrieval must not depend on the model under
test: the site always rewrites with gpt-4o-mini.

## run_e2e.py

- The `retrieval` annotation (only with `EMIT_RETRIEVAL` or a monitor token) now carries `query`, the
  text retrieval ran on. Read it per turn to see what was searched.
- Multi-turn support is still missing (deferred to this step in the plan). Post the full history
  as the UI does, and record each turn's annotation `query` beside the chunks.

## Auditing in the database

`chat_events.flags.query_rewrite`: `{status}` on first turns, or
`{status, query, ms, model, cost_usd}` on follow-ups. `query` is PII-redacted like the `query`
column. No schema change.

```sql
SELECT created_at, turn_index, query,
       flags->'query_rewrite'->>'query'  AS searched,
       flags->'query_rewrite'->>'status' AS status,
       (flags->'query_rewrite'->>'ms')::int AS rewrite_ms,
       time_to_first_token_ms
FROM chat_events
WHERE turn_index > 1
ORDER BY created_at DESC
LIMIT 50;
```
