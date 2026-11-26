/* ==========================================================
   Firebase connection settings.

   Paste the config object from the Firebase console here
   (Project settings → Your apps → Web app → SDK setup → Config).
   These values are public by design: what protects your data
   is the Firestore rules plus the encryption in core/crypto.js.

   Leave it as null until the project exists; the site still
   works, the Sign in button just explains that sync isn't set up.
   ========================================================== */

const firebaseConfig = {
   apiKey: "AIzaSyBEggVhaInstbqg1c7HYqjVSdNX1tI9RjI",
   authDomain: "roseatsix.firebaseapp.com",
   projectId: "roseatsix",
   storageBucket: "roseatsix.firebasestorage.app",
   messagingSenderId: "989432746839",
   appId: "1:989432746839:web:7eb9983d30c33dd4c7a412",
   measurementId: "G-V6WHPGSBFK"
};

export const firebaseConfig = null;

/* Pinned Firebase web SDK, loaded straight from Google's CDN. */
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/13.2.0';
