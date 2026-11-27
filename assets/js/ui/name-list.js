/* ==========================================================
   Settings lists: tidy tap-to-edit rows, plus a small dialog for
   renaming or removing one entry. Shared by the tools' settings.
   ========================================================== */

import { openDialog, esc } from './dom.js';

export const CHEVRON = '<span class="chevron"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg></span>';
export const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/** Rows for a .nav-list. items: [{ id, name, sub? }] */
export function navRows(items, attr = 'data-edit') {
  return items.map(i => `
    <li><button type="button" class="nav-item" ${attr}="${esc(i.id)}">
      <span class="nav-item-main"><span class="nav-item-name">${esc(i.name)}</span>${i.sub ? `<span class="nav-item-sub">${esc(i.sub)}</span>` : ''}</span>
      ${CHEVRON}
    </button></li>`).join('');
}

/** Rename / remove / add one name.
    Resolves { name } on save, { remove: true } on remove, undefined on cancel. */
export function openNameEditor({ title, value = '', placeholder = '', note = '', removable = false, removeLabel = 'Remove', maxlength = 40 }) {
  return openDialog({
    label: title,
    render(el, close) {
      el.innerHTML = `
        <h2>${esc(title)}</h2>
        <form data-form>
          <label class="field"><span class="field-label">Name</span>
            <input class="input" name="name" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="${maxlength}" autocomplete="off" required autofocus></label>
          ${note ? `<p class="hint">${esc(note)}</p>` : ''}
          <div class="dialog-actions">
            ${removable ? `<button class="btn btn-text danger-text" type="button" data-remove>${esc(removeLabel)}</button><span class="spacer"></span>` : ''}
            <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>`;
      el.querySelector('[data-cancel]').addEventListener('click', () => close());
      el.querySelector('[data-remove]')?.addEventListener('click', () => close({ remove: true }));
      el.querySelector('[data-form]').addEventListener('submit', e => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (name) close({ name });
      });
    },
  });
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
