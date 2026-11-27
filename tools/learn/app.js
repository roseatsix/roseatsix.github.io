/* ==========================================================
   Learn: case studies that follow real features of this site
   through the actual code, step by step. Plus a playground.

   Progress (which case studies you've finished, and where you
   stopped) is kept on this device, and synced (encrypted) when
   you're signed in and unlocked.
   ========================================================== */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { esc, toast } from '../../assets/js/ui/dom.js';
import { CASES, PLACES } from './cases.js';
import { DEMOS } from './demos.js';
import { codeBlock, makeEditor } from './code.js';
import { run } from './runner.js';

const main = document.getElementById('learn');

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/></svg>',
  code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  place: {
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V6A1.5 1.5 0 0 1 5.5 4.5z"/><path d="M8 12h8M8 15.5h5"/></svg>',
    page: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17"/><circle cx="6.5" cy="6.8" r=".6"/><circle cx="8.8" cy="6.8" r=".6"/></svg>',
    device: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 9.6 4.5 4.5 0 0 0 7 18.5z"/></svg>',
  },
};

/* ==========================================================
   Progress: { done: { caseId: ms }, at: { caseId: stepIndex } }
   ========================================================== */

const LOCAL = 'ras:learn-cases';
const DRAFTS = 'ras:learn-code';
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

let progress = { done: {}, at: {}, ...readJson(LOCAL, {}) };
let store = null;

function mergeProgress(a, b) {
  const out = { done: { ...a.done }, at: { ...a.at } };
  for (const [k, v] of Object.entries(b.done || {})) out.done[k] = Math.max(out.done[k] || 0, v);
  for (const [k, v] of Object.entries(b.at || {})) out.at[k] = Math.max(out.at[k] || 0, v);
  return out;
}

let saveTimer;
function saveProgress() {
  writeJson(LOCAL, progress);
  clearTimeout(saveTimer);
  if (store && S.getState().status === 'unlocked') saveTimer = setTimeout(() => store.put('cases', progress).catch(() => {}), 1500);
}

S.onChange(async st => {
  if (st.status !== 'unlocked' || store) return;
  store = openStore('learn');
  store.subscribe(list => {
    const remote = (list.find(i => i.key === 'cases') || {}).data;
    if (!remote) return;
    const merged = mergeProgress(progress, remote);
    const changed = JSON.stringify(merged) !== JSON.stringify(progress);
    progress = merged;
    writeJson(LOCAL, progress);
    if (changed && route().view === 'home') render();
  });
  await store.ready();
  const remote = (store.get('cases') || {}).data || {};
  if (JSON.stringify(mergeProgress(remote, progress)) !== JSON.stringify(mergeProgress(remote, {}))) saveProgress();
});

/* ==========================================================
   Routing: #/  ·  #/c/<case>/<step>  ·  #/c/<case>/all  ·  #/play
   ========================================================== */

function route() {
  const [, a, b, c] = (location.hash || '#/').split('/');
  const cs = CASES.find(x => x.id === b);
  if (a === 'c' && cs) {
    if (c === 'all') return { view: 'all', cs };
    const n = Math.min(Math.max(1, parseInt(c, 10) || 1), cs.steps.length);
    return { view: 'case', cs, step: n - 1 };
  }
  if (a === 'play') return { view: 'play' };
  return { view: 'home' };
}

let lastView = '';
function render() {
  const r = route();
  if (r.view === 'case') renderCase(r.cs, r.step);
  else if (r.view === 'all') renderAll(r.cs);
  else if (r.view === 'play') renderPlayground();
  else renderHome();
  const key = r.view + (r.cs ? r.cs.id : '');
  if (key !== lastView) scrollTo(0, 0);
  lastView = key;
}
addEventListener('hashchange', render);

/* ==========================================================
   Home
   ========================================================== */

function renderHome() {
  const doneCount = CASES.filter(c => progress.done[c.id]).length;
  const nextUp = CASES.find(c => !progress.done[c.id]);
  main.innerHTML = `
    <section class="view">
      <div class="l-intro panel">
        <p class="eyebrow">Learn from your own site</p>
        <h1>How rose at six works</h1>
        <p>Case studies that follow one thing you do (tapping Log it, signing in, searching) through the real code, step by step: which function runs, which one it calls next, and where your data is at that moment. No exercises; just follow along, and poke the live demos when you feel like it.</p>
        <div class="l-intro-foot">
          <span class="l-meter" aria-label="${doneCount} of ${CASES.length} read"><i style="width:${Math.round(doneCount / CASES.length * 100)}%"></i></span>
          <span class="meta"><span>${doneCount} of ${CASES.length} read</span></span>
          ${nextUp ? `<a class="btn btn-primary btn-sm" href="#/c/${nextUp.id}/${(progress.at[nextUp.id] || 0) + 1}">${progress.at[nextUp.id] ? 'Continue' : 'Start'}: ${esc(nextUp.title)}</a>` : '<span class="l-alldone">All read. Lovely!</span>'}
        </div>
      </div>
      <ol class="l-path">${CASES.map((c, i) => {
        const done = !!progress.done[c.id];
        const at = progress.at[c.id] || 0;
        return `<li class="${done ? 'is-done' : ''}${nextUp && nextUp.id === c.id ? ' is-next' : ''}">
          <a href="#/c/${c.id}/${done ? 1 : at + 1}">
            <span class="l-stop">${done ? '<svg aria-hidden="true"><use href="#blossom"/></svg>' : i + 1}</span>
            <span class="l-stop-body">
              <span class="l-stop-title">${esc(c.title)}</span>
              <span class="l-stop-sum">${esc(c.summary)}</span>
              <span class="meta"><span>${c.steps.length} steps · ${c.minutes} min</span>${done ? '<span>read</span>' : at ? `<span>at step ${at + 1}</span>` : ''}</span>
            </span>
          </a></li>`;
      }).join('')}</ol>
      <a class="panel l-playcard" href="#/play">
        <span class="l-playcard-icon">${ICON.code}</span>
        <span><strong>Playground</strong><small>A scratchpad for running bits of JavaScript, if you ever want to try something.</small></span>
        ${ICON.next}
      </a>
    </section>`;
}

