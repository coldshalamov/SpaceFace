// The Crucible door (PQ-133 / CRU-018) and the run results surface.
//
// The door picks a hull and a seed and launches through the ordinary New Game route
// (src/ui/crucibleLaunch.js). The results surface explains how the run ended and offers the same
// seed again. Neither writes state.run, the phase, or a fitting.
//
// The door is Field Hardware POSTER: stencil title, imaged selector tiles, smoked window over the
// arena, engraved seed, one hazard Launch key. Results stay a story: a hero number, a column of
// sentences, the build as fine print. This file owns no stylesheet; hardware is produced kit
// sprites pinned on the elements. The DOM is built with `el` + appendChild only, because the
// results unit test mounts the plate against a minimal fake document.

import { COMBAT_LAB_ARENAS, COMBAT_LAB_STARTER_PACKAGES } from '../../data/combatLabSetups.js';
import { WEAPONS } from '../../data/weapons.js';
import {
  CRUCIBLE_ARENA_ID,
  CRUCIBLE_DEFAULT_RULESET,
  crucibleSetupFor,
  crucibleStarterIdForSetup,
  lastCrucibleRuleset,
  lastCrucibleSetup,
  normalizeSeed,
  requestCrucibleRun,
} from '../crucibleLaunch.js';
import { SURVIVAL_UNLOCK_CATALOG } from '../../data/survivalUnlocks.js';
import {
  buildCodeFor,
  buildNameFor,
} from '../../systems/survivalResults.js';
import {
  SWARM_DRAFT_EVERY,
  SWARM_REFIT_EVERY,
  SWARM_RULESET,
} from '../../data/swarmMode.js';
import { survivalArenaById } from '../../data/survivalArenas.js';
import { SURVIVAL_RUN_WAVE_COUNT } from '../../systems/survivalRun.js';
import {
  dailySeedForNow,
  ghostRaceOffer,
  lastGhostRowByHash,
  loadCrucibleMeta,
  utcDateKeyNow,
  weeklyMutatorForNow,
} from '../../systems/survivalRecords.js';
import {
  applyRunShareCode,
  ghostShareForRun,
  importGhostShareText,
  runShareCodeForRun,
  shareTextHref,
} from './shareCode.js';
import { SURVIVAL_MUTATOR_BY_ID } from '../../data/survivalMutators.js';
import { clearQueuedChallenge, queueGhostPlayback, queueSurvivalChallenge } from '../../systems/survivalMutators.js';
import { meetsUnlockCondition } from '../../systems/survivalUnlocks.js';
import { compileAttackSpec } from '../../combat/attackSpec.js';
import { causalKindsFromSpec } from '../../systems/adventureMigration.js';
import { comboSummary } from '../../systems/stuntCombo.js';
import { el, settle, stamp, cue } from '../kit/index.js';

const FH_KEY = {
  primary: { file: 'key.primary', width: '18px', minW: '132px', minH: '44px', pad: '0 16px', font: '16px' },
  hazard: { file: 'key.hazard', width: '18px', minW: '280px', minH: '72px', pad: '0 22px', font: '20px' },
  legend: { file: 'key.legend', width: '14px', minW: '72px', minH: '32px', pad: '0 10px', font: '12px' },
  small: { file: 'key.small', width: '12px', minW: '88px', minH: '36px', pad: '0 10px', font: '12px' },
};
function kitUrl(rel) {
  try { return new URL('../../../assets/ui/kit/' + rel, import.meta.url).href; }
  catch { return 'assets/ui/kit/' + rel; }
}
function fhUrl(rel) {
  return kitUrl('assets/' + rel);
}
function forcedColorsActive() {
  return typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches;
}
function pin(node, props) {
  if (!node || !node.style || typeof node.style.setProperty !== 'function') return node;
  for (const name of Object.keys(props)) node.style.setProperty(name, props[name], 'important');
  return node;
}
function paintMarking(node) {
  if (!node) return node;
  if (node.classList && typeof node.classList.add === 'function') node.classList.add('fh-title');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 900, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'text-transform': 'uppercase',
    'line-height': '0.9',
    'font-size': 'clamp(72px, 12vw, 160px)',
    color: 'var(--fh-text)',
    margin: '0',
  });
}
function paintLegend(node, lit = false) {
  if (!node) return node;
  if (node.classList && typeof node.classList.add === 'function') node.classList.add('fh-legend');
  if (typeof node.setAttribute === 'function' && !node.getAttribute('data-fh-lit')) {
    node.setAttribute('data-fh-lit', lit ? 'on' : 'off');
  }
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 600, 'wdth' 62",
    'letter-spacing': 'var(--fh-track-legend)',
    'text-transform': 'uppercase',
    'font-size': 'var(--fh-size-fine)',
    color: lit ? 'var(--fh-legend-lit, var(--fh-legend))' : 'var(--fh-legend-rest, var(--fh-legend))',
    margin: '0',
  });
}
function paintWindow(node) {
  if (!node) return node;
  if (node.classList && typeof node.classList.add === 'function') node.classList.add('fh-window', 'fh-window--deep');
  if (forcedColorsActive()) {
    return pin(node, { 'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid', background: 'transparent' });
  }
  return pin(node, {
    'border-style': 'solid',
    'border-width': '20px',
    'border-image-source': 'url("' + fhUrl('windows/window.glass.deep.png') + '")',
    'border-image-slice': '20 fill',
    'border-image-repeat': 'stretch',
    'border-image-width': '20px',
    'box-sizing': 'border-box',
    padding: '12px 16px',
    background: 'transparent',
  });
}
function paintInput(input) {
  if (!input) return input;
  if (input.classList && typeof input.classList.add === 'function') input.classList.add('fh-input');
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(input, { 'border-image-source': 'none', 'border-bottom': '1px solid CanvasText', background: 'transparent' });
      return;
    }
    pin(input, {
      'border-style': 'solid',
      'border-width': '12px',
      'border-image-source': 'url("' + fhUrl('controls/input.underline.' + state + '.png') + '")',
      'border-image-slice': '12 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '12px',
      background: 'transparent',
      color: 'var(--fh-text)',
      'min-height': '40px',
      padding: '0 8px',
      'box-sizing': 'border-box',
      'font-family': 'var(--fh-face-display)',
      'font-variation-settings': "'wght' 800, 'wdth' 125",
      'font-size': 'var(--fh-size-menu, 40px)',
      'font-variant-numeric': 'tabular-nums',
    });
  };
  apply('rest');
  if (input.dataset && input.dataset.fhBound !== '1') {
    input.dataset.fhBound = '1';
    input.addEventListener('focus', () => apply('focus'));
    input.addEventListener('blur', () => apply('rest'));
  }
  return input;
}
function paintKey(button, kind = 'legend') {
  if (!button) return button;
  const spec = FH_KEY[kind] || FH_KEY.legend;
  if (button.classList && typeof button.classList.add === 'function') {
    button.classList.add('k-word', 'fh-key', 'fh-key--' + kind);
  }
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(button, {
        'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
        background: 'transparent', color: 'CanvasText',
      });
      return;
    }
    pin(button, {
      display: 'inline-flex',
      width: 'max-content',
      'max-width': '100%',
      'min-width': spec.minW,
      'min-height': spec.minH,
      padding: spec.pad,
      'font-size': spec.font,
      'font-family': 'var(--fh-face-display)',
      'font-variation-settings': "'wght' 600, 'wdth' 62",
      'letter-spacing': 'var(--fh-track-legend)',
      'text-transform': 'uppercase',
      'justify-content': 'center',
      'align-items': 'center',
      'box-sizing': 'border-box',
      background: 'transparent',
      color: 'var(--fh-text)',
      'border-style': 'solid',
      'border-width': spec.width,
      'border-image-source': 'url("' + fhUrl('keys/' + spec.file + '.' + state + '.png') + '")',
      'border-image-slice': parseInt(spec.width, 10) + ' fill',
      'border-image-repeat': 'stretch',
      'border-image-width': spec.width,
    });
  };
  const sync = () => {
    const disabled = button.getAttribute && (button.getAttribute('aria-disabled') === 'true' || button.disabled);
    apply(disabled ? 'disabled' : (kind === 'legend' && button.getAttribute && button.getAttribute('aria-pressed') === 'true' ? 'lit' : 'rest'));
  };
  button._fhSync = sync;
  if (!(button.dataset && button.dataset.fhBound === '1')) {
    if (button.dataset) button.dataset.fhBound = '1';
    if (typeof button.addEventListener === 'function') {
      button.addEventListener('pointerenter', () => {
        if (button.getAttribute && (button.getAttribute('aria-disabled') === 'true' || button.disabled)) return;
        apply('hover');
      });
      button.addEventListener('pointerleave', sync);
      button.addEventListener('pointerdown', () => {
        if (button.getAttribute && (button.getAttribute('aria-disabled') === 'true' || button.disabled)) return;
        apply('pressed');
      });
      button.addEventListener('pointerup', sync);
    }
  }
  sync();
  return button;
}
function paintTile(button, selected) {
  if (!button) return button;
  if (button.classList && typeof button.classList.add === 'function') button.classList.add('fh-tile');
  const src = selected ? fhUrl('windows/window.viewport.png') : fhUrl('windows/window.glass.png');
  if (forcedColorsActive()) {
    return pin(button, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', color: 'CanvasText',
    });
  }
  return pin(button, {
    display: 'grid',
    'grid-template-rows': '1fr auto',
    width: '132px',
    'min-width': '132px',
    'min-height': '116px',
    padding: '0',
    cursor: 'pointer',
    'box-sizing': 'border-box',
    background: 'transparent',
    color: selected ? 'var(--fh-text)' : 'var(--fh-text-resting)',
    'border-style': 'solid',
    'border-width': '20px',
    'border-image-source': 'url("' + src + '")',
    'border-image-slice': '20 fill',
    'border-image-repeat': 'stretch',
    'border-image-width': '20px',
  });
}
function choiceTile(label, className, artSrc) {
  const button = el('button', 'fh-tile ' + className);
  button.type = 'button';
  const art = el('span', 'fh-tile-art');
  const img = el('img');
  img.src = artSrc;
  img.alt = '';
  if (typeof img.setAttribute === 'function') img.setAttribute('aria-hidden', 'true');
  pin(img, { width: '48px', height: '48px', 'object-fit': 'contain' });
  art.appendChild(img);
  button.appendChild(art);
  button.appendChild(el('span', 'fh-tile-legend', label));
  paintTile(button, false);
  return button;
}
function syncChoice(button, on) {
  if (!button || typeof button.setAttribute !== 'function') return;
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-selected', String(on));
  button.setAttribute('aria-checked', String(on));
  paintTile(button, on);
}

