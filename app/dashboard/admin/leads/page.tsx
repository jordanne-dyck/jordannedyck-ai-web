import { isAdminAuthed } from '@/lib/auth';
import { getLeads } from '@/lib/lead-store';
import { LEAD_RETENTION_DAYS } from '@/lib/leads';
import { LoginForm } from '../LoginForm';
import { AdminShell } from '../components/AdminShell';
import { LeadsView } from '../components/LeadsView';
import { setLeadStatusAction } from '../actions';

export const dynamic = 'force-dynamic';

// Notes visitors sent from the "Talk to the human" panel (lib/leads.ts).
// Moving a lead off New records her reply time.
export default async function LeadsPage() {
  if (!(await isAdminAuthed())) {
    return <LoginForm error={null} />;
  }
  const { rows, stats } = await getLeads();
  return (
    <AdminShell tab="leads">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Concierge pilot: notes sent to you</h2>
      <LeadsView rows={rows} stats={stats} setStatus={setLeadStatusAction} />
      <p className="mt-2 text-xs text-zinc-500">
        Reply from your own email, then mark the lead Replied. The first move off New sets the reply
        time. Leads are deleted after {LEAD_RETENTION_DAYS} days by the retention job, as the form
        tells visitors.
      </p>
    </AdminShell>
  );
}
