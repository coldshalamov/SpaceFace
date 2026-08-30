// Help / codex screen (ARCHITECTURE §5.6; design/specs/09).
// Tabbed reference: Controls, Loops, Ships, Commodities, Ores, Factions.
// The Controls tab reads the LIVE keybindings the player set in Settings → Controls
// (state.settings.controls.bindings), falling back to the input system's DEFAULT_BINDINGS for
// flight actions and the UI binding registry for fixed interface actions, so the help always
// reflects what the keys actually do. Dismissed via the Close button or ESC (screen manager handles
// ESC).

import { SHIPS } from '../../data/ships.js';
import { COMMODITIES } from '../../data/commodities.js';
import { ORES, ASTEROIDS } from '../../data/mining.js';
import { FACTION_META } from '../../data/factions.js';
import { createListControls } from '../listControls.js';
import { DEFAULTS } from '../../systems/input.js';
import { BINDINGS } from '../bindings.js';

const STYLE_ID = 'sf-help-menu-style';

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}
function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  ctx.bus.emit('ui:' + method, { id: arg });
}
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // Help-specific table/faction styles only. The shared menu fascia (plate, buttons,
  // headings, tabs, slot rows, form primitives) lives in styles/menu.css — previously a
  // copy of that whole block was pasted here and into every other menu screen.
  s.textContent = `
  .sf-help { color: var(--sf-paper); font-family: var(--sf-body-face); }
  .sf-help.sf-menu h1 {
    font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
    letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
  }
  /* No accent tick beside the title — hairline only. */
  .sf-help.sf-menu h1::before { display: none; }
  /* The crest is a space-between row in ui.css, which flung the tab's display heading to the
     modal's top-right while the HELP kicker sat top-left. Stack them, left-aligned. */
  .sf-help .sf-crest { flex-direction: column; align-items: flex-start; gap: 0; }
  /* Scroll affordance: while more content sits below the fold, the pane's bottom edge fades out.
     The class is toggled from scroll state, so it clears at the true bottom. */
  .sf-help .sf-settings-pane.sf-scroll-below {
    -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 26px), transparent);
    mask-image: linear-gradient(180deg, #000 calc(100% - 26px), transparent);
  }
  .sf-help-now {
    font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
    color: var(--sf-paper); letter-spacing: 0; text-transform: none; margin: 0 0 var(--sp-2);
  }
  .sf-help .sf-fig, .sf-codex-table .num {
    font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0;
  }
  .sf-codex-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sf-codex-table th {
    text-align: left; color: var(--sf-calm); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
    letter-spacing: var(--sf-track-micro); text-transform: uppercase; padding: var(--sp-2);
    border-bottom: 1px solid var(--sf-edge); position: sticky; top: 0; background: var(--sf-surface);
  }
  .sf-codex-table td { padding: var(--sp-1) var(--sp-2); color: var(--sf-paper); border-bottom: 1px solid var(--sf-edge); }
  .sf-codex-table tr:hover td { background: color-mix(in srgb, var(--sf-goal) 8%, transparent); }
  .sf-codex-table .num { text-align: right; }
  .sf-codex-table .is-foe { color: var(--sf-foe); }
  .sf-codex-table .is-goal { color: var(--sf-goal); }
  .sf-codex-table .is-you { color: var(--sf-you); }
  .sf-codex-table .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 2px; vertical-align: middle; }
  .sf-codex-faction { padding: var(--sp-3) 0; border-bottom: 1px solid var(--sf-edge); }
  .sf-codex-faction:last-child { border-bottom: none; }
  .sf-codex-faction .fname { font-size: 14px; color: var(--sf-paper); display: flex; align-items: center; gap: var(--sp-2); }
  .sf-codex-faction .fshort {
    font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px; color: var(--sf-calm);
    letter-spacing: var(--sf-track-micro);
  }
  .sf-codex-faction .fdesc { font-size: 13px; color: var(--sf-calm); margin-top: var(--sp-1); line-height: 1.5; }
  .sf-codex-faction .fdisp { font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px; margin-top: var(--sp-1); color: var(--sf-calm); }
  @media (forced-colors: active) {
    .sf-codex-table th, .sf-codex-table td { background: Canvas; color: CanvasText; border-color: CanvasText; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sf-help, .sf-help * { animation: none !important; transition: none !important; }
  }
  `;
  document.head.appendChild(s);
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu', 'sf-help');
  if (extraClass) rootEl.classList.add(extraClass);
  // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
  rootEl.dataset.stamp = 'MANUAL / CONTROLS';
  const crest = el('div', 'sf-crest');
  const h = document.createElement('h1'); h.textContent = title; crest.appendChild(h);
  crest.appendChild(el('div', 'sf-help-now', 'Controls'));
  rootEl.appendChild(crest);
  return rootEl;
}

