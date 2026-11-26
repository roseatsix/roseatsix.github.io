/* Home inventory dialogs: item form, letting go, settings. */

import { openDialog, esc, toast, busy } from '../../assets/js/ui/dom.js';
import { openBackupDialog } from '../../assets/js/ui/backup.js';
import { eraseStore } from '../../assets/js/core/backup.js';
import * as M from './model.js';
import { ICONS } from './views.js';

let store = null;
export function useStore(s) { store = s; }

const save = (key, data) => store.put(key, data).catch(err => { toast("Couldn't save. " + (err.message || '')); throw err; });
const remove = key => store.remove(key).catch(err => { toast("Couldn't delete. " + (err.message || '')); throw err; });

function confirmButton(btn, label, fn) {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) return fn();
    btn.dataset.armed = '1';
    const old = btn.innerHTML;
    btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = old; }, 3000);
  });
}

/* ---------- quick actions ---------- */

export async function markUsed(id) {
  const i = M.clone(M.get('item:' + id));
  if (!i) return;
  i.lastUsed = M.today();
  await save('item:' + id, i);
  toast(`Marked ${i.name} as used today`);
}

export async function markReplaced(id) {
  const i = M.clone(M.get('item:' + id));
  if (!i) return;
  i.lastReplaced = M.today();
  if (i.condition === 'worn' || i.condition === 'broken') i.condition = 'good';
  await save('item:' + id, i);
  toast(`${i.name} replaced. Next time: ${M.fmt.long(M.addPeriod(i.lastReplaced, i.replace.every, i.replace.unit))}`);
}

export async function markKept(id) {
  const i = M.clone(M.get('item:' + id));
  if (!i) return;
  i.keptAt = M.today();
  await save('item:' + id, i);
  toast(`Keeping ${i.name}. It won't be suggested for 6 months.`);
}

export async function markBought(id) {
  const i = M.clone(M.get('item:' + id));
  if (!i) return;
  i.status = 'owned';
  i.acquired = M.today();
  i.lastReplaced = null;
  i.condition = i.condition || 'good';
  await save('item:' + id, i);
  toast(`${i.name} moved to your inventory`);
}

export async function restoreItem(id) {
  const i = M.clone(M.get('item:' + id));
  if (!i) return;
  i.status = 'owned';
  delete i.goneAt; delete i.goneHow;
  await save('item:' + id, i);
  toast(`${i.name} is back in your inventory`);
}

/* ---------- item form ---------- */

