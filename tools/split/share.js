/* Summary picture + text for sending a split to friends. */

import * as M from './model.js';

const hexToRgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return `rgb(${x.map((v, i) => Math.round(v * t + y[i] * (1 - t))).join(',')})`; };

function palette() {
  const T = window.RAS_THEME;
  const c = T ? T.resolved(T.read()) : { bgLight: '#F5EFE6', textLight: '#3B302B', flower: '#C27A6E', leaf: '#7F8E6B', sun: '#C1914F' };
  return {
    bg: c.bgLight, card: mix('#ffffff', c.bgLight, 0.6), text: c.textLight, muted: mix(c.textLight, c.bgLight, 0.62),
    line: mix(c.textLight, c.bgLight, 0.12), flower: c.flower, flowerDeep: mix(c.flower, c.textLight, 0.7),
    leaf: c.leaf, soft: mix(c.flower, '#ffffff', 0.16), leafSoft: mix(c.leaf, '#ffffff', 0.18),
  };
}

/* ---------- what goes on the summary ----------
   One list of rows feeds both the picture and the text.
   forId: null = the whole split for everyone; a person id = just theirs. */

function itemsLine(t, r, pid) {
  if ((r.mode || 'even') !== 'items') {
    const ids = Object.keys(t.people || {});
    const n = (r.sharedBy || []).filter(id => ids.includes(id)).length || ids.length;
    return n > 1 ? `split ${n} ways` : '';
  }
  const ids = Object.keys(t.people || {});
  return M.itemsOf(r).filter(i => { const w = (i.sharedBy || []).filter(id => ids.includes(id)); return !w.length || w.includes(pid); })
    .map(i => { const w = (i.sharedBy || []).filter(id => ids.includes(id)); const n = w.length || ids.length; return (i.name || 'Item') + (n > 1 ? ` (shared by ${n})` : ''); })
    .join(', ');
}

export function summaryRows(t, forId = null) {
  const c = M.tripCalc(t);
  const people = M.peopleOf(t);
  const rows = [{ k: 'title', text: t.title || 'Split' }];
  if (!forId) {
    rows.push({ k: 'sub', text: [M.dateRange(t), `${people.length} people`, `total ${M.money(c.total)}`].filter(Boolean).join('  ·  ') });
    rows.push({ k: 'h', text: 'Receipts' });
    for (const { r, c: rc } of c.receipts) rows.push({ k: 'line', name: r.shop || 'Receipt', sub: `paid by ${M.nameOf(t, r.paidBy)}${M.isDate(r.date) ? ' · ' + M.fmt.short(r.date) : ''}`, amount: M.money(rc.total) });
    rows.push({ k: 'h', text: 'Each person' });
    for (const p of people) rows.push({ k: 'line', name: p.name, sub: c.paid[p.id] ? `paid ${M.money(c.paid[p.id])}` : '', amount: M.money(c.owed[p.id]) });
    if (c.transfers.length) {
      rows.push({ k: 'h', text: 'Settle up' });
      for (const x of c.transfers) rows.push({ k: 'transfer', text: `${M.nameOf(t, x.from)}  →  ${M.nameOf(t, x.to)}`, amount: M.money(x.amount), done: x.done });
    }
    return rows;
  }
  const name = M.nameOf(t, forId);
  rows.push({ k: 'sub', text: [`For ${name}`, M.dateRange(t)].filter(Boolean).join('  ·  ') });
  rows.push({ k: 'big', label: `${name}’s share`, amount: M.money(c.owed[forId]), note: c.paid[forId] ? `paid ${M.money(c.paid[forId])} already` : '' });
  const mine = c.receipts.filter(({ c: rc }) => rc.shares[forId]);
  if (mine.length) {
    rows.push({ k: 'h', text: 'What it’s for' });
    for (const { r, c: rc } of mine) rows.push({ k: 'line', name: r.shop || 'Receipt', sub: [M.isDate(r.date) ? M.fmt.short(r.date) : '', itemsLine(t, r, forId)].filter(Boolean).join(' · '), amount: M.money(rc.shares[forId]) });
  }
  const mineX = c.transfers.filter(x => x.from === forId || x.to === forId);
  rows.push({ k: 'h', text: 'Settle up' });
  if (!mineX.length) rows.push({ k: 'line', name: 'All square', sub: '', amount: '' });
  for (const x of mineX) rows.push({ k: 'transfer', text: x.from === forId ? `Pay ${M.nameOf(t, x.to)}` : `${M.nameOf(t, x.from)} pays you`, amount: M.money(x.amount), done: x.done });
  return rows;
}

/** Plain-text summary for chat apps. */
export function summaryText(t, forId = null) {
  const L = [];
  for (const r of summaryRows(t, forId)) {
    if (r.k === 'title') L.push(r.text);
    if (r.k === 'sub') L.push(r.text.replace(/  ·  /g, ' · '));
    if (r.k === 'big') L.push('', `${r.label}: ${r.amount}${r.note ? ` (${r.note})` : ''}`);
    if (r.k === 'h') L.push('', r.text + ':');
    if (r.k === 'line') L.push(`• ${r.name}${r.amount ? ': ' + r.amount : ''}${r.sub ? ` (${r.sub})` : ''}`);
    if (r.k === 'transfer') L.push(`• ${r.text.replace(/  →  /, ' → ')}: ${r.amount}${r.done ? ' ✓' : ''}`);
  }
  return L.join('\n');
}

