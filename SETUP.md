# Setting up sign-in and sync

The site stores data in **Firebase** (Google). Anyone can sign in with a
Google account; each account gets its own private space, and everything is
encrypted in the browser before it's uploaded. The free Spark plan is plenty.

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

The config is kept out of the repository; the deploy workflow inserts it.

1. **Project settings** (gear icon) → **Your apps** → the web icon `</>` →
   register an app (no hosting needed), and copy the `firebaseConfig` object.
2. GitHub → this repository → **Settings → Secrets and variables → Actions →
   Variables → New repository variable**: name `FIREBASE_CONFIG`, value: the
   object you copied, e.g. `{ apiKey: "…", authDomain: "…", projectId: "…", … }`.
3. GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push to the `public` branch (or run the "Deploy site" workflow from the
   Actions tab). The workflow writes the config into the published copy of
   `assets/js/config.js`; the file in the repository stays `null`.

## 3. Publish the database rules

1. **Firestore Database → Rules** → replace everything with the contents of
   [`firestore.rules`](firestore.rules) → **Publish**.
2. Open the site, **Sign in**, and set up your vault passphrase.

The rules give every signed-in account its own space (`users/{their id}`)
and block access to anyone else's. They also cap item sizes, so strangers
can't use your project as free file storage.

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
- **"Can't open your data"**: the Firestore rules haven't been published, or
  are an old version. Paste `firestore.rules` into the Rules tab and publish.

## How the data is protected

- **Passphrase → encryption key.** Your passphrase never leaves the browser.
  It unlocks a random master key, which encrypts every item with AES-256-GCM.
- **Recovery key.** Shown once during setup. It's the only way back in if you
  forget your passphrase; nobody (not even Google) can reset it.
- **Remember on this device.** Keeps the unlocked key in this browser's
  storage, in a form that can't be exported. Use **Lock** or **Sign out** in
  the account menu to forget it.
- **What the server can see:** how many items each account has, when they
  changed, and which device saved them. Not their contents, titles or names.
- **Other people's accounts** are completely separate: different keys,
  different passphrase, and the rules stop accounts reading each other.
- **Usage limits:** everyone who signs up uses your Firebase project's free
  quota. If that ever becomes a problem, Firebase App Check can limit access
  to requests coming from this site.

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
# open http://localhost:8000/?emulator   (uses the emulators, no real config needed)
```

## Backups

Account menu (your avatar) → **Backup & restore**, or Journal → ⚙ → Backup & reset.

- **Encrypted backup:** locked with a password you choose when downloading;
  safe to keep in Google Drive or email. Without that password it can't be
  opened, so store it with your recovery key.
- **Readable backup:** plain JSON anyone can read; useful for other apps.
- **Restoring merges:** missing or deleted items come back, and where an item
  exists in both, the more recently changed version is kept.
- New tools must be added to `KNOWN_STORES` in `assets/js/core/backup.js`
  so they're included in backups.
