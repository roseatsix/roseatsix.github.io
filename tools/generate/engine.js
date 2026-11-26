/* ==========================================================
   Generate from DOCX: the engine (no UI, testable in Node).

   Placeholders in the template:  {{name}}  or  {{name:fmt:fmt}}
   Formats, applied left to right:
     text    upper  lower  title  sentence
     number  angka  rp  rp0  persen  terbilang  terbilang_rp  abs  tanda(+|−|0)
     date    (default "18 Maret 2026")  panjang  hari  bulan  tahun  angka  terbilang
   Word MERGEFIELDs are converted to placeholders first.
   ========================================================== */

/* ---------- small helpers ---------- */

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const keyOf = name => String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
export const labelOf = key => { const s = key.replace(/_/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- numbers ---------- */

/** Accepts 1.295.957.358,50 / 1295957358.5 / 1,295,957,358.50 / -12 */
export function parseNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v ?? '').trim().replace(/\s|Rp|IDR/gi, '');
  if (!s) return null;
  const neg = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC >= 0 && lastD >= 0) {
    s = lastC > lastD ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastC >= 0) {
    s = (s.match(/,/g).length === 1 && s.length - lastC - 1 !== 3) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastD >= 0) {
    if (s.match(/\./g).length > 1 || s.length - lastD - 1 === 3) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return isFinite(n) ? (neg ? -n : n) : null;
}

export function fmtAngka(n, decimals = null) {
  const opts = decimals == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return new Intl.NumberFormat('id-ID', opts).format(n);
}
export const fmtRp = (n, decimals = 2) => (n < 0 ? '-' : '') + 'Rp' + fmtAngka(Math.abs(n), decimals);

const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
function words999(n) {
  if (n < 12) return SATUAN[n];
  if (n < 20) return SATUAN[n - 10] + ' Belas';
  if (n < 100) return (SATUAN[Math.floor(n / 10)] + ' Puluh ' + SATUAN[n % 10]).trim();
  if (n < 200) return ('Seratus ' + words999(n - 100)).trim();
  return (SATUAN[Math.floor(n / 100)] + ' Ratus ' + words999(n % 100)).trim();
}
const SCALES = [[1e12, 'Triliun'], [1e9, 'Miliar'], [1e6, 'Juta'], [1e3, 'Ribu']];
function wordsInt(n) {
  if (n === 0) return 'Nol';
  let out = [];
  for (const [v, w] of SCALES) {
    if (n >= v) {
      const q = Math.floor(n / v);
      out.push(v === 1e3 && q === 1 ? 'Seribu' : wordsInt(q) + ' ' + w);
      n %= v;
    }
  }
  if (n) out.push(words999(n));
  return out.join(' ');
}
/** 1250000.5 → "Satu Juta Dua Ratus Lima Puluh Ribu Koma Lima" */
export function terbilang(n) {
  if (n == null || !isFinite(n)) return '';
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  let s = wordsInt(Number(i));
  const dec = d.replace(/0+$/, '');
  if (dec) s += ' Koma ' + dec.split('').map(c => (c === '0' ? 'Nol' : SATUAN[+c])).join(' ');
  return (neg ? 'Minus ' : '') + s;
}

/* ---------- dates ---------- */

export function parseDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}
export const fmtTanggal = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const terbilangTanggal = d =>
  `${DAYS[d.getDay()]}, tanggal ${terbilang(d.getDate())}, bulan ${MONTHS[d.getMonth()]}, tahun ${terbilang(d.getFullYear())}`;

/* ---------- formats ---------- */

export const FORMAT_HELP = {
  text: [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['sentence', 'Sentence case']],
  number: [['angka', '1.295.957.358'], ['rp', 'Rp1.295.957.358,00'], ['rp0', 'Rp1.295.957.358'], ['persen', '12,5%'],
    ['terbilang', 'Satu Juta …'], ['terbilang_rp', 'Satu Juta … Rupiah'], ['abs', 'without minus sign'], ['tanda(naik|turun|tetap)', 'a word by sign']],
  date: [['', '18 Maret 2026'], ['panjang', 'Rabu, 18 Maret 2026'], ['angka', '18/03/2026'], ['hari', 'Rabu'], ['bulan', 'Maret'], ['tahun', '2026'], ['terbilang', 'Rabu, tanggal Delapan Belas, …']],
};