export function openItemDialog(id, defaults = {}) {
  const key = 'item:' + (id || M.newId());
  const existing = id ? M.get(key) : null;
  const cfg = M.config();
  const item = M.clone(existing) || {
    name: '', qty: 1, category: '', room: '', spot: '', status: 'owned',
    acquired: M.today(), replace: null, lastReplaced: null, price: null, notes: '', link: '',
    condition: 'good', lastUsed: null, sentimental: false, createdAt: Date.now(), ...defaults,
  };
  const wish = item.status === 'wish';
  const opt = (list, val, none) => `<option value="">${none}</option>` + list.map(c => `<option value="${c.id}" ${c.id === val ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const r = item.replace || { every: 1, unit: 'years' };

  return openDialog({
    label: existing ? item.name : (wish ? 'Add to wishlist' : 'Add an item'),
    render(el, close) {
      el.closest('dialog').classList.add('is-wide');
      const info = existing && !wish && item.status !== 'gone' ? (() => {
        const ri = M.replaceInfo(item);
        const bits = [];
        if (M.isDate(item.acquired)) bits.push(`In the house ${M.duration(item.acquired)}`);
        if (M.isDate(item.lastUsed)) bits.push(`last used ${M.duration(item.lastUsed)} ago`);
        if (ri) bits.push(M.dueText(ri));
        return `
          <p class="i-facts">${esc(bits.join(' · '))}</p>
          <div class="i-quick">
            <button class="btn btn-ghost btn-sm" type="button" data-quick="used">${ICONS.hand}Used it today</button>
            ${item.replace ? `<button class="btn btn-ghost btn-sm" type="button" data-quick="replaced">${ICONS.check}Replaced today</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" data-quick="letgo">Let go…</button>
          </div>`;
      })() : '';

      el.innerHTML = `
        <h2>${existing ? esc(item.name) : (wish ? 'Add to wishlist' : 'Add an item')}</h2>
        ${info}
        <form novalidate class="i-form">
          <label class="field"><span class="field-label">Name</span>
            <input class="input" name="name" value="${esc(item.name)}" required maxlength="80" placeholder="${wish ? 'e.g. Rattan floor lamp' : 'e.g. Kitchen scissors'}" ${existing ? '' : 'autofocus'}></label>

          <div class="i-grid">
            <label class="field"><span class="field-label">Quantity</span>
              <input class="input" name="qty" type="number" inputmode="numeric" min="1" step="1" value="${Number(item.qty) || 1}"></label>
            <label class="field"><span class="field-label">Category</span>
              <select class="input" name="category">${opt(M.activeList(cfg.categories), item.category, 'Choose…')}</select></label>
            <label class="field"><span class="field-label">${wish ? 'Room it will go in' : 'Room'}</span>
              <select class="input" name="room">${opt(M.activeList(cfg.rooms), item.room, 'Choose…')}</select></label>
            <label class="field"><span class="field-label">Spot</span>
              <input class="input" name="spot" value="${esc(item.spot || '')}" placeholder="e.g. top drawer" list="i-spots" maxlength="60"></label>
          </div>
          <datalist id="i-spots">${[...new Set(M.allItems().map(i => (i.spot || '').trim()).filter(Boolean))].sort().map(s => `<option value="${esc(s)}">`).join('')}</datalist>

          <div class="i-grid">
            <label class="field"><span class="field-label">Estimated price (${esc(cfg.currency)})${Number(item.qty) > 1 ? ', each' : ''}</span>
              <input class="input" name="price" inputmode="decimal" value="${item.price != null ? esc(M.plainNumber(item.price)) : ''}" autocomplete="off"></label>
            ${wish ? `<label class="field"><span class="field-label">Link (optional)</span>
              <input class="input" name="link" type="url" value="${esc(item.link || '')}" placeholder="https://…"></label>`
            : `<label class="field"><span class="field-label">In the house since</span>
              <input class="input" name="acquired" type="date" value="${esc(item.acquired || '')}"></label>`}
          </div>

          ${wish ? '' : `
          <div class="i-replace">
            <label class="check"><input type="checkbox" name="doReplace" ${item.replace ? 'checked' : ''}>
              <span>Replace periodically<small>For things that wear out, like scissors, sponges or filters.</small></span></label>
            <div class="i-every" ${item.replace ? '' : 'hidden'}>
              <span>Every</span>
              <input class="input" name="every" type="number" inputmode="numeric" min="1" step="1" value="${Number(r.every) || 1}" aria-label="How many">
              <select class="input" name="unit" aria-label="Unit">${Object.entries(M.UNITS).map(([u, [, many]]) => `<option value="${u}" ${u === r.unit ? 'selected' : ''}>${many}</option>`).join('')}</select>
            </div>
            <label class="field i-lastrep" ${item.replace ? '' : 'hidden'}><span class="field-label">Last replaced</span>
              <input class="input" name="lastReplaced" type="date" value="${esc(item.lastReplaced || item.acquired || '')}"></label>
          </div>

          <div class="field"><span class="field-label">Condition</span>
            <div class="j-chips i-cond" role="radiogroup" aria-label="Condition">
              ${Object.entries(M.CONDITIONS).map(([k, v]) => `<button type="button" role="radio" data-cond="${k}" aria-checked="${item.condition === k}">${v}</button>`).join('')}
            </div></div>
          <label class="check"><input type="checkbox" name="sentimental" ${item.sentimental ? 'checked' : ''}>
            <span>Sentimental<small>Never suggest letting this go.</small></span></label>`}

          <label class="field"><span class="field-label">Notes</span>
            <textarea class="input" name="notes" rows="3" placeholder="Model, size, where you bought it, warranty…">${esc(item.notes || '')}</textarea></label>

          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            ${existing ? '<button class="btn btn-text j-danger" type="button" data-delete>Delete</button>' : ''}
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">${existing ? 'Save' : (wish ? 'Add to wishlist' : 'Add item')}</button>
          </div>
        </form>`;

      const form = el.querySelector('form');
      let condition = item.condition || '';
      el.querySelector('.i-cond')?.addEventListener('click', e => {
        const b = e.target.closest('[data-cond]');
        if (!b) return;
        condition = condition === b.dataset.cond ? '' : b.dataset.cond;
        el.querySelectorAll('[data-cond]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.cond === condition)));
      });
      form.doReplace?.addEventListener('change', () => {
        el.querySelector('.i-every').hidden = !form.doReplace.checked;
        el.querySelector('.i-lastrep').hidden = !form.doReplace.checked;
      });
      form.acquired?.addEventListener('change', () => {
        if (!existing || !item.lastReplaced) form.lastReplaced.value = form.acquired.value;
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      const del = el.querySelector('[data-delete]');
      if (del) confirmButton(del, 'Tap again to delete', async () => { await remove(key); toast('Deleted'); close(); });

      el.querySelector('.i-quick')?.addEventListener('click', async e => {
        const b = e.target.closest('[data-quick]');
        if (!b) return;
        const id2 = key.slice(5);
        if (b.dataset.quick === 'used') { await markUsed(id2); close(); }
        if (b.dataset.quick === 'replaced') { await markReplaced(id2); close(); }
        if (b.dataset.quick === 'letgo') { close(); openLetGoDialog(id2); }
      });

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = el.querySelector('.form-error');
        const name = form.name.value.trim();
        if (!name) { err.textContent = 'Give it a name.'; form.name.focus(); return; }
        const next = { ...item, name, qty: Math.max(1, Math.round(Number(form.qty.value) || 1)),
          category: form.category.value, room: form.room.value, spot: form.spot.value.trim(),
          price: M.parseAmount(form.price.value), notes: form.notes.value.trim() };
        if (wish) {
          next.link = (form.link.value || '').trim();
        } else {
          next.acquired = M.isDate(form.acquired.value) ? form.acquired.value : (item.acquired || M.today());
          next.condition = condition;
          next.sentimental = form.sentimental.checked;
          if (form.doReplace.checked) {
            next.replace = { every: Math.max(1, Math.round(Number(form.every.value) || 1)), unit: form.unit.value };
            next.lastReplaced = M.isDate(form.lastReplaced.value) ? form.lastReplaced.value : null;
          } else {
            next.replace = null;
          }
        }
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => save(key, next));
        if (!existing) toast(wish ? 'Added to your wishlist' : `Added ${name}`);
        close(true);
      });
    },
  });
}