/* ==========================================================
   A case study, one step at a time
   ========================================================== */

function placesBar(active) {
  return `<ol class="l-places" aria-label="Where this step happens">${['github', 'page', 'device', 'cloud'].map(p => `
    <li class="${p === active ? 'is-here' : ''}" ${p === active ? 'aria-current="step"' : ''}>
      ${ICON.place[p]}<span><strong>${PLACES[p].name}</strong><small>${PLACES[p].sub}</small></span></li>`).join('')}</ol>`;
}

function stepHtml(step) {
  const shortened = step.simplified || (step.code || '').includes('…');
  return `
    ${step.stack ? `<div class="l-stack" aria-label="Which function called which">
      <span class="l-stack-label">Call chain</span>
      <ol>${step.stack.map((f, i) => `<li class="${i === step.stack.length - 1 ? 'is-now' : ''}"><code>${esc(f)}</code></li>`).join('')}</ol>
    </div>` : ''}
    <div class="l-step-grid${step.code ? '' : ' is-text'}">
      ${step.code ? `<div class="l-step-code">
        <div class="l-file">${ICON.file}<span>${esc(step.file || '')}</span>${shortened ? '<span class="l-short">shortened</span>' : ''}</div>
        ${codeBlock(step.code, { lang: step.lang || 'js', mark: step.mark || [] })}
      </div>` : ''}
      <div class="l-step-text">
        ${!step.code && step.file ? `<div class="l-file">${ICON.file}<span>${esc(step.file)}</span></div>` : ''}
        <div class="l-explain">${step.explain}</div>
        ${step.idea ? `<div class="l-idea"><span class="l-idea-icon">${ICON.bulb}</span><div><strong>Function idea: ${esc(step.idea.name)}</strong><p>${step.idea.html}</p></div></div>` : ''}
        ${step.data ? `<div class="l-data"><span class="l-data-label">${esc(step.data.label)}</span><pre>${esc(step.data.value)}</pre></div>` : ''}
      </div>
    </div>
    ${step.demo ? '<div class="l-demo"><p class="l-demo-label">Live: running the real code</p><div class="l-demo-body" data-demo></div></div>' : ''}`;
}

function mountDemo(root, step) {
  const el = root.querySelector('[data-demo]');
  if (el && DEMOS[step.demo]) DEMOS[step.demo](el);
}

function renderCase(cs, i) {
  const step = cs.steps[i];
  const idx = CASES.indexOf(cs);
  const last = i === cs.steps.length - 1;
  const nextCase = CASES[idx + 1];
  if (i > (progress.at[cs.id] || 0)) { progress.at[cs.id] = i; saveProgress(); }

  main.innerHTML = `
    <article class="view l-case">
      <div class="l-lesson-head">
        <a class="icon-btn" href="#/" aria-label="All case studies">${ICON.back}</a>
        <div><p class="eyebrow">Case study ${idx + 1}</p><h1>${esc(cs.title)}</h1></div>
        <a class="icon-btn l-allbtn" href="#/c/${cs.id}/all" aria-label="All steps on one page" title="All steps on one page">${ICON.list}</a>
      </div>
      ${placesBar(step.place)}
      <section class="panel l-stepcard">
        <div class="l-step-head">
          <span class="l-step-n">Step ${i + 1} of ${cs.steps.length}</span>
          <h2>${esc(step.title)}</h2>
        </div>
        ${stepHtml(step)}
      </section>
      <nav class="l-stepnav" aria-label="Steps">
        ${i > 0 ? `<a class="btn btn-ghost" href="#/c/${cs.id}/${i}">${ICON.back}Back</a>` : '<span></span>'}
        <span class="l-dots">${cs.steps.map((s, k) => `<a href="#/c/${cs.id}/${k + 1}" class="${k === i ? 'is-on' : k < i ? 'is-past' : ''}" aria-label="Step ${k + 1}: ${esc(s.title)}"></a>`).join('')}</span>
        ${last
          ? `<button class="btn btn-primary" type="button" data-finish>${progress.done[cs.id] ? 'Read' : 'Finish'}</button>`
          : `<a class="btn btn-primary" href="#/c/${cs.id}/${i + 2}">Next${ICON.next}</a>`}
      </nav>
      <div data-after></div>
    </article>`;
  mountDemo(main, step);

  const after = main.querySelector('[data-after]');
  const showAfter = () => {
    after.innerHTML = `<div class="l-finished"><svg aria-hidden="true"><use href="#blossom"/></svg><span>That's the whole story.</span>
      ${nextCase ? `<a class="btn btn-primary btn-sm" href="#/c/${nextCase.id}/1">Next: ${esc(nextCase.title)}${ICON.next}</a>` : '<a class="btn btn-ghost btn-sm" href="#/">All case studies</a>'}</div>`;
  };
  if (last && progress.done[cs.id]) showAfter();
  main.querySelector('[data-finish]')?.addEventListener('click', () => {
    if (!progress.done[cs.id]) { progress.done[cs.id] = Date.now(); saveProgress(); toast('Case study read 🌸'); }
    showAfter();
  });
}

