/* Dialogs for creating and unlocking the encrypted vault. */

import * as S from '../core/session.js';
import { WrongSecretError } from '../core/crypto.js';
import { openDialog, esc, ICON, copyText, busy } from './dom.js';

const MIN_LENGTH = 10;
const BLOSSOM = '<svg class="dialog-blossom" aria-hidden="true"><use href="#blossom"/></svg>';

const rememberField = `
  <label class="check">
    <input type="checkbox" name="remember" checked>
    <span>Remember on this device
      <small>Stay unlocked here until you lock or sign out. Untick on shared devices.</small></span>
  </label>`;

function passphraseProblem(a, b) {
  if (a.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters. A short sentence works well.`;
  if (a !== b) return "The two passphrases don't match.";
  return '';
}

/* ---------- First-time setup ---------- */

export function openSetupDialog() {
  return openDialog({
    label: 'Set up your private vault',
    render(el, close) {
      el.innerHTML = `
        ${BLOSSOM}
        <h2>Set up your private vault</h2>
        <p>Everything you save is encrypted on your device before it's uploaded, so only you can read it. Not even Google can.</p>
        <p>Choose a passphrase you'll remember. <strong>It can't be reset</strong>, but you'll also get a recovery key in case you forget it.</p>
        <form novalidate>
          <label class="field">
            <span class="field-label">Passphrase</span>
            <input class="input" type="password" name="p1" autocomplete="new-password" minlength="${MIN_LENGTH}" required autofocus>
            <span class="hint">At least ${MIN_LENGTH} characters.</span>
          </label>
          <label class="field">
            <span class="field-label">Type it again</span>
            <input class="input" type="password" name="p2" autocomplete="new-password" required>
          </label>
          ${rememberField}
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            <button class="btn btn-primary" type="submit">Create vault</button>
          </div>
        </form>`;

      const form = el.querySelector('form');
      const err = el.querySelector('.form-error');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        err.textContent = '';
        const p1 = form.p1.value, p2 = form.p2.value;
        const problem = passphraseProblem(p1, p2);
        if (problem) { err.textContent = problem; return; }
        try {
          const code = await busy(form.querySelector('[type=submit]'), 'Encrypting…',
            () => S.setupVault(p1, form.remember.checked));
          showRecovery(el, code, close);
        } catch (ex) {
          err.textContent = ex.message || 'Something went wrong.';
        }
      });
    },
  });
}

function showRecovery(el, code, close) {
  el.querySelector('form')?.remove();
  el.querySelectorAll('h2, p').forEach(n => n.remove());
  const closeBtn = el.querySelector('.dialog-close');
  const box = document.createElement('div');
  box.innerHTML = `
    <h2>Save your recovery key</h2>
    <p>If you ever forget your passphrase, this key is the <strong>only</strong> way back in. Keep it somewhere safe and offline: a password manager, or written on paper.</p>
    <div class="code-box" data-code>${esc(code)}</div>
    <div class="code-actions">
      <button class="btn btn-ghost" type="button" data-copy>${ICON.copy}Copy</button>
      <button class="btn btn-ghost" type="button" data-download>${ICON.download}Download .txt</button>
    </div>
    <label class="check">
      <input type="checkbox" data-saved>
      <span>I've saved my recovery key somewhere safe</span>
    </label>
    <div class="dialog-actions">
      <button class="btn btn-primary" type="button" data-done disabled>Done</button>
    </div>`;
  el.insertBefore(box, closeBtn);
  if (closeBtn) closeBtn.hidden = true;

  box.querySelector('[data-copy]').addEventListener('click', () => copyText(code));
  box.querySelector('[data-download]').addEventListener('click', () => {
    const text = `rose at six: recovery key\n\n${code}\n\nUse this if you forget your passphrase.\nCreated ${new Date().toLocaleString()}\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'rose-at-six-recovery-key.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const done = box.querySelector('[data-done]');
  box.querySelector('[data-saved]').addEventListener('change', e => { done.disabled = !e.target.checked; });
  done.addEventListener('click', () => close(true));

  // Don't let the key be dismissed by accident.
  const dlg = el.closest('dialog');
  dlg.addEventListener('cancel', e => e.preventDefault());
}

/* ---------- Unlock ---------- */

export function openUnlockDialog() {
  return openDialog({
    label: 'Unlock your vault',
    render(el, close) {
      const unlockView = () => {
        el.querySelector('[data-view]')?.remove();
        const v = document.createElement('div');
        v.dataset.view = 'unlock';
        v.innerHTML = `
          ${BLOSSOM}
          <h2>Unlock your vault</h2>
          <p>Enter your passphrase to read and sync your data on this device.</p>
          <form novalidate>
            <label class="field">
              <span class="field-label">Passphrase</span>
              <input class="input" type="password" name="p" autocomplete="current-password" required autofocus>
            </label>
            ${rememberField}
            <div class="form-error" role="alert"></div>
            <div class="dialog-actions">
              <button class="btn btn-text" type="button" data-forgot>Forgot it?</button>
              <span class="spacer"></span>
              <button class="btn btn-primary" type="submit">Unlock</button>
            </div>
          </form>`;
        el.prepend(v);
        const form = v.querySelector('form');
        const err = v.querySelector('.form-error');
        form.p.focus();
        v.querySelector('[data-forgot]').addEventListener('click', recoverView);
        form.addEventListener('submit', async e => {
          e.preventDefault();
          err.textContent = '';
          if (!form.p.value) { err.textContent = 'Enter your passphrase.'; return; }
          try {
            await busy(form.querySelector('[type=submit]'), 'Unlocking…',
              () => S.unlock(form.p.value, form.remember.checked));
            close(true);
          } catch (ex) {
            err.textContent = ex instanceof WrongSecretError ? "That passphrase didn't work. Try again." : (ex.message || 'Something went wrong.');
            form.p.select();
          }
        });
      };

      const recoverView = () => {
        el.querySelector('[data-view]')?.remove();
        const v = document.createElement('div');
        v.dataset.view = 'recover';
        v.innerHTML = `
          ${BLOSSOM}
          <h2>Use your recovery key</h2>
          <p>Enter the recovery key you saved when you set up the vault, then choose a new passphrase.</p>
          <form novalidate>
            <label class="field">
              <span class="field-label">Recovery key</span>
              <input class="input mono" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false"
                     placeholder="XXXX-XXXX-XXXX-…" required autofocus>
            </label>
            <label class="field">
              <span class="field-label">New passphrase</span>
              <input class="input" type="password" name="p1" autocomplete="new-password" required>
              <span class="hint">At least ${MIN_LENGTH} characters.</span>
            </label>
            <label class="field">
              <span class="field-label">Type it again</span>
              <input class="input" type="password" name="p2" autocomplete="new-password" required>
            </label>
            ${rememberField}
            <div class="form-error" role="alert"></div>
            <div class="dialog-actions">
              <button class="btn btn-text" type="button" data-back>Back</button>
              <span class="spacer"></span>
              <button class="btn btn-primary" type="submit">Unlock &amp; save</button>
            </div>
          </form>`;
        el.prepend(v);
        const form = v.querySelector('form');
        const err = v.querySelector('.form-error');
        form.code.focus();
        v.querySelector('[data-back]').addEventListener('click', unlockView);
        form.addEventListener('submit', async e => {
          e.preventDefault();
          err.textContent = '';
          const problem = passphraseProblem(form.p1.value, form.p2.value);
          if (!form.code.value.trim()) { err.textContent = 'Enter your recovery key.'; return; }
          if (problem) { err.textContent = problem; return; }
          try {
            await busy(form.querySelector('[type=submit]'), 'Unlocking…',
              () => S.recover(form.code.value, form.p1.value, form.remember.checked));
            close(true);
          } catch (ex) {
            err.textContent = ex instanceof WrongSecretError ? "That recovery key didn't work. Check it and try again." : (ex.message || 'Something went wrong.');
          }
        });
      };

      unlockView();
    },
  });
}

/* ---------- Database refused access ---------- */

export function openDeniedDialog() {
  const st = S.getState();
  return openDialog({
    label: "Can't open your data",
    render(el, close) {
      el.innerHTML = `
        ${BLOSSOM}
        <h2>Can't open your data</h2>
        <p>You're signed in as <strong>${esc(st.user.email || st.user.name)}</strong>, but the database refused access.</p>
        <p>This usually means the Firestore rules haven't been published yet (see <strong>SETUP.md</strong>). Once they are, press Check again.</p>
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-out>Sign out</button>
          <button class="btn btn-primary" type="button" data-retry>Check again</button>
        </div>`;
      el.querySelector('[data-out]').addEventListener('click', async () => { await S.signOut(); close(); });
      el.querySelector('[data-retry]').addEventListener('click', async e => {
        await busy(e.currentTarget, 'Checking…', () => S.retry());
        if (S.getState().status !== 'denied') close();
      });
    },
  });
}

/* ---------- Sync isn't connected yet ---------- */

export function openUnconfiguredDialog() {
  return openDialog({
    label: "Sync isn't set up yet",
    render(el) {
      el.innerHTML = `
        ${BLOSSOM}
        <h2>Sync isn't set up yet</h2>
        <p>Sign-in needs a Firebase project to be connected to this site. Follow the steps in <strong>SETUP.md</strong> in the repository, then paste the config into <strong>assets/js/config.js</strong>.</p>
        <p>Everything else on the site works without it.</p>`;
    },
  });
}
