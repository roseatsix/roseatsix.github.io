/* ==========================================================
   Generate from DOCX.

   Store "docgen" (encrypted, synced):
     tpl:<id>      { name, fileName, size, chunks, fileNamePattern,
                     fields: { <key>: { label, kind, order, inDoc, formats,
                                        options, formula, maxlen, required } },
                     createdAt, updatedAt }
     bin:<id>:<n>  { data }          the .docx, base64, in chunks
     entry:<id>:<ts> { tpl, ts, values, computed, fileName }
   ========================================================== */

import { mountHeader } from '../../assets/js/ui/header.js';
import * as S from '../../assets/js/core/session.js';
import { openStore } from '../../assets/js/core/store.js';
import { openDialog, esc, toast, busy } from '../../assets/js/ui/dom.js';
import { openBackupDialog } from '../../assets/js/ui/backup.js';
import * as L from '../documents/lib.js';
import * as E from './engine.js';

const main = document.getElementById('gen');
const store = openStore('docgen');
const ui = { loaded: false, tpl: null, view: 'form', drafts: {}, filter: '' };
let items = new Map();

const KINDS = { text: 'Text', longtext: 'Long text', number: 'Number', date: 'Date', month: 'Month', year: 'Year', choice: 'Choice', formula: 'Formula' };
const CHUNK = 450000;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5"/><path d="M8.5 13h6M8.5 16.5h4"/><path d="M18 2.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  dl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/></svg>',
  load: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h3.5L18.5 9a2.1 2.1 0 0 0-3-3L5.5 16z"/></svg>',
  back1: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H8"/><path d="m12 7-5 5 5 5"/></svg>',
};

/* ---------- data helpers ---------- */

const tplKey = id => 'tpl:' + id;
const getTpl = id => { const t = items.get(tplKey(id)); return t ? { id, ...t } : null; };
const templates = () => [...items].filter(([k]) => k.startsWith('tpl:')).map(([k, v]) => ({ id: k.slice(4), ...v }))
  .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
const entriesOf = id => [...items].filter(([k]) => k.startsWith(`entry:${id}:`)).map(([k, v]) => ({ key: k, ...v }))
  .sort((a, b) => b.ts - a.ts);
