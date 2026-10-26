// Lee la duración desde la salida de `ffmpeg -i`, para mostrar el progreso.
export function parseDuration(log) {
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  return d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0;
}
