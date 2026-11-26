/* ==========================================================
   Journal views. Each returns an HTML string; journal.js handles
   events through data-act / data-form attributes.
   ========================================================== */

import { esc } from '../../assets/js/ui/dom.js';
import * as M from './model.js';
import { holidaysOn, holidaysFor } from './holidays.js';
import { renderFieldInputs, renderFieldSummary, fieldsText } from './fields.js';
import * as IM from '../inventory/model.js';

export const ICONS = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 14.5h4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h3.5L18.5 9a2.1 2.1 0 0 0-3-3L5.5 16z"/></svg>',
};

const colorVar = name => `--c:${M.swatch(name)}`;

/* ---------- shared bits ---------- */

function headNav({ prev, next, eyebrow = '', title, extra = '' }) {
  return `
    <div class="j-head">
      <a class="icon-btn" href="${prev}" aria-label="Previous">${ICONS.prev}</a>
      <div class="j-head-title">
        ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
        <h1>${title}</h1>
      </div>
      <a class="icon-btn" href="${next}" aria-label="Next">${ICONS.next}</a>
    </div>
    ${extra ? `<div class="j-head-extra">${extra}</div>` : ''}`;
}

function dayMarkers(date) {
  const hol = holidaysOn(date).map(h => `<span class="j-pill is-holiday" title="${esc(h.en || h.name)}">${esc(h.name)}</span>`);
  const ev = M.eventsOn(date).map(e => {
    const c = M.eventCat(e.cat);
    return `<button type="button" class="j-pill${c.dayoff ? ' is-holiday' : ''}" style="${colorVar(c.color)}" data-act="edit-event" data-id="${e.id}">${esc(e.title)}</button>`;
  });
  return hol.concat(ev).join('');
}

export function taskRow(t, { showDue = false, compact = false } = {}) {
  const subs = Object.values(t.subtasks || {});
  const subDone = subs.filter(s => s.done).length;
  const overdue = !t.done && M.isDate(t.due) && t.due < M.today();
  const meta = [];
  if (showDue && M.isDate(t.due)) meta.push(`<span class="${overdue ? 'is-overdue' : ''}">${overdue ? 'Overdue · ' : ''}${esc(M.fmt.short(t.due))}</span>`);
  else if (overdue) meta.push('<span class="is-overdue">Overdue</span>');
  if (t.time) meta.push(`<span>${ICONS.clock}${esc(t.time)}</span>`);
  if (subs.length) meta.push(`<span>${subDone}/${subs.length}</span>`);
  if ((t.notes || '').trim()) meta.push(`<span title="Has notes">${ICONS.note}</span>`);
  return `
    <li class="j-task${t.done ? ' is-done' : ''}${compact ? ' is-compact' : ''}">
      <label class="j-check">
        <input type="checkbox" data-act="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done: ${esc(t.title)}">
        <span class="j-box">${ICONS.check}</span>
      </label>
      <button type="button" class="j-task-main" data-act="open-task" data-id="${t.id}">
        <span class="j-task-title">${esc(t.title || 'Untitled')}</span>
        ${meta.length ? `<span class="j-task-meta">${meta.join('')}</span>` : ''}
      </button>
    </li>`;
}

function addTaskForm(due, label = 'Add a task') {
  return `
    <form class="j-add" data-form="add-task" data-due="${due || ''}">
      <span class="j-add-icon">${ICONS.plus}</span>
      <input class="j-inline" name="title" data-focus="add-task:${due || 'none'}" data-keep placeholder="${esc(label)}" autocomplete="off" aria-label="${esc(label)}">
    </form>`;
}

function logEntry(e) {
  const c = M.logCat(e.cat);
  const spend = c.spend && typeof e.amount === 'number';
  return `
    <li class="j-entry" style="${colorVar(c.color)}">
      <button type="button" class="j-entry-btn" data-act="edit-log" data-id="${e.id}">
        <time>${esc(e.time || '')}</time>
        <span class="j-entry-dot" aria-hidden="true"></span>
        <span class="j-entry-body">
          <span class="j-entry-cat">${esc(c.name)}${spend ? ` · ${esc(M.spendCat(e.spendCat).name)}` : ''}</span>
          ${renderFieldSummary(c, e.fields)}
          ${e.text ? `<span class="j-entry-text">${esc(e.text)}</span>` : ''}
          ${spend ? `<span class="j-entry-amount">${esc(M.money(e.amount))}</span>` : ''}
        </span>
      </button>
    </li>`;
}

/* ---------- gate ---------- */

