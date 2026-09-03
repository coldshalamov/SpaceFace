// Swarm mode — the Crucible's own game (PQ-135).
//
// WHY THIS EXISTS
// ---------------
// The authored thirty-wave arc asks a QUESTION per wave: six identical things, then a split
// arrival, then a tether specialist. Every wave ends with an empty room and a menu. That is a
// good ruleset and it is not a swarm game. A swarm game has one question — "can you keep up?" —
// and it never stops asking it.
//
// So this file is a second ruleset, not an edit to the first. It generates every wave
// procedurally from the wave number, so there is no last wave and no authored ceiling. Waves 1,
// 5 and 10 of the arc stay byte-identical; nothing here touches them.
//
// THE FIVE RULES OF THE SWARM CURVE
// ---------------------------------
//   1. PRESSURE IS CONCURRENCY, NOT HP. The lever is how many hulls are on you at once and how
//      fast a dead one is replaced. Nothing here inflates health (§33 fails a leaf on sight for
//      that) — `levelForWave` in waveMaterialization.js is the only stat scaler and it is shared
//      with the arc.
//   2. A WAVE ENDS ON KILLS, NOT ON AN EMPTY ROOM. `quota` is the number of bodies you have to
//      put down. Survivors are NOT chased down — they roll into the next wave. That single rule
//      is what removes the dead air the arc has at the end of every wave, where the fight is over
//      but one straggler is still flying home.
//   3. THE ROOM IS NEVER IDLE. Every swarm wave names a live `arenaPhase`, so survivalArena.js
//      always has a room to install. Wave 1 of the arc is `idle`; wave 1 here is not.
//   4. COVER IS THE POINT, NOT A GARNISH. The draft's verbs are Throw / Tag / Bind — physical
//      verbs that need something to throw a hull INTO. Every wave from 2 on requests cover rocks.
//   5. VARIETY COMES FROM THE ROSTER, ON A CLOCK YOU CAN FEEL. A new archetype unlocks on a fixed
//      wave, so a player learns one new silhouette at a time instead of meeting fifteen at once.
//
// Pure data + pure functions. No bus, no state, no registry, no DOM, no RNG source but the seed
// it is handed. Same (seed, wave) always yields the same wave.

import { SPAWN_BUDGET_DEFAULT_MAX, SPAWN_BUDGET_HARD_MAX } from './survivalActs.js';

export const SWARM_RULESET = 'swarm';
export const SWARM_SCHEMA_VERSION = 1;

/** No authored ceiling. Matches SURVIVAL_ENDLESS_WAVE_MAX so the phase machine has one cap idiom. */
export const SWARM_WAVE_MAX = 999;

/** Every fifth wave opens the upgrade draft. Every twentieth also opens the full refit bench. */
export const SWARM_DRAFT_EVERY = 5;
export const SWARM_REFIT_EVERY = 20;

/** Every tenth wave is a boss wave: a Dreadnought on top of a (reduced) swarm. */
export const SWARM_BOSS_EVERY = 10;

/**
 * Concurrency ceiling. The shared cap is 24 (spawnBudget DEFAULT_MAX) and ambient traffic holds a
 * few slots, so the swarm asks for at most 20 and never calls setMax. Fill the cap before raising
 * it: 20 concurrent is already 3.3x the arc's wave-1 density.
 */
export const SWARM_CONCURRENT_MIN = 8;
export const SWARM_CONCURRENT_MAX = 20;

/**
 * Ticks between reinforcement top-ups while the room is under strength (60 ticks = 1 second), and
 * how many bodies each top-up brings.
 *
 * Together these set the CEILING on how fast the room can refill: 4 bodies every 20 ticks is 12 a
 * second, comfortably faster than any real clear rate, so a strong player thins the room by being
 * fast rather than by outrunning a slow spawner. Four at a time also reads as a group arriving on
 * a bearing rather than as hulls popping into existence one by one.
 */
export const SWARM_REINFORCE_GAP_TICKS = 12;
export const SWARM_REINFORCE_BATCH = 3;
/**
 * The stream is ADAPTIVE. A small hole is patched with `SWARM_REINFORCE_BATCH`; a big one is
 * patched with half of itself, up to this ceiling. That asymmetry is the whole point: a player who
 * clears fast should feel the room close back in, not out-run the spawner and end the wave alone
 * in an empty arena. A fixed batch could always be beaten by a fast enough clear, and being beaten
 * looks exactly like the dead air this ruleset exists to delete.
 */
export const SWARM_REINFORCE_SURGE_MAX = 7;

