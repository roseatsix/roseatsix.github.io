/* ==========================================================
   Journal: routing, data subscription and interactions.
   Views live in views.js, dialogs in dialogs.js, data helpers
   in model.js. All data is in the encrypted "journal" store.
   ========================================================== */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { toast } from '../../assets/js/ui/dom.js';
import * as M from './model.js';
import * as V from './views.js';
import * as D from './dialogs.js';
import { onHolidaysUpdate } from './holidays.js';

const main = document.getElementById('journal');
const tabs = document.querySelector('.j-tabs');
const store = openStore('journal');
D.useStore(store);

const ui = {
  loaded: false,
  route: { view: 'day', date: M.today() },
  focus: M.today(),              // the date the other tabs open at
  search: '',
  logCat: readPref('logCat'),
  spendCat: readPref('spendCat'),
};

function readPref(k) { try { return localStorage.getItem('ras-journal-' + k) || ''; } catch (e) { return ''; } }
function writePref(k, v) { try { localStorage.setItem('ras-journal-' + k, v); } catch (e) { /* ignore */ } }

/* ---------- routing ---------- */

function parseHash() {
  const [, view, arg] = (location.hash || '').split('/');
  switch (view) {
    case 'week': return { view, date: M.isDate(arg) ? arg : ui.focus };
    case 'month': return { view, month: M.isMonth(arg) ? arg : ui.focus.slice(0, 7) };
    case 'year': return { view, year: M.isYear(arg) ? arg : ui.focus.slice(0, 4) };
    case 'budget': return { view, month: M.isMonth(arg) ? arg : ui.focus.slice(0, 7) };
    case 'activity': return { view, year: M.isYear(arg) ? arg : ui.focus.slice(0, 4) };
    case 'search': return { view };
    default: return { view: 'day', date: M.isDate(arg) ? arg : M.today() };
  }
}

function onRoute() {
  ui.route = parseHash();
  const r = ui.route;
  if (r.date) ui.focus = r.date;
  else if (r.month && !ui.focus.startsWith(r.month)) ui.focus = r.month + '-01';
  else if (r.year && !ui.focus.startsWith(r.year)) ui.focus = r.year + '-01-01';
  updateTabs();
  render();
  window.scrollTo({ top: 0 });
}

function updateTabs() {
  const f = ui.focus;
  const hrefs = {
    day: '#/day/' + (ui.route.view === 'day' ? ui.route.date : M.today()),
    week: '#/week/' + f, month: '#/month/' + f.slice(0, 7), year: '#/year/' + f.slice(0, 4),
    budget: '#/budget/' + f.slice(0, 7), activity: '#/activity/' + f.slice(0, 4), search: '#/search',
  };
  tabs.querySelectorAll('[data-tab]').forEach(a => {
    a.href = hrefs[a.dataset.tab];
    a.setAttribute('aria-current', a.dataset.tab === ui.route.view ? 'page' : 'false');
  });
  const cur = tabs.querySelector('[aria-current=page]');
  if (cur && tabs.scrollWidth > tabs.clientWidth) {
    tabs.scrollLeft = cur.offsetLeft - tabs.clientWidth / 2 + cur.offsetWidth / 2;
  }
}

/* ---------- rendering ---------- */

function render() {
  if (!ui.loaded) { main.innerHTML = V.renderGate(S.getState()); return; }
  const f = captureFocus();
  const kept = {};
  main.querySelectorAll('[data-keep]').forEach(el => {
    if (el.value && el.value !== (el.dataset.auto || '')) kept[el.dataset.focus] = el.value;
  });
  const r = ui.route;
  main.innerHTML =
    r.view === 'week' ? V.renderWeek(r.date)
    : r.view === 'month' ? V.renderMonth(r.month)
    : r.view === 'year' ? V.renderYear(r.year)
    : r.view === 'budget' ? V.renderBudget(r.month)
    : r.view === 'activity' ? V.renderActivity(r.year)
    : r.view === 'search' ? V.renderSearch(ui.search)
    : V.renderDay(r.date, ui);
  for (const [k, v] of Object.entries(kept)) {
    const el = main.querySelector(`[data-keep][data-focus="${CSS.escape(k)}"]`);
    if (el) el.value = v;
  }
  main.querySelectorAll('.j-composer-text').forEach(grow);
  restoreFocus(f);
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
  try { if (f.start != null) el.setSelectionRange(f.start, f.end); } catch (e) { /* not text */ }
}

function grow(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 64) + 'px'; }

// Fields whose contents survive a re-render (data-keep, search) are safe;
// others (budget amounts) would lose what's being typed, so wait for them.
const isTyping = () => {
  const el = document.activeElement;
  return !!el && main.contains(el) && !el.hasAttribute('data-keep') && el.dataset.field !== 'search'
    && el.matches('input:not([type=checkbox]):not([type=date]), textarea, select');
};

/* ---------- actions ---------- */

async function saveHabit(date, id) {
  const day = M.clone(M.get('day:' + date)) || {};
  day.habits = { ...(day.habits || {}) };
  if (day.habits[id]) delete day.habits[id]; else day.habits[id] = true;
  await store.put('day:' + date, day);
}

async function saveBudget(month, patch) {
  const b = M.clone(M.get('budget:' + month)) || {};
  b.cats = { ...(b.cats || {}) };
  if ('total' in patch) { if (patch.total == null) delete b.total; else b.total = patch.total; }
  if (patch.cat) { if (patch.value == null) delete b.cats[patch.cat]; else b.cats[patch.cat] = patch.value; }
  await store.put('budget:' + month, b);
}

const fail = err => toast("Couldn't save. " + (err && err.message || ''));

