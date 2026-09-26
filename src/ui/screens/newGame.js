// New Game screen (ARCHITECTURE §1.3 step 7, §5; design/specs/09).
// POSTER register: the starter hull on the stage, stencil title, one nameplate, kit keys for
// the verbs. Pilot / difficulty / seed / Launch stay the same controls — painted as produced
// Field Hardware, not leftover underlined words. Pilot name + a picked starter (defaulting to
// Hitch / ship_kestrel) + difficulty emit game:new. The save system owns newGame() and the
// switch to flight.
import { leftoverNewRunLine } from '../../core/newGamePlus.js';
import { MODULES } from '../../data/modules.js';
import {
  DEFAULT_STARTER_ID,
  NEW_GAME_STARTERS,
  starterById,
} from '../../data/newGameDefaults.js';
import { SHIPS } from '../../data/ships.js';
import { WEAPONS } from '../../data/weapons.js';
import { fittingsFromDefaultModules } from '../../systems/ships.js';
import { starterAirCard } from '../starterAirCard.js';
import { coreText } from '../localizedCoreCopy.js';
import { el, words, settle, cue } from '../kit/index.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { createStageHull } from './stageHull.js';
import { createStopScale, createTurntable } from '../orrery/stopDial.js';
import { createHullRing } from '../orrery/hullRing.js';
import { injectOrreryScreens } from '../orrery/screenLayouts.js';
import { hullPosterUrl } from '../hullPosters.js';
import { injectDeckplate } from '../deckplate/index.js';
import { capPins, platePins, panePins, channelPins, rowPins, wellPins }
  from '../kit/computedMaterial.js';

// PQ-156.00: the catalog owns the three starter hulls; Hitch stays the default pick so a
// Launch with no interaction emits the exact legacy ship_kestrel payload.
const DEFAULT_STARTER = starterById(DEFAULT_STARTER_ID) || NEW_GAME_STARTERS[0];
const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const FITTABLE_BY_ID = new Map();
for (const item of [...WEAPONS, ...MODULES]) FITTABLE_BY_ID.set(item.id, item);
const DIFFICULTIES = [
  ['casual', 'Casual', 'Much softer combat for learning and QA.'],
  ['standard', 'Standard', 'Softer hits on you; slightly easier kills.'],
  ['veteran', 'Veteran', 'Full combat baseline. No damage padding.'],
  ['ironman', 'Ironman', 'Veteran combat. Death ends the run.'],
];
const DEFAULT_DIFFICULTY = 'standard';
// The sheet's stage zoom for the new-game hull (Task B §1.1).
const STAGE_ZOOM = 1.1;
// the hull alone inside its ring stands closer: it fills about two thirds of the ring's width
const STAGE_ZOOM_RING = 1.55;
// The loading shell fades in over 0.8 s (#boot-overlay in styles/intro.css); after Launch the stage
// hull's WebGL context is freed once the shell covers the stage.
const STAGE_HULL_RELEASE_MS = 900;

const FH_KEY = {
  primary: { file: 'key.primary', width: '18px', minW: '132px', minH: '44px', pad: '0 16px', font: '16px' },
  hazard: { file: 'key.hazard', width: '18px', minW: '96px', minH: '32px', pad: '0 12px', font: '12px' },
  legend: { file: 'key.legend', width: '14px', minW: '72px', minH: '32px', pad: '0 10px', font: '12px' },
  small: { file: 'key.small', width: '12px', minW: '72px', minH: '28px', pad: '0 8px', font: '12px' },
};
const FH_PLATE = {
  sunk: { file: 'plate.bench.sunk.png', width: '24px', slice: '24 fill' },
  edge: { file: 'plate.edge.small.png', width: '16px', slice: '16 fill' },
};

