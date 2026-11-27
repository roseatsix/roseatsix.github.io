/* ==========================================================
   Learn to code: lessons about how this site is built, with
   demos and practice you can run.

   Progress (finished lessons, solved practice) is kept on this
   device, and also synced (encrypted) when you're signed in and
   unlocked. Code you type is kept on this device only.
   ========================================================== */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { esc, toast } from '../../assets/js/ui/dom.js';
import { LESSONS } from './lessons.js';
import { DEMOS } from './demos.js';
import { codeBlock, makeEditor } from './code.js';
import { run, friendly } from './runner.js';

const main = document.getElementById('learn');

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"/></svg>',
};

/* ==========================================================
   Progress
   { done: { lessonId: ms }, part: { lessonId: n }, solved: { practiceId: ms } }
   ========================================================== */

const LOCAL = 'ras:learn';
const DRAFTS = 'ras:learn-code';
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

let progress = { done: {}, part: {}, solved: {}, ...readJson(LOCAL, {}) };
const drafts = readJson(DRAFTS, {});
let store = null;

function mergeProgress(a, b) {
  const out = { done: { ...a.done }, part: { ...a.part }, solved: { ...a.solved } };
  for (const [k, v] of Object.entries(b.done || {})) out.done[k] = Math.max(out.done[k] || 0, v);
  for (const [k, v] of Object.entries(b.part || {})) out.part[k] = Math.max(out.part[k] || 0, v);
  for (const [k, v] of Object.entries(b.solved || {})) out.solved[k] = Math.max(out.solved[k] || 0, v);
  return out;
}

let saveTimer;
function saveProgress() {
  writeJson(LOCAL, progress);
  clearTimeout(saveTimer);
  if (store && S.getState().status === 'unlocked') saveTimer = setTimeout(() => store.put('progress', progress).catch(() => {}), 800);
}

S.onChange(async st => {
  if (st.status !== 'unlocked' || store) return;
  store = openStore('learn');
  store.subscribe(list => {
    const remote = (list.find(i => i.key === 'progress') || {}).data;
    if (!remote) return;
    const merged = mergeProgress(progress, remote);
    const changed = JSON.stringify(merged) !== JSON.stringify(progress);
    progress = merged;
    writeJson(LOCAL, progress);
    if (changed && route().view === 'home') render();
  });
  await store.ready();
  // Send anything done on this device before signing in.
  const remote = (store.get('progress') || {}).data || {};
  if (JSON.stringify(mergeProgress(remote, progress)) !== JSON.stringify(mergeProgress(remote, {}))) saveProgress();
});

/* ==========================================================
   Routing: #/  ·  #/l/<lesson>  ·  #/play
   ========================================================== */

function route() {
  const [, a, b] = (location.hash || '#/').split('/');
  if (a === 'l' && LESSONS.some(l => l.id === b)) return { view: 'lesson', id: b };
  if (a === 'play') return { view: 'play' };
  return { view: 'home' };
}

function render() {
  const r = route();
  if (r.view === 'lesson') renderLesson(r.id);
  else if (r.view === 'play') renderPlayground();
  else renderHome();
}

addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

/* ==========================================================
   Home: the path of lessons
   ========================================================== */

function renderHome() {
  const doneCount = LESSONS.filter(l => progress.done[l.id]).length;
  const nextUp = LESSONS.find(l => !progress.done[l.id]);
  main.innerHTML = `
    <section class="view">
      <div class="l-intro panel">
        <p class="eyebrow">Learn to code</p>
        <h1>How rose at six works</h1>
        <p>Short lessons that open up the tools you use every day, one idea at a time. Each one has things to try and small bits of code to write yourself. Nothing you type can break anything.</p>
        <div class="l-intro-foot">
          <span class="l-meter" aria-label="${doneCount} of ${LESSONS.length} lessons done"><i style="width:${Math.round(doneCount / LESSONS.length * 100)}%"></i></span>
          <span class="meta"><span>${doneCount} of ${LESSONS.length} done</span></span>
          ${nextUp ? `<a class="btn btn-primary btn-sm" href="#/l/${nextUp.id}">${doneCount || progress.part[nextUp.id] ? 'Continue' : 'Start'}: ${esc(nextUp.title)}</a>` : '<span class="l-alldone">All done. Lovely work!</span>'}
        </div>
      </div>
      <ol class="l-path">${LESSONS.map((l, i) => {
        const done = !!progress.done[l.id];
        const part = progress.part[l.id] || 0;
        return `<li class="${done ? 'is-done' : ''}${nextUp && nextUp.id === l.id ? ' is-next' : ''}">
          <a href="#/l/${l.id}">
            <span class="l-stop">${done ? '<svg aria-hidden="true"><use href="#blossom"/></svg>' : i + 1}</span>
            <span class="l-stop-body">
              <span class="l-stop-title">${esc(l.title)}</span>
              <span class="l-stop-sum">${esc(l.summary)}</span>
              <span class="meta"><span>${l.minutes} min</span>${done ? '<span>done</span>' : part ? `<span>part ${part + 1} of ${l.parts.length}</span>` : ''}</span>
            </span>
          </a></li>`;
      }).join('')}</ol>
      <a class="panel l-playcard" href="#/play">
        <span class="l-playcard-icon">${ICON.code}</span>
        <span><strong>Playground</strong><small>Write any JavaScript and run it. A scratchpad for trying things.</small></span>
        ${ICON.next}
      </a>
    </section>`;
}