const MODE_TILE = Object.freeze({
  swarm: 'assets/tiles/tile.mode.swarm.png',
  scored: 'assets/tiles/tile.mode.gauntlet.png',
});
const HULL_ICON = Object.freeze({
  web_weaver: 'icons/48/icon-line.svg',
  ricochet_runner: 'icons/48/icon-boost.svg',
  energy_baseline: 'icons/48/icon-energy.svg',
  kinetic_baseline: 'icons/48/icon-weapon.svg',
  physics_toolkit: 'icons/48/icon-well.svg',
  massline_rig: 'icons/48/icon-tow.svg',
});
const ARENA_TILE = Object.freeze({
  helios_core: 'assets/tiles/tile.arena.ricochet-foundry.png',
  lagrange_crucible: 'assets/tiles/tile.arena.lagrange-crucible.png',
  cinder_sluice: 'assets/tiles/tile.arena.cinder-sluice.png',
  cryo_drift: 'assets/tiles/tile.arena.cryo-drift.png',
  storm_lattice: 'assets/tiles/tile.arena.storm-lattice.png',
});

/** A kit word (`button.k-word`). The caller appends it. */
function word(label, className) {
  const button = el('button', 'k-word' + (className ? ' ' + className : ''), label);
  button.type = 'button';
  return button;
}

/** A kit hero block built without `append` (the results test's fake document has appendChild only). */
function heroBlock(number, text, className) {
  const block = el('div', 'k-hero' + (className ? ' ' + className : ''));
  block.appendChild(el('div', 'k-hero__n', number));
  if (text) block.appendChild(el('div', 'k-hero__w', text));
  return block;
}

/** A static kit row: a name (with an optional sub line) and a number. */
function staticRow(name, value, { sub = '', valueClass = '', className = '' } = {}) {
  const row = el('li', 'k-row k-row--static' + (className ? ' ' + className : ''));
  const left = el('div');
  left.appendChild(el('span', 'k-row__name', name));
  if (sub) left.appendChild(el('div', 'k-row__sub', sub));
  row.appendChild(left);
  row.appendChild(el('span', 'k-row__num' + (valueClass ? ' ' + valueClass : ''), value));
  return row;
}

/** Guarded kit motion: the unit tests mount these screens under a fake document with no frame clock. */
function canAnimate() {
  return typeof requestAnimationFrame === 'function' && typeof document !== 'undefined'
    && typeof document.createElement === 'function' && typeof HTMLElement === 'function';
}

function hullBlurb(starter) {
  if (starter.blurb) return starter.blurb;
  const count = Array.isArray(starter.loadout) ? starter.loadout.length : 0;
  return `${starter.hullId.replace(/^ship_/, '')} · ${count} hardpoint${count === 1 ? '' : 's'} fitted`;
}

/** A fresh seed for the door. UI-only: the sim's determinism starts once the seed is chosen. */
function freshSeed() {
  const now = Date.now() >>> 0;
  return normalizeSeed((now ^ (now >>> 13) ^ 0x9e3779b9) >>> 0);
}

function arenaName() {
  const arena = survivalArenaById(CRUCIBLE_ARENA_ID);
  return arena && arena.label ? arena.label : CRUCIBLE_ARENA_ID;
}

/* --- THE RECORD BAND ------------------------------------------------------------------------
   The Crucible's answer to "why come back". The map's phase-10 exit gate asks for reasons to
   replay beyond raw score AND for a fresh account to stay competitive, and those two pull against
   each other unless the reward is possibility rather than power. Every unlock in the catalog is
   zero on all seven power axes, so this band shows the SHAPE of what is still closed and the exact
   condition that opens it. A returning player gets more ways to play and not one point of damage.
   ------------------------------------------------------------------------------------------- */

/**
 * Phrase the earn condition as the thing the player would go and do.
 *
 * Every kind the catalog actually uses gets a real sentence. The generic fallback exists only so a
 * kind added later still renders something, and a test fails if a live kind ever reaches it — a
 * player reading "pick and waves 10" has been told nothing.
 *
 * Note the two different keys: pick_and_waves carries minWaves, the rest carry min. Reading only
 * `min` printed "clear wave 0" for four of the five starters.
 */
export function unlockConditionText(entry) {
  if (!entry) return '';
  if (entry.defaultUnlocked) return 'open from the start';
  const earn = entry.earn;
  if (!earn || typeof earn !== 'object') return 'condition not yet set';
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  switch (earn.kind) {
    case 'pick_and_waves': {
      const waves = num(earn.minWaves != null ? earn.minWaves : earn.min);
      return earn.verb ? `run ${earn.verb} to wave ${waves}` : `run it to wave ${waves}`;
    }
    case 'waves_cleared': return `clear wave ${num(earn.min)}`;
    case 'deepest_wave': return `reach wave ${num(earn.min)}`;
    case 'authored_victory': return 'win the authored run';
    case 'victory_and_physics_pick': return 'win with a physics verb';
    default: return `${String(earn.kind).replace(/_/g, ' ')} ${num(earn.min)}`;
  }
}

/** One row per catalog entry: is it open, and if not, what opens it. Stable, catalog-ordered. */
export function unlockLadderRows(profile) {
  const owned = (profile && profile.unlocks) || {};
  const stats = (profile && profile.records) || null;
  return SURVIVAL_UNLOCK_CATALOG.map((entry) => {
    let open = !!entry.defaultUnlocked || !!owned[entry.id];
    if (!open && stats) {
      // Ask the systems layer rather than re-deriving the rule here; a second copy would drift.
      try { open = !!meetsUnlockCondition(entry, profile); } catch { open = false; }
    }
    return {
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      blurb: entry.blurb,
      open,
      condition: open ? '' : unlockConditionText(entry),
    };
  });
}

/** The lifetime figures, each keeping its own word. */
export function lifetimeFigures(profile) {
  const life = (profile && profile.records && profile.records.lifetime) || {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return [
    { key: 'runs', label: 'Runs', value: n(life.runs) },
    { key: 'victories', label: 'Won', value: n(life.victories) },
    { key: 'deepestWave', label: 'Deepest', value: n(life.deepestWave) },
    { key: 'bestScore', label: 'Best score', value: n(life.bestScore) },
    { key: 'bestKills', label: 'Best kills', value: n(life.bestKills) },
  ];
}

/** Today's daily board row as the band shows it. Missing row → null (the band omits it). */
export function todayBoardFigures(profile, dateKey) {
  const daily = profile && profile.daily && typeof profile.daily === 'object' ? profile.daily : null;
  const byDate = daily && daily.byDate && typeof daily.byDate === 'object' ? daily.byDate : null;
  const row = byDate && dateKey ? byDate[dateKey] : null;
  if (!row || typeof row !== 'object') return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    label: 'Today',
    score: n(row.bestScore),
    wave: n(row.deepestWave),
  };
}

const OUTCOME_WORD = Object.freeze({ victory: 'WON', defeat: 'LOST', aborted: 'LEFT' });

/** The most recent runs, newest first. Reads history as stored; never re-sorts by score. */
export function recentRunRows(profile, limit = 5) {
  const hist = (profile && Array.isArray(profile.history)) ? profile.history : [];
  return hist.slice(0, Math.max(0, limit)).map((run) => ({
    outcome: OUTCOME_WORD[run && run.outcome] || String((run && run.outcome) || '—').toUpperCase(),
    wave: Number(run && run.wave) || 0,
    score: Number(run && run.score) || 0,
    arena: (run && run.arenaId) || '',
  }));
}

/**
 * The record's figures for the door's corner: today's board when it exists, then the lifetime
 * figures, each a small hero (number over word).
 */
function renderRecordCorner(profile, dateKey) {
  const corner = el('aside', 'k-corner sf-crd-rec');
  corner.setAttribute('aria-label', 'Your record');
  const today = todayBoardFigures(profile, dateKey);
  if (today) {
    corner.appendChild(heroBlock(String(today.score), 'today · score', 'sf-crd-fig'));
    corner.appendChild(heroBlock(String(today.wave), 'today · wave', 'sf-crd-fig'));
  }
  for (const f of lifetimeFigures(profile)) {
    corner.appendChild(heroBlock(String(f.value), f.label.toLowerCase(), 'sf-crd-fig'));
  }
  return corner;
}

/**
 * The unlock ladder and the recent runs, as kit rows under the three settings. Closed first — the
 * band exists to show what is still ahead, so the answer sits at the top.
 */
function renderRecordRows(profile) {
  const band = el('div', 'sf-crd-rec__rows');
  const rows = unlockLadderRows(profile);
  const openCount = rows.filter((r) => r.open).length;
  // The heading and the figure must count the same thing. "Still to open" beside "1 / 14" read as
  // one-of-fourteen-remaining when it meant one-of-fourteen-open — the label and the number were
  // describing opposite sets.
  band.appendChild(el('p', 'k-caps', `Unlocks · ${openCount} of ${rows.length} open`));
  const ladder = el('ul', 'k-rows sf-crd-ladder');
  ladder.setAttribute('role', 'list');
  const ordered = [...rows.filter((r) => !r.open), ...rows.filter((r) => r.open)];
  for (const r of ordered) {
    // A glyph, not colour alone: forced-colors and colour-blind readers get the same answer.
    const row = staticRow(`${r.open ? '+' : '·'} ${r.label}`, r.open ? 'open' : r.condition, {
      sub: r.blurb || '',
      valueClass: 'k-t-fine ' + (r.open ? 'k-38' : 'k-62'),
      className: `sf-crd-lock ${r.open ? 'is-open' : 'is-shut'}`,
    });
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', `${r.label}. ${r.open ? 'Open.' : 'Closed — ' + r.condition + '.'}`);
    ladder.appendChild(row);
  }
  band.appendChild(ladder);

  const runs = recentRunRows(profile);
  band.appendChild(el('p', 'k-caps', 'Recent runs'));
  if (runs.length) {
    const list = el('ul', 'k-rows sf-crd-runs');
    for (const r of runs) {
      list.appendChild(staticRow(`${r.outcome.toLowerCase()} · wave ${r.wave}`, String(r.score), { className: 'sf-crd-run' }));
    }
    band.appendChild(list);
  } else {
    band.appendChild(el('p', 'k-sentence sf-crd-none', 'No runs recorded yet. The first one starts the record.'));
  }
  return band;
}

