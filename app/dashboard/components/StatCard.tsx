export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-500/40 bg-emerald-500/5'
      : tone === 'warn'
      ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-zinc-700 bg-zinc-900/40';

  return (
    <div className={`rounded-xl border ${toneClass} px-5 py-4`}>
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-zinc-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
