/* Subscriptions: list, totals, upcoming renewals, add/edit, price changes. */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { openDialog, esc, toast, busy } from '../../assets/js/ui/dom.js';
import { openBackupDialog } from '../../assets/js/ui/backup.js';
import * as M from './model.js';

const main = document.getElementById('subs');
const store = openStore('subscriptions');
const ui = { loaded: false, showOld: false };

const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
};

const save = (key, data) => store.put(key, data).catch(err => { toast("Couldn't save. " + (err.message || '')); throw err; });

/* ---------- views ---------- */

function gate(st) {
  const copy = {
    signedOut: ['Your subscriptions are private', 'Sign in with Google to start. Everything is encrypted on your device before it syncs.', 'Sign in'],
    unconfigured: ["Sync isn't set up", 'Sign-in needs to be connected first.', null],
    needsSetup: ['Set up your vault', 'Choose a passphrase to encrypt your data.', 'Set up vault'],
    locked: ['Unlock your subscriptions', 'Enter your passphrase to open them on this device.', 'Unlock'],
    denied: ["Can't open your data", 'The database refused access for this account.', null],
    error: ['Something went wrong', st.error || '', 'Try again'],
  }[st.status];
  if (!copy) return '<div class="j-gate"><span class="spinner" aria-hidden="true"></span><p>Opening…</p></div>';
  return `<div class="j-gate"><svg class="j-gate-blossom" aria-hidden="true"><use href="#blossom"/></svg><h1>${esc(copy[0])}</h1><p>${esc(copy[1])}</p>
    ${copy[2] ? `<button class="btn btn-primary" type="button" data-act="gate">${esc(copy[2])}</button>` : ''}</div>`;
}

function row(s) {
  const status = s.status || 'active';
  const next = M.nextBilling(s);
  const price = M.priceOn(s);
  const mine = M.myCost(s);
  const pf = M.platform(s.platform).name;
  return `
    <li>
      <button type="button" class="s-row is-${status}" data-act="open" data-id="${s.id}">
        <span class="s-main">
          <span class="s-name">${esc(s.name)}</span>
          <span class="s-meta">
            <span>${esc(M.cycleText(s.cycle))}</span>
            ${pf ? `<span>${esc(pf)}</span>` : ''}
            ${s.split ? `<span class="s-split">${ICON.people}${s.split.mode === 'amount' ? 'shared' : `split ${Number(s.split.count) || 1}`}</span>` : ''}
            ${status !== 'active' ? `<span class="s-status">${M.STATUS[status]}${M.isDate(s.statusAt) ? ' ' + esc(M.fmt.short(s.statusAt)) : ''}</span>` : ''}
            ${s.nextPrice && s.nextPrice.from > M.today() ? `<span class="s-change">→ ${esc(M.money(s.nextPrice.price))} from ${esc(M.fmt.short(s.nextPrice.from))}</span>` : ''}
          </span>
        </span>
        <span class="s-right">
          <span class="s-price">${esc(M.money(mine))}</span>
          ${s.split ? `<span class="s-of">of ${esc(M.money(price))}</span>` : ''}
          ${next ? `<span class="s-next ${M.daysBetween(M.today(), next) <= 3 ? 'is-soon' : ''}">${esc(M.whenText(next))}</span>` : ''}
        </span>
      </button>
    </li>`;
}