/**
 * The two rulesets behind one door. Swarm is first and is the default: it is the fast game — the
 * room never empties, the wave rolls on a kill count, and only every fifth wave stops for an
 * upgrade. Gauntlet is the authored thirty-wave arc, kept because it asks a different question.
 */
const CRUCIBLE_MODE_CARDS = Object.freeze([
  {
    ruleset: SWARM_RULESET,
    label: 'Swarm',
    verb: 'Launch Swarm',
    blurb: 'Bring the swarm. Turn the room against it.',
    sub: 'Clear a round. Spend the spoils or save for a bigger toy. Push your build as far as it goes.',
  },
  {
    ruleset: 'scored',
    label: 'Gauntlet',
    verb: 'Enter the Gauntlet',
    blurb: 'Thirty authored waves in three acts. One question per wave.',
    sub: 'Thirty waves in three acts. Every wave you rearm; every ten you refit. '
      + 'Nothing you earn here follows you home.',
  },
]);

const DAILY_CARD = Object.freeze({
  label: 'Daily',
  verb: 'Play today',
  blurb: 'The same seed for everyone, today.',
  sub: 'One seed for the whole day. Same run on every machine. Nothing you earn here follows you home.',
});

const GHOST_CARD = Object.freeze({
  label: 'Ghost',
  blurbOn: 'Race the last recorded hull for this seed.',
  blurbOff: 'No ghost for this seed yet.',
});

function weeklyDoorCard() {
  const id = weeklyMutatorForNow();
  const def = id ? SURVIVAL_MUTATOR_BY_ID[id] : null;
  const name = def && def.label ? def.label : 'Weekly';
  const blurb = def && def.blurb ? def.blurb : 'This week\'s twist is locked to UTC.';
  return {
    id,
    label: 'Weekly',
    name,
    blurb: `${name}. ${blurb}`,
    sub: `${name}. ${blurb} Locked for this UTC week. Nothing you earn here follows you home.`,
  };
}