export function legalityRole(legality) {
  if (legality === 'contraband') return 'foe';
  if (legality === 'restricted') return 'goal';
  return 'calm';
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// action -> default human-readable key. Sections group the grid.
// Each row: [label, actionId (or null for fixed/non-rebindable), documented default text].
// actionId matches the input system's binding() keys (forward/yawRight/strafeLeft/boost/fire/
// autoFire). UI-owned keys (dock/map/tech/…) are handled in src/ui/input.js and are NOT rebindable
// in this pass, so they carry null + a fixed label.
const SECTIONS = [
  ['Flight', [
    ['Throttle forward', 'forward', '↑↓ / W S'],
    ['Reverse + brake', 'reverse', '↓ / S'],
    ['Dedicated brake', 'brake', '0'],
    ['Steer right (yaw + bank)', 'yawRight', '←→ / A D'],
    ['Steer left (yaw + bank)', 'yawLeft', '←→ / A D'],
    ['Lateral thruster (left)', 'strafeLeft', 'Q / E'],
    ['Lateral thruster (right)', 'strafeRight', 'Q / E'],
    ['Boost (hold) / Dash (tap)', 'boost', 'Shift'],
    ['Fire weapons', 'fire', 'LMB'],
    ['Auto-target / draw-to-fly (toggle)', 'autoFire', 'G'],
    ['Countermeasure', 'countermeasure', 'X'],
    // The primary/alias pair remains live and rebindable. Directional line control is contextual.
    ['Massline tap: latch / cut', 'tether', 'Space / F'],
    ['Massline line control', null, 'Hold + ↑/↓/←→: reel/pay out/orbit; Shift pump'],
    ['Massline dedicated reel in', 'reelIn', '—'],
    ['Massline dedicated pay out', 'reelOut', '—'],
    // PQ-011: the anchor seed turns empty space into a swing anchor. Keyboard verb (rebindable);
    // no standard gamepad button remains unclaimed, matching the impulse-charge verbs' posture.
    ['Deploy anchor Mass Seed', 'deployMassSeed', '4 (toward aim; locks on arrival, then latch it)'],
    // PQ-012 continuous field tools (rebindable keyboard verbs, same posture as the seed/charge verbs).
    ['Deploy attractive Well', 'deployWell', '5 (at aim; pulls light bodies & shots — heavy ships shrug)'],
    ['Deploy Repulsor', 'deployRepulsor', '6 (drops at ship; shoves bodies outward)'],
    ['Toggle Clearing Cone', 'toggleClearingCone', '7 (forward gravitic snowplow; toggle on/off)'],
  ]],
  ['Interface (fixed keys)', [
    ['Aim weapons', null, 'Mouse'],
    ['Mine beam', null, 'RMB on rock'],
    ['Deep-core extraction', null, `${BINDINGS.drill.label} (target an asteroid)`],
    ['Claim body / open base', null, `${BINDINGS.claimBase.label} (near a colony/moon)`],
    ['Cycle target', null, 'Tab'],
    ['Dock', null, `${BINDINGS.dock.label} (when prompted)`],
    ['Pause', null, 'ESC / P'],
    ['Star-map', null, BINDINGS.starmap.label],
    ['Local system map', null, BINDINGS.localmap.label],
    ['Tech tree', null, BINDINGS.techTree.label],
    ['Mission log', null, BINDINGS.missionLog.label],
    ['Cargo hold', null, BINDINGS.cargo.label],
    ['Comms log', null, BINDINGS.comms.label],
    ['Codex', null, BINDINGS.codex.label],
    ['Help', null, 'F1 / H'],
    ['Quick save / load', null, 'F5 / F9'],
  ]],
  ['Gamepad (Xbox / PlayStation)', [
    ['Fly (yaw + throttle)', null, 'Left stick'],
    ['Aim weapons', null, 'Right stick'],
    ['Fire', null, 'RT / R2'],
    ['Mine beam', null, 'LT / L2'],
    ['Boost', null, 'RB / R1'],
    ['Brake / reverse', null, 'LB / L1'],
    ['Massline', null, 'A / X: Massline (dock/accept when prompted)'],
    ['Anchor Mass Seed', null, 'keyboard verb — rebind under Settings → Controls'],
    ['Countermeasure', null, 'R3'],
    ['Cycle target', null, 'X / □'],
    ['Open star-map', null, 'View / Select'],
    ['Open codex', null, 'Y / △'],
    ['Open mission log', null, 'Start / Options → Pause → Mission Log'],
    ['Pause', null, 'Start / Options'],
    ['Dock / activate', null, 'A / X (when prompted)'],
    ['Cancel / back', null, 'B / ○'],
  ]],
  ['Touch (phone / tablet)', [
    ['Fly (yaw + throttle)', null, 'Left stick'],
    ['Aim weapons', null, 'Right stick'],
    ['Fire', null, 'Fire button'],
    ['Mine beam', null, 'Mine button'],
    ['Boost', null, 'Boost button'],
    ['Dock / activate', null, 'Dock button (when prompted)'],
    ['Open local map', null, 'Map button'],
    ['Open mission log', null, 'Log button'],
    ['Open star-map', null, 'Star button'],
    ['Pause / Help route', null, 'Pause button -> Help / Controls'],
  ]],
];

// Normalize a single KeyboardEvent.code to a friendly label (matches humanizeCode in settings.js).
function codeLabel(code) {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] || code;
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft') return 'L-Shift';
  if (code === 'ShiftRight') return 'R-Shift';
  if (code === 'ControlLeft') return 'L-Ctrl';
  if (code === 'ControlRight') return 'R-Ctrl';
  if (code === 'AltLeft') return 'L-Alt';
  return code;
}

