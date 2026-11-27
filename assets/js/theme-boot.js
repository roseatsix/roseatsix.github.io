/* ==========================================================
   rose at six — appearance boot
   Loaded synchronously in <head> so the chosen palette and
   light/dark mode apply before the first paint.
   Exposes window.RAS_THEME for the rest of the app.
   ========================================================== */
(function () {
  /* A theme ("style") sets fonts, shapes, decorations and the app icon;
     each has its own palettes. Rose is the original. */
  var STYLES = {
    rose: {
      name: 'Rose', note: 'Soft serif, rounded, flowers',
      fonts: 'family=Fraunces:opsz,wght,SOFT@9..144,400..600,100&family=Nunito+Sans:opsz,wght@6..12,400..800',
      sample: '"Fraunces", Georgia, serif',
      icon: { touch: '/assets/icons/apple-touch-icon.png', manifest: '/assets/manifest.webmanifest', favicon: '/assets/favicon.svg' }
    },
    slate: {
      name: 'Slate', note: 'Clean and modern, one bright accent',
      fonts: 'family=Plus+Jakarta+Sans:wght@400..800',
      sample: '"Plus Jakarta Sans", system-ui, sans-serif',
      icon: { touch: '/assets/icons/slate-180.png', manifest: '/assets/manifest-slate.webmanifest', favicon: '/assets/favicon-slate.svg' }
    },
    beacon: {
      name: 'Beacon', note: 'Warm paper, calm serif titles, easy-to-read text',
      fonts: 'family=Atkinson+Hyperlegible+Next:ital,wght@0,400..700;1,400..700&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600',
      sample: '"Newsreader", Georgia, serif',
      icon: { touch: '/assets/icons/beacon-180.png', manifest: '/assets/manifest-beacon.webmanifest', favicon: '/assets/favicon-beacon.svg' }
    }
  };

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
    },

    /* Slate */
    'slate-blue': {
      style: 'slate', name: 'Blue',
      flower: '#2E6BE6', leaf: '#16A37B', sun: '#D9822B',
      bgLight: '#F3F4F6', textLight: '#111827', bgDark: '#0F1115', textDark: '#E8EAEE'
    },
    'slate-green': {
      style: 'slate', name: 'Green',
      flower: '#12916B', leaf: '#2E6BE6', sun: '#D9822B',
      bgLight: '#F2F5F3', textLight: '#0F1B16', bgDark: '#0E1311', textDark: '#E6ECE9'
    },
    'slate-violet': {
      style: 'slate', name: 'Violet',
      flower: '#6D5BD0', leaf: '#16A37B', sun: '#D9822B',
      bgLight: '#F4F3F7', textLight: '#15131F', bgDark: '#100F15', textDark: '#E9E8EF'
    },
    'slate-graphite': {
      style: 'slate', name: 'Graphite',
      flower: '#3F4856', leaf: '#16A37B', sun: '#D9822B',
      bgLight: '#F3F4F5', textLight: '#111418', bgDark: '#0F1012', textDark: '#E7E9EC'
    },

    /* Beacon: warm paper, one quiet accent */
    'beacon-crimson': {
      style: 'beacon', name: 'Crimson',
      flower: '#9B2D2E', leaf: '#6F7F62', sun: '#B8955E',
      bgLight: '#F8F7F4', textLight: '#232220', bgDark: '#1C1B19', textDark: '#ECEAE5'
    },
    'beacon-ink': {
      style: 'beacon', name: 'Ink blue',
      flower: '#2F4A7A', leaf: '#6F7F62', sun: '#B8955E',
      bgLight: '#F7F7F5', textLight: '#21232A', bgDark: '#1A1B1E', textDark: '#EAEBEE'
    },
    'beacon-sage': {
      style: 'beacon', name: 'Sage',
      flower: '#5B6F50', leaf: '#9B2D2E', sun: '#B8955E',
      bgLight: '#F7F7F3', textLight: '#22241F', bgDark: '#1B1C19', textDark: '#EAEBE5'
    }
  };
  for (var id in PALETTES) if (!PALETTES[id].style) PALETTES[id].style = 'rose';

  // The first palette of a style is its default.
  function firstPalette(style) { for (var id in PALETTES) if (PALETTES[id].style === style) return id; return 'rose'; }

  // palette field -> CSS custom property
  var VARS = {
    flower: '--flower-base', leaf: '--leaf-base', sun: '--sun-base',
    bgLight: '--bg-light', textLight: '--text-light', bgDark: '--bg-dark', textDark: '--text-dark'
  };

  // Fields a person can override with their own colours
  var CUSTOMIZABLE = ['flower', 'leaf', 'sun', 'bgLight', 'bgDark'];

  var KEY = 'ras-prefs';

  function defaults() { return { mode: 'auto', style: 'rose', palette: 'rose', custom: {} }; }

  function read() {
    var p = defaults();
    try {
      var stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (stored && typeof stored === 'object') {
        if (stored.mode === 'light' || stored.mode === 'dark' || stored.mode === 'auto') p.mode = stored.mode;
        if (STYLES[stored.style]) p.style = stored.style;
        if (PALETTES[stored.palette]) p.palette = stored.palette;
        if (PALETTES[p.palette].style !== p.style) p.palette = firstPalette(p.style);
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

  /* Small marks drawn by the theme: the "blossom" (bullets, ratings,
     footers) and the brand mark. Rose keeps the originals from the page. */
  var MARKS = {
    slate: { blossom: '<rect x="-6.2" y="-6.2" width="12.4" height="12.4" rx="3.6" fill="currentColor"/>' },
    beacon: { blossom: '<circle r="5.2" fill="currentColor"/>' }
  };
  var original = {};
  function applyMarks(style) {
    ['blossom', 'rose'].forEach(function (id) {
      var sym = document.getElementById(id);
      if (!sym) return;
      if (!(id in original)) original[id] = sym.innerHTML;
      var want = (MARKS[style] && MARKS[style][id]) || original[id];
      if (sym.innerHTML !== want) sym.innerHTML = want;
    });
  }

  function setLink(sel, href) {
    var el = document.querySelector(sel);
    if (el && el.getAttribute('href') !== href) el.setAttribute('href', href);
  }

  function apply(p) {
    var root = document.documentElement;
    if (p.mode === 'light' || p.mode === 'dark') root.setAttribute('data-theme', p.mode);
    else root.removeAttribute('data-theme');
    var c = resolved(p);
    for (var k in VARS) root.style.setProperty(VARS[k], c[k]);

    var st = STYLES[p.style] || STYLES.rose;
    root.setAttribute('data-style', p.style);
    // fonts for this theme
    var font = document.getElementById('ras-fonts');
    var href = 'https://fonts.googleapis.com/css2?' + st.fonts + '&display=swap';
    if (!font) {
      font = document.createElement('link');
      font.id = 'ras-fonts'; font.rel = 'stylesheet';
      document.head.appendChild(font);
    }
    if (font.getAttribute('href') !== href) font.setAttribute('href', href);
    // app icon, install details and browser colour
    setLink('link[rel="apple-touch-icon"]', st.icon.touch);
    setLink('link[rel="manifest"]', st.icon.manifest);
    setLink('link[rel="icon"]', st.icon.favicon);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      var dark = /dark/.test(metas[i].getAttribute('media') || '');
      metas[i].setAttribute('content', dark ? c.bgDark : c.bgLight);
    }
    // marks (only once the page's symbols exist)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { applyMarks(read().style); }, { once: true });
    else applyMarks(p.style);
  }

  function save(p, detail) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
    apply(p);
    try {
      window.dispatchEvent(new CustomEvent('ras:prefs', { detail: { prefs: p, source: (detail && detail.source) || 'user' } }));
    } catch (e) {}
  }

  window.RAS_THEME = {
    STYLES: STYLES, PALETTES: PALETTES, CUSTOMIZABLE: CUSTOMIZABLE, firstPalette: firstPalette,
    read: read, save: save, apply: apply, resolved: resolved
  };

  apply(read());

  // Offline support (see /sw.js)
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
      // The page was built from a saved copy of a file that has since
      // changed: reload once so every file is from the same version.
      // Never while typing or with a dialog open; then wait until the
      // tab is shown again.
      var waiting = false;
      var reloadSoon = function () {
        try {
          var last = Number(sessionStorage.getItem('ras-stale-reload') || 0);
          if (Date.now() - last < 30000) return;           // no reload loops
          var el = document.activeElement;
          var busy = (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) || document.querySelector('dialog[open]');
          if (busy || document.visibilityState !== 'visible') {
            if (waiting) return;
            waiting = true;
            document.addEventListener('visibilitychange', function again() {
              if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', again); waiting = false; reloadSoon(); }
            });
            return;
          }
          sessionStorage.setItem('ras-stale-reload', String(Date.now()));
          location.reload();
        } catch (e) {}
      };
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'ras:stale') reloadSoon();
      });
    }
  } catch (e) {}
})();
