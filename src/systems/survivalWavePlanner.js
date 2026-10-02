// Pure Survival wave planner (CRU-010).
// Intent only: no bus, registry, state, DOM, I/O, or spawnBudget import.
// Same input → same output. Never mutates the input.

import { mulberry32 } from '../core/rng.js';
import {
  SPAWN_BUDGET_DEFAULT_MAX,
  SPAWN_BUDGET_HARD_MAX,
  SURVIVAL_ARC_LENGTH,
  SURVIVAL_TEMPLATE_BLOCK,
  actIndexForWave,
  composeArcWave,
  composeEndlessWave,
  difficultyForWave,
  templateWaveOf,
} from '../data/survivalActs.js';
import { COMBAT_LAB_ARENAS } from '../data/combatLabSetups.js';
import {
  SURVIVAL_BOSS_CIRCUIT,
  SURVIVAL_GATE_GROUPS,
  SURVIVAL_WAVE_SCHEMA_VERSION,
  SURVIVAL_WAVES,
  peakConcurrentDemand,
  validateWaveRecipe,
} from '../data/survivalWaves.js';
import {
  SWARM_CLEANUP_TICKS,
  SWARM_ROSTER,
  SWARM_RULESET,
  SWARM_SPAWN_CAP,
  SWARM_WAVE_DURATION_TICKS,
  isSwarmDraftWave,
  isSwarmRefitWave,
  SWARM_DEBUT_DISTANCE,
  SWARM_DEBUT_TICKS,
  SWARM_MASS_GAP_CLOSE_TICKS,
  SWARM_MASS_GAP_FODDER_SCALE,
  SWARM_MASS_GAP_ROCK_RADIUS,
  SWARM_MASS_GAP_WALL_DISTANCE,
  SWARM_MASS_GAP_WALL_ROCKS,
  SWARM_FODDER_ROLES,
  isSwarmBossWave,
  isSwarmMassGapWave,
  swarmArenaPhase,
  swarmFodderRoster,
  swarmFreeGateFor,
  swarmLevel,
  swarmNewcomerFor,
  swarmWallPickFor,
  swarmOpeningCount,
  swarmOpeningPackages,
  swarmPlanBlock,
  swarmRosterFor,
  swarmRewards,
  swarmWaveOf,
} from '../data/swarmMode.js';
import { swarmStakeFor } from '../data/swarmStakes.js';
import { CRUCIBLE_REEF_LAYOUT_ID, CRUCIBLE_SLALOM_WELL_COUNT } from '../data/survivalMutators.js';

// Binding ranges from spaceface.combatLabSetup.v1 (seed 1..0xffffffff, wave 1..999).
// Authored recipes exist for template waves 1–10 per live arena. The thirty-wave
// arc remaps waves 11–30 onto that template. Waves in 31..999 are in-range
// input and return the documented error — they are not silently remapped.
const SEED_MIN = 1;
const SEED_MAX = 0xffffffff;
const WAVE_MIN = 1;
const WAVE_MAX = 999;

export const WAVE_PLAN_ERROR = 'invalid_input';

const ARENA_IDS = new Set(COMBAT_LAB_ARENAS.map((arena) => arena.id));

const RECIPE_BY_ARENA_WAVE = new Map();
for (const recipe of SURVIVAL_WAVES) {
  RECIPE_BY_ARENA_WAVE.set(`${recipe.arenaId}#${recipe.wave}`, recipe);
}

const HEAVY_ROLES = new Set(['anchor', 'elite']);
const FODDER_ENEMIES = new Set(['wasp_swarmer', 'choir_zealot']);
const HEAVIES_ONLY_FALLBACK = Object.freeze({ role: 'anchor', enemyId: 'bruiser_brawler' });
const SWARM_NAME_BY_ID = new Map(SWARM_ROSTER.map((entry) => [entry.enemyId, entry.name]));
// fromWave: 1 — the mutator fields heavies from the first wave, matching applyHeaviesOnly's
// wave-agnostic package rewrite; pickSwarmArchetype honors a plan-declared unlock timing.
const HEAVIES_ONLY_ROSTER = Object.freeze([
  { enemyId: 'bruiser_brawler', role: 'anchor', weight: 6, fromWave: 1 },
  { enemyId: 'corsair_raider', role: 'elite', weight: 4, fromWave: 1 },
  { enemyId: 'field_anchor_controller', role: 'anchor', weight: 3, fromWave: 1 },
]);

function mutatorList(mutators) {
  return Array.isArray(mutators) ? mutators : [];
}

function isHeavyPackage(pkg) {
  if (!pkg) return false;
  if (pkg.role === 'mass') return false;
  if (FODDER_ENEMIES.has(pkg.enemyId)) return false;
  return HEAVY_ROLES.has(pkg.role);
}

