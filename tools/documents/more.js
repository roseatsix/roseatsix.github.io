/* ==========================================================
   Document toolkit, part 2:
   - Protect:  cover private details (draw boxes, or find text) and/or
               stamp a watermark; saved flat, so neither can be undone
   - Compress → Under a size limit (renderLimit)
   - Convert  → ID photo (renderIdPhoto)
   ========================================================== */

import { esc, toast } from '../../assets/js/ui/dom.js';
import * as L from './lib.js';

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/></svg>',
};

const DPI = 150;                       // how sharp flattened PDF pages are
const todayText = () => new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

/* ---------- pages in, pages out ---------- */

/** A PDF or image → [{ canvas, w, h }] (w/h in PDF points for PDFs). */
async function loadPages(file, onProgress = () => {}) {
  if (L.isPdf(file)) {
    const doc = await L.openPdf(await L.readBytes(file));
    const pages = [];
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        onProgress(`Opening page ${p} of ${doc.numPages}…`, (p - 1) / doc.numPages * 100);
        const page = await doc.getPage(p);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = DPI / 72;
        const canvas = await L.renderPage(doc, p, scale);
        pages.push({ canvas, w: vp1.width, h: vp1.height, scale, pdfPage: p, doc });
      }
    } catch (e) { L.closePdf(doc); throw e; }
    pages.doc = doc;
    return pages;
  }
  if (L.isImage(file)) {
    const canvas = L.toCanvas(await L.decodeImage(file), 4000, '#fff');
    return [{ canvas, w: canvas.width, h: canvas.height, scale: 1 }];
  }
  throw new Error("That isn't a PDF or a photo.");
}

/** Flattened pages → a PDF (if the input was one) or an image. */
async function savePages(file, canvases, suffix) {
  if (L.isPdf(file) || canvases.length > 1) {
    const { PDFDocument } = await L.pdfLib();
    const pdf = await PDFDocument.create();
    for (const { canvas, w, h } of canvases) {
      const jpg = await pdf.embedJpg(await L.blobBytes(await L.canvasBlob(canvas, 'image/jpeg', 0.9)));
      pdf.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
    }
    return { blob: new Blob([await pdf.save({ useObjectStreams: true })], { type: 'application/pdf' }), name: `${L.baseName(file.name)}-${suffix}.pdf` };
  }
  const png = /png$/i.test(file.type);
  const blob = await L.canvasBlob(canvases[0].canvas, png ? 'image/png' : 'image/jpeg', 0.92);
  return { blob, name: `${L.baseName(file.name)}-${suffix}.${png ? 'png' : 'jpg'}` };
}

const copyCanvas = src => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; };

/* ==========================================================
   Hide private details
   ========================================================== */

const PRESETS = {
  nik: { label: 'NIK', btn: 'Cover every NIK', test: w => /^\d{16}$/.test(w.replace(/\D/g, '')) && w.replace(/[\d\s.-]/g, '').length < 2 },
  account: { label: 'long number', btn: 'Cover every long number (account, phone)', test: w => w.replace(/\D/g, '').length >= 8 && w.replace(/[\d\s.-]/g, '').length < 2 },
};

/** Words with boxes (in canvas pixels) for one page: from the PDF's text, or by reading it. */
async function pageWords(pg, onProgress) {
  if (pg.doc) {
    const page = await pg.doc.getPage(pg.pdfPage);
    const vp = page.getViewport({ scale: pg.scale });
    const content = await page.getTextContent();
    const lib = await L.pdfjs();
    const words = [];
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = lib.Util.transform(vp.transform, it.transform);
      const fh = Math.hypot(tx[2], tx[3]);
      const width = it.width * pg.scale;
      const x0 = tx[4], yBase = tx[5];
      // split the run into words, placing each by its share of the characters
      const len = it.str.length;
      for (const m of it.str.matchAll(/\S+/g)) {
        const a = x0 + width * (m.index / len), b = x0 + width * ((m.index + m[0].length) / len);
        words.push({ text: m[0], x: a, y: yBase - fh * 0.95, w: b - a, h: fh * 1.2 });
      }
    }
    if (words.length) return words;
  }
  // No text layer (a photo or a scan): read it.
  const w = await L.ocrWorker('ind+eng', m => { if (m.status === 'recognizing text') onProgress && onProgress(m.progress); });
  const { data } = await w.recognize(pg.canvas, {}, { text: true, blocks: true });
  const out = [];
  const add = wd => { if (wd && wd.text && wd.text.trim()) out.push({ text: wd.text, x: wd.bbox.x0, y: wd.bbox.y0, w: wd.bbox.x1 - wd.bbox.x0, h: wd.bbox.y1 - wd.bbox.y0 }); };
  if (Array.isArray(data.words)) data.words.forEach(add);
  else for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || []) add(wd);
  return out;
}