// Resolve the keys for a row: rebindable actions read the live binding (settings.controls.bindings,
// falling back to DEFAULT_BINDINGS exactly like input.js); null actions keep their documented label.
function keyLabel(binds, action, def) {
  if (!action) return def; // fixed / non-rebindable key
  // binds is settings.controls.bindings; prefer it, then the input defaults, then the doc text.
  // Explicit empty override (present key, empty list) is unbound — do not fall back to def/default.
  if (binds && Object.prototype.hasOwnProperty.call(binds, action)) {
    const codes = binds[action];
    const arr = Array.isArray(codes) ? codes : (codes ? [codes] : []);
    if (!arr.length) return '—';
    return arr.map(codeLabel).join(' / ');
  }
  let codes = DEFAULTS.BINDINGS[action];
  if (codes == null) return def;
  const arr = Array.isArray(codes) ? codes : [codes];
  if (!arr.length) return def;
  return arr.map(codeLabel).join(' / ');
}

const TABS = ['Controls', 'Loops', 'Ships', 'Commodities', 'Ores', 'Factions'];

const GAMEPLAY_LOOPS = [
  ['Dock and choose work', `${BINDINGS.dock.label} near a station -> Missions or Bar -> Accept + Track -> Undock`, 'Contracts become Mission Log entries and tracked nav markers; rewards fund ship upgrades and supplies.'],
  ['Trade for upgrades', 'Market -> buy cheap cargo -> Best Trades Set Nav -> sell high', 'Cargo space turns into credits; credits buy hulls, modules, repairs, and fuel.'],
  ['Mine into economy', 'Asteroid field -> mine ore -> sell at mining/refinery markets or manufacture', 'Mining rewards cargo space and mining slots; refined goods feed modules and hull production.'],
  ['Refit for a job', 'Shipyard for hull role -> Outfitting for modules -> Services before launch', 'Hull choice sets capacity and slots; modules decide whether the ship fights, hauls, mines, scans, or survives.'],
  ['Recover from losses', 'Services -> Hull Insurance -> launch; normal death returns to a station with cargo loss and 3s shields', 'Ironman is final: Run Over shows loss cause and sortie stats. Saves avoid death/respawn limbo, but Save/F5 before quitting.'],
  ['Track objectives', `Mission Log (${BINDINGS.missionLog.label}) -> Track Nav -> HUD marker / local map (${BINDINGS.localmap.label}) / star-map (${BINDINGS.starmap.label})`, 'The log is the active objective home when you forget what the current flight is for.'],
];

