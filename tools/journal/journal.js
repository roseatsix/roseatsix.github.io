/* ==========================================================
   Journal: daily planner + notes, month calendar, search,
   habit tracker. Data lives in the encrypted "journal" store.

   Items:
     "day:YYYY-MM-DD" → {
        tasks:    { <id>: { text, done, order, movedTo? } },
        schedule: { <id>: { time: "HH:MM", text } },
        habits:   { <habitId>: true },
        notes:    "free text"
     }
     "habits" → { items: { <id>: { name, order, archived? } } }

   Tasks, schedule entries and habits are keyed maps (not arrays),
   so edits to different entries on different devices merge cleanly.
   ========================================================== */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { merge3, same } from '../../assets/js/core/merge.js';
import { esc, openDialog, toast, busy } from '../../assets/js/ui/dom.js';

/* ---------- dates ---------- */

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parseDate(s));
const isMonth = s => /^\d{4}-\d{2}$/.test(s || '');

function fmtLong(s) {
  const d = parseDate(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}
const fmtShort = s => parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const weekday = s => parseDate(s).toLocaleDateString(undefined, { weekday: 'long' });

function relative(s) {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  if (s === addDays(t, 1)) return 'Tomorrow';
  return '';
}

/* ---------- data helpers ---------- */

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const dayKey = date => 'day:' + date;

function normDay(d) {
  d = d || {};
  return {
    tasks: { ...(d.tasks || {}) },
    schedule: { ...(d.schedule || {}) },
    habits: { ...(d.habits || {}) },
    notes: typeof d.notes === 'string' ? d.notes : '',
  };
}

const sortedTasks = d => Object.entries(d.tasks).map(([id, t]) => ({ id, ...t })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const sortedSchedule = d => Object.entries(d.schedule).map(([id, s]) => ({ id, ...s }))
  .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

function activeHabits() {
  const h = items.get('habits');
  const list = h && h.items ? h.items : {};
  return Object.entries(list).filter(([, v]) => !v.archived)
    .map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

const isEmptyDay = d => !d || (!Object.keys(d.tasks || {}).length && !Object.keys(d.schedule || {}).length
  && !Object.values(d.habits || {}).some(Boolean) && !(d.notes || '').trim());

/* ---------- state ---------- */

const main = document.getElementById('journal');
const tabs = document.querySelector('.j-tabs');
const store = openStore('journal');

let items = new Map();     // key → data
let loaded = false;
let route = { view: 'day', date: today() };
let showLeftovers = false;
let searchQuery = '';

// The open day: base = last stored version, draft = what's on screen.
const day = { date: null, base: null, draft: null, dirty: false, timer: null };

/* ---------- routing ---------- */

function parseHash() {
  const [, view, arg] = (location.hash || '').split('/');
  if (view === 'month') return { view: 'month', month: isMonth(arg) ? arg : today().slice(0, 7) };
  if (view === 'search') return { view: 'search' };
  return { view: 'day', date: isDate(arg) ? arg : today() };
}

function go(hash) {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function onRoute() {
  saveNow();
  route = parseHash();
  if (route.view === 'day' && route.date !== day.date) openDay(route.date);
  tabs.querySelectorAll('[data-tab]').forEach(a => {
    a.setAttribute('aria-current', a.dataset.tab === route.view ? 'page' : 'false');
  });
  const dayTab = tabs.querySelector('[data-tab=day]');
  dayTab.href = '#/day/' + (route.view === 'day' ? route.date : (day.date || today()));
  tabs.querySelector('[data-tab=month]').href = '#/month/' + (route.view === 'month' ? route.month : (day.date || today()).slice(0, 7));
  render();
  window.scrollTo({ top: 0 });
}

/* ---------- the open day: drafts, merging, saving ---------- */

function openDay(date) {
  saveNow();
  day.date = date;
  day.base = normDay(items.get(dayKey(date)));
  day.draft = clone(day.base);
  day.dirty = false;
  showLeftovers = false;
  savedText = '';
}

/** Fold newly synced data into the draft without losing unsaved typing. */
function syncDraft() {
  if (!day.date) return false;
  const stored = normDay(items.get(dayKey(day.date)));
  if (same(stored, day.base)) return false;
  const merged = normDay(merge3(day.base, day.draft, stored));
  day.base = stored;
  const changed = !same(merged, day.draft);
  day.draft = merged;
  return changed;
}

function edit(mutate, delay = 0) {
  mutate(day.draft);
  day.dirty = true;
  setSaved('Saving…');
  clearTimeout(day.timer);
  day.timer = setTimeout(saveNow, delay);
}

function saveNow() {
  clearTimeout(day.timer);
  if (!day.dirty || !day.date) return;
  day.dirty = false;
  const key = dayKey(day.date);
  const data = clone(day.draft);
  if (isEmptyDay(data) && !items.has(key)) { setSaved(''); return; }
  store.put(key, data)
    .then(() => setSaved('Saved'))
    .catch(err => { console.error(err); day.dirty = true; setSaved('Not saved'); toast("Couldn't save. " + (err.message || '')); });
}

let savedText = '';
function setSaved(text) {
  savedText = text;
  const el = main.querySelector('[data-saved]');
  if (el) el.textContent = text;
}

addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

/* ---------- rendering ---------- */

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13"/><path d="m13 7 5 5-5 5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h3.5L18.5 9a2.1 2.1 0 0 0-3-3L5.5 16z"/></svg>',
};

function render() {
  if (!loaded) return renderGate();
  const focus = captureFocus();
  // Keep half-typed text in the "add" fields across re-renders.
  const kept = {};
  main.querySelectorAll('[data-keep]').forEach(el => { if (el.value) kept[el.dataset.focus] = el.value; });
  if (route.view === 'day') main.innerHTML = renderDay();
  else if (route.view === 'month') main.innerHTML = renderMonth();
  else main.innerHTML = renderSearch();
  for (const [k, v] of Object.entries(kept)) {
    const el = main.querySelector(`[data-keep][data-focus="${CSS.escape(k)}"]`);
    if (el) el.value = v;
  }
  main.querySelectorAll('textarea').forEach(autosize);
  restoreFocus(focus);
}

function captureFocus() {
  const el = document.activeElement;
  if (!el || !main.contains(el) || !el.dataset.focus) return null;
  return { key: el.dataset.focus, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(f) {
  if (!f) return;
  const el = main.querySelector(`[data-focus="${CSS.escape(f.key)}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { if (f.start != null) el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text field */ }
}

function autosize(t) {
  t.style.height = 'auto';
  t.style.height = Math.max(t.scrollHeight, 160) + 'px';
}

/* ----- gate (not signed in / locked / loading) ----- */

function renderGate() {
  const st = S.getState();
  const copy = {
    signedOut: ['Your journal is private', 'Sign in with Google to start writing. Everything is encrypted on your device before it syncs.', 'Sign in'],
    unconfigured: ['Sync isn\'t set up', 'The journal needs sign-in to be connected first.', null],
    needsSetup: ['Set up your vault', 'Choose a passphrase to encrypt your journal.', 'Set up vault'],
    locked: ['Unlock your journal', 'Enter your passphrase to open your journal on this device.', 'Unlock'],
    denied: ['Can\'t open your data', 'The database refused access for this account.', null],
    error: ['Something went wrong', st.error || '', 'Try again'],
  }[st.status];

  if (!copy) {
    main.innerHTML = `<div class="j-gate"><span class="spinner" aria-hidden="true"></span><p>Opening your journal…</p></div>`;
    return;
  }
  const [title, text, action] = copy;
  main.innerHTML = `
    <div class="j-gate">
      <svg class="j-gate-blossom" aria-hidden="true"><use href="#blossom"/></svg>
      <h1>${esc(title)}</h1>
      <p>${esc(text)}</p>
      ${action ? `<button class="btn btn-primary" type="button" data-act="gate">${esc(action)}</button>` : ''}
    </div>`;
}

/* ----- day view ----- */

function leftovers() {
  const t = today();
  const from = addDays(t, -60);
  const out = [];
  for (const [key, data] of items) {
    if (!key.startsWith('day:')) continue;
    const date = key.slice(4);
    if (date >= t || date < from) continue;
    for (const task of sortedTasks(normDay(data))) {
      if (!task.done && !task.movedTo && (task.text || '').trim()) out.push({ date, ...task });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0));
}

function streak(habitId, upTo) {
  let date = upTo;
  const checked = d => !!normDay(items.get(dayKey(d))).habits[habitId];
  const onDay = date === day.date ? !!day.draft.habits[habitId] : checked(date);
  if (!onDay) date = addDays(date, -1);
  let n = 0;
  while (n < 3650 && (date === day.date ? !!day.draft.habits[habitId] : checked(date))) {
    n++;
    date = addDays(date, -1);
  }
  return n;
}

function renderDay() {
  const d = day.draft;
  const date = day.date;
  const rel = relative(date);
  const isToday = date === today();
  const tasks = sortedTasks(d);
  const open = tasks.filter(t => !t.movedTo);
  const doneCount = open.filter(t => t.done).length;
  const schedule = sortedSchedule(d);
  const habits = activeHabits();
  const left = isToday ? leftovers() : [];

  const leftoverBanner = left.length ? `
    <div class="j-banner">
      <div class="j-banner-row">
        <p><strong>${left.length} unfinished ${left.length === 1 ? 'task' : 'tasks'}</strong> from earlier days</p>
        <div class="j-banner-actions">
          <button class="btn btn-text" type="button" data-act="toggle-leftovers" aria-expanded="${showLeftovers}">${showLeftovers ? 'Hide' : 'Review'}</button>
          <button class="btn btn-ghost" type="button" data-act="move-all">Move all to today</button>
        </div>
      </div>
      ${showLeftovers ? `<ul class="j-leftovers">${left.map(t => `
        <li>
          <span class="j-left-text">${esc(t.text)}</span>
          <a class="j-left-date" href="#/day/${t.date}">${esc(fmtShort(t.date))}</a>
          <button class="btn btn-ghost btn-sm" type="button" data-act="move-one" data-date="${t.date}" data-id="${t.id}">Move</button>
        </li>`).join('')}</ul>` : ''}
    </div>` : '';

  const taskRows = tasks.map(t => t.movedTo ? `
      <li class="j-task is-moved">
        <span class="j-moved-icon">${ICONS.arrow}</span>
        <span class="j-task-text">${esc(t.text)}</span>
        <a class="j-moved-to" href="#/day/${t.movedTo}">moved to ${esc(fmtShort(t.movedTo))}</a>
      </li>` : `
      <li class="j-task${t.done ? ' is-done' : ''}">
        <label class="j-check">
          <input type="checkbox" data-act="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done: ${esc(t.text)}">
          <span class="j-box">${ICONS.check}</span>
        </label>
        <input class="j-inline" data-field="task-text" data-id="${t.id}" data-focus="task:${t.id}" value="${esc(t.text)}" aria-label="Task">
        <button class="j-del" type="button" data-act="del-task" data-id="${t.id}" aria-label="Delete task">${ICONS.x}</button>
      </li>`).join('');

  const schedRows = schedule.map(s => `
      <li class="j-sched">
        <input class="j-time" type="time" data-field="sched-time" data-id="${s.id}" data-focus="stime:${s.id}" value="${esc(s.time || '')}" aria-label="Time">
        <input class="j-inline" data-field="sched-text" data-id="${s.id}" data-focus="stext:${s.id}" value="${esc(s.text)}" aria-label="What">
        <button class="j-del" type="button" data-act="del-sched" data-id="${s.id}" aria-label="Delete">${ICONS.x}</button>
      </li>`).join('');

  const habitChips = habits.map(h => {
    const on = !!d.habits[h.id];
    const n = streak(h.id, date);
    return `
      <button type="button" class="j-habit" data-act="toggle-habit" data-id="${h.id}" aria-pressed="${on}">
        <span class="j-habit-check">${ICONS.check}</span>
        <span class="j-habit-name">${esc(h.name)}</span>
        ${n >= 2 ? `<span class="j-streak" title="${n} days in a row">${n}d</span>` : ''}
      </button>`;
  }).join('');

  return `
    <section class="j-day">
      <div class="j-dayhead">
        <button class="icon-btn" type="button" data-act="prev-day" aria-label="Previous day">${ICONS.prev}</button>
        <div class="j-daytitle">
          <p class="eyebrow">${esc(weekday(date))}${rel ? ` · ${rel}` : ''}</p>
          <h1>${esc(fmtLong(date))}</h1>
        </div>
        <button class="icon-btn" type="button" data-act="next-day" aria-label="Next day">${ICONS.next}</button>
        <div class="j-dayhead-end">
          <span class="j-saved" data-saved aria-live="polite">${esc(savedText)}</span>
          ${isToday ? '' : '<button class="btn btn-ghost" type="button" data-act="go-today">Today</button>'}
          <label class="icon-btn j-datepick" aria-label="Pick a date">${ICONS.cal}
            <input type="date" data-act="pick-date" value="${date}" tabindex="-1">
          </label>
        </div>
      </div>

      ${leftoverBanner}

      <div class="j-grid">
        <div class="j-col">
          <section class="j-card tone-flower" aria-labelledby="h-tasks">
            <div class="j-card-head">
              <h2 id="h-tasks">Tasks</h2>
              ${open.length ? `<span class="j-count">${doneCount} of ${open.length} done</span>` : ''}
            </div>
            ${tasks.length ? `<ul class="j-list">${taskRows}</ul>` : ''}
            <form class="j-add" data-form="add-task">
              <span class="j-add-icon">${ICONS.plus}</span>
              <input class="j-inline" name="text" data-focus="add-task" data-keep placeholder="Add a task" autocomplete="off" aria-label="New task">
            </form>
          </section>

          <section class="j-card tone-sun" aria-labelledby="h-sched">
            <div class="j-card-head"><h2 id="h-sched">Schedule</h2></div>
            ${schedule.length ? `<ul class="j-list">${schedRows}</ul>` : ''}
            <form class="j-add j-add-sched" data-form="add-sched">
              <input class="j-time" type="time" name="time" data-focus="add-sched-time" data-keep aria-label="Time">
              <input class="j-inline" name="text" data-focus="add-sched-text" data-keep placeholder="Add to schedule" autocomplete="off" aria-label="What">
              <button class="icon-btn j-add-btn" type="submit" aria-label="Add">${ICONS.plus}</button>
            </form>
          </section>
        </div>

        <div class="j-col">
          <section class="j-card tone-leaf" aria-labelledby="h-habits">
            <div class="j-card-head">
              <h2 id="h-habits">Habits</h2>
              <button class="btn btn-text" type="button" data-act="edit-habits">${habits.length ? 'Edit' : 'Add habits'}</button>
            </div>
            ${habits.length
              ? `<div class="j-habits">${habitChips}</div>`
              : '<p class="j-empty">Track a few small things you want to do daily, like a walk, water or reading.</p>'}
          </section>

          <section class="j-card j-notes-card" aria-labelledby="h-notes">
            <div class="j-card-head"><h2 id="h-notes">Notes</h2></div>
            <textarea class="j-notes" data-field="notes" data-focus="notes" placeholder="How was today? Thoughts, plans, little moments…" aria-labelledby="h-notes">${esc(d.notes)}</textarea>
          </section>
        </div>
      </div>
    </section>`;
}

/* ----- month view ----- */

function renderMonth() {
  const [y, m] = route.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const offset = (first.getDay() + 6) % 7;            // weeks start on Monday
  const start = ymd(new Date(y, m - 1, 1 - offset));
  const t = today();
  const habitCount = activeHabits().length;
  const names = [];
  for (let i = 0; i < 7; i++) names.push(parseDate(addDays(start, i)).toLocaleDateString(undefined, { weekday: 'short' }));

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    if (i === 35 && date.slice(0, 7) !== route.month) break;
    const inMonth = date.slice(0, 7) === route.month;
    const data = items.get(dayKey(date));
    const dd = normDay(data);
    const open = Object.values(dd.tasks).filter(x => !x.movedTo);
    const done = open.filter(x => x.done).length;
    const habitsDone = Object.values(dd.habits).filter(Boolean).length;
    const hasNotes = !!dd.notes.trim();
    const bits = [];
    if (hasNotes) bits.push('notes');
    if (open.length) bits.push(`${done} of ${open.length} tasks done`);
    if (habitsDone) bits.push(`${habitsDone} habits`);
    cells += `
      <a class="j-cell${inMonth ? '' : ' is-out'}${date === t ? ' is-today' : ''}${isEmptyDay(data) ? '' : ' has-entry'}"
         href="#/day/${date}" aria-label="${esc(fmtLong(date))}${bits.length ? ': ' + bits.join(', ') : ''}">
        <span class="j-cell-num">${parseDate(date).getDate()}</span>
        <span class="j-cell-marks">
          ${hasNotes ? '<span class="j-mark-note" title="Notes"></span>' : ''}
          ${open.length ? `<span class="j-mark-tasks${done === open.length ? ' is-all' : ''}">${done}/${open.length}</span>` : ''}
        </span>
        ${habitCount && habitsDone ? `<span class="j-mark-habits"><span style="width:${Math.min(100, Math.round(habitsDone / habitCount * 100))}%"></span></span>` : ''}
      </a>`;
  }

  const prev = ymd(new Date(y, m - 2, 1)).slice(0, 7);
  const next = ymd(new Date(y, m, 1)).slice(0, 7);
  return `
    <section class="j-month">
      <div class="j-dayhead">
        <a class="icon-btn" href="#/month/${prev}" aria-label="Previous month">${ICONS.prev}</a>
        <div class="j-daytitle"><h1>${esc(label)}</h1></div>
        <a class="icon-btn" href="#/month/${next}" aria-label="Next month">${ICONS.next}</a>
        <div class="j-dayhead-end">
          ${route.month === t.slice(0, 7) ? '' : `<a class="btn btn-ghost" href="#/month/${t.slice(0, 7)}">This month</a>`}
        </div>
      </div>
      <div class="j-card j-calendar">
        <div class="j-weekdays">${names.map(n => `<span>${esc(n)}</span>`).join('')}</div>
        <div class="j-cells">${cells}</div>
        <div class="j-legend">
          <span><span class="j-mark-note"></span>Notes</span>
          <span><span class="j-mark-tasks">2/3</span>Tasks done</span>
          ${habitCount ? '<span><span class="j-mark-habits"><span style="width:60%"></span></span>Habits</span>' : ''}
        </div>
      </div>
    </section>`;
}

/* ----- search ----- */

function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return null;
  const s = Math.max(0, i - 40);
  const e = Math.min(text.length, i + q.length + 60);
  return (s > 0 ? '…' : '') + esc(text.slice(s, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>'
    + esc(text.slice(i + q.length, e)) + (e < text.length ? '…' : '');
}

function renderSearch() {
  const q = searchQuery.trim().toLowerCase();
  let results = '';
  let count = 0;
  if (q) {
    const days = [...items.entries()].filter(([k]) => k.startsWith('day:')).sort((a, b) => b[0].localeCompare(a[0]));
    for (const [key, data] of days) {
      const d = normDay(data);
      const hits = [];
      const n = snippet(d.notes, q); if (n) hits.push(['Notes', n]);
      for (const t of sortedTasks(d)) { const h = snippet(t.text || '', q); if (h) hits.push(['Task', h]); }
      for (const s of sortedSchedule(d)) { const h = snippet(s.text || '', q); if (h) hits.push([s.time || 'Schedule', h]); }
      if (!hits.length) continue;
      count++;
      if (count > 100) break;
      const date = key.slice(4);
      results += `
        <a class="j-card j-result" href="#/day/${date}">
          <p class="j-result-date">${esc(weekday(date))}, ${esc(fmtLong(date))}</p>
          ${hits.slice(0, 4).map(([label, html]) => `<p class="j-result-hit"><span>${esc(label)}</span>${html}</p>`).join('')}
          ${hits.length > 4 ? `<p class="j-result-more">+${hits.length - 4} more</p>` : ''}
        </a>`;
    }
  }
  return `
    <section class="j-search">
      <label class="j-searchbox">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
        <input type="search" class="j-inline" data-field="search" data-focus="search" value="${esc(searchQuery)}"
               placeholder="Search notes, tasks and schedule" aria-label="Search the journal" autocomplete="off">
      </label>
      <p class="j-search-note">${q
        ? (count ? `${count > 100 ? '100+' : count} ${count === 1 ? 'day' : 'days'} found` : 'Nothing found.')
        : 'Search happens on this device, since your journal is encrypted.'}</p>
      <div class="j-results">${results}</div>
    </section>`;
}

/* ---------- actions ---------- */

function nextOrder(d) {
  return Math.max(0, ...Object.values(d.tasks).map(t => t.order ?? 0)) + 1;
}

async function moveTasks(list) {
  const t = today();
  const bySource = new Map();
  for (const task of list) {
    if (!bySource.has(task.date)) bySource.set(task.date, []);
    bySource.get(task.date).push(task);
  }
  // Add to today first, then mark the originals as moved.
  edit(d => {
    let order = nextOrder(d);
    for (const task of list) d.tasks[newId()] = { text: task.text, done: false, order: order++ };
  });
  saveNow();
  for (const [date, tasks] of bySource) {
    const src = normDay(items.get(dayKey(date)));
    for (const task of tasks) if (src.tasks[task.id]) src.tasks[task.id] = { ...src.tasks[task.id], movedTo: t };
    await store.put(dayKey(date), src);
  }
  toast(list.length === 1 ? 'Moved to today' : `Moved ${list.length} tasks to today`);
}

main.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'gate': {
      const st = S.getState();
      if (st.status === 'error') return S.retry();
      document.querySelector('#account-slot [data-act]')?.click();
      return;
    }
    case 'prev-day': return go('#/day/' + addDays(day.date, -1));
    case 'next-day': return go('#/day/' + addDays(day.date, 1));
    case 'go-today': return go('#/day/' + today());
    case 'pick-date': {
      const inp = b.querySelector('input') || b;
      try { inp.showPicker(); } catch (err) { inp.focus(); inp.click(); }
      return;
    }
    case 'del-task':
      edit(d => { delete d.tasks[id]; });
      saveNow();
      return render();
    case 'del-sched':
      edit(d => { delete d.schedule[id]; });
      saveNow();
      return render();
    case 'toggle-habit':
      edit(d => { if (d.habits[id]) delete d.habits[id]; else d.habits[id] = true; });
      saveNow();
      return render();
    case 'edit-habits': return openHabitsDialog();
    case 'toggle-leftovers': showLeftovers = !showLeftovers; return render();
    case 'move-all': return busy(b, 'Moving…', () => moveTasks(leftovers()));
    case 'move-one': {
      const task = leftovers().find(t => t.id === id && t.date === b.dataset.date);
      if (task) await moveTasks([task]);
      return;
    }
  }
});

main.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.act === 'toggle-task') {
    edit(d => { if (d.tasks[el.dataset.id]) d.tasks[el.dataset.id].done = el.checked; });
    saveNow();
    render();
  } else if (el.dataset.act === 'pick-date' && isDate(el.value)) {
    go('#/day/' + el.value);
  } else if (el.dataset.field === 'sched-time') {
    saveNow();
    render();   // re-sort by time
  }
});

main.addEventListener('input', e => {
  const el = e.target;
  const id = el.dataset.id;
  switch (el.dataset.field) {
    case 'task-text': edit(d => { if (d.tasks[id]) d.tasks[id].text = el.value; }, 800); break;
    case 'sched-text': edit(d => { if (d.schedule[id]) d.schedule[id].text = el.value; }, 800); break;
    case 'sched-time': edit(d => { if (d.schedule[id]) d.schedule[id].time = el.value; }, 800); break;
    case 'notes': autosize(el); edit(d => { d.notes = el.value; }, 1200); break;
    case 'search':
      searchQuery = el.value;
      clearTimeout(main._searchTimer);
      main._searchTimer = setTimeout(render, 150);
      break;
  }
});

// Leaving an emptied task removes it.
main.addEventListener('focusout', e => {
  const el = e.target;
  if (el.dataset.field === 'task-text' && !el.value.trim() && day.draft.tasks[el.dataset.id]) {
    edit(d => { delete d.tasks[el.dataset.id]; });
    saveNow();
    setTimeout(render, 0);
  } else if (['task-text', 'sched-text', 'notes'].includes(el.dataset.field)) {
    saveNow();
  }
});

main.addEventListener('keydown', e => {
  const el = e.target;
  if (el.dataset.field === 'task-text' && e.key === 'Enter') {
    e.preventDefault();
    main.querySelector('[data-focus="add-task"]')?.focus();
  }
});

main.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const text = form.text.value.trim();
  if (form.dataset.form === 'add-task') {
    if (!text) return;
    edit(d => { d.tasks[newId()] = { text, done: false, order: nextOrder(d) }; });
    form.reset();
    saveNow();
    render();
    main.querySelector('[data-focus="add-task"]')?.focus();
  } else if (form.dataset.form === 'add-sched') {
    const time = form.time.value;
    if (!text && !time) return;
    edit(d => { d.schedule[newId()] = { time, text }; });
    form.reset();
    saveNow();
    render();
    main.querySelector('[data-focus="add-sched-text"]')?.focus();
  }
});

/* ---------- habits editor ---------- */

function openHabitsDialog() {
  const current = activeHabits();
  return openDialog({
    label: 'Your habits',
    render(el, close) {
      let rows = current.map(h => ({ id: h.id, name: h.name }));
      const draw = () => {
        el.querySelector('[data-rows]').innerHTML = rows.map((r, i) => `
          <li class="j-habit-row">
            <input class="input" data-row="${i}" value="${esc(r.name)}" aria-label="Habit name" maxlength="40">
            <button class="icon-btn" type="button" data-remove="${i}" aria-label="Remove ${esc(r.name)}">${ICONS.x}</button>
          </li>`).join('') || '<li class="j-empty">No habits yet.</li>';
      };
      el.innerHTML = `
        <h2>Your habits</h2>
        <p>These show on every day so you can tick them off. Removing one keeps its past ticks.</p>
        <ul class="j-habit-rows" data-rows></ul>
        <form class="j-habit-new" data-new>
          <input class="input" name="name" placeholder="New habit, e.g. Walk 20 min" maxlength="40" autocomplete="off" autofocus>
          <button class="btn btn-ghost" type="submit">Add</button>
        </form>
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
          <button class="btn btn-primary" type="button" data-save>Save</button>
        </div>`;
      draw();
      el.querySelector('[data-rows]').addEventListener('input', e => {
        const i = e.target.dataset.row;
        if (i != null) rows[i].name = e.target.value;
      });
      el.querySelector('[data-rows]').addEventListener('click', e => {
        const b = e.target.closest('[data-remove]');
        if (b) { rows.splice(Number(b.dataset.remove), 1); draw(); }
      });
      el.querySelector('[data-new]').addEventListener('submit', e => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (!name) return;
        rows.push({ id: null, name });
        e.target.reset();
        draw();
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-save]').addEventListener('click', async e => {
        const pending = el.querySelector('[data-new] input').value.trim();
        if (pending) rows.push({ id: null, name: pending });
        const stored = clone(items.get('habits')) || {};
        const all = { ...(stored.items || {}) };
        const keep = new Set();
        rows.filter(r => r.name.trim()).forEach((r, i) => {
          const id = r.id || newId();
          keep.add(id);
          all[id] = { ...(all[id] || {}), name: r.name.trim(), order: i };
          delete all[id].archived;
        });
        for (const id of Object.keys(all)) if (!keep.has(id)) all[id] = { ...all[id], archived: true };
        try {
          await busy(e.currentTarget, 'Saving…', () => store.put('habits', { items: all }));
          close(true);
        } catch (err) {
          toast("Couldn't save habits. " + (err.message || ''));
        }
      });
    },
  });
}

/* ---------- start ---------- */

store.subscribe(list => {
  items = new Map(list.map(i => [i.key, i.data]));
  const first = !loaded;
  loaded = true;
  if (first) { onRoute(); return; }
  if (route.view === 'day') {
    const changed = syncDraft();
    const el = document.activeElement;
    const typing = el && main.contains(el) && el.matches('input:not([type=checkbox]), textarea');
    // Re-render for remote changes, but never mid-typing unless that day changed.
    if (changed || !typing) render();
  } else {
    render();
  }
});

S.onChange(st => {
  if (st.status !== 'unlocked') {
    loaded = false;
    items = new Map();
    day.date = null;
    render();
  }
});

addEventListener('hashchange', () => { if (loaded) onRoute(); });

// Midnight: keep "Today" honest if the page stays open.
let lastToday = today();
setInterval(() => {
  if (today() !== lastToday) { lastToday = today(); if (loaded) render(); }
}, 60000);

mountHeader({ autoUnlock: true });
render();