const COLORS = { grey: [90, 90, 90], red: [190, 40, 40], blue: [40, 70, 170] };

function stamp(canvas, { text, opacity, size, color, tiled }) {
  const g = canvas.getContext('2d');
  const W = canvas.width, Hh = canvas.height;
  const base = Math.min(W, Hh);
  const px = Math.round(base * { s: 0.035, m: 0.05, l: 0.075 }[size]);
  g.save();
  g.font = `700 ${px}px "Nunito Sans", system-ui, sans-serif`;
  g.fillStyle = `rgba(${COLORS[color].join(',')},${opacity})`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.translate(W / 2, Hh / 2);
  g.rotate(-Math.atan2(Hh, W) * 0.9);
  const lines = text.split('\n');
  if (tiled) {
    const tw = Math.max(...lines.map(l => g.measureText(l).width)) + px * 3;
    const th = px * (lines.length + 2.2);
    const reach = Math.hypot(W, Hh);
    let row = 0;
    for (let y = -reach; y < reach; y += th, row++) {
      for (let x = -reach + (row % 2 ? tw / 2 : 0); x < reach; x += tw) {
        lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * px * 1.15));
      }
    }
  } else {
    const big = Math.min(px * 2.2, (Math.hypot(W, Hh) * 0.8) / Math.max(...lines.map(l => (g.measureText(l).width / px) || 1)));
    g.font = `800 ${big}px "Nunito Sans", system-ui, sans-serif`;
    lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * big * 1.15));
  }
  g.restore();
}

