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

/**
 * Every fifth wave opens the upgrade draft. Every tenth ALSO opens the refit bench after it —
 * both, not one instead of the other, because a swarm run that skipped its wave-10 card to get a
 * bench would be paying for the bench with the upgrade it came for. The bench is also the only
 * surface a ten-wave extraction window is ever open on.
 */
export const SWARM_DRAFT_EVERY = 5;
export const SWARM_REFIT_EVERY = 10;

/** Every tenth wave is a boss wave: a Dreadnought on top of a (reduced) swarm. */
export const SWARM_BOSS_EVERY = 10;

/**
 * HOW MANY HULLS ARE ON YOU.
 *
 * The first pass filled the shared cap without raising it — 8 rising to 20, against
 * spawnBudget's DEFAULT_MAX of 24 with ambient freight holding three or four of those slots. That
 * was the right order to do it in (fill the cap before raising it), and 20 was already three times
 * the authored arc's wave one. It still is not a SWARM.
 *
 * Two things changed to make room. Ambient freight no longer spawns inside a run at all, and the
 * arena declares its own capacity through the shipped `setMax` seam — which exists for exactly this
 * and is bounded by spawnBudget's own HARD_MAX of 40, a ceiling this never asks to move.
 *
 * So: ten on you at wave one, thirty deep in. The ceiling stays under the hard cap on purpose, so
 * a stray mission spawn or a wreck can never be squeezed out by the wave.
 */
export const SWARM_CONCURRENT_MIN = 10;
export const SWARM_CONCURRENT_MAX = 30;

/** What the arena raises the shared live-ship cap to for the length of a run. HARD_MAX is 40. */
export const SWARM_SPAWN_CAP = 38;

/**
 * A WAVE BUILDS.
 *
 * Holding a flat count for a whole wave makes every wave feel the same from its first second to
 * its last. A wave now OPENS at this fraction of its ceiling and reaches full strength by the time
 * the quota is about two thirds spent, so each one has a shape: room to breathe, then closing in.
 */
export const SWARM_OPENING_PRESSURE = 0.62;
export const SWARM_FULL_PRESSURE_AT = 0.66;

/**
 * The live concurrency target partway through a wave. Pure, so the crescendo is one readable line
 * rather than something hidden in the spawner.
 *
 * `progress` is killed/quota, 0..1.
 */
export function swarmPressureAt(wave, progress) {
  const ceiling = swarmConcurrent(wave);
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const ramp = SWARM_FULL_PRESSURE_AT > 0 ? Math.min(1, t / SWARM_FULL_PRESSURE_AT) : 1;
  const floor = Math.max(SWARM_CONCURRENT_MIN, Math.round(ceiling * SWARM_OPENING_PRESSURE));
  return Math.max(floor, Math.round(floor + (ceiling - floor) * ramp));
}

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

/**
 * How far out hostiles arrive.
 *
 * The arc uses 220 and calls it "just off the chase-camera bubble". That is fine for six bodies you
 * turn to face. It is wrong for a surround: a live projection of every hostile through the real
 * camera found the median one sitting at 200 units and only a fifth of them inside the frame.
 * Pulling arrivals in to 165 — together with the wider swarm camera in ui/crucibleFocus.js — puts
 * the fight where the player can see it, without spawning anything on top of them.
 */
export const SWARM_SPAWN_DISTANCE = 165;

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
 * WHAT SHOWS UP ON A TENTH WAVE.
 *
 * It was the same Dreadnought, forever. Wave 10 and wave 90 were the same fight with bigger
 * numbers, which is the exact failure the authored arc was careful to avoid inside its own ten.
 *
 * There is only one hull in the game built as a boss, so the other three entries are not weaker
 * bosses — they are a different SHAPE of problem made from archetypes the roster already has. A
 * wing of three raiders is a target-priority fight. The Anvil is two brawlers you cannot shake
 * behind a screen that eats your missiles. The Choir is three snipers you have to close on while
 * something holds you in place. Each one is beaten by a different half of your build.
 *
 * ORDER MATTERS: the rotation is walked in step with the roster clock, so every archetype a boss
 * wave fields is one the player has already met as ordinary chaff. Nothing here introduces a
 * silhouette for the first time as a champion.
 */