export const crucibleScreen = {
  id: 'crucible',

  // The foundry running hot behind the door (design/frontend/direction/approved/frames/
  // frame-crucible-door.png). ScreenManager turns this into state.ui.stageRequest while the door is
  // on top, and owns this root's data-k-ready with it — the door is ready when the arena is lit.
  stage: { scene: 'arena-foundry' },

  mount(rootEl, ctx) {
    let enterButton = null;
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-crucible-door', 'of-crucible-door');
    rootEl.dataset.kReady = '0';
    rootEl.dataset.stamp = 'CRUCIBLE / SURVIVAL';
    rootEl.setAttribute('data-fh-register', 'poster');
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-title');
    pin(rootEl, { background: 'transparent' });

    const previous = lastCrucibleSetup();
    let starterId = crucibleStarterIdForSetup(previous);
    let arenaId = previous?.arenaId || CRUCIBLE_ARENA_ID;
    let ruleset = previous ? lastCrucibleRuleset() : CRUCIBLE_DEFAULT_RULESET;
    let daily = !!(previous && previous.dailyDateKey);
    if (daily) ruleset = SWARM_RULESET;
    let weekly = !!(previous && previous.weeklyMutatorId);
    let freeSeed = previous && !previous.dailyDateKey ? String(previous.seed) : null;
    let doorProfile = null;
    try { doorProfile = loadCrucibleMeta(); } catch { doorProfile = null; }
    let raceGhost = !!(previous && previous.ghostHash);
    // PQ-160.02: a pasted run code's challenge terms ride to launch through here.
    let pendingShare = null;

    // .k-title — stencil marking and the live mode's blurb (syncMode writes it).
    const title = el('header', 'k-title');
    const h = el('h1', 'k-display k-t-name fh-hero', 'Crucible');
    h.id = 'sf-crucible-title';
    paintMarking(h);
    title.appendChild(h);
    const sub = el('p', 'k-t-emph k-62 sf-crd-sub fh-legend', '');
    paintLegend(sub, true);
    title.appendChild(sub);
    rootEl.appendChild(title);

    // .k-stage — Mode, Hull and Seed as imaged tiles inside a smoked window.
    const stage = el('section', 'k-stage fh-window fh-window--deep');
    paintWindow(stage);
    const settings = el('ul', 'k-rows sf-crd-settings');
    settings.style.setProperty('--k-row-cols', 'auto minmax(0, 1fr)');
    settings.setAttribute('aria-label', 'Run settings');
    stage.appendChild(settings);

    function settingRow(label, hook) {
      const row = el('li', 'k-row k-row--static ' + hook);
      const cap = el('span', 'k-row__name k-62 fh-legend', label);
      paintLegend(cap, true);
      row.appendChild(cap);
      const body = el('div');
      row.appendChild(body);
      settings.appendChild(row);
      return body;
    }

    // THE MODE COMES FIRST, because it is the biggest difference between two runs — bigger than
    // the hull and much bigger than the seed. Swarm leads: it is what the Crucible is.
    // Daily sits beside the two rulesets as its own control (not a third .sf-crd-mode) so the
    // existing two-mode door check still sees Swarm/Gauntlet as the ruleset pair. Weekly is the
    // same kind of sibling: it locks this UTC week's mutator without becoming a fourth ruleset.
    const modeBody = settingRow('Mode', 'sf-crd-row--mode');
    const modes = el('ul', 'k-words k-words--row sf-crd-modes fh-cluster');
    modes.setAttribute('aria-label', 'Mode');
    pin(modes, { gap: '10px', 'align-items': 'stretch', 'flex-wrap': 'wrap' });
    const modeButtons = [];
    let dailyButton = null;
    const addWord = (list, button) => {
      const li = el('li');
      li.appendChild(button);
      list.appendChild(li);
      return button;
    };
    for (const entry of CRUCIBLE_MODE_CARDS) {
      const card = choiceTile(entry.label, 'sf-crd-mode', kitUrl(MODE_TILE[entry.ruleset] || MODE_TILE.swarm));
      card.dataset.ruleset = entry.ruleset;
      syncChoice(card, !daily && entry.ruleset === ruleset);
      card.addEventListener('click', () => {
        if (daily) {
          daily = false;
          if (freeSeed) seedInput.value = freeSeed;
        }
        ruleset = entry.ruleset;
        for (const other of modeButtons) syncChoice(other, other.dataset.ruleset === ruleset);
        if (dailyButton) syncChoice(dailyButton, false);
        cue('confirm');
        syncMode();
      });
      modeButtons.push(card);
      addWord(modes, card);
    }
    dailyButton = choiceTile(DAILY_CARD.label, 'sf-crd-daily', kitUrl('assets/tiles/tile.mode.daily.png'));
    syncChoice(dailyButton, daily);
    dailyButton.addEventListener('click', () => {
      if (!daily) freeSeed = seedInput.value;
      daily = true;
      ruleset = SWARM_RULESET;
      for (const other of modeButtons) syncChoice(other, false);
      syncChoice(dailyButton, true);
      cue('confirm');
      syncMode();
    });
    addWord(modes, dailyButton);
    // PQ-169.02: weekly rotation is local. No live-ops feed.
    const weeklyCard = weeklyDoorCard();
    const weeklyButton = choiceTile(weeklyCard.label, 'sf-crd-weekly', kitUrl('assets/tiles/tile.mode.weekly.png'));
    syncChoice(weeklyButton, weekly);
    weeklyButton.addEventListener('click', () => {
      weekly = !weekly;
      syncChoice(weeklyButton, weekly);
      cue('confirm');
      syncMode();
    });
    addWord(modes, weeklyButton);
    const ghostButton = choiceTile(GHOST_CARD.label, 'sf-crd-ghost', kitUrl('assets/tiles/tile.mode.ghost.png'));
    ghostButton.addEventListener('click', () => {
      const offer = currentGhostOffer();
      if (!offer.available) {
        raceGhost = false;
        cue('deny');
        syncGhost();
        return;
      }
      raceGhost = !raceGhost;
      cue('confirm');
      syncGhost();
    });
    addWord(modes, ghostButton);
    modeBody.appendChild(modes);
    // The mode's sentence, and beneath it the ghost's one line.
    const modeSentence = el('p', 'k-sentence sf-crd-mode-sub', '');
    modeBody.appendChild(modeSentence);
    const ghostBlurb = el('p', 'k-t-fine k-38 sf-crd-ghost-sub', GHOST_CARD.blurbOff);
    modeBody.appendChild(ghostBlurb);

    function currentGhostOffer() {
      return ghostRaceOffer(doorProfile, normalizeSeed(seedInput ? seedInput.value : (daily ? dailySeedForNow() : 1)));
    }

    function syncGhost() {
      const offer = currentGhostOffer();
      if (!offer.available) raceGhost = false;
      ghostBlurb.textContent = offer.available ? GHOST_CARD.blurbOn : GHOST_CARD.blurbOff;
      syncChoice(ghostButton, !!(raceGhost && offer.available));
      ghostButton.setAttribute('aria-disabled', String(!offer.available));
    }

    function syncMode() {
      const week = weeklyDoorCard();
      if (daily) {
        sub.textContent = DAILY_CARD.blurb;
        modeSentence.textContent = weekly
          ? `${DAILY_CARD.sub} This week: ${week.name}. ${week.blurb}`
          : DAILY_CARD.sub;
        if (enterButton) enterButton.textContent = weekly ? `Play ${week.name}` : DAILY_CARD.verb;
        seedInput.readOnly = true;
        seedInput.setAttribute('aria-readonly', 'true');
        seedInput.value = String(dailySeedForNow());
        reroll.disabled = true;
        reroll.setAttribute('aria-disabled', 'true');
        if (typeof reroll._fhSync === 'function') reroll._fhSync();
        for (const other of modeButtons) syncChoice(other, false);
        if (dailyButton) syncChoice(dailyButton, true);
        syncGhost();
        return;
      }
      const entry = CRUCIBLE_MODE_CARDS.find((m) => m.ruleset === ruleset) || CRUCIBLE_MODE_CARDS[0];
      sub.textContent = entry.blurb;
      modeSentence.textContent = weekly ? week.sub : entry.sub;
      if (enterButton) enterButton.textContent = weekly ? `Play ${week.name}` : entry.verb;
      seedInput.readOnly = false;
      seedInput.removeAttribute('aria-readonly');
      reroll.disabled = false;
      reroll.removeAttribute('aria-disabled');
      if (typeof reroll._fhSync === 'function') reroll._fhSync();
      for (const other of modeButtons) syncChoice(other, !daily && other.dataset.ruleset === ruleset);
      if (dailyButton) syncChoice(dailyButton, false);
      syncGhost();
    }

    // Hull — the starter names as words, the live one bright, its blurb beneath.
    const hullBody = settingRow('Starter build', 'sf-crd-row--hull');
    const hulls = el('ul', 'k-words k-words--row sf-crd-hulls fh-cluster');
    hulls.setAttribute('aria-label', 'Starter build');
    pin(hulls, { gap: '10px', 'align-items': 'stretch', 'flex-wrap': 'wrap' });
    const buttons = [];
    const hullSentence = el('p', 'k-sentence sf-crd-hull-sub', '');
    function syncHull() {
      const starter = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.id === starterId) || COMBAT_LAB_STARTER_PACKAGES[0];
      hullSentence.textContent = starter ? hullBlurb(starter) : '';
      for (const other of buttons) syncChoice(other, other.dataset.starterId === starterId);
    }
    for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
      const card = choiceTile(starter.label, 'sf-crd-hull', kitUrl(HULL_ICON[starter.id] || 'icons/48/icon-hull.svg'));
      card.dataset.starterId = starter.id;
      syncChoice(card, starter.id === starterId);
      card.addEventListener('click', () => {
        starterId = starter.id;
        cue('confirm');
        syncHull();
      });
      buttons.push(card);
      addWord(hulls, card);
    }
    hullBody.appendChild(hulls);
    hullBody.appendChild(hullSentence);

    const arenaBody = settingRow('Arena', 'sf-crd-row--arena');
    const arenas = el('ul', 'k-words k-words--row sf-crd-arenas fh-cluster');
    arenas.setAttribute('aria-label', 'Arena');
    pin(arenas, { gap: '10px', 'align-items': 'stretch', 'flex-wrap': 'wrap' });
    const arenaDescriptions = {
      helios_core: ['Ricochet Foundry', 'Hard banks, tight gaps and moving machinery. Turn pursuit into a pile-up.'],
      lagrange_crucible: ['Lagrange Crucible', 'Gravity wells and sling routes. Bend the whole fight around an anchor.'],
      cinder_sluice: ['Cinder Sluice', 'Ride hot currents and force enemies across the flow.'],
      cryo_drift: ['Cryo Drift', 'Slippery escape lanes and brittle targets. Set up a shattering collision.'],
      storm_lattice: ['Storm Lattice', 'Conductive relays reward a tightly packed, electrified swarm.'],
    };
    const arenaSentence = el('p', 'k-sentence sf-crd-arena', '');
    const syncArena = () => {
      arenaSentence.textContent = (arenaDescriptions[arenaId] || arenaDescriptions.helios_core)[1];
      for (const button of arenas.querySelectorAll('button')) {
        syncChoice(button, button.dataset.arenaId === arenaId);
      }
    };
    for (const arena of COMBAT_LAB_ARENAS.filter(entry => arenaDescriptions[entry.id])) {
      const button = choiceTile(arenaDescriptions[arena.id][0], 'sf-crd-arena-choice', kitUrl(ARENA_TILE[arena.id] || ARENA_TILE.helios_core));
      button.dataset.arenaId = arena.id;
      button.addEventListener('click', () => { arenaId = arena.id; cue('confirm'); syncArena(); });
      addWord(arenas, button);
    }
    arenaBody.appendChild(arenas);
    arenaBody.appendChild(arenaSentence);
    syncArena();

    // Seed — the number as an underlined input, "New seed" as a fine word, the arena in fine print.
    const seedBody = settingRow('Seed', 'sf-crd-row--seed');
    const seedRow = el('div', 'k-words k-words--row sf-crd-seed');
    const seedWell = el('div', 'fh-stepper-well');
    pin(seedWell, {
      'border-style': 'solid',
      'border-width': '14px',
      'border-image-source': 'url("' + fhUrl('controls/stepper.well.png') + '")',
      'border-image-slice': '14 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '14px',
      'min-height': '56px',
      padding: '0 16px',
      display: 'inline-flex',
      'align-items': 'center',
    });
    const seedInput = el('input', 'k-input k-input--num');
    seedInput.type = 'text';
    seedInput.inputMode = 'numeric';
    seedInput.spellcheck = false; seedInput.autocomplete = 'off';
    seedInput.setAttribute('aria-label', 'Run seed');
    seedInput.value = String(daily ? dailySeedForNow() : (previous ? previous.seed : freshSeed()));
    paintInput(seedInput);
    seedWell.appendChild(seedInput);
    seedRow.appendChild(seedWell);
    const reroll = word('New seed', 'k-word--fine');
    paintKey(reroll, 'small');
    reroll.addEventListener('click', () => {
      if (daily) { cue('deny'); return; }
      seedInput.value = String(freshSeed());
      freeSeed = seedInput.value;
      cue('confirm');
      syncGhost();
    });
    seedInput.addEventListener('input', () => {
      if (!daily) freeSeed = seedInput.value;
      syncGhost();
    });
    seedRow.appendChild(reroll);
    seedBody.appendChild(seedRow);

    // Share (PQ-160.02): a run travels as a code, a ghost as a share block — files and codes,
    // never a service. Both fields are plain paste targets; a bad code fails closed with the
    // reason on the note line.
    const shareBody = settingRow('Share', 'sf-crd-row--share');
    const shareNote = el('p', 'k-t-fine k-38 sf-crd-share-sub',
      'A run code sets the seed, the build and the rules. A ghost code adds a hull to race.');
    const codeRow = el('div', 'k-words k-words--row sf-crd-share');
    const codeInput = el('input', 'k-input sf-crd-code');
    codeInput.type = 'text';
    codeInput.inputMode = 'text';
    codeInput.spellcheck = false;
    codeInput.autocomplete = 'off';
    codeInput.setAttribute('aria-label', 'Run share code');
    codeInput.placeholder = 'SFC1-…';
    paintInput(codeInput);
    const useCode = word('Use code', 'k-word--fine');
    paintKey(useCode, 'small');
    useCode.addEventListener('click', () => {
      const res = applyRunShareCode(codeInput.value);
      if (!res.ok) {
        pendingShare = null;
        shareNote.textContent = res.error;
        cue('deny');
        return;
      }
      pendingShare = {
        mutators: res.mutators,
        dailyDateKey: res.dailyDateKey,
        weeklyMutatorId: res.weeklyMutatorId,
        ghostHash: res.ghostHash,
      };
      starterId = res.starterId;
      if (COMBAT_LAB_ARENAS.some((a) => a.id === res.arenaId)) arenaId = res.arenaId;
      ruleset = res.ruleset;
      daily = false;
      weekly = false;
      freeSeed = String(res.seed);
      seedInput.value = freeSeed;
      seedInput.readOnly = false;
      seedInput.removeAttribute('aria-readonly');
      reroll.disabled = false;
      reroll.removeAttribute('aria-disabled');
      for (const other of modeButtons) syncChoice(other, other.dataset.ruleset === ruleset);
      if (dailyButton) syncChoice(dailyButton, false);
      syncChoice(weeklyButton, false);
      // A code may name the exporter's ghost; it only races when the block was imported too.
      try { doorProfile = loadCrucibleMeta(); } catch { /* keep the prior read */ }
      if (res.ghostHash != null && lastGhostRowByHash(doorProfile, res.ghostHash)) raceGhost = true;
      shareNote.textContent = `Code loaded — seed ${res.seed}`
        + (res.mutators.length ? `, ${res.mutators.length} mutator${res.mutators.length === 1 ? '' : 's'}` : '')
        + '.';
      cue('confirm');
      syncHull();
      syncArena();
      syncMode();
    });
    codeRow.appendChild(codeInput);
    codeRow.appendChild(useCode);
    const ghostRow = el('div', 'k-words k-words--row sf-crd-share');
    const ghostInput = el('input', 'k-input sf-crd-ghost-code');
    ghostInput.type = 'text';
    ghostInput.inputMode = 'text';
    ghostInput.spellcheck = false;
    ghostInput.autocomplete = 'off';
    ghostInput.setAttribute('aria-label', 'Ghost share code');
    ghostInput.placeholder = 'SFG1-…';
    paintInput(ghostInput);
    const addGhost = word('Add ghost', 'k-word--fine');
    paintKey(addGhost, 'small');
    addGhost.addEventListener('click', () => {
      const res = importGhostShareText(ghostInput.value);
      if (!res.ok) {
        shareNote.textContent = res.error;
        cue('deny');
        return;
      }
      try { doorProfile = loadCrucibleMeta(); } catch { /* keep the prior read */ }
      // Point the door at the ghost's seed so its race offer resolves immediately.
      freeSeed = String(res.seed);
      seedInput.value = freeSeed;
      ghostInput.value = '';
      shareNote.textContent = res.alreadyPresent
        ? `Ghost ${res.hash} was already on this machine.`
        : `Ghost ${res.hash} added — ${res.frameCount} frames on seed ${res.seed}.`;
      cue('confirm');
      syncMode();
    });
    ghostRow.appendChild(ghostInput);
    ghostRow.appendChild(addGhost);
    shareBody.appendChild(codeRow);
    shareBody.appendChild(ghostRow);
    shareBody.appendChild(shareNote);

    // The record goes last, below the three settings: the door's job is to start a run, and the
    // reason to start another one is context for that, not a competitor for it. Reading the
    // profile must never be able to stop the door opening, so a broken or absent profile just
    // omits the record.
    let corner = null;
    try {
      if (doorProfile) {
        const records = el('details', 'sf-crd-records');
        const recSum = el('summary', 'k-t-fine fh-legend', 'Records & challenges');
        paintLegend(recSum, false);
        records.appendChild(recSum);
        records.appendChild(renderRecordRows(doorProfile));
        stage.appendChild(records);
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[crucible] record band skipped:', err && err.message ? err.message : err);
      }
    }
    rootEl.appendChild(stage);
    if (corner) rootEl.appendChild(corner);

    // .k-foot — Enter as one word (the mode's verb), Back.
    const foot = el('footer', 'k-foot sf-crd-foot');
    const footWords = el('ul', 'k-words k-words--row');
    footWords.setAttribute('aria-label', 'Crucible');
    const enter = word('Hold the line', 'k-word--emph k-word--primary');
    enterButton = enter;
    paintKey(enter, 'hazard');
    enter.addEventListener('click', () => {
      const setup = crucibleSetupFor({
        starterId,
        seed: normalizeSeed(seedInput.value),
        arenaId,
        ruleset,
      });
      if (!setup.ok || !setup.value) {
        cue('deny');
        ctx.bus.emit('toast', { text: 'Crucible setup invalid', kind: 'error', ttl: 4 });
        return;
      }
      cue('confirm');
      const payload = { ...setup.value };
      const offer = currentGhostOffer();
      let ghostHash = raceGhost && offer.available ? offer.hash : null;
      // PQ-160.02: a code-named ghost races when its block was imported to this machine.
      if (ghostHash == null && pendingShare && pendingShare.ghostHash != null
        && lastGhostRowByHash(doorProfile, pendingShare.ghostHash)) {
        ghostHash = pendingShare.ghostHash;
      }
      if (ghostHash != null) payload.ghostHash = ghostHash;
      const shareMutators = pendingShare ? pendingShare.mutators : [];
      const shareWeeklyId = pendingShare ? pendingShare.weeklyMutatorId : null;
      const weeklyMutatorId = weekly ? weeklyMutatorForNow() : shareWeeklyId;
      if (weeklyMutatorId) payload.weeklyMutatorId = weeklyMutatorId;
      const challengeMutators = shareMutators.concat(
        weeklyMutatorId && !shareMutators.includes(weeklyMutatorId) ? [weeklyMutatorId] : [],
      );
      const shareDailyKey = pendingShare ? pendingShare.dailyDateKey : null;
      if (daily || weeklyMutatorId || challengeMutators.length || shareDailyKey) {
        const dateKey = daily ? utcDateKeyNow() : shareDailyKey;
        if (dateKey) payload.dailyDateKey = dateKey;
        queueSurvivalChallenge({
          seed: payload.seed,
          ruleset: daily ? SWARM_RULESET : ruleset,
          mutators: challengeMutators,
          dailyDateKey: dateKey,
          weeklyMutatorId,
          ghostHash,
        });
      } else if (ghostHash != null) {
        clearQueuedChallenge();
        queueGhostPlayback(ghostHash);
      } else {
        clearQueuedChallenge();
      }
      requestCrucibleRun(ctx.bus, payload, ruleset);
    });
    addWord(footWords, enter);
    const back = word('Back', 'k-word--emph');
    paintKey(back, 'small');
    back.addEventListener('click', () => { cue('close'); ctx.bus.emit('ui:popScreen', {}); });
    addWord(footWords, back);
    foot.appendChild(footWords);
    rootEl.appendChild(foot);

    syncMode();
    syncHull();
    this._regions = { title, stage, foot, enter };
    // data-k-ready belongs to the ScreenManager on a screen that declares `stage`: the door is not
    // ready to photograph when its words are built, it is ready when the arena behind them is lit.
    // Writing '1' here raced the stage and produced a capture of a door with nothing behind it.

    if (typeof enter.focus === 'function') {
      try { enter.focus(); } catch { /* focus is best-effort */ }
    }
  },

  onShow() {
    const r = this._regions;
    if (!r || !canAnimate()) return;
    cue('open');
    try {
      settle(r.title, { from: 'top', state: 'crucible:open' });
      settle(r.stage, { from: 'left', delay: 60, state: 'crucible:open' });
      settle(r.foot, { from: 'bottom', delay: 120, state: 'crucible:open' });
    } catch { /* motion is cosmetic */ }
    if (r.enter && typeof r.enter.focus === 'function') {
      try { r.enter.focus({ preventScroll: true }); } catch { /* focus is best-effort */ }
    }
  },

  onHide() {
    if (canAnimate()) cue('close');
  },
};