/** How many bodies one top-up brings, given how far under strength the room is. */
export function swarmReinforceCount(deficit) {
  const d = Math.max(0, Math.trunc(Number(deficit) || 0));
  if (d <= 0) return 0;
  const surge = Math.min(SWARM_REINFORCE_SURGE_MAX, Math.ceil(d / 2));
  return Math.min(d, Math.max(SWARM_REINFORCE_BATCH, surge));
}

/** Hostiles arrive closer than the arc's 220 so contact is immediate, not a commute. */
export const SWARM_SPAWN_DISTANCE = 200;

/** Ticks of breathing room after a wave's quota is met. Under a second: long enough to read, short enough to hurt. */
export const SWARM_CLEANUP_TICKS = 45;

const GATES = Object.freeze(['nw', 'ne', 'se', 'sw', 'front', 'rear', 'diagonal_a', 'diagonal_b']);

/**
 * The roster clock. One new silhouette at a time, on a wave you can predict.
 *
 * `weight` is a spawn share once unlocked. `role` is the plan role the body carries, which is what
 * the results screen and the arena's dominant-gate read use.
 *
 * patrol_lawman, customs_cutter and mule_trader are deliberately absent for the same reason the arc
 * omits them: the first two spawn INERT without a wanted level, and the third is illegal to kill.
 */
export const SWARM_ROSTER = Object.freeze([
  { enemyId: 'wasp_swarmer', role: 'mass', fromWave: 1, weight: 10, name: 'Wasp Swarmer' },
  { enemyId: 'reaver_pirate', role: 'pressure', fromWave: 2, weight: 6, name: 'Reaver Pirate' },
  { enemyId: 'choir_zealot', role: 'mass', fromWave: 4, weight: 7, name: 'Choir Zealot' },
  { enemyId: 'mine_layer_jackal', role: 'disruptor', fromWave: 6, weight: 2, name: 'Mine-Layer Jackal' },
  { enemyId: 'lancer_sniper', role: 'reach', fromWave: 8, weight: 3, name: 'Lancer Sniper' },
  { enemyId: 'corsair_raider', role: 'elite', fromWave: 10, weight: 3, name: 'Corsair Raider' },
  { enemyId: 'quiet_ghost', role: 'reach', fromWave: 12, weight: 2, name: 'Quiet Ghost' },
  { enemyId: 'pd_screen_escort', role: 'support', fromWave: 14, weight: 2, name: 'Point-Defense Screen' },
  { enemyId: 'tether_control_raider', role: 'control', fromWave: 16, weight: 2, name: 'Tether-Control Raider' },
  { enemyId: 'bruiser_brawler', role: 'anchor', fromWave: 18, weight: 2, name: 'Bruiser Brawler' },
  { enemyId: 'field_anchor_controller', role: 'anchor', fromWave: 22, weight: 2, name: 'Anchor Controller' },
]);

export const SWARM_BOSS_ENEMY_ID = 'dreadnought_boss';

/**
 * The room rotation. Never `idle` — see rule 3. Ordered so the first four waves teach the four
 * things a room can do (drag you, shove you, give you geometry, rake you) before repeating.
 * Boss waves override this with the arc's own `boss` room.
 */
export const SWARM_ARENA_PHASE_CYCLE = Object.freeze([
  'loose_plate',          // geometry first: cover to throw things into, plus a soft sag
  'furnace_active',       // the centre shoves — nobody camps the middle
  'shutter_slow',         // the whole room leans one way
  'shutter_lane_close',   // a cross-current across the arrival lane, and mines at its mouth
  'shutter_alternating',  // pull one flank, shove the other
  'absorbent_screen',     // the room drinks momentum
]);

function clampInt(value, lo, hi) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Normalize any input to a legal swarm wave index. */
export function swarmWaveOf(wave) {
  return clampInt(wave, 1, SWARM_WAVE_MAX);
}

export function isSwarmBossWave(wave) {
  const w = swarmWaveOf(wave);
  return w % SWARM_BOSS_EVERY === 0;
}

export function isSwarmDraftWave(wave) {
  const w = swarmWaveOf(wave);
  return w % SWARM_DRAFT_EVERY === 0;
}

export function isSwarmRefitWave(wave) {
  const w = swarmWaveOf(wave);
  return w % SWARM_REFIT_EVERY === 0;
}

/**
 * How many hostiles the room holds at once.
 *
 * Rises fast early (the first five waves are where a player decides whether this is a swarm game
 * or not), then flattens into the ceiling. Boss waves hold fewer bodies so the Dreadnought is
 * legible instead of buried.
 */
