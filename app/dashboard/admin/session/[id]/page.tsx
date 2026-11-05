import Link from 'next/link';
import { isAdminAuthed } from '@/lib/auth';
import { getSessionEvents, splitConversations } from '@/lib/queries';
import { LoginForm } from '../../LoginForm';
import { AdminShell } from '../../components/AdminShell';
import { Turn } from '../../components/Turn';

export const dynamic = 'force-dynamic';

// One session read as conversations. A session id lives 30 days, so a
// returning visitor's visits are split into separate conversations (tabs).
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string; row?: string }>;
}) {
  if (!(await isAdminAuthed())) {
    return <LoginForm error={null} />;
  }
  const { id } = await params;
  const sessionId = decodeURIComponent(id);
  const sp = await searchParams;

  const rows = await getSessionEvents(sessionId);
  if (rows.length === 0) {
    return (
      <AdminShell tab={null}>
        <p className="text-sm text-zinc-400">
          No rows for session <span className="font-mono">{sessionId}</span>.{' '}
          <Link href="/dashboard/admin" className="underline">Back to the event log</Link>.
        </p>
      </AdminShell>
    );
  }

  const conversations = splitConversations(rows);
  // ?row= opens the conversation holding that turn (links from the event log);
  // otherwise ?c=, defaulting to the latest conversation.
  const withRow = sp.row
    ? conversations.find((c) => c.turns.some((t) => t.id === sp.row))?.index
    : undefined;
  const chosen = Math.min(
    Math.max(1, withRow ?? (Number(sp.c) || conversations.length)),
    conversations.length,
  );
  const convo = conversations[chosen - 1];
  const cost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const first = rows[0];

  return (
    <AdminShell tab={null}>
      <div className="mb-2 text-sm">
        <Link href="/dashboard/admin" className="text-zinc-400 underline">← Event log</Link>
      </div>
      <h2 className="text-xl font-semibold">Conversation</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-zinc-400 sm:grid-cols-4">
        <Meta label="Session"><span className="font-mono">{sessionId.slice(0, 18)}…</span></Meta>
        <Meta label="First seen">{fmtTime(first.createdAt)}</Meta>
        <Meta label="Turns / cost">{rows.length} turns · ${cost.toFixed(4)}</Meta>
        <Meta label="Device">{describeAgent(first.userAgent)}</Meta>
      </dl>

      <nav className="mt-4 flex flex-wrap gap-1 border-b border-zinc-800">
        {conversations.map((c) => (
          <Link
            key={c.index}
            href={`?c=${c.index}`}
            className={`border-b-2 px-3 py-2 text-xs ${
              c.index === chosen
                ? 'border-emerald-400 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Conversation {c.index} · {c.startedAt.slice(5, 10)} · {c.turns.length}{' '}
            {c.turns.length === 1 ? 'turn' : 'turns'}
          </Link>
        ))}
      </nav>

      <div className="mt-5 flex max-w-3xl flex-col gap-2">
        {convo.turns.map((t) => (
          <Turn key={t.id} row={t} />
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-xs text-zinc-500">
        Shows the turns the server logged: each question and the stored answer. It does not show
        the history the browser sent, so a fabricated history is not visible here. Emails and phone
        numbers were replaced before storage.
      </p>
    </AdminShell>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function fmtTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}

// Coarse browser and OS from the user agent, for orientation only.
function describeAgent(ua: string | null): string {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'other';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'other';
  return `${browser} · ${os}`;
}
