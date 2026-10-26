import { COOKIE } from '../lib/session.js';

export function GET(request) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/login.html', request.url).toString(),
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
