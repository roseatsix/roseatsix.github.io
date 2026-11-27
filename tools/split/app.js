/* Bill splitter: splits with many receipts, settle up, share a picture. */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { openDialog, esc, toast, busy, copyText } from '../../assets/js/ui/dom.js';
import { openBackupDialog } from '../../assets/js/ui/backup.js';
import * as M from './model.js';
import * as J from '../journal/model.js';
import { summaryText, summaryImage, shareImage } from './share.js';

const main = document.getElementById('split');
const store = openStore('splits');
const journal = openStore('journal');
journal.subscribe(list => J.setItems(list));
const ui = { loaded: false, trip: null };

const ICON = {
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.5z"/><path d="M9 8h6M9 11.5h6M9 15h3"/></svg>',
};

const save = (key, data) => store.put(key, data).catch(err => { toast("Couldn't save. " + (err.message || '')); throw err; });
const tripKey = id => 'trip:' + id;
const getTrip = id => { const t = M.get(tripKey(id)); return t ? { id, ...t } : null; };
const strip = t => { const { id, ...rest } = t; return rest; };
async function updateTrip(id, mutate) {
  const t = M.clone(M.get(tripKey(id)));
  if (!t) return;
  mutate(t);
  await save(tripKey(id), t);
}

/* ---------- routing ---------- */

function onRoute() {
  const [, kind, id] = (location.hash || '').split('/');
  ui.trip = kind === 't' && id && M.get(tripKey(id)) ? id : null;
  render();
  window.scrollTo({ top: 0 });
}

/* ---------- views ---------- */

function gate(st) {
  const copy = {
    signedOut: ['Your splits are private', 'Sign in with Google to start. Everything is encrypted on your device before it syncs.', 'Sign in'],
    unconfigured: ["Sync isn't set up", 'Sign-in needs to be connected first.', null],
    needsSetup: ['Set up your vault', 'Choose a passphrase to encrypt your data.', 'Set up vault'],
    locked: ['Unlock your splits', 'Enter your passphrase to open them on this device.', 'Unlock'],
    denied: ["Can't open your data", 'The database refused access for this account.', null],
    error: ['Something went wrong', st.error || '', 'Try again'],
  }[st.status];
  if (!copy) return '<div class="gate"><span class="spinner" aria-hidden="true"></span><p>Opening…</p></div>';
  return `<div class="gate"><svg class="gate-blossom" aria-hidden="true"><use href="#blossom"/></svg><h1>${esc(copy[0])}</h1><p>${esc(copy[1])}</p>
    ${copy[2] ? `<button class="btn btn-primary" type="button" data-act="gate">${esc(copy[2])}</button>` : ''}</div>`;
}

function render() {
  // Inside a split, its own header (back, title) takes the toolbar's place.
  document.querySelector('.toolbar').hidden = ui.loaded && !!ui.trip;
  if (!ui.loaded) { main.innerHTML = gate(S.getState()); return; }
  main.innerHTML = ui.trip ? tripView(getTrip(ui.trip)) : listView();
}

function listView() {
  const list = M.trips();
  if (!list.length) {
    return `<section class="view"><div class="panel empty-panel">
      <h2>No splits yet</h2>
      <p>Make one for a trip, a dinner or a shared flat. Add receipts from as many places as you like, say who paid and who shared what, and at the end everyone pays once.</p>
      <button class="btn btn-primary" type="button" data-act="new-trip">${ICON.plus}New split</button></div></section>`;
  }
  return `<section class="view"><ul class="sp-trips">${list.map(t => {
    const c = M.tripCalc(t);
    const status = !c.receipts.length ? 'No receipts yet' : c.settled ? 'Settled' : c.transfers.length ? `${c.transfers.length - c.done} to settle` : 'All square';
    return `<li><a class="panel sp-trip ${c.settled ? 'is-settled' : ''}" href="#/t/${t.id}">
      <span class="sp-trip-main"><span class="sp-trip-title">${esc(t.title || 'Untitled split')}</span>
        <span class="meta"><span>${esc(M.dateRange(t))}</span><span>${M.peopleOf(t).length} people</span><span>${c.receipts.length} receipts</span></span></span>
      <span class="row-end"><span class="amount">${esc(M.money(c.total))}</span><span class="sp-status ${c.settled ? 'is-done' : ''}">${esc(status)}</span></span>
    </a></li>`;
  }).join('')}</ul></section>`;
}

