import type { Health } from '@/lib/health';
import type { KeyStatus } from '@/lib/monitor';

// Live health, run when the page loads: the same checks as /api/health, which
// is already public, so this shows nothing new. The OpenAI key check is cached
// for 60 seconds (lib/monitor.ts), so a busy page cannot flood OpenAI.
export function HealthPanel({ health, checkedAt }: { health: Health; checkedAt: string }) {
  const keyText: Record<KeyStatus, string> = {
    ok: 'key ok · models available',
    auth_failed: 'key rejected',
    unreachable: 'OpenAI unreachable',
    model_missing: 'key ok · a model is missing',
  };
  const backendText = health.backend.ok
    ? `${health.backend.chunks ?? '?'} chunks loaded`
    : {
        no_health_endpoint: 'no health endpoint',
        unhealthy: 'unhealthy',
        unreachable: 'unreachable',
      }[health.backend.reason];
  const items: { name: string; ok: boolean; detail: string }[] = [
    { name: 'Database', ok: health.db, detail: health.db ? 'reachable' : 'unreachable' },
    { name: 'Knowledge base', ok: health.backend.ok, detail: backendText },
    { name: 'OpenAI (site)', ok: health.openai === 'ok', detail: keyText[health.openai] },
    {
      name: 'OpenAI (search)',
      ok: health.backend.openai === 'ok',
      detail: health.backend.openai ? keyText[health.backend.openai] : 'not reported',
    },
  ];
  return (
    <section
      aria-label="Live health"
      className="mb-8 grid grid-cols-2 items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-4 lg:grid-cols-[repeat(4,1fr)_auto]"
    >
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-3 text-sm text-zinc-200">
          <span
            className={`h-2.5 w-2.5 flex-none rounded-full ${
              it.ok ? 'bg-emerald-400 ring-4 ring-emerald-400/15' : 'bg-red-400 ring-4 ring-red-400/15'
            }`}
            aria-label={it.ok ? 'healthy' : 'unhealthy'}
          />
          <div>
            {it.name}
            <div className="text-xs text-zinc-500">{it.detail}</div>
          </div>
        </div>
      ))}
      <div className="col-span-2 text-xs text-zinc-500 lg:col-span-1 lg:text-right">
        checked {checkedAt} UTC
        <br />
        on page load
      </div>
    </section>
  );
}
