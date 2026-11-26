/* Document toolkit: merge, pages, compress, convert, text & OCR. */

import { mountHeader } from '../../assets/js/ui/header.js';
import { esc, toast } from '../../assets/js/ui/dom.js';
import * as L from './lib.js';

const main = document.getElementById('docs');
const tabs = document.querySelector('.tabs');
const VIEWS = ['merge', 'pages', 'compress', 'convert', 'text'];

const ICON = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
};

/* ---------- shared bits ---------- */

const state = { view: 'merge' };

function picker(id, { multiple = true, accept = 'application/pdf,image/*,.heic,.heif', label = 'Choose files', hint = '' } = {}) {
  return `
    <label class="d-drop" data-drop="${id}">
      <input type="file" ${multiple ? 'multiple' : ''} accept="${accept}" data-pick="${id}" hidden>
      <span class="d-drop-icon">${ICON.file}</span>
      <span class="d-drop-text"><strong>${esc(label)}</strong><small>${esc(hint || (multiple ? 'or drop them here' : 'or drop it here'))}</small></span>
    </label>`;
}

function progress(el, text, pct) {
  el.innerHTML = `<div class="d-progress"><span>${esc(text)}</span>${pct != null ? `<div class="d-bar"><i style="width:${Math.round(pct)}%"></i></div>` : '<span class="spinner" aria-hidden="true"></span>'}</div>`;
}

function fail(el, err) {
  console.error(err);
  el.innerHTML = `<p class="form-error">${esc(err && err.message ? err.message : String(err))}</p>`;
}

function bindPicker(root, id, onFiles) {
  const input = root.querySelector(`[data-pick="${id}"]`);
  const drop = root.querySelector(`[data-drop="${id}"]`);
  input.addEventListener('change', () => { if (input.files.length) onFiles([...input.files]); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
}

/* ==========================================================
   Merge: PDFs + images → one PDF
   ========================================================== */

const merge = { items: [] };   // { id, file, kind, pages, thumb }

function renderMerge(root) {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Merge into one PDF</h2></div>
      <p class="d-intro">Combine PDFs and photos in the order you want.</p>
      ${picker('merge', { label: 'Add PDFs or images' })}
      <ol class="d-files" data-list></ol>
      <div class="d-options" data-opts hidden>
        <label class="field"><span class="field-label">Image pages</span>
          <select class="input" data-imgpage><option value="fit">Same size as the photo</option><option value="a4">A4, photo centred</option></select></label>
      </div>
      <div class="d-go"><button class="btn btn-primary" type="button" data-go disabled>Merge</button></div>
      <div data-out></div>
    </section>`;
  const list = root.querySelector('[data-list]');
  const draw = () => {
    list.innerHTML = merge.items.map((it, i) => `
      <li class="d-file">
        <span class="d-thumb">${it.thumb ? `<img src="${it.thumb}" alt="">` : ICON.file}</span>
        <span class="d-file-main"><span class="d-name">${esc(it.file.name)}</span>
          <span class="d-meta">${it.kind === 'pdf' ? `${it.pages ?? '…'} page${it.pages === 1 ? '' : 's'}` : 'image'} · ${L.fmtSize(it.file.size)}</span></span>
        <span class="d-file-actions">
          <button class="icon-btn" type="button" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon-btn" type="button" data-down="${i}" aria-label="Move down" ${i === merge.items.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
          <button class="icon-btn" type="button" data-rm="${i}" aria-label="Remove">${ICON.x}</button>
        </span>
      </li>`).join('');
    root.querySelector('[data-go]').disabled = merge.items.length < 1;
    root.querySelector('[data-opts]').hidden = !merge.items.some(it => it.kind === 'image');
  };
  bindPicker(root, 'merge', async files => {
    for (const f of files) {
      const kind = L.isPdf(f) ? 'pdf' : L.isImage(f) ? 'image' : null;
      if (!kind) { toast(`${f.name} isn't a PDF or image`); continue; }
      const it = { id: Math.random(), file: f, kind, pages: null, thumb: null };
      merge.items.push(it);
      draw();
      try {
        if (kind === 'pdf') {
          const doc = await L.openPdf(await L.readBytes(f));
          it.pages = doc.numPages; it.thumb = await L.thumbUrl(doc, 1, 80); L.closePdf(doc);
        } else {
          const bmp = await L.decodeImage(f);
          it.thumb = L.toCanvas(bmp, 160).toDataURL('image/jpeg', 0.7);
        }
      } catch (e) { toast(e.message); merge.items = merge.items.filter(x => x !== it); }
      draw();
    }
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = Number(b.dataset.up ?? b.dataset.down ?? b.dataset.rm);
    if (b.dataset.up != null) [merge.items[i - 1], merge.items[i]] = [merge.items[i], merge.items[i - 1]];
    if (b.dataset.down != null) [merge.items[i + 1], merge.items[i]] = [merge.items[i], merge.items[i + 1]];
    if (b.dataset.rm != null) merge.items.splice(i, 1);
    draw();
  });
  root.querySelector('[data-go]').addEventListener('click', async e => {
    const btn = e.currentTarget, out = root.querySelector('[data-out]');
    btn.disabled = true;
    try {
      const { PDFDocument } = await L.pdfLib();
      const pdf = await PDFDocument.create();
      const a4 = root.querySelector('[data-imgpage]').value === 'a4';
      for (let n = 0; n < merge.items.length; n++) {
        const it = merge.items[n];
        progress(out, `Adding ${it.file.name}…`, (n / merge.items.length) * 100);
        await L.tick();
        if (it.kind === 'pdf') {
          const src = await PDFDocument.load(await L.readBytes(it.file), { ignoreEncryption: false });
          const pages = await pdf.copyPages(src, src.getPageIndices());
          pages.forEach(p => pdf.addPage(p));
        } else {
          await addImagePage(pdf, it.file, a4);
        }
      }
      progress(out, 'Saving…');
      const bytes = await pdf.save({ useObjectStreams: true });
      out.innerHTML = '';
      out.appendChild(L.resultCard(new Blob([bytes], { type: 'application/pdf' }), `${L.baseName(merge.items[0].file.name)}-merged.pdf`, `${pdf.getPageCount()} pages`));
    } catch (err) {
      fail(out, /encrypt/i.test(err.message) ? new Error('One of the PDFs is password-protected. Remove the password first.') : err);
    } finally { btn.disabled = false; }
  });
  draw();
}

