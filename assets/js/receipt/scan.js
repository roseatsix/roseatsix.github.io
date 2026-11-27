/* ==========================================================
   Reading a receipt photo with OCR, on this device.

   1. Crop to the receipt: the paper is bright and colourless,
      a table or hand around it isn't.
   2. Clean up: bigger, grey, contrast stretched.
   3. Read it, and rebuild the lines from word positions so an item
      and a price far to its right end up on the same line.
   4. If the items don't add up to the printed total, read it again
      in other ways (other page layouts, or every word wherever it
      is) and keep the reading that adds up best.
   ========================================================== */

import { ocrWorker } from '../../../tools/documents/lib.js';
import { parseReceipt, check } from './parse.js';

async function loadImage(src) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    return await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("That photo couldn't be opened."));
      im.src = url;
    });
  } finally {
    if (typeof src !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Where the receipt is: the biggest bright, low-colour area. Returns a box in image pixels, or null. */
export function findPaper(im) {
  const W = 320, k = W / im.naturalWidth, H = Math.round(im.naturalHeight * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  // brightness threshold from the image itself (paper is among the brightest parts)
  const lum = new Uint8Array(W * H);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) { const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; lum[p] = y; hist[y]++; }
  let acc = 0, p70 = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= W * H * 0.7) { p70 = v; break; } }
  const thr = Math.max(110, Math.min(200, p70 - 25));
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    mask[p] = lum[p] >= thr && mx - mn < 55 ? 1 : 0;
  }
  const run = (n, frac) => {          // longest run of indices whose fraction passes, allowing small gaps
    let best = [0, -1], s = -1, gap = 0;
    for (let i = 0; i <= n; i++) {
      const on = i < n && frac(i) > 0.3;
      if (on) { if (s < 0) s = i; gap = 0; }
      else if (s >= 0 && ++gap > n * 0.03) { const e = i - gap; if (e - s > best[1] - best[0]) best = [s, e]; s = -1; gap = 0; }
    }
    return best;
  };
  const rows = run(H, y => { let n = 0; for (let x = 0; x < W; x++) n += mask[y * W + x]; return n / W; });
  if (rows[1] - rows[0] < H * 0.2) return null;
  const cols = run(W, x => { let n = 0; for (let y = rows[0]; y <= rows[1]; y++) n += mask[y * W + x]; return n / (rows[1] - rows[0] + 1); });
  if (cols[1] - cols[0] < W * 0.2) return null;
  const area = (cols[1] - cols[0]) * (rows[1] - rows[0]) / (W * H);
  if (area > 0.92) return null;                       // already just the receipt
  const m = 0.02;
  const x0 = Math.max(0, cols[0] / W - m), x1 = Math.min(1, cols[1] / W + m);
  const y0 = Math.max(0, rows[0] / H - m), y1 = Math.min(1, rows[1] / H + m);
  return { x: x0 * im.naturalWidth, y: y0 * im.naturalHeight, w: (x1 - x0) * im.naturalWidth, h: (y1 - y0) * im.naturalHeight };
}

/** Crop to the paper, scale to ~1600px wide, greyscale, and stretch the contrast. */
export async function prepare(src, width = 1600) {
  const im = await loadImage(src);
  const box = findPaper(im) || { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
  // receipts are tall and narrow: aim for `width` across (1600 by default), at most 3.2× that long
  const s = Math.min(3, Math.max(0.4, width / box.w), (width * 3.2) / Math.max(box.w, box.h));
  const w = Math.round(box.w * s), h = Math.round(box.h * s);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, box.x, box.y, box.w, box.h, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = y; hist[y]++;
  }
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.max(0, Math.min(255, (d[i] - lo) * 255 / span));
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Words with boxes, from tesseract's result (whatever shape this version returns). */
function wordsOf(data) {
  const out = [];
  const add = w => { if (w && w.text && w.text.trim() && w.bbox) out.push({ text: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, conf: w.confidence ?? 100 }); };
  if (Array.isArray(data.words) && data.words.length) data.words.forEach(add);
  else for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) add(w);
  return out;
}

/** How much the text lines slope (a tilted photo): the median slope of the long lines' baselines. */
function slopeOf(data) {
  const s = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const bl = l.baseline;
    if (bl && bl.x1 - bl.x0 > 200) s.push((bl.y1 - bl.y0) / (bl.x1 - bl.x0));
  }
  if (!s.length) return 0;
  s.sort((a, b) => a - b);
  const m = s[s.length >> 1];
  return Math.abs(m) < 0.2 ? m : 0;
}

