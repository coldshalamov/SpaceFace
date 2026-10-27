// Swarm mode — the Crucible's own game (PQ-135).
//
// WHY THIS EXISTS
// ---------------
// The authored thirty-wave arc asks a QUESTION per wave: six identical things, then a split
// arrival, then a tether specialist. Swarm asks how far your evolving build can go: clear a
// finite pursuing pack, spend its cash or save, and launch the next round when ready.
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
//   2. A ROUND ENDS WHEN ITS FINITE COHORT IS DEFEATED. Reinforcements replace losses only
//      until the quota has arrived. No surviving enemy is discarded to manufacture a clear.
//   3. PRESSURE HAS A RELEASE. Each clear opens the armory; combat resumes on explicit launch.
//      Arena laws add opportunities, not compulsory motion or a fixed time-to-death target.
//   4. COVER IS THE POINT, NOT A GARNISH. The draft's verbs are Throw / Tag / Bind — physical
//      verbs that need something to throw a hull INTO. Every wave from 2 on requests cover rocks.
//   5. VARIETY COMES FROM THE ROSTER, ON A CLOCK YOU CAN FEEL. A new archetype unlocks on a fixed
//      wave, so a player learns one new silhouette at a time instead of meeting fifteen at once.
//
// Pure data + pure functions. No bus, no state, no registry, no DOM, no RNG source but the seed
// it is handed. Same (seed, wave) always yields the same wave.
//
// ONE DELIBERATE EXCEPTION: `livePressure`/`livePressureCtx` below are the live run's pressure
// reservoir + census hooks, bound by swarmArena at init and unbound/reset at destroy and newGame.
// Every pressure function takes an explicit `state` argument — the singleton is only the default
// for the arena's own calls. Tests must pass their own createSwarmPressureState() or bind first;
// forgetting the bind shares the live reservoir silently.

import { SPAWN_BUDGET_DEFAULT_MAX, SPAWN_BUDGET_HARD_MAX } from './survivalActs.js';
import { ENEMY_TYPES } from './enemies.js';
import { CAPITAL_BOSS_ENCOUNTERS } from './encounters/capital-boss.js';
import { hunterTrickById } from './hunterTricks.js';

export const SWARM_RULESET = 'swarm';
export const SWARM_SCHEMA_VERSION = 2;

/** Legacy timed-plan compatibility. Current Swarm plans complete their finite cohort instead. */
export const SWARM_WAVE_DURATION_TICKS = 3600;

/** No authored ceiling. Matches SURVIVAL_ENDLESS_WAVE_MAX so the phase machine has one cap idiom. */
export const SWARM_WAVE_MAX = 999;

/**
 * Every round opens the cash armory. Every tenth also opens the refit/extraction bench.
 */
export const SWARM_DRAFT_EVERY = 1;
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
 * `progress` is the resolved fraction of the current round's finite quota, 0..1.
 *
 * Wave 1's ceiling IS the opening floor (ten hulls). Thinning that pile below ten starved unlucky
 * seeds more than it stretched lucky ones (PQ-174.01). Raising the kill quota stalled or killed
 * the run before the 45–90 s band. Later waves still open below their ceiling.
 */
export function swarmPressureAt(wave, progress) {
  const ceiling = swarmConcurrent(wave);
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const ramp = SWARM_FULL_PRESSURE_AT > 0 ? Math.min(1, t / SWARM_FULL_PRESSURE_AT) : 1;
  const floor = Math.max(SWARM_CONCURRENT_MIN, Math.round(ceiling * SWARM_OPENING_PRESSURE));
  return Math.max(floor, Math.round(floor + (ceiling - floor) * ramp));
}

/**
 * Ticks between ordinary top-ups while the room is under strength (60 ticks = 1 second), and how
 * many bodies a small patch or a spent reservoir group brings.
 *
 * Small holes (1–2 bodies) still refill on this gap, as a readable group. A substantial clear does
 * not: see the pressure reservoir below. An empty room still bypasses the gap in survivalWave —
 * that emergency is "the room is never idle", not a refill of an earned hole.
 */
export const SWARM_REINFORCE_GAP_TICKS = 12;
export const SWARM_REINFORCE_BATCH = 3;
/**
 * SF-064 — a specialist's first body arrives alone, on its own bearing, a readable beat after
 * the opening burst lands (~4 s) and far enough out that its approach is the tell (210 WU vs the
 * ordinary 165). It is one of the wave's bodies — the planner gives its seat back from the
 * largest ordinary group — not an extra on top of the pressure math.
 */
export const SWARM_DEBUT_TICKS = 4 * 60;
export const SWARM_DEBUT_DISTANCE = 210;
/**
 * Ceiling on ONE telegraphed spend. Not an instant catch-up. The old deficit-adaptive surge
 * patched a big hole with half of itself the moment the gap elapsed, so a fast player never
 * outran replacement and never got a visible empty beat. The reservoir keeps this as the size
 * of the group that arrives AFTER the breath, not as an immediate fill.
 */
export const SWARM_REINFORCE_SURGE_MAX = 7;

/**
 * EARNED BREATHING ROOM (PQ-174.08).
 *
 * A ≥3-kill hole (or three unrepaired kills) buys SWARM_BREATH_TICKS of visibly thinner air.
 * Pressure accumulates in the reservoir for that beat, then one telegraphed group spends it.
 * Same roster, same concurrent ceiling, same hull values. A fresh empty room fills immediately;
 * a complete player-earned wipe keeps this same breath instead of cancelling the reward.
 */
export const SWARM_CLEAR_KILLS = 3;
export const SWARM_BREATH_TICKS = 240;
export const SWARM_BREATH_SECONDS = SWARM_BREATH_TICKS / 60;

export function createSwarmPressureState() {
  return {
    holding: false,
    holdTicks: 0,
    stored: 0,
    killsSinceReinforce: 0,
    telegraphed: false,
  };
}

const livePressure = createSwarmPressureState();
let livePressureCtx = {
  getAlive: () => null,
  onHoldStart: null,
  onSpend: null,
};

/** Arena (or a test) binds live census + telegraph callbacks. Unbind with null. */
export function bindSwarmPressureContext(ctx) {
  livePressureCtx = ctx && typeof ctx === 'object'
    ? ctx
    : { getAlive: () => null, onHoldStart: null, onSpend: null };
}

export function resetSwarmPressureState(state = livePressure) {
  state.holding = false;
  state.holdTicks = 0;
  state.stored = 0;
  state.killsSinceReinforce = 0;
  state.telegraphed = false;
  return state;
}

/** Record cohort kills that have not yet been replaced. Used to detect a 3-kill clear. */
export function noteSwarmPressureKills(count = 1, state = livePressure) {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  if (n > 0) state.killsSinceReinforce += n;
  return state.killsSinceReinforce;
}

