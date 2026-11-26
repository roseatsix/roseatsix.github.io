/* ==========================================================
   Journal data model.

   Every entry is its own synced item, so edits on different
   devices never touch each other:

     task:<id>    { title, due, time, done, doneAt, notes,
                    subtasks: { <id>: { text, done, order } }, createdAt }
     log:<id>     { date, time, cat, text, amount, spendCat, createdAt }
     event:<id>   { title, date, endDate, cat, yearly, note }
     day:<date>   { habits: { <habitId>: true } }
     budget:<YYYY-MM> { total, cats: { <spendCatId>: amount } }
     habits       { items: { <id>: { name, order, archived } } }
     config       { logCats, eventCats, spendCats, currency }
   ========================================================== */

/* ---------- dates ---------- */

export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); };
export const today = () => ymd(new Date());
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parseDate(s));
export const isMonth = s => /^\d{4}-\d{2}$/.test(s || '');
export const isYear = s => /^\d{4}$/.test(s || '');
export const weekStart = s => { const d = parseDate(s); return addDays(s, -((d.getDay() + 6) % 7)); };
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); return ymd(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
export const daysInMonth = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };

export const fmt = {
  long(s) {
    const d = parseDate(s);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
  },
  short: s => parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  weekday: s => parseDate(s).toLocaleDateString(undefined, { weekday: 'long' }),
  wd: s => parseDate(s).toLocaleDateString(undefined, { weekday: 'short' }),
  month: m => parseDate(m + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  monthName: m => parseDate(m + '-01').toLocaleDateString(undefined, { month: 'long' }),
  relative(s) {
    const t = today();
    if (s === t) return 'Today';
    if (s === addDays(t, -1)) return 'Yesterday';
    if (s === addDays(t, 1)) return 'Tomorrow';
    return '';
  },
};

/* ---------- colours ---------- */

export const SWATCHES = {
  rose: '#C27A6E', terracotta: '#B8613E', ochre: '#C1914F', sand: '#A8916A',
  sage: '#7F8E6B', moss: '#5E7B53', teal: '#4F8A86', sky: '#6C8FB0',
  lavender: '#9478A6', plum: '#8E5A78', slate: '#7A7470',
};
export const HOLIDAY = '#B4483C';
export const swatch = name => (name === 'holiday' ? HOLIDAY : SWATCHES[name] || SWATCHES.slate);

/* ---------- defaults ---------- */

export const DEFAULT_CONFIG = {
  logCats: {
    work: { name: 'Work', color: 'sage', prompt: 'What did you just finish?', order: 1 },
    personal: { name: 'Personal', color: 'rose', prompt: "What's on your mind?", order: 2 },
    mood: { name: 'Mood', color: 'lavender', prompt: 'How are you feeling right now?', order: 3,
      fields: { level: { label: 'Mood', type: 'rating', order: 1 } } },
    health: { name: 'Health', color: 'moss', prompt: "How's your body doing?", order: 4 },
    learning: { name: 'Learning', color: 'ochre', prompt: 'What did you learn?', order: 5 },
    travel: { name: 'Travel', color: 'teal', prompt: 'Anything to note about the trip?', order: 6,
      fields: {
        where: { label: 'Where to?', type: 'text', order: 1 },
        how: { label: 'Getting there', type: 'choice', options: ['Walk', 'Car', 'Motorbike', 'Bus', 'Train', 'Plane', 'Boat'], order: 2 },
      } },
    spending: { name: 'Spending', color: 'terracotta', prompt: 'What did you buy?', order: 7, spend: true },
  },
  eventCats: {
    dayoff: { name: 'Day off / cuti', color: 'holiday', order: 1, dayoff: true },
    birthday: { name: 'Birthday', color: 'rose', order: 2 },
    trip: { name: 'Trip', color: 'teal', order: 3 },
    deadline: { name: 'Deadline', color: 'terracotta', order: 4 },
    other: { name: 'Other', color: 'slate', order: 5 },
  },
  spendCats: {
    food: { name: 'Food & drink', order: 1 },
    transport: { name: 'Transport', order: 2 },
    shopping: { name: 'Shopping', order: 3 },
    bills: { name: 'Bills', order: 4 },
    fun: { name: 'Fun', order: 5 },
    other: { name: 'Other', order: 6 },
  },
  currency: 'IDR',
};

export const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'AUD', 'JPY', 'GBP'];

/* ---------- state + lookups ---------- */

export const state = { items: new Map(), version: 0 };

export function setItems(list) {
  state.items = new Map(list.map(i => [i.key, i.data]));
  state.version++;
}

export const get = key => state.items.get(key);
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
export const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

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
  cfgMemo = {
    logCats: mergeMap('logCats'),
    eventCats: mergeMap('eventCats'),
    spendCats: mergeMap('spendCats'),
    currency: stored.currency || DEFAULT_CONFIG.currency,
  };
  cfgVer = state.version;
  return cfgMemo;
}

