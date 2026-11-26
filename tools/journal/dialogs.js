/* Journal dialogs: task details, log entry, event, settings, habits. */

import { openDialog, esc, toast, busy } from '../../assets/js/ui/dom.js';
import * as M from './model.js';
import { ICONS } from './views.js';

let store = null;
export function useStore(s) { store = s; }

const save = (key, data) => store.put(key, data).catch(err => { toast("Couldn't save. " + (err.message || '')); throw err; });
const remove = key => store.remove(key).catch(err => { toast("Couldn't delete. " + (err.message || '')); throw err; });

function confirmButton(btn, label, fn) {
  // Two-step delete: first tap arms, second tap confirms.
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) return fn();
    btn.dataset.armed = '1';
    const old = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000);
  });
}

/* ---------- Task ---------- */

export function openTaskDialog(id, defaults = {}) {
  const key = 'task:' + id;
  const existing = M.get(key);
  const task = M.clone(existing) || { title: '', due: null, time: null, done: false, notes: '', subtasks: {}, createdAt: Date.now(), ...defaults };
  task.subtasks = task.subtasks || {};
  let dirty = false;
  let deleted = false;
  let newSubEl = null;

  return openDialog({
    label: 'Task',
    render(el, close) {
      el.innerHTML = `
        <form class="j-taskform" novalidate>
          <label class="j-done-toggle">
            <input type="checkbox" name="done" ${task.done ? 'checked' : ''}>
            <span class="j-box">${ICONS.check}</span>
            <span class="visually-hidden">Done</span>
          </label>
          <textarea class="j-title-input" name="title" rows="1" placeholder="Task" aria-label="Task title" autofocus>${esc(task.title)}</textarea>

          <div class="j-task-fields">
            <label class="field"><span class="field-label">Due date</span>
              <input class="input" type="date" name="due" value="${esc(task.due || '')}"></label>
            <label class="field"><span class="field-label">Time</span>
              <input class="input" type="time" name="time" value="${esc(task.time || '')}"></label>
          </div>
          <div class="j-quick-due">
            <button type="button" class="btn btn-ghost btn-sm" data-due="${M.today()}">Today</button>
            <button type="button" class="btn btn-ghost btn-sm" data-due="${M.addDays(M.today(), 1)}">Tomorrow</button>
            <button type="button" class="btn btn-ghost btn-sm" data-due="${M.addDays(M.weekStart(M.today()), 7)}">Next week</button>
            <button type="button" class="btn btn-ghost btn-sm" data-due="">No date</button>
          </div>

          <h3>Subtasks</h3>
          <ul class="j-subtasks" data-subs></ul>
          <div class="j-add j-add-sub">
            <span class="j-add-icon">${ICONS.plus}</span>
            <input class="j-inline" data-newsub placeholder="Add a subtask" autocomplete="off" aria-label="New subtask">
          </div>

          <h3>Notes</h3>
          <textarea class="input j-task-notes" name="notes" rows="3" placeholder="Details, links, anything…">${esc(task.notes || '')}</textarea>

          <div class="dialog-actions">
            ${existing ? '<button class="btn btn-text j-danger" type="button" data-delete>Delete task</button>' : ''}
            <span class="spacer"></span>
            <button class="btn btn-primary" type="submit">${existing ? 'Done' : 'Add task'}</button>
          </div>
        </form>`;

      const form = el.querySelector('form');
      const subsEl = el.querySelector('[data-subs]');
      const grow = t => { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 36) + 'px'; };
      requestAnimationFrame(() => grow(form.title));   // after the dialog is on screen

      const drawSubs = () => {
        const subs = Object.entries(task.subtasks).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
        subsEl.innerHTML = subs.map(([sid, s]) => `
          <li class="j-task${s.done ? ' is-done' : ''}">
            <label class="j-check"><input type="checkbox" data-sub-done="${sid}" ${s.done ? 'checked' : ''} aria-label="Done"><span class="j-box">${ICONS.check}</span></label>
            <input class="j-inline" data-sub-text="${sid}" value="${esc(s.text)}" aria-label="Subtask">
            <button class="j-del" type="button" data-sub-del="${sid}" aria-label="Delete subtask">${ICONS.x}</button>
          </li>`).join('');
      };
      drawSubs();

      form.addEventListener('input', e => {
        dirty = true;
        const t = e.target;
        if (t.name === 'title') { task.title = t.value; grow(t); }
        else if (t.name === 'notes') task.notes = t.value;
        else if (t.name === 'due') task.due = t.value || null;
        else if (t.name === 'time') task.time = t.value || null;
        else if (t.dataset.subText) task.subtasks[t.dataset.subText].text = t.value;
      });
      form.addEventListener('change', e => {
        const t = e.target;
        if (t.name === 'done') { task.done = t.checked; task.doneAt = t.checked ? Date.now() : null; dirty = true; }
        if (t.dataset.subDone) { task.subtasks[t.dataset.subDone].done = t.checked; dirty = true; drawSubs(); }
      });
      el.querySelector('.j-quick-due').addEventListener('click', e => {
        const b = e.target.closest('[data-due]');
        if (!b) return;
        task.due = b.dataset.due || null;
        if (!task.due) task.time = null;
        form.due.value = task.due || '';
        form.time.value = task.time || '';
        dirty = true;
      });
      subsEl.addEventListener('click', e => {
        const b = e.target.closest('[data-sub-del]');
        if (b) { delete task.subtasks[b.dataset.subDel]; dirty = true; drawSubs(); }
      });
      const newSub = newSubEl = el.querySelector('[data-newsub]');
      newSub.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const text = newSub.value.trim();
        if (!text) return;
        const order = Math.max(0, ...Object.values(task.subtasks).map(s => s.order ?? 0)) + 1;
        task.subtasks[M.newId()] = { text, done: false, order };
        newSub.value = '';
        dirty = true;
        drawSubs();
      });
      form.title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', e => { e.preventDefault(); close('save'); });

      const del = el.querySelector('[data-delete]');
      if (del) confirmButton(del, 'Tap again to delete', () => { deleted = true; close('delete'); });
    },
  }).then(async result => {
    if (deleted) { await remove(key); toast('Task deleted'); return; }
    // Anything left in the "add subtask" box counts too.
    const leftover = newSubEl && newSubEl.value.trim();
    if (leftover) {
      const order = Math.max(0, ...Object.values(task.subtasks).map(s => s.order ?? 0)) + 1;
      task.subtasks[M.newId()] = { text: leftover, done: false, order };
      dirty = true;
    }
    task.title = (task.title || '').trim();
    for (const s of Object.values(task.subtasks)) s.text = (s.text || '').trim();
    for (const [sid, s] of Object.entries(task.subtasks)) if (!s.text) delete task.subtasks[sid];
    if (!task.title) { if (existing && dirty) toast('A task needs a title, so changes weren\'t saved'); return; }
    if (!existing && result !== 'save' && !dirty) return;
    if (existing && !dirty) return;
    await save(key, task);
  });
}