export function swarmPressureIsHolding(state = livePressure) {
  return state.holding === true;
}

/**
 * May the hold actually suppress arrivals right now? Only while its breath is still running.
 * A hold whose clock has already run out is owed a SPEND, not more air — it must let work
 * through so the stream can reach the consult that pays the debt. Dispatch consults this,
 * never the bare flag: `holding` alone only says debt is still on the books.
 */
export function swarmPressureSuppressing(state = livePressure) {
  return state.holding === true && state.holdTicks < SWARM_BREATH_TICKS;
}

/**
 * Expire a hold's clock at a wave boundary without touching its debt. The grip — `holdTicks`
 * still below the breath — is what starves the next wave's opening: the suppressed schedule
 * itself keeps the census at target, so the reservoir is never consulted and a carried hold
 * can never spend. `holding`, `stored` and `killsSinceReinforce` stay standing — the authored
 * carry — so the owed group still pays out through the ordinary spend on the new wave's first
 * real deficit, or simply sits if the new wave was owed nothing.
 */
export function expireSwarmPressureHold(state = livePressure) {
  if (state && state.holding === true) state.holdTicks = SWARM_BREATH_TICKS;
  return state;
}

/**
 * Pure decision: given a reservoir state and how far under strength the room is, how many
 * bodies this top-up should admit. Side-effect free — the live wrapper fires telegraph hooks.
 *
 * `alive` is the live cohort census. `null` means unknown (tests that never bound the arena):
 * a hole of SWARM_CONCURRENT_MIN or more is treated as an empty-room emergency. Production
 * binds the arena, so a wiped board is `alive === 0` regardless of the opening count.
 * Recorded kills distinguish an earned wipe from an empty startup.
 */
export function swarmReinforceDecision(state, deficit, opts = {}) {
  const bag = state && typeof state === 'object' ? state : createSwarmPressureState();
  const d = Math.max(0, Math.trunc(Number(deficit) || 0));
  const alive = opts.alive;
  const empty = alive === 0
    || (alive == null && d >= SWARM_CONCURRENT_MIN);
  const substantial = d >= SWARM_CLEAR_KILLS
    || bag.killsSinceReinforce >= SWARM_CLEAR_KILLS;

  if (d <= 0) {
    resetSwarmPressureState(bag);
    return { count: 0, telegraph: false, spent: 0 };
  }

  // Empty at startup is starvation; empty after a real clear is an earned breath.
  if (empty && !bag.holding && bag.killsSinceReinforce < SWARM_CLEAR_KILLS) {
    resetSwarmPressureState(bag);
    return { count: Math.min(d, SWARM_REINFORCE_BATCH), telegraph: false, spent: 0 };
  }

  if (!substantial && !bag.holding) {
    return { count: Math.min(d, SWARM_REINFORCE_BATCH), telegraph: false, spent: 0 };
  }

  if (!bag.holding) {
    bag.holding = true;
    bag.holdTicks = 0;
    bag.stored = d;
    bag.telegraphed = true;
    return { count: 0, telegraph: true, spent: 0 };
  }

  bag.holdTicks += 1;
  bag.stored = Math.max(bag.stored, d);
  if (bag.holdTicks < SWARM_BREATH_TICKS) {
    return { count: 0, telegraph: false, spent: 0 };
  }

  const spend = Math.min(
    d,
    Math.max(SWARM_REINFORCE_BATCH, Math.min(SWARM_REINFORCE_SURGE_MAX, bag.stored)),
  );
  resetSwarmPressureState(bag);
  return { count: spend, telegraph: false, spent: spend };
}

/**
 * How many bodies one top-up brings. Small holes patch with a readable group. A substantial
 * clear stores the deficit for SWARM_BREATH_TICKS, then spends it as one group. SurvivalWave
 * still passes only the deficit — the arena binds census and telegraph.
 */