function resultsOwner(ctx) {
  const registry = ctx && ctx.registry;
  if (!registry || typeof registry.get !== 'function') return null;
  return registry.get('survivalResults') || null;
}

/** Rows for the results grid. Exported so a check can assert them without a DOM. */
export function reachedRow(result) {
  const wave = (result && (result.deepestWave || result.wave)) || 0;
  // A swarm run has no last wave, so it has no denominator. The arc has thirty — it never had ten,
  // and printing "of 10" told every player of a thirty-wave run that they were two thirds done
  // when they died on wave 7.
  if (result && result.ruleset === SWARM_RULESET) return `Wave ${wave}`;
  return `Wave ${wave} of ${SURVIVAL_RUN_WAVE_COUNT}`;
}

export function resultRows(result) {
  if (!result) return [];
  return [
    ['Outcome', result.outcome === 'victory' ? 'Survived' : (result.outcome === 'extracted' ? 'Extracted' : (result.outcome === 'aborted' ? 'Abandoned' : 'Lost'))],
    ['Reached', reachedRow(result)],
    ['Kills', String(result.kills || 0)],
    // The chain only exists in a swarm run, so the row only exists there — an arc plate must not
    // carry a figure that is always zero.
    ...(result.ruleset === SWARM_RULESET ? [['Best chain', String(result.bestChain || 0)]] : []),
    ['Score', String(result.score || 0)],
    ['Salvage', `${result.credits || 0} cr`],
    ['Level', `${result.level || 1} · ${result.xp || 0} xp`],
    ['Seed', String(result.seed || 0)],
  ];
}

/* ------------------------------------------------------------------------------------------------
 * The flight record — pure text builders.
 *
 * PQ-133 review question 7 asks whether a player can explain every link of a kill from what is on
 * screen. survivalResults already publishes the whole causal receipt; until now the plate printed
 * one sentence of it and dropped the rest. Everything below turns that receipt into words.
 *
 * All of it is DOM-free and exported so the wording is assertable in a node test. Read-only: these
 * take the copy handed back by lastResult() and never touch a system.
 * --------------------------------------------------------------------------------------------- */

const WEAPON_NAME_BY_ID = new Map(WEAPONS.map((def) => [def.id, def.name]));

/**
 * The bearings a defeat receipt actually carries (impactDirection in src/combat/playerDefeat.js
 * publishes exactly these, uppercase). Anything else renders as "bearing unknown" rather than a
 * guess — the grammar's enumerated-bank rule: the UI never invents an explanatory phrase.
 */
export const BEARING_WORDS = Object.freeze({
  FRONT: 'Off the bow',
  AFT: 'Astern',
  PORT: 'To port',
  STARBOARD: 'To starboard',
  CONTACT: 'Point blank',
});

/** Which side it came from, as a phrase a person says. */
export function bearingWord(direction) {
  return BEARING_WORDS[String(direction || '').toUpperCase()] || 'Bearing unknown';
}

/** The layer the killing damage went through. Enumerated: `dominantLayer` has three live values. */
export const BREACH_PHRASES = Object.freeze({
  hull: 'Through the hull',
  armor: 'Through the armour',
  shield: 'Through the shields',
});

export function breachPhrase(layer) {
  return BREACH_PHRASES[String(layer || '').toLowerCase()] || 'Breach point unknown';
}

/**
 * A weapon id as a player reads it. The damage trail carries ids (`wpn_autocannon_m`), not labels,
 * and an id is frequently null — a hit whose weapon nothing recorded still has to name itself.
 */
