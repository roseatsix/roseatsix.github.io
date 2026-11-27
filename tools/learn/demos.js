/* Live demos inside the case studies. They call the site's real
   functions (imported from the tools themselves) with sample data. */

import { esc } from '../../assets/js/ui/dom.js';
import { merge3 } from '../../assets/js/core/merge.js';
import { matcher } from '../../assets/js/hub-search.js';
import * as SP from '../split/model.js';

const rp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const show = v => JSON.stringify(v, null, 2);

/* ---------- merge3 from assets/js/core/merge.js ---------- */

function merge(el) {
  const FIELDS = [['title', 'Title'], ['due', 'Due'], ['notes', 'Notes']];
  const base = { title: 'Buy flowers', due: 'Fri', notes: '' };
  const start = () => ({ phone: { ...base, due: 'Sat' }, laptop: { ...base, notes: 'Peonies' } });
  let s = start();
  const card = (dev, label) => `
    <div class="l-device"><h4>${label}</h4>${FIELDS.map(([k, l]) => `
      <label class="field"><span class="field-label">${l}</span><input class="input" data-dev="${dev}" data-k="${k}" value="${esc(s[dev][k])}"></label>`).join('')}</div>`;
  el.innerHTML = `
    <p class="l-demo-note">Both started from <code>${esc(JSON.stringify(base))}</code>. Change fields on either side; the laptop is the one saving now.</p>
    <div class="l-devices">${card('phone', 'Phone (already saved)')}${card('laptop', 'Laptop (saving now)')}</div>
    <div class="l-calls"><code>merge3(base, laptop, phone, [], conflicts)</code> returns:</div>
    <pre class="l-raw" data-out></pre>
    <p class="l-demo-note" data-conf></p>
    <button class="btn btn-ghost btn-sm" type="button" data-reset>Start over</button>`;
  const draw = () => {
    const conflicts = [];
    const out = merge3(base, s.laptop, s.phone, [], conflicts);
    el.querySelector('[data-out]').textContent = show(out);
    el.querySelector('[data-conf]').innerHTML = conflicts.length
      ? `Conflict on <strong>${conflicts.map(c => esc(c.path.join('.'))).join(', ')}</strong>: both changed it, so the laptop's value wins. The phone's stays in version history.`
      : 'No conflicts: every field was changed on one side at most.';
  };
  el.addEventListener('input', e => { const i = e.target.closest('[data-dev]'); if (i) { s[i.dataset.dev][i.dataset.k] = i.value; draw(); } });
  el.querySelector('[data-reset]').addEventListener('click', () => { s = start(); el.querySelectorAll('[data-dev]').forEach(i => { i.value = s[i.dataset.dev][i.dataset.k]; }); draw(); });
  draw();
}

/* ---------- the hub's budget rule ---------- */

function budget(el) {
  const total = 3000000, days = 30;
  el.innerHTML = `
    <label class="l-slider"><span>Spent: <strong data-sv></strong></span><input type="range" min="0" max="3600000" step="50000" value="1500000" data-spent aria-label="Spent"></label>
    <label class="l-slider"><span>Day <strong data-dv></strong> of 30</span><input type="range" min="1" max="30" value="12" data-day aria-label="Day of month"></label>
    <div class="l-rules" data-rules></div>
    <p class="l-result" data-out></p>`;
  const draw = () => {
    const spent = +el.querySelector('[data-spent]').value, day = +el.querySelector('[data-day]').value;
    el.querySelector('[data-sv]').textContent = rp(spent) + ' of ' + rp(total);
    el.querySelector('[data-dv]').textContent = day;
    const left = total - spent, used = spent / total, elapsed = day / days;
    const rules = [
      ['left < 0', left < 0, 'Over budget'],
      ['left / total < 0.15', left / total < 0.15, 'Almost used up'],
      [`used (${Math.round(used * 100)}%) > elapsed (${Math.round(elapsed * 100)}%) + 15%`, used > elapsed + 0.15, 'Spending faster than the month'],
    ];
    const hit = rules.findIndex(r => r[1]);
    el.querySelector('[data-rules]').innerHTML = rules.map((r, i) => `
      <div class="l-rule ${i === hit ? 'is-hit' : hit !== -1 && i > hit ? 'is-skip' : r[1] ? '' : 'is-no'}"><code>${esc(r[0])}</code><span>${i === hit ? '✓ ' + esc(r[2]) : hit !== -1 && i > hit ? 'not checked' : 'no'}</span></div>`).join('');
    el.querySelector('[data-out]').innerHTML = hit === -1 ? 'reason is <code>\'\'</code>, so the budget <strong>stays hidden</strong>.' : `The card shows <strong>Budget: ${esc(rules[hit][2])}</strong>.`;
  };
  el.addEventListener('input', draw);
  draw();
}