export function renderGate(st) {
  const copy = {
    signedOut: ['Your journal is private', 'Sign in with Google to start. Everything is encrypted on your device before it syncs.', 'Sign in'],
    unconfigured: ["Sync isn't set up", 'The journal needs sign-in to be connected first.', null],
    needsSetup: ['Set up your vault', 'Choose a passphrase to encrypt your journal.', 'Set up vault'],
    locked: ['Unlock your journal', 'Enter your passphrase to open your journal on this device.', 'Unlock'],
    denied: ["Can't open your data", 'The database refused access for this account.', null],
    error: ['Something went wrong', st.error || '', 'Try again'],
  }[st.status];
  if (!copy) return `<div class="j-gate"><span class="spinner" aria-hidden="true"></span><p>Opening your journal…</p></div>`;
  const [title, text, action] = copy;
  return `
    <div class="j-gate">
      <svg class="j-gate-blossom" aria-hidden="true"><use href="#blossom"/></svg>
      <h1>${esc(title)}</h1>
      <p>${esc(text)}</p>
      ${action ? `<button class="btn btn-primary" type="button" data-act="gate">${esc(action)}</button>` : ''}
    </div>`;
}

/* ---------- Today / day ---------- */

export function renderDay(date, ui) {
  const isToday = date === M.today();
  const rel = M.fmt.relative(date);
  const cfg = M.config();
  const cats = M.activeList(cfg.logCats);
  const sel = M.logCat(cats.some(c => c.id === ui.logCat) ? ui.logCat : cats[0]?.id);
  const logs = M.logsOn(date);
  const due = M.tasksDue(date);
  const overdue = isToday ? M.overdueTasks(date) : [];
  const habits = M.activeHabits();
  const ticks = M.habitsOn(date);
  const spent = logs.filter(e => M.isSpendCat(e.cat) && typeof e.amount === 'number');
  const markers = dayMarkers(date);
  const autoTime = isToday ? M.nowTime() : '';

  const chips = cats.map(c => `
    <button type="button" class="j-cat" role="radio" aria-checked="${c.id === sel.id}" data-act="pick-cat" data-id="${c.id}" style="${colorVar(c.color)}">
      ${esc(c.name)}
    </button>`).join('');

  const spendCats = M.activeList(cfg.spendCats);
  const composer = `
    <form class="j-composer" data-form="log" style="${colorVar(sel.color)}">
      <div class="j-cats" role="radiogroup" aria-label="Category">${chips}</div>
      ${renderFieldInputs(sel, ui.fieldVals)}
      <textarea class="j-composer-text" name="text" rows="2" data-focus="log-text" data-keep
                placeholder="${esc(sel.prompt || 'Write a quick note…')}" aria-label="${esc(sel.name)} entry"></textarea>
      ${sel.spend ? `
        <div class="j-composer-row j-spend-row">
          <input class="input j-amount" name="amount" inputmode="decimal" data-focus="log-amount" data-keep placeholder="Amount (${esc(cfg.currency)})" aria-label="Amount" autocomplete="off">
          <select class="input" name="spendCat" aria-label="Spending category">
            ${spendCats.map(s => `<option value="${s.id}" ${s.id === ui.spendCat ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
        </div>` : ''}
      <div class="j-composer-foot">
        <label class="j-time-field" title="${isToday ? 'Time is now unless you change it' : 'Pick a time for this entry'}">
          <input class="j-time" type="time" name="time" data-focus="log-time" data-keep data-auto="${autoTime}" value="${autoTime}" aria-label="Time" ${isToday ? '' : 'required'}>
        </label>
        <button class="btn btn-primary" type="submit">Log it</button>
      </div>
    </form>`;

  const timeline = logs.length
    ? `<ol class="j-timeline">${logs.map(logEntry).join('')}</ol>`
    : `<p class="j-empty">${isToday ? 'Nothing logged yet today. Jot down what you\'re doing as you go.' : 'Nothing logged on this day.'}</p>`;

  const habitChips = habits.map(h => `
    <button type="button" class="j-habit" data-act="toggle-habit" data-id="${h.id}" aria-pressed="${!!ticks[h.id]}">
      <span class="j-habit-check">${ICONS.check}</span>
      <span>${esc(h.name)}</span>
      ${streak(h.id, date) >= 2 ? `<span class="j-streak">${streak(h.id, date)}d</span>` : ''}
    </button>`).join('');

  return `
    <section class="j-view j-day">
      ${headNav({
        prev: '#/day/' + M.addDays(date, -1), next: '#/day/' + M.addDays(date, 1),
        eyebrow: esc(M.fmt.weekday(date)) + (rel ? ' · ' + rel : ''),
        title: esc(M.fmt.long(date)),
        extra: `${isToday ? '' : `<a class="btn btn-ghost btn-sm" href="#/day/${M.today()}">Today</a>`}
                <label class="icon-btn j-datepick" aria-label="Pick a date">${ICONS.cal}<input type="date" data-act="pick-date" value="${date}" tabindex="-1"></label>`,
      })}
      ${markers ? `<div class="j-markers">${markers}</div>` : ''}

      <div class="j-grid">
        <div class="j-col">
          <section class="j-card j-log-card" aria-labelledby="h-log">
            <div class="j-card-head"><h2 id="h-log">Log</h2>${logs.length ? `<span class="j-count">${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}</span>` : ''}</div>
            ${composer}
            ${timeline}
          </section>
        </div>
        <div class="j-col">
          <section class="j-card tone-flower" aria-labelledby="h-tasks">
            <div class="j-card-head"><h2 id="h-tasks">Tasks</h2>
              ${due.length ? `<span class="j-count">${due.filter(t => t.done).length} of ${due.length} done</span>` : ''}</div>
            ${overdue.length ? `<p class="j-sub">Overdue</p><ul class="j-list">${overdue.map(t => taskRow(t, { showDue: true })).join('')}</ul><p class="j-sub">Due ${isToday ? 'today' : 'this day'}</p>` : ''}
            ${due.length ? `<ul class="j-list">${due.map(t => taskRow(t)).join('')}</ul>` : ''}
            ${addTaskForm(date, isToday ? 'Add a task for today' : 'Add a task for this day')}
          </section>

          ${replaceCard(date, isToday)}

          <section class="j-card tone-leaf" aria-labelledby="h-habits">
            <div class="j-card-head"><h2 id="h-habits">Habits</h2>
              <button class="btn btn-text" type="button" data-act="edit-habits">${habits.length ? 'Edit' : 'Add habits'}</button></div>
            ${habits.length ? `<div class="j-habits">${habitChips}</div>` : '<p class="j-empty">Track a few small daily things, like a walk, water or reading.</p>'}
          </section>

          ${spent.length ? `
          <section class="j-card tone-sun" aria-labelledby="h-spent">
            <div class="j-card-head"><h2 id="h-spent">Spent</h2><a class="btn btn-text" href="#/budget/${date.slice(0, 7)}">Budget</a></div>
            <p class="j-big">${esc(M.money(M.sum(spent)))}</p>
            <p class="j-empty">${spent.length} ${spent.length === 1 ? 'purchase' : 'purchases'} on this day</p>
          </section>` : ''}
        </div>
      </div>
    </section>`;
}

/* Home inventory: things due for replacement */
function replaceCard(date, isToday) {
  const list = isToday ? IM.replacementsDue(date) : IM.replacementsOn(date);
  if (!list.length) return '';
  return `
    <section class="j-card tone-sun" aria-labelledby="h-replace">
      <div class="j-card-head"><h2 id="h-replace">To replace</h2><a class="btn btn-text" href="../inventory/#/replace">Inventory</a></div>
      <ul class="j-list">${list.map(({ item, r }) => `
        <li class="j-task j-rep">
          <span class="j-task-main"><span class="j-task-title">${esc(item.name)}</span>
            <span class="j-task-meta"><span class="${r.state === 'overdue' ? 'is-overdue' : ''}">${esc(IM.dueText(r))}</span></span></span>
          <button class="btn btn-ghost btn-sm" type="button" data-act="inv-replaced" data-id="${item.id}">Replaced</button>
        </li>`).join('')}</ul>
    </section>`;
}

function streak(habitId, upTo) {
  let date = upTo;
  if (!M.habitsOn(date)[habitId]) date = M.addDays(date, -1);
  let n = 0;
  while (n < 3650 && M.habitsOn(date)[habitId]) { n++; date = M.addDays(date, -1); }
  return n;
}

/* ---------- Week ---------- */

export function renderWeek(date) {
  const start = M.weekStart(date);
  const end = M.addDays(start, 6);
  const t = M.today();
  const containsToday = t >= start && t <= end;
  let title;
  try {
    title = esc(new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).formatRange(M.parseDate(start), M.parseDate(end)));
  } catch (e) {
    title = `${esc(M.fmt.short(start))} – ${esc(M.fmt.short(end))}`;
  }
  let allDue = 0, allDone = 0, entries = 0, spent = 0;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = M.addDays(start, i);
    const tasks = M.tasksDue(d);
    const logs = M.logsOn(d);
    allDue += tasks.length; allDone += tasks.filter(x => x.done).length;
    entries += logs.length;
    const daySpent = M.sum(logs.filter(e => M.isSpendCat(e.cat) && typeof e.amount === 'number'));
    spent += daySpent;
    const markers = dayMarkers(d) + IM.replacementsOn(d).map(({ item }) => `<a class="j-pill is-replace" href="../inventory/#/replace" title="Replace ${esc(item.name)}">↻ ${esc(item.name)}</a>`).join('');
    days.push(`
      <section class="j-card j-weekday${d === t ? ' is-today' : ''}${d < t ? ' is-past' : ''}">
        <a class="j-weekday-head" href="#/day/${d}">
          <span class="j-weekday-name">${esc(M.fmt.wd(d))}</span>
          <span class="j-weekday-num">${M.parseDate(d).getDate()}</span>
          ${d === t ? '<span class="j-today-tag">Today</span>' : ''}
        </a>
        ${markers ? `<div class="j-markers is-small">${markers}</div>` : ''}
        ${tasks.length ? `<ul class="j-list">${tasks.map(x => taskRow(x, { compact: true })).join('')}</ul>` : ''}
        ${addTaskForm(d, 'Add task')}
        ${logs.length || daySpent ? `<p class="j-weekday-foot">${logs.length ? `${logs.length} log ${logs.length === 1 ? 'entry' : 'entries'}` : ''}${daySpent ? ` · ${esc(M.money(daySpent))}` : ''}</p>` : ''}
      </section>`);
  }
  const overdue = containsToday ? M.overdueTasks(t) : [];
  const someday = M.idx().undated.filter(x => !x.done);

  return `
    <section class="j-view j-week">
      ${headNav({
        prev: '#/week/' + M.addDays(start, -7), next: '#/week/' + M.addDays(start, 7),
        eyebrow: 'Week',
        title,
        extra: containsToday ? '' : `<a class="btn btn-ghost btn-sm" href="#/week/${t}">This week</a>`,
      })}
      <div class="j-stats">
        <div class="j-stat"><span>${allDone}/${allDue}</span>tasks done</div>
        <div class="j-stat"><span>${entries}</span>log entries</div>
        <div class="j-stat"><span class="j-full">${esc(M.money(spent))}</span><span class="j-compact">${esc(M.money(spent, { notation: 'compact', maximumFractionDigits: 1 }))}</span>spent</div>
      </div>
      ${overdue.length ? `
        <section class="j-card j-overdue tone-flower">
          <div class="j-card-head"><h2>Overdue</h2><span class="j-count">${overdue.length}</span></div>
          <ul class="j-list">${overdue.map(x => taskRow(x, { showDue: true })).join('')}</ul>
        </section>` : ''}
      <div class="j-weekgrid">${days.join('')}</div>
      <section class="j-card j-someday tone-leaf">
        <div class="j-card-head"><h2>Someday</h2><span class="j-count">Tasks without a date</span></div>
        ${someday.length ? `<ul class="j-list">${someday.map(x => taskRow(x)).join('')}</ul>` : ''}
        ${addTaskForm('', 'Add a task without a date')}
      </section>
    </section>`;
}

/* ---------- Month ---------- */

export function renderMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = M.ymd(new Date(y, m - 1, 1 - offset));
  const t = M.today();
  const habitCount = M.activeHabits().length;
  holidaysFor(y);

  const names = [];
  for (let i = 0; i < 7; i++) names.push(`<span>${esc(M.fmt.wd(M.addDays(start, i)))}</span>`);

  const usedCats = new Set();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const date = M.addDays(start, i);
    if (i === 35 && date.slice(0, 7) !== month) break;
    const inMonth = date.slice(0, 7) === month;
    const hol = holidaysOn(date);
    const evs = M.eventsOn(date);
    const tasks = M.tasksDue(date);
    const logs = M.logsOn(date);
    const ticks = Object.values(M.habitsOn(date)).filter(Boolean).length;
    const isOff = hol.length || evs.some(e => M.eventCat(e.cat).dayoff);
    evs.forEach(e => usedCats.add(e.cat));
    const pills = [
      ...hol.map(h => `<span class="j-pill is-holiday" title="${esc(h.name)}">${esc(h.name)}</span>`),
      ...evs.map(e => { const c = M.eventCat(e.cat); return `<span class="j-pill${c.dayoff ? ' is-holiday' : ''}" style="${colorVar(c.color)}" title="${esc(e.title)}">${esc(e.title)}</span>`; }),
    ];
    const label = [M.fmt.long(date), ...hol.map(h => h.name), ...evs.map(e => e.title),
      tasks.length ? `${tasks.length} tasks due` : '', logs.length ? `${logs.length} log entries` : ''].filter(Boolean).join(', ');
    cells += `
      <a class="j-cell${inMonth ? '' : ' is-out'}${date === t ? ' is-today' : ''}${isOff ? ' is-off' : ''}" href="#/day/${date}" aria-label="${esc(label)}">
        <span class="j-cell-num">${M.parseDate(date).getDate()}</span>
        <span class="j-cell-pills">${pills.slice(0, 2).join('')}${pills.length > 2 ? `<span class="j-more">+${pills.length - 2}</span>` : ''}</span>
        <span class="j-cell-dots">${pills.map((p, k) => k < 4 ? `<i style="${hol.length > k ? colorVar('holiday') : colorVar(M.eventCat(evs[k - hol.length]?.cat).color)}"></i>` : '').join('')}</span>
        <span class="j-cell-marks">
          ${tasks.length ? `<span class="j-mark-tasks${tasks.every(x => x.done) ? ' is-all' : ''}" title="${tasks.filter(x => x.done).length} of ${tasks.length} tasks done">${ICONS.check}${tasks.filter(x => x.done).length}/${tasks.length}</span>` : ''}
          ${logs.length ? `<span class="j-mark-log" title="${logs.length} log ${logs.length === 1 ? 'entry' : 'entries'}">${ICONS.pen}${logs.length}</span>` : ''}
        </span>
        ${habitCount && ticks ? `<span class="j-mark-habits"><span style="width:${Math.min(100, Math.round(ticks / habitCount * 100))}%"></span></span>` : ''}
      </a>`;
  }

  const legend = [
    `<span><i style="${colorVar('holiday')}"></i>Holiday / day off</span>`,
    ...[...usedCats].map(id => M.eventCat(id)).filter(c => !c.dayoff).map(c => `<span><i style="${colorVar(c.color)}"></i>${esc(c.name)}</span>`),
    `<span><b class="j-mark-tasks">${ICONS.check}</b>Tasks done / due</span>`,
    `<span><b class="j-mark-log">${ICONS.pen}</b>Log entries</span>`,
  ].join('');

  return `
    <section class="j-view j-month">
      ${headNav({
        prev: '#/month/' + M.addMonths(month, -1), next: '#/month/' + M.addMonths(month, 1),
        title: esc(M.fmt.month(month)),
        extra: `${month === t.slice(0, 7) ? '' : `<a class="btn btn-ghost btn-sm" href="#/month/${t.slice(0, 7)}">This month</a>`}
                <button class="btn btn-ghost btn-sm" type="button" data-act="new-event">${ICONS.plus}Event</button>`,
      })}
      <div class="j-card j-calendar">
        <div class="j-weekdays">${names.join('')}</div>
        <div class="j-cells">${cells}</div>
        <div class="j-legend">${legend}</div>
      </div>
      ${monthEventList(month)}
    </section>`;
}

function monthEventList(month) {
  const rows = [];
  const days = M.daysInMonth(month);
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${M.pad(d)}`;
    for (const h of holidaysOn(date)) rows.push(`<li style="${colorVar('holiday')}"><span class="j-ev-date">${esc(M.fmt.short(date))}</span><span class="j-ev-dot"></span><span>${esc(h.name)}</span><span class="j-ev-cat">Public holiday</span></li>`);
    for (const e of M.eventsOn(date)) {
      if (e.date !== date && !(e.yearly && e.date.slice(5) === date.slice(5)) && d !== 1) continue;  // list ranges once
      const c = M.eventCat(e.cat);
      rows.push(`<li style="${colorVar(c.color)}"><span class="j-ev-date">${esc(M.fmt.short(date))}</span><span class="j-ev-dot"></span>
        <button type="button" class="j-ev-title" data-act="edit-event" data-id="${e.id}">${esc(e.title)}</button><span class="j-ev-cat">${esc(c.name)}${e.yearly ? ' · yearly' : ''}</span></li>`);
    }
  }
  if (!rows.length) return '';
  return `<section class="j-card j-events"><div class="j-card-head"><h2>Holidays & events</h2></div><ul>${rows.join('')}</ul></section>`;
}

