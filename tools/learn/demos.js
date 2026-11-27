/* Interactive demos used inside the lessons. Each one fills `el`. */

import { esc } from '../../assets/js/ui/dom.js';
import { codeBlock, highlight } from './code.js';
import { run } from './runner.js';

const rp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');

/* ---------- HTML / CSS / JS layers ---------- */

function layers(el) {
  const HTML = `<a class="card" href="#">
  <h3>Journal</h3>
  <p>Tasks, log, calendars.</p>
  <span class="fav">♡ Tap to favourite</span>
</a>`;
  const CSS = `.card { display: block; max-width: 260px; padding: 16px; border-radius: 16px;
  background: #F6EDE6; color: #3B302B; text-decoration: none; box-shadow: 0 2px 8px #0001; }
.card h3 { margin: 0 0 4px; color: #A65D52; font-family: Georgia, serif; font-weight: 500; }
.card p { margin: 0 0 8px; }
.fav { font-size: 13px; color: #A65D52; }`;
  const JS = `const card = document.querySelector('.card');
const fav = document.querySelector('.fav');
card.addEventListener('click', e => {
  e.preventDefault();
  card.classList.toggle('on');
  fav.textContent = card.classList.contains('on') ? '♥ Favourite' : '♡ Tap to favourite';
});`;
  const STEPS = [
    ['HTML only', 'Just the things on the page, with the browser\'s plain default look.'],
    ['+ CSS', 'Now it has colours, spacing and rounded corners.'],
    ['+ JavaScript', 'Now it reacts. Tap the card.'],
  ];
  let level = 0;
  el.innerHTML = `
    <div class="choice-chips l-steps" role="radiogroup" aria-label="Layers">${STEPS.map((s, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-i="${i}">${s[0]}</button>`).join('')}</div>
    <div class="l-demo-stage" data-stage></div>
    <p class="l-demo-note" data-note></p>`;
  const draw = () => {
    el.querySelectorAll('[data-i]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.i === level)));
    el.querySelector('[data-note]').textContent = STEPS[level][1];
    run({ html: HTML, css: level >= 1 ? CSS : 'body{background:#fff;font-family:Times,serif;padding:8px}', js: level >= 2 ? JS : '', mount: el.querySelector('[data-stage]'), height: 150 });
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { level = +b.dataset.i; draw(); } });
  draw();
}

/* ---------- greeting(hour), step by step ---------- */

function greeting(el) {
  const code = `function greeting(hour) {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  if (hour < 21) {
    return 'Good evening';
  }
  return 'Good night';
}`;
  const checks = [[2, 12, 3, 'Good morning'], [5, 17, 6, 'Good afternoon'], [8, 21, 9, 'Good evening']];
  el.innerHTML = `
    <label class="l-slider"><span>hour = <strong data-h></strong></span>
      <input type="range" min="0" max="23" value="${new Date().getHours()}" data-range aria-label="Hour"></label>
    <div data-code></div>
    <p class="l-result" data-out></p>`;
  const draw = () => {
    const h = +el.querySelector('[data-range]').value;
    el.querySelector('[data-h]').textContent = h;
    const run = new Set([1]);
    const notes = {};
    let result = 'Good night', end = 11;
    for (const [line, limit, ret, text] of checks) {
      run.add(line);
      const yes = h < limit;
      notes[line] = `${h} < ${limit}? ${yes ? 'yes' : 'no'}`;
      if (yes) { run.add(ret); result = text; end = ret; break; }
    }
    if (end === 11) run.add(11);
    el.querySelector('[data-code]').innerHTML = codeBlock(code, { mark: [...run] });
    el.querySelectorAll('.l-line').forEach(ln => {
      const n = +ln.dataset.n;
      ln.classList.toggle('is-skip', n > end && n < 12);
      if (notes[n]) ln.insertAdjacentHTML('beforeend', `<span class="l-note ${notes[n].endsWith('yes') ? 'is-yes' : 'is-no'}">${esc(notes[n])}</span>`);
      if (n === end) ln.insertAdjacentHTML('beforeend', '<span class="l-note is-ret">stops here</span>');
    });
    el.querySelector('[data-out]').innerHTML = `<code>greeting(${h})</code> gives back <strong>'${esc(result)}'</strong>`;
  };
  el.querySelector('[data-range]').addEventListener('input', draw);
  draw();
}

/* ---------- filter playground ---------- */

function filterDemo(el) {
  const tasks = [
    { title: 'Pay electricity', due: '2026-11-26', done: false },
    { title: 'Buy flowers', due: '2026-11-27', done: true },
    { title: 'Call mum', due: null, done: false },
    { title: 'Renew passport', due: '2026-11-24', done: false },
    { title: 'Water the plants', due: '2026-11-26', done: true },
  ];
  const PRESETS = ['t => !t.done', 't => t.done', "t => t.due === '2026-11-26'", 't => t.due === null', "t => t.title.includes('a')"];
  el.innerHTML = `
    <div class="l-filter-input"><code>tasks.filter(</code><input class="input l-mono" data-expr value="${esc(PRESETS[0])}" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Your keep-this-one function"><code>)</code></div>
    <div class="l-presets">${PRESETS.map(p => `<button type="button" class="btn btn-ghost btn-sm l-mono" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <ul class="l-tasks" data-list></ul>
    <p class="l-result" data-out></p>`;
  const input = el.querySelector('[data-expr]');
  const draw = () => {
    let fn = null, err = '';
    try { fn = new Function(`return (${input.value})`)(); if (typeof fn !== 'function') { err = 'That isn\'t a function yet. It should look like: t => …'; fn = null; } }
    catch (e) { err = 'JavaScript can\'t read that yet. Keep typing, or pick an example.'; }
    el.querySelector('[data-list]').innerHTML = tasks.map(t => {
      let keep = null;
      if (fn) { try { keep = !!fn(t); } catch (e) { keep = null; } }
      return `<li class="${keep === true ? 'is-keep' : keep === false ? 'is-skip' : ''}">
        <span class="l-task-obj l-mono">{ title: '${esc(t.title)}', due: ${t.due ? `'${t.due}'` : 'null'}, done: ${t.done} }</span>
        <span class="l-verdict">${keep === true ? 'keep' : keep === false ? 'skip' : '?'}</span></li>`;
    }).join('');
    el.querySelector('[data-out]').innerHTML = err ? esc(err)
      : `Result: <code>[${tasks.filter(t => { try { return fn(t); } catch (e) { return false; } }).map(t => `'${esc(t.title)}'`).join(', ')}]</code>`;
  };
  input.addEventListener('input', draw);
  el.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { input.value = b.dataset.p; draw(); } });
  draw();
}

