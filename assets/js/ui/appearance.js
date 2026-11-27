/* Appearance panel: light/dark mode, palettes and custom colours. */

import { openDialog, esc } from './dom.js';

const T = window.RAS_THEME;

const NEUTRAL_LABELS = { flower: 'Main colour', leaf: 'Second colour', sun: 'Third colour', bgLight: 'Background (light)', bgDark: 'Background (dark)' };
const COLOR_LABELS = {
  flower: 'Flower',
  leaf: 'Leaf',
  sun: 'Sun',
  bgLight: 'Background (light)',
  bgDark: 'Background (dark)',
};

export function openAppearanceDialog() {
  return openDialog({
    label: 'Appearance',
    render(el) {
      el.innerHTML = `
        <h2>Appearance</h2>
        <p>Theme, palette and colours sync to your other devices while you're signed in. Light/dark is set per device.</p>

        <h3>Theme</h3>
        <div class="themes" data-themes></div>
        <p class="hint" data-icon-note></p>

        <h3>Mode</h3>
        <div class="segmented" role="group" aria-label="Mode" data-modes>
          <button type="button" data-mode="auto">Auto</button>
          <button type="button" data-mode="light">Light</button>
          <button type="button" data-mode="dark">Dark</button>
        </div>

        <h3>Palette</h3>
        <div class="palettes" data-palettes></div>

        <h3>Your colours</h3>
        <div class="colors" data-colors></div>
        <div class="dialog-actions">
          <button class="btn btn-ghost" type="button" data-reset>Reset to palette colours</button>
        </div>`;

      // Theme cards: a sample in each theme's own font and colours
      const all = document.getElementById('ras-fonts-all') || document.head.appendChild(Object.assign(document.createElement('link'), {
        id: 'ras-fonts-all', rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?' + Object.values(T.STYLES).map(st => st.fonts).join('&') + '&display=swap',
      }));
      const themesEl = el.querySelector('[data-themes]');
      themesEl.innerHTML = Object.entries(T.STYLES).map(([id, st]) => {
        const p = T.PALETTES[T.firstPalette(id)];
        return `
          <button type="button" class="theme-card theme-${id}" data-style="${id}" style="--tc-bg:${p.bgLight};--tc-text:${p.textLight};--tc-accent:${p.flower};--tc-font:${esc(st.sample)}">
            <span class="theme-sample" aria-hidden="true"><span class="theme-aa">Aa</span><span class="theme-dots"><i style="background:${p.flower}"></i><i style="background:${p.leaf}"></i><i style="background:${p.sun}"></i></span></span>
            <span class="theme-name">${esc(st.name)}</span>
            <span class="theme-note">${esc(st.note)}</span>
          </button>`;
      }).join('');

      const palettesEl = el.querySelector('[data-palettes]');
      const drawPalettes = style => { palettesEl.innerHTML = Object.entries(T.PALETTES).filter(([, p]) => p.style === style).map(([id, p]) => `
        <button type="button" class="palette" data-palette="${id}">
          <span class="palette-dots" aria-hidden="true">
            <span style="background:${p.bgLight}"></span>
            <span style="background:${p.flower}"></span>
            <span style="background:${p.leaf}"></span>
            <span style="background:${p.sun}"></span>
            <span style="background:${p.bgDark}"></span>
          </span>
          ${esc(p.name)}
        </button>`).join(''); };

      const colorsEl = el.querySelector('[data-colors]');
      colorsEl.innerHTML = T.CUSTOMIZABLE.map(k => `
        <label class="color-row" data-color-row="${k}">
          <input type="color" data-color="${k}">
          <span>${COLOR_LABELS[k]}</span>
          <span class="hex"></span>
        </label>`).join('');

      let shownStyle = null;
      const sync = () => {
        const p = T.read();
        if (shownStyle !== p.style) {
          shownStyle = p.style; drawPalettes(p.style);
          const names = p.style === 'rose' ? COLOR_LABELS : NEUTRAL_LABELS;
          el.querySelectorAll('[data-color-row]').forEach(r => { r.querySelector('span').textContent = names[r.dataset.colorRow]; });
        }
        el.querySelectorAll('[data-style]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === p.style)));
        el.querySelector('[data-icon-note]').textContent = p.style === 'rose'
          ? 'The app icon follows the theme. Phones take the icon when the app is installed, so reinstall it from your home screen to see a new one.'
          : `The ${T.STYLES[p.style].name} app icon appears when you install the app (or remove it from your home screen and install it again).`;
        const c = T.resolved(p);
        el.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === p.mode)));
        el.querySelectorAll('[data-palette]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.palette === p.palette)));
        el.querySelectorAll('[data-color]').forEach(inp => {
          const k = inp.dataset.color;
          if (document.activeElement !== inp) inp.value = c[k].toLowerCase();
          const row = inp.closest('.color-row');
          row.classList.toggle('is-custom', !!p.custom[k]);
          row.querySelector('.hex').textContent = (p.custom[k] ? 'custom ' : '') + c[k].toUpperCase();
        });
        el.querySelector('[data-reset]').disabled = !Object.keys(p.custom).length;
      };

      el.querySelector('[data-modes]').addEventListener('click', e => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        T.save({ ...T.read(), mode: b.dataset.mode }, { source: 'mode' });
        sync();
      });

      themesEl.addEventListener('click', e => {
        const b = e.target.closest('[data-style]');
        if (!b) return;
        const cur = T.read();
        if (cur.style === b.dataset.style) return;
        T.save({ ...cur, style: b.dataset.style, palette: T.firstPalette(b.dataset.style), custom: {} });
        sync();
      });

      palettesEl.addEventListener('click', e => {
        const b = e.target.closest('[data-palette]');
        if (!b) return;
        T.save({ ...T.read(), palette: b.dataset.palette, custom: {} });
        sync();
      });

      colorsEl.addEventListener('input', e => {
        const k = e.target.dataset.color;
        if (!k) return;
        const p = T.read();
        const base = T.PALETTES[p.palette][k].toLowerCase();
        const custom = { ...p.custom };
        if (e.target.value.toLowerCase() === base) delete custom[k];
        else custom[k] = e.target.value.toUpperCase();
        T.save({ ...p, custom });
        sync();
      });

      el.querySelector('[data-reset]').addEventListener('click', () => {
        T.save({ ...T.read(), custom: {} });
        sync();
      });

      window.addEventListener('ras:prefs', sync);
      el.closest('dialog').addEventListener('close', () => window.removeEventListener('ras:prefs', sync));
      sync();
    },
  });
}