export function renderProtect(root, H) {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Protect a copy</h2></div>
      <p class="d-intro">Before you send a document: cover private details (an NIK, account number, address), stamp it with what it's for, or both.</p>
      ${H.picker('protect', { multiple: false, label: 'Choose a PDF or photo' })}
      <div data-work hidden>
        <h3 class="d-step">Cover private details</h3>
        <p class="hint" style="margin-top:-4px">Drag on a page to draw a box, or find text to cover it everywhere. Tap a box to remove it.</p>
        <form class="d-find" data-find>
          <label class="searchbox">${ICON.search}<input class="inline-input" name="q" placeholder="Find text to cover, e.g. a name" autocomplete="off" aria-label="Find text to cover"></label>
          <button class="btn btn-ghost btn-sm" type="submit">Cover</button>
        </form>
        <div class="d-presets">
          ${Object.entries(PRESETS).map(([k, v]) => `<button type="button" class="btn btn-ghost btn-sm" data-preset="${k}">${esc(v.btn)}</button>`).join('')}
          <button type="button" class="btn btn-ghost btn-sm" data-clear>${ICON.undo}Remove all boxes</button>
        </div>
        <p class="hint" data-status></p>

        <h3 class="d-step">Watermark</h3>
        <label class="check"><input type="checkbox" data-wm-on><span>Stamp text across every page</span></label>
        <div class="d-wm-form" data-wm hidden>
          <label class="field"><span class="field-label">Text</span>
            <textarea class="input" name="wmtext" rows="2" placeholder="e.g. Hanya untuk keperluan pendaftaran BPJS">Hanya untuk keperluan </textarea></label>
          <div class="d-presets">
            <button type="button" class="btn btn-ghost btn-sm" data-wmp="Hanya untuk keperluan ">Hanya untuk keperluan…</button>
            <button type="button" class="btn btn-ghost btn-sm" data-wmp="Tidak berlaku untuk keperluan lain">Tidak berlaku untuk keperluan lain</button>
            <button type="button" class="btn btn-ghost btn-sm" data-wmp="SALINAN">SALINAN</button>
          </div>
          <label class="check"><input type="checkbox" name="date" checked><span>Add today's date (${esc(todayText())})</span></label>
          <div class="field-grid d-wm-opts">
            <div class="field"><span class="field-label">Layout</span>
              <div class="segmented seg-2" role="radiogroup" aria-label="Layout"><button type="button" role="radio" data-tiled="1" aria-checked="true">All over</button><button type="button" role="radio" data-tiled="0" aria-checked="false">Once, big</button></div></div>
            <div class="field"><span class="field-label">Size</span>
              <div class="segmented seg-3" role="radiogroup" aria-label="Size"><button type="button" role="radio" data-size="s" aria-checked="false">S</button><button type="button" role="radio" data-size="m" aria-checked="true">M</button><button type="button" role="radio" data-size="l" aria-checked="false">L</button></div></div>
            <div class="field"><span class="field-label">Colour</span>
              <div class="segmented seg-3" role="radiogroup" aria-label="Colour"><button type="button" role="radio" data-color="grey" aria-checked="true">Grey</button><button type="button" role="radio" data-color="red" aria-checked="false">Red</button><button type="button" role="radio" data-color="blue" aria-checked="false">Blue</button></div></div>
            <label class="field"><span class="field-label">Strength</span><input type="range" min="12" max="70" value="30" name="opacity" class="d-range" aria-label="Strength"></label>
          </div>
        </div>

        <div class="d-redact" data-pages></div>
        <div class="d-go"><button class="btn btn-primary" type="button" data-save>Save protected copy</button></div>
        <p class="hint">The saved file is a flat picture of each page: covered parts are gone for good, the watermark can't be lifted off, and text can't be selected any more.</p>
      </div>
      <div data-out></div>
    </section>`;
  const work = root.querySelector('[data-work]');
  const host = root.querySelector('[data-pages]');
  const out = root.querySelector('[data-out]');
  const status = root.querySelector('[data-status]');
  const wmBox = root.querySelector('[data-wm]');
  const wmOn = root.querySelector('[data-wm-on]');
  const opts = { tiled: true, size: 'm', color: 'grey' };
  let file = null, pages = [], boxes = [], wordsCache = new Map();

  const wm = () => {
    if (!wmOn.checked) return null;
    const t = root.querySelector('[name=wmtext]').value.trim() || 'SALINAN';
    return { ...opts, opacity: Number(root.querySelector('[name=opacity]').value) / 100, text: root.querySelector('[name=date]').checked ? `${t}\n${todayText()}` : t };
  };
  // Page pictures shown on screen, with the watermark drawn in when it's on.
  let pvTimer;
  const drawPictures = () => {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      const o = wm();
      pages.forEach((pg, i) => {
        const img = host.querySelector(`[data-page="${i}"] img`);
        if (!img) return;
        const k = Math.min(1, 1400 / Math.max(pg.canvas.width, pg.canvas.height));
        const c = document.createElement('canvas');
        c.width = Math.round(pg.canvas.width * k); c.height = Math.round(pg.canvas.height * k);
        c.getContext('2d').drawImage(pg.canvas, 0, 0, c.width, c.height);
        if (o) stamp(c, o);
        img.src = c.toDataURL('image/jpeg', 0.85);
      });
    }, 150);
  };
  const drawBoxes = i => {
    const layer = host.querySelector(`[data-page="${i}"] .d-boxes`);
    const pg = pages[i];
    layer.innerHTML = boxes[i].map((b, k) => `<button type="button" class="d-box" data-box="${k}" style="left:${b.x / pg.canvas.width * 100}%;top:${b.y / pg.canvas.height * 100}%;width:${b.w / pg.canvas.width * 100}%;height:${b.h / pg.canvas.height * 100}%" aria-label="Covered area. Tap to remove."></button>`).join('');
  };
  const drawAll = () => pages.forEach((_, i) => drawBoxes(i));

  H.bindPicker(root, 'protect', async files => {
    file = files[0];
    out.innerHTML = '';
    work.hidden = true;
    if (pages.doc) L.closePdf(pages.doc);
    try {
      pages = await loadPages(file, (t, p) => H.progress(out, t, p));
      out.innerHTML = '';
      boxes = pages.map(() => []);
      wordsCache = new Map();
      status.textContent = '';
      host.innerHTML = pages.map((pg, i) => `
        <figure class="d-rpage" data-page="${i}">
          <img alt="Page ${i + 1}" draggable="false" style="aspect-ratio:${pg.canvas.width} / ${pg.canvas.height}">
          <div class="d-boxes"></div>
          ${pages.length > 1 ? `<figcaption>Page ${i + 1}</figcaption>` : ''}
        </figure>`).join('');
      work.hidden = false;
      drawPictures();
    } catch (err) { H.fail(out, err); }
  });

  // Drawing boxes with a finger or mouse
  let drag = null;
  host.addEventListener('pointerdown', e => {
    const fig = e.target.closest('[data-page]');
    if (!fig || e.target.closest('.d-box') || e.button > 0) return;
    const r = fig.querySelector('img').getBoundingClientRect();
    const i = Number(fig.dataset.page);
    const k = pages[i].canvas.width / r.width;
    drag = { i, r, k, x0: (e.clientX - r.left) * k, y0: (e.clientY - r.top) * k, el: document.createElement('div') };
    drag.el.className = 'd-box is-drawing';
    fig.querySelector('.d-boxes').appendChild(drag.el);
    fig.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  host.addEventListener('pointermove', e => {
    if (!drag) return;
    const { r, k, x0, y0, i } = drag;
    const x1 = Math.max(0, Math.min(r.width, e.clientX - r.left)) * k, y1 = Math.max(0, Math.min(r.height, e.clientY - r.top)) * k;
    drag.box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    const c = pages[i].canvas;
    Object.assign(drag.el.style, { left: drag.box.x / c.width * 100 + '%', top: drag.box.y / c.height * 100 + '%', width: drag.box.w / c.width * 100 + '%', height: drag.box.h / c.height * 100 + '%' });
  });
  const endDrag = () => {
    if (!drag) return;
    const { i, box, k } = drag;
    if (box && box.w > 8 * k && box.h > 6 * k) boxes[i].push(box);
    drag = null;
    drawBoxes(i);
  };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-box]');
    if (!b) return;
    const i = Number(b.closest('[data-page]').dataset.page);
    boxes[i].splice(Number(b.dataset.box), 1);
    drawBoxes(i);
  });

  // Finding text
  const cover = async (test, what) => {
    let found = 0;
    try {
      for (let i = 0; i < pages.length; i++) {
        if (!wordsCache.has(i)) {
          status.textContent = pages[i].doc ? `Looking through page ${i + 1}…` : `Reading page ${i + 1} (only slow the first time)…`;
          wordsCache.set(i, await pageWords(pages[i], p => { status.textContent = `Reading page ${i + 1}… ${Math.round(p * 100)}%`; }));
        }
        for (const w of wordsCache.get(i)) {
          if (!test(w.text)) continue;
          const pad = Math.max(3, w.h * 0.15);
          boxes[i].push({ x: w.x - pad, y: w.y - pad, w: w.w + pad * 2, h: w.h + pad * 2 });
          found++;
        }
      }
      drawAll();
      status.textContent = found ? `Covered ${found} ${found === 1 ? 'place' : 'places'}: ${what}. Check each page; tap a box to remove it.` : `Couldn't find ${what}. You can still draw boxes by hand.`;
    } catch (err) { status.textContent = err.message || "Couldn't search this file."; }
  };
  root.querySelector('[data-find]').addEventListener('submit', e => {
    e.preventDefault();
    const q = e.target.q.value.trim().toLowerCase();
    if (!q) return;
    const words = q.split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
    cover(t => { const n = t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); return n.length > 1 && words.some(w => n.includes(w) || (w.includes(n) && n.length >= 3)); }, `"${e.target.q.value.trim()}"`);
  });

  root.addEventListener('click', e => {
    const p = e.target.closest('[data-preset]');
    if (p) cover(PRESETS[p.dataset.preset].test, 'every ' + PRESETS[p.dataset.preset].label);
    if (e.target.closest('[data-clear]')) { boxes = pages.map(() => []); drawAll(); status.textContent = 'All boxes removed.'; }
    const o = e.target.closest('[data-tiled], [data-size], [data-color]');
    if (o) {
      const key = 'tiled' in o.dataset ? 'tiled' : 'size' in o.dataset ? 'size' : 'color';
      opts[key] = key === 'tiled' ? o.dataset.tiled === '1' : o.dataset[key];
      o.parentElement.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', String(x === o)));
      drawPictures();
    }
    const wp = e.target.closest('[data-wmp]');
    if (wp) { const ta = root.querySelector('[name=wmtext]'); ta.value = wp.dataset.wmp; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); drawPictures(); }
  });
  wmOn.addEventListener('change', () => { wmBox.hidden = !wmOn.checked; drawPictures(); });
  wmBox.addEventListener('input', drawPictures);
  wmBox.addEventListener('change', drawPictures);

  root.querySelector('[data-save]').addEventListener('click', async () => {
    const total = boxes.reduce((n, b) => n + b.length, 0);
    const o = wm();
    if (!total && !o) { status.textContent = 'Cover something or turn on the watermark first.'; status.scrollIntoView({ block: 'center' }); return; }
    try {
      H.progress(out, 'Saving…', null);
      const flat = pages.map((pg, i) => {
        const c = copyCanvas(pg.canvas);
        const g = c.getContext('2d');
        g.fillStyle = '#000';
        for (const b of boxes[i]) g.fillRect(Math.floor(b.x), Math.floor(b.y), Math.ceil(b.w) + 1, Math.ceil(b.h) + 1);
        if (o) stamp(c, o);
        return { canvas: c, w: pg.w, h: pg.h };
      });
      const res = await savePages(file, flat, 'protected');
      out.innerHTML = '';
      out.appendChild(L.resultCard(res.blob, res.name, [total ? `${total} ${total === 1 ? 'area' : 'areas'} covered` : '', o ? 'watermarked' : ''].filter(Boolean).join(' · ')));
    } catch (err) { H.fail(out, err); }
  });
}

