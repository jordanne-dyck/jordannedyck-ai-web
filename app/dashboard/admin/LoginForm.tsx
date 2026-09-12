import { loginAction } from './actions';

export function LoginForm({ error }: { error: boolean }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24">
        <h1 className="text-2xl font-semibold">Admin login</h1>
        <p className="text-sm text-zinc-400">
          Enter the admin password to view per-event details.
        </p>
        <form action={loginAction} className="flex flex-col gap-3">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            placeholder="Password"
          />
          {error && (
            <p className="text-xs text-red-400">Incorrect password.</p>
          )}
          <button
            type="submit"
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
