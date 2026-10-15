#!/usr/bin/env node
// Pulls weak or failed real visitor chats out of chat_events as candidate eval
// cases, for Jord to review. Never writes to the eval set: accepted candidates
// are added to jordannedyck-ai/eval_set.json by hand, in a backend session.
//
//   node scripts/eval-candidates.mjs pull [--days 30] [--eval-set PATH]
//     Free. Reads GET /api/admin/eval-candidates on the site at $SITE_URL
//     (default http://localhost:3000) with $MONITOR_TOKEN. The site's own
//     DATABASE_URL decides which chat_events is read: local, jordbot-dev or prod.
//     Drops questions already in the eval set (read only), then writes
//     candidates-<date>.json and .md to nimbalyst-local/eval-candidates/.
//
//   node scripts/eval-candidates.mjs evidence --file PATH --ids c01,c04
//     PAID: one embedding call per id on the backend. Ask Jord first.
//     Re-runs each accepted question against $BACKEND_URL/search (default
//     http://localhost:5000) and prints chunk id, similarity and full chunk text,
//     so expect lists are proposed from evidence, never filled in to pass.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'nimbalyst-local', 'eval-candidates');
const DEFAULT_EVAL_SET = resolve(ROOT, '..', 'jordannedyck-ai', 'eval_set.json');
// What the live site sends to the model (route.ts searchExperience).
const LIVE_N_RESULTS = 5;
const EVIDENCE_N_RESULTS = 10;

// Where each rule usually lands. Jord decides; this is a starting point.
const RULE_HINT = {
  gap_on_strong_match: 'G (tag domain, gap-inversion like G03): the KB had it and the answer declared a gap',
  weak_match: 'G (tag gap) if the KB truly lacks it, D (tag domain) if the content exists and did not surface',
  empty_retrieval: 'G (tag gap) if the KB truly lacks it, D (tag domain) if the content exists and did not surface',
  not_grounded: 'X (tag regression): the answer claimed what the chunks do not say',
  thumbs_down: 'read the answer; prefix depends on what went wrong',
  rephrased: 'read both wordings; prefix depends on what the first answer missed',
};

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

const norm = (s) => String(s).trim().toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);
const quote = (s) => (s ?? '(none)').split('\n').map((l) => `> ${l}`).join('\n');

function nextFreeIds(questions) {
  const max = {};
  for (const q of questions) {
    const m = /^([A-Z])(\d+)$/.exec(q.id ?? '');
    if (m) max[m[1]] = Math.max(max[m[1]] ?? 0, Number(m[2]));
  }
  return Object.fromEntries(
    Object.entries(max).map(([p, n]) => [p, `${p}${String(n + 1).padStart(2, '0')}`]),
  );
}

