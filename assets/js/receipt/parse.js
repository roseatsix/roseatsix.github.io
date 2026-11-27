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
  money: /(?<![a-z\d.,])(?:(?:rp\.?|idr)\s*)?(-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d{3,7}(?:[.,]\d{1,2})?)(?![\d.,]*[a-z\d])/gi,
  total: /\b(grand\s*total|total\s*(bayar|belanja|tagihan|harga|pembayaran)?|jumlah(\s*bayar)?|amount\s*due|tagihan)\b/i,
  subtotal: /\bs[uv][bnoa]?\s*[-.]?\s*t[o0]?ta[l1i]\b/i,          // subtotal, sub-total, and misreads like "Suotal"
  tax: /\b(ppn|pb\s*1|pbi|pajak|tax|vat)\b/i,
  service: /\b(service|serv\.?|svc|s\.?c\.?|layanan|serv\s*charge)\b/i,
  discount: /\b(disc(ount)?|diskon|potongan|promo|v[o0][uj][co0]h?er|hemat|member\s*disc)\b/i,
  rounding: /\b(pembulatan|rounding)\b/i,
  skip: /\b(tunai|cash|kembali(an)?|change|kartu|card|debit|kredit|credit|qris|ovo|gopay|go-pay|dana|shopee\s*pay|linkaja|edc|bayar|payment|paid|npwp|telp|tlp|tel|phone|hp|wa|kasir|cashier|struk|nota|trx|no\.?\s*(trans|bon|meja|order)|terima\s*kasih|thank|www|\.com|instagram|ig\b|jl\.?|jalan|meja|table|order\s*no|pax|tamu|guest|item\(s\)|\d+\s*items?\b|qty\s*total|total\s*item|total\s*qty|qty\s*[=:]?\s*\d|br[so0]\s*[=:]?\s*\d|chk|check\s*(no|#)|\S+\/\S+\/\S+|(?:0|\+62)8\d{2}[\s-]?\d{3,4}|dpp|harga\s*jual|order|antrian|queue|ref\b)\b/i,
  qtyAt: /(\d{1,3})(?:[.,]0{1,2})?\s*(?:[a-z]{2,5}\.?\s+)?[x×@]{1,2}\s*((?:rp\.?\s*)?\d[\d.,]*)/i,   // 2 x 12.500 · 2,00 PCS x 12.500,00
  qtyLead: /^(\d{1,2})\s*[x×]?\s+(?=[a-z])/i,
  percent: /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/,
};

/** "25.000" / "25,000" / "125.000,00" / "Rp 25000" → 25000 (Rupiah: no cents). */
export function parseMoney(str) {
  let t = String(str).toLowerCase().replace(/rp\.?|idr/g, '').replace(/\s+/g, '');
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
    if (/^-?0\d/.test(m[1])) continue;            // "002500", "092 000": codes, not prices
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
  // receipts with ",00" cents: "15.000,00=" is often read as "15.000,007" or "15.000,00x"
  const cents = (String(text || '').match(/\d[.,]\d{3}[.,]\s?\d{2}/g) || []).length >= 3;
  const lines = String(text || '').split(/\r?\n/)
    .map(l => l.replace(/([x×])\s*[|lI!](?=\s|$)/g, '$1 1'))      // "x |" is "x 1" misread
    .map(l => l.replace(/(^|\s)[1lI][0OD]R\s?(?=\d)/g, '$1IDR '))     // "10R116,000" is "IDR116,000"
    .map(l => cents ? l.replace(/(\d[.,]\d{3})[.,]\s?(\d{2})[7x%z]?(?!\d)/gi, '$1,$2') : l)   // "14.000, 007" is "14.000,00="
    .map(l => l.replace(/^\s*\d{1,2}\s*[.,)]\s*(?=\S*\d)\S+\s+[-~–—]\s+(?=\p{L})/u, '§ '))   // "1. SGM5083 - Kong Kee…": number and product code (§ marks a new item)
    .map(l => l.replace(/(^|[\s:])(\d{1,3}) (\d{3})\s*$/, '$1$2$3'))   // "25 100" at the end: thousands split by a gap
    .map(clean).filter(Boolean);

  const out = { shop: '', date: parseDate(text) || null, items: [], service: 0, tax: 0, discount: 0, rounding: 0, subtotal: null, total: null, servicePct: null, taxPct: null, totalPrinted: false };

  // Shop: the first line made mostly of real words, before anything with a price.
  const wordy = l => {
    const t = l.split(/\s+/).filter(Boolean);
    const real = t.filter(x => /^[\p{L}&'.-]{3,}$/u.test(x)).length;
    return real >= 1 && real / t.length >= 0.6 && letters(l) >= 4;
  };
  for (const l of lines.slice(0, 12)) {
    if (moneyIn(l).length || /^§ /.test(l)) break;        // the items have started
    if (parseDate(l) || RE.skip.test(l) || !wordy(l)) continue;
    let shop = l.replace(/[^\p{L}\p{N}&'.\s-]/gu, '').trim().replace(/^(\S\s+)+(?=\S{3,})/, '');
    // "Er OMA COFFEE": a short word in different case before an all-caps name is a speck
    const m = shop.match(/^(\S{1,3})\s+(.+)$/);
    if (m && m[2] === m[2].toUpperCase() && /[A-Z]/.test(m[2]) && m[1] !== m[1].toUpperCase()) shop = m[2];
    out.shop = titleCase(shop); break;
  }

  let pending = null;          // a name line waiting for its "2 x 12.500  25.000" line
  let inItems = true;
  let afterTotal = false;      // tax lines after the total are "included" info (minimarkets)
  let prevItem = false;        // the line above was an item (its name may go on below)
  for (let i = 0; i < lines.length; i++) {
    const fresh = lines[i].startsWith('§ ');       // starts a numbered item: never the rest of the one above
    const l = fresh ? lines[i].slice(2) : lines[i];
    const nums = moneyIn(l);
    const last = nums[nums.length - 1];
    const label = last ? l.slice(0, nums[0].at).trim() : l;

    // Totals and extras (and stop collecting items once they start)
    if (RE.subtotal.test(l) && last) { out.subtotal = Math.abs(last.v); inItems = false; continue; }
    if (afterTotal && (RE.tax.test(l) || RE.service.test(l))) continue;
    if (RE.service.test(label) && last && !RE.skip.test(label)) { out.service += Math.abs(last.v); const p = l.match(RE.percent); if (p) out.servicePct = Number(p[1].replace(',', '.')); inItems = false; continue; }
    if (RE.tax.test(label) && last) { out.tax += Math.abs(last.v); const p = l.match(RE.percent); if (p) out.taxPct = Number(p[1].replace(',', '.')); inItems = false; continue; }
    if (afterTotal && RE.discount.test(label)) continue;
    const addOn = /^[^\p{L}\p{N}]{0,3}(\S{1,2}\s+)?\+\s/u.test(l);     // "+ Less sugar", "+ Harga (20.000)"
    if (inItems && !addOn && /\(\s*\d[\d.,]*\s*\)\s*$/.test(l) && last && letters(label) >= 3) { out.discount += Math.abs(last.v); continue; }   // "(2.200)": taken off                       // "Anda hemat": savings already counted
    if (RE.discount.test(label) && last) { out.discount += Math.abs(last.v); continue; }
    if (RE.rounding.test(l)) { const m = l.match(/(-?\s?\d[\d.,]*)\s*$/); if (m) out.rounding += parseMoney(m[1].replace(/\s/g, '')) || 0; continue; }
    if (RE.total.test(label) && last && !RE.skip.test(label.replace(RE.total, ''))) {
      // the biggest "total" line wins (grand total after tax)
      if (out.total == null || Math.abs(last.v) >= out.total) out.total = Math.abs(last.v);
      out.totalPrinted = true;
      inItems = false; afterTotal = true; continue;
    }
    if (!inItems) continue;
    // "+ Less sugar", "+ Harga (20.000)": add-ons to the line above, not items
    if (addOn) continue;
    if (RE.skip.test(l) || (l.match(/\//g) || []).length >= 3 || (parseDate(l) && letters(l.replace(/[a-z]{3,9}/i, '')) < 3)) { pending = null; continue; }

    // "2 x 12.500   25.000" on its own line: belongs to the name above
    const at = l.match(RE.qtyAt);
    if (at && letters(l.slice(0, at.index)) < 2 && pending) {
      const qty = Number(at[1]);
      const unit = parseMoney(at[2]);
      // the line's amount, unless it disagrees with qty × unit price (then one was misread; the unit price is likelier right)
      const amount = last && last.at > at.index + at[0].length - 1 && (!unit || last.v === unit * qty) ? last.v : unit * qty;
      if (qty > 0 && amount > 0) out.items.push({ name: pending, qty, price: Math.round(amount / qty) });
      pending = null; prevItem = true;
      continue;
    }

    // a name whose "1,00 PCS x 500,00  500,00" line comes next ("Plastik 500": the 500 is part of the name)
    const nextIsQty = (lines[i + 1] || '').match(RE.qtyAt);
    const nextQtyRow = nextIsQty && letters(lines[i + 1].slice(0, nextIsQty.index)) < 2;
    if (last && nextQtyRow && !at && letters(l) >= 3) { pending = titleCase(l); prevItem = false; continue; }

    if (!last) {
      // "Latte" under "Hajime Iced  38.000": the rest of the item's name
      const prev = out.items[out.items.length - 1];
      if (prevItem && prev && !fresh && !nextQtyRow && !/\d/.test(l) && /^[\p{L}&'. -]+$/u.test(l) && l.split(/\s+/).length <= 3 && !/\s[-–]\s/.test(l)) {
        prev.name = (prev.name.replace(/\s*-$/, '') + ' ' + titleCase(l)).trim(); prevItem = false; pending = null; continue;
      }
      // a name without a price; the next line may carry it
      if (letters(l) >= 2 && !parseDate(l)) pending = titleCase(l);
      prevItem = false;
      continue;
    }

    // a line that's just the sum of everything above is an unlabelled total
    const soFar = out.items.reduce((n, it) => n + it.price * it.qty, 0);
    // (or a big unlabelled amount, printed again further down, at least as much as everything above: a misread total)
    const again = () => lines.slice(i + 1).some(x => moneyIn(x).some(n => n.v === last.v));
    if (out.items.length >= 2 && (last.v === soFar || (out.items.length >= 3 && last.v >= soFar && !/\p{L}{4,}/u.test(label) && again()))) {
      if (out.total == null) { out.total = last.v; out.totalPrinted = true; }
      inItems = false; afterTotal = true; continue;
    }

    // "1,00 PCS x 30.000,00 30.000,00" under a name, too garbled for the pattern above
    const lead = l.match(/^(\d{1,3})(?:[.,]\d{1,2})?\b/);
    if (pending && lead && letters(label) <= 5 && !/\p{L}{4,}/u.test(label)) {
      const qty = Number(lead[1]) || 1;
      out.items.push({ name: pending, qty, price: Math.round(last.v / qty) });
      pending = null; prevItem = true; continue;
    }

    // "Nasi goreng 2 x 25.000 50.000" · "2 Es teh 16.000" · "Es teh 8.000"
    let name = label, qty = 1, amount = last.v;
    const post = name.match(/\s[x×]\s*(\d{1,3})?\s*$/i);       // "Capcay cah x 1   25.000"
    const unitRow = nums.length >= 2 ? l.match(/\s(\d{1,2})\s+(\d{3,7})\s+\S+\s*$/) : null;
    if (at && letters(l.slice(0, at.index)) >= 2) {
      name = l.slice(0, at.index).trim();
      qty = Number(at[1]);
      if (nums.length < 2) amount = parseMoney(at[2]) * qty;
    } else if (unitRow && Number(unitRow[1]) * parseMoney(unitRow[2]) !== amount) {
      // "KPS 80'S  1  18200  #200": name, qty, unit price, then a smudged amount
      name = l.slice(0, unitRow.index); qty = Number(unitRow[1]); amount = qty * parseMoney(unitRow[2]);
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
    if (letters(name) < 2 || amount < 100 || amount <= 0) { pending = null; prevItem = false; continue; }
    if (!name && pending) name = pending;
    out.items.push({ name: titleCase(name), qty: qty || 1, price: Math.round(amount / (qty || 1)) });
    pending = null; prevItem = true;
  }

  // Percentages the splitter can use: service on the items, tax on items + service.
  const sum = out.items.reduce((n, it) => n + it.price * it.qty, 0);
  const base = out.subtotal || sum;
  if (out.service && out.servicePct == null && base) out.servicePct = round1(out.service / base * 100);
  if (out.tax && out.taxPct == null && base) out.taxPct = round1(out.tax / (base + out.service) * 100);
  const chain = base + out.service + out.tax - out.discount + out.rounding;
  if (out.total == null && sum) out.total = chain;
  // the subtotal matches the items and service and tax are printed, but the grand total
  // doesn't add up: the total was misread (one number) more likely than all the others
  else if (out.total != null && out.subtotal === sum && sum && (out.service || out.tax) && out.total !== chain) out.total = chain;
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
