/* ==========================================================
   "Today" on the hub: tasks, upcoming events, things at home
   that need attention and the month's budget, once unlocked.
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
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
};

export function mountToday() {
  const box = document.getElementById('today-panel');
  if (!box) return;
  const journal = openStore('journal');
  const inventory = openStore('inventory');
  const subscriptions = openStore('subscriptions');
  let jReady = false;

  const render = () => {
    if (S.getState().status !== 'unlocked' || !jReady) { box.hidden = true; document.body.classList.remove('has-today'); return; }
    const html = view();
    box.innerHTML = html;
    box.hidden = !html;
    document.body.classList.toggle('has-today', !!html);
  };

  journal.subscribe(list => { J.setItems(list); jReady = true; render(); });
  inventory.subscribe(list => { IM.setItems(list); render(); });
  subscriptions.subscribe(list => { SM.setItems(list); render(); });
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

// Phones show fewer rows so the tools stay close to the top.
const maxRows = () => (window.matchMedia('(max-width: 640px)').matches ? 3 : 5);

/** Only sections with something worth acting on; '' when there's nothing. */
function view() {
  const t = J.today();
  const rows = maxRows();
  const month = t.slice(0, 7);
  const when = d => d === t ? 'Today' : d === J.addDays(t, 1) ? 'Tomorrow' : `${J.fmt.wd(d)} ${J.parseDate(d).getDate()}`;
  const more = n => (n > 0 ? `<p class="today-more">+${n} more</p>` : '');
  const sections = [];

  /* tasks: open ones due today, overdue first */
  const overdue = J.overdueTasks(t);
  const open = [...overdue, ...J.tasksDue(t).filter(x => !x.done)];
  if (open.length) {
    sections.push(`
      <section class="today-block tone-flower" aria-labelledby="tb-tasks">
        <a class="today-title" href="tools/journal/#/day/${t}"><h3 id="tb-tasks">Tasks</h3>
          <span>${open.length} to do${overdue.length ? ` · ${overdue.length} overdue` : ''}</span>${ICON.arrow}</a>
        <ul class="today-tasks">${open.slice(0, rows).map(x => `
          <li>
            <label class="today-check"><input type="checkbox" data-task="${x.id}" aria-label="Done: ${esc(x.title)}"><span class="today-box">${ICON.check}</span></label>
            <span class="today-task-title">${esc(x.title)}</span>
            ${x.due < t ? `<span class="today-late">${esc(J.fmt.short(x.due))}</span>` : x.time ? `<span class="today-meta">${esc(x.time)}</span>` : ''}
          </li>`).join('')}</ul>${more(open.length - rows)}
      </section>`);
  }

  /* coming up: holidays + events in the next 7 days */
  const upcoming = [];
  for (let i = 0; i <= 7; i++) {
    const d = J.addDays(t, i);
    for (const h of holidaysOn(d)) upcoming.push({ d, name: h.name, holiday: true });
    for (const e of J.eventsOn(d)) {
      const c = J.eventCat(e.cat);
      if (i > 0 && e.date !== d && !(e.yearly && e.date.slice(5) === d.slice(5))) continue;   // multi-day: list once
      upcoming.push({ d, name: e.title, holiday: !!c.dayoff, color: J.swatch(c.color) });
    }
  }
  if (upcoming.length) {
    sections.push(`
      <section class="today-block tone-leaf" aria-labelledby="tb-up">
        <a class="today-title" href="tools/journal/#/month/${month}"><h3 id="tb-up">Coming up</h3>${ICON.arrow}</a>
        <ul class="today-list">${upcoming.slice(0, rows).map(u => `
          <li><span class="today-dot${u.holiday ? ' is-holiday' : ''}" ${u.color && !u.holiday ? `style="background:${u.color}"` : ''}></span>
            <span class="today-when">${esc(when(u.d))}</span><span class="today-name">${esc(u.name)}</span></li>`).join('')}</ul>${more(upcoming.length - rows)}
      </section>`);
  }

  /* at home: replacements due, expired or expiring this week */
  const home = IM.attention(t, 7);
  if (home.length) {
    sections.push(`
      <section class="today-block tone-sun" aria-labelledby="tb-home">
        <a class="today-title" href="tools/inventory/#/due"><h3 id="tb-home">At home</h3><span>${home.length} need attention</span>${ICON.arrow}</a>
        <ul class="today-list">${home.slice(0, rows).map(h => `
          <li><span class="today-name">${esc(h.item.name)}</span><span class="today-meta ${h.overdue ? 'is-late' : ''}">${esc(h.text)}</span></li>`).join('')}</ul>${more(home.length - rows)}
      </section>`);
  }

  /* subscriptions renewing in the next 3 days */
  const renew = SM.upcoming(3, t);
  if (renew.length) {
    sections.push(`
      <section class="today-block tone-sun" aria-labelledby="tb-renew">
        <a class="today-title" href="tools/subscriptions/"><h3 id="tb-renew">Renewing soon</h3><span>${esc(SM.money(renew.reduce((n, x) => n + SM.myCost(x.sub, x.date), 0)))}</span>${ICON.arrow}</a>
        <ul class="today-list">${renew.slice(0, rows).map(x => `
          <li><span class="today-when">${esc(SM.whenText(x.date))}</span><span class="today-name">${esc(x.sub.name)}</span><span class="today-meta">${esc(SM.money(SM.myCost(x.sub, x.date)))}</span></li>`).join('')}</ul>${more(renew.length - rows)}
      </section>`);
  }

  /* budget: only when it needs attention */
  const b = J.get('budget:' + month) || {};
  if (typeof b.total === 'number' && b.total > 0) {
    const spent = J.sum(J.spendingIn(month));
    const left = b.total - spent;
    const used = spent / b.total;
    const dim = J.daysInMonth(month), dayNum = Number(t.slice(8));
    const elapsed = dayNum / dim;
    const reason = left < 0 ? 'Over budget'
      : left / b.total < 0.15 ? 'Almost used up'
      : used > elapsed + 0.15 ? 'Spending faster than the month'
      : '';
    if (reason) {
      sections.push(`
        <section class="today-block" aria-labelledby="tb-budget">
          <a class="today-title" href="tools/journal/#/budget/${month}"><h3 id="tb-budget">Budget</h3><span>${esc(reason)}</span>${ICON.arrow}</a>
          <p class="today-big ${left < 0 ? 'is-late' : ''}">${esc(J.money(Math.abs(left)))}<small>${left < 0 ? 'over' : 'left'}</small></p>
          <div class="today-bar ${left < 0 ? 'is-over' : ''}"><span style="width:${Math.min(100, Math.round(used * 100))}%"></span><i style="left:${Math.round(elapsed * 100)}%"></i></div>
          <p class="today-meta">${esc(J.money(spent))} of ${esc(J.money(b.total))} spent · ${Math.round(elapsed * 100)}% of ${esc(J.fmt.monthName(month))} gone</p>
        </section>`);
    }
  }

  if (!sections.length) return '';
  return `
    <div class="today-head">
      <h2 id="today-h">Today</h2>
      <a class="btn btn-text" href="tools/journal/">Open journal</a>
    </div>
    <div class="today-grid${sections.length === 1 ? ' is-single' : ''}">${sections.join('')}</div>`;
}
