// Vercel Routing Middleware: nada de la app se sirve sin una sesión válida.
import { next } from '@vercel/functions';
import { readCookie, verifySession } from './lib/session.js';

export const config = {
  // Todo pasa por acá salvo la página de login y lo que ella necesita.
  matcher: ['/((?!login\\.html|api/login|api/logout|fonts/|logo-mediabustv\\.png|favicon\\.png|apple-touch-icon\\.png).*)'],
};

export default async function middleware(request) {
  const ok = await verifySession(readCookie(request), process.env.MB_SECRET);
  if (ok) return next(); // sigue a la app normalmente
  const url = new URL(request.url);
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    return Response.redirect(new URL('/login.html', url), 307);
  }
  return new Response('No autorizado', { status: 401 });
}