function render() {
  if (!ui.loaded) { main.innerHTML = gate(S.getState()); return; }
  const all = M.subs();
  const act = all.filter(s => (s.status || 'active') === 'active');
  const paused = all.filter(s => s.status === 'paused');
  const cancelled = all.filter(s => s.status === 'cancelled');
  const perMonth = act.reduce((n, s) => n + M.monthly(s), 0);
  const up = M.upcoming(30);
  const upTotal = up.reduce((n, x) => n + M.myCost(x.sub, x.date), 0);

  const groups = new Map();
  for (const s of act) {
    const c = M.category(s.category);
    if (!groups.has(c.id)) groups.set(c.id, { c, list: [], total: 0 });
    const g = groups.get(c.id); g.list.push(s); g.total += M.monthly(s);
  }
  const ordered = [...groups.values()].sort((a, b) => b.total - a.total);
  const bySoon = (a, b) => (M.nextBilling(a) || '9999').localeCompare(M.nextBilling(b) || '9999');

  main.innerHTML = `
    <section class="j-view">
      <div class="j-stats s-stats">
        <div class="j-stat"><span class="j-full">${esc(M.money(perMonth))}</span><span class="j-compact">${esc(M.money(perMonth, { notation: 'compact', maximumFractionDigits: 1 }))}</span>a month</div>
        <div class="j-stat"><span class="j-full">${esc(M.money(perMonth * 12))}</span><span class="j-compact">${esc(M.money(perMonth * 12, { notation: 'compact', maximumFractionDigits: 1 }))}</span>a year</div>
        <div class="j-stat"><span>${act.length}</span>active</div>
      </div>

      ${!all.length ? `
        <div class="j-card i-empty">
          <h2>No subscriptions yet</h2>
          <p>Add what you pay for regularly: streaming, music, cloud storage, apps, your phone plan. You'll see what it all costs per month and get a heads-up before each renewal.</p>
          <button class="btn btn-primary" type="button" data-act="new">${ICON.plus}Add a subscription</button>
        </div>` : ''}

      ${up.length ? `
        <section class="j-card tone-sun">
          <div class="j-card-head"><h2>Next 30 days</h2><span class="j-count">${esc(M.money(upTotal))}</span></div>
          <ul class="s-up">${up.slice(0, 8).map(x => `
            <li><button type="button" data-act="open" data-id="${x.sub.id}">
              <span class="s-when ${M.daysBetween(M.today(), x.date) <= 3 ? 'is-soon' : ''}">${esc(M.whenText(x.date))}</span>
              <span class="s-name">${esc(x.sub.name)}</span>
              <span class="s-amt">${esc(M.money(M.myCost(x.sub, x.date)))}</span>
            </button></li>`).join('')}</ul>
          ${up.length > 8 ? `<p class="j-empty">+${up.length - 8} more</p>` : ''}
        </section>` : ''}

      ${ordered.map(g => `
        <section class="j-card tone-flower">
          <div class="j-card-head"><h2>${esc(g.c.name)}</h2><span class="j-count">${esc(M.money(g.total))}/mo</span></div>
          <ul class="s-list">${g.list.sort(bySoon).map(row).join('')}</ul>
        </section>`).join('')}

      ${paused.length || cancelled.length ? `
        <details class="j-card s-old" ${ui.showOld ? 'open' : ''}>
          <summary class="j-card-head"><h2>Paused &amp; cancelled</h2><span class="j-count">${paused.length + cancelled.length}</span></summary>
          <ul class="s-list">${[...paused, ...cancelled].map(row).join('')}</ul>
        </details>` : ''}
    </section>`;
}

/* ---------- add / edit ---------- */

