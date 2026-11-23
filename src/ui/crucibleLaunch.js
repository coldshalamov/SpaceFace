// Crucible launch route (PQ-133 / CRU-018).
//
// A Crucible run starts on the ORDINARY New Game path: buildSandboxLaunchConfig produces a normal
// launch config carrying a validated survivalSetup, requestSandboxGame stages it and emits game:new,
// and main.js's real startNewGame does the reset, ship construction and scene bootstrap. There is no
// second bootstrap, no alternate registry, and no Crucible-only physics.
//
// It also remembers the setup the current run launched with, so "run it again, same seed" replays
// the run as it BEGAN — before any drafted weapon changed the loadout.

import { validateCombatLabSetup } from '../contracts/combatLabSetupSchema.js';
import { COMBAT_LAB_STARTER_PACKAGES, COMBAT_LAB_ARENAS } from '../data/combatLabSetups.js';
import { normalizeSwarmStake, SWARM_DEFAULT_STAKE_ID } from '../data/swarmStakes.js';
import { offerDraft } from '../data/survivalDraft.js';
import { WEAPONS } from '../data/weapons.js';
import { normalizeThreatIds } from '../data/swarmThreats.js';
import { SWARM_CROSSOVER_CATALOG, swarmCrossoverEarned } from '../data/swarmCrossover.js';
import { SHIPS } from '../data/ships.js';
import { buildSlotList } from '../systems/ships.js';
import { applyWeaponsColdLoadout } from '../systems/survivalMutators.js';
import { buildSandboxLaunchConfig, requestSandboxGame } from './sandbox/sandboxSetup.js';
import { SWARM_RULESET } from '../data/swarmMode.js';
import { loadCrucibleMeta, normalizeBestLine } from '../systems/survivalRecords.js';
import { isModeAvailable } from '../systems/survivalUnlocks.js';
import { BLOCK_RULESET } from '../systems/survivalRun.js';
import { POWERED_CONVEYOR_RULESET } from '../data/survivalMutators.js';
import { clearQueuedChallenge } from '../systems/survivalMutators.js';
import { swarmQuickStartExtras } from '../data/swarmQuickStart.js';
import { swarmArcadeSeedFor } from '../data/swarmLadder.js';

/**
 * The door's default room — where a run lands when nothing else was picked. Every Combat Lab
 * arena now ships authored on the door's row; the two real-sector side rooms (ceres_belt,
 * tethys_hub) carry no star gate or ladder seed and stay open as plain rooms in every mode.
 */
export const CRUCIBLE_ARENA_ID = 'helios_core';

/**
 * WHAT THE CRUCIBLE BUTTON PLAYS.
 *
 * Swarm is the default: clear a finite pack, spend or save, then launch the next
 * round. It has no last round. The authored thirty-wave Gauntlet remains under `scored`.
 * `block` (PQ-133.04 R4) is the bounded public ten-wave Foundry block ending in victory —
 * the same authored template recipes the Gauntlet's first act plays, with an ending.
 */
export const CRUCIBLE_DEFAULT_RULESET = SWARM_RULESET;
// The fresh Crucible route teaches shove physics immediately; benchmark package IDs stay stable.
export const CRUCIBLE_DEFAULT_STARTER_ID = 'ricochet_runner';
export function crucibleStarterIdForSetup(setup) {
  const loadout = Array.isArray(setup?.loadout) ? setup.loadout : [];
  const match = COMBAT_LAB_STARTER_PACKAGES.find(entry => entry.hullId === setup?.hullId
    && entry.loadout.length === loadout.length
    && entry.loadout.every(slot => loadout.some(actual => actual?.slotIndex === slot.slotIndex && actual?.defId === slot.defId)));
  if (match) return match.id;
  // A bare-hull launch has no package: its starter id names the hull itself, so the door and a
  // share code re-derive the same launch instead of falling back to an authored kit.
  if (typeof setup?.hullId === 'string' && SHIPS.some(ship => ship.id === setup.hullId)) {
    return `hull:${setup.hullId}`;
  }
  return CRUCIBLE_DEFAULT_STARTER_ID;
}
export const CRUCIBLE_RULESETS = Object.freeze([SWARM_RULESET, 'scored', 'boss_circuit', BLOCK_RULESET, POWERED_CONVEYOR_RULESET]);

