# Setting up sign-in and sync

The site stores your data in **Firebase** (Google). Everything is encrypted in
your browser before it's uploaded, and the database rules allow only your
Google account in. The free Spark plan is plenty.

## 1. Create the project

1. Go to <https://console.firebase.google.com> → **Create a project**.
   Any name works (e.g. `rose-at-six`). Google Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method → Google** →
   enable it, pick a support email, **Save**.
3. **Authentication → Settings → Authorized domains → Add domain** →
   `roseatsix.github.io`.
4. **Build → Firestore Database → Create database** → *Start in production
   mode* → choose the location closest to you (this can't be changed later).

## 2. Connect the site

1. **Project settings** (gear icon) → **Your apps** → the web icon `</>` →
   register an app (no hosting needed).
2. Copy the `firebaseConfig` object it shows and paste it into
   `assets/js/config.js`, replacing `null`:

   ```js
   export const firebaseConfig = {
     apiKey: "…",
     authDomain: "….firebaseapp.com",
     projectId: "…",
     storageBucket: "….appspot.com",
     messagingSenderId: "…",
     appId: "…",
   };
   ```

   These values are meant to be public; they only identify the project.

## 3. Lock the database to your account

1. **Firestore Database → Rules** → replace everything with the contents of
   [`firestore.rules`](firestore.rules) → **Publish**.
2. Open the site and **Sign in**. Because the rules still contain the
   placeholder `OWNER_UID`, you'll see "This space is private" along with
   your account ID. Copy it.
3. Back in the Rules editor, replace `OWNER_UID` with your ID → **Publish**.
4. On the site press **Check again**, then set up your vault passphrase.

## 4. Optional hardening

- **Google Cloud console → APIs & Services → Credentials → Browser key** →
  *Application restrictions: Websites* → add **both**:
  - `https://roseatsix.github.io/*`
  - `https://roseatsix.firebaseapp.com/*` (the Google sign-in pop-up runs
    here; leaving it out breaks sign-in with "The requested action is invalid")

  This stops other sites from using your project's key. If you also set
  *API restrictions*, the key needs at least **Identity Toolkit API**,
  **Token Service API** and **Cloud Firestore API**.

## Troubleshooting

- **Pop-up says "The requested action is invalid"**: check that Google is
  enabled under Authentication → Sign-in method, and that any website
  restriction on the API key includes `https://roseatsix.firebaseapp.com/*`.
  Changes to key restrictions can take a few minutes to apply.
- **"This web address isn't authorised for sign-in"**: add
  `roseatsix.github.io` under Authentication → Settings → Authorized domains.
- **"This space is private"**: the account ID in your Firestore rules doesn't
  match. Copy it from that screen into the rules and publish again.

## How the data is protected

- **Passphrase → encryption key.** Your passphrase never leaves the browser.
  It unlocks a random master key, which encrypts every item with AES-256-GCM.
- **Recovery key.** Shown once during setup. It's the only way back in if you
  forget your passphrase; nobody (not even Google) can reset it.
- **Remember on this device.** Keeps the unlocked key in this browser's
  storage, in a form that can't be exported. Use **Lock** or **Sign out** in
  the account menu to forget it.
- **What the server can see:** how many items you have, when they changed, and
  which device saved them. Not their contents, titles or names.

## How syncing works

- Each item (a journal day, a subscription…) syncs on its own, so editing
  different things on different devices never clashes.
- If two devices edit the *same* item, changes to different fields are merged
  automatically. If both changed the same field, the latest save wins and the
  other version stays in that item's history.
- Every save is kept as a version; history can't be edited or deleted.
- Offline edits are kept (encrypted) on the device and sent when you're back
  online.

## Testing locally (for development)

```sh
npx firebase-tools emulators:start --only auth,firestore --project demo-ras
python3 -m http.server 8000
# open http://localhost:8000/?emulator
```
