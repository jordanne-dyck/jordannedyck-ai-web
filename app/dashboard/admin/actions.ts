'use server';

import { redirect } from 'next/navigation';
import { adminLogin, adminLogout } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const ok = await adminLogin(password);
  if (!ok) {
    redirect('/dashboard/admin?error=1');
  }
  redirect('/dashboard/admin');
}

export async function logoutAction() {
  await adminLogout();
  redirect('/dashboard/admin');
}
