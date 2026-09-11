import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'jb_admin';
const MAX_AGE = 60 * 60 * 12; // 12h

// HMAC the password with itself so the cookie can be verified without
// holding a session table. If DASHBOARD_ADMIN_PASSWORD rotates, all
// existing cookies become invalid automatically.
function sign(password: string): string {
  return createHmac('sha256', password).update('admin-ok').digest('hex');
}

function eq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function isAdminAuthed(): Promise<boolean> {
  const password = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!password) return false;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  return eq(token, sign(password));
}

export async function adminLogin(submitted: string): Promise<boolean> {
  const password = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!password) return false;
  if (!eq(submitted, password)) return false;
  const jar = await cookies();
  jar.set(COOKIE, sign(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: MAX_AGE,
    path: '/',
  });
  return true;
}

export async function adminLogout(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
