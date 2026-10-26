// Perfiles de salida. Pensados para el reproductor Android 4.2 (Allwinner A20) de las unidades.
export const PROFILES = [
  {
    id: 'tv', title: 'MediaBus TV', size: '1280 × 720', badge: 'Recomendado',
    desc: 'Máxima compatibilidad. Audio reemplazado por silencio.',
    w: 1280, h: 720, br: '2M', level: '3.1', audio: 'silence', suffix: '_MBTV',
  },
  {
    id: 'tv-mute', title: 'MediaBus TV sin audio', size: '1280 × 720',
    desc: 'Igual que el anterior, pero quita la pista de audio.',
    w: 1280, h: 720, br: '2M', level: '3.1', audio: 'none', suffix: '_MBTV_mute',
  },
  {
    id: 'backled', title: 'Backled', size: '1280 × 384', trim: true,
    desc: 'Pantallas exteriores del colectivo. Spec: 10 segundos.',
    w: 1280, h: 384, br: '1500k', level: '3.1', audio: 'silence', suffix: '_BACKLED',
  },
  {
    id: 'lite', title: 'Solo bajar peso', size: 'Resolución original',
    desc: 'Mantiene tamaño (hasta 1080p) y audio.',
    br: '1500k', level: '4.0', audio: 'keep', suffix: '_liviano',
  },
];

export function buildArgs(p, input, output, { trim, threads = 1 } = {}) {
  const a = ['-hide_banner', '-y'];
  if (trim) a.push('-t', '10');
  a.push('-i', input);
  if (p.audio === 'silence') a.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');

  const vf = p.w
    ? `scale=${p.w}:${p.h}:force_original_aspect_ratio=decrease,pad=${p.w}:${p.h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`
    : `scale='min(1920,iw)':-2,setsar=1`;

  a.push('-map', '0:v:0');
  if (p.audio === 'silence') a.push('-map', '1:a:0');
  if (p.audio === 'keep') a.push('-map', '0:a:0?');

  a.push(
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-level', p.level,
    '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-bf', '0',
    '-b:v', p.br, '-maxrate', p.br, '-bufsize', p.br,
    // Hilos explícitos: el modo automático rompe el núcleo multihilo de ffmpeg.wasm
    '-threads', String(threads),
  );

  if (p.audio === 'silence') a.push('-c:a', 'aac', '-b:a', '64k', '-shortest');
  if (p.audio === 'none') a.push('-an');
  if (p.audio === 'keep') a.push('-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '96k');

  a.push('-map_metadata', '-1', '-movflags', '+faststart', output);
  return a;
}
