// Help / codex screen (ARCHITECTURE §5.6; design/specs/09; design/frontend/ORRERY.md §6 Meta).
//
// ORRERY: six instruments behind one tab ladder, no table anywhere.
// - CONTROLS is the Controls Rig (src/ui/orrery/helpRig.js): the player's own hull in its plan render on a
//   lit berth, its verb stations round it on leaders to the parts they drive, each binding a lit key
//   glyph. "Press anything": while Help is open every key, mouse button and pad button is echoed on the
//   rig -- the glyph flares, a pulse runs the leader into the ship and the part lights -- and on the
//   ladder of every key beside it. Nothing is dispatched: Help is a modal, the flight input layer is
//   neutralised under it, and the echo only reads raw events.
// - LOOPS turns an orrery of the six core loops; SHIPS stands the chosen hull in a dial of arc gauges;
//   COMMODITIES lays every good on one price scale you scrub; ORES opens an asteroid type into its ore
//   mix; FACTIONS puts the fourteen crests on an orbit (src/ui/orrery/helpInstruments.js, crestOrbit.js).
// The Controls tab reads the LIVE keybindings the player set in Settings → Controls
// (state.settings.controls.bindings), falling back to the input system's DEFAULT_BINDINGS for flight
// actions and the UI binding registry for fixed interface actions, so the help always reflects what
// the keys actually do. Dismissed via the Close word or ESC (screen manager handles ESC).
// `.sf-help-now`, `.sf-tab` and `.sf-lc__search` stay on their elements as hooks.

