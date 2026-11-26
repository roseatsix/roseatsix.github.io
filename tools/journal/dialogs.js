/* Journal dialogs: task details, log entry, event, settings, habits. */

import { openDialog, esc, toast, busy } from '../../assets/js/ui/dom.js';
import * as M from './model.js';
import { ICONS } from './views.js';
import { openBackupDialog } from '../../assets/js/ui/backup.js';
import { eraseStore } from '../../assets/js/core/backup.js';
import { FIELD_TYPES, renderFieldInputs, applyFieldClick, collectFields, fieldList } from './fields.js';

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
          <div class="j-task-titlerow">
            <label class="j-done-toggle">
              <input type="checkbox" name="done" ${task.done ? 'checked' : ''}>
              <span class="j-box">${ICONS.check}</span>
              <span class="visually-hidden">Done</span>
            </label>
            <textarea class="j-title-input" name="title" rows="1" placeholder="Task" aria-label="Task title">${esc(task.title)}</textarea>
          </div>

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
          <div data-answers></div>
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
      const answersEl = el.querySelector('[data-answers]');
      // Tapped answers live here; typed ones are read from the inputs on save.
      let answers = { ...(entry.fields || {}) };
      const drawAnswers = () => {
        // keep anything typed before redrawing
        answersEl.querySelectorAll('.j-field-input').forEach(i => { answers[i.dataset.fid] = i.value; });
        answersEl.innerHTML = renderFieldInputs(M.logCat(form.cat.value), answers, 'd');
      };
      drawAnswers();
      answersEl.addEventListener('click', e => {
        const b = e.target.closest('[data-act=set-field]');
        if (b) { applyFieldClick(answers, b); drawAnswers(); }
      });
      form.cat.addEventListener('change', () => {
        el.querySelector('[data-spend]').hidden = !M.isSpendCat(form.cat.value);
        drawAnswers();
      });
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
        const fields = collectFields(M.logCat(form.cat.value), answersEl, answers);
        if (!spend && !form.text.value.trim() && !Object.keys(fields).length) { err.textContent = 'Write something, or delete the entry.'; return; }
        const next = { ...entry, date: form.date.value, time: form.time.value || '', cat: form.cat.value, text: form.text.value.trim(),
          amount, spendCat: spend ? form.spendCat.value : null };
        if (Object.keys(fields).length) next.fields = fields; else delete next.fields;
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

/* ---------- Settings: a list; each category has its own editor ---------- */

const saveConfig = async mutate => {
  const stored = M.clone(M.get('config')) || {};
  mutate(stored);
  await save('config', stored);
};

function swatchRow(current, includeHoliday) {
  const names = Object.keys(M.SWATCHES).concat(includeHoliday ? ['holiday'] : []);
  return `<div class="j-swatches" role="radiogroup" aria-label="Colour">${names.map(n => `
    <button type="button" role="radio" data-swatch="${n}" style="--c:${M.swatch(n)}" aria-label="${n === 'holiday' ? 'Holiday red' : n}" aria-checked="${n === current}"></button>`).join('')}</div>`;
}