export function swarmReinforceCount(deficit) {
  const alive = typeof livePressureCtx.getAlive === 'function'
    ? livePressureCtx.getAlive()
    : null;
  const decision = swarmReinforceDecision(livePressure, deficit, { alive });
  if (decision.telegraph && typeof livePressureCtx.onHoldStart === 'function') {
    livePressureCtx.onHoldStart({
      stored: livePressure.stored,
      breathTicks: SWARM_BREATH_TICKS,
      breathSeconds: SWARM_BREATH_SECONDS,
    });
  }
  if (decision.spent > 0 && typeof livePressureCtx.onSpend === 'function') {
    livePressureCtx.onSpend({ count: decision.count });
  }
  return decision.count;
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

/** Brief settlement beat before the player-controlled armory break. */
export const SWARM_CLEANUP_TICKS = 45;

const GATES = Object.freeze(['nw', 'ne', 'se', 'sw', 'front', 'rear', 'diagonal_a', 'diagonal_b']);

/**
 * The roster clock. One new silhouette at a time, on a wave you can predict.
 *
 * `weight` is a spawn share once unlocked. `role` is the plan role the body carries, which is what
 * the results screen and the arena's dominant-gate read use.
 *
 * FB-023: patrol_lawman and customs_cutter join the clock — the Crucible has no WANTED axis,
 * so waveMaterialization restamps a lawful hull as an arena combatant (arena contract,
 * weapons-free) instead of letting it spawn inert behind `lawful_wanted_only`. mule_trader
 * stays absent: it is a fleeing_trader (alwaysFlee, defensiveOnly) marked illegalToKill.
 */
export const SWARM_ROSTER = Object.freeze([
  { enemyId: 'wasp_swarmer', role: 'mass', fromWave: 1, weight: 10, name: 'Wasp Swarmer' },
  { enemyId: 'reaver_pirate', role: 'pressure', fromWave: 2, weight: 6, name: 'Reaver Pirate' },
  { enemyId: 'choir_zealot', role: 'mass', fromWave: 4, weight: 7, name: 'Choir Zealot' },
  // The dart joins one wave after the zealot pack: by round five the room is crowded enough
  // that "the hull running at you IS the ordnance" stays legible instead of being lost noise.
  // Light enough to sling, fuse-lit on approach, and it pops where it dies either way.
  { enemyId: 'detonator_dart', role: 'pressure', fromWave: 5, weight: 4, name: 'Detonator Dart' },
  { enemyId: 'mine_layer_jackal', role: 'disruptor', fromWave: 6, weight: 2, name: 'Mine-Layer Jackal' },
  { enemyId: 'lancer_sniper', role: 'reach', fromWave: 8, weight: 3, name: 'Lancer Sniper' },
  // The warden is the roster's bodyguard: it picks a packmate and screens it, so the pack
  // stops reading as disposable chaff exactly when the rooms start throwing it.
  { enemyId: 'warden_escort', role: 'support', fromWave: 9, weight: 2, name: 'Warden Escort' },
  { enemyId: 'corsair_raider', role: 'elite', fromWave: 10, weight: 3, name: 'Corsair Raider' },
  // The cutter's interdiction kit (EMP on occasion, plated prow) is a specialist problem,
  // not fodder — it arrives as a disruptor, after the room has taught dodging as a verb.
  // (Wave 13, not 12: the ghost already owns that debut — one new silhouette at a time.)
  { enemyId: 'customs_cutter', role: 'disruptor', fromWave: 13, weight: 2, name: 'Customs Cutter' },
  { enemyId: 'quiet_ghost', role: 'reach', fromWave: 12, weight: 2, name: 'Quiet Ghost' },
  { enemyId: 'pd_screen_escort', role: 'support', fromWave: 14, weight: 2, name: 'Point-Defense Screen' },
  // The lawman is the roster's duelist: plated enough to shrug the throw answer, committed
  // enough to keep pressing while the rest of the pack cycles.
  { enemyId: 'patrol_lawman', role: 'elite', fromWave: 15, weight: 2, name: 'Patrol Lawman' },
  { enemyId: 'tether_control_raider', role: 'control', fromWave: 16, weight: 2, name: 'Tether-Control Raider' },
  { enemyId: 'bruiser_brawler', role: 'anchor', fromWave: 18, weight: 2, name: 'Bruiser Brawler' },
  { enemyId: 'field_anchor_controller', role: 'anchor', fromWave: 22, weight: 2, name: 'Anchor Controller' },
]);

export const SWARM_BOSS_ENEMY_ID = 'dreadnought_boss';

/** Mass fodder that stays packed inside a swarm. Adventure keeps the enemy def's own doctrine. */
export const SWARM_PACK_PURSUIT_IDS = Object.freeze(['wasp_swarmer', 'choir_zealot']);

/**
 * Doctrine stamp for one swarm spawn. Null means "leave the enemy def alone".
 * Champion corsairs commit together so one bank can catch the wing. Mass lights pursue.
 */
export function swarmDoctrineStamp(enemyId, { swarm = false, champion = false } = {}) {
  if (swarm && SWARM_PACK_PURSUIT_IDS.includes(enemyId)) return 'pack_pursuit';
  if (swarm && champion && enemyId === 'corsair_raider') return 'brawler_commit';
  return null;
}

/**
 * WHAT SHOWS UP ON A TENTH WAVE.
 *
 * It was the same Dreadnought, forever. Wave 10 and wave 90 were the same fight with bigger
 * numbers, which is the exact failure the authored arc was careful to avoid inside its own ten.
 *
 * FB-024: the capital rows are not compositions at all — they are AUTHORED CAPITAL SCORES
 * fielded as one hull. `enemyId`+`scoreId` (instead of `packages`) materialize a single capital
 * elite and hand the fight to `capitalBossEncounters`, so wave ten is the Iron Maw's own script,
 * wave twenty is the Foreman's committed charge and wave thirty is the Regent's wider crown —
 * the same bosses the scored arc teaches, arrived at by the roster clock. They recur inside the
 * rotation, so the comp room stays varied past wave forty.
 *
 * A compositional row may also carry `trickId` (FB-027): each champion body materialized for
 * it is stamped as a bounty hunter of the crucible's own contract, so the champion telegraphs
 * and counter-windows through the exact verb path a bounty hunter uses. Capital rows carry no
 * trick — the score's own beats already telegraph and expose counter windows, and a hunter
 * verb that re-aimed or moved the hull would lie against the committed shot.
 *
 * ORDER MATTERS: the compositional rows are walked in step with the roster clock, so every
 * archetype they field is one the player has already met as ordinary chaff — nothing debuts a
 * silhouette as a champion. The capital rows are the deliberate exception: they are the scored
 * arc's named set-pieces, and the boss wave IS their introduction.
 */
export const SWARM_BOSS_ROTATION = Object.freeze([
  {
    id: 'iron_maw',
    label: "Dreadnought 'Iron Maw'",
    line: 'A capital hull is on the field. Throw the pack into the flank berm.',
    room: 'flank_berm',
    // RC-02 — the round-10 champion is the FIRST capital row: the same dreadnought_boss hull it
    // always fielded, now handed to the authored Iron Maw score (`capital_boss_hulk`) instead of
    // stock AI plus a hunter trick. Capital rows carry `enemyId`+`scoreId`, never `packages`
    // or `trickId` — the score's own beats telegraph and expose the counter windows.
    enemyId: 'dreadnought_boss',
    scoreId: 'capital_boss_hulk',
  },
  {
    id: 'mirrorjaw_foreman',
    label: 'Mirrorjaw Foreman',
    line: 'The Foreman commits on a bearing. Cross the pass — the prow sheds head-on fire.',
    room: 'mirror_lane',
    enemyId: 'mirrorjaw_foreman',
    scoreId: 'capital_boss_foreman',
  },
  {
    id: 'forge_regent',
    label: 'Forge Regent',
    line: 'The furnace wears a crown. Cross the pass; the whole front half is plate.',
    room: 'crown_furnace',
    enemyId: 'forge_regent',
    scoreId: 'capital_boss_regent',
  },
  {
    id: 'corsair_wing',
    label: 'Corsair Wing',
    line: 'Three raider aces, flying as one. One bank catches the wing.',
    room: 'wing_bank',
    trickId: 'phase-jammer',
    packages: [{ enemyId: 'corsair_raider', count: 3, role: 'elite', sameGate: true }],
  },
  {
    id: 'the_anvil',
    label: 'The Anvil',
    line: 'Shove the screen. The brawlers are what it was covering.',
    room: 'screen_wall',
    trickId: 'shield-turtle',
    packages: [
      { enemyId: 'pd_screen_escort', count: 2, role: 'support', gateBias: 'near' },
      { enemyId: 'bruiser_brawler', count: 2, role: 'anchor', gateBias: 'far', distance: 240 },
    ],
  },
  {
    id: 'quiet_choir',
    label: 'The Quiet Choir',
    line: 'Close while the anchor holds you. The ghosts do not chase.',
    room: 'hold_close',
    trickId: 'sensor-ghost',
    packages: [
      { enemyId: 'quiet_ghost', count: 3, role: 'reach', gateBias: 'far', distance: 280 },
      { enemyId: 'field_anchor_controller', count: 1, role: 'anchor', gateBias: 'near' },
    ],
  },
  // SWARM-07 B3 — the Brood champions, deep in the rotation. Same `enemyId`+`scoreId`
  // contract as the Foreman/Regent rows: one real hull materialized through the wave's
  // ordinary package path, then handed to its authored score. The Queen's wave fields the
  // flood itself (swarmBroodPlan reads her id and fields nothing but mites); the Tendril's
  // body is the brood engine's segment chain behind the head.
  {
    id: 'brood_queen',
    label: 'Brood Queen',
    line: 'The broodmother floods the room. Break her sacs — her own brood is ammunition.',
    room: 'brood_nest',
    enemyId: 'brood_queen',
    scoreId: 'capital_boss_brood_queen',
  },
  {
    id: 'brood_tendril',
    label: 'The Tendril',
    line: 'A worm works the field. It cannot turn mid-weave — put a rock on the line.',
    room: 'coil_field',
    enemyId: 'brood_tendril',
    scoreId: 'capital_boss_tendril',
  },
  // W-COLOSSI (build_map row 547, expansion 07 §5) — the rest of the Colossus roster, appended
  // past the wave-80 Tendril so every authored wave keeps its number: waves 90–140 field the
  // Nest Carrier, Casket Worm, Furnace Maw, Yardmaster, Adjudicator 44-C and Hive-hulk in
  // ascending order of weight. Same `enemyId`+`scoreId` contract: one real hull through the
  // ordinary package path, handed to its authored score — and on row 547's framework their
  // plates are live: rope tears and act sheds both leave tetherable slabs as ammunition.
  {
    id: 'nest_carrier',
    label: 'Nest Carrier',
    line: 'A gutted freighter is birthing wasps. The belly doors are the nest — every door and every wasp is ammunition.',
    room: 'nest_berth',
    enemyId: 'nest_carrier',
    scoreId: 'capital_boss_nest_carrier',
  },
  {
    id: 'casket_worm',
    label: 'Casket Worm',
    line: 'A derelict worm works the grave. Cut the middle segment — every piece of it is ammunition.',
    room: 'casket_field',
    enemyId: 'casket_worm',
    scoreId: 'capital_boss_casket_worm',
  },
  {
    id: 'furnace_maw',
    label: 'Furnace Maw',
    line: 'The furnace is eating. Rip its radiator plates and feed them back — the cavity only opens to feed.',
    room: 'maw_feed',
    enemyId: 'furnace_maw',
    scoreId: 'capital_boss_furnace_maw',
  },
  {
    id: 'yardmaster',
    label: 'The Yardmaster',
    line: 'A ball of accreted wreck is rolling. Every piece of it is ammunition — the magnet core is the last tear.',
    room: 'wreck_magnet',
    enemyId: 'yardmaster',
    scoreId: 'capital_boss_yardmaster',
  },
  {
    id: 'adjudicator_44c',
    label: 'Adjudicator 44-C',
    line: 'The lane is closed for audit. Tear the seal emitters and the clamp — the gate welds shut behind you.',
    room: 'seal_gate',
    enemyId: 'adjudicator_44c',
    scoreId: 'capital_boss_adjudicator',
  },
  {
    id: 'hive_hulk',
    label: 'Hive-Hulk',
    line: 'Something moved into that hulk. Nodes, armour, bay doors — the largest parts pile outside the Iron Maw.',
    room: 'hive_shaft',
    enemyId: 'hive_hulk',
    scoreId: 'capital_boss_hive_hulk',
  },
]);

/** The one-hull package a capital champion row implies when it carries no explicit packages. */
export function bossPackagesFor(boss) {
  if (boss && Array.isArray(boss.packages)) return boss.packages;
  if (boss && typeof boss.enemyId === 'string') {
    return [{ enemyId: boss.enemyId, count: 1, role: 'elite' }];
  }
  return [];
}

const BOSS_ROOM_NOTES = Object.freeze({
  flank_berm: 'a flank berm — throw the swarm into it',
  mirror_lane: 'a mirrored lane — cross the committed pass, work the stern',
  crown_furnace: 'the furnace wears a crown — the middle shoves, the rim is plate to bank off',
  wing_bank: 'bank stone on the wing\'s bearing',
  screen_wall: 'a screen wall between you and the brawlers',
  hold_close: 'the room holds you; close on the ghosts',
  brood_nest: 'the nest pulls toward the sacs — cover to break the flood, rocks to throw back',
  coil_field: 'the weave field — a slow cross-breeze, and rocks to feed the committed pass',
  nest_berth: 'the berth pulls toward the belly — a vent-breeze rakes the launch lanes',
  casket_field: 'the grave drifts two ways — rocks to feed the middle cut',
  maw_feed: 'the mouth shoves — the rim orbit is free, and the cavity eats what you feed it',
  wreck_magnet: 'the magnet drags the whole yard inward — everything loose ends up inside the pile',
  seal_gate: 'the gate is welding shut — rails on the flanks, mines at the mouth, one honest corridor',
  hive_shaft: 'the shaft pulls long and rakes crosswise — the hulk is the only cover',
});

export function bossRoomNote(room) {
  return BOSS_ROOM_NOTES[room] || null;
}

/**
 * A WRAPPED CHAMPION READS AS AN ESCALATION, NOT A REPRINT.
 *
 * Past wave 140 the rotation lands on a row the player already beat — and wave 150 used to be
 * the wave-10 fight verbatim. HP inflation is the one lever this mode refuses (rule 1), so the
 * wrap escalates through the mode's own currency, BODIES: the champion returns wearing a cycle
 * numeral ("Iron Maw II") and an honor guard of wardens on its own gate, folded into `packages`
 * through the exact multi-package contract the wing rows already use. Every guard body is
 * `champion: true`, so requireBoss owes it, the boss bar counts it, the affix pass can trick
 * it, and its seats come out of the opening chaff — the room stays exactly as full.
 */
export const SWARM_WRAP_ESCORT_ENEMY = 'warden_escort';
/** A guard, not a second wing — deeper cycles harden the same escort rather than flooding it. */
export const SWARM_WRAP_ESCORT_MAX = 4;

/** The numeral a wrapped champion wears: cycle 1 (the second pass) reads 'II'. */
export function swarmCycleNumeral(cycle) {
  let n = Math.max(1, Math.trunc(Number(cycle) || 0) + 1);
  let out = '';
  for (const [v, glyph] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (n >= v) { out += glyph; n -= v; }
  }
  return out;
}

/** The escalated row a wrap wears: same id, score, room and line — plus numeral and guard. */
function swarmEscalatedBoss(row, cycle) {
  return {
    ...row,
    cycle,
    label: `${row.label} ${swarmCycleNumeral(cycle)}`,
    packages: [
      ...bossPackagesFor(row),
      {
        enemyId: SWARM_WRAP_ESCORT_ENEMY,
        count: Math.min(cycle, SWARM_WRAP_ESCORT_MAX),
        role: 'support',
        sameGate: true,
      },
    ],
  };
}

/** Which champion a boss wave fields. Non-boss waves have none. */
export function swarmBossFor(wave) {
  const w = swarmWaveOf(wave);
  if (!isSwarmBossWave(w)) return null;
  const step = Math.max(0, Math.floor(w / SWARM_BOSS_EVERY) - 1);
  const row = SWARM_BOSS_ROTATION[step % SWARM_BOSS_ROTATION.length];
  const cycle = Math.floor(step / SWARM_BOSS_ROTATION.length);
  return cycle > 0 ? swarmEscalatedBoss(row, cycle) : row;
}

/**
 * How far out the combat net names the champion a run is sailing toward. One fixed lead,
 * never a countdown: the warning lands once, on the wave exactly this many rounds before
 * the boss wave, so "Iron Maw II waits at wave 150" is a named goal and not a chorus.
 */
export const SWARM_CHAMPION_LEAD_WAVES = 3;

/**
 * The champion a run is sailing toward: the boss wave AT-OR-AFTER `wave` (asking on a boss
 * wave names the fight on the field). Returns the rotation row exactly as swarmBossFor
 * resolves it — the cycle numeral and wrap escort ride along — plus the `wave` it lands on
 * and the `distance` out, so a preview speaks without redoing the wrap math. Null past the
 * last legal boss wave: there is no champion beyond wave 990 to promise.
 */
export function swarmNextBossFor(wave) {
  const w = swarmWaveOf(wave);
  const at = Math.ceil(w / SWARM_BOSS_EVERY) * SWARM_BOSS_EVERY;
  if (at > SWARM_WAVE_MAX) return null;
  const boss = swarmBossFor(at);
  if (!boss) return null;
  return { ...boss, wave: at, distance: at - w };
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
 * Finite round quotas also anchor chip valuation. They climb early and flatten so deeper
 * rounds gain variety and pressure without turning into a health or currency treadmill.
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
 *
 * Wave 1 is the exception: it should reach the first purchase quickly without inflating hull.
 * Quota 15 against a 10-hull pile clears in 23–35 s on the fast kits (.00 bench). Quota 24
 * put two of nine cells inside 45–90 s and left seven unfinished — a stall after ~22 kills,
 * or a death on the longer clock. Thinning the opening room starved unlucky seeds worse.
 * Hull values stay untouched. Later waves keep this margin and the 20+2w climb.
 */
export const SWARM_QUOTA_MARGIN = 8;

/** Wave-1-only quota-over-concurrent margin. Do not use this to weaken later waves or the cap. */
export const SWARM_QUOTA_OPENING_MARGIN = 5;

/** Wave-1 kill quota. Later waves keep `max(concurrent + SWARM_QUOTA_MARGIN, 20 + 2w)`. */
export const SWARM_OPENING_QUOTA = 15;

export function swarmQuota(wave) {
  const w = swarmWaveOf(wave);
  const margin = w <= 1 ? SWARM_QUOTA_OPENING_MARGIN : SWARM_QUOTA_MARGIN;
  const floor = swarmConcurrent(w) + margin;
  // A boss wave is shorter on chaff, because the boss is the work.
  if (isSwarmBossWave(w)) {
    return Math.min(SWARM_QUOTA_CAP, Math.max(floor, 20 + Math.floor(w / 2)));
  }
  if (w === 1) {
    return Math.min(SWARM_QUOTA_CAP, Math.max(floor, SWARM_OPENING_QUOTA));
  }
  return Math.min(SWARM_QUOTA_CAP, Math.max(floor, 20 + w * 2));
}

/**
 * WHERE THE STAT CURVE STOPS.
 *
 * `makeEnemySpawnSpec` → `scaleCombatant` raises hull, armor and shield by 12% per level
 * (`src/systems/combat.js`). That is hit-point inflation, which this mode is forbidden to use.
 * Swarm materialization still passes `swarmLevel` into that path, so the only legal return is 1
 * at every wave. Count, composition, mass, hazards and bearings carry the difficulty curve.
 * `SWARM_LEVEL_CAP` remains the wave at which every OTHER dial (concurrency, roster) is maxed.
 */
export const SWARM_LEVEL_CAP = 8;

export function swarmLevel(wave) {
  swarmWaveOf(wave);
  return 1;
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
 * Every enemy id a wave can actually field: the unlocked roster plus the champion's
 * packages on a boss wave. The launch and between-round GPU warms scope their exemplar
 * work to this set — hulls a wave can never spawn are deferred to the dwell before it.
 */
export function swarmEligibleEnemyIds(wave) {
  const w = swarmWaveOf(wave);
  const ids = new Set();
  for (const entry of swarmRosterFor(w)) ids.add(entry.enemyId);
  const boss = swarmBossFor(w);
  if (boss) {
    // bossPackagesFor, not boss.packages: the capital champion rows carry `enemyId` and no
    // `packages` key, so reading the field directly made the Foreman/Regent (and the new Brood
    // champions) invisible to the launch/dwell prewarm — hulls the wave does field, missed.
    for (const pkg of bossPackagesFor(boss)) {
      if (pkg && pkg.enemyId) ids.add(pkg.enemyId);
    }
  }
  return ids;
}

const SWARM_ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));

/**
 * Catalog check for every enemy id the swarm content names — roster rows and boss-rotation
 * packages. makeEnemySpawnSpec still falls back safely at runtime (a bad id spawns a wasp and
 * logs), but AUTHORED content is not allowed to lean on that path: a typo'd roster id is a
 * defect to fail, not a spawn to substitute. Mirrors catalogQuestionIssues' shape.
 */
export function swarmCatalogIssues() {
  const issues = [];
  const check = (path, enemyId) => {
    if (typeof enemyId !== 'string' || !SWARM_ENEMY_IDS.has(enemyId)) {
      issues.push({ path, message: `unknown enemyId ${JSON.stringify(enemyId)}` });
    }
  };
  SWARM_ROSTER.forEach((entry, i) => {
    check(`swarmRoster[${i}].enemyId`, entry && entry.enemyId);
  });
  SWARM_BOSS_ROTATION.forEach((boss, i) => {
    bossPackagesFor(boss).forEach((pkg, j) => {
      check(`bossRotation[${i}].packages[${j}].enemyId`, pkg && pkg.enemyId);
    });
    // A capital champion's score id must name a shipped encounter — the wave owner hands the
    // spawned hull to `capitalBossEncounters` by that id, and a typo is a boss that never wakes.
    if (boss && boss.scoreId != null && !Object.hasOwn(CAPITAL_BOSS_ENCOUNTERS, boss.scoreId)) {
      issues.push({ path: `bossRotation[${i}].scoreId`, message: `unknown scoreId ${JSON.stringify(boss.scoreId)}` });
    }
    if (boss && boss.trickId != null && !hunterTrickById(boss.trickId)) {
      issues.push({ path: `bossRotation[${i}].trickId`, message: `unknown trickId ${JSON.stringify(boss.trickId)}` });
    }
  });
  return issues;
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
 * SF-062 — the mass-and-gap round. Every sixth wave (boss waves excluded) the room becomes a
 * geometry problem: light pursuers open first — ammunition, not threat — while a chord of
 * monolith cover closes one side of the room with exactly two gaps left navigable, and the
 * wave's heaviest legal body arrives late through that wall's gate. Nothing inflates: hull,
 * quota and concurrency stay authored; the wall is collision geometry, and SF-067 wear means
 * the player can break a third gap open if they spend the hull for it.
 */
export const SWARM_MASS_GAP_EVERY = 6;
/** The wall's muscle lands ~4.5 s in — after the fodder opens, before the stream fills. */
export const SWARM_MASS_GAP_CLOSE_TICKS = 270;
export const SWARM_MASS_GAP_WALL_ROCKS = 9;
export const SWARM_MASS_GAP_WALL_DISTANCE = 250;
export const SWARM_MASS_GAP_ROCK_RADIUS = 26;
/** Stream bias for light pursuers on a mass-gap wave — the room keeps feeding ammunition. */
export const SWARM_MASS_GAP_FODDER_SCALE = 1.4;

/** Light pursuer roles — the bodies a mass-gap wave hands the player to throw. */
export const SWARM_FODDER_ROLES = Object.freeze(['mass', 'pressure']);
/** Wall muscle in preference order — the body that makes the corridor read as closed. */
const SWARM_WALL_ROLES = Object.freeze(['anchor', 'elite', 'control', 'disruptor']);

export function isSwarmMassGapWave(wave) {
  const w = swarmWaveOf(wave);
  return w >= SWARM_MASS_GAP_EVERY && w % SWARM_MASS_GAP_EVERY === 0 && !isSwarmBossWave(w);
}

/** The light-pursuer slice of the legal roster, for the mass-gap opening burst. */
export function swarmFodderRoster(wave) {
  return swarmRosterFor(wave).filter((entry) => SWARM_FODDER_ROLES.includes(entry.role));
}

/** The heaviest legal wall-muscle archetype for the wave, or null before one unlocks. */
export function swarmWallPickFor(wave, excludeId) {
  const legal = swarmRosterFor(wave).filter((entry) => entry.enemyId !== excludeId);
  for (const role of SWARM_WALL_ROLES) {
    let best = null;
    for (const entry of legal) {
      if (entry.role !== role) continue;
      if (!best || entry.weight > best.weight) best = entry;
    }
    if (best) return best;
  }
  return null;
}

// ── NXB-017 — the three-round act, waves 25–27 ───────────────────────────────────────────────
// The bank specifies individual good rounds; the act composes three adjacent slots into one
// legible escalation: exploit a body, protect the opportunity, then apply the learned
// interaction under combined pressure. Waves 25–27 are the first quiet window past the roster
// clock — every archetype is legal, and no debut, mass-gap or boss flag fires — and the phase
// cycle happens to hand each round the room its question asks for. So the act authors there
// instead of adding a mode: the same pure planner, the same quota/concurrency budgets, the
// same finite cohort. An act round only rewrites the opening recipe and the stream's bias;
// gates, timing, quota, draft and clear law all stay the wave's own.
//
//   r1 loose_plate    — LOOSE MASS VS AN EXPOSED HULL. Throw-class fodder on three bearings
//                       and loose-plate rock drifting on the sag are ammunition; the bruiser
//                       that commits alone a beat later is the exposed target. Guns cannot
//                       shove a terrain-class hull — the room's mass is the lever.
//   r2 furnace_active — THE SPECIALIST CONTESTS THE USE. A tether raider stages alone on its
//                       own bearing (the same readable beat a debut uses) and fights the
//                       player for the line r1 taught, while the lit furnace shoves the
//                       centre off the stand-and-throw spot.
//   r3 shutter_slow   — THE LEARNED INTERACTION UNDER COMBINED PRESSURE. The anchor (mass
//                       420) and the specialist return on one bearing while the whole room
//                       leans. The anchor's snare well bites only across its telegraphed
//                       commit; its recovery leg is the counter-window, and the lean drags
//                       the hull exactly then.
function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

export const SWARM_ACT_ID = 'mooring_line';
export const SWARM_ACT_ROUNDS = 3;
/** Staged act bodies land on the same readable beat a debut uses — alone, a little far out. */
export const SWARM_ACT_STAGED_TICKS = SWARM_DEBUT_TICKS;
export const SWARM_ACT_STAGED_DISTANCE = SWARM_DEBUT_DISTANCE;

/**
 * Authored opening recipes by wave. `gateIndex` walks this wave's gate ring; 'free' takes the
 * first bearing no earlier package uses; 'same' shares the previous package's gate — the r3
 * pair arrives as one event. `staged` marks a body the wave owes like a debut: refused seats
 * are re-queued, never dropped.
 */
export const SWARM_ACT = freezeDeep({
  25: {
    id: SWARM_ACT_ID,
    round: 1,
    arenaPhase: 'loose_plate',
    question: 'One hull commits alone through the loose rock — the room is full of mass that is not yours yet.',
    streamBias: 'fodder',
    packages: freezeDeep([
      { enemyId: 'wasp_swarmer', count: 7, gateIndex: 0, atTick: 0 },
      { enemyId: 'choir_zealot', count: 6, gateIndex: 2, atTick: 12 },
      { enemyId: 'reaver_pirate', count: 5, gateIndex: 4, atTick: 24 },
      { enemyId: 'bruiser_brawler', count: 1, gate: 'free', atTick: SWARM_ACT_STAGED_TICKS, distance: SWARM_ACT_STAGED_DISTANCE, staged: true },
    ]),
  },
  26: {
    id: SWARM_ACT_ID,
    round: 2,
    arenaPhase: 'furnace_active',
    question: 'Something else wants the other end of the line — and the middle of the room is lit.',
    streamBias: 'fodder',
    packages: freezeDeep([
      { enemyId: 'wasp_swarmer', count: 6, gateIndex: 0, atTick: 0 },
      { enemyId: 'detonator_dart', count: 5, gateIndex: 1, atTick: 12 },
      { enemyId: 'reaver_pirate', count: 4, gateIndex: 2, atTick: 24 },
      { enemyId: 'choir_zealot', count: 3, gateIndex: 3, atTick: 36 },
      { enemyId: 'tether_control_raider', count: 1, gate: 'free', atTick: SWARM_ACT_STAGED_TICKS, distance: SWARM_ACT_STAGED_DISTANCE, staged: true },
    ]),
  },
  27: {
    id: SWARM_ACT_ID,
    round: 3,
    arenaPhase: 'shutter_slow',
    question: 'The anchor bites only when it means it — its own cycle is the opening.',
    streamBias: 'fodder',
    packages: freezeDeep([
      { enemyId: 'wasp_swarmer', count: 6, gateIndex: 0, atTick: 0 },
      { enemyId: 'reaver_pirate', count: 5, gateIndex: 2, atTick: 12 },
      { enemyId: 'choir_zealot', count: 5, gateIndex: 4, atTick: 24 },
      { enemyId: 'field_anchor_controller', count: 1, gate: 'free', atTick: SWARM_ACT_STAGED_TICKS + 60, distance: SWARM_ACT_STAGED_DISTANCE + 30, staged: true },
      // The r2 specialist rides the anchor's bearing — the contest and the anchor arrive as
      // one event instead of two lectures.
      { enemyId: 'tether_control_raider', count: 1, gate: 'same', atTick: SWARM_ACT_STAGED_TICKS + 60, distance: SWARM_ACT_STAGED_DISTANCE + 30, staged: true },
    ]),
  },
});

/** The authored act round for this wave, or null on an ordinary generated wave. */
export function swarmActFor(wave) {
  const w = swarmWaveOf(wave);
  return SWARM_ACT[w] || null;
}

/**
 * NXI-066 — does an authored act round stay inside the wave's own contract? Issues, empty when
 * honest. An act may only field bodies the wave's roster has already unlocked (no early
 * debuts stealing a later wave's tell), must hold its burst inside the shared spawn budget,
 * and must keep the opening lane useful: distinct bearings for its groups, never every gate.
 */
export function swarmActIssues(wave, act = SWARM_ACT[swarmWaveOf(wave)]) {
  const w = swarmWaveOf(wave);
  if (!act) return [];
  const issues = [];
  if (!Array.isArray(act.packages) || act.packages.length === 0) {
    issues.push({ path: 'packages', message: `act wave ${w} authors no packages` });
    return issues;
  }
  let total = 0;
  const used = [];
  for (const spec of act.packages) {
    const entry = SWARM_ROSTER.find((r) => r.enemyId === (spec && spec.enemyId));
    if (!entry) {
      issues.push({ path: 'packages', message: `act wave ${w} fields unknown enemy '${spec && spec.enemyId}'` });
      continue;
    }
    if (entry.fromWave > w) {
      issues.push({ path: 'packages', message: `act wave ${w} fields '${entry.enemyId}' before its wave-${entry.fromWave} unlock` });
    }
    const count = Number(spec && spec.count);
    if (!Number.isInteger(count) || count < 1) {
      issues.push({ path: 'packages', message: `act wave ${w} package '${entry.enemyId}' has no legal count` });
    } else {
      total += count;
    }
    // NXI-065 — resolve the gate the way the planner will, then check the lane survives.
    const gate = spec.gate === 'free'
      ? swarmFreeGateFor(w, used)
      : spec.gate === 'same'
        ? (used.length ? used[used.length - 1] : swarmGateFor(w, 0))
        : swarmGateFor(w, Number.isInteger(spec.gateIndex) ? spec.gateIndex : used.length);
    used.push(gate);
  }
  if (total > SPAWN_BUDGET_DEFAULT_MAX) {
    issues.push({ path: 'packages', message: `act wave ${w} scheduled population ${total} exceeds budget ${SPAWN_BUDGET_DEFAULT_MAX}` });
  }
  if (new Set(used).size >= GATES.length) {
    issues.push({ path: 'packages', message: `act wave ${w} blocks every gate — no opening lane survives` });
  }
  return issues;
}

/**
 * Resolve an authored act round into plan `packages` — the same shape `swarmOpeningPackages`
 * returns, so every downstream consumer (schedule, dispatch, owed-body law) sees one contract.
 * Roles come from the canonical roster, never the act table.
 */
export function swarmActPackages(wave) {
  const w = swarmWaveOf(wave);
  const act = SWARM_ACT[w];
  if (!act) return [];
  const used = [];
  return act.packages.map((spec, index) => {
    const entry = SWARM_ROSTER.find((r) => r.enemyId === spec.enemyId);
    const gateGroup = spec.gate === 'free'
      ? swarmFreeGateFor(w, used)
      : spec.gate === 'same'
        ? (used.length ? used[used.length - 1] : swarmGateFor(w, 0))
        : swarmGateFor(w, Number.isInteger(spec.gateIndex) ? spec.gateIndex : index);
    used.push(gateGroup);
    const count = Math.max(1, spec.count | 0);
    return {
      atTick: Number.isInteger(spec.atTick) ? spec.atTick : 0,
      gateGroup,
      role: entry ? entry.role : 'pressure',
      enemyId: spec.enemyId,
      count,
      batchSize: count,
      batchGapTicks: 0,
      ...(spec.staged === true ? { staged: true } : {}),
      ...(Number.isFinite(spec.distance) ? { distance: spec.distance } : {}),
    };
  });
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
export function pickSwarmArchetype(wave, roll, roster) {
  // A roster override carries the plan's own shares — build pressure may have bent the weights,
  // a mutator may have re-timed an unlock (heavies_only fields heavies from wave 1, which the
  // plan declares with an earlier fromWave). Unknown enemy ids are still never trusted, and an
  // entry's role always comes from the canonical roster: the plan can bend shares and timing,
  // never an archetype's identity.
  const w = swarmWaveOf(Number.isInteger(wave) && wave >= 1 ? wave : 1);
  const base = Array.isArray(roster) && roster.length > 0
    ? roster.flatMap((entry) => {
        if (!entry || typeof entry.enemyId !== 'string') return [];
        const canonical = SWARM_ROSTER.find((r) => r.enemyId === entry.enemyId);
        if (!canonical) return [];
        const unlock = Number.isInteger(entry.fromWave) ? entry.fromWave : canonical.fromWave;
        if (unlock > w) return [];
        return [{ ...entry, role: canonical.role, fromWave: unlock }];
      })
    : swarmRosterFor(w);
  if (base.length === 0) return SWARM_ROSTER[0];
  let total = 0;
  const weights = base.map((entry) => {
    const fresh = w - entry.fromWave;
    const boost = fresh >= 0 && fresh < 2 ? 2.5 : 1;
    const weight = Math.max(0.001, (Number(entry.weight) || 0) * boost);
    total += weight;
    return weight;
  });
  const r = (Number.isFinite(roll) ? Math.abs(roll) % 1 : 0) * total;
  let acc = 0;
  for (let i = 0; i < base.length; i++) {
    acc += weights[i];
    if (r < acc) return base[i];
  }
  return base[base.length - 1];
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
export function swarmOpeningPackages(wave, rng, roster, bossOverride) {
  const w = swarmWaveOf(wave);
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  // The wave opens at its OPENING pressure, not its ceiling — see swarmPressureAt. Arriving at
  // pressure is what makes a wave read as a swarm rather than a scheduled encounter; arriving at
  // the ceiling leaves the wave nowhere to build to.
  const opening = swarmPressureAt(w, 0);
  const packages = [];

  // SWARM-08 B5 — an optional boss override. `undefined` keeps the ordinary cadence; `null`
  // suppresses the cadence champion outright (a Circuit survive round must not field the round-10
  // Iron Maw); a boss row uses that champion. The override is applied to the package, the
  // announcement fields and the plan block, so one round never names one boss and field another.
  const boss = bossOverride === undefined ? swarmBossFor(w) : bossOverride;
  if (boss) {
    // Every champion body carries `champion: true` all the way into the schedule, so the wave owner
    // can owe a WING as easily as it owes one Dreadnought without knowing any enemy ids.
    const wingGate = swarmGateFor(w, 0);
    bossPackagesFor(boss).forEach((pkg, index) => {
      const gateGroup = pkg.sameGate
        ? wingGate
        : pkg.gateBias === 'near'
          ? swarmGateFor(w, 0)
          : pkg.gateBias === 'far'
            ? swarmGateFor(w, 4)
            : swarmGateFor(w, index);
      packages.push({
        atTick: 0,
        gateGroup,
        role: pkg.role,
        enemyId: pkg.enemyId,
        count: pkg.count,
        batchSize: pkg.count,
        batchGapTicks: 0,
        champion: true,
        ...(Number.isFinite(pkg.distance) ? { distance: pkg.distance } : {}),
      });
    });
  }

  // Two or three arrival groups from different bearings: a swarm wave is surrounded from tick 0.
  // More bearings as the wave count climbs: at ten on you it is two doors, at thirty it is four.
  const groups = swarmOpeningGroupCount(w);
  const bossBodies = boss
    ? bossPackagesFor(boss).reduce((sum, pkg) => sum + pkg.count, 0)
    : 0;
  let left = Math.max(2, opening - bossBodies);
  for (let g = 0; g < groups && left > 0; g++) {
    const share = g === groups - 1 ? left : Math.max(1, Math.round(left / (groups - g)));
    const count = Math.min(left, share);
    left -= count;
    const archetype = pickSwarmArchetype(w, roll(), roster);
    packages.push({
      // Tight: opening groups land 12 ticks apart — the last group of a 4-group wave walks in
      // at tick 36 — so "surrounded" is the first thing the wave says, not something it works up to.
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

/**
 * The first bearing no package already uses — the debut gate. `swarmGateFor`'s stride walk can
 * revisit a gate inside a single wave (a stride sharing a factor with 8 never covers the ring),
 * so "first unused" falls back to a literal sweep of the gate list.
 */
export function swarmFreeGateFor(wave, used) {
  const taken = used instanceof Set ? used : new Set(Array.isArray(used) ? used : []);
  for (let k = 0; k < GATES.length; k++) {
    const gate = swarmGateFor(wave, k);
    if (!taken.has(gate)) return gate;
  }
  for (const gate of GATES) if (!taken.has(gate)) return gate;
  return swarmGateFor(wave, 0);
}

/** How many bearings the opening burst arrives on. */
export function swarmOpeningGroupCount(wave) {
  const w = swarmWaveOf(wave);
  return w <= 2 ? 2 : (w < 8 ? 3 : 4);
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
export function swarmPlanBlock(wave, bossOverride) {
  const w = swarmWaveOf(wave);
  const roster = swarmRosterFor(w);
  const newcomer = swarmNewcomerFor(w);
  const boss = bossOverride === undefined ? swarmBossFor(w) : bossOverride;
  // SWARM-08 B5 — boss presence follows the override when one is given, not the cadence, so a
  // Circuit survive round suppresses the cadence champion and a Circuit boss round forces its own.
  const bossWave = bossOverride === undefined ? isSwarmBossWave(w) : boss != null;
  return {
    schemaVersion: SWARM_SCHEMA_VERSION,
    wave: w,
    // Finite pressure per round. Clearing the pack earns the shop; a timer cannot award it.
    killTarget: swarmQuota(w),
    rewardReferenceKills: swarmQuota(w),
    durationTicks: SWARM_WAVE_DURATION_TICKS,
    concurrent: swarmConcurrent(w),
    openingPressure: swarmPressureAt(w, 0),
    spawnCap: SWARM_SPAWN_CAP,
    level: swarmLevel(w),
    boss: bossWave,
    // A champion must be defeated before the finite round clears.
    requireBoss: bossWave,
    bossId: boss ? boss.id : null,
    bossLabel: boss ? boss.label : null,
    bossLine: boss ? boss.line : null,
    bossRoom: boss ? boss.room : null,
    // FB-024/FB-027 — the champion's fight machinery: `bossScoreId` (a capital score the wave
    // owner hands the champion's body to when it lands) or `bossTrickId` (the hunter trick every
    // champion body telegraphs through the ordinary bounty path). Capital rows carry the former,
    // compositional rows the latter; never both.
    bossEnemyId: boss && typeof boss.enemyId === 'string' ? boss.enemyId : null,
    bossScoreId: boss && typeof boss.scoreId === 'string' ? boss.scoreId : null,
    bossTrickId: boss && typeof boss.trickId === 'string' ? boss.trickId : null,
    // The wrap pass this champion is on: 0 inside the first 140 waves, then 1, 2… each time
    // the rotation re-lands on the same base row (the label already wears the numeral).
    bossCycle: boss && Number.isInteger(boss.cycle) ? boss.cycle : 0,
    draftAfter: isSwarmDraftWave(w),
    refitAfter: isSwarmRefitWave(w),
    reinforceGapTicks: SWARM_REINFORCE_GAP_TICKS,
    reinforceBatch: SWARM_REINFORCE_BATCH,
    reinforceSurgeMax: SWARM_REINFORCE_SURGE_MAX,
    clearKills: SWARM_CLEAR_KILLS,
    breathTicks: SWARM_BREATH_TICKS,
    spawnDistance: SWARM_SPAWN_DISTANCE,
    roster: roster.map((entry) => ({
      enemyId: entry.enemyId,
      role: entry.role,
      weight: entry.weight,
      // `fromWave` rides along so a biased roster fed back into pickSwarmArchetype keeps the
      // fresh-silhouette boost honest instead of treating every entry as veteran.
      fromWave: entry.fromWave,
    })),
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
 * Duration and concurrency invariants, checkable for any wave. Kept here beside the numbers
 * rather than only in a test, so a future edit to the curve has to walk past it.
 */
export function swarmCurveIsSane(wave) {
  const w = swarmWaveOf(wave);
  const concurrent = swarmConcurrent(w);
  const opening = swarmPressureAt(w, 0);
  return swarmConcurrencyIsLegal(concurrent)
    && SWARM_WAVE_DURATION_TICKS === 3600
    && opening > 0
    && opening <= concurrent
    && swarmPressureAt(w, 1) <= concurrent;
}