/* ---------- receipt split ---------- */

function receipt(el) {
  const people = ['Rose', 'Dina', 'Ari'];
  const items = [
    { name: 'Latte', price: 40000, who: ['Rose'] },
    { name: 'Cake', price: 60000, who: ['Dina', 'Ari'] },
    { name: 'Fries', price: 30000, who: ['Rose', 'Dina', 'Ari'] },
  ];
  let tax = 10;
  el.innerHTML = `<div data-items></div>
    <label class="l-tax">Tax <input class="input" type="number" min="0" max="50" value="${tax}" data-tax inputmode="numeric" aria-label="Tax percent"> %</label>
    <div data-out></div>`;
  const draw = () => {
    el.querySelector('[data-items]').innerHTML = items.map((it, i) => `
      <div class="l-item"><span class="l-item-name">${esc(it.name)} <small>${rp(it.price)}</small></span>
        <span class="choice-chips">${people.map(p => `<button type="button" role="switch" aria-checked="${it.who.includes(p)}" data-item="${i}" data-who="${p}">${p}</button>`).join('')}</span></div>`).join('');
    const owed = {}, lines = {};
    for (const p of people) { owed[p] = 0; lines[p] = []; }
    for (const it of items) {
      const who = it.who.length ? it.who : people;
      const each = it.price / who.length;
      for (const p of who) { owed[p] += each; lines[p].push(`${it.name} ${rp(each)}${who.length > 1 ? ` (${rp(it.price)} ÷ ${who.length})` : ''}`); }
    }
    el.querySelector('[data-out]').innerHTML = `<ul class="l-owed">${people.map(p => `
      <li><span class="l-owed-name">${p}</span>
        <span class="l-owed-how">${esc(lines[p].join(' + ') || 'nothing')}${tax ? ` + tax ${tax}%` : ''}</span>
        <strong>${rp(owed[p] * (1 + tax / 100))}</strong></li>`).join('')}</ul>`;
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-item]');
    if (!b) return;
    const it = items[+b.dataset.item];
    it.who = it.who.includes(b.dataset.who) ? it.who.filter(x => x !== b.dataset.who) : [...it.who, b.dataset.who];
    draw();
  });
  el.querySelector('[data-tax]').addEventListener('input', e => { tax = Math.max(0, Number(e.target.value) || 0); draw(); });
  draw();
}