export function normalizeCrucibleRuleset(ruleset) {
  return CRUCIBLE_RULESETS.includes(ruleset) ? ruleset : CRUCIBLE_DEFAULT_RULESET;
}
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
export const CRUCIBLE_SEED_MIN = 1;
export const CRUCIBLE_SEED_MAX = 0xffffffff;

let lastSetup = null;

/** Build (and validate) a Crucible setup from a starter package id and a seed. */
export function crucibleSetupFor({
  starterId, seed, arenaId = CRUCIBLE_ARENA_ID, ruleset = CRUCIBLE_DEFAULT_RULESET, swarmStake = null,
  startWave = 1, swarmThreats = null, openArmoryBeforeRound1,
} = {}) {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === starterId)
    || COMBAT_LAB_STARTER_PACKAGES.find(entry => entry.id === CRUCIBLE_DEFAULT_STARTER_ID);
  if (!starter) return { ok: false, issues: [{ path: 'starterId', message: 'Default Swarm starter is missing' }] };
  const result = validateCombatLabSetup({
    schema: 'spaceface.combatLabSetup.v1',
    hullId: starter.hullId,
    loadout: starter.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })),
    // Survival ignores enemyPackageId — the wave owner decides what spawns — but the shared
    // schema requires a legal value.
    enemyPackageId: 'wasp_flight',
    arenaId: ruleset === POWERED_CONVEYOR_RULESET ? CRUCIBLE_ARENA_ID : arenaId,
    seed: normalizeSeed(seed),
    // SWARM-04: the checkpoint's entry wave. Only a swarm launch reads it; the arc, block
    // and circuit always open at their authored first wave, so it is carried as schema.
    wave: Number.isInteger(startWave) && startWave > 1 ? startWave : 1,
  });
  // The ruleset is not part of the closed setup schema, so it travels alongside the validated
  // value where the launch config can pick it up. The stake rides the same way — requestCrucibleRun
  // reads setup.swarmStake and feeds the swarm's purse/pressure contract.
  if (result && result.ok && result.value) {
    result.ruleset = normalizeCrucibleRuleset(ruleset);
    if (result.ruleset === SWARM_RULESET && typeof swarmStake === 'string' && swarmStake) {
      result.value.swarmStake = normalizeSwarmStake(swarmStake);
    }
    // SWARM-06: the Threat wager rides beside the setup exactly like the stake — never inside
    // the closed schema. An empty pick stays absent, so a no-wager launch writes nothing.
    const threats = normalizeThreatIds(swarmThreats);
    if (result.ruleset === SWARM_RULESET && threats.length) {
      result.value.swarmThreats = threats;
    }
    // S4 quick-start: the armory opt-out rides beside the setup like the stake — swarm only.
    if (result.ruleset === SWARM_RULESET && openArmoryBeforeRound1 === false) {
      result.value.openArmoryBeforeRound1 = false;
    }
  }
  return result;
}

/**
 * The bare-hull launch: any ship in the catalog, an empty fit, and the armory for the kit.
 * `hull:<shipId>` is the door's own starter id for it — never a COMBAT_LAB package id. The
 * loadout is EMPTY on purpose: the swarm's purse buys the kit in the opening armory, which is
 * the whole point of the sandbox. Null when the hull id is unknown, so the door cannot launch
 * a ship that does not exist.
 */
export function crucibleHullSetupFor({
  hullId, seed, arenaId = CRUCIBLE_ARENA_ID, ruleset = CRUCIBLE_DEFAULT_RULESET, swarmStake = null,
  startWave = 1, swarmThreats = null, loadout = null,
} = {}) {
  const shipDef = SHIPS.find((entry) => entry && entry.id === hullId);
  if (!shipDef) return { ok: false, issues: [{ path: 'hullId', message: 'Unknown hull' }] };
  // SAVE-AND-SOAK-1 Part B: a resume rebuild names its fittings — the slot list the
  // interrupted run flew — where a bare-hull launch stays empty on purpose.
  const fitting = Array.isArray(loadout)
    ? loadout
      .filter((entry) => entry && Number.isInteger(entry.slotIndex) && typeof entry.defId === 'string')
      .map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId }))
    : [];
  const result = validateCombatLabSetup({
    schema: 'spaceface.combatLabSetup.v1',
    hullId,
    loadout: fitting,
    enemyPackageId: 'wasp_flight',
    arenaId: ruleset === POWERED_CONVEYOR_RULESET ? CRUCIBLE_ARENA_ID : arenaId,
    seed: normalizeSeed(seed),
    wave: Number.isInteger(startWave) && startWave > 1 ? startWave : 1,
  });
  if (result && result.ok && result.value) {
    result.ruleset = normalizeCrucibleRuleset(ruleset);
    if (result.ruleset === SWARM_RULESET && typeof swarmStake === 'string' && swarmStake) {
      result.value.swarmStake = normalizeSwarmStake(swarmStake);
    }
    const threats = normalizeThreatIds(swarmThreats);
    if (result.ruleset === SWARM_RULESET && threats.length) {
      result.value.swarmThreats = threats;
    }
  }
  return result;
}

