'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminLogin, adminLogout, isAdminAuthed } from '@/lib/auth';
import { setLeadStatus } from '@/lib/lead-store';
import { isLeadId, isLeadStatus } from '@/lib/leads';
import { claimLoginAttempt, currentIpHash, settleLoginAttempt } from '@/lib/admin-login-limit';

export async function loginAction(formData: FormData) {
  const ipHash = await currentIpHash();
  // Claimed and counted before the password, so a locked-out IP learns nothing
  // from guessing, and parallel guesses can't all slip under the limit.
  const claim = await claimLoginAttempt(ipHash);
  if (claim.locked) {
    redirect('/dashboard/admin?error=locked');
  }
  const password = String(formData.get('password') ?? '');
  const ok = await adminLogin(password);
  await settleLoginAttempt(claim, ok);
  if (!ok) {
    redirect('/dashboard/admin?error=1');
  }
  redirect('/dashboard/admin');
}

export async function logoutAction() {
  await adminLogout();
  redirect('/dashboard/admin');
}

// /dashboard/admin/leads: a lead's status. Checked here too, since a server
// action can be called without the page.
export async function setLeadStatusAction(formData: FormData) {
  if (!(await isAdminAuthed())) redirect('/dashboard/admin');
  const id = String(formData.get('id') ?? '');
  const status = formData.get('status');
  if (!isLeadId(id) || !isLeadStatus(status)) return;
  await setLeadStatus(id, status);
  revalidatePath('/dashboard/admin/leads');
}