import { SHIPS } from '../../data/ships.js';
import { COMMODITIES } from '../../data/commodities.js';
import { ORES, ASTEROIDS } from '../../data/mining.js';
import { FACTION_META } from '../../data/factions.js';
import { createListControls } from '../listControls.js';
import { formatBindingCode, resolveActionLabel, resolveActionCodes } from '../../systems/input.js';
import { resolveGamepadBindings, GAMEPAD_DEFAULT_BINDINGS, GAMEPAD_BUTTON_LABELS, gamepadButtonNames, gamepadButtonLabels } from '../../systems/gamepad.js';
import { gamepadGlyphForAction } from '../bindings.js';
import { BINDINGS } from '../bindings.js';
import { el, words, settle, cue } from '../kit/index.js';
import { decorateEntityNode } from '../entityResolver.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectHelpLayouts } from '../orrery/helpLayouts.js';
import { createControlsRig, createInputEcho } from '../orrery/helpRig.js';
import { createLoopOrrery, createHullDial, createPriceDial, createOreMix, keyGlyph } from '../orrery/helpInstruments.js';
import { commodityGlyphHtml } from '../views/commodityGlyphs.js';
import { createCrestOrbit } from '../orrery/crestOrbit.js';
import { syncScrollExtent } from '../orrery/scrollExtent.js';
import { decrypt } from '../orrery/text.js';
import { reducedMotion } from '../orrery/motion.js';

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
/** The title's second line on Controls: the control scheme the rig describes. */
function schemeLine(state) {
  const scheme = state && state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  return 'Control scheme · ' + (SCHEME_NAMES[scheme] || SCHEME_NAMES.pilot);
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

// INF-059: the gamepad section printed stock button names as literals, so a pad remap
// (Settings → Controls, PQ-164.01) re-labeled the dock chip and the pad itself while the game's
// own instructions kept teaching the old buttons. The section is now a projection of the resolved
// pad map. The sheet is a PROJECTION of the resolved map on both paths: a stock map (or none)
// renders the dual Xbox/PlayStation register, a remapped map names each action's current button,
// and an action with no button says so honestly instead of printing a phantom one.
export const GAMEPAD_ROW_ACTIONS = Object.freeze([
  ['Fire', 'fire', (g) => g],
  ['Mine beam', 'mine', (g) => g],
  ['Boost', 'boost', (g) => g],
  ['Brake / reverse', 'brake', (g) => g],
  ['Shove (repulsor)', 'deployRepulsor', (g) => g],
  ['Accept / confirm', 'accept', (g) => g],
  ['Massline', 'massline', (g) => g],
  ['Countermeasure', 'countermeasure', (g) => g],
  ['Drop bomb', 'dropBomb', (g) => g],
  ['Cycle bomb-bay payload', 'cycleBomb', (g) => g],
  ['Cycle target', 'cycleTarget', (g) => g],
  ['Open star-map', 'map', (g) => g],
  ['Open codex', 'codex', (g) => `${g} (or Pause → Codex)`],
  ['Pause', 'pause', (g) => g],
  ['Dock / activate', 'dock', (g) => `${g} (when prompted)`],
  ['Cancel / back', 'cancel', (g) => g],
  ['Station tab: previous', 'tabPrev', (g) => g],
  ['Station tab: next', 'tabNext', (g) => g],
  ['Travel burn', 'travelBurn', (g) => g],
  ['Auto-target', 'autoTarget', (g) => g],
  ['Detonate charge', 'chargeDetonate', (g) => g],
  ['Hull burst', 'hullBurst', (g) => g],
]);

// Rows with no pad action: analogue sticks, and two verbs a pad does not own. Keyed by LABEL, not
// by index — an index set silently starts freezing the wrong row the first time one is inserted.
const GAMEPAD_STATIC_LABELS = Object.freeze(new Set([
  'Fly (yaw + throttle)', 'Aim weapons', 'Anchor Mass Seed', 'Open mission log',
]));

// Every entry of GAMEPAD_DEFAULT_BINDINGS gets a row, so the row list IS the sheet's order.
// Gaps between action rows are the static ones above; see gamepadControlRows.
const GAMEPAD_ROW_ORDER = Object.freeze([
  'Fly (yaw + throttle)', 'Aim weapons',
  'Fire', 'Mine beam', 'Boost', 'Brake / reverse', 'Shove (repulsor)', 'Accept / confirm',
  'Massline', 'Anchor Mass Seed', 'Countermeasure', 'Drop bomb', 'Cycle bomb-bay payload',
  'Cycle target', 'Open star-map', 'Open codex', 'Open mission log', 'Pause', 'Dock / activate',
  'Cancel / back', 'Station tab: previous', 'Station tab: next', 'Travel burn', 'Auto-target',
  'Detonate charge', 'Hull burst',
]);

// The static rows carry no action, so their text is authored here. Everything else is derived.
const GAMEPAD_STATIC_TEXT = Object.freeze({
  'Fly (yaw + throttle)': 'Left stick',
  'Aim weapons': 'Right stick',
  'Anchor Mass Seed': 'keyboard verb — rebind under Settings → Controls',
  'Open mission log': 'Start / Options → Pause → Mission Log',
});

// Two different reasons a row can name no button. A player who cleared a binding chose that; a
// verb the game ships with no default button at all is the game's gap, and saying otherwise
// blames the player's profile for the game's design.
const UNBOUND_BY_PLAYER = 'unbound — Settings → Controls';
const UNBOUND_BY_DESIGN = 'no default button — bind it under Settings → Controls';

const GAMEPAD_ROW_BY_LABEL = new Map(GAMEPAD_ROW_ACTIONS.map((row) => [row[0], row]));


/**
 * The Gamepad section: one projection, one code path. `map` is the resolved pad map (see
 * resolveGamepadBindings); a null or stock map renders the dual register, because only the shipped
 * layout is entitled to the Xbox/PlayStation pairing. A chord names every button it holds.
 */
export function gamepadControlRows(map) {
  const stock = map == null || map === GAMEPAD_DEFAULT_BINDINGS;
  // A null map is "no overrides configured", which IS the default map — resolve it rather than
  // letting the lookup read through an empty object.
  const resolved = map == null ? GAMEPAD_DEFAULT_BINDINGS : map;
  return GAMEPAD_ROW_ORDER.map((label) => {
    if (GAMEPAD_STATIC_LABELS.has(label)) return [label, null, GAMEPAD_STATIC_TEXT[label]];
    const [, action, format] = GAMEPAD_ROW_BY_LABEL.get(label);
    const labels = gamepadButtonLabels(action, resolved, { dual: stock });
    if (!labels.length) {
      // A player who cleared a binding chose that; a verb the game ships with no default button is
      // the game's own gap, and saying otherwise blames the profile for the design.
      const shipped = gamepadButtonNames(action, GAMEPAD_DEFAULT_BINDINGS);
      return [label, null, shipped.length ? UNBOUND_BY_PLAYER : UNBOUND_BY_DESIGN];
    }
    // A dual Xbox/PlayStation spelling already uses ' / ' as its own separator, so a chord must
    // join with ' or ' — otherwise the two separators are indistinguishable in the cell.
    return [label, null, format(labels.join(' or '))];
  });
}

export function controlSections(state) {
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
      ['Draw-to-fly (optional toggle)', 'autoFire'],
      ['Countermeasure', 'countermeasure'],
      ['Massline tap: latch / cut', 'tether'],
      ['Massline directional control', null, directional || '—'],
      ['Massline dedicated reel in', 'reelIn'],
      ['Massline dedicated pay out', 'reelOut'],
      ['Deploy anchor Mass Seed (toward aim; locks on arrival, then latch it)', 'deployMassSeed'],
      ['Deploy attractive Well (at aim; pulls light bodies & shots — heavy ships shrug)', 'deployWell'],
      ['Deploy Repulsor (drops at ship; shoves bodies outward)', 'deployRepulsor'],
      ['Toggle Clearing Cone (forward gravitic snowplow; toggle on/off)', 'toggleClearingCone'],
      ['Hull burst (a Gravity Bumper, Fire Lance or Grip Bumper: for a few seconds the nose throws, burns or catches hostile hulls; middle-click also lights it)', 'hullBurst'],
      ['Open a scoop sheet and harvest by grazing a planet band', 'toggleSkimCollector'],
      ['Drop bomb (releases at ship velocity; payload from the bomb bay)', 'dropBomb'],
      ['Cycle bomb-bay payload', 'cycleBomb'],
      ['Throw impulse charge (sticks where it lands; detonate later)', 'chargeThrow'],
      ['Detonate armed charge', 'chargeDetonate'],
      ['Travel burn (latch a long burn)', 'travelBurn'],
    ]],
    ['Interface (fixed keys)', [
      ['Aim weapons freely', null, 'Backspace, then Mouse'],
      ['Select / inspect object', null, 'RMB tap'],
      ['Mine / salvage / weld', null, 'hold RMB on object'],
      ['Deep-core extraction', null, `${BINDINGS.drill.label} (target an asteroid)`],
      ['Claim body / open base', null, `${BINDINGS.claimBase.label} (near a colony/moon)`],
      ['Cycle combat lock', null, 'Tab / Shift+Tab'],
      ['Release combat lock', null, 'Backspace'],
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
    ['Gamepad (Xbox / PlayStation)', gamepadControlRows(resolveGamepadBindings(state && state.settings))],
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

// ------------------------------------------------------------------------------------------------
// The Controls Rig: the verbs that live on the ship, the part each drives and its pad binding.
// `pad`: a pad action (its live button) or a left-stick direction. Columns balance 7 / 6.
const RIG_STATIONS = Object.freeze([
  { id: 'yawLeft', action: 'yawLeft', verb: 'Steer left', part: 'bowL', fx: 'steerL', partName: 'bow', side: 'left', stick: 'left' },
  { id: 'fire', action: 'fire', verb: 'Fire', part: 'hardpoint', fx: 'fire', partName: 'hardpoint', side: 'left', padAction: 'fire', mouse: 'Mouse0' },
  { id: 'strafeLeft', action: 'strafeLeft', verb: 'Lateral left', part: 'flankL', fx: 'flankL', partName: 'port thruster', side: 'left' },
  { id: 'autoFire', action: 'autoFire', verb: 'Draw-to-fly', part: 'helm', fx: 'helm', partName: 'helm', side: 'left', padAction: 'autoTarget' },
  { id: 'tether', action: 'tether', verb: 'Massline', part: 'winch', fx: 'winch', partName: 'winch', side: 'left', padAction: 'massline' },
  { id: 'forward', action: 'forward', verb: 'Throttle', part: 'drive', fx: 'drive', partName: 'drive', side: 'left', stick: 'up', order: 0 },
  { id: 'brake', action: 'brake', verb: 'Brake', part: 'drive', fx: 'brake', partName: 'drive', side: 'left', padAction: 'brake', order: 1 },
  { id: 'yawRight', action: 'yawRight', verb: 'Steer right', part: 'bowR', fx: 'steerR', partName: 'bow', side: 'right', stick: 'right' },
  { id: 'mine', action: null, verb: 'Mine beam', part: 'mining', fx: 'mine', partName: 'mining head', side: 'right', padAction: 'mine', mouse: 'Mouse2' },
  { id: 'reverse', action: 'reverse', verb: 'Reverse', part: 'bow', fx: 'retro', partName: 'bow', side: 'right', stick: 'down' },
  { id: 'strafeRight', action: 'strafeRight', verb: 'Lateral right', part: 'flankR', fx: 'flankR', partName: 'starboard thruster', side: 'right' },
  { id: 'countermeasure', action: 'countermeasure', verb: 'Countermeasure', part: 'belly', fx: 'belly', partName: 'belly', side: 'right', padAction: 'countermeasure' },
  { id: 'boost', action: 'boost', verb: 'Boost', part: 'bloom', fx: 'bloom', partName: 'drive', side: 'right', padAction: 'boost' },
]);
const STICK_GLYPH = { up: '↑', down: '↓', left: '←', right: '→' };

// The fixed interface keys by KeyboardEvent.code, so the echo can light their ladder rows.
function fixedRowCodes() {
  const code = (b) => (b && b.code ? [b.code] : []);
  return new Map([
    ['Aim weapons freely', ['Backspace']],
    ['Mine beam', ['Mouse2']],
    ['Deep-core extraction', code(BINDINGS.drill)],
    ['Claim body / open base', code(BINDINGS.claimBase)],
    ['Cycle combat lock', ['Tab']],
    ['Release combat lock', ['Backspace']],
    ['Dock', code(BINDINGS.dock)],
    ['Pause', ['Escape', 'KeyP']],
    ['Star-map', code(BINDINGS.starmap)],
    ['Local system map', code(BINDINGS.localmap)],
    ['Tech tree', code(BINDINGS.techTree)],
    ['Mission log', code(BINDINGS.missionLog)],
    ['Cargo hold', code(BINDINGS.cargo)],
    ['Comms log', code(BINDINGS.comms)],
    ['Codex', code(BINDINGS.codex)],
    ['Help', ['F1', 'KeyH']],
    ['Quick save / load', ['F5', 'F9']],
  ]);
}
// Pad rows that follow a stick rather than a button.
const PAD_STATIC_AXES = new Map([['Fly (yaw + throttle)', ['up', 'down', 'left', 'right']], ['Aim weapons', ['aim']]]);
const PAD_ROW_ACTION = new Map(GAMEPAD_ROW_ACTIONS.map(([label, action]) => [label, action]));

function playerHullId(state) {
  const p = state && state.player;
  const owned = p && Array.isArray(p.ownedShips) ? p.ownedShips : [];
  const ship = owned[Number(p && p.activeShipIndex) || 0] || owned[0] || null;
  return (ship && ship.defId) || 'ship_kestrel';
}

/**
 * A pad cell from a binding list: the first button is the main glyph and any chord partners go in
 * the alt line. Reading `[0]` alone (as this used to, and as `gamepadGlyphForAction` still does for
 * prompt-deck chips) drops the rest of a chord, so the help and the pad disagree about a verb.
 */
function padCell(action, map) {
  const labels = gamepadButtonLabels(action, map);
  return { main: shortPad(labels[0]), alt: labels.slice(1).map(shortPad).join(' or ') };
}
function shortPad(label) {
  // The rig cell is narrow, so it spells the D-pad compactly while the ladder prints the full
  // 'D-Pad Up'. Deliberate: both spellings appear on this screen and neither is a typo.
  return String(label || '').replace(/^D-Pad /, 'D-pad ');
}

/** The rig's stations with their live bindings (keyboard from input.js, pad from the resolved map). */
export function rigStations(state) {
  const padMap = resolveGamepadBindings(state && state.settings);
  return RIG_STATIONS.map((s) => {
    let kb;
    if (s.id === 'mine') kb = { main: 'RMB' };
    else if (s.id === 'boost') {
      const label = liveBoostLabel(state);
      kb = { main: label.length > 8 ? label.split('/')[0] : label };
    } else {
      const codes = resolveActionCodes(state, s.action);
      if (!codes.length) kb = { main: s.action === 'fire' ? resolveActionLabel(state, 'fire') : '' };
      else kb = { main: formatBindingCode(codes[0]), alt: codes[1] ? formatBindingCode(codes[1]) : '' };
    }
    if (s.action === 'fire' && kb.main !== 'LMB') kb.alt = 'LMB';
    let pad;
    if (s.stick) pad = { main: 'L-stick', alt: STICK_GLYPH[s.stick] };
    else if (s.padAction) pad = padCell(s.padAction, padMap);
    else pad = { main: '' };
    return { ...s, kb, pad };
  });
}

/** code -> { stations, rows } for the echo; rows are the ladder rows' keys ("section:index"). */
function echoIndex(state, sections) {
  const byCode = new Map();
  const put = (code, kind, value) => {
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, { stations: [], rows: [] });
    const e = byCode.get(code);
    if (!e[kind].includes(value)) e[kind].push(value);
  };
  for (const s of RIG_STATIONS) {
    if (s.mouse) put(s.mouse, 'stations', s.id);
    if (s.action && s.id !== 'mine') for (const c of resolveActionCodes(state, s.action)) put(c, 'stations', s.id);
  }
  const fixed = fixedRowCodes();
  sections.forEach(([heading, rows], si) => {
    if (si > 1) return;
    rows.forEach(([label, action], ri) => {
      const key = `${si}:${ri}`;
      if (action) {
        for (const c of resolveActionCodes(state, action)) put(c, 'rows', key);
        if (action === 'fire') put('Mouse0', 'rows', key);
      } else for (const c of fixed.get(label) || []) put(c, 'rows', key);
    });
  });
  // the pad: std button name / stick axis -> stations and Gamepad rows
  const padMap = resolveGamepadBindings(state && state.settings);
  const byPad = new Map();
  const putPad = (name, kind, value) => {
    if (!name) return;
    if (!byPad.has(name)) byPad.set(name, { stations: [], rows: [] });
    const e = byPad.get(name);
    if (!e[kind].includes(value)) e[kind].push(value);
  };
  for (const s of RIG_STATIONS) {
    if (s.stick) putPad(`axis:${s.stick}`, 'stations', s.id);
    else if (s.padAction) for (const n of padMap[s.padAction] || []) putPad(n, 'stations', s.id);
  }
  const padRows = sections[2] ? sections[2][1] : [];
  padRows.forEach(([label], ri) => {
    const key = `2:${ri}`;
    const axes = PAD_STATIC_AXES.get(label);
    if (axes) { for (const a of axes) putPad(`axis:${a}`, 'rows', key); return; }
    const action = PAD_ROW_ACTION.get(label);
    if (action) for (const n of padMap[action] || []) putPad(n, 'rows', key);
    if (label === 'Pause' || label === 'Open mission log') putPad('menu', 'rows', key);
    if (label === 'Travel burn') for (const n of padMap.travelBurn || ['l3']) putPad(n, 'rows', key);
  });
  return { byCode, byPad };
}

// ------------------------------------------------------------------------------------------------

function fmtPrice(v) {
  v = Math.round(v || 0);
  if (v === 0) return 'Free';
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}

/** A ladder of choices: one spine, a tick per rung, the chosen rung carries the Hand. */
function ladder({ items, ariaLabel, chosenId, onPick, cls = '' }) {
  const list = el('ul', `orr-help-ladder ${cls}`.trim());
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', ariaLabel);
  const buttons = [];
  for (const item of items) {
    if (item.head) {
      const head = el('li', 'orr-help-ladder__head', item.head);
      head.setAttribute('role', 'presentation');
      if (item.glyph) { const g = el('span', 'orr-help-ladder__glyph'); g.innerHTML = item.glyph; head.prepend(g); }
      list.appendChild(head);
      continue;
    }
    const li = el('li', 'orr-help-ladder__rung');
    li.setAttribute('role', 'presentation');
    const b = el('button', 'orr-help-ladder__item');
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.dataset.id = item.id;
    b.dataset.action = 'help-pick:' + item.id;
    if (item.search) b.dataset.search = item.search.toLowerCase();
    b.setAttribute('aria-selected', String(item.id === chosenId));
    b.tabIndex = item.id === chosenId ? 0 : -1;
    const name = el('span', 'orr-help-ladder__name', item.name);
    b.appendChild(name);
    if (item.figure != null) b.appendChild(el('span', 'orr-help-ladder__fig' + (item.figureCls ? ' ' + item.figureCls : ''), item.figure));
    b.addEventListener('click', () => onPick(item.id, { focus: true }));
    li.appendChild(b);
    list.appendChild(li);
    buttons.push(b);
  }
  list.addEventListener('keydown', (ev) => {
    const live = buttons.filter((b) => !b.closest('li').hidden);
    const i = live.indexOf(ev.target);
    if (i < 0) return;
    let next = -1;
    if (ev.key === 'ArrowDown') next = Math.min(live.length - 1, i + 1);
    else if (ev.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = live.length - 1;
    if (next < 0 || next === i) return;
    ev.preventDefault();
    onPick(live[next].dataset.id, { focus: true });
  });
  return {
    el: list,
    buttons,
    choose(id, { focus = false } = {}) {
      for (const b of buttons) {
        const on = b.dataset.id === id;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on) {
          if (focus && typeof b.focus === 'function') b.focus();
          // a pick from the instrument centres its rung; a step along the ladder only keeps it in view
          if (typeof b.scrollIntoView === 'function') b.scrollIntoView({ block: focus ? 'nearest' : 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
      }
    },
    filter(q) {
      let shown = 0;
      for (const b of buttons) {
        const hit = !q || (b.dataset.search || '').includes(q);
        b.closest('li').hidden = !hit;
        if (hit) shown += 1;
      }
      // a group head hides when none of its rungs is left
      let head = null; let any = false;
      for (const li of list.children) {
        if (li.classList.contains('orr-help-ladder__head')) { if (head) head.hidden = !any; head = li; any = false; continue; }
        if (!li.hidden) any = true;
      }
      if (head) head.hidden = !any;
      return shown;
    },
  };
}

/** The reading beside an instrument: a pool of shade, its figure, then a ledger of terms. */
function termLedger(terms) {
  const dl = el('dl', 'orr-help-terms');
  for (const [k, v, cls] of terms) {
    if (v == null || v === '') continue;
    const row = el('div', 'orr-help-terms__row' + (cls ? ' ' + cls : ''));
    row.append(el('dt', '', k), el('dd', '', v));
    dl.appendChild(row);
  }
  return dl;
}

export const helpScreen = {
  id: 'help',
  _activeTab: 'Controls',

  mount(rootEl, ctx) {
    injectDeckplate();
    injectHelpLayouts();
    this._disposeView();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-help');
    rootEl.classList.add('k-screen', 'of-help', 'orr-help');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', 'Help');
    this._root = rootEl;
    this._ctx = ctx;

    // Title: "Help" and the control profile the Controls tab describes.
    const title = el('header', 'k-title orr-help__title');
    const heading = el('h1', 'k-display k-t-title', 'Help');
    title.appendChild(heading);
    const now = el('p', 'k-t-emph k-62 sf-help-now', schemeLine(ctx.state));
    title.appendChild(now);
    rootEl.appendChild(title);
    this._nowEl = now;

    // The six sections on a ladder: words on a spine, a tick each, the Hand on the open one.
    const hang = el('nav', 'k-hang orr-help__rail');
    hang.setAttribute('aria-label', 'Help sections');
    const tabs = words(TABS.map((t) => ({ action: t, label: t, current: t === this._activeTab })), {
      ariaLabel: 'Help sections',
      onPick: (t) => { if (t === this._activeTab) return; this._activeTab = t; this._q = ''; this._render(ctx); },
    });
    tabs.classList.add('orr-help__tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-orientation', 'vertical');
    this._tabBtns = {};
    for (const b of tabs.querySelectorAll('.k-word')) {
      b.classList.add('sf-tab');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(b.dataset.action === this._activeTab));
      b.setAttribute('aria-controls', 'orr-help-stage');
      this._tabBtns[b.dataset.action] = b;
    }
    hang.appendChild(tabs);
    rootEl.appendChild(hang);

    // The stage: the chosen tab's instrument; rebuilt by _render.
    const body = el('section', 'k-stage orr-help__stage');
    body.id = 'orr-help-stage';
    body.setAttribute('role', 'tabpanel');
    rootEl.appendChild(body);

    // Foot: Close, a word with its key glyph.
    const foot = el('footer', 'k-foot orr-help__foot');
    const close = el('button', 'k-word k-word--emph sf-back orr-help__close');
    close.type = 'button';
    close.dataset.action = 'close';
    close.setAttribute('aria-label', 'Close help (Esc)');
    close.append(el('span', 'orr-help__close-word', 'Close'), keyGlyph('Esc'));
    close.addEventListener('click', () => { cue('confirm'); nav(ctx, 'popScreen'); });
    foot.appendChild(close);
    rootEl.appendChild(foot);

    this._body = body;
    this._regions = { title, hang, stage: body, foot };
    this._render(ctx);
    rootEl.dataset.kReady = '1';
  },

  _disposeView() {
    if (this._view && typeof this._view.dispose === 'function') {
      try { this._view.dispose(); } catch (e) { /* a view that failed to dispose must not block the next */ }
    }
    this._view = null;
  },

  _render(ctx) {
    if (!this._body) return;
    this._helpSigVal = this._helpSig(ctx);
    this._disposeView();
    this._body.innerHTML = '';
    this._body.dataset.tab = this._activeTab.toLowerCase();
    if (this._root) this._root.dataset.tab = this._activeTab.toLowerCase();
    if (this._nowEl) this._nowEl.textContent = schemeLine(ctx.state);

    if (this._tabBtns) {
      for (const t of TABS) {
        const b = this._tabBtns[t];
        if (!b) continue;
        const on = t === this._activeTab;
        b.setAttribute('aria-selected', String(on));
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      }
    }

    switch (this._activeTab) {
      case 'Controls': this._view = this._renderControls(ctx); break;
      case 'Loops': this._view = this._renderLoops(); break;
      case 'Ships': this._view = this._renderShips(ctx); break;
      case 'Commodities': this._view = this._renderCommodities(); break;
      case 'Ores': this._view = this._renderOres(); break;
      case 'Factions': this._view = this._renderFactions(); break;
      default: break;
    }
  },

  /** The search field on the long-list tabs; filters the ladder in place. */
  _search(host, placeholder, onFilter) {
    const ctrls = createListControls({
      search: true,
      placeholder,
      onSearch: (q) => { this._q = q; onFilter(q); },
    });
    ctrls.el.classList.add('orr-help-search');
    const input = ctrls.el.querySelector('.sf-lc__search');
    if (input) {
      input.setAttribute('data-text-input', '');
      if (this._q) input.value = this._q;
    }
    host.appendChild(ctrls.el);
    return input;
  },

  // ---------------------------------------------------------------- CONTROLS: the rig
  _renderControls(ctx) {
    const state = ctx.state;
    const sections = controlSections(state);
    const wrap = el('div', 'orr-help-controls');
    const rigHost = el('div', 'orr-help-controls__rig');
    rigHost.setAttribute('role', 'group');
    rigHost.setAttribute('aria-label', 'Controls rig: press any key, mouse or pad button to see what it drives');
    const reg = el('div', 'orr-hreg');
    wrap.append(rigHost, reg);
    this._body.appendChild(wrap);

    // the ladder of every key, beside the rig
    const head = el('div', 'orr-hreg__head');
    head.appendChild(el('p', 'orr-hreg__title', 'Every key'));
    const secNav = el('div', 'orr-hreg__secs');
    const scroll = el('div', 'orr-hreg__scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('aria-label', 'Every key, by section');
    const list = el('ul', 'orr-hreg__list');
    const rowEls = new Map();
    const secEls = [];
    const SEC_WORDS = ['Flight', 'Interface', 'Pad', 'Touch'];
    sections.forEach(([heading, rows], si) => {
      const sec = el('li', 'orr-hreg__sec', heading);
      sec.dataset.sec = String(si);
      list.appendChild(sec);
      secEls.push(sec);
      rows.forEach(([label, action, def], ri) => {
        const row = el('li', 'orr-hreg__row');
        const key = `${si}:${ri}`;
        row.dataset.row = key;
        row.appendChild(el('span', 'orr-hreg__name', label));
        const bind = keyLabel(state, action, def);
        // both shift keys boost: the ladder draws them as the one key they are
        row.appendChild(keyGlyph(bind === 'L-Shift / R-Shift' ? 'Shift' : bind, { small: true }));
        list.appendChild(row);
        rowEls.set(key, row);
      });
    });
    scroll.appendChild(list);
    const secBtns = SEC_WORDS.map((w, si) => {
      const b = el('button', 'orr-hreg__secword', w);
      b.type = 'button';
      b.dataset.action = 'help-section:' + w.toLowerCase();
      b.addEventListener('click', () => {
        const target = secEls[si];
        if (target) scroll.scrollTo({ top: target.offsetTop - 4, behavior: reducedMotion() ? 'auto' : 'smooth' });
      });
      secNav.appendChild(b);
      return b;
    });
    head.appendChild(secNav);
    // with a pad, the drawn pad stands at the head of the ladder and lights the button pressed
    const padHost = el('div', 'orr-hreg__pad');
    padHost.setAttribute('aria-hidden', 'true');
    head.appendChild(padHost);
    const fine = el('p', 'orr-hreg__fine', 'Flight keys can be rebound in Settings → Controls. Interface keys are fixed.');
    reg.append(head, scroll, fine);
    const spy = () => {
      const top = scroll.scrollTop + 8;
      let cur = 0;
      secEls.forEach((s, i) => { if (s.offsetTop <= top) cur = i; });
      secBtns.forEach((b, i) => b.setAttribute('aria-current', String(i === cur)));
    };
    scroll.addEventListener('scroll', spy, { passive: true });
    spy();
    syncScrollExtent(scroll);

    // the rig
    const stations = rigStations(state);
    const index = echoIndex(state, sections);
    const stationById = new Map(stations.map((s) => [s.id, s]));
    let lastPad = [];
    const rig = createControlsRig(rigHost, {
      onPreview: (id) => {
        const s = stationById.get(id);
        if (!s) return;
        rig.flare([id]);
        const glyph = rig.device() === 'pad' ? [s.pad.main, s.pad.alt].filter(Boolean).join(' ') : s.kb.main;
        rig.echo(glyph || '—', `${s.verb} → ${s.partName}`);
        lightRows(rowsForStation(s), false);
      },
      onDevice: (dev) => { if (dev === 'pad') scrollToSec(2); },
      padHost,
    });
    rig.set({ hullId: playerHullId(state), stations });

    const rowsForStation = (s) => {
      const out = [];
      sections.forEach(([, rows], si) => {
        if (si > 1 && !(si === 2 && rig.device() === 'pad')) return;
        rows.forEach(([, action], ri) => { if (action && action === s.action) out.push(`${si}:${ri}`); });
      });
      if (s.id === 'mine') out.push('1:1');
      return out;
    };
    const scrollToSec = (si) => {
      const target = secEls[si];
      if (target) scroll.scrollTo({ top: target.offsetTop - 4, behavior: reducedMotion() ? 'auto' : 'smooth' });
    };
    const rowTimers = new Map();
    const lightRows = (keys, hold) => {
      let first = null;
      for (const k of keys) {
        const row = rowEls.get(k);
        if (!row) continue;
        row.classList.add('is-echo');
        if (!first) first = row;
        if (rowTimers.has(k)) { clearTimeout(rowTimers.get(k)); rowTimers.delete(k); }
        if (!hold) rowTimers.set(k, setTimeout(() => { row.classList.remove('is-echo'); rowTimers.delete(k); }, 1300));
      }
      if (first) {
        const top = first.offsetTop;
        const bottom = top + first.offsetHeight;
        if (top < scroll.scrollTop + 8 || bottom > scroll.scrollTop + scroll.clientHeight - 8) {
          scroll.scrollTo({ top: Math.max(0, top - scroll.clientHeight / 2), behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
      }
    };
    const unlightRows = (keys) => {
      for (const k of keys) {
        const row = rowEls.get(k);
        if (!row) continue;
        rowTimers.set(k, setTimeout(() => { row.classList.remove('is-echo'); rowTimers.delete(k); }, 420));
      }
    };
    const rowName = (k) => { const r = rowEls.get(k); const n = r && r.querySelector('.orr-hreg__name'); return n ? n.textContent : ''; };

    const echo = createInputEcho({
      root: this._root || rigHost,
      rigHost: () => rigHost,
      onInput: (ev) => {
        let entry = null;
        let glyph = '';
        let src = '';
        if (ev.device === 'pad') {
          if (rig.device() !== 'pad' && ev.down) { rig.setDevice('pad'); scrollToSec(2); }
          if (ev.button) {
            src = 'pad:' + ev.button;
            entry = index.byPad.get(ev.button);
            glyph = shortPad(GAMEPAD_BUTTON_LABELS[ev.button] || ev.button);
            rig.padLight([ev.button], ev.down);
          } else if (ev.axis) {
            src = 'axis:' + ev.axis;
            entry = index.byPad.get('axis:' + ev.axis);
            glyph = ev.axis === 'aim' ? 'R-stick' : `L-stick ${STICK_GLYPH[ev.axis] || ''}`.trim();
            rig.padLight([ev.axis === 'aim' ? 'r3' : 'l3'], ev.down);
          }
          lastPad = ev.down ? [src] : [];
        } else {
          if (rig.device() !== 'kbm' && ev.down) rig.setDevice('kbm');
          src = 'kbm:' + ev.code;
          entry = index.byCode.get(ev.code);
          glyph = formatBindingCode(ev.code);
          if (ev.code === 'Escape') glyph = 'Esc';
          if (ev.code === 'Mouse1') glyph = 'MMB';
        }
        const stationIds = entry ? entry.stations : [];
        const rowKeys = entry ? entry.rows : [];
        if (!ev.down) {
          rig.release(stationIds, src);
          unlightRows(rowKeys);
          return;
        }
        if (stationIds.length) rig.flare(stationIds, { hold: true, source: src });
        lightRows(rowKeys, true);
        const verbs = stationIds.map((id) => stationById.get(id)).filter(Boolean);
        if (verbs.length) {
          const parts = [...new Set(verbs.map((v) => v.partName))];
          rig.echo(glyph, `${verbs.map((v) => v.verb).join(' · ')} → ${parts.join(', ')}`);
        } else if (rowKeys.length) {
          const names = rowKeys.map(rowName).filter(Boolean);
          rig.echo(glyph, names.join(' · '));
          rig.whisper(glyph, names[0] || '', ev.x, ev.y);
        } else {
          rig.echo(glyph, 'not bound · nothing on this key', { none: true });
          rig.whisper(glyph, 'not bound', ev.x, ev.y, { none: true });
        }
      },
    });
    this._echo = echo;
    this._rig = rig;
    return {
      dispose: () => {
        echo.dispose();
        rig.dispose();
        for (const t of rowTimers.values()) clearTimeout(t);
        this._echo = null;
        this._rig = null;
        void lastPad;
      },
    };
  },

  // ---------------------------------------------------------------- LOOPS: the loop orrery
  _renderLoops() {
    const host = el('div', 'orr-help-loops');
    this._body.appendChild(host);
    const glyphs = ['dock', 'trade', 'mine', 'refit', 'recover', 'track'];
    const loops = GAMEPLAY_LOOPS.map(([name, route, value], i) => ({
      id: 'loop' + i, name, glyph: glyphs[i] || 'track', steps: route.split(/\s*->\s*/).filter(Boolean), why: value,
    }));
    if (this._loop == null) this._loop = 0;
    const view = createLoopOrrery(host, {
      loops,
      onPick: (i) => { this._loop = i; view.set({ selected: i, swing: true }); },
    });
    view.set({ selected: this._loop, swing: false });
    return view;
  },

  // ---------------------------------------------------------------- SHIPS: the hull dial
  _renderShips(ctx) {
    const q = (this._q || '').trim().toLowerCase();
    const sorted = SHIPS.slice().sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    if (!this._ship || !sorted.some((s) => s.id === this._ship)) this._ship = playerHullId(ctx && ctx.state);
    if (!sorted.some((s) => s.id === this._ship)) this._ship = sorted[0].id;
    const wrap = el('div', 'orr-help-list');
    const side = el('div', 'orr-help-list__side');
    const stage = el('div', 'orr-help-list__stage');
    wrap.append(side, stage);
    this._body.appendChild(wrap);
    let tier = -1;
    const items = [];
    for (const s of sorted) {
      if (s.tier !== tier) { tier = s.tier; items.push({ head: 'Tier ' + tier }); }
      items.push({ id: s.id, name: s.name, figure: s.role.replace(/_/g, ' '), search: s.name + ' ' + (s.role || '') });
    }
    // the dial reads every hull against a pinned one: the player's own until they pin another (C)
    if (!this._pin || !sorted.some((s) => s.id === this._pin)) this._pin = playerHullId(ctx && ctx.state);
    const pick = (id, { focus = false } = {}) => {
      if (!sorted.some((s) => s.id === id)) return;
      this._ship = id;
      lad.choose(id, { focus });
      paint(true);
    };
    const pin = () => {
      if (this._pin === this._ship) return;
      this._pin = this._ship;
      cue('confirm');
      markPin();
      paint(false);
    };
    const markPin = () => {
      for (const b of lad.buttons) {
        let tag = b.querySelector('.orr-help-ladder__pin');
        const on = b.dataset.id === this._pin;
        if (on && !tag) { tag = el('span', 'orr-help-ladder__pin'); tag.appendChild(el('span', 'orr-help-ladder__pin-word', 'pinned')); tag.setAttribute('aria-label', 'pinned'); b.querySelector('.orr-help-ladder__name').appendChild(tag); }
        if (!on && tag) tag.remove();
      }
    };
    const onKey = (ev) => {
      if (ev.code !== 'KeyC' || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target;
      if (t && typeof t.closest === 'function' && t.closest('input, textarea, select, [contenteditable="true"], [data-text-input]')) return;
      pin();
    };
    document.addEventListener('keydown', onKey);
    const input = this._search(side, 'Search ships…', (qq) => { const n = lad.filter(qq); empty.hidden = n > 0; });
    const lad = ladder({ items, ariaLabel: 'Ships', chosenId: this._ship, onPick: pick, cls: 'orr-help-ladder--ships' });
    const empty = el('p', 'k-empty orr-help-empty', 'No ship matches that search.');
    empty.hidden = true;
    side.append(lad.el, empty);
    const dialHost = el('div', 'orr-help-list__hero');
    const reading = el('div', 'orr-help-reading');
    stage.append(dialHost, reading);
    const dial = createHullDial(dialHost, { maxima: fleetMaxima(SHIPS) });
    const pinBtn = el('button', 'orr-help-verb');
    pinBtn.type = 'button';
    pinBtn.dataset.action = 'help-pin-hull';
    pinBtn.addEventListener('click', pin);
    const paint = (swing) => {
      const s = SHIPS.find((x) => x.id === this._ship);
      if (!s) return;
      const pinned = SHIPS.find((x) => x.id === this._pin) || s;
      dial.set({ ship: s, pinned, swing });
      reading.innerHTML = '';
      const name = el('h2', 'orr-help-reading__name', s.name);
      decorateEntityNode(name, 'hull:' + s.id);
      reading.append(el('p', 'orr-help-reading__kicker', `Tier ${s.tier} · ${s.role.replace(/_/g, ' ')}`), name);
      // the dial carries hull, shield, handling, cargo and price; the reading says what the hull is built round
      const slots = s.slots ? Object.entries(s.slots).filter(([, list]) => Array.isArray(list) && list.length)
        .map(([k, list]) => `${list.length > 1 ? list.length + ' ' : ''}${k}`).join(', ') : '';
      reading.appendChild(termLedger([
        ['Mass', s.mass != null ? s.mass + ' t' : ''], ['Outfit space', s.outfitSpace != null ? String(s.outfitSpace) : ''],
        ['Weapon cap', s.weaponCapacity != null ? String(s.weaponCapacity) : ''], ['Energy', s.energyCap != null ? `${s.energyCap} (+${s.energyRegen || 0}/s)` : ''],
        ['Boost', s.boost && s.boost.max ? `${s.boost.max} · dash every ${s.boost.dashCooldown}s` : ''], ['Slots', slots],
        ['Price', s.price ? fmtPrice(s.price) + ' cr' : 'Free (the starter)'],
      ]));
      // what the dial measures against, and the Pin verb that changes it
      const isPinned = s.id === this._pin;
      if (!isPinned) {
        const vsLine = el('p', 'orr-help-reading__vs');
        vsLine.append(el('i', 'orr-help-reading__vs-bead'), el('span', '', 'The dial reads against '), el('b', '', pinned.name));
        reading.appendChild(vsLine);
      }
      pinBtn.textContent = '';
      pinBtn.append(el('span', 'orr-help-verb__word', isPinned ? 'Pinned' : 'Pin to compare'), keyGlyph('C', { small: true }));
      pinBtn.setAttribute('aria-disabled', String(isPinned));
      pinBtn.setAttribute('aria-label', isPinned ? `${s.name} is pinned: every hull reads against it` : `Pin ${s.name}: read every hull against it (C)`);
      reading.appendChild(pinBtn);
      if (swing && !reducedMotion()) decrypt(name, s.name, { duration: 240 });
    };
    if (q) { const n = lad.filter(q); empty.hidden = n > 0; }
    markPin();
    paint(false);
    syncScrollExtent(lad.el);
    void input;
    return { dispose: () => { document.removeEventListener('keydown', onKey); dial.dispose(); } };
  },

  // ---------------------------------------------------------------- COMMODITIES: the price scale
  _renderCommodities() {
    const q = (this._q || '').trim().toLowerCase();
    const sorted = COMMODITIES.slice()
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    if (!this._good || !sorted.some((c) => c.id === this._good)) this._good = sorted[0].id;
    const wrap = el('div', 'orr-help-list orr-help-list--goods');
    const side = el('div', 'orr-help-list__side');
    const stage = el('div', 'orr-help-list__stage');
    wrap.append(side, stage);
    this._body.appendChild(wrap);
    const items = [];
    let cat = '';
    for (const c of sorted) {
      if (c.category !== cat) { cat = c.category; items.push({ head: cat }); }
      // The word carries the state; colour only says "against you" (contraband reads in the bad red).
      const legalRole = legalityRole(c.legality);
      const legalCls = legalRole === 'calm' ? '' : 'is-' + legalRole + (legalRole === 'foe' ? ' k-bad' : '');
      items.push({ id: c.id, name: c.name, figure: c.basePrice + ' cr', figureCls: legalCls, search: c.name + ' ' + (c.category || '') });
    }
    const reading = el('div', 'orr-help-reading');
    const pick = (id, { focus = false } = {}) => {
      if (!sorted.some((c) => c.id === id)) return;
      this._good = id;
      lad.choose(id, { focus });
      dial.set({ selectedId: id, swing: true });
      paint(true);
    };
    this._search(side, 'Search commodities…', (qq) => {
      const n = lad.filter(qq);
      empty.hidden = n > 0;
      dial.set({ filter: qq });
    });
    const lad = ladder({ items, ariaLabel: 'Commodities', chosenId: this._good, onPick: pick, cls: 'orr-help-ladder--goods' });
    const empty = el('p', 'k-empty orr-help-empty', 'No commodity matches that search.');
    empty.hidden = true;
    side.append(lad.el, empty);
    const dialHost = el('div', 'orr-help-list__hero');
    stage.append(dialHost, reading);
    const dial = createPriceDial(dialHost, { items: sorted, glyph: (cat) => commodityGlyphHtml(cat, 'orr-hpdial__svg'), onPick: (id) => pick(id) });
    const paint = (swing) => {
      const c = COMMODITIES.find((x) => x.id === this._good);
      if (!c) return;
      reading.innerHTML = '';
      const legalRole = legalityRole(c.legality);
      const name = el('h2', 'orr-help-reading__name', c.name);
      decorateEntityNode(name, 'commodity:' + c.id);
      const kicker = el('p', 'orr-help-reading__kicker', c.category);
      reading.append(kicker, name);
      if (c.displayName) reading.appendChild(el('p', 'orr-help-reading__sub', c.displayName));
      const legal = el('span', 'orr-help-legal' + (legalRole === 'calm' ? '' : ' is-' + legalRole), c.legality);
      reading.appendChild(termLedger([
        ['Base price', c.basePrice + ' cr'], ['Swing', `±${Math.round((c.volatility || 0) * 100)}%`],
        ['Volume', c.volPerU != null ? c.volPerU.toFixed(1) + ' per unit' : '-'], ['Mass', c.massPerU != null ? c.massPerU.toFixed(1) + ' t per unit' : ''],
        ['Made by', (c.producedBy || []).join(', ').replace(/_/g, ' ')], ['Bought by', (c.consumedBy || []).join(', ').replace(/_/g, ' ')],
      ]));
      const legalRow = el('p', 'orr-help-reading__legal');
      legalRow.append(el('span', 'orr-help-terms__k', 'Legality'), legal);
      reading.appendChild(legalRow);
      if (c.desc) reading.appendChild(el('p', 'orr-help-reading__body', c.desc));
      if (c.lore) reading.appendChild(el('p', 'orr-help-reading__lore', c.lore));
      if (swing && !reducedMotion()) decrypt(name, c.name, { duration: 240 });
    };
    if (q) { const n = lad.filter(q); empty.hidden = n > 0; dial.set({ filter: q }); }
    dial.set({ selectedId: this._good, swing: false });
    paint(false);
    syncScrollExtent(lad.el);
    return { dispose: () => dial.dispose() };
  },

  // ---------------------------------------------------------------- ORES: the asteroid mix
  _renderOres() {
    // Raw extraction ores only (category 'raw').
    // `o.baseValue` is now merged straight from COMMODITIES[].basePrice at module load
    // (src/data/mining.js), so this reading quotes the same equilibrium price the market does. It used
    // to read a hand-maintained duplicate that had drifted — iron read 12 cr here and 28 cr at every
    // trade terminal in the game — which meant the codex actively taught new players wrong prices.
    const q = (this._q || '').trim().toLowerCase();
    const rawOres = ORES
      .filter((o) => o.category === 'raw')
      .sort((a, b) => a.tier - b.tier || a.baseValue - b.baseValue);
    // an ore is always chosen (the ladder's Hand rests on it); the open rock is its richest source
    if (!this._ore || !rawOres.some((o) => o.id === this._ore)) {
      this._ore = rawOres[0].id;
      const best = ASTEROIDS.slice().sort((a, b) => (b.oreTable[this._ore] || 0) - (a.oreTable[this._ore] || 0))[0];
      if (best && (best.oreTable[this._ore] || 0) > 0) this._rock = best.id;
    }
    if (!this._rock || !ASTEROIDS.some((a) => a.id === this._rock)) this._rock = ASTEROIDS[0].id;
    const wrap = el('div', 'orr-help-list orr-help-list--ores');
    const side = el('div', 'orr-help-list__side');
    const stage = el('div', 'orr-help-list__stage');
    wrap.append(side, stage);
    this._body.appendChild(wrap);
    let tier = -1;
    const items = [];
    for (const o of rawOres) {
      if (o.tier !== tier) { tier = o.tier; items.push({ head: 'Tier ' + tier }); }
      items.push({ id: o.id, name: o.name, figure: o.baseValue + ' cr', search: o.name + ' ' + (o.id || '') + ' ' + (o.tags || []).join(' ') });
    }
    const reading = el('div', 'orr-help-reading orr-help-reading--ore');
    const pickOre = (id, { focus = false } = {}) => {
      if (!rawOres.some((o) => o.id === id)) return;
      this._ore = id;
      lad.choose(id, { focus });
      // the ore's richest source becomes the open rock
      const best = ASTEROIDS.slice().sort((a, b) => (b.oreTable[id] || 0) - (a.oreTable[id] || 0))[0];
      if (best && (best.oreTable[id] || 0) > 0 && best.id !== this._rock) this._rock = best.id;
      mix.set({ rockId: this._rock, oreId: id, swing: true });
      paint(true);
    };
    this._search(side, 'Search ores…', (qq) => { const n = lad.filter(qq); empty.hidden = n > 0; });
    const lad = ladder({ items, ariaLabel: 'Mineable ores', chosenId: this._ore, onPick: pickOre, cls: 'orr-help-ladder--ores' });
    const empty = el('p', 'k-empty orr-help-empty', 'No ore matches that search.');
    empty.hidden = true;
    side.append(lad.el, empty);
    const mixHost = el('div', 'orr-help-list__hero');
    stage.appendChild(mixHost);
    const mix = createOreMix(mixHost, {
      asteroids: ASTEROIDS,
      ores: rawOres,
      onPickRock: (id) => { this._rock = id; mix.set({ rockId: id, oreId: this._ore, swing: true }); paint(true); },
      onPickOre: (id) => pickOre(id, { focus: false }),
    });
    stage.appendChild(reading);
    const paint = (swing) => {
      const a = ASTEROIDS.find((x) => x.id === this._rock);
      const o = rawOres.find((x) => x.id === this._ore) || null;
      reading.innerHTML = '';
      if (o) {
        const name = el('h2', 'orr-help-reading__name', o.name);
        decorateEntityNode(name, 'commodity:' + o.id);
        reading.append(el('p', 'orr-help-reading__kicker', `Tier ${o.tier} ore`), name);
        reading.appendChild(termLedger([
          ['Value', o.baseValue + ' cr'], ['Mass', o.mass.toFixed(1) + ' t per unit'], ['Volume', o.vol.toFixed(1) + ' per unit'],
          ['Tags', o.tags ? o.tags.join(', ') : ''],
          ['Found in', ASTEROIDS.filter((r) => (r.oreTable[o.id] || 0) > 0).map((r) => `${rockName(r)} ${Math.round(r.oreTable[o.id] * 100)}%`).join(', ') || 'no asteroid type (deep seams only)'],
        ]));
        if (swing && !reducedMotion()) decrypt(name, o.name, { duration: 240 });
      } else if (a) {
        reading.append(el('p', 'orr-help-reading__kicker', 'Asteroid type'), el('h2', 'orr-help-reading__name', rockName(a)));
        reading.appendChild(termLedger([
          ['Tier cap', 'T' + a.tierCap], ['Spawn weight', String(a.spawnWeight)],
          ['Ore drops', Object.entries(a.oreTable).map(([id, w]) => { const ore = ORES.find((x) => x.id === id); return (ore ? ore.name : id) + ' ' + Math.round(w * 100) + '%'; }).join(', ')],
        ]));
      }
    };
    if (q) { const n = lad.filter(q); empty.hidden = n > 0; }
    mix.set({ rockId: this._rock, oreId: this._ore || null, swing: false });
    paint(false);
    syncScrollExtent(lad.el);
    return { dispose: () => mix.dispose() };
  },

  // ---------------------------------------------------------------- FACTIONS: the crest orbit
  _renderFactions() {
    const wrap = el('div', 'orr-help-factions');
    const orbitHost = el('div', 'orr-help-factions__orbit');
    const reading = el('div', 'orr-help-reading orr-help-reading--faction');
    wrap.append(orbitHost, reading);
    this._body.appendChild(wrap);
    if (!this._fac || !FACTION_META.some((f) => f.id === this._fac)) this._fac = FACTION_META[0].id;
    const orbit = createCrestOrbit(orbitHost, { crestSize: 46, centreSize: 124 });
    const relationsOf = (f) => Object.entries(f.relations || {})
      .map(([id, weight]) => ({ id, weight: Number(weight) || 0 }))
      .filter((r) => Math.abs(r.weight) >= 0.19);
    const paint = (swing) => {
      const f = FACTION_META.find((x) => x.id === this._fac);
      if (!f) return;
      orbit.set({
        items: FACTION_META.map((x) => ({ id: x.id, name: x.name, short: x.short, rep: Number(x.startingRep) || 0, hostile: (Number(x.startingRep) || 0) <= -100 })),
        selectedId: f.id,
        swing,
        relations: relationsOf(f),
      });
      reading.innerHTML = '';
      const fname = el('h2', 'orr-help-reading__name', f.name + ' (' + f.short + ')');
      decorateEntityNode(fname, 'faction:' + f.id);
      reading.append(el('p', 'orr-help-reading__kicker', f.personality ? f.personality.replace(/_/g, ' ') : 'power'), fname);
      const rep = Number(f.startingRep) || 0;
      const allies = relationsOf(f).filter((r) => r.weight > 0).map((r) => (FACTION_META.find((x) => x.id === r.id) || {}).short).filter(Boolean);
      const rivals = relationsOf(f).filter((r) => r.weight < 0).map((r) => (FACTION_META.find((x) => x.id === r.id) || {}).short).filter(Boolean);
      reading.appendChild(termLedger([
        ['Controls', f.controls && f.controls.length ? f.controls.join(', ') : ''],
        ['Starting rep', (rep > 0 ? '+' : rep < 0 ? '−' : '') + Math.abs(rep), rep < 0 ? 'is-against' : ''],
        ['Allied with', allies.join(', ')],
        ['At odds with', rivals.join(', ')],
      ]));
      if (swing && !reducedMotion()) decrypt(fname, fname.textContent, { duration: 260 });
    };
    orbitHost.addEventListener('click', (ev) => {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-fac]');
      if (!b) return;
      this._fac = b.getAttribute('data-fac');
      paint(true);
    });
    orbitHost.addEventListener('keydown', (ev) => {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-fac]');
      if (!b) return;
      const dir = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      const i = FACTION_META.findIndex((x) => x.id === this._fac);
      const next = FACTION_META[(i + dir + FACTION_META.length) % FACTION_META.length];
      this._fac = next.id;
      paint(true);
      const nb = orbitHost.querySelector(`[data-fac="${next.id}"]`);
      if (nb && typeof nb.focus === 'function') nb.focus();
    });
    paint(false);
    return { dispose: () => orbit.dispose() };
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
  onHide() {
    try { cue('close'); } catch (e) {}
    this._disposeView();
  },
  // Help renders static content keyed by tab + control scheme; the scheme can only change through
  // Settings (a stack return re-renders non-periodically), so the periodic pass skips the rebuild
  // when both are unchanged. (The search query filters in place; it never rebuilds the instrument.)
  _helpSig(ctx) {
    return [this._activeTab, profileName(ctx && ctx.state)].join('\u0000');
  },
  refresh(ctx, options = {}) {
    if (options && options.periodic && this._body && this._helpSigVal != null
      && this._helpSigVal === this._helpSig(ctx)) return;
    this._render(ctx);
  },
};

/** The fleet's best figure on each gauge (the dial's full scale). */
function fleetMaxima(ships) {
  const max = (k) => Math.max(1, ...ships.map((s) => Number(s[k]) || 0));
  return { hull: max('hull'), shield: max('shield'), handling: max('handling'), cargo: max('cargo'), price: max('price') };
}

function rockName(a) {
  return a.id.replace('ast_', '').replace(/_/g, ' ');
}