const fieldList = t => Object.entries(t.fields || {}).map(([key, f]) => ({ key, ...f })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const clone = v => JSON.parse(JSON.stringify(v));
const save = (key, data) => store.put(key, data).catch(err => { toast("Couldn't save. " + (err.message || '')); throw err; });

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function templateBytes(t) {
  let b64 = '';
  for (let n = 0; n < t.chunks; n++) {
    const c = items.get(`bin:${t.id}:${n}`);
    if (!c) throw new Error("This template's file hasn't finished syncing to this device yet. Try again in a moment.");
    b64 += c.data;
  }
  return fromB64(b64);
}

const fmtTs = ts => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ---------- reading a template ---------- */

async function readTemplate(file) {
  if (!/\.docx$/i.test(file.name)) throw new Error('Choose a Word file (.docx). For an old .doc, open it in Word and save as .docx.');
  const bytes = await L.readBytes(file);
  const JSZip = await L.jszip();
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch (e) { throw new Error("Couldn't open this file as a Word document."); }
  if (!zip.file('word/document.xml')) throw new Error("This doesn't look like a Word document.");
  const parts = [];
  for (const path of Object.keys(zip.files)) if (E.isTextPart(path)) parts.push(await zip.file(path).async('string'));
  const found = E.scanPlaceholders(parts);
  return { bytes, found };
}

function mergeFields(old, found) {
  const fields = clone(old || {});
  for (const f of Object.values(fields)) f.inDoc = false;
  found.forEach((p, i) => {
    const cur = fields[p.key];
    if (cur) { cur.inDoc = true; cur.formats = p.formats; }
    else fields[p.key] = { label: E.labelOf(p.name), kind: E.guessKind(p.key, p.formats), order: 1000 + i, inDoc: true, formats: p.formats };
  });
  // keep the document's order for fields it contains
  const docOrder = new Map(found.map((p, i) => [p.key, i]));
  const others = Object.entries(fields).filter(([k]) => !docOrder.has(k)).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  for (const [k, f] of Object.entries(fields)) if (docOrder.has(k)) f.order = docOrder.get(k) * 10;
  others.forEach(([, f], i) => { f.order = (found.length + i) * 10 + 5; });
  // formula fields not in the document stay (they can feed others); others are dropped if unused
  for (const [k, f] of Object.entries(fields)) if (!f.inDoc && f.kind !== 'formula') delete fields[k];
  return fields;
}

async function saveTemplate(id, base, file, bytes, found) {
  const b64 = toB64(bytes);
  const chunks = Math.ceil(b64.length / CHUNK);
  for (let n = 0; n < chunks; n++) await store.put(`bin:${id}:${n}`, { data: b64.slice(n * CHUNK, (n + 1) * CHUNK) });
  for (let n = chunks; n < (base ? base.chunks : 0); n++) await store.remove(`bin:${id}:${n}`).catch(() => {});
  const t = {
    name: base ? base.name : file.name.replace(/\.docx$/i, ''),
    fileName: file.name, size: bytes.length, chunks,
    fileNamePattern: base ? base.fileNamePattern : '',
    fields: mergeFields(base && base.fields, found),
    createdAt: base ? base.createdAt : Date.now(), updatedAt: Date.now(),
  };
  await save(tplKey(id), t);
  return t;
}

/* ---------- values, formulas and generating ---------- */

/** Numeric value getter for formulas, relative to an entry time. */
function makeGetter(t, values, beforeTs) {
  const fields = t.fields;
  let prevEntry;
  const prev = () => {
    if (prevEntry === undefined) prevEntry = entriesOf(t.id).find(e => e.ts < beforeTs) || null;
    return prevEntry;
  };
  const cache = {};
  const get = (key, isPrev, depth = 0) => {
    const f = fields[key];
    if (!f) return null;
    if (isPrev) {
      const pe = prev();
      if (!pe) return null;
      return E.parseNumber(f.kind === 'formula' ? pe.computed?.[key] : pe.values?.[key]);
    }
    if (f.kind === 'formula') {
      if (key in cache) return cache[key];
      return (cache[key] = E.evalFormula(f.formula || [], (k, p, d) => get(k, p, d), depth));
    }
    return E.parseNumber(values[key]);
  };
  return { get, prev };
}

function computeAll(t, values, beforeTs) {
  const { get } = makeGetter(t, values, beforeTs);
  const out = {}, errors = {};
  for (const f of fieldList(t)) {
    if (f.kind !== 'formula') continue;
    try { const v = get(f.key, false); out[f.key] = v == null ? '' : v; }
    catch (e) { out[f.key] = ''; errors[f.key] = e.message; }
  }
  return { computed: out, errors };
}

function resolveText(t, values, computed) {
  return (key, formats) => {
    const f = t.fields[key];
    if (!f) return null;                                  // leave unknown placeholders visible
    const raw = f.kind === 'formula' ? computed[key] : values[key];
    return E.formatValue(raw, f.kind, formats);
  };
}

function fileNameFor(t, values, computed, ts) {
  let name = (t.fileNamePattern || '').trim();
  if (name) {
    const r = resolveText(t, values, computed);
    name = name.replace(/\{\{\s*([^{}:]+?)\s*((?::[^{}]*?)*)\s*\}\}/g, (m, k, fm) => r(E.keyOf(k), E.parseFormats(fm)) ?? '');
  }
  if (!name.trim()) {
    const d = new Date(ts);
    name = `${t.name} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) + '.docx';
}

async function buildDocx(t, values, computed) {
  const JSZip = await L.jszip();
  const zip = await JSZip.loadAsync(templateBytes(t));
  const resolve = resolveText(t, values, computed);
  for (const path of Object.keys(zip.files)) {
    if (!E.isTextPart(path)) continue;
    const xml = await zip.file(path).async('string');
    zip.file(path, E.fillPart(xml, resolve));
  }
  return zip.generateAsync({ type: 'blob', mimeType: DOCX, compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/* ---------- views ---------- */

function gate(st) {
  const copy = {
    signedOut: ['Your templates are private', 'Sign in with Google to start. Templates and history are encrypted on your device before they sync.', 'Sign in'],
    unconfigured: ["Sync isn't set up", 'Sign-in needs to be connected first.', null],
    needsSetup: ['Set up your vault', 'Choose a passphrase to encrypt your data.', 'Set up vault'],
    locked: ['Unlock your templates', 'Enter your passphrase to open them on this device.', 'Unlock'],
    denied: ["Can't open your data", 'The database refused access for this account.', null],
    error: ['Something went wrong', st.error || '', 'Try again'],
  }[st.status];
  if (!copy) return '<div class="gate"><span class="spinner" aria-hidden="true"></span><p>Opening…</p></div>';
  return `<div class="gate"><svg class="gate-blossom" aria-hidden="true"><use href="#blossom"/></svg><h1>${esc(copy[0])}</h1><p>${esc(copy[1])}</p>
    ${copy[2] ? `<button class="btn btn-primary" type="button" data-act="gate">${esc(copy[2])}</button>` : ''}</div>`;
}

function guideHtml() {
  const row = (fmt, out) => `<tr><td><code>{{nama${fmt ? ':' + esc(fmt) : ''}}}</code></td><td>${esc(out)}</td></tr>`;
  return `
    <details class="panel g-guide">
      <summary class="panel-head"><h2>How to write placeholders</h2><span class="count">guide</span></summary>
      <p>In Word or Pages, type the field name between double braces where a value should go: <code>{{nama}}</code>. Add formats after a colon. Use the same field in several places with different formats, e.g. <code>{{jumlah:rp}}</code> and <code>{{jumlah:terbilang_rp}}</code>.</p>
      <h3>Text</h3><table class="g-table">${E.FORMAT_HELP.text.map(([f, o]) => row(f, o)).join('')}</table>
      <h3>Numbers and formulas</h3><table class="g-table">${E.FORMAT_HELP.number.map(([f, o]) => row(f, o)).join('')}</table>
      <h3>Dates</h3><table class="g-table">${E.FORMAT_HELP.date.map(([f, o]) => row(f, o)).join('')}</table>
      <p class="hint">Formats combine left to right: <code>{{jumlah:terbilang:upper}}</code>. Merge fields made in Word desktop (Insert › Field › MergeField) also work.</p>
    </details>`;
}

function listView() {
  const list = templates();
  return `
    <section class="view">
      ${list.length ? `<ul class="g-tpls">${list.map(t => {
        const n = entriesOf(t.id).length;
        const fields = fieldList(t);
        return `<li><a class="panel g-tpl" href="#/t/${t.id}">
          <span class="g-tpl-icon">${ICON.doc}</span>
          <span class="g-tpl-main"><span class="g-tpl-name">${esc(t.name)}</span>
            <span class="meta"><span>${fields.length} field${fields.length === 1 ? '' : 's'}</span><span>${n} generated</span><span>${L.fmtSize(t.size || 0)}</span></span></span>
        </a></li>`;
      }).join('')}</ul>` : `
        <div class="panel empty-panel">
          <h2>No templates yet</h2>
          <p>Upload a Word document (.docx) with placeholders like <code>{{nama}}</code> or <code>{{jumlah:rp}}</code>. You'll get a form to fill in, and a finished document each time.</p>
        </div>`}
      <label class="dropzone g-upload">
        <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-upload hidden>
        <span class="dropzone-icon">${ICON.plus}</span>
        <span class="dropzone-text"><strong>Add a template</strong><small>Choose a .docx file</small></span>
      </label>
      ${guideHtml()}
    </section>`;
}

function inputFor(t, f, value, idPrefix = 'v') {
  const id = `${idPrefix}-${f.key}`;
  const v = value ?? '';
  const max = f.maxlen ? ` maxlength="${f.maxlen}"` : '';
  const attrs = `id="${id}" data-key="${f.key}" ${f.required ? 'required' : ''}`;
  switch (f.kind) {
    case 'longtext': return `<textarea class="input" rows="3" ${attrs}${max}>${esc(v)}</textarea>`;
    case 'number': return `<input class="input g-num" inputmode="decimal" ${attrs} value="${esc(v)}" autocomplete="off">`;
    case 'date': return `<input class="input" type="date" ${attrs} value="${esc(v)}">`;
    case 'month': return `<select class="input" ${attrs}><option value="">Choose…</option>${E.MONTHS.map(m => `<option ${m === v ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
    case 'year': return `<input class="input" type="number" inputmode="numeric" min="1900" max="2999" ${attrs} value="${esc(v)}">`;
    case 'choice': return `<select class="input" ${attrs}><option value="">Choose…</option>${(f.options || []).map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    case 'formula': return `<output class="input g-formula" ${attrs}></output>`;
    default: return `<input class="input" ${attrs}${max} value="${esc(v)}" autocomplete="off">`;
  }
}

function fieldBlock(t, f, value, prefix) {
  const wide = ['longtext', 'number', 'formula'].includes(f.kind) || (f.kind === 'text' && (f.maxlen || 0) > 40);
  return `
    <label class="field g-field ${wide ? 'is-wide' : ''}" data-field-wrap="${f.key}">
      <span class="field-label">${esc(f.label || f.key)}${f.required ? ' <b class="g-req">*</b>' : ''}</span>
      ${inputFor(t, f, value, prefix)}
      <span class="hint" data-hint="${f.key}">${f.kind === 'formula' ? esc(E.formulaText(f.formula, labelsOf(t))) : ''}</span>
    </label>`;
}

const labelsOf = t => Object.fromEntries(fieldList(t).map(f => [f.key, f.label || f.key]));

function formView(t) {
  const draft = ui.drafts[t.id] || (ui.drafts[t.id] = defaultValues(t));
  const entries = entriesOf(t.id);
  const fields = fieldList(t).filter(f => f.inDoc || f.kind === 'formula');
  return `
    <section class="view g-detail">
      <div class="g-top">
        <a class="icon-btn" href="#/" aria-label="All templates">${ICON.back}</a>
        <div class="g-title"><span class="g-h1">${esc(t.name)}</span>
          <span class="meta"><span>${fields.length} fields</span><span>${entries.length} generated</span></span></div>
        <a class="btn btn-ghost btn-sm" href="#/t/${t.id}/fields">Fields &amp; template</a>
      </div>

      <form class="panel g-form" data-form="gen" novalidate>
        <div class="g-fields">${fields.map(f => fieldBlock(t, f, draft[f.key], 'v')).join('')}</div>
        ${!fields.length ? '<p class="empty">This template has no placeholders yet. Add some like {{nama}} in Word and upload it again under "Fields & template".</p>' : ''}
        <div class="form-error" role="alert"></div>
        <div class="g-actions">
          <button class="btn btn-ghost" type="button" data-act="clear">Clear form</button>
          <button class="btn btn-primary" type="submit" ${fields.length ? '' : 'disabled'}>${ICON.dl}Generate .docx</button>
        </div>
        <div data-out></div>
      </form>

      <section class="panel">
        <div class="panel-head"><h2>History</h2><span class="count">${entries.length ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : ''}</span></div>
        ${entries.length ? `
          <ul class="g-history">${entries.map(e => historyRow(t, e)).join('')}</ul>
          <div class="button-row g-hist-actions"><button class="btn btn-ghost btn-sm" type="button" data-act="csv">Export CSV</button></div>`
        : '<p class="empty">Every document you generate is saved here with all its values, so you can download it again, edit it, or load it back into the form.</p>'}
      </section>
    </section>`;
}

function historyRow(t, e) {
  const summary = fieldList(t).filter(f => f.inDoc && f.kind !== 'formula' && e.values && e.values[f.key])
    .slice(0, 3).map(f => E.formatValue(e.values[f.key], f.kind, []));
  return `
    <li class="g-entry">
      <span class="g-entry-main"><span class="g-entry-ts">${esc(fmtTs(e.ts))}</span>
        <span class="meta">${summary.map(s => `<span>${esc(s.length > 40 ? s.slice(0, 40) + '…' : s)}</span>`).join('')}</span></span>
      <span class="g-entry-actions">
        <button class="icon-btn" type="button" data-act="dl" data-key="${e.key}" aria-label="Download again" title="Download again">${ICON.dl}</button>
        <button class="icon-btn" type="button" data-act="load" data-key="${e.key}" aria-label="Load into form" title="Load into form">${ICON.load}</button>
        <button class="icon-btn" type="button" data-act="edit" data-key="${e.key}" aria-label="Edit" title="Edit">${ICON.edit}</button>
        <button class="icon-btn g-del" type="button" data-act="del" data-key="${e.key}" aria-label="Delete" title="Delete">${ICON.x}</button>
      </span>
    </li>`;
}

function defaultValues(t) {
  const v = {};
  const now = new Date();
  for (const f of fieldList(t)) {
    if (f.kind === 'year') v[f.key] = String(now.getFullYear());
    if (f.kind === 'month') v[f.key] = E.MONTHS[now.getMonth()];
  }
  return v;
}

function fieldsView(t) {
  const fields = fieldList(t);
  const fmtChips = f => (f.formats || []).map(x => `<code>:${esc(x.name)}${x.arg ? '(…)' : ''}</code>`).join(' ');
  return `
    <section class="view g-detail">
      <div class="g-top">
        <a class="icon-btn" href="#/t/${t.id}" aria-label="Back to the form">${ICON.back}</a>
        <div class="g-title"><span class="g-h1">Fields &amp; template</span><span class="meta"><span>${esc(t.name)}</span></span></div>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>Template</h2></div>
        <div class="field-grid">
          <label class="field"><span class="field-label">Name</span><input class="input" data-tpl="name" value="${esc(t.name)}" maxlength="80"></label>
          <label class="field"><span class="field-label">File name for documents</span>
            <input class="input" data-tpl="fileNamePattern" value="${esc(t.fileNamePattern || '')}" placeholder="e.g. LPJ {{bulan}} {{tahun}}"></label>
        </div>
        <p class="hint">Leave the file name empty to use the template name and the date. Placeholders work there too.</p>
        <p class="meta g-fileinfo"><span>${esc(t.fileName || '')}</span><span>${L.fmtSize(t.size || 0)}</span><span>updated ${esc(fmtTs(t.updatedAt || t.createdAt))}</span></p>
        <div class="button-row">
          <label class="btn btn-ghost btn-sm">Replace .docx…<input type="file" accept=".docx" data-replace hidden></label>
          <button class="btn btn-ghost btn-sm" type="button" data-act="download-tpl">Download template</button>
          <button class="btn btn-ghost btn-sm danger-text" type="button" data-act="delete-tpl">Delete template…</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Fields</h2><span class="count">${fields.length}</span></div>
        <p class="hint">The kind decides the input on the form. How a value is printed comes from the placeholder's formats in the document.</p>
        <ul class="g-setup">${fields.map((f, i) => `
          <li class="g-setrow ${f.inDoc ? '' : 'is-extra'}" data-key="${f.key}">
            <div class="g-setrow-top">
              <span class="g-key"><code>{{${esc(f.key)}}}</code> ${fmtChips(f)} ${f.inDoc ? '' : '<em>not in the document</em>'}</span>
              <span class="g-order">
                <button class="icon-btn" type="button" data-move="-1" aria-label="Move up" ${i ? '' : 'disabled'}>${ICON.up}</button>
                <button class="icon-btn" type="button" data-move="1" aria-label="Move down" ${i < fields.length - 1 ? '' : 'disabled'}>${ICON.down}</button>
                ${!f.inDoc ? `<button class="icon-btn" type="button" data-remove aria-label="Remove">${ICON.x}</button>` : ''}
              </span>
            </div>
            <div class="g-setrow-grid">
              <label class="field"><span class="field-label">Label</span><input class="input" data-f="label" value="${esc(f.label || '')}" maxlength="60"></label>
              <label class="field"><span class="field-label">Kind</span><select class="input" data-f="kind">${Object.entries(KINDS).map(([k, n]) => `<option value="${k}" ${k === f.kind ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            </div>
            ${f.kind === 'choice' ? `<label class="field"><span class="field-label">Choices (one per line)</span><textarea class="input" rows="3" data-f="options">${esc((f.options || []).join('\n'))}</textarea></label>` : ''}
            ${f.kind === 'formula' ? `<div class="g-formula-row"><span class="g-formula-text">${esc(E.formulaText(f.formula, labelsOf(t))) || '<em>No formula yet</em>'}</span>
              <button class="btn btn-ghost btn-sm" type="button" data-build>${f.formula && f.formula.length ? 'Edit formula' : 'Build formula'}</button></div>` : ''}
            ${['text', 'longtext'].includes(f.kind) ? `<label class="field g-max"><span class="field-label">Max characters</span><input class="input" type="number" min="0" data-f="maxlen" value="${f.maxlen || ''}" placeholder="No limit"></label>` : ''}
            ${f.kind !== 'formula' ? `<label class="check"><input type="checkbox" data-f="required" ${f.required ? 'checked' : ''}><span>Required</span></label>` : ''}
          </li>`).join('')}</ul>
        <button class="btn btn-ghost btn-sm" type="button" data-act="add-formula">${ICON.plus}Add a formula field</button>
        <p class="hint">Formula fields can also be used only inside other formulas, without appearing in the document.</p>
      </section>
      ${guideHtml()}
    </section>`;
}

function render() {
  if (!ui.loaded) { main.innerHTML = gate(S.getState()); return; }
  const t = ui.tpl ? getTpl(ui.tpl) : null;
  if (ui.tpl && !t) { location.hash = '#/'; return; }
  main.innerHTML = !t ? listView() : ui.view === 'fields' ? fieldsView(t) : formView(t);
  if (t && ui.view === 'form') refreshComputed(t);
}

/* ---------- form behaviour ---------- */

function readForm(root, t) {
  const v = {};
  root.querySelectorAll('[data-key]').forEach(el => {
    if (el.tagName === 'OUTPUT' || el.tagName === 'BUTTON') return;
    if (t.fields[el.dataset.key] && t.fields[el.dataset.key].kind !== 'formula') v[el.dataset.key] = el.value.trim();
  });
  return v;
}

function refreshComputed(t, root = main, values = null, beforeTs = Date.now()) {
  const vals = values || ui.drafts[t.id] || {};
  const { computed, errors } = computeAll(t, vals, beforeTs);
  root.querySelectorAll('output[data-key]').forEach(o => {
    const k = o.dataset.key, v = computed[k];
    o.textContent = errors[k] ? '—' : v === '' || v == null ? '—' : E.fmtAngka(v);
    const hint = root.querySelector(`[data-hint="${k}"]`);
    if (hint) {
      const why = (v === '' || v == null) && !errors[k] ? missingReason(t, k, vals, beforeTs) : '';
      hint.textContent = errors[k] || why || E.formulaText(t.fields[k].formula, labelsOf(t));
      hint.classList.toggle('is-err', !!errors[k]);
    }
  });
  root.querySelectorAll('.g-num[data-key]').forEach(inp => {
    const n = E.parseNumber(inp.value);
    const hint = root.querySelector(`[data-hint="${inp.dataset.key}"]`);
    if (hint) { hint.textContent = inp.value && n == null ? 'Not a number' : n != null ? E.fmtRp(n, 2) : ''; hint.classList.toggle('is-err', !!inp.value && n == null); }
    inp.classList.toggle('is-invalid', !!inp.value && n == null);
  });
  return { computed, errors };
}

/** Why a formula has no value yet: missing inputs, or no previous entry. */
function missingReason(t, key, values, beforeTs, seen = new Set()) {
  if (seen.has(key)) return '';
  seen.add(key);
  const f = t.fields[key];
  const missing = new Set();
  let needsPrev = false;
  for (const tok of f.formula || []) {
    if (tok.k === 'p') needsPrev = true;
    if (tok.k !== 'f' || !t.fields[tok.v]) continue;
    const src = t.fields[tok.v];
    if (src.kind === 'formula') { const r = missingReason(t, tok.v, values, beforeTs, seen); if (r.startsWith('No previous')) needsPrev = true; else if (r) missing.add(src.label || tok.v); }
    else if (E.parseNumber(values[tok.v]) == null) missing.add(src.label || tok.v);
  }
  if (missing.size) return `Fill in ${[...missing].join(', ')}`;
  if (needsPrev && !entriesOf(t.id).some(e => e.ts < beforeTs)) return 'No previous entry yet, so this stays empty this time';
  if (!(f.formula || []).length) return 'No formula yet. Set it under Fields & template.';
  return '';
}

function validate(t, values, root) {
  for (const f of fieldList(t)) {
    if (f.kind === 'formula' || !(f.inDoc)) continue;
    const v = values[f.key] || '';
    if (f.required && !v) return `${f.label || f.key} is required.`;
    if (v && f.kind === 'number' && E.parseNumber(v) == null) return `${f.label || f.key} isn't a number.`;
    if (v && f.maxlen && v.length > f.maxlen) return `${f.label || f.key} is longer than ${f.maxlen} characters.`;
  }
  void root;
  return '';
}

async function generate(t, form) {
  const values = readForm(form, t);
  const err = form.querySelector('.form-error');
  err.textContent = validate(t, values, form);
  if (err.textContent) return;
  const ts = Date.now();
  const { computed, errors } = computeAll(t, values, ts);
  const bad = Object.keys(errors)[0];
  if (bad) { err.textContent = `${t.fields[bad].label || bad}: ${errors[bad]}`; return; }
  const out = form.querySelector('[data-out]');
  const blob = await buildDocx(t, values, computed);
  const fileName = fileNameFor(t, values, computed, ts);
  await save(`entry:${t.id}:${ts}`, { tpl: t.id, ts, values, computed, fileName });
  out.innerHTML = '';
  out.appendChild(L.resultCard(blob, fileName, 'saved to history'));
  out.querySelector('a').click();
}

/* ---------- dialogs ---------- */

function openEntryDialog(t, entry) {
  return openDialog({
    label: 'Edit entry',
    render(el, close) {
      el.closest('dialog').classList.add('is-wide');
      const fields = fieldList(t).filter(f => f.inDoc || f.kind === 'formula');
      el.innerHTML = `
        <h2>Edit entry</h2>
        <p>${esc(fmtTs(entry.ts))}. Saving recalculates formulas; download it again to get the updated document.</p>
        <form class="g-form" novalidate>
          <div class="g-fields">${fields.map(f => fieldBlock(t, f, entry.values?.[f.key], 'e')).join('')}</div>
          <div class="form-error" role="alert"></div>
          <div class="dialog-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>
        </form>`;
      const form = el.querySelector('form');
      const refresh = () => refreshComputed(t, form, readForm(form, t), entry.ts);
      refresh();
      form.addEventListener('input', refresh);
      form.addEventListener('change', refresh);
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const values = readForm(form, t);
        const msg = validate(t, values, form);
        if (msg) { form.querySelector('.form-error').textContent = msg; return; }
        const { computed } = computeAll(t, values, entry.ts);
        const { key, ...rest } = entry;
        await busy(form.querySelector('[type=submit]'), 'Saving…', () => save(key, { ...rest, values, computed, fileName: fileNameFor(t, values, computed, entry.ts) }));
        toast('Entry updated');
        close();
      });
    },
  });
}

/** Tap-to-build formulas: fields, previous values, operators and numbers. */
function openFormulaBuilder(t, key) {
  const f = t.fields[key];
  let tokens = clone(f.formula || []);
  let prevMode = false;
  const sources = fieldList(t).filter(x => x.key !== key && ['number', 'year', 'formula'].includes(x.kind));
  const labels = labelsOf(t);
  const sample = ui.drafts[t.id] || {};
  return openDialog({
    label: 'Formula',
    render(el, close) {
      el.closest('dialog').classList.add('is-wide');
      const tokenHtml = x => x.k === 'f' ? `<span class="g-tok is-field">${esc(labels[x.v] || x.v)}</span>`
        : x.k === 'p' ? `<span class="g-tok is-prev">previous ${esc(labels[x.v] || x.v)}</span>`
        : x.k === 'n' ? `<span class="g-tok is-num">${esc(x.v)}</span>`
        : x.k === 'abs' ? '<span class="g-tok is-op">abs(</span>'
        : `<span class="g-tok is-op">${esc({ '*': '×', '/': '÷', '-': '−' }[x.v] || x.v || x.k)}</span>`;
      const draw = () => {
        el.querySelector('[data-expr]').innerHTML = tokens.length ? tokens.map(tokenHtml).join('') : '<span class="g-tok-empty">Tap fields and operators below</span>';
        let res;
        try {
          const probe = { ...t, fields: { ...t.fields, [key]: { ...f, formula: tokens } } };
          const v = makeGetter(probe, sample, Date.now()).get(key, false);
          res = v == null ? (missingReason(probe, key, sample, Date.now()) || 'No result yet') + ' · it will calculate on the form' : `= ${E.fmtAngka(v)}`;
          el.querySelector('[data-res]').classList.remove('is-err');
        } catch (e) { res = e.message; el.querySelector('[data-res]').classList.add('is-err'); }
        el.querySelector('[data-res]').textContent = tokens.length ? res : '';
        el.querySelectorAll('[data-prev-toggle]').forEach(b => b.setAttribute('aria-pressed', String(prevMode)));
      };
      el.innerHTML = `
        <h2>Formula: ${esc(f.label || key)}</h2>
        <div class="g-expr" data-expr></div>
        <p class="g-res" data-res></p>
        <h3>Fields</h3>
        <div class="g-palette">
          <button type="button" class="g-key-btn is-toggle" data-prev-toggle aria-pressed="false" title="Next field you tap uses the value from the previous entry">Previous entry</button>
          ${sources.map(s => `<button type="button" class="g-key-btn is-field" data-field="${s.key}">${esc(s.label || s.key)}</button>`).join('') || '<span class="hint">No number fields yet. Set a field\'s kind to Number first.</span>'}
        </div>
        <h3>Operators</h3>
        <div class="g-palette g-ops">
          ${[['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷']].map(([v, l]) => `<button type="button" class="g-key-btn is-op" data-op="${v}">${l}</button>`).join('')}
          <button type="button" class="g-key-btn is-op" data-paren="(">(</button><button type="button" class="g-key-btn is-op" data-paren=")">)</button>
          <button type="button" class="g-key-btn is-op" data-abs>abs(</button>
          <span class="g-numin"><input class="input" inputmode="decimal" placeholder="Number" data-num aria-label="Number"><button type="button" class="g-key-btn" data-addnum>Add</button></span>
        </div>
        <div class="button-row g-edit-btns">
          <button type="button" class="btn btn-ghost btn-sm" data-undo>${ICON.back1}Undo</button>
          <button type="button" class="btn btn-ghost btn-sm" data-clear>Clear</button>
        </div>
        <p class="hint">Example, change in % from the previous entry: <code>( total − previous total ) ÷ previous total × 100</code>. Print it with <code>{{${esc(key)}:abs:persen}}</code> and the direction with <code>{{${esc(key)}:tanda(naik|turun|tetap)}}</code>.</p>
        <div class="dialog-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-save>Save formula</button></div>`;
      draw();
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.field) { tokens.push({ k: prevMode ? 'p' : 'f', v: b.dataset.field }); prevMode = false; }
        else if (b.matches('[data-prev-toggle]')) prevMode = !prevMode;
        else if (b.dataset.op) tokens.push({ k: 'op', v: b.dataset.op });
        else if (b.dataset.paren) tokens.push({ k: b.dataset.paren });
        else if (b.matches('[data-abs]')) tokens.push({ k: 'abs' });
        else if (b.matches('[data-addnum]')) {
          const inp = el.querySelector('[data-num]');
          const n = E.parseNumber(inp.value);
          if (n == null) { toast('Type a number first'); return; }
          tokens.push({ k: 'n', v: String(n) }); inp.value = '';
        }
        else if (b.matches('[data-undo]')) tokens.pop();
        else if (b.matches('[data-clear]')) tokens = [];
        else if (b.matches('[data-cancel]')) return close();
        else if (b.matches('[data-save]')) {
          try { E.evalFormula(tokens, () => 1); } catch (err) { toast(err.message); return; }
          updateTpl(t.id, x => { x.fields[key].formula = tokens; }).then(() => close(true));
          return;
        } else return;
        draw();
      });
      el.querySelector('[data-num]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-addnum]').click(); } });
    },
  });
}