function applyHeaviesOnly(packages) {
  if (!Array.isArray(packages)) return [];
  return packages.map((pkg) => {
    if (isHeavyPackage(pkg)) {
      return { ...pkg };
    }
    const next = { ...pkg, role: HEAVIES_ONLY_FALLBACK.role, enemyId: HEAVIES_ONLY_FALLBACK.enemyId };
    return next;
  });
}

function decorateWeeklyPlan(plan, mutators) {
  if (!plan || plan.ok === false) return plan;
  const list = mutatorList(mutators);
  if (list.includes('gravity_slalom')) plan.wellCount = CRUCIBLE_SLALOM_WELL_COUNT;
  if (list.includes('reef')) plan.reefLayoutId = CRUCIBLE_REEF_LAYOUT_ID;
  return plan;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path, message) {
  return { path, message };
}

function invalid(issues) {
  return { ok: false, error: WAVE_PLAN_ERROR, issues };
}

export function isCombatLabSeed(value) {
  return Number.isInteger(value) && value >= SEED_MIN && value <= SEED_MAX;
}

function isCombatLabWave(value) {
  return Number.isInteger(value) && value >= WAVE_MIN && value <= WAVE_MAX;
}

/**
 * Mix (seed, arenaId, wave, act) into a uint32 stream seed.
 * Wave is mixed independently of the run seed so two waves of the same run
 * never share a mulberry32 stream.
 */
export function wavePlanStreamSeed(seed, arenaId, wave, act) {
  const label = `survival-wave-plan-v1|${arenaId}|w${wave}|a${act}`;
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  h = (h ^ Math.imul(wave, 0x85ebca6b) ^ Math.imul(act, 0xc2b2ae35)) >>> 0;
  return h || 1;
}

function pickGate(rng, authored) {
  if (rng() < 0.5) return authored;
  const index = Math.floor(rng() * SURVIVAL_GATE_GROUPS.length);
  return SURVIVAL_GATE_GROUPS[index] || authored;
}

function clonePackage(pkg, gateGroup) {
  const count = pkg.count;
  const batchSize = Number.isInteger(pkg.batchSize) ? pkg.batchSize : count;
  const batchGapTicks = Number.isInteger(pkg.batchGapTicks) ? pkg.batchGapTicks : 0;
  return {
    atTick: pkg.atTick,
    gateGroup,
    role: pkg.role,
    enemyId: pkg.enemyId,
    count,
    batchSize,
    batchGapTicks,
  };
}

function expandSchedule(packages) {
  const entries = [];
  for (let packageIndex = 0; packageIndex < packages.length; packageIndex++) {
    const pkg = packages[packageIndex];
    let remaining = pkg.count;
    let tick = pkg.atTick;
    const batchSize = pkg.batchSize;
    const gap = pkg.batchGapTicks;
    while (remaining > 0) {
      const n = Math.min(batchSize, remaining);
      const entry = {
        atTick: tick,
        gateGroup: pkg.gateGroup,
        role: pkg.role,
        enemyId: pkg.enemyId,
        count: n,
        packageIndex,
      };
      // Champion marker, carried only when a package sets it. Authored arc packages never do, so
      // an arc schedule is byte-identical to what it always was.
      if (pkg.champion === true) entry.champion = true;
      if (pkg.lesson === true) entry.lesson = true;
      if (pkg.debut === true) entry.debut = true;
      if (pkg.wall === true) entry.wall = true;
      if (Number.isFinite(pkg.distance)) entry.distance = pkg.distance;
      entries.push(entry);
      remaining -= n;
      if (remaining > 0) tick += gap;
    }
  }
  entries.sort((a, b) => {
    if (a.atTick !== b.atTick) return a.atTick - b.atTick;
    return a.packageIndex - b.packageIndex;
  });
  return entries;
}

function draftExpectationFor(wave) {
  const blockPos = templateWaveOf(wave);
  if (blockPos === SURVIVAL_TEMPLATE_BLOCK) return { kind: 'refit', choices: null };
  return { kind: 'draft', choices: 3 };
}

function uniqueRoles(packages) {
  const roles = [];
  const seen = new Set();
  for (const pkg of packages) {
    if (seen.has(pkg.role)) continue;
    seen.add(pkg.role);
    roles.push(pkg.role);
  }
  return roles;
}

