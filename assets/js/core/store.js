/* ==========================================================
   Encrypted, item-level sync.

   Each item (a journal day, a subscription, an inventory entry…)
   is its own Firestore document with its own revision number:

     users/{uid}/items/{docId}                ← latest version
     users/{uid}/items/{docId}/versions/{rev} ← full history

   docId and the tool tag are HMACs, and the contents are
   AES-GCM encrypted, so the server only sees opaque blobs.

   Saving never overwrites blindly. A change is written in a
   transaction against the revision it was based on; if another
   device got there first, the two versions are merged field by
   field (see merge.js). Edits made offline wait in an encrypted
   outbox on this device and are sent when you're back online.

   Usage (in a tool page):
     const notes = openStore('journal');
     notes.subscribe(items => render(items));
     await notes.put('2026-11-26', { mood: 'calm', text: '…' });
     await notes.remove('2026-11-26');
     const versions = await notes.history('2026-11-26');
   ========================================================== */

import * as S from './session.js';
import * as C from './crypto.js';
import { loadFirebase } from './firebase.js';
import { idbSet, idbDel, idbEntries } from './idb.js';
import { mergeItem, merge3, same } from './merge.js';

const DEVICE = (() => {
  try {
    let d = localStorage.getItem('ras-device');
    if (!d) { d = crypto.randomUUID().slice(0, 8); localStorage.setItem('ras-device', d); }
    return d;
  } catch (e) {
    return 'device';
  }
})();

const RETRY_MS = 15000;
const itemAad = docId => 'ras/item/v1/' + docId;
const OUTBOX_AAD = 'ras/outbox/v1';
const stateOf = x => ({ data: x && x.data !== undefined ? x.data : null, deleted: !!(x && x.deleted) });

/* ---------- Overall sync status (for the header indicator) ---------- */

const stores = new Set();
const statusListeners = new Set();
let lastStatus = null;

export function getSyncStatus() {
  let pending = 0, syncing = false, error = null;
  for (const s of stores) {
    if (!s.running) continue;
    pending += s.local.size;
    syncing = syncing || s.flushing;
    error = error || s.error;
  }
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const state = offline ? 'offline' : syncing ? 'syncing' : error ? 'error' : pending ? 'pending' : 'synced';
  return { state, pending, error: error ? String(error.message || error) : null };
}

export function onSyncStatus(fn) {
  statusListeners.add(fn);
  fn(getSyncStatus());
  return () => statusListeners.delete(fn);
}

function notifyStatus() {
  const s = getSyncStatus();
  const key = JSON.stringify(s);
  if (key === lastStatus) return;
  lastStatus = key;
  for (const fn of [...statusListeners]) fn(s);
}

addEventListener('online', () => { for (const s of stores) s.flushSoon(0); notifyStatus(); });
addEventListener('offline', notifyStatus);

/* ---------- Store ---------- */

export function openStore(tool) {
  return new Store(tool);
}

class Store {
  constructor(tool) {
    this.tool = tool;
    this.remote = new Map();   // docId → { docId, key, rev, data, deleted, updatedAt, device }
    this.local = new Map();    // docId → outbox entry { docId, key, base, local, seq, at }
    this.listeners = new Set();
    this.conflictListeners = new Set();
    this.running = false;
    this.flushing = false;
    this.again = false;
    this.error = null;
    this.generation = 0;
    this._resetReady();
    stores.add(this);
    this.offSession = S.onChange(st => (st.status === 'unlocked' ? this._start() : this._stop()));
  }

  /* ----- public API ----- */

  /** Calls fn(items) now and on every change. Returns an unsubscribe function. */
  subscribe(fn) {
    this.listeners.add(fn);
    if (this.isReady) fn(this.items());
    return () => this.listeners.delete(fn);
  }

  /** fn({ key, fields }) when the same field was edited on two devices. */
  onConflict(fn) {
    this.conflictListeners.add(fn);
    return () => this.conflictListeners.delete(fn);
  }

  /** Resolves once the first data has loaded (after unlock). */
  ready() { return this.readyPromise; }