function openSubDialog(id) {
  const key = 'sub:' + (id || M.newId());
  const existing = id ? M.get(key) : null;
  const cfg = M.config();
  const s = M.clone(existing) || { name: '', price: null, cycle: { every: 1, unit: 'months' }, anchor: M.today(), category: '', platform: '', status: 'active', split: null, notes: '', createdAt: Date.now() };
  const opt = (list, val) => '<option value="">Choose…</option>' + list.map(c => `<option value="${c.id}" ${c.id === val ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  return openDialog({
    label: existing ? s.name : 'Add a subscription',
    render(el, close) {
      el.closest('dialog').classList.add('is-wide');
      const history = (s.priceHistory || []).slice().reverse();
      el.innerHTML = `
        <h2>${existing ? esc(s.name) : 'Add a subscription'}</h2>
        ${existing ? `<div class="i-quick">
          <button class="btn btn-ghost btn-sm" type="button" data-price-change>Change price…</button>
        </div>` : ''}
        <form novalidate class="i-form">
          <label class="field"><span class="field-label">Name</span>
            <input class="input" name="name" value="${esc(s.name)}" maxlength="60" placeholder="e.g. Netflix, Spotify, iCloud+" ${existing ? '' : 'autofocus'}></label>
          <div class="i-grid">
            <label class="field"><span class="field-label">Price (${esc(cfg.currency)})</span>
              <input class="input" name="price" inputmode="decimal" value="${s.price != null ? esc(M.plainNumber(s.price)) : ''}" ${existing ? 'readonly title="Use Change price"' : ''} autocomplete="off"></label>
            <label class="field"><span class="field-label">${existing ? 'A billing date' : 'Next billing date'}</span>
              <input class="input" name="anchor" type="date" value="${esc(s.anchor || M.today())}"></label>
          </div>
          <div class="i-every s-cycle">
            <span>Billed every</span>
            <input class="input" name="every" type="number" inputmode="numeric" min="1" step="1" value="${Number(s.cycle.every) || 1}" aria-label="How many">
            <select class="input" name="unit" aria-label="Unit">${Object.entries(M.UNITS).map(([u, [one, many]]) => `<option value="${u}" ${u === s.cycle.unit ? 'selected' : ''}>${Number(s.cycle.every) === 1 ? one : many}</option>`).join('')}</select>
          </div>
          <div class="i-grid">
            <label class="field"><span class="field-label">Category</span><select class="input" name="category">${opt(M.activeList(cfg.categories), s.category)}</select></label>
            <label class="field"><span class="field-label">Paid through</span><select class="input" name="platform">${opt(M.activeList(cfg.platforms), s.platform)}</select></label>
          </div>

          <div class="i-replace">
            <label class="check"><input type="checkbox" name="doSplit" ${s.split ? 'checked' : ''}>
              <span>Shared with others<small>Family or group plan; totals count only your share.</small></span></label>
            <div data-split ${s.split ? '' : 'hidden'}>
              <div class="segmented s-splitmode" role="radiogroup" aria-label="How it's split">
                <button type="button" role="radio" data-mode="equal" aria-checked="${!s.split || s.split.mode !== 'amount'}">Split equally</button>
                <button type="button" role="radio" data-mode="amount" aria-checked="${!!s.split && s.split.mode === 'amount'}">My fixed share</button>
              </div>
              <label class="field" data-equal><span class="field-label">Number of people, including you</span>
                <input class="input" name="count" type="number" inputmode="numeric" min="2" step="1" value="${s.split && s.split.count ? Number(s.split.count) : 2}"></label>
              <label class="field" data-amount hidden><span class="field-label">What you pay each time (${esc(cfg.currency)})</span>
                <input class="input" name="mine" inputmode="decimal" value="${s.split && s.split.mine != null ? esc(M.plainNumber(s.split.mine)) : ''}"></label>
            </div>
          </div>

          <div class="field"><span class="field-label">Status</span>
            <div class="segmented s-status-seg" role="radiogroup" aria-label="Status">
              ${Object.entries(M.STATUS).map(([k, v]) => `<button type="button" role="radio" data-status="${k}" aria-checked="${(s.status || 'active') === k}">${v}</button>`).join('')}
            </div></div>

          <label class="field"><span class="field-label">Notes</span>
            <textarea class="input" name="notes" rows="2" placeholder="Account email, plan name, who's in the family plan…">${esc(s.notes || '')}</textarea></label>

          ${history.length || s.nextPrice ? `
            <h3>Price history</h3>
            <ul class="s-history">
              ${s.nextPrice ? `<li><span>From ${esc(M.fmt.long(s.nextPrice.from))}</span><strong>${esc(M.money(s.nextPrice.price))}</strong></li>` : ''}
              <li><span>${s.priceFrom ? 'From ' + esc(M.fmt.long(s.priceFrom)) : 'Current'}</span><strong>${esc(M.money(s.price))}</strong></li>
              ${history.map(h => `<li><span>${h.from ? 'From ' + esc(M.fmt.long(h.from)) : 'Earlier'}</span><span>${esc(M.money(h.price))}</span></li>`).join('')}
            </ul>` : ''}

          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            ${existing ? '<button class="btn btn-text j-danger" type="button" data-delete>Delete</button>' : ''}
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">${existing ? 'Save' : 'Add'}</button>
          </div>
        </form>`;
      const form = el.querySelector('form');
      let status = s.status || 'active';
      let mode = s.split && s.split.mode === 'amount' ? 'amount' : 'equal';
      const showMode = () => {
        el.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
        el.querySelector('[data-equal]').hidden = mode !== 'equal';
        el.querySelector('[data-amount]').hidden = mode !== 'amount';
      };
      showMode();
      form.doSplit.addEventListener('change', () => { el.querySelector('[data-split]').hidden = !form.doSplit.checked; });
      form.every.addEventListener('input', () => {
        const n = Number(form.every.value) === 1;
        [...form.unit.options].forEach(o => { o.textContent = M.UNITS[o.value][n ? 0 : 1]; });
      });
      el.addEventListener('click', e => {
        const m = e.target.closest('[data-mode]');
        if (m) { mode = m.dataset.mode; showMode(); }
        const st = e.target.closest('[data-status]');
        if (st) { status = st.dataset.status; el.querySelectorAll('[data-status]').forEach(b => b.setAttribute('aria-checked', String(b === st))); }
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-price-change]')?.addEventListener('click', () => { close(); openPriceDialog(key); });
      const del = el.querySelector('[data-delete]');
      if (del) del.addEventListener('click', async () => {
        if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
        await store.remove(key); toast('Deleted'); close();
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = el.querySelector('.form-error');
        const name = form.name.value.trim();
        const price = existing ? s.price : M.parseAmount(form.price.value);
        if (!name) { err.textContent = 'Give it a name.'; return; }
        if (price == null) { err.textContent = 'Enter the price.'; return; }
        if (!M.isDate(form.anchor.value)) { err.textContent = 'Pick a billing date.'; return; }
        const next = { ...s, name, price, anchor: form.anchor.value,
          cycle: { every: Math.max(1, Math.round(Number(form.every.value) || 1)), unit: form.unit.value },
          category: form.category.value, platform: form.platform.value, notes: form.notes.value.trim() };
        if (form.doSplit.checked) {
          if (mode === 'amount') {
            const mine = M.parseAmount(form.mine.value);
            if (mine == null) { err.textContent = 'Enter what you pay.'; return; }
            next.split = { mode: 'amount', mine };
          } else {
            next.split = { mode: 'equal', count: Math.max(2, Math.round(Number(form.count.value) || 2)) };
          }
        } else next.split = null;
        if (status !== (s.status || 'active')) { next.status = status; next.statusAt = M.today(); }
        if (!existing) next.priceFrom = M.today();
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => save(key, next));
        if (!existing) toast(`Added ${name}`);
        close(true);
      });
    },
  });
}

function openPriceDialog(key) {
  const s = M.get(key);
  if (!s) return;
  return openDialog({
    label: `Change price of ${s.name}`,
    render(el, close) {
      el.innerHTML = `
        <h2>Change price</h2>
        <p>${esc(s.name)} is ${esc(M.money(M.priceOn(s)))} now. The old price is kept in its history.</p>
        <form novalidate>
          <div class="i-grid">
            <label class="field"><span class="field-label">New price (${esc(M.config().currency)})</span><input class="input" name="price" inputmode="decimal" autocomplete="off"></label>
            <label class="field"><span class="field-label">From</span><input class="input" name="from" type="date" value="${esc(M.nextBilling(s) || M.today())}"></label>
          </div>
          <p class="hint">Pick a future date if the change hasn't happened yet; it'll switch over by itself.</p>
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>
        </form>`;
      const form = el.querySelector('form');
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const price = M.parseAmount(form.price.value);
        const from = form.from.value;
        if (price == null) { el.querySelector('.form-error').textContent = 'Enter the new price.'; return; }
        if (!M.isDate(from)) { el.querySelector('.form-error').textContent = 'Pick a date.'; return; }
        const next = M.clone(s);
        // fold in any scheduled change that has already happened
        if (next.nextPrice && next.nextPrice.from <= M.today()) {
          next.priceHistory = [...(next.priceHistory || []), { price: next.price, from: next.priceFrom || null }];
          next.price = next.nextPrice.price; next.priceFrom = next.nextPrice.from;
        }
        delete next.nextPrice;
        if (from <= M.today()) {
          next.priceHistory = [...(next.priceHistory || []), { price: next.price, from: next.priceFrom || null }];
          next.price = price; next.priceFrom = from;
        } else {
          next.nextPrice = { price, from };
        }
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => save(key, next));
        toast(from <= M.today() ? `Now ${M.money(price)}` : `Switches to ${M.money(price)} on ${M.fmt.long(from)}`);
        close(true);
      });
    },
  });
}

/* ---------- settings ---------- */

const saveConfig = async mutate => { const c = M.clone(M.get('config')) || {}; mutate(c); await save('config', c); };

function openSettings() {
  return openDialog({
    label: 'Subscription settings',
    render(el, close) {
      const list = map => M.activeList(M.config()[map]).map(c => `
        <li class="j-setrow" data-map="${map}" data-id="${c.id}">
          <input class="input" value="${esc(c.name)}" data-rename aria-label="Name" maxlength="40">
          <button class="icon-btn" type="button" data-remove aria-label="Remove ${esc(c.name)}">${ICON.x}</button>
        </li>`).join('');
      const draw = () => {
        el.querySelector('[data-list=categories]').innerHTML = list('categories');
        el.querySelector('[data-list=platforms]').innerHTML = list('platforms');
        el.querySelector('[data-currency]').value = M.config().currency;
      };
      el.innerHTML = `
        <h2>Subscription settings</h2>
        <p>Names save when you leave the field. Removing one hides it from pickers.</p>
        <h3>Categories</h3><ul class="j-setlist" data-list="categories"></ul>
        <form class="j-habit-new" data-add="categories"><input class="input" name="name" placeholder="Add a category" maxlength="40"><button class="btn btn-ghost" type="submit">Add</button></form>
        <h3>Paid through</h3><ul class="j-setlist" data-list="platforms"></ul>
        <form class="j-habit-new" data-add="platforms"><input class="input" name="name" placeholder="e.g. GoPay, BCA card, Steam" maxlength="40"><button class="btn btn-ghost" type="submit">Add</button></form>
        <h3>Currency</h3><select class="input j-currency" data-currency>${M.CURRENCIES.map(c => `<option>${c}</option>`).join('')}</select>
        <h3>Backup</h3><button class="btn btn-ghost btn-sm" type="button" data-backup>Backup &amp; restore…</button>
        <div class="dialog-actions"><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
      draw();
      const upd = (map, id, patch) => saveConfig(c => { const cur = { ...M.config()[map][id] }; delete cur.id; c[map] = { ...(c[map] || {}), [id]: { ...cur, ...patch } }; });
      el.addEventListener('change', async e => {
        const r = e.target.closest('[data-map]');
        if (r && e.target.matches('[data-rename]')) { const n = e.target.value.trim(); if (n) await upd(r.dataset.map, r.dataset.id, { name: n }); else draw(); }
        if (e.target.matches('[data-currency]')) { const v = e.target.value; await saveConfig(c => { c.currency = v; }); toast('Currency saved'); }
      });
      el.addEventListener('click', async e => {
        const rm = e.target.closest('[data-remove]');
        if (rm) { const r = rm.closest('[data-map]'); await upd(r.dataset.map, r.dataset.id, { archived: true }); draw(); }
        if (e.target.closest('[data-close]')) close();
        if (e.target.closest('[data-backup]')) openBackupDialog();
      });
      el.querySelectorAll('[data-add]').forEach(f => f.addEventListener('submit', async e => {
        e.preventDefault();
        const n = f.name.value.trim(); if (!n) return;
        const map = f.dataset.add;
        const order = Math.max(0, ...Object.values(M.config()[map]).map(c => c.order ?? 0)) + 1;
        await saveConfig(c => { c[map] = { ...(c[map] || {}), [M.newId()]: { name: n, order } }; });
        f.reset(); draw();
      }));
    },
  });
}

/* ---------- wiring ---------- */

main.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'gate') { if (S.getState().status === 'error') return S.retry(); return document.querySelector('#account-slot [data-act]')?.click(); }
  if (b.dataset.act === 'new') return openSubDialog(null);
  if (b.dataset.act === 'open') return openSubDialog(b.dataset.id);
});
main.addEventListener('toggle', e => { if (e.target.classList?.contains('s-old')) ui.showOld = e.target.open; }, true);
document.querySelector('[data-act=add]')?.addEventListener('click', () => (ui.loaded ? openSubDialog(null) : toast('Unlock first')));
document.querySelector('[data-act=settings]')?.addEventListener('click', () => (ui.loaded ? openSettings() : toast('Unlock first')));

store.subscribe(list => { M.setItems(list); ui.loaded = true; render(); });
S.onChange(st => { if (st.status !== 'unlocked') { ui.loaded = false; M.setItems([]); render(); } });
mountHeader({ autoUnlock: true });
render();
