/* Loads and initialises Firebase once, on demand. */
import { firebaseConfig, FIREBASE_SDK } from '../config.js';

/* Local testing against the Firebase emulators: open the site on
   localhost with ?emulator in the URL (it sticks for the tab). */
export const usingEmulator = (() => {
  try {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (local && new URLSearchParams(location.search).has('emulator')) sessionStorage.setItem('ras-emulator', '1');
    return local && sessionStorage.getItem('ras-emulator') === '1';
  } catch (e) {
    return false;
  }
})();

export function isConfigured() {
  return usingEmulator || !!firebaseConfig;
}

let loading = null;

export function loadFirebase() {
  if (!loading) loading = init();
  return loading;
}

async function init() {
  const [appMod, A, F] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
  ]);

  const config = usingEmulator
    ? { apiKey: 'demo-key', projectId: 'demo-ras', authDomain: 'localhost', appId: 'demo-app' }
    : firebaseConfig;

  const app = appMod.initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
  });

  if (usingEmulator) {
    A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  return { app, auth, db, A, F };
}