function fhUrl(rel) {
  return new URL(`../../../assets/ui/kit/assets/${rel}`, import.meta.url).href;
}
function forcedColorsActive() {
  return typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches;
}
// Deckplate (FRONTEND_PROGRAM Wave 2): the Field Hardware PNG plates, keys and tiles are drawn by
// the deckplate bridge now (src/ui/deckplate/screens.js, FH_BRIDGE), so pins keep geometry, type
// and colour only. Forced colours keeps every pin: there the system palette is the material.
const DP_MATERIAL_PROP = /^(border-image|border-style$|border-width$|background)/;
function pin(node, props) {
  if (!node || !node.style || typeof node.style.setProperty !== 'function') return node;
  const materialsToBridge = !forcedColorsActive();
  for (const name of Object.keys(props)) {
    if (materialsToBridge && DP_MATERIAL_PROP.test(name)) continue;
    node.style.setProperty(name, props[name], 'important');
  }
  return node;
}
// ORRERY (design/frontend/ORRERY.md §6 New game): the Field Hardware paint helpers below pinned raster
// plates, key sprites and etched tiles inline with !important, which no sheet can answer. Under ORRERY
// they only mark each node for the composition sheet (src/ui/orrery/screenLayouts.js, .orr-newgame)
// and pin nothing, so every id, class hook, Tab stop and handler stays exactly as it was.
const ORRERY = true;
function installShell(root) {
  if (ORRERY) { root.classList.add('fh-shell', 'orr-newgame'); return; }
  root.classList.add('fh-shell');
  pin(root, { background: 'transparent', 'border-width': '0', 'box-shadow': 'none' });
}
function hairline() {
  if (ORRERY) { const gap = el('div', 'orr-ng-gap'); gap.setAttribute('aria-hidden', 'true'); return gap; }
  const rule = el('hr', 'k-rule fh-hairline');
  return pin(rule, {
    border: '0',
    height: '4px',
    background: 'url("' + fhUrl('tiles/tile.etch.hairline.png') + '") repeat-x left center',
    'background-color': 'transparent',
    margin: '12px 0',
  });
}
function paintMarking(node) {
  if (!node) return node;
  if (ORRERY) { node.classList.add('orr-ng-title'); return node; }
  node.classList.add('fh-title');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 900, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'text-transform': 'uppercase',
    'line-height': '0.9',
    color: 'var(--fh-text)',
  });
}
function paintLegend(node, lit = false) {
  if (!node) return node;
  if (ORRERY) { node.classList.add('orr-ng-label'); return node; }
  node.classList.add('fh-legend');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 600, 'wdth' 62",
    'letter-spacing': 'var(--fh-track-legend)',
    'text-transform': 'uppercase',
    'font-size': 'var(--fh-size-fine)',
    color: lit ? 'var(--fh-legend-lit)' : 'var(--fh-legend-rest)',
    margin: '0',
  });
}
function paintPlate(node, variant = 'sunk', extra = {}) {
  if (!node) return node;
  if (ORRERY) { node.classList.add('orr-ng-caption'); return node; }
  const spec = FH_PLATE[variant] || FH_PLATE.sunk;
  node.classList.add('fh-plate', variant === 'edge' ? 'fh-plate--edge' : 'fh-plate--sunk');
  if (forcedColorsActive()) {
    return pin(node, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', ...extra,
    });
  }
  return pin(node, {
    ...platePins(variant, spec.width),
    'box-sizing': 'border-box',
    padding: '8px 12px',
    ...extra,
  });
}
function paintInput(input) {
  if (!input) return input;
  if (ORRERY) { input.classList.add('orr-ng-input'); return input; }
  input.classList.add('fh-input');
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(input, { 'border-image-source': 'none', 'border-bottom': '1px solid CanvasText', background: 'transparent' });
      return;
    }
    pin(input, {
      ...channelPins(state, '12px'),
      color: 'var(--fh-text)',
      'min-height': '40px',
      padding: '0 8px',
      'box-sizing': 'border-box',
    });
  };
  apply('rest');
  if (input.dataset.fhBound !== '1') {
    input.dataset.fhBound = '1';
    input.addEventListener('focus', () => apply('focus'));
    input.addEventListener('blur', () => apply('rest'));
  }
  return input;
}
function paintKey(button, kind = 'legend') {
  if (!button) return button;
  if (ORRERY) {
    button.classList.add('k-word', 'orr-ng-key', 'orr-ng-key--' + kind);
    button._fhSync = () => {};
    return button;
  }
  const spec = FH_KEY[kind] || FH_KEY.legend;
  button.classList.add('k-word', 'fh-key', 'fh-key--' + kind);
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(button, {
        'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
        background: 'transparent', color: 'CanvasText',
      });
      return;
    }
    // A key's width, type and ink are the keycap's (the deckplate sheet); the pin keeps its footprint.
    pin(button, {
      display: 'inline-flex',
      // a choice segment fills its slot in the selector track; every other key is its own width
      ...(kind === 'legend' ? {} : { width: 'max-content' }),
      'max-width': '100%',
      'min-width': spec.minW,
      'min-height': spec.minH,
      // a key's padding is the sheet's (room for its lamp); a legend tab keeps the kit's
      ...(kind === 'legend' ? { padding: spec.pad } : {}),
      'font-size': spec.font,
      'text-transform': 'uppercase',
      // a rail word sets flush left (data-key-align); every other key centres its legend
      'justify-content': button.dataset.keyAlign || 'center',
      'align-items': 'center',
      'box-sizing': 'border-box',
      ...capPins(kind, state, spec.width),
    });
  };
  const sync = () => {
    const disabled = button.getAttribute('aria-disabled') === 'true' || button.disabled;
    const lit = button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-selected') === 'true';
    apply(disabled ? 'disabled' : (kind === 'legend' && lit ? 'lit' : 'rest'));
  };
  button._fhSync = sync;
  if (button.dataset.fhBound !== '1') {
    button.dataset.fhBound = '1';
    button.addEventListener('pointerenter', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply(kind === 'legend' && button.getAttribute('aria-pressed') === 'true' ? 'lit' : 'hover');
    });
    button.addEventListener('pointerleave', sync);
    button.addEventListener('pointerdown', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply(kind === 'legend' ? 'hover' : 'pressed');
    });
    button.addEventListener('pointerup', sync);
    button.addEventListener('focus', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply('hover');
    });
    button.addEventListener('blur', sync);
  }
  sync();
  return button;
}
function syncKeys(root) {
  if (!root || !root.querySelectorAll) return;
  for (const button of root.querySelectorAll('.fh-key')) {
    if (typeof button._fhSync === 'function') button._fhSync();
  }
}

export function parseUniverseSeed(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const seed = Number(text);
  return Number.isSafeInteger(seed) && seed > 0 && seed <= 0xffffffff ? seed : null;
}

function randomSeedText(ctx) {
  // A fresh seed for the "New seed" word. Cosmetic UI randomness (the run's seed is whatever the
  // field says when Launch is pressed), so Math.random is fine here; state.rng belongs to the sim.
  const rng = ctx && ctx.state && typeof ctx.state.rng === 'function' ? ctx.state.rng : Math.random;
  return String(1 + Math.floor(rng() * 0xfffffffe));
}

function readNewGamePlusCandidate(ctx) {
  try {
    const save = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('save');
    return save && typeof save.getNewGamePlusCandidate === 'function'
      ? save.getNewGamePlusCandidate()
      : null;
  } catch (error) {
    return null;
  }
}

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

