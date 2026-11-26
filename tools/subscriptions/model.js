/* ==========================================================
   Subscriptions data model.

     sub:<id> {
       name, price, currency-less number,
       cycle: { every, unit },            // unit: days | weeks | months | years
       anchor: "YYYY-MM-DD",              // a billing date; others repeat from it
       category, platform,
       status: "active" | "paused" | "cancelled", statusAt,
       priceHistory: [ { price, from } ], // older prices, newest last
       split: { mode: "equal", count } | { mode: "amount", mine } | null,
       notes, createdAt
     }
     config { categories, platforms, currency }
   ========================================================== */

import { pad, ymd, parseDate, addDays, today, isDate, fmt } from '../journal/model.js';
import { addPeriod, daysBetween, duration, UNITS } from '../inventory/model.js';
export { pad, ymd, parseDate, addDays, today, isDate, fmt, addPeriod, daysBetween, duration, UNITS };

export const state = { items: new Map(), version: 0 };
export function setItems(list) { state.items = new Map(list.map(i => [i.key, i.data])); state.version++; }
export const get = key => state.items.get(key);
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
export const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

export const DEFAULT_CONFIG = {
  categories: {
    streaming: { name: 'Streaming', order: 1 },
    music: { name: 'Music & audio', order: 2 },
    cloud: { name: 'Cloud & storage', order: 3 },
    apps: { name: 'Apps & software', order: 4 },
    reading: { name: 'News & reading', order: 5 },
    gaming: { name: 'Gaming', order: 6 },
    fitness: { name: 'Fitness & health', order: 7 },
    utilities: { name: 'Phone, internet & utilities', order: 8 },
    other: { name: 'Other', order: 9 },
  },
  platforms: {
    appstore: { name: 'App Store', order: 1 },
    googleplay: { name: 'Google Play', order: 2 },
    website: { name: 'Website / direct', order: 3 },
    card: { name: 'Bank card', order: 4 },
    ewallet: { name: 'E-wallet', order: 5 },
    other: { name: 'Other', order: 6 },
  },
  currency: 'IDR',
};
export const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'AUD', 'JPY', 'GBP'];
export const STATUS = { active: 'Active', paused: 'Paused', cancelled: 'Cancelled' };

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
let cfgMemo = null, cfgVer = -1;
export function config() {
  if (cfgVer === state.version) return cfgMemo;
  const stored = get('config') || {};
  const mergeMap = name => {
    const out = {};
    for (const [id, v] of Object.entries({ ...DEFAULT_CONFIG[name], ...(stored[name] || {}) })) out[id] = { ...(DEFAULT_CONFIG[name][id] || {}), ...v, id };
    return out;
  };
  cfgMemo = { categories: mergeMap('categories'), platforms: mergeMap('platforms'), currency: stored.currency || DEFAULT_CONFIG.currency };
  cfgVer = state.version;
  return cfgMemo;
}
export const activeList = map => Object.values(map).filter(v => !v.archived).sort(byOrder);
export const category = id => config().categories[id] || { id, name: 'Other', order: 99 };
export const platform = id => config().platforms[id] || { id, name: '', order: 99 };

export function subs() {
  const out = [];
  for (const [key, data] of state.items) if (key.startsWith('sub:')) out.push({ id: key.slice(4), ...data });
  return out;
}
export const active = () => subs().filter(s => (s.status || 'active') === 'active');

/* ---------- money ---------- */

export function money(n, opts = {}) {
  const cur = config().currency;
  try {
    return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : undefined, {
      style: 'currency', currency: cur, maximumFractionDigits: cur === 'IDR' || cur === 'JPY' ? 0 : 2, ...opts,
    }).format(n || 0);
  } catch (e) { return `${cur} ${Math.round(n || 0)}`; }
}
export function plainNumber(n) {
  if (n == null || n === '') return '';
  const cur = config().currency;
  return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : undefined, { maximumFractionDigits: cur === 'IDR' || cur === 'JPY' ? 0 : 2 }).format(n);
}
export function parseAmount(s) {
  s = String(s ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const cur = config().currency;
  if (cur === 'IDR' || cur === 'JPY') { const n = Number(s.replace(/[.,]/g, '')); return isFinite(n) ? n : null; }
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  s = last >= 0 && s.length - last - 1 <= 2 ? s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1) : s.replace(/[.,]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/* ---------- cycles & costs ---------- */

export function cycleText(c) {
  if (!c) return '';
  const n = Number(c.every) || 1;
  const [one, many] = UNITS[c.unit] || UNITS.months;
  const adverb = { days: 'daily', weeks: 'weekly', months: 'monthly', years: 'yearly' }[c.unit];
  return n === 1 ? adverb : `every ${n} ${many}`;
}

/** The price on a date, honouring a scheduled change (nextPrice). */
export function priceOn(s, on = today()) {
  if (s.nextPrice && isDate(s.nextPrice.from) && on >= s.nextPrice.from) return Number(s.nextPrice.price) || 0;
  return Number(s.price) || 0;
}

/** Your share of one payment. */
export function myCost(s, on = today()) {
  const price = priceOn(s, on);
  if (!s.split) return price;
  if (s.split.mode === 'amount') return Math.max(0, Number(s.split.mine) || 0);
  return price / Math.max(1, Number(s.split.count) || 1);
}

/** Your share, normalised to a month. */
export function monthly(s) {
  const n = Math.max(1, Number(s.cycle && s.cycle.every) || 1);
  const perMonth = { days: 30.44 / n, weeks: 4.345 / n, months: 1 / n, years: 1 / (12 * n) }[(s.cycle && s.cycle.unit) || 'months'];
  return myCost(s) * perMonth;
}

/** Next billing on or after `from` (null when paused or cancelled). */
export function nextBilling(s, from = today()) {
  if ((s.status || 'active') !== 'active' || !isDate(s.anchor) || !s.cycle) return null;
  let d = s.anchor;
  let guard = 0;
  if (d >= from) {
    // step back to the first billing on/after `from` isn't needed: anchor is in the future
    return d;
  }
  while (d < from && guard++ < 5000) d = addPeriod(d, s.cycle.every, s.cycle.unit);
  return d;
}

/** Billing dates within [start, end] (for calendars). */
export function billingsBetween(s, start, end) {
  const out = [];
  let d = nextBilling(s, start);
  let guard = 0;
  while (d && d <= end && guard++ < 400) { out.push(d); d = addPeriod(d, s.cycle.every, s.cycle.unit); }
  return out;
}

export function upcoming(days = 30, from = today()) {
  const end = addDays(from, days);
  const out = [];
  for (const s of active()) for (const d of billingsBetween(s, from, end)) out.push({ sub: s, date: d });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));
}

export const renewalsOn = date => upcoming(0, date).filter(x => x.date === date);

export function whenText(date) {
  const n = daysBetween(today(), date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 7) return `in ${n} days`;
  return fmt.short(date);
}