export function swarmConcurrent(wave) {
  const w = swarmWaveOf(wave);
  const ramped = SWARM_CONCURRENT_MIN + Math.floor((w - 1) * 1.1);
  const target = Math.min(SWARM_CONCURRENT_MAX, ramped);
  if (isSwarmBossWave(w)) return Math.max(SWARM_CONCURRENT_MIN, Math.min(target, 12));
  return target;
}

/**
 * WAVE LENGTH IS A CONSTANT, NOT A CURVE.
 *
 * The quota climbs early and then FLATTENS at SWARM_QUOTA_CAP. That is deliberate: if the kill
 * count kept rising with the wave number, wave 40 would take ten minutes and the run would die of
 * tedium long before the player did. Difficulty past the cap arrives the way the rest of this
 * repo does it — composition and concurrency — while a wave keeps taking about a minute.
 *
 * The quota must also stay comfortably ABOVE the concurrency target. A quota near `concurrent`
 * makes the wave nothing but its opening burst: the stream's self-taper engages immediately and
 * the room drains instead of holding. Two-to-one is the floor, and `swarmCurveIsSane` asserts it.
 */
export const SWARM_QUOTA_CAP = 40;

export function swarmQuota(wave) {
  const w = swarmWaveOf(wave);
  // A boss wave is shorter on chaff, because the boss is the work — but never so short that it
  // falls under the two-to-one floor and turns into "kill the opening burst".
  if (isSwarmBossWave(w)) {
    return Math.min(SWARM_QUOTA_CAP, Math.max(swarmConcurrent(w) * 2, 14 + Math.floor(w / 2)));
  }
  return Math.min(SWARM_QUOTA_CAP, 16 + w * 2);
}

/** Enemy level. Same curve the arc uses, so a swarm hostile is never a different animal. */
export function swarmLevel(wave) {
  const w = swarmWaveOf(wave);
  return 1 + Math.floor((w - 1) / 3);
}

/** The archetypes legal at this wave, in roster order. */
export function swarmRosterFor(wave) {
  const w = swarmWaveOf(wave);
  return SWARM_ROSTER.filter((entry) => w >= entry.fromWave);
}

/** The archetype that first becomes legal on exactly this wave, or null. Used for the wave banner. */
export function swarmNewcomerFor(wave) {
  const w = swarmWaveOf(wave);
  return SWARM_ROSTER.find((entry) => entry.fromWave === w) || null;
}

/**
 * The room for this wave. Boss waves get the arc's loudest room; everything else walks the cycle.
 */
export function swarmArenaPhase(wave) {
  const w = swarmWaveOf(wave);
  if (isSwarmBossWave(w)) return 'boss';
  // -1 so wave 1 lands on `loose_plate`: cover exists from the very first fight.
  return SWARM_ARENA_PHASE_CYCLE[(w - 1) % SWARM_ARENA_PHASE_CYCLE.length];
}

/**
 * Weighted archetype pick from a [0,1) roll. Pure: the caller owns the RNG stream.
 * Weights are biased toward the newest unlock for its first two waves, so a fresh silhouette
 * actually shows up in the wave that introduced it rather than losing a dice roll to chaff.
 */
export function pickSwarmArchetype(wave, roll) {
  const roster = swarmRosterFor(wave);
  if (roster.length === 0) return SWARM_ROSTER[0];
  const w = swarmWaveOf(wave);
  let total = 0;
  const weights = roster.map((entry) => {
    const fresh = w - entry.fromWave;
    const boost = fresh >= 0 && fresh < 2 ? 2.5 : 1;
    const weight = Math.max(0.001, entry.weight * boost);
    total += weight;
    return weight;
  });
  const r = (Number.isFinite(roll) ? Math.abs(roll) % 1 : 0) * total;
  let acc = 0;
  for (let i = 0; i < roster.length; i++) {
    acc += weights[i];
    if (r < acc) return roster[i];
  }
  return roster[roster.length - 1];
}

/** Gate for the nth arrival of a wave. Walks the ring so pressure never settles on one bearing. */
export function swarmGateFor(wave, index) {
  const w = swarmWaveOf(wave);
  const i = Number.isInteger(index) && index >= 0 ? index : 0;
  // A wave-dependent stride keeps consecutive waves from reusing the same bearing order.
  const stride = 1 + (w % (GATES.length - 1));
  return GATES[(w + i * stride) % GATES.length];
}

/**
 * XP and credits for clearing a swarm wave. Scales with the quota so a longer wave pays more,
 * and stays close to the arc's purse so the draft re-roll price (6 + 3*wave) means the same thing
 * in both rulesets.
 */
export function swarmRewards(wave) {
  const w = swarmWaveOf(wave);
  return {
    xp: 40 + w * 14,
    credits: 8 + w * 4 + (isSwarmBossWave(w) ? 40 : 0),
  };
}