// First-run splash (spec2/03 §3): after START, a single full-screen line on black, 2.5s, then B0.
// Fires only once per profile (localStorage flag), so returning players skip straight into flight.
// It is a cinematic, not a screen: its rules live in styles/ui.css beside the Continue veil.
const FIRST_RUN_LINE = 'Helios System. Third shift. The manifest is wrong.';
const FIRST_RUN_FLAG = 'sf.firstRunIntroSeen';
function showFirstRunSplash(ctx) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  if (localStorage.getItem(FIRST_RUN_FLAG)) {
    if (ctx && ctx.bus) ctx.bus.emit('ui:firstRunSplash:done', { skipped: true });
    return; // already seen — no splash
  }
  localStorage.setItem(FIRST_RUN_FLAG, '1');
  if (ctx && ctx.bus) ctx.bus.emit('ui:firstRunSplash:active', { line: FIRST_RUN_LINE });
  const splash = document.createElement('div');
  splash.className = 'sf-firstrun-splash';
  splash.setAttribute('role', 'status');
  splash.setAttribute('aria-live', 'polite');
  splash.setAttribute('aria-atomic', 'true');
  const line = document.createElement('div');
  line.className = 'sf-firstrun-splash__line';
  line.textContent = FIRST_RUN_LINE;
  splash.appendChild(line);
  (document.getElementById('ui-root') || document.body).appendChild(splash);
  // Fade in, hold ~2.5s, fade out, remove. Hold/fade clocks start now; rAF only adds the
  // visible class so a stalled frame cannot gate the opening tutorial.
  const finish = () => {
    if (splash.parentNode) splash.remove();
    if (ctx && ctx.bus) ctx.bus.emit('ui:firstRunSplash:done', { skipped: false });
  };
  requestAnimationFrame(() => splash.classList.add('open'));
  setTimeout(() => {
    splash.classList.remove('open');
    setTimeout(finish, 600);
  }, 2500);
}

function shipDefFor(ctx, shipId) {
  const ships = ctx && ctx.state && ctx.state.content && ctx.state.content.ships;
  if (Array.isArray(ships)) return ships.find((s) => s.id === shipId) || SHIP_BY_ID.get(shipId) || null;
  if (ships && typeof ships === 'object') return ships[shipId] || SHIP_BY_ID.get(shipId) || null;
  return SHIP_BY_ID.get(shipId) || null;
}

// A rail word: the legend key's printed pins, set flush left like the field labels above it and the
// one-word tag beneath it. paintKey pins its alignment inline on every state change, so the rail
// asks for it through data-key-align rather than overriding once (the hull names sat centred over
// left-set tags).
// The chosen hull's numbers as three bone tick-scale arcs: a lit fill for this hull, faint marks
// where the other two starters sit, the reading in the display face under the arc. (Fixed specs are
// bone; ice is for data in motion.)
function paintStarterStats(host, card, scale, others = []) {
  const rows = [['Mass', 'massT', 't'], ['Thrust', 'thrust', ''], ['Line', 'lineWuPerS', 'wu/s']];
  host.textContent = '';
  const a0 = -110; const a1 = 110;
  const p = (a, r = 22) => [30 + r * Math.sin(a * Math.PI / 180), 30 - r * Math.cos(a * Math.PI / 180)];
  const arc = (from, to, r = 22) => { const [x0, y0] = p(from, r); const [x1, y1] = p(to, r); return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  for (const [name, key, unit] of rows) {
    const value = Number(card[key]) || 0;
    const f = Math.max(0, Math.min(1, value / scale[key]));
    const ticks = [];
    for (let a = a0; a <= a1 + 0.01; a += 10) { const [x0, y0] = p(a, 25); const [x1, y1] = p(a, a % 50 === 0 ? 31 : 28); ticks.push(`M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`); }
    const ghosts = others.map((o) => {
      const g = a0 + (a1 - a0) * Math.max(0, Math.min(1, (Number(o[key]) || 0) / scale[key]));
      const [x0, y0] = p(g, 17); const [x1, y1] = p(g, 27);
      return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}" class="orr-ng-stat__ghost"/>`;
    }).join('');
    const reading = value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(Math.round(value));
    const cell = el('div', 'orr-ng-stat');
    cell.innerHTML = `<svg viewBox="0 0 60 44"><path d="${ticks.join(' ')}" class="orr-ng-stat__ticks"/>`
      + `<path d="${arc(a0, a1)}" class="orr-ng-stat__track"/><path d="${arc(a0, a0 + (a1 - a0) * f)}" class="orr-ng-stat__fill"/>${ghosts}</svg>`
      + `<b>${reading}<i>${unit}</i></b><span>${name}</span>`;
    host.appendChild(cell);
  }
}
function railWord(b) {
  b.dataset.keyAlign = 'flex-start';
  paintKey(b, 'legend');
}

// The stage shows the slot-parallel fittings array the render track consumes (a raw id list
// would place modules in the wrong slot positions), resolved by the same fit rule the run uses.
function starterStageFittings(starter) {
  return starter ? fittingsFromDefaultModules(starter.shipId, starter.fittedModules || []) : null;
}

function starterLoadoutRows(starter) {
  const labels = {
    weapon: 'Primary',
    mining: 'Mining',
    engine: 'Drive',
    shield: 'Shield',
    cargo: 'Cargo',
    utility: 'Utility',
  };
  return ((starter && starter.fittedModules) || [])
    .map((id) => FITTABLE_BY_ID.get(id))
    .filter(Boolean)
    .map((def) => [labels[def.slotType] || def.slotType, def.name]);
}

