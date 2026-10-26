import { COOKIE, MAX_AGE, createSession, safeEqual } from '../lib/session.js';

const back = (request, query) => new Response(null, {
  status: 303,
  headers: { Location: new URL('/login.html' + query, request.url).toString() },
});

export async function POST(request) {
  const { MB_USER, MB_PASSWORD, MB_SECRET } = process.env;
  if (!MB_USER || !MB_PASSWORD || !MB_SECRET) return back(request, '?error=config');

  const form = await request.formData();
  const user = String(form.get('user') || '').trim().toLowerCase();
  const pass = String(form.get('password') || '');
  const valid = safeEqual(user, MB_USER.trim().toLowerCase()) & safeEqual(pass, MB_PASSWORD);

  if (!valid) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos repetidos
    return back(request, '?error=1');
  }

  const token = await createSession(MB_SECRET);
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/', request.url).toString(),
      'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
    },
  });
}