/**
 * The opening burst — the bodies already inbound when the wave goes active. Deliberately most of
 * the concurrency target, so a wave STARTS at pressure instead of ramping into it. The remainder
 * arrives through the reinforcement stream in survivalWave.js.
 *
 * Returns plan `packages` (the schema survivalWaves.js validates) so nothing downstream needs a
 * second shape.
 */
export function swarmOpeningPackages(wave, rng) {
  const w = swarmWaveOf(wave);
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  const concurrent = swarmConcurrent(w);
  // A swarm wave OPENS at full strength. Ramping into pressure is what makes a wave read as a
  // scheduled encounter; arriving at it is what makes it read as a swarm.
  const opening = concurrent;
  const packages = [];

  if (isSwarmBossWave(w)) {
    packages.push({
      atTick: 0,
      gateGroup: swarmGateFor(w, 0),
      role: 'elite',
      enemyId: SWARM_BOSS_ENEMY_ID,
      count: 1,
      batchSize: 1,
      batchGapTicks: 0,
    });
  }

  // Two or three arrival groups from different bearings: a swarm wave is surrounded from tick 0.
  const groups = w <= 2 ? 2 : 3;
  const bossBodies = isSwarmBossWave(w) ? 1 : 0;
  let left = Math.max(2, opening - bossBodies);
  for (let g = 0; g < groups && left > 0; g++) {
    const share = g === groups - 1 ? left : Math.max(1, Math.round(left / (groups - g)));
    const count = Math.min(left, share);
    left -= count;
    const archetype = pickSwarmArchetype(w, roll());
    packages.push({
      // Tight: every opening group is on the board inside 24 ticks (0.4s), so "surrounded" is the
      // first thing the wave says rather than something it works up to.
      atTick: g === 0 ? 0 : 12 * g,
      gateGroup: swarmGateFor(w, g + 1),
      role: archetype.role,
      enemyId: archetype.enemyId,
      count,
      batchSize: count,
      batchGapTicks: 0,
    });
  }
  return packages;
}

/** Total bodies in the opening burst. */
export function swarmOpeningCount(packages) {
  if (!Array.isArray(packages)) return 0;
  let total = 0;
  for (const pkg of packages) {
    if (pkg && Number.isInteger(pkg.count) && pkg.count > 0) total += pkg.count;
  }
  return total;
}

/**
 * The swarm block carried on the plan. survivalWave.js reads this and nothing else to run the
 * reinforcement stream, so the whole streaming ruleset is described by one serializable object.
 */
export function swarmPlanBlock(wave) {
  const w = swarmWaveOf(wave);
  const roster = swarmRosterFor(w);
  const newcomer = swarmNewcomerFor(w);
  return {
    schemaVersion: SWARM_SCHEMA_VERSION,
    wave: w,
    quota: swarmQuota(w),
    concurrent: swarmConcurrent(w),
    level: swarmLevel(w),
    boss: isSwarmBossWave(w),
    // A boss wave is not clearable by killing chaff around a live Dreadnought. The quota AND the
    // boss are both owed.
    requireBoss: isSwarmBossWave(w),
    draftAfter: isSwarmDraftWave(w),
    refitAfter: isSwarmRefitWave(w),
    reinforceGapTicks: SWARM_REINFORCE_GAP_TICKS,
    reinforceBatch: SWARM_REINFORCE_BATCH,
    reinforceSurgeMax: SWARM_REINFORCE_SURGE_MAX,
    spawnDistance: SWARM_SPAWN_DISTANCE,
    roster: roster.map((entry) => ({ enemyId: entry.enemyId, role: entry.role, weight: entry.weight })),
    newcomer: newcomer ? { enemyId: newcomer.enemyId, name: newcomer.name } : null,
  };
}

/** Guard so nothing can quietly ask for more bodies than the shared cap allows. */
export function swarmConcurrencyIsLegal(concurrent) {
  const n = Number(concurrent);
  return Number.isInteger(n) && n > 0
    && n <= SPAWN_BUDGET_DEFAULT_MAX
    && n <= SPAWN_BUDGET_HARD_MAX;
}

/**
 * The two invariants the curve must never break, checkable for any wave. Kept here beside the
 * numbers rather than only in a test, so a future edit to the curve has to walk past it.
 */
export function swarmCurveIsSane(wave) {
  const w = swarmWaveOf(wave);
  const concurrent = swarmConcurrent(w);
  const quota = swarmQuota(w);
  return swarmConcurrencyIsLegal(concurrent)
    && quota >= concurrent * 2;
}