async function pull(opts) {
  const site = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const token = process.env.MONITOR_TOKEN;
  if (!token) throw new Error('MONITOR_TOKEN is not set. It must match the MONITOR_TOKEN the site runs with.');
  const days = Number(opts.days ?? 30);

  const evalPath = resolve(opts['eval-set'] ?? DEFAULT_EVAL_SET);
  const evalSet = JSON.parse(readFileSync(evalPath, 'utf8'));
  const questions = evalSet.questions ?? [];
  const known = new Map(questions.map((q) => [norm(q.q), q.id]));
  const nextIds = nextFreeIds(questions);

  const url = `${site}/api/admin/eval-candidates?days=${days}`;
  const res = await fetch(url, { headers: { 'x-monitor-token': token }, cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();

  const already = data.candidates.filter((c) => known.has(c.key));
  const fresh = data.candidates.filter((c) => !known.has(c.key));
  const candidates = fresh.map((c, i) => ({
    candidateId: `c${String(i + 1).padStart(2, '0')}`,
    decision: 'pending',
    ...c,
  }));

  const stamp = today();
  const source = { site, days: data.days, generatedAt: data.generatedAt, evalSet: evalPath, nextFreeIds: nextIds };
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `candidates-${stamp}.json`);
  const mdPath = join(OUT_DIR, `candidates-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify({ source, alreadyInEvalSet: already.map((c) => ({ question: c.question, id: known.get(c.key) })), candidates }, null, 2));

  const md = [
    `# Eval candidates, ${stamp}`,
    '',
    `Source: ${site}, last ${data.days} days, generated ${data.generatedAt}.`,
    `Eval set read: ${evalPath}. Next free ids: ${Object.values(nextIds).join(', ')}.`,
    `${data.candidates.length} questions matched a rule. ${already.length} are already in the eval set and were dropped. ${candidates.length} remain.`,
    '',
    'For each one, decide: **accept**, **reject**, or **rewrite** (strip personal details; make a follow-up stand alone).',
    'Nothing here enters eval_set.json without that decision. The eval set is in a public repo.',
    '',
  ];
  if (already.length) {
    md.push('## Already in the eval set', '');
    for (const c of already) md.push(`- ${known.get(c.key)}: "${c.question}"`);
    md.push('');
  }
  for (const c of candidates) {
    const l = c.latest;
    md.push(
      `## ${c.candidateId}: "${c.question}"`,
      '',
      `- Rules: ${c.rules.join(', ')}`,
      `- Asked ${c.count} time(s), ${c.firstSeen.slice(0, 10)} to ${c.lastSeen.slice(0, 10)}. Row ids: ${c.rowIds.join(', ')}. Button: ${c.isButton ? 'yes' : 'no'}. Turn: ${l.turnIndex ?? 'unknown'}.`,
      `- Logged retrieval (latest row ${l.id}): ${l.retrievalStatus}, top similarity ${l.topSimilarity?.toFixed(4) ?? 'none'}, chunks ${l.chunkIds?.join(', ') ?? 'none'}`,
      `- Prompt version ${l.promptVersion ?? 'unknown'}, index version ${l.indexVersion ?? 'unknown'}`,
      `- Labels: ${l.labels.join(', ') || 'none'}`,
    );
    if (l.judgeReason) md.push(`- Judge: ${l.judgeReason}`);
    if (l.feedbackNote) md.push(`- Visitor note: "${l.feedbackNote}"`);
    if (c.rephrasedAs.length) md.push(`- Asked next: ${c.rephrasedAs.map((q) => `"${q}"`).join('; ')}`);
    md.push(`- Usual prefix: ${c.rules.map((r) => RULE_HINT[r]).join(' / ')}`, '');
    if (c.priorTurns.length) {
      md.push('**Earlier in this conversation** (the question depends on these; reword it to stand alone or reject):', '');
      for (const t of c.priorTurns) md.push(`Q: ${t.query}`, '', quote(t.responseText), '');
    }
    md.push('**Answer given (latest):**', '', quote(l.responseText), '', 'Decision: pending', '', '---', '');
  }
  writeFileSync(mdPath, md.join('\n'));

  // Print the actual values, not a count.
  console.log(`Read ${url}`);
  console.log(`${data.candidates.length} matched, ${already.length} already in the eval set, ${candidates.length} candidates.\n`);
  for (const c of already) console.log(`  already ${known.get(c.key)}: ${c.question}`);
  for (const c of candidates) {
    const l = c.latest;
    console.log(`${c.candidateId}  [${c.rules.join(', ')}]  x${c.count}  turn ${l.turnIndex ?? '?'}`);
    console.log(`  Q: ${c.question}`);
    console.log(`  retrieval ${l.retrievalStatus}, top ${l.topSimilarity?.toFixed(4) ?? 'none'}, chunks ${l.chunkIds?.join(', ') ?? 'none'}`);
    console.log(`  A: ${(l.responseText ?? '(none)').replace(/\s+/g, ' ').slice(0, 400)}`);
    console.log('');
  }
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function evidence(opts) {
  if (!opts.file || !opts.ids) throw new Error('evidence needs --file <candidates json> and --ids c01,c04');
  const backend = (process.env.BACKEND_URL ?? 'http://localhost:5000').replace(/\/$/, '');
  const file = resolve(opts.file);
  const { candidates } = JSON.parse(readFileSync(file, 'utf8'));
  const ids = String(opts.ids).split(',').map((s) => s.trim());
  const picked = ids.map((id) => {
    const c = candidates.find((x) => x.candidateId === id);
    if (!c) throw new Error(`${id} is not in ${file}`);
    return c;
  });

  const out = [];
  const md = [`# Evidence, ${today()}`, '', `Backend: ${backend}/search, n_results ${EVIDENCE_N_RESULTS}. Ranks 1-${LIVE_N_RESULTS} are what the live site sends to the model.`, ''];
  for (const c of picked) {
    const res = await fetch(`${backend}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: c.question, n_results: EVIDENCE_N_RESULTS }),
    });
    if (!res.ok) throw new Error(`${backend}/search answered ${res.status} for ${c.candidateId}`);
    const data = await res.json();
    const results = (data.results ?? []).map((r, i) => ({
      rank: i + 1,
      chunkId: r.metadata?.chunk_id ?? null,
      filename: r.metadata?.filename ?? null,
      similarity: Math.round(r.similarity * 10000) / 10000,
      content: r.content,
    }));
    const logged = c.latest.indexVersion;
    const indexNote =
      logged == null || data.index_version == null
        ? `Index now ${data.index_version ?? 'unknown'}, logged ${logged ?? 'unknown'}: cannot tell whether the index changed.`
        : logged === data.index_version
          ? `Same index as the logged chat (${logged}).`
          : `INDEX CHANGED since the chat: logged ${logged}, now ${data.index_version}. The logged chunks may no longer rank the same.`;
    out.push({ candidateId: c.candidateId, question: c.question, indexVersion: data.index_version ?? null, indexNote, loggedChunkIds: c.latest.chunkIds, results });

    console.log(`${c.candidateId}: ${c.question}`);
    console.log(`  ${indexNote}`);
    console.log(`  logged chunks: ${c.latest.chunkIds?.join(', ') ?? 'none'}`);
    md.push(`## ${c.candidateId}: "${c.question}"`, '', indexNote, '', `Logged chunks: ${c.latest.chunkIds?.join(', ') ?? 'none'}`, '');
    for (const r of results) {
      const live = r.rank <= LIVE_N_RESULTS ? '' : ' (outside the live top 5)';
      console.log(`  ${r.rank}. ${r.chunkId}  ${r.similarity.toFixed(4)}  ${r.filename}${live}`);
      console.log(`     ${r.content.replace(/\s+/g, ' ')}`);
      md.push(`### ${r.rank}. ${r.chunkId}, ${r.similarity.toFixed(4)}, ${r.filename}${live}`, '', quote(r.content), '');
    }
    md.push('Proposed expect: (choose from the chunks above and quote the line that answers the question, or write "content gap: no chunk answers this")', '', '---', '');
    console.log('');
  }
  const base = file.replace(/\.json$/, '');
  writeFileSync(`${base}-evidence.json`, JSON.stringify(out, null, 2));
  writeFileSync(`${base}-evidence.md`, md.join('\n'));
  console.log(`Wrote ${base}-evidence.json`);
  console.log(`Wrote ${base}-evidence.md`);
}

const opts = args(process.argv.slice(2));
const cmd = opts._[0];
const run = cmd === 'pull' ? pull : cmd === 'evidence' ? evidence : null;
if (!run) {
  console.error('Usage: node scripts/eval-candidates.mjs pull [--days 30] [--eval-set PATH]');
  console.error('       node scripts/eval-candidates.mjs evidence --file PATH --ids c01,c04   (paid: ask Jord first)');
  process.exit(1);
}
run(opts).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