// The first fifteen minutes (spec2/03 §1): the four beats a Steam-demo player should know before
// Launch. Rendered as four static kit rows under the loadout (check-new-game-first-run-rail).
const FIRST_MINUTES = [
  ['Wake at the beacon', 'Thrust to the beacon. One verb at a time.'],
  ['Tether the derelict', 'Latch, winch, cut. The vacuum shows itself.'],
  ['Mine the first seam', 'Pulse, beam the bright seams, ride the heat.'],
  ['Dock and pick work', 'Sell at Helios, then choose haul, bounty, or survey.'],
];

/** A form field: a label at body size 62 % and its control beneath, separated from the next by a hairline. */
function field(labelText, htmlFor) {
  const wrap = el('div');
  // A <label> only where it labels one control; a group of words gets a plain heading it points at.
  const label = el(htmlFor ? 'label' : 'div', 'k-t-body k-62 fh-legend', labelText);
  if (htmlFor) label.htmlFor = htmlFor;
  paintLegend(label);
  // The label sits on its own line above the control (a block wrapper; the kit's inputs are inline).
  const line = el('div');
  line.appendChild(label);
  wrap.appendChild(line);
  return { wrap, label };
}

let refs = null;

export const newGameScreen = {
  id: 'newGame',

  mount(rootEl, ctx) {

    injectDeckplate();
    if (refs && refs.unsubStartFailed) {
      try { refs.unsubStartFailed(); } catch (e) {}
    }
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', coreText('newGame'));
    injectOrreryScreens();
    installShell(rootEl);

    // Title. `.sf-ng-header` is an inert hook the layout probe measures.
    const title = el('header', 'k-title sf-ng-header');
    pin(title, { 'border-bottom': '0' });
    const heading = el('h1', 'k-display k-t-title fh-title', 'New game');
    paintMarking(heading);
    title.appendChild(heading);
    title.appendChild(el('p', 'k-t-emph k-62', 'One hull, one contract, the whole sky.'));
    rootEl.appendChild(title);

    // The form hangs on the left. `.sf-ng-body` is the scrolling region the layout probe measures.
    const body = el('div', 'k-hang sf-ng-body');
    pin(body, { 'border-right': '0', background: 'transparent' });
    rootEl.appendChild(body);
    // Launch guard (spec2/03 §3): one async start at a time. Set by setLaunching below.
    let launching = false;

    // Pilot name. spellcheck/autocapitalize off: a pilot callsign is not prose — the browser's red
    // squiggle and capitalization suggestions are noise on a name field.
    const pilot = field(coreText('pilotName'), 'sf-ng-pilot-name');
    const name = el('input', 'k-input'); name.id = 'sf-ng-pilot-name'; name.type = 'text'; name.maxLength = 20; name.value = 'Wren';
    name.spellcheck = false; name.autocapitalize = 'off'; name.autocomplete = 'off';
    paintInput(name);
    pilot.wrap.appendChild(name);
    body.appendChild(pilot.wrap);
    body.appendChild(hairline());

    // Starter (PQ-156.00): three hulls, three first mornings. A roving arrow-key words row like
    // difficulty — but it owns NO Tab stop, because the launch layout probe pins an exact six-stop
    // traversal (pilot → difficulty → seed → New seed → Back → Launch). Up/Down arrows carry focus
    // between the name field, this row, and the difficulty row; click works too. Picking a word
    // updates the stage hull, the loadout, the caption and the launch payload together.
    const starterField = field('Start as');
    starterField.label.id = 'sf-ng-starter-label';
    const starterWords = words(NEW_GAME_STARTERS.map((s) => ({
      action: 'starter:' + s.id,
      label: s.name,
      sub: s.tag,
    })), {
      row: true, size: 'body', ariaLabel: 'Start as',
      onPick: (action) => this._setStarter(action.slice('starter:'.length)),
    });
    starterWords.setAttribute('aria-labelledby', starterField.label.id);
    starterWords.classList.add('of-pause');
    for (const b of starterWords.querySelectorAll('.k-word')) railWord(b);
    const starterDesc = el('p', 'k-sentence', '');
    starterDesc.id = 'sf-ng-starter-desc';
    starterWords.setAttribute('aria-describedby', starterDesc.id);
    starterField.wrap.appendChild(starterWords);
    starterField.wrap.appendChild(starterDesc);
    body.appendChild(starterField.wrap);
    // ORRERY: the hull choice is made at the hull -- it moves to the stage (below, once the stage
    // exists) as stations on an arc under the ship with the Hand rising from a hub beneath it.
    body.appendChild(hairline());

    // Difficulty: four words in a row, the live one bright, its sentence beneath. A hidden <select>
    // (#sf-ng-difficulty) mirrors the choice for the checks and probes that read it.
    const diffField = field(coreText('difficulty'));
    diffField.label.id = 'sf-ng-difficulty-label';
    const diff = el('select');
    diff.id = 'sf-ng-difficulty';
    diff.hidden = true; diff.tabIndex = -1; diff.setAttribute('aria-hidden', 'true');
    DIFFICULTIES.forEach(([val, txt]) => { const o = el('option', '', txt); o.value = val; if (val === DEFAULT_DIFFICULTY) o.selected = true; diff.appendChild(o); });
    const diffWords = words(DIFFICULTIES.map(([val, txt]) => ({ action: 'difficulty:' + val, label: txt })), {
      row: true, size: 'body', ariaLabel: coreText('difficulty'),
      onPick: (action) => this._setDifficulty(action.slice('difficulty:'.length)),
    });
    diffWords.setAttribute('aria-labelledby', diffField.label.id);
    diffWords.classList.add('of-pause');
    for (const b of diffWords.querySelectorAll('.k-word')) railWord(b);
    const diffDesc = el('p', 'k-sentence', '');
    diffDesc.id = 'sf-ng-difficulty-desc';
    diffWords.setAttribute('aria-describedby', diffDesc.id);
    diffField.wrap.appendChild(diffWords);
    diffField.wrap.appendChild(diff);
    diffField.wrap.appendChild(diffDesc);
    body.appendChild(diffField.wrap);
    // ORRERY: difficulty is a four-stop scale with the amber index.
    if (ORRERY) this._diffDial = createStopScale({ row: diffWords, width: 470 });
    body.appendChild(hairline());

    // Arrow bridges for the Tab-invisible starter row: Down from the pilot name or Up from the
    // difficulty row lands on the live starter word, and the row's own Up/Down steps back out.
    const liveWordIn = (list) => {
      const all = list ? Array.from(list.querySelectorAll('.k-word')) : [];
      return all.find((b) => b.getAttribute('aria-pressed') === 'true') || all[0] || null;
    };
    name.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = liveWordIn(starterWords);
      if (!target) return;
      e.preventDefault();
      target.focus();
    });
    starterWords.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); name.focus(); }
      else if (e.key === 'ArrowDown') {
        const target = liveWordIn(diffWords);
        if (!target) return;
        e.preventDefault();
        target.focus();
      }
    });
    diffWords.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = liveWordIn(starterWords);
      if (!target) return;
      e.preventDefault();
      target.focus();
    });
    // Once focus leaves the starter row, park every word's Tab stop again — the row's roving
    // focusin marks the entered word tabbable, and the six-stop launch traversal must stay
    // exact even after someone has visited the picker.
    starterWords.addEventListener('focusout', (e) => {
      if (e.relatedTarget && starterWords.contains(e.relatedTarget)) return;
      for (const b of starterWords.querySelectorAll('.k-word')) b.tabIndex = -1;
    });

    // Seed. A real player feature — a shareable, reproducible universe — and the ONLY way to make
    // the run's procedural content repeatable. Board offers are drawn from
    // `hash32(state.meta.seed, ...)` (missions.js `_generateOffers`), so the seed already decides
    // which contracts, commodities and destinations a save will ever see. Blank means "surprise me"
    // and keeps the random behaviour; `game:new` carries opts and `resetRunState` honours `opts.seed`.
    const seedField = field('Universe seed', 'sf-ng-seed');
    const seedRow = el('div', 'k-words k-words--row of-pause');
    const seed = el('input', 'k-input k-t-fine');
    seed.id = 'sf-ng-seed';
    seed.type = 'text';
    seed.inputMode = 'numeric';
    seed.maxLength = 10;
    seed.placeholder = 'Random';
    seed.spellcheck = false; seed.autocomplete = 'off';
    seed.setAttribute('aria-describedby', 'sf-ng-seed-desc');
    paintInput(seed);
    const newSeed = el('button', 'k-word k-word--fine', 'New seed');
    newSeed.type = 'button'; newSeed.dataset.action = 'newSeed';
    paintKey(newSeed, 'small');
    newSeed.addEventListener('click', () => { if (launching) return; seed.value = randomSeedText(ctx); cue('confirm'); });
    seedRow.appendChild(seed); seedRow.appendChild(newSeed);
    seedField.wrap.appendChild(seedRow);
    const seedDesc = el('p', 'k-t-fine k-38', ORRERY
      ? 'Blank is a random universe; a seed always deals the same contracts and markets.'
      : 'Leave blank for a random universe. The same seed always produces the same contracts and markets.');
    seedDesc.id = 'sf-ng-seed-desc';
    seedField.wrap.appendChild(seedDesc);
    body.appendChild(seedField.wrap);
    body.appendChild(hairline());

    // New Run+ is opt-in and read-only until Launch. The save owner revalidates this exact slot and
    // selection at the transition boundary; the UI never copies a whole prior run into the event.
    const newGamePlusCandidate = readNewGamePlusCandidate(ctx);
    let legacyOn = false;
    let legacyWords = null;
    let legacySelect = null;
    if (newGamePlusCandidate) {
      const legacyField = field('New Run+');
      legacyField.label.id = 'sf-ng-legacy-label';
      legacyWords = words([
        { action: 'legacy:off', label: 'Off' },
        { action: 'legacy:on', label: 'On' },
      ], {
        row: true, size: 'body', ariaLabel: 'New Run+',
        onPick: (action) => {
          legacyOn = action === 'legacy:on';
          for (const b of legacyWords.querySelectorAll('.k-word')) b.setAttribute('aria-pressed', String((b.dataset.action === 'legacy:on') === legacyOn));
          legacySelect.disabled = !legacyOn || launching;
          syncKeys(legacyWords);
        },
      });
      legacyWords.setAttribute('aria-labelledby', legacyField.label.id);
      legacyWords.classList.add('of-pause');
      for (const b of legacyWords.querySelectorAll('.k-word')) {
        b.setAttribute('aria-pressed', String(b.dataset.action === 'legacy:off'));
        paintKey(b, 'legend');
      }
      legacyField.wrap.appendChild(legacyWords);
      const meta = el('p', 'k-t-fine k-38', leftoverNewRunLine(newGamePlusCandidate));
      meta.id = 'sf-ng-legacy-desc';
      legacyField.wrap.appendChild(meta);
      const keepsakeLabel = el('label', 'k-t-fine k-38', 'Carried keepsake');
      keepsakeLabel.htmlFor = 'sf-ng-legacy-keepsake';
      legacyField.wrap.appendChild(keepsakeLabel);
      legacySelect = el('select', 'k-select');
      legacySelect.id = 'sf-ng-legacy-keepsake';
      legacySelect.disabled = true;
      legacySelect.setAttribute('aria-describedby', 'sf-ng-legacy-desc');
      paintInput(legacySelect);
      for (const item of newGamePlusCandidate.keepsakes || []) {
        const option = el('option', '', `${item.unique ? 'Relic · ' : ''}${item.name} · ${item.size || '?'} ${item.slotType}`);
        option.value = item.defId;
        legacySelect.appendChild(option);
      }
      legacyField.wrap.appendChild(legacySelect);
      body.appendChild(legacyField.wrap);
      body.appendChild(hairline());
    }

    // Loadout: the picked starter's fitted modules as quiet words. Not buttons — nothing here
    // is chosen; the starter row above is the picker and rewrites this list on every pick.
    const loadoutField = field('Loadout');
    const loadout = el('ul', 'k-words k-words--row');
    loadout.setAttribute('aria-label', 'Loadout');
    const renderLoadout = (starter) => {
      loadout.innerHTML = '';
      for (const [slot, moduleName] of starterLoadoutRows(starter)) {
        const li = el('li');
        const word = el('span', 'k-t-body k-62 fh-legend', moduleName);
        if (ORRERY) {
          const m = /^(.*\S)\s+([SMLX]{1,2})$/.exec(String(moduleName));
          if (m) { word.textContent = m[1]; const size = el('small', 'orr-ng-size', m[2]); size.title = 'Size ' + m[2]; word.appendChild(size); }
        }
        word.setAttribute('aria-disabled', 'true');
        word.title = slot;
        paintLegend(word);
        li.appendChild(word);
        loadout.appendChild(li);
      }
    };
    loadoutField.wrap.appendChild(loadout);
    body.appendChild(loadoutField.wrap);
    body.appendChild(hairline());

    // The first fifteen minutes: four static rows under the loadout.
    const route = el('div', 'sf-ng-route');
    route.setAttribute('aria-label', coreText('firstMinutes'));
    route.appendChild(el('div', 'k-caps', coreText('firstMinutes')));
    const steps = el('ul', 'k-rows sf-ng-route__steps');
    steps.style.setProperty('--k-row-cols', 'minmax(0, 1fr)');
    for (const [beat, verb] of FIRST_MINUTES) {
      const row = el('li', 'k-row k-row--static sf-ng-route__step');
      pin(row, { 'box-shadow': 'none' });
      const cell = el('div');
      cell.appendChild(el('span', 'k-row__name', beat));
      cell.appendChild(el('div', 'k-row__sub', verb));
      row.appendChild(cell);
      steps.appendChild(row);
    }
    route.appendChild(steps);
    body.appendChild(route);

    // The stage: the hull in its rig, its name and its one sentence bottom-left.
    const stage = el('div', 'k-stage');
    pin(stage, { background: 'transparent', 'border-width': '0' });
    const caption = el('div', 'k-stage__foot');
    paintPlate(caption, 'edge', { 'max-width': '100%' });
    const ship = shipDefFor(ctx, DEFAULT_STARTER.shipId);
    // The hull card's name is a content header (the header voice, set by the sheet), not a title.
    const hullName = el('h2', 'k-display k-t-sub fh-title sf-slot-card-title', (ship && ship.name) || DEFAULT_STARTER.name);
    const hullBlurb = el('p', 'k-sentence', DEFAULT_STARTER.line);
    caption.appendChild(hullName);
    caption.appendChild(hullBlurb);
    stage.appendChild(caption);
    // ORRERY: the left column holds the pilot's choices; the hull's choice, what it carries, its
    // numbers and the run it opens are about the hull, so they read at the hull.
    if (ORRERY) {
      caption.append(loadoutField.wrap, route);
      // the stats as three short arcs of ice, filled against the largest of the starters
      const cards = NEW_GAME_STARTERS.map((s) => starterAirCard(s));
      const scale = { massT: Math.max(...cards.map((c) => c.massT), 1), thrust: Math.max(...cards.map((c) => c.thrust), 1), lineWuPerS: Math.max(...cards.map((c) => c.lineWuPerS), 1) };
      const stats = el('div', 'orr-ng-stats');
      stats.setAttribute('aria-hidden', 'true');
      caption.insertBefore(stats, loadoutField.wrap);
      // one ring round the hull (ORRERY 6): mass left, thrust over the top, line right; the other starters as ghosts
      const ringStats = (starter) => {
        const card = starterAirCard(starter);
        const others = NEW_GAME_STARTERS.filter((s) => s.id !== starter.id).map((s) => starterAirCard(s));
        return [['Mass', 'massT', 't'], ['Thrust', 'thrust', ''], ['Line', 'lineWuPerS', 'wu/s']].map(([name, key, unit]) => {
          const value = Number(card[key]) || 0;
          return { name, unit, reading: value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(Math.round(value)),
            frac: value / scale[key], ghosts: others.map((o) => (Number(o[key]) || 0) / scale[key]) };
        });
      };
      this._paintStats = (starter) => {
        if (this._hullRing) this._hullRing.paint(ringStats(starter));
        else paintStarterStats(stats, starterAirCard(starter), scale, NEW_GAME_STARTERS.filter((s) => s.id !== starter.id).map((s) => starterAirCard(s)));
        this._lastStarter = starter;
      };
      // on the screen itself, not the stage cell: the stage ends above the floor, and the arc has to
      // sit under the ship rather than across it
      // the hull choice as a turntable round the ship's base: the three hulls stand on its front arc
      // as their rendered hero art, the amber index riding the ring to the chosen one
      const pick = el('div', 'orr-ng-pick');
      pick.appendChild(starterField.wrap);
      rootEl.appendChild(pick);
      const art = {};
      for (const s of NEW_GAME_STARTERS) { const url = hullPosterUrl(s.shipId, 'hero'); if (url) art['starter:' + s.id] = url; }
      // a carousel: the chosen hull stands front-centre under its render, the others at the ring's rear ends
      const heroBox = el('div', 'orr-ng-hero-box');
      heroBox.setAttribute('aria-hidden', 'true');
      stage.appendChild(heroBox);
      this._starterDial = createTurntable({ row: starterWords, host: rootEl, anchor: stage, art, artWidth: 132, carousel: true, hero: '.orr-ng-hero-box' });
    }
    rootEl.appendChild(stage);
    // the hull alone inside its ring (ORRERY 6): the stage is the instrument, not a photograph of a dock
    // ORRERY: the produced poster is the hero (the live mount showed a different pose and light of the same ship)
    this.hull = createStageHull(stage, { rootEl, zoom: ORRERY ? STAGE_ZOOM_RING : STAGE_ZOOM, dock: !ORRERY, live: !ORRERY });
    if (ORRERY) {
      const statsHost = stage.querySelector('.orr-ng-stats');
      const heroBox = stage.querySelector('.orr-ng-hero-box');
      if (statsHost && heroBox) {
        statsHost.textContent = '';
        this._hullRing = createHullRing({ host: statsHost, anchor: heroBox });
        if (this._lastStarter) this._paintStats(this._lastStarter);
      }
    }

    // Foot: Back, then Launch (the one primary word) — Launch stays the LAST footer button because
    // the capture matrix, the atlas, the review probe and the localization check all reach it as
    // `.sf-ng-footer button:last`. Each is its own Tab stop. `.sf-ng-footer` / `.sf-ng-launch` are
    // inert hooks.
    // of-pause: kit.css only strips leftover k-word underlines on pause/title descendants,
    // and this write set cannot edit kit.css.
    const foot = el('footer', 'k-foot sf-ng-footer of-pause');
    pin(foot, { 'border-top': '0' });
    const footWord = (action, label, extra) => {
      const b = el('button', 'k-word k-word--emph' + (extra ? ' ' + extra : ''), label);
      b.type = 'button'; b.dataset.action = action;
      foot.appendChild(b);
      return b;
    };
    const back = footWord('back', coreText('back'), 'sf-back');
    const launch = footWord('launch', coreText('launch'), 'k-word--primary sf-ng-launch');
    paintKey(launch, 'primary');
    if (launch.childNodes) dressLampKey(launch);
    launch.addEventListener('click', () => {
      if (launch.getAttribute('aria-disabled') === 'true') { cue('deny'); return; }
      cue('confirm'); this._launch(ctx);
    });
    back.addEventListener('click', () => {
      if (back.getAttribute('aria-disabled') === 'true') { cue('deny'); return; }
      cue('confirm'); nav(ctx, 'popScreen');
    });
    rootEl.appendChild(foot);

    rootEl.appendChild(el('div', 'k-fine', 'Casual, Standard and Veteran deaths use insurance respawn. Ironman ends the run.'));

    // The word reads "Launching..." while the run boots and restores on game:startFailed.
    const setLaunching = (active) => {
      launching = !!active;
      const setWord = (b, disabled) => { if (disabled) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); };
      setWord(launch, launching);
      setWord(back, launching);
      setWord(newSeed, launching);
      name.disabled = launching;
      seed.disabled = launching;
      for (const b of starterWords.querySelectorAll('.k-word')) setWord(b, launching);
      for (const b of diffWords.querySelectorAll('.k-word')) setWord(b, launching);
      if (legacyWords) for (const b of legacyWords.querySelectorAll('.k-word')) setWord(b, launching);
      if (legacySelect) legacySelect.disabled = launching || !legacyOn;
      const launchWord = launching ? coreText('launching') : coreText('launch');
      const lampWord = launch.querySelector && launch.querySelector('.orr-lampkey__word');
      if (lampWord) lampWord.textContent = launchWord;
      else launch.textContent = launchWord;
      launch.disabled = launching;
      syncKeys(rootEl);
    };
    // Launch stops the stage hull at once (_launch) and frees its WebGL context once the loading
    // shell has faded in over the stage; freeing it earlier would pop the hull out through the
    // fading shell. A failed start hands the screen back with the hull rebuilt.
    let hullRelease = null;
    const cancelHullRelease = () => {
      if (hullRelease !== null) clearTimeout(hullRelease);
      hullRelease = null;
    };
    const restoreLaunch = () => {
      const wasLaunching = launching;
      cancelHullRelease();
      setLaunching(false);
      const hull = this.hull;
      if (!wasLaunching || !hull) return;
      const rebuilt = hull.restore();
      if (!hull.hasMount()) return;
      hull.activate(ctx);
      if (rebuilt && refs) hull.show(refs.starter.shipId, { fittings: starterStageFittings(refs.starter) });
    };
    const unsubStartFailed = ctx.bus.on('game:startFailed', restoreLaunch);
    const unsubLoading = ctx.bus.on('game:loadingProgress', () => {
      if (!launching || hullRelease !== null) return;
      hullRelease = setTimeout(() => {
        if (launching && this.hull) this.hull.release();
      }, STAGE_HULL_RELEASE_MS);
    });

    refs = {
      root: rootEl, title, body, stage, foot, name, seed, diff, diffWords, diffDesc, launch, back,
      starterWords, starterDesc, hullName, hullBlurb, renderLoadout,
      starter: DEFAULT_STARTER,
      setLaunching, unsubStartFailed, unsubLoading, cancelHullRelease, ctx,
      isLaunching: () => launching,
      legacy: () => ({ on: legacyOn, select: legacySelect, candidate: newGamePlusCandidate }),
    };
    this._setStarter(DEFAULT_STARTER.id, { silent: true });
    this._setDifficulty(DEFAULT_DIFFICULTY, { silent: true });
  },

  _setStarter(id, { silent = false } = {}) {
    if (!refs) return;
    const starter = starterById(id) || DEFAULT_STARTER;
    refs.starter = starter;
    for (const b of refs.starterWords.querySelectorAll('.k-word')) {
      b.setAttribute('aria-pressed', String(b.dataset.action === 'starter:' + starter.id));
      // Never a Tab stop: the launch traversal contract is an exact six stops, and the row is
      // reached by the Up/Down arrow bridges (or pointer) instead.
      b.tabIndex = -1;
    }
    refs.starterDesc.textContent = starter.line;
    if (this._paintStats) this._paintStats(starter);
    const ship = shipDefFor(refs.ctx, starter.shipId);
    refs.hullName.textContent = (ship && ship.name) || starter.name;
    refs.hullBlurb.textContent = starter.line;
    refs.renderLoadout(starter);
    // a poster-only stage has no mount but still shows the picked hull
    if (this.hull) {
      this.hull.show(starter.shipId, { fittings: starterStageFittings(starter) });
    }
    syncKeys(refs.starterWords);
  },

  _setDifficulty(value, { silent = false } = {}) {
    if (!refs) return;
    const d = DIFFICULTIES.find((x) => x[0] === value) || DIFFICULTIES.find((x) => x[0] === DEFAULT_DIFFICULTY);
    refs.diff.value = d[0];
    // Name the live tier in the sentence: the caption sits under the whole row, and unprefixed it
    // reads as the last row's (Ironman's) description.
    refs.diffDesc.textContent = `${d[1]} — ${d[2]}`;
    for (const b of refs.diffWords.querySelectorAll('.k-word')) {
      const live = b.dataset.action === 'difficulty:' + d[0];
      b.setAttribute('aria-pressed', String(live));
      // The row's single Tab stop is the live word; the kit's roving focus takes over inside the row.
      b.tabIndex = live ? 0 : -1;
    }
    if (!silent) refs.diff.dispatchEvent(new Event('change', { bubbles: true }));
    syncKeys(refs.diffWords);
  },

  _launch(ctx) {
    if (!refs) return;
    const launching = refs.isLaunching();
    if (launching) return;
    refs.setLaunching(true);
    // The loading shell is about to cover the stage: stop the hull drifting now. mount() frees its
    // WebGL context once the shell is opaque.
    if (this.hull) this.hull.deactivate();
    const pilot = (refs.name.value || '').trim() || 'Pilot';
    // Only forward a seed when the player actually supplied a usable one. `resetRunState`
    // requires a finite positive number and otherwise randomises, so passing NaN or 0 through
    // would silently mean "random" while looking deliberate.
    const rawSeed = parseUniverseSeed(refs.seed.value);
    const seedOpt = rawSeed == null ? {} : { seed: rawSeed };
    const legacy = refs.legacy();
    const newGamePlusOpt = legacy.on && legacy.select && legacy.select.value && legacy.candidate
      ? { newGamePlus: { slot: legacy.candidate.sourceSlot, keepsakeId: legacy.select.value } }
      : {};
    // First-run splash (spec2/03 §3): a single full-screen line on black, 2.5s, then B0.
    try { showFirstRunSplash(ctx); } catch (e) { /* non-blocking */ }
    ctx.bus.emit('game:new', {
      name: pilot,
      shipId: refs.starter.shipId,
      starter: refs.starter.id,
      difficulty: refs.diff.value,
      ...seedOpt,
      ...newGamePlusOpt,
    });
  },

  onShow(ctx) {
    if (!refs) return;
    cue('open');
    refs.setLaunching(false);
    refs.cancelHullRelease();
    if (this.hull) this.hull.restore();
    try {
      settle(refs.title, { from: 'top', state: 'newGame:open' });
      settle(refs.body, { from: 'left', state: 'newGame:open' });
      settle(refs.stage, { from: 'right', state: 'newGame:open' });
      settle(refs.foot, { from: 'bottom', state: 'newGame:open' });
    } catch (e) { /* motion is cosmetic */ }
    if (this.hull) {
      this.hull.activate(ctx);
      this.hull.show(refs.starter.shipId, { fittings: starterStageFittings(refs.starter) });
    }
    try { refs.name.focus(); refs.name.select(); } catch (e) {}
  },
  onHide() {
    cue('close');
    if (this.hull) this.hull.deactivate();
  },
  refresh() {},
  dispose() {
    if (refs && refs.cancelHullRelease) refs.cancelHullRelease();
    if (this.hull) { this.hull.dispose(); this.hull = null; }
    if (this._hullRing) { this._hullRing.dispose(); this._hullRing = null; }
    if (refs && refs.unsubStartFailed) { try { refs.unsubStartFailed(); } catch (e) {} }
    if (refs && refs.unsubLoading) { try { refs.unsubLoading(); } catch (e) {} }
    refs = null;
  },
};