/* ---------- localStorage note ---------- */

function storage(el) {
  const KEY = 'ras:learn-note';
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  el.innerHTML = `
    <label class="field"><span class="field-label">A note</span><input class="input" data-note maxlength="80" placeholder="Anything, e.g. Buy oat milk"></label>
    <div class="button-row"><button class="btn btn-primary btn-sm" type="button" data-save>Save</button>
      <button class="btn btn-ghost btn-sm" type="button" data-reload>Reload the page</button>
      <button class="btn btn-ghost btn-sm" type="button" data-clear>Forget it</button></div>
    <p class="l-demo-note">What's stored under <code>${KEY}</code>:</p>
    <pre class="l-raw" data-raw></pre>`;
  const raw = el.querySelector('[data-raw]');
  const show = () => {
    const v = read();
    raw.textContent = v === null ? 'null (nothing saved yet)' : v;
    try { el.querySelector('[data-note]').value = v ? JSON.parse(v).text : ''; } catch (e) { /* ignore */ }
  };
  el.querySelector('[data-save]').addEventListener('click', () => {
    const text = el.querySelector('[data-note]').value;
    try { localStorage.setItem(KEY, JSON.stringify({ text, savedAt: new Date().toLocaleTimeString() })); } catch (e) { raw.textContent = 'This browser won\'t let the page save (private mode?).'; return; }
    show();
  });
  el.querySelector('[data-clear]').addEventListener('click', () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } show(); });
  el.querySelector('[data-reload]').addEventListener('click', () => location.reload());
  show();
}

/* ---------- encryption ---------- */

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function cryptoDemo(el) {
  let sealed = null;
  el.innerHTML = `
    <div class="field-grid">
      <label class="field"><span class="field-label">Your secret</span><input class="input" data-msg value="Dear diary, I finally fixed the sprig."></label>
      <label class="field"><span class="field-label">Passphrase</span><input class="input" data-pw value="rose at six"></label>
    </div>
    <button class="btn btn-primary btn-sm" type="button" data-lock>Lock it</button>
    <div data-sealed hidden>
      <p class="l-demo-note" data-time></p>
      <p class="l-demo-note">What Firebase would see:</p>
      <pre class="l-raw l-cipher" data-cipher></pre>
      <label class="field"><span class="field-label">Try a passphrase to open it</span>
        <span class="add-row" style="margin:0"><input class="input" data-try placeholder="Try a wrong one too"><button class="btn btn-ghost" type="button" data-open>Open</button></span></label>
      <p class="l-result" data-opened></p>
    </div>`;
  const $ = s => el.querySelector(s);
  $('[data-lock]').addEventListener('click', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const t0 = performance.now();
    const key = await keyFrom($('[data-pw]').value, salt);
    const ms = Math.round(performance.now() - t0);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode($('[data-msg]').value));
    sealed = { salt, iv, ct };
    $('[data-sealed]').hidden = false;
    $('[data-cipher]').textContent = b64(ct);
    $('[data-time]').innerHTML = `Turning the passphrase into a key took <strong>${ms} ms</strong>. Slow on purpose: someone guessing would need that long for <em>every</em> guess.`;
    $('[data-opened]').textContent = '';
    $('[data-try]').value = '';
  });
  $('[data-open]').addEventListener('click', async () => {
    if (!sealed) return;
    const out = $('[data-opened]');
    try {
      const key = await keyFrom($('[data-try]').value, sealed.salt);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, key, sealed.ct);
      out.innerHTML = `Opened: <strong>${esc(new TextDecoder().decode(plain))}</strong>`;
      out.className = 'l-result is-good';
    } catch (e) {
      out.textContent = 'That passphrase doesn\'t open it. There\'s no "almost right": it either opens or it doesn\'t.';
      out.className = 'l-result is-bad';
    }
  });
}

/* ---------- sync: two devices ---------- */

