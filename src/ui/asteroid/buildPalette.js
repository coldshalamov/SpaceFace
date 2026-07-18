// Command card — the build palette as a StarCraft-style key grid (ASTEROID_OPS_UI_BRIEF §6).
// Machines + the two overlays + the dismantle tool, each a raised key with an engraved glyph
// and its hotkey printed on the cap. Always visible; dimmed when the console is in DRIVE.
// Radio-button semantics (aria-pressed), number keys 1-9 select, Q/E cycle. Clicking a key is
// also an intent to build, so the shell passes onUserSelect to arm BUILD mode.
import { SITE_MACHINES } from '../../data/sites.js';
import { commodityName } from './inspector.js';

export const PALETTE_ITEMS = [
  ...SITE_MACHINES.map((def) => ({
    kind: 'machine',
    id: def.id,
    name: def.name,
    verb: def.verb,
    cost: def.cost,
  })),
  { kind: 'overlay', id: 'power', name: 'Power Cable', verb: 'route', cost: null },
  { kind: 'overlay', id: 'lane', name: 'Material Lane', verb: 'route', cost: null },
  { kind: 'remove', id: 'remove', name: 'Dismantle', verb: 'remove', cost: null },
];

// Key-cap labels stay one word where the full name would ellipsize.
const SHORT_NAMES = {
  sm_massline_core: 'Core',
  sm_extractor: 'Extractor',
  sm_gas_tap: 'Gas Tap',
  sm_refinery: 'Refinery',
  sm_fabricator: 'Fabricator',
  sm_cargo_port: 'Cargo Port',
  power: 'Cable',
  lane: 'Lane',
  remove: 'Dismantle',
};

// Engraved line glyphs — inline SVG, currentColor, so the amber active state tints them free.
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" `
  + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const PALETTE_GLYPHS = {
  sm_massline_core: svg('<circle cx="12" cy="12" r="6.4"/>'
    + '<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>'
    + '<path d="M12 2.2v3.4M12 18.4v3.4M2.2 12h3.4M18.4 12h3.4"/>'),
  sm_extractor: svg('<rect x="8" y="3" width="8" height="4.5"/>'
    + '<path d="M10.5 7.5v4h3v-4"/><path d="M12 11.5v3.6"/>'
    + '<path d="M9.3 15.4h5.4L12 20.6z" fill="currentColor" stroke="none"/>'),
  sm_gas_tap: svg('<circle cx="12" cy="14" r="5.6"/><path d="M12 8.4V4.8M8.4 4.8h7.2"/>'
    + '<path d="M12 11.2c1.7 1.4 1.7 3.4 0 4.7-1.7-1.3-1.7-3.3 0-4.7z" '
    + 'fill="currentColor" stroke="none"/>'),
  sm_refinery: svg('<rect x="4.5" y="9" width="11" height="11"/>'
    + '<path d="M18.2 20V5.4h2.8V20"/>'
    + '<path d="M8.4 16.2c0-2 2.1-2.5 2.1-4.2 1.6 1.2 2.7 2.7 2.7 4.2a2.4 2.4 0 1 1-4.8 0z" '
    + 'fill="currentColor" stroke="none"/>'),
  sm_fabricator: svg('<circle cx="12" cy="12" r="3.1"/>'
    + '<path d="M12 4.4v2.2M12 17.4v2.2M4.4 12h2.2M17.4 12h2.2'
    + 'M6.6 6.6l1.6 1.6M15.8 15.8l1.6 1.6M17.4 6.6l-1.6 1.6M8.2 15.8l-1.6 1.6"/>'),
  sm_cargo_port: svg('<rect x="5" y="12.5" width="14" height="7.5"/><path d="M5 16.2h14"/>'
    + '<path d="M12 9.5V3.4M8.8 6l3.2-3.2L15.2 6"/>'),
  power: svg('<path d="M13.2 2.4 5.6 13.2h4.6l-1.4 8.4 7.6-10.8h-4.6z" '
    + 'fill="currentColor" stroke="none"/>'),
  lane: svg('<path d="M3.2 7.6h17.6M3.2 16.4h17.6"/>'
    + '<path d="M9.8 9.4l4.6 2.6-4.6 2.6z" fill="currentColor" stroke="none"/>'),
  remove: svg('<rect x="4.5" y="4.5" width="15" height="15"/><path d="M9 9l6 6M15 9l-6 6"/>'),
};

export function costText(cost) {
  if (!cost) return 'Free — the corridor was the cost.';
  return Object.keys(cost).sort().map((g) => `${cost[g]} ${commodityName(g)}`).join(' + ');
}

export function createBuildPalette(container, { onSelect, onUserSelect }) {
  const root = document.createElement('div');
  root.className = 'ao-card';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Command card — structures and tools');
  container.appendChild(root);

  const buttons = [];
  let selected = 0;

  PALETTE_ITEMS.forEach((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ao-cmd-key';
    b.dataset.itemId = item.id;
    b.title = `${item.name} — key ${i + 1}`;
    b.innerHTML = PALETTE_GLYPHS[item.id] || PALETTE_GLYPHS.remove;
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = SHORT_NAMES[item.id] || item.name;
    const hk = document.createElement('span');
    hk.className = 'hk';
    hk.textContent = String(i + 1);
    b.append(nm, hk);
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${item.name}, key ${i + 1}`);
    b.addEventListener('click', () => {
      select(i);
      if (onUserSelect) onUserSelect(item, i); // a clicked key arms BUILD in the shell
    });
    root.appendChild(b);
    buttons.push(b);
  });

  function select(index) {
    const n = PALETTE_ITEMS.length;
    selected = ((index % n) + n) % n;
    buttons.forEach((b, i) => {
      b.classList.toggle('active', i === selected);
      b.setAttribute('aria-pressed', String(i === selected));
    });
    if (onSelect) onSelect(PALETTE_ITEMS[selected], selected);
  }

  select(0);

  return {
    root,
    get selected() { return PALETTE_ITEMS[selected]; },
    get selectedIndex() { return selected; },
    select,
    cycle(dir) { select(selected + (dir > 0 ? 1 : -1)); },
    // "Visible" now means armed: the card never hides, it dims until BUILD engages.
    setVisible(visible) { root.classList.toggle('armed', !!visible); },
  };
}
