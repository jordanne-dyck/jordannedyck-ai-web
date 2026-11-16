import Link from 'next/link';
import { cookies } from 'next/headers';
import { isAdminAuthed } from '@/lib/auth';
import { getTrafficReport } from '@/lib/traffic';
import { trafficInsights } from '@/lib/traffic-insights';
import { OWNER_COOKIE } from '@/lib/visit';
import { LoginForm } from '../LoginForm';
import { AdminShell } from '../components/AdminShell';
import { TrafficView } from '../../components/TrafficView';
import { setOwnerAction } from '../actions';

export const dynamic = 'force-dynamic';

const RANGES = { '7d': 7, '30d': 30, '90d': 90 } as const;
type Range = keyof typeof RANGES;

// Visits, the bot's reach, curated answers, ratings, conversions and paths
// (lib/traffic-report.ts), over a range and against the range before it.
export default async function TrafficPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  if (!(await isAdminAuthed())) return <LoginForm error={null} />;
  const sp = await searchParams;
  const range: Range = sp.range && Object.hasOwn(RANGES, sp.range) ? (sp.range as Range) : '30d';
  const result = await getTrafficReport(RANGES[range]);
  const excluded = (await cookies()).get(OWNER_COOKIE)?.value === '1';

  return (
    <AdminShell tab="traffic">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Range:</span>
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <Link
              key={r}
              href={`?range=${r}`}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                r === range ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              {r}
            </Link>
          ))}
        </div>
        <form action={setOwnerAction} className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="hidden" name="exclude" value={excluded ? '0' : '1'} />
          <span>{excluded ? 'This browser is left out of the counts.' : 'This browser is counted as a visitor.'}</span>
          <button type="submit" className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-900">
            {excluded ? 'Count it again' : 'Leave this browser out'}
          </button>
        </form>
      </div>
      {'error' in result ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{result.error}</p>
      ) : (
        <TrafficView report={result.report} insights={trafficInsights(result.report)} />
      )}
    </AdminShell>
  );
}
