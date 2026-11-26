/* ==========================================================
   Backups: export everything to a file, merge it back later.

   File (readable):
     { app: "rose-at-six", kind: "backup", version: 1, createdAt,
       stores: { <tool>: [ { key, data, updatedAt } ] } }
   File (encrypted): the same object, sealed with a password:
     { app, kind: "backup-encrypted", version: 1, createdAt,
       kdf, iterations, salt, iv, ct }

   Restoring merges: missing or deleted items come back; where an
   item exists on both sides, the more recently changed one wins.
   ========================================================== */

import { openStore } from './store.js';
import * as C from './crypto.js';
import { same } from './merge.js';

/** Every synced store on the site. Add new tools here. */
export const KNOWN_STORES = ['settings', 'journal', 'inventory', 'subscriptions', 'splits'];

const APP = 'rose-at-six';

function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

async function readyStore(tool) {
  const st = openStore(tool);
  await withTimeout(st.ready(), 20000, "Your data didn't finish loading. Check your connection and try again.");
  return st;
}

export async function collectBackup() {
  const stores = {};
  for (const tool of KNOWN_STORES) {
    const st = await readyStore(tool);
    stores[tool] = st.items().map(i => ({ key: i.key, data: i.data, updatedAt: i.updatedAt || 0 }));
  }
  return { app: APP, kind: 'backup', version: 1, createdAt: new Date().toISOString(), stores };
}

/** Build the file to download. With a password the contents are encrypted. */
export async function makeBackupFile(password) {
  const backup = await collectBackup();
  const body = password
    ? { app: APP, kind: 'backup-encrypted', version: 1, createdAt: backup.createdAt, ...(await C.encryptWithPassword(backup, password)) }
    : backup;
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    blob: new Blob([JSON.stringify(body, null, password ? 0 : 1)], { type: 'application/json' }),
    filename: `rose-at-six-backup-${stamp}${password ? '-encrypted' : ''}.json`,
    summary: summarize(backup),
  };
}

/** Read a chosen file. Returns { encrypted, raw } or throws a friendly error. */
export function parseBackupFile(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error("That file isn't a rose at six backup."); }
  if (!raw || raw.app !== APP) throw new Error("That file isn't a rose at six backup.");
  if (raw.kind === 'backup-encrypted') return { encrypted: true, raw };
  if (raw.kind === 'backup' && raw.stores && typeof raw.stores === 'object') return { encrypted: false, raw };
  throw new Error('This backup is from a newer or unknown version.');
}

export async function openEncryptedBackup(raw, password) {
  const backup = await C.decryptWithPassword(raw, password);
  if (!backup || backup.kind !== 'backup' || !backup.stores) throw new Error('This backup looks damaged.');
  return backup;
}

export function summarize(backup) {
  const counts = {};
  let total = 0;
  for (const [tool, list] of Object.entries(backup.stores || {})) {
    counts[tool] = Array.isArray(list) ? list.length : 0;
    total += counts[tool];
  }
  return { createdAt: backup.createdAt, counts, total };
}

/** Merge a backup into the current data. */
export async function restoreBackup(backup, onProgress = () => {}) {
  const result = { added: 0, updated: 0, unchanged: 0, skipped: 0 };
  const entries = Object.entries(backup.stores || {});
  const total = entries.reduce((n, [, l]) => n + (Array.isArray(l) ? l.length : 0), 0);
  let done = 0;
  for (const [tool, list] of entries) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(tool) || !Array.isArray(list)) continue;
    const st = await readyStore(tool);
    for (const item of list) {
      done++;
      if (!item || typeof item.key !== 'string' || !item.key || item.data === undefined) { result.skipped++; continue; }
      const cur = st.get(item.key);
      if (!cur) {
        await st.put(item.key, item.data);
        result.added++;
      } else if (same(cur.data, item.data)) {
        result.unchanged++;
      } else if ((item.updatedAt || 0) > (cur.updatedAt || 0)) {
        await st.put(item.key, item.data);
        result.updated++;
      } else {
        result.unchanged++;          // the copy here is newer; keep it
      }
      if (done % 20 === 0) onProgress(done, total);
    }
  }
  onProgress(total, total);
  return result;
}

/** Delete every item in one tool (used by "Erase all journal data"). */
export async function eraseStore(tool, onProgress = () => {}) {
  const st = await readyStore(tool);
  const keys = st.items().map(i => i.key);
  let n = 0;
  for (const key of keys) {
    await st.remove(key);
    n++;
    if (n % 20 === 0) onProgress(n, keys.length);
  }
  onProgress(keys.length, keys.length);
  return keys.length;
}

export function lastBackupAt() {
  try { return localStorage.getItem('ras-last-backup') || ''; } catch (e) { return ''; }
}
export function markBackedUp() {
  try { localStorage.setItem('ras-last-backup', new Date().toISOString()); } catch (e) { /* ignore */ }
}
