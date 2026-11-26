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
              <select class="input" name="spotSel" data-spot-select></select></label>
          </div>
          <label class="field i-newspot" hidden><span class="field-label">New spot in this room</span>
            <input class="input" name="newSpot" placeholder="e.g. Top drawer" maxlength="60" autocomplete="off"></label>

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

      // Spot choices follow the selected room.
      const spotSel = form.spotSel;
      const newSpotRow = el.querySelector('.i-newspot');
      const fillSpots = keep => {
        const roomId = form.room.value;
        const spots = M.roomSpots(roomId);
        const typed = item.room === roomId && !item.spotId && item.spot ? item.spot : '';
        let cur = keep ?? spotSel.value;
        if (keep === undefined && !cur) cur = item.room === roomId ? (item.spotId || (typed ? '__text' : '')) : '';
        spotSel.innerHTML = `<option value="">${roomId ? (spots.length ? 'Choose…' : 'No spots yet') : 'Pick a room first'}</option>`
          + spots.map(sp => `<option value="${sp.id}">${esc(sp.name)}</option>`).join('')
          + (typed ? `<option value="__text">${esc(typed)} (not in the list)</option>` : '')
          + (roomId ? '<option value="__new">+ New spot…</option>' : '');
        spotSel.disabled = !roomId;
        spotSel.value = [...spotSel.options].some(o => o.value === cur) ? cur : '';
        newSpotRow.hidden = spotSel.value !== '__new';
      };
      fillSpots(undefined);
      form.room.addEventListener('change', () => fillSpots(''));
      spotSel.addEventListener('change', () => {
        newSpotRow.hidden = spotSel.value !== '__new';
        if (!newSpotRow.hidden) form.newSpot.focus();
      });
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
          category: form.category.value, room: form.room.value,
          price: M.parseAmount(form.price.value), notes: form.notes.value.trim() };
        // Spot: a predefined one, a new one (added to the room), or the old typed text.
        const sel = form.spotSel.value;
        if (!next.room || !sel) { next.spotId = null; next.spot = ''; }
        else if (sel === '__text') { next.spotId = null; }
        else if (sel === '__new') {
          const name = form.newSpot.value.trim();
          if (!name) { err.textContent = 'Type a name for the new spot.'; form.newSpot.focus(); return; }
          const existingSpot = M.roomSpots(next.room).find(sp => sp.name.toLowerCase() === name.toLowerCase());
          next.spotId = existingSpot ? existingSpot.id : await addSpot(next.room, name);
          next.spot = existingSpot ? existingSpot.name : name;
        } else {
          next.spotId = sel;
          next.spot = (M.roomSpots(next.room).find(sp => sp.id === sel) || {}).name || '';
        }
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

/** Add a spot to a room; returns its id. */
async function addSpot(roomId, name) {
  const sid = M.newId();
  const r = M.config().rooms[roomId];
  const order = Math.max(0, ...Object.values((r && r.spots) || {}).map(x => x.order ?? 0)) + 1;
  await saveConfig(c => {
    const cur = { ...M.config().rooms[roomId] };
    delete cur.id;
    c.rooms = { ...(c.rooms || {}), [roomId]: { ...cur, spots: { ...(cur.spots || {}), [sid]: { name, order } } } };
  });
  return sid;
}

const xIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

