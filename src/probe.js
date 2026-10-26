// Lee la salida de `ffmpeg -i` y arma un diagnóstico simple de compatibilidad.
export function parseProbe(log) {
  const info = { duration: 0, hasAudio: /Stream #.*Audio:/.test(log), clipchamp: /clipchamp/i.test(log) };
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (d) info.duration = +d[1] * 3600 + +d[2] * 60 + +d[3];
  const br = /Duration:.*bitrate: (\d+) kb\/s/.exec(log);
  if (br) info.kbps = +br[1];

  const v = /Stream #.*Video: ([^\n]+)/.exec(log);
  if (v) {
    const line = v[1];
    info.codec = line.split(/[ ,(]/)[0];
    const prof = /^\w+ \(([^)]+)\)/.exec(line);
    info.profile = prof ? prof[1] : '';
    const res = /(\d{2,5})x(\d{2,5})/.exec(line);
    if (res) { info.w = +res[1]; info.h = +res[2]; }
    const fps = /([\d.]+) fps/.exec(line);
    if (fps) info.fps = +fps[1];
    const pix = /, (yuv\w+|rgb\w+|gbr\w+|nv12)/.exec(line);
    info.pix = pix ? pix[1] : '';
  }

  const parts = [];
  if (info.codec) parts.push(info.codec.toUpperCase() + (info.profile ? ` ${info.profile}` : ''));
  if (info.w) parts.push(`${info.w}×${info.h}`);
  if (info.fps) parts.push(`${+info.fps.toFixed(2)} fps`);
  if (info.kbps) parts.push(`${(info.kbps / 1000).toFixed(1)} Mbps`);
  if (info.duration) parts.push(`${Math.round(info.duration)} s`);
  info.summary = parts.join(' · ') || 'Formato no reconocido';
  return info;
}

export function diagnose(i) {
  const bad = [], warn = [];
  if (!i.codec) bad.push('no se pudo leer el video');
  else if (i.codec !== 'h264') bad.push(`códec ${i.codec.toUpperCase()}`);
  if (/10|12/.test(i.pix || '') || /High 10/.test(i.profile || '')) bad.push('color 10-bit');
  if (/422|444/.test(i.pix || '') || /4:2:2|4:4:4/.test(i.profile || '')) bad.push('croma 4:2:2/4:4:4');
  if (i.w > 1920 || i.h > 1080) bad.push('resolución mayor a 1080p');
  if (i.fps && Math.abs(i.fps - 30) > 0.01) warn.push(`${+i.fps.toFixed(2)} fps`);
  if (i.kbps > 4000) warn.push('bitrate alto');
  if (/High/.test(i.profile || '') && !bad.length) warn.push('perfil High');
  if (i.clipchamp) warn.push('keyframes largos (Clipchamp)');
  if (!i.hasAudio) warn.push('sin pista de audio');

  if (bad.length) return { level: 'bad', label: 'Riesgo alto', reasons: [...bad, ...warn] };
  if (warn.length) return { level: 'warn', label: 'Revisar', reasons: warn };
  return { level: 'ok', label: 'Compatible', reasons: [] };
}
