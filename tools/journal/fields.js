/* ==========================================================
   Extra questions on log categories ("fields").

   A category may define:
     fields: { <fid>: { label, type, options?, order } }
   type: rating (1–5) | text | choice | yesno | number
   An entry stores answers as: fields: { <fid>: value }
   ========================================================== */

import { esc } from '../../assets/js/ui/dom.js';

export const FIELD_TYPES = {
  rating: 'Rating (1–5)',
  text: 'Short answer',
  choice: 'Pick one',
  yesno: 'Yes / no',
  number: 'Number',
};

const RATING_MAX = 5;
const blossom = cls => `<svg class="j-blossom ${cls}" aria-hidden="true"><use href="#blossom"/></svg>`;

export function fieldList(cat) {
  return Object.entries((cat && cat.fields) || {})
    .map(([id, f]) => ({ id, ...f }))
    .filter(f => FIELD_TYPES[f.type] && (f.label || '').trim())
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

const isEmpty = v => v == null || v === '' || (typeof v === 'number' && isNaN(v));

/** Form controls for a category's questions. `values` holds current answers. */
export function renderFieldInputs(cat, values = {}, scope = 'c') {
  const fields = fieldList(cat);
  if (!fields.length) return '';
  return `<div class="j-fields">${fields.map(f => {
    const v = values[f.id];
    const head = `<span class="j-field-label" id="fl-${scope}-${f.id}">${esc(f.label)}</span>`;
    switch (f.type) {
      case 'rating':
        return `<div class="j-field">${head}
          <div class="j-rating" role="radiogroup" aria-labelledby="fl-${scope}-${f.id}">
            ${Array.from({ length: RATING_MAX }, (_, i) => i + 1).map(n => `
              <button type="button" role="radio" aria-checked="${v === n}" aria-label="${n} of ${RATING_MAX}"
                class="${typeof v === 'number' && n <= v ? 'is-on' : ''}" data-act="set-field" data-fid="${f.id}" data-val="${n}">${blossom('')}</button>`).join('')}
          </div></div>`;
      case 'choice':
      case 'yesno': {
        const opts = f.type === 'yesno' ? ['Yes', 'No'] : (f.options || []).filter(Boolean);
        return `<div class="j-field">${head}
          <div class="choice-chips" role="radiogroup" aria-labelledby="fl-${scope}-${f.id}">
            ${opts.map(o => `<button type="button" role="radio" aria-checked="${v === o}" data-act="set-field" data-fid="${f.id}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}
          </div></div>`;
      }
      case 'number':
        return `<label class="j-field">${head}
          <input class="input j-field-input" inputmode="decimal" data-fid="${f.id}" data-ftype="number" data-focus="lf-${scope}:${f.id}" data-keep value="${isEmpty(v) ? '' : esc(v)}" autocomplete="off"></label>`;
      default:
        return `<label class="j-field">${head}
          <input class="input j-field-input" data-fid="${f.id}" data-ftype="text" data-focus="lf-${scope}:${f.id}" data-keep value="${isEmpty(v) ? '' : esc(v)}" autocomplete="off"></label>`;
    }
  }).join('')}</div>`;
}

/** Toggle a button-type answer (tap again to clear). */
export function applyFieldClick(values, btn) {
  const fid = btn.dataset.fid;
  let val = btn.dataset.val;
  if (/^\d+$/.test(val) && btn.closest('.j-rating')) val = Number(val);
  if (values[fid] === val) delete values[fid]; else values[fid] = val;
}

/** Collect answers: button answers from `values`, typed ones from inputs in `root`. */
export function collectFields(cat, root, values = {}) {
  const out = {};
  for (const f of fieldList(cat)) {
    if (f.type === 'text' || f.type === 'number') {
      const el = root.querySelector(`.j-field-input[data-fid="${f.id}"]`);
      const raw = el ? el.value.trim() : '';
      if (!raw) continue;
      if (f.type === 'number') {
        const n = Number(raw.replace(',', '.'));
        if (isFinite(n)) out[f.id] = n;
      } else {
        out[f.id] = raw;
      }
    } else if (!isEmpty(values[f.id])) {
      out[f.id] = values[f.id];
    }
  }
  return out;
}

/** Compact summary of answers for the timeline. */
const labelText = l => esc(/[?:!.]$/.test(l.trim()) ? l.trim() : l.trim() + ':');

export function renderFieldSummary(cat, answers) {
  if (!answers) return '';
  const parts = [];
  for (const f of fieldList(cat)) {
    const v = answers[f.id];
    if (isEmpty(v)) continue;
    if (f.type === 'rating') {
      parts.push(`<span class="j-ans"><span class="j-ans-label">${labelText(f.label)}</span>
        <span class="j-mini-rating" aria-label="${v} of ${RATING_MAX}">${Array.from({ length: RATING_MAX }, (_, i) => blossom(i < v ? 'is-on' : '')).join('')}</span></span>`);
    } else {
      parts.push(`<span class="j-ans"><span class="j-ans-label">${labelText(f.label)}</span> ${esc(String(v))}</span>`);
    }
  }
  return parts.length ? `<span class="j-entry-fields">${parts.join('')}</span>` : '';
}

/** Plain text of answers, for search. */
export function fieldsText(cat, answers) {
  return fieldList(cat).map(f => answers && !isEmpty(answers[f.id]) ? `${f.label}: ${answers[f.id]}` : '').filter(Boolean).join(' · ');
}