/* ==========================================================
   Fit size: under an upload limit · ID photos
   ========================================================== */

const LIMITS = [100, 200, 300, 500, 1024, 2048];
const kb = n => (n >= 1024 ? `${+(n / 1024).toFixed(1)} MB` : `${n} KB`);
const ID = { '2x3': { w: 2, h: 3 }, '3x4': { w: 3, h: 4 }, '4x6': { w: 4, h: 6 } };

/** Smallest change that gets an image under `limit` bytes: quality first, then size. */
async function imageUnder(canvas, limit) {
  let c = canvas;
  for (let step = 0; step < 12; step++) {
    let lo = 0.35, hi = 0.95, best = null;
    for (let i = 0; i < 7; i++) {
      const q = (lo + hi) / 2;
      const b = await L.canvasBlob(c, 'image/jpeg', q);
      if (b.size <= limit) { best = b; lo = q; } else hi = q;
    }
    if (!best) { const b = await L.canvasBlob(c, 'image/jpeg', 0.35); if (b.size <= limit) best = b; }
    if (best) return { blob: best, w: c.width, h: c.height };
    c = L.toCanvas(c, Math.round(Math.max(c.width, c.height) * 0.8), '#fff');
    if (Math.max(c.width, c.height) < 300) break;
  }
  return null;
}

