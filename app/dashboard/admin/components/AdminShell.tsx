import Link from 'next/link';
import { logoutAction } from '../actions';

// Header and tabs shared by the admin pages.
export function AdminShell({
  tab,
  children,
}: {
  tab: 'log' | 'insights' | null;
  children: React.ReactNode;
}) {
  const tabClass = (on: boolean) =>
    `border-b-2 px-4 py-2 text-sm ${
      on ? 'border-emerald-400 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
    }`;
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="mt-1 text-sm text-zinc-400">
              <Link href="/dashboard" className="underline">Back to public dashboard</Link>.
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </header>
        {tab && (
          <nav className="mb-6 flex gap-1 border-b border-zinc-800">
            <Link href="/dashboard/admin" className={tabClass(tab === 'log')}>Event log</Link>
            <Link href="/dashboard/admin/insights" className={tabClass(tab === 'insights')}>Insights</Link>
          </nav>
        )}
        {children}
      </div>
    </main>
  );
}
