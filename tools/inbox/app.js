/* ==========================================================
   Inbox: drop links, notes and photos in quickly, sort them
   later into a task, a journal log or the wishlist.

   Ways in:
   - type, or tap Paste (text, links and copied images)
   - Photo: pick one or take one
   - Android: Share → rose at six (the service worker catches the
     share and parks it in the "ras-share" cache until this page
     can encrypt and save it)

   Items: in:<id> = { kind: 'text'|'link'|'photo', text, url,
     photo (JPEG data URL), createdAt, sorted (ms) | null,
     movedTo: { label, href } | null }
   ========================================================== */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { openDialog, esc, toast, busy, copyText } from '../../assets/js/ui/dom.js';
import * as J from '../journal/model.js';

const main = document.getElementById('inbox');
const store = openStore('inbox');
const journal = openStore('journal');
const inventory = openStore('inventory');
journal.subscribe(l => J.setItems(l));

const ui = { loaded: false, items: new Map(), view: 'open' };

const ICON = {
  paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="12" height="16" rx="2.5"/><path d="M9.5 4.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/><path d="m20.5 16-5-5-8 8.5"/></svg>',
  task: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="m8.5 12.2 2.5 2.5 4.5-5"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6z"/><path d="M6 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2"/><path d="M9.5 8h6M9.5 11.5h6M9.5 15h3.5"/></svg>',
  wish: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M10 4h4M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="m13 7 4 4"/></svg>',
};

const save = (key, data) => store.put(key, data).catch(err => { toast("Couldn't save. " + (err.message || '')); throw err; });
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/* ---------- making items ---------- */

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i;

/** Text (maybe with a link in it) → an item. */
function fromText(text, url = '') {
  text = (text || '').trim();
  url = (url || '').trim();
  if (!url) { const m = text.match(URL_RE); if (m) url = m[0].replace(/[).,;!?]+$/, ''); }
  if (url) {
    const rest = text.replace(url, '').trim();
    return { kind: 'link', url, text: rest };
  }
  return text ? { kind: 'text', text } : null;
}

/** Shrinks a photo to a JPEG small enough to sync (under ~600 KB). */
async function shrinkPhoto(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch (e) {
    // Some formats only decode through an <img>.
    const url = URL.createObjectURL(file);
    try {
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("That image couldn't be read.")); im.src = url; });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w0 = bmp.width, h0 = bmp.height;
  for (const [max, q] of [[1600, 0.82], [1400, 0.75], [1200, 0.7], [1000, 0.65], [800, 0.6]]) {
    const scale = Math.min(1, max / Math.max(w0, h0));
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(bmp, 0, 0, w, h);
    const data = c.toDataURL('image/jpeg', q);
    if (data.length < 600000) return { photo: data, w, h };
  }
  throw new Error('That photo is too large to keep.');
}

async function addItem(item, source) {
  await save('in:' + newId(), { ...item, source, createdAt: Date.now(), sorted: null, movedTo: null });
}

