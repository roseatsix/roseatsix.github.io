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

/** Plain-text summary for chat apps. */
export function summaryText(t) {
  const c = M.tripCalc(t);
  const L = [];
  L.push(`${t.title || 'Split'}${M.dateRange(t) ? ' · ' + M.dateRange(t) : ''}`);
  L.push(`Total ${M.money(c.total)}`, '');
  for (const { r, c: rc } of c.receipts) L.push(`• ${r.shop || 'Receipt'}: ${M.money(rc.total)} (paid by ${M.nameOf(t, r.paidBy)})`);
  L.push('', 'Each person’s share:');
  for (const p of M.peopleOf(t)) L.push(`• ${p.name}: ${M.money(c.owed[p.id])}`);
  if (c.transfers.length) {
    L.push('', 'Settle up:');
    for (const x of c.transfers) L.push(`• ${M.nameOf(t, x.from)} → ${M.nameOf(t, x.to)}: ${M.money(x.amount)}${x.done ? ' ✓' : ''}`);
  }
  if ((t.payTo || '').trim()) L.push('', `Pay to: ${t.payTo.trim()}`);
  return L.join('\n');
}

/** Draws the summary picture; resolves to a PNG Blob. */
export async function summaryImage(t) {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const P = palette();
  const c = M.tripCalc(t);
  const people = M.peopleOf(t);
  const W = 1080, PAD = 64, IN = 56;
  // Always give a fallback: fonts.check() is true even for fonts that aren't loaded.
  const serif = 'Fraunces, Georgia, "Times New Roman", serif';
  const sans = '"Nunito Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // Rows to draw: [kind, ...]
  const rows = [];
  rows.push(['title']);
  rows.push(['sub']);
  rows.push(['gap', 18]);
  rows.push(['h', 'Receipts']);
  for (const { r, c: rc } of c.receipts) rows.push(['receipt', r, rc]);
  rows.push(['gap', 14]);
  rows.push(['h', 'Each person']);
  for (const p of people) rows.push(['person', p]);
  if (c.transfers.length) {
    rows.push(['gap', 14]);
    rows.push(['h', 'Settle up']);
    for (const x of c.transfers) rows.push(['transfer', x]);
  }
  if ((t.payTo || '').trim()) { rows.push(['gap', 14]); rows.push(['payto']); }
  const H = { title: 78, sub: 52, h: 64, receipt: 74, person: 62, transfer: 66, payto: 120 };
  const contentH = rows.reduce((n, r) => n + (r[0] === 'gap' ? r[1] : H[r[0]]), 0);
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

  for (const row of rows) {
    const k = row[0];
    if (k === 'gap') { y += row[1]; continue; }
    if (k === 'title') { text(fit(t.title || 'Split', R - L, `500 60px ${serif}`), L, y + 58, `500 60px ${serif}`, P.text); }
    if (k === 'sub') {
      const bits = [M.dateRange(t), `${people.length} people`, `total ${M.money(c.total)}`].filter(Boolean).join('  ·  ');
      text(fit(bits, R - L, `600 30px ${sans}`), L, y + 36, `600 30px ${sans}`, P.muted);
    }
    if (k === 'h') {
      g.fillStyle = P.flower; g.beginPath(); g.arc(L + 8, y + 40, 8, 0, Math.PI * 2); g.fill();
      text(row[1].toUpperCase(), L + 28, y + 50, `800 26px ${sans}`, P.flowerDeep);
      g.strokeStyle = P.line; g.lineWidth = 2; g.beginPath(); g.moveTo(L, y + H.h - 4); g.lineTo(R, y + H.h - 4); g.stroke();
    }
    if (k === 'receipt') {
      const [, r, rc] = row;
      text(fit(r.shop || 'Receipt', R - L - 260, `700 32px ${sans}`), L, y + 40, `700 32px ${sans}`, P.text);
      text(fit(`paid by ${M.nameOf(t, r.paidBy)}${M.isDate(r.date) ? ' · ' + M.fmt.short(r.date) : ''}`, R - L - 260, `500 24px ${sans}`), L, y + 68, `500 24px ${sans}`, P.muted);
      text(M.money(rc.total), R, y + 44, `700 32px ${sans}`, P.text, 'right');
    }
    if (k === 'person') {
      const p = row[1];
      text(fit(p.name + (p.me ? ' (me)' : ''), R - L - 300, `600 32px ${sans}`), L, y + 42, `600 32px ${sans}`, P.text);
      text(M.money(c.owed[p.id]), R, y + 42, `700 32px ${sans}`, P.text, 'right');
    }
    if (k === 'transfer') {
      const x = row[1];
      g.fillStyle = x.done ? P.leafSoft : P.soft;
      g.beginPath(); g.roundRect(L - 12, y + 6, R - L + 24, H.transfer - 12, 18); g.fill();
      const who = `${M.nameOf(t, x.from)}  →  ${M.nameOf(t, x.to)}`;
      text(fit(who, R - L - 320, `700 31px ${sans}`), L + 8, y + 45, `700 31px ${sans}`, P.text);
      text((x.done ? '✓ ' : '') + M.money(x.amount), R - 8, y + 45, `800 32px ${sans}`, x.done ? P.leaf : P.flowerDeep, 'right');
    }
    if (k === 'payto') {
      g.fillStyle = P.leafSoft; g.beginPath(); g.roundRect(L - 12, y, R - L + 24, H.payto - 12, 20); g.fill();
      text('PAY TO', L + 8, y + 40, `800 22px ${sans}`, P.muted);
      text(fit(t.payTo.trim(), R - L - 16, `700 32px ${sans}`), L + 8, y + 84, `700 32px ${sans}`, P.text);
    }
    y += H[k];
  }

  // footer
  text('rose at six · bill splitter', W / 2, height - PAD + 4, `600 24px ${sans}`, P.muted, 'center');

  return new Promise(resolve => cv.toBlob(b => resolve(b), 'image/png'));
}

/** Share the picture through the phone's share sheet, or download it. */
export async function shareImage(t, blob) {
  const name = `${(t.title || 'split').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'split'}.png`;
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