export function parseFormats(str) {
  const out = [];
  const re = /:\s*([a-z_0-9]+)\s*(?:\(([^)]*)\))?/gi;
  let m;
  while ((m = re.exec(str || ''))) out.push({ name: m[1].toLowerCase(), arg: m[2] });
  return out;
}

const NUMERIC = new Set(['angka', 'rp', 'rp0', 'persen', 'terbilang', 'terbilang_rp', 'abs', 'tanda']);
const DATEISH = new Set(['panjang', 'hari', 'tahun']);

/** Guess a field kind from its name and the formats used in the template. */
export function guessKind(key, formats) {
  const names = new Set(formats.map(f => f.name));
  if (/^bulan$|_bulan$|^bulan_/.test(key) && !names.has('rp')) return 'month';
  if (/^tahun$|_tahun$|^tahun_/.test(key)) return 'year';
  if (/tanggal|tgl|date/.test(key) || [...names].some(n => DATEISH.has(n))) return 'date';
  if ([...names].some(n => NUMERIC.has(n))) return 'number';
  if (/alamat|uraian|keterangan|catatan|deskripsi|isi/.test(key)) return 'longtext';
  return 'text';
}

const titleCase = s => s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

const CASES = { upper: t => t.toUpperCase(), lower: t => t.toLowerCase(), title: titleCase, sentence: t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() };

/** Turn a raw value into the text that goes in the document. */
export function formatValue(raw, kind, formats) {
  if (raw == null || raw === '') return '';
  const wantsNumber = formats.some(f => NUMERIC.has(f.name)) && kind !== 'date';
  let num = ['number', 'formula', 'year'].includes(kind) || wantsNumber ? parseNumber(raw) : null;
  const date = kind === 'date' ? parseDate(raw) : null;
  const base = () => num != null ? (kind === 'year' ? String(num) : fmtAngka(num)) : date ? fmtTanggal(date) : String(raw);
  let text = null;
  for (const { name, arg } of formats) {
    if (CASES[name]) { text = CASES[name](text ?? base()); continue; }
    if (text != null) continue;                        // value already chosen
    if (num != null) {
      if (name === 'abs') num = Math.abs(num);
      else if (name === 'angka') text = fmtAngka(num);
      else if (name === 'rp') text = fmtRp(num, 2);
      else if (name === 'rp0') text = fmtRp(Math.round(num), 0);
      else if (name === 'persen') text = fmtAngka(num, 2) + '%';
      else if (name === 'terbilang') text = terbilang(num);
      else if (name === 'terbilang_rp') text = terbilang(Math.round(num * 100) / 100) + ' Rupiah';
      else if (name === 'tanda') {
        const [pos = '', neg = '', zero = ''] = String(arg || '').split('|').map(x => x.trim());
        text = num > 0 ? pos : num < 0 ? neg : zero;
      }
    } else if (date) {
      if (name === 'panjang') text = `${DAYS[date.getDay()]}, ${fmtTanggal(date)}`;
      else if (name === 'angka') text = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      else if (name === 'hari') text = DAYS[date.getDay()];
      else if (name === 'bulan') text = MONTHS[date.getMonth()];
      else if (name === 'tahun') text = String(date.getFullYear());
      else if (name === 'terbilang') text = terbilangTanggal(date);
    }
  }
  return text ?? base();
}

/* ---------- formulas ---------- */
/* tokens: {k:'f', v:key} field · {k:'p', v:key} previous entry's field ·
           {k:'n', v:'12.5'} number · {k:'op', v:'+ - * or /'} · {k:'(' } · {k:')'} · {k:'abs'} */

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };

export function evalFormula(tokens, get, depth = 0) {
  if (!Array.isArray(tokens) || !tokens.length) return null;
  if (depth > 20) throw new Error('A formula refers to itself');
  const out = [], ops = [];
  const apply = () => {
    const op = ops.pop();
    if (op === 'abs') { if (!out.length) throw new Error('Incomplete formula'); out.push(Math.abs(out.pop())); return; }
    const b = out.pop(), a = out.pop();
    if (a === undefined || b === undefined) throw new Error('Incomplete formula');
    out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : (b === 0 ? NaN : a / b));
  };
  let expectValue = true;
  for (const t of tokens) {
    if (t.k === 'n' || t.k === 'f' || t.k === 'p') {
      if (!expectValue) throw new Error('Two values in a row; add an operator');
      const v = t.k === 'n' ? parseNumber(t.v) : get(t.v, t.k === 'p', depth + 1);
      if (v == null || !isFinite(v)) return null;          // a value is missing
      out.push(v); expectValue = false;
    } else if (t.k === 'op') {
      if (expectValue) {
        if (t.v === '-') { out.push(0); }                     // unary minus
        else throw new Error('An operator needs a value before it');
      }
      while (ops.length && ops[ops.length - 1] !== '(' && (ops[ops.length - 1] === 'abs' || PREC[ops[ops.length - 1]] >= PREC[t.v])) apply();
      ops.push(t.v); expectValue = true;
    } else if (t.k === '(' || t.k === 'abs') {
      if (!expectValue) throw new Error('Add an operator before the bracket');
      if (t.k === 'abs') ops.push('abs');
      ops.push('(');
    } else if (t.k === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') apply();
      if (!ops.length) throw new Error('Unmatched )');
      ops.pop();
      if (ops[ops.length - 1] === 'abs') apply();
      expectValue = false;
    }
  }
  if (expectValue) throw new Error('The formula ends with an operator');
  while (ops.length) { if (ops[ops.length - 1] === '(') throw new Error('Missing )'); apply(); }
  const r = out.pop();
  return isFinite(r) ? r : null;
}

export function formulaText(tokens, labels = {}) {
  return (tokens || []).map(t => t.k === 'f' ? (labels[t.v] || t.v) : t.k === 'p' ? `previous ${labels[t.v] || t.v}`
    : t.k === 'n' ? t.v : t.k === 'op' ? ({ '*': '×', '/': '÷', '-': '−' }[t.v] || t.v) : t.k === 'abs' ? 'abs(' : t.k).join(' ');
}

/* ---------- Word XML ---------- */

/** Parts of a .docx that can hold placeholders. */
export const isTextPart = path => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(path);

const PH = /\{\{\s*([^{}:]+?)\s*((?::[^{}]*?)*)\s*\}\}/g;

function runStart(xml, pos) {
  const a = xml.lastIndexOf('<w:r>', pos), b = xml.lastIndexOf('<w:r ', pos);
  return Math.max(a, b);
}
const runRpr = run => (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
const SWITCH_FMT = { upper: 'upper', lower: 'lower', caps: 'title', firstcap: 'sentence' };

function mergeInstr(instr) {
  const m = instr.match(/^\s*MERGEFIELD\s+"?([^"\s\\]+)"?([\s\S]*)$/i);
  if (!m) return null;
  const sw = (m[2].match(/\\\*\s*(Upper|Lower|Caps|FirstCap)/i) || [])[1];
  return `{{${m[1]}${sw ? ':' + SWITCH_FMT[sw.toLowerCase()] : ''}}}`;
}

/** Word MERGEFIELDs (simple and complex) become plain {{placeholders}}. */
export function convertMergeFields(xml) {
  xml = xml.replace(/<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/w:fldSimple>)/g, (all, instr, inner) => {
    const ph = mergeInstr(unesc(instr));
    return ph ? `<w:r>${runRpr(inner || '')}<w:t xml:space="preserve">${esc(ph)}</w:t></w:r>` : all;
  });
  let out = '', pos = 0;
  const BEGIN = /<w:fldChar\b[^>]*w:fldCharType="begin"[^>]*\/>/g;
  let m;
  while ((m = BEGIN.exec(xml))) {
    const start = runStart(xml, m.index);
    if (start < pos) continue;
    // find the matching end, allowing nested fields
    const re = /<w:fldChar\b[^>]*w:fldCharType="(begin|separate|end)"[^>]*\/>/g;
    re.lastIndex = m.index;
    let depth = 0, sep = -1, endAt = -1, f;
    while ((f = re.exec(xml))) {
      if (f[1] === 'begin') depth++;
      else if (f[1] === 'separate' && depth === 1 && sep < 0) sep = f.index;
      else if (f[1] === 'end' && --depth === 0) { endAt = f.index; break; }
    }
    if (endAt < 0) break;
    const endRun = xml.indexOf('</w:r>', endAt) + 6;
    const chunk = xml.slice(start, endRun);
    const instr = [...chunk.slice(0, sep >= 0 ? sep - start : chunk.length).matchAll(/<w:instrText\b[^>]*>([^<]*)<\/w:instrText>/g)].map(x => unesc(x[1])).join('');
    const ph = mergeInstr(instr);
    if (!ph) { BEGIN.lastIndex = m.index + 1; continue; }
    const display = sep >= 0 ? xml.slice(sep, endAt) : '';
    const rPr = runRpr(display.slice(display.indexOf('</w:r>') + 6)) || runRpr(chunk);
    out += xml.slice(pos, start) + `<w:r>${rPr}<w:t xml:space="preserve">${esc(ph)}</w:t></w:r>`;
    pos = endRun;
    BEGIN.lastIndex = endRun;
  }
  return out + xml.slice(pos);
}