function applyBuildPressure(packages, blockingRoles, buildSummary, blockPos) {
  if (blockPos !== 9 || !isPlainObject(buildSummary)) {
    return { packages, blockingRoles };
  }
  const dominant = buildSummary.dominant;
  if (typeof dominant !== 'string') return { packages, blockingRoles };
  const next = packages.map((pkg) => ({
    atTick: pkg.atTick,
    gateGroup: pkg.gateGroup,
    role: pkg.role,
    enemyId: pkg.enemyId,
    count: pkg.count,
    batchSize: pkg.batchSize,
    batchGapTicks: pkg.batchGapTicks,
  }));
  if (dominant === 'orbit') {
    for (const pkg of next) {
      if (pkg.role === 'reach') pkg.enemyId = 'quiet_ghost';
    }
  } else if (dominant === 'collision') {
    for (const pkg of next) {
      if (pkg.role === 'support') {
        pkg.role = 'anchor';
        pkg.enemyId = 'field_anchor_controller';
      }
    }
  } else if (dominant === 'chain') {
    for (const pkg of next) {
      if (pkg.role === 'reach') pkg.enemyId = 'pd_screen_escort';
    }
  }
  const spawned = new Set(next.map((pkg) => pkg.role));
  const roles = [];
  for (const role of blockingRoles) {
    if (spawned.has(role) && !roles.includes(role)) roles.push(role);
  }
  for (const role of spawned) {
    if (!roles.includes(role)) roles.push(role);
  }
  return { packages: next, blockingRoles: roles };
}

function applyDifficulty(packages, difficulty) {
  const steps = Number.isFinite(difficulty) ? Math.max(0, Math.floor(difficulty - 1)) : 0;
  if (steps === 0) return packages;
  return packages.map((pkg) => ({
    atTick: pkg.atTick,
    gateGroup: pkg.gateGroup,
    role: pkg.role,
    enemyId: pkg.enemyId,
    count: pkg.count,
    batchSize: pkg.batchSize,
    batchGapTicks: Math.max(0, pkg.batchGapTicks - steps * 15),
  }));
}

function applyMutators(arenaPhase, mutators) {
  if (!Array.isArray(mutators)) return arenaPhase;
  for (const mutator of mutators) {
    if (mutator === 'shutter_alternating') return 'shutter_alternating';
  }
  return arenaPhase;
}