async function addPhotos(files, caption = '', source = 'photo') {
  let n = 0;
  for (const f of files) {
    if (!f || !/^image\//.test(f.type || 'image/')) continue;
    try {
      const p = await shrinkPhoto(f);
      await addItem({ kind: 'photo', text: n === 0 ? caption : '', ...p }, source);
      n++;
    } catch (e) { toast(e.message || "Couldn't add that photo."); }
  }
  return n;
}

/* ---------- Android share target ---------- */

async function takeShared() {
  if (!('caches' in window)) return;
  let cache;
  try { cache = await caches.open('ras-share'); } catch (e) { return; }
  const metas = (await cache.keys()).filter(r => r.url.endsWith('/meta'));
  let count = 0;
  for (const req of metas) {
    try {
      const meta = await (await cache.match(req)).json();
      const files = [];
      for (const f of meta.files || []) {
        const res = await cache.match(f.key);
        if (res) files.push(new File([await res.blob()], f.name || 'photo', { type: f.type || res.headers.get('content-type') || 'image/jpeg' }));
        await cache.delete(f.key);
      }
      const words = [meta.title, meta.text].filter(Boolean).join('\n').trim();
      if (files.length) count += await addPhotos(files, [words, meta.url].filter(Boolean).join('\n'), 'share');
      else {
        const it = fromText(words, meta.url);
        if (it) { await addItem(it, 'share'); count++; }
      }
    } catch (e) { console.warn('Shared item could not be read', e); }
    await cache.delete(req);
  }
  if (count) toast(count === 1 ? 'Saved to your inbox' : `Saved ${count} things to your inbox`);
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}

/* ---------- views ---------- */

function gate(st) {
  const copy = {
    signedOut: ['Your inbox is private', 'Sign in with Google to start. Everything is encrypted on your device before it syncs.', 'Sign in'],
    unconfigured: ["Sync isn't set up", 'Sign-in needs to be connected first.', null],
    needsSetup: ['Set up your vault', 'Choose a passphrase to encrypt your data.', 'Set up vault'],
    locked: ['Unlock your inbox', 'Enter your passphrase to open it on this device.', 'Unlock'],
    denied: ["Can't open your data", 'The database refused access for this account.', null],
    error: ['Something went wrong', st.error || '', 'Try again'],
  }[st.status];
  const waiting = new URLSearchParams(location.search).has('shared') ? '<p class="ib-waiting">Your shared item is waiting. It will be saved as soon as the inbox is open.</p>' : '';
  if (!copy) return '<div class="gate"><span class="spinner" aria-hidden="true"></span><p>Opening…</p></div>';
  return `<div class="gate"><svg class="gate-blossom" aria-hidden="true"><use href="#blossom"/></svg><h1>${esc(copy[0])}</h1><p>${esc(copy[1])}</p>${waiting}
    ${copy[2] ? `<button class="btn btn-primary" type="button" data-act="gate">${esc(copy[2])}</button>` : ''}</div>`;
}

function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function domain(url) {
  try { const u = new URL(url); return { host: u.hostname.replace(/^www\./, ''), path: (u.pathname + u.search).replace(/\/$/, '') }; }
  catch (e) { return { host: url, path: '' }; }
}

const list = () => [...ui.items.entries()].filter(([k]) => k.startsWith('in:')).map(([k, v]) => ({ id: k.slice(3), ...v }));

function card(it) {
  const kind = it.kind === 'link' ? 'Link' : it.kind === 'photo' ? 'Photo' : 'Note';
  const d = it.kind === 'link' ? domain(it.url) : null;
  return `
    <li class="ib-item ib-${it.kind}${it.sorted ? ' is-sorted' : ''}" data-id="${it.id}">
      ${it.kind === 'photo' ? `<button type="button" class="ib-thumb" data-act="view" aria-label="View photo"><img src="${it.photo}" alt="" loading="lazy"></button>` : ''}
      <div class="ib-body">
        <div class="ib-meta"><span class="ib-kind">${kind}</span><span>${esc(ago(it.createdAt))}</span>${it.source === 'share' ? '<span>shared</span>' : ''}</div>
        ${it.kind === 'link' ? `<a class="ib-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(d.host)}</strong><span>${esc(d.path)}</span></a>` : ''}
        ${it.text ? `<p class="ib-text">${esc(it.text)}</p>` : ''}
        ${it.movedTo ? `<a class="ib-moved" href="${esc(it.movedTo.href)}">${ICON.done}${esc(it.movedTo.label)}</a>` : ''}
      </div>
      <div class="ib-actions">
        ${it.sorted ? '' : `
          <button type="button" class="ib-chip" data-act="task">${ICON.task}Task</button>
          <button type="button" class="ib-chip" data-act="log">${ICON.log}Log</button>
          <button type="button" class="ib-chip" data-act="wish">${ICON.wish}Wishlist</button>`}
        <span class="spacer"></span>
        <button type="button" class="icon-btn" data-act="${it.sorted ? 'unsort' : 'sort'}" aria-label="${it.sorted ? 'Back to the inbox' : 'Done'}" title="${it.sorted ? 'Back to the inbox' : 'Done'}">${it.sorted ? ICON.undo : ICON.done}</button>
        <button type="button" class="icon-btn" data-act="more" aria-label="More" title="More">${ICON.more}</button>
      </div>
    </li>`;
}

function render() {
  if (!ui.loaded) { main.innerHTML = gate(S.getState()); return; }
  const all = list().sort((a, b) => b.createdAt - a.createdAt);
  const open = all.filter(x => !x.sorted);
  const done = all.filter(x => x.sorted).sort((a, b) => b.sorted - a.sorted);
  const shown = ui.view === 'done' ? done : open;
  const old = main.querySelector('[data-draft]');
  const draft = old ? old.value : '';
  const focused = old && document.activeElement === old;
  const sel = focused ? [old.selectionStart, old.selectionEnd] : null;
  main.innerHTML = `
    <section class="view">
      <form class="panel ib-capture" data-form="capture">
        <textarea class="input ib-draft" data-draft name="text" rows="2" placeholder="A note, or paste a link" aria-label="Add to your inbox" enterkeyhint="done"></textarea>
        <div class="ib-capture-row">
          <button class="btn btn-ghost btn-sm" type="button" data-act="paste">${ICON.paste}Paste</button>
          <label class="btn btn-ghost btn-sm ib-photo-btn">${ICON.photo}Photo<input type="file" accept="image/*" multiple data-photo hidden></label>
          <span class="spacer"></span>
          <button class="btn btn-primary btn-sm" type="submit">Save</button>
        </div>
      </form>
      <div class="choice-chips ib-views" role="tablist">
        <button type="button" role="tab" aria-checked="${ui.view === 'open'}" data-view="open">To sort <span>${open.length}</span></button>
        <button type="button" role="tab" aria-checked="${ui.view === 'done'}" data-view="done">Sorted <span>${done.length}</span></button>
      </div>
      ${shown.length ? `<ul class="ib-list">${shown.map(card).join('')}</ul>`
        : `<p class="empty ib-empty">${ui.view === 'done' ? 'Nothing sorted yet.' : 'All sorted. Anything you paste, photograph or share lands here.'}</p>`}
    </section>`;
  const box = main.querySelector('[data-draft]');
  box.value = draft;
  if (focused) { box.focus({ preventScroll: true }); box.setSelectionRange(sel[0], sel[1]); }
}

/* ---------- moving things out ---------- */

const titleOf = it => (it.text || '').split('\n')[0].slice(0, 120) || (it.kind === 'link' ? domain(it.url).host : 'Photo from the inbox');
const notesOf = it => [it.text && it.text.includes('\n') ? it.text : '', it.url].filter(Boolean).join('\n');

async function moveOut(it, where) {
  const done = { sorted: Date.now() };
  if (where === 'task') {
    const id = J.newId();
    await journal.put('task:' + id, { title: titleOf(it), due: null, time: null, done: false, notes: notesOf(it) + (it.kind === 'photo' ? '\n(The photo is in your inbox.)' : ''), subtasks: {}, createdAt: Date.now() });
    done.movedTo = { label: 'Task in the journal', href: `../journal/#/task/${id}` };
  }
  if (where === 'log') {
    const cats = J.activeList(J.config().logCats).filter(c => !J.isSpendCat(c.id));
    const id = J.newId();
    await journal.put('log:' + id, { date: J.today(), time: J.nowTime(), cat: (cats.find(c => c.id === 'personal') || cats[0]).id, text: [it.text, it.url].filter(Boolean).join('\n') || 'Photo from the inbox', amount: null, spendCat: null, createdAt: Date.now() });
    done.movedTo = { label: 'Logged in the journal', href: `../journal/#/log/${id}` };
  }
  if (where === 'wish') {
    const id = J.newId();
    await inventory.put('item:' + id, { name: titleOf(it), qty: 1, category: 'other', status: 'wish', notes: notesOf(it), createdAt: Date.now() });
    done.movedTo = { label: 'On your wishlist', href: `../inventory/#/item/${id}` };
  }
  await save('in:' + it.id, { ...ui.items.get('in:' + it.id), ...done });
  toast(done.movedTo.label);
}

