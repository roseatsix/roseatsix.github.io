/* Home inventory dialogs: item form, letting go, settings. */

import { openDialog, esc, toast, busy } from '../../assets/js/ui/dom.js';
import { openBackupDialog } from '../../assets/js/ui/backup.js';
import { navRows, openNameEditor, PLUS, plural } from '../../assets/js/ui/name-list.js';
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
        const xi = M.expiryInfo(item);
        const bits = [];
        if (M.isDate(item.acquired)) bits.push(`In the house ${M.duration(item.acquired)}`);
        if (M.isDate(item.lastUsed)) bits.push(`last used ${M.duration(item.lastUsed)} ago`);
        if (ri) bits.push(M.dueText(ri));
        if (xi) bits.push(M.expiryText(xi));
        return `
          <p class="i-facts">${esc(bits.join(' · '))}</p>
          <div class="quick-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-quick="used">${ICONS.hand}Used it today</button>
            ${item.replace ? `<button class="btn btn-ghost btn-sm" type="button" data-quick="replaced">${ICONS.check}Replaced today</button>` : ''}
            ${item.afterOpen && !item.opened ? `<button class="btn btn-ghost btn-sm" type="button" data-quick="opened">Opened today</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" data-quick="letgo">Let go…</button>
          </div>`;
      })() : '';

      el.innerHTML = `
        <h2>${existing ? esc(item.name) : (wish ? 'Add to wishlist' : 'Add an item')}</h2>
        ${info}
        <form novalidate class="entry-form">
          <label class="field"><span class="field-label">Name</span>
            <input class="input" name="name" value="${esc(item.name)}" required maxlength="80" placeholder="${wish ? 'e.g. Rattan floor lamp' : 'e.g. Kitchen scissors'}" ${existing ? '' : 'autofocus'}></label>

          <div class="field-grid">
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

          <div class="field-grid">
            <label class="field"><span class="field-label">Estimated price (${esc(cfg.currency)})${Number(item.qty) > 1 ? ', each' : ''}</span>
              <input class="input" name="price" inputmode="decimal" value="${item.price != null ? esc(M.plainNumber(item.price)) : ''}" autocomplete="off"></label>
            ${wish ? `<label class="field"><span class="field-label">Link (optional)</span>
              <input class="input" name="link" type="url" value="${esc(item.link || '')}" placeholder="https://…"></label>`
            : `<label class="field"><span class="field-label">In the house since</span>
              <input class="input" name="acquired" type="date" value="${esc(item.acquired || '')}"></label>`}
          </div>

          ${wish ? '' : `
          <div class="option-box">
            <label class="check"><input type="checkbox" name="doReplace" ${item.replace ? 'checked' : ''}>
              <span>Replace periodically<small>For things that wear out, like scissors, sponges or filters.</small></span></label>
            <div class="every-row" ${item.replace ? '' : 'hidden'}>
              <span>Every</span>
              <input class="input" name="every" type="number" inputmode="numeric" min="1" step="1" value="${Number(r.every) || 1}" aria-label="How many">
              <select class="input" name="unit" aria-label="Unit">${Object.entries(M.UNITS).map(([u, [, many]]) => `<option value="${u}" ${u === r.unit ? 'selected' : ''}>${many}</option>`).join('')}</select>
            </div>
            <label class="field i-lastrep" ${item.replace ? '' : 'hidden'}><span class="field-label">Last replaced</span>
              <input class="input" name="lastReplaced" type="date" value="${esc(item.lastReplaced || item.acquired || '')}"></label>
          </div>

          <div class="option-box i-expiry">
            <label class="check"><input type="checkbox" name="doExpiry" ${item.expires || item.afterOpen ? 'checked' : ''}>
              <span>Track expiry<small>For medicine, food, skincare and anything that goes off.</small></span></label>
            <div data-expiry ${item.expires || item.afterOpen ? '' : 'hidden'}>
              <div class="field-grid">
                <label class="field"><span class="field-label">Expiry date</span>
                  <input class="input" name="expires" type="date" value="${esc(item.expires || '')}"></label>
                <label class="field"><span class="field-label">Opened on</span>
                  <input class="input" name="opened" type="date" value="${esc(item.opened || '')}"></label>
              </div>
              <div class="every-row">
                <span>Use within</span>
                <input class="input" name="aoEvery" type="number" inputmode="numeric" min="1" step="1" value="${item.afterOpen ? Number(item.afterOpen.every) : ''}" placeholder="–" aria-label="How long after opening">
                <select class="input" name="aoUnit" aria-label="Unit">${Object.entries(M.UNITS).map(([u, [, many]]) => `<option value="${u}" ${u === ((item.afterOpen && item.afterOpen.unit) || 'months') ? 'selected' : ''}>${many}</option>`).join('')}</select>
              </div>
              <p class="hint">after opening. Fill in either or both; the earlier date counts. Skincare often says 6M or 12M on the jar.</p>
            </div>
          </div>

          <div class="field"><span class="field-label">Condition</span>
            <div class="choice-chips i-cond" role="radiogroup" aria-label="Condition">
              ${Object.entries(M.CONDITIONS).map(([k, v]) => `<button type="button" role="radio" data-cond="${k}" aria-checked="${item.condition === k}">${v}</button>`).join('')}
            </div></div>
          <label class="check"><input type="checkbox" name="sentimental" ${item.sentimental ? 'checked' : ''}>
            <span>Sentimental<small>Never suggest letting this go.</small></span></label>`}

          <label class="field"><span class="field-label">Notes</span>
            <textarea class="input" name="notes" rows="3" placeholder="Model, size, where you bought it, warranty…">${esc(item.notes || '')}</textarea></label>

          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            ${existing ? '<button class="btn btn-text danger-text" type="button" data-delete>Delete</button>' : ''}
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
      form.doExpiry?.addEventListener('change', () => { el.querySelector('[data-expiry]').hidden = !form.doExpiry.checked; });
      form.doReplace?.addEventListener('change', () => {
        el.querySelector('.every-row').hidden = !form.doReplace.checked;
        el.querySelector('.i-lastrep').hidden = !form.doReplace.checked;
      });
      form.acquired?.addEventListener('change', () => {
        if (!existing || !item.lastReplaced) form.lastReplaced.value = form.acquired.value;
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      const del = el.querySelector('[data-delete]');
      if (del) confirmButton(del, 'Tap again to delete', async () => { await remove(key); toast('Deleted'); close(); });

      el.querySelector('.quick-actions')?.addEventListener('click', async e => {
        const b = e.target.closest('[data-quick]');
        if (!b) return;
        const id2 = key.slice(5);
        if (b.dataset.quick === 'used') { await markUsed(id2); close(); }
        if (b.dataset.quick === 'replaced') { await markReplaced(id2); close(); }
        if (b.dataset.quick === 'opened') {
          const cur = M.clone(M.get(key));
          cur.opened = M.today();
          await save(key, cur);
          toast(`Opened today. Use within ${M.periodText(cur.afterOpen).replace('every ', '')}.`);
          close();
        }
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
          if (form.doExpiry.checked) {
            const ao = Math.round(Number(form.aoEvery.value) || 0);
            next.expires = M.isDate(form.expires.value) ? form.expires.value : null;
            next.afterOpen = ao > 0 ? { every: ao, unit: form.aoUnit.value } : null;
            next.opened = M.isDate(form.opened.value) ? form.opened.value : null;
            if (!next.expires && !next.afterOpen) { err.textContent = 'Add an expiry date, or how long it lasts after opening.'; return; }
          } else {
            next.expires = null; next.afterOpen = null; next.opened = null;
          }
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

/* ---------- a fresh one of something that expires ---------- */

export function openRenewDialog(id) {
  const i = M.get('item:' + id);
  if (!i) return;
  return openDialog({
    label: `New ${i.name}`,
    render(el, close) {
      el.innerHTML = `
        <h2>New ${esc(i.name)}</h2>
        <p>Got a fresh one? Update its dates. Or, if it's simply finished, let it go instead.</p>
        <form novalidate>
          <div class="field-grid">
            ${i.expires || !i.afterOpen ? `<label class="field"><span class="field-label">New expiry date</span><input class="input" type="date" name="expires"></label>` : ''}
            ${i.afterOpen ? `<label class="field"><span class="field-label">Opened on</span><input class="input" type="date" name="opened" value=""></label>` : ''}
          </div>
          ${i.afterOpen ? '<p class="hint">Leave "Opened on" empty if it\'s still sealed.</p>' : ''}
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            <button class="btn btn-text" type="button" data-letgo>It's finished, let it go</button>
            <span class="spacer"></span>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>`;
      const form = el.querySelector('form');
      el.querySelector('[data-letgo]').addEventListener('click', () => { close(); openLetGoDialog(id); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const next = M.clone(i);
        if (form.expires) {
          if (!M.isDate(form.expires.value) && !i.afterOpen) { el.querySelector('.form-error').textContent = 'Pick the new expiry date.'; return; }
          next.expires = M.isDate(form.expires.value) ? form.expires.value : null;
        }
        if (form.opened) next.opened = M.isDate(form.opened.value) ? form.opened.value : null;
        next.condition = 'good';
        next.acquired = M.today();
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => save('item:' + id, next));
        toast(`Updated ${i.name}`);
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

const nextOrder = map => Math.max(0, ...Object.values(map || {}).map(c => c.order ?? 0)) + 1;
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

export function openSettingsDialog() {
  return openDialog({
    label: 'Inventory settings',
    render(el, close) {
      const draw = () => {
        const items = M.owned();
        const rooms = M.activeList(M.config().rooms).map(r => {
          const spots = M.roomSpots(r.id).map(sp => sp.name);
          const n = items.filter(i => i.room === r.id).length;
          return { id: r.id, name: r.name, sub: [spots.length ? spots.join(', ') : 'No spots yet', n ? plural(n, 'item') : ''].filter(Boolean).join(' · ') };
        });
        const cats = M.activeList(M.config().categories).map(c => {
          const n = items.filter(i => i.category === c.id).length;
          return { id: c.id, name: c.name, sub: n ? plural(n, 'item') : '' };
        });
        el.querySelector('[data-list=rooms]').innerHTML = navRows(rooms, 'data-room');
        el.querySelector('[data-list=categories]').innerHTML = navRows(cats, 'data-cat');
        el.querySelector('[data-currency]').value = M.config().currency;
      };
      el.innerHTML = `
        <h2>Inventory settings</h2>
        <p>Tap a room or category to rename it, change its spots or remove it.</p>
        <h3>Rooms &amp; spots</h3>
        <ul class="nav-list" data-list="rooms"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add-room>${PLUS}Add room</button>
        <h3>Categories</h3>
        <ul class="nav-list" data-list="categories"></ul>
        <button class="btn btn-ghost btn-sm" type="button" data-add-cat>${PLUS}Add category</button>
        <h3>Currency</h3>
        <select class="input currency-select" data-currency aria-label="Currency">${M.CURRENCIES.map(c => `<option>${c}</option>`).join('')}</select>
        <h3>Backup &amp; reset</h3>
        <div class="button-row">
          <button class="btn btn-ghost btn-sm" type="button" data-backup>Backup &amp; restore…</button>
          <button class="btn btn-ghost btn-sm" type="button" data-reset>Reset rooms &amp; categories</button>
          <button class="btn btn-ghost btn-sm danger-text" type="button" data-erase>Erase all inventory data…</button>
        </div>
        <div class="dialog-actions"><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
      draw();

      el.addEventListener('change', async e => {
        if (e.target.matches('[data-currency]')) { const v = e.target.value; await saveConfig(c => { c.currency = v; }); toast('Currency saved'); }
      });

      el.addEventListener('click', async e => {
        const t = e.target;
        const roomBtn = t.closest('[data-room]');
        const catBtn = t.closest('[data-cat]');
        if (roomBtn) { await openRoomEditor(roomBtn.dataset.room); draw(); }
        if (t.closest('[data-add-room]')) { await openRoomEditor(null); draw(); }
        if (catBtn) {
          const c = M.config().categories[catBtn.dataset.cat];
          const res = await openNameEditor({ title: 'Edit category', value: c.name, removable: true, note: 'Removing a category hides it from pickers. Items keep it.' });
          if (res?.remove) await setCat(c.id, x => { x.archived = true; });
          else if (res?.name) await setCat(c.id, x => { x.name = res.name; });
          draw();
        }
        if (t.closest('[data-add-cat]')) {
          const res = await openNameEditor({ title: 'Add a category', placeholder: 'e.g. Plants' });
          if (res?.name) await saveConfig(c => { c.categories = { ...(c.categories || {}), [M.newId()]: { name: res.name, order: nextOrder(M.config().categories) } }; });
          draw();
        }
        if (t.closest('[data-close]')) close();
        if (t.closest('[data-backup]')) openBackupDialog();
        if (t.closest('[data-erase]')) openEraseDialog();
      });

      confirmButton(el.querySelector('[data-reset]'), 'Tap again to reset', async () => {
        if (M.get('config')) await remove('config');
        draw();
        toast('Rooms, spots, categories and currency are back to the defaults. Your items are untouched.');
      });
    },
  });
}

/** Edit (or add) one room and its spots. Nothing is saved until Save. */
function openRoomEditor(roomId) {
  const isNew = !roomId;
  const r = isNew ? { name: '', spots: {} } : M.config().rooms[roomId];
  const spots = isNew ? [] : M.roomSpots(roomId).map(sp => ({ id: sp.id, name: sp.name, order: sp.order }));
  const removed = new Set();
  return openDialog({
    label: isNew ? 'Add a room' : `Edit ${r.name}`,
    render(el, close) {
      const spotRows = () => spots.filter(sp => !removed.has(sp.id)).map(sp => `
        <li class="setting-row" data-spot="${sp.id}">
          <input class="input" value="${esc(sp.name)}" data-spot-name aria-label="Spot name" maxlength="60">
          <button class="icon-btn" type="button" data-remove-spot aria-label="Remove ${esc(sp.name)}">${xIcon}</button>
        </li>`).join('') || '<li class="hint">No spots yet.</li>';
      el.innerHTML = `
        <h2>${isNew ? 'Add a room' : 'Edit room'}</h2>
        <form data-form>
          <label class="field"><span class="field-label">Room name</span>
            <input class="input" name="name" value="${esc(r.name)}" placeholder="e.g. Balcony" maxlength="40" autocomplete="off" required ${isNew ? 'autofocus' : ''}></label>
          <h3>Spots</h3>
          <p class="hint" style="margin:-4px 0 10px">Places inside this room where things live, like a wardrobe or a drawer.</p>
          <ul class="setting-list" data-spots>${spotRows()}</ul>
          <div class="add-row"><input class="input" data-new-spot placeholder="Add a spot, e.g. Wardrobe" maxlength="60" enterkeyhint="done"><button class="btn btn-ghost" type="button" data-add-spot>Add</button></div>
          <div class="dialog-actions">
            ${isNew ? '' : '<button class="btn btn-text danger-text" type="button" data-remove-room>Remove room</button><span class="spacer"></span>'}
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>`;
      const list = el.querySelector('[data-spots]');
      const newSpot = el.querySelector('[data-new-spot]');
      const addSpotRow = () => {
        const name = newSpot.value.trim();
        if (!name) return;
        spots.push({ id: M.newId(), name, order: Math.max(0, ...spots.map(x => x.order ?? 0)) + 1, isNew: true });
        newSpot.value = '';
        list.innerHTML = spotRows();
        newSpot.focus();
      };
      el.querySelector('[data-add-spot]').addEventListener('click', addSpotRow);
      newSpot.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSpotRow(); } });
      list.addEventListener('input', e => {
        const row = e.target.closest('[data-spot]');
        if (row) spots.find(x => x.id === row.dataset.spot).name = e.target.value;
      });
      list.addEventListener('click', e => {
        const row = e.target.closest('[data-remove-spot]')?.closest('[data-spot]');
        if (row) { removed.add(row.dataset.spot); list.innerHTML = spotRows(); }
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-remove-room]')?.addEventListener('click', async () => {
        await setRoom(roomId, x => { x.archived = true; });
        toast(`${r.name} removed. Items in it keep their place.`);
        close(true);
      });
      el.querySelector('[data-form]').addEventListener('submit', async e => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (!name) return;
        if (newSpot.value.trim()) addSpotRow();
        const rid = roomId || M.newId();
        await saveConfig(c => {
          const cur = { ...(M.config().rooms[rid] || { order: nextOrder(M.config().rooms) }) };
          delete cur.id;
          cur.name = name;
          const next = { ...(cur.spots || {}) };
          for (const sp of spots) {
            const nm = sp.name.trim();
            if (removed.has(sp.id)) { if (next[sp.id]) next[sp.id] = { ...next[sp.id], archived: true }; continue; }
            next[sp.id] = { ...(next[sp.id] || {}), name: nm || (next[sp.id] && next[sp.id].name) || 'Spot', order: sp.order };
          }
          cur.spots = next;
          c.rooms = { ...(c.rooms || {}), [rid]: cur };
        });
        close(true);
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
          <button class="btn btn-primary erase-btn" type="button" data-go disabled>Erase everything</button>
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
