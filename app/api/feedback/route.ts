import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { redactPii } from '@/lib/classify';

export const dynamic = 'force-dynamic';

const MAX_NOTE_CHARS = 500;

// POST /api/feedback {id, vote: 'up'|'down', note?}
// Thumbs up/down under an answer (site-monitoring plan, Phase 2). Written to
// chat_events.flags.feedback. The row must belong to the caller's jb_sid
// session, so a guessed row id cannot rate someone else's answer. A later vote
// on the same row replaces the earlier one.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; vote?: unknown; note?: unknown }
    | null;
  const id = typeof body?.id === 'string' && /^\d{1,18}$/.test(body.id) ? body.id : null;
  const vote = body?.vote === 'up' || body?.vote === 'down' ? body.vote : null;
  if (!id || !vote) {
    return NextResponse.json({ error: 'id and vote are required' }, { status: 400 });
  }
  const rawNote = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_CHARS) : '';
  // Same rule as questions and answers: personal details are blanked before storage.
  const note = rawNote ? redactPii(rawNote).text : null;

  const sessionId = (await cookies()).get('jb_sid')?.value;
  if (!sessionId || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const feedback = { vote, note, at: new Date().toISOString() };
    const { rowCount } = await pool.query(
      `UPDATE chat_events SET flags = flags || jsonb_build_object('feedback', $3::JSONB)
        WHERE id = $1 AND session_id = $2 AND is_synthetic = FALSE`,
      [id, sessionId, JSON.stringify(feedback)],
    );
    if (!rowCount) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('feedback update failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
