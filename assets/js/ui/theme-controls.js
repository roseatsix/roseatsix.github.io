/* Light/dark toggle and the Appearance button. No Firebase involved,
   so these keep working even if sign-in can't load. */

import { openAppearanceDialog } from './appearance.js';

const T = window.RAS_THEME;
let mounted = false;

export function mountThemeControls() {
  if (mounted) return;
  mounted = true;
  setupThemeToggle();
  setupStickyTopbar();
  document.getElementById('appearance-btn')?.addEventListener('click', openAppearanceDialog);
}

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const current = () => {
    const m = T.read().mode;
    return m === 'auto' ? (media.matches ? 'dark' : 'light') : m;
  };
  const label = () => btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  btn.addEventListener('click', () => {
    T.save({ ...T.read(), mode: current() === 'dark' ? 'light' : 'dark' }, { source: 'mode' });
  });
  window.addEventListener('ras:prefs', label);
  media.addEventListener?.('change', label);
  label();
}

/* The top bar sticks to the top of every page; give it a backdrop
   once the page has scrolled under it. */
function setupStickyTopbar() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const onScroll = () => bar.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