/* All steps of one case study on one page, for re-reading. */
function renderAll(cs) {
  const idx = CASES.indexOf(cs);
  main.innerHTML = `
    <article class="view l-case">
      <div class="l-lesson-head">
        <a class="icon-btn" href="#/c/${cs.id}/1" aria-label="Back to step by step">${ICON.back}</a>
        <div><p class="eyebrow">Case study ${idx + 1} · all steps</p><h1>${esc(cs.title)}</h1></div>
      </div>
      ${cs.steps.map((s, i) => `
        <section class="panel l-stepcard" data-i="${i}">
          <div class="l-step-head">
            <span class="l-step-n">Step ${i + 1}</span><span class="l-place-tag">${ICON.place[s.place]}${PLACES[s.place].name}</span>
            <h2>${esc(s.title)}</h2>
          </div>
          ${stepHtml(s)}
        </section>`).join('')}
    </article>`;
  cs.steps.forEach((s, i) => mountDemo(main.querySelector(`[data-i="${i}"]`), s));
}

// Arrow keys move between steps.
addEventListener('keydown', e => {
  const r = route();
  if (r.view !== 'case' || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'ArrowRight' && r.step < r.cs.steps.length - 1) location.hash = `#/c/${r.cs.id}/${r.step + 2}`;
  if (e.key === 'ArrowLeft' && r.step > 0) location.hash = `#/c/${r.cs.id}/${r.step}`;
});

/* ==========================================================
   Playground
   ========================================================== */

const drafts = readJson(DRAFTS, {});
const PLAY_START = `// Write anything here and press Run.
// console.log shows things below.

function hello(name) {
  return 'Hello, ' + name + '!';
}

console.log(hello('Rose'));
console.log([1, 2, 3].map(n => n * 10));
`;

function renderPlayground() {
  main.innerHTML = `
    <section class="view">
      <div class="l-lesson-head">
        <a class="icon-btn" href="#/" aria-label="Back">${ICON.back}</a>
        <div><p class="eyebrow">Scratchpad</p><h1>Playground</h1></div>
      </div>
      <section class="panel l-play">
        <textarea class="l-textarea" aria-label="Code editor"></textarea>
        <div class="l-actions">
          <button class="btn btn-primary" type="button" data-run>${ICON.play}Run</button>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" type="button" data-clear>Clear output</button>
          <button class="icon-btn" type="button" data-reset aria-label="Start over" title="Start over">${ICON.undo}</button>
        </div>
        <div class="l-output"><div class="l-console" data-console><div class="l-log is-muted">Output appears here.</div></div></div>
      </section>
    </section>`;
  const con = main.querySelector('[data-console]');
  const editor = makeEditor(main.querySelector('textarea'), v => { drafts.__play = { js: v }; writeJson(DRAFTS, drafts); });
  editor.set((drafts.__play || {}).js ?? PLAY_START);
  const log = ({ kind, text }) => {
    const line = document.createElement('div');
    line.className = 'l-log is-' + kind;
    line.textContent = text;
    con.appendChild(line);
  };
  main.querySelector('[data-run]').addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true;
    con.innerHTML = '';
    const res = await run({ js: editor.get(), onLog: log, timeout: 5000 });
    b.disabled = false;
    if (res.timedOut) log({ kind: 'error', text: 'Stopped: it took longer than 5 seconds.' });
    else if (!con.childElementCount) log({ kind: 'muted', text: 'Done. (Nothing was logged. Use console.log(...) to show something.)' });
  });
  main.querySelector('[data-clear]').addEventListener('click', () => { con.innerHTML = ''; });
  main.querySelector('[data-reset]').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.classList.add('is-armed'); toast('Tap again to put the example back'); setTimeout(() => { delete b.dataset.armed; b.classList.remove('is-armed'); }, 3000); return; }
    editor.set(PLAY_START); delete drafts.__play; writeJson(DRAFTS, drafts);
  });
}

mountHeader();
render();
