/* ==========================================================
   "Today" on the hub: tasks, upcoming events, things at home
   that need attention and the month's budget, once unlocked.
   ========================================================== */

import * as S from './core/session.js';
import { openStore } from './core/store.js';
import { esc, toast } from './ui/dom.js';
import * as J from '../../tools/journal/model.js';
import * as IM from '../../tools/inventory/model.js';
import { holidaysOn, onHolidaysUpdate } from '../../tools/journal/holidays.js';

const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
};

export function mountToday() {
  const box = document.getElementById('today-panel');
  if (!box) return;
  const journal = openStore('journal');
  const inventory = openStore('inventory');
  let jReady = false;

  const render = () => {
    if (S.getState().status !== 'unlocked' || !jReady) { box.hidden = true; return; }
    box.innerHTML = view();
    box.hidden = false;
  };

  journal.subscribe(list => { J.setItems(list); jReady = true; render(); });
  inventory.subscribe(list => { IM.setItems(list); render(); });
  onHolidaysUpdate(render);
  S.onChange(st => { if (st.status !== 'unlocked') { jReady = false; render(); } });

  box.addEventListener('change', async e => {
    const cb = e.target.closest('[data-task]');
    if (!cb) return;
    const t = J.clone(J.get('task:' + cb.dataset.task));
    if (!t) return;
    t.done = cb.checked;
    t.doneAt = cb.checked ? Date.now() : null;
    try { await journal.put('task:' + cb.dataset.task, t); } catch (err) { toast("Couldn't save. " + err.message); }
  });

  // keep "today" current across midnight
  let day = J.today();
  setInterval(() => { if (J.today() !== day) { day = J.today(); render(); } }, 60000);
}

function view() {
  const t = J.today();

  /* tasks: overdue first, then today's */
  const overdue = J.overdueTasks(t);
  const dueToday = J.tasksDue(t);
  const tasks = [...overdue, ...dueToday.filter(x => !x.done), ...dueToday.filter(x => x.done)];
  const shownTasks = tasks.slice(0, 5);
  const openCount = overdue.length + dueToday.filter(x => !x.done).length;

  /* coming up: holidays + events, today and the next 14 days */
  const upcoming = [];
  for (let i = 0; i <= 14 && upcoming.length < 4; i++) {
    const d = J.addDays(t, i);
    for (const h of holidaysOn(d)) upcoming.push({ d, name: h.name, holiday: true });
    for (const e of J.eventsOn(d)) {
      const c = J.eventCat(e.cat);
      if (i > 0 && e.date !== d && !(e.yearly && e.date.slice(5) === d.slice(5))) continue;   // multi-day: list once
      upcoming.push({ d, name: e.title, holiday: !!c.dayoff, color: J.swatch(c.color) });
    }
  }

  /* home */
  const home = IM.attention(t, 7);

  /* budget */
  const month = t.slice(0, 7);
  const b = J.get('budget:' + month) || {};
  const spent = J.sum(J.spendingIn(month));
  const hasBudget = typeof b.total === 'number' && b.total > 0;
  const left = hasBudget ? b.total - spent : null;
  const pct = hasBudget ? Math.min(100, Math.round(spent / b.total * 100)) : 0;
  const dim = J.daysInMonth(month), dayNum = Number(t.slice(8));

  const when = d => d === t ? 'Today' : d === J.addDays(t, 1) ? 'Tomorrow' : `${J.fmt.wd(d)} ${J.parseDate(d).getDate()}`;

  return `
    <div class="today-head">
      <h2 id="today-h">Today</h2>
      <a class="btn btn-text" href="tools/journal/">Open journal</a>
    </div>
    <div class="today-grid">
      <section class="today-block tone-flower" aria-labelledby="tb-tasks">
        <a class="today-title" href="tools/journal/#/day/${t}"><h3 id="tb-tasks">Tasks</h3>
          <span>${openCount ? `${openCount} to do${overdue.length ? ` · ${overdue.length} overdue` : ''}` : (tasks.length ? 'all done' : '')}</span>${ICON.arrow}</a>
        ${shownTasks.length ? `<ul class="today-tasks">${shownTasks.map(x => `
          <li class="${x.done ? 'is-done' : ''}">
            <label class="today-check"><input type="checkbox" data-task="${x.id}" ${x.done ? 'checked' : ''} aria-label="Done: ${esc(x.title)}"><span class="today-box">${ICON.check}</span></label>
            <span class="today-task-title">${esc(x.title)}</span>
            ${x.due < t ? `<span class="today-late">${esc(J.fmt.short(x.due))}</span>` : x.time ? `<span class="today-meta">${esc(x.time)}</span>` : ''}
          </li>`).join('')}</ul>${tasks.length > shownTasks.length ? `<p class="today-more">+${tasks.length - shownTasks.length} more</p>` : ''}`
        : '<p class="today-empty">Nothing due today.</p>'}
      </section>

      <section class="today-block tone-leaf" aria-labelledby="tb-up">
        <a class="today-title" href="tools/journal/#/month/${month}"><h3 id="tb-up">Coming up</h3>${ICON.arrow}</a>
        ${upcoming.length ? `<ul class="today-list">${upcoming.map(u => `
          <li><span class="today-dot${u.holiday ? ' is-holiday' : ''}" ${u.color && !u.holiday ? `style="background:${u.color}"` : ''}></span>
            <span class="today-when">${esc(when(u.d))}</span><span class="today-name">${esc(u.name)}</span></li>`).join('')}</ul>`
        : '<p class="today-empty">No holidays or events in the next two weeks.</p>'}
      </section>

      <section class="today-block tone-sun" aria-labelledby="tb-home">
        <a class="today-title" href="tools/inventory/#/due"><h3 id="tb-home">At home</h3>${home.length ? `<span>${home.length} need attention</span>` : ''}${ICON.arrow}</a>
        ${home.length ? `<ul class="today-list">${home.slice(0, 4).map(h => `
          <li><span class="today-name">${esc(h.item.name)}</span><span class="today-meta ${h.overdue ? 'is-late' : ''}">${esc(h.text)}</span></li>`).join('')}</ul>
          ${home.length > 4 ? `<p class="today-more">+${home.length - 4} more</p>` : ''}`
        : '<p class="today-empty">Nothing to replace or expiring this week.</p>'}
      </section>

      <section class="today-block" aria-labelledby="tb-budget">
        <a class="today-title" href="tools/journal/#/budget/${month}"><h3 id="tb-budget">Budget</h3><span>${esc(J.fmt.monthName(month))}</span>${ICON.arrow}</a>
        ${hasBudget ? `
          <p class="today-big ${left < 0 ? 'is-late' : ''}">${esc(J.money(Math.abs(left)))}<small>${left < 0 ? 'over budget' : 'left'}</small></p>
          <div class="today-bar ${left < 0 ? 'is-over' : ''}"><span style="width:${pct}%"></span><i style="left:${Math.round(dayNum / dim * 100)}%"></i></div>
          <p class="today-meta">${esc(J.money(spent))} of ${esc(J.money(b.total))} spent</p>`
        : `<p class="today-big">${esc(J.money(spent))}<small>spent this month</small></p>
           <p class="today-meta">Set a monthly budget in the journal to see what's left.</p>`}
      </section>
    </div>`;
}