async function addImagePage(pdf, file, a4, quality = 0.9, maxSide = 3000) {
  const bmp = await L.decodeImage(file);
  const png = /png$/i.test(file.type) || /\.png$/i.test(file.name);
  const c = L.toCanvas(bmp, maxSide, png ? null : '#fff');
  const bytes = await L.blobBytes(await L.canvasBlob(c, png ? 'image/png' : 'image/jpeg', quality));
  const img = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  // 1 px ≈ 0.75 pt keeps photos a sensible physical size
  let w = c.width * 0.75, h = c.height * 0.75;
  if (a4) {
    const pw = 595.28, ph = 841.89, m = 28;
    const k = Math.min((pw - 2 * m) / w, (ph - 2 * m) / h, 1);
    const page = pdf.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - w * k) / 2, y: (ph - h * k) / 2, width: w * k, height: h * k });
  } else {
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
}

/* ==========================================================
   Pages: pick, rotate, reorder, delete, extract
   ========================================================== */

const pages = { file: null, bytes: null, list: [], selected: new Set() };   // list: { src, rot, thumb }

function renderPages(root) {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Pages</h2></div>
      <p class="d-intro">Rotate, reorder, delete or pull out pages from a PDF. Tap pages to select them.</p>
      ${picker('pages', { multiple: false, accept: 'application/pdf', label: 'Choose a PDF' })}
      <div data-editor></div>
      <div data-out></div>
    </section>`;
  const ed = root.querySelector('[data-editor]');
  const out = root.querySelector('[data-out]');
  const draw = () => {
    if (!pages.file) { ed.innerHTML = ''; return; }
    const sel = pages.selected;
    ed.innerHTML = `
      <div class="d-pagebar">
        <span class="d-meta">${esc(pages.file.name)} · ${pages.list.length} page${pages.list.length === 1 ? '' : 's'}${sel.size ? ` · <strong>${sel.size} selected</strong>` : ''}</span>
        <span class="d-pagebar-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-a="all">${sel.size === pages.list.length ? 'Select none' : 'Select all'}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-a="rotate">${ICON.rotate}Rotate${sel.size ? '' : ' all'}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-a="left" ${sel.size ? '' : 'disabled'}>${ICON.left}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-a="right" ${sel.size ? '' : 'disabled'}>${ICON.right}</button>
          <button class="btn btn-ghost btn-sm danger-text" type="button" data-a="delete" ${sel.size && sel.size < pages.list.length ? '' : 'disabled'}>Delete</button>
        </span>
      </div>
      <ol class="d-pages">${pages.list.map((p, i) => `
        <li><button type="button" class="d-page ${sel.has(i) ? 'is-sel' : ''}" data-i="${i}" aria-pressed="${sel.has(i)}">
          <span class="d-page-img"><img src="${p.thumb}" alt="" style="transform:rotate(${p.rot}deg)${p.rot % 180 ? ' scale(.72)' : ''}"></span>
          <span class="d-page-n">${i + 1}${p.src !== i ? ` <small>(was ${p.src + 1})</small>` : ''}</span>
        </button></li>`).join('')}</ol>
      <div class="d-go">
        <button class="btn btn-ghost" type="button" data-save="selected" ${sel.size ? '' : 'disabled'}>Save selected as new PDF</button>
        <button class="btn btn-primary" type="button" data-save="all">Save PDF</button>
      </div>`;
  };
  bindPicker(root, 'pages', async ([f]) => {
    if (!L.isPdf(f)) return toast('Choose a PDF');
    out.innerHTML = ''; ed.innerHTML = '';
    try {
      progress(out, 'Opening…');
      const bytes = await L.readBytes(f);
      const doc = await L.openPdf(bytes);
      pages.file = f; pages.bytes = bytes; pages.list = []; pages.selected = new Set();
      for (let n = 1; n <= doc.numPages; n++) {
        progress(out, `Reading page ${n} of ${doc.numPages}…`, (n / doc.numPages) * 100);
        pages.list.push({ src: n - 1, rot: 0, thumb: await L.thumbUrl(doc, n, 160) });
      }
      L.closePdf(doc);
      out.innerHTML = '';
      draw();
    } catch (e) { fail(out, e); }
  });
  ed.addEventListener('click', async e => {
    const pg = e.target.closest('[data-i]');
    if (pg) { const i = Number(pg.dataset.i); pages.selected.has(i) ? pages.selected.delete(i) : pages.selected.add(i); return draw(); }
    const a = e.target.closest('[data-a]')?.dataset.a;
    const sel = [...pages.selected].sort((x, y) => x - y);
    if (a === 'all') pages.selected = pages.selected.size === pages.list.length ? new Set() : new Set(pages.list.map((_, i) => i));
    if (a === 'rotate') (sel.length ? sel : pages.list.map((_, i) => i)).forEach(i => { pages.list[i].rot = (pages.list[i].rot + 90) % 360; });
    if (a === 'delete') { pages.list = pages.list.filter((_, i) => !pages.selected.has(i)); pages.selected = new Set(); }
    if (a === 'left' && sel[0] > 0) {
      for (const i of sel) [pages.list[i - 1], pages.list[i]] = [pages.list[i], pages.list[i - 1]];
      pages.selected = new Set(sel.map(i => i - 1));
    }
    if (a === 'right' && sel[sel.length - 1] < pages.list.length - 1) {
      for (const i of [...sel].reverse()) [pages.list[i + 1], pages.list[i]] = [pages.list[i], pages.list[i + 1]];
      pages.selected = new Set(sel.map(i => i + 1));
    }
    if (a) draw();
    const s = e.target.closest('[data-save]')?.dataset.save;
    if (s) {
      const which = s === 'selected' ? sel.map(i => pages.list[i]) : pages.list;
      try {
        progress(out, 'Saving…');
        const { PDFDocument, degrees } = await L.pdfLib();
        const src = await PDFDocument.load(pages.bytes);
        const pdf = await PDFDocument.create();
        const copied = await pdf.copyPages(src, which.map(p => p.src));
        copied.forEach((p, k) => { p.setRotation(degrees((p.getRotation().angle + which[k].rot) % 360)); pdf.addPage(p); });
        const bytes = await pdf.save({ useObjectStreams: true });
        out.innerHTML = '';
        out.appendChild(L.resultCard(new Blob([bytes], { type: 'application/pdf' }),
          `${L.baseName(pages.file.name)}${s === 'selected' ? '-pages' : '-edited'}.pdf`, `${which.length} page${which.length === 1 ? '' : 's'}`));
      } catch (err) { fail(out, err); }
    }
  });
  draw();
}

/* ==========================================================
   Compress: images, and scanned PDFs
   ========================================================== */

const LEVELS = {
  light: { label: 'Light', side: 2560, q: 0.82, dpi: 150, pq: 0.75 },
  medium: { label: 'Medium', side: 1920, q: 0.72, dpi: 120, pq: 0.62 },
  strong: { label: 'Strong', side: 1280, q: 0.6, dpi: 96, pq: 0.5 },
};

function renderCompress(root) {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Compress</h2></div>
      <p class="d-intro">Make photos and PDFs smaller to send or upload.</p>
      ${picker('compress', { label: 'Choose photos or a PDF' })}
      <div class="field"><span class="field-label">How much</span>
        <div class="segmented seg-3" role="radiogroup" aria-label="Compression">
          ${Object.entries(LEVELS).map(([k, v]) => `<button type="button" role="radio" data-level="${k}" aria-checked="${k === 'medium'}">${v.label}</button>`).join('')}
        </div></div>
      <p class="hint">PDFs are compressed by turning each page into an image, which works well for scans and photos, but text in the result can't be selected or searched.</p>
      <div data-out></div>
    </section>`;
  let level = 'medium';
  root.querySelector('.seg-3').addEventListener('click', e => {
    const b = e.target.closest('[data-level]'); if (!b) return;
    level = b.dataset.level;
    root.querySelectorAll('[data-level]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  });
  const out = root.querySelector('[data-out]');
  bindPicker(root, 'compress', async files => {
    const L0 = LEVELS[level];
    out.innerHTML = '';
    const results = [];
    let before = 0, after = 0;
    try {
      for (let n = 0; n < files.length; n++) {
        const f = files[n];
        before += f.size;
        if (L.isPdf(f)) {
          const doc = await L.openPdf(await L.readBytes(f));
          const { PDFDocument } = await L.pdfLib();
          const pdf = await PDFDocument.create();
          for (let p = 1; p <= doc.numPages; p++) {
            progress(out, `${f.name}: page ${p} of ${doc.numPages}…`, (p / doc.numPages) * 100);
            const page = await doc.getPage(p);
            const vp1 = page.getViewport({ scale: 1 });
            const c = await L.renderPage(doc, p, L0.dpi / 72);
            const jpg = await pdf.embedJpg(await L.blobBytes(await L.canvasBlob(c, 'image/jpeg', L0.pq)));
            pdf.addPage([vp1.width, vp1.height]).drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
            c.width = c.height = 0;
          }
          L.closePdf(doc);
          const blob = new Blob([await pdf.save({ useObjectStreams: true })], { type: 'application/pdf' });
          if (blob.size >= f.size) { results.push({ name: f.name, blob: f, same: true }); after += f.size; }
          else { results.push({ name: `${L.baseName(f.name)}-small.pdf`, blob }); after += blob.size; }
        } else if (L.isImage(f)) {
          progress(out, `Compressing ${f.name}…`, (n / files.length) * 100);
          const c = L.toCanvas(await L.decodeImage(f), L0.side, '#fff');
          const blob = await L.canvasBlob(c, 'image/jpeg', L0.q);
          if (blob.size >= f.size && /jpe?g$/i.test(f.type)) { results.push({ name: f.name, blob: f, same: true }); after += f.size; }
          else { results.push({ name: `${L.baseName(f.name)}-small.jpg`, blob }); after += blob.size; }
        } else {
          toast(`${f.name} isn't a photo or PDF`);
        }
      }
      if (!results.length) { out.innerHTML = ''; return; }
      const saved = before ? Math.round((1 - after / before) * 100) : 0;
      out.innerHTML = `<p class="d-summary">${L.fmtSize(before)} → <strong>${L.fmtSize(after)}</strong>${saved > 0 ? ` · ${saved}% smaller` : ''}</p>`;
      if (results.some(r => r.same)) out.insertAdjacentHTML('beforeend', `<p class="hint">${results.filter(r => r.same).map(r => esc(r.name)).join(', ')} couldn't get any smaller at this level, so ${results.filter(r => r.same).length === 1 ? "it's" : "they're"} left as is.</p>`);
      if (results.length === 1) out.appendChild(L.resultCard(results[0].blob, results[0].name));
      else out.appendChild(L.resultCard(await L.zipBlobs(results), 'compressed.zip', `${results.length} files`));
    } catch (err) { fail(out, err); }
  });
}

/* ==========================================================
   Convert: PDF → images, images → images / PDF
   ========================================================== */

function renderConvert(root) {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Convert</h2></div>
      <p class="d-intro">PDF pages to images, photos to another format, or photos into a PDF.</p>
      ${picker('convert', { label: 'Choose a PDF or images' })}
      <div class="field-grid d-conv">
        <label class="field"><span class="field-label">Convert to</span>
          <select class="input" data-to>
            <option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="pdf">PDF (images only)</option>
          </select></label>
        <label class="field" data-res><span class="field-label">PDF page quality</span>
          <select class="input" data-dpi><option value="100">Screen (100 dpi)</option><option value="150" selected>Standard (150 dpi)</option><option value="300">Print (300 dpi)</option></select></label>
      </div>
      <p class="hint">For Word or Excel files, open them in Word, Pages or Google Docs and choose "Export as PDF"; converting those exactly needs the original app.</p>
      <div data-out></div>
    </section>`;
  const out = root.querySelector('[data-out]');
  bindPicker(root, 'convert', async files => {
    const to = root.querySelector('[data-to]').value;
    const dpi = Number(root.querySelector('[data-dpi]').value);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[to];
    const results = [];
    try {
      if (to === 'pdf') {
        const imgs = files.filter(L.isImage);
        if (!imgs.length) throw new Error('Choose images to make a PDF. To combine PDFs, use Merge.');
        const { PDFDocument } = await L.pdfLib();
        const pdf = await PDFDocument.create();
        for (let n = 0; n < imgs.length; n++) { progress(out, `Adding ${imgs[n].name}…`, (n / imgs.length) * 100); await addImagePage(pdf, imgs[n], false); }
        out.innerHTML = '';
        out.appendChild(L.resultCard(new Blob([await pdf.save()], { type: 'application/pdf' }), `${L.baseName(imgs[0].name)}.pdf`, `${imgs.length} pages`));
        return;
      }
      for (const f of files) {
        if (L.isPdf(f)) {
          const doc = await L.openPdf(await L.readBytes(f));
          for (let p = 1; p <= doc.numPages; p++) {
            progress(out, `${f.name}: page ${p} of ${doc.numPages}…`, (p / doc.numPages) * 100);
            const c = await L.renderPage(doc, p, dpi / 72);
            results.push({ name: `${L.baseName(f.name)}-page-${String(p).padStart(2, '0')}.${ext}`, blob: await L.canvasBlob(c, to, 0.9) });
            c.width = c.height = 0;
          }
          L.closePdf(doc);
        } else if (L.isImage(f)) {
          progress(out, `Converting ${f.name}…`);
          const c = L.toCanvas(await L.decodeImage(f), 0, to === 'image/jpeg' ? '#fff' : null);
          const blob = await L.canvasBlob(c, to, 0.92);
          if (to === 'image/webp' && blob.type !== 'image/webp') throw new Error("This browser can't make WebP images. Choose JPG or PNG.");
          results.push({ name: `${L.baseName(f.name)}.${ext}`, blob });
        }
      }
      out.innerHTML = '';
      if (!results.length) return;
      if (results.length === 1) out.appendChild(L.resultCard(results[0].blob, results[0].name));
      else out.appendChild(L.resultCard(await L.zipBlobs(results), `converted-${ext}.zip`, `${results.length} images`));
    } catch (err) { fail(out, err); }
  });
}

/* ==========================================================
   Text: copy text out of PDFs; OCR for scans and photos
   ========================================================== */

function renderText(root) {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Text &amp; OCR</h2></div>
      <p class="d-intro">Get the text out of a PDF, or read it from scans and photos.</p>
      ${picker('text', { label: 'Choose a PDF, scans or photos' })}
      <div class="field-grid">
        <label class="field"><span class="field-label">Language (for scans and photos)</span>
          <select class="input" data-lang><option value="ind+eng">Indonesian + English</option><option value="eng">English</option><option value="ind">Indonesian</option></select></label>
        <label class="field"><span class="field-label">PDFs</span>
          <select class="input" data-pdfmode><option value="auto">Use text inside (OCR if none)</option><option value="ocr">Always OCR (scans)</option></select></label>
      </div>
      <p class="hint">OCR downloads a reading engine (about 8 MB) the first time, then works offline.</p>
      <div data-out></div>
    </section>`;
  const out = root.querySelector('[data-out]');
  bindPicker(root, 'text', async files => {
    const langs = root.querySelector('[data-lang]').value;
    const mode = root.querySelector('[data-pdfmode]').value;
    const parts = [];
    let ocrUsed = false;
    const ocr = async (canvas, label) => {
      const w = await L.ocrWorker(langs, m => {
        if (m.status === 'recognizing text') progress(out, `${label}: reading text…`, m.progress * 100);
        else if (/loading|initializ/i.test(m.status)) progress(out, `Preparing OCR (${m.status})…`, m.progress != null ? m.progress * 100 : null);
      });
      ocrUsed = true;
      const { data } = await w.recognize(canvas);
      return (data.text || '').trim();
    };
    try {
      for (const f of files) {
        if (L.isPdf(f)) {
          const doc = await L.openPdf(await L.readBytes(f));
          const pagesText = [];
          for (let p = 1; p <= doc.numPages; p++) {
            const label = `${f.name} page ${p}/${doc.numPages}`;
            progress(out, `${label}…`, (p / doc.numPages) * 100);
            let txt = mode === 'auto' ? await L.pageText(doc, p) : '';
            if (txt.replace(/\s/g, '').length < 20) txt = await ocr(await L.renderPage(doc, p, 2), label);
            pagesText.push(txt);
          }
          L.closePdf(doc);
          parts.push({ name: f.name, text: pagesText.map((t, i) => (doc.numPages > 1 ? `— Page ${i + 1} —\n` : '') + t).join('\n\n') });
        } else if (L.isImage(f)) {
          const c = L.toCanvas(await L.decodeImage(f), 3000, '#fff');
          parts.push({ name: f.name, text: await ocr(c, f.name) });
        } else toast(`${f.name} isn't a PDF or image`);
      }
      const text = parts.map(p => (parts.length > 1 ? `=== ${p.name} ===\n` : '') + p.text).join('\n\n').trim();
      out.innerHTML = `
        <div class="d-text">
          <div class="d-text-head"><span class="d-meta">${text ? `${text.split(/\s+/).filter(Boolean).length} words` : 'No text found'}${ocrUsed ? ' · read with OCR, check for mistakes' : ''}</span>
            <span><button class="btn btn-ghost btn-sm" type="button" data-copy>${ICON.copy}Copy</button></span></div>
          <textarea class="input d-textarea" rows="12" spellcheck="false"></textarea>
        </div>`;
      out.querySelector('textarea').value = text;
      out.querySelector('[data-copy]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(out.querySelector('textarea').value); toast('Copied'); } catch (e) { toast('Select the text and copy it'); }
      });
      if (text) out.appendChild(L.resultCard(new Blob([out.querySelector('textarea').value], { type: 'text/plain' }), `${L.baseName(parts[0].name)}.txt`));
    } catch (err) { fail(out, err); }
  });
}

/* ---------- routing ---------- */

const RENDER = { merge: renderMerge, pages: renderPages, compress: renderCompress, convert: renderConvert, text: renderText };
const roots = {};

function onRoute() {
  const v = (location.hash || '').split('/')[1];
  state.view = VIEWS.includes(v) ? v : 'merge';
  tabs.querySelectorAll('[data-tab]').forEach(a => a.setAttribute('aria-current', a.dataset.tab === state.view ? 'page' : 'false'));
  // keep each tool's state while switching tabs
  for (const k of VIEWS) if (roots[k]) roots[k].hidden = k !== state.view;
  if (!roots[state.view]) {
    const el = document.createElement('div');
    el.className = 'view';
    main.appendChild(el);
    roots[state.view] = el;
    RENDER[state.view](el);
  }
}

addEventListener('hashchange', onRoute);
mountHeader();
onRoute();