/** The door's display names, so `?swarmArena=` accepts what the arena row shows. */
const SWARM_ARENA_DOOR_NAMES = Object.freeze({
  helios_core: 'Ricochet Foundry',
  lagrange_crucible: 'Lagrange Crucible',
  cinder_sluice: 'Cinder Sluice',
  cryo_drift: 'Cryo Drift',
  storm_lattice: 'Storm Lattice',
  asteroid_mill: 'Asteroid Mill',
  the_hive: 'The Hive',
});

function arenaNameKey(name) {
  return typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
}

/**
 * Resolve a `?swarmArena=` value to an arena id: the id itself, the catalog label, or the
 * door's display name, compared case- and punctuation-insensitively. Null when nothing
 * matches — the caller falls back to the door's default arena.
 */
export function crucibleArenaIdForName(name) {
  const key = arenaNameKey(name);
  if (!key) return null;
  const match = COMBAT_LAB_ARENAS.find((arena) => arenaNameKey(arena.id) === key
    || arenaNameKey(arena.label) === key
    || arenaNameKey(SWARM_ARENA_DOOR_NAMES[arena.id]) === key);
  return match ? match.id : null;
}

/** Every player hull the door can field, cheapest first. */
export function crucibleHullChoices() {
  return SHIPS.map((ship) => ({
    id: `hull:${ship.id}`,
    hullId: ship.id,
    name: ship.name,
    tier: Number.isInteger(ship.tier) ? ship.tier : 0,
    slotCount: buildSlotList(ship).length,
    // SWARM-06: a swarmEarned hull (the Saucer) is the crossover ledger's proof, not a kit
    // lock. Until the ledger carries it the door shows the earn line — the goal in the room —
    // and refuses the pick, so a bare-hull launch can never hand the earn away for free.
    swarmEarned: typeof ship.swarmEarned === 'string' && ship.swarmEarned ? ship.swarmEarned : null,
    earned: !(typeof ship.swarmEarned === 'string' && ship.swarmEarned)
      || swarmCrossoverEarned(ship.swarmEarned),
    earnText: (() => {
      const row = typeof ship.swarmEarned === 'string' && ship.swarmEarned
        ? SWARM_CROSSOVER_CATALOG.find((entry) => entry.id === ship.swarmEarned)
        : null;
      return row && row.blurb ? row.blurb : null;
    })(),
  })).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

/** A fresh UI seed. Simulation determinism starts after this value is chosen. */
export function freshSeed() {
  const now = Date.now() >>> 0;
  const seed = normalizeSeed((now ^ (now >>> 13) ^ 0x9e3779b9) >>> 0);
  // The generated zero is outside the launch contract; explicit input still validates unchanged.
  return seed || CRUCIBLE_SEED_MIN;
}

export function normalizeSeed(seed) {
  if (typeof seed === 'string') {
    const trimmed = seed.trim();
    if (!/^-?\d+$/.test(trimmed)) return NaN;
    seed = Number(trimmed);
  }
  if (!Number.isFinite(seed)) return NaN;
  return Number.isInteger(seed) ? seed : Math.trunc(seed);
}

/** The ordinary launch config, with the Crucible setup and its ruleset riding along. */
export function crucibleLaunchConfig(setup, ruleset = CRUCIBLE_DEFAULT_RULESET, extras = {}) {
  return buildSandboxLaunchConfig({}, {
    survivalSetup: setup,
    survivalRuleset: normalizeCrucibleRuleset(ruleset),
    swarmStake: typeof extras.swarmStake === 'string' ? extras.swarmStake : undefined,
    swarmThreats: Array.isArray(extras.swarmThreats) ? extras.swarmThreats : undefined,
    swarmPerks: Array.isArray(extras.swarmPerks) ? extras.swarmPerks : undefined,
    openingLesson: extras.openingLesson === true,
    practice: extras.practice === true,
    dailyDateKey: extras.dailyDateKey,
    weeklyMutatorId: extras.weeklyMutatorId,
    ghostHash: extras.ghostHash,
    zeroScrapOpening: extras.zeroScrapOpening,
    retryOpeningEquipment: extras.retryOpeningEquipment,
    openArmoryBeforeRound1: extras.openArmoryBeforeRound1 === false ? false : undefined,
    swarmResume: extras.swarmResume && typeof extras.swarmResume === 'object'
      ? extras.swarmResume
      : undefined,
  });
}

/** Whether the Crucible door may offer its optional ordinary-Swarm opening lesson. */
export function canChooseSwarmOpeningLesson({
  ruleset = SWARM_RULESET, daily = false, weekly = false, raceGhost = false,
  pendingShare = null, practiceQueued = false,
} = {}) {
  return ruleset === SWARM_RULESET && daily !== true && weekly !== true
    && raceGhost !== true && pendingShare == null && practiceQueued !== true;
}

/**
 * Launch a run. Remembers the setup so the results screen can replay this exact seed, then goes
 * through the real New Game request.
 */
export function requestCrucibleRun(bus, setup, ruleset = CRUCIBLE_DEFAULT_RULESET) {
  const candidate = setup && setup.value ? setup.value : setup;
  if (!candidate || candidate.ok === false) return false;
  // Validation and native launch must use the same unwrapped setup. Passing a
  // successful setup result must not send its { ok, value } envelope to boot.
  setup = candidate;
  if (!Number.isInteger(candidate.seed) || candidate.seed < CRUCIBLE_SEED_MIN || candidate.seed > CRUCIBLE_SEED_MAX) {
    return false;
  }
  const requested = normalizeCrucibleRuleset(ruleset);
  let profile = null;
  if (requested === 'boss_circuit') {
    try { profile = loadCrucibleMeta(); } catch { profile = null; }
  }
  const resolved = requested === 'boss_circuit' && !isModeAvailable(profile, 'boss_circuit')
    ? CRUCIBLE_DEFAULT_RULESET
    : requested;
  const dailyDateKey = typeof setup.dailyDateKey === 'string' && setup.dailyDateKey
    ? setup.dailyDateKey
    : null;
  const weeklyMutatorId = typeof setup.weeklyMutatorId === 'string' && setup.weeklyMutatorId
    ? setup.weeklyMutatorId
    : null;
  const ghostHash = Number.isInteger(setup.ghostHash)
    ? (setup.ghostHash >>> 0)
    : (typeof setup.ghostHash === 'string' && /^\d+$/.test(setup.ghostHash)
      ? Number(setup.ghostHash) >>> 0
      : null);
  const launchSetup = { ...setup };
  delete launchSetup.openingLesson;
  delete launchSetup.practice;
  delete launchSetup.dailyDateKey;
  delete launchSetup.weeklyMutatorId;
  delete launchSetup.ghostHash;
  delete launchSetup.swarmStake;
  delete launchSetup.swarmThreats;
  delete launchSetup.swarmPerks;
  delete launchSetup.openArmoryBeforeRound1;
  delete launchSetup.zeroScrapOpening;
  delete launchSetup.retryOpeningEquipment;
  delete launchSetup.resume;
  // The stake travels beside the setup like the ruleset — never inside the closed schema.
  const swarmStake = typeof setup.swarmStake === 'string' ? normalizeSwarmStake(setup.swarmStake) : null;
  // SWARM-06: same seam for the Threat wager and an explicit perk pick. The door's perks live
  // on the profile (runSession reads them at begin); a hand-rolled request may still name
  // them — normalized against the catalog here and earned-checked again at begin.
  const swarmThreats = normalizeThreatIds(setup.swarmThreats);
  const swarmPerks = Array.isArray(setup.swarmPerks) ? setup.swarmPerks.slice() : null;
  // S4 quick-start: the armory opt-out rides beside the setup like the stake — swarm only,
  // never inside the closed schema. Absent means the armory opens as authored.
  const openArmoryBeforeRound1 = resolved === SWARM_RULESET && setup.openArmoryBeforeRound1 === false
    ? false
    : undefined;
  if (weeklyMutatorId === 'weapons_cold') {
    launchSetup.loadout = applyWeaponsColdLoadout(launchSetup.loadout);
  }
  const practice = setup.practice === true;
  const zeroScrapOpening = resolved === SWARM_RULESET && setup.zeroScrapOpening === true;
  const openingLesson = resolved === SWARM_RULESET && setup.openingLesson === true && !practice
    && !dailyDateKey && !weeklyMutatorId && ghostHash == null;
  lastSetup = {
    ...launchSetup,
    ruleset: resolved,
    loadout: (launchSetup.loadout || []).map((entry) => ({ ...entry })),
    ...(openingLesson ? { openingLesson: true } : {}),
    ...(practice ? { practice: true } : {}),
  };
  if (dailyDateKey) lastSetup.dailyDateKey = dailyDateKey;
  if (weeklyMutatorId) lastSetup.weeklyMutatorId = weeklyMutatorId;
  if (ghostHash != null) lastSetup.ghostHash = ghostHash;
  if (swarmStake) lastSetup.swarmStake = swarmStake;
  // The wager is part of what a retry replays — a threat-less retry of a wagered run would
  // silently fly an easier room under the same result.
  if (swarmThreats.length) lastSetup.swarmThreats = swarmThreats.slice();
  if (swarmPerks && swarmPerks.length) lastSetup.swarmPerks = swarmPerks.slice();
  // A retry replays the launch the player took — a quick-started run retries into flight,
  // not into the armory it skipped.
  if (openArmoryBeforeRound1 === false) lastSetup.openArmoryBeforeRound1 = false;
  if (zeroScrapOpening) lastSetup.zeroScrapOpening = true;
  // Training is an explicit choice on the Crucible door. A new profile must meet the ordinary
  // opening horde immediately; history is not consent to replace that encounter with a lesson.
  requestSandboxGame(bus, crucibleLaunchConfig(launchSetup, resolved, {
    openingLesson,
    practice,
    dailyDateKey,
    weeklyMutatorId,
    ghostHash,
    swarmStake,
    swarmThreats: swarmThreats.length ? swarmThreats : undefined,
    swarmPerks: swarmPerks && swarmPerks.length ? swarmPerks : undefined,
    openArmoryBeforeRound1,
    zeroScrapOpening,
    retryOpeningEquipment: setup.retryOpeningEquipment,
    // SAVE-AND-SOAK-1 Part B: the door's Resume word sends the interrupted run's record —
    // it rides beside the setup like the stake and lands on run:beginRequested.
    swarmResume: setup.resume && typeof setup.resume === 'object' ? setup.resume : undefined,
  }));
  return true;
}

/**
 * PQ-146 Best Line practice: map a stored causal line back to the run it was earned on. Same
 * seed, the recorded ruleset's underlying mode ('practice' lines relaunch under their parent
 * ruleset — the practice flag rides separately), and the recorded arena when it still exists.
 * Returns null for a line that cannot name its seed — never a guessed launch.
 */
export function practiceLaunchFor(line) {
  const normalized = normalizeBestLine(line);
  if (!normalized || !Number.isInteger(normalized.seed)) return null;
  const rules = normalized.recordRules && typeof normalized.recordRules === 'object'
    ? normalized.recordRules : {};
  // PQ-133.04 R4: a best line earned on the bounded block relaunches as the same block, so
  // practicing a line never changes the run shape it was earned on. Every other mode keeps
  // its parent mapping — 'scored' stays the Gauntlet, anything else is the swarm floor.
  const ruleset = rules.mode === 'scored'
    ? 'scored'
    : (rules.mode === BLOCK_RULESET ? BLOCK_RULESET : SWARM_RULESET);
  return {
    seed: normalized.seed,
    ruleset,
    arenaId: typeof rules.arenaId === 'string' && rules.arenaId ? rules.arenaId : null,
  };
}

// The title's SWARM door may ask the Swarm screen to open on its one-button PLAY front. The front is
// the screen's default view either way; the flag is one-shot so a caller can say so explicitly
// (the bench's `swarm-play` shot does) without leaving state behind for the next mount.
let swarmPlayEntry = false;
export function requestSwarmPlayEntry() { swarmPlayEntry = true; }
export function consumeSwarmPlayEntry() { const was = swarmPlayEntry; swarmPlayEntry = false; return was; }

/**
 * THE SWARM DOOR'S STARTING GUN (04_SWARM.md §5, §7). A Swarm run starts at zero Scrap with the
 * chosen hull and one free compatible opening gun. These are the three every hull is offered, in
 * the order the door shows them, each with the one line that says what it does to a ship.
 */
export const SWARM_OPENING_GUN_LINES = Object.freeze({
  wpn_autocannon_s: 'Steady slugs. Good damage, a little kick.',
  wpn_pulse_laser_s: 'Fast bolts. Most damage, almost no push.',
  wpn_concussion_cannon_s: 'Barely scratches. Every hit throws the ship.',
});
const OPENING_GUN_ORDER = Object.keys(SWARM_OPENING_GUN_LINES);
export const SWARM_DEFAULT_HULL_ID = 'ship_hornet';
export const SWARM_DEFAULT_GUN_ID = 'wpn_autocannon_s';

/**
 * The free opening guns a hull can take: the same tier-one weapon cards the opening armory deals
 * free, read off the whole eligible pool (not a seeded draw, so the list never changes with the
 * seed). Each entry carries the offer id and slot the launch replays before round 1.
 */
export function swarmOpeningGuns(hullId) {
  if (!SHIPS.some((ship) => ship && ship.id === hullId)) return [];
  const draft = offerDraft({ seed: 1, wave: 0, hullId, fittings: [], ruleset: SWARM_RULESET, count: 1000 });
  const guns = (draft && draft.offers ? draft.offers : []).filter((offer) => {
    const def = WEAPON_BY_ID.get(offer.defId);
    return def && def.slotType === 'weapon' && def.tier <= 1 && offer.defId.startsWith('wpn_')
      && Number.isInteger(offer.slotIndex);
  });
  const rank = (defId) => { const i = OPENING_GUN_ORDER.indexOf(defId); return i < 0 ? OPENING_GUN_ORDER.length : i; };
  const seen = new Set();
  return guns
    .filter((offer) => (seen.has(offer.defId) ? false : (seen.add(offer.defId), true)))
    .sort((a, b) => rank(a.defId) - rank(b.defId) || a.defId.localeCompare(b.defId))
    .map((offer) => ({
      offerId: offer.id,
      defId: offer.defId,
      slotIndex: offer.slotIndex,
      name: (WEAPON_BY_ID.get(offer.defId) || {}).name || offer.name || offer.defId,
      line: SWARM_OPENING_GUN_LINES[offer.defId] || '',
    }));
}

const DOOR_PICK_KEY = 'sf.swarm.doorPick.v1';
/**
 * The door's remembered picks — arena, hull and the starting gun per hull — persisted across
 * sessions like the stake. Every read is guarded: an unknown arena, hull or gun falls back to the
 * shipped default rather than launching something that does not exist.
 */
export function lastSwarmDoorPick() {
  let raw = null;
  try { raw = JSON.parse(globalThis.localStorage && globalThis.localStorage.getItem(DOOR_PICK_KEY) || 'null'); } catch { raw = null; }
  const pick = raw && typeof raw === 'object' ? raw : {};
  const arenaId = typeof pick.arenaId === 'string' && COMBAT_LAB_ARENAS.some((a) => a.id === pick.arenaId)
    ? pick.arenaId : null;
  const hull = typeof pick.hullId === 'string' ? SHIPS.find((ship) => ship && ship.id === pick.hullId) : null;
  const hullId = hull && (!hull.swarmEarned || swarmCrossoverEarned(hull.swarmEarned)) ? hull.id : null;
  const guns = pick.guns && typeof pick.guns === 'object' ? { ...pick.guns } : {};
  return { arenaId, hullId, guns };
}
export function rememberSwarmDoorPick({ arenaId = null, hullId = null, gunDefId = null } = {}) {
  try {
    if (!globalThis.localStorage) return;
    const prior = lastSwarmDoorPick();
    const next = { arenaId: arenaId || prior.arenaId, hullId: hullId || prior.hullId, guns: prior.guns };
    if (hullId && gunDefId) next.guns[hullId] = gunDefId;
    globalThis.localStorage.setItem(DOOR_PICK_KEY, JSON.stringify(next));
  } catch { /* optional */ }
}
/** The starting gun the door shows for a hull: the one last flown on it, else the default. */
export function swarmDoorGunFor(hullId, pick = lastSwarmDoorPick()) {
  const guns = swarmOpeningGuns(hullId);
  const wanted = pick && pick.guns ? pick.guns[hullId] : null;
  return guns.find((gun) => gun.defId === wanted) || guns.find((gun) => gun.defId === SWARM_DEFAULT_GUN_ID)
    || guns[0] || null;
}

/**
 * PLAY (04_SWARM.md §1, §7): the chosen hull, empty, on a fresh seed, starting at zero Scrap, with
 * the chosen free gun fitted before round 1 — so the run goes straight from the load into round 1
 * in flight. The gun rides as the opening-equipment replay the retry path already validates, so
 * the run's economy is the zero-Scrap one (rounds pay Scrap; the floor sells the guns).
 * Returns the setup for requestCrucibleRun, or null.
 */
export function swarmPlaySetup({
  seed = null, arenaId = null, hullId = null, gunDefId = null, stake = null,
} = {}) {
  const pick = lastSwarmDoorPick();
  const hull = hullId || pick.hullId || SWARM_DEFAULT_HULL_ID;
  const arena = arenaId || pick.arenaId || CRUCIBLE_ARENA_ID;
  // A ladder room plays its authored Course seed — the run that banks stars and opens rooms
  // (swarmLadder.isSwarmLadderRun). A side room with no Course gets a fresh seed.
  const seedFor = (room) => (Number.isInteger(seed) ? seed : (swarmArcadeSeedFor(room) ?? freshSeed()));
  const build = (room) => crucibleHullSetupFor({
    hullId: hull, seed: seedFor(room), arenaId: room, ruleset: SWARM_RULESET,
    swarmStake: stake || lastSwarmStakeUsed() || SWARM_DEFAULT_STAKE_ID,
  });
  let setup = build(arena);
  if ((!setup || !setup.ok) && arena !== CRUCIBLE_ARENA_ID) setup = build(CRUCIBLE_ARENA_ID);
  if (!setup || !setup.ok || !setup.value) return null;
  const guns = swarmOpeningGuns(hull);
  const gun = guns.find((entry) => entry.defId === gunDefId) || swarmDoorGunFor(hull, pick);
  return {
    ...setup.value,
    zeroScrapOpening: true,
    retryOpeningEquipment: {
      hullId: hull,
      gun: gun ? { offerId: gun.offerId, defId: gun.defId, slotIndex: gun.slotIndex } : null,
    },
  };
}

const LAST_STAKE_KEY = 'sf.swarm.lastStake.v1';
/** The stake the player last flew, persisted across sessions; null for a first-timer. */
export function lastSwarmStakeUsed() {
  try {
    const v = globalThis.localStorage && globalThis.localStorage.getItem(LAST_STAKE_KEY);
    return typeof v === 'string' && v ? normalizeSwarmStake(v) : null;
  } catch { return null; }
}
export function rememberSwarmStake(stakeId) {
  try { if (globalThis.localStorage && stakeId) globalThis.localStorage.setItem(LAST_STAKE_KEY, normalizeSwarmStake(stakeId)); } catch { /* optional */ }
}
/** First-timers start on Exhibition (the roomy purse); after that, the stake last used. */
export function defaultSwarmStakeId() { return lastSwarmStakeUsed() || 'exhibition'; }

/** The setup the live (or most recent) run launched with, or null before the first launch. */
export function lastCrucibleSetup() {
  if (!lastSetup) return null;
  return { ...lastSetup, loadout: lastSetup.loadout.map((entry) => ({ ...entry })) };
}

/** The ruleset the live (or most recent) run launched under. */
export function lastCrucibleRuleset() {
  return lastSetup ? normalizeCrucibleRuleset(lastSetup.ruleset) : CRUCIBLE_DEFAULT_RULESET;
}

/**
 * INF-010 — one explicit retry snapshot: the selected seed, kit (hull + loadout), arena and
 * ruleset as the run BEGAN, deep-copied so later mutation cannot silently change the challenge.
 * Carries no campaign possessions and no asset handles: the retry replays through the ordinary
 * New Game route, which reuses resident assets and performs a clean run reset. Null when no run
 * has launched yet (the results screen then returns to setup instead).
 */
export function buildCrucibleRetryRequest(setup = lastCrucibleSetup(), ruleset = lastCrucibleRuleset(), result = null) {
  if (!setup) return null;
  const resolvedRuleset = normalizeCrucibleRuleset(ruleset ?? setup.ruleset);
  const retrySetup = {
    ...setup,
    loadout: Array.isArray(setup.loadout) ? setup.loadout.map((entry) => ({ ...entry })) : [],
    ruleset: resolvedRuleset,
  };
  delete retrySetup.retryOpeningEquipment;
  const opening = result?.openingEquipment;
  if (setup.zeroScrapOpening === true && resolvedRuleset === SWARM_RULESET && result?.ruleset === resolvedRuleset
    && result.seed === setup.seed && result.arenaId === setup.arenaId && opening?.hullId === setup.hullId
    && !result.circuit && !result.recordRules?.circuit) {
    retrySetup.retryOpeningEquipment = { hullId: opening.hullId,
      gun: opening.gun === null ? null : { ...opening.gun } };
  }
  return { setup: retrySetup, ruleset: resolvedRuleset };
}

/** Test/lifecycle seam: forget the remembered setup. */
export function clearCrucibleSetup() {
  lastSetup = null;
}

/**
 * ONE PRESS TO THE FIGHT (04_SWARM.md §2, §7). The title's Swarm door launches round 1 straight
 * away with exactly what the Swarm screen's PLAY would launch: the remembered room, hull, starting
 * gun and difficulty (within a session the room and hull of the last Swarm launch lead), zero
 * Scrap, the gun fitted before the load ends. One launch shape for both doors — the title press
 * and PLAY can never fly different runs. Returns the setup, or null.
 */
export function swarmQuickStartSetup({
  seed = null,
  previous = lastCrucibleSetup(),
  previousRuleset = lastCrucibleRuleset(),
  stake = lastSwarmStakeUsed(),
} = {}) {
  const extras = swarmQuickStartExtras();
  if (!extras) return null;
  const fromSwarm = !!previous && previousRuleset === SWARM_RULESET
    && !previous.dailyDateKey && !previous.weeklyMutatorId && !previous.practice;
  const pick = lastSwarmDoorPick();
  const arenaId = (fromSwarm && typeof previous.arenaId === 'string' && previous.arenaId)
    || pick.arenaId || extras.arenaId;
  const hullId = (fromSwarm && typeof previous.hullId === 'string' && previous.hullId) || pick.hullId || null;
  return swarmPlaySetup({ seed, arenaId, hullId, stake: stake || extras.swarmStake });
}

/**
 * AGAIN, from Run Over (04_SWARM.md §8): the same picks, back into round 1. A ladder run replays
 * its Course (the seed that banks stars); a run on any other seed — a side room, a typed seed —
 * gets a fresh layout, with `sameSeed` carrying the exact replay for the secondary key. Shared
 * challenges (daily, weekly, ghost, practice) and checkpoint starts always replay as they began.
 * Returns { setup, ruleset, sameSeed } or null before any launch.
 */
export function buildSwarmAgainRequest(result = null, setup = lastCrucibleSetup(), ruleset = lastCrucibleRuleset()) {
  const retry = buildCrucibleRetryRequest(setup, ruleset, result);
  if (!retry) return null;
  const s = retry.setup;
  const replay = { ...retry, sameSeed: null };
  if (retry.ruleset !== SWARM_RULESET || s.dailyDateKey || s.weeklyMutatorId || s.ghostHash != null
    || s.practice || (Number.isInteger(s.wave) && s.wave > 1)) return replay;
  const ladderSeed = swarmArcadeSeedFor(s.arenaId);
  if (ladderSeed != null && s.seed === ladderSeed) return replay;
  return { setup: { ...s, seed: freshSeed() }, ruleset: retry.ruleset, sameSeed: retry };
}

/** The title's Swarm press: build the quick-start setup and send it down the ordinary New Game route. */
export function requestSwarmQuickStart(bus, options = {}) {
  const setup = swarmQuickStartSetup(options);
  if (!setup) return false;
  // A daily or shared challenge queued earlier must not hijack an ordinary quick run.
  clearQueuedChallenge();
  return requestCrucibleRun(bus, setup, SWARM_RULESET);
}
