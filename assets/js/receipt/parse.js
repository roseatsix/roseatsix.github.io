/* ==========================================================
   Receipt text → { shop, date, items, service, tax, discount, total }.

   Works on the plain text the OCR reads from a photo. Receipts
   differ a lot, so this is a best guess that the review screen
   lets you correct. Written for Indonesian receipts (Rupiah,
   Indonesian words), but also understands English ones.
   ========================================================== */

const MONTHS = { jan: 1, feb: 2, peb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, nop: 11, des: 12, dec: 12 };

const RE = {
  // money: 25.000 · 25,000 · 125.000,00 · Rp25.000 · 25000 · 1.250.000
  money: /(?<![a-z\d.,])(?:rp\.?\s*)?(-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d{3,9}(?:[.,]\d{1,2})?)(?![\d.,]*[a-z\d])/gi,
  total: /\b(grand\s*total|total\s*(bayar|belanja|tagihan|harga|pembayaran)?|jumlah(\s*bayar)?|amount\s*due|tagihan)\b/i,
  subtotal: /\bsub\s*[-.]?\s*total\b/i,
  tax: /\b(ppn|pb\s*1|pbi|pajak|tax|vat)\b/i,
  service: /\b(service|serv\.?|svc|s\.?c\.?|layanan|serv\s*charge)\b/i,
  discount: /\b(disc(ount)?|diskon|potongan|promo|voucher|hemat|member\s*disc)\b/i,
  rounding: /\b(pembulatan|rounding)\b/i,
  skip: /\b(tunai|cash|kembali(an)?|change|kartu|card|debit|kredit|credit|qris|ovo|gopay|go-pay|dana|shopee\s*pay|linkaja|edc|bayar|payment|paid|npwp|telp|tlp|tel|phone|hp|wa|kasir|cashier|struk|nota|trx|no\.?\s*(trans|bon|meja|order)|terima\s*kasih|thank|www|\.com|instagram|ig\b|jl\.?|jalan|meja|table|order\s*no|pax|tamu|guest|item\(s\)|qty\s*total|total\s*item|total\s*qty|dpp|harga\s*jual|order|antrian|queue|ref\b)\b/i,
  qtyAt: /(\d{1,3})\s*[x×@]\s*((?:rp\.?\s*)?\d[\d.,]*)/i,
  qtyLead: /^(\d{1,2})\s*[x×]?\s+(?=[a-z])/i,
  percent: /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/,
};

/** "25.000" / "25,000" / "125.000,00" / "Rp 25000" → 25000 (Rupiah: no cents). */
export function parseMoney(str) {
  let t = String(str).toLowerCase().replace(/rp\.?/g, '').replace(/\s+/g, '');
  const neg = t.startsWith('-');
  t = t.replace(/^-/, '');
  let n;
  if (/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(t)) n = Number(t.replace(/[.,]\d{1,2}$/, '').replace(/[.,]/g, ''));   // 1.250.000(,00)
  else if (/^\d+[.,]\d{1,2}$/.test(t)) n = Math.round(Number(t.replace(',', '.')));                                   // 25000,00
  else n = Number(t.replace(/[.,]/g, ''));
  return isFinite(n) ? (neg ? -n : n) : null;
}

function moneyIn(line) {
  const out = [];
  for (const m of line.matchAll(RE.money)) {
    const v = parseMoney(m[1]);
    if (v != null) out.push({ v, at: m.index, end: m.index + m[0].length, raw: m[0] });
  }
  return out;
}