async function updateTpl(id, mutate) {
  const cur = items.get(tplKey(id));
  if (!cur) return;
  const next = clone(cur);
  mutate(next);
  next.updatedAt = Date.now();
  await save(tplKey(id), next);
}

/* ---------- events ---------- */

function onRoute() {
  const [, kind, id, sub] = (location.hash || '').split('/');
  ui.tpl = kind === 't' && id ? id : null;
  ui.view = sub === 'fields' ? 'fields' : 'form';
  document.querySelector('.toolbar-title').textContent = ui.tpl ? '' : 'Templates';
  render();
  window.scrollTo({ top: 0 });
}

main.addEventListener('change', async e => {
  const el = e.target;
  // upload a new template
  if (el.matches('[data-upload]') && el.files[0]) {
    const file = el.files[0]; el.value = '';
    try {
      const { bytes, found } = await readTemplate(file);
      const id = newId();
      toast('Saving template…');
      await saveTemplate(id, null, file, bytes, found);
      toast(found.length ? `Found ${found.length} field${found.length === 1 ? '' : 's'}` : 'No placeholders found yet. See the guide below.');
      location.hash = `#/t/${id}/fields`;
    } catch (err) { toast(err.message); }
    return;
  }
  if (el.matches('[data-replace]') && el.files[0]) {
    const file = el.files[0]; el.value = '';
    const t = getTpl(ui.tpl);
    try {
      const { bytes, found } = await readTemplate(file);
      const before = new Set(fieldList(t).filter(f => f.inDoc).map(f => f.key));
      await saveTemplate(t.id, items.get(tplKey(t.id)), file, bytes, found);
      const added = found.filter(p => !before.has(p.key)).length;
      toast(`Template replaced${added ? `, ${added} new field${added === 1 ? '' : 's'}` : ''}`);
    } catch (err) { toast(err.message); }
    return;
  }
  // template settings
  if (el.dataset.tpl) { const v = el.value.trim(); if (el.dataset.tpl === 'name' && !v) return render(); await updateTpl(ui.tpl, x => { x[el.dataset.tpl] = v; }); return; }
  const row = el.closest('.g-setrow');
  if (row && el.dataset.f) {
    const k = row.dataset.key, prop = el.dataset.f;
    await updateTpl(ui.tpl, x => {
      const f = x.fields[k];
      if (prop === 'required') f.required = el.checked;
      else if (prop === 'maxlen') f.maxlen = Math.max(0, parseInt(el.value, 10) || 0);
      else if (prop === 'options') f.options = el.value.split('\n').map(s => s.trim()).filter(Boolean);
      else if (prop === 'label') f.label = el.value.trim() || E.labelOf(k);
      else if (prop === 'kind') { f.kind = el.value; if (f.kind === 'formula' && !f.formula) f.formula = []; }
    });
    return;
  }
  // form edits keep a draft
  const form = el.closest('[data-form=gen]');
  if (form) { ui.drafts[ui.tpl] = readForm(form, getTpl(ui.tpl)); refreshComputed(getTpl(ui.tpl)); }
});