/* ---------- dialogs ---------- */

function openEdit(it) {
  return openDialog({
    label: 'Edit',
    render(el, close) {
      el.innerHTML = `
        <h2>Edit</h2>
        <form data-form>
          ${it.kind === 'link' ? `<label class="field"><span class="field-label">Link</span><input class="input" name="url" value="${esc(it.url)}" inputmode="url" autocapitalize="off" spellcheck="false"></label>` : ''}
          <label class="field"><span class="field-label">${it.kind === 'text' ? 'Note' : 'Note (optional)'}</span><textarea class="input" name="text" rows="4">${esc(it.text || '')}</textarea></label>
          <div class="dialog-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>
        </form>`;
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-form]').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        const next = { ...ui.items.get('in:' + it.id), text: f.text.value.trim() };
        if (f.url) next.url = f.url.value.trim();
        if (next.kind === 'text' && !next.text) return;
        await busy(f.querySelector('[type=submit]'), 'Saving…', () => save('in:' + it.id, next));
        close();
      });
    },
  });
}

function openMore(it) {
  return openDialog({
    label: 'More',
    render(el, close) {
      el.innerHTML = `
        <h2>${esc(it.kind === 'link' ? domain(it.url).host : it.kind === 'photo' ? 'Photo' : 'Note')}</h2>
        <div class="ib-menu">
          ${it.kind !== 'photo' ? `<button type="button" class="ib-menu-item" data-m="copy">${ICON.copy}Copy</button>` : ''}
          ${it.kind === 'link' ? `<a class="ib-menu-item" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${ICON.open}Open link</a>` : ''}
          <button type="button" class="ib-menu-item" data-m="edit">${ICON.edit}Edit</button>
          <button type="button" class="ib-menu-item danger-text" data-m="delete">${ICON.trash}Delete</button>
        </div>`;
      el.addEventListener('click', async e => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        if (b.dataset.m === 'copy') { copyText(it.kind === 'link' ? [it.url, it.text].filter(Boolean).join('\n') : it.text); close(); }
        if (b.dataset.m === 'edit') { close(); openEdit(it); }
        if (b.dataset.m === 'delete') {
          if (!b.dataset.armed) { b.dataset.armed = '1'; b.lastChild.textContent = 'Tap again to delete'; return; }
          await store.remove('in:' + it.id);
          close();
        }
      });
    },
  });
}

