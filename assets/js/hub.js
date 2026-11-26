/* ==========================================================
   rose at six — hub page
   To add a tool: add an entry to TOOLS below.
   - status "soon" shows a muted card; "ready" makes it a link.
   - href is relative to the site root, e.g. "tools/journal/".
   ========================================================== */

import { mountHeader } from './ui/header.js';

const GROUPS = [
  { id: 'everyday',  title: 'Everyday',  tone: 'flower' },
  { id: 'money',     title: 'Money',     tone: 'sun' },
  { id: 'documents', title: 'Documents', tone: 'leaf' },
];

const TOOLS = [
  { group: 'everyday', name: 'Journal', desc: 'Daily planner, notes and reflections.',
    href: 'tools/journal/', icon: 'journal', status: 'soon' },
  { group: 'everyday', name: 'Home inventory', desc: 'What you own, where it lives.',
    href: 'tools/inventory/', icon: 'home', status: 'soon' },

  { group: 'money', name: 'Bill splitter', desc: 'Split costs with friends, settle up fairly.',
    href: 'tools/split/', icon: 'receipt', status: 'soon' },
  { group: 'money', name: 'Subscriptions', desc: 'Recurring payments and renewal dates.',
    href: 'tools/subscriptions/', icon: 'repeat', status: 'soon' },

  { group: 'documents', name: 'Document toolkit', desc: 'Convert, compress, merge and extract files, plus OCR for scans.',
    href: 'tools/documents/', icon: 'toolkit', status: 'soon' },
  { group: 'documents', name: 'Generate from DOCX', desc: 'Fill a Word template to make new documents.',
    href: 'tools/generate/', icon: 'sparkdoc', status: 'soon' },
];

/* Line icons, 24×24, stroke-based */
const ICONS = {
  journal:  '<path d="M6 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6z"/><path d="M6 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2"/><path d="M9.5 8h6M9.5 11.5h6M9.5 15h3.5"/>',
  home:     '<path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9v10.5h13V9"/><rect x="9.5" y="13" width="5" height="6.5" rx="1"/>',
  receipt:  '<path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.5z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  repeat:   '<path d="M4 11V9.5a3 3 0 0 1 3-3h12"/><path d="m16 3.5 3 3-3 3"/><path d="M20 13v1.5a3 3 0 0 1-3 3H5"/><path d="m8 20.5-3-3 3-3"/>',
  toolkit:  '<rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3.5 12.5h17"/><path d="M10.5 12.5v1.5h3v-1.5"/>',
  convert:  '<path d="M7 3.5h6l4 4V12"/><path d="M13 3.5v4h4"/><path d="M7 3.5a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h3"/><path d="M14 17h6"/><path d="m17.5 14.5 2.5 2.5-2.5 2.5"/>',
  compress: '<path d="M12 3v6"/><path d="m9 6 3 3 3-3"/><path d="M12 21v-6"/><path d="m9 18 3-3 3 3"/><path d="M4 12h16"/>',
  merge:    '<rect x="3.5" y="4" width="7" height="9" rx="1.5"/><rect x="13.5" y="4" width="7" height="9" rx="1.5"/><path d="M7 13v2.5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V13"/><path d="M12 17.5V21"/>',
  extract:  '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/><path d="M12 11v6"/><path d="m9.5 14.5 2.5 2.5 2.5-2.5"/>',
  scan:     '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  sparkdoc: '<path d="M13 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5"/><path d="M8.5 13h6M8.5 16.5h4"/><path d="M18 2.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
};

function svgIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function renderTools() {
  const root = document.getElementById('tool-groups');
  const frag = document.createDocumentFragment();

  for (const group of GROUPS) {
    const tools = TOOLS.filter(t => t.group === group.id);
    if (!tools.length) continue;

    const section = document.createElement('section');
    section.className = `group tone-${group.tone}`;
    section.setAttribute('aria-labelledby', `g-${group.id}`);

    const ready = tools.filter(t => t.status === 'ready').length;
    section.innerHTML = `
      <div class="group-head">
        <svg aria-hidden="true"><use href="#blossom"/></svg>
        <h2 class="group-title" id="g-${group.id}">${group.title}</h2>
        <span class="group-count">${ready ? `${ready} of ${tools.length} ready` : `${tools.length} planned`}</span>
      </div>
      <div class="grid"></div>`;

    const grid = section.querySelector('.grid');
    for (const tool of tools) {
      const isReady = tool.status === 'ready';
      const el = document.createElement(isReady ? 'a' : 'div');
      el.className = `card${isReady ? '' : ' is-soon'}`;
      if (isReady) el.href = tool.href;
      else el.setAttribute('aria-disabled', 'true');
      el.innerHTML = `
        <span class="card-icon">${svgIcon(tool.icon)}</span>
        <span class="card-body">
          <span class="card-top">
            <h3 class="card-title">${tool.name}</h3>
            ${isReady ? '' : '<span class="tag">Soon</span>'}
          </span>
          <p class="card-desc">${tool.desc}</p>
        </span>`;
      grid.appendChild(el);
    }
    frag.appendChild(section);
  }
  root.replaceChildren(frag);
}

function renderGreeting() {
  const now = new Date();
  const h = now.getHours();
  const greeting =
    h < 5  ? 'Still up?' :
    h < 12 ? 'Good morning' :
    h < 17 ? 'Good afternoon' :
    h < 21 ? 'Good evening' : 'Good night';

  document.getElementById('greeting').textContent = greeting;
  document.getElementById('today').textContent = now.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

renderGreeting();
renderTools();
mountHeader();