function chip(t, pid, on, attrs = '') {
  return `<button type="button" class="sp-chip" aria-pressed="${on}" ${attrs}>${esc(M.nameOf(t, pid))}</button>`;
}

function tripView(t) {
  const c = M.tripCalc(t);
  const people = M.peopleOf(t);
  const me = M.meOf(t);
  return `
    <section class="view sp-detail">
      <div class="sp-top">
        <a class="icon-btn" href="#/" aria-label="All splits">${ICON.back}</a>
        <button type="button" class="sp-titlebtn" data-act="edit-trip"><span class="sp-h1">${esc(t.title || 'Untitled split')}</span>
          <span class="meta"><span>${esc(M.dateRange(t) || 'No date yet')}</span><span>Total ${esc(M.money(c.total))}</span></span></button>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>People</h2><span class="count">${people.length}</span></div>
        <div class="sp-people">
          ${people.map(p => `<button type="button" class="sp-person" data-act="edit-person" data-id="${p.id}">${esc(p.name)}${p.me ? ' <small>(me)</small>' : ''}</button>`).join('')}
          <form class="sp-addperson" data-form="add-person">
            <input class="input" name="name" placeholder="Add a person" list="sp-names" maxlength="30" autocomplete="off" aria-label="Add a person">
            <button class="icon-btn" type="submit" aria-label="Add">${ICON.plus}</button>
          </form>
          <datalist id="sp-names">${M.knownNames().filter(n => !people.some(p => p.name.toLowerCase() === n.toLowerCase())).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        </div>
      </section>

      <section class="panel tone-flower">
        <div class="panel-head"><h2>Receipts</h2><span class="count">${c.receipts.length}</span></div>
        ${c.receipts.length ? `<ul class="sp-receipts">${c.receipts.map(({ r, c: rc }) => `
          <li><button type="button" class="sp-receipt" data-act="edit-receipt" data-id="${r.id}">
            <span class="sp-ricon">${ICON.receipt}</span>
            <span class="sp-trip-main"><span class="row-name">${esc(r.shop || 'Receipt')}</span>
              <span class="meta"><span>paid by ${esc(M.nameOf(t, r.paidBy))}</span>${M.isDate(r.date) ? `<span>${esc(M.fmt.short(r.date))}</span>` : ''}<span>${(r.mode || 'even') === 'items' ? `${M.itemsOf(r).length} items` : 'split evenly'}</span></span></span>
            <span class="amount">${esc(M.money(rc.total))}</span>
          </button></li>`).join('')}</ul>` : '<p class="empty">Add each bill: a restaurant, a taxi, groceries, tickets…</p>'}
        <button class="btn btn-ghost btn-sm sp-addreceipt" type="button" data-act="new-receipt" ${people.length < 2 ? 'disabled title="Add people first"' : ''}>${ICON.plus}Add receipt</button>
        ${people.length < 2 ? '<p class="empty">Add at least one more person first.</p>' : ''}
      </section>

      ${c.receipts.length ? `
      <section class="panel tone-leaf">
        <div class="panel-head"><h2>Each person</h2></div>
        <ul class="sp-balances">${people.map(p => {
          const n = c.net[p.id];
          return `<li><span class="row-name">${esc(p.name)}${p.me ? ' <small>(me)</small>' : ''}</span>
            <span class="sp-bal"><span>share <strong>${esc(M.money(c.owed[p.id]))}</strong></span><span>paid ${esc(M.money(c.paid[p.id]))}</span></span>
            <span class="sp-net ${n > 0 ? 'is-plus' : n < 0 ? 'is-minus' : ''}">${n > 0 ? 'gets ' + esc(M.money(n)) : n < 0 ? 'owes ' + esc(M.money(-n)) : 'square'}</span></li>`;
        }).join('')}</ul>
      </section>

      <section class="panel tone-sun">
        <div class="panel-head"><h2>Settle up</h2><span class="count">${c.transfers.length ? `${c.done} of ${c.transfers.length} paid` : ''}</span></div>
        ${c.transfers.length ? `<ul class="sp-transfers">${c.transfers.map(x => `
          <li class="${x.done ? 'is-done' : ''}">
            <label class="tick"><input type="checkbox" data-act="toggle-paid" data-key="${x.key}" data-amount="${x.amount}" ${x.done ? 'checked' : ''} aria-label="Paid"><span class="tick-box">${ICON.check}</span></label>
            <span class="sp-who"><strong>${esc(M.nameOf(t, x.from))}</strong> pays <strong>${esc(M.nameOf(t, x.to))}</strong></span>
            <span class="amount">${esc(M.money(x.amount))}</span>
          </li>`).join('')}</ul>` : '<p class="empty">Everyone is square.</p>'}
        <div class="sp-share">
          <button class="btn btn-primary" type="button" data-act="share">${ICON.share}Share…</button>
          ${me && c.owed[me.id] > 0 ? `<button class="btn btn-ghost" type="button" data-act="log-share">${t.loggedShare ? `Logged ${esc(M.fmt.short(t.loggedShare))}` : 'Log my share to journal'}</button>` : ''}
        </div>
      </section>` : ''}

      <div class="sp-danger"><button class="btn btn-text danger-text" type="button" data-act="delete-trip">Delete this split</button></div>
    </section>`;
}