/* ---------- receiptCalc from tools/split/model.js ---------- */

function receipt(el) {
  const trip = { people: { me: { name: 'Rose' }, d: { name: 'Dina' }, a: { name: 'Ari' } } };
  const r = { mode: 'items', paidBy: 'd', service: 0, tax: 10, discount: 0, delivery: 0,
    items: { i1: { name: 'Latte', price: 40000, qty: 1, sharedBy: ['me'] }, i2: { name: 'Cake', price: 60000, qty: 1, sharedBy: ['d', 'a'] }, i3: { name: 'Fries', price: 30000, qty: 1, sharedBy: [] } } };
  const ids = Object.keys(trip.people);
  el.innerHTML = `<div data-items></div>
    <div class="l-nums">
      <label>Tax % <input class="input" type="number" min="0" max="50" value="${r.tax}" data-n="tax" inputmode="numeric"></label>
      <label>Delivery <input class="input" type="number" min="0" step="1000" value="0" data-n="delivery" inputmode="numeric"></label>
    </div>
    <div class="l-calls"><code>M.receiptCalc(trip, receipt)</code> returns:</div>
    <pre class="l-raw" data-out></pre>`;
  const draw = () => {
    el.querySelector('[data-items]').innerHTML = Object.entries(r.items).map(([iid, it]) => `
      <div class="l-item"><span class="l-item-name">${esc(it.name)} <small>${rp(it.price)}</small></span>
        <span class="choice-chips">${ids.map(p => `<button type="button" role="switch" aria-checked="${it.sharedBy.includes(p)}" data-item="${iid}" data-who="${p}">${esc(trip.people[p].name)}</button>`).join('')}</span></div>`).join('')
      + '<p class="l-demo-note">Tap names to change who shared what. Nobody selected means everyone shared it.</p>';
    const c = SP.receiptCalc(trip, r);
    const named = Object.fromEntries(Object.entries(c.shares).map(([id, v]) => [trip.people[id].name, v]));
    el.querySelector('[data-out]').textContent = show({ subtotal: c.subtotal, tax: c.tax, delivery: c.delivery, total: c.total, shares: named });
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-item]');
    if (!b) return;
    const it = r.items[b.dataset.item];
    it.sharedBy = it.sharedBy.includes(b.dataset.who) ? it.sharedBy.filter(x => x !== b.dataset.who) : [...it.sharedBy, b.dataset.who];
    draw();
  });
  el.addEventListener('input', e => { const n = e.target.closest('[data-n]'); if (n) { r[n.dataset.n] = Math.max(0, Number(n.value) || 0); draw(); } });
  draw();
}

/* ---------- matcher from assets/js/hub-search.js ---------- */

function search(el) {
  const things = ['Kitchen scissors', 'Café in Seminyak', 'Pay electricity', 'Netflix', 'Grandma\'s letters', 'Phone charger', 'Renew passport', 'Coffee with Dina'];
  el.innerHTML = `
    <label class="searchbox"><input class="inline-input" data-q value="cafe" aria-label="Search words" autocomplete="off" autocapitalize="off"></label>
    <div class="l-calls"><code>const ok = matcher(q);</code> then <code>ok(text)</code> for each:</div>
    <ul class="l-tasks" data-list></ul>`;
  const draw = () => {
    const q = el.querySelector('[data-q]').value;
    const ok = matcher(q);
    el.querySelector('[data-list]').innerHTML = things.map(t => {
      const yes = ok(t);
      return `<li class="${yes ? 'is-keep' : 'is-skip'}"><span class="l-task-obj">ok(${esc(JSON.stringify(t))})</span><span class="l-verdict">${yes}</span></li>`;
    }).join('');
  };
  el.addEventListener('input', draw);
  draw();
}

export const DEMOS = { merge, budget, receipt, search };
