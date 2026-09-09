// Help / codex screen (ARCHITECTURE §5.6; design/specs/09).
// Tabbed reference: Controls, Loops, Ships, Commodities, Ores, Factions.
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, help): the controls as hairline
// rows of action and key; the current profile named; nothing else. Built on the frontend kit
// (styles/kit.css, src/ui/kit/); this file owns no CSS. The six tab words hang from the left; the
// chosen tab's reading fills the stage — Controls as static rows (action · key), Loops as sentences,
// Ships / Commodities / Ores as the dense register, Factions as rows.
// The Controls tab reads the LIVE keybindings the player set in Settings → Controls
// (state.settings.controls.bindings), falling back to the input system's DEFAULT_BINDINGS for
// flight actions and the UI binding registry for fixed interface actions, so the help always
// reflects what the keys actually do. Dismissed via the Close word or ESC (screen manager handles
// ESC). `.sf-help-now`, `.sf-tab` and `.sf-lc__search` stay on their elements as inert hooks.

import { SHIPS } from '../../data/ships.js';
import { COMMODITIES } from '../../data/commodities.js';
import { ORES, ASTEROIDS } from '../../data/mining.js';
import { FACTION_META } from '../../data/factions.js';
import { createListControls } from '../listControls.js';
import { formatBindingCode, resolveActionLabel, resolveActionCodes } from '../../systems/input.js';
import { BINDINGS } from '../bindings.js';
import { icon, factionIcon } from '../station/icons.js';
import { el, words, settle, cue } from '../kit/index.js';

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

export function legalityRole(legality) {
  if (legality === 'contraband') return 'foe';
  if (legality === 'restricted') return 'goal';
  return 'calm';
}

// The control profile the Controls tab describes (settings.gameplay.controlScheme; the Settings
// screen offers the same three). Named in the title's second line.
const SCHEME_NAMES = { pilot: 'Pilot', 'helm-assist': 'Helm Assist', classic: 'Classic Throttle' };
function profileName(state) {
  const scheme = state && state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  return (SCHEME_NAMES[scheme] || SCHEME_NAMES.pilot) + ' profile';
}

// action -> default human-readable key. Sections group the rows.
// Each row: [label, actionId (or null for fixed/non-rebindable), documented default text].
// actionId matches the input system's binding() keys. UI-owned keys (dock/map/tech/…) are
// handled in src/ui/input.js and are NOT rebindable, so they carry null + a registry label.
function liveGlyph(state, action) {
  return formatBindingCode(resolveActionCodes(state, action)[0]);
}

function livePair(state, leftAction, rightAction) {
  const left = liveGlyph(state, leftAction);
  const right = liveGlyph(state, rightAction);
  if (!left) return right || '';
  if (!right) return left;
  return (left.length <= 1 && right.length <= 1) ? `${left}${right}` : `${left}/${right}`;
}

function liveBoostLabel(state) {
  const codes = resolveActionCodes(state, 'boost');
  if (!codes.length) return '';
  return codes.every((c) => String(c).startsWith('Shift'))
    ? 'Shift'
    : resolveActionLabel(state, 'boost');
}

