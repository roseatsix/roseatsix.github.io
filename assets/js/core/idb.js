/* Minimal promise wrapper around IndexedDB (device-local storage). */

const DB_NAME = 'ras';
const STORES = ['keys', 'outbox'];
let opening = null;

function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return opening;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbGet = (store, key) => run(store, 'readonly', s => s.get(key));
export const idbSet = (store, key, value) => run(store, 'readwrite', s => { s.put(value, key); });
export const idbDel = (store, key) => run(store, 'readwrite', s => { s.delete(key); });

export async function idbEntries(store, prefix = '') {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const tx = db.transaction(store, 'readonly');
    const range = prefix ? IDBKeyRange.bound(prefix, prefix + '￿') : undefined;
    const req = tx.objectStore(store).openCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out.push([c.key, c.value]); c.continue(); }
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}