/* ---------- Year ---------- */

export function renderYear(year) {
  const y = Number(year);
  const t = M.today();
  holidaysFor(y);
  const usedCats = new Set();
  let anyTasks = false;
  const months = [];
  for (let mo = 1; mo <= 12; mo++) {
    const month = `${year}-${M.pad(mo)}`;
    const offset = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
    let cells = '<span></span>'.repeat(offset);
    for (let d = 1; d <= M.daysInMonth(month); d++) {
      const date = `${month}-${M.pad(d)}`;
      const hol = holidaysOn(date);
      const evs = M.eventsOn(date);
      const due = M.tasksDue(date).filter(x => !x.done).length;
      if (due) anyTasks = true;
      let color = null, off = false;
      if (hol.length || evs.some(e => M.eventCat(e.cat).dayoff)) { color = 'holiday'; off = true; }
      else if (evs.length) { color = M.eventCat(evs[0].cat).color; usedCats.add(evs[0].cat); }
      const names = [...hol.map(h => h.name), ...evs.map(e => e.title), due ? `${due} task${due === 1 ? '' : 's'} due` : ''].filter(Boolean);
      cells += `<a href="#/day/${date}" class="j-ycell${color ? ' has-color' : ''}${off ? ' is-off' : ''}${date === t ? ' is-today' : ''}${due ? ' has-due' : ''}"
        ${color ? `style="${colorVar(color)}"` : ''} title="${esc([M.fmt.long(date), ...names].join(' · '))}">${d}</a>`;
    }
    months.push(`
      <section class="j-card j-mini">
        <a class="j-mini-title" href="#/month/${month}">${esc(M.fmt.monthName(month))}</a>
        <div class="j-mini-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(l => `<b>${l}</b>`).join('')}${cells}</div>
      </section>`);
  }
  const legend = [
    `<span><i style="${colorVar('holiday')}"></i>Holiday / day off</span>`,
    ...[...usedCats].map(id => M.eventCat(id)).filter(c => !c.dayoff).map(c => `<span><i style="${colorVar(c.color)}"></i>${esc(c.name)}</span>`),
    `<span><i class="j-due-mark"></i>Tasks due</span>`,
  ].join('');

  return `
    <section class="j-view j-year">
      ${headNav({
        prev: '#/year/' + (y - 1), next: '#/year/' + (y + 1), title: String(y),
        extra: `${String(y) === t.slice(0, 4) ? '' : `<a class="btn btn-ghost btn-sm" href="#/year/${t.slice(0, 4)}">This year</a>`}
                <button class="btn btn-ghost btn-sm" type="button" data-act="new-event">${ICONS.plus}Event</button>`,
      })}
      <div class="j-legend j-year-legend">${legend}</div>
      <div class="j-yeargrid">${months.join('')}</div>
    </section>`;
}