main.addEventListener('input', e => {
  const form = e.target.closest('[data-form=gen]');
  if (form) { ui.drafts[ui.tpl] = readForm(form, getTpl(ui.tpl)); refreshComputed(getTpl(ui.tpl)); }
});

main.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form !== 'gen') return;
  const t = getTpl(ui.tpl);
  const btn = form.querySelector('[type=submit]');
  try { await busy(btn, 'Generating…', () => generate(t, form)); }
  catch (err) { form.querySelector('.form-error').textContent = err.message || "Couldn't generate the document."; }
});

main.addEventListener('click', async e => {
  const b = e.target.closest('[data-act], [data-move], [data-remove], [data-build]');
  if (!b) return;
  const t = ui.tpl ? getTpl(ui.tpl) : null;
  if (b.dataset.move || b.matches('[data-remove]') || b.matches('[data-build]')) {
    const k = b.closest('.g-setrow').dataset.key;
    if (b.matches('[data-build]')) return openFormulaBuilder(t, k);
    if (b.matches('[data-remove]')) return updateTpl(t.id, x => { delete x.fields[k]; });
    const list = fieldList(t), i = list.findIndex(f => f.key === k), j = i + Number(b.dataset.move);
    if (j < 0 || j >= list.length) return;
    return updateTpl(t.id, x => { const a = x.fields[list[i].key].order; x.fields[list[i].key].order = x.fields[list[j].key].order; x.fields[list[j].key].order = a; });
  }
  const entry = b.dataset.key ? { key: b.dataset.key, ...items.get(b.dataset.key) } : null;
  switch (b.dataset.act) {
    case 'gate': if (S.getState().status === 'error') return S.retry(); return document.querySelector('#account-slot [data-act]')?.click();
    case 'clear': ui.drafts[t.id] = defaultValues(t); return render();
    case 'load':
      ui.drafts[t.id] = { ...entry.values };
      render();
      toast(`Loaded ${fmtTs(entry.ts)} into the form`);
      return window.scrollTo({ top: 0, behavior: 'smooth' });
    case 'dl':
      try {
        const blob = await busy(b, '', () => buildDocx(t, entry.values || {}, entry.computed || {}));
        await L.resultCard(blob, entry.fileName || fileNameFor(t, entry.values, entry.computed, entry.ts)).querySelector('a').click();
      } catch (err) { toast(err.message); }
      return;
    case 'edit': return openEntryDialog(t, entry);
    case 'del':
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.classList.add('is-armed'); b.title = 'Tap again to delete'; toast('Tap again to delete this entry'); setTimeout(() => { delete b.dataset.armed; b.classList.remove('is-armed'); }, 3000); return; }
      await store.remove(entry.key); toast('Entry deleted'); return;
    case 'csv': return exportCsv(t);
    case 'add-formula': {
      let n = 1, k;
      do { k = `hitung_${n++}`; } while (t.fields[k]);
      await updateTpl(t.id, x => { x.fields[k] = { label: `Formula ${n - 1}`, kind: 'formula', formula: [], inDoc: false, formats: [], order: Math.max(0, ...Object.values(x.fields).map(f => f.order ?? 0)) + 10 }; });
      return openFormulaBuilder(getTpl(t.id), k);
    }
    case 'download-tpl':
      try { const blob = new Blob([templateBytes(t)], { type: DOCX }); L.resultCard(blob, t.fileName || `${t.name}.docx`).querySelector('a').click(); }
      catch (err) { toast(err.message); }
      return;
    case 'delete-tpl': return openDeleteTpl(t);
  }
});

