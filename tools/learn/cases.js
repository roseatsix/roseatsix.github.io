/* ==========================================================
   Case studies: real features of this site, followed from the
   tap to the database and back, through the actual code.

   Each case is a list of steps:
     { title, place: 'page' | 'device' | 'cloud' | 'github',
       file, stack: [function names, outermost first],
       code, lang, mark: [lines],      (real code, sometimes shortened with …)
       explain (HTML), idea: { name, html } (a function idea, optional),
       data: { label, value } (what the data looks like right now, optional),
       demo: id (a live demo using the real code, optional) }
   ========================================================== */

export const PLACES = {
  page: { name: 'This page', sub: 'the open tab, in memory' },
  device: { name: 'Your device', sub: 'saved in the browser' },
  cloud: { name: 'Firebase', sub: 'Google\'s servers' },
  github: { name: 'GitHub', sub: 'where the files live' },
};

export const CASES = [

/* ---------------------------------------------------------- */
{
  id: 'map',
  title: 'The map: where everything lives',
  summary: 'Before the stories: the four places your site and your data live, and how they talk.',
  minutes: 5,
  steps: [
    {
      title: 'There is no "server" of your own',
      place: 'github',
      explain: `<p>Most apps have a <strong>backend</strong>: a computer somewhere running the app's code and keeping its data. rose at six doesn't have one of its own.</p>
        <p>GitHub Pages only <em>hands out files</em>: the HTML, CSS and JavaScript. It never runs any of them. Like a library lending out recipe books: it doesn't cook.</p>`,
    },
    {
      title: 'Your browser does all the work',
      place: 'page',
      file: 'tools/journal/index.html',
      code: `<main id="journal" class="tool-main"></main>

<script type="module" src="journal.js"></script>`,
      lang: 'html',
      explain: `<p>When you open the journal, your browser downloads these files and <strong>runs the JavaScript itself</strong>. The page starts almost empty (line 1). JavaScript fills it in.</p>
        <p>So every function in these stories runs on <em>your</em> phone or laptop. That's called the <strong>frontend</strong>.</p>`,
    },
    {
      title: 'Firebase: borrowed backend',
      place: 'cloud',
      file: 'assets/js/core/firebase.js',
      simplified: true,
      stack: ['loadFirebase()', 'init()'],
      code: `const app = initializeApp(config);
const auth = A.getAuth(app);              // who you are
const db = F.initializeFirestore(app, …); // the database`,
      explain: `<p>For the two jobs a browser can't do alone, the site borrows Google's <strong>Firebase</strong>:</p>
        <ul><li><strong>Auth</strong>: proves who you are (Google sign-in) and gives your account an ID, called <code>uid</code>.</li>
        <li><strong>Firestore</strong>: a database in the cloud, so all your devices see the same data.</li></ul>
        <p>The <code>config</code> on line 1 is the address of your Firebase project. It's what the deploy workflow inserts.</p>`,
    },
    {
      title: 'What a database looks like',
      place: 'cloud',
      explain: `<p>Firestore is like nested folders. A <strong>collection</strong> is a folder; a <strong>document</strong> is a file in it, holding labelled values (an object, like the ones you know from JS).</p>
        <p>Every account gets its own folder, named after its <code>uid</code>. Each journal entry, task or subscription is one file in <code>items</code>.</p>`,
      data: { label: 'Firestore, as folders', value: `users/
  ‹your uid›/
    meta/
      keys          ← your locked master key
    items/
      Xk9fQ2…       ← one task, entry, subscription…
        versions/
          1, 2, 3…  ← every saved version
      p0Lm7T…
      …` },
    },
    {
      title: 'The bouncer: security rules',
      place: 'cloud',
      file: 'firestore.rules',
      code: `function isSelf(uid) {
  return request.auth != null && request.auth.uid == uid;
}

match /users/{uid}/items/{itemId} {
  allow read: if isSelf(uid);
  allow create: if isSelf(uid) && validItem(1);
}`,
      lang: 'js',
      mark: [2, 6],
      explain: `<p>Because there's no server of your own, anyone could <em>try</em> to talk to your database directly. The <strong>rules</strong> run on Google's side and check every single request.</p>
        <p>Line 2: "is the person asking signed in, and is this their own folder?". If not, the request is refused. That's how anyone can sign up while still keeping everyone's data apart.</p>`,
      idea: { name: 'Functions everywhere', html: 'Even the rules language has functions: <code>isSelf(uid)</code> takes a blank and returns true or false, like a JS function.' },
    },
    {
      title: 'Your device keeps things too',
      place: 'device',
      explain: `<p>Your browser has its own storage on your device:</p>
        <ul><li><strong>localStorage</strong>: a small notebook of text, for little things like your colour palette.</li>
        <li><strong>IndexedDB</strong>: a bigger drawer, for your unlocked keys ("remember this device") and for changes that haven't reached the cloud yet.</li></ul>
        <p>With those three places (the page, your device, Firebase) you can follow every story that comes next. Watch the map at the top light up as data moves.</p>`,
    },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'signin',
  title: 'Signing in and unlocking',
  summary: 'What happens between opening a tool and seeing your data.',
  minutes: 7,
  steps: [
    {
      title: 'The page starts the session',
      place: 'page',
      file: 'assets/js/core/session.js',
      stack: ['start()', 'boot()'],
      code: `async function boot() {
  if (!isConfigured()) { set({ status: 'unconfigured' }); return; }
  const fb = await loadFirebase();
  fb.A.onAuthStateChanged(fb.auth, user => {
    handleUser(user);
  });
}`,
      mark: [4, 5, 6],
      explain: `<p>Every tool calls <code>start()</code>, which runs <code>boot()</code>. Line 3 loads Firebase (and <code>await</code>s it, since it comes over the internet).</p>
        <p>Line 4 is the interesting one: it doesn't ask "who is signed in?" once. It hands Firebase a function, and Firebase calls it <strong>now and whenever that changes</strong>: when you sign in, sign out, or come back tomorrow.</p>`,
      idea: { name: 'Callback', html: 'A function you hand to someone else to call later. <code>user =&gt; { handleUser(user); }</code> is written here, but Firebase decides when it runs.' },
    },
    {
      title: 'Who are you?',
      place: 'cloud',
      file: 'assets/js/core/session.js',
      stack: ['onAuthStateChanged → your callback', 'handleUser(user)'],
      code: `async function handleUser(user) {
  if (!user) { set({ status: 'signedOut' }); return; }
  set({ status: 'loading', user: userInfo(user) });
  …
}`,
      explain: `<p>Google remembers you between visits, so usually <code>user</code> is already there: an object with your name, email and <code>uid</code>. If nobody is signed in, the status becomes <code>'signedOut'</code> and the page shows the Sign in button.</p>`,
      data: { label: 'user (from Firebase Auth)', value: `{
  uid: "k3J9…",          // your account's ID
  displayName: "Rose",
  email: "…@gmail.com"
}` },
    },
    {
      title: 'Is this device remembered?',
      place: 'device',
      file: 'assets/js/core/session.js',
      stack: ['handleUser(user)', 'idbGet()'],
      code: `const remembered = await idbGet('keys', user.uid);
if (remembered && remembered.dataKey && remembered.idKey) {
  keys = remembered;
  set({ status: 'unlocked' });
  return;
}
await refreshVault();`,
      explain: `<p>Being signed in isn't enough: your data is locked with your passphrase. If you ticked "remember this device", the unlocked keys were saved in IndexedDB, so line 1 finds them and you're in, without typing anything. It even works offline.</p>
        <p>Otherwise, line 7 fetches your locked master key from Firebase and the page asks for your passphrase.</p>`,
      idea: { name: 'return to stop early', html: 'The <code>return</code> on line 5 ends the function right there, so line 7 only runs when there were no remembered keys.' },
    },
    {
      title: 'Typing your passphrase',
      place: 'page',
      file: 'assets/js/core/session.js',
      stack: ['unlock(passphrase)', 'C.openMaster()', 'activate(master)'],
      code: `export async function unlock(passphrase, remember) {
  const master = await C.openMaster(vaultDoc.passphrase, passphrase);
  await activate(master, remember);
}`,
      explain: `<p><code>vaultDoc.passphrase</code> is your master key in a locked box (from <code>users/‹uid›/meta/keys</code>). <code>openMaster</code> turns your passphrase into a key, very slowly on purpose (600,000 rounds), and tries to open the box. A wrong passphrase simply can't open it.</p>`,
      data: { label: 'vaultDoc.passphrase (stored in Firebase)', value: `{
  alg: "PBKDF2-SHA256+AES-GCM",
  iterations: 600000,
  salt: "q1Xb…",
  iv: "9fK2…",
  ct: "Zr0t…"     // the locked master key
}` },
    },
    {
      title: 'Two keys from one',
      place: 'device',
      file: 'assets/js/core/session.js',
      stack: ['activate(master)', 'C.deriveKeys(master)'],
      code: `async function activate(master, remember) {
  keys = await C.deriveKeys(master);
  master.fill(0);
  if (remember) await idbSet('keys', uid, keys);
  set({ status: 'unlocked' });
}`,
      explain: `<p>From the master key, <code>deriveKeys</code> makes two working keys: a <strong>dataKey</strong> that locks and unlocks your items, and an <strong>idKey</strong> that makes the scrambled file names you saw on the map.</p>
        <p>Line 3 wipes the master key from memory. Line 4 saves the working keys on this device if you chose "remember". They're saved in a form that can't be copied out, only used.</p>`,
    },
    {
      title: 'Everyone is told at once',
      place: 'page',
      file: 'assets/js/core/session.js',
      stack: ['set({ status: \'unlocked\' })', 'every onChange listener'],
      code: `function set(patch) {
  state = { ...state, ...patch };
  for (const fn of [...listeners]) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

export function onChange(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}`,
      mark: [3, 4],
      explain: `<p>Many parts of the page care about the status: the header's avatar, the "unlock" screen, and each store of data. Each of them called <code>onChange(fn)</code> earlier, handing over a function.</p>
        <p>When the status changes, lines 3–4 call <strong>all of those functions</strong>, one after another, passing the new state. Next: the store hears "unlocked" and starts loading your data.</p>`,
      idea: { name: 'Listeners', html: 'A list of callbacks waiting for one event. It\'s the same idea as <code>addEventListener</code> on a button, but for something the site made up itself: "the status changed".' },
    },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'logit',
  title: 'Tapping "Log it"',
  summary: 'One journal entry, from your thumb to the database.',
  minutes: 8,
  steps: [
    {
      title: 'The form is submitted',
      place: 'page',
      file: 'tools/journal/journal.js',
      stack: ['submit listener'],
      code: `main.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  …
  if (form.dataset.form === 'log') {`,
      explain: `<p>The composer is a <code>&lt;form&gt;</code>. Tapping <strong>Log it</strong> submits it. Instead of one listener per form, the journal has <strong>one</strong> listener on the whole page, and line 5 checks which form it was.</p>
        <p>Line 2 stops the browser's old habit of reloading the page when a form is sent.</p>`,
      idea: { name: 'async', html: 'The listener is <code>async</code> because, a few lines later, it has to wait for saving with <code>await</code>.' },
    },
    {
      title: 'Building the entry',
      place: 'page',
      file: 'tools/journal/journal.js',
      stack: ['submit listener'],
      code: `const text = form.text.value.trim();
let time = form.time.value;
if (date === M.today() && …) time = M.nowTime();
…
const entry = { date, time, cat, text, amount,
  spendCat: spend ? form.spendCat.value : null,
  createdAt: Date.now() };`,
      mark: [5, 6, 7],
      explain: `<p>It reads what you typed and picked, and packs it into one plain object. Everything about an entry is in here. Nothing is saved yet; this object only exists in the page's memory.</p>`,
      data: { label: 'entry', value: `{
  date: "2026-11-27",
  time: "10:42",
  cat: "work",
  text: "Finished the quarterly report",
  amount: null,
  spendCat: null,
  createdAt: 1795755720000
}` },
    },
    {
      title: 'Handing it to the store',
      place: 'page',
      file: 'tools/journal/journal.js',
      stack: ['submit listener', 'store.put(key, entry)'],
      code: `await store.put('log:' + M.newId(), entry);`,
      explain: `<p>One line, and the journal is done with it. <code>store</code> is the sync engine (<code>store.js</code>), shared by every tool. The journal doesn't know anything about encryption or Firebase. It just says "keep this under this name".</p>
        <p>The name (the <strong>key</strong>) is <code>'log:'</code> plus a random ID, like <code>log:a81f03c2e9d4</code>. Tasks are <code>task:…</code>, days are <code>day:2026-11-27</code>.</p>`,
      idea: { name: 'Functions hide work', html: 'This is the main reason functions exist. <code>put()</code> hides about 150 lines of hard work behind one simple call, so every tool can use it without repeating it.' },
    },
    {
      title: 'A secret file name',
      place: 'page',
      file: 'assets/js/core/store.js',
      stack: ['store.put()', '_write(key, next)', '_docId(key)', 'C.tag()'],
      code: `async _docId(key) {
  return C.tag(this.keys.idKey, this.tool + '\\u0000' + key, 32);
}`,
      explain: `<p>The key <code>log:a81f…</code> would tell anyone looking at the database "this is a journal log". So the store scrambles it with your idKey into a file name that means nothing to anyone else, but is always the same for the same key.</p>`,
      data: { label: 'key → document ID', value: `"log:a81f03c2e9d4"  →  "Xk9fQ2pLr7…"` },
    },
    {
      title: 'Safe on your device first',
      place: 'device',
      file: 'assets/js/core/store.js',
      stack: ['store.put()', '_write(key, next)', '_saveOutbox(entry)'],
      code: `entry = { docId, key, base: …, local: next, seq: 1, at: Date.now() };
this.local.set(docId, entry);
await this._saveOutbox(entry);   // encrypted, in IndexedDB
this._emit();                     // tell the page right away
this.flushSoon(0);                // and start sending it`,
      mark: [3],
      explain: `<p>Before anything goes over the internet, the change is written, encrypted, into an <strong>outbox</strong> in IndexedDB. If you're offline, or close the tab a second later, it's still there and gets sent next time.</p>
        <p><code>base</code> remembers what the item looked like before your edit. That will matter when two devices clash.</p>`,
    },
    {
      title: 'The page updates instantly',
      place: 'page',
      file: 'assets/js/core/store.js',
      stack: ['_write()', '_emit()', 'journal\'s subscribe callback', 'render()'],
      code: `_emit() {
  const items = this.items();
  for (const fn of this.listeners) fn(items);
}`,
      explain: `<p>This is why your entry appears the moment you tap, even on slow internet. <code>_emit</code> calls every function that <code>subscribe</code>d to the journal store, with the full list of items, including the new one still waiting in the outbox.</p>
        <p>The journal's callback re-draws the page. The next story shows that part in detail.</p>`,
      idea: { name: 'Same pattern again', html: 'A list of listeners and a loop that calls each one, exactly like <code>set()</code> in the sign-in story. Once you spot this pattern, you\'ll see it all over the site.' },
    },
    {
      title: 'Locking it up',
      place: 'page',
      file: 'assets/js/core/store.js',
      stack: ['_flush()', '_push(entry)', 'C.encryptJSON()'],
      code: `const sealed = await C.encryptJSON(this.keys.dataKey,
  { key: entry.key, ...next }, itemAad(entry.docId));
const doc = {
  t: this.tag, rev,
  iv: Bytes.fromUint8Array(sealed.iv),
  ct: Bytes.fromUint8Array(sealed.ct),
  device: DEVICE, updatedAt: serverTimestamp(),
};`,
      explain: `<p>The entry is turned into text (JSON) and locked with your dataKey. What will be stored is <code>doc</code>: a few labels that say nothing about you, plus <code>ct</code>, the locked text.</p>`,
      data: { label: 'doc (what Firebase receives)', value: `{
  t: "pQ8s…",        // which tool, scrambled
  rev: 1,            // version number
  iv: <12 random bytes>,
  ct: <the locked entry: "u7Yq0c…">,
  device: "3fa9c2d1",
  updatedAt: <set by the server>
}` },
    },
    {
      title: 'Into the database, carefully',
      place: 'cloud',
      file: 'assets/js/core/store.js',
      stack: ['_push(entry)', 'runTransaction(…)'],
      code: `await F.runTransaction(db, async tx => {
  const snap = await tx.get(ref);
  …
  tx.set(ref, doc);
  tx.set(F.doc(ref, 'versions', String(rev)), doc);
});`,
      mark: [4, 5],
      explain: `<p>A <strong>transaction</strong> is an all-or-nothing package: read the current version, decide, write. If another device changes the same item in the middle, Firebase throws the package away and runs the function again with fresh data.</p>
        <p>Two writes: the item itself (line 4) and a copy in its <code>versions</code> (line 5). That's your version history. The rules check both on Google's side, and only then is the outbox entry deleted.</p>`,
      idea: { name: 'A function as a "do this"', html: 'You hand <code>runTransaction</code> a whole function, because Firebase may need to run it more than once. A value couldn\'t do that; a recipe can be cooked again.' },
    },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'arrives',
  title: 'It appears on your other phone',
  summary: 'How the database tells other devices, and how a page turns data into what you see.',
  minutes: 6,
  steps: [
    {
      title: 'The store is already listening',
      place: 'cloud',
      file: 'assets/js/core/store.js',
      stack: ['_start()', 'F.onSnapshot(query, callback)'],
      code: `this.unsubSnap = F.onSnapshot(
  F.query(this.coll, F.where('t', '==', this.tag)),
  snap => this._onSnapshot(snap),
);`,
      explain: `<p>When your phone unlocked, the journal store asked Firebase: "send me every document whose <code>t</code> is the journal's tag, <strong>and keep sending</strong> whenever one changes."</p>
        <p>That open line to the database is what makes things appear by themselves. Nobody has to press refresh.</p>`,
      idea: { name: 'Callback, again', html: 'Same shape as <code>onAuthStateChanged</code> and <code>addEventListener</code>: "here\'s a function, call it when something happens".' },
    },
    {
      title: 'Unlocking what arrived',
      place: 'page',
      file: 'assets/js/core/store.js',
      stack: ['_onSnapshot(snap)', '_open(id, d)', 'C.decryptJSON()'],
      code: `for (const change of snap.docChanges()) {
  const d = change.doc.data();
  const plain = await this._open(id, d);
  this.remote.set(id, { key: plain.key, data: plain.data, rev: d.rev, … });
}
this._emit();`,
      explain: `<p>Firebase sends only what changed. For each one, <code>_open</code> unlocks <code>ct</code> with this phone's dataKey (the same key, because it came from the same passphrase) and gets back your entry object.</p>`,
      data: { label: 'after _open()', value: `{
  key: "log:a81f03c2e9d4",
  data: {
    date: "2026-11-27", time: "10:42", cat: "work",
    text: "Finished the quarterly report", …
  }
}` },
    },
    {
      title: 'The journal hears about it',
      place: 'page',
      file: 'tools/journal/journal.js',
      stack: ['_emit()', 'store.subscribe callback'],
      simplified: true,
      code: `store.subscribe(list => {
  M.setItems(list);
  …
  if (!isTyping()) render(); else ui.stale = true;
});`,
      mark: [4],
      explain: `<p>This callback was handed to the store when the journal page loaded. Now it's called with every item. <code>M.setItems</code> keeps them in the journal's model, then the page re-draws.</p>
        <p>Line 4 is a kindness: if you're in the middle of typing, it waits, so the page doesn't jump under your fingers.</p>`,
    },
    {
      title: 'Data becomes HTML',
      place: 'page',
      file: 'tools/journal/journal.js',
      stack: ['render()', 'V.renderDay(date)'],
      code: `main.innerHTML =
  r.view === 'week' ? V.renderWeek(r.date)
  : r.view === 'month' ? V.renderMonth(r.month)
  : …
  : V.renderDay(r.date, ui);`,
      explain: `<p>Each view is a function that takes some data and <strong>returns a string of HTML</strong>. <code>render()</code> picks the one for the tab you're on and puts its result into the page.</p>
        <p>The views never save or change anything. Given the same data, they always return the same HTML. That makes them easy to trust.</p>`,
      idea: { name: 'Pure function', html: 'A function that only turns inputs into an output, with no side effects. <code>renderDay(date)</code> is one; <code>store.put()</code> is the opposite: its whole point is a side effect (saving).' },
    },
    {
      title: 'Your entry, drawn',
      place: 'page',
      file: 'tools/journal/views.js',
      simplified: true,
      stack: ['V.renderDay()', 'logRow(entry)'],
      code: `\`<li class="j-entry">
  <span class="j-time">\${esc(e.time)}</span>
  <span class="j-cat">\${esc(cat.name)}</span>
  <p>\${esc(e.text)}</p>
</li>\``,
      explain: `<p>(Simplified.) A template string with <code>\${…}</code> holes, filled from the entry. <code>esc()</code> makes sure that if you ever type something like <code>&lt;b&gt;</code> in a log, it shows as text instead of becoming real HTML.</p>
        <p>And that's the whole round trip: an object in the page, locked into the cloud, unlocked on another device, turned back into HTML.</p>`,
    },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'clash',
  title: 'Same task, two phones',
  summary: 'What happens when two devices change one item before syncing.',
  minutes: 6,
  steps: [
    {
      title: 'Both edit the same task',
      place: 'device',
      explain: `<p>Your phone is offline. On it, you change the task's due date. Meanwhile, on your laptop, you add a note to the same task. Both changes wait in their outboxes. Each one remembers the <code>base</code>: the task as it was before the edit.</p>`,
      data: { label: 'the three versions', value: `base:   { title: "Buy flowers", due: "Fri", notes: "" }
phone:  { title: "Buy flowers", due: "Sat", notes: "" }
laptop: { title: "Buy flowers", due: "Fri", notes: "Peonies" }` },
    },
    {
      title: 'The transaction notices',
      place: 'cloud',
      file: 'assets/js/core/store.js',
      stack: ['_push(entry)', 'runTransaction', 'mergeItem()'],
      code: `const snap = await tx.get(ref);
remoteRev = snap.data().rev;
…
const baseRev = entry.base ? entry.base.rev : 0;
if (remoteRev !== baseRev) {
  next = mergeItem(base, next, remote, conflicts);
}`,
      mark: [5, 6],
      explain: `<p>The laptop synced first, so the task is now at revision 2. When the phone comes online, its edit was based on revision 1. Line 5 sees the difference: "someone else saved in between". So instead of overwriting, it merges.</p>`,
    },
    {
      title: 'Field by field',
      place: 'page',
      file: 'assets/js/core/merge.js',
      simplified: true,
      stack: ['mergeItem()', 'merge3(base, local, remote)'],
      code: `export function merge3(base, local, remote, path, conflicts) {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;   // only they changed it
  if (same(base, remote)) return local;   // only I changed it
  if (isObj(local) && isObj(remote)) {
    // merge each field with merge3 again
  }
  conflicts.push({ path, local, remote });
  return local;                            // both changed it
}`,
      mark: [3, 4],
      explain: `<p>For each field, compare both versions with the <code>base</code>. If only one side changed it, take that side. Both edits survive: the phone's new date <em>and</em> the laptop's note.</p>
        <p>Only when both changed the same field differently is it a real conflict. Then the device saving now wins, and the other value is still in version history.</p>`,
      idea: { name: 'A function that calls itself', html: 'For objects, line 6 calls <code>merge3</code> again on each field. That\'s called <strong>recursion</strong>: the same recipe applied to smaller and smaller pieces.' },
      demo: 'merge',
    },
    {
      title: 'Telling you about it',
      place: 'page',
      file: 'assets/js/core/store.js',
      stack: ['_push(entry)', 'conflict listeners'],
      code: `if (conflicts.length) {
  const info = { key: entry.key, fields: conflicts.map(c => c.path.join('.')) };
  for (const fn of this.conflictListeners) fn(info);
}`,
      explain: `<p>If there was a real conflict, the store calls the conflict listeners, and the page shows a small message saying which field was decided for you. The merged task is saved as a new revision, so both devices end up showing the same thing.</p>`,
    },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'today',
  title: 'The Today card on your hub',
  summary: 'Reading three tools at once, and only showing what needs you.',
  minutes: 6,
  steps: [
    {
      title: 'Listening to three stores',
      place: 'page',
      file: 'assets/js/hub-today.js',
      stack: ['mountToday()'],
      code: `const journal = openStore('journal');
const inventory = openStore('inventory');
const subscriptions = openStore('subscriptions');

journal.subscribe(list => { J.setItems(list); jReady = true; render(); });
inventory.subscribe(list => { IM.setItems(list); render(); });
subscriptions.subscribe(list => { SM.setItems(list); render(); });`,
      explain: `<p>The hub isn't a tool, but it can open any tool's store. Each <code>subscribe</code> hands over a function, so whenever <em>any</em> of the three changes, on any device, the card re-draws itself.</p>
        <p>It reuses each tool's own model (<code>J</code>, <code>IM</code>, <code>SM</code>), so "what's overdue" means exactly the same thing here as inside the tool.</p>`,
    },
    {
      title: 'Asking each tool a question',
      place: 'page',
      file: 'assets/js/hub-today.js',
      stack: ['render()', 'view()'],
      code: `const overdue = J.overdueTasks(t);
const open = [...overdue, ...J.tasksDue(t).filter(x => !x.done)];

const home = IM.attention(t, 7);

const renew = SM.upcoming(3, t);`,
      explain: `<p>Each line asks a model function a question and gets a list back: open tasks, things at home needing attention within 7 days, subscriptions renewing within 3 days.</p>
        <p>The hub doesn't know <em>how</em> the inventory decides that scissors are due. It just calls <code>IM.attention()</code>. That's the same "functions hide work" idea as <code>store.put()</code>.</p>`,
      idea: { name: 'Functions as questions', html: 'Good function names read like questions or answers: <code>overdueTasks(today)</code>, <code>attention(today, 7)</code>. You can understand the hub without opening the inventory\'s code.' },
    },
    {
      title: 'Only if it matters',
      place: 'page',
      file: 'assets/js/hub-today.js',
      stack: ['view()'],
      code: `if (open.length) {
  sections.push(\`<section>…Tasks…</section>\`);
}
…
if (!sections.length) return '';`,
      explain: `<p>This is what you asked for when the card made the tools hard to reach: each section is only added <strong>if its list isn't empty</strong>. And if no section was added, <code>view()</code> returns an empty string and the card hides itself.</p>`,
    },
    {
      title: 'When is the budget worth mentioning?',
      place: 'page',
      file: 'assets/js/hub-today.js',
      stack: ['view()'],
      code: `const used = spent / b.total;
const elapsed = dayNum / daysInMonth;
const reason = left < 0 ? 'Over budget'
  : left / b.total < 0.15 ? 'Almost used up'
  : used > elapsed + 0.15 ? 'Spending faster than the month'
  : '';`,
      explain: `<p>The budget only shows up when one of three rules is true. The third is the clever one: if you've used 60% of the budget but only 40% of the month has passed, you're spending faster than the month.</p>
        <p>Move the sliders to see which rule wins.</p>`,
      demo: 'budget',
    },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'split',
  title: 'Saving a receipt in the splitter',
  summary: 'Small pure functions doing the maths, and one function that saves.',
  minutes: 6,
  steps: [
    {
      title: 'One split is one item',
      place: 'page',
      file: 'tools/split/model.js',
      explain: `<p>A whole split, with all its people and receipts, is stored as <strong>one item</strong>: <code>trip:‹id›</code>. Receipts and people are objects inside it, keyed by ID.</p>`,
      data: { label: 'trip:bali', value: `{
  title: "Bali trip",
  people: { me: { name: "Rose", me: true }, d: { name: "Dina" }, a: { name: "Ari" } },
  receipts: {
    r1: { shop: "Warung", paidBy: "me", mode: "even", total: 300000 },
    r2: { shop: "Seminyak cafe", paidBy: "d", mode: "items", tax: 10,
          items: { i1: { name: "Latte", price: 40000, sharedBy: ["me"] }, … } }
  },
  paid: {}
}` },
    },
    {
      title: 'Saving changes the whole split',
      place: 'page',
      file: 'tools/split/app.js',
      stack: ['receipt form submit', 'updateTrip(tid, mutate)', 'store.put()'],
      code: `async function updateTrip(id, mutate) {
  const t = M.clone(M.get(tripKey(id)));
  mutate(t);
  await save(tripKey(id), t);
}

updateTrip(tid, x => {
  x.receipts = { ...(x.receipts || {}), [id]: r };
});`,
      mark: [3, 7, 8],
      explain: `<p><code>updateTrip</code> copies the split, lets you change the copy, then saves it. The change itself is passed in as a function (line 7): "here's what to do to the split".</p>
        <p>Because sync merges field by field, adding a receipt on your phone and ticking "paid" on your laptop don't clash, even though they're the same item.</p>`,
      idea: { name: 'Passing "what to do"', html: '<code>updateTrip</code> handles the boring part (copy, save) once. Each caller only writes the interesting part, as a little function. Renaming, adding a receipt and marking paid all use it.' },
    },
    {
      title: 'The maths is never saved',
      place: 'page',
      file: 'tools/split/model.js',
      stack: ['render()', 'M.tripCalc(t)', 'M.receiptCalc(t, r)'],
      simplified: true,
      code: `export function tripCalc(t) {
  const receipts = receiptsOf(t).map(r => ({ r, c: receiptCalc(t, r) }));
  for (const { r, c } of receipts) {
    paid[r.paidBy] += c.total;
    for (const [id, v] of Object.entries(c.shares)) owed[id] += v;
  }
  …
  return { receipts, paid, owed, net, total, transfers, … };
}`,
      explain: `<p>Shares, totals and "who pays whom" are <strong>never stored</strong>. Every time the page draws, <code>tripCalc</code> works them out again from the receipts. So they can't get out of date. Change a price and everything follows.</p>
        <p>Both are pure functions: receipts in, numbers out. Try the real <code>receiptCalc</code> from your site below.</p>`,
      demo: 'receipt',
    },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'search',
  title: 'Search everything',
  summary: 'A function that makes a function, and five tools answering one question.',
  minutes: 5,
  steps: [
    {
      title: 'Only when you need it',
      place: 'page',
      file: 'assets/js/hub-search.js',
      stack: ['mountSearch()', 'openStores()'],
      code: `input.addEventListener('focus', openStores, { once: true });`,
      explain: `<p>Search needs all five tools' data, but most visits to the hub never search. So the stores are only opened the first time you tap the search box. <code>{ once: true }</code> means the listener removes itself after that.</p>`,
    },
    {
      title: 'A function that makes a function',
      place: 'page',
      file: 'assets/js/hub-search.js',
      stack: ['show()', 'matcher(q)'],
      code: `export const norm = s => String(s ?? '').toLowerCase()
  .normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '');

export function matcher(q) {
  const words = norm(q).split(/\\s+/).filter(Boolean);
  return hay => {
    const h = norm(hay);
    return words.every(w => h.includes(w));
  };
}`,
      mark: [6, 7, 8, 9],
      explain: `<p><code>matcher</code> doesn't search anything itself. It prepares your words once, then <strong>returns a new function</strong> that answers "does this text match?". That function gets used thousands of times, on every task, item and subscription.</p>
        <p><code>norm</code> lowercases and strips accents, so "cafe" finds "Café". Try it:</p>`,
      idea: { name: 'Returning a function', html: 'A function can return a function. The returned one still remembers <code>words</code> from when it was made. That memory is called a <strong>closure</strong>.' },
      demo: 'search',
    },
    {
      title: 'Every tool answers in the same shape',
      place: 'page',
      file: 'assets/js/hub-search.js',
      stack: ['show()', 'journalHits(q, ok)', 'inventoryHits(q, ok)', '…'],
      simplified: true,
      code: `function inventoryHits(q, ok) {
  return IM.allItems()
    .filter(i => ok([i.name, i.notes, IM.spotName(i)].join(' ')))
    .map(i => ({ title: i.name, sub: where, href: \`tools/inventory/#/item/\${i.id}\` }));
}`,
      explain: `<p>Each tool has its own hits function (journal, inventory, subscriptions, splits, documents). Each one filters with the same <code>ok</code> function, then <code>map</code>s its own kind of data into one shared shape: <code>{ title, sub, href }</code>.</p>
        <p>Because they all return the same shape, one piece of code can draw results from all five tools.</p>`,
    },
    {
      title: 'Tapping a result',
      place: 'page',
      file: 'tools/inventory/inventory.js',
      stack: ['page load', 'onRoute()'],
      code: `const [, kind, id] = (location.hash || '').split('/');
if (kind === 'item' && M.get('item:' + id)) {
  …
  setTimeout(() => D.openItemDialog(id), 0);
}`,
      explain: `<p>The link goes to <code>tools/inventory/#/item/ch</code>. The part after <code>#</code> never reaches any server; it's just for the page. When the inventory loads, it reads it, finds the item and opens it.</p>`,
    },
  ],
},
];
