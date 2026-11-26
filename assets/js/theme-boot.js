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
    },
    camellia: {
      name: 'Camellia',
      flower: '#B5474F', leaf: '#6E8466', sun: '#D2A04E',
      bgLight: '#F8EFEC', textLight: '#3B2A28', bgDark: '#1E1716', textDark: '#F3E5E2'
    },
    marigold: {
      name: 'Marigold',
      flower: '#C9792F', leaf: '#7C8A5A', sun: '#C9A24A',
      bgLight: '#F7F0E3', textLight: '#3A2E22', bgDark: '#1E1913', textDark: '#F2E7D6'
    },
    sage: {
      name: 'Sage garden',
      flower: '#6F8F6E', leaf: '#556F57', sun: '#C4A15E',
      bgLight: '#EFF2EA', textLight: '#2C3329', bgDark: '#171B16', textDark: '#E6ECE2'
    },
    hydrangea: {
      name: 'Hydrangea',
      flower: '#6A87B0', leaf: '#7C9484', sun: '#C8A26B',
      bgLight: '#EEF1F4', textLight: '#2D333B', bgDark: '#161A1F', textDark: '#E5EAF0'
    },
    plum: {
      name: 'Plum',
      flower: '#8E4F68', leaf: '#6F7E5E', sun: '#C29256',
      bgLight: '#F5EEF0', textLight: '#3A2A30', bgDark: '#1D1619', textDark: '#F0E4E8'
    },
    clay: {
      name: 'Desert clay',
      flower: '#A8705A', leaf: '#8A8A62', sun: '#C9A066',
      bgLight: '#F3ECE3', textLight: '#3A3029', bgDark: '#1D1814', textDark: '#EFE4D8'
    },
    matcha: {
      name: 'Matcha',
      flower: '#7F8F45', leaf: '#5E7350', sun: '#C9A65A',
      bgLight: '#F2F1E6', textLight: '#2F3125', bgDark: '#191A14', textDark: '#EAEAD9'
    },
    stone: {
      name: 'Stone',
      flower: '#8C766A', leaf: '#7F8574', sun: '#B49A72',
      bgLight: '#F4F2EE', textLight: '#33302C', bgDark: '#1A1917', textDark: '#ECE9E4'
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