/* ---------- letting go ---------- */

export function openLetGoDialog(id) {
  const i = M.get('item:' + id);
  if (!i) return;
  return openDialog({
    label: `Let go of ${i.name}`,
    render(el, close) {
      el.innerHTML = `
        <h2>Let go of ${esc(i.name)}</h2>
        <p>How did it leave? It moves to "Already let go" in Declutter, where you can undo it.</p>
        <div class="i-how">${Object.entries(M.GONE_HOW).map(([k, v]) => `<button class="btn btn-ghost" type="button" data-how="${k}">${v}</button>`).join('')}</div>
        <div class="dialog-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button></div>`;
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('.i-how').addEventListener('click', async e => {
        const b = e.target.closest('[data-how]');
        if (!b) return;
        const next = { ...M.clone(i), status: 'gone', goneAt: M.today(), goneHow: b.dataset.how };
        await busy(b, 'Saving…', () => save('item:' + id, next));
        toast(`${i.name}: ${M.GONE_HOW[b.dataset.how].toLowerCase()}`);
        close(true);
      });
    },
  });
}

/* ---------- settings ---------- */

const saveConfig = async mutate => {
  const stored = M.clone(M.get('config')) || {};
  mutate(stored);
  await save('config', stored);
};

export function openSettingsDialog() {
  return openDialog({
    label: 'Inventory settings',
    render(el, close) {
      const section = map => M.activeList(M.config()[map]).map(c => `
        <li class="j-setrow" data-map="${map}" data-id="${c.id}">
          <input class="input" value="${esc(c.name)}" data-rename aria-label="Name" maxlength="40">
          <button class="icon-btn" type="button" data-remove aria-label="Remove ${esc(c.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button>
        </li>`).join('');
      const draw = () => {
        el.querySelector('[data-list=rooms]').innerHTML = section('rooms');
        el.querySelector('[data-list=categories]').innerHTML = section('categories');
        el.querySelector('[data-currency]').value = M.config().currency;
      };
      el.innerHTML = `
        <h2>Inventory settings</h2>
        <p>Names save when you leave the field. Removing one hides it from pickers; items keep it.</p>
        <h3>Rooms</h3>
        <ul class="j-setlist" data-list="rooms"></ul>
        <form class="j-habit-new" data-add="rooms"><input class="input" name="name" placeholder="Add a room, e.g. Balcony" maxlength="40"><button class="btn btn-ghost" type="submit">Add</button></form>
        <h3>Categories</h3>
        <ul class="j-setlist" data-list="categories"></ul>
        <form class="j-habit-new" data-add="categories"><input class="input" name="name" placeholder="Add a category, e.g. Plants" maxlength="40"><button class="btn btn-ghost" type="submit">Add</button></form>
        <h3>Currency</h3>
        <select class="input j-currency" data-currency aria-label="Currency">${M.CURRENCIES.map(c => `<option>${c}</option>`).join('')}</select>
        <h3>Backup &amp; reset</h3>
        <div class="j-reset-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-backup>Backup &amp; restore…</button>
          <button class="btn btn-ghost btn-sm" type="button" data-reset>Reset rooms &amp; categories</button>
          <button class="btn btn-ghost btn-sm j-danger" type="button" data-erase>Erase all inventory data…</button>
        </div>
        <div class="dialog-actions"><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
      draw();

      el.addEventListener('change', async e => {
        const row = e.target.closest('[data-map]');
        if (row && e.target.matches('[data-rename]')) {
          const name = e.target.value.trim();
          if (!name) { draw(); return; }
          const { map, id } = row.dataset;
          await saveConfig(c => { c[map] = { ...(c[map] || {}), [id]: { ...M.config()[map][id], name } }; delete c[map][id].id; });
        }
        if (e.target.matches('[data-currency]')) {
          const v = e.target.value;
          await saveConfig(c => { c.currency = v; });
          toast('Currency saved');
        }
      });
      el.addEventListener('click', async e => {
        const rm = e.target.closest('[data-remove]');
        if (rm) {
          const { map, id } = rm.closest('[data-map]').dataset;
          await saveConfig(c => { c[map] = { ...(c[map] || {}), [id]: { ...M.config()[map][id], archived: true } }; delete c[map][id].id; });
          draw();
        }
        if (e.target.closest('[data-close]')) close();
        if (e.target.closest('[data-backup]')) openBackupDialog();
        if (e.target.closest('[data-erase]')) openEraseDialog();
      });
      el.querySelectorAll('[data-add]').forEach(f => f.addEventListener('submit', async e => {
        e.preventDefault();
        const name = f.name.value.trim();
        if (!name) return;
        const map = f.dataset.add;
        const order = Math.max(0, ...Object.values(M.config()[map]).map(c => c.order ?? 0)) + 1;
        await saveConfig(c => { c[map] = { ...(c[map] || {}), [M.newId()]: { name, order } }; });
        f.reset();
        draw();
      }));
      confirmButton(el.querySelector('[data-reset]'), 'Tap again to reset', async () => {
        if (M.get('config')) await remove('config');
        draw();
        toast('Rooms, categories and currency are back to the defaults. Your items are untouched.');
      });
    },
  });
}

function openEraseDialog() {
  return openDialog({
    label: 'Erase all inventory data',
    render(el, close) {
      el.innerHTML = `
        <h2>Erase all inventory data</h2>
        <p>This deletes <strong>every item, wishlist entry and setting</strong> in the inventory, on all your devices. Your only way back is a backup.</p>
        <div class="dialog-actions" style="justify-content:flex-start;margin-top:4px">
          <button class="btn btn-ghost" type="button" data-backup>Make a backup first</button></div>
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
          const n = await busy(go, 'Erasing…', () => eraseStore('inventory'));
          toast(`Erased ${n} ${n === 1 ? 'entry' : 'entries'}.`);
          close(true);
        } catch (err) {
          el.querySelector('.form-error').textContent = err.message || "Couldn't erase.";
        }
      });
    },
  });
}