  items() {
    const out = [];
    const ids = new Set([...this.remote.keys(), ...this.local.keys()]);
    for (const id of ids) {
      const r = this.remote.get(id);
      const l = this.local.get(id);
      const cur = l ? { key: l.key, ...stateOf(l.local) } : r;
      if (!cur || cur.deleted) continue;
      out.push({
        key: cur.key,
        data: cur.data,
        rev: r ? r.rev : 0,
        updatedAt: l ? l.at : r.updatedAt,
        pending: !!l,
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(key) {
    return this.items().find(i => i.key === key) || null;
  }

  async put(key, data) {
    await this._write(key, { data, deleted: false });
  }

  async remove(key) {
    const cur = this.get(key);
    await this._write(key, { data: cur ? cur.data : null, deleted: true });
  }

  /** Every saved version of an item, newest first. */
  async history(key, max = 50) {
    await this.ready();
    const { db, F } = this.fb;
    const docId = await this._docId(key);
    const q = F.query(F.collection(db, 'users', this.uid, 'items', docId, 'versions'), F.orderBy('rev', 'desc'), F.limit(max));
    const snap = await F.getDocs(q);
    const out = [];
    for (const d of snap.docs) {
      const v = d.data();
      try {
        const plain = await this._open(docId, v);
        out.push({ rev: v.rev, ...stateOf(plain), device: v.device, at: v.updatedAt ? v.updatedAt.toMillis() : null });
      } catch (e) { /* unreadable version; skip */ }
    }
    return out;
  }

  /** Bring back an older version as a new edit. */
  async restore(key, rev) {
    const v = (await this.history(key, 500)).find(x => x.rev === rev);
    if (!v) throw new Error('Version not found');
    await this._write(key, { data: v.data, deleted: false });
  }

  close() {
    this._stop();
    this.offSession();
    stores.delete(this);
    notifyStatus();
  }

  /* ----- lifecycle ----- */

  _resetReady() {
    this.isReady = false;
    this.readyPromise = new Promise(res => { this._resolveReady = res; });
  }

  async _start() {
    if (this.running) return;
    this.running = true;
    const gen = ++this.generation;
    try {
      this.keys = S.getKeys();
      this.uid = S.getState().user.uid;
      this.fb = await loadFirebase();
      this.tag = await C.tag(this.keys.idKey, 'tool\u0000' + this.tool);
      const prefix = `${this.uid}/${this.tag}/`;
      for (const [, sealed] of await idbEntries('outbox', prefix)) {
        try {
          const e = await C.decryptJSON(this.keys.dataKey, sealed.iv, sealed.ct, OUTBOX_AAD);
          this.local.set(e.docId, e);
        } catch (e) { /* written with other keys; ignore */ }
      }
      if (gen !== this.generation) return;

      const { db, F } = this.fb;
      this.coll = F.collection(db, 'users', this.uid, 'items');
      this.chain = Promise.resolve();
      this.unsubSnap = F.onSnapshot(
        F.query(this.coll, F.where('t', '==', this.tag)),
        snap => { this.chain = this.chain.then(() => this._onSnapshot(snap, gen)); },
        err => { this.error = err; notifyStatus(); console.error(err); },
      );
    } catch (e) {
      console.error(e);
      this.error = e;
      notifyStatus();
    }
  }

  _stop() {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    if (this.unsubSnap) this.unsubSnap();
    this.unsubSnap = null;
    clearTimeout(this.timer);
    this.remote.clear();
    this.local.clear();
    this.keys = null;
    this.error = null;
    this._resetReady();
    this._emit();
    notifyStatus();
  }

  async _onSnapshot(snap, gen) {
    for (const change of snap.docChanges()) {
      if (gen !== this.generation) return;
      const id = change.doc.id;
      if (change.type === 'removed') { this.remote.delete(id); continue; }
      const d = change.doc.data();
      const known = this.remote.get(id);
      if (known && known.rev >= d.rev) continue;
      try {
        const plain = await this._open(id, d);
        this.remote.set(id, {
          docId: id, key: plain.key, rev: d.rev, ...stateOf(plain), device: d.device,
          updatedAt: d.updatedAt ? d.updatedAt.toMillis() : Date.now(),
        });
      } catch (e) {
        console.warn('Could not decrypt item', id, e);
      }
    }
    if (gen !== this.generation) return;
    this.error = null;
    if (!this.isReady) { this.isReady = true; this._resolveReady(); }
    this._emit();
    this.flushSoon(0);
  }

  _emit() {
    const items = this.items();
    for (const fn of [...this.listeners]) {
      try { fn(items); } catch (e) { console.error(e); }
    }
    notifyStatus();
  }

  /* ----- writing ----- */

  async _docId(key) {
    return C.tag(this.keys.idKey, this.tool + '\u0000' + key, 32);
  }

  async _open(docId, d) {
    return C.decryptJSON(this.keys.dataKey, d.iv.toUint8Array(), d.ct.toUint8Array(), itemAad(docId));
  }

  async _saveOutbox(entry) {
    const sealed = await C.encryptJSON(this.keys.dataKey, entry, OUTBOX_AAD);
    await idbSet('outbox', `${this.uid}/${this.tag}/${entry.docId}`, sealed);
  }

  async _write(key, next) {
    if (typeof key !== 'string' || !key) throw new Error('Item key must be a non-empty string');
    if (!this.running) throw new Error('Unlock your vault first');
    await this.ready();
    const docId = await this._docId(key);
    const prev = this.local.get(docId);
    let entry;
    if (prev) {
      entry = { ...prev, local: next, seq: prev.seq + 1, at: Date.now() };
    } else {
      const r = this.remote.get(docId);
      entry = {
        docId, key,
        base: r ? { rev: r.rev, data: r.data, deleted: r.deleted } : null,
        local: next, seq: 1, at: Date.now(),
      };
    }
    this.local.set(docId, entry);
    await this._saveOutbox(entry);
    this._emit();
    this.flushSoon(0);
  }

  flushSoon(delay = 0) {
    if (!this.running) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._flush(), delay);
  }

  async _flush() {
    if (!this.running || !this.isReady) return;
    if (this.flushing) { this.again = true; return; }
    if (navigator.onLine === false) { notifyStatus(); return; }
    if (!this.local.size) return;

    this.flushing = true;
    this.again = false;
    notifyStatus();
    const gen = this.generation;
    try {
      for (const entry of [...this.local.values()]) {
        if (gen !== this.generation) return;
        await this._push(entry, gen);
      }
      this.error = null;
    } catch (e) {
      console.warn('Sync failed, will retry', e);
      this.error = e;
      this.flushSoon(RETRY_MS);
    } finally {
      this.flushing = false;
      notifyStatus();
      if (this.again && !this.error) this.flushSoon(0);
    }
  }

  async _push(entry, gen) {
    const { db, F } = this.fb;
    const ref = F.doc(this.coll, entry.docId);
    let conflicts = [];
    let written = null;

    await F.runTransaction(db, async tx => {
      conflicts = [];
      written = null;
      const snap = await tx.get(ref);
      let remoteRev = 0;
      let remote = null;
      if (snap.exists()) {
        const d = snap.data();
        remoteRev = d.rev;
        remote = stateOf(await this._open(entry.docId, d));
      }

      let next = stateOf(entry.local);
      const baseRev = entry.base ? entry.base.rev : 0;
      if (remoteRev !== baseRev) {
        next = mergeItem(entry.base ? stateOf(entry.base) : undefined, next, remote, conflicts);
      }

      if (remote && same(remote, next)) {        // nothing new to save
        written = { rev: remoteRev, ...next };
        return;
      }
      if (!remote && next.deleted) {            // deleting something never saved
        written = { rev: 0, ...next };
        return;
      }

      const rev = remoteRev + 1;
      const sealed = await C.encryptJSON(this.keys.dataKey, { key: entry.key, ...next }, itemAad(entry.docId));
      const doc = {
        t: this.tag,
        rev,
        iv: F.Bytes.fromUint8Array(sealed.iv),
        ct: F.Bytes.fromUint8Array(sealed.ct),
        device: DEVICE,
        updatedAt: F.serverTimestamp(),
      };
      tx.set(ref, doc);
      tx.set(F.doc(ref, 'versions', String(rev)), doc);
      written = { rev, ...next };
    });

    if (gen !== this.generation) return;

    // Retire the outbox entry, or rebase it if it was edited meanwhile.
    const cur = this.local.get(entry.docId);
    if (cur && cur.seq === entry.seq) {
      this.local.delete(entry.docId);
      await idbDel('outbox', `${this.uid}/${this.tag}/${entry.docId}`);
    } else if (cur) {
      const rebased = merge3(stateOf(entry.local), stateOf(cur.local), stateOf(written));
      cur.local = stateOf(rebased);
      cur.base = { rev: written.rev, data: written.data, deleted: written.deleted };
      await this._saveOutbox(cur);
    }

    if (written.rev > 0) {
      const r = this.remote.get(entry.docId);
      if (!r || r.rev < written.rev) {
        this.remote.set(entry.docId, {
          docId: entry.docId, key: entry.key, rev: written.rev,
          data: written.data, deleted: written.deleted, device: DEVICE, updatedAt: Date.now(),
        });
      }
    }

    if (conflicts.length) {
      const info = { key: entry.key, fields: conflicts.map(c => c.path.join('.') || '(whole item)') };
      for (const fn of [...this.conflictListeners]) {
        try { fn(info); } catch (e) { console.error(e); }
      }
    }
    this._emit();
  }
}

export const deviceId = DEVICE;
