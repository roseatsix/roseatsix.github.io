/* ==========================================================
   Indonesian holidays: libur nasional and cuti bersama.

   Main source: the community-kept calendar at
   github.com/guangrei/APIHariLibur_V2, which follows the
   government's SKB and includes cuti bersama ("Cuti Bersama …").
   Backup: Nager.Date (https://date.nager.at), public holidays only.
   Cached on this device for a week, so calendars work offline.
   ========================================================== */

const COUNTRY = 'ID';
const MAX_AGE = 7 * 24 * 3600 * 1000;
const MAIN = 'https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/calendar.json';
const memory = new Map();      // year → [{ date, name, kind: 'holiday' | 'cuti', tentative }]
const inflight = new Map();
let onUpdate = () => {};

export function onHolidaysUpdate(fn) { onUpdate = fn; }

const storageKey = year => `ras-holidays-${COUNTRY}-${year}`;

function readCache(year) {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(year)) || 'null');
    if (v && Array.isArray(v.list) && v.v === 2) return v;
  } catch (e) { /* ignore */ }
  return null;
}

/** The main calendar covers more than one year: fetched once, shared. */
let mainFile = null;
function loadMain() {
  if (!mainFile) mainFile = fetch(MAIN, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Holiday calendar returned ' + r.status); return r.json(); })
    .catch(e => { mainFile = null; throw e; });
  return mainFile;
}

export function parseMain(data, year) {
  const list = [];
  for (const [date, v] of Object.entries(data || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(year + '-') || !v || !v.holiday) continue;
    for (const raw of v.summary || []) {
      const tentative = /belum pasti/i.test(raw);
      const name = raw.replace(/\s*\(belum pasti\)\s*/i, '').trim();
      if (!name) continue;
      list.push({ date, name, kind: /^cuti bersama/i.test(name) ? 'cuti' : 'holiday', tentative });
    }
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchNager(year) {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${COUNTRY}`);
  if (!res.ok) throw new Error('Holiday service returned ' + res.status);
  const data = await res.json();
  const seen = new Set();
  const list = [];
  for (const h of data) {
    if (!h.date) continue;
    const name = h.localName || h.name;
    const k = h.date + name;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ date: h.date, name, en: h.name && h.name !== name ? h.name : '', kind: 'holiday' });
  }
  return list;
}

async function fetchYear(year) {
  try {
    const list = parseMain(await loadMain(), year);
    if (list.length) return list;
  } catch (e) { console.warn('Main holiday calendar unavailable, using the backup', e); }
  return fetchNager(year);
}

/** Holidays for a year: returns what's known now, refreshes in the background. */
export function holidaysFor(year) {
  year = String(year);
  if (!memory.has(year)) {
    const cached = readCache(year);
    memory.set(year, cached ? cached.list : []);
    if (!cached || Date.now() - cached.at > MAX_AGE) refresh(year);
  }
  return memory.get(year);
}

function refresh(year) {
  if (inflight.has(year) || !navigator.onLine) return;
  const p = fetchYear(year)
    .then(list => {
      memory.set(year, list);
      try { localStorage.setItem(storageKey(year), JSON.stringify({ v: 2, at: Date.now(), list })); } catch (e) { /* full */ }
      onUpdate();
    })
    .catch(err => console.warn('Could not load holidays for', year, err))
    .finally(() => inflight.delete(year));
  inflight.set(year, p);
}

export function holidaysOn(date) {
  return holidaysFor(date.slice(0, 4)).filter(h => h.date === date);
}