/** Draws the summary picture; resolves to a PNG Blob. */
export async function summaryImage(t, forId = null) {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const P = palette();
  const W = 1080, PAD = 64, IN = 56;
  // Always give a fallback: fonts.check() is true even for fonts that aren't loaded.
  // the theme's own fonts (Rose: Fraunces + Nunito Sans)
  const css = getComputedStyle(document.documentElement);
  const serif = css.getPropertyValue('--font-display').trim() || 'Georgia, serif';
  const sans = css.getPropertyValue('--font-body').trim() || 'system-ui, sans-serif';

  const rows = summaryRows(t, forId);
  const hOf = r => ({ title: 78, sub: 52, big: r.note ? 190 : 160, h: 82, line: r.sub ? 76 : 60, transfer: 66 })[r.k];
  const contentH = rows.reduce((n, r) => n + hOf(r), 0);
  const height = PAD * 2 + IN * 2 + contentH + 70;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = height;
  const g = cv.getContext('2d');

  // background + card
  g.fillStyle = P.bg; g.fillRect(0, 0, W, height);
  const grad = g.createRadialGradient(W, 0, 10, W, 0, 700);
  grad.addColorStop(0, P.soft); grad.addColorStop(1, P.soft.replace('rgb(', 'rgba(').replace(')', ',0)'));
  g.fillStyle = grad; g.fillRect(0, 0, W, height);
  const cardH = height - PAD * 2 - 50;
  g.fillStyle = P.card;
  g.beginPath(); g.roundRect(PAD, PAD, W - PAD * 2, cardH, 40); g.fill();
  g.strokeStyle = P.line; g.lineWidth = 2; g.stroke();

  const L = PAD + IN, R = W - PAD - IN;
  let y = PAD + IN;
  const text = (s, x, yy, font, color, align = 'left') => { g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(s, x, yy); };
  const fit = (s, max, font) => { g.font = font; if (g.measureText(s).width <= max) return s; while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  const width = (s, font) => { g.font = font; return g.measureText(s).width; };

  for (const row of rows) {
    const k = row.k, h = hOf(row);
    if (k === 'title') text(fit(row.text, R - L, `500 60px ${serif}`), L, y + 58, `500 60px ${serif}`, P.text);
    if (k === 'sub') text(fit(row.text, R - L, `600 30px ${sans}`), L, y + 36, `600 30px ${sans}`, P.muted);
    if (k === 'big') {
      g.fillStyle = P.soft; g.beginPath(); g.roundRect(L - 12, y + 16, R - L + 24, h - 24, 24); g.fill();
      text(row.label.toUpperCase(), L + 12, y + 62, `800 24px ${sans}`, P.flowerDeep);
      text(fit(row.amount, R - L - 24, `600 64px ${serif}`), L + 12, y + 128, `600 64px ${serif}`, P.text);
      if (row.note) text(row.note, L + 12, y + 168, `600 26px ${sans}`, P.muted);
    }
    if (k === 'h') {
      g.fillStyle = P.flower; g.beginPath(); g.arc(L + 8, y + 50, 8, 0, Math.PI * 2); g.fill();
      text(row.text.toUpperCase(), L + 28, y + 60, `800 26px ${sans}`, P.flowerDeep);
      g.strokeStyle = P.line; g.lineWidth = 2; g.beginPath(); g.moveTo(L, y + h - 4); g.lineTo(R, y + h - 4); g.stroke();
    }
    if (k === 'line') {
      const amtW = row.amount ? width(row.amount, `700 32px ${sans}`) + 32 : 0;
      text(fit(row.name, R - L - amtW, `700 32px ${sans}`), L, y + 42, `700 32px ${sans}`, P.text);
      if (row.sub) text(fit(row.sub, R - L - amtW, `500 24px ${sans}`), L, y + 70, `500 24px ${sans}`, P.muted);
      if (row.amount) text(row.amount, R, y + 44, `700 32px ${sans}`, P.text, 'right');
    }
    if (k === 'transfer') {
      g.fillStyle = row.done ? P.leafSoft : P.soft;
      g.beginPath(); g.roundRect(L - 12, y + 6, R - L + 24, h - 12, 18); g.fill();
      const amt = (row.done ? '✓ ' : '') + row.amount;
      text(fit(row.text, R - L - width(amt, `800 32px ${sans}`) - 40, `700 31px ${sans}`), L + 8, y + 45, `700 31px ${sans}`, P.text);
      text(amt, R - 8, y + 45, `800 32px ${sans}`, row.done ? P.leaf : P.flowerDeep, 'right');
    }
    y += h;
  }

  // footer
  text('rose at six · bill splitter', W / 2, height - PAD + 4, `600 24px ${sans}`, P.muted, 'center');

  return new Promise(resolve => cv.toBlob(b => resolve(b), 'image/png'));
}

/** Share the picture through the phone's share sheet, or download it. */
export async function shareImage(t, blob, forName = '') {
  const name = `${[t.title || 'split', forName].filter(Boolean).join(' ').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'split'}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: t.title || 'Split' }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
