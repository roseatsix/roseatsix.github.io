/* Small DOM helpers shared by the UI modules. */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h9"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/></svg>',
  google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5z"/><path d="M12 21c2.4 0 4.4-.8 5.9-2.2L15 16.5c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21z"/><path d="M7 13.7a5.4 5.4 0 0 1 0-3.4V8H4a9 9 0 0 0 0 8z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3L18 5.4A9 9 0 0 0 4 8l3 2.3c.7-2.1 2.7-3.7 5-3.7z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/></svg>',
};

/** Open a modal <dialog>. `render(el, close)` fills it; returns a promise
    that resolves with whatever is passed to close(value). */
export function openDialog({ label, render, dismissible = true }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.setAttribute('aria-label', label);
    const inner = document.createElement('div');
    inner.className = 'dialog-inner';
    dlg.appendChild(inner);
    document.body.appendChild(dlg);

    let result;
    const close = value => { result = value; dlg.close(); };
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.addEventListener('cancel', e => { if (!dismissible) e.preventDefault(); });
    if (dismissible) {
      dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    }

    render(inner, close);

    if (dismissible) {
      // The close button sits in a zero-height bar that sticks to the top
      // of the dialog, so it stays in reach while the content scrolls.
      const bar = document.createElement('div');
      bar.className = 'dialog-closebar';
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'icon-btn dialog-close';
      x.setAttribute('aria-label', 'Close');
      x.innerHTML = ICON.close;
      x.addEventListener('click', () => close());
      bar.appendChild(x);
      dlg.insertBefore(bar, inner);
    }

    // On touch screens, don't focus a text field (it would pop up the
    // keyboard); focus the dialog itself so screen readers still land in it.
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (touch) inner.querySelectorAll('[autofocus]').forEach(n => n.removeAttribute('autofocus'));
    dlg.showModal();
    const first = inner.querySelector('[autofocus]');
    if (touch) { dlg.tabIndex = -1; dlg.focus(); }
    else if (first) first.focus();
  });
}

let toastEl, toastTimer, toastHideTimer;
export function toast(message) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.hidden = true;
    if ('popover' in toastEl) toastEl.popover = 'manual';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  if (toastEl.showPopover) {
    // Re-open so it lands on top of any dialog opened since.
    clearTimeout(toastHideTimer);
    try { if (toastEl.matches(':popover-open')) toastEl.hidePopover(); toastEl.showPopover(); } catch (e) { /* ignore */ }
  }
  requestAnimationFrame(() => { toastEl.hidden = false; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
    toastHideTimer = setTimeout(() => { try { toastEl.hidePopover?.(); } catch (e) { /* ignore */ } }, 300);
  }, 2800);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch (e) {
    toast("Couldn't copy. Select the text and copy it by hand.");
  }
}

/** Show a busy state on a button while `fn` runs. */
export async function busy(button, label, fn) {
  const old = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label)}`;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.innerHTML = old;
  }
}

/** Scroll to something on the page and highlight it briefly
    (used when a search result or hub link points at an entry). */
export function reveal(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) return false;
  const closed = el.closest('details:not([open])');
  if (closed) closed.open = true;
  const smooth = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  el.classList.remove('is-found');
  void el.offsetWidth;            // restart the animation
  el.classList.add('is-found');
  setTimeout(() => el.classList.remove('is-found'), 2800);
  return true;
}