/* ---------- dialogs ---------- */

function openTripDialog(id) {
  const t = id ? getTrip(id) : null;
  return openDialog({
    label: t ? 'Rename split' : 'New split',
    render(el, close) {
      el.innerHTML = `
        <h2>${t ? 'Edit split' : 'New split'}</h2>
        <form novalidate>
          <label class="field"><span class="field-label">Name</span><input class="input" name="title" value="${esc(t ? t.title : '')}" placeholder="e.g. Bali trip, Friday dinner" maxlength="60" autofocus></label>
          ${t ? '' : `<label class="field"><span class="field-label">Your name</span><input class="input" name="me" value="Me" maxlength="30"></label>
          <label class="field"><span class="field-label">Who else? (comma separated, you can add more later)</span><input class="input" name="others" placeholder="e.g. Dina, Ari" list="sp-names2"></label>
          <datalist id="sp-names2">${M.knownNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>`}
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">${t ? 'Save' : 'Create'}</button></div>
        </form>`;
      const form = el.querySelector('form');
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const title = form.title.value.trim();
        if (!title) { el.querySelector('.form-error').textContent = 'Give it a name.'; return; }
        if (t) { await updateTrip(id, x => { x.title = title; }); close(); return; }
        const people = { [M.newId()]: { name: form.me.value.trim() || 'Me', me: true, order: 0 } };
        form.others.value.split(',').map(s => s.trim()).filter(Boolean).forEach((n, i) => { people[M.newId()] = { name: n, order: i + 1 }; });
        const nid = M.newId();
        await busy(form.querySelector('[type=submit]'), 'Creating…', () => save(tripKey(nid), { title, date: M.today(), people, receipts: {}, paid: {}, createdAt: Date.now() }));
        close();
        location.hash = '#/t/' + nid;
      });
    },
  });
}

function openPersonDialog(tid, pid) {
  const t = getTrip(tid);
  const p = t.people[pid];
  const used = Object.values(t.receipts || {}).some(r => r.paidBy === pid || (r.sharedBy || []).includes(pid)
    || Object.values(r.items || {}).some(i => (i.sharedBy || []).includes(pid)));
  return openDialog({
    label: p.name,
    render(el, close) {
      el.innerHTML = `
        <h2>${esc(p.name)}</h2>
        <form novalidate>
          <label class="field"><span class="field-label">Name</span><input class="input" name="name" value="${esc(p.name)}" maxlength="30"></label>
          <label class="check"><input type="checkbox" name="me" ${p.me ? 'checked' : ''}><span>This is me<small>Used for "Log my share to journal".</small></span></label>
          <div class="dialog-actions">
            <button class="btn btn-text danger-text" type="button" data-remove ${used ? 'disabled title="Used in a receipt"' : ''}>Remove</button>
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Save</button>
          </div>
          ${used ? '<p class="hint">To remove them, take them out of the receipts first.</p>' : ''}
        </form>`;
      const form = el.querySelector('form');
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-remove]').addEventListener('click', async () => { await updateTrip(tid, x => { delete x.people[pid]; }); close(); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = form.name.value.trim() || p.name;
        await updateTrip(tid, x => {
          if (form.me.checked) for (const q of Object.values(x.people)) delete q.me;
          x.people[pid] = { ...x.people[pid], name, ...(form.me.checked ? { me: true } : {}) };
          if (!form.me.checked) delete x.people[pid].me;
        });
        close();
      });
    },
  });
}