/**
 * Walk text runs paragraph by paragraph so placeholders split across
 * runs (Word does this for spell-check, formatting, autocorrect…) are found.
 * onMatch(name, formatsString) returns replacement text, or null to keep it.
 */
export function replaceInXml(xml, onMatch, scanOnly = false) {
  const TOK = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t\s*\/>|<\/w:p>|<w:tab\s*\/>|<w:br\b[^>]*\/>|<w:cr\s*\/>/g;
  const nodes = [];       // {start, end, text} for each <w:t> with content
  const groups = [[]];
  let m;
  while ((m = TOK.exec(xml))) {
    if (m[1] !== undefined) {
      const node = { start: m.index, end: m.index + m[0].length, text: unesc(m[1]), orig: m[1] };
      nodes.push(node);
      groups[groups.length - 1].push(node);
    } else if (!m[0].startsWith('<w:t')) groups.push([]);
  }
  let changed = false;
  for (const g of groups) {
    if (!g.length) continue;
    const full = g.map(n => n.text).join('');
    if (!full.includes('{{')) continue;
    const starts = []; let acc = 0;
    for (const n of g) { starts.push(acc); acc += n.text.length; }
    const where = pos => { let i = starts.length - 1; while (i > 0 && starts[i] > pos) i--; return i; };
    const matches = [...full.matchAll(PH)];
    if (scanOnly) { for (const mm of matches) onMatch(mm[1], mm[2] || ''); continue; }
    for (let k = matches.length - 1; k >= 0; k--) {
      const mm = matches[k];
      const rep = onMatch(mm[1], mm[2] || '');
      if (rep == null) continue;
      const s = mm.index, e = mm.index + mm[0].length;
      const a = where(s), b = where(e - 1);
      const offA = s - starts[a], offB = e - starts[b];
      if (a === b) g[a].text = g[a].text.slice(0, offA) + '\u0000' + rep + '\u0000' + g[a].text.slice(offB);
      else {
        g[a].text = g[a].text.slice(0, offA) + '\u0000' + rep + '\u0000';
        for (let i = a + 1; i < b; i++) g[i].text = '';
        g[b].text = g[b].text.slice(offB);
      }
      g[a].touched = g[b].touched = true;
      for (let i = a + 1; i < b; i++) g[i].touched = true;
      changed = true;
    }
  }
  if (!changed) return xml;
  let out = '', pos = 0;
  for (const n of nodes) {
    if (!n.touched) continue;
    // inserted values may contain line breaks and tabs
    const body = n.text.split('\u0000').map((part, i) => {
      const e = esc(part);
      return i % 2 ? e.replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">').replace(/\t/g, '</w:t><w:tab/><w:t xml:space="preserve">') : e;
    }).join('');
    out += xml.slice(pos, n.start) + `<w:t xml:space="preserve">${body}</w:t>`;
    pos = n.end;
  }
  return out + xml.slice(pos);
}

/** All placeholders in the template: [{ key, name, formats:[...], order }]. */
export function scanPlaceholders(parts) {
  const found = new Map();
  let order = 0;
  for (const xml of parts) {
    replaceInXml(convertMergeFields(xml), (name, fmts) => {
      const key = keyOf(name);
      if (!found.has(key)) found.set(key, { key, name: name.trim(), formats: [], order: order++, uses: 0 });
      const f = found.get(key);
      f.uses++;
      for (const x of parseFormats(fmts)) if (!f.formats.some(y => y.name === x.name)) f.formats.push(x);
    }, true);
  }
  return [...found.values()];
}

/** Fill a template part. resolve(key, formatsArray) → text. */
export function fillPart(xml, resolve) {
  return replaceInXml(convertMergeFields(xml), (name, fmts) => resolve(keyOf(name), parseFormats(fmts)));
}
