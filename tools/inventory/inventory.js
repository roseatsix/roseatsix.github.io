/* Home inventory: routing, data subscription and interactions. */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { toast, reveal } from '../../assets/js/ui/dom.js';
import * as M from './model.js';
import * as V from './views.js';
import * as D from './dialogs.js';

const main = document.getElementById('inventory');
const tabs = document.querySelector('.tabs');
const store = openStore('inventory');
D.useStore(store);

const ui = { loaded: false, view: 'items', q: '', room: '', spot: '', cat: '', sort: 'name', showGone: false };
const VIEWS = ['items', 'rooms', 'due', 'declutter', 'wishlist'];

function onRoute() {
  const [, kind, id] = (location.hash || '').split('/');
  if (kind === 'item' && M.get('item:' + id)) {
    const st = M.get('item:' + id).status;
    history.replaceState(null, '', st === 'wish' ? '#/wishlist' : st === 'gone' ? '#/declutter' : '#/items');
    ui.reveal = `[data-id="${id}"]`;
  }
  let v = (location.hash || '').split('/')[1];
  if (v === 'replace') v = 'due';   // old links
  ui.view = VIEWS.includes(v) ? v : 'items';
  tabs.querySelectorAll('[data-tab]').forEach(a => a.setAttribute('aria-current', a.dataset.tab === ui.view ? 'page' : 'false'));
  render();
  window.scrollTo({ top: 0 });
  if (ui.reveal) { const sel = ui.reveal; ui.reveal = null; setTimeout(() => reveal(sel, main), 60); }
}

function render() {
  if (!ui.loaded) { main.innerHTML = V.renderGate(S.getState()); return; }
  const f = document.activeElement && main.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
  const sel = f ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  main.innerHTML =
    ui.view === 'rooms' ? V.renderRooms(ui)
    : ui.view === 'due' ? V.renderDue()
    : ui.view === 'declutter' ? V.renderDeclutter(ui)
    : ui.view === 'wishlist' ? V.renderWishlist()
    : V.renderItems(ui);
  if (f) {
    const el = main.querySelector(`[data-focus="${CSS.escape(f)}"]`);
    if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(...sel); } catch (e) { /* ignore */ } }
  }
}

const fail = err => toast("Couldn't save. " + (err && err.message || ''));

main.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'gate':
      if (S.getState().status === 'error') return S.retry();
      return document.querySelector('#account-slot [data-act]')?.click();
    case 'new-item': return D.openItemDialog(null);
    case 'new-wish': return D.openItemDialog(null, { status: 'wish', acquired: null, condition: '' });
    case 'open-item': return D.openItemDialog(id);
    case 'used': return D.markUsed(id).catch(fail);
    case 'replaced': return D.markReplaced(id).catch(fail);
    case 'renew': return D.openRenewDialog(id);
    case 'keep': return D.markKept(id).catch(fail);
    case 'let-go': return D.openLetGoDialog(id);
    case 'bought': return D.markBought(id).catch(fail);
    case 'restore': ui.showGone = true; return D.restoreItem(id).catch(fail);
  }
});

main.addEventListener('input', e => {
  if (e.target.dataset.field === 'q') {
    ui.q = e.target.value;
    clearTimeout(ui.t);
    ui.t = setTimeout(render, 120);
  }
});

main.addEventListener('change', e => {
  const f = e.target.dataset.filter;
  if (f) { ui[f] = e.target.value; if (f === 'room') ui.spot = ''; render(); }
});

main.addEventListener('toggle', e => {
  if (e.target.classList?.contains('i-gone')) ui.showGone = e.target.open;
}, true);

document.querySelector('[data-act=add]')?.addEventListener('click', () => {
  if (!ui.loaded) return toast('Unlock first');
  if (ui.view === 'wishlist') D.openItemDialog(null, { status: 'wish', acquired: null, condition: '' });
  else D.openItemDialog(null);
});
document.querySelector('[data-act=settings]')?.addEventListener('click', () => {
  if (ui.loaded) D.openSettingsDialog(); else toast('Unlock first');
});

store.subscribe(list => {
  M.setItems(list);
  const first = !ui.loaded;
  ui.loaded = true;
  if (first) onRoute();
  else render();
});

S.onChange(st => {
  if (st.status !== 'unlocked') { ui.loaded = false; M.setItems([]); render(); }
});

addEventListener('hashchange', () => { if (ui.loaded) onRoute(); });

mountHeader({ autoUnlock: true });
render();
