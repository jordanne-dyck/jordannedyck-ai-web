import { LABEL_BY_KEY, labelsOf } from '@/lib/labels';
import type { EventRow } from '@/lib/queries';

const tone = {
  abuse: 'bg-red-500/15 text-red-300',
  quality: 'bg-amber-500/10 text-amber-300',
  positive: 'bg-emerald-500/15 text-emerald-300',
  button: 'bg-sky-500/15 text-sky-300',
  topic: 'bg-violet-500/15 text-violet-300',
  pending: 'bg-zinc-800 text-zinc-400',
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`mr-1 mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${className}`}>{children}</span>;
}

// Source, topic and every label on a turn.
export function TurnBadges({ row, showSource = true }: { row: EventRow; showSource?: boolean }) {
  const labels = labelsOf(row.flags);
  return (
    <>
      {showSource && row.isButton && <Badge className={tone.button}>button</Badge>}
      {row.topicTags?.[0] && <Badge className={tone.topic}>{row.topicTags[0]}</Badge>}
      {labels.map((k) => (
        <Badge key={k} className={tone[LABEL_BY_KEY[k].kind]}>
          {LABEL_BY_KEY[k].name.toLowerCase()}
        </Badge>
      ))}
    </>
  );
}

// Judge verdict, or a note that the paid labels have not landed yet.
export function JudgeVerdict({ row }: { row: EventRow }) {
  const judge = row.flags.judge as { verdict?: string; reason?: string } | undefined;
  if (!judge?.verdict) {
    return row.responseText ? <span className="text-zinc-500">judge pending</span> : null;
  }
  const text: Record<string, [string, string]> = {
    grounded: ['✓ grounded', 'text-emerald-300'],
    partial: ['~ partly grounded', 'text-amber-300'],
    not_grounded: ['✗ not grounded', 'text-red-300'],
    skipped: ['judge skipped: no chunks', 'text-zinc-500'],
  };
  const [label, cls] = text[judge.verdict] ?? [judge.verdict, 'text-zinc-400'];
  return <span className={cls} title={judge.reason}>{label}</span>;
}
