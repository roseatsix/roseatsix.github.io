/* ==========================================================
   Scan a receipt: read it, let you correct it, then send it on.

   openReceiptScan(image, { fill: true })
     → resolves with the corrected receipt (for the bill splitter's
       own receipt form), or undefined if cancelled.
   openReceiptScan(image)
     → lets you choose where it goes (a bill split, or journal
       spending), saves it there, and resolves with
       { label, href } of where it went, or undefined.
   ========================================================== */

import { openDialog, esc, toast, busy } from '../ui/dom.js';
import { openStore } from '../core/store.js';
import { readReceipt } from './scan.js';
import { parseReceipt, check } from './parse.js';
import * as J from '../../../tools/journal/model.js';
import * as SP from '../../../tools/split/model.js';

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/></svg>',
};

const rp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const num = v => { const t = String(v ?? '').replace(/[^\d.,-]/g, ''); if (!t) return null; const n = Number(t.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(n) ? n : null; };
const plain = n => (n == null || n === '' ? '' : Math.round(n).toLocaleString('id-ID'));

export function openReceiptScan(image, { fill = false, to: startTo = 'split' } = {}) {
  const journal = openStore('journal');
  const splits = openStore('splits');
  const offJ = journal.subscribe(l => J.setItems(l));
  const offS = splits.subscribe(l => SP.setItems(l));
  const imgUrl = typeof image === 'string' ? image : URL.createObjectURL(image);

  return openDialog({
    label: 'Scan a receipt',
    render(el, close) {
      const dlg = el.closest('dialog');
      dlg.classList.add('is-wide');
      dlg.addEventListener('close', () => { offJ(); offS(); if (typeof image !== 'string') setTimeout(() => URL.revokeObjectURL(imgUrl), 1000); });

      el.innerHTML = `
        <h2>Scan a receipt</h2>
        <div class="rc-reading">
          <img class="rc-thumb" src="${imgUrl}" alt="">
          <div><p class="rc-status" data-status>Getting the photo ready…</p><div class="rc-bar"><i data-bar></i></div>
          <p class="hint">Everything is read on this device; the photo isn't uploaded anywhere.</p></div>
        </div>`;

      let r = null, raw = '';
      readReceipt(image, (text, f) => {
        const s = el.querySelector('[data-status]'), b = el.querySelector('[data-bar]');
        if (s) s.textContent = text + (f != null ? ` ${Math.round(f * 100)}%` : '');
        if (b) { b.style.width = f != null ? Math.round(f * 100) + '%' : '30%'; b.classList.toggle('is-busy', f == null); }
      }).then(text => {
        raw = text;
        const p = parseReceipt(text);
        r = { shop: p.shop, date: p.date || J.today(), items: p.items.length ? p.items : [{ name: '', qty: 1, price: null }],
          servicePct: p.servicePct || 0, taxPct: p.taxPct || 0, discount: p.discount || 0, rounding: p.rounding || 0, total: p.total };
        review();
      }).catch(err => {
        console.error(err);
        el.innerHTML = `<h2>Scan a receipt</h2><p class="form-error">${esc(err.message || "Couldn't read that photo.")}</p>
          <div class="dialog-actions"><button class="btn btn-primary" type="button" data-cancel>Close</button></div>`;
        el.querySelector('[data-cancel]').addEventListener('click', () => close());
      });

      /* ---------- review & correct ---------- */
      function review() {
        const trips = SP.trips();
        const cats = J.activeList(J.config().spendCats);
        el.innerHTML = `
          <h2>Check the receipt</h2>
          <p class="hint" style="margin-top:-4px">Fix anything the reader got wrong. Tap the photo to compare.</p>
          <form novalidate class="entry-form rc-form">
            <details class="rc-photo"><summary><img src="${imgUrl}" alt="Receipt photo"><span>Show the photo</span></summary><img class="rc-full" src="${imgUrl}" alt="Receipt photo, large"></details>
            <div class="field-grid">
              <label class="field"><span class="field-label">Where</span><input class="input" name="shop" value="${esc(r.shop || '')}" placeholder="Shop or restaurant" maxlength="60"></label>
              <label class="field"><span class="field-label">Date</span><input class="input" name="date" type="date" value="${esc(r.date || '')}"></label>
            </div>
            <div class="field"><span class="field-label">Items</span>
              <div class="rc-head" aria-hidden="true"><span>Item</span><span>Qty</span><span>Price each</span><span></span></div>
              <ul class="rc-items" data-items></ul>
              <button class="btn btn-ghost btn-sm" type="button" data-add>${ICON.plus}Add item</button>
            </div>
            <div class="rc-extras">
              <label class="field"><span class="field-label">Service %</span><input class="input" name="servicePct" inputmode="decimal" value="${r.servicePct || ''}" placeholder="0"></label>
              <label class="field"><span class="field-label">Tax %</span><input class="input" name="taxPct" inputmode="decimal" value="${r.taxPct || ''}" placeholder="0"></label>
              <label class="field"><span class="field-label">Discount</span><input class="input" name="discount" inputmode="numeric" value="${plain(r.discount || '')}" placeholder="0"></label>
              <label class="field"><span class="field-label">Receipt total</span><input class="input" name="total" inputmode="numeric" value="${plain(r.total)}" placeholder="as printed"></label>
            </div>
            <div class="rc-sum" data-sum></div>
            <details class="rc-raw"><summary>What the reader saw</summary><pre>${esc(raw.trim() || '(nothing)')}</pre></details>

            ${fill ? '' : `
            <div class="field"><span class="field-label">Send it to</span>
              <div class="segmented seg-2" role="radiogroup" aria-label="Send it to">
                <button type="button" role="radio" data-to="split" aria-checked="${startTo === 'split'}">A bill split</button>
                <button type="button" role="radio" data-to="spend" aria-checked="${startTo === 'spend'}">My spending</button>
              </div></div>
            <div data-dest="split" ${startTo === 'split' ? '' : 'hidden'}>
              <div class="field-grid">
                <label class="field"><span class="field-label">Split</span>
                  <select class="input" name="trip">${trips.map(t => `<option value="${t.id}">${esc(t.title || 'Untitled split')}</option>`).join('')}<option value="__new" ${trips.length ? '' : 'selected'}>New split…</option></select></label>
                <label class="field" data-paid><span class="field-label">Paid by</span><select class="input" name="paidBy"></select></label>
              </div>
              <div class="field-grid" data-newtrip hidden>
                <label class="field"><span class="field-label">Name of the split</span><input class="input" name="tripTitle" placeholder="e.g. Friday dinner" maxlength="60"></label>
                <label class="field"><span class="field-label">Who else? (comma separated)</span><input class="input" name="others" placeholder="e.g. Dina, Ari"></label>
              </div>
              <p class="hint">Everyone shares every item at first. Open the split to choose who had what.</p>
            </div>
            <div data-dest="spend" ${startTo === 'spend' ? '' : 'hidden'}>
              <div class="field"><span class="field-label">Category</span>
                <div class="choice-chips" role="radiogroup" aria-label="Spending category">${cats.map((c, i) => `<button type="button" role="radio" data-cat="${c.id}" aria-checked="${c.id === 'food' || (!cats.some(x => x.id === 'food') && i === 0)}">${esc(c.name)}</button>`).join('')}</div></div>
              <p class="hint">Logged in your journal as one spending entry for the receipt's total.</p>
            </div>`}
            <div class="form-error" role="alert"></div>
            <div class="dialog-actions">
              <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
              <button class="btn btn-primary" type="submit">${fill ? 'Use these' : 'Save'}</button>
            </div>
          </form>`;
        const form = el.querySelector('form');
        const list = el.querySelector('[data-items]');
        const drawItems = () => {
          list.innerHTML = r.items.map((it, i) => `
            <li class="rc-item" data-i="${i}">
              <input class="input" data-k="name" value="${esc(it.name || '')}" placeholder="Item" aria-label="Item ${i + 1}">
              <input class="input" data-k="qty" type="number" min="1" inputmode="numeric" value="${Number(it.qty) || 1}" aria-label="Quantity">
              <input class="input" data-k="price" inputmode="numeric" value="${plain(it.price)}" placeholder="0" aria-label="Price each">
              <button class="icon-btn" type="button" data-del aria-label="Remove item">${ICON.x}</button>
            </li>`).join('');
        };
        const read = () => {
          r.shop = form.shop.value.trim(); r.date = form.date.value;
          r.items = [...list.querySelectorAll('[data-i]')].map(li => ({
            name: li.querySelector('[data-k=name]').value.trim(),
            qty: Math.max(1, Math.round(Number(li.querySelector('[data-k=qty]').value) || 1)),
            price: num(li.querySelector('[data-k=price]').value),
          }));
          r.servicePct = num(form.servicePct.value) || 0; r.taxPct = num(form.taxPct.value) || 0;
          r.discount = num(form.discount.value) || 0; r.total = num(form.total.value);
        };
        const sum = () => {
          read();
          const c = check(r);
          const box = el.querySelector('[data-sum]');
          const ok = c.diff == null || Math.abs(c.diff) <= 2;
          box.className = 'rc-sum ' + (c.diff == null ? '' : ok ? 'is-ok' : 'is-off');
          box.innerHTML = `
            <span>Items ${esc(rp(c.sum))}${r.servicePct ? ` + service ${r.servicePct}%` : ''}${r.taxPct ? ` + tax ${r.taxPct}%` : ''}${r.discount ? ` − ${esc(rp(r.discount))}` : ''}${r.rounding ? ` ${r.rounding > 0 ? '+' : '−'} rounding ${esc(rp(Math.abs(r.rounding)))}` : ''} = <strong>${esc(rp(c.computed))}</strong></span>
            ${c.diff == null ? '' : ok ? `<span class="rc-verdict">${ICON.ok}Matches the receipt</span>`
              : `<span class="rc-verdict">${ICON.warn}${c.diff > 0 ? `${esc(rp(c.diff))} less than` : `${esc(rp(-c.diff))} more than`} the receipt's ${esc(rp(r.total))}. Check for a missed or misread line.</span>`}`;
        };
        const paidOptions = () => {
          if (fill) return;
          const tid = form.trip.value;
          const isNew = tid === '__new';
          el.querySelector('[data-newtrip]').hidden = !isNew;
          const people = isNew ? [{ id: '__me', name: 'Me' }] : SP.peopleOf(SP.trips().find(t => t.id === tid) || {});
          form.paidBy.innerHTML = people.map(p => `<option value="${p.id}" ${p.me || p.id === '__me' ? 'selected' : ''}>${esc(p.name)}${p.me ? ' (me)' : ''}</option>`).join('');
          el.querySelector('[data-paid]').hidden = isNew;
        };
        drawItems(); sum(); paidOptions();

        let to = startTo;
        el.addEventListener('input', sum);
        form.trip?.addEventListener('change', paidOptions);
        el.addEventListener('click', e => {
          if (e.target.closest('[data-add]')) { read(); r.items.push({ name: '', qty: 1, price: null }); drawItems(); list.lastElementChild.querySelector('input').focus(); sum(); }
          const del = e.target.closest('[data-del]');
          if (del) { read(); r.items.splice(Number(del.closest('[data-i]').dataset.i), 1); drawItems(); sum(); }
          const t = e.target.closest('[data-to]');
          if (t) { to = t.dataset.to; el.querySelectorAll('[data-to]').forEach(b => b.setAttribute('aria-checked', String(b === t))); el.querySelectorAll('[data-dest]').forEach(d => { d.hidden = d.dataset.dest !== to; }); }
          const c = e.target.closest('[data-cat]');
          if (c) el.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-checked', String(b === c)));
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => close());
        form.addEventListener('submit', async e => {
          e.preventDefault();
          read();
          const err = el.querySelector('.form-error');
          err.textContent = '';
          r.items = r.items.filter(it => it.name || it.price);
          if (!r.items.some(it => it.price > 0) && !(r.total > 0)) { err.textContent = 'Add at least one item with a price, or the total.'; return; }
          if (fill) { close(r); return; }
          try {
            const res = await busy(form.querySelector('[type=submit]'), 'Saving…', () => (to === 'split' ? toSplit(form) : toSpending(form)));
            if (!res) return;
            toast(res.label);
            close(res);
          } catch (ex) { err.textContent = ex.message || "Couldn't save."; }
        });

        /* ---------- destinations ---------- */
        async function toSplit(f) {
          let tid = f.trip.value;
          let paidBy = f.paidBy.value;
          if (tid === '__new') {
            const title = f.tripTitle.value.trim() || r.shop || 'Split';
            const others = f.others.value.split(',').map(s => s.trim()).filter(Boolean);
            if (!others.length) { el.querySelector('.form-error').textContent = 'Add at least one other person to split with.'; f.others.focus(); return null; }
            const meId = SP.newId();
            const people = { [meId]: { name: 'Me', me: true, order: 0 } };
            others.forEach((n, i) => { people[SP.newId()] = { name: n, order: i + 1 }; });
            tid = SP.newId();
            await splits.put('trip:' + tid, { title, date: r.date || J.today(), people, receipts: {}, paid: {}, createdAt: Date.now() });
            paidBy = meId;
          }
          const trip = SP.clone((splits.get('trip:' + tid) || {}).data);
          if (!trip) throw new Error("That split couldn't be found.");
          const items = {};
          r.items.forEach((it, i) => { if (it.price > 0) items[SP.newId()] = { name: it.name || 'Item', price: it.price, qty: it.qty || 1, sharedBy: [], order: i + 1 }; });
          const receipt = Object.keys(items).length
            ? { shop: r.shop || 'Receipt', date: r.date || J.today(), paidBy, mode: 'items', items, sharedBy: [], service: r.servicePct || 0, tax: r.taxPct || 0, discount: r.discount || 0, rounding: r.rounding || 0, delivery: 0, order: Date.now() }
            : { shop: r.shop || 'Receipt', date: r.date || J.today(), paidBy, mode: 'even', total: r.total, sharedBy: [], items: {}, service: 0, tax: 0, discount: 0, order: Date.now() };
          trip.receipts = { ...(trip.receipts || {}), [SP.newId()]: receipt };
          if (J.isDate(receipt.date) && (!J.isDate(trip.date) || receipt.date < trip.date)) trip.date = receipt.date;
          await splits.put('trip:' + tid, trip);
          return { label: `Added to ${trip.title || 'the split'}`, href: `/tools/split/#/t/${tid}` };
        }
        async function toSpending() {
          const cat = el.querySelector('[data-cat][aria-checked="true"]')?.dataset.cat || 'other';
          const amount = r.total > 0 ? r.total : check(r).computed;
          const id = J.newId();
          await journal.put('log:' + id, {
            date: r.date || J.today(), time: r.date && r.date !== J.today() ? '12:00' : J.nowTime(), cat: 'spending',
            text: r.shop || 'Receipt', amount, spendCat: cat, createdAt: Date.now(),
          });
          return { label: `Logged ${rp(amount)} as spending`, href: `/tools/journal/#/log/${id}` };
        }
      }
    },
  });
}