function sync(el) {
  const FIELDS = [['title', 'Title'], ['due', 'Due'], ['notes', 'Notes']];
  const base = { title: 'Buy flowers', due: 'Friday', notes: '' };
  const state = { phone: { ...base, due: 'Saturday' }, laptop: { ...base, notes: 'Peonies if they have them' } };
  const card = (dev, label) => `
    <div class="l-device"><h4>${label}</h4>${FIELDS.map(([k, l]) => `
      <label class="field"><span class="field-label">${l}</span><input class="input" data-dev="${dev}" data-k="${k}" value="${esc(state[dev][k])}"></label>`).join('')}</div>`;
  el.innerHTML = `
    <p class="l-demo-note">Both started from: <code>${esc(JSON.stringify(base))}</code>. Edit either one, then sync. The laptop saves last.</p>
    <div class="l-devices">${card('phone', 'Phone')}${card('laptop', 'Laptop')}</div>
    <div class="button-row"><button class="btn btn-primary btn-sm" type="button" data-sync>Sync</button><button class="btn btn-ghost btn-sm" type="button" data-reset>Start over</button></div>
    <div data-out></div>`;
  el.addEventListener('input', e => { const i = e.target.closest('[data-dev]'); if (i) state[i.dataset.dev][i.dataset.k] = i.value; });
  el.querySelector('[data-reset]').addEventListener('click', () => { state.phone = { ...base, due: 'Saturday' }; state.laptop = { ...base, notes: 'Peonies if they have them' }; el.querySelectorAll('[data-dev]').forEach(i => { i.value = state[i.dataset.dev][i.dataset.k]; }); el.querySelector('[data-out]').innerHTML = ''; });
  el.querySelector('[data-sync]').addEventListener('click', () => {
    const rows = FIELDS.map(([k, l]) => {
      const p = state.phone[k], lp = state.laptop[k], b = base[k];
      let v, why, cls = '';
      if (p === lp) { v = p; why = p === b ? 'nobody changed it' : 'both changed it the same way'; }
      else if (lp === b) { v = p; why = 'only the phone changed it'; cls = 'from-a'; }
      else if (p === b) { v = lp; why = 'only the laptop changed it'; cls = 'from-b'; }
      else { v = lp; why = 'both changed it: the laptop saved last, so it wins. The phone\'s version stays in history.'; cls = 'is-clash'; }
      return `<li class="${cls}"><span class="l-field">${l}</span><strong>${esc(v) || '<em>empty</em>'}</strong><small>${why}</small></li>`;
    });
    el.querySelector('[data-out]').innerHTML = `<h4 class="l-merged-h">Both devices now show</h4><ul class="l-merged">${rows.join('')}</ul>`;
  });
}

/* ---------- from files to your browser ---------- */

function deploy(el) {
  const STEPS = [
    ['Draft branch', 'I edit the files on a draft branch and commit (save) them. Your live site doesn\'t change yet.'],
    ['Merge into public', 'When you say "merge it into public", the draft\'s changes join the public branch.'],
    ['GitHub Actions', 'A small robot (the "Deploy site" workflow) wakes up, copies the files, and writes your Firebase config into config.js. That\'s how the config stays out of the repository.'],
    ['GitHub Pages', 'The finished files are published at roseatsix.github.io for anyone to download.'],
    ['Your browser', 'Your phone downloads the HTML, CSS and JS, and keeps a copy so the site opens even offline.'],
    ['Firebase', 'Once you sign in and unlock, your browser talks to Firebase directly, sending and receiving only encrypted items.'],
  ];
  let at = 0;
  el.innerHTML = `<ol class="l-flow">${STEPS.map((s, i) => `<li data-s="${i}"><span class="l-flow-n">${i + 1}</span><span>${s[0]}</span></li>`).join('')}</ol>
    <p class="l-flow-text" data-text></p>
    <div class="button-row"><button class="btn btn-ghost btn-sm" type="button" data-prev>Back</button><button class="btn btn-primary btn-sm" type="button" data-next>Next step</button></div>`;
  const draw = () => {
    el.querySelectorAll('[data-s]').forEach(li => { li.classList.toggle('is-on', +li.dataset.s === at); li.classList.toggle('is-past', +li.dataset.s < at); });
    el.querySelector('[data-text]').textContent = STEPS[at][1];
    el.querySelector('[data-prev]').disabled = at === 0;
    el.querySelector('[data-next]').disabled = at === STEPS.length - 1;
  };
  el.addEventListener('click', e => {
    if (e.target.closest('[data-next]')) at = Math.min(STEPS.length - 1, at + 1);
    if (e.target.closest('[data-prev]')) at = Math.max(0, at - 1);
    const li = e.target.closest('[data-s]');
    if (li) at = +li.dataset.s;
    draw();
  });
  draw();
}

export const DEMOS = { layers, greeting, filter: filterDemo, receipt, storage, crypto: cryptoDemo, sync, deploy };
export { highlight };
