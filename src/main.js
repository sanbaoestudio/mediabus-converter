import '@fontsource/epilogue/600.css';
import '@fontsource/epilogue/700.css';
import '@fontsource/epilogue/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './style.css';
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { zipSync } from 'fflate';
import { PROFILES, buildArgs } from './profiles.js';
import { parseDuration } from './probe.js';

const $ = (s) => document.querySelector(s);
const els = {
  profiles: $('#profiles'), drop: $('#drop'), file: $('#file'), queue: $('#queue'),
  go: $('#go'), zip: $('#zip'), clear: $('#clear'), engine: $('#engine'),
};

const state = { profile: PROFILES[0], items: [], busy: false, ready: false, threads: 1 };
let uid = 0;

/* ---------- Opciones ---------- */
function renderProfiles() {
  els.profiles.innerHTML = '';
  for (const p of PROFILES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'profile';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(p === state.profile));
    b.innerHTML = `${p.badge ? `<span class="badge">${p.badge}</span>` : ''}
      <span class="p-title">${p.title}</span>
      <span class="p-desc">${p.desc}</span>`;
    b.onclick = () => { if (state.busy) return; state.profile = p; renderProfiles(); };
    els.profiles.append(b);
  }
}

/* ---------- Motor ---------- */
const ffmpeg = new FFmpeg();
let logSink = null;
window.__debug = new URLSearchParams(location.search).has('debug');
ffmpeg.on('log', ({ message }) => { if (window.__debug) console.log('[ff]', message); logSink && logSink(message); });

async function loadEngine() {
  const mt = window.crossOriginIsolated && navigator.hardwareConcurrency > 1;
  const base = mt ? '/ffmpeg/mt' : '/ffmpeg/st';
  try {
    await ffmpeg.load({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
      ...(mt ? { workerURL: `${base}/ffmpeg-core.worker.js` } : {}),
    });
    state.threads = mt ? Math.min(4, navigator.hardwareConcurrency) : 1;
  } catch (e) {
    if (!mt) throw e;
    await ffmpeg.load({ coreURL: '/ffmpeg/st/ffmpeg-core.js', wasmURL: '/ffmpeg/st/ffmpeg-core.wasm' });
    state.threads = 1;
  }
  state.ready = true;
  els.engine.hidden = true;
  refresh();
}

