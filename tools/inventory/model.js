/* ==========================================================
   Home inventory data model.

     item:<id> {
       name, qty, category, room, spot,
       status: "owned" | "wish" | "gone",
       acquired: "YYYY-MM-DD",            // when it came into the house
       replace: { every, unit } | null,   // unit: days | weeks | months | years
       expires: "YYYY-MM-DD" | null,      // printed expiry date
       afterOpen: { every, unit } | null, // "use within N months after opening"
       opened: "YYYY-MM-DD" | null,
       lastReplaced: "YYYY-MM-DD" | null, // replacement cycle restarts here
       price, notes, link,
       condition: "" | "good" | "worn" | "broken",
       lastUsed: "YYYY-MM-DD" | null,
       sentimental: bool,
       keptAt: "YYYY-MM-DD" | null,       // you chose "keep" in Declutter
       goneAt, goneHow,                   // when/how it left the house
       createdAt
     }
     config { categories, rooms, currency }

   Also imported by the journal to show replacements that are due.
   ========================================================== */

import { pad, ymd, parseDate, addDays, today, isDate, fmt } from '../journal/model.js';
export { pad, ymd, parseDate, addDays, today, isDate, fmt };

export const state = { items: new Map(), version: 0 };

export function setItems(list) {
  state.items = new Map(list.map(i => [i.key, i.data]));
  state.version++;
}
export const get = key => state.items.get(key);
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
export const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

/* ---------- configuration ---------- */

export const DEFAULT_CONFIG = {
  categories: {
    kitchen: { name: 'Kitchen & dining', order: 1 },
    stationery: { name: 'Stationery & tools', order: 2 },
    clothing: { name: 'Clothing & bags', order: 3 },
    care: { name: 'Bathroom & personal care', order: 4 },
    cleaning: { name: 'Cleaning', order: 5 },
    electronics: { name: 'Electronics', order: 6 },
    books: { name: 'Books & media', order: 7 },
    decor: { name: 'Decor', order: 8 },
    furniture: { name: 'Furniture', order: 9 },
    health: { name: 'Medicine & health', order: 10 },
    pantry: { name: 'Food & pantry', order: 10.5 },
    other: { name: 'Other', order: 11 },
  },
  rooms: {
    bedroom: { name: 'Bedroom', order: 1 },
    living: { name: 'Living room', order: 2 },
    kitchen: { name: 'Kitchen', order: 3 },
    bathroom: { name: 'Bathroom', order: 4 },
    workspace: { name: 'Workspace', order: 5 },
    storage: { name: 'Storage', order: 6 },
    other: { name: 'Other', order: 7 },
  },
  currency: 'IDR',
};

export const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'AUD', 'JPY', 'GBP'];
export const UNITS = { days: ['day', 'days'], weeks: ['week', 'weeks'], months: ['month', 'months'], years: ['year', 'years'] };
export const CONDITIONS = { good: 'Good', worn: 'Worn', broken: 'Broken' };
export const GONE_HOW = { tossed: 'Thrown away', donated: 'Donated', sold: 'Sold', given: 'Given away', lost: 'Lost' };

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

let cfgMemo = null, cfgVer = -1;
export function config() {
  if (cfgVer === state.version) return cfgMemo;
  const stored = get('config') || {};
  const mergeMap = name => {
    const out = {};
    for (const [id, v] of Object.entries({ ...DEFAULT_CONFIG[name], ...(stored[name] || {}) })) {
      out[id] = { ...(DEFAULT_CONFIG[name][id] || {}), ...v, id };
    }
    return out;
  };
  cfgMemo = { categories: mergeMap('categories'), rooms: mergeMap('rooms'), currency: stored.currency || DEFAULT_CONFIG.currency };
  cfgVer = state.version;
  return cfgMemo;
}
export const activeList = map => Object.values(map).filter(v => !v.archived).sort(byOrder);
export const category = id => config().categories[id] || { id, name: 'Other', order: 99 };
export const room = id => config().rooms[id] || { id, name: 'Other', order: 99 };