function openPhoto(it) {
  return openDialog({
    label: 'Photo',
    render(el) {
      el.closest('dialog').classList.add('is-wide');
      el.innerHTML = `
        <img class="ib-full" src="${it.photo}" alt="${esc(it.text || 'Photo')}">
        ${it.text ? `<p class="ib-caption">${esc(it.text)}</p>` : ''}
        <div class="dialog-actions"><a class="btn btn-ghost" href="${it.photo}" download="inbox-photo.jpg">Save image</a></div>`;
    },
  });
}

/* ---------- paste ---------- */

async function paste() {
  const draft = main.querySelector('[data-draft]');
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      const images = [], texts = [];
      for (const ci of items) {
        const img = ci.types.find(t => t.startsWith('image/'));
        if (img) images.push(new File([await ci.getType(img)], 'pasted', { type: img }));
        else if (ci.types.includes('text/plain')) texts.push(await (await ci.getType('text/plain')).text());
        else if (ci.types.includes('text/uri-list')) texts.push(await (await ci.getType('text/uri-list')).text());
      }
      if (images.length) { const n = await addPhotos(images, texts.join('\n'), 'paste'); if (n) toast(n === 1 ? 'Photo saved' : `${n} photos saved`); return; }
      if (texts.length) return savePasted(texts.join('\n'));
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      return savePasted(await navigator.clipboard.readText());
    }
  } catch (e) {
    if (e && e.name === 'NotAllowedError') { draft.focus(); toast('Paste was blocked. Long-press the box and choose Paste.'); return; }
  }
  draft.focus();
  toast('Nothing to paste. Copy something first.');
}

async function savePasted(text) {
  const it = fromText(text);
  if (!it) { toast('Nothing to paste. Copy something first.'); return; }
  await addItem(it, 'paste');
  toast('Saved');
}

/* ---------- wiring ---------- */

main.addEventListener('click', async e => {
  const b = e.target.closest('[data-act], [data-view]');
  if (!b) return;
  if (b.dataset.view) { ui.view = b.dataset.view; render(); return; }
  const act = b.dataset.act;
  if (act === 'gate') { if (S.getState().status === 'error') return S.retry(); return document.querySelector('#account-slot [data-act]')?.click(); }
  if (act === 'paste') return busy(b, 'Pasting…', paste);
  const li = b.closest('[data-id]');
  if (!li) return;
  const it = { id: li.dataset.id, ...ui.items.get('in:' + li.dataset.id) };
  try {
    if (act === 'view') return openPhoto(it);
    if (act === 'more') return openMore(it);
    if (act === 'task' || act === 'log' || act === 'wish') return busy(b, '…', () => moveOut(it, act));
    if (act === 'sort') return save('in:' + it.id, { ...ui.items.get('in:' + it.id), sorted: Date.now() });
    if (act === 'unsort') return save('in:' + it.id, { ...ui.items.get('in:' + it.id), sorted: null, movedTo: null });
  } catch (err) { toast(err.message || "Couldn't do that."); }
});

main.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form !== 'capture') return;
  const it = fromText(f.text.value);
  if (!it) { f.text.focus(); return; }
  f.text.value = '';
  try { await addItem(it, 'typed'); } catch (err) { f.text.value = it.text || it.url; }
});

main.addEventListener('keydown', e => {
  if (e.target.matches('[data-draft]') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.target.form.requestSubmit(); }
});

// Pasting an image straight into the box saves it as a photo.
main.addEventListener('paste', async e => {
  if (!e.target.matches('[data-draft]')) return;
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  const n = await addPhotos(files, e.target.value.trim(), 'paste');
  if (n) { e.target.value = ''; toast(n === 1 ? 'Photo saved' : `${n} photos saved`); }
});

main.addEventListener('change', async e => {
  const input = e.target.closest('[data-photo]');
  if (!input || !input.files.length) return;
  const files = [...input.files];
  const draft = main.querySelector('[data-draft]');
  const caption = draft.value.trim();
  input.value = '';
  toast(files.length === 1 ? 'Adding photo…' : `Adding ${files.length} photos…`);
  const n = await addPhotos(files, caption, 'photo');
  if (n) { draft.value = ''; toast(n === 1 ? 'Photo saved' : `${n} photos saved`); }
});

store.subscribe(items => {
  ui.items = new Map(items.map(i => [i.key, i.data]));
  const first = !ui.loaded;
  ui.loaded = true;
  render();
  if (first) takeShared();
});
S.onChange(st => { if (st.status !== 'unlocked') { ui.loaded = false; ui.items = new Map(); render(); } });
addEventListener('focus', () => { if (ui.loaded) takeShared(); });
mountHeader({ autoUnlock: true });
render();