export function parseDate(text) {
  let m = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (m) {
    let [, d, mo, y] = m.map(Number);
    if (y < 100) y += 2000;
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];          // 12/25/2026 (US)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y < 2100) return iso(y, mo, d);
  }
  m = text.match(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
  if (m) { const [, y, mo, d] = m.map(Number); if (mo <= 12 && d <= 31) return iso(y, mo, d); }
  m = text.match(/\b(\d{1,2})\s*[-\s]?\s*([a-z]{3,9})\.?\s*[-\s]?\s*(\d{2,4})\b/i);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let y = Number(m[3]); if (y < 100) y += 2000;
    if (mo && Number(m[1]) <= 31) return iso(y, mo, Number(m[1]));
  }
  return null;
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const clean = s => s.replace(/[|_~=*#"`]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
const letters = s => (s.match(/[a-z]/gi) || []).length;
const titleCase = s => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

/**
 * Best guess at what's on a receipt.
 * Returns { shop, date, items: [{ name, qty, price }], service, tax,
 *   discount, subtotal, total, servicePct, taxPct }
 *   (price is per unit; money in whole Rupiah).
 */
export function parseReceipt(text) {
  const lines = String(text || '').split(/\r?\n/)
    .map(l => l.replace(/([x×])\s*[|lI!](?=\s|$)/g, '$1 1'))      // "x |" is "x 1" misread
    .map(clean).filter(Boolean);
  const out = { shop: '', date: parseDate(text) || null, items: [], service: 0, tax: 0, discount: 0, rounding: 0, subtotal: null, total: null, servicePct: null, taxPct: null };

  // Shop: the first line made mostly of real words, before anything with a price.
  const wordy = l => {
    const t = l.split(/\s+/).filter(Boolean);
    const real = t.filter(x => /^[\p{L}&'.-]{3,}$/u.test(x)).length;
    return real >= 1 && real / t.length >= 0.6 && letters(l) >= 4;
  };
  for (const l of lines.slice(0, 8)) {
    if (moneyIn(l).length || parseDate(l) || RE.skip.test(l) || !wordy(l)) continue;
    let shop = l.replace(/[^\p{L}\p{N}&'.\s-]/gu, '').trim().replace(/^(\S\s+)+(?=\S{3,})/, '');
    // "Er OMA COFFEE": a short word in different case before an all-caps name is a speck
    const m = shop.match(/^(\S{1,2})\s+(.+)$/);
    if (m && m[2] === m[2].toUpperCase() && /[A-Z]/.test(m[2]) && m[1] !== m[1].toUpperCase()) shop = m[2];
    out.shop = titleCase(shop); break;
  }

  let pending = null;          // a name line waiting for its "2 x 12.500  25.000" line
  let inItems = true;
  let afterTotal = false;      // tax lines after the total are "included" info (minimarkets)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const nums = moneyIn(l);
    const last = nums[nums.length - 1];
    const label = last ? l.slice(0, nums[0].at).trim() : l;

    // Totals and extras (and stop collecting items once they start)
    if (RE.subtotal.test(l) && last) { out.subtotal = Math.abs(last.v); inItems = false; continue; }
    if (afterTotal && (RE.tax.test(l) || RE.service.test(l))) continue;
    if (RE.service.test(label) && last && !RE.skip.test(label)) { out.service += Math.abs(last.v); const p = l.match(RE.percent); if (p) out.servicePct = Number(p[1].replace(',', '.')); inItems = false; continue; }
    if (RE.tax.test(label) && last) { out.tax += Math.abs(last.v); const p = l.match(RE.percent); if (p) out.taxPct = Number(p[1].replace(',', '.')); inItems = false; continue; }
    if (RE.discount.test(label) && last) { out.discount += Math.abs(last.v); continue; }
    if (RE.rounding.test(l)) { const m = l.match(/(-?\s?\d[\d.,]*)\s*$/); if (m) out.rounding += parseMoney(m[1].replace(/\s/g, '')) || 0; continue; }
    if (RE.total.test(label) && last && !RE.skip.test(label.replace(RE.total, ''))) {
      // the biggest "total" line wins (grand total after tax)
      if (out.total == null || Math.abs(last.v) >= out.total) out.total = Math.abs(last.v);
      inItems = false; afterTotal = true; continue;
    }
    if (!inItems) continue;
    // "+ Less sugar", "+ Harga (20.000)": add-ons to the line above, not items
    if (/^[^\p{L}\p{N}]{0,3}(\S{1,2}\s+)?\+\s/u.test(l)) continue;
    if (RE.skip.test(l) || (parseDate(l) && letters(l.replace(/[a-z]{3,9}/i, '')) < 3)) { pending = null; continue; }

    // "2 x 12.500   25.000" on its own line: belongs to the name above
    const at = l.match(RE.qtyAt);
    if (at && letters(l.slice(0, at.index)) < 2 && pending) {
      const qty = Number(at[1]);
      const unit = parseMoney(at[2]);
      const amount = last && last.at > at.index + at[0].length - 1 ? last.v : unit * qty;
      if (qty > 0 && amount > 0) out.items.push({ name: pending, qty, price: Math.round(amount / qty) });
      pending = null;
      continue;
    }

    if (!last) {
      // a name without a price; the next line may carry it
      if (letters(l) >= 2 && !parseDate(l)) pending = titleCase(l);
      continue;
    }

    // "Nasi goreng 2 x 25.000 50.000" · "2 Es teh 16.000" · "Es teh 8.000"
    let name = label, qty = 1, amount = last.v;
    const post = name.match(/\s[x×]\s*(\d{1,3})?\s*$/i);       // "Capcay cah x 1   25.000"
    if (at && letters(l.slice(0, at.index)) >= 2) {
      name = l.slice(0, at.index).trim();
      qty = Number(at[1]);
      if (nums.length < 2) amount = parseMoney(at[2]) * qty;
    } else if (post) {
      name = name.slice(0, post.index);
      qty = Number(post[1]) || 1;
    } else {
      const lead = name.match(RE.qtyLead);
      if (lead) { qty = Number(lead[1]); name = name.slice(lead[0].length); }
      // "Kopi susu 1 18.000": a small number right before the price is a quantity
      const tail = name.match(/\s(\d{1,2})$/);
      if (tail && qty === 1) { qty = Number(tail[1]) || 1; name = name.slice(0, -tail[0].length); }
    }
    name = name.replace(/[^\p{L}\p{N}&'().\/\s+-]/gu, ' ').replace(/\s{2,}/g, ' ').trim()
      .replace(/^(\S\s+)+(?=\S{2,})/, '')                        // a stray letter in front (OCR noise)
      .replace(/^[a-z]{1,2}\s+(?=[A-Z])/, '');                     // "of Es batu": a speck read as a short word
    if (letters(name) < 2 || amount < 100 || amount <= 0) { pending = null; continue; }
    if (!name && pending) name = pending;
    out.items.push({ name: titleCase(name), qty: qty || 1, price: Math.round(amount / (qty || 1)) });
    pending = null;
  }

  // Percentages the splitter can use: service on the items, tax on items + service.
  const sum = out.items.reduce((n, it) => n + it.price * it.qty, 0);
  const base = out.subtotal || sum;
  if (out.service && out.servicePct == null && base) out.servicePct = round1(out.service / base * 100);
  if (out.tax && out.taxPct == null && base) out.taxPct = round1(out.tax / (base + out.service) * 100);
  if (out.total == null && sum) out.total = base + out.service + out.tax - out.discount + out.rounding;
  return out;
}

const round1 = n => Math.round(n * 10) / 10;

/** What the items and extras add up to, and how far off the receipt's total that is. */
export function check(r) {
  const sum = r.items.reduce((n, it) => n + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const service = sum * (Number(r.servicePct) || 0) / 100;
  const tax = (sum + service) * (Number(r.taxPct) || 0) / 100;
  const computed = Math.round(sum + service + tax - (Number(r.discount) || 0) + (Number(r.rounding) || 0));
  return { sum, computed, diff: r.total != null ? Math.round(r.total - computed) : null };
}