function stableStringify(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (type === 'boolean' || type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ',';
      out += stableStringify(value[i]);
    }
    return `${out}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value).sort();
    let out = '{';
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) out += ',';
      const key = keys[i];
      out += JSON.stringify(key);
      out += ':';
      out += stableStringify(value[key]);
    }
    return `${out}}`;
  }
  return 'null';
}

export function hashSemanticWavePlan(plan) {
  const semantic = plan && plan.ok === false
    ? { error: plan.error, issues: plan.issues, ok: false }
    : {
        arenaPhase: plan && plan.arenaPhase,
        completionRules: plan && plan.completionRules,
        draftExpectation: plan && plan.draftExpectation,
        id: plan && plan.id,
        objective: plan && plan.objective,
        packages: plan && plan.packages,
        rewards: plan && plan.rewards,
        schedule: plan && plan.schedule,
        swarm: plan && plan.swarm,
      };
  const str = stableStringify(semantic);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function resolvePlanMode(input) {
  if (!isPlainObject(input)) return 'arc';
  const ruleset = typeof input.ruleset === 'string' ? input.ruleset : '';
  const mode = typeof input.mode === 'string' ? input.mode : '';
  if (mode === SWARM_RULESET || ruleset === SWARM_RULESET) return SWARM_RULESET;
  if (mode === 'endless' || ruleset === 'endless') return 'endless';
  if (mode === 'boss_circuit' || ruleset === 'boss_circuit') return 'boss_circuit';
  return 'arc';
}

/**
 * A swarm wave is GENERATED, not looked up: there is no authored recipe and no last wave.
 * It still returns the ordinary plan shape — `schedule`, `completionRules`, `arenaPhase`,
 * `rewards` — so every existing consumer (survivalWave, survivalArena, survivalAnnounce, the
 * results screen) keeps working without a swarm-shaped branch of its own. The one addition is
 * `plan.swarm`, the block that describes the reinforcement stream.
 *
 * Completion here is a FINITE COHORT — the wave owes `swarm.killTarget` bodies and closes when
 * every admitted body has resolved, so a fast clear earns the shop early instead of waiting out
 * a timer, and a living champion holds its round open rather than being abandoned by a clock.
 * `blockingRoles` stays empty on purpose: no single straggler class gates the wave, the cohort
 * itself does. `durationTicks` rides the plan only as the fallback envelope for legacy timed
 * saves replayed through old plans.
 *
 * SF-072 — the room reads the run's build and leans on the roles that TEST it, never the ones
 * that forbid it. A massline build meets more anchors (hulls too heavy to sling carelessly) and
 * line-cutters; a gunnery build meets reach and fast closers; a pack-killer build meets screens
 * and hulls that shrug a spread. The share moves by a bounded factor — every unlocked role keeps
 * its seat, so the wave's own roster is still the wave. The champion stays authored: boss
 * packages never reroll on the player's shopping list.
 */
const SWARM_PRESSURE_WEIGHT_SCALE = 1.5;
const SWARM_PRESSURE_ROLES = Object.freeze({
  collision: Object.freeze(['anchor', 'control']),
  orbit: Object.freeze(['reach', 'elite']),
  chain: Object.freeze(['support', 'anchor']),
});
const SWARM_PRESSURE_LINE = Object.freeze({
  collision: 'The pack brought anchors for the rope.',
  orbit: 'The pack brought reach for the orbit.',
  chain: 'The pack brought screens for the volley.',
});

function biasSwarmRosterForBuild(roster, dominant) {
  const testing = SWARM_PRESSURE_ROLES[dominant];
  if (!testing || !Array.isArray(roster)) return null;
  const focus = new Set(testing);
  let bent = false;
  const next = roster.map((entry) => {
    const weight = Number(entry && entry.weight) || 0;
    if (!entry || !focus.has(entry.role) || !(weight > 0)) return { ...entry };
    bent = true;
    return { ...entry, weight: weight * SWARM_PRESSURE_WEIGHT_SCALE };
  });
  return bent ? next : null;
}

function planSwarmWave({ seed, wave, rng, mutators, buildSummary, swarmStake }) {
  const w = swarmWaveOf(wave);
  const list = mutatorList(mutators);
  const stake = swarmStakeFor(swarmStake);
  const dominant = isPlainObject(buildSummary) && typeof buildSummary.dominant === 'string'
    ? buildSummary.dominant
    : null;
  const heaviesOnly = list.includes('heavies_only');
  const biasedRoster = dominant && !heaviesOnly
    ? biasSwarmRosterForBuild(swarmRosterFor(w), dominant)
    : null;
  // SF-062 — the mass-and-gap round. A light-pursuer opening is ammunition first; the wall and
  // its late heavies turn one side of the room into a corridor the player navigates or breaks.
  // The mutator owns the room outright, so heavies_only suppresses the shape entirely.
  const massGap = !heaviesOnly && isSwarmMassGapWave(w);
  // SF-068 — a boss round's reduced swarm is ammunition, not chores: the champion is the work,
  // so its opening chaff draws from the same light bodies the mass-gap wall feeds — the shapes
  // the room's berm, mines and pull can actually turn on the boss. heavies_only owns outright.
  const bossWave = !heaviesOnly && isSwarmBossWave(w);
  const fodderRoster = (massGap || bossWave) && swarmFodderRoster(w).length > 0
    ? swarmFodderRoster(w)
    : null;
  // SF-064 — a specialist's first wave stages one readable arrival: its tell lands alone on its
  // own bearing a beat after the opening burst, before the stream mixes it with other bodies.
  // The debut is a function of the wave number alone — no tutorial state, and later waves field
  // the same archetype through the ordinary roster like everything else.
  const newcomer = swarmNewcomerFor(w);
  const debuting = !!newcomer && w === newcomer.fromWave;
  const openingRoster = debuting
    ? (fodderRoster || biasedRoster || swarmRosterFor(w))
      .filter((entry) => entry.enemyId !== newcomer.enemyId)
    : (fodderRoster || biasedRoster || undefined);
  let packages = swarmOpeningPackages(w, rng, openingRoster);
  if (debuting) {
    // The debut is one of the wave's bodies, not an extra: hand its seat back from the largest
    // ordinary group so the opening budget stays exactly what the pressure math asked for.
    let donor = null;
    for (const pkg of packages) {
      if (pkg.champion || pkg.debut || pkg.wall || !(pkg.count > 1)) continue;
      if (!donor || pkg.count > donor.count) donor = pkg;
    }
    if (donor) {
      donor.count -= 1;
      donor.batchSize = Math.max(1, Math.min(donor.batchSize || donor.count, donor.count));
    }
    // Its own bearing, guaranteed: the first gate no package in this wave already uses.
    const debutGate = swarmFreeGateFor(w, packages.map((pkg) => pkg.gateGroup));
    packages.push({
      atTick: SWARM_DEBUT_TICKS,
      gateGroup: debutGate,
      role: newcomer.role,
      enemyId: newcomer.enemyId,
      count: 1,
      batchSize: 1,
      batchGapTicks: 0,
      debut: true,
      distance: SWARM_DEBUT_DISTANCE,
    });
  }
  let massGapBlock = null;
  if (massGap) {
    // The wall takes the first gate no arrival already uses, and its heavies pour through it
    // LATE — the corridor closes after the fodder is already on the board. `wall: true` owes
    // the batch like a champion: the lesson dies if concurrency quietly drops it.
    const wallGate = swarmFreeGateFor(w, packages.map((pkg) => pkg.gateGroup));
    // A debuting newcomer never doubles as wall muscle — its first sighting is the solo
    // arrival, not a 2-pack half a second later (debut waves 6/18 would otherwise collide).
    const wallPick = swarmWallPickFor(w, debuting ? newcomer.enemyId : null);
    if (wallPick) {
      packages.push({
        atTick: SWARM_MASS_GAP_CLOSE_TICKS,
        gateGroup: wallGate,
        role: wallPick.role,
        enemyId: wallPick.enemyId,
        count: 2,
        batchSize: 2,
        batchGapTicks: 0,
        wall: true,
        // Materialize beyond the chord — the muscle pours through the gaps it just installed,
        // on the far side of the wall line, never stacked on the player side of it.
        distance: SWARM_MASS_GAP_WALL_DISTANCE + 60,
      });
    }
    // Two navigable gaps, always — but never the same two slots twice in a row for a seed.
    massGapBlock = {
      gate: wallGate,
      distance: SWARM_MASS_GAP_WALL_DISTANCE,
      rocks: SWARM_MASS_GAP_WALL_ROCKS,
      gapSlots: [1 + Math.floor(rng() * 3), 5 + Math.floor(rng() * 3)],
      rockRadius: SWARM_MASS_GAP_ROCK_RADIUS,
      heavyEnemyId: wallPick ? wallPick.enemyId : null,
    };
  }
  // The mutator owns the whole room, debut included: the newcomer's staged arrival still lands
  // alone on its own bearing, but its body joins the heavies like every other package.
  if (heaviesOnly) packages = applyHeaviesOnly(packages);
  if (stake.pressure !== 1) {
    // Pressure scales the opening burst itself, not just the ceiling it fills under: champion
    // bodies are owed exactly as authored (a wing of one is never scaled to zero) and the
    // debut stays one readable arrival, while the chaff groups thin or thicken with the
    // contract. batchSize follows count — in an opening package one batch is one group.
    packages = packages.map((pkg) => (pkg && (pkg.champion === true || pkg.debut === true)
      ? pkg
      : { ...pkg, count: Math.max(1, Math.round(pkg.count * stake.pressure)), batchSize: Math.max(1, Math.round(pkg.count * stake.pressure)) }));
    // The spawn budget stays the hard authority: an over-asked burst trims its tail packages
    // rather than passing the overflow to dispatch, where a refused batch is dropped not owed.
    let burst = swarmOpeningCount(packages);
    for (let i = packages.length - 1; i >= 0 && burst > SPAWN_BUDGET_DEFAULT_MAX; i--) {
      const pkg = packages[i];
      if (!pkg || pkg.champion === true || pkg.debut === true) continue;
      const trim = Math.min(pkg.count - 1, burst - SPAWN_BUDGET_DEFAULT_MAX);
      if (trim > 0) { pkg.count -= trim; pkg.batchSize = pkg.count; burst -= trim; }
    }
  }
  const schedule = expandSchedule(packages);
  const opening = swarmOpeningCount(packages);
  const swarm = swarmPlanBlock(w);
  if (biasedRoster) {
    swarm.roster = biasedRoster.map((entry) => ({
      enemyId: entry.enemyId,
      role: entry.role,
      weight: entry.weight,
      fromWave: entry.fromWave,
    }));
    swarm.pressureLine = SWARM_PRESSURE_LINE[dominant] || null;
    swarm.buildPressure = dominant;
  }
  if (massGapBlock) {
    swarm.massGap = massGapBlock;
    swarm.wallLine = 'A wall is closing on the room — mind the gaps.';
  }
  // The ammunition bend is not only the wall's: a boss round's stream keeps feeding light
  // bodies too (SF-068), so the champion's room never reads as a heavy-escort checklist.
  // Build pressure still wins when it is live — the read on the run's build outranks either.
  if ((massGapBlock || bossWave) && !biasedRoster) {
    swarm.roster = swarmRosterFor(w).map((entry) => ({
      enemyId: entry.enemyId,
      role: entry.role,
      weight: SWARM_FODDER_ROLES.includes(entry.role)
        ? entry.weight * SWARM_MASS_GAP_FODDER_SCALE
        : entry.weight,
      fromWave: entry.fromWave,
    }));
  }
  if (heaviesOnly) {
    swarm.roster = HEAVIES_ONLY_ROSTER.map((entry) => ({
      enemyId: entry.enemyId,
      role: entry.role,
      weight: entry.weight,
      fromWave: entry.fromWave,
    }));
    delete swarm.pressureLine;
    delete swarm.buildPressure;
    // The mutator rewrote the debut's body with everything else — name the silhouette that
    // actually steps out, not the archetype that would have debuted on a plain wave.
    const debutPkg = packages.find((p) => p && p.debut === true);
    if (debutPkg && swarm.newcomer && debutPkg.enemyId !== swarm.newcomer.enemyId) {
      swarm.newcomer = {
        enemyId: debutPkg.enemyId,
        name: SWARM_NAME_BY_ID.get(debutPkg.enemyId) || swarm.newcomer.name,
      };
    }
  }
  // The stake is the swarm's difficulty contract: pressure moves concurrency and the round
  // quota (bodies, never stats), earn moves what a cleared round pays. Concurrency is still
  // clamped under the arena's own cap — a stake can never ask for a room the budget refuses.
  if (stake.pressure !== 1) {
    swarm.concurrent = Math.max(1, Math.min(SWARM_SPAWN_CAP, Math.round(swarm.concurrent * stake.pressure)));
    swarm.openingPressure = Math.max(1, Math.min(swarm.concurrent, swarmOpeningCount(packages)));
    swarm.killTarget = Math.max(1, Math.round(swarm.killTarget * stake.pressure));
    swarm.rewardReferenceKills = Math.max(1, Math.round(swarm.rewardReferenceKills * stake.pressure));
  }
  // The wave owner paces reinforcement arrivals off the same pressure the packages were
  // scaled by — stamped raw so the pressure curve the stream chases is the contracted one.
  swarm.pressureScale = stake.pressure;
  swarm.stake = stake.id;
  const rewards = swarmRewards(w);
  if (stake.earn !== 1) rewards.credits = Math.max(0, Math.round(rewards.credits * stake.earn));
  if (opening > SPAWN_BUDGET_DEFAULT_MAX) {
    return invalid([issue('packages', `swarm opening burst ${opening} exceeds 24`)]);
  }
  if (swarm.concurrent > SPAWN_BUDGET_HARD_MAX) {
    return invalid([issue('swarm.concurrent', `swarm concurrency ${swarm.concurrent} exceeds 40`)]);
  }
  const plan = {
    id: `swarm:w${w}:${seed.toString(16)}`,
    mode: SWARM_RULESET,
    objective: { kind: swarm.boss ? 'boss' : 'resolve_hostiles' },
    packages,
    schedule,
    arenaPhase: swarmArenaPhase(w),
    rewards,
    draftExpectation: isSwarmRefitWave(w)
      ? { kind: 'refit', choices: null }
      : (isSwarmDraftWave(w) ? { kind: 'draft', choices: 3 } : { kind: 'none', choices: null }),
    completionRules: {
      kind: 'cohort',
      requiredPackagesMaterialized: true,
      blockingRoles: [],
      cleanupTicks: SWARM_CLEANUP_TICKS,
    },
    swarm,
    level: swarmLevel(w),
  };
  return decorateWeeklyPlan(plan, list);
}

function lookupRecipe(arenaId, wave, mode) {
  if (mode === 'boss_circuit') {
    if (!Number.isInteger(wave) || wave < 1 || wave > SURVIVAL_BOSS_CIRCUIT.length) return null;
    const step = SURVIVAL_BOSS_CIRCUIT[wave - 1];
    if (!step) return null;
    return RECIPE_BY_ARENA_WAVE.get(`${step.arenaId}#${step.templateWave}`) || null;
  }
  if (mode === 'endless') {
    if (!Number.isInteger(wave) || wave < 1 || wave > WAVE_MAX) return null;
    return RECIPE_BY_ARENA_WAVE.get(`${arenaId}#${templateWaveOf(wave)}`) || null;
  }
  if (!Number.isInteger(wave) || wave < 1 || wave > SURVIVAL_ARC_LENGTH) return null;
  return RECIPE_BY_ARENA_WAVE.get(`${arenaId}#${templateWaveOf(wave)}`) || null;
}