export const helpScreen = {
  id: 'help',
  _activeTab: 'Controls',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Help', 'sf-menu-wide');
    this._nowEl = rootEl.querySelector('.sf-help-now');

    // Tab bar
    const bar = el('div', 'sf-tabbar');
    this._tabBtns = {};
    TABS.forEach((t) => {
      const b = el('button', 'sf-tab', t);
      b.addEventListener('click', () => { this._activeTab = t; this._render(ctx); });
      bar.appendChild(b);
      this._tabBtns[t] = b;
    });
    rootEl.appendChild(bar);

    const body = el('div', 'sf-settings-pane sf-stage');
    body.style.overflowY = 'auto';
    body.style.flex = '1';
    body.style.minHeight = '0';
    body.addEventListener('scroll', () => this._syncScrollAffordance(), { passive: true });
    rootEl.appendChild(body);

    const foot = el('div', 'sf-foot sf-apron');
    const close = el('button', 'sf-btn'); close.textContent = 'Close'; close.style.width = 'auto';
    close.addEventListener('click', () => nav(ctx, 'popScreen'));
    foot.appendChild(close);
    rootEl.appendChild(foot);

    this._body = body;
    this._render(ctx);
  },

  _render(ctx) {
    if (!this._body) return;
    const active = document.activeElement;
    const hadSearchFocus = active && this._body.contains(active) && active.classList.contains('sf-lc__search');
    const selection = hadSearchFocus
      ? { start: active.selectionStart, end: active.selectionEnd }
      : null;
    this._body.innerHTML = '';
    if (this._nowEl) this._nowEl.textContent = this._activeTab;

    // Update tab active states
    if (this._tabBtns) {
      for (const t of TABS) {
        this._tabBtns[t].classList.toggle('active', t === this._activeTab);
      }
    }

    // UX-3: a search box on the reference-table tabs (Ships/Commodities/Ores). Controls + Factions
    // are short enough to not need it. The query persists in this._q across re-renders.
    if (this._activeTab === 'Ships' || this._activeTab === 'Commodities' || this._activeTab === 'Ores') {
      const ctrls = createListControls({
        search: true,
        placeholder: 'Search ' + this._activeTab.toLowerCase() + '…',
        onSearch: (q) => { this._q = q; this._render(ctx); },
      });
      // seed the input with the current query so it survives a re-render
      const input = ctrls.el.querySelector('.sf-lc__search');
      if (input && this._q) input.value = this._q;
      this._body.appendChild(ctrls.el);
      if (hadSearchFocus && input) {
        try {
          input.focus();
          const pos = selection || { start: input.value.length, end: input.value.length };
          input.setSelectionRange(pos.start, pos.end);
        } catch (e) {}
      }
    }

    switch (this._activeTab) {
      case 'Controls':  this._renderControls(ctx); break;
      case 'Loops':     this._renderLoops(); break;
      case 'Ships':     this._renderShips(); break;
      case 'Commodities': this._renderCommodities(); break;
      case 'Ores':      this._renderOres(); break;
      case 'Factions':  this._renderFactions(); break;
    }
    this._syncScrollAffordance();
  },

  /** Fade the pane's bottom edge only while content actually continues below the fold. */
  _syncScrollAffordance() {
    const body = this._body;
    if (!body) return;
    const moreBelow = body.scrollTop + body.clientHeight < body.scrollHeight - 4;
    body.classList.toggle('sf-scroll-below', moreBelow);
  },

  _renderControls(ctx) {
    // Read the LIVE keybindings (Settings → Controls persists here). Falls back to the input
    // system's DEFAULT_BINDINGS inside keyLabel, so help always shows what the keys actually do —
    // even on a fresh save with no rebinds, and correctly after any rebind.
    const binds = (ctx.state.settings && ctx.state.settings.controls && ctx.state.settings.controls.bindings) || {};
    SECTIONS.forEach(([heading, rows]) => {
      this._body.appendChild(el('h2', null, heading));
      const grid = el('div', 'sf-grid2');
      rows.forEach(([label, action, def]) => {
        grid.appendChild(el('div', 'k', keyLabel(binds, action, def)));
        grid.appendChild(el('div', 'v', label));
      });
      this._body.appendChild(grid);
    });
    this._body.appendChild(el('p', 'sf-muted', 'Flight keys can be rebound in Settings → Controls. UI keys are fixed (ARCHITECTURE §5.6).'));
  },

  _renderLoops() {
    this._body.appendChild(el('h2', null, 'Interaction Loops'));
    GAMEPLAY_LOOPS.forEach(([name, route, value]) => {
      const card = el('div', 'sf-slot');
      const main = el('div', 'sf-slot-main');
      main.appendChild(el('div', 'sf-slot-name', name));
      main.appendChild(el('div', 'sf-slot-sub', route));
      main.appendChild(el('div', 'sf-muted', value));
      card.appendChild(main);
      this._body.appendChild(card);
    });
  },

  _renderShips() {
    const q = (this._q || '').trim().toLowerCase();
    const sorted = SHIPS.slice()
      .filter((s) => !q || (s.name + ' ' + (s.role || '')).toLowerCase().includes(q))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    const table = document.createElement('table');
    table.className = 'sf-codex-table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Name', 'Role', 'Tier', 'Hull', 'Shield', 'Speed', 'Cargo', 'Price'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (['Tier', 'Hull', 'Shield', 'Speed', 'Cargo', 'Price'].includes(h)) th.className = 'num';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const s of sorted) {
      const tr = document.createElement('tr');
      const vals = [
        [s.name, ''],
        [s.role.replace(/_/g, ' '), ''],
        ['T' + s.tier, 'num sf-fig'],
        [s.hull, 'num sf-fig'],
        [s.shield, 'num sf-fig'],
        [s.handling != null ? s.handling.toFixed(1) : '-', 'num sf-fig'],
        [s.cargo, 'num sf-fig'],
        [fmtPrice(s.price), 'num sf-fig'],
      ];
      vals.forEach(([v, cls]) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (cls) td.className = cls;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this._body.appendChild(table);
  },

  _renderCommodities() {
    const q = (this._q || '').trim().toLowerCase();
    const sorted = COMMODITIES.slice()
      .filter((c) => !q || (c.name + ' ' + (c.category || '')).toLowerCase().includes(q))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const table = document.createElement('table');
    table.className = 'sf-codex-table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Name', 'Category', 'Base Price', 'Volume', 'Legality'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (['Base Price', 'Volume'].includes(h)) th.className = 'num';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const c of sorted) {
      const tr = document.createElement('tr');
      const legalRole = legalityRole(c.legality);
      const vals = [
        [c.name, ''],
        [c.category, ''],
        [c.basePrice + ' cr', 'num sf-fig'],
        [c.volPerU != null ? c.volPerU.toFixed(1) : '-', 'num sf-fig'],
        [c.legality, legalRole === 'calm' ? '' : 'is-' + legalRole],
      ];
      vals.forEach(([v, cls]) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (cls) td.className = cls;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this._body.appendChild(table);
  },

  _renderOres() {
    // Raw extraction ores only (category 'raw').
    // `o.baseValue` is now merged straight from COMMODITIES[].basePrice at module load
    // (src/data/mining.js), so this table quotes the same equilibrium price the market does. It used
    // to read a hand-maintained duplicate that had drifted — iron read 12 cr here and 28 cr at every
    // trade terminal in the game — which meant the codex actively taught new players wrong prices.
    const q = (this._q || '').trim().toLowerCase();
    const rawOres = ORES
      .filter((o) => o.category === 'raw')
      .filter((o) => !q || (o.name + ' ' + (o.id || '')).toLowerCase().includes(q))
      .sort((a, b) => a.tier - b.tier || a.baseValue - b.baseValue);
    this._body.appendChild(el('h2', null, 'Mineable Ores'));
    const table = document.createElement('table');
    table.className = 'sf-codex-table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Name', 'Tier', 'Value', 'Mass', 'Volume', 'Tags'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (['Tier', 'Value', 'Mass', 'Volume'].includes(h)) th.className = 'num';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const o of rawOres) {
      const tr = document.createElement('tr');
      const vals = [
        [o.name, ''],
        ['T' + o.tier, 'num sf-fig'],
        [o.baseValue + ' cr', 'num sf-fig'],
        [o.mass.toFixed(1), 'num sf-fig'],
        [o.vol.toFixed(1), 'num sf-fig'],
        [o.tags ? o.tags.join(', ') : '', ''],
      ];
      vals.forEach(([v, cls]) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (cls) td.className = cls;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this._body.appendChild(table);

    // Asteroid types
    this._body.appendChild(el('h2', null, 'Asteroid Types'));
    const tAst = document.createElement('table');
    tAst.className = 'sf-codex-table';
    const theadA = document.createElement('thead');
    const hrA = document.createElement('tr');
    ['Type', 'Tier Cap', 'Spawn Wt', 'Ore Drops'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (['Tier Cap', 'Spawn Wt'].includes(h)) th.className = 'num';
      hrA.appendChild(th);
    });
    theadA.appendChild(hrA);
    tAst.appendChild(theadA);
    const tbodyA = document.createElement('tbody');
    for (const a of ASTEROIDS) {
      const tr = document.createElement('tr');
      const oreDrops = Object.entries(a.oreTable).map(([id, w]) => {
        const ore = ORES.find((o) => o.id === id);
        return (ore ? ore.name : id) + ' ' + Math.round(w * 100) + '%';
      }).join(', ');
      const vals = [
        [a.id.replace('ast_', '').replace(/_/g, ' '), ''],
        ['T' + a.tierCap, 'num sf-fig'],
        [a.spawnWeight, 'num sf-fig'],
        [oreDrops, ''],
      ];
      vals.forEach(([v, cls]) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (cls) td.className = cls;
        tr.appendChild(td);
      });
      tbodyA.appendChild(tr);
    }
    tAst.appendChild(tbodyA);
    this._body.appendChild(tAst);
  },

  _renderFactions() {
    for (const f of FACTION_META) {
      const card = el('div', 'sf-codex-faction');
      const nameRow = el('div', 'fname');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = f.color;
      nameRow.appendChild(swatch);
      nameRow.appendChild(document.createTextNode(f.name));
      const shortSpan = el('span', 'fshort', ' (' + f.short + ')');
      nameRow.appendChild(shortSpan);
      card.appendChild(nameRow);

      if (f.personality) {
        const disp = el('div', 'fdisp');
        disp.textContent = f.personality.toUpperCase();
        card.appendChild(disp);
      }

      if (f.controls && f.controls.length) {
        const desc = el('div', 'fdesc');
        desc.textContent = 'Controls: ' + f.controls.join(', ');
        card.appendChild(desc);
      }

      if (f.startingRep != null) {
        const rep = el('div', 'fdesc');
        rep.textContent = 'Starting rep: ' + (f.startingRep > 0 ? '+' : '') + f.startingRep;
        card.appendChild(rep);
      }

      this._body.appendChild(card);
    }
  },

  onShow(ctx) { this._render(ctx); },
  onHide() {},
  refresh(ctx) { this._render(ctx); },
};

function fmtPrice(v) {
  v = Math.round(v || 0);
  if (v === 0) return 'Free';
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}
