/* Home inventory views. Each returns HTML; inventory.js wires events. */

import { esc } from '../../assets/js/ui/dom.js';
import * as M from './model.js';

export const ICONS = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V9.5a3 3 0 0 1 3-3h12"/><path d="m16 3.5 3 3-3 3"/><path d="M20 13v1.5a3 3 0 0 1-3 3H5"/><path d="m8 20.5-3-3 3-3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 6 17.5l-1.6-3.2a1.4 1.4 0 0 1 2.4-1.4L8 14.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};

const qtyText = i => (Number(i.qty) > 1 ? `<span class="i-qty">×${Number(i.qty)}</span>` : '');
const where = i => {
  const r = i.room ? M.room(i.room).name : '';
  return [r, M.spotName(i)].filter(Boolean).join(' › ');
};

/* ---------- gate ---------- */

export function renderGate(st) {
  const copy = {
    signedOut: ['Your inventory is private', 'Sign in with Google to start. Everything is encrypted on your device before it syncs.', 'Sign in'],
    unconfigured: ["Sync isn't set up", 'The inventory needs sign-in to be connected first.', null],
    needsSetup: ['Set up your vault', 'Choose a passphrase to encrypt your data.', 'Set up vault'],
    locked: ['Unlock your inventory', 'Enter your passphrase to open it on this device.', 'Unlock'],
    denied: ["Can't open your data", 'The database refused access for this account.', null],
    error: ['Something went wrong', st.error || '', 'Try again'],
  }[st.status];
  if (!copy) return '<div class="gate"><span class="spinner" aria-hidden="true"></span><p>Opening your inventory…</p></div>';
  const [title, text, action] = copy;
  return `
    <div class="gate">
      <svg class="gate-blossom" aria-hidden="true"><use href="#blossom"/></svg>
      <h1>${esc(title)}</h1><p>${esc(text)}</p>
      ${action ? `<button class="btn btn-primary" type="button" data-act="gate">${esc(action)}</button>` : ''}
    </div>`;
}

/* ---------- shared row ---------- */

export function itemRow(i, { showWhere = true, showDue = true } = {}) {
  const r = M.replaceInfo(i);
  const chips = [];
  if (showDue && r && r.state !== 'ok') chips.push(`<span class="i-chip is-${r.state}">${ICONS.repeat}${esc(M.dueText(r))}</span>`);
  const x = M.expiryInfo(i);
  if (showDue && x && x.state !== 'ok') chips.push(`<span class="i-chip is-${x.state === 'expired' ? 'overdue' : 'soon'}">${ICONS.clock}${esc(M.expiryText(x))}</span>`);
  if (i.condition === 'broken') chips.push('<span class="i-chip is-broken">Broken</span>');
  else if (i.condition === 'worn') chips.push('<span class="i-chip">Worn</span>');
  if (i.sentimental) chips.push(`<span class="i-chip is-heart" title="Sentimental">${ICONS.heart}</span>`);
  const w = where(i);
  return `
    <li>
      <button type="button" class="i-row" data-act="open-item" data-id="${i.id}">
        <span class="i-row-main">
          <span class="i-name">${esc(i.name || 'Untitled')} ${qtyText(i)}</span>
          <span class="i-meta">
            ${showWhere && w ? `<span>${ICONS.pin}${esc(w)}</span>` : ''}
            ${M.isDate(i.acquired) ? `<span>${i.acquired >= M.today() ? 'new today' : `here ${esc(M.duration(i.acquired))}`}</span>` : ''}
          </span>
        </span>
        ${chips.length ? `<span class="i-chips">${chips.join('')}</span>` : ''}
      </button>
    </li>`;
}

/** Spot choices for the filter: predefined spots plus any typed ones in use. */
function spotOptions(roomId, items) {
  const opts = M.roomSpots(roomId).map(s => ({ id: s.id, name: s.name }));
  const typed = new Set(items.filter(i => i.room === roomId && !i.spotId && i.spot).map(i => i.spot));
  for (const t of typed) if (!opts.some(o => o.name === t)) opts.push({ id: 'text:' + t, name: t });
  return opts;
}