export async function toggleTask(id, done) {
  const t = M.clone(M.get('task:' + id));
  if (!t) return;
  t.done = done;
  t.doneAt = done ? Date.now() : null;
  await save('task:' + id, t);
}

export async function addTask(title, due) {
  await save('task:' + M.newId(), { title, due: due || null, time: null, done: false, notes: '', subtasks: {}, createdAt: Date.now() });
}

/* ---------- Log entry ---------- */

export function openLogDialog(id) {
  const key = 'log:' + id;
  const entry = M.clone(M.get(key));
  if (!entry) return;
  const cfg = M.config();
  return openDialog({
    label: 'Log entry',
    render(el, close) {
      const catOpts = M.activeList(cfg.logCats).concat(cfg.logCats[entry.cat]?.archived ? [cfg.logCats[entry.cat]] : [])
        .map(c => `<option value="${c.id}" ${c.id === entry.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
      const spendOpts = M.activeList(cfg.spendCats).map(c => `<option value="${c.id}" ${c.id === entry.spendCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
      el.innerHTML = `
        <h2>Log entry</h2>
        <form novalidate>
          <div class="j-task-fields">
            <label class="field"><span class="field-label">Date</span><input class="input" type="date" name="date" value="${esc(entry.date)}" required></label>
            <label class="field"><span class="field-label">Time</span><input class="input" type="time" name="time" value="${esc(entry.time || '')}"></label>
          </div>
          <label class="field"><span class="field-label">Category</span><select class="input" name="cat">${catOpts}</select></label>
          <label class="field"><span class="field-label">Entry</span><textarea class="input" name="text" rows="4">${esc(entry.text || '')}</textarea></label>
          <div class="j-task-fields" data-spend ${M.isSpendCat(entry.cat) ? '' : 'hidden'}>
            <label class="field"><span class="field-label">Amount (${esc(cfg.currency)})</span>
              <input class="input" name="amount" inputmode="decimal" value="${typeof entry.amount === 'number' ? esc(M.plainNumber(entry.amount)) : ''}"></label>
            <label class="field"><span class="field-label">Spending category</span><select class="input" name="spendCat">${spendOpts}</select></label>
          </div>
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            <button class="btn btn-text j-danger" type="button" data-delete>Delete</button>
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>`;
      const form = el.querySelector('form');
      form.cat.addEventListener('change', () => { el.querySelector('[data-spend]').hidden = !M.isSpendCat(form.cat.value); });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      confirmButton(el.querySelector('[data-delete]'), 'Tap again to delete', async () => {
        await remove(key); toast('Entry deleted'); close();
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = el.querySelector('.form-error');
        const spend = M.isSpendCat(form.cat.value);
        const amount = spend ? M.parseAmount(form.amount.value) : null;
        if (!M.isDate(form.date.value)) { err.textContent = 'Pick a date.'; return; }
        if (spend && amount == null) { err.textContent = 'Enter an amount.'; return; }
        if (!spend && !form.text.value.trim()) { err.textContent = 'Write something, or delete the entry.'; return; }
        const next = { ...entry, date: form.date.value, time: form.time.value || '', cat: form.cat.value, text: form.text.value.trim(),
          amount, spendCat: spend ? form.spendCat.value : null };
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => save(key, next));
        close();
      });
    },
  });
}

/* ---------- Event ---------- */

export function openEventDialog(id, defaults = {}) {
  const key = 'event:' + (id || M.newId());
  const existing = id ? M.get(key) : null;
  const ev = M.clone(existing) || { title: '', date: M.today(), endDate: null, cat: 'other', yearly: false, note: '', ...defaults };
  const cfg = M.config();
  return openDialog({
    label: existing ? 'Edit event' : 'New event',
    render(el, close) {
      const cats = M.activeList(cfg.eventCats).map(c => `<option value="${c.id}" ${c.id === ev.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
      el.innerHTML = `
        <h2>${existing ? 'Edit event' : 'New event'}</h2>
        <p>Events show on the calendars in their category's colour. Use <strong>Day off / cuti</strong> for collective leave (cuti bersama) and other days off.</p>
        <form novalidate>
          <label class="field"><span class="field-label">Title</span><input class="input" name="title" value="${esc(ev.title)}" required autofocus></label>
          <div class="j-task-fields">
            <label class="field"><span class="field-label">Date</span><input class="input" type="date" name="date" value="${esc(ev.date)}" required></label>
            <label class="field"><span class="field-label">Until (optional)</span><input class="input" type="date" name="endDate" value="${esc(ev.endDate || '')}"></label>
          </div>
          <label class="field"><span class="field-label">Category</span><select class="input" name="cat">${cats}</select></label>
          <label class="check"><input type="checkbox" name="yearly" ${ev.yearly ? 'checked' : ''}><span>Repeats every year<small>For birthdays and anniversaries.</small></span></label>
          <label class="field"><span class="field-label">Note (optional)</span><textarea class="input" name="note" rows="2">${esc(ev.note || '')}</textarea></label>
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            ${existing ? '<button class="btn btn-text j-danger" type="button" data-delete>Delete</button>' : ''}
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>`;
      const form = el.querySelector('form');
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      const del = el.querySelector('[data-delete]');
      if (del) confirmButton(del, 'Tap again to delete', async () => { await remove(key); toast('Event deleted'); close(); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = el.querySelector('.form-error');
        if (!form.title.value.trim()) { err.textContent = 'Give the event a title.'; return; }
        if (!M.isDate(form.date.value)) { err.textContent = 'Pick a date.'; return; }
        const end = M.isDate(form.endDate.value) && form.endDate.value > form.date.value ? form.endDate.value : null;
        const next = { ...ev, title: form.title.value.trim(), date: form.date.value, endDate: end, cat: form.cat.value,
          yearly: form.yearly.checked, note: form.note.value.trim() };
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => save(key, next));
        close();
      });
    },
  });
}

/* ---------- Settings: categories + currency ---------- */

function swatchPicker(name, current, includeHoliday = false) {
  const names = Object.keys(M.SWATCHES).concat(includeHoliday ? ['holiday'] : []);
  return `
    <details class="j-swatch">
      <summary style="--c:${M.swatch(current)}" aria-label="Colour"></summary>
      <div class="j-swatch-list">${names.map(n => `<button type="button" data-swatch="${n}" data-for="${name}" style="--c:${M.swatch(n)}" aria-label="${n}" aria-pressed="${n === current}"></button>`).join('')}</div>
    </details>`;
}

export function openSettingsDialog() {
  const cfg = M.config();
  const draft = {
    logCats: M.clone(cfg.logCats),
    eventCats: M.clone(cfg.eventCats),
    spendCats: M.clone(cfg.spendCats),
    currency: cfg.currency,
  };
  return openDialog({
    label: 'Journal settings',
    render(el, close) {
      el.closest('dialog').classList.add('is-wide');
      const section = (map, kind) => M.activeList(draft[map]).map(c => `
        <li class="j-setrow" data-map="${map}" data-id="${c.id}">
          ${kind !== 'spend' ? swatchPicker(`${map}.${c.id}`, c.color, map === 'eventCats') : ''}
          <input class="input" data-k="name" value="${esc(c.name)}" aria-label="Name" maxlength="30">
          ${kind === 'log' ? `<input class="input j-prompt" data-k="prompt" value="${esc(c.prompt || '')}" placeholder="Prompt" aria-label="Prompt for ${esc(c.name)}">` : ''}
          ${c.spend || c.dayoff ? `<span class="j-lock" title="Built-in">${c.spend ? 'Spending' : 'Day off'}</span>` : `<button class="icon-btn" type="button" data-remove aria-label="Remove ${esc(c.name)}">${ICONS.x}</button>`}
        </li>`).join('');
      const draw = () => {
        el.querySelector('[data-list=log]').innerHTML = section('logCats', 'log');
        el.querySelector('[data-list=event]').innerHTML = section('eventCats', 'event');
        el.querySelector('[data-list=spend]').innerHTML = section('spendCats', 'spend');
      };
      el.innerHTML = `
        <h2>Journal settings</h2>
        <p>Removing a category hides it from pickers; past entries keep it.</p>
        <h3>Log categories &amp; prompts</h3>
        <ul class="j-setlist" data-list="log"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add="logCats">${ICONS.plus}Add category</button>
        <h3>Event categories</h3>
        <ul class="j-setlist" data-list="event"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add="eventCats">${ICONS.plus}Add category</button>
        <h3>Spending categories</h3>
        <ul class="j-setlist" data-list="spend"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add="spendCats">${ICONS.plus}Add category</button>
        <h3>Currency</h3>
        <select class="input j-currency" data-currency>${M.CURRENCIES.map(c => `<option ${c === draft.currency ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
          <button class="btn btn-primary" type="button" data-save>Save</button>
        </div>`;
      draw();

      el.addEventListener('input', e => {
        const row = e.target.closest('[data-map]');
        if (row && e.target.dataset.k) draft[row.dataset.map][row.dataset.id][e.target.dataset.k] = e.target.value;
      });
      el.addEventListener('click', e => {
        const sw = e.target.closest('[data-swatch]');
        if (sw) {
          const [map, id] = sw.dataset.for.split('.');
          draft[map][id].color = sw.dataset.swatch;
          draw();
          return;
        }
        const rm = e.target.closest('[data-remove]');
        if (rm) {
          const row = rm.closest('[data-map]');
          draft[row.dataset.map][row.dataset.id].archived = true;
          draw();
          return;
        }
        const add = e.target.closest('[data-add]');
        if (add) {
          const map = add.dataset.add;
          const id = M.newId();
          const order = Math.max(0, ...Object.values(draft[map]).map(c => c.order ?? 0)) + 1;
          const colors = Object.keys(M.SWATCHES);
          draft[map][id] = { id, name: 'New category', order, ...(map === 'spendCats' ? {} : { color: colors[order % colors.length] }), ...(map === 'logCats' ? { prompt: '' } : {}) };
          draw();
          el.querySelector(`[data-id="${id}"] [data-k=name]`)?.select();
        }
      });
      el.querySelector('[data-currency]').addEventListener('change', e => { draft.currency = e.target.value; });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-save]').addEventListener('click', async e => {
        const strip = map => Object.fromEntries(Object.entries(draft[map]).map(([id, v]) => {
          const { id: _drop, ...rest } = v;
          rest.name = (rest.name || '').trim() || 'Untitled';
          return [id, rest];
        }));
        const next = { logCats: strip('logCats'), eventCats: strip('eventCats'), spendCats: strip('spendCats'), currency: draft.currency };
        await busy(e.currentTarget, 'Saving…', () => save('config', next));
        close();
      });
    },
  });
}

/* ---------- Habits ---------- */

export function openHabitsDialog() {
  const current = M.activeHabits();
  return openDialog({
    label: 'Your habits',
    render(el, close) {
      const rows = current.map(h => ({ id: h.id, name: h.name }));
      const draw = () => {
        el.querySelector('[data-rows]').innerHTML = rows.map((r, i) => `
          <li class="j-setrow">
            <input class="input" data-row="${i}" value="${esc(r.name)}" aria-label="Habit name" maxlength="40">
            <button class="icon-btn" type="button" data-remove="${i}" aria-label="Remove ${esc(r.name)}">${ICONS.x}</button>
          </li>`).join('') || '<li class="j-empty">No habits yet.</li>';
      };
      el.innerHTML = `
        <h2>Your habits</h2>
        <p>These show on every day so you can tick them off. Removing one keeps its past ticks.</p>
        <ul class="j-setlist" data-rows></ul>
        <form class="j-habit-new" data-new>
          <input class="input" name="name" placeholder="New habit, e.g. Walk 20 min" maxlength="40" autocomplete="off" autofocus>
          <button class="btn btn-ghost" type="submit">Add</button>
        </form>
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
          <button class="btn btn-primary" type="button" data-save>Save</button>
        </div>`;
      draw();
      el.querySelector('[data-rows]').addEventListener('input', e => { const i = e.target.dataset.row; if (i != null) rows[i].name = e.target.value; });
      el.querySelector('[data-rows]').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) { rows.splice(Number(b.dataset.remove), 1); draw(); } });
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
        const stored = M.clone(M.get('habits')) || {};
        const all = { ...(stored.items || {}) };
        const keep = new Set();
        rows.filter(r => r.name.trim()).forEach((r, i) => {
          const hid = r.id || M.newId();
          keep.add(hid);
          all[hid] = { ...(all[hid] || {}), name: r.name.trim(), order: i };
          delete all[hid].archived;
        });
        for (const hid of Object.keys(all)) if (!keep.has(hid)) all[hid] = { ...all[hid], archived: true };
        await busy(e.currentTarget, 'Saving…', () => save('habits', { items: all }));
        close();
      });
    },
  });
}