function planFromRecipe({ recipe, seed, wave, act, difficulty, mutators, buildSummary, rng, mode }) {
  const blockPos = mode === 'boss_circuit' ? 10 : templateWaveOf(wave);
  const rawPackages = recipe.packages.map((pkg) => clonePackage(pkg, pickGate(rng, pkg.gateGroup)));
  const pressured = applyBuildPressure(
    rawPackages,
    recipe.completion.blockingRolesResolved.slice(),
    buildSummary,
    blockPos,
  );
  const composeFn = mode === 'endless' ? composeEndlessWave : composeArcWave;
  const composed = composeFn({
    packages: pressured.packages,
    blockingRoles: pressured.blockingRoles,
    arenaPhase: recipe.arenaPhase,
    objective: recipe.objective,
    wave: mode === 'boss_circuit' ? wave : wave,
  });
  let packages = applyDifficulty(composed.packages, difficulty);
  let heaviesOnly = false;
  if (mutatorList(mutators).includes('heavies_only')) {
    packages = applyHeaviesOnly(packages);
    heaviesOnly = true;
  }
  const schedule = expandSchedule(packages);
  const peak = peakConcurrentDemand(packages);
  if (peak > SPAWN_BUDGET_DEFAULT_MAX) {
    return invalid([issue('packages', `peak concurrent demand ${peak} exceeds 24`)]);
  }
  if (peak > SPAWN_BUDGET_HARD_MAX) {
    return invalid([issue('packages', `peak concurrent demand ${peak} exceeds 40`)]);
  }
  const spawnedRoles = new Set(packages.map((pkg) => pkg.role));
  // Plan field is `blockingRoles`. Recipe field is `blockingRolesResolved`
  // (Appendix A.2). See the comment in survivalWaves.js.
  const blockingRoles = composed.blockingRoles.filter((role) => spawnedRoles.has(role));
  const plan = {
    id: `${recipe.id}:w${wave}:a${act}:${seed.toString(16)}`,
    objective: { kind: composed.objective.kind },
    packages,
    schedule,
    arenaPhase: applyMutators(composed.arenaPhase, mutators),
    rewards: {
      xp: recipe.rewards.xp + act * 20 + (Number.isFinite(difficulty) ? Math.max(0, Math.floor(difficulty - 1)) * 10 : 0),
      credits: recipe.rewards.credits + act * 6,
    },
    draftExpectation: mode === 'boss_circuit' ? { kind: 'refit', choices: null } : draftExpectationFor(wave),
    completionRules: {
      requiredPackagesMaterialized: recipe.completion.requiredPackagesMaterialized === true,
      blockingRoles: blockingRoles.length > 0 ? blockingRoles : uniqueRoles(packages),
      cleanupTicks: Number.isInteger(recipe.completion.cleanupTicks) ? recipe.completion.cleanupTicks : 0,
    },
  };
  if (composed.systemEvent) plan.systemEvent = composed.systemEvent;
  // PQ-140 — the announcer reads the physical problem from the shipped bodies; a heavies-only
  // rewrite of the mass slots is exactly the swap it must know about. Additive, deterministic,
  // and present ONLY under the mutator so plan shape is unchanged for every ordinary wave.
  if (heaviesOnly) plan.heaviesOnly = true;
  if (mode === 'endless' && composed.endlessOverlay) {
    plan.endlessOverlay = composed.endlessOverlay;
    plan.endlessCycle = composed.endlessCycle;
    plan.mode = 'endless';
  }
  if (mode === 'boss_circuit') {
    plan.circuitStep = wave;
    plan.circuitArenaId = recipe.arenaId;
    plan.mode = 'boss_circuit';
  }
  return decorateWeeklyPlan(plan, mutators);
}