async function pdfUnder(file, limit, onProgress) {
  const doc = await L.openPdf(await L.readBytes(file));
  const { PDFDocument } = await L.pdfLib();
  try {
    for (const [dpi, q] of [[150, 0.8], [130, 0.7], [110, 0.62], [96, 0.55], [84, 0.48], [72, 0.42], [60, 0.38], [50, 0.34]]) {
      onProgress(`Trying ${dpi} dpi…`);
      const pdf = await PDFDocument.create();
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const vp1 = page.getViewport({ scale: 1 });
        const c = await L.renderPage(doc, p, dpi / 72);
        const jpg = await pdf.embedJpg(await L.blobBytes(await L.canvasBlob(c, 'image/jpeg', q)));
        pdf.addPage([vp1.width, vp1.height]).drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
        c.width = c.height = 0;
      }
      const blob = new Blob([await pdf.save({ useObjectStreams: true })], { type: 'application/pdf' });
      if (blob.size <= limit) return { blob, dpi };
    }
    return null;
  } finally { L.closePdf(doc); }
}

/** Compress → "Under a size limit". Mounts into `box`. */
export function renderLimit(box, H) {
  box.innerHTML = `
    <p class="d-intro">For upload forms that say "max 500 KB". Photos lose quality first, then size; PDFs become pictures, as sharp as the limit allows. Files already under the limit are left as they are.</p>
    <div class="field"><span class="field-label">Limit</span>
      <div class="choice-chips d-limits" role="radiogroup" aria-label="Size limit">
        ${LIMITS.map(n => `<button type="button" role="radio" data-limit="${n}" aria-checked="${n === 500}">${kb(n)}</button>`).join('')}
        <label class="d-custom">Other <input class="input" type="number" min="20" inputmode="numeric" placeholder="KB" data-custom aria-label="Other limit in KB"> KB</label>
      </div></div>
    ${H.picker('fit', { label: 'Choose photos or a PDF' })}
    <div data-out></div>`;
  const out = box.querySelector('[data-out]');
  let limitKb = 500;
  box.addEventListener('click', e => {
    const l = e.target.closest('[data-limit]');
    if (l) { limitKb = Number(l.dataset.limit); box.querySelector('[data-custom]').value = ''; box.querySelectorAll('[data-limit]').forEach(x => x.setAttribute('aria-checked', String(x === l))); }
  });
  box.querySelector('[data-custom]').addEventListener('input', e => {
    const v = Number(e.target.value);
    if (v >= 20) { limitKb = v; box.querySelectorAll('[data-limit]').forEach(x => x.setAttribute('aria-checked', 'false')); }
  });
  H.bindPicker(box, 'fit', async files => {
    const limit = limitKb * 1024;
    out.innerHTML = '';
    const results = [], notes = [];
    try {
      for (const f of files) {
        if (f.size <= limit) { results.push({ name: f.name, blob: f }); notes.push(`${f.name} was already ${L.fmtSize(f.size)}`); continue; }
        if (L.isPdf(f)) {
          const r = await pdfUnder(f, limit, t => H.progress(out, `${f.name}: ${t}`, null));
          if (!r) { notes.push(`${f.name} couldn't get under ${kb(limitKb)} without becoming unreadable. Try splitting it in Pages first.`); continue; }
          results.push({ name: `${L.baseName(f.name)}-${limitKb}kb.pdf`, blob: r.blob });
          notes.push(`${f.name}: ${L.fmtSize(f.size)} → ${L.fmtSize(r.blob.size)} (${r.dpi} dpi)`);
        } else if (L.isImage(f)) {
          H.progress(out, `Fitting ${f.name}…`, null);
          const r = await imageUnder(L.toCanvas(await L.decodeImage(f), 4000, '#fff'), limit);
          if (!r) { notes.push(`${f.name} couldn't get under ${kb(limitKb)}.`); continue; }
          results.push({ name: `${L.baseName(f.name)}-${limitKb}kb.jpg`, blob: r.blob });
          notes.push(`${f.name}: ${L.fmtSize(f.size)} → ${L.fmtSize(r.blob.size)}, ${r.w} × ${r.h} px`);
        } else notes.push(`${f.name} isn't a photo or PDF`);
      }
      out.innerHTML = notes.length ? `<ul class="d-notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
      if (results.length === 1) out.appendChild(L.resultCard(results[0].blob, results[0].name, `under ${kb(limitKb)}`));
      else if (results.length) out.appendChild(L.resultCard(await L.zipBlobs(results), `under-${limitKb}kb.zip`, `${results.length} files`));
    } catch (err) { H.fail(out, err); }
  });
}

/** Convert → "ID photo" panel. */
export function renderIdPhoto(root, H) {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>ID photo</h2></div>
      <p class="d-intro">Crop a photo to pas foto size, ready to upload or print. Drag to move it; use the slider to zoom.</p>
      <div class="field"><span class="field-label">Size</span>
        <div class="segmented seg-3" role="radiogroup" aria-label="Photo size">
          ${Object.keys(ID).map(k => `<button type="button" role="radio" data-id="${k}" aria-checked="${k === '3x4'}">${k.replace('x', ' × ')} cm</button>`).join('')}
        </div></div>
      ${H.picker('idp', { multiple: false, accept: 'image/*,.heic,.heif', label: 'Choose a photo' })}
      <div class="d-crop" data-crop hidden>
        <div class="d-crop-frame" data-frame><canvas></canvas></div>
        <label class="d-zoom"><span>Zoom</span><input type="range" min="100" max="400" value="100" data-zoom class="d-range" aria-label="Zoom"></label>
        <label class="check"><input type="checkbox" data-idlimit><span>Also keep it under 200 KB</span></label>
        <div class="d-go"><button class="btn btn-primary" type="button" data-idsave>Save photo</button></div>
      </div>
      <div data-out></div>
    </section>`;
  const out = root.querySelector('[data-out]');
  let idSize = '3x4';
  const frame = root.querySelector('[data-frame]');
  const cv = frame.querySelector('canvas');
  const zoomEl = root.querySelector('[data-zoom]');
  const crop = {
    img: null, x: 0, y: 0, z: 1,
    // view: the frame canvas shows the crop; img position is the crop's top-left in image pixels
    size() { const s = ID[idSize]; return { ar: s.w / s.h, outW: Math.round(s.w / 2.54 * 300), outH: Math.round(s.h / 2.54 * 300) }; },
    base() { const { ar } = this.size(); const iw = this.img.width, ih = this.img.height; return iw / ih > ar ? { w: ih * ar, h: ih } : { w: iw, h: iw / ar }; },
    view() { const b = this.base(); return { w: b.w / this.z, h: b.h / this.z }; },
    clamp() { const v = this.view(); this.x = Math.max(0, Math.min(this.img.width - v.w, this.x)); this.y = Math.max(0, Math.min(this.img.height - v.h, this.y)); },
    reset() { if (!this.img) return; this.z = 1; zoomEl.value = 100; const v = this.view(); this.x = (this.img.width - v.w) / 2; this.y = (this.img.height - v.h) / 4; this.clamp(); this.draw(); },
    draw() {
      if (!this.img) return;
      const { ar } = this.size();
      const W = Math.min(320, frame.parentElement.clientWidth - 20);
      cv.width = W * 2; cv.height = Math.round(W / ar) * 2;
      cv.style.width = W + 'px'; cv.style.height = Math.round(W / ar) + 'px';
      const v = this.view();
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(this.img, this.x, this.y, v.w, v.h, 0, 0, cv.width, cv.height);
    },
  };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    idSize = b.dataset.id;
    root.querySelectorAll('[data-id]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    crop.reset();
  });
  H.bindPicker(root, 'idp', async files => {
    out.innerHTML = '';
    try {
      crop.img = L.toCanvas(await L.decodeImage(files[0]), 3000, '#fff');
      root.querySelector('[data-crop]').hidden = false;
      crop.reset();
    } catch (err) { H.fail(out, err); }
  });
  zoomEl.addEventListener('input', () => {
    if (!crop.img) return;
    const v0 = crop.view(); const cx = crop.x + v0.w / 2, cy = crop.y + v0.h / 2;
    crop.z = Number(zoomEl.value) / 100;
    const v = crop.view(); crop.x = cx - v.w / 2; crop.y = cy - v.h / 2;
    crop.clamp(); crop.draw();
  });
  let pan = null;
  cv.addEventListener('pointerdown', e => { if (!crop.img) return; pan = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y }; cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove', e => {
    if (!pan) return;
    const k = crop.view().w / cv.clientWidth;
    crop.x = pan.cx - (e.clientX - pan.x) * k; crop.y = pan.cy - (e.clientY - pan.y) * k;
    crop.clamp(); crop.draw();
  });
  cv.addEventListener('pointerup', () => { pan = null; });
  cv.addEventListener('pointercancel', () => { pan = null; });
  root.querySelector('[data-idsave]').addEventListener('click', async () => {
    try {
      const { outW, outH } = crop.size();
      const c = document.createElement('canvas');
      c.width = outW; c.height = outH;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      const v = crop.view();
      g.drawImage(crop.img, crop.x, crop.y, v.w, v.h, 0, 0, outW, outH);
      let blob = await L.canvasBlob(c, 'image/jpeg', 0.92);
      if (root.querySelector('[data-idlimit]').checked && blob.size > 200 * 1024) blob = (await imageUnder(c, 200 * 1024)).blob;
      out.innerHTML = '';
      out.appendChild(L.resultCard(blob, `pas-foto-${idSize}.jpg`, `${idSize.replace('x', ' × ')} cm · ${outW} × ${outH} px (300 dpi)`));
    } catch (err) { H.fail(out, err); }
  });
}
