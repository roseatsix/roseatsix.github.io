/* ==========================================================
   Runs practice code safely.

   Your code runs inside a sandboxed <iframe>: a tiny separate
   page that can't touch this one (or your data). It reports back
   by posting messages: console.log lines, errors, and the result
   of each check.
   ========================================================== */

const BASE_CSS = `
  body { margin: 0; padding: 14px; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #3B302B; background: #FBF8F4; }
  button { font: inherit; padding: 6px 14px; border-radius: 999px; border: 1px solid #d9cdc2; background: #fff; cursor: pointer; }
  input { font: inherit; padding: 6px 10px; border-radius: 10px; border: 1px solid #d9cdc2; }
`;

/* Runs inside the iframe, before your code. */
const PRELUDE = token => `
(() => {
  const send = (type, data) => parent.postMessage({ __learn: ${JSON.stringify(token)}, type, data }, '*');
  const show = (v, depth = 0) => {
    if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return 'function ' + (v.name || '(no name)');
    if (v instanceof Error) return v.name + ': ' + v.message;
    if (Array.isArray(v)) return depth > 2 ? '[…]' : '[' + v.map(x => show(x, depth + 1)).join(', ') + ']';
    if (v && typeof v === 'object') {
      if (typeof Element !== 'undefined' && v instanceof Element) return '<' + v.tagName.toLowerCase() + '>';
      if (depth > 2) return '{…}';
      return '{ ' + Object.entries(v).map(([k, x]) => k + ': ' + show(x, depth + 1)).join(', ') + ' }';
    }
    return String(v);
  };
  window.__show = show;
  window.__send = send;
  for (const kind of ['log', 'info', 'warn', 'error']) {
    console[kind] = (...args) => send('log', { kind, text: args.map(a => show(a)).join(' ') });
  }
  window.alert = msg => send('log', { kind: 'info', text: 'alert: ' + show(msg) });
  window.addEventListener('error', e => {
    const err = e.error || {};
    if (err.name === 'SyntaxError' || /SyntaxError/.test(e.message)) window.__syntaxError = true;
    send('error', { name: err.name || 'Error', message: err.message || e.message, line: e.lineno });
  });
  window.addEventListener('unhandledrejection', e => {
    const err = e.reason || {};
    send('error', { name: err.name || 'Error', message: err.message || String(e.reason), line: 0 });
  });
  // Checks
  window.__checks = [];
  window.check = (name, fn) => window.__checks.push([name, fn]);
  // Compares values; the order of keys in an object doesn't matter.
  const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : v === undefined ? 'undefined' : typeof v === 'number' && isNaN(v) ? 'NaN' : JSON.stringify(v);
  window.same = (a, b) => canon(a) === canon(b);
  window.wait = ms => new Promise(r => setTimeout(r, ms));
  window.gives = (label, actual, expected) => window.same(actual, expected) ? true
    : actual === undefined ? label + ' gave back nothing (undefined). Did you forget "return"?'
    : label + ' gave ' + show(actual, 1) + ', but it should be ' + show(expected, 1) + '.';
  // Loop guard: every loop body calls __lp(id). A loop that keeps going
  // for 2 seconds without a break is stopped, so the page can't freeze.
  const loops = {};
  let warned = false;
  window.__lp = id => {
    const now = Date.now();
    const s = loops[id];
    if (!s || now - s.last > 50) { loops[id] = { start: now, last: now }; return false; }
    s.last = now;
    if (now - s.start < 2000) return false;
    if (!warned) { warned = true; send('error', { name: 'LoopError', message: 'A loop ran for more than 2 seconds, so it was stopped. Is there a loop that never ends?', line: 0 }); }
    return true;
  };
  window.$ = sel => document.querySelector(sel);
  window.$$ = sel => [...document.querySelectorAll(sel)];
})();`;

/* Runs after your code: goes through the checks one by one. */
const AFTER = `
(async () => {
  if (window.__syntaxError) { __send('done', { results: null }); return; }
  const results = [];
  for (const [name, fn] of window.__checks) {
    try {
      const r = await fn();
      results.push({ name, ok: r === true, msg: r === true ? '' : (typeof r === 'string' ? r : 'Not quite yet.') });
    } catch (e) {
      results.push({ name, ok: false, error: { name: e && e.name, message: e && e.message ? e.message : String(e) } });
    }
  }
  __send('done', { results: window.__checks.length ? results : [] });
})();`;