/** First swarm minute, before the pack. 45 seconds at the 60 Hz sim. */
export const OPENING_LESSON_HOLD_TICKS = 45 * 60;

/**
 * Wave 1 of a first swarm run. The same bodies still arrive — one light hull now, the rest
 * after the hold — so the budget does not grow. A rock and a well ride on the plan for the
 * arena to place. Callers that omit teachOpening never see this.
 */
export function applyOpeningLesson(plan) {
  if (!plan || !Array.isArray(plan.packages) || plan.packages.length === 0) return plan;
  const packages = plan.packages.map((pkg) => ({
    ...pkg,
    atTick: (Number.isInteger(pkg.atTick) ? pkg.atTick : 0) + OPENING_LESSON_HOLD_TICKS,
  }));
  const donorIndex = packages.findIndex((pkg) => pkg && pkg.enemyId === 'wasp_swarmer' && pkg.count > 0);
  const index = donorIndex >= 0 ? donorIndex : 0;
  const donor = packages[index];
  if (donor && donor.count > 1) {
    donor.count -= 1;
    donor.batchSize = Math.max(1, Math.min(donor.batchSize || donor.count, donor.count));
    packages.unshift({
      atTick: 0,
      gateGroup: donor.gateGroup,
      role: donor.role || 'mass',
      enemyId: 'wasp_swarmer',
      count: 1,
      batchSize: 1,
      batchGapTicks: 0,
      distance: 90,
      lesson: true,
    });
  } else if (donor) {
    donor.atTick = 0;
    donor.distance = 90;
    donor.lesson = true;
  }
  plan.packages = packages;
  plan.schedule = expandSchedule(packages);
  if (plan.swarm && typeof plan.swarm === 'object') {
    const base = Number.isInteger(plan.swarm.durationTicks) && plan.swarm.durationTicks > 0
      ? plan.swarm.durationTicks
      : 0;
    plan.swarm = { ...plan.swarm, durationTicks: base + OPENING_LESSON_HOLD_TICKS };
  }
  plan.openingLesson = {
    holdTicks: OPENING_LESSON_HOLD_TICKS,
    rock: { x: 78, z: 16, radius: 6 },
    well: { x: -24, z: 108, radius: 96, strength: 90, falloff: 1.35 },
  };
  return plan;
}