/** Put words back into lines by their height on the page, left to right. */
export function rebuildLines(words, slope = 0) {
  // height on the page, measured along the tilt, so a far-right price stays with its line
  const ws = words.filter(w => w.conf > 15 || /\d/.test(w.text)).map(w => ({ ...w, yc: (w.y0 + w.y1) / 2 - slope * (w.x0 + w.x1) / 2, h: w.y1 - w.y0 }))
    .sort((a, b) => a.yc - b.yc);
  const rows = [];
  for (const w of ws) {
    const row = rows.find(r => Math.abs(r.yc - w.yc) < 0.55 * Math.min(r.h, w.h) + 1);
    if (row) { row.words.push(w); row.yc = (row.yc * (row.words.length - 1) + w.yc) / row.words.length; row.h = Math.max(row.h, w.h); }
    else rows.push({ yc: w.yc, h: w.h, words: [w] });
  }
  rows.sort((a, b) => a.yc - b.yc);
  // The text's left margin: where most lines start. Short scraps further
  // left are specks or shadows at the paper's edge, not text.
  rows.forEach(r => r.words.sort((a, b) => a.x0 - b.x0));
  const starts = rows.filter(r => r.words.length >= 2).map(r => r.words[0].x0).sort((a, b) => a - b);
  if (starts.length >= 4) {
    const margin = starts[Math.floor(starts.length * 0.3)];
    for (const r of rows) {
      const cw = (r.words[0].x1 - r.words[0].x0) / Math.max(1, r.words[0].text.length);
      while (r.words.length > 1 && r.words[0].text.replace(/[^\p{L}\p{N}]/gu, '').length <= 2 && r.words[0].x1 < margin - cw * 0.3 && !/^\d/.test(r.words[0].text)) r.words.shift();
    }
  }
  const lines = [];
  let lastY = null, lineH = null;
  for (const r of rows) {
    const cw = r.words.reduce((n, w) => n + (w.x1 - w.x0), 0) / Math.max(1, r.words.reduce((n, w) => n + w.text.length, 0));
    let s = '';
    r.words.forEach((w, i) => { if (i) s += (w.x0 - r.words[i - 1].x1) > cw * 2.5 ? '   ' : ' '; s += w.text; });
    if (lastY != null && r.yc - lastY > (lineH || r.h) * 2.2) lines.push('');   // keep paragraph gaps
    lines.push(s);
    lastY = r.yc; lineH = r.h;
  }
  return lines.join('\n');
}

/** How well a reading worked: does it add up to the printed total? (lower is better) */
function badness(text) {
  const r = parseReceipt(text);
  const c = check({ ...r });
  if (!r.items.length) return 1e12;
  // How far the items are from a total printed on the receipt (one worked out from the items
  // always "matches"), as a share of it, so a big receipt nearly right beats a small misreading.
  // A printed subtotal that matches is nearly as good: the grand total itself may be misread.
  const off = Math.min(r.totalPrinted ? Math.abs(c.diff) / Math.max(1, r.total) : 1,
    r.subtotal != null ? Math.abs(r.subtotal - c.sum) / Math.max(1, r.subtotal) + 0.0001 : 1);
  // then more items, but only believable ones: Rupiah prices are whole hundreds, names have words
  const fine = it => (it.price * it.qty) % 100 === 0 && /\p{L}{3,}/u.test(it.name) && !/\d{4,}/.test(it.name);
  const good = r.items.filter(fine).length;
  return off * 1e6 - good + 2 * (r.items.length - good);
}

/** Reads the text on a receipt → { text, unclear }. onProgress(text, fraction | null). */
export async function readReceipt(src, onProgress = () => {}) {
  onProgress('Getting the photo ready…', null);
  const sizes = {};
  const canvasAt = async width => sizes[width] || (sizes[width] = await prepare(src, width));
  let ready = false, pass = 0;
  const w = await ocrWorker('ind+eng', m => {
    if (m.status === 'recognizing text') { ready = true; onProgress(pass > 1 ? 'Reading it again another way…' : 'Reading the receipt…', m.progress); }
    else if (!ready) onProgress(/load|download/i.test(m.status) ? 'Getting the reader ready (only slow the first time)…' : 'Getting the reader ready…', m.progress ?? null);
  });
  // Try the usual layout reading first; if the items don't add up to the
  // printed total, try other ways of finding the text and keep the best.
  let best = null;
  // 4: columns of text · 6: one block (tight or tilted receipts) · straightened · smaller
  // (condensed print reads better) · 11: every word wherever it is
  const ways = [['4', false, 1600], ['6', false, 1600], ['6', true, 1600], ['4', false, 1200], ['6', true, 1200], ['11', false, 1600]];
  for (const [psm, rotateAuto, width] of ways) {
    pass++;
    await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
    const { data } = await w.recognize(await canvasAt(width), { rotateAuto }, { text: true, blocks: true });
    const words = wordsOf(data);
    // (in mode 11 the plain text is one word per line: only the rebuilt lines make sense)
    for (const text of [psm === '11' ? '' : data.text || '', words.length ? rebuildLines(words, slopeOf(data)) : ''].filter(Boolean)) {
      const score = badness(text);
      if (!best || score < best.score) best = { text, score, confidence: data.confidence ?? 100 };
    }
    if (best && best.score < 300) break;         // adds up (within 0.03%, a little rounding): done
  }
  // unclear: the reader wasn't sure of much of it, or nothing it read adds up to a printed total
  // (a reading that adds up to the printed total is trusted, even if the reader was unsure of some words)
  return best ? { text: best.text, unclear: best.score > 5e4 || (best.confidence < 60 && best.score > 300) } : { text: '', unclear: true };
}