export function openSettingsDialog() {
  return openDialog({
    label: 'Inventory settings',
    render(el, close) {
      el.closest('dialog').classList.add('is-wide');
      const roomsHtml = () => M.activeList(M.config().rooms).map(r => `
        <li class="i-roomset" data-room="${r.id}">
          <div class="j-setrow">
            <input class="input i-roomname" value="${esc(r.name)}" data-rename-room aria-label="Room name" maxlength="40">
            <button class="icon-btn" type="button" data-remove-room aria-label="Remove ${esc(r.name)}">${xIcon}</button>
          </div>
          <ul class="i-spotset">${M.roomSpots(r.id).map(sp => `
            <li class="j-setrow" data-spot="${sp.id}">
              <input class="input" value="${esc(sp.name)}" data-rename-spot aria-label="Spot name" maxlength="60">
              <button class="icon-btn" type="button" data-remove-spot aria-label="Remove ${esc(sp.name)}">${xIcon}</button>
            </li>`).join('')}</ul>
          <form class="j-habit-new i-addspot" data-add-spot><input class="input" name="name" placeholder="Add a spot, e.g. Wardrobe" maxlength="60"><button class="btn btn-ghost" type="submit">Add</button></form>
        </li>`).join('');
      const catsHtml = () => M.activeList(M.config().categories).map(c => `
        <li class="j-setrow" data-cat="${c.id}">
          <input class="input" value="${esc(c.name)}" data-rename-cat aria-label="Category name" maxlength="40">
          <button class="icon-btn" type="button" data-remove-cat aria-label="Remove ${esc(c.name)}">${xIcon}</button>
        </li>`).join('');
      const draw = () => {
        el.querySelector('[data-list=rooms]').innerHTML = roomsHtml();
        el.querySelector('[data-list=categories]').innerHTML = catsHtml();
        el.querySelector('[data-currency]').value = M.config().currency;
      };
      el.innerHTML = `
        <h2>Inventory settings</h2>
        <p>Names save when you leave the field. Removing a room, spot or category hides it from pickers; items keep it.</p>
        <h3>Rooms &amp; spots</h3>
        <ul class="i-roomsets" data-list="rooms"></ul>
        <form class="j-habit-new" data-add-room><input class="input" name="name" placeholder="Add a room, e.g. Balcony" maxlength="40"><button class="btn btn-ghost" type="submit">Add room</button></form>
        <h3>Categories</h3>
        <ul class="j-setlist" data-list="categories"></ul>
        <form class="j-habit-new" data-add-cat><input class="input" name="name" placeholder="Add a category, e.g. Plants" maxlength="40"><button class="btn btn-ghost" type="submit">Add</button></form>
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

      const roomOf = elx => elx.closest('[data-room]')?.dataset.room;
      const setRoom = (rid, mutateRoom) => saveConfig(c => {
        const cur = { ...M.config().rooms[rid] };
        delete cur.id;
        mutateRoom(cur);
        c.rooms = { ...(c.rooms || {}), [rid]: cur };
      });
      const setCat = (cid, mutateCat) => saveConfig(c => {
        const cur = { ...M.config().categories[cid] };
        delete cur.id;
        mutateCat(cur);
        c.categories = { ...(c.categories || {}), [cid]: cur };
      });

      el.addEventListener('change', async e => {
        const t = e.target;
        const name = (t.value || '').trim();
        if (t.matches('[data-rename-room]')) { if (name) await setRoom(roomOf(t), r => { r.name = name; }); else draw(); }
        if (t.matches('[data-rename-spot]')) {
          const sid = t.closest('[data-spot]').dataset.spot;
          if (name) await setRoom(roomOf(t), r => { r.spots = { ...(r.spots || {}), [sid]: { ...(r.spots || {})[sid], name } }; }); else draw();
        }
        if (t.matches('[data-rename-cat]')) { if (name) await setCat(t.closest('[data-cat]').dataset.cat, c => { c.name = name; }); else draw(); }
        if (t.matches('[data-currency]')) { await saveConfig(c => { c.currency = t.value; }); toast('Currency saved'); }
      });

      el.addEventListener('click', async e => {
        const t = e.target;
        if (t.closest('[data-remove-room]')) { await setRoom(roomOf(t), r => { r.archived = true; }); draw(); }
        if (t.closest('[data-remove-spot]')) {
          const sid = t.closest('[data-spot]').dataset.spot;
          await setRoom(roomOf(t), r => { r.spots = { ...(r.spots || {}), [sid]: { ...(r.spots || {})[sid], archived: true } }; });
          draw();
        }
        if (t.closest('[data-remove-cat]')) { await setCat(t.closest('[data-cat]').dataset.cat, c => { c.archived = true; }); draw(); }
        if (t.closest('[data-close]')) close();
        if (t.closest('[data-backup]')) openBackupDialog();
        if (t.closest('[data-erase]')) openEraseDialog();
      });

      el.addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        const name = (f.name.value || '').trim();
        if (!name) return;
        if (f.matches('[data-add-spot]')) await addSpot(roomOf(f), name);
        if (f.matches('[data-add-room]')) {
          const order = Math.max(0, ...Object.values(M.config().rooms).map(c => c.order ?? 0)) + 1;
          await saveConfig(c => { c.rooms = { ...(c.rooms || {}), [M.newId()]: { name, order } }; });
        }
        if (f.matches('[data-add-cat]')) {
          const order = Math.max(0, ...Object.values(M.config().categories).map(c => c.order ?? 0)) + 1;
          await saveConfig(c => { c.categories = { ...(c.categories || {}), [M.newId()]: { name, order } }; });
        }
        const focusKey = f.matches('[data-add-spot]') ? roomOf(f) : null;
        draw();
        if (focusKey) el.querySelector(`[data-room="${focusKey}"] [data-add-spot] input`)?.focus();
      });

      confirmButton(el.querySelector('[data-reset]'), 'Tap again to reset', async () => {
        if (M.get('config')) await remove('config');
        draw();
        toast('Rooms, spots, categories and currency are back to the defaults. Your items are untouched.');
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
