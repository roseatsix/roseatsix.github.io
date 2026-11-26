/* Backup & restore dialog (shared by every page). */

import * as S from '../core/session.js';
import * as B from '../core/backup.js';
import { WrongSecretError } from '../core/crypto.js';
import { openDialog, esc, toast, busy } from './dom.js';

const MIN_PASSWORD = 8;
const TOOL_NAMES = { journal: ['journal item', 'journal items'], inventory: ['inventory item', 'inventory items'], subscriptions: ['subscription item', 'subscription items'], splits: ['split item', 'split items'], docgen: ['template item', 'template items'], settings: ['setting', 'settings'] };

const fmtWhen = iso => {
  const d = new Date(iso);
  return isNaN(d) ? 'an unknown date' : d.toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function describeCounts(summary) {
  return Object.entries(summary.counts).filter(([, n]) => n)
    .map(([tool, n]) => `${n} ${(TOOL_NAMES[tool] || [tool, tool])[n === 1 ? 0 : 1]}`).join(', ') || 'nothing';
}

export function openBackupDialog() {
  if (S.getState().status !== 'unlocked') { toast('Unlock first to back up or restore'); return Promise.resolve(); }
  return openDialog({
    label: 'Backup & restore',
    render(el) {
      const last = B.lastBackupAt();
      el.innerHTML = `
        <h2>Backup &amp; restore</h2>
        <p>A backup is a single file with everything on this site: your journal, inventory, subscriptions, bill splits, document templates, their settings and your appearance.</p>

        <h3>Make a backup</h3>
        <form data-make novalidate>
          <div class="segmented b-format" role="radiogroup" aria-label="Backup format">
            <button type="button" role="radio" aria-checked="true" data-format="encrypted">Encrypted</button>
            <button type="button" role="radio" aria-checked="false" data-format="plain">Readable</button>
          </div>
          <p class="hint" data-format-hint></p>
          <div data-password>
            <label class="field"><span class="field-label">Backup password</span>
              <input class="input" type="password" name="p1" autocomplete="new-password"></label>
            <label class="field"><span class="field-label">Type it again</span>
              <input class="input" type="password" name="p2" autocomplete="new-password"></label>
          </div>
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions">
            <span class="hint b-last">${last ? `Last backup on this device: ${esc(fmtWhen(last))}` : ''}</span>
            <span class="spacer"></span>
            <button class="btn btn-primary" type="submit">Download backup</button>
          </div>
        </form>

        <h3>Restore from a backup</h3>
        <p>Restoring <strong>merges</strong>: anything missing or deleted comes back, and where something exists in both, whichever was changed more recently is kept.</p>
        <div data-restore>
          <label class="btn btn-ghost b-file">Choose backup file…<input type="file" accept=".json,application/json" hidden data-file></label>
        </div>`;

      /* --- make --- */
      const make = el.querySelector('[data-make]');
      let format = 'encrypted';
      const setFormat = f => {
        format = f;
        make.querySelectorAll('[data-format]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.format === f)));
        make.querySelector('[data-password]').hidden = f !== 'encrypted';
        make.querySelector('[data-format-hint]').textContent = f === 'encrypted'
          ? "Locked with a password, so it's safe to keep in Google Drive or email. You'll need the password to restore it."
          : 'Anyone who opens this file can read everything in it. Keep it somewhere private.';
      };
      setFormat('encrypted');
      make.addEventListener('click', e => { const b = e.target.closest('[data-format]'); if (b) setFormat(b.dataset.format); });
      make.addEventListener('submit', async e => {
        e.preventDefault();
        const err = make.querySelector('.form-error');
        err.textContent = '';
        let password = null;
        if (format === 'encrypted') {
          password = make.p1.value;
          if (password.length < MIN_PASSWORD) { err.textContent = `Use at least ${MIN_PASSWORD} characters.`; return; }
          if (password !== make.p2.value) { err.textContent = "The two passwords don't match."; return; }
        }
        try {
          const file = await busy(make.querySelector('[type=submit]'), 'Preparing…', () => B.makeBackupFile(password));
          const a = document.createElement('a');
          a.href = URL.createObjectURL(file.blob);
          a.download = file.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          B.markBackedUp();
          make.querySelector('.b-last').textContent = `Backed up ${describeCounts(file.summary)} just now.`;
          make.p1.value = make.p2.value = '';
          toast('Backup downloaded');
        } catch (ex) {
          err.textContent = ex.message || "Couldn't make the backup.";
        }
      });

      /* --- restore --- */
      const area = el.querySelector('[data-restore]');
      const chooser = area.innerHTML;
      const reset = () => { area.innerHTML = chooser; };

      const showSummary = backup => {
        const sum = B.summarize(backup);
        area.innerHTML = `
          <div class="b-summary">
            <p><strong>Backup from ${esc(fmtWhen(sum.createdAt))}</strong><br>${esc(describeCounts(sum))}</p>
            <div class="form-error" role="alert"></div>
            <div class="dialog-actions">
              <button class="btn btn-ghost" type="button" data-cancel>Choose another</button>
              <button class="btn btn-primary" type="button" data-go>Restore</button>
            </div>
          </div>`;
        area.querySelector('[data-cancel]').addEventListener('click', reset);
        area.querySelector('[data-go]').addEventListener('click', async e => {
          const btn = e.currentTarget;
          try {
            const r = await busy(btn, 'Restoring…', () => B.restoreBackup(backup, (n, t) => {
              btn.lastChild.textContent = ` Restoring ${n} of ${t}…`;
            }));
            area.innerHTML = `<div class="b-summary"><p><strong>Restore finished.</strong><br>
              ${r.added} brought back, ${r.updated} updated to the backup's newer version, ${r.unchanged} already up to date${r.skipped ? `, ${r.skipped} skipped` : ''}.</p></div>`;
            toast('Restore finished');
          } catch (ex) {
            area.querySelector('.form-error').textContent = ex.message || "Couldn't restore.";
          }
        });
      };

      const askPassword = raw => {
        area.innerHTML = `
          <form class="b-summary" novalidate>
            <p>This backup is encrypted${raw.createdAt ? ` (made ${esc(fmtWhen(raw.createdAt))})` : ''}. Enter its password.</p>
            <label class="field"><span class="field-label">Backup password</span>
              <input class="input" type="password" name="pw" autocomplete="off"></label>
            <div class="form-error" role="alert"></div>
            <div class="dialog-actions">
              <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
              <button class="btn btn-primary" type="submit">Open backup</button>
            </div>
          </form>`;
        const f = area.querySelector('form');
        area.querySelector('[data-cancel]').addEventListener('click', reset);
        f.addEventListener('submit', async e => {
          e.preventDefault();
          try {
            const backup = await busy(f.querySelector('[type=submit]'), 'Opening…', () => B.openEncryptedBackup(raw, f.pw.value));
            showSummary(backup);
          } catch (ex) {
            f.querySelector('.form-error').textContent = ex instanceof WrongSecretError ? "That password didn't work." : (ex.message || "Couldn't open the backup.");
          }
        });
      };

      area.addEventListener('change', async e => {
        const input = e.target.closest('[data-file]');
        if (!input || !input.files[0]) return;
        try {
          const text = await input.files[0].text();
          const { encrypted, raw } = B.parseBackupFile(text);
          if (encrypted) askPassword(raw); else showSummary(raw);
        } catch (ex) {
          toast(ex.message || "Couldn't read that file.");
          input.value = '';
        }
      });
    },
  });
}