/** Adds the loop guard to every for / while / do loop that has { }. */
export function guardLoops(src) {
  let n = 0;
  return src
    .replace(/\b(for|while)(\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*)\{/g, (m, kw, head) => `${kw}${head}{ if (__lp(${++n})) break; `)
    .replace(/\bdo(\s*)\{/g, (m, sp) => `do${sp}{ if (__lp(${++n})) break; `);
}

/** Turns a JavaScript error into plain words. */
export function friendly({ name, message } = {}) {
  const m = String(message || '');
  let x;
  if ((x = m.match(/^(\S+) is not defined/))) return `JavaScript doesn't know anything called "${x[1]}". Check the spelling (capitals count), or make sure it's defined before it's used.`;
  if ((x = m.match(/^(.+) is not a function/))) return `"${x[1]}" isn't a function, so it can't be called with (). Check the name, or whether it's spelled differently where you defined it.`;
  if ((x = m.match(/Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '(.+)'\))?/))) return `You asked for ".${x[2] || '…'}" on something that is ${x[1]} (empty). Usually the thing before the dot doesn't exist yet, or a function didn't return anything.`;
  if (/Unexpected end of input/.test(m)) return 'The code ends too early: something was opened and never closed. Count your { } and ( ).';
  if ((x = m.match(/Unexpected token '?([^']*)'?/))) return `JavaScript got confused at "${x[1]}". Often a missing or extra bracket, comma or quote just before it.`;
  if (/missing \) after argument list/.test(m)) return 'A ( was opened and not closed. Check the brackets on that line.';
  if (/Invalid or unexpected token/.test(m)) return 'There is a character JavaScript can\'t read. Often a quote that was opened and not closed, or a curly quote (“ ”) instead of a straight one (" ").';
  if ((x = m.match(/Identifier '(.+)' has already been declared/))) return `"${x[1]}" is declared twice. Give one of them another name, or remove the second const/let.`;
  if (/Assignment to constant variable/.test(m)) return 'You tried to change a const. Use let if the value needs to change.';
  if (/await is only valid in async/.test(m)) return 'await can only be used inside an async function. Add "async" before "function".';
  if (/Maximum call stack/.test(m)) return 'A function keeps calling itself forever.';
  if ((x = m.match(/Cannot access '(.+)' before initialization/))) return `"${x[1]}" is used before the line that makes it has finished. Make sure that line is complete and comes first.`;
  if (name === 'LoopError') return m;
  return `${name || 'Error'}: ${m}`;
}

let seq = 0;

/**
 * Run code. Returns a promise of { results, errors, timedOut }.
 *   js, html, css: the page to build
 *   tests: code that calls check(name, fn)
 *   mount: element to show the page in (otherwise it's hidden)
 *   onLog(entry): called for each console line as it arrives
 */
export function run({ js = '', html = '', css = '', tests = '', setup = '', mount = null, onLog = () => {}, timeout = 4000, height = 170 }) {
  const token = 'r' + (++seq) + Math.random().toString(36).slice(2);
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${BASE_CSS}${css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${html}
<script>${PRELUDE(token)}
${setup}</script>
<script>
`;
  const userLine = head.split('\n').length;       // the line your code starts on
  const safe = s => s.replace(/<\/script/gi, '<\\/script');
  const doc = head + safe(guardLoops(js)) + `\n</script>\n<script>${safe(tests)}\n${AFTER}</script></body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('title', 'Your code running');
  frame.className = 'l-frame';
  if (mount) { frame.style.height = height + 'px'; mount.replaceChildren(frame); }
  else { frame.hidden = true; document.body.appendChild(frame); }

  return new Promise(resolve => {
    const errors = [];
    let timer;
    const finish = out => {
      clearTimeout(timer);
      removeEventListener('message', onMsg);
      if (!mount) setTimeout(() => frame.remove(), 50);
      resolve({ errors, ...out });
    };
    const onMsg = e => {
      const d = e.data;
      if (!d || d.__learn !== token || e.source !== frame.contentWindow) return;
      if (d.type === 'log') onLog(d.data);
      if (d.type === 'error') {
        const line = d.data.line ? d.data.line - userLine + 1 : 0;
        const entry = { ...d.data, line: line > 0 && line <= js.split('\n').length ? line : 0, text: friendly(d.data) };
        errors.push(entry);
        onLog({ kind: 'error', text: (entry.line ? `Line ${entry.line}: ` : '') + entry.text });
      }
      if (d.type === 'done') finish({ results: d.data.results });
    };
    addEventListener('message', onMsg);
    timer = setTimeout(() => {
      if (!mount) frame.remove();
      finish({ results: null, timedOut: true });
    }, timeout);
    frame.srcdoc = doc;
  });
}
