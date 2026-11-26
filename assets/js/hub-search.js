/* ==========================================================
   Search everything, on the hub. Runs on this device over the
   decrypted data of every tool; nothing is sent anywhere.
   ========================================================== */

import * as S from './core/session.js';
import { openStore } from './core/store.js';
import { esc } from './ui/dom.js';
import * as J from '../../tools/journal/model.js';
import * as IM from '../../tools/inventory/model.js';
import * as SM from '../../tools/subscriptions/model.js';
import * as SP from '../../tools/split/model.js';

const PER_GROUP = 4;
const data = { docgen: new Map() };
let opened = false;
let refresh = () => {};

/* ---------- matching ---------- */

const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
function matcher(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return hay => { const h = norm(hay); return words.every(w => h.includes(w)); };
}
/** A short piece of text around the first word that matched. */
function snippet(text, q, max = 70) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const w = norm(q).split(/\s+/).filter(Boolean)[0] || '';
  const i = Math.max(0, norm(t).indexOf(w));
  const start = Math.max(0, i - 25);
  return (start ? '…' : '') + t.slice(start, start + max) + (start + max < t.length ? '…' : '');
}

/* ---------- each tool's searchable things ---------- */

function journalHits(q, ok) {
  const out = [];
  const date = d => (J.isDate(d) ? J.fmt.short(d) : '');
  for (const [key, v] of J.state.items) {
    if (key.startsWith('task:')) {
      const subs = Object.values(v.subtasks || {}).map(s => s.text).join(' ');
      if (ok([v.title, v.notes, subs].join(' '))) out.push({ sort: v.due || '', title: v.title || 'Task', sub: ['Task', v.due ? 'due ' + date(v.due) : 'no date', v.done ? 'done' : ''].filter(Boolean).join(' · '), href: `tools/journal/#/task/${key.slice(5)}` });
    } else if (key.startsWith('log:')) {
      const cat = J.logCat(v.cat);
      const fields = Object.values(v.fields || {}).join(' ');
      if (ok([v.text, fields, cat.name, v.amount != null ? v.amount : ''].join(' '))) out.push({ sort: (v.date || '') + (v.time || ''), title: snippet(v.text || fields || cat.name, q), sub: `${cat.name} · ${date(v.date)} ${v.time || ''}${typeof v.amount === 'number' ? ' · ' + J.money(v.amount) : ''}`, href: `tools/journal/#/log/${key.slice(4)}` });
    } else if (key.startsWith('event:')) {
      if (ok([v.title, v.note, J.eventCat(v.cat).name].join(' '))) out.push({ sort: v.date || '', title: v.title, sub: `${J.eventCat(v.cat).name} · ${date(v.date)}`, href: `tools/journal/#/event/${key.slice(6)}` });
    }
  }
  return out.sort((a, b) => b.sort.localeCompare(a.sort));
}

function inventoryHits(q, ok) {
  return IM.allItems().filter(i => ok([i.name, i.notes, IM.spotName(i), i.room ? IM.room(i.room).name : '', IM.category(i.category).name].join(' ')))
    .map(i => {
      const where = [i.room ? IM.room(i.room).name : '', IM.spotName(i)].filter(Boolean).join(' › ');
      const st = i.status === 'wish' ? 'Wishlist' : i.status === 'gone' ? 'Let go' : '';
      return { title: i.name + (Number(i.qty) > 1 ? ` ×${i.qty}` : ''), sub: [where || IM.category(i.category).name, st].filter(Boolean).join(' · '), href: `tools/inventory/#/item/${i.id}` };
    });
}

function subscriptionHits(q, ok) {
  return SM.subs().filter(s => ok([s.name, s.notes, SM.platform(s.platform).name, SM.category(s.category).name].join(' ')))
    .map(s => ({ title: s.name, sub: [SM.money(SM.myCost(s)) + ' ' + SM.cycleText(s.cycle), s.status && s.status !== 'active' ? SM.STATUS[s.status] : ''].filter(Boolean).join(' · '), href: `tools/subscriptions/#/sub/${s.id}` }));
}

function splitHits(q, ok) {
  const out = [];
  for (const t of SP.trips()) {
    const people = SP.peopleOf(t).map(p => p.name);
    const receipts = SP.receiptsOf(t);
    const hay = [t.title, t.payTo, ...people, ...receipts.map(r => [r.shop, ...SP.itemsOf(r).map(i => i.name)].join(' '))].join(' ');
    if (!ok(hay)) continue;
    const hitR = receipts.find(r => ok([r.shop, ...SP.itemsOf(r).map(i => i.name)].join(' ')));
    out.push({ title: t.title || 'Split', sub: [hitR ? `receipt: ${hitR.shop}` : people.join(', '), SP.dateRange(t)].filter(Boolean).join(' · '), href: `tools/split/#/t/${t.id}` });
  }
  return out;
}

