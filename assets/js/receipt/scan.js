/* ==========================================================
   Reading a receipt photo with OCR, on this device.
   The photo is cleaned up first (bigger, grey, more contrast),
   which helps a lot with thermal-paper receipts.
   ========================================================== */

import { ocrWorker } from '../../../tools/documents/lib.js';

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

/** Scale to ~1600px wide, greyscale, and stretch the contrast. */
export async function prepare(src) {
  const im = await loadImage(src);
  const w0 = im.naturalWidth, h0 = im.naturalHeight;
  // receipts are tall and narrow: aim for ~1600px across, at most 5000px long
  const s = Math.min(2.5, Math.max(0.4, 1600 / w0), 5000 / Math.max(w0, h0));
  const w = Math.round(w0 * s), h = Math.round(h0 * s);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = y; hist[y]++;
  }
  // stretch between the 2nd and 98th percentile
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

/** Reads the text on a receipt. onProgress(text, fraction | null). */
export async function readReceipt(src, onProgress = () => {}) {
  onProgress('Getting the photo ready…', null);
  const canvas = await prepare(src);
  let ready = false;
  const w = await ocrWorker('ind+eng', m => {
    if (m.status === 'recognizing text') { ready = true; onProgress('Reading the receipt…', m.progress); }
    else if (!ready) onProgress(/load|download/i.test(m.status) ? 'Getting the reader ready (only slow the first time)…' : 'Getting the reader ready…', m.progress ?? null);
  });
  await w.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
  const { data } = await w.recognize(canvas);
  return data.text || '';
}