export const SWARM_BOSS_ROTATION = Object.freeze([
  {
    id: 'iron_maw',
    label: "Dreadnought 'Iron Maw'",
    line: 'A capital hull is on the field.',
    packages: [{ enemyId: 'dreadnought_boss', count: 1, role: 'elite' }],
  },
  {
    id: 'corsair_wing',
    label: 'Corsair Wing',
    line: 'Three raider aces, flying as one.',
    packages: [{ enemyId: 'corsair_raider', count: 3, role: 'elite' }],
  },
  {
    id: 'the_anvil',
    label: 'The Anvil',
    line: 'Two brawlers behind a screen that eats ordnance.',
    packages: [
      { enemyId: 'bruiser_brawler', count: 2, role: 'anchor' },
      { enemyId: 'pd_screen_escort', count: 2, role: 'support' },
    ],
  },
  {
    id: 'quiet_choir',
    label: 'The Quiet Choir',
    line: 'Three ghosts at range, and something holding you still.',
    packages: [
      { enemyId: 'quiet_ghost', count: 3, role: 'reach' },
      { enemyId: 'field_anchor_controller', count: 1, role: 'anchor' },
    ],
  },
]);

/** Which champion a boss wave fields. Non-boss waves have none. */
export function swarmBossFor(wave) {
  const w = swarmWaveOf(wave);
  if (!isSwarmBossWave(w)) return null;
  const step = Math.max(0, Math.floor(w / SWARM_BOSS_EVERY) - 1);
  return SWARM_BOSS_ROTATION[step % SWARM_BOSS_ROTATION.length];
}

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
  const ramped = SWARM_CONCURRENT_MIN + Math.floor((w - 1) * 1.35);
  const target = Math.min(SWARM_CONCURRENT_MAX, ramped);
  // A boss wave holds fewer bodies so the capital hull is legible instead of buried — but not so
  // few that the escort stops mattering.
  if (isSwarmBossWave(w)) return Math.max(SWARM_CONCURRENT_MIN, Math.min(target, 18));
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
export const SWARM_QUOTA_CAP = 48;

/**
 * How far the quota must clear a full room. The old rule was "quota >= 2x concurrent", which was
 * the right IDEA — a wave must be more than its opening burst — expressed as a ratio that could
 * not survive the room getting bigger. At thirty concurrent a two-to-one quota would be sixty
 * kills and a three-minute wave.
 *
 * The thing that actually matters is an ABSOLUTE margin: you must put down a full room's worth
 * and then some, so the stream always gets to do its work and the wave always has a middle.
 */
export const SWARM_QUOTA_MARGIN = 8;

export function swarmQuota(wave) {
  const w = swarmWaveOf(wave);
  const floor = swarmConcurrent(w) + SWARM_QUOTA_MARGIN;
  // A boss wave is shorter on chaff, because the boss is the work.
  if (isSwarmBossWave(w)) {
    return Math.min(SWARM_QUOTA_CAP, Math.max(floor, 20 + Math.floor(w / 2)));
  }
  return Math.min(SWARM_QUOTA_CAP, Math.max(floor, 20 + w * 2));
}

/**
 * WHERE THE STAT CURVE STOPS.
 *
 * This module's first rule is "pressure is concurrency, not HP" — and then it used the arc's level
 * curve, which raises both damage and health by 12% a level forever. Charted against the roster,
 * incoming pressure reached 5.9x wave one by wave 25 and kept climbing on level alone, while the
 * player's build finishes at seven fitted slots around the same point. Past there the run does not
 * end because the player made mistakes; it ends because the numbers walked away from them.
 *
 * So the level curve stops at SWARM_LEVEL_CAP, which lands on wave 22 — the same wave the roster
 * completes, with concurrency already at its ceiling since wave 16 and the kill quota capped since
 * wave 14. Everything the mode has arrives by wave 22, and from then on it is asking one question:
 * can you keep doing this? That is a skill wall rather than an arithmetic one, and it is the wall
 * an endless mode is supposed to have.
 */
