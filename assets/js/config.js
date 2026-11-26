/* ==========================================================
   Firebase connection settings.

   The real config is NOT stored in this repository. It lives in
   the GitHub repository variable FIREBASE_CONFIG, and the deploy
   workflow (.github/workflows/pages.yml) writes it into this file
   in the published copy of the site only.

   Left as null here, sign-in is switched off: the site still works,
   and the Sign in button explains that sync isn't set up. For local
   testing, open the site with ?emulator to use the Firebase emulators.
   ========================================================== */

export const firebaseConfig = null;

/* Pinned Firebase web SDK, loaded straight from Google's CDN. */
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/13.2.0';
