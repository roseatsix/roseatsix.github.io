/* ==========================================================
   Indonesian public holidays, fetched from Nager.Date
   (https://date.nager.at), a free public-holiday service.
   Cached on this device so calendars work offline.
   Collective leave (cuti bersama) isn't in that data; add those
   as events in the "Day off / cuti" category.
   ========================================================== */

const COUNTRY = 'ID';
const MAX_AGE = 7 * 24 * 3600 * 1000;
const memory = new Map();      // year → [{ date, name }]
const inflight = new Map();
let onUpdate = () => {};

export function onHolidaysUpdate(fn) { onUpdate = fn; }

const storageKey = year => `ras-holidays-${COUNTRY}-${year}`;

function readCache(year) {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(year)) || 'null');
    if (v && Array.isArray(v.list)) return v;
  } catch (e) { /* ignore */ }
  return null;
}

async function fetchYear(year) {
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
    list.push({ date: h.date, name, en: h.name && h.name !== name ? h.name : '' });
  }
  return list;
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
      try { localStorage.setItem(storageKey(year), JSON.stringify({ at: Date.now(), list })); } catch (e) { /* full */ }
      onUpdate();
    })
    .catch(err => console.warn('Could not load holidays for', year, err))
    .finally(() => inflight.delete(year));
  inflight.set(year, p);
}

export function holidaysOn(date) {
  return holidaysFor(date.slice(0, 4)).filter(h => h.date === date);
}