/* ==========================================================
   A lesson
   ========================================================== */

function renderLesson(id) {
  const idx = LESSONS.findIndex(l => l.id === id);
  const lesson = LESSONS[idx];
  const done = !!progress.done[id];
  const shown = done ? lesson.parts.length - 1 : Math.min(progress.part[id] || 0, lesson.parts.length - 1);
  const next = LESSONS[idx + 1];

  main.innerHTML = `
    <article class="view l-lesson">
      <div class="l-lesson-head">
        <a class="icon-btn" href="#/" aria-label="All lessons">${ICON.back}</a>
        <div><p class="eyebrow">Lesson ${idx + 1} · ${lesson.minutes} min</p><h1>${esc(lesson.title)}</h1></div>
      </div>
      <div data-parts></div>
      <div class="l-lesson-foot" data-foot></div>
    </article>`;
  const partsEl = main.querySelector('[data-parts]');
  const foot = main.querySelector('[data-foot]');

  const addPart = i => {
    const part = lesson.parts[i];
    const sec = document.createElement('section');
    sec.className = 'panel l-part';
    sec.innerHTML = `<div class="l-part-head"><span class="l-part-n">${i + 1}/${lesson.parts.length}</span><h2>${esc(part.title)}</h2></div>`;
    for (const step of part.steps) sec.appendChild(renderStep(step));
    partsEl.appendChild(sec);
    return sec;
  };
  const drawFoot = at => {
    const last = at >= lesson.parts.length - 1;
    if (!last) {
      foot.innerHTML = `<button class="btn btn-primary" type="button" data-more>Next: ${esc(lesson.parts[at + 1].title)}${ICON.next}</button>`;
    } else if (!progress.done[id]) {
      foot.innerHTML = `<button class="btn btn-primary" type="button" data-finish>Finish lesson</button>`;
    } else {
      foot.innerHTML = `<div class="l-finished"><svg aria-hidden="true"><use href="#blossom"/></svg><span>Lesson done.</span></div>
        ${next ? `<a class="btn btn-primary" href="#/l/${next.id}">Next lesson: ${esc(next.title)}${ICON.next}</a>` : '<a class="btn btn-primary" href="#/">Back to all lessons</a>'}`;
    }
  };

  let at = shown;
  for (let i = 0; i <= shown; i++) addPart(i);
  drawFoot(at);

  foot.addEventListener('click', e => {
    if (e.target.closest('[data-more]')) {
      at += 1;
      progress.part[id] = Math.max(progress.part[id] || 0, at);
      saveProgress();
      const sec = addPart(at);
      drawFoot(at);
      sec.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    if (e.target.closest('[data-finish]')) {
      progress.done[id] = Date.now();
      saveProgress();
      drawFoot(at);
      toast('Lesson done 🌸');
    }
  });
}

function renderStep(step) {
  const el = document.createElement('div');
  el.className = 'l-step l-' + step.t;
  if (step.t === 'p') el.innerHTML = step.html.startsWith('<') ? step.html : `<p>${step.html}</p>`;
  if (step.t === 'tip') el.innerHTML = `<span class="l-tip-icon">${ICON.bulb}</span><p>${step.html}</p>`;
  if (step.t === 'code') {
    el.innerHTML = codeBlock(step.code, { lang: step.lang || 'js', label: step.label, mark: step.mark || [] })
      + (step.notes ? `<ul class="l-notes">${step.notes.map(([n, t]) => `<li><span class="l-note-n">Line ${n}</span><span>${t}</span></li>`).join('')}</ul>` : '');
    // Tap a note to highlight its line.
    el.addEventListener('pointerover', e => {
      const li = e.target.closest('.l-notes li');
      el.querySelectorAll('.l-line').forEach(x => x.classList.toggle('is-hover', li && x.dataset.n === li.querySelector('.l-note-n').textContent.replace('Line ', '')));
    });
    el.addEventListener('pointerleave', () => el.querySelectorAll('.is-hover').forEach(x => x.classList.remove('is-hover')));
  }
  if (step.t === 'demo') {
    el.innerHTML = '<p class="l-demo-label">Try it</p><div class="l-demo-body"></div>';
    DEMOS[step.id](el.querySelector('.l-demo-body'));
  }
  if (step.t === 'quiz') renderQuiz(el, step);
  if (step.t === 'practice') renderPractice(el, step);
  return el;
}

function renderQuiz(el, q) {
  el.innerHTML = `
    <p class="l-quiz-q"><span class="l-quiz-tag">Quick check</span>${q.q}</p>
    <div class="l-quiz-options">${q.options.map((o, i) => `<button type="button" class="l-option" data-i="${i}">${o}</button>`).join('')}</div>
    <p class="l-quiz-why" hidden></p>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const right = +b.dataset.i === q.answer;
    b.classList.add(right ? 'is-right' : 'is-wrong');
    const why = el.querySelector('.l-quiz-why');
    why.hidden = false;
    why.className = 'l-quiz-why ' + (right ? 'is-good' : 'is-bad');
    why.innerHTML = right ? `<strong>Yes!</strong> ${q.why}` : 'Not quite. Have another go.';
    if (right) el.querySelectorAll('[data-i]').forEach(x => { x.disabled = true; });
  });
}

/* ==========================================================
   Practice: an editor, Run & check, hint, solution
   ========================================================== */

function renderPractice(el, p) {
  const mode = p.mode || 'js';
  const edit = p.edit || ['js'];
  const saved = drafts[p.id] || {};
  const code = { html: p.start.html || '', css: p.start.css || '', js: p.start.js || '', ...saved };
  let tab = edit[0];
  const solved = !!progress.solved[p.id];

  el.innerHTML = `
    <div class="l-practice-head">
      <span class="l-quiz-tag">${solved ? 'Solved' : 'Your turn'}</span>
      <h3>${esc(p.title)}</h3>
    </div>
    <p class="l-task">${p.task}</p>
    ${edit.length > 1 ? `<div class="l-tabs" role="tablist">${edit.map(k => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${k.toUpperCase()}</button>`).join('')}</div>` : ''}
    <textarea class="l-textarea" aria-label="Code editor"></textarea>
    ${mode === 'web' && !edit.includes('html') ? `<details class="l-readonly"><summary>The HTML this code works with</summary>${codeBlock(p.start.html, { lang: 'html' })}</details>` : ''}
    <div class="l-actions">
      <button class="btn btn-primary" type="button" data-run>${ICON.play}Run &amp; check</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" type="button" data-hint>${ICON.bulb}Hint</button>
      <button class="btn btn-ghost btn-sm" type="button" data-solution>${ICON.eye}Answer</button>
      <button class="icon-btn" type="button" data-reset aria-label="Start over" title="Start over">${ICON.undo}</button>
    </div>
    <div class="l-hint" data-hint-box hidden>${p.hint}</div>
    ${mode === 'web' ? '<div class="l-preview" data-preview><p class="l-preview-empty">Run your code to see it here.</p></div>' : ''}
    <div class="l-output" data-output hidden></div>`;

  const editor = makeEditor(el.querySelector('textarea'), v => {
    code[tab] = v;
    drafts[p.id] = { ...(drafts[p.id] || {}), [tab]: v };
    writeJson(DRAFTS, drafts);
  });
  editor.set(code[tab]);
  const out = el.querySelector('[data-output]');

  el.addEventListener('click', async e => {
    const t = e.target;
    const tb = t.closest('[data-tab]');
    if (tb) {
      tab = tb.dataset.tab;
      el.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === tb)));
      editor.set(code[tab]);
    }
    if (t.closest('[data-hint]')) { const h = el.querySelector('[data-hint-box]'); h.hidden = !h.hidden; }
    if (t.closest('[data-reset]')) {
      if (!t.closest('[data-reset]').dataset.armed) { const b = t.closest('[data-reset]'); b.dataset.armed = '1'; b.classList.add('is-armed'); b.title = 'Tap again to start over'; toast('Tap again to put the starting code back'); setTimeout(() => { delete b.dataset.armed; b.classList.remove('is-armed'); }, 3000); return; }
      Object.assign(code, { html: p.start.html || '', css: p.start.css || '', js: p.start.js || '' });
      delete drafts[p.id]; writeJson(DRAFTS, drafts);
      editor.set(code[tab]);
      out.hidden = true;
    }
    if (t.closest('[data-solution]')) {
      const box = el.querySelector('[data-hint-box]');
      box.hidden = false;
      box.innerHTML = `<p><strong>One way to do it.</strong> Read it line by line and compare it with yours. Then try typing it yourself rather than copying.</p>${edit.map(k => p.solution[k] ? codeBlock(p.solution[k], { lang: k, label: edit.length > 1 ? k.toUpperCase() : '' }) : '').join('')}
        <button class="btn btn-ghost btn-sm" type="button" data-use>Put it in the editor</button>`;
    }
    if (t.closest('[data-use]')) {
      for (const k of edit) if (p.solution[k]) code[k] = p.solution[k];
      drafts[p.id] = { ...code }; writeJson(DRAFTS, drafts);
      editor.set(code[tab]);
    }
    if (t.closest('[data-run]')) await check(t.closest('[data-run]'));
  });

  async function check(btn) {
    btn.disabled = true;
    out.hidden = false;
    out.innerHTML = '<div class="l-console" data-console></div><div data-results><p class="l-running">Running…</p></div>';
    const con = out.querySelector('[data-console]');
    const log = ({ kind, text }) => {
      if (con.childElementCount > 200) return;
      const line = document.createElement('div');
      line.className = 'l-log is-' + kind;
      line.textContent = text;
      con.appendChild(line);
    };
    const res = await run({
      js: code.js, html: code.html, css: code.css, tests: p.tests, setup: p.setup || '',
      mount: mode === 'web' ? el.querySelector('[data-preview]') : null, onLog: log,
    });
    btn.disabled = false;
    const box = out.querySelector('[data-results]');
    if (!con.childElementCount) con.remove();
    if (res.timedOut) { box.innerHTML = '<p class="l-verdict is-bad">Your code took too long. Is there a loop that never ends?</p>'; return; }
    if (!res.results) { box.innerHTML = '<p class="l-verdict is-bad">The code couldn\'t run. Fix the line above, then try again.</p>'; return; }
    const allOk = res.results.length && res.results.every(r => r.ok);
    box.innerHTML = `<ul class="l-checks">${res.results.map(r => `
      <li class="${r.ok ? 'is-ok' : 'is-fail'}"><span class="l-check-icon">${r.ok ? ICON.check : ICON.x}</span>
        <span><span class="l-check-name">${esc(r.name)}</span>${r.ok ? '' : `<span class="l-check-msg">${esc(r.msg || friendlyText(r.error))}</span>`}</span></li>`).join('')}</ul>
      ${allOk ? '<p class="l-verdict is-good"><svg aria-hidden="true"><use href="#blossom"/></svg>Nicely done! Every check passes.</p>' : ''}`;
    if (allOk && !progress.solved[p.id]) {
      progress.solved[p.id] = Date.now();
      saveProgress();
      el.querySelector('.l-quiz-tag').textContent = 'Solved';
    }
  }
}

const friendlyText = err => (err ? friendly(err) : 'Not quite yet.');

/* ==========================================================
   Playground
   ========================================================== */

const PLAY_START = `// Write anything here and press Run.
// console.log shows things below.

function hello(name) {
  return 'Hello, ' + name + '!';
}

console.log(hello('Rose'));
console.log([1, 2, 3].map(n => n * 10));
`;

function renderPlayground() {
  const savedCode = (drafts.__play || {}).js;
  main.innerHTML = `
    <section class="view">
      <div class="l-lesson-head">
        <a class="icon-btn" href="#/" aria-label="All lessons">${ICON.back}</a>
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
        <div class="l-output" data-output><div class="l-console" data-console><div class="l-log is-muted">Output appears here.</div></div></div>
      </section>
    </section>`;
  const con = main.querySelector('[data-console]');
  const editor = makeEditor(main.querySelector('textarea'), v => { drafts.__play = { js: v }; writeJson(DRAFTS, drafts); });
  editor.set(savedCode ?? PLAY_START);
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
    if (res.timedOut) log({ kind: 'error', text: 'Stopped: it took longer than 5 seconds. Is there a loop that never ends?' });
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