export const activeList = map => Object.values(map).filter(v => !v.archived).sort(byOrder);
export const logCat = id => config().logCats[id] || { id, name: 'Other', color: 'slate', prompt: '' };
export const eventCat = id => config().eventCats[id] || { id, name: 'Event', color: 'slate' };
export const spendCat = id => config().spendCats[id] || { id, name: 'Other' };
export const isSpendCat = id => !!logCat(id).spend;

export function activeHabits() {
  const h = get('habits');
  return Object.entries((h && h.items) || {}).filter(([, v]) => !v.archived)
    .map(([id, v]) => ({ id, ...v })).sort(byOrder);
}
export const habitsOn = date => ({ ...((get('day:' + date) || {}).habits || {}) });

/* ---------- money ---------- */

export function money(n, opts = {}) {
  const cur = config().currency;
  try {
    return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : undefined, {
      style: 'currency', currency: cur, maximumFractionDigits: cur === 'IDR' || cur === 'JPY' ? 0 : 2, ...opts,
    }).format(n || 0);
  } catch (e) {
    return `${cur} ${Math.round(n || 0)}`;
  }
}

export function plainNumber(n) {
  if (n == null || n === '') return '';
  const cur = config().currency;
  return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : undefined, {
    maximumFractionDigits: cur === 'IDR' || cur === 'JPY' ? 0 : 2,
  }).format(n);
}

/** Parse what someone typed as an amount ("25.000", "25,000", "12.50"). */
export function parseAmount(s) {
  s = String(s || '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const cur = config().currency;
  if (cur === 'IDR' || cur === 'JPY') {
    const n = Number(s.replace(/[.,]/g, ''));
    return isFinite(n) ? n : null;
  }
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    s = s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1);
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/* ---------- indexes (rebuilt when data changes) ---------- */

let idxMemo = null, idxVer = -1;
export function idx() {
  if (idxVer === state.version) return idxMemo;
  const logsByDate = new Map();
  const tasks = [];
  const events = [];
  for (const [key, data] of state.items) {
    if (key.startsWith('log:')) {
      const e = { id: key.slice(4), ...data };
      if (!isDate(e.date)) continue;
      if (!logsByDate.has(e.date)) logsByDate.set(e.date, []);
      logsByDate.get(e.date).push(e);
    } else if (key.startsWith('task:')) {
      tasks.push({ id: key.slice(5), ...data });
    } else if (key.startsWith('event:')) {
      events.push({ id: key.slice(6), ...data });
    }
  }
  for (const list of logsByDate.values()) {
    list.sort((a, b) => (a.time || '').localeCompare(b.time || '') || (a.createdAt || 0) - (b.createdAt || 0));
  }
  const tasksByDue = new Map();
  const undated = [];
  for (const t of tasks) {
    if (isDate(t.due)) {
      if (!tasksByDue.has(t.due)) tasksByDue.set(t.due, []);
      tasksByDue.get(t.due).push(t);
    } else {
      undated.push(t);
    }
  }
  const taskSort = (a, b) => (a.done - b.done) || (a.time || '99').localeCompare(b.time || '99') || (a.createdAt || 0) - (b.createdAt || 0);
  for (const list of tasksByDue.values()) list.sort(taskSort);
  undated.sort(taskSort);
  idxMemo = { logsByDate, tasks, tasksByDue, undated, events };
  idxVer = state.version;
  return idxMemo;
}

export const logsOn = date => idx().logsByDate.get(date) || [];
export const tasksDue = date => idx().tasksByDue.get(date) || [];

export function overdueTasks(before = today()) {
  return idx().tasks.filter(t => !t.done && isDate(t.due) && t.due < before)
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** Does an event fall on this date? (Handles ranges and yearly repeats.) */
export function occurs(e, date) {
  if (!isDate(e.date)) return false;
  const end = isDate(e.endDate) && e.endDate >= e.date ? e.endDate : e.date;
  if (!e.yearly) return date >= e.date && date <= end;
  if (date < e.date) return false;
  const md = date.slice(5);
  const s = e.date.slice(5), f = end.slice(5);
  return s <= f ? md >= s && md <= f : md >= s || md <= f;
}

export const eventsOn = date => idx().events.filter(e => occurs(e, date))
  .sort((a, b) => (eventCat(a.cat).order ?? 0) - (eventCat(b.cat).order ?? 0));

export const spendingIn = prefix => {
  const out = [];
  for (const [date, list] of idx().logsByDate) {
    if (!date.startsWith(prefix)) continue;
    for (const e of list) if (isSpendCat(e.cat) && typeof e.amount === 'number') out.push(e);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
};

export const sum = list => list.reduce((n, e) => n + (e.amount || 0), 0);
