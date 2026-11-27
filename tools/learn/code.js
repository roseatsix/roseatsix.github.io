/* Code display (with colours) and a small code editor. */

import { esc } from '../../assets/js/ui/dom.js';

const JS_WORDS = new Set(['function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'of', 'in', 'while', 'async', 'await', 'new', 'true', 'false', 'null', 'undefined', 'import', 'export', 'from', 'class', 'this', 'typeof', 'try', 'catch', 'throw', 'default']);

/** Wraps parts of JavaScript in <span>s so they can be coloured. */
function highlightJs(src) {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const [t, com, str, num, call, word] = m;
    if (com) out += `<span class="c-com">${esc(t)}</span>`;
    else if (str) out += `<span class="c-str">${esc(t)}</span>`;
    else if (num) out += `<span class="c-num">${esc(t)}</span>`;
    else if (call) out += JS_WORDS.has(call) ? `<span class="c-key">${esc(t)}</span>` : `<span class="c-fn">${esc(t)}</span>`;
    else if (word) out += JS_WORDS.has(word) ? `<span class="c-key">${esc(t)}</span>` : esc(t);
    last = m.index + t.length;
  }
  return out + esc(src.slice(last));
}

function highlightHtml(src) {
  return esc(src)
    .replace(/(&lt;\/?)([a-z0-9-]+)/gi, '$1<span class="c-key">$2</span>')
    .replace(/([a-z-]+)=(&quot;[^&]*&quot;)/gi, '<span class="c-fn">$1</span>=<span class="c-str">$2</span>');
}

function highlightCss(src) {
  return esc(src)
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="c-com">$1</span>')
    .replace(/^([^{}\n]+)(\{)/gm, '<span class="c-key">$1</span>$2')
    .replace(/([a-z-]+)(\s*:)(?!\/)/g, '<span class="c-fn">$1</span>$2');
}

export function highlight(src, lang = 'js') {
  if (lang === 'html') return highlightHtml(src);
  if (lang === 'css') return highlightCss(src);
  return highlightJs(src);
}

/** Read-only code block with line numbers. `mark` = line numbers to highlight. */
export function codeBlock(src, { lang = 'js', mark = [], label = '' } = {}) {
  const lines = highlight(src.replace(/\n$/, ''), lang).split('\n');
  return `
    <figure class="l-codeblock">
      ${label ? `<figcaption>${esc(label)}</figcaption>` : ''}
      <pre><code>${lines.map((l, i) => `<span class="l-line${mark.includes(i + 1) ? ' is-mark' : ''}" data-n="${i + 1}">${l || ' '}</span>`).join('')}</code></pre>
    </figure>`;
}

/** A plain textarea made friendlier for code: line numbers, Tab indents,
    Enter keeps the indent, and it grows with its content. */
export function makeEditor(textarea, onChange = () => {}) {
  const wrap = document.createElement('div');
  wrap.className = 'l-editor';
  const gutter = document.createElement('div');
  gutter.className = 'l-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  textarea.replaceWith(wrap);
  wrap.append(gutter, textarea);
  Object.assign(textarea, { spellcheck: false, wrap: 'off' });
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');

  const sync = () => {
    const n = textarea.value.split('\n').length;
    if (gutter.childElementCount !== n) gutter.innerHTML = Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('');
    textarea.rows = Math.max(3, n);
  };
  const insert = text => {
    // execCommand keeps undo working; fall back to setRangeText.
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
      textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
    }
  };
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); insert('  '); }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
      const before = textarea.value.slice(0, textarea.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      let indent = line.match(/^\s*/)[0];
      if (/[{([]\s*$/.test(line)) indent += '  ';
      e.preventDefault();
      insert('\n' + indent);
    }
  });
  textarea.addEventListener('input', () => { sync(); onChange(textarea.value); });
  sync();
  return { set(v) { textarea.value = v; sync(); }, get: () => textarea.value, el: textarea, wrap };
}