function filterSelect(name, label, list, value) {
  return `<select class="input i-filter" data-filter="${name}" aria-label="${label}">
    <option value="">${label}</option>
    ${list.map(c => `<option value="${c.id}" ${c.id === value ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
  </select>`;
}

const SORTS = { name: 'Name', newest: 'Newest', oldest: 'Longest in the house', price: 'Price', used: 'Least recently used' };

function sortItems(list, how) {
  const by = {
    name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    newest: (a, b) => (b.acquired || '').localeCompare(a.acquired || ''),
    oldest: (a, b) => (a.acquired || '9999').localeCompare(b.acquired || '9999'),
    price: (a, b) => (Number(b.price) || 0) * (Number(b.qty) || 1) - (Number(a.price) || 0) * (Number(a.qty) || 1),
    used: (a, b) => (a.lastUsed || '0000').localeCompare(b.lastUsed || '0000'),
  }[how] || ((a, b) => (a.name || '').localeCompare(b.name || ''));
  return [...list].sort(by);
}

export function matches(i, q) {
  if (!q) return true;
  const hay = [i.name, i.notes, M.spotName(i), M.category(i.category).name, i.room ? M.room(i.room).name : ''].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/* ---------- Items ---------- */

export function renderItems(ui) {
  const cfg = M.config();
  const all = M.owned();
  const spotKey = i => i.spotId || (i.spot ? 'text:' + i.spot : '');
  let list = all.filter(i => matches(i, ui.q) && (!ui.room || i.room === ui.room) && (!ui.cat || i.category === ui.cat)
    && (!ui.room || !ui.spot || spotKey(i) === ui.spot));
  list = sortItems(list, ui.sort);
  const value = all.reduce((n, i) => n + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  const due = M.attention(M.today(), 30).length;
  const toReview = all.filter(i => M.verdict(i, all).kind !== 'keep').length;

  const groups = new Map();
  for (const i of list) {
    const c = M.category(i.category);
    if (!groups.has(c.id)) groups.set(c.id, { c, items: [] });
    groups.get(c.id).items.push(i);
  }
  const ordered = [...groups.values()].sort((a, b) => (a.c.order ?? 99) - (b.c.order ?? 99));

  return `
    <section class="view i-items">
      <div class="stats">
        <div class="stat"><span>${all.reduce((n, i) => n + (Number(i.qty) || 1), 0)}</span>things</div>
        <a class="stat is-link" href="#/due"><span>${due}</span>due soon</a>
        <a class="stat is-link" href="#/declutter"><span>${toReview}</span>to review</a>
        <div class="stat"><span class="full">${esc(M.money(value))}</span><span class="compact">${esc(M.money(value, { notation: 'compact', maximumFractionDigits: 1 }))}</span>estimated value</div>
      </div>

      <div class="i-toolbar">
        <label class="searchbox">
          ${ICONS.search}
          <input type="search" class="inline-input" data-field="q" data-focus="q" value="${esc(ui.q)}" placeholder="Search name, place, notes…" aria-label="Search items" autocomplete="off">
        </label>
        <div class="i-filters">
          ${filterSelect('room', 'All rooms', M.activeList(cfg.rooms), ui.room)}
          ${ui.room ? filterSelect('spot', 'All spots', spotOptions(ui.room, all), ui.spot) : ''}
          ${filterSelect('cat', 'All categories', M.activeList(cfg.categories), ui.cat)}
          <select class="input i-filter" data-filter="sort" aria-label="Sort">
            ${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === ui.sort ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>

      ${!all.length ? `
        <div class="panel empty-panel">
          <h2>Nothing here yet</h2>
          <p>Start with the things you lose most often, or the ones that need replacing, like scissors, toothbrushes or water filters.</p>
          <button class="btn btn-primary" type="button" data-act="new-item">${ICONS.plus}Add your first item</button>
        </div>`
      : !list.length ? '<p class="empty">Nothing matches. Try another search or filter.</p>'
      : ordered.map(g => `
        <section class="panel i-group">
          <div class="panel-head"><h2>${esc(g.c.name)}</h2><span class="count">${g.items.length}</span></div>
          <ul class="i-list">${g.items.map(i => itemRow(i)).join('')}</ul>
        </section>`).join('')}
    </section>`;
}

/* ---------- Rooms ---------- */

export function renderRooms(ui) {
  const cfg = M.config();
  const all = M.owned().filter(i => matches(i, ui.q));
  const rooms = M.activeList(cfg.rooms);
  const unplaced = all.filter(i => !i.room || !cfg.rooms[i.room]);
  const cards = rooms.map(r => {
    const items = all.filter(i => i.room === r.id);
    const defined = M.roomSpots(r.id);
    const spots = new Map(defined.map(s => [s.name, []]));
    for (const i of items) {
      const s = M.spotName(i).trim() || 'No spot set';
      if (!spots.has(s)) spots.set(s, []);
      spots.get(s).push(i);
    }
    const rank = n => { const k = defined.findIndex(s => s.name === n); return n === 'No spot set' ? 1e6 : k < 0 ? 1e5 : k; };
    const spotList = [...spots.entries()].filter(([, l]) => l.length).sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
    return `
      <section class="panel i-room">
        <div class="panel-head"><h2>${esc(r.name)}</h2><span class="count">${items.length} ${items.length === 1 ? 'item' : 'items'}</span></div>
        ${spotList.length ? spotList.map(([s, list]) => `
          <div class="i-spot">
            <p class="i-spot-name">${ICONS.pin}${esc(s)}</p>
            <ul class="i-list">${sortItems(list, 'name').map(i => itemRow(i, { showWhere: false })).join('')}</ul>
          </div>`).join('') : '<p class="empty">Nothing here yet.</p>'}
      </section>`;
  });
  if (unplaced.length) {
    cards.push(`<section class="panel i-room"><div class="panel-head"><h2>No room set</h2><span class="count">${unplaced.length}</span></div>
      <ul class="i-list">${unplaced.map(i => itemRow(i, { showWhere: false })).join('')}</ul></section>`);
  }
  return `
    <section class="view">
      <label class="searchbox">
        ${ICONS.search}
        <input type="search" class="inline-input" data-field="q" data-focus="q" value="${esc(ui.q)}" placeholder="Where is my…" aria-label="Search items" autocomplete="off">
      </label>
      <div class="i-rooms">${cards.join('')}</div>
    </section>`;
}

/* ---------- Due: replacements + expiry ---------- */

export function renderDue() {
  const t = M.today();
  const rows = [];
  for (const i of M.owned()) {
    const r = M.replaceInfo(i);
    if (r) rows.push({ i, kind: 'replace', date: r.next, state: r.state === 'overdue' ? 'overdue' : (r.state === 'today' || r.state === 'soon') ? 'soon' : 'ok', pct: r.pct, text: M.dueText(r), sub: M.periodText(i.replace) });
    const x = M.expiryInfo(i);
    if (x) {
      const total = x.source === 'opened' ? Math.max(1, M.daysBetween(i.opened, x.date)) : null;
      rows.push({ i, kind: 'expiry', date: x.date, state: x.state === 'expired' ? 'overdue' : x.state, text: M.expiryText(x),
        pct: total ? Math.min(100, Math.max(0, Math.round((total - x.daysLeft) / total * 100))) : null,
        sub: x.source === 'opened' ? `opened ${M.fmt.short(i.opened)}` : 'expiry date' });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const row = d => `
    <li class="i-rep is-${d.state}">
      <button type="button" class="i-rep-main" data-act="open-item" data-id="${d.i.id}">
        <span class="i-name">${esc(d.i.name)} ${qtyText(d.i)}</span>
        <span class="i-meta">
          <span class="i-kind">${d.kind === 'replace' ? ICONS.repeat + 'Replace' : ICONS.clock + 'Expiry'}</span>
          <span>${esc(d.text)} · ${esc(M.fmt.short(d.date))}</span>
          <span>${esc(d.sub)}</span>
          ${where(d.i) ? `<span>${ICONS.pin}${esc(where(d.i))}</span>` : ''}
        </span>
        ${d.pct != null ? `<span class="i-progress"><span style="width:${d.pct}%"></span></span>` : ''}
      </button>
      ${d.kind === 'replace'
        ? `<button class="btn btn-ghost btn-sm" type="button" data-act="replaced" data-id="${d.i.id}">${ICONS.check}Replaced</button>`
        : `<button class="btn btn-ghost btn-sm" type="button" data-act="renew" data-id="${d.i.id}">${ICONS.check}New one</button>`}
    </li>`;
  const section = (title, list, empty, cls) => `
    <section class="panel ${cls}">
      <div class="panel-head"><h2>${title}</h2><span class="count">${list.length}</span></div>
      ${list.length ? `<ul class="i-reps">${list.map(row).join('')}</ul>` : `<p class="empty">${empty}</p>`}
    </section>`;
  return `
    <section class="view">
      <div class="view-title i-title"><p class="eyebrow">Due</p><h1>What needs attention</h1></div>
      ${rows.length ? '' : `<div class="panel empty-panel"><p>Nothing is being tracked yet. When adding or editing an item, turn on <strong>Replace periodically</strong> (scissors every 2 years, a toothbrush every 3 months) or <strong>Track expiry</strong> (medicine, food, skincare).</p></div>`}
      ${rows.length ? section('Overdue or expired', rows.filter(d => d.state === 'overdue'), 'Nothing overdue.', 'tone-flower') : ''}
      ${rows.length ? section('Coming up', rows.filter(d => d.state === 'soon'), 'Nothing due in the next few weeks.', 'tone-sun') : ''}
      ${rows.length ? section('Later', rows.filter(d => d.state === 'ok'), 'Nothing else tracked.', 'tone-leaf') : ''}
    </section>`;
}

/* ---------- Declutter ---------- */

export function renderDeclutter(ui) {
  const all = M.owned();
  const rated = all.map(i => ({ i, v: M.verdict(i, all) }));
  const letgo = rated.filter(x => x.v.kind === 'letgo').sort((a, b) => b.v.score - a.v.score);
  const review = rated.filter(x => x.v.kind === 'review').sort((a, b) => b.v.score - a.v.score);
  const keep = rated.filter(x => x.v.kind === 'keep');
  const goneList = M.gone();

  const card = ({ i, v }) => `
    <li class="i-dc is-${v.kind}">
      <button type="button" class="i-dc-main" data-act="open-item" data-id="${i.id}">
        <span class="i-name">${esc(i.name)} ${qtyText(i)}</span>
        ${where(i) ? `<span class="i-meta"><span>${ICONS.pin}${esc(where(i))}</span></span>` : ''}
        <span class="i-reasons">${v.reasons.map(r => `<span>${esc(r)}</span>`).join('')}</span>
      </button>
      <div class="i-dc-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-act="used" data-id="${i.id}">${ICONS.hand}Used it</button>
        <button class="btn btn-ghost btn-sm" type="button" data-act="keep" data-id="${i.id}">Keep</button>
        <button class="btn btn-primary btn-sm" type="button" data-act="let-go" data-id="${i.id}">Let go</button>
      </div>
    </li>`;

  return `
    <section class="view">
      <div class="view-title i-title"><p class="eyebrow">Declutter</p><h1>Keep or let go?</h1></div>
      <p class="i-explain">Suggestions come from condition, when you last used something, how long it's been here and duplicates. Sentimental items are never suggested. <strong>Keep</strong> hides an item from here for 6 months.</p>
      <div class="stats">
        <div class="stat"><span>${letgo.length}</span>to let go</div>
        <div class="stat"><span>${review.length}</span>to review</div>
        <div class="stat"><span>${keep.length}</span>keeping</div>
      </div>
      <section class="panel tone-flower"><div class="panel-head"><h2>Consider letting go</h2><span class="count">${letgo.length}</span></div>
        ${letgo.length ? `<ul class="i-dcs">${letgo.map(card).join('')}</ul>` : '<p class="empty">Nothing stands out. Nice.</p>'}</section>
      <section class="panel tone-sun"><div class="panel-head"><h2>Worth a look</h2><span class="count">${review.length}</span></div>
        ${review.length ? `<ul class="i-dcs">${review.map(card).join('')}</ul>` : '<p class="empty">Nothing to review.</p>'}</section>
      <details class="panel i-gone" ${ui.showGone ? 'open' : ''}>
        <summary class="panel-head"><h2>Already let go</h2><span class="count">${goneList.length}</span></summary>
        ${goneList.length ? `<ul class="i-list">${goneList.map(i => `
          <li class="i-gone-row">
            <span class="i-row-main"><span class="i-name">${esc(i.name)}</span>
              <span class="i-meta"><span>${esc(M.GONE_HOW[i.goneHow] || 'Gone')}${M.isDate(i.goneAt) ? ' · ' + esc(M.fmt.long(i.goneAt)) : ''}</span></span></span>
            <button class="btn btn-ghost btn-sm" type="button" data-act="restore" data-id="${i.id}">${ICONS.undo}Undo</button>
          </li>`).join('')}</ul>` : '<p class="empty">Nothing yet.</p>'}
      </details>
    </section>`;
}

/* ---------- Wishlist ---------- */

export function renderWishlist() {
  const list = M.wishlist().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const total = list.reduce((n, i) => n + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  return `
    <section class="view">
      <div class="view-title i-title"><p class="eyebrow">Wishlist</p><h1>Things to get</h1></div>
      <div class="view-actions"><button class="btn btn-primary btn-sm" type="button" data-act="new-wish">${ICONS.plus}Add to wishlist</button></div>
      ${list.length ? `
        <div class="stats"><div class="stat"><span>${list.length}</span>items</div><div class="stat"><span class="full">${esc(M.money(total))}</span><span class="compact">${esc(M.money(total, { notation: 'compact', maximumFractionDigits: 1 }))}</span>estimated total</div></div>
        <section class="panel"><ul class="i-reps">${list.map(i => `
          <li class="i-rep">
            <button type="button" class="i-rep-main" data-act="open-item" data-id="${i.id}">
              <span class="i-name">${esc(i.name)} ${qtyText(i)}</span>
              <span class="i-meta">
                ${Number(i.price) ? `<span>${esc(M.money(Number(i.price) * (Number(i.qty) || 1)))}</span>` : ''}
                ${where(i) ? `<span>${ICONS.pin}${esc(where(i))}</span>` : ''}
                ${i.link ? `<span>${ICONS.link}link</span>` : ''}
              </span>
            </button>
            <button class="btn btn-ghost btn-sm" type="button" data-act="bought" data-id="${i.id}">${ICONS.check}Bought</button>
          </li>`).join('')}</ul></section>`
      : '<div class="panel empty-panel"><p>Nothing on your wishlist. Add things you plan to buy, with an estimated price and where they\'ll go. When you get one, tap <strong>Bought</strong> and it moves into your inventory.</p></div>'}
    </section>`;
}
