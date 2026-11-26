/* ==========================================================
   rose at six — appearance boot
   Loaded synchronously in <head> so the chosen palette and
   light/dark mode apply before the first paint.
   Exposes window.RAS_THEME for the rest of the app.
   ========================================================== */
(function () {
  var PALETTES = {
    rose: {
      name: 'Rose at six',
      flower: '#C27A6E', leaf: '#7F8E6B', sun: '#C1914F',
      bgLight: '#F5EFE6', textLight: '#3B302B', bgDark: '#1E1916', textDark: '#F0E7DD'
    },
    peony: {
      name: 'Peony',
      flower: '#C76E85', leaf: '#86976F', sun: '#D19D58',
      bgLight: '#F8EFEE', textLight: '#3D2C30', bgDark: '#1F181A', textDark: '#F3E6E8'
    },
    lavender: {
      name: 'Lavender dusk',
      flower: '#9478A6', leaf: '#7C8C74', sun: '#C39A6B',
      bgLight: '#F2EFF1', textLight: '#352F3A', bgDark: '#1B181D', textDark: '#EEE8F0'
    },
    terracotta: {
      name: 'Terracotta',
      flower: '#B8613E', leaf: '#6E7D57', sun: '#CB9A42',
      bgLight: '#F4EBE0', textLight: '#3A2C22', bgDark: '#1F1813', textDark: '#F1E5D8'
    },
    moss: {
      name: 'Moss',
      flower: '#B47A84', leaf: '#5E7B53', sun: '#B68B4A',
      bgLight: '#EEF0E6', textLight: '#2F3329', bgDark: '#191C16', textDark: '#E8ECDF'
    }
  };

  // palette field -> CSS custom property
  var VARS = {
    flower: '--flower-base', leaf: '--leaf-base', sun: '--sun-base',
    bgLight: '--bg-light', textLight: '--text-light', bgDark: '--bg-dark', textDark: '--text-dark'
  };

  // Fields a person can override with their own colours
  var CUSTOMIZABLE = ['flower', 'leaf', 'sun', 'bgLight', 'bgDark'];

  var KEY = 'ras-prefs';

  function defaults() { return { mode: 'auto', palette: 'rose', custom: {} }; }

  function read() {
    var p = defaults();
    try {
      var stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (stored && typeof stored === 'object') {
        if (stored.mode === 'light' || stored.mode === 'dark' || stored.mode === 'auto') p.mode = stored.mode;
        if (PALETTES[stored.palette]) p.palette = stored.palette;
        if (stored.custom && typeof stored.custom === 'object') {
          CUSTOMIZABLE.forEach(function (k) {
            if (/^#[0-9a-f]{6}$/i.test(stored.custom[k] || '')) p.custom[k] = stored.custom[k];
          });
        }
      } else {
        // carry over the older light/dark-only setting
        var old = localStorage.getItem('ras-theme');
        if (old === 'light' || old === 'dark') p.mode = old;
      }
    } catch (e) {}
    return p;
  }

  function resolved(p) {
    var base = PALETTES[p.palette] || PALETTES.rose;
    var out = {};
    for (var k in VARS) out[k] = (p.custom && p.custom[k]) || base[k];
    return out;
  }

  function apply(p) {
    var root = document.documentElement;
    if (p.mode === 'light' || p.mode === 'dark') root.setAttribute('data-theme', p.mode);
    else root.removeAttribute('data-theme');
    var c = resolved(p);
    for (var k in VARS) root.style.setProperty(VARS[k], c[k]);
  }

  function save(p, detail) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
    apply(p);
    try {
      window.dispatchEvent(new CustomEvent('ras:prefs', { detail: { prefs: p, source: (detail && detail.source) || 'user' } }));
    } catch (e) {}
  }

  window.RAS_THEME = {
    PALETTES: PALETTES, CUSTOMIZABLE: CUSTOMIZABLE,
    read: read, save: save, apply: apply, resolved: resolved
  };

  apply(read());
})();
