/* ==========================================================
   Document toolkit helpers. Everything runs in the browser;
   files are never uploaded. Libraries live in /assets/vendor
   and load only when a tool needs them.
   ========================================================== */

const V = new URL('../../assets/vendor/', import.meta.url).href;

/* ---------- lazy library loading ---------- */

const loaded = new Map();
function script(src, globalName) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      if (window[globalName]) return resolve(window[globalName]);
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(window[globalName]);
      s.onerror = () => { loaded.delete(src); reject(new Error("Couldn't load a component. Check your connection and try again.")); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}

export const pdfLib = () => script(V + 'pdf-lib.min.js', 'PDFLib');
export const jszip = () => script(V + 'jszip.min.js', 'JSZip');

let pdfjsP = null;
export function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = import(V + 'pdfjs/pdf.min.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = V + 'pdfjs/pdf.worker.min.mjs';
      return m;
    }).catch(e => { pdfjsP = null; throw e; });
  }
  return pdfjsP;
}

let tessWorker = null, tessLangs = '';
export async function ocrWorker(langs, onProgress) {
  const T = await script(V + 'tesseract/tesseract.min.js', 'Tesseract');
  if (tessWorker && tessLangs === langs) { tessWorker.__hold.progress = onProgress; return tessWorker; }
  if (tessWorker) { await tessWorker.terminate(); tessWorker = null; }
  const hold = { progress: onProgress };
  const w = await T.createWorker(langs.split('+'), 1, {
    workerPath: V + 'tesseract/worker.min.js',
    corePath: V + 'tesseract/core/',
    langPath: V + 'tesseract/lang',
    workerBlobURL: false,
    logger: m => hold.progress && hold.progress(m),
  });
  w.__hold = hold;
  tessWorker = w; tessLangs = langs;
  return w;
}

/* ---------- files ---------- */

export const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImage = f => (f.type || '').startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name);

export function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export const baseName = name => name.replace(/\.[^.]+$/, '') || 'file';

export async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/** Decode an image file (respects photo orientation). */
export async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } catch (e2) {
      throw new Error(/\.hei[cf]$/i.test(file.name)
        ? `This browser can't open HEIC photos (${file.name}). Try on your iPhone, or export it as JPG first.`
        : `Couldn't read ${file.name} as an image.`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
}

/** Draw a bitmap onto a canvas, optionally scaled so the longest side ≤ maxSide. */
export function toCanvas(src, maxSide = 0, background = null) {
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const k = maxSide && Math.max(w0, h0) > maxSide ? maxSide / Math.max(w0, h0) : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d');
  if (background) { g.fillStyle = background; g.fillRect(0, 0, c.width, c.height); }
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export const canvasBlob = (c, type = 'image/jpeg', quality = 0.9) =>
  new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the image.'))), type, quality));

export const blobBytes = async b => new Uint8Array(await b.arrayBuffer());

/* ---------- PDF reading ---------- */

export async function openPdf(bytes) {
  const lib = await pdfjs();
  try {
    return await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Remove the password first.');
    throw new Error("Couldn't open this PDF. It may be damaged.");
  }
}

/** Release a PDF's memory (the method name differs between pdf.js versions). */
export function closePdf(doc) {
  try {
    if (typeof doc.destroy === 'function') return doc.destroy();
    if (doc.loadingTask && typeof doc.loadingTask.destroy === 'function') return doc.loadingTask.destroy();
    if (typeof doc.cleanup === 'function') return doc.cleanup();
  } catch (e) { /* ignore */ }
}

/** Render a page to a canvas at a given scale (1 = 72 dpi). */
export async function renderPage(doc, pageNum, scale) {
  const page = await doc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  page.cleanup();
  return c;
}

export async function thumbUrl(doc, pageNum, width = 180) {
  const page = await doc.getPage(pageNum);
  const scale = width / page.getViewport({ scale: 1 }).width;
  const c = await renderPage(doc, pageNum, scale);
  return c.toDataURL('image/jpeg', 0.75);
}

/** Text of one page, with line breaks. */
export async function pageText(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  let out = '';
  for (const it of content.items) {
    if (typeof it.str !== 'string') continue;
    out += it.str;
    if (it.hasEOL) out += '\n';
    else if (it.str && !/\s$/.test(it.str)) out += ' ';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- output ---------- */

/** Offer a result: Download, and Share where the phone supports it. */
export function resultCard(blob, filename, note = '') {
  const url = URL.createObjectURL(blob);
  const canShare = (() => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] })); } catch (e) { return false; }
  })();
  const wrap = document.createElement('div');
  wrap.className = 'd-result';
  wrap.innerHTML = `
    <div class="d-result-info"><strong></strong><span></span></div>
    <div class="d-result-actions">
      ${canShare ? '<button class="btn btn-ghost" type="button" data-share>Share</button>' : ''}
      <a class="btn btn-primary" download>Download</a>
    </div>`;
  wrap.querySelector('strong').textContent = filename;
  wrap.querySelector('span').textContent = fmtSize(blob.size) + (note ? ' · ' + note : '');
  const a = wrap.querySelector('a');
  a.href = url; a.download = filename;
  wrap.querySelector('[data-share]')?.addEventListener('click', async () => {
    try { await navigator.share({ files: [new File([blob], filename, { type: blob.type })] }); } catch (e) { /* cancelled */ }
  });
  return wrap;
}

export async function zipBlobs(entries) {
  const JSZip = await jszip();
  const zip = new JSZip();
  const used = new Set();
  for (const { name, blob } of entries) {
    let n = name, i = 2;
    while (used.has(n)) n = name.replace(/(\.[^.]+)?$/, ` (${i++})$1`);
    used.add(n);
    zip.file(n, blob);
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

/** Let the UI breathe during long loops. */
export const tick = () => new Promise(r => setTimeout(r, 0));
