/* ==========================================================
   Shared header behaviour for every page:
   theme toggle, appearance panel, account button + menu,
   and syncing appearance between devices.

   Each page includes the header markup (see index.html) and calls
   mountHeader(). Pass { autoUnlock: true } on pages that need data,
   so the unlock dialog opens by itself.
   ========================================================== */

import * as S from '../core/session.js';
import { openStore, onSyncStatus } from '../core/store.js';
import { same } from '../core/merge.js';
import { esc, ICON, toast } from './dom.js';
import { mountThemeControls } from './theme-controls.js';
import {
  openSetupDialog, openUnlockDialog, openDeniedDialog, openUnconfiguredDialog,
} from './vault-dialogs.js';

const T = window.RAS_THEME;

const SYNC_TEXT = {
  synced: 'All changes synced',
  syncing: 'Syncing…',
  pending: 'Waiting to sync',
  offline: "Offline: changes are saved on this device and will sync when you're back",
  error: "Couldn't sync, retrying soon",
};

export function mountHeader({ autoUnlock = false } = {}) {
  mountThemeControls();

  const slot = document.getElementById('account-slot');
  let justSignedIn = false;
  let openFlow = null;
  let syncState = { state: 'synced', pending: 0 };

  const runFlow = fn => {
    if (openFlow) return openFlow;
    openFlow = Promise.resolve(fn()).finally(() => { openFlow = null; });
    return openFlow;
  };

  const flowFor = status => ({
    unconfigured: openUnconfiguredDialog,
    needsSetup: openSetupDialog,
    locked: openUnlockDialog,
    denied: openDeniedDialog,
  }[status]);

  async function doSignIn(button) {
    button.disabled = true;
    try {
      justSignedIn = await S.signIn();
    } catch (e) {
      toast(e.message);
    } finally {
      button.disabled = false;
    }
  }

  function render(st) {
    closeMenu();
    const u = st.user;
    switch (st.status) {
      case 'loading':
        slot.innerHTML = `<span class="chip" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span class="visually-hidden">Loading account</span></span>`;
        break;
      case 'unconfigured':
      case 'signedOut':
        slot.innerHTML = `<button class="btn btn-ghost" type="button" data-act="signin">Sign in</button>`;
        break;
      case 'needsSetup':
        slot.innerHTML = `<button class="btn btn-primary" type="button" data-act="flow">${ICON.lock}Set up vault</button>`;
        break;
      case 'locked':
        slot.innerHTML = `<button class="btn btn-primary" type="button" data-act="flow">${ICON.unlock}Unlock</button>`;
        break;
      case 'denied':
        slot.innerHTML = avatarButton(u, null);
        break;
      case 'unlocked':
        slot.innerHTML = avatarButton(u, syncState.state);
        break;
      case 'error':
        slot.innerHTML = `<button class="btn btn-ghost" type="button" data-act="retry" title="${esc(st.error)}">${ICON.refresh}Retry</button>`;
        toast(st.error);
        break;
    }

    // After an explicit sign-in, walk straight into the next step.
    const flow = flowFor(st.status);
    if (flow && st.status !== 'unconfigured' && (justSignedIn || (autoUnlock && st.status !== 'denied'))) {
      justSignedIn = false;
      runFlow(flow);
    }
    if (st.status === 'unlocked' || st.status === 'signedOut') justSignedIn = false;
  }

  slot.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const st = S.getState();
    switch (b.dataset.act) {
      case 'signin':
        if (st.status === 'unconfigured') runFlow(openUnconfiguredDialog);
        else doSignIn(b);
        break;
      case 'flow': runFlow(flowFor(st.status)); break;
      case 'retry': S.retry(); break;
      case 'menu': toggleMenu(); break;
    }
  });

  /* ----- account menu ----- */

  function toggleMenu() {
    const existing = slot.querySelector('.menu');
    if (existing) return closeMenu();
    const st = S.getState();
    const u = st.user;
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    const status = st.status === 'unlocked'
      ? `<div class="menu-status"><span class="sync-dot" data-state="${syncState.state}"></span><span data-sync-text>${esc(syncText())}</span></div>`
      : '';
    menu.innerHTML = `
      <div class="menu-head">
        <p class="menu-name">${esc(u.name || u.email)}</p>
        ${u.name && u.email ? `<p class="menu-sub">${esc(u.email)}</p>` : ''}
        ${status}
      </div>
      ${st.status === 'denied' ? `
        <p class="menu-note">This account doesn't have access to this space.</p>
        <button class="menu-item" role="menuitem" data-m="denied">${ICON.lock}Details</button>` : ''}
      ${st.status === 'unlocked' ? `
        <button class="menu-item" role="menuitem" data-m="lock">${ICON.lock}Lock on this device</button>` : ''}
      <button class="menu-item" role="menuitem" data-m="signout">${ICON.logout}Sign out</button>`;
    slot.appendChild(menu);
    slot.querySelector('[data-act=menu]').setAttribute('aria-expanded', 'true');
    menu.querySelector('.menu-item').focus();

    menu.addEventListener('click', async e => {
      const item = e.target.closest('[data-m]');
      if (!item) return;
      closeMenu();
      if (item.dataset.m === 'lock') { await S.lock(); toast('Locked. Your passphrase is needed again on this device.'); }
      if (item.dataset.m === 'signout') { await S.signOut(); toast('Signed out'); }
      if (item.dataset.m === 'denied') runFlow(openDeniedDialog);
    });
    setTimeout(() => document.addEventListener('click', outside), 0);
    document.addEventListener('keydown', onKey);
  }

  function closeMenu() {
    const menu = slot.querySelector('.menu');
    if (!menu) return;
    menu.remove();
    slot.querySelector('[data-act=menu]')?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside);
    document.removeEventListener('keydown', onKey);
  }

  function outside(e) { if (!slot.contains(e.target)) closeMenu(); }
  function onKey(e) { if (e.key === 'Escape') { closeMenu(); slot.querySelector('[data-act=menu]')?.focus(); } }

  function syncText() {
    const base = SYNC_TEXT[syncState.state] || '';
    return syncState.pending && syncState.state !== 'synced' ? `${base} (${syncState.pending})` : base;
  }

  onSyncStatus(s => {
    syncState = s;
    const dot = slot.querySelector('[data-act=menu] .sync-dot');
    if (dot) {
      dot.dataset.state = s.state;
      dot.parentElement.title = syncText();
    }
    const menuDot = slot.querySelector('.menu .sync-dot');
    if (menuDot) menuDot.dataset.state = s.state;
    const txt = slot.querySelector('[data-sync-text]');
    if (txt) txt.textContent = syncText();
  });

  S.onChange(render);
  S.start();
  syncAppearance();
}