function controlSections(state) {
  const holdLine = [liveGlyph(state, 'forward'), liveGlyph(state, 'reverse'), livePair(state, 'yawLeft', 'yawRight')]
    .filter(Boolean)
    .join('/');
  const pump = liveBoostLabel(state);
  const directional = [
    holdLine && `Hold + ${holdLine}: reel/pay out/orbit`,
    pump && `${pump} pump`,
  ].filter(Boolean).join('; ');
  return [
    ['Flight', [
      ['Throttle forward', 'forward'],
      ['Reverse + brake', 'reverse'],
      ['Dedicated brake', 'brake'],
      ['Steer right (yaw + bank)', 'yawRight'],
      ['Steer left (yaw + bank)', 'yawLeft'],
      ['Lateral thruster (left)', 'strafeLeft'],
      ['Lateral thruster (right)', 'strafeRight'],
      ['Boost (hold) / Dash (tap)', 'boost'],
      ['Fire weapons', 'fire'],
      ['Auto-target / draw-to-fly (toggle)', 'autoFire'],
      ['Countermeasure', 'countermeasure'],
      ['Massline tap: latch / cut', 'tether'],
      ['Massline directional control', null, directional || '—'],
      ['Massline dedicated reel in', 'reelIn'],
      ['Massline dedicated pay out', 'reelOut'],
      ['Deploy anchor Mass Seed (toward aim; locks on arrival, then latch it)', 'deployMassSeed'],
      ['Deploy attractive Well (at aim; pulls light bodies & shots — heavy ships shrug)', 'deployWell'],
      ['Deploy Repulsor (drops at ship; shoves bodies outward)', 'deployRepulsor'],
      ['Toggle Clearing Cone (forward gravitic snowplow; toggle on/off)', 'toggleClearingCone'],
      ['Open a scoop sheet and harvest by grazing a planet band', 'toggleSkimCollector'],
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
}

function keyLabel(state, action, def) {
  if (action) return resolveActionLabel(state, action, { sep: ' / ' }) || '—';
  return def || '—';
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

/** A column-header label above a group (`k-caps` is the kit's one tracked-caps register). */
function caps(text) {
  return el('p', 'k-caps', text);
}

/** A static hairline row: the name (and an optional sub line) at rest, the number at emphasis. */
function staticRow(name, num, sub) {
  const row = el('li', 'k-row k-row--static');
  const left = el('div');
  left.appendChild(el('span', 'k-62', name));
  if (sub) left.appendChild(el('div', 'k-row__sub', sub));
  row.appendChild(left);
  row.appendChild(el('span', 'k-row__num', num));
  return row;
}

/**
 * The dense register as `k-table` markup. `head`: [{ label, num }], `body`: arrays of cell
 * [text, extraClass]. `sortedIndex` names the column the fixed sort order follows (aria-sort).
 * Reference rows are read, not picked, so this is plain markup rather than the kit's selectable grid.
 */
function register(head, body, { sortedIndex = 0, ariaLabel = 'Register' } = {}) {
  const wrap = el('div', 'k-table-wrap');
  const table = el('table', 'k-table');
  table.setAttribute('aria-label', ariaLabel);
  const thead = el('thead');
  const hr = el('tr');
  head.forEach((column, index) => {
    const th = el('th', 'k-caps' + (column.num ? ' k-num' : ''), column.label);
    th.scope = 'col';
    if (index === sortedIndex) th.setAttribute('aria-sort', 'ascending');
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const cells of body) {
    const tr = el('tr');
    cells.forEach(([text, extra], index) => {
      const cls = [head[index].num ? 'k-num' : index === 0 ? 'k-name' : '', extra || ''].filter(Boolean).join(' ');
      tr.appendChild(el('td', cls, text));
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** The power's heraldry at row size (a generic mark when the icon set does not know the id). */
function crestHtml(factionId) {
  const svg = factionIcon(factionId, 24) || icon('factions', 24);
  return svg.replace(/class="sx-ico[^"]*"/, 'class="k-crest k-crest--row sx-ico"');
}

export const helpScreen = {
  id: 'help',
  _activeTab: 'Controls',

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-help');
    rootEl.classList.add('k-screen');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', 'Help');

    // Title: "Help" and the control profile the Controls tab describes.
    const title = el('header', 'k-title');
    title.appendChild(el('h1', 'k-display k-t-title', 'Help'));
    const now = el('p', 'k-t-emph k-62 sf-help-now', profileName(ctx.state));
    title.appendChild(now);
    rootEl.appendChild(title);
    this._nowEl = now;

    // The six tab words hang from the left.
    const hang = el('nav', 'k-hang');
    const tabs = words(TABS.map((t) => ({ action: t, label: t, current: t === this._activeTab })), {
      ariaLabel: 'Help sections',
      onPick: (t) => { this._activeTab = t; this._render(ctx); },
    });
    tabs.setAttribute('role', 'tablist');
    this._tabBtns = {};
    for (const b of tabs.querySelectorAll('.k-word')) {
      b.classList.add('sf-tab');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(b.dataset.action === this._activeTab));
      this._tabBtns[b.dataset.action] = b;
    }
    hang.appendChild(tabs);
    rootEl.appendChild(hang);

    // The stage: the chosen tab's reading; rebuilt by _render.
    const body = el('section', 'k-stage k-stage--scroll');
    body.setAttribute('aria-live', 'polite');
    rootEl.appendChild(body);

    // Foot: Close.
    const foot = el('footer', 'k-foot');
    const close = el('button', 'k-word k-word--emph', 'Close');
    close.type = 'button';
    close.dataset.action = 'close';
    close.addEventListener('click', () => { cue('confirm'); nav(ctx, 'popScreen'); });
    foot.appendChild(close);
    rootEl.appendChild(foot);

    this._body = body;
    this._regions = { title, hang, stage: body, foot };
    this._render(ctx);
    rootEl.dataset.kReady = '1';
  },

  _render(ctx) {
    if (!this._body) return;
    const active = document.activeElement;
    const hadSearchFocus = active && this._body.contains(active) && active.classList.contains('sf-lc__search');
    const selection = hadSearchFocus
      ? { start: active.selectionStart, end: active.selectionEnd }
      : null;
    this._body.innerHTML = '';
    if (this._nowEl) this._nowEl.textContent = profileName(ctx.state);

    // Update tab active states
    if (this._tabBtns) {
      for (const t of TABS) {
        const b = this._tabBtns[t];
        if (!b) continue;
        const on = t === this._activeTab;
        b.setAttribute('aria-selected', String(on));
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
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
      if (input) {
        input.classList.add('k-input');
        if (this._q) input.value = this._q;
      }
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
    const state = ctx.state;
    controlSections(state).forEach(([heading, rows]) => {
      this._body.appendChild(caps(heading));
      const list = el('ul', 'k-rows');
      list.style.setProperty('--k-row-cols', 'minmax(0, 1fr) auto');
      list.setAttribute('aria-label', heading + ' controls');
      rows.forEach(([label, action, def]) => {
        list.appendChild(staticRow(label, keyLabel(state, action, def)));
      });
      this._body.appendChild(list);
    });
    this._body.appendChild(el('p', 'k-t-fine k-38', 'Flight keys can be rebound in Settings → Controls. UI keys are fixed (ARCHITECTURE §5.6).'));
  },

  _renderLoops() {
    GAMEPLAY_LOOPS.forEach(([name, route, value]) => {
      this._body.appendChild(caps(name));
      this._body.appendChild(el('p', 'k-sentence k-sentence--emph', route));
      this._body.appendChild(el('p', 'k-sentence', value));
    });
  },

  _renderShips() {
    const q = (this._q || '').trim().toLowerCase();
    const sorted = SHIPS.slice()
      .filter((s) => !q || (s.name + ' ' + (s.role || '')).toLowerCase().includes(q))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    const head = [
      { label: 'Name' }, { label: 'Role' }, { label: 'Tier', num: true }, { label: 'Hull', num: true },
      { label: 'Shield', num: true }, { label: 'Speed', num: true }, { label: 'Cargo', num: true }, { label: 'Price', num: true },
    ];
    const body = sorted.map((s) => [
      [s.name],
      [s.role.replace(/_/g, ' ')],
      ['T' + s.tier],
      [s.hull],
      [s.shield],
      [s.handling != null ? s.handling.toFixed(1) : '-'],
      [s.cargo],
      [fmtPrice(s.price)],
    ]);
    this._body.appendChild(register(head, body, { sortedIndex: 2, ariaLabel: 'Ships' }));
    if (!body.length) this._body.appendChild(el('p', 'k-empty', 'No ship matches that search.'));
  },

  _renderCommodities() {
    const q = (this._q || '').trim().toLowerCase();
    const sorted = COMMODITIES.slice()
      .filter((c) => !q || (c.name + ' ' + (c.category || '')).toLowerCase().includes(q))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const head = [
      { label: 'Name' }, { label: 'Category' }, { label: 'Base Price', num: true }, { label: 'Volume', num: true }, { label: 'Legality' },
    ];
    const body = sorted.map((c) => {
      // The word carries the state; colour only says "against you" (contraband reads in the bad red).
      const legalRole = legalityRole(c.legality);
      const legalCls = legalRole === 'calm' ? '' : 'is-' + legalRole + (legalRole === 'foe' ? ' k-bad' : '');
      return [
        [c.name],
        [c.category],
        [c.basePrice + ' cr'],
        [c.volPerU != null ? c.volPerU.toFixed(1) : '-'],
        [c.legality, legalCls],
      ];
    });
    this._body.appendChild(register(head, body, { sortedIndex: 1, ariaLabel: 'Commodities' }));
    if (!body.length) this._body.appendChild(el('p', 'k-empty', 'No commodity matches that search.'));
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
    this._body.appendChild(caps('Mineable ores'));
    const oreHead = [
      { label: 'Name' }, { label: 'Tier', num: true }, { label: 'Value', num: true },
      { label: 'Mass', num: true }, { label: 'Volume', num: true }, { label: 'Tags' },
    ];
    const oreBody = rawOres.map((o) => [
      [o.name],
      ['T' + o.tier],
      [o.baseValue + ' cr'],
      [o.mass.toFixed(1)],
      [o.vol.toFixed(1)],
      [o.tags ? o.tags.join(', ') : ''],
    ]);
    this._body.appendChild(register(oreHead, oreBody, { sortedIndex: 1, ariaLabel: 'Mineable ores' }));
    if (!oreBody.length) this._body.appendChild(el('p', 'k-empty', 'No ore matches that search.'));

    // Asteroid types
    this._body.appendChild(caps('Asteroid types'));
    const astHead = [
      { label: 'Type' }, { label: 'Tier Cap', num: true }, { label: 'Spawn Wt', num: true }, { label: 'Ore Drops' },
    ];
    const astBody = ASTEROIDS.map((a) => {
      const oreDrops = Object.entries(a.oreTable).map(([id, w]) => {
        const ore = ORES.find((o) => o.id === id);
        return (ore ? ore.name : id) + ' ' + Math.round(w * 100) + '%';
      }).join(', ');
      return [
        [a.id.replace('ast_', '').replace(/_/g, ' ')],
        ['T' + a.tierCap],
        [a.spawnWeight],
        [oreDrops],
      ];
    });
    this._body.appendChild(register(astHead, astBody, { sortedIndex: 0, ariaLabel: 'Asteroid types' }));
  },

  _renderFactions() {
    const list = el('ul', 'k-rows');
    list.style.setProperty('--k-row-cols', 'auto minmax(0, 1fr) auto');
    list.setAttribute('aria-label', 'Factions');
    for (const f of FACTION_META) {
      const row = el('li', 'k-row k-row--static');
      const crest = el('span');
      crest.setAttribute('aria-hidden', 'true');
      crest.innerHTML = crestHtml(f.id);
      row.appendChild(crest);
      const main = el('div');
      main.appendChild(el('span', 'k-row__name', f.name + ' (' + f.short + ')'));
      const sub = [
        f.controls && f.controls.length ? 'Controls: ' + f.controls.join(', ') : '',
        f.startingRep != null ? 'Starting rep: ' + (f.startingRep > 0 ? '+' : '') + f.startingRep : '',
      ].filter(Boolean).join(' · ');
      if (sub) main.appendChild(el('div', 'k-row__sub', sub));
      row.appendChild(main);
      row.appendChild(el('span', 'k-row__num k-62', f.personality ? f.personality.toLowerCase() : ''));
      list.appendChild(row);
    }
    this._body.appendChild(list);
  },

  onShow(ctx) {
    this._render(ctx);
    const r = this._regions;
    if (r && typeof requestAnimationFrame === 'function') {
      try {
        cue('open');
        settle(r.title, { from: 'top', state: 'help:open' });
        settle(r.hang, { from: 'left', state: 'help:open' });
        settle(r.stage, { from: 'right', state: 'help:open' });
        settle(r.foot, { from: 'bottom', state: 'help:open' });
      } catch (e) { /* motion is cosmetic */ }
    }
  },
  onHide() { try { cue('close'); } catch (e) {} },
  refresh(ctx) { this._render(ctx); },
};

function fmtPrice(v) {
  v = Math.round(v || 0);
  if (v === 0) return 'Free';
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}
