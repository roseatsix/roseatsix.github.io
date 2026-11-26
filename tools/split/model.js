/* ==========================================================
   Bill splitter data model and calculations.

     trip:<id> {
       title, date, payTo, note, createdAt,
       people:   { <pid>: { name, me?, order } },
       receipts: { <rid>: {
         shop, date, paidBy, order,
         mode: "even" | "items",
         total, sharedBy: [pid],                     // even
         items: { <iid>: { name, price, qty, sharedBy: [pid], order } },
         service, tax, discount,                     // items: % / % / amount
         delivery, deliveryBy: "price" | "items"     // items: fee + how it's shared
       } },
       paid: { "<from>><to>": true },                // settle-up transfers done
       loggedShare: "YYYY-MM-DD"                     // my share sent to journal
     }
     config { currency, payTo }
   ========================================================== */

import { pad, ymd, parseDate, addDays, today, isDate, fmt } from '../journal/model.js';
export { pad, ymd, parseDate, addDays, today, isDate, fmt };

export const state = { items: new Map(), version: 0 };
export function setItems(list) { state.items = new Map(list.map(i => [i.key, i.data])); state.version++; }
export const get = key => state.items.get(key);
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
export const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
export const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'AUD', 'JPY', 'GBP'];

export const currency = () => (get('config') || {}).currency || 'IDR';
export const savedPayTo = () => ((get('config') || {}).payTo || '').trim();
const decimals = () => (['IDR', 'JPY'].includes(currency()) ? 0 : 2);
export const round = n => { const f = 10 ** decimals(); return Math.round((n + Number.EPSILON) * f) / f; };