function avatarButton(u, sync) {
  const initial = esc((u.name || u.email || '?').trim().charAt(0).toUpperCase());
  const face = u.photo
    ? `<img class="avatar" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="avatar-initial">${initial}</span>`;
  const dot = sync ? `<span class="sync-dot" data-state="${sync}"></span>` : '';
  return `<button class="icon-btn has-avatar" type="button" data-act="menu" aria-haspopup="menu" aria-expanded="false"
            aria-label="Account: ${esc(u.name || u.email)}" title="${esc(sync ? SYNC_TEXT[sync] : 'No access')}">${face}${dot}</button>`;
}

/* ----- keep palette + custom colours in sync across devices ----- */

function syncAppearance() {
  const settings = openStore('settings');
  const pick = p => ({ palette: p.palette, custom: p.custom || {} });
  let timer;

  settings.subscribe(items => {
    const remote = items.find(i => i.key === 'appearance');
    const local = T.read();
    if (!remote) {
      // Nothing synced yet: upload this device's choice if it isn't the default.
      if (!same(pick(local), { palette: 'rose', custom: {} })) {
        settings.put('appearance', pick(local)).catch(err => console.warn('Could not save appearance', err));
      }
      return;
    }
    if (!T.PALETTES[remote.data.palette]) return;
    if (!same(pick(local), pick(remote.data))) {
      T.save({ ...local, ...pick(remote.data) }, { source: 'sync' });
    }
  });

  window.addEventListener('ras:prefs', e => {
    const { source, prefs } = e.detail;
    if (source !== 'user' || S.getState().status !== 'unlocked') return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const remote = settings.get('appearance');
      if (remote && same(remote.data, pick(prefs))) return;
      settings.put('appearance', pick(prefs)).catch(err => console.warn('Could not save appearance', err));
    }, 800);
  });
}
