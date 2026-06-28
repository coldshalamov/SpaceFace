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

const STYLE_ID = 'sf-menu-style';

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
  s.textContent = `
  .sf-menu { display:flex; flex-direction:column; gap:14px; padding:26px 30px; min-width:360px;
    max-width:min(92vw,920px); max-height:88vh; overflow:auto; pointer-events:auto; }
  .sf-menu-narrow { min-width:300px; width:340px; }
  .sf-menu-wide { width:min(92vw,820px); }
  .sf-menu h1 { margin:0 0 4px; font-family:var(--mono); letter-spacing:.32em; font-size:20px;
    color:var(--accent); text-shadow:0 0 18px rgba(57,208,255,.45); text-transform:uppercase; text-align:center; }
  .sf-menu h2 { margin:14px 0 4px; font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-dim); }
  .sf-menu .sf-col { display:flex; flex-direction:column; gap:8px; }
  .sf-menu button.sf-btn { width:100%; text-align:center; padding:11px 14px; font-size:14px; letter-spacing:.06em; }
  .sf-menu .sf-row { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .sf-menu .sf-row > label { color:var(--ink-dim); font-size:13px; flex:0 0 38%; }
  .sf-menu .sf-row > .sf-ctl { flex:1; display:flex; align-items:center; gap:10px; justify-content:flex-end; }
  .sf-menu input[type=range] { flex:1; accent-color:var(--accent); }
  .sf-menu select, .sf-menu input[type=text], .sf-menu input[type=number] {
    font-family:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--panel-edge);
    border-radius:5px; padding:6px 8px; pointer-events:auto; }
  .sf-menu .sf-val { font-family:var(--mono); color:var(--accent); min-width:46px; text-align:right; }
  .sf-tabbar { display:flex; gap:6px; border-bottom:1px solid var(--panel-edge); padding-bottom:8px; flex-wrap:wrap; }
  .sf-tabbar button.sf-tab.active { border-color:var(--accent); color:#fff; box-shadow:0 0 10px rgba(57,208,255,.35); }
  .sf-codex-table { width:100%; border-collapse:collapse; font-size:12px; }
  .sf-codex-table th { text-align:left; color:var(--ink-dim); font-family:var(--mono,monospace); font-size:11px;
    letter-spacing:.08em; text-transform:uppercase; padding:6px 8px; border-bottom:1px solid var(--panel-edge);
    position:sticky; top:0; background:var(--panel,#0a1628); }
  .sf-codex-table td { padding:5px 8px; color:var(--ink,#dce8f5); border-bottom:1px solid rgba(100,130,180,.12); }
  .sf-codex-table tr:hover td { background:rgba(57,208,255,.06); }
  .sf-codex-table .num { text-align:right; font-family:var(--mono,monospace); }
  .sf-codex-table .swatch { display:inline-block; width:14px; height:14px; border-radius:3px; vertical-align:middle; }
  .sf-codex-faction { padding:12px 0; border-bottom:1px solid rgba(100,130,180,.12); }
  .sf-codex-faction:last-child { border-bottom:none; }
  .sf-codex-faction .fname { font-size:14px; color:var(--ink,#dce8f5); display:flex; align-items:center; gap:8px; }
  .sf-codex-faction .fshort { font-family:var(--mono,monospace); font-size:11px; color:var(--ink-dim); letter-spacing:.06em; }
  .sf-codex-faction .fdesc { font-size:12px; color:var(--ink-dim); margin-top:4px; line-height:1.5; }
  .sf-codex-faction .fdisp { font-family:var(--mono,monospace); font-size:11px; margin-top:3px; }
  .sf-menu .sf-grid2 { display:grid; grid-template-columns:auto 1fr; gap:6px 18px; align-items:center; font-size:13px; }
  .sf-menu .sf-grid2 .k { color:var(--ink-dim); font-family:var(--mono); letter-spacing:.05em; }
  .sf-menu .sf-grid2 .v { color:var(--ink); }
  .sf-menu .sf-foot { display:flex; gap:10px; justify-content:flex-end; margin-top:8px; }
  .sf-menu .sf-muted { color:var(--ink-mute); font-size:12px; }
  .sf-slot { display:flex; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--panel-edge);
    border-radius:6px; background:var(--panel); }
  .sf-slot.sel { border-color:var(--accent); box-shadow:0 0 10px rgba(57,208,255,.3); }
  .sf-slot .sf-slot-main { flex:1; min-width:0; }
  .sf-slot .sf-slot-name { font-size:14px; color:var(--ink); }
  .sf-slot .sf-slot-sub { font-size:11px; color:var(--ink-mute); font-family:var(--mono); }
  .sf-slot.empty .sf-slot-name { color:var(--ink-mute); font-style:italic; }
  .sf-title-logo { font-family:var(--mono); letter-spacing:.5em; font-size:46px; color:var(--accent);
    text-shadow:0 0 40px rgba(57,208,255,.5); text-align:center; margin:0; }
  .sf-title-tag { text-align:center; color:var(--ink-dim); letter-spacing:.28em; font-size:12px; margin-bottom:18px; }
  `;
  document.head.appendChild(s);
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  const h = document.createElement('h1'); h.textContent = title; rootEl.appendChild(h);
  return rootEl;
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
    ['Throttle reverse', 'reverse', '↑↓ / W S'],
    ['Steer right (yaw + bank)', 'yawRight', '←→ / A D'],
    ['Steer left (yaw + bank)', 'yawLeft', '←→ / A D'],
    ['Lateral thruster (left)', 'strafeLeft', 'Q / E'],
    ['Lateral thruster (right)', 'strafeRight', 'Q / E'],
    ['Boost (hold) / Dash (tap)', 'boost', 'Shift'],
    ['Fire weapons', 'fire', 'LMB / Space'],
    ['Auto-fire toggle', 'autoFire', 'F'],
  ]],
  ['Interface (fixed keys)', [
    ['Aim weapons', null, 'Mouse'],
    ['Mine beam', null, 'RMB on rock'],
    ['Deep-drill (ant-farm)', null, 'B (target an asteroid)'],
    ['Claim body / open base', null, 'C (near a colony/moon)'],
    ['Cycle target', null, 'Tab'],
    ['Dock', null, `${BINDINGS.dock.label} (when prompted)`],
    ['Pause', null, 'ESC / P'],
    ['Star-map', null, BINDINGS.starmap.label],
    ['Local system map', null, BINDINGS.localmap.label],
    ['Tech tree', null, 'T'],
    ['Mission log', null, 'J'],
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
    ['Cycle target', null, 'X / □'],
    ['Open star-map', null, 'View / Select'],
    ['Open codex', null, 'Y / △'],
    ['Open mission log', null, 'Pause → Mission Log'],
    ['Pause', null, 'Start / Options'],
    ['Dock / activate', null, 'A / X (when prompted)'],
    ['Cancel / back', null, 'B / ○'],
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
  let codes = binds && binds[action];
  if (codes == null) codes = DEFAULTS.BINDINGS[action];
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
  ['Track objectives', `Mission Log (J) -> Track Nav -> HUD marker / local map (${BINDINGS.localmap.label}) / star-map (${BINDINGS.starmap.label})`, 'The log is the active objective home when you forget what the current flight is for.'],
];

export const helpScreen = {
  id: 'help',
  _activeTab: 'Controls',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Help', 'sf-menu-wide');

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

    const body = el('div', 'sf-col');
    body.style.overflowY = 'auto';
    body.style.flex = '1';
    body.style.minHeight = '0';
    rootEl.appendChild(body);

    const foot = el('div', 'sf-foot');
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
        ['T' + s.tier, 'num'],
        [s.hull, 'num'],
        [s.shield, 'num'],
        [s.handling != null ? s.handling.toFixed(1) : '-', 'num'],
        [s.cargo, 'num'],
        [fmtPrice(s.price), 'num'],
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
      const legalColor = c.legality === 'contraband' ? '#ff5470' : c.legality === 'restricted' ? '#ffb347' : '';
      const vals = [
        [c.name, ''],
        [c.category, ''],
        [c.basePrice + ' cr', 'num'],
        [c.volPerU != null ? c.volPerU.toFixed(1) : '-', 'num'],
        [c.legality, ''],
      ];
      vals.forEach(([v, cls], i) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (cls) td.className = cls;
        if (i === 4 && legalColor) td.style.color = legalColor;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this._body.appendChild(table);
  },

  _renderOres() {
    // Raw extraction ores only (category 'raw')
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
        ['T' + o.tier, 'num'],
        [o.baseValue + ' cr', 'num'],
        [o.mass.toFixed(1), 'num'],
        [o.vol.toFixed(1), 'num'],
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
        ['T' + a.tierCap, 'num'],
        [a.spawnWeight, 'num'],
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
        disp.style.color = f.color;
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
