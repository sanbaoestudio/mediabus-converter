# Mediabus Converter

App web para convertir videos con máxima compatibilidad para las pantallas de MediaBus TV.
La conversión corre en el navegador (ffmpeg.wasm): ningún video se sube a un servidor.

## Perfiles
| Perfil | Salida |
|---|---|
| MediaBus TV | 1280×720, H.264 Main 3.1, 30 fps, keyframe 1 s, 2 Mbps tope, sin audio |

| Solo bajar peso | Resolución original (hasta 1080p), 1,5 Mbps, sin audio |

## Desarrollo
```
npm install
npm run dev
```
`npm run build` copia el núcleo de ffmpeg.wasm a `public/ffmpeg` y genera `dist/`.
Requiere los headers COOP/COEP (ver `vercel.json`) para el modo multihilo.

## Acceso
La app está protegida con login (Vercel Routing Middleware + cookie firmada).
Variables de entorno necesarias en Vercel:

| Variable | Uso |
|---|---|
| `MB_USER` | Usuario de acceso |
| `MB_PASSWORD` | Contraseña de acceso |
| `MB_SECRET` | Clave para firmar la sesión (texto largo al azar) |

Si falta alguna, nadie puede ingresar. Cambiar `MB_SECRET` cierra todas las sesiones abiertas.