export function money(n, opts = {}) {
  const cur = currency();
  try {
    return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : undefined, { style: 'currency', currency: cur, maximumFractionDigits: decimals(), ...opts }).format(n || 0);
  } catch (e) { return `${cur} ${round(n || 0)}`; }
}
export function plainNumber(n) {
  if (n == null || n === '') return '';
  return new Intl.NumberFormat(currency() === 'IDR' ? 'id-ID' : undefined, { maximumFractionDigits: decimals() }).format(n);
}
export function parseAmount(s) {
  s = String(s ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (decimals() === 0) { const n = Number(s.replace(/[.,]/g, '')); return isFinite(n) ? n : null; }
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  s = last >= 0 && s.length - last - 1 <= 2 ? s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1) : s.replace(/[.,]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
export function parsePercent(s) {
  const n = Number(String(s ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : 0;
}

export function trips() {
  const out = [];
  for (const [key, data] of state.items) if (key.startsWith('trip:')) out.push({ id: key.slice(5), ...data });
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

export const peopleOf = t => Object.entries(t.people || {}).map(([id, p]) => ({ id, ...p }))
  .sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0));
export const receiptsOf = t => Object.entries(t.receipts || {}).map(([id, r]) => ({ id, ...r }))
  .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.order ?? 0) - (b.order ?? 0));
export const itemsOf = r => Object.entries(r.items || {}).map(([id, i]) => ({ id, ...i })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const nameOf = (t, pid) => (t.people && t.people[pid] && t.people[pid].name) || 'Someone';
export const meOf = t => peopleOf(t).find(p => p.me) || null;

/** Shares of one receipt: { subtotal, service, tax, discount, total, shares: { pid: amount } }. */
export function receiptCalc(t, r) {
  const ids = Object.keys(t.people || {});
  const who = list => { const l = (list || []).filter(id => ids.includes(id)); return l.length ? l : ids; };
  const shares = {};
  let subtotal = 0, service = 0, tax = 0, discount = 0, delivery = 0, total = 0;

  if ((r.mode || 'even') === 'even') {
    total = subtotal = Number(r.total) || 0;
    const ppl = who(r.sharedBy);
    for (const id of ppl) shares[id] = total / ppl.length;
  } else {
    const units = {};                                     // items each person had
    for (const it of itemsOf(r)) {
      const qty = Number(it.qty) || 1;
      const amount = (Number(it.price) || 0) * qty;
      subtotal += amount;
      const ppl = who(it.sharedBy);
      for (const id of ppl) {
        shares[id] = (shares[id] || 0) + amount / ppl.length;
        if (amount > 0) units[id] = (units[id] || 0) + qty / ppl.length;
      }
    }
    service = subtotal * (Number(r.service) || 0) / 100;
    tax = (subtotal + service) * (Number(r.tax) || 0) / 100;
    const factor = subtotal ? (subtotal + service + tax) / subtotal : 0;
    for (const id of Object.keys(shares)) shares[id] *= factor;  // items + service + tax

    // Delivery: not taxed; by price (like the items) or by number of items.
    delivery = Math.max(0, Number(r.delivery) || 0);
    if (delivery && subtotal) {
      const base = r.deliveryBy === 'items' ? units : shares;
      const sum = Object.values(base).reduce((a, b) => a + b, 0);
      for (const id of Object.keys(shares)) shares[id] += sum ? delivery * (base[id] || 0) / sum : 0;
    }

    // Discount comes off everyone in proportion to what they owe.
    const gross = subtotal + service + tax + delivery;
    discount = Math.min(Number(r.discount) || 0, gross);
    total = gross - discount;
    const keep = gross ? total / gross : 0;
    for (const id of Object.keys(shares)) shares[id] *= keep;
  }

  // Round each share; put any leftover from rounding on the payer.
  total = round(total);
  let sum = 0;
  for (const id of Object.keys(shares)) { shares[id] = round(shares[id]); sum += shares[id]; }
  const diff = round(total - sum);
  if (diff && ids.length) {
    const target = shares[r.paidBy] != null ? r.paidBy : Object.keys(shares)[0];
    if (target) shares[target] = round(shares[target] + diff);
  }
  return { subtotal: round(subtotal), service: round(service), tax: round(tax), delivery: round(delivery), discount: round(discount), total, shares };
}

/** Whole split: per-person totals, balances and the fewest transfers to settle. */
export function tripCalc(t) {
  const ids = Object.keys(t.people || {});
  const paid = Object.fromEntries(ids.map(id => [id, 0]));
  const owed = Object.fromEntries(ids.map(id => [id, 0]));
  const receipts = receiptsOf(t).map(r => ({ r, c: receiptCalc(t, r) }));
  let total = 0;
  for (const { r, c } of receipts) {
    total += c.total;
    if (r.paidBy && paid[r.paidBy] != null) paid[r.paidBy] += c.total;
    for (const [id, v] of Object.entries(c.shares)) if (owed[id] != null) owed[id] += v;
  }
  const net = Object.fromEntries(ids.map(id => [id, round(paid[id] - owed[id])]));

  // Greedy: biggest debtor pays biggest creditor until everyone is square.
  const eps = decimals() === 0 ? 0.5 : 0.005;
  const debt = ids.filter(id => net[id] < -eps).map(id => ({ id, v: -net[id] })).sort((a, b) => b.v - a.v);
  const cred = ids.filter(id => net[id] > eps).map(id => ({ id, v: net[id] })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0, guard = 0;
  while (i < debt.length && j < cred.length && guard++ < 1000) {
    const amt = round(Math.min(debt[i].v, cred[j].v));
    if (amt > eps) transfers.push({ from: debt[i].id, to: cred[j].id, amount: amt, key: `${debt[i].id}>${cred[j].id}` });
    debt[i].v = round(debt[i].v - amt); cred[j].v = round(cred[j].v - amt);
    if (debt[i].v <= eps) i++;
    if (cred[j].v <= eps) j++;
  }
  // A transfer counts as done when marked paid for (about) this amount.
  for (const x of transfers) { const v = t.paid && t.paid[x.key]; x.done = v === true || (typeof v === 'number' && Math.abs(v - x.amount) <= eps); }
  const done = transfers.filter(x => x.done).length;
  return { receipts, paid, owed, net, total: round(total), transfers, done, settled: transfers.length > 0 && done === transfers.length };
}

/** Names used before, for quick adding. */
export function knownNames() {
  const seen = new Map();
  for (const t of trips()) for (const p of peopleOf(t)) if (!p.me && p.name) seen.set(p.name.toLowerCase(), p.name);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function dateRange(t) {
  const dates = receiptsOf(t).map(r => r.date).filter(isDate).sort();
  if (!dates.length) return isDate(t.date) ? fmt.long(t.date) : '';
  const a = dates[0], b = dates[dates.length - 1];
  if (a === b) return fmt.long(a);
  try { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).formatRange(parseDate(a), parseDate(b)); }
  catch (e) { return `${fmt.short(a)} – ${fmt.short(b)}`; }
}