main.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || (b.tagName === 'INPUT' && b.type === 'checkbox')) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'gate':
      if (S.getState().status === 'error') return S.retry();
      return document.querySelector('#account-slot [data-act]')?.click();
    case 'pick-date': {
      const inp = b.tagName === 'INPUT' ? b : b.querySelector('input');
      try { inp.showPicker(); } catch (err) { inp.focus(); }
      return;
    }
    case 'pick-cat':
      ui.logCat = id; writePref('logCat', id);
      render();
      main.querySelector('[data-focus=log-text]')?.focus();
      return;
    case 'open-task': return D.openTaskDialog(id);
    case 'edit-log': return D.openLogDialog(id);
    case 'edit-event': e.preventDefault(); return D.openEventDialog(id);
    case 'new-event': {
      const r = ui.route;
      const date = r.month ? (ui.focus.startsWith(r.month) ? ui.focus : r.month + '-01') : ui.focus;
      return D.openEventDialog(null, { date });
    }
    case 'toggle-habit': return saveHabit(ui.route.date, id).catch(fail);
    case 'edit-habits': return D.openHabitsDialog();
    case 'log-spending': {
      const spend = M.activeList(M.config().logCats).find(c => c.spend);
      if (spend) { ui.logCat = spend.id; writePref('logCat', spend.id); }
      return;   // the link itself goes to today
    }
    case 'copy-budget': {
      const prev = M.get('budget:' + M.addMonths(ui.route.month, -1));
      if (prev) await store.put('budget:' + ui.route.month, M.clone(prev)).catch(fail);
      return;
    }
  }
});

document.querySelector('[data-act=settings]')?.addEventListener('click', () => {
  if (ui.loaded) D.openSettingsDialog();
  else toast('Unlock your journal first');
});

main.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.act === 'toggle-task') {
    D.toggleTask(el.dataset.id, el.checked).catch(() => {});
  } else if (el.dataset.act === 'pick-date' && M.isDate(el.value)) {
    location.hash = '#/day/' + el.value;
  } else if (el.name === 'spendCat' && el.closest('[data-form=log]')) {
    ui.spendCat = el.value; writePref('spendCat', el.value);
  } else if (el.matches('[data-budget-total]')) {
    saveBudget(ui.route.month, { total: M.parseAmount(el.value) }).catch(fail);
  } else if (el.matches('[data-budget-cat]')) {
    saveBudget(ui.route.month, { cat: el.dataset.budgetCat, value: M.parseAmount(el.value) }).catch(fail);
  }
});

main.addEventListener('input', e => {
  const el = e.target;
  if (el.classList.contains('j-composer-text')) grow(el);
  if (el.dataset.field === 'search') {
    ui.search = el.value;
    clearTimeout(ui.searchTimer);
    ui.searchTimer = setTimeout(render, 150);
  }
});

main.addEventListener('keydown', e => {
  const el = e.target;
  // Ctrl/Cmd+Enter logs the entry; plain Enter starts a new line.
  if (el.classList.contains('j-composer-text') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    el.form.requestSubmit();
  }
  if (el.matches('.j-money-input') && e.key === 'Enter') el.blur();
});

main.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'add-task') {
    const title = form.title.value.trim();
    if (!title) return;
    form.reset();
    await D.addTask(title, form.dataset.due).catch(() => {});
    main.querySelector(`[data-focus="add-task:${form.dataset.due || 'none'}"]`)?.focus();
    return;
  }
  if (form.dataset.form === 'log') {
    const date = ui.route.date;
    const cats = M.activeList(M.config().logCats);
    const cat = cats.some(c => c.id === ui.logCat) ? ui.logCat : cats[0].id;
    const spend = M.isSpendCat(cat);
    const text = form.text.value.trim();
    const amount = spend ? M.parseAmount(form.amount.value) : null;
    let time = form.time.value;
    if (date === M.today() && (!time || time === form.time.dataset.auto)) time = M.nowTime();
    if (spend && amount == null) { toast('Enter an amount'); form.amount.focus(); return; }
    if (!spend && !text) { form.text.focus(); return; }
    if (!time) { toast('Pick a time'); form.time.focus(); return; }
    const entry = { date, time, cat, text, amount, spendCat: spend ? (form.spendCat.value || 'other') : null, createdAt: Date.now() };
    form.text.value = '';
    if (form.amount) form.amount.value = '';
    form.time.value = form.time.dataset.auto || '';
    try {
      await store.put('log:' + M.newId(), entry);
    } catch (err) {
      fail(err);
      form.text.value = text;
    }
    main.querySelector('[data-focus=log-text]')?.focus();
  }
});

/* ---------- start ---------- */

store.subscribe(list => {
  M.setItems(list);
  const first = !ui.loaded;
  ui.loaded = true;
  if (first) { onRoute(); return; }
  if (!isTyping()) render(); else ui.stale = true;
});

// Catch up on skipped updates once typing stops (after any click lands).
main.addEventListener('focusout', () => {
  if (!ui.stale) return;
  setTimeout(() => { if (ui.loaded && !isTyping()) { ui.stale = false; render(); } }, 350);
});

S.onChange(st => {
  if (st.status !== 'unlocked') {
    ui.loaded = false;
    M.setItems([]);
    render();
  }
});

onHolidaysUpdate(() => { if (!ui.loaded) return; if (!isTyping()) render(); else ui.stale = true; });

addEventListener('hashchange', () => { if (ui.loaded) onRoute(); else updateTabs(); });

// Keep "today" honest across midnight.
let lastToday = M.today();
setInterval(() => {
  if (M.today() !== lastToday) { lastToday = M.today(); if (ui.loaded && !isTyping()) render(); }
}, 60000);

mountHeader({ autoUnlock: true });
updateTabs();
render();
