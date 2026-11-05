import type { EventRow } from '@/lib/queries';
import { TurnBadges, JudgeVerdict } from './Badges';
import { TurnDetails } from './TurnDetails';

// One question and its answer, as the conversation drill-down shows it.
export function Turn({ row }: { row: EventRow }) {
  const rejected = row.rateLimited || row.error?.startsWith('rejected:');
  return (
    <div id={`e${row.id}`} className="flex scroll-mt-6 flex-col gap-1">
      <div
        className={`max-w-[80%] self-end rounded-2xl px-4 py-2 text-sm ${
          rejected
            ? 'border border-dashed border-red-500/50 bg-red-500/10 text-red-300'
            : 'bg-blue-700 text-white'
        }`}
      >
        {row.query}
      </div>
      <div className="self-end text-[11px] text-zinc-500">
        <TurnBadges row={row} />
      </div>

      {rejected ? (
        <div className="mb-3 self-end text-[11px] text-red-300">
          turn {row.turnIndex ?? '—'} · {row.rateLimited ? 'rate-limited' : row.error}
        </div>
      ) : (
        <>
          <div className="max-w-[80%] self-start whitespace-pre-wrap rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200">
            {row.responseText ?? (row.error ? `[error: ${row.error}]` : '[no answer stored]')}
          </div>
          <div className="mb-3 self-start text-[11px] text-zinc-500">
            turn {row.turnIndex ?? '—'} · retrieval {row.retrievalStatus ?? '—'}
            {row.topSimilarity != null && ` ${row.topSimilarity.toFixed(2)}`}
            {row.retrievalMs != null && ` · search ${(row.retrievalMs / 1000).toFixed(2)} s`}
            {row.timeToFirstTokenMs != null && ` · first word ${(row.timeToFirstTokenMs / 1000).toFixed(1)} s`}
            {row.latencyMs != null && ` · total ${(row.latencyMs / 1000).toFixed(1)} s`}
            {row.costUsd != null && ` · $${row.costUsd.toFixed(4)}`}
            {' · '}
            <JudgeVerdict row={row} />
            {' · '}
            <span className="font-mono">
              prompt {row.promptVersion ?? '—'} · index {row.indexVersion ?? '—'}
            </span>
            <TurnDetails row={row} />
          </div>
        </>
      )}
    </div>
  );
}
