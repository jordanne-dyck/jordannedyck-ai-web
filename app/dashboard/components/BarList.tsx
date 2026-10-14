// Horizontal bars for a short ranked list (button questions).
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="grid grid-cols-[minmax(0,16rem)_1fr_2rem] items-center gap-3 text-xs text-zinc-300"
        >
          <span className="truncate" title={it.label}>{it.label}</span>
          <span className="h-2.5 overflow-hidden rounded bg-zinc-800">
            <span className="block h-full bg-emerald-400" style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <span className="text-right text-zinc-400">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