export function weaponDisplayName(weaponId) {
  if (!weaponId) return 'Unidentified fire';
  const known = WEAPON_NAME_BY_ID.get(weaponId);
  if (known) return known;
  const words = String(weaponId).replace(/^(wpn|unique)_/, '').split('_').filter(Boolean);
  if (!words.length) return 'Unidentified fire';
  return words
    .map((word) => (word.length === 1 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * What was actually taking the player apart, aggregated by weapon rather than dumped as eight rows.
 * Amounts are applied damage, so they are fractional — they round once, here, at display.
 * Sorted by damage done, heaviest first; ties settle by name so the order never wobbles.
 */
export function damageBreakdown(trail) {
  const entries = Array.isArray(trail) ? trail : [];
  const byWeapon = new Map();
  let rawTotal = 0;
  let hits = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    // Strings only: a null-prototype object would throw String(), and Number(Symbol)
    // throws — both degrade to the unattributed bucket instead of breaking the plate.
    const rawId = typeof entry.weaponId === 'string' ? entry.weaponId : null;
    const name = weaponDisplayName(rawId);
    const rawAmount = typeof entry.amount === 'number' || typeof entry.amount === 'string'
      ? Number(entry.amount)
      : NaN;
    const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
    const bucket = byWeapon.get(name) || { weapon: name, hits: 0, raw: 0, attackers: [] };
    bucket.hits += 1;
    bucket.raw += amount;
    // Who was holding the weapon, when the trail knows. Augments the weapon row; never
    // replaces it — a missile is still a missile whoever racked it.
    const label = typeof entry.attackerLabel === 'string' && entry.attackerLabel.length > 0
      ? entry.attackerLabel
      : null;
    if (label && !bucket.attackers.includes(label)) bucket.attackers.push(label);
    byWeapon.set(name, bucket);
    rawTotal += amount;
    hits += 1;
  }
  const rows = [...byWeapon.values()]
    .sort((a, b) => (b.raw - a.raw) || (a.weapon < b.weapon ? -1 : a.weapon > b.weapon ? 1 : 0))
    .map((bucket) => ({
      weapon: bucket.weapon,
      hits: bucket.hits,
      amount: Math.round(bucket.raw),
      share: rawTotal > 0 ? bucket.raw / rawTotal : 0,
      attackers: bucket.attackers.slice(),
    }));
  return { hits, total: Math.round(rawTotal), rows };
}

/** The sentence over the damage rows. Every figure keeps its word. */
export function lastSecondsLead(trail) {
  const { hits, total } = damageBreakdown(trail);
  if (!hits) return 'Nothing landed on you in the last seconds of the run.';
  if (hits === 1) return `The last hit took ${total} damage off you.`;
  return `The last ${hits} hits took ${total} damage off you.`;
}

/**
 * The draft, in the order it was taken. `picks` is the story of the run: a Crucible build is a
 * sequence of verbs, not a stat sheet. A pick with no verb still names itself from its weapon id.
 */
export function buildSteps(picks) {
  const entries = Array.isArray(picks) ? picks : [];
  const steps = [];
  for (const pick of entries) {
    if (!pick || typeof pick !== 'object') continue;
    const verb = typeof pick.verb === 'string' && pick.verb
      ? pick.verb
      : (pick.defId ? weaponDisplayName(pick.defId) : '');
    if (!verb) continue;
    const wave = Number.isInteger(pick.wave) && pick.wave > 0 ? pick.wave : null;
    steps.push({ wave, verb, text: wave ? `Wave ${wave} ${verb}` : verb });
  }
  return steps;
}

/** The sentence over the build chain. */
export function buildLead(picks) {
  const count = buildSteps(picks).length;
  if (!count) return 'No draft taken — you flew the loadout you launched with.';
  if (count === 1) return '1 draft changed what your guns do:';
  return `${count} drafts changed what your guns do:`;
}

/**
 * Who, with what, from which side, through which layer — plus, when the run recorded one, the
 * telegraph the player missed with its warning time. Empty when no defeat receipt was published
 * — which happens on a victory, on an abandoned run, AND on a defeat that carries no receipt
 * (`run:ended` defaults its outcome to 'defeat' whether or not anything killed the player).
 */
export function killChainRows(defeat) {
  if (!defeat) return [];
  const killer = defeat.attacker
    ? (defeat.faction ? `${defeat.attacker} — ${defeat.faction}` : defeat.attacker)
    : 'Unidentified attacker';
  const rows = [
    ['Killed by', killer],
    ['Its weapon', defeat.weapon || 'Unidentified weapon'],
    ['It came from', bearingWord(defeat.direction)],
    ['It got in', breachPhrase(defeat.dominantLayer)],
  ];
  // PQ-174.06: the telegraph as two lines beside the cause — the frontend direction sheet's
  // "the cause of death and its telegraph as two lines". A receipt that predates the field
  // renders exactly as before.
  if (defeat.telegraphName) {
    const lead = Number.isFinite(Number(defeat.telegraphLeadMs))
      ? ` — ${Math.max(0, Math.round(Number(defeat.telegraphLeadMs)))}ms before impact` : '';
    rows.push(['It warned you', `${defeat.telegraphName}${lead}`]);
  }
  return rows;
}

/**
 * What was left of the ship at the end. A vital the receipt did not measure is DROPPED, never
 * reported: `Number(null)` is 0, so coercing here would tell a player their armour was at 0% when
 * in fact nothing measured it. The test for that is the reason this reads the raw value.
 */
export function vitalsFigures(defeat) {
  const vitals = defeat && defeat.vitalsPct;
  if (!vitals || typeof vitals !== 'object') return [];
  return [['Shields', vitals.shield], ['Armour', vitals.armor], ['Hull', vitals.hull]]
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([word, value]) => ({ word, text: `${Math.round(value)}%` }));
}

/**
 * The screen's identity word, and the stamp above it. A clear and a death are not one plate.
 *
 * `aborted` is deliberately NEUTRAL — "Run Ended", not "Run Abandoned". A plain abort is the
 * player leaving the arena, but the arena failing to build a wave publishes 'aborted' too with
 * stopReason 'wave_plan_failed' — and that one failed LOUDLY on purpose, so its title says so.
 * The results grid's 'Abandoned' row predates this and is pinned by its own test.
 */
export function resultTitle(result) {
  if (result && result.outcome === 'victory') return 'Arena Cleared';
  if (result && result.stopReason === 'wave_plan_failed') return 'Arena Failed';
  if (result && result.outcome === 'extracted') return 'Extracted';
  if (result && result.outcome === 'aborted') return 'Run Ended';
  return 'Run Over';
}

export function resultStamp(result) {
  if (result && result.outcome === 'victory') return 'CRUCIBLE / ARENA CLEARED';
  return 'CRUCIBLE / FLIGHT RECORD';
}

/** The band name for a section. The damage band means something different after a clear. */
export function sectionTitle(id, outcome) {
  if (id === 'story') return 'The run';
  if (id === 'kill_chain') return 'How it ended';
  if (id === 'last_seconds') return outcome === 'defeat' ? 'The last seconds' : 'What you weathered';
  if (id === 'ledger') return 'Run ledger';
  if (id === 'build') return 'What you built';
  return '';
}

/**
 * Which bands the plate carries and which one leads. This — not a restyle — is what makes a clear
 * and a death different screens: a clear leads with the build that got you there and has no kill
 * chain at all; a death leads with what killed you and ends on the build that failed to stop it.
 *
 * Branching is on `outcome`, never on "is there a defeat receipt": a defeat can publish none.
 */
export function resultSectionOrder(result) {
  if (!result) return [];
  const hasStory = !!(result.death
    || (Array.isArray(result.moments) && result.moments.length)
    || result.buildName
    || result.buildCode);
  if (result.outcome === 'victory') {
    return hasStory ? ['story', 'build', 'last_seconds', 'ledger'] : ['build', 'last_seconds', 'ledger'];
  }
  if (result.outcome === 'aborted') {
    return hasStory ? ['story', 'ledger', 'build', 'last_seconds'] : ['ledger', 'build', 'last_seconds'];
  }
  if (result.defeat) {
    return hasStory
      ? ['story', 'kill_chain', 'last_seconds', 'ledger', 'build']
      : ['kill_chain', 'last_seconds', 'ledger', 'build'];
  }
  return hasStory ? ['story', 'last_seconds', 'ledger', 'build'] : ['last_seconds', 'ledger', 'build'];
}

/**
 * Swarm is a farthest-round challenge. Tricks and score explain the run below this record.
 */
export function resultHero(result) {
  if (!result) return null;
  if (result.ruleset === SWARM_RULESET) return {
    number: String(Math.max(Number(result.deepestWave) || 0, Number(result.wave) || 1)),
    word: 'round reached',
  };
  return { number: String(result.score || 0), word: 'score' };
}

/**
 * The run as sentences a player can tell, not a table of labels. Built from the telemetry
 * survivalResults already published: the death and its tell, the tracked moments, the build.
 * Empty when the result has none of those fields (legacy plates stay a table).
 */
export function storySentences(result) {
  if (!result) return [];
  const lines = [];
  const death = result.death;
  if (death && typeof death === 'object') {
    if (typeof death.causeText === 'string' && death.causeText) lines.push(death.causeText);
    if (typeof death.telegraphName === 'string' && death.telegraphName) {
      const lead = Number.isFinite(Number(death.telegraphLeadMs)) ? Number(death.telegraphLeadMs) : 0;
      lines.push(`The tell was ${death.telegraphName} — ${lead} ms of warning.`);
    }
    if (typeof death.counterplay === 'string' && death.counterplay) lines.push(death.counterplay);
  }
  const moments = Array.isArray(result.moments) ? result.moments : [];
  for (const moment of moments) {
    const text = typeof moment === 'string' ? moment : (moment && moment.text);
    if (typeof text === 'string' && text) lines.push(text);
  }
  if (typeof result.buildName === 'string' && result.buildName) {
    lines.push(`You converged on ${result.buildName}.`);
  }
  if (typeof result.buildCode === 'string' && result.buildCode) {
    lines.push(`Build code ${result.buildCode}`);
  }
  return lines;
}

/* --- the stunt combo band. DOM-free builders over the stunt module's combo snapshot.
 *
 * PQ-146.01: the combo meter lives in the stunt module (state.stunts.combo, single writer
 * stuntGrammar) and this surface reads it IN PARALLEL with survivalResults — which it never
 * edits. Everything below takes the snapshot handed back by stuntComboFor() and never touches
 * a system. Null-safe: a run with no tricks and no kills shows no band at all.
 * ------------------------------------------------------------------------------------------ */

/**
 * The live combo snapshot for this run, or null when there is nothing to show. Reads
 * ctx.state only; a context without state (or a run that never scored) yields null and the
 * results plate renders exactly as before — existing plates are untouched.
 */
export function stuntComboFor(ctx) {
  const state = ctx && ctx.state;
  const combo = state && state.stunts && state.stunts.combo;
  if (!combo || typeof combo !== 'object') return null;
  try {
    return comboSummary(combo);
  } catch {
    return null;
  }
}

/** The sentence over the combo band. Every figure keeps its word. */
export function comboLead(summary) {
  if (!summary || typeof summary !== 'object') return '';
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const best = n(summary.bestChain);
  const trickKills = n(summary.trickKills);
  const gun = n(summary.gunKills) + n(summary.pulseKills);
  if (best <= 0 && trickKills <= 0) {
    if (gun <= 0) return '';
    return gun === 1
      ? 'No chained tricks — 1 flat kill, no multiplier.'
      : `No chained tricks — ${gun} flat kills, no multiplier.`;
  }
  const chainWord = best === 1 ? '1 trick' : `${best} tricks`;
  const pay = n(summary.bestChainPoints);
  if (trickKills > 0) return `Best chain ${chainWord} for ${pay} — physics paid, guns never multiply.`;
  return `Best chain ${chainWord} for ${pay} — chain it, bank it, run it again.`;
}

/** Rows for the combo grid. Gun rows appear only when that kind of kill happened. */
export function comboRows(summary) {
  if (!summary || typeof summary !== 'object') return [];
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const rows = [['Combo score', String(n(summary.totalScore))]];
  if (n(summary.bestChain) > 0) {
    rows.push(['Best chain', `${n(summary.bestChain)} tricks · ${n(summary.bestChainPoints)}`]);
  }
  if (n(summary.trickKills) > 0) rows.push(['Trick kills', String(n(summary.trickKills))]);
  if (n(summary.gunKills) > 0) rows.push(['Gun kills', String(n(summary.gunKills))]);
  if (n(summary.pulseKills) > 0) rows.push(['Pulse kills', String(n(summary.pulseKills))]);
  return rows;
}

/** The recent chained tricks, newest last, as name/detail pairs for the chain list. */
export function comboTrickLines(summary) {
  const entries = summary && Array.isArray(summary.lastTricks) ? summary.lastTricks : [];
  const lines = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const name = typeof entry.name === 'string' && entry.name ? entry.name : 'Unknown stunt';
    const points = Number.isFinite(Number(entry.points)) ? Number(entry.points) : 0;
    const rarity = typeof entry.rarity === 'string' && entry.rarity ? entry.rarity : 'common';
    lines.push({ name, detail: `${rarity} · ${points}` });
  }
  return lines;
}

