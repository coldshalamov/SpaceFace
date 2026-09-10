// The Crucible door (PQ-133 / CRU-018) and the run results surface.
//
// The door picks a hull and a seed and launches through the ordinary New Game route
// (src/ui/crucibleLaunch.js). The results surface explains how the run ended and offers the same
// seed again. Neither writes state.run, the phase, or a fitting.
//
// Both are built on the frontend kit (styles/kit.css, src/ui/kit/) — Frontend Task D §1. This file
// owns no CSS. The door is three words with their values and one verb (sheet §2, "The modes"); the
// results are the run as a story: a hero number, a column of sentences, the build as fine print.
// The DOM is built with `el` + appendChild only, because the results unit test mounts the plate
// against a minimal fake document.

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
  SWARM_DRAFT_EVERY,
  SWARM_REFIT_EVERY,
  SWARM_RULESET,
} from '../../data/swarmMode.js';
import { survivalArenaById } from '../../data/survivalArenas.js';
import { SURVIVAL_RUN_WAVE_COUNT } from '../../systems/survivalRun.js';
import {
  dailySeedForNow,
  ghostRaceOffer,
  loadCrucibleMeta,
  utcDateKeyNow,
  weeklyMutatorForNow,
} from '../../systems/survivalRecords.js';
import { SURVIVAL_MUTATOR_BY_ID } from '../../data/survivalMutators.js';
import { clearQueuedChallenge, queueGhostPlayback, queueSurvivalChallenge } from '../../systems/survivalMutators.js';
import { meetsUnlockCondition } from '../../systems/survivalUnlocks.js';
import { compileAttackSpec } from '../../combat/attackSpec.js';
import { causalKindsFromSpec } from '../../systems/adventureMigration.js';
import { comboSummary } from '../../systems/stuntCombo.js';
import { el, settle, stamp, cue } from '../kit/index.js';

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

  mount(rootEl, ctx) {
    let enterButton = null;
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-crucible-door');
    rootEl.dataset.kReady = '0';
    rootEl.dataset.stamp = 'CRUCIBLE / SURVIVAL';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-title');

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

    // .k-title — the name and the live mode's blurb (syncMode writes it).
    const title = el('header', 'k-title');
    const h = el('h1', 'k-display k-t-title', 'Crucible');
    h.id = 'sf-crucible-title';
    title.appendChild(h);
    const sub = el('p', 'k-t-emph k-62 sf-crd-sub', '');
    title.appendChild(sub);
    rootEl.appendChild(title);

    // .k-stage — Mode, Hull and Seed as three static rows; each row is the word and its values.
    const stage = el('section', 'k-stage');
    const settings = el('ul', 'k-rows sf-crd-settings');
    settings.style.setProperty('--k-row-cols', 'auto minmax(0, 1fr)');
    settings.setAttribute('aria-label', 'Run settings');
    stage.appendChild(settings);

    function settingRow(label, hook) {
      const row = el('li', 'k-row k-row--static ' + hook);
      row.appendChild(el('span', 'k-row__name k-62', label));
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
    const modes = el('ul', 'k-words k-words--row sf-crd-modes');
    modes.setAttribute('aria-label', 'Mode');
    const modeButtons = [];
    let dailyButton = null;
    const addWord = (list, button) => {
      const li = el('li');
      li.appendChild(button);
      list.appendChild(li);
      return button;
    };
    for (const entry of CRUCIBLE_MODE_CARDS) {
      const card = word(entry.label, 'k-word--emph sf-crd-mode');
      card.dataset.ruleset = entry.ruleset;
      card.setAttribute('aria-pressed', String(!daily && entry.ruleset === ruleset));
      card.addEventListener('click', () => {
        if (daily) {
          daily = false;
          if (freeSeed) seedInput.value = freeSeed;
        }
        ruleset = entry.ruleset;
        for (const other of modeButtons) {
          other.setAttribute('aria-pressed', String(other.dataset.ruleset === ruleset));
        }
        if (dailyButton) dailyButton.setAttribute('aria-pressed', 'false');
        cue('confirm');
        syncMode();
      });
      modeButtons.push(card);
      addWord(modes, card);
    }
    dailyButton = word(DAILY_CARD.label, 'k-word--fine sf-crd-daily');
    dailyButton.setAttribute('aria-pressed', String(daily));
    dailyButton.addEventListener('click', () => {
      if (!daily) freeSeed = seedInput.value;
      daily = true;
      ruleset = SWARM_RULESET;
      for (const other of modeButtons) other.setAttribute('aria-pressed', 'false');
      dailyButton.setAttribute('aria-pressed', 'true');
      cue('confirm');
      syncMode();
    });
    addWord(modes, dailyButton);
    // PQ-169.02: weekly rotation is local. No live-ops feed.
    const weeklyCard = weeklyDoorCard();
    const weeklyButton = word(weeklyCard.label, 'k-word--fine sf-crd-weekly');
    weeklyButton.setAttribute('aria-pressed', String(weekly));
    weeklyButton.addEventListener('click', () => {
      weekly = !weekly;
      weeklyButton.setAttribute('aria-pressed', String(weekly));
      cue('confirm');
      syncMode();
    });
    addWord(modes, weeklyButton);
    const ghostButton = word(GHOST_CARD.label, 'k-word--fine sf-crd-ghost');
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
      ghostButton.setAttribute('aria-pressed', String(!!(raceGhost && offer.available)));
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
      syncGhost();
    }

    // Hull — the starter names as words, the live one bright, its blurb beneath.
    const hullBody = settingRow('Hull', 'sf-crd-row--hull');
    const hulls = el('ul', 'k-words k-words--row sf-crd-hulls');
    hulls.setAttribute('aria-label', 'Hull');
    const buttons = [];
    const hullSentence = el('p', 'k-sentence sf-crd-hull-sub', '');
    function syncHull() {
      const starter = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.id === starterId) || COMBAT_LAB_STARTER_PACKAGES[0];
      hullSentence.textContent = starter ? hullBlurb(starter) : '';
      for (const other of buttons) {
        other.setAttribute('aria-pressed', String(other.dataset.starterId === starterId));
      }
    }
    for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
      const card = word(starter.label, 'k-word--emph sf-crd-hull');
      card.dataset.starterId = starter.id;
      card.setAttribute('aria-pressed', String(starter.id === starterId));
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
    const arenas = el('ul', 'k-words k-words--row sf-crd-arenas');
    arenas.setAttribute('aria-label', 'Arena');
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
        button.setAttribute('aria-pressed', String(button.dataset.arenaId === arenaId));
      }
    };
    for (const arena of COMBAT_LAB_ARENAS.filter(entry => arenaDescriptions[entry.id])) {
      const button = word(arenaDescriptions[arena.id][0], 'k-word--fine sf-crd-arena-choice');
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
    const seedInput = el('input', 'k-input k-input--num');
    seedInput.type = 'text';
    seedInput.inputMode = 'numeric';
    seedInput.spellcheck = false; seedInput.autocomplete = 'off';
    seedInput.setAttribute('aria-label', 'Run seed');
    seedInput.value = String(daily ? dailySeedForNow() : (previous ? previous.seed : freshSeed()));
    seedRow.appendChild(seedInput);
    const reroll = word('New seed', 'k-word--fine');
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

    // The record goes last, below the three settings: the door's job is to start a run, and the
    // reason to start another one is context for that, not a competitor for it. Reading the
    // profile must never be able to stop the door opening, so a broken or absent profile just
    // omits the record.
    let corner = null;
    try {
      if (doorProfile) {
        const records = el('details', 'sf-crd-records');
        records.appendChild(el('summary', 'k-t-fine', 'Records & challenges'));
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
      const ghostHash = raceGhost && offer.available ? offer.hash : null;
      if (ghostHash != null) payload.ghostHash = ghostHash;
      const weeklyMutatorId = weekly ? weeklyMutatorForNow() : null;
      if (weeklyMutatorId) payload.weeklyMutatorId = weeklyMutatorId;
      if (daily || weeklyMutatorId) {
        const dateKey = daily ? utcDateKeyNow() : null;
        if (dateKey) payload.dailyDateKey = dateKey;
        queueSurvivalChallenge({
          seed: payload.seed,
          ruleset: daily ? SWARM_RULESET : ruleset,
          mutators: weeklyMutatorId ? [weeklyMutatorId] : [],
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
    back.addEventListener('click', () => { cue('close'); ctx.bus.emit('ui:popScreen', {}); });
    addWord(footWords, back);
    foot.appendChild(footWords);
    rootEl.appendChild(foot);

    syncMode();
    syncHull();
    this._regions = { title, stage, foot, enter };
    rootEl.dataset.kReady = '1';

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
 * Who, with what, from which side, through which layer. Empty when no defeat receipt was published
 * — which happens on a victory, on an abandoned run, AND on a defeat that carries no receipt
 * (`run:ended` defaults its outcome to 'defeat' whether or not anything killed the player).
 */
export function killChainRows(defeat) {
  if (!defeat) return [];
  const killer = defeat.attacker
    ? (defeat.faction ? `${defeat.attacker} — ${defeat.faction}` : defeat.attacker)
    : 'Unidentified attacker';
  return [
    ['Killed by', killer],
    ['Its weapon', defeat.weapon || 'Unidentified weapon'],
    ['It came from', bearingWord(defeat.direction)],
    ['It got in', breachPhrase(defeat.dominantLayer)],
  ];
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
 * The hero number the results lead with (sheet: "the best chain as a hero number"). A swarm run
 * has a chain; the arc has a score. Null when there is no result to read.
 */
export function resultHero(result) {
  if (!result) return null;
  if (result.ruleset === SWARM_RULESET) return { number: String(result.bestChain || 0), word: 'best chain' };
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