/* ---------- Lista ---------- */
const fmtMB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
const baseName = (n) => n.replace(/\.[^.]+$/, '');
const cleanName = (n) => n.replace(/[\\/:*?"<>|]+/g, '-').replace(/\.mp4$/i, '').trim();
const fileName = (it) => (cleanName(it.nameEl.value) || baseName(it.file.name)) + '.mp4';

function addFiles(list) {
  for (const file of list) {
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(file.name)) continue;
    const it = { id: ++uid, file, status: 'pending', duration: null, out: null, progress: 0 };
    it.el = document.createElement('li');
    it.el.className = 'item';
    it.el.innerHTML = `
      <label class="rename" title="Tocá para cambiar el nombre">
        <input type="text" spellcheck="false" aria-label="Nombre del archivo" />
        <span class="ext">.mp4</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </label>
      <span class="right"></span>
      <span class="meta"></span>
      <span class="bar"><i></i></span>`;
    it.nameEl = it.el.querySelector('input');
    it.nameEl.value = baseName(file.name);
    const fit = () => { it.nameEl.size = Math.max(4, it.nameEl.value.length + 1); };
    fit();
    it.nameEl.addEventListener('input', () => { fit(); updateLink(it); });
    it.nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') it.nameEl.blur(); });
    it.nameEl.addEventListener('blur', () => { if (!cleanName(it.nameEl.value)) it.nameEl.value = baseName(file.name); updateLink(it); });
    state.items.push(it);
    els.queue.append(it.el);
    renderItem(it);
  }
  refresh();
}

function updateLink(it) {
  const a = it.el.querySelector('.dl');
  if (a) a.download = fileName(it);
}

function renderItem(it) {
  const p = Math.round(it.progress * 100);
  const right = it.el.querySelector('.right');
  const meta = it.el.querySelector('.meta');
  const bar = it.el.querySelector('.bar');

  bar.hidden = it.status !== 'working';
  bar.firstElementChild.style.width = p + '%';

  if (it.status === 'working') {
    right.innerHTML = `<span class="tag wait">${p}%</span>`;
    meta.textContent = 'Convirtiendo…';
  } else if (it.status === 'done') {
    right.innerHTML = `<span class="tag ok">Listo</span><a class="dl" href="${it.out.url}" download="${esc(fileName(it))}">Descargar</a>`;
    meta.innerHTML = `${fmtMB(it.file.size)} → <b>${fmtMB(it.out.size)}</b>`;
  } else if (it.status === 'error') {
    right.innerHTML = '<span class="tag bad">Error</span>' + (state.busy ? '' : '<button class="x" aria-label="Quitar">×</button>');
    meta.textContent = 'No se pudo convertir. Probá de nuevo o desde una computadora.';
  } else {
    right.innerHTML = state.busy ? '<span class="tag wait">En espera</span>' : '<button class="x" aria-label="Quitar">×</button>';
    meta.textContent = fmtMB(it.file.size);
  }
  const x = right.querySelector('.x');
  if (x) x.onclick = () => removeItem(it);
}

function removeItem(it) {
  if (it.out) URL.revokeObjectURL(it.out.url);
  it.el.remove();
  state.items = state.items.filter((i) => i !== it);
  refresh();
}

function refresh() {
  const pending = state.items.filter((i) => i.status === 'pending' || i.status === 'error');
  const done = state.items.filter((i) => i.status === 'done');
  els.go.disabled = !state.ready || state.busy || pending.length === 0;
  els.go.textContent = state.busy ? 'Convirtiendo…' : pending.length > 1 ? `Convertir ${pending.length} videos` : 'Convertir';
  els.zip.hidden = done.length < 2 || state.busy;
  els.clear.hidden = state.items.length === 0 || state.busy;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Archivos dentro del motor ---------- */
async function withMounted(file, fn) {
  const dir = '/in' + Date.now();
  await ffmpeg.createDir(dir);
  let mounted = false;
  try {
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, dir);
    mounted = true;
    return await fn(`${dir}/${file.name}`);
  } catch (e) {
    if (mounted) throw e;
    const path = `${dir}/input`;
    await ffmpeg.writeFile(path, new Uint8Array(await file.arrayBuffer()));
    try { return await fn(path); } finally { await ffmpeg.deleteFile(path).catch(() => {}); }
  } finally {
    if (mounted) await ffmpeg.unmount(dir).catch(() => {});
    await ffmpeg.deleteDir(dir).catch(() => {});
  }
}

async function readDuration(it) {
  const lines = [];
  logSink = (m) => lines.push(m);
  try { await withMounted(it.file, (path) => ffmpeg.exec(['-hide_banner', '-i', path])); } catch { /* esperado */ }
  logSink = null;
  it.duration = parseDuration(lines.join('\n'));
}

/* ---------- Conversión ---------- */
async function convertAll() {
  state.busy = true;
  refresh();
  state.items.forEach(renderItem);
  const profile = state.profile;

  for (const it of state.items) {
    if (it.status !== 'pending' && it.status !== 'error') continue;
    it.status = 'working';
    it.progress = 0;
    renderItem(it);
    try {
      if (it.duration == null) await readDuration(it);
      const total = it.duration || 1;
      await withMounted(it.file, async (path) => {
        logSink = (m) => {
          const t = /time=(\d+):(\d+):([\d.]+)/.exec(m);
          if (t) { it.progress = Math.min(0.99, (+t[1] * 3600 + +t[2] * 60 + +t[3]) / total); renderItem(it); }
        };
        const code = await ffmpeg.exec(buildArgs(profile, path, '/out.mp4', { threads: state.threads }));
        logSink = null;
        const data = await ffmpeg.readFile('/out.mp4');
        await ffmpeg.deleteFile('/out.mp4').catch(() => {});
        if (code !== 0 || !data?.length) throw new Error('code ' + code);
        const blob = new Blob([data], { type: 'video/mp4' });
        it.out = { size: blob.size, url: URL.createObjectURL(blob), blob };
      });
      it.status = 'done';
    } catch (e) {
      logSink = null;
      it.status = 'error';
      console.error(e);
    }
    renderItem(it);
  }
  state.busy = false;
  state.items.forEach(renderItem);
  refresh();
}

async function downloadZip() {
  const files = {};
  for (const it of state.items) {
    if (it.status !== 'done') continue;
    let name = fileName(it), n = 2;
    while (files[name]) name = fileName(it).replace(/\.mp4$/, ` (${n++}).mp4`);
    files[name] = [new Uint8Array(await it.out.blob.arrayBuffer()), { level: 0 }];
  }
  const zip = zipSync(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  a.download = `MediabusConverter_${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Eventos ---------- */
els.file.onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
['dragenter', 'dragover'].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.remove('over'); }));
els.drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
els.go.onclick = convertAll;
els.zip.onclick = downloadZip;
els.clear.onclick = () => { [...state.items].forEach(removeItem); };

renderProfiles();
refresh();
loadEngine().catch((e) => {
  console.error(e);
  els.engine.textContent = 'Este navegador no es compatible. Probá con Chrome o Safari actualizados.';
});

window.__mbc = { state, ffmpeg };
