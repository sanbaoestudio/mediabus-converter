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
import { parseProbe, diagnose } from './probe.js';

const $ = (s) => document.querySelector(s);
const els = {
  profiles: $('#profiles'), trimRow: $('#trimRow'), trim: $('#trim'),
  drop: $('#drop'), file: $('#file'), queue: $('#queue'),
  go: $('#go'), zip: $('#zip'), clear: $('#clear'), engine: $('#engine'),
};

const state = { profile: PROFILES[0], items: [], busy: false, ready: false };
let uid = 0;

/* ---------- Perfiles ---------- */
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
      <span class="p-size">${p.size}</span>
      <span class="p-desc">${p.desc}</span>`;
    b.onclick = () => { if (state.busy) return; state.profile = p; renderProfiles(); };
    els.profiles.append(b);
  }
  els.trimRow.hidden = !state.profile.trim;
}

/* ---------- Motor ffmpeg.wasm ---------- */
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
    state.mode = mt ? 'multihilo' : 'estándar';
    state.threads = mt ? Math.min(4, navigator.hardwareConcurrency) : 1;
  } catch (e) {
    if (!mt) throw e;
    await ffmpeg.load({ coreURL: '/ffmpeg/st/ffmpeg-core.js', wasmURL: '/ffmpeg/st/ffmpeg-core.wasm' });
    state.mode = 'estándar';
    state.threads = 1;
  }
  state.ready = true;
  els.engine.textContent = `Motor listo (modo ${state.mode}). Los videos se procesan en este dispositivo.`;
  refresh();
}

/* ---------- Lista ---------- */
const fmtMB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';

function addFiles(list) {
  for (const file of list) {
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(file.name)) continue;
    const item = { id: ++uid, file, status: 'pending', info: null, diag: null, out: null, progress: 0 };
    state.items.push(item);
    item.el = document.createElement('li');
    item.el.className = 'item';
    els.queue.append(item.el);
    renderItem(item);
    if (state.ready) probeItem(item);
  }
  refresh();
}

function renderItem(it) {
  const p = Math.round(it.progress * 100);
  let tag = '<span class="tag wait">Analizando…</span>';
  if (it.diag) tag = `<span class="tag ${it.diag.level}">${it.diag.label}</span>`;
  if (it.status === 'working') tag = `<span class="tag wait">${p}%</span>`;
  if (it.status === 'done') tag = '<span class="tag ok">Apto MediaBus</span>';
  if (it.status === 'error') tag = '<span class="tag bad">Error</span>';

  let meta = it.info ? it.info.summary : fmtMB(it.file.size);
  if (it.diag && it.diag.reasons.length && it.status === 'pending') meta += ` · <b>${it.diag.reasons.join(' · ')}</b>`;
  if (it.status === 'done') meta = `${fmtMB(it.file.size)} → <b>${fmtMB(it.out.size)}</b> · ${it.profileName}`;
  if (it.status === 'error') meta = it.error || 'No se pudo convertir este archivo.';

  const right = it.status === 'done'
    ? `<a class="dl" href="${it.out.url}" download="${it.out.name}">Descargar</a>`
    : state.busy ? '' : `<button class="x" aria-label="Quitar" data-id="${it.id}">×</button>`;

  it.el.innerHTML = `<span class="name" title="${esc(it.file.name)}">${esc(it.file.name)}</span>
    <span class="right">${tag}${right}</span>
    <span class="meta">${meta}</span>
    ${it.status === 'working' ? `<span class="bar"><i style="width:${p}%"></i></span>` : ''}`;
  const x = it.el.querySelector('.x');
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

/* ---------- Sistema de archivos ---------- */
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
    // Respaldo: copiar el archivo a memoria
    const path = `${dir}/input`;
    await ffmpeg.writeFile(path, new Uint8Array(await file.arrayBuffer()));
    try { return await fn(path); } finally { await ffmpeg.deleteFile(path).catch(() => {}); }
  } finally {
    if (mounted) await ffmpeg.unmount(dir).catch(() => {});
    await ffmpeg.deleteDir(dir).catch(() => {});
  }
}

let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

function probeItem(it) {
  return serial(async () => {
    const lines = [];
    logSink = (m) => lines.push(m);
    try {
      await withMounted(it.file, (path) => ffmpeg.exec(['-hide_banner', '-i', path]));
    } catch { /* ffmpeg sin salida devuelve error: es esperado */ }
    logSink = null;
    it.info = parseProbe(lines.join('\n'));
    it.diag = diagnose(it.info);
    renderItem(it);
  });
}

/* ---------- Conversión ---------- */
async function convertAll() {
  state.busy = true;
  refresh();
  state.items.forEach(renderItem);
  const profile = state.profile;
  const trim = profile.trim && els.trim.checked;

  for (const it of state.items) {
    if (it.status !== 'pending' && it.status !== 'error') continue;
    if (!it.info) await probeItem(it);
    it.status = 'working';
    it.progress = 0;
    renderItem(it);
    const total = Math.min(it.info?.duration || 0, trim ? 10 : Infinity) || 1;
    const outName = it.file.name.replace(/\.[^.]+$/, '') + profile.suffix + '.mp4';

    try {
      await serial(() => withMounted(it.file, async (path) => {
        logSink = (m) => {
          const t = /time=(\d+):(\d+):([\d.]+)/.exec(m);
          if (t) {
            it.progress = Math.min(0.99, (+t[1] * 3600 + +t[2] * 60 + +t[3]) / total);
            renderItem(it);
          }
        };
        const code = await ffmpeg.exec(buildArgs(profile, path, '/out.mp4', { trim, threads: state.threads }));
        logSink = null;
        const data = await ffmpeg.readFile('/out.mp4');
        await ffmpeg.deleteFile('/out.mp4').catch(() => {});
        if (code !== 0 || !data?.length) throw new Error('code ' + code);
        const blob = new Blob([data], { type: 'video/mp4' });
        it.out = { name: outName, size: blob.size, url: URL.createObjectURL(blob), blob };
      }));
      it.status = 'done';
      it.profileName = profile.title;
    } catch (e) {
      logSink = null;
      it.status = 'error';
      it.error = 'No se pudo convertir. Probá con un archivo más corto o desde una computadora.';
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
    if (it.status === 'done') files[it.out.name] = [new Uint8Array(await it.out.blob.arrayBuffer()), { level: 0 }];
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
loadEngine()
  .then(() => state.items.forEach((it) => !it.info && probeItem(it)))
  .catch((e) => {
    console.error(e);
    els.engine.textContent = 'No se pudo iniciar el motor en este navegador. Probá con Chrome o Safari actualizados.';
  });

window.__mbc = { state, ffmpeg };
