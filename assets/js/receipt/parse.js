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
  total: /\b(grand\s*total|total\s*(bayar|belanja|tagihan|harga|pembayaran)?|tot|jumlah(\s*bayar)?|amount\s*due|tagihan)\b/i,
  // "Total item 6  44.000", "Total disc. 11.200", "Total saving": summaries, not what was paid
  summary: /\btotal\s*(item|qty|disc|diskon|saving|hemat|potongan|promo)/i,
  // "Take-out tot (termasuk pajak)", "Price inclusive of PB1": the tax is already in the prices
  included: /\b(t[e]?rmasuk|incl\.?|includ\w*|inclusive|sudah\s*termasuk)\b/i,
  subtotal: /\bs[uv][bnoa]?\s*[-.]?\s*t[o0]?ta[l1i]\b/i,          // subtotal, sub-total, and misreads like "Suotal"
  tax: /\b(ppn|pb\s*1|pbi|pajak|tax|vat)\b/i,
  service: /\b(service|serv\.?|svc|s\.?c\.?|layanan|serv\s*charge)\b/i,
  discount: /\b(disc(ount)?|diskon|potongan|promo|v[o0][uj][co0]h?er|hemat|member\s*disc)\b/i,
  rounding: /\b(pembulatan|rounding)\b/i,
  skip: /\b(tunai|cash|kembali(an)?|change|kartu|card|debit|kredit|credit|qris|ovo|gopay|go-pay|dana|shopee\s*pay|linkaja|edc|bayar|payment|paid|npwp|telp|tlp|tel|phone|hp|wa|kasir|cashier|struk|nota|trx|no\.?\s*(trans|bon|meja|order)|terima\s*kasih|thank|www|\.com|instagram|ig\b|jl\.?|jalan|meja|table|order\s*no|pax|tamu|guest|item\(s\)|\d+\s*items?\b|qty\s*total|total\s*item|total\s*qty|qty\s*[=:]?\s*\d|br[so0]\s*[=:]?\s*\d|chk|check\s*(no|#)|\S+\/\S+\/\S+|(?:0|\+62)8\d{2}[\s-]?\d{3,4}|dpp|harga\s*jual|order|antrian|queue|ref\b|bon|receipt|sales\s*no|approval|merch\s*id|term\s*id|trans\s*id|net\s*sales|purchase|youtap|member)\b/i,
  qtyAt: /(\d{1,3})(?:[.,]0{1,2})?\s*(?:[a-z]{2,5}\.?\s+)?(?:[x×]\s*@?|@)\s*((?:rp\.?\s*)?\d[\d.,]*)/i,   // 2 x 12.500 · 2,00 PCS x 12.500,00
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

function moneyIn(line, strict = false) {
  const out = [];
  for (const m of line.matchAll(RE.money)) {
    const v = parseMoney(m[1]);
    if (/^-?0\d/.test(m[1])) continue;            // "002500", "092 000": codes, not prices
    if (strict && /^(19|20)\d\d$/.test(m[1])) continue;                               // "MAILER OKTOBER 2025": a year
    if (strict && /^-?\d{5,}$/.test(m[1]) && !/^(rp|idr)/i.test(m[0])) continue;   // "Gorontalo 96134": a postcode where prices have dots
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
  const raw = String(text || '');
  // Prices written 1.000 / 1,000: then a bare "96134" is a postcode or a code, not a price
  const sep = (raw.match(/(?<![\d.,])\d{1,3}[.,]\s?\d{3}(?![\d])/g) || []).length;
  const bare = (raw.match(/(?<![\d.,])(?!(?:19|20)\d\d(?!\d))\d{4,5}(?![\d.,])/g) || []).length;   // (not years or long codes)
  const strict = sep >= 3 && sep >= bare * 2;
  const money = l => moneyIn(l, strict);
  const lines = raw.replace(/\b(rp|idr)\.?[ \t]*\n[ \t]*(?=\d)/gi, '$1 ')   // "Jus sirsak x1 Rp" + "24.000" on the next line
    .split(/\r?\n/)
    .map(l => l.replace(/^(\s*)[lIi|!]\s?[xX×](?=\s)/, '$11x'))        // "ix", "Ix", "lx": "1x" misread
    .map(l => l.replace(/[¢©]\s?(?=\d)/g, '@'))                         // "@" misread as ¢
    .map(l => l.replace(/([x×]\s+)0(?=\d[.,]\d{3}\b)/i, '$1@'))       // "1x 07.273": the @ read as 0
    .map(l => l.replace(/~\s?(?=\d)/g, '-'))                            // "~16.500": a minus
    .map(l => l.replace(/(\d)([.,]) (\d{3})(?!\d)/g, '$1$2$3'))         // "162. 500": a gap after the dot
    .map(l => l.replace(/^\s*[@86]?(\d{1,3}[.,]\d{3})\s+\1\s*$/, '1x @$1 $1'))   // "819.000  19.000": "1x @19.000  19.000" with the 1x lost
    .map(l => l.replace(/([x×])\s*[|lI!](?=\s|$)/g, '$1 1'))      // "x |" is "x 1" misread
    .map(l => l.replace(/(^|\s)[1lI][0OD]R\s?(?=\d)/g, '$1IDR '))     // "10R116,000" is "IDR116,000"
    .map(l => cents ? l.replace(/(\d[.,]\d{3})[.,]\s?(\d{2})[7x%z]?(?!\d)/gi, '$1,$2') : l)   // "14.000, 007" is "14.000,00="
    .map(l => l.replace(/^\s*\d{1,2}\s*[.,)]\s*(?=\S*\d)\S+\s+[-~–—]\s+(?=\p{L})/u, '§ '))   // "1. SGM5083 - Kong Kee…": number and product code (§ marks a new item)
    .map(l => l.replace(/^\s*\d{6,8}\s+(?=\p{L})/u, '§ '))                                   // "3098531 KNDL H&M NT": a product code
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
    if (money(l).length || /^§ /.test(l)) break;        // the items have started
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
  let tail = null;             // after an unlabelled subtotal: { base, extras } until a line adds up to the total
  let grand = false;           // a "grand total" was seen: later plain totals don't replace it
  let itemDisc = false;        // discounts were taken off their items (so "Total disc." isn't counted again)
  let seenSep = false;         // a price written with a separator has been seen
  let pendingCode = false;     // the pending name came from a product-code line; its next line finishes the name
  for (let i = 0; i < lines.length; i++) {
    const fresh = lines[i].startsWith('§ ');       // starts a numbered item: never the rest of the one above
    const l = fresh ? lines[i].slice(2) : lines[i];
    if (!seenSep && money(l).some(n => /[.,]/.test(n.raw))) seenSep = true;
    const nums = money(l).filter(n => seenSep || !strict || /[.,]/.test(n.raw) || Math.abs(n.v) < 1000);   // "Kebun 1047": an address, before any price
    const last = nums[nums.length - 1];
    const label = last ? l.slice(0, nums[0].at).trim() : l;

    // Summaries ("Total item 6 44.000", "Total disc. 11.200") and tax-included notes
    if (RE.summary.test(label)) {
      const soFar = out.items.reduce((n, it) => n + it.price * it.qty, 0);
      if (last && /disc|diskon|potongan|promo/i.test(label) && !itemDisc && !out.discount && Math.abs(last.v) < soFar) out.discount = Math.abs(last.v);
      inItems = false; continue;
    }
    if (RE.included.test(label) && !RE.total.test(label.replace(RE.included, ''))) { inItems = false; continue; }   // "Price inclusive of PB1: 11.818"
    if (RE.included.test(label) && last) {                                            // "Take-out tot (termasuk pajak) 219.501"
      out.total = Math.abs(last.v); out.totalPrinted = true; grand = true;
      inItems = false; afterTotal = true; continue;
    }

    // Totals and extras (and stop collecting items once they start)
    if (RE.subtotal.test(l) && last) { out.subtotal = Math.abs(last.v); inItems = false; continue; }
    if (afterTotal && (RE.tax.test(l) || RE.service.test(l))) continue;
    if (RE.service.test(label) && last && !RE.skip.test(label)) { out.service += Math.abs(last.v); const p = l.match(RE.percent); if (p) out.servicePct = Number(p[1].replace(',', '.')); inItems = false; continue; }
    if (RE.tax.test(label) && last) { out.tax += Math.abs(last.v); const p = l.match(RE.percent); if (p) out.taxPct = Number(p[1].replace(',', '.')); inItems = false; continue; }
    if (afterTotal && RE.discount.test(label)) continue;
    const addOn = /^[^\p{L}\p{N}]{0,3}(\S{1,2}\s+)?\+\s/u.test(l);     // "+ Less sugar", "+ Harga (20.000)"
    // "Disc. -300", "MAILER OKTOBER 2025  -16.500" right under an item: taken off that item
    // (so whoever had it gets the discount in a split)
    const prevIt = out.items[out.items.length - 1];
    if (inItems && prevItem && prevIt && last && (last.v < 0 || /^(disc|diskon|potongan|promo|mailer|hemat)/i.test(label))) {
      const line = Math.max(0, prevIt.price * prevIt.qty - Math.abs(last.v));
      if (line % prevIt.qty) { prevIt.name = `${prevIt.qty}× ${prevIt.name}`; prevIt.qty = 1; }
      prevIt.price = line / prevIt.qty;
      itemDisc = true; continue;
    }
    if (inItems && !addOn && /\(\s*\d[\d.,]*\s*\)\s*$/.test(l) && last && letters(label) >= 3) { out.discount += Math.abs(last.v); continue; }   // "(2.200)": taken off                       // "Anda hemat": savings already counted
    if (RE.discount.test(label) && last) { out.discount += Math.abs(last.v); continue; }
    if (RE.rounding.test(l)) { const m = l.match(/(-?\s?\d[\d.,]*)\s*$/); if (m) out.rounding += parseMoney(m[1].replace(/\s/g, '')) || 0; continue; }
    if (RE.total.test(label) && last && !RE.skip.test(label.replace(RE.total, ''))) {
      // the grand total wins; otherwise the last total line ("Total 192.512 … Grand total 192.500",
      // "Total item 44.000 … Total belanja 32.800")
      const isGrand = /grand|bayar|belanja|tagihan|pembayaran|amount\s*due/i.test(label);
      if (isGrand || !grand) out.total = Math.abs(last.v);
      if (isGrand) grand = true;
      out.totalPrinted = true;
      inItems = false; afterTotal = true; continue;
    }
    if (!inItems) {
      // Unlabelled amounts after the items' sum (labels lost, or printed on the line below):
      // smaller ones are tax/service, and one equal to sum + those is the total
      if (tail && out.total == null && last && letters(label) <= 3) {
        const extra = tail.extras.reduce((n, v) => n + v, 0);
        if (last.v === tail.base + extra) {
          out.total = last.v; out.totalPrinted = true; afterTotal = true;
          if (!out.tax && !out.service) out.tax = extra;
        } else if (last.v < tail.base) tail.extras.push(last.v);
      }
      continue;
    }
    // "+ Less sugar", "+ Harga (20.000)": add-ons to the line above, not items
    if (addOn) continue;
    if (RE.skip.test(l) || /\b\d{1,2}:\d{2}\b/.test(l) || /\w+-\d{2,}-\d{3,}/.test(l) || (l.match(/\//g) || []).length >= 3 || (parseDate(l) && letters(l.replace(/[a-z]{3,9}/i, '')) < 3)) { pending = null; prevItem = false; continue; }

    // "2  LEVEL 2   1.820" under "4 MIE GACOAN  41.820": an option with its own price, part of the item above
    if (prevItem && prevIt && last && /^(\d{1,3}\s+)?(level|lvl|lv|extra|topping|add[\s-]?on)\b/i.test(label)) {
      const line = prevIt.price * prevIt.qty + Math.max(0, last.v);
      if (line % prevIt.qty) { prevIt.name = `${prevIt.qty}× ${prevIt.name}`; prevIt.qty = 1; }
      prevIt.price = line / prevIt.qty; continue;
    }

    // "2 x 12.500   25.000" on its own line: belongs to the name above
    const at = l.match(RE.qtyAt);
    if (at && letters(l.slice(0, at.index)) < 2 && pending) {
      const qty = Number(at[1]);
      let unit = parseMoney(at[2]);
      // "1x 862.000  62.000": the @ read as an 8 (or 6)
      const lone = at[2].replace(/^(rp\.?\s*)/i, '');
      if (/^[86]\d/.test(lone) && last && unit * qty !== last.v) { const u2 = parseMoney(lone.slice(1)); if (u2 && (u2 * qty === last.v || u2 < unit / 5)) unit = u2; }
      // the line's amount, unless it disagrees with qty × unit price (then one was misread; the unit price is likelier right)
      const amount = unit < 100 ? 0                                                  // "1x @0  0" ("@0" read as "80"): free
        : last && last.at > at.index + at[0].length - 1 && (!unit || last.v === unit * qty) ? last.v : unit * qty;
      const nm = pending.replace(/^\d\s+(?=\p{L})/u, '');                       // "5 Ocha App": a speck read as a digit
      if (qty > 0 && amount > 0) out.items.push({ name: nm, qty, price: Math.round(amount / qty) });
      else if (qty > 0 && pending) out.items.push({ name: nm, qty, price: 0 });   // free ("Ocha app 1x @0  0")
      pending = null; prevItem = amount > 0 || prevItem; pendingCode = false;
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
      if (RE.total.test(l) || RE.subtotal.test(l) || RE.tax.test(l) || RE.service.test(l)) { prevItem = false; continue; }
      if (pending && /^[(\[]/.test(l)) pending += ' ' + titleCase(l);          // "UMA TORI MISO UDON" + "(SPICY)"
      else if (letters(l) >= 2 && !parseDate(l)) { pending = titleCase(l); pendingCode = fresh; }
      prevItem = false;
      continue;
    }

    // a line that's just the sum of everything above is an unlabelled total
    const soFar = out.items.reduce((n, it) => n + it.price * it.qty, 0);
    // (or a big unlabelled amount, printed again further down, at least as much as everything above: a misread total)
    // (printed again further down on a line that isn't an item: "**44  IDR116,000", "Subtotal 116.000")
    const again = () => lines.slice(i + 1).some(x => { const n = money(x); return n.some(v => v.v === last.v) && (!/\p{L}{4,}/u.test(x.slice(0, n[0].at)) || RE.total.test(x) || RE.subtotal.test(x)); });
    const wordy = /\p{L}{4,}/u.test(label) && !RE.total.test(label);
    if (out.items.length >= 2 && last.v === soFar && (!wordy || again())) {
      // the items' sum: a subtotal; tax and the total may follow, labelled or not
      if (out.subtotal == null) out.subtotal = last.v;
      tail = { base: last.v, extras: [] };
      inItems = false; continue;
    }
    if (out.items.length >= 3 && last.v >= soFar && !/\p{L}{4,}/u.test(label) && again()) {
      if (out.total == null) { out.total = last.v; out.totalPrinted = true; }
      inItems = false; afterTotal = true; continue;
    }

    // a price alone on the line under a name ("3 PANGSIT GORENG" / "31.365"): the line's amount
    if (pending && nums.length === 1 && !label && l.trim() === nums[0].raw.trim()) {
      const q = pending.match(/^(\d{1,2})\s+(?=\p{L})/u);
      const qty = q ? Number(q[1]) : 1;
      out.items.push({ name: q ? pending.slice(q[0].length) : pending, qty, price: Math.round(last.v / qty) });
      pending = null; prevItem = true; pendingCode = false; continue;
    }

    // "1,00 PCS x 30.000,00 30.000,00" under a name, too garbled for the pattern above
    const lead = l.match(/^(\d{1,3})(?:[.,]\d{1,2})?\s+\S/);
    if (pending && lead && letters(label) <= 5 && !/\p{L}{4,}/u.test(label)) {
      const qty = Number(lead[1]) || 1;
      out.items.push({ name: pending, qty, price: Math.round(last.v / qty) });
      pending = null; prevItem = true; continue;
    }

    // "Nasi goreng 2 x 25.000 50.000" · "2 Es teh 16.000" · "Es teh 8.000"
    let name = label, qty = 1, amount = last.v;
    const post = name.match(/\s[x×]\s*(\d{1,3})?\s*$/i);       // "Capcay cah x 1   25.000"
    const unitRow = nums.length >= 2 ? l.match(/\s(\d{1,2})\s+(\d{3,7})\s+\S+\s*$/) : null;
    // "SOSRO TB LS 250   2   3,800   7,600": name, qty, unit price, amount that agree
    const qua = nums.length >= 2 ? l.match(/\s(\d{1,3})\s+((?:rp\.?\s*)?\d[\d.,]*)\s+((?:rp\.?\s*)?\d[\d.,]*)\s*$/i) : null;
    if (qua && Number(qua[1]) * parseMoney(qua[2]) === parseMoney(qua[3]) && letters(l.slice(0, qua.index)) >= 2) {
      name = l.slice(0, qua.index); qty = Number(qua[1]); amount = parseMoney(qua[3]);
    } else if (at && letters(l.slice(0, at.index)) >= 2) {
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
    // "x1  Rp 24.000" with no name: the name may be on the next line (printed under its price),
    // or lost; keep the price either way, a blank name is easy to fill in
    const bare = label.match(/^(?:[x×]\s*(\d{1,3})|(\d{1,3})\s*[x×])\s*(?:rp?\.?)?$/i);
    if (bare && amount >= 100) {
      qty = Number(bare[1] || bare[2]) || 1;
      const next = lines[i + 1] || '';
      if (!money(next).length && letters(next) >= 3 && !next.startsWith('§ ') && !RE.skip.test(next) && !RE.total.test(next) && !RE.subtotal.test(next) && !RE.tax.test(next)) { name = next; i++; }
      else name = pending || '';
      out.items.push({ name: titleCase(name), qty, price: Math.round(amount / qty) });
      pending = null; prevItem = true; continue;
    }
    if (letters(name) < 2 || amount < 100 || amount <= 0) { pending = null; prevItem = false; continue; }
    if (!name && pending) name = pending;
    else if (pending && pendingCode) name = pending + ' ' + name;                  // "3098531 KNDL H&M NT" / "HT WM500  1  162.500"
    out.items.push({ name: titleCase(name), qty: qty || 1, price: Math.round(amount / (qty || 1)) });
    pending = null; prevItem = true; pendingCode = false;
  }

  // No total after an unlabelled subtotal (misread or cut off): an amount that's a usual
  // tax or service rate of it (a whole or half percent, up to 15%) is the tax
  if (tail && out.total == null && !out.tax && !out.service) {
    const t = tail.extras.find(v => v / tail.base <= 0.15 && Math.abs(v / tail.base * 200 - Math.round(v / tail.base * 200)) < 0.001);
    if (t) out.tax = t;
  }

  // Percentages the splitter can use: service on the items, tax on items + service.
  const sum = out.items.reduce((n, it) => n + it.price * it.qty, 0);
  const base = out.subtotal || sum;
  if (out.service && out.servicePct == null && base) out.servicePct = round1(out.service / base * 100);
  if (out.tax && out.taxPct == null && base) out.taxPct = round1(out.tax / (base + out.service) * 100);
  if (out.discount >= sum && sum) out.discount = 0;                              // a misread: more off than everything costs
  const chain = base + out.service + out.tax - out.discount + out.rounding;
  if (out.total == null && sum && chain > 0) out.total = chain;
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