export function openSettingsDialog() {
  return openDialog({
    label: 'Journal settings',
    render(el, close) {
      const draw = () => {
        const cfg = M.config();
        const row = (map, c) => `
          <li><button type="button" class="j-setitem" data-edit="${map}" data-id="${c.id}" ${c.color ? `style="--c:${M.swatch(c.color)}"` : ''}>
            ${c.color ? '<span class="j-ev-dot"></span>' : ''}
            <span class="j-setitem-main"><span class="j-setitem-name">${esc(c.name)}</span>
              ${map === 'logCats' ? `<span class="j-setitem-sub">${esc([c.prompt, ...fieldList(c).map(f => f.label)].filter(Boolean).join(' · ') || 'No prompt')}</span>` : ''}</span>
            <span class="j-chevron">${ICONS.next}</span>
          </button></li>`;
        el.querySelector('[data-list=logCats]').innerHTML = M.activeList(cfg.logCats).map(c => row('logCats', c)).join('');
        el.querySelector('[data-list=eventCats]').innerHTML = M.activeList(cfg.eventCats).map(c => row('eventCats', c)).join('');
        el.querySelector('[data-list=spendCats]').innerHTML = M.activeList(cfg.spendCats).map(c => row('spendCats', c)).join('');
        el.querySelector('[data-currency]').value = cfg.currency;
      };
      el.innerHTML = `
        <h2>Journal settings</h2>
        <p>Tap a category to edit it. Changes save straight away.</p>
        <h3>Log categories</h3>
        <ul class="j-setitems" data-list="logCats"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add="logCats">${ICONS.plus}Add log category</button>
        <h3>Event categories</h3>
        <ul class="j-setitems" data-list="eventCats"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add="eventCats">${ICONS.plus}Add event category</button>
        <h3>Spending categories</h3>
        <ul class="j-setitems" data-list="spendCats"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add="spendCats">${ICONS.plus}Add spending category</button>
        <h3>Currency</h3>
        <select class="input j-currency" data-currency aria-label="Currency">${M.CURRENCIES.map(c => `<option>${c}</option>`).join('')}</select>
        <h3>Backup &amp; reset</h3>
        <div class="j-reset-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-backup>Backup &amp; restore…</button>
          <button class="btn btn-ghost btn-sm" type="button" data-reset-cats>Reset categories to defaults</button>
          <button class="btn btn-ghost btn-sm j-danger" type="button" data-erase>Erase all journal data…</button>
        </div>
        <div class="dialog-actions"><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
      draw();
      el.addEventListener('click', async e => {
        const edit = e.target.closest('[data-edit]');
        const add = e.target.closest('[data-add]');
        if (edit || add) {
          const map = (edit || add).dataset.edit || (add && add.dataset.add);
          await openCategoryEditor(map, edit ? edit.dataset.id : null);
          draw();
        }
        if (e.target.closest('[data-close]')) close();
        if (e.target.closest('[data-backup]')) openBackupDialog();
        if (e.target.closest('[data-erase]')) { await openEraseDialog(); draw(); }
      });
      const resetBtn = el.querySelector('[data-reset-cats]');
      confirmButton(resetBtn, 'Tap again to reset categories', async () => {
        if (M.get('config')) await remove('config');
        draw();
        toast('Categories, prompts, questions and currency are back to the defaults. Your entries are untouched.');
      });
      el.querySelector('[data-currency]').addEventListener('change', async e => {
        const v = e.target.value;
        await saveConfig(c => { c.currency = v; });
        toast('Currency saved');
      });
    },
  });
}

/** Edit (or create) one category. map: logCats | eventCats | spendCats */
function openCategoryEditor(map, id) {
  const cfg = M.config();
  const isNew = !id;
  const cid = id || M.newId();
  const colors = Object.keys(M.SWATCHES);
  const cat = M.clone(cfg[map][cid]) || {
    name: '', order: Math.max(0, ...Object.values(cfg[map]).map(c => c.order ?? 0)) + 1,
    ...(map !== 'spendCats' ? { color: colors[Object.keys(cfg[map]).length % colors.length] } : {}),
    ...(map === 'logCats' ? { prompt: '', fields: {} } : {}),
  };
  delete cat.id;
  const fields = Object.entries(cat.fields || {}).map(([fid, f]) => ({ fid, ...f }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const kind = { logCats: 'log', eventCats: 'event', spendCats: 'spending' }[map];
  const builtIn = cat.spend || cat.dayoff;

  return openDialog({
    label: isNew ? `New ${kind} category` : `Edit ${cat.name}`,
    render(el, close) {
      const drawFields = () => {
        const box = el.querySelector('[data-fields]');
        if (!box) return;
        box.innerHTML = fields.map((f, i) => `
          <li class="j-qrow" data-i="${i}">
            <div class="j-qrow-top">
              <input class="input" data-q="label" value="${esc(f.label || '')}" placeholder="Question, e.g. Where to?" aria-label="Question" maxlength="60">
              <button class="icon-btn" type="button" data-qdel aria-label="Remove question">${ICONS.x}</button>
            </div>
            <div class="j-qrow-bottom">
              <select class="input" data-q="type" aria-label="Answer type">${Object.entries(FIELD_TYPES).map(([t, l]) => `<option value="${t}" ${t === f.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
              ${f.type === 'choice' ? `<input class="input" data-q="options" value="${esc((f.options || []).join(', '))}" placeholder="Options, separated by commas" aria-label="Options">` : ''}
            </div>
          </li>`).join('') || '<li class="j-empty">No extra questions. Entries just use the prompt.</li>';
      };
      el.innerHTML = `
        <h2>${isNew ? `New ${kind} category` : esc(cat.name)}</h2>
        <form novalidate>
          <label class="field"><span class="field-label">Name</span>
            <input class="input" name="name" value="${esc(cat.name)}" maxlength="30" ${isNew ? 'autofocus' : ''}></label>
          ${map !== 'spendCats' ? `<div class="field"><span class="field-label">Colour</span>${swatchRow(cat.color, map === 'eventCats')}</div>` : ''}
          ${map === 'logCats' ? `
            <label class="field"><span class="field-label">Prompt</span>
              <input class="input" name="prompt" value="${esc(cat.prompt || '')}" placeholder="e.g. What's on your mind?"></label>
            <h3>Extra questions</h3>
            <p>Asked every time you log in this category, alongside the prompt.</p>
            <ul class="j-qlist" data-fields></ul>
            <button class="btn btn-ghost btn-sm" type="button" data-qadd>${ICONS.plus}Add question</button>` : ''}
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            ${!isNew && !builtIn ? '<button class="btn btn-text j-danger" type="button" data-remove>Remove</button>' : ''}
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>`;
      drawFields();
      const form = el.querySelector('form');

      el.addEventListener('click', e => {
        const sw = e.target.closest('[data-swatch]');
        if (sw) {
          cat.color = sw.dataset.swatch;
          el.querySelectorAll('[data-swatch]').forEach(b => b.setAttribute('aria-checked', String(b === sw)));
        }
        if (e.target.closest('[data-qadd]')) {
          fields.push({ fid: M.newId(), label: '', type: 'text' });
          drawFields();
          el.querySelector('.j-qrow:last-child [data-q=label]')?.focus();
        }
        const del = e.target.closest('[data-qdel]');
        if (del) { fields.splice(Number(del.closest('[data-i]').dataset.i), 1); drawFields(); }
      });
      el.addEventListener('input', e => {
        const row = e.target.closest('[data-i]');
        if (!row) return;
        const f = fields[Number(row.dataset.i)];
        const k = e.target.dataset.q;
        if (k === 'label') f.label = e.target.value;
        if (k === 'options') f.options = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
      });
      el.addEventListener('change', e => {
        const row = e.target.closest('[data-i]');
        if (row && e.target.dataset.q === 'type') { fields[Number(row.dataset.i)].type = e.target.value; drawFields(); }
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      const rm = el.querySelector('[data-remove]');
      if (rm) confirmButton(rm, 'Tap again to remove', async () => {
        await saveConfig(c => { c[map] = { ...(c[map] || {}), [cid]: { ...(c[map] || {})[cid], ...cat, archived: true } }; });
        toast(`${cat.name} removed. Past entries keep it.`);
        close();
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = el.querySelector('.form-error');
        const name = form.name.value.trim();
        if (!name) { err.textContent = 'Give the category a name.'; return; }
        const bad = fields.find(f => f.type === 'choice' && f.label.trim() && !(f.options || []).length);
        if (bad) { err.textContent = `Add some options for "${bad.label}".`; return; }
        const next = { ...cat, name };
        if (map === 'logCats') {
          next.prompt = form.prompt.value.trim();
          next.fields = {};
          fields.filter(f => f.label.trim()).forEach((f, i) => {
            next.fields[f.fid] = { label: f.label.trim(), type: f.type, order: i + 1, ...(f.type === 'choice' ? { options: f.options } : {}) };
          });
        }
        delete next.archived;
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => saveConfig(c => { c[map] = { ...(c[map] || {}), [cid]: next }; }));
        close(true);
      });
    },
  });
}

/* ---------- Erase all journal data ---------- */

function openEraseDialog() {
  return openDialog({
    label: 'Erase all journal data',
    render(el, close) {
      el.innerHTML = `
        <h2>Erase all journal data</h2>
        <p>This deletes <strong>everything in the journal</strong>: log entries, tasks, events, budgets, habits and your categories. It happens on all your devices.</p>
        <p>Your only way back is a backup, so make one first if there's anything you might want.</p>
        <div class="dialog-actions" style="justify-content:flex-start;margin-top:4px">
          <button class="btn btn-ghost" type="button" data-backup>Make a backup first</button>
        </div>
        <label class="field"><span class="field-label">Type <strong>erase</strong> to confirm</span>
          <input class="input" name="confirm" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <div class="form-error" role="alert"></div>
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
          <button class="btn btn-primary j-erase-btn" type="button" data-go disabled>Erase everything</button>
        </div>`;
      const input = el.querySelector('[name=confirm]');
      const go = el.querySelector('[data-go]');
      input.addEventListener('input', () => { go.disabled = input.value.trim().toLowerCase() !== 'erase'; });
      el.querySelector('[data-backup]').addEventListener('click', () => openBackupDialog());
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      go.addEventListener('click', async () => {
        try {
          const n = await busy(go, 'Erasing…', () => eraseStore('journal', (i, t) => { go.lastChild.textContent = ` Erasing ${i} of ${t}…`; }));
          toast(`Erased ${n} ${n === 1 ? 'item' : 'items'}. The journal is fresh.`);
          close(true);
        } catch (err) {
          el.querySelector('.form-error').textContent = err.message || "Couldn't erase.";
        }
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