function docgenHits(q, ok) {
  const out = [];
  const tpls = new Map();
  for (const [k, v] of data.docgen) if (k.startsWith('tpl:')) tpls.set(k.slice(4), v);
  for (const [id, t] of tpls) if (ok(t.name)) out.push({ sort: '9', title: t.name, sub: 'Template', href: `tools/generate/#/t/${id}` });
  for (const [k, e] of data.docgen) {
    if (!k.startsWith('entry:')) continue;
    const vals = Object.values(e.values || {}).join(' ');
    if (!ok([vals, e.fileName].join(' '))) continue;
    const t = tpls.get(e.tpl);
    out.push({ sort: String(e.ts), title: (e.fileName || '').replace(/\.docx$/i, '') || 'Document', sub: `${t ? t.name : 'Template'} · ${new Date(e.ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`, href: `tools/generate/#/t/${e.tpl}` });
  }
  return out.sort((a, b) => b.sort.localeCompare(a.sort));
}

const GROUPS = [
  ['Journal', 'flower', journalHits],
  ['Home inventory', 'flower', inventoryHits],
  ['Subscriptions', 'sun', subscriptionHits],
  ['Bill splits', 'sun', splitHits],
  ['Generated documents', 'leaf', docgenHits],
];

/* ---------- UI ---------- */

function openStores() {
  if (opened) return;
  opened = true;
  openStore('journal').subscribe(l => { J.setItems(l); refresh(); });
  openStore('inventory').subscribe(l => { IM.setItems(l); refresh(); });
  openStore('subscriptions').subscribe(l => { SM.setItems(l); refresh(); });
  openStore('splits').subscribe(l => { SP.setItems(l); refresh(); });
  openStore('docgen').subscribe(l => { data.docgen = new Map(l.map(i => [i.key, i.data])); refresh(); });
}

export function mountSearch() {
  const box = document.getElementById('hub-search');
  if (!box) return;
  const input = box.querySelector('input');
  const out = box.querySelector('[data-results]');
  const expanded = new Set();
  let timer;

  const show = () => {
    const q = input.value.trim();
    box.classList.toggle('has-query', !!q);
    if (q.length < 2) { out.innerHTML = ''; out.hidden = true; return; }
    const ok = matcher(q);
    let total = 0;
    const html = GROUPS.map(([name, tone, fn]) => {
      const hits = fn(q, ok);
      if (!hits.length) return '';
      total += hits.length;
      const shown = expanded.has(name) ? hits : hits.slice(0, PER_GROUP);
      return `
        <section class="sr-group tone-${tone}">
          <h3>${esc(name)} <span>${hits.length}</span></h3>
          <ul>${shown.map(h => `<li><a href="${h.href}"><span class="sr-title">${esc(h.title)}</span><span class="sr-sub">${esc(h.sub)}</span></a></li>`).join('')}</ul>
          ${hits.length > shown.length ? `<button type="button" class="btn btn-text sr-more" data-more="${esc(name)}">Show all ${hits.length}</button>` : ''}
        </section>`;
    }).join('');
    out.innerHTML = total ? html : `<p class="sr-empty">Nothing found for “${esc(q)}”.</p>`;
    out.hidden = false;
  };

  refresh = () => { clearTimeout(timer); timer = setTimeout(() => { if (input.value.trim().length >= 2) show(); }, 150); };
  input.addEventListener('focus', openStores, { once: true });
  input.addEventListener('input', () => { expanded.clear(); clearTimeout(timer); timer = setTimeout(show, 120); });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; show(); input.blur(); } });
  box.querySelector('[data-clear]').addEventListener('click', () => { input.value = ''; show(); input.focus(); });
  out.addEventListener('click', e => { const b = e.target.closest('[data-more]'); if (b) { expanded.add(b.dataset.more); show(); } });
  // "/" jumps to search on a keyboard
  addEventListener('keydown', e => {
    if (e.key === '/' && !box.hidden && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); input.focus(); }
  });

  S.onChange(st => {
    box.hidden = st.status !== 'unlocked';
    if (box.hidden) { input.value = ''; out.innerHTML = ''; out.hidden = true; }
    else if (input.value) show();
  });
}