function openReceiptDialog(tid, rid, prefill = null) {
  const t = getTrip(tid);
  const people = M.peopleOf(t);
  const existing = rid ? t.receipts[rid] : null;
  const me = M.meOf(t);
  const r = prefill || M.clone(existing) || { shop: '', date: M.today(), paidBy: (me || people[0]).id, mode: 'even', total: null, sharedBy: [], items: {}, service: 0, tax: 0, discount: 0, order: Date.now() };
  r.items = r.items || {};
  const id = rid || M.newId();

  return openDialog({
    label: existing ? r.shop || 'Receipt' : 'Add receipt',
    render(el, close) {
      el.closest('dialog').classList.add('is-wide');
      const whoChips = (list, attr) => {
        const all = !list || !list.length;
        return people.map(p => chip(t, p.id, all || list.includes(p.id), `${attr} data-pid="${p.id}"`)).join('');
      };
      const itemRows = () => M.itemsOf(r).map(i => `
        <li class="sp-item" data-iid="${i.id}">
          <div class="sp-item-top">
            <input class="input" data-k="name" value="${esc(i.name || '')}" placeholder="Item" aria-label="Item" maxlength="60">
            <input class="input sp-price" data-k="price" inputmode="decimal" value="${i.price != null ? esc(M.plainNumber(i.price)) : ''}" placeholder="Price" aria-label="Price">
            <input class="input sp-qty" data-k="qty" type="number" inputmode="numeric" min="1" value="${Number(i.qty) || 1}" aria-label="Quantity">
            <button class="icon-btn" type="button" data-del-item aria-label="Remove item">${ICON.x}</button>
          </div>
          <div class="sp-chips">${whoChips(i.sharedBy, 'data-item-who')}</div>
        </li>`).join('');

      el.innerHTML = `
        <h2>${existing ? 'Edit receipt' : 'Add receipt'}</h2>
        ${existing ? '' : `<label class="sp-scan">${ICON.camera}<span><strong>${prefill ? 'Scan another receipt' : 'Scan a receipt'}</strong><small>${prefill ? 'Filled in from your photo. Check it, then choose who had what.' : 'Take or pick a photo, and the items are filled in for you.'}</small></span><input type="file" accept="image/*" data-scan hidden></label>`}
        <form novalidate class="entry-form">
          <div class="field-grid">
            <label class="field"><span class="field-label">Where</span><input class="input" name="shop" value="${esc(r.shop || '')}" placeholder="e.g. Warung Babi Guling" maxlength="60" ${existing ? '' : 'autofocus'}></label>
            <label class="field"><span class="field-label">Date</span><input class="input" name="date" type="date" value="${esc(r.date || M.today())}"></label>
          </div>
          <label class="field"><span class="field-label">Paid by</span>
            <select class="input" name="paidBy">${people.map(p => `<option value="${p.id}" ${p.id === r.paidBy ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          <div class="field"><span class="field-label">How to split</span>
            <div class="segmented seg-2" role="radiogroup" aria-label="How to split">
              <button type="button" role="radio" data-mode="even" aria-checked="${(r.mode || 'even') === 'even'}">Evenly</button>
              <button type="button" role="radio" data-mode="items" aria-checked="${r.mode === 'items'}">By item</button>
            </div></div>

          <div data-even>
            <label class="field"><span class="field-label">Total (${esc(M.currency())})</span>
              <input class="input" name="total" inputmode="decimal" value="${r.total != null ? esc(M.plainNumber(r.total)) : ''}" autocomplete="off"></label>
            <div class="field"><span class="field-label">Shared by</span><div class="sp-chips">${whoChips(r.sharedBy, 'data-even-who')}</div></div>
          </div>

          <div data-items>
            <ul class="sp-items" data-item-list>${itemRows()}</ul>
            <button class="btn btn-ghost btn-sm" type="button" data-add-item>${ICON.plus}Add item</button>
            <p class="hint">Tap names to choose who shared an item; everyone shares it if all are on.</p>
            <div class="sp-extras">
              <label class="field"><span class="field-label">Service %</span><input class="input" name="service" inputmode="decimal" value="${Number(r.service) || ''}" placeholder="0"></label>
              <label class="field"><span class="field-label">Tax %</span><input class="input" name="tax" inputmode="decimal" value="${Number(r.tax) || ''}" placeholder="e.g. 10"></label>
              <label class="field"><span class="field-label">Discount</span><input class="input" name="discount" inputmode="decimal" value="${r.discount ? esc(M.plainNumber(r.discount)) : ''}" placeholder="0"></label>
            </div>
            <div class="sp-delivery">
              <label class="field"><span class="field-label">Delivery fee</span><input class="input" name="delivery" inputmode="decimal" value="${r.delivery ? esc(M.plainNumber(r.delivery)) : ''}" placeholder="0"></label>
              <div class="field"><span class="field-label">Split delivery</span>
                <div class="segmented seg-2" role="radiogroup" aria-label="Split delivery">
                  <button type="button" role="radio" data-dby="price" aria-checked="${r.deliveryBy !== 'items'}">By price</button>
                  <button type="button" role="radio" data-dby="items" aria-checked="${r.deliveryBy === 'items'}">By items</button>
                </div></div>
            </div>
          </div>

          <div class="sp-preview" data-preview></div>
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            ${existing ? '<button class="btn btn-text danger-text" type="button" data-delete>Delete</button>' : ''}
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">${existing ? 'Save' : 'Add receipt'}</button>
          </div>
        </form>`;

      const form = el.querySelector('form');
      const readForm = () => {
        r.shop = form.shop.value.trim(); r.date = form.date.value; r.paidBy = form.paidBy.value;
        r.total = M.parseAmount(form.total.value);
        r.service = M.parsePercent(form.service.value); r.tax = M.parsePercent(form.tax.value);
        r.discount = M.parseAmount(form.discount.value) || 0;
        r.delivery = M.parseAmount(form.delivery.value) || 0;
        el.querySelectorAll('[data-iid]').forEach(li => {
          const it = r.items[li.dataset.iid];
          if (!it) return;
          it.name = li.querySelector('[data-k=name]').value.trim();
          it.price = M.parseAmount(li.querySelector('[data-k=price]').value);
          it.qty = Math.max(1, Math.round(Number(li.querySelector('[data-k=qty]').value) || 1));
        });
      };
      const preview = () => {
        readForm();
        const c = M.receiptCalc(t, r);
        const parts = people.filter(p => c.shares[p.id]).map(p => `<span><b>${esc(p.name)}</b> ${esc(M.money(c.shares[p.id]))}</span>`);
        el.querySelector('[data-preview]').innerHTML = `
          <p class="sp-preview-total">Total <strong>${esc(M.money(c.total))}</strong>
            ${r.mode === 'items' && (c.service || c.tax || c.delivery || c.discount || c.rounding) ? `<small>(${esc(M.money(c.subtotal))}${c.service ? ' + service ' + esc(M.money(c.service)) : ''}${c.tax ? ' + tax ' + esc(M.money(c.tax)) : ''}${c.delivery ? ' + delivery ' + esc(M.money(c.delivery)) : ''}${c.discount ? ' − ' + esc(M.money(c.discount)) : ''}${c.rounding ? ' ' + (c.rounding > 0 ? '+' : '−') + ' rounding ' + esc(M.money(Math.abs(c.rounding))) : ''})</small>` : ''}</p>
          <p class="sp-preview-shares">${parts.join('') || '<span>Nothing to split yet</span>'}</p>`;
      };
      const showMode = () => {
        el.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === (r.mode || 'even'))));
        el.querySelector('[data-even]').hidden = (r.mode || 'even') !== 'even';
        el.querySelector('[data-items]').hidden = r.mode !== 'items';
        preview();
      };
      const toggleWho = (list, pid) => {
        const all = people.map(p => p.id);
        let cur = list && list.length ? [...list] : [...all];
        cur = cur.includes(pid) ? cur.filter(x => x !== pid) : [...cur, pid];
        if (!cur.length) return list;                       // keep at least one
        return cur.length === all.length ? [] : cur;         // [] means everyone
      };
      const addItem = () => {
        readForm();
        const iid = M.newId();
        r.items[iid] = { name: '', price: null, qty: 1, sharedBy: [], order: Date.now() };
        el.querySelector('[data-item-list]').innerHTML = itemRows();
        el.querySelector(`[data-iid="${iid}"] [data-k=name]`).focus();
      };
      showMode();
      if (r.mode === 'items' && !Object.keys(r.items).length) addItem();

      el.addEventListener('click', e => {
        const dby = e.target.closest('[data-dby]');
        if (dby) { r.deliveryBy = dby.dataset.dby; el.querySelectorAll('[data-dby]').forEach(b => b.setAttribute('aria-checked', String(b === dby))); preview(); }
        const m = e.target.closest('[data-mode]');
        if (m) { readForm(); r.mode = m.dataset.mode; if (r.mode === 'items' && !Object.keys(r.items).length) addItem(); showMode(); }
        const ew = e.target.closest('[data-even-who]');
        if (ew) { r.sharedBy = toggleWho(r.sharedBy, ew.dataset.pid); ew.parentElement.innerHTML = whoChips(r.sharedBy, 'data-even-who'); preview(); }
        const iw = e.target.closest('[data-item-who]');
        if (iw) {
          const iid = iw.closest('[data-iid]').dataset.iid;
          r.items[iid].sharedBy = toggleWho(r.items[iid].sharedBy, iw.dataset.pid);
          iw.parentElement.innerHTML = whoChips(r.items[iid].sharedBy, 'data-item-who');
          preview();
        }
        if (e.target.closest('[data-add-item]')) { addItem(); preview(); }
        const di = e.target.closest('[data-del-item]');
        if (di) { readForm(); delete r.items[di.closest('[data-iid]').dataset.iid]; el.querySelector('[data-item-list]').innerHTML = itemRows(); preview(); }
      });
      el.addEventListener('input', preview);
      el.addEventListener('change', preview);
      el.querySelector('[data-scan]')?.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        readForm();
        const paidBy = r.paidBy;
        close();
        const { openReceiptScan } = await import('../../assets/js/receipt/review.js');
        const res = await openReceiptScan(file, { fill: true });
        if (!res) return openReceiptDialog(tid, null);
        const items = {};
        res.items.forEach((it, i) => { if (it.price > 0) items[M.newId()] = { name: it.name || 'Item', price: it.price, qty: it.qty || 1, sharedBy: [], order: i + 1 }; });
        const filled = Object.keys(items).length
          ? { shop: res.shop, date: res.date || M.today(), paidBy, mode: 'items', items, total: null, sharedBy: [], service: res.servicePct || 0, tax: res.taxPct || 0, discount: res.discount || 0, rounding: res.rounding || 0, delivery: 0, order: Date.now() }
          : { shop: res.shop, date: res.date || M.today(), paidBy, mode: 'even', total: res.total, sharedBy: [], items: {}, service: 0, tax: 0, discount: 0, order: Date.now() };
        openReceiptDialog(tid, null, filled);
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      const del = el.querySelector('[data-delete]');
      if (del) del.addEventListener('click', async () => {
        if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
        await updateTrip(tid, x => { delete x.receipts[id]; }); close();
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        readForm();
        const err = el.querySelector('.form-error');
        if ((r.mode || 'even') === 'even' && !(r.total > 0)) { err.textContent = 'Enter the total.'; return; }
        if (r.mode === 'items') {
          for (const [iid, it] of Object.entries(r.items)) if (!it.name && it.price == null) delete r.items[iid];
          if (!Object.values(r.items).some(i => i.price > 0)) { err.textContent = 'Add at least one item with a price.'; return; }
        }
        if (!r.shop) r.shop = 'Receipt';
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => updateTrip(tid, x => {
          x.receipts = { ...(x.receipts || {}), [id]: r };
          if (M.isDate(r.date) && (!M.isDate(x.date) || r.date < x.date)) x.date = r.date;
        }));
        close();
      });
    },
  });
}

async function openShareDialog(tid) {
  const t = getTrip(tid);
  const people = M.peopleOf(t);
  let forId = null, blob = null, url = '';
  const draw = async () => {
    blob = await summaryImage(t, forId);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
  };
  await draw();
  // Not awaited: the "Drawing…" state on the button ends once the picture is ready.
  openDialog({
    label: 'Share',
    render(el) {
      el.closest('dialog').classList.add('is-wide');
      el.innerHTML = `
        <h2>Share with friends</h2>
        <p>Send everyone the whole split, or each person just their part.</p>
        <div class="choice-chips sp-for" role="radiogroup" aria-label="Who is it for" style="--cc:var(--flower);--cc-deep:var(--flower-deep)">
          <button type="button" role="radio" aria-checked="true" data-for="">Everyone</button>
          ${people.map(p => `<button type="button" role="radio" aria-checked="false" data-for="${p.id}">${esc(p.name)}</button>`).join('')}
        </div>
        <img class="sp-shot" src="${url}" alt="Summary of ${esc(t.title || 'the split')}">
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-copy>${ICON.copy}Copy as text</button>
          <span class="spacer"></span>
          <button class="btn btn-primary" type="button" data-send>${ICON.share}Share picture</button>
        </div>`;
      const img = el.querySelector('.sp-shot');
      el.querySelector('.sp-for').addEventListener('click', async e => {
        const b = e.target.closest('[data-for]');
        if (!b || b.getAttribute('aria-checked') === 'true') return;
        el.querySelectorAll('[data-for]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        forId = b.dataset.for || null;
        await draw();
        img.src = url;
        img.alt = forId ? `${M.nameOf(t, forId)}'s share of ${t.title || 'the split'}` : `Summary of ${t.title || 'the split'}`;
      });
      el.querySelector('[data-copy]').addEventListener('click', () => copyText(summaryText(t, forId)));
      el.querySelector('[data-send]').addEventListener('click', async () => {
        const how = await shareImage(t, blob, forId ? M.nameOf(t, forId) : '');
        if (how === 'downloaded') toast('Picture saved. Send it from your photos or downloads.');
      });
      el.closest('dialog').addEventListener('close', () => setTimeout(() => URL.revokeObjectURL(url), 1000));
    },
  });
}

