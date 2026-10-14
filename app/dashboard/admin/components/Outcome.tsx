import { FLAGGING_LABELS, labelsOf } from '@/lib/labels';
import type { EventRow } from '@/lib/queries';

// rate-limited / rejected / error / flagged / ok. "flagged" is an answered
// turn that carries a label, so a bad answer no longer shows a green "ok".
export function Outcome({ row }: { row: EventRow }) {
  const pill = (cls: string, text: string, title?: string) => (
    <span className={`rounded px-2 py-0.5 ${cls}`} title={title}>{text}</span>
  );
  if (row.rateLimited) return pill('bg-amber-500/15 text-amber-300', 'rate-limited');
  if (row.error?.startsWith('rejected:')) return pill('bg-red-500/15 text-red-300', 'rejected', row.error);
  if (row.error) return pill('bg-red-500/15 text-red-300', 'error', row.error);
  const flagged = labelsOf(row.flags).filter((k) => FLAGGING_LABELS.includes(k));
  if (flagged.length) return pill('bg-amber-500/15 text-amber-300', 'flagged', flagged.join(', '));
  return pill('bg-emerald-500/15 text-emerald-300', 'ok');
}
