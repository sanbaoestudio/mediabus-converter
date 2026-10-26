// Copia los binarios de ffmpeg.wasm a /public/ffmpeg para servirlos desde el mismo dominio.
import { cpSync, mkdirSync } from 'node:fs';
const map = {
  st: ['@ffmpeg/core/dist/esm', ['ffmpeg-core.js', 'ffmpeg-core.wasm']],
  mt: ['@ffmpeg/core-mt/dist/esm', ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']],
};
for (const [dir, [pkg, files]] of Object.entries(map)) {
  mkdirSync(`public/ffmpeg/${dir}`, { recursive: true });
  for (const f of files) cpSync(`node_modules/${pkg}/${f}`, `public/ffmpeg/${dir}/${f}`);
}
console.log('ffmpeg core copiado a public/ffmpeg');