function openLogShareDialog(tid) {
  const t = getTrip(tid);
  const c = M.tripCalc(t);
  const me = M.meOf(t);
  const cfg = J.config();
  const spendLog = J.activeList(cfg.logCats).find(x => x.spend) || { id: 'spending' };
  const lastDate = M.receiptsOf(t).map(r => r.date).filter(M.isDate).sort().pop() || M.today();
  return openDialog({
    label: 'Log my share',
    render(el, close) {
      el.innerHTML = `
        <h2>Log my share</h2>
        <p>Adds <strong>${esc(M.money(c.owed[me.id]))}</strong> to your journal as spending, so it counts in your budget.</p>
        ${t.loggedShare ? `<p class="hint">You already logged this on ${esc(M.fmt.long(t.loggedShare))}.</p>` : ''}
        <form novalidate>
          <div class="field-grid">
            <label class="field"><span class="field-label">Date</span><input class="input" type="date" name="date" value="${esc(lastDate)}"></label>
            <label class="field"><span class="field-label">Spending category</span>
              <select class="input" name="cat">${J.activeList(cfg.spendCats).map(s => `<option value="${s.id}" ${s.id === 'fun' ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
          </div>
          <div class="dialog-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Log it</button></div>
        </form>`;
      const form = el.querySelector('form');
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const entry = { date: M.isDate(form.date.value) ? form.date.value : M.today(), time: '12:00', cat: spendLog.id,
          text: `${t.title || 'Split'} (my share)`, amount: c.owed[me.id], spendCat: form.cat.value, createdAt: Date.now() };
        await busy(form.querySelector('[type=submit]'), 'Logging…', async () => {
          await journal.put('log:' + M.newId(), entry);
          await updateTrip(tid, x => { x.loggedShare = M.today(); });
        });
        toast('Logged in your journal');
        close();
      });
    },
  });
}

function openSettings() {
  return openDialog({
    label: 'Splitter settings',
    render(el, close) {
      el.innerHTML = `
        <h2>Splitter settings</h2>
        <h3>Currency</h3>
        <select class="input currency-select" data-currency>${M.CURRENCIES.map(c => `<option ${c === M.currency() ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <h3>Backup</h3><button class="btn btn-ghost btn-sm" type="button" data-backup>Backup &amp; restore…</button>
        <div class="dialog-actions"><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
      el.querySelector('[data-currency]').addEventListener('change', async e => {
        await save('config', { ...(M.clone(M.get('config')) || {}), currency: e.target.value });
        toast('Currency saved');
      });
      el.querySelector('[data-backup]').addEventListener('click', () => openBackupDialog());
      el.querySelector('[data-close]').addEventListener('click', () => close());
    },
  });
}

/* ---------- wiring ---------- */

main.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || (b.tagName === 'INPUT')) return;
  const tid = ui.trip;
  switch (b.dataset.act) {
    case 'gate': if (S.getState().status === 'error') return S.retry(); return document.querySelector('#account-slot [data-act]')?.click();
    case 'new-trip': return openTripDialog(null);
    case 'edit-trip': return openTripDialog(tid);
    case 'edit-person': return openPersonDialog(tid, b.dataset.id);
    case 'new-receipt': return openReceiptDialog(tid, null);
    case 'edit-receipt': return openReceiptDialog(tid, b.dataset.id);
    case 'share': return busy(b, 'Drawing…', () => openShareDialog(tid));
    case 'log-share': return openLogShareDialog(tid);
    case 'delete-trip':
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete this split'; return; }
      await store.remove(tripKey(tid)); location.hash = '#/'; toast('Split deleted');
  }
});

main.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.act === 'toggle-paid') {
    await updateTrip(ui.trip, x => { x.paid = { ...(x.paid || {}) }; if (el.checked) x.paid[el.dataset.key] = Number(el.dataset.amount); else delete x.paid[el.dataset.key]; });
  }
});

main.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'add-person') {
    const name = f.name.value.trim();
    if (!name) return;
    await updateTrip(ui.trip, x => { x.people = { ...(x.people || {}), [M.newId()]: { name, order: Date.now() } }; });
    render();
    main.querySelector('[data-form=add-person] input')?.focus();
  }
});

document.querySelector('[data-act=add]')?.addEventListener('click', () => {
  if (!ui.loaded) return toast('Unlock first');
  if (ui.trip) openReceiptDialog(ui.trip, null); else openTripDialog(null);
});
document.querySelector('[data-act=settings]')?.addEventListener('click', () => (ui.loaded ? openSettings() : toast('Unlock first')));

/* "Pay to" was removed: clear any payment details saved before. */
async function dropPayTo() {
  const cfg = M.get('config');
  if (cfg && 'payTo' in cfg) { const { payTo, ...rest } = M.clone(cfg); await save('config', rest).catch(() => {}); }
  for (const t of M.trips()) if ('payTo' in t) await updateTrip(t.id, x => { delete x.payTo; }).catch(() => {});
}

store.subscribe(list => {
  M.setItems(list);
  const first = !ui.loaded;
  ui.loaded = true;
  if (first) { onRoute(); dropPayTo(); }
  else {
    const el = document.activeElement;
    const typing = el && main.contains(el) && el.matches('input:not([type=checkbox]), textarea');
    if (!typing) render();
  }
});
S.onChange(st => { if (st.status !== 'unlocked') { ui.loaded = false; M.setItems([]); render(); } });
addEventListener('hashchange', () => { if (ui.loaded) onRoute(); });
mountHeader({ autoUnlock: true });
render();