/* --- band renderers. DOM assembly only; every word above them is already decided. --- */

/** Label/value pairs as static kit rows. `hook` is the inert class a route check reads. */
function pairRows(pairs, hook, valueClassFor) {
  const list = el('ul', 'k-rows' + (hook ? ' ' + hook : ''));
  for (const [label, value] of pairs) {
    list.appendChild(staticRow(label, value, { valueClass: valueClassFor ? valueClassFor(label) : '' }));
  }
  return list;
}

function renderStory(band, result) {
  const lines = storySentences(result);
  if (!lines.length) {
    band.appendChild(el('p', 'k-empty sf-crres__empty', 'The run left no story.'));
    return;
  }
  for (const line of lines) {
    band.appendChild(el('p', 'k-sentence sf-crres__story-line', line));
  }
}

function renderCombo(band, summary) {
  const lead = comboLead(summary);
  if (lead) band.appendChild(el('p', 'k-sentence sf-crres__lead', lead));
  band.appendChild(pairRows(comboRows(summary), 'sf-crd-grid'));
  const lines = comboTrickLines(summary);
  if (lines.length) {
    const chain = el('ul', 'k-rows sf-crres__chain');
    for (const line of lines) chain.appendChild(staticRow(line.name, line.detail, { valueClass: 'k-t-fine k-62' }));
    band.appendChild(chain);
  }
}

function renderKillChain(band, defeat) {
  // Threat colour on the two rows that name the enemy. The label beside each is the channel that
  // survives forced-colors and colour blindness; the tint is never the only one.
  const chain = pairRows(killChainRows(defeat), 'sf-crres__chain',
    (label) => (label === 'Killed by' || label === 'Its weapon' ? 'k-bad' : ''));
  band.appendChild(chain);

  const vitals = vitalsFigures(defeat);
  if (!vitals.length) return;
  band.appendChild(el('p', 'k-sentence sf-crres__lead', 'What was left of you when it landed:'));
  const row = el('ul', 'k-rows sf-crres__vitals');
  for (const vital of vitals) {
    row.appendChild(staticRow(vital.word, vital.text, { valueClass: 'k-bad' }));
  }
  band.appendChild(row);
}

function renderLastSeconds(band, trail) {
  band.appendChild(el('p', 'k-sentence sf-crres__lead', lastSecondsLead(trail)));
  const { rows } = damageBreakdown(trail);
  if (!rows.length) return;
  const list = el('ul', 'k-rows sf-crres__hits');
  for (const row of rows) {
    const line = el('li', 'k-row k-row--static sf-crres__hit');
    const left = el('div');
    left.appendChild(el('span', 'k-row__name sf-crres__hit-name', row.weapon));
    const track = el('div', 'k-bar sf-crres__hit-track');
    const fill = el('div', 'k-bar__fill sf-crres__hit-fill');
    fill.style.width = `${Math.round(row.share * 100)}%`;
    track.appendChild(fill);
    left.appendChild(track);
    line.appendChild(left);
    const fig = el('span', 'k-row__num');
    fig.appendChild(el('span', 'k-t-fine k-62 sf-crres__hit-fig', `${row.hits} hit${row.hits === 1 ? '' : 's'}`));
    fig.appendChild(el('span', 'sf-crres__hit-fig', ` ${row.amount} damage`));
    line.appendChild(fig);
    list.appendChild(line);
  }
  band.appendChild(list);
}

function renderLedger(band, result) {
  band.appendChild(pairRows(resultRows(result), 'sf-crd-grid'));
}

/**
 * HOW THIS BUILD LANDS ITS DAMAGE — the causal tags phase 5 deferred to the GPU lane.
 *
 * Read from the COMPILED SPEC, not from the run's hits. Nothing accumulates per-arrival counts
 * during a run yet, so any figure claiming "8 direct, 16 chained" would be a model presented as a
 * measurement. The kinds are exact and honest: this is what the fit you finished with actually
 * does with a shot. Damage that arrives by CHAIN is a different game from damage that arrives by
 * BANK, and until now the results screen could not say which one you had been playing.
 *
 * Picks mix weapons and modifiers in one list, so the weapon is whichever pick resolves to a known
 * weapon and everything else is treated as a modifier. No weapon, no band — a results screen must
 * never fail to open because a build could not be read.
 */
export function causalKindsFromPicks(picks) {
  const entries = Array.isArray(picks) ? picks : [];
  const ids = [];
  for (const pick of entries) {
    if (pick && typeof pick.defId === 'string' && pick.defId) ids.push(pick.defId);
  }
  if (!ids.length) return [];
  const weaponIds = new Set(WEAPONS.map((w) => w && w.id).filter(Boolean));
  const weaponId = ids.find((id) => weaponIds.has(id)) || null;
  if (!weaponId) return [];
  const modifiers = ids.filter((id) => id !== weaponId && !weaponIds.has(id));
  const compile = (mods) => {
    try {
      const out = compileAttackSpec({ weapon: weaponId, modifiers: mods });
      return out && out.ok === true && out.spec ? out : null;
    } catch (_) {
      return null;
    }
  };
  // One unknown modifier used to take the whole band down, even though the weapon read perfectly.
  // That happens for real: an old run whose trait has since been renamed or retired. Falling back
  // to the weapon alone says less than the truth but never says nothing, and never leaves a results
  // screen with a silently missing section that looks like a bug.
  const compiled = compile(modifiers) || compile([]);
  if (!compiled) return [];
  try {
    return causalKindsFromSpec(compiled.spec);
  } catch (_) {
    return [];
  }
}

/** One sentence over the tags, so the figures keep their word. */
export function causalKindsLead(kinds) {
  const list = Array.isArray(kinds) ? kinds : [];
  if (!list.length) return '';
  if (list.length === 1 && list[0] === 'DIRECT') {
    return 'Every shot arrived the plain way: straight into whatever you were pointing at.';
  }
  if (list.length === 1) return `This build put its damage in by one route: ${list[0].toLowerCase()}.`;
  return `This build had ${list.length} ways in: ${list.map((k) => k.toLowerCase()).join(', ')}.`;
}

/** The build as one fine-print line — the sheet's "build code". */
export function buildCodeLine(picks) {
  return buildSteps(picks).map((step) => step.text).join(' · ');
}

function renderBuild(band, result) {
  const picks = result && result.picks;
  band.appendChild(el('p', 'k-sentence sf-crres__lead', buildLead(picks)));
  if (result && typeof result.buildName === 'string' && result.buildName) {
    band.appendChild(el('p', 'k-sentence sf-crres__build-name', result.buildName));
  }
  const kinds = causalKindsFromPicks(picks);
  if (kinds.length) {
    band.appendChild(el('p', 'k-sentence sf-crres__causal-lead', causalKindsLead(kinds)));
    // The causal tags as fine static words, the plain route at 38 %.
    const tags = el('div', 'k-words k-words--row sf-crres__causal');
    for (const kind of kinds) {
      const tag = el('span', 'k-t-fine sf-crres__causal-tag' + (kind === 'DIRECT' ? ' k-38' : ' k-62'), kind.toLowerCase());
      tag.setAttribute('data-kind', kind.toLowerCase());
      tags.appendChild(tag);
    }
    band.appendChild(tags);
  }
  const steps = buildSteps(picks);
  if (steps.length) {
    const chain = el('ul', 'k-rows sf-crres__build');
    for (const step of steps) {
      const node = el('li', 'k-row k-row--static sf-crres__step');
      const left = el('div');
      if (step.wave != null) {
        const wave = el('span', 'k-row__sub');
        wave.appendChild(el('span', 'sf-crres__step-word', 'Wave'));
        wave.appendChild(el('span', 'sf-crres__step-fig', ` ${String(step.wave)}`));
        left.appendChild(wave);
      }
      left.appendChild(el('span', 'k-row__name sf-crres__step-verb', step.verb));
      node.appendChild(left);
      node.appendChild(el('span', 'k-row__num', ''));
      chain.appendChild(node);
    }
    band.appendChild(chain);
  }
  const code = (result && typeof result.buildCode === 'string' && result.buildCode)
    ? result.buildCode
    : buildCodeLine(picks);
  if (code) band.appendChild(el('p', 'k-t-fine k-38 sf-crres__build-code', code));
}

