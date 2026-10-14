import Link from 'next/link';
import type { EventRow } from '@/lib/queries';
import { JudgeVerdict } from './Badges';

// Collapsed by default so the table stays scannable. Rows logged before the
// monitoring columns existed show only what they have.
export function TurnDetails({ row, ipHref }: { row: EventRow; ipHref?: string }) {
  const flagKeys = Object.keys(row.flags);
  return (
    <details className="mt-1 max-w-2xl text-xs text-zinc-400">
      <summary className="cursor-pointer select-none text-zinc-500 hover:text-zinc-300">
        details
      </summary>
      <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-zinc-500">Row id</dt>
        <dd className="font-mono">{row.id}</dd>
        <dt className="text-zinc-500">Session</dt>
        <dd className="font-mono">{row.sessionId}</dd>
        <dt className="text-zinc-500">IP hash</dt>
        <dd className="font-mono">
          {ipHref ? (
            <Link href={ipHref} className="hover:underline">
              {row.ipHash.slice(0, 12)}… (filter)
            </Link>
          ) : (
            `${row.ipHash.slice(0, 12)}…`
          )}
        </dd>
        <dt className="text-zinc-500">Source</dt>
        <dd>{row.isButton ? 'button' : 'typed or unknown'}</dd>
        <dt className="text-zinc-500">Retrieval</dt>
        <dd>
          {row.retrievalStatus ?? '—'}
          {row.topSimilarity != null && ` (top similarity ${row.topSimilarity.toFixed(4)})`}
          {row.retrievalMs != null && `, ${row.retrievalMs} ms`}
        </dd>
        <dt className="text-zinc-500">Chunk ids</dt>
        <dd className="font-mono break-all">{row.chunkIds?.length ? row.chunkIds.join(', ') : '—'}</dd>
        <dt className="text-zinc-500">Judge</dt>
        <dd>
          <JudgeVerdict row={row} />
          {(row.flags.judge as { reason?: string } | undefined)?.reason &&
            `: ${(row.flags.judge as { reason: string }).reason}`}
        </dd>
        <dt className="text-zinc-500">Versions</dt>
        <dd className="font-mono">
          prompt {row.promptVersion ?? '—'} · index {row.indexVersion ?? '—'}
        </dd>
        <dt className="text-zinc-500">Flags</dt>
        <dd className="font-mono break-all">{flagKeys.length ? JSON.stringify(row.flags) : '—'}</dd>
        {row.error && (
          <>
            <dt className="text-zinc-500">Error</dt>
            <dd className="break-all text-red-300">{row.error}</dd>
          </>
        )}
        <dt className="text-zinc-500">Response</dt>
        <dd className="whitespace-pre-wrap text-zinc-300">{row.responseText ?? '—'}</dd>
      </dl>
    </details>
  );
}
