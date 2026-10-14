'use server';

import { redirect } from 'next/navigation';
import { adminLogin, adminLogout } from '@/lib/auth';
import { currentIpHash, isLockedOut, recordLoginAttempt } from '@/lib/admin-login-limit';

export async function loginAction(formData: FormData) {
  const ipHash = await currentIpHash();
  // Checked before the password, so a locked-out IP learns nothing from guessing.
  if (await isLockedOut(ipHash)) {
    redirect('/dashboard/admin?error=locked');
  }
  const password = String(formData.get('password') ?? '');
  const ok = await adminLogin(password);
  await recordLoginAttempt(ipHash, ok);
  if (!ok) {
    redirect('/dashboard/admin?error=1');
  }
  redirect('/dashboard/admin');
}

export async function logoutAction() {
  await adminLogout();
  redirect('/dashboard/admin');
}