/* --- SHARE BAND (PQ-160.02) ------------------------------------------------------------------
   The run as a code and its ghost as a block — files and codes, never a service. The code carries
   the seed, the build the run launched with, and the rules; the ghost block carries the recorded
   pose tape. Both are selectable text and real download links on every host — the plate's three
   action buttons stay the only buttons.
   ------------------------------------------------------------------------------------------- */

/** A kit-fine download link: a real anchor carrying a data URI, not a button. */
function shareLink(band, label, text, filename, ariaLabel) {
  const a = el('a', 'k-word k-word--fine sf-crres__share-link', label);
  const href = shareTextHref(text);
  if (!href) return;
  a.href = href;
  a.download = filename;
  a.setAttribute('aria-label', ariaLabel || label);
  band.appendChild(a);
}

function selectableText(band, tag, className, value, ariaLabel) {
  const field = el(tag, className);
  if (tag === 'textarea') field.rows = 4;
  else field.type = 'text';
  field.readOnly = true;
  field.value = value;
  field.setAttribute('aria-label', ariaLabel);
  field.addEventListener('focus', () => { try { field.select(); } catch { /* stub DOM */ } });
  field.addEventListener('click', () => { try { field.select(); } catch { /* stub DOM */ } });
  band.appendChild(field);
}

function buildShareBand(result) {
  const setup = lastCrucibleSetup();
  let profile = null;
  try { profile = loadCrucibleMeta(); } catch { profile = null; }
  const ghost = ghostShareForRun(profile, {
    seed: result && Number.isInteger(result.seed) ? result.seed : null,
  });
  const code = runShareCodeForRun(setup, result, { ghostHash: ghost ? ghost.hash : null });
  if (!code && !(ghost && ghost.text)) return null;

  const band = el('div', 'sf-crres__band');
  const title = el('p', 'k-caps sf-crres__band-title', 'Share');
  title.setAttribute('role', 'heading');
  title.setAttribute('aria-level', '2');
  band.appendChild(title);

  if (code) {
    band.appendChild(el('p', 'k-t-fine k-38',
      'Same seed, same build, same rules — another machine reproduces this run. '
      + 'The code selects itself when you touch it.'));
    selectableText(band, 'input', 'k-input sf-crres__share-code', code, 'Run share code');
    shareLink(band, 'Save run code', code + '\n',
      `spaceface-run-${result && Number.isInteger(result.seed) ? result.seed : 'share'}.txt`,
      'Download the run code as a file');
  }

  if (ghost && ghost.text) {
    band.appendChild(el('p', 'k-t-fine k-38',
      `The recorded hull — paste it on another machine's Crucible door and it races you.`));
    selectableText(band, 'textarea', 'k-input sf-crres__ghost-code', ghost.text, 'Ghost share code');
    shareLink(band, 'Save ghost file', ghost.text + '\n',
      `spaceface-ghost-${ghost.hash}.txt`, 'Download the ghost as a file');
  }
  return band;
}

export const crucibleResultsScreen = {
  id: 'crucibleResults',
  data: { locked: true },

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-crucible-door', 'sf-crucible-results');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-results-title');

    const owner = resultsOwner(ctx);
    const result = owner && typeof owner.lastResult === 'function' ? owner.lastResult() : null;
    rootEl.dataset.stamp = resultStamp(result);

    // .k-title — the identity word, and the owner's sentence, verbatim. The structured chain below
    // re-states it in fielded form; it never rewrites it, because survivalResults owns the wording.
    const title = el('header', 'k-title');
    const h = el('h1', 'k-display k-t-title', resultTitle(result));
    h.id = 'sf-crucible-results-title';
    title.appendChild(h);
    title.appendChild(el('p', 'k-sentence k-sentence--emph sf-crd-headline',
      result && result.headline ? result.headline : 'The run ended.'));
    rootEl.appendChild(title);

    // .k-stage — two columns: the story (the sections in their order) and the ledger. The story is
    // first in the DOM so a reader meets "How it ended" before the figures; the ledger column is
    // ordered to the left of it by the kit (`k-order-first`).
    const stage = el('section', 'k-stage k-panel sf-crres__stage');
    const story = el('div', 'k-stage k-stage--scroll sf-crres__story');
    const ledger = el('div', 'k-hang k-order-first sf-crres__ledger');
    stage.appendChild(story);
    stage.appendChild(ledger);

    if (!result) {
      // No record kept. Say so — a dead player must never be handed a blank plate — and still
      // offer every way out below.
      story.appendChild(el('p', 'k-empty sf-crres__empty', 'No flight record was kept for that run.'));
    }

    for (const id of resultSectionOrder(result)) {
      const band = el('div', 'sf-crres__band');
      // A heading role rather than an <h2>, so the sections read as one column of sentences.
      const bandTitle = el('p', 'k-caps sf-crres__band-title', sectionTitle(id, result.outcome));
      bandTitle.setAttribute('role', 'heading');
      bandTitle.setAttribute('aria-level', '2');
      band.appendChild(bandTitle);
      if (id === 'story') renderStory(band, result);
      else if (id === 'kill_chain') renderKillChain(band, result.defeat);
      else if (id === 'last_seconds') renderLastSeconds(band, result.damageTrail);
      else if (id === 'ledger') renderLedger(band, result);
      else if (id === 'build') renderBuild(band, result);
      (id === 'ledger' ? ledger : story).appendChild(band);
    }

    // The stunt combo band reads the stunt module's combo snapshot in parallel with
    // survivalResults (PQ-146.01). Absent state or an empty meter renders nothing, so every
    // plate that predates the meter reads exactly as before.
    try {
      const combo = stuntComboFor(ctx);
      if (combo) {
        const band = el('div', 'sf-crres__band');
        const bandTitle = el('p', 'k-caps sf-crres__band-title', 'Stunt combo');
        bandTitle.setAttribute('role', 'heading');
        bandTitle.setAttribute('aria-level', '2');
        band.appendChild(bandTitle);
        renderCombo(band, combo);
        ledger.appendChild(band);
      }
    } catch {
      // A combo read failure must never take down the results plate.
    }

    // PQ-160.02: the run as a code, its ghost as a block. Sharing must never take the plate down.
    try {
      const shareBand = buildShareBand(result);
      if (shareBand) ledger.appendChild(shareBand);
    } catch {
      // A share-surface failure must never take down the results plate.
    }
    rootEl.appendChild(stage);

    // .k-corner — the hero number: the best chain (swarm) or the score (gauntlet).
    const heroSpec = resultHero(result);
    if (heroSpec) {
      const corner = el('aside', 'k-corner sf-crres__hero');
      corner.appendChild(heroBlock(heroSpec.number, heroSpec.word, 'k-hero--hero k-hero--signal'));
      rootEl.appendChild(corner);
    }

    // .k-foot — the three ways out, as words.
    const foot = el('footer', 'k-foot sf-crd-foot');
    const footWords = el('ul', 'k-words k-words--row');
    footWords.setAttribute('aria-label', 'After the run');
    const addWord = (button) => {
      const li = el('li');
      li.appendChild(button);
      footWords.appendChild(li);
      return button;
    };

    const again = addWord(word('Run it again — same seed', 'k-word--emph k-word--primary'));
    again.addEventListener('click', () => {
      const setup = lastCrucibleSetup();
      if (!setup) {
        ctx.bus.emit('ui:replaceScreen', { id: 'crucible' });
        return;
      }
      // Restart is a real New Game: runSession.newGame resets the envelope to inactive, so the
      // begin below is accepted exactly as it was the first time.
      // Replay the run as it BEGAN, ruleset included — a swarm death must not restart as a gauntlet.
      if (setup.dailyDateKey || setup.weeklyMutatorId) {
        queueSurvivalChallenge({
          seed: setup.seed,
          ruleset: lastCrucibleRuleset(),
          mutators: setup.weeklyMutatorId ? [setup.weeklyMutatorId] : [],
          dailyDateKey: setup.dailyDateKey,
          weeklyMutatorId: setup.weeklyMutatorId,
          ghostHash: setup.ghostHash,
        });
      } else if (setup.ghostHash != null) {
        queueGhostPlayback(setup.ghostHash);
      }
      requestCrucibleRun(ctx.bus, setup, lastCrucibleRuleset());
    });

    const newSeed = addWord(word('New run', 'k-word--emph'));
    newSeed.addEventListener('click', () => ctx.bus.emit('ui:replaceScreen', { id: 'crucible' }));

    const menu = addWord(word('Main menu', 'k-word--emph k-word--danger'));
    menu.addEventListener('click', () => {
      // Same teardown pause uses: main.js consumes game:exitToMenu and returns state.mode to
      // 'menu', runSession aborts and clears the run envelope.
      ctx.bus.emit('game:over:dismissed', {});
      ctx.bus.emit('game:exitToMenu', { source: 'crucible_results' });
      ctx.bus.emit('ui:closeAll', {});
      ctx.bus.emit('ui:pushScreen', { id: 'mainMenu' });
    });

    foot.appendChild(footWords);
    rootEl.appendChild(foot);
    this._regions = { title: h, story, ledger, foot, again };
    rootEl.dataset.kReady = '1';
    if (typeof again.focus === 'function') {
      try { again.focus(); } catch { /* focus is best-effort */ }
    }
  },

  onShow() {
    const r = this._regions;
    if (!r || !canAnimate()) return;
    cue('open');
    // Under reduced motion nothing settles (the kit's settle is a cut); otherwise the title stamps
    // and the rows settle from the left.
    try {
      stamp([r.title], { state: 'crucibleResults:open' });
      settle(r.ledger, { from: 'left', delay: 60, state: 'crucibleResults:open' });
      settle(r.story, { from: 'left', delay: 120, state: 'crucibleResults:open' });
      settle(r.foot, { from: 'bottom', delay: 180, state: 'crucibleResults:open' });
    } catch { /* motion is cosmetic */ }
    if (r.again && typeof r.again.focus === 'function') {
      try { r.again.focus({ preventScroll: true }); } catch { /* focus is best-effort */ }
    }
  },

  onHide() {
    if (canAnimate()) cue('close');
  },
};
