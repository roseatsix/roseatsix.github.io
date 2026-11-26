/* ==========================================================
   Session: Google sign-in + the encrypted vault.

   status:
     loading      – working something out
     unconfigured – Firebase isn't connected yet (config.js)
     signedOut    – nobody signed in
     denied       – signed in, but the database rules don't allow
                    this account (i.e. not the owner)
     needsSetup   – owner signed in, vault not created yet
     locked       – vault exists, passphrase needed on this device
     unlocked     – keys in memory, data readable
     error        – something failed; `error` has a message
   ========================================================== */

import { loadFirebase, isConfigured } from './firebase.js';
import * as C from './crypto.js';
import { idbGet, idbSet, idbDel } from './idb.js';

let state = { status: 'loading', user: null, error: null };
let keys = null;
let vaultDoc = null;
let started = null;
const listeners = new Set();

function set(patch) {
  state = { ...state, ...patch };
  for (const fn of [...listeners]) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

export const getState = () => state;
export const getKeys = () => keys;

export function onChange(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function start() {
  if (!started) started = boot();
  return started;
}

async function boot() {
  if (!isConfigured()) { set({ status: 'unconfigured' }); return; }
  let fb;
  try {
    fb = await loadFirebase();
  } catch (e) {
    console.error(e);
    set({ status: 'error', error: "Couldn't load sign-in. Check your connection and reload." });
    return;
  }
  fb.A.onAuthStateChanged(fb.auth, user => {
    handleUser(user).catch(e => {
      console.error(e);
      set({ status: 'error', error: friendly(e) });
    });
  });
}

function userInfo(u) {
  return { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' };
}

const keysRef = (fb, uid) => fb.F.doc(fb.db, 'users', uid, 'meta', 'keys');

async function handleUser(user) {
  keys = null;
  vaultDoc = null;
  if (!user) { set({ status: 'signedOut', user: null, error: null }); return; }

  set({ status: 'loading', user: userInfo(user), error: null });

  // Remembered device: unlock straight away (works offline too).
  const remembered = await idbGet('keys', user.uid).catch(() => null);
  if (remembered && remembered.dataKey && remembered.idKey) {
    keys = remembered;
    set({ status: 'unlocked' });
    return;
  }
  await refreshVault();
}

async function refreshVault() {
  const fb = await loadFirebase();
  const uid = state.user.uid;
  try {
    const snap = await fb.F.getDoc(keysRef(fb, uid));
    vaultDoc = snap.exists() ? snap.data() : null;
    set({ status: vaultDoc ? 'locked' : 'needsSetup', error: null });
  } catch (e) {
    if (e.code === 'permission-denied') set({ status: 'denied', error: null });
    else throw e;
  }
}

/** Re-check after an error or after the database rules change. */
export async function retry() {
  if (!state.user) return start();
  set({ status: 'loading', error: null });
  try { await refreshVault(); } catch (e) { set({ status: 'error', error: friendly(e) }); }
}

export async function signIn() {
  const fb = await loadFirebase();
  try {
    await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
    return true;
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return false;
    if (e.code === 'auth/popup-blocked') throw new Error('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
    throw new Error(friendly(e));
  }
}

export async function signOut() {
  const uid = state.user && state.user.uid;
  keys = null;
  if (uid) await idbDel('keys', uid).catch(() => {});
  const fb = await loadFirebase();
  await fb.A.signOut(fb.auth);
}

/** Create the vault. Returns the recovery key to show once. */
export async function setupVault(passphrase, remember) {
  const fb = await loadFirebase();
  const uid = state.user.uid;
  const master = C.randomBytes(32);
  const recoveryCode = C.makeRecoveryCode();

  const doc = {
    v: 1,
    passphrase: await C.sealMaster(master, passphrase, C.PASSPHRASE_ITERATIONS),
    recovery: await C.sealMaster(master, C.normalizeRecoveryCode(recoveryCode), C.RECOVERY_ITERATIONS),
    createdAt: fb.F.serverTimestamp(),
  };

  // Never overwrite a vault another device may have just created.
  await fb.F.runTransaction(fb.db, async tx => {
    const ref = keysRef(fb, uid);
    if ((await tx.get(ref)).exists()) throw new Error('A vault already exists for this account. Reload the page to unlock it.');
    tx.set(ref, doc);
  });

  vaultDoc = doc;
  await activate(master, remember);
  return recoveryCode;
}

export async function unlock(passphrase, remember) {
  if (!vaultDoc) await refreshVault();
  const master = await C.openMaster(vaultDoc.passphrase, passphrase);
  await activate(master, remember);
}

/** Unlock with the recovery key and choose a new passphrase. */
export async function recover(recoveryCode, newPassphrase, remember) {
  if (!vaultDoc) await refreshVault();
  const master = await C.openMaster(vaultDoc.recovery, C.normalizeRecoveryCode(recoveryCode));
  const fb = await loadFirebase();
  const sealed = await C.sealMaster(master, newPassphrase, C.PASSPHRASE_ITERATIONS);
  await fb.F.setDoc(keysRef(fb, state.user.uid), { passphrase: sealed }, { merge: true });
  vaultDoc = { ...vaultDoc, passphrase: sealed };
  await activate(master, remember);
}

async function activate(master, remember) {
  keys = await C.deriveKeys(master);
  master.fill(0);
  const uid = state.user.uid;
  if (remember) await idbSet('keys', uid, keys).catch(e => console.warn('Could not remember device', e));
  else await idbDel('keys', uid).catch(() => {});
  set({ status: 'unlocked', error: null });
}

/** Forget the keys on this device; the passphrase is needed again. */
export async function lock() {
  if (!state.user) return;
  keys = null;
  await idbDel('keys', state.user.uid).catch(() => {});
  set({ status: 'loading' });
  try { await refreshVault(); } catch (e) { set({ status: 'error', error: friendly(e) }); }
}

function friendly(e) {
  if (!e) return 'Something went wrong.';
  if (e.code === 'unavailable' || /offline/i.test(e.message || '')) {
    return "You're offline. Connect once to unlock on this device.";
  }
  if (e.code === 'auth/network-request-failed') return "Couldn't reach Google. Check your connection.";
  if (e.code === 'auth/unauthorized-domain') return 'This web address isn\'t authorised for sign-in yet (Firebase → Authentication → Settings → Authorised domains).';
  return e.message || 'Something went wrong.';
}
