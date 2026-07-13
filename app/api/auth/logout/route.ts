import { clearCookieHeader } from '@/lib/auth/session';

export async function POST() {
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearCookieHeader() },
  });
}