/* ---------- Budget ---------- */

export function renderBudget(month) {
  const cfg = M.config();
  const b = M.get('budget:' + month) || {};
  const prevB = M.get('budget:' + M.addMonths(month, -1));
  const spending = M.spendingIn(month);
  const spent = M.sum(spending);
  const total = typeof b.total === 'number' ? b.total : null;
  const left = total != null ? total - spent : null;
  const pct = total ? Math.min(100, Math.round(spent / total * 100)) : 0;
  const cats = M.activeList(cfg.spendCats);
  const byCat = new Map();
  for (const e of spending) byCat.set(e.spendCat || 'other', (byCat.get(e.spendCat || 'other') || 0) + e.amount);
  // categories that have spending but were archived still show
  for (const id of byCat.keys()) if (!cats.some(c => c.id === id)) cats.push(M.spendCat(id));

  // How far through the month are we? (for "on track")
  const t = M.today();
  const dim = M.daysInMonth(month);
  const dayNum = t.slice(0, 7) === month ? Number(t.slice(8)) : (t > month ? dim : 0);

  const rows = cats.map(c => {
    const s = byCat.get(c.id) || 0;
    const cb = b.cats && typeof b.cats[c.id] === 'number' ? b.cats[c.id] : null;
    const over = cb != null && s > cb;
    const w = cb ? Math.min(100, Math.round(s / cb * 100)) : 0;
    return `
      <li class="j-brow${over ? ' is-over' : ''}">
        <span class="j-brow-name">${esc(c.name)}</span>
        <input class="input j-money-input" inputmode="decimal" data-budget-cat="${c.id}" data-focus="bcat:${c.id}" value="${cb != null ? esc(M.plainNumber(cb)) : ''}" placeholder="No limit" aria-label="Budget for ${esc(c.name)}">
        <span class="j-brow-spent">${esc(M.money(s))}</span>
        <span class="j-brow-left">${cb != null ? (over ? `${esc(M.money(s - cb))} over` : `${esc(M.money(cb - s))} left`) : ''}</span>
        <span class="j-bar"><span style="width:${cb ? w : 0}%"></span></span>
      </li>`;
  }).join('');

  const list = spending.slice(0, 200).map(e => `
    <li>
      <button type="button" class="j-spend-item" data-act="edit-log" data-id="${e.id}">
        <span class="j-spend-date">${esc(M.fmt.short(e.date))}</span>
        <span class="j-spend-text">${esc(e.text || M.spendCat(e.spendCat).name)}<small>${esc(M.spendCat(e.spendCat).name)}</small></span>
        <span class="j-spend-amt">${esc(M.money(e.amount))}</span>
      </button>
    </li>`).join('');

  return `
    <section class="j-view j-budget">
      ${headNav({
        prev: '#/budget/' + M.addMonths(month, -1), next: '#/budget/' + M.addMonths(month, 1),
        eyebrow: 'Budget', title: esc(M.fmt.month(month)),
        extra: `<a class="btn btn-primary btn-sm" href="#/day/${M.today()}" data-act="log-spending">${ICONS.plus}Log spending</a>`,
      })}

      <section class="j-card j-bsum${left != null && left < 0 ? ' is-over' : ''}">
        <div class="j-bsum-grid">
          <label class="j-bsum-total">
            <span>Monthly budget (${esc(cfg.currency)})</span>
            <input class="input j-money-input" inputmode="decimal" data-budget-total data-focus="btotal" value="${total != null ? esc(M.plainNumber(total)) : ''}" placeholder="Set a budget">
          </label>
          <div><span>Spent</span><strong>${esc(M.money(spent))}</strong></div>
          <div><span>${left != null && left < 0 ? 'Over by' : 'Left'}</span><strong>${left != null ? esc(M.money(Math.abs(left))) : '–'}</strong></div>
        </div>
        ${total ? `
          <div class="j-bar is-big"><span style="width:${pct}%"></span>${dayNum && dayNum < dim ? `<i style="left:${Math.round(dayNum / dim * 100)}%" title="Today"></i>` : ''}</div>
          <p class="j-hint">${pct}% used${dayNum && dayNum < dim ? ` · ${Math.round(dayNum / dim * 100)}% of the month gone` : ''}${left > 0 && dayNum && dayNum < dim ? ` · about ${esc(M.money(left / (dim - dayNum + 1)))} a day left to spend` : ''}</p>` : ''}
        ${total == null && prevB && typeof prevB.total === 'number' ? `<button class="btn btn-ghost btn-sm" type="button" data-act="copy-budget">Use last month's budget</button>` : ''}
      </section>

      <section class="j-card">
        <div class="j-card-head"><h2>By category</h2><span class="j-count">Leave blank for no limit</span></div>
        <ul class="j-brows">${rows}</ul>
      </section>

      <section class="j-card">
        <div class="j-card-head"><h2>Spending</h2><span class="j-count">${spending.length} ${spending.length === 1 ? 'entry' : 'entries'}</span></div>
        ${spending.length ? `<ul class="j-spend-list">${list}</ul>` : '<p class="j-empty">No spending logged this month. Add entries in the Log with the Spending category.</p>'}
      </section>
    </section>`;
}

/* ---------- Activity ---------- */

export function renderActivity(year) {
  const y = Number(year);
  const t = M.today();
  const startY = `${year}-01-01`, endY = `${year}-12-31`;
  const counts = new Map();
  const byCat = new Map();
  const byMonth = new Array(12).fill(0);
  let total = 0;
  for (const [date, list] of M.idx().logsByDate) {
    if (date < startY || date > endY) continue;
    counts.set(date, list.length);
    total += list.length;
    byMonth[Number(date.slice(5, 7)) - 1] += list.length;
    for (const e of list) byCat.set(e.cat, (byCat.get(e.cat) || 0) + 1);
  }
  const daysActive = counts.size;
  // streaks
  let longest = 0, run = 0;
  for (let d = startY; d <= endY && d <= t; d = M.addDays(d, 1)) {
    if (counts.get(d)) { run++; longest = Math.max(longest, run); } else run = 0;
  }
  let current = 0;
  if (String(y) === t.slice(0, 4)) {
    let d = M.logsOn(t).length ? t : M.addDays(t, -1);
    while (M.logsOn(d).length) { current++; d = M.addDays(d, -1); }
  }
  const tasksDone = M.idx().tasks.filter(x => x.done && x.doneAt && new Date(x.doneAt).getFullYear() === y).length;

  // heatmap: columns = weeks starting Monday
  const gridStart = M.weekStart(startY);
  const max = Math.max(1, ...counts.values());
  let cols = '';
  let monthLabels = '';
  let col = 0;
  for (let w = gridStart; w <= endY; w = M.addDays(w, 7)) {
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = M.addDays(w, i);
      if (d < startY || d > endY) { cells += '<i class="is-blank"></i>'; continue; }
      const n = counts.get(d) || 0;
      const lvl = n === 0 ? 0 : Math.min(4, Math.ceil(n / max * 4));
      cells += `<a href="#/day/${d}" class="l${lvl}${d === t ? ' is-today' : ''}" title="${esc(M.fmt.long(d))}: ${n} ${n === 1 ? 'entry' : 'entries'}"></a>`;
      if (M.parseDate(d).getDate() === 1) monthLabels += `<span style="grid-column:${col + 1}">${esc(M.parseDate(d).toLocaleDateString(undefined, { month: 'short' }))}</span>`;
    }
    cols += `<div class="j-heat-col">${cells}</div>`;
    col++;
  }

  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const c = M.logCat(id);
    return `<li style="${colorVar(c.color)}"><span class="j-ev-dot"></span><span>${esc(c.name)}</span><span class="j-catbar"><span style="width:${Math.round(n / total * 100)}%"></span></span><span class="j-count">${n} · ${Math.round(n / total * 100)}%</span></li>`;
  }).join('');
  const maxMonth = Math.max(1, ...byMonth);
  const monthBars = byMonth.map((n, i) => `
    <a class="j-mbar" href="#/month/${year}-${M.pad(i + 1)}" title="${n} entries">
      <span style="height:${Math.round(n / maxMonth * 100)}%"></span>
      <b>${esc(M.parseDate(`${year}-${M.pad(i + 1)}-01`).toLocaleDateString(undefined, { month: 'narrow' }))}</b>
    </a>`).join('');

  return `
    <section class="j-view j-activity">
      ${headNav({ prev: '#/activity/' + (y - 1), next: '#/activity/' + (y + 1), eyebrow: 'Journaling activity', title: String(y) })}
      <div class="j-stats">
        <div class="j-stat"><span>${total}</span>log entries</div>
        <div class="j-stat"><span>${daysActive}</span>days journaled</div>
        <div class="j-stat"><span>${current}</span>day streak now</div>
        <div class="j-stat"><span>${longest}</span>longest streak</div>
        <div class="j-stat"><span>${tasksDone}</span>tasks completed</div>
      </div>
      <section class="j-card j-heat-card">
        <div class="j-heat-scroll">
          <div class="j-heat-months" style="grid-template-columns:repeat(${col}, 14px)">${monthLabels}</div>
          <div class="j-heat">
            <div class="j-heat-days"><b></b><b>Tue</b><b></b><b>Thu</b><b></b><b>Sat</b><b></b></div>
            ${cols}
          </div>
        </div>
        <div class="j-heat-legend">Less <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> More</div>
      </section>
      <div class="j-grid">
        <section class="j-card"><div class="j-card-head"><h2>By category</h2></div>
          ${catRows ? `<ul class="j-catlist">${catRows}</ul>` : '<p class="j-empty">No entries this year yet.</p>'}</section>
        <section class="j-card"><div class="j-card-head"><h2>By month</h2></div><div class="j-mbars">${monthBars}</div></section>
      </div>
    </section>`;
}

/* ---------- Search ---------- */

function snippet(text, q) {
  text = text || '';
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return null;
  const s = Math.max(0, i - 40), e = Math.min(text.length, i + q.length + 70);
  return (s > 0 ? '…' : '') + esc(text.slice(s, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, e)) + (e < text.length ? '…' : '');
}

export function renderSearch(query) {
  const q = query.trim().toLowerCase();
  const results = [];
  if (q) {
    for (const [date, list] of M.idx().logsByDate) {
      for (const e of list) {
        const h = snippet(e.text, q) || snippet(fieldsText(M.logCat(e.cat), e.fields), q);
        if (h) results.push({ sort: date + (e.time || ''), html: `<button type="button" class="j-card j-result" data-act="edit-log" data-id="${e.id}" style="${colorVar(M.logCat(e.cat).color)}">
          <span class="j-result-top"><span class="j-ev-dot"></span>${esc(M.logCat(e.cat).name)} · ${esc(M.fmt.long(date))} ${esc(e.time || '')}</span><span class="j-result-hit">${h}</span></button>` });
      }
    }
    for (const t of M.idx().tasks) {
      const h = snippet(t.title, q) || snippet(t.notes, q) || Object.values(t.subtasks || {}).map(s => snippet(s.text, q)).find(Boolean);
      if (h) results.push({ sort: t.due || '0000', html: `<button type="button" class="j-card j-result" data-act="open-task" data-id="${t.id}">
        <span class="j-result-top">Task${t.due ? ' · due ' + esc(M.fmt.long(t.due)) : ''}${t.done ? ' · done' : ''}</span><span class="j-result-hit">${h}</span></button>` });
    }
    for (const e of M.idx().events) {
      const h = snippet(e.title, q) || snippet(e.note, q);
      if (h) results.push({ sort: e.date, html: `<button type="button" class="j-card j-result" data-act="edit-event" data-id="${e.id}" style="${colorVar(M.eventCat(e.cat).color)}">
        <span class="j-result-top"><span class="j-ev-dot"></span>${esc(M.eventCat(e.cat).name)} · ${esc(M.fmt.long(e.date))}</span><span class="j-result-hit">${h}</span></button>` });
    }
  }
  results.sort((a, b) => b.sort.localeCompare(a.sort));
  return `
    <section class="j-view j-search">
      <label class="j-searchbox">
        ${ICONS.search}
        <input type="search" class="j-inline" data-field="search" data-focus="search" value="${esc(query)}"
               placeholder="Search log, tasks and events" aria-label="Search the journal" autocomplete="off">
      </label>
      <p class="j-search-note">${q ? (results.length ? `${results.length} found` : 'Nothing found.') : 'Search happens on this device, since your journal is encrypted.'}</p>
      <div class="j-results">${results.slice(0, 150).map(r => r.html).join('')}</div>
    </section>`;
}
