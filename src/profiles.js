// Perfiles de salida. Pensados para el reproductor Android 4.2 (Allwinner A20) de las unidades.
// Las pantallas de MediaBus no usan audio: todos los videos salen sin pista de audio.
export const PROFILES = [
  {
    id: 'tv', title: 'MediaBus TV', badge: 'Recomendado',
    desc: 'Listo para las pantallas de los colectivos.',
    w: 1280, h: 720, br: '2M', level: '3.1', suffix: '_MBTV',
  },
  {
    id: 'lite', title: 'Solo bajar peso',
    desc: 'El mismo video, más liviano.',
    br: '1500k', level: '4.0', suffix: '_liviano',
  },
];

export function buildArgs(p, input, output, { threads = 1 } = {}) {
  const vf = p.w
    ? `scale=${p.w}:${p.h}:force_original_aspect_ratio=decrease,pad=${p.w}:${p.h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`
    : `scale='min(1920,iw)':-2,setsar=1`;

  return [
    '-hide_banner', '-y', '-i', input,
    '-map', '0:v:0', '-vf', vf,
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-level', p.level,
    '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-bf', '0',
    '-b:v', p.br, '-maxrate', p.br, '-bufsize', p.br,
    // Hilos explícitos: el modo automático rompe el núcleo multihilo de ffmpeg.wasm
    '-threads', String(threads),
    '-an', '-map_metadata', '-1', '-movflags', '+faststart', output,
  ];
}
