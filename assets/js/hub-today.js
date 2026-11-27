/* ==========================================================
   Highlights of the day, in the hub's hero: one row per thing
   that needs you (tasks, events, home, renewals, budget),
   colour coded by type. Shown only once unlocked, and only
   when there is something to show.
   ========================================================== */

import * as S from './core/session.js';
import { openStore } from './core/store.js';
import { esc, toast } from './ui/dom.js';
import * as J from '../../tools/journal/model.js';
import * as IM from '../../tools/inventory/model.js';
import * as SM from '../../tools/subscriptions/model.js';
import { holidaysOn, onHolidaysUpdate } from '../../tools/journal/holidays.js';

const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  task: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="m8.5 12.2 2.5 2.5 4.5-5"/></svg>',
  event: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  holiday: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1 1M16.7 16.7l1 1M6.3 17.7l1-1M16.7 7.3l1-1"/><circle cx="12" cy="12" r="4"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9v10.5h13V9"/><rect x="9.5" y="13" width="5" height="6.5" rx="1"/></svg>',
  renew: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V9.5a3 3 0 0 1 3-3h12"/><path d="m16 3.5 3 3-3 3"/><path d="M20 13v1.5a3 3 0 0 1-3 3H5"/><path d="m8 20.5-3-3 3-3"/></svg>',
  budget: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="12.5" rx="2.5"/><path d="M3.5 10h17"/><path d="M15 14.5h2.5"/></svg>',
};

const TYPES = {
  task: 'Task',
  event: 'Event',
  holiday: 'Holiday',
  home: 'Home',
  renew: 'Renewal',
  budget: 'Budget',
};

export function mountToday() {
  const list = document.getElementById('highlights');
  if (!list) return;
  const journal = openStore('journal');
  const inventory = openStore('inventory');
  const subscriptions = openStore('subscriptions');
  let jReady = false;
  let expanded = false;

  const render = () => {
    const on = S.getState().status === 'unlocked' && jReady;
    const rows = on ? collect() : [];
    const max = maxRows();
    const shown = expanded ? rows : rows.slice(0, max);
    list.innerHTML = shown.map(rowHtml).join('')
      + (rows.length > shown.length ? `<li class="hl-more"><button type="button" class="btn btn-text" data-more>${rows.length - shown.length} more</button></li>` : '');
    list.hidden = !rows.length;
    document.body.classList.toggle('has-highlights', rows.length > 0);
  };

  journal.subscribe(l => { J.setItems(l); jReady = true; render(); });
  inventory.subscribe(l => { IM.setItems(l); render(); });
  subscriptions.subscribe(l => { SM.setItems(l); render(); });
  onHolidaysUpdate(render);
  S.onChange(st => { if (st.status !== 'unlocked') { jReady = false; expanded = false; render(); } });

  list.addEventListener('click', e => { if (e.target.closest('[data-more]')) { expanded = true; render(); } });
  list.addEventListener('change', async e => {
    const cb = e.target.closest('[data-task]');
    if (!cb) return;
    const t = J.clone(J.get('task:' + cb.dataset.task));
    if (!t) return;
    t.done = cb.checked;
    t.doneAt = cb.checked ? Date.now() : null;
    cb.closest('.hl').classList.toggle('is-done', cb.checked);
    try { await journal.put('task:' + cb.dataset.task, t); } catch (err) { toast("Couldn't save. " + err.message); }
  });

  // keep "today" current across midnight
  let day = J.today();
  setInterval(() => { if (J.today() !== day) { day = J.today(); render(); } }, 60000);
}

// At most 4 rows; the rest wait behind "more".
const maxRows = () => 4;

/** Everything worth a row today, most urgent first. */
function collect() {
  const t = J.today();
  const month = t.slice(0, 7);
  const rows = [];
  const when = d => d === t ? 'Today' : d === J.addDays(t, 1) ? 'Tomorrow' : `${J.fmt.wd(d)} ${J.parseDate(d).getDate()}`;

  /* tasks: overdue, then due today */
  for (const x of J.overdueTasks(t)) rows.push({ type: 'task', rank: 0, date: x.due, id: x.id, title: x.title, meta: J.fmt.short(x.due), late: true, href: `tools/journal/#/task/${x.id}` });
  for (const x of J.tasksDue(t).filter(x => !x.done)) rows.push({ type: 'task', rank: 1, date: t, id: x.id, title: x.title, meta: x.time || 'Today', href: `tools/journal/#/task/${x.id}` });

  /* budget, only when it needs attention */
  const b = J.get('budget:' + month) || {};
  if (typeof b.total === 'number' && b.total > 0) {
    const spent = J.sum(J.spendingIn(month));
    const left = b.total - spent;
    const elapsed = Number(t.slice(8)) / J.daysInMonth(month);
    const reason = left < 0 ? 'Over budget'
      : left / b.total < 0.15 ? 'Almost used up'
      : spent / b.total > elapsed + 0.15 ? 'Spending faster than the month'
      : '';
    if (reason) rows.push({ type: 'budget', rank: left < 0 ? 0 : 2, date: t, title: reason, meta: `${J.money(Math.abs(left))} ${left < 0 ? 'over' : 'left'}`, late: left < 0, href: `tools/journal/#/budget/${month}` });
  }

  /* at home: replacements due, expired or expiring this week */
  for (const h of IM.attention(t, 7)) rows.push({ type: 'home', rank: h.overdue ? 1 : 3, date: h.date, title: h.item.name, meta: h.text, late: h.overdue, href: `tools/inventory/#/item/${h.item.id}` });

  /* subscriptions renewing in the next 3 days */
  for (const x of SM.upcoming(3, t)) rows.push({ type: 'renew', rank: 3, date: x.date, title: x.sub.name, meta: `${when(x.date)} · ${SM.money(SM.myCost(x.sub, x.date))}`, href: `tools/subscriptions/#/sub/${x.sub.id}` });

  /* holidays and events in the next 7 days */
  for (let i = 0; i <= 7; i++) {
    const d = J.addDays(t, i);
    for (const h of holidaysOn(d)) rows.push({ type: 'holiday', rank: 4, date: d, title: h.name, meta: when(d), href: `tools/journal/#/month/${d.slice(0, 7)}` });
    for (const e of J.eventsOn(d)) {
      if (i > 0 && e.date !== d && !(e.yearly && e.date.slice(5) === d.slice(5))) continue;   // multi-day: list once
      const c = J.eventCat(e.cat);
      rows.push({ type: c.dayoff ? 'holiday' : 'event', rank: 4, date: d, title: e.title, meta: when(d), href: `tools/journal/#/event/${e.id}` });
    }
  }

  return rows.sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date));
}

function rowHtml(r) {
  const tick = r.type === 'task'
    ? `<label class="hl-check"><input type="checkbox" data-task="${esc(r.id)}" aria-label="Done: ${esc(r.title)}"><span class="hl-box">${ICON.check}</span></label>`
    : '';
  return `
    <li class="hl hl-${r.type}${r.late ? ' is-overdue' : ''}">
      <span class="hl-icon">${ICON[r.type]}</span>
      <a class="hl-main" href="${r.href}">
        <span class="hl-type">${TYPES[r.type]}</span>
        <span class="hl-title">${esc(r.title)}</span>
      </a>
      <span class="hl-meta">${esc(r.meta)}</span>
      ${tick}
    </li>`;
}