/** Predefined spots in a room (rooms[id].spots = { <sid>: { name, order, archived } }). */
export const roomSpots = roomId => {
  const r = config().rooms[roomId];
  return r && r.spots ? Object.entries(r.spots).map(([id, s]) => ({ id, ...s })).filter(s => !s.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
};

/** The spot's display name: a predefined spot, or the text typed before spots existed. */
export function spotName(item) {
  const r = config().rooms[item.room];
  const s = item.spotId && r && r.spots && r.spots[item.spotId];
  return (s && s.name) || item.spot || '';
}

/* ---------- items ---------- */

let listMemo = null, listVer = -1;
export function allItems() {
  if (listVer === state.version) return listMemo;
  listMemo = [];
  for (const [key, data] of state.items) if (key.startsWith('item:')) listMemo.push({ id: key.slice(5), ...data });
  listVer = state.version;
  return listMemo;
}
export const owned = () => allItems().filter(i => (i.status || 'owned') === 'owned');
export const wishlist = () => allItems().filter(i => i.status === 'wish');
export const gone = () => allItems().filter(i => i.status === 'gone')
  .sort((a, b) => (b.goneAt || '').localeCompare(a.goneAt || ''));

/* ---------- dates & periods ---------- */

export function addPeriod(date, every, unit) {
  const d = parseDate(date);
  const n = Math.max(1, Number(every) || 1);
  if (unit === 'days') d.setDate(d.getDate() + n);
  else if (unit === 'weeks') d.setDate(d.getDate() + n * 7);
  else if (unit === 'years') d.setFullYear(d.getFullYear() + n);
  else {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return ymd(d);
}

export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

export function periodText(r) {
  if (!r) return '';
  const n = Number(r.every) || 1;
  const [one, many] = UNITS[r.unit] || UNITS.months;
  return n === 1 ? `every ${one}` : `every ${n} ${many}`;
}

/** How long, in words: "3 days", "5 months", "1 yr 4 mo". */
export function duration(fromDate, toDate = today()) {
  const days = daysBetween(fromDate, toDate);
  if (days < 0) return 'not yet';
  if (days < 14) return days === 1 ? '1 day' : `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  const a = parseDate(fromDate), b = parseDate(toDate);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 12) return `${months} months`;
  const y = Math.floor(months / 12), mo = months % 12;
  return mo ? `${y} yr ${mo} mo` : (y === 1 ? '1 year' : `${y} years`);
}

/** Replacement status, or null if the item isn't on a schedule. */
export function replaceInfo(item, on = today()) {
  if (!item.replace || (item.status || 'owned') !== 'owned') return null;
  const start = isDate(item.lastReplaced) ? item.lastReplaced : (isDate(item.acquired) ? item.acquired : null);
  if (!start) return null;
  const next = addPeriod(start, item.replace.every, item.replace.unit);
  const total = Math.max(1, daysBetween(start, next));
  const daysLeft = daysBetween(on, next);
  const soonWindow = Math.min(30, Math.max(3, Math.round(total * 0.15)));
  return {
    start, next, daysLeft, total,
    pct: Math.min(100, Math.max(0, Math.round((total - daysLeft) / total * 100))),
    state: daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : daysLeft <= soonWindow ? 'soon' : 'ok',
  };
}

export function replacementsDue(by = today()) {
  return owned().map(i => ({ item: i, r: replaceInfo(i) })).filter(x => x.r && x.r.next <= by)
    .sort((a, b) => a.r.next.localeCompare(b.r.next));
}
export const replacementsOn = date => owned().map(i => ({ item: i, r: replaceInfo(i) })).filter(x => x.r && x.r.next === date);

/* ---------- expiry ---------- */

const EXPIRY_SOON_DAYS = 30;

/** Effective expiry: the printed date, or opened + "use within", whichever is first. */
export function expiryInfo(item, on = today()) {
  if ((item.status || 'owned') !== 'owned') return null;
  const candidates = [];
  if (isDate(item.expires)) candidates.push({ date: item.expires, source: 'date' });
  if (item.afterOpen && isDate(item.opened)) candidates.push({ date: addPeriod(item.opened, item.afterOpen.every, item.afterOpen.unit), source: 'opened' });
  if (!candidates.length) return null;
  const first = candidates.sort((a, b) => a.date.localeCompare(b.date))[0];
  const daysLeft = daysBetween(on, first.date);
  return { ...first, daysLeft, state: daysLeft < 0 ? 'expired' : daysLeft <= EXPIRY_SOON_DAYS ? 'soon' : 'ok' };
}

export function expiryText(x) {
  if (!x) return '';
  const opened = x.source === 'opened';
  if (x.daysLeft < 0) return opened ? `past use-by since opening (${duration(x.date)})` : `expired ${duration(x.date)} ago`;
  if (x.daysLeft === 0) return opened ? 'use up today' : 'expires today';
  return opened ? `use within ${duration(today(), x.date)}` : `expires in ${duration(today(), x.date)}`;
}

/**
 * Everything at home that needs attention by a date:
 * replacements due, and things expired or expiring within `soonDays`.
 */
export function attention(on = today(), soonDays = 7) {
  const out = [];
  for (const item of owned()) {
    const r = replaceInfo(item, on);
    if (r && r.next <= on) out.push({ item, kind: 'replace', date: r.next, overdue: r.next < on, text: dueText(r) });
    const x = expiryInfo(item, on);
    if (x && x.daysLeft <= soonDays) out.push({ item, kind: 'expiry', date: x.date, overdue: x.daysLeft < 0, text: expiryText(x) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Replacements and expiry dates falling exactly on a date (for calendars). */
export function attentionOn(date) {
  const out = [];
  for (const item of owned()) {
    const r = replaceInfo(item);
    if (r && r.next === date) out.push({ item, kind: 'replace' });
    const x = expiryInfo(item);
    if (x && x.date === date) out.push({ item, kind: 'expiry' });
  }
  return out;
}

export function dueText(r) {
  if (!r) return '';
  if (r.state === 'overdue') return `overdue by ${duration(r.next)}`;
  if (r.state === 'today') return 'replace today';
  return `replace in ${duration(today(), r.next)}`;
}

/* ---------- money ---------- */

export function money(n, opts = {}) {
  const cur = config().currency;
  try {
    return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : undefined, {
      style: 'currency', currency: cur, maximumFractionDigits: cur === 'IDR' || cur === 'JPY' ? 0 : 2, ...opts,
    }).format(n || 0);
  } catch (e) { return `${cur} ${Math.round(n || 0)}`; }
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

export function plainNumber(n) {
  if (n == null || n === '') return '';
  const cur = config().currency;
  return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : undefined, { maximumFractionDigits: cur === 'IDR' || cur === 'JPY' ? 0 : 2 }).format(n);
}

/* ---------- keep / review / let go ---------- */

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const monthsSince = d => daysBetween(d, today()) / 30.44;
const KEEP_SNOOZE_DAYS = 182;

/**
 * Suggest what to do with an owned item, with the reasons.
 * kind: keep | review | letgo
 */
export function verdict(item, everything = owned()) {
  const reasons = [];
  if (item.sentimental) return { kind: 'keep', score: 0, reasons: ['Sentimental'], locked: true };

  let score = 0;
  if (item.condition === 'broken') { score += 3; reasons.push('Broken'); }
  else if (item.condition === 'worn') { score += 1; reasons.push('Worn'); }

  if (isDate(item.lastUsed)) {
    const m = monthsSince(item.lastUsed);
    if (m >= 12) { score += 3; reasons.push(`Not used in ${duration(item.lastUsed)}`); }
    else if (m >= 6) { score += 1.5; reasons.push(`Not used in ${duration(item.lastUsed)}`); }
  } else if (isDate(item.acquired) && monthsSince(item.acquired) >= 12) {
    score += 1;
    reasons.push(`Never marked as used, here ${duration(item.acquired)}`);
  }

  const name = norm(item.name);
  const twins = everything.filter(o => o.id !== item.id && o.category === item.category && name && norm(o.name) === name);
  const copies = twins.reduce((n, o) => n + (Number(o.qty) || 1), 0) + (Number(item.qty) || 1);
  if (copies >= 3) { score += 1.5; reasons.push(`You have ${copies} of these`); }
  else if (copies === 2 && twins.length) { score += 0.5; reasons.push('You have 2 of these'); }
  else if ((Number(item.qty) || 1) >= 4) { score += 1; reasons.push(`Quantity ${item.qty}`); }

  const r = replaceInfo(item);
  if (r && r.state === 'overdue') reasons.push('Due for replacement');
  const x = expiryInfo(item);
  if (x && x.state === 'expired') { score += 3; reasons.unshift(x.source === 'opened' ? 'Past its use-by since opening' : 'Expired'); }

  // You chose to keep it recently: hold off unless it broke since.
  if (isDate(item.keptAt) && daysBetween(item.keptAt, today()) < KEEP_SNOOZE_DAYS && item.condition !== 'broken') {
    return { kind: 'keep', score, reasons: [`You chose to keep it on ${fmt.short(item.keptAt)}`], snoozed: true };
  }

  const kind = score >= 3 ? 'letgo' : score >= 1.5 ? 'review' : 'keep';
  if (kind !== 'keep' && Number(item.price) > 0 && item.condition !== 'broken') reasons.push('Could be sold or donated');
  return { kind, score, reasons };
}