/**
 * A swarm wave has no authored recipe, so the `validateWaveRecipe(recipe)` gate below used to be
 * skipped for it entirely — the branch returned early with nothing checking the generated
 * `packages`. Those packages ARE recipe-schema content: run the same validator over a
 * recipe-shaped view so a generated batch cannot field a bad enemyId / gateGroup / count that an
 * authored recipe is barred from. Fails closed (an invalid plan), exactly like the recipe path;
 * an already-invalid plan passes through untouched.
 */
function validateSwarmPlanPackages(plan, arenaId) {
  if (!plan || plan.ok === false || plan.error) return plan;
  const checked = validateWaveRecipe({
    id: plan.id,
    schemaVersion: SURVIVAL_WAVE_SCHEMA_VERSION,
    arenaId,
    wave: plan.swarm && Number.isInteger(plan.swarm.wave) ? plan.swarm.wave : 1,
    objective: plan.objective,
    threatBudget: 0,
    arenaPhase: plan.arenaPhase,
    packages: plan.packages,
    completion: {
      requiredPackagesMaterialized: true,
      blockingRolesResolved: uniqueRoles(plan.packages),
      cleanupTicks: SWARM_CLEANUP_TICKS,
    },
    rewards: plan.rewards,
  });
  return checked.ok ? plan : invalid(checked.issues);
}