export const SWARM_LEVEL_CAP = 8;

export function swarmLevel(wave) {
  const w = swarmWaveOf(wave);
  return Math.min(SWARM_LEVEL_CAP, 1 + Math.floor((w - 1) / 3));
}

/** The wave at which every dial this mode has is at its maximum. */
export function swarmFullIntensityWave() {
  return 1 + (SWARM_LEVEL_CAP - 1) * 3;
}

/** The archetypes legal at this wave, in roster order. */
export function swarmRosterFor(wave) {
  const w = swarmWaveOf(wave);
  return SWARM_ROSTER.filter((entry) => w >= entry.fromWave);
}

/**
 * The archetype that first becomes legal on exactly this wave, or null. Used for the wave banner.
 * Wave 1 has no newcomer by definition — on the first wave everything is new, so calling the wasp
 * out would be noise rather than a warning.
 */
export function swarmNewcomerFor(wave) {
  const w = swarmWaveOf(wave);
  if (w <= 1) return null;
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
    // Priced off the QUOTA, not the wave number, so one body is worth a whole, legible 2 credits
    // exactly as it is on the arc — the purse follows how much work the wave actually asks for.
    credits: swarmQuota(w) * 2 + (isSwarmBossWave(w) ? 40 : 0),
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
  // The wave opens at its OPENING pressure, not its ceiling — see swarmPressureAt. Arriving at
  // pressure is what makes a wave read as a swarm rather than a scheduled encounter; arriving at
  // the ceiling leaves the wave nowhere to build to.
  const opening = swarmPressureAt(w, 0);
  const packages = [];

  const boss = swarmBossFor(w);
  if (boss) {
    // Every champion body carries `champion: true` all the way into the schedule, so the wave owner
    // can owe a WING as easily as it owes one Dreadnought without knowing any enemy ids.
    boss.packages.forEach((pkg, index) => {
      packages.push({
        atTick: 0,
        gateGroup: swarmGateFor(w, index),
        role: pkg.role,
        enemyId: pkg.enemyId,
        count: pkg.count,
        batchSize: pkg.count,
        batchGapTicks: 0,
        champion: true,
      });
    });
  }

  // Two or three arrival groups from different bearings: a swarm wave is surrounded from tick 0.
  // More bearings as the wave count climbs: at ten on you it is two doors, at thirty it is four.
  const groups = w <= 2 ? 2 : (w < 8 ? 3 : 4);
  const bossBodies = boss
    ? boss.packages.reduce((sum, pkg) => sum + pkg.count, 0)
    : 0;
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
  const boss = swarmBossFor(w);
  return {
    schemaVersion: SWARM_SCHEMA_VERSION,
    wave: w,
    quota: swarmQuota(w),
    concurrent: swarmConcurrent(w),
    openingPressure: swarmPressureAt(w, 0),
    spawnCap: SWARM_SPAWN_CAP,
    level: swarmLevel(w),
    boss: isSwarmBossWave(w),
    // A boss wave is not clearable by killing chaff around a live champion. The quota AND every
    // champion body are both owed.
    requireBoss: isSwarmBossWave(w),
    bossId: boss ? boss.id : null,
    bossLabel: boss ? boss.label : null,
    bossLine: boss ? boss.line : null,
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
  // The arena raises the live-ship cap to SWARM_SPAWN_CAP for the length of a run, so the ceiling
  // to check against is that, not spawnBudget's untouched default. HARD_MAX is still the wall and
  // nothing here ever asks to move it.
  return Number.isInteger(n) && n > 0
    && n <= SWARM_SPAWN_CAP
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
  const opening = swarmPressureAt(w, 0);
  return swarmConcurrencyIsLegal(concurrent)
    // You must put down a full room and then some — otherwise the wave is its opening burst.
    && quota >= concurrent + SWARM_QUOTA_MARGIN
    // And the opening burst must never be the whole wave.
    && quota > opening
    // The crescendo must never ask for more than the wave's own ceiling.
    && opening <= concurrent
    && swarmPressureAt(w, 1) <= concurrent;
}