function exportCsv(t) {
  const fields = fieldList(t).filter(f => f.inDoc || f.kind === 'formula');
  const rows = [['Created', ...fields.map(f => f.label || f.key)]];
  for (const e of entriesOf(t.id).slice().reverse()) {
    rows.push([new Date(e.ts).toISOString().replace('T', ' ').slice(0, 19), ...fields.map(f => f.kind === 'formula' ? (e.computed?.[f.key] ?? '') : (e.values?.[f.key] ?? ''))]);
  }
  const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  L.resultCard(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${t.name} history.csv`).querySelector('a').click();
}

function openDeleteTpl(t) {
  const n = entriesOf(t.id).length;
  return openDialog({
    label: 'Delete template',
    render(el, close) {
      el.innerHTML = `
        <h2>Delete ${esc(t.name)}?</h2>
        <p>This removes the template${n ? ` and its <strong>${n} history ${n === 1 ? 'entry' : 'entries'}</strong>` : ''} from all your devices.</p>
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-backup>Backup first</button><span class="spacer"></span>
          <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
          <button class="btn btn-primary erase-btn" type="button" data-go>Delete</button>
        </div>`;
      el.querySelector('[data-backup]').addEventListener('click', () => openBackupDialog());
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-go]').addEventListener('click', async ev => {
        await busy(ev.currentTarget, 'Deleting…', async () => {
          for (const e of entriesOf(t.id)) await store.remove(e.key);
          for (let i = 0; i < (t.chunks || 0); i++) await store.remove(`bin:${t.id}:${i}`).catch(() => {});
          await store.remove(tplKey(t.id));
        });
        close();
        location.hash = '#/';
        toast('Template deleted');
      });
    },
  });
}

document.querySelector('[data-act=add]')?.addEventListener('click', () => {
  if (!ui.loaded) return toast('Unlock first');
  if (ui.tpl) location.hash = `#/t/${ui.tpl}/fields`;
  else main.querySelector('[data-upload]')?.click();
});
document.querySelector('[data-act=settings]')?.addEventListener('click', () => (ui.loaded ? openBackupDialog() : toast('Unlock first')));

store.subscribe(list => {
  items = new Map(list.map(i => [i.key, i.data]));
  const first = !ui.loaded;
  ui.loaded = true;
  if (first) return onRoute();
  const el = document.activeElement;
  if (el && main.contains(el) && el.matches('input:not([type=file]):not([type=checkbox]), textarea, select')) return;
  render();
});
S.onChange(st => { if (st.status !== 'unlocked') { ui.loaded = false; items = new Map(); render(); } });
addEventListener('hashchange', () => { if (ui.loaded) onRoute(); });
mountHeader({ autoUnlock: true });
render();