export function planWave(input) {
  try {
    return planWaveInner(input);
  } catch {
    return invalid([issue('', 'invalid planWave input')]);
  }
}

function planWaveInner(input) {
  if (!isPlainObject(input)) {
    return invalid([issue('', 'planWave input must be an object')]);
  }

  const issues = [];
  let seed = input.seed;
  if (typeof seed === 'string' && /^-?\d+$/.test(seed.trim())) {
    seed = Number(seed.trim());
  }
  const arenaId = input.arenaId;
  const wave = input.wave;

  if (!isCombatLabSeed(seed)) {
    issues.push(issue('seed', 'seed must be an integer in 1..0xffffffff'));
  }
  if (typeof arenaId !== 'string' || !ARENA_IDS.has(arenaId)) {
    issues.push(issue('arenaId', 'unknown arenaId'));
  }
  if (!isCombatLabWave(wave)) {
    issues.push(issue('wave', 'wave must be an integer in 1..999'));
  }
  if (issues.length > 0) return invalid(issues);

  const mode = resolvePlanMode(input);
  const mutators = Array.isArray(input.mutators) ? input.mutators : [];
  const buildSummary = input.buildSummary == null ? null : input.buildSummary;

  // Swarm waves are generated from the wave number alone, so they short-circuit the recipe
  // lookup entirely — there is no authored ceiling to fall off at wave 31.
  if (mode === SWARM_RULESET) {
    const planned = planSwarmWave({
      seed,
      wave,
      mutators,
      buildSummary,
      swarmStake: typeof input.swarmStake === 'string' ? input.swarmStake : null,
      rng: mulberry32(wavePlanStreamSeed(seed, arenaId, wave, 0)),
    });
    const finished = input.teachOpening === true && wave === 1 && planned && planned.ok !== false && !planned.error
      ? applyOpeningLesson(planned)
      : planned;
    return validateSwarmPlanPackages(finished, arenaId);
  }

  const act = Number.isInteger(input.act)
    ? input.act
    : (mode === 'boss_circuit' ? 0 : actIndexForWave(wave));
  const difficulty = Number.isFinite(input.difficulty)
    ? input.difficulty
    : (mode === 'endless' ? 3 : difficultyForWave(wave));

  const authored = isPlainObject(input.recipe) ? input.recipe : null;
  if (authored && authored.arenaId !== arenaId) {
    return invalid([issue('recipe.arenaId', 'recipe.arenaId must match input.arenaId')]);
  }
  const recipe = authored || lookupRecipe(arenaId, wave, mode);
  if (!recipe) {
    return invalid([issue('wave', 'no authored recipe for this arena and wave')]);
  }
  const checked = validateWaveRecipe(recipe);
  if (!checked.ok) return invalid(checked.issues);

  const rng = mulberry32(wavePlanStreamSeed(seed, arenaId, wave, act));
  return planFromRecipe({
    recipe,
    seed,
    wave,
    act,
    difficulty,
    mutators,
    buildSummary,
    rng,
    mode,
  });
}
