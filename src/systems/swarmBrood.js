// SWARM-07 B1+B2 — the Brood engine: 100-400 light bodies beside the ship swarm, with the
// family attack language (SWARM_EXPANSION §4 B1, §4 B2).
//
// WHY A SECOND POPULATION
// -----------------------
// Every enemy today is a full physics ship with AI, guns and a model, capped at 40 hulls. The
// genre's "swarm" means hundreds. The Brood are the other population: light bodies on a flat
// typed array, collision radii only, flocking, that feel the room and die by the room — so
// room kills scale from 3 at a time toward 40 at a time.
//
// THE ATTACK LANGUAGE (B2)
// ------------------------
// Every attack speaks BEFORE it lands and is dodgeable by construction:
//   * Spitters paint a ground marker for the whole windup, then lob an acid arc at it; the
//     splash leaves a short acid pool. Move off the marker, take nothing.
//   * Chargers draw a line for the whole windup, then dash it. Sidestep and the pass ends in
//     a rock — the same rock collision any brood dies to.
//   * Leechers latch and brake the hull until a wall scrape sheds them — a verb the pilot
//     already owns, not a timer.
// Telegraph windows are authored data (src/data/swarmBrood.js) so tests pin the dodge budget.
//
// OWNERSHIP (single-writer)
// -------------------------
//   * This engine owns state.swarmBrood and nothing else. The subtree is never saved (the save
//     plan is a fixed key list) and never enters the replay snapshot (a fixed-shape object).
//   * Brood are NOT entities. They never emit entity:killed — no reward, metric or census
//     consumer can double-count them. Kills leave as `swarm:broodKills` receipts; the chain and
//     juice owners consume those, and pay goes out through the ordinary `run:awardRequested`
//     envelope. Ship quota/concurrency semantics (swarmMode.js) are untouched.
//   * Ship-slot authority (spawnBudget) is never touched: a brood is not a ship.
//   * Player damage goes out through the routed damage owner exactly like mines do; player
//     shoves cross the SG-02 membrane as ADDITIVE impulses (queuePhysicsImpulse), never a
//     velocity write.
//
// DETERMINISM
// -----------
// No Math.random, no wall clock, no state.rng consumption (a shared-stream draw here would
// shift every other consumer's sequence and the golden hashes with it). The engine owns a
// mulberry32 stream seeded off (run seed, wave) — used ONLY at spawn; the step is a pure
// function of its buffers and state.simTime. Same seed => byte-identical positions
// tick-over-tick.
//
// PERFORMANCE
// -----------
// Every buffer is allocated once at create. The spatial hash, the rock/mover caches, the field
// sample scratch and the kill receipt scratch are all retained; a step allocates nothing. The
// renderer consumes the same retained buffers through the published view.

import { planSwarmBellowsPocket } from './swarmBellowsPocket.js';
import { foundryScoreFromPlan } from '../data/swarmFoundryScore.js';
import { planSwarmOpeningLeecher } from './swarmOpeningLeecher.js';
import { planSwarmOpeningGlassback } from './swarmOpeningGlassback.js';
import { planSwarmOpeningCyst } from './swarmOpeningCyst.js';
import { isFoundryWreckKept } from '../data/swarmFoundryWreck.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { mulberry32 } from '../core/rng.js';
import { sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { occupantGenerationOf } from '../core/entity.js';
import { physicsBodyNativeReady, queuePhysicsImpulse, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { readRecentImpulseProvenance } from '../combat/impulseKernel.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';
import { validateRunState } from '../core/runState.js';
import { SWARM_FORTIFY_SCHEMA_VERSION } from '../data/swarmFortify.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { dominoDeltaVelocity } from './swarmLegendaries.js';
import { playerTowedLure } from '../ai/towedLure.js';
import { gateBearing } from './waveMaterialization.js';
import { findSwarmArrival, swarmPilotHasActed } from './swarmSafety.js';
import { planSwarmBank, swarmBankEligible } from './swarmBank.js';
import { planSwarmOpeningVolley } from './swarmOpeningVolley.js';
import { planSwarmOpeningDodge, planSwarmOpeningSpitter } from './swarmOpeningSpitter.js';
import { planSwarmOpeningCrossfire } from './swarmOpeningCrossfire.js';
import { planSwarmOpeningWreck } from './swarmOpeningWreck.js';
import { planSwarmOpeningFlanks, SWARM_OPENING_FLANK_GATES } from './swarmOpeningFlanks.js';
import { planSwarmFortifiedFlanks } from './swarmFortifiedFlanks.js';
import {
  BROOD_CHARGER_DASH_MAX_S,
  BROOD_CHARGER_DASH_SPEED,
  BROOD_CHARGER_RANGE,
  BROOD_CHARGER_RECOVER_S,
  BROOD_CHARGER_SLAM_DAMAGE,
  BROOD_CHARGER_SHOVE_DV,
  BROOD_CHARGER_WINDUP_S,
  BROOD_DRAG_PER_S,
  BROOD_LEECHER_BRAKE_ACCEL,
  BROOD_LEECHER_LATCH_RANGE,
  BROOD_LINK_RADIUS,
  BROOD_LOB_MAX,
  BROOD_MAX_SPEED,
  BROOD_PLASMA_TYPE,
  BROOD_PLOW_MIN_MASS,
  BROOD_PLOW_MIN_SPEED,
  BROOD_SPAWN_ROCK_CLEARANCE,
  BROOD_TERRAIN_SLAM_FACTOR,
  BROOD_PLAYER_RAM_SPEED,
  BROOD_POOL_MAX,
  BROOD_QUEEN_LOOT_ID,
  BROOD_SEP_RADIUS,
  BROOD_SHED_SPEED,
  BROOD_SPITTER_COOLDOWN_S,
  BROOD_SPITTER_LOB_RANGE,
  BROOD_SPITTER_LOB_SPEED,
  BROOD_SPITTER_POOL_DPS,
  BROOD_SPITTER_POOL_RADIUS,
  BROOD_SPITTER_POOL_TTL_S,
  BROOD_SPITTER_SPLASH_DAMAGE,
  BROOD_SPITTER_SPLASH_RADIUS,
  BROOD_SPITTER_WINDUP_S,
  BROOD_WHIP_BAT_SPEED,
  BROOD_WHIP_KILL_SPEED,
  BROOD_AGGRESSION_ACCEL,
  BROOD_AGGRESSION_S,
  BROOD_CASCADE_AGGRESSION,
  BROOD_CASCADE_GRIEF,
  BROOD_CASCADE_NONE,
  BROOD_CASCADE_PANIC,
  BROOD_CASCADE_RADIUS,
  BROOD_FILAMENT_FLINCH_DV,
  BROOD_GRIEF_ACCEL,
  BROOD_GRIEF_RING,
  BROOD_GRIEF_S,
  BROOD_PANIC_KILL_MASS,
  BROOD_PANIC_KNOT_RADIUS,
  BROOD_PANIC_REFORM_ACCEL,
  BROOD_PANIC_REFORM_S,
  BROOD_PANIC_SCATTER_ACCEL,
  BROOD_PANIC_SCATTER_MAX_S,
  BROOD_PANIC_SCATTER_MIN_S,
  HIVE_POOL_TTL_S,
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_KILL_CAUSES,
  SWARM_BROOD_MAX,
  SWARM_BROOD_MIN,
  SWARM_BROOD_STATE_KEY,
  SWARM_BROOD_TENDRIL_ID,
  SWARM_HIVE_SAC_FAMILY,
  TENDRIL_HEAD_LOOT_ID,
  TENDRIL_SEG_CONTACT_COOLDOWN_S,
  TENDRIL_SEG_CONTACT_DAMAGE,
  TENDRIL_SEG_CONTACT_SHOVE_DV,
  TENDRIL_SEG_HULL,
  TENDRIL_SEG_MAX,
  TENDRIL_SEG_PAY_FAMILY,
  TENDRIL_SEG_PER_WORM,
  TENDRIL_SEG_RADIUS,
  TENDRIL_SEG_SPACING,
  TENDRIL_SEG_SPEED,
  TENDRIL_SEG_WIGGLE_BLEND,
  TENDRIL_SEG_WIGGLE_RAD_S,
  swarmBroodBossFor,
  swarmBroodKillPay,
  swarmBroodPlan,
  swarmBroodSacReserve,
} from '../data/swarmBrood.js';
import { HIVE_SAC_PERIOD_S } from './theHiveArena.js';
import { circleHitRadius, corridorHalfWidth } from '../combat/telegraphFootprint.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  SWARM_BROOD_RESERVE_DELAY_S,
  SWARM_BROOD_STRAINS,
  foldBroodLatePlan,
  swarmBroodLateFamily,
  swarmBroodLateReserve,
  swarmBroodStrainFor,
  swarmBroodStrainMark,
} from '../data/swarmBroodLate.js';
import {
  SWARM_MACHINE_FAMILIES,
  foldMachinePlan,
  swarmMachineFamily,
  swarmMachineReserveCount,
} from '../data/swarmMachine.js';

const DT = 1 / 60;
const CAP = SWARM_BROOD_MAX;
export const BROOD_ATTACK_GAP_S = 0.45;
export const BROOD_ATTACK_ARRIVAL_S = 1.25;
export const BROOD_LEECHER_STACK_MAX = 3;
const BROOD_CREDIT_WINDOW_S = 5;
// W-BLOOM-LOW leech remain: per-tick velocity keep while the glue clock is live — the body
// fights its own steering and crawls instead of dashing until the timer lets go.
const BROOD_GLUE_KEEP = 0.82;
// W-BLOOM-LOW wake eel wrap: the authored fields are the reach (wrapRange) and the coil
// (wrapS); the grip's own window and the retry delay after a release or a whiff live here.
const BROOD_WRAP_HOLD_S = 2.4;
const BROOD_WRAP_RETRY_S = 3;
export function broodAttackLimit(wave) {
  return Math.min(4, 2 + Math.floor((Math.max(1, finite(wave, 1)) - 1) / 10));
}

// family FSM phases (published; the renderer reads them for the telegraph language)
export const BROOD_PHASE_FLOCK = 0;
export const BROOD_PHASE_WINDUP = 1;
export const BROOD_PHASE_DASH = 2;
export const BROOD_PHASE_RECOVER = 3;
export const BROOD_PHASE_LATCHED = 4;
export const BROOD_PHASE_BURIED = 5;
export const BROOD_PHASE_WRAPPED = 6;

// --- spatial hash: open hashing over 16wu cells, chained lists in retained arrays -----------
const CELL = 16;
const GRID_TABLE = 4096; // power of two
const GRID_MASK = GRID_TABLE - 1;

function cellKey(cx, cz) {
  return ((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & GRID_MASK);
}

// mover/rock caches — rebuilt into retained arrays every tick, never reallocated
const ROCK_CACHE_MAX = 64;
// Handled stones keep a small independent budget when fracture debris fills terrain.
// Eight nearest handled originals supplement, never displace, the ordinary 64 rocks.
const HANDLED_ROCK_CACHE_MAX = 8;
// Selected Bank cover and the original Foundry offcut each keep one separate seat.
const ROCK_STORAGE_MAX = ROCK_CACHE_MAX + HANDLED_ROCK_CACHE_MAX + 2;
const MOVER_CACHE_MAX = 96;
// Champion mass never displaces the original hull/remain budget.
const BOSS_CHUNK_CACHE_MAX = 8;
const MOVER_STORAGE_MAX = MOVER_CACHE_MAX + BOSS_CHUNK_CACHE_MAX;

const EMPTY_FIELDS = [];

/** Deterministic per-wave stream. Same run seed + wave => same cohort and same flock. */
export function broodStreamSeed(seed, wave) {
  const label = `swarm-brood-v1|w${Math.max(1, Math.trunc(Number(wave) || 1))}`;
  let h = (Number(seed) >>> 0) ^ 0x85ebca6b;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0) || 1;
}

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

const GATE_RING = Object.freeze(['front', 'ne', 'diagonal_b', 'se', 'rear', 'sw', 'diagonal_a', 'nw']);

/**
 * Create the engine. `deps`: { bus, fieldList (provider returning the live field record array),
 * getState (returns the GameState), routeDamage (the damage owner's request seam; hazards
 * degrade to zero player damage when absent) }. All buffers are allocated here, once. The
 * published view on state.swarmBrood references the same arrays for the engine's whole life.
 */
export function createBroodEngine(deps = {}) {
  const bus = deps.bus && typeof deps.bus.emit === 'function' ? deps.bus : null;
  const fieldList = typeof deps.fieldList === 'function' ? deps.fieldList : () => EMPTY_FIELDS;
  const getState = typeof deps.getState === 'function' ? deps.getState : () => null;
  const fortifyIngress = typeof deps.fortifyIngress === 'function' ? deps.fortifyIngress : () => null;
  const openingPlacementState = typeof deps.openingPlacementState === 'function' ? deps.openingPlacementState : state => state;
  const routeDamage = typeof deps.routeDamage === 'function' ? deps.routeDamage : null;

  // body state
  const px = new Float32Array(CAP);
  const pz = new Float32Array(CAP);
  const vx = new Float32Array(CAP);
  const vz = new Float32Array(CAP);
  const heading = new Float32Array(CAP);
  const family = new Uint8Array(CAP);   // index into the family mirror
  const hp = new Float32Array(CAP);
  const creditUntil = new Float64Array(CAP);
  const attackAfter = new Float64Array(CAP);
  const alive = new Uint8Array(CAP);
  const phase = new Uint8Array(CAP);    // family FSM phase (see BROOD_PHASE_*)
  const timer = new Float32Array(CAP);  // FSM clock
  const seedPhase = new Float32Array(CAP);
  const serial = new Int32Array(CAP);
  const teleX = new Float32Array(CAP);  // windup target point (marker/line end)
  const teleZ = new Float32Array(CAP);
  const teleDir = new Float32Array(CAP); // windup bearing (the charger's line)
  // W-BLOOM-LOW authored laws: the bellows two-hit (first strike arms + starts the fuse)
  // and the lantern cyst's prime clock (inside primeRange it counts down to self-burst).
  const swellStage = new Uint8Array(CAP);
  const swellUntil = new Float64Array(CAP);
  const primeUntil = new Float64Array(CAP);
  // W-BLOOM-LOW remains: a leech body stuck to a cell pins it until this clock lets go.
  const gluedUntil = new Float64Array(CAP);
  // Hazard-grip dedupe: a hazard family's tell fires once per hold on the signature — set
  // when the drag actually bites, cleared when the body loses the signature's radius.
  const dragTold = new Uint8Array(CAP);
  // B6 — the strain mark: the ship-affix byte moved onto the brood's own buffer. 0 is
  // unmarked; 1+n indexes SWARM_BROOD_STRAINS. One honored effect per strain — volatile
  // pops where it dies (the death seam), plated refuses every cause but mass (the kill
  // gate), commander drives the pack around it (the aura below) — stamped at spawn out
  // of the wave's own mite share. The mark rides bodies the plan already budgeted,
  // never a new one.
  const affix = new Uint8Array(CAP);
  // The commander strain's pack buff, a per-tick flag: set on every body inside a
  // live leader's authored radius by the aura pass, read by the flock's own levers
  // (the dive force and the speed cap). Recomputed off the live marks each step —
  // a killed leader's pack calms the same tick.
  const commandBuff = new Uint8Array(CAP);

  // spatial hash
  const gridHead = new Int32Array(GRID_TABLE);
  const gridNext = new Int32Array(CAP);
  const gridCellX = new Int32Array(CAP);
  const gridCellZ = new Int32Array(CAP);

  // caches
  const rockEntities = new Array(ROCK_STORAGE_MAX).fill(null);
  const handledRocks = new Array(HANDLED_ROCK_CACHE_MAX).fill(null);
  const handledDistances = new Float64Array(HANDLED_ROCK_CACHE_MAX);
  const linkMoverEntities = new Array(MOVER_STORAGE_MAX).fill(null);
  let linkMassHistory = new WeakMap();
  const rockX = new Float32Array(ROCK_STORAGE_MAX);
  const rockZ = new Float32Array(ROCK_STORAGE_MAX);
  const rockR = new Float32Array(ROCK_STORAGE_MAX);
  const rockVX = new Float32Array(ROCK_STORAGE_MAX);
  const rockVZ = new Float32Array(ROCK_STORAGE_MAX);
  const rockCredited = new Uint8Array(ROCK_STORAGE_MAX);
  let rockCount = 0;
  const movX = new Float32Array(MOVER_STORAGE_MAX);
  const movZ = new Float32Array(MOVER_STORAGE_MAX);
  const movVX = new Float32Array(MOVER_STORAGE_MAX);
  const movVZ = new Float32Array(MOVER_STORAGE_MAX);
  const movMass = new Float32Array(MOVER_STORAGE_MAX);
  const movRad = new Float32Array(MOVER_STORAGE_MAX);
  const movIsPlayer = new Uint8Array(MOVER_STORAGE_MAX);
  const movIsHead = new Uint8Array(MOVER_STORAGE_MAX);
  const movCredited = new Uint8Array(MOVER_STORAGE_MAX);
  // W-BLOOM-LOW remains movers: splashRadius/glueS the moving remain carries, and its entity
  // id so combat can retire the body once the burst or the stick is spent. -1 is "no remain".
  const movRemainId = new Int32Array(MOVER_STORAGE_MAX);
  const movSplashR = new Float32Array(MOVER_STORAGE_MAX);
  const movGlueS = new Float32Array(MOVER_STORAGE_MAX);
  let movCount = 0;
  // Chunk-only observations: previously published mover behavior is unchanged.
  let bossChunkStart = 0, bossChunkResolvedTick = -1, chunkEpoch = 0;
  const chunkEntities = new Array(MOVER_STORAGE_MAX).fill(null);
  const cellObservedTick = new Float64Array(CAP);
  const cellObservedLife = new Uint32Array(CAP);
  const cellObservedX = new Float32Array(CAP), cellObservedZ = new Float32Array(CAP);
  const cellObservedVX = new Float32Array(CAP), cellObservedVZ = new Float32Array(CAP);
  const bossChunkTargetPhysical = new Uint8Array(CAP);
  const chunkFromX = new Float32Array(MOVER_STORAGE_MAX);
  const chunkFromZ = new Float32Array(MOVER_STORAGE_MAX);
  const chunkSwept = new Uint8Array(MOVER_STORAGE_MAX);
  const chunkBornTick = new Float64Array(CAP);
  let chunkHistory = new WeakMap();
  const chunkSweepFrom = { x: 0, z: 0 }, chunkSweepTo = { x: 0, z: 0 };
  let nextAttackAt = 0;
  let spawnRequested = false;
  let nextSpawnAttemptAt = 0;
  let attackClock = 0;
  let attackSlots = 0;
  let brakeDvBudget = 0;

  // --- B3: the Tendril's segment chain (see src/data/swarmBrood.js §B3) ---------------------
  //
  // Segments are light bodies like the flock but live on their own buffers: they do not
  // flock, do not attack, and do not count in the population law — they are the boss's body.
  // `segLead` is the Centipede link: SEG_LEAD_HEAD trails the champion hull, a slot index
  // trails that segment, SEG_LEAD_FREE means the link ahead died and this body now leads a
  // free chain that hunts the pilot on its own serpentine.
  const SEG_LEAD_HEAD = -1;
  const SEG_LEAD_FREE = -2;
  const segX = new Float32Array(TENDRIL_SEG_MAX);
  const segZ = new Float32Array(TENDRIL_SEG_MAX);
  const segVX = new Float32Array(TENDRIL_SEG_MAX);
  const segVZ = new Float32Array(TENDRIL_SEG_MAX);
  const segHp = new Float32Array(TENDRIL_SEG_MAX);
  const segAlive = new Uint8Array(TENDRIL_SEG_MAX);
  const segLead = new Int32Array(TENDRIL_SEG_MAX);
  const segHeading = new Float32Array(TENDRIL_SEG_MAX);
  const segSeed = new Float32Array(TENDRIL_SEG_MAX);
  const segContactT = new Float32Array(TENDRIL_SEG_MAX);
  let segAliveCount = 0;
  let tendrilMode = false;    // the live wave is the Tendril's
  let tendrilHeadSeen = false;
  let tendrilDone = false;    // the head died — the body collapsed with it
  let wormSpawned = false;    // the chain lands once per wave; dead links stay dead
  // Head discovery — the champion hull is a real entity, found by its catalog stamp.
  let headX = 0;
  let headZ = 0;
  let headVX = 0;
  let headVZ = 0;
  let headFound = false;

  // per-tick kill receipt scratch (causes fixed — SWARM_BROOD_KILL_CAUSES order)
  const CAUSE_N = SWARM_BROOD_KILL_CAUSES.length;
  const killCount = new Int32Array(CAUSE_N);
  const creditedCount = new Int32Array(CAUSE_N);
  const killCredits = new Int32Array(CAUSE_N);
  const killScore = new Int32Array(CAUSE_N);
  const killPosX = new Float32Array(CAUSE_N);
  const killPosZ = new Float32Array(CAUSE_N);
  const DIRECT_HIT_MAX = 4;
  const directHitKind = new Uint8Array(DIRECT_HIT_MAX);
  const directHitSlot = new Int32Array(DIRECT_HIT_MAX);
  const directHitLife = new Int32Array(DIRECT_HIT_MAX);
  const directHitT = new Float64Array(DIRECT_HIT_MAX);
  const directHitScratch = { ok: false, wave: 0, kind: '', slot: -1, life: 0, t: 0, x: 0, z: 0 };
  const segmentQueryBounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  // A projectile entity is the bounded lifetime identity. Weak membership prevents a reused
  // numeric id from suppressing a later projectile and lets retired projectiles collect.
  const projectileHitObjects = new WeakSet();
  let gridReady = false;
  // Row-270 Domino ledger: every CREDITED death leaves its own actual position here, in kill
  // order. The per-cause killPosX/Z sample is one coordinate per cause and cannot say where a
  // body died — Domino must radiate from each body, so each keeps a stable per-life key (the
  // spawn serial for cells, the chain slot for segments, which never respawn) and its own
  // coordinates. Retained scratch: the step allocates nothing; the emit below allocates only
  // when a flush actually has deaths, exactly like the kill receipts it rides beside.
  const deathScratch = [];
  let deathScratchCount = 0;
  function noteCreditedDeath(key, x, z) {
    let rec = deathScratch[deathScratchCount];
    if (!rec) { rec = { key: '', x: 0, z: 0 }; deathScratch[deathScratchCount] = rec; }
    rec.key = key;
    rec.x = finite(x);
    rec.z = finite(z);
    deathScratchCount += 1;
  }
  const CAUSE_INDEX = {};
  SWARM_BROOD_KILL_CAUSES.forEach((cause, i) => { CAUSE_INDEX[cause] = i; });

  // --- B-BLOOM pathology: the room notices a kill (the ladder's own numbers) --------------
  //
  // Grief — "cluster around the corpse for this long": a credited death arms every living
  // neighbor inside the cascade reach; each mourner bends toward ITS corpse until it
  // reaches the mourning ring or the clock lets go. The bend rides the ordinary flock
  // integration (semi-implicit Euler, family speed cap, windup hold), so it can never
  // outrun the room's own levers. The filament flinch — "a node's death pushes linked
  // members outward this hard" — rides the same death seam as an additive Δv, the exact
  // shape the Domino shove lands through. A Hive node's death answers through the same
  // loop (BROOD_CASCADE_EVENTS names `swarm:hiveSacKilled` a cascade seam; the arena calls
  // hiveSacFell at the corpse, the authored "a Hive node dying" trigger).
  const griefUntil = new Float64Array(CAP);
  const griefX = new Float32Array(CAP);
  const griefZ = new Float32Array(CAP);
  // Panic — "a mass kill above BROOD_PANIC_KILL_MASS inside the pack scatters it for
  // 1.5–2.5 s (fixed-seed per body), then re-forms it into a tight knot": each living
  // neighbor inside the cascade reach bolts outward from the trigger centroid for its own
  // seeded slice of the band, then converges back onto it for the reform window. The knot's
  // target is the panic centroid itself (the corpse) — the tight ball the spec promises,
  // "the best throw of the fight". The cascade REPLACES the ordinary jitter for its window
  // (the animal's own steering, never the room's fields), rides the ordinary integration
  // below — family speed cap, windup hold — and outranks grief while it is live.
  const panicUntil = new Float64Array(CAP);
  const knotUntil = new Float64Array(CAP);
  const panicX = new Float32Array(CAP);
  const panicZ = new Float32Array(CAP);
  // Aggression — "a relay or the Queen taking a hit turns every linked member on you": a hit
  // on the brood's relay node (BROOD_QUEEN_LOOT_ID, or the Tendril's head for its wave) arms
  // every living neighbor inside the cascade reach for the authored BROOD_AGGRESSION_S
  // window. Each aggravated body rushes the player at BROOD_AGGRESSION_ACCEL — the
  // grief/panic family's own wu/s² unit — and the rush target is the player's LIVE position,
  // not a stamped point: the pack tracks you for the whole window. Same law as its siblings:
  // the cascade replaces the ordinary flock jitter (never the room's fields), the attack
  // language outranks it, a live panic outranks it, and it outranks grief (mourning resumes
  // on its own clock when the rush lets go). The kind publishes on the view
  // (BROOD_CASCADE_AGGRESSION) and the arm receipts as `swarm:broodAggression`.
  const aggrUntil = new Float64Array(CAP);

  // field sampling scratch — reused for every body, every tick
  const accel = { ax: 0, az: 0 };
  const creditAccel = { ax: 0, az: 0 };
  // the Machine's steering scratch — formation/linker/salvager targets ride it
  const machineAccel = { ax: 0, az: 0 };
  // segment scratch for the beam sweep and the link-break tests — retained, never newed
  const segA = { x: 0, z: 0 };
  const segB = { x: 0, z: 0 };
  const playerFields = [];
  const posScratch = { x: 0, z: 0 };
  const velScratch = { x: 0, z: 0 };
  const fieldProfileScratch = { mass: 8, type: 'drone', team: 'brood', fieldResponseMult: 1, id: 0 };

  // lob pool (spitter acid arcs) — ballistic dots with an authored arc height
  const lobX = new Float32Array(BROOD_LOB_MAX);
  const lobZ = new Float32Array(BROOD_LOB_MAX);
  const lobVX = new Float32Array(BROOD_LOB_MAX);
  const lobVZ = new Float32Array(BROOD_LOB_MAX);
  const lobT = new Float32Array(BROOD_LOB_MAX);      // elapsed flight seconds
  const lobTotal = new Float32Array(BROOD_LOB_MAX);  // authored flight seconds
  const lobTX = new Float32Array(BROOD_LOB_MAX);     // the marked landing point
  const lobTZ = new Float32Array(BROOD_LOB_MAX);
  const lobAlive = new Uint8Array(BROOD_LOB_MAX);

  // acid pools (the splash that stays a beat)
  const poolX = new Float32Array(BROOD_POOL_MAX);
  const poolZ = new Float32Array(BROOD_POOL_MAX);
  const poolAge = new Float32Array(BROOD_POOL_MAX);
  const poolTtl = new Float32Array(BROOD_POOL_MAX);
  let poolCount = 0;
  let poolCursor = 0;
  let acidTickAcc = 0;

  // engine state
  let nextSerial = 1;
  let aliveCount = 0;
  let lobCount = 0;
  let rng = mulberry32(1);
  let pendingPlan = null;     // [{ id, count }] composed at prepare, spawned at wave start
  let liveWave = 0;
  // Transient, once per run; the ordinary plan remains the population authority.
  let bankPlayed = false;
  let bank = null;
  // Keep the selected cover life after the attack-sequencing record retires.
  let bankCover = null;
  let scrapeSurface = null;
  let spawnRequestedBankAttempted = false;
  let foundryScore = null, foundryTicks = 0, foundryLastTick = null;
  let openingVolleyAttempted = false;
  let recoveryFallback = false;
  let openingBeat = null; // three live opening lives; remainder stays in the ordinary plan
  let openingRamp = null; // bounded directional arrivals after that first decision

  // --- B4: the Hive's reserve (see src/systems/theHiveArena.js) ------------------------
  //
  // Inside the Hive, part of the wave's own planned cohort is held back: the wave opens
  // with (total - reserve) bodies and the room's spawn sacs release the rest on their
  // cadence through sacRelease(). The reserve is still the SAME plan — immediate plus
  // reserve never exceeds the population law's total; a sac killed early strands its
  // share, which is the tide the player cut.
  let hiveMode = false;
  let sacBudget = 0;
  // The tide's heartbeat: simTime of the last successful sacRelease. A live unspent sac
  // births every HIVE_SAC_PERIOD_S, so a budget that has been silent for over two full
  // cadences has no sac left to deliver it — the authored strand, not a pending tide.
  let sacLastBirthAt = -Infinity;
  // Two cadences plus a cadence of honest tick jitter: the widest silence a live sac can
  // produce is one period; anything past this is absence.
  const SAC_TIDE_SILENCE_S = HIVE_SAC_PERIOD_S * 2 + 2;
  let splitterReserve = 0;
  let motherReserve = 0;
  const birthLeft = new Uint8Array(CAP);
  const birthTold = new Uint8Array(CAP);
  let immediateQuota = Infinity;

  // --- B5: the late reserve — every non-Hive room's pressure axis --------------------
  //
  // From wave 25 the roster clock has stopped and the population sits at its ceiling, so
  // a late room fields the same solved cohort at the open and then runs dry. Non-Hive
  // arenas get the Hive's axis in miniature: prepareWave holds one small specialist
  // group back out of the SAME mite share the late fold spends (src/data/swarmBroodLate.js),
  // and step() drops it once on the wave's own clock through the same gate ring —
  // alive plus held never exceeds the planned population. Champion waves keep no
  // reserve (the picker returns null): the boss is that room's pressure story.
  let reserveFamily = null;
  let reserveBudget = 0;
  let reserveReleaseAt = Infinity;
  let reserveTold = false;

  // --- B6: the strain — the plateau's cooked fodder (swarmBroodLate.js §"The strain mark")
  //
  // From the strain gate wave, a seeded share of the wave's mite row hatches carrying
  // the wave's strain: the veteran-affix law (a marked minority carries one trick, not
  // a bigger number) on the second population. The picker deals ONE strain per wave —
  // waves 97+ alternate volatile and plated, waves 111+ deal from the whole trio as
  // the seed lands them. `strainLeft` is the wave's mark budget — any carrier-family
  // body that spawns while it holds takes the byte, at the open or born of the wave's
  // own tide. The mark is spent from the SAME plan total — it rides budgeted bodies,
  // it never mints one. A leader strain's budget is a count band, not a share — one
  // or two heads per pack, same spend.
  let strainDef = null;
  let strainMark = 0;
  let strainLeft = 0;

  // --- the Machine: the second faction's machinery (src/data/swarmMachine.js) -----------
  //
  // Machine families ride the same buffers as flesh — one flag per row, one mechanism per
  // flag. `machineReserve` is the wave's held-back rebuild budget (repairs/assembles mint
  // out of it, spent from the mite share at prepareWave like every other reserve).
  let machineReserve = 0;
  // `shielded` is a per-tick flag like commandBuff: the link pass sets it on every body a
  // live linker beams onto; kill() refuses a shielded body by ANY cause and direct hits
  // absorb into the shield — the beam is the weak point, not the partner's hull.
  const shielded = new Uint8Array(CAP);
  // `linkPartner` is the linker's charge (a body slot, -1 none); `linkBrokenUntil` is the
  // per-linker reform clock after a thrown body crosses the beam.
  const linkPartner = new Int16Array(CAP);
  const linkBrokenUntil = new Float64Array(CAP);
  const linkStartedTick = new Float64Array(CAP);
  const linkTargetLife = new Uint32Array(CAP);
  // Repair/assemble channels: the remain ENTITY being consumed (-1 none — entity ids
  // are stable across ticks, mover-cache slots are not) and the one-shot tell for the
  // channel's telegraph.
  const channelEntity = new Int32Array(CAP);
  const channelTold = new Uint8Array(CAP);
  const channelSource = new Array(CAP).fill(null);
  const channelGeneration = new Float64Array(CAP);
  // Formation squads: each formation body rides a squad anchor (-1 none); anchors are a
  // fixed pool orbiting the signature on a seeded lissajous — the Galaga weave. The peel
  // clock feeds one member at a time into the authored dive.
  const SQUAD_MAX = 12;
  const squadId = new Int16Array(CAP);
  const squadSlot = new Uint8Array(CAP);
  const squadSeed = new Float64Array(SQUAD_MAX);
  const squadPeelAt = new Float64Array(SQUAD_MAX);
  const squadCursor = new Uint8Array(SQUAD_MAX);
  const squadDefIdx = new Int16Array(SQUAD_MAX);
  let squadCount = 0;
  let formationSpawns = 0;
  // Sawblade contact cooldown: one bite per body per authored window.
  const contactAfter = new Float64Array(CAP);
  // The beam pool: live sweeps the rooted turrets own. A beam is an origin plus an arc —
  // a0→a1 walked over beamSweepS — and burns the signature once per sweep.
  const BEAM_MAX = 8;
  const beamX = new Float32Array(BEAM_MAX);
  const beamZ = new Float32Array(BEAM_MAX);
  const beamA0 = new Float32Array(BEAM_MAX);
  const beamA1 = new Float32Array(BEAM_MAX);
  const beamT = new Float32Array(BEAM_MAX);
  const beamTotal = new Float32Array(BEAM_MAX);
  const beamRange = new Float32Array(BEAM_MAX);
  // The authored reach remains intact; physical cover clips only this tick's edge.
  const beamReach = new Float32Array(BEAM_MAX);
  const beamWidth = new Float32Array(BEAM_MAX);
  const beamDamage = new Float32Array(BEAM_MAX);
  const beamAlive = new Uint8Array(BEAM_MAX);
  const beamHitPlayer = new Uint8Array(BEAM_MAX);
  const beamOwner = new Int16Array(BEAM_MAX);
  let beamCount = 0;
  // Beam FSM on the turret body: 0 cooling, 1 winding, 2 sweeping (sweep state lives in
  // the beam pool; the body's timer drives the transitions).
  const beamState = new Uint8Array(CAP);
  const beamSlotOf = new Int8Array(CAP);

  // Published machine instruments — retained arrays the presentation reads.
  const viewBeams = [];
  const viewLinks = [];
  const viewAuras = [];

  const view = {
    schema: 'spaceface.swarmBrood.v4',
    cap: CAP,
    aliveCount: 0,
    wave: 0,
    px, pz, vx, vz, heading, family, hp, alive, phase, timer, seedPhase,
    teleX, teleZ, teleDir,
    lobX, lobZ, lobT, lobTotal, lobAlive,
    lobCount: 0,
    poolX, poolZ, poolAge, poolTtl,
    poolCount: 0,
    // B3 — the Tendril's body. The champion hull is a real entity; this is the chain it
    // drags: segLead === SEG_LEAD_HEAD trails the head, a slot index trails that segment,
    // SEG_LEAD_FREE is a split body hunting on its own (presentation tints it hungrier).
    tendril: false,
    segAliveCount: 0,
    segX, segZ, segVX, segVZ, segHeading, segAlive, segLead,
    segLeadHead: SEG_LEAD_HEAD,
    segLeadFree: SEG_LEAD_FREE,
    segRadius: TENDRIL_SEG_RADIUS,
    // B4 — the Hive's reserve. `sacBudget` is the bodies the room's sacs still hold;
    // aliveCount + sacBudget stays inside the wave's planned population.
    hive: false,
    sacBudget: 0,
    // B5 — the late reserve: the specialist family still held and how many bodies.
    reserveFamily: null,
    reserveBudget: 0,
    // B6 — the strain: the wave's mark id and the per-slot mark bytes the renderer
    // tints by. `strain` is null on clean waves; `affix` is 0 on unmarked bodies.
    strain: null,
    affix,
    // The Machine's instruments: live beam sweeps ({x,z,a0,a1,t,total,range,width,state}),
    // live shield links ({x1,z1,x2,z2}), and magnet auras ({x,z,r}). Retained arrays —
    // the renderer reads length, never allocates.
    beams: viewBeams,
    links: viewLinks,
    auras: viewAuras,
    shielded,
    machineReserve: 0,
  };

  // --- family table mirror (numeric fields the hot loop reads, rebuilt on demand) ----------

  // Sized from the authored roster, not a fixed capacity: every family the catalog can
  // field must fit the mirror, or spawnWave silently drops its planned allocation.
  const BROOD_FAMILY_DEFS = SWARM_BROOD_FAMILIES.concat(SWARM_BROOD_LATE_FAMILIES, SWARM_MACHINE_FAMILIES);
  const FAMILY_SLOT_MAX = Math.max(8, BROOD_FAMILY_DEFS.length);
  const liveFamilyId = new Array(FAMILY_SLOT_MAX).fill(null);
  const liveFamilyDef = new Array(FAMILY_SLOT_MAX).fill(null);
  const liveFamilyRadius = new Float32Array(FAMILY_SLOT_MAX);
  const liveFamilyMass = new Float32Array(FAMILY_SLOT_MAX);
  const liveFamilyHull = new Float32Array(FAMILY_SLOT_MAX);
  const liveFamilySpeed = new Float32Array(FAMILY_SLOT_MAX);
  let liveFamilyCount = 0;
  let maxLiveFamilyRadius = 0;
  let maxLiveFamilySpeed = 0;
  let gridMaxSpeed = 0;

  function setFamilyMirror(defs) {
    liveFamilyCount = 0;
    maxLiveFamilyRadius = 0;
    maxLiveFamilySpeed = 0;
    for (let i = 0; i < Math.min(defs.length, FAMILY_SLOT_MAX); i++) {
      const def = defs[i];
      liveFamilyId[liveFamilyCount] = def.id;
      liveFamilyDef[liveFamilyCount] = def;
      liveFamilyRadius[liveFamilyCount] = def.radius;
      liveFamilyMass[liveFamilyCount] = def.mass;
      liveFamilyHull[liveFamilyCount] = def.hull;
      liveFamilySpeed[liveFamilyCount] = def.speed;
      maxLiveFamilyRadius = Math.max(maxLiveFamilyRadius, def.radius, finite(def.magnetRadius));
      maxLiveFamilySpeed = Math.max(maxLiveFamilySpeed, def.speed, BROOD_MAX_SPEED, BROOD_CHARGER_DASH_SPEED);
      liveFamilyCount += 1;
    }
  }

  function buildFamilyIndex() {
    const map = new Map();
    for (let i = 0; i < liveFamilyCount; i++) map.set(liveFamilyId[i], i);
    return map;
  }

  const killPayCache = new Map();
  function killPayFor(familyIdStr) {
    let pay = killPayCache.get(familyIdStr);
    if (pay) return pay;
    pay = swarmBroodKillPay(familyIdStr);
    // The base table pays {0,0} for an id it does not know. Late and machine families
    // carry their own pay.
    if (!pay || (pay.credits === 0 && pay.score === 0)) {
      const late = swarmBroodLateFamily(familyIdStr) || swarmMachineFamily(familyIdStr);
      if (late) pay = { credits: late.credits, score: late.score };
    }
    killPayCache.set(familyIdStr, pay);
    return pay;
  }

  // --- lifecycle --------------------------------------------------------------------------

  function clear(reason = 'clear') {
    chunkEpoch++;
    chunkHistory = new WeakMap();
    linkMassHistory = new WeakMap();
    bossChunkResolvedTick = -1;
    bossChunkTargetPhysical.fill(0);
    cellObservedTick.fill(-1);
    chunkBornTick.fill(Infinity);
    if (reason === 'new_game' || reason === 'run_ended') bankPlayed = false;
    bank = null; bankCover = null; scrapeSurface = null;
    spawnRequestedBankAttempted = false;
    foundryScore = null; foundryTicks = 0; foundryLastTick = null;
    openingVolleyAttempted = false; recoveryFallback = false;
    openingBeat = null;
    openingRamp = null;
    if (aliveCount > 0) { alive.fill(0); affix.fill(0); }
    aliveCount = 0;
    creditUntil.fill(0);
    gluedUntil.fill(0);
    dragTold.fill(0);
    nextAttackAt = 0;
    spawnRequested = false;
    nextSpawnAttemptAt = 0;
    attackSlots = 0;
    brakeDvBudget = 0;
    pendingPlan = null;
    if (lobCount > 0) { lobAlive.fill(0); lobCount = 0; }
    poolCount = 0;
    acidTickAcc = 0;
    if (segAliveCount > 0) segAlive.fill(0);
    segAliveCount = 0;
    segLead.fill(0);
    segContactT.fill(0);
    tendrilMode = false;
    tendrilHeadSeen = false;
    tendrilDone = false;
    wormSpawned = false;
    headFound = false;
    hiveMode = false;
    sacBudget = 0;
    sacLastBirthAt = -Infinity;
    griefUntil.fill(0);
    panicUntil.fill(0);
    knotUntil.fill(0);
    aggrUntil.fill(0);
    splitterReserve = 0;
    motherReserve = 0;
    birthLeft.fill(0);
    birthTold.fill(0);
    immediateQuota = Infinity;
    reserveFamily = null;
    reserveBudget = 0;
    reserveReleaseAt = Infinity;
    reserveTold = false;
    strainDef = null;
    strainMark = 0;
    strainLeft = 0;
    commandBuff.fill(0);
    // The Machine's wave state dies with the room — every link, channel, squad and beam.
    machineReserve = 0;
    shielded.fill(0);
    linkPartner.fill(-1);
    linkBrokenUntil.fill(0);
    linkStartedTick.fill(Infinity);
    linkTargetLife.fill(0);
    channelEntity.fill(-1);
    channelTold.fill(0);
    channelSource.fill(null);
    channelGeneration.fill(0);
    squadId.fill(-1);
    squadSlot.fill(0);
    squadCount = 0;
    formationSpawns = 0;
    contactAfter.fill(0);
    beamAlive.fill(0);
    beamState.fill(0);
    beamSlotOf.fill(-1);
    beamCount = 0;
    viewBeams.length = 0;
    viewLinks.length = 0;
    viewAuras.length = 0;
    gridReady = false;
    // The Domino ledger dies with the room: an unflushed death must never shove in the next one.
    deathScratchCount = 0;
    publish();
    void reason;
  }

  /** Plan the wave's cohort. Called at run:wavePlanned; spawning happens at wave start. */
  function prepareWave(run, wave, wavePlan = null) {
    const seed = finite(run && run.seed, 1);
    const w = Math.max(1, Math.trunc(Number(wave) || 1));
    clear('wave_planned');
    foundryScore = foundryScoreFromPlan(wavePlan, w);
    rng = mulberry32(broodStreamSeed(seed, w));
    // Late families replace mites. They do not add a second population on top of the plan.
    // The Machine folds last — the second faction spends out of what the late fold left.
    pendingPlan = foldMachinePlan(foldBroodLatePlan(swarmBroodPlan(w, rng), w), w);
    // The Tendril's wave arms the body: the engine waits for the champion hull to materialize
    // (a real entity, stamped by its catalog id) and trails the chain behind it.
    tendrilMode = swarmBroodBossFor(w) === SWARM_BROOD_TENDRIL_ID;
    // B4 — the Hive holds a share of its own cohort in the sacs. The reserve is part of
    // the SAME plan total: spawnWave delivers the rest at the wave's open.
    let planned = 0;
    for (const part of pendingPlan) planned += Number.isInteger(part.count) ? part.count : 0;
    sacBudget = swarmBroodSacReserve(planned, run && run.arenaId);
    hiveMode = sacBudget > 0;
    // A fresh tide is deliverable from install: its sacs' first births are due one period out.
    sacLastBirthAt = finite(getState()?.simTime);
    immediateQuota = planned - sacBudget;
    // Plan only the immediate share here. Deferred geometry never consumes the Hive reserve.
    let immediateLeft = immediateQuota;
    pendingPlan = pendingPlan.map(part => {
      const count = Math.min(part.count, immediateLeft);
      immediateLeft -= count;
      return { ...part, count };
    }).filter(part => part.count > 0);
    // A splits-carrying body's death becomes three mites. Two of those bodies are held
    // back from the mite share now, so the split spends the wave's own budget and the
    // total never grows. The hold-back keys on the `splits` flag, not the family id:
    // every splits family the wave fields funds its children the same way.
    splitterReserve = 0;
    for (const part of pendingPlan) {
      const splitDef = liveFamilyDef[familyIndexOf(part.id)];
      if (!splitDef || !splitDef.splits || part.count <= 0) continue;
      const miteRow = pendingPlan.find((row) => row.id === 'mite');
      const room = miteRow ? Math.max(0, miteRow.count - 1) : 0;
      const take = Math.min(part.count * 2, room);
      if (miteRow && take > 0) miteRow.count -= take;
      splitterReserve += take;
    }
    pendingPlan = pendingPlan.filter((part) => part.count > 0);
    // The mother's mite tide is the same kind of reserve: bodies held back from the plan,
    // released on her cadence, and dropped when she dies. It is not a Hive sac. The
    // hold-back keys on the `births` flag, not the family id — each births family in the
    // plan funds its tide out of the mite share, per its own authored `birthBudget`.
    motherReserve = 0;
    for (const part of pendingPlan) {
      const birthDef = liveFamilyDef[familyIndexOf(part.id)];
      if (!birthDef || !birthDef.births || part.count <= 0) continue;
      const miteRow = pendingPlan.find((row) => row.id === 'mite');
      const room = miteRow ? Math.max(0, miteRow.count - 1) : 0;
      const per = birthDef.birthBudget > 0 ? Math.trunc(birthDef.birthBudget) : 12;
      const take = Math.min(part.count * per, room);
      if (miteRow && take > 0) miteRow.count -= take;
      motherReserve += take;
    }
    pendingPlan = pendingPlan.filter((part) => part.count > 0);
    // The Machine's rebuild budget is the same kind of reserve: bodies held back from the
    // mite share now, minted by repair/assemble channels later, stranded if the builders
    // die first. The hold-back keys on the flags, not the family ids — every repairs or
    // assembles body the wave fields funds its work out of the same law the splitters
    // and mothers keep.
    {
      const want = swarmMachineReserveCount(pendingPlan);
      const miteRow = pendingPlan.find((row) => row.id === 'mite');
      const room = miteRow ? Math.max(0, miteRow.count - 1) : 0;
      machineReserve = Math.min(want, room);
      if (miteRow && machineReserve > 0) {
        miteRow.count -= machineReserve;
        pendingPlan = pendingPlan.filter((part) => part.count > 0);
      }
    }
    // B5 — a late non-Hive wave holds back one small specialist group for a mid-wave
    // drop. The Hive keeps its own sac tide instead (hiveMode), and champion waves are
    // exempt inside the picker — so this never touches the Hive's or a boss's plan.
    // The spend is the same law foldBroodLatePlan uses: out of the mite share, at
    // least one mite left standing, the plan total unchanged.
    reserveFamily = null;
    reserveBudget = 0;
    reserveReleaseAt = Infinity;
    reserveTold = false;
    if (!hiveMode) {
      const pick = swarmBroodLateReserve(w, rng);
      if (pick) {
        const miteRow = pendingPlan.find((part) => part.id === 'mite');
        const room = miteRow ? Math.max(0, miteRow.count - 1) : 0;
        const take = Math.min(pick.count, room);
        if (miteRow && take > 0) {
          miteRow.count -= take;
          pendingPlan = pendingPlan.filter((part) => part.count > 0);
          reserveFamily = pick.familyId;
          reserveBudget = take;
        }
      }
    }
    // B6 — the strain marks a seeded share of the wave's mite row, AFTER every
    // hold-back has spent out of it, so the share counts the fodder that actually
    // fields. The marks ride budgeted bodies: population law untouched.
    {
      const miteRow = pendingPlan.find((part) => part.id === 'mite');
      const pick = swarmBroodStrainFor(w, miteRow ? miteRow.count : 0, rng);
      if (pick) {
        strainDef = pick.strain;
        strainMark = swarmBroodStrainMark(pick.strain.id);
        strainLeft = pick.count;
      }
    }
    liveWave = w;
    view.wave = liveWave;
    view.tendril = tendrilMode;
    publish();
  }

  /** Fill the planned cohort around the player anchor, in clumps on the wave's gate ring. */
  function validateOpeningCourse(state) {
    const course = openingRamp?.course;
    if (!course) return;
    const player = state?.entities?.get?.(state.playerId);
    // Retire on an observed departure, even if the pilot returns before a packet.
    if (course.player !== player || !player?.alive || !Number.isFinite(player.pos?.x)
      || !Number.isFinite(player.pos?.z) || Math.hypot(player.pos.x - course.x, player.pos.z - course.z) > 120) openingRamp.course = null;
  }

  function openingBeatHasLives() {
    return openingBeat?.lives.some(({ slot, life }) => alive[slot] && serial[slot] === life);
  }

  function spawnWave(state) {
    if (!pendingPlan || pendingPlan.length === 0) return 0;
    validateOpeningCourse(state);
    if (openingBeat && (state.mode !== 'flight' || liveSwarmRun(state)?.phase !== 'active' ||
      (openingBeat.remaining > 0 && openingBeatHasLives()))) return 0;
    openingBeat = null;
    if (openingRamp && (state.mode !== 'flight' || liveSwarmRun(state)?.phase !== 'active' || openingRamp.remaining > 1e-8)) return 0;
    cacheRocks(state);
    spawnRequested = true; // the arena owns the initial lesson release; retries cannot bypass it
    // An interrupted continuation retains this request for the existing flight
    // tick. Pausing during stone publication cannot admit the opening cohort.
    if ((liveWave === 3 || liveWave === 4) && state?.mode !== 'flight') return 0;
    const now = finite(state?.simTime);
    nextSpawnAttemptAt = now + 0.5;
    const player = state?.entities?.get?.(state.playerId);
    const ax = finite(player?.pos?.x), az = finite(player?.pos?.z);
    const familyIndex = buildFamilyIndex();
    // Let the guard pair speak before the second new shape. This clock counts
    // active pilot play; waiting in the room cannot spend the Cyst's approach.
    const lessonAtTick = foundryScore?.bellowsAtTick ?? foundryScore?.glassbackAtTick ?? foundryScore?.leecherAtTick ?? foundryScore?.cystAtTick;
    if (!openingVolleyAttempted && lessonAtTick > foundryTicks) {
      // Approach the authored edge without spending another half-second poll.
      // The Cyst's full six-second read must finish before the ship crowd at840.
      nextSpawnAttemptAt = Math.min(nextSpawnAttemptAt,
        now + Math.max(0, lessonAtTick - foundryTicks - 1) * DT);
      return 0;
    }
    // Round two uses the surviving court, not an invisible ring following the pilot.
    // Check only on the first admission attempt; a missing court keeps normal arrivals.
    if (!openingVolleyAttempted) {
      if (foundryScore) openingRamp = { remaining: 0, lastTick: state.tick, group: 0, course: null };
      const mite = familyIndex.get('mite');
      const wreck = foundryScore && mite != null ? planSwarmOpeningWreck(
        state, state.run, liveWave, pendingPlan, liveFamilyRadius[mite]) : null;
      // A living wreck scene must not walk into an unattended pilot for free kills.
      // Admit it on actual input, then keep all ordinary motion and damage laws.
      if (wreck && !swarmPilotHasActed(state)) { nextSpawnAttemptAt = 0; return 0; }
      const fortified = foundryScore && mite != null ? planSwarmFortifiedFlanks(
        state, state.run, liveWave, pendingPlan, liveFamilyRadius[mite], fortifyIngress()) : null;
      // Do not let invulnerable idle packs walk through a paid line before it may fire.
      if (fortified && !swarmPilotHasActed(state)) return 0;
      const course = fortified || (mite == null ? null : planSwarmOpeningFlanks(
        state, state.run, liveWave, pendingPlan, liveFamilyRadius[mite]));
      if (course) openingRamp = { remaining: 0, lastTick: state.tick, group: 0,
        course, gates: course.gates || SWARM_OPENING_FLANK_GATES };
    }
    const deferred = [];
    let spawned = 0, groupIndex = openingRamp?.group || 0;
    let arrivalBudget = openingRamp ? (foundryScore?.broodPacketSize || 18) : Infinity;
    const packReserved = openingRamp ? [] : null;
    if (packReserved) for (let i = 0; i < CAP; i++) if (alive[i]) {
      packReserved.push({ alive: true, pos: { x: px[i], z: pz[i] }, radius: liveFamilyRadius[family[i]] });
    }
    if (openingRamp) openingRamp.remaining = foundryScore?.broodPacketGapS || 0.75;
    // The first released pack presents a real throwing lane beyond one existing
    // pocket pebble. Spend the usual mite plan; a blocked or used-up court falls
    // through to ordinary arrivals, never teleports props or delays the round.
    if (!openingVolleyAttempted) {
      openingVolleyAttempted = true;
      const bellows = familyIndex.get('bellows'), bellMite = familyIndex.get('mite');
      const bellScene = foundryScore?.bellowsAtTick != null && bellows != null && bellMite != null
        ? planSwarmBellowsPocket(state, state.run, liveWave, pendingPlan,
          liveFamilyRadius[bellows], liveFamilyRadius[bellMite]) : null;
      const bellSlots = [];
      for (let i = 0; bellScene && i < CAP && bellSlots.length < 4; i++) if (!alive[i]) bellSlots.push(i);
      if (bellScene && bellSlots.length === 4) {
        spawnAt(bellSlots[0], bellows, bellScene.bellows.x, bellScene.bellows.z);
        for (let i = 1; i < 4; i++) spawnAt(bellSlots[i], bellMite, bellScene.mites[i - 1].x, bellScene.mites[i - 1].z);
        pendingPlan.find(part => part.id === 'bellows').count -= 1;
        pendingPlan.find(part => part.id === 'mite').count -= 3;
        assignMotherShares(); publish(); return 4;
      }
      // No suitable bank: an otherwise empty lesson resumes bounded arrivals.
      // The Kraken still owns its full read when its optional pocket is missing.
      if (foundryScore?.bellowsAtTick != null) recoveryFallback = !foundryScore.characterForeground;
      const glassback = familyIndex.get('glassback');
      const shell = foundryScore?.glassbackAtTick != null && glassback != null
        ? planSwarmOpeningGlassback(state, state.run, liveWave, pendingPlan, liveFamilyRadius[glassback]) : null;
      const shellSlot = shell ? findFreeSlot() : -1;
      if (shell && shellSlot >= 0) {
        spawnAt(shellSlot, glassback, shell.pos.x, shell.pos.z);
        pendingPlan.find(part => part.id === 'glassback').count -= 1;
        assignMotherShares(); publish(); return 1;
      }
      if (foundryScore?.glassbackAtTick != null) recoveryFallback = !foundryScore.characterForeground;
      const leecher = familyIndex.get('leecher');
      const scrape = foundryScore?.leecherAtTick != null && leecher != null
        ? planSwarmOpeningLeecher(state, state.run, liveWave, pendingPlan, liveFamilyRadius[leecher]) : null;
      const leechSlot = scrape ? findFreeSlot() : -1;
      if (scrape && leechSlot >= 0) {
        spawnAt(leechSlot, leecher, scrape.pos.x, scrape.pos.z);
        const surface = state.entities?.get?.(scrape.rockId);
        scrapeSurface = surface ? { entity: surface, generation: surface.occupantGeneration, wave: liveWave } : null;
        pendingPlan.find(part => part.id === 'leecher').count -= 1;
        // Only the ordinary owed life enters. Its real latch, braking and rock
        // scrape own the outcome; the scored reserve clock owns the next pressure.
        assignMotherShares(); publish(); return 1;
      }
      // With no ship foreground, a missing surface must not leave an empty room.
      // Ghost/Cutter still need their read even when their optional terrain is gone.
      if (foundryScore?.leecherAtTick != null) recoveryFallback = !foundryScore.characterForeground;
      const cyst = familyIndex.get('lantern_cyst'), cystMite = familyIndex.get('mite');
      const cystScene = foundryScore?.id === 'break_the_guard' && cyst != null && cystMite != null
        ? planSwarmOpeningCyst(state, state.run, liveWave, pendingPlan,
          liveFamilyRadius[cyst], liveFamilyRadius[cystMite]) : null;
      const cystSlots = [];
      for (let i = 0; cystScene && i < CAP && cystSlots.length < 4; i++) if (!alive[i]) cystSlots.push(i);
      if (cystScene && cystSlots.length === 4) {
        spawnAt(cystSlots[0], cyst, cystScene.cyst.x, cystScene.cyst.z);
        for (let i = 1; i < 4; i++) spawnAt(cystSlots[i], cystMite, cystScene.mites[i - 1].x, cystScene.mites[i - 1].z);
        pendingPlan.find(part => part.id === 'lantern_cyst').count -= 1;
        pendingPlan.find(part => part.id === 'mite').count -= 3;
        openingBeat = { remaining: 6, lastTick: state.tick,
          lives: cystSlots.map(slot => ({ slot, life: serial[slot] })) };
        openingRamp = { remaining: 0, lastTick: state.tick, group: 0, course: cystScene.course };
        assignMotherShares(); publish(); return 4;
      }
      const openingState = liveWave === 3 || liveWave === 4 ? openingPlacementState(state) : state;
      const spitter = familyIndex.get('spitter');
      const mixedMite = familyIndex.get('mite');
      const mixed = mixedMite == null || spitter == null ? null : planSwarmOpeningCrossfire(
        openingState, state.run, liveWave, pendingPlan, liveFamilyRadius[mixedMite], liveFamilyRadius[spitter]);
      const mixedSlots = [];
      for (let i = 0; mixed && i < CAP && mixedSlots.length < 4; i++) if (!alive[i]) mixedSlots.push(i);
      if (mixed && mixedSlots.length === 4) {
        for (let i = 0; i < 3; i++) spawnAt(mixedSlots[i], mixedMite, mixed.mites[i].x, mixed.mites[i].z);
        spawnAt(mixedSlots[3], spitter, mixed.spitter.x, mixed.spitter.z);
        pendingPlan.find(part => part.id === 'mite').count -= 3;
        pendingPlan.find(part => part.id === 'spitter').count -= 1;
        openingBeat = { remaining: 6, lastTick: state.tick, attackPending: true,
          standOff: { slot: mixedSlots[3], life: serial[mixedSlots[3]] },
          lives: mixedSlots.map(slot => ({ slot, life: serial[slot] })) };
        attackAfter[mixedSlots[3]] = Infinity;
        openingRamp = { remaining: 0, lastTick: state.tick, group: 0, course: { ...mixed.course, player: state.entities.get(state…33857 tokens truncated…    }
      }
    } else {
      for (let i = 0; i < CAP; i++) {
        if (!alive[i] || !(hp[i] > 0) || !directDamageAllowed(i)) continue;
        const hitT = segmentCircleT(from, to, px[i], pz[i], directRadiusFor(i) + radius);
        if (hitT == null || !directCandidateBefore(hitT, 0, serial[i], bestT, bestKind, bestLife)) continue;
        bestT = hitT; bestKind = 0; bestSlot = i; bestLife = serial[i];
      }
    }
    for (let i = 0; i < TENDRIL_SEG_MAX; i++) {
      if (!segAlive[i] || !(segHp[i] > 0)) continue;
      const hitT = segmentCircleT(from, to, segX[i], segZ[i], TENDRIL_SEG_RADIUS + radius);
      if (hitT == null || !directCandidateBefore(hitT, 1, i, bestT, bestKind, bestLife)) continue;
      bestT = hitT; bestKind = 1; bestSlot = i; bestLife = liveWave;
    }
    if (bestSlot < 0) return null;
    out.ok = true;
    out.wave = liveWave;
    out.kind = bestKind === 0 ? 'cell' : 'segment';
    out.slot = bestSlot;
    out.life = bestLife;
    out.t = bestT;
    out.x = from.x + (to.x - from.x) * bestT;
    out.z = from.z + (to.z - from.z) * bestT;
    return out;
  }

  function collectSegmentHits(from, to, queryRadius, limit) {
    let count = 0;
    const radius = Math.max(0, finite(queryRadius));
    setSegmentQueryBounds(from, to, radius);
    const bounds = segmentQueryBounds;
    for (let gx = bounds.minX; gx <= bounds.maxX; gx++) {
      for (let gz = bounds.minZ; gz <= bounds.maxZ; gz++) {
        for (let slot = gridReady ? gridHead[cellKey(gx, gz)] : -1; slot !== -1; slot = gridNext[slot]) {
          if (gridCellX[slot] !== gx || gridCellZ[slot] !== gz || !alive[slot] || !(hp[slot] > 0) || !directDamageAllowed(slot)) continue;
          count = insertDirectCandidate(from, to, radius, limit, count, 0, slot, serial[slot]);
        }
      }
    }
    if (!gridReady) {
      for (let slot = 0; slot < CAP; slot++) {
        if (!alive[slot] || !(hp[slot] > 0) || !directDamageAllowed(slot)) continue;
        count = insertDirectCandidate(from, to, radius, limit, count, 0, slot, serial[slot]);
      }
    }
    for (let slot = 0; slot < TENDRIL_SEG_MAX; slot++) {
      if (!segAlive[slot] || !(segHp[slot] > 0)) continue;
      count = insertDirectCandidate(from, to, radius, limit, count, 1, slot, liveWave);
    }
    return count;
  }

  function insertDirectCandidate(from, to, radius, limit, count, kind, slot, life) {
    const x = kind === 0 ? px[slot] : segX[slot];
    const z = kind === 0 ? pz[slot] : segZ[slot];
    const bodyRadius = kind === 0 ? directRadiusFor(slot) : TENDRIL_SEG_RADIUS;
    const t = segmentCircleT(from, to, x, z, bodyRadius + radius);
    if (t == null) return count;
    let at = count;
    if (count === limit) {
      const last = count - 1;
      if (!directCandidateBefore(t, kind, life, directHitT[last], directHitKind[last], directHitLife[last])) return count;
      at = last;
    } else count++;
    while (at > 0 && directCandidateBefore(t, kind, life,
      directHitT[at - 1], directHitKind[at - 1], directHitLife[at - 1])) {
      directHitT[at] = directHitT[at - 1];
      directHitKind[at] = directHitKind[at - 1];
      directHitSlot[at] = directHitSlot[at - 1];
      directHitLife[at] = directHitLife[at - 1];
      at--;
    }
    directHitT[at] = t;
    directHitKind[at] = kind;
    directHitSlot[at] = slot;
    directHitLife[at] = life;
    return count;
  }

  function setSegmentQueryBounds(from, to, radius) {
    const reach = Math.max(0, radius) + maxLiveFamilyRadius + Math.max(maxLiveFamilySpeed, gridMaxSpeed) * DT;
    segmentQueryBounds.minX = Math.floor((Math.min(from.x, to.x) - reach) / CELL);
    segmentQueryBounds.minZ = Math.floor((Math.min(from.z, to.z) - reach) / CELL);
    segmentQueryBounds.maxX = Math.floor((Math.max(from.x, to.x) + reach) / CELL);
    segmentQueryBounds.maxZ = Math.floor((Math.max(from.z, to.z) + reach) / CELL);
  }

  function directDamageAllowed(slot) {
    return killLawAllows(liveFamilyDef[family[slot]], 'direct') && !markRefuses(slot, 'direct');
  }

  function candidateIsLive(candidate) {
    if (candidate.kind === 'cell') return alive[candidate.slot] === 1 && serial[candidate.slot] === candidate.life
      && directDamageAllowed(candidate.slot);
    return candidate.kind === 'segment' && candidate.wave === liveWave
      && segAlive[candidate.slot] === 1 && candidate.life === liveWave;
  }

  function applyDirectHit(candidate, amount, credited) {
    if (!candidateIsLive(candidate)) return { ok: false, reason: 'stale_brood_life' };
    const cells = candidate.kind === 'cell';
    const slot = candidate.slot;
    const before = cells ? hp[slot] : segHp[slot];
    // The linker's shield eats the shot whole — the projectile commits on the charge and
    // dies there, so the link reads as a wall the beam draws, not a miss the hull dodges.
    if (cells && shielded[slot]) {
      if (bus) bus.emit('swarm:broodShielded', {
        wave: liveWave, targetId: candidateId(candidate), pos: { x: candidate.x, z: candidate.z },
      });
      return { ok: true, damage: 0, hullBefore: before, hullAfter: before, killed: false };
    }
    const after = Math.max(0, before - amount);
    if (cells) {
      hp[slot] = after;
      if (after <= 0) {
        kill(slot, 'direct', candidate.x, candidate.z, credited);
        // A swelling cell survives its first strike as an authored fuse, not a zero-health ghost.
        if (alive[slot] && hp[slot] <= 0) hp[slot] = 1;
      }
    } else {
      segHp[slot] = after;
      if (after <= 0) killSeg(slot, 'direct', candidate.x, candidate.z, credited);
    }
    const remainsAlive = cells ? alive[slot] === 1 : segAlive[slot] === 1;
    return { ok: true, damage: before - (cells ? hp[slot] : segHp[slot]), hullBefore: before,
      hullAfter: cells ? hp[slot] : segHp[slot], killed: !remainsAlive };
  }

  function isCreditedDirectSource(ownerId, state) {
    if (ownerId === state.playerId) return true;
    const owner = state.entities?.get?.(ownerId);
    const mark = owner?.data?.swarmFortify;
    const run = liveSwarmRun(state);
    const validBase = !!run && owner?.alive === true && owner.hull > 0 && owner.ownerId === state.playerId
      && owner.type === 'beacon' && mark?.schemaVersion === SWARM_FORTIFY_SCHEMA_VERSION
      && Number.isInteger(mark.runWave) && mark.runWave > 0 && mark.runWave <= run.wave
      && Number.isInteger(mark.runToken) && mark.runToken > 0
      && mark.operational === true && mark.offline !== true;
    if (!validBase) return false;
    if (mark.deviceId === 'kinetic_turret') return true;
    if (mark.deviceId !== 'tesla_pair' || typeof mark.pairId !== 'string' || mark.pairId.length === 0
      || (mark.endpointIndex !== 0 && mark.endpointIndex !== 1)) return false;
    const otherIndex = 1 - mark.endpointIndex;
    for (const endpoint of state.entityList || []) {
      const other = endpoint?.data?.swarmFortify;
      if (endpoint === owner || endpoint?.alive !== true || !(endpoint.hull > 0)
        || endpoint.type !== 'beacon' || endpoint.ownerId !== state.playerId
        || other?.schemaVersion !== SWARM_FORTIFY_SCHEMA_VERSION || other.deviceId !== 'tesla_pair'
        || other.runToken !== mark.runToken || !Number.isInteger(other.runWave)
        || other.runWave < 1 || other.runWave > run.wave || other.operational !== true
        || other.offline === true || other.pairId !== mark.pairId || other.endpointIndex !== otherIndex) continue;
      return true;
    }
    return false;
  }

  function candidateId(candidate) {
    return candidate.kind === 'cell' ? `cell:${candidate.life}` : `segment:${candidate.slot}`;
  }

  function onExplosion(payload) {
    const state = getState();
    const run = liveSwarmRun(state);
    if (!run || run.phase !== 'active' || state.mode !== 'flight') return;
    const actor = payload?.ownerId ?? payload?.killerId ?? payload?.provenance?.actorId;
    const credited = state.playerId != null && actor === state.playerId;
    if (!payload || (aliveCount <= 0 && segAliveCount <= 0)) return;
    const ex = finite(payload.pos && payload.pos.x, NaN);
    const ez = finite(payload.pos && payload.pos.z, NaN);
    const radius = finite(payload.radius, NaN);
    if (!Number.isFinite(ex) || !Number.isFinite(ez) || !(radius > 0)) return;
    const killR = radius * 1.05;
    const killR2 = killR * killR;
    const shoveR = radius * 1.6;
    const shoveR2 = shoveR * shoveR;
    killCount.fill(0);
    creditedCount.fill(0);
    killCredits.fill(0);
    killScore.fill(0);
    deathScratchCount = 0;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const dx = px[i] - ex;
      const dz = pz[i] - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 > shoveR2) continue;
      // B6 — a mark that refuses the blast (plated's massOnly) skips the kill branch
      // but not the throw: the detonation scatters what it cannot crack. Family gates
      // (the keelback's own massOnly) keep the old full-pass — their mass reads the
      // blast the way the family's card taught it.
      if (d2 <= killR2 && !markRefuses(i, 'explosive')) {
        kill(i, 'explosive', ex, ez, credited || creditUntil[i] > finite(state.simTime));
        continue;
      }
      const d = Math.sqrt(d2) || 1;
      const falloff = 1 - d / shoveR;
      vx[i] += (dx / d) * falloff * 90;
      vz[i] += (dz / d) * falloff * 90;
      if (credited) creditUntil[i] = finite(state.simTime) + BROOD_CREDIT_WINDOW_S;
    }
    for (let i = 0; i < TENDRIL_SEG_MAX; i++) {
      if (!segAlive[i]) continue;
      const dx = segX[i] - ex;
      const dz = segZ[i] - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 <= killR2) killSeg(i, 'explosive', ex, ez, credited);
      // A blast shove on a chain is just a faster weave for a tick — the projection next
      // tick pulls it back onto the line, which reads as the body flexing, not breaking.
    }
    flushKillsFrom(getState());
    publish();
  }

  // B6 — the strain's on-death honored effect: a volatile-marked body POPS where it
  // dies. The pack feels only a shove (a pop that killed the flock would be free
  // crowd-clearing, not the pilot's problem); the signature inside the radius takes
  // the authored chip of damage and the same mass-shared shove the family's own
  // bursts land. The ordinary broodBurst receipt carries the blast — juice/VFX read
  // it like any other burst. A strain whose law lives elsewhere (plated's kill-gate,
  // the commander's pack aura) carries no blast numbers and passes through untouched.
  function broodStrainBurst(i, credited) {
    const strain = strainForSlot(i);
    if (!strain) return;
    const bx = px[i];
    const bz = pz[i];
    const r = finite(strain.blastRadius);
    const dv = finite(strain.shoveDv);
    if (!(r > 0) || !(dv > 0)) return;
    const r2 = r * r;
    for (let n = 0; n < CAP; n++) {
      if (!alive[n] || n === i) continue;
      const dx = px[n] - bx;
      const dz = pz[n] - bz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      const falloff = 1 - d / r;
      vx[n] += (dx / d) * dv * falloff;
      vz[n] += (dz / d) * dv * falloff;
    }
    if (signatureRef && signatureRef.alive !== false && signatureRef.vel) {
      const pdx = playerX - bx;
      const pdz = playerZ - bz;
      const pd2 = pdx * pdx + pdz * pdz;
      if (pd2 <= r2) {
        const pd = Math.sqrt(pd2) || 1;
        const falloff = 1 - pd / r;
        const share = Math.min(1, (liveFamilyMass[family[i]] || 10) / Math.max(1, playerMass));
        signatureRef.vel.x += (pdx / pd) * dv * falloff * share;
        signatureRef.vel.z += (pdz / pd) * dv * falloff * share;
        routePlayerDamage(finite(strain.blastDamage), bx, bz, `brood_strain_${strain.id}`);
      }
    }
    if (bus && typeof bus.emit === 'function') {
      bus.emit('swarm:broodBurst', {
        familyId: liveFamilyId[family[i]],
        strain: strain.id,
        pos: { x: bx, z: bz },
        radius: r,
      });
    }
    void credited;
  }

  // --- death bookkeeping -------------------------------------------------------------------

  // W-BLOOM-LOW kill law: the authored family flags are binding. `massOnly` dies only by
  // mass (collision/terrain — a gun or blast pings off the shell); `blastOnly` dies only
  // by an explosion (a whip or a wall just blows the cloud around); `swells` is the
  // two-hit rule — the first non-explosive strike arms the fuse instead of killing.
  function killLawAllows(def, cause) {
    if (!def) return true;
    if (def.massOnly && cause !== 'collision' && cause !== 'terrain') return false;
    if (def.blastOnly && cause !== 'explosive') return false;
    return true;
  }

  // B6 — the mark's OWN kill-gate: the same shell law one layer down, on the body the
  // strain stamped. A plated mite refuses every cause but mass — the keelback's answer
  // moved from the family's whole silhouette to a marked share of the fodder. The gate
  // means "this cause cannot crack it", not "the body ignores physics": a refused blast
  // still throws it (the shove-through in onExplosion).
  function strainForSlot(i) {
    return affix[i] > 0 ? SWARM_BROOD_STRAINS[affix[i] - 1] : null;
  }
  function markRefuses(i, cause) {
    const strain = strainForSlot(i);
    return !!(strain && strain.massOnly && cause !== 'collision' && cause !== 'terrain');
  }

  let burstGuard = false;

  // Post-death authored blasts: `burstRadius`+`burstDv` shove every nearby cell AND the
  // hot signature (a cyst or bellows is a bomb whichever side throws it); `shardRadius`
  // kills neighboring cells outright — the glassback shatter. One level deep, no chains.
  function broodDeathBurst(i, def, credited) {
    const bx = px[i];
    const bz = pz[i];
    const shardR = Number.isFinite(def.shardRadius) ? def.shardRadius : 0;
    const burstR = Number.isFinite(def.burstRadius) ? def.burstRadius : 0;
    const burstDv = Number.isFinite(def.burstDv) ? def.burstDv : 0;
    if (burstR > 0 && burstDv > 0) {
      const br2 = burstR * burstR;
      for (let n = 0; n < CAP; n++) {
        if (!alive[n] || n === i) continue;
        const dx = px[n] - bx;
        const dz = pz[n] - bz;
        const d2 = dx * dx + dz * dz;
        if (d2 > br2) continue;
        const d = Math.sqrt(d2) || 1;
        const falloff = 1 - d / burstR;
        vx[n] += (dx / d) * burstDv * falloff;
        vz[n] += (dz / d) * burstDv * falloff;
        // Carry the pilot’s causal shove through the room, like an external
        // explosion. A zero-length/edge impulse does not claim an unrelated kill.
        if (credited && d2 > 0 && falloff > 0) {
          creditUntil[n] = finite(getState()?.simTime) + BROOD_CREDIT_WINDOW_S;
        }
      }
      // The signature feels the same burst, scaled by mass — a bomb is a bomb.
      if (signatureRef && signatureRef.vel) {
        const pdx = playerX - bx;
        const pdz = playerZ - bz;
        const pd2 = pdx * pdx + pdz * pdz;
        if (pd2 <= br2) {
          const pd = Math.sqrt(pd2) || 1;
          const share = Math.min(1, (liveFamilyMass[family[i]] || 10) / Math.max(1, playerMass));
          const falloff = 1 - pd / burstR;
          signatureRef.vel.x += (pdx / pd) * burstDv * falloff * share;
          signatureRef.vel.z += (pdz / pd) * burstDv * falloff * share;
        }
      }
      if (bus && typeof bus.emit === 'function') {
        bus.emit('swarm:broodBurst', { familyId: liveFamilyId[family[i]], pos: { x: bx, z: bz }, radius: burstR });
      }
    }
    if (shardR > 0 && !burstGuard) {
      burstGuard = true;
      const sr2 = shardR * shardR;
      for (let n = 0; n < CAP; n++) {
        if (!alive[n] || n === i) continue;
        const dx = px[n] - bx;
        const dz = pz[n] - bz;
        if (dx * dx + dz * dz > sr2) continue;
        kill(n, 'explosive', px[n], pz[n], credited);
      }
      burstGuard = false;
    }
  }

  function kill(i, cause, sampleX, sampleZ, credited = true) {
    if (!alive[i]) return;
    const def = liveFamilyDef[family[i]];
    if (!killLawAllows(def, cause)) return;
    if (markRefuses(i, cause)) return;
    // The linker's beam is a full refusal on its charge — every cause, no exceptions:
    // the authored out is the beam-break or the linker itself, never the partner's hull.
    if (shielded[i]) return;
    if (def && def.swells && cause !== 'explosive' && swellStage[i] === 0) {
      // First strike inflates: the fuse starts, the second strike (or the clock) detonates.
      swellStage[i] = 1;
      // The fuse remembers who armed it; environmental swelling is not a payout.
      if (credited) creditUntil[i] = finite(getState()?.simTime) + BROOD_CREDIT_WINDOW_S;
      swellUntil[i] = finite(getState()?.simTime) + (Number.isFinite(def.swellS) ? def.swellS : 2.6);
      // The swell is the bellows' authored beat ("it is swelling — strike it again"). A
      // burrowing sweller already spoke its own line cracking out of the rock — that tell
      // names the eruption, not the fuse — so it does not speak twice.
      if (!def.burrows) emitTelegraph(i, def);
      return;
    }
    alive[i] = 0;
    aliveCount -= 1;
    // The shell really broke, including an uncredited room impact. This names
    // the changed hazard, never claims a throw or grants a second reward.
    if (def?.id === 'glassback' && bus) bus.emit('swarm:broodCounter', {
      kind: 'shell', familyId: 'glassback', wave: liveWave,
    });
    // B-BLOOM filament flinch: a node's death pushes its linked partner outward this
    // hard — the web's visible recoil, an additive Δv along the corpse→partner axis,
    // the same write shape the Domino shove lands through. A winding or committed
    // body does not flinch: its hold is the telegraph's truth, and a committed pass
    // runs the line it drew.
    if (linkPartner[i] >= 0) {
      const flinchPartner = linkPartner[i];
      if (alive[flinchPartner]
        && (phase[flinchPartner] === BROOD_PHASE_FLOCK || phase[flinchPartner] === BROOD_PHASE_RECOVER)) {
        const fdx = px[flinchPartner] - px[i];
        const fdz = pz[flinchPartner] - pz[i];
        const fd = Math.hypot(fdx, fdz);
        if (fd > 1e-4) {
          vx[flinchPartner] += (fdx / fd) * BROOD_FILAMENT_FLINCH_DV;
          vz[flinchPartner] += (fdz / fd) * BROOD_FILAMENT_FLINCH_DV;
        }
      }
    }
    // A dying turret's sweep dies with it; a dying linker's charge drops its shield
    // THIS tick — the link pass only rebuilds flags for the living.
    freeBeamOf(i);
    channelSource[i] = null;
    if (linkPartner[i] >= 0) {
      const partner = linkPartner[i];
      linkPartner[i] = -1;
      shielded[partner] = 0;
      for (let j = 0; j < CAP; j++) {
        if (!alive[j] || linkPartner[j] !== partner) continue;
        const linkDef = liveFamilyDef[family[j]];
        if (!linkDef?.linkShield) continue;
        const range = linkDef.linkRange > 0 ? linkDef.linkRange : 90;
        const dx = px[partner] - px[j];
        const dz = pz[partner] - pz[j];
        if (dx * dx + dz * dz <= range * range * 1.5) {
          shielded[partner] = 1;
          break;
        }
      }
    }
    const c = CAUSE_INDEX[cause];
    if (c == null) return;
    killCount[c] += 1;
    if (killCount[c] === 1) {
      killPosX[c] = finite(sampleX);
      killPosZ[c] = finite(sampleZ);
    }
    if (def && (def.burstRadius > 0 || def.shardRadius > 0)) broodDeathBurst(i, def, credited);
    if (affix[i] > 0) broodStrainBurst(i, credited);
    if (def && def.births) {
      const leftover = birthLeft[i];
      if (leftover > 0) {
        motherReserve = Math.max(0, motherReserve - leftover);
        birthLeft[i] = 0;
      }
    }
    if (def && def.splits) releaseSplit(i, def);
    // W-BLOOM-LOW remains: the authored deathLeaves becomes a real latched body. Combat owns
    // the spawned payload's custody; the engine only speaks the intent, with the victim's
    // last position and momentum, exactly like every other swarm receipt on the bus.
    if (def && def.remains && bus) {
      const rem = def.remains;
      bus.emit('swarm:broodRemains', {
        familyId: liveFamilyId[family[i]],
        kind: rem.kind,
        name: rem.name,
        mass: rem.mass,
        radius: rem.radius,
        splashRadius: rem.splashRadius,
        glueS: rem.glueS,
        whipMult: rem.whipMult,
        pos: { x: px[i], z: pz[i] },
        vel: { x: vx[i], z: vz[i] },
        wave: liveWave,
      });
    }
    if (!credited) return;
    creditedCount[c]++;
    const pay = killPayFor(liveFamilyId[family[i]]);
    killCredits[c] += pay.credits;
    killScore[c] += pay.score;
    // Same Domino receipt as the chain: the cell's own last position, keyed by its spawn serial
    // so a slot reused inside the wave still counts as a new death.
    noteCreditedDeath(`cell:${serial[i]}`, px[i], pz[i]);
    armGrief(i, finite(getState()?.simTime));
    // B-BLOOM panic: a MASS kill is the pack's worst moment. One credited death of a body
    // at or above BROOD_PANIC_KILL_MASS inside the pack (the cascade reach) breaks it like
    // one animal — scatter, then the knot. Same credit law as grief: a kill nobody credits
    // is a kill the room does not answer.
    if (liveFamilyMass[family[i]] >= BROOD_PANIC_KILL_MASS) {
      armPanic(px[i], pz[i], finite(getState()?.simTime));
    }
  }

  // B-BLOOM grief: a kill the game credits is a kill the room notices. Every living
  // neighbor inside the cascade reach mourns THIS corpse for the authored window —
  // the freshest corpse wins a mourner that was already grieving an older one, the
  // same last-write the Domino ledger keeps. The victim itself is already dead.
  function armGrief(victim, now) {
    armGriefAt(px[victim], pz[victim], now);
  }

  // The position form of the same law. A Hive node is not a brood cell — the sac is an
  // entity in the room (the arena's own buffers), so its death cannot ride the credited
  // cell path above. BROOD_CASCADE_EVENTS names its receipt (`swarm:hiveSacKilled`) a
  // cascade seam, and the authored grief trigger says "a Hive node dying clusters linked
  // members around the body" — so the arena answers it here, at the corpse's own
  // coordinates, with the identical radius/window/last-write law.
  function armGriefAt(x, z, now) {
    const cr2 = BROOD_CASCADE_RADIUS * BROOD_CASCADE_RADIUS;
    for (let j = 0; j < CAP; j++) {
      if (!alive[j]) continue;
      const dx = px[j] - x;
      const dz = pz[j] - z;
      if (dx * dx + dz * dz > cr2) continue;
      griefUntil[j] = now + BROOD_GRIEF_S;
      griefX[j] = x;
      griefZ[j] = z;
    }
  }

  // B-BLOOM panic: the position form every trigger uses (the credited mass kill rides the
  // cell's own coordinates). Each living neighbor inside the cascade reach draws its own
  // seeded slice of the authored scatter band — the seed every cell already carries at
  // spawn, so the same pack replays the same break — and knots on the centroid after it.
  // The centroid is the corpse itself: the scatter flees it, the knot re-forms on it, the
  // tight ball "the best throw of the fight" promises. A mourner already grieving an older
  // corpse yields for the window — the fresher cascade replaces the jitter — and grief
  // resumes on its own clock when the panic lets go.
  function armPanic(x, z, now) {
    const cr2 = BROOD_CASCADE_RADIUS * BROOD_CASCADE_RADIUS;
    for (let j = 0; j < CAP; j++) {
      if (!alive[j]) continue;
      const dx = px[j] - x;
      const dz = pz[j] - z;
      if (dx * dx + dz * dz > cr2) continue;
      const dur = BROOD_PANIC_SCATTER_MIN_S
        + (seedPhase[j] % 1) * (BROOD_PANIC_SCATTER_MAX_S - BROOD_PANIC_SCATTER_MIN_S);
      panicUntil[j] = now + dur;
      knotUntil[j] = panicUntil[j] + BROOD_PANIC_REFORM_S;
      panicX[j] = x;
      panicZ[j] = z;
    }
  }

  // B-BLOOM aggression: the position form the relay seam uses — every living neighbor inside
  // the cascade reach of the RELAY joins the rush window. The rush's target is not stamped
  // here: the integration tracks the player's live position, so a strafing pilot drags the
  // whole angry pack with them for the authored BROOD_AGGRESSION_S.
  function armAggressionAt(x, z, now) {
    const cr2 = BROOD_CASCADE_RADIUS * BROOD_CASCADE_RADIUS;
    for (let j = 0; j < CAP; j++) {
      if (!alive[j]) continue;
      const dx = px[j] - x;
      const dz = pz[j] - z;
      if (dx * dx + dz * dz > cr2) continue;
      aggrUntil[j] = now + BROOD_AGGRESSION_S;
    }
  }

  // W-BLOOM-LOW: a burst remain's splash kills by 'explosive' law around the impact point —
  // the same cause every family's own burst uses, so each cell's kill-gate still decides.
  function splashKillAround(x, z, radius, credited) {
    const simTime = finite(getState()?.simTime);
    const r2 = radius * radius;
    for (let n = 0; n < CAP; n++) {
      if (!alive[n]) continue;
      const dx = px[n] - x;
      const dz = pz[n] - z;
      if (dx * dx + dz * dz > r2) continue;
      kill(n, 'explosive', px[n], pz[n], credited || creditUntil[n] > simTime);
    }
  }

  // A remain that delivered its burst or its stick is done as a body — combat retires the
  // entity on this receipt, and the mover slot forgets it so it cannot be spent twice.
  function emitRemainSpent(m) {
    if (movRemainId[m] < 0) return;
    if (bus) bus.emit('swarm:broodRemainsSpent', { entityId: movRemainId[m] });
    movRemainId[m] = -1;
    movGlueS[m] = 0;
    movSplashR[m] = 0;
  }

  function assignMotherShares() {
    if (motherReserve <= 0) return;
    let held = 0;
    for (let i = 0; i < CAP; i++) held += birthLeft[i];
    let free = motherReserve - held;
    if (free <= 0) return;
    const mothers = [];
    for (let i = 0; i < CAP; i++) {
      if (!alive[i] || birthLeft[i] > 0) continue;
      const def = liveFamilyDef[family[i]];
      if (!def || !def.births) continue;
      mothers.push(i);
    }
    if (mothers.length === 0) return;
    const each = Math.floor(free / mothers.length);
    let extra = free - each * mothers.length;
    for (const slot of mothers) {
      const give = each + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      const def = liveFamilyDef[family[slot]];
      // Her authored `birthBudget` is her own tide's ceiling: a mother never walks
      // with more than her spec carries, whatever share the pool's division hands her.
      const tide = def && def.birthBudget > 0 ? Math.trunc(def.birthBudget) : give;
      birthLeft[slot] = Math.min(give, tide);
      timer[slot] = def && def.birthEveryS > 0 ? def.birthEveryS : 1.2;
    }
  }

  function stepMother(i, def, dt, simTime) {
    if (birthLeft[i] <= 0 || motherReserve <= 0) return;
    timer[i] -= dt;
    if (timer[i] > 0) return;
    if (!birthTold[i]) {
      emitTelegraph(i, def);
      birthTold[i] = 1;
    }
    timer[i] = def.birthEveryS > 0 ? def.birthEveryS : 1.2;
    if (aliveCount >= CAP) return;
    const miteIdx = familyIndexOf('mite');
    if (miteIdx < 0) return;
    const slot = findFreeSlot();
    if (slot < 0) return;
    const ang = (simTime * 1.7 + i) % (Math.PI * 2);
    spawnAt(slot, miteIdx, px[i] + Math.cos(ang) * 8, pz[i] + Math.sin(ang) * 8);
    birthLeft[i] -= 1;
    motherReserve -= 1;
  }

  function familyIndexOf(id) {
    for (let n = 0; n < liveFamilyCount; n++) if (liveFamilyId[n] === id) return n;
    return -1;
  }

  function releaseSplit(i, def) {
    emitTelegraph(i, def);
    const miteIdx = familyIndexOf('mite');
    if (miteIdx < 0) return;
    const ox = px[i];
    const oz = pz[i];
    for (let n = 0; n < 3; n++) {
      if (n > 0) {
        if (splitterReserve <= 0) break;
        splitterReserve -= 1;
      }
      if (aliveCount >= CAP) break;
      const slot = findFreeSlot();
      if (slot < 0) break;
      const ang = n * (Math.PI * 2 / 3);
      spawnAt(slot, miteIdx, ox + Math.cos(ang) * 8, oz + Math.sin(ang) * 8);
    }
  }

  // --- B5: the late reserve drop -------------------------------------------------------
  //
  // One seeded gate clump, the same 165wu arrival ring and clearance law the wave's own
  // spawn used — mid-wave pressure reads as a late gate group, not a new mechanism.
  // The draw is bounded by `reserveBudget`, which was spent out of the mite share at
  // prepareWave, so the room never exceeds its planned population. A full cap or a
  // blocked gate just defers the rest to the next tick (the sac pulse's own patience).
  // The family's authored {bark,line,cue} speaks once on the first landing through the
  // ordinary telegraph seam — a reserve arrival is never silent.
  function releaseReserve(state) {
    if (reserveBudget <= 0 || !reserveFamily) return 0;
    const famIdx = buildFamilyIndex().get(reserveFamily);
    if (famIdx == null || famIdx < 0) return 0;
    const player = state?.entities?.get?.(state.playerId);
    const ax = finite(player?.pos?.x), az = finite(player?.pos?.z);
    const bearing = gateBearing(GATE_RING[Math.floor(rng() * GATE_RING.length)]);
    const cx = ax + bearing.x * 165, cz = az + bearing.z * 165;
    let born = 0;
    let firstSlot = -1;
    while (reserveBudget > 0) {
      const slot = findFreeSlot();
      if (slot < 0) break;
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 30;
      const open = findSwarmArrival(state, { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r },
        liveFamilyRadius[famIdx], { clearance: BROOD_SPAWN_ROCK_CLEARANCE });
      if (!open) break;
      spawnAt(slot, famIdx, open.x, open.z);
      if (liveFamilyDef[famIdx] && liveFamilyDef[famIdx].burrows) parkBurrower(slot);
      if (firstSlot < 0) firstSlot = slot;
      reserveBudget -= 1;
      born += 1;
    }
    if (born > 0) {
      if (!reserveTold) {
        reserveTold = true;
        emitTelegraph(firstSlot, liveFamilyDef[famIdx]);
      }
      if (bus) {
        bus.emit('swarm:broodReserve', {
          familyId: reserveFamily, count: born, wave: liveWave,
          pos: { x: px[firstSlot], z: pz[firstSlot] },
        });
      }
      publish();
    }
    return born;
  }

  function flushKills(state) {
    flushKillsFrom(state);
  }

  function flushKillsFrom(state) {
    const run = state ? liveSwarmRun(state) : null;
    const wave = run ? run.wave : liveWave;
    const canPay = !!(run && run.phase === 'active' && state.mode === 'flight' && bus);
    for (let c = 0; c < CAUSE_N; c++) {
      const count = killCount[c];
      if (count <= 0) continue;
      const cause = SWARM_BROOD_KILL_CAUSES[c];
      if (bus) {
        bus.emit('swarm:broodKills', {
          count: canPay ? creditedCount[c] : 0,
          removedCount: count,
          environmentalCount: count - creditedCount[c],
          cause,
          pos: { x: killPosX[c], z: killPosZ[c] },
          credits: killCredits[c],
          score: killScore[c],
          wave,
        });
      }
      if (canPay && (killCredits[c] > 0 || killScore[c] > 0)) {
        bus.emit('run:awardRequested', {
          credits: killCredits[c],
          score: killScore[c],
          reason: 'brood',
          wave,
        });
      }
    }
    // One batch, in kill order, on the same payable gate as the receipts above: these are the
    // positions Domino shoves FROM. An unpaid room (draft phase, ended run, no flight) clears
    // the ledger with the counters — a death that could not pay cannot shove.
    if (canPay && deathScratchCount > 0) {
      const deaths = [];
      for (let d = 0; d < deathScratchCount; d++) {
        const rec = deathScratch[d];
        deaths.push({ key: rec.key, pos: { x: rec.x, z: rec.z } });
      }
      bus.emit('swarm:broodDeathPositions', { wave, deaths });
    }
    killCount.fill(0);
    creditedCount.fill(0);
    killCredits.fill(0);
    killScore.fill(0);
    deathScratchCount = 0;
  }

  // --- B4: the Hive's seams ------------------------------------------------------------

  /**
   * A sac births `count` bodies of the reserve family at (x, z). Draws down the wave's
   * OWN held-back plan — never above it — so the population law is identical in the
   * Hive and out of it. Returns how many bodies actually landed.
   */
  function sacRelease(x, z, count = 1) {
    if (sacBudget <= 0) return 0;
    const famIdx = buildFamilyIndex().get(SWARM_HIVE_SAC_FAMILY);
    if (famIdx == null || famIdx < 0) return 0;
    const n = Math.max(1, Math.trunc(count) || 1);
    let born = 0;
    for (let k = 0; k < n && sacBudget > 0; k++) {
      const slot = findFreeSlot();
      if (slot < 0) break; // the cap is the law — a sac never overflows the room
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 5;
      spawnAt(slot, famIdx, finite(x) + Math.cos(a) * r, finite(z) + Math.sin(a) * r);
      sacBudget -= 1;
      born += 1;
    }
    if (born > 0) {
      sacLastBirthAt = finite(getState()?.simTime);
      publish();
    }
    return born;
  }

  // B4 — the room answers a sac's death: the authored grief loop arms at the corpse. A sac
  // is the Hive node the cascade contract names (BROOD_CASCADE_EVENTS); the brood it was
  // feeding mourn around the burst exactly as they mourn a credited cell. Returns the
  // mourners armed (0 when the burst fell where no living brood could hear it — an
  // honest no-op, not a pretend room).
  function hiveSacFell(x, z) {
    if (!hiveMode) return 0;
    const now = finite(getState()?.simTime);
    armGriefAt(finite(x), finite(z), now);
    const mourners = griefMournerCount(now);
    if (mourners > 0) publish();
    return mourners;
  }

  // B-BLOOM aggression — the relay/hit seam BROOD_CASCADE_EVENTS' comment names ("queen
  // hits"): a hit on the brood's relay node turns the linked brood on the hitter. The arena
  // forwards the ordinary `combat:damage` receipt for a relay entity (the Queen champion, or
  // the Tendril's head — the two nodes the data contract stamps); this engine owns the law:
  // only an authored relay id counts, only a live run arms, only neighbors inside the
  // cascade reach join, and the window is the authored BROOD_AGGRESSION_S. Every hit re-arms
  // — keeping the pressure on the relay is what the window means. Returns the members armed.
  function relayHit(request) {
    const state = getState();
    const run = liveSwarmRun(state);
    if (!run || run.phase !== 'active' || run.wave !== liveWave) return 0;
    const relayLootId = request && request.relayLootId;
    if (relayLootId !== BROOD_QUEEN_LOOT_ID && relayLootId !== TENDRIL_HEAD_LOOT_ID) return 0;
    const x = finite(request?.x);
    const z = finite(request?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const now = finite(state?.simTime);
    armAggressionAt(x, z, now);
    const members = aggressionCount(now);
    if (members > 0) {
      if (bus) {
        bus.emit('swarm:broodAggression', {
          wave: liveWave, relayLootId, members,
          window: BROOD_AGGRESSION_S, pos: { x, z },
        });
      }
      publish();
    }
    return members;
  }

  // The tide is deliverable while some live unspent sac still owes a birth: one heartbeat
  // (successful sacRelease) within the last SAC_TIDE_SILENCE_S, or a tide fresh from install.
  function sacTidePendingAt(now) {
    if (!hiveMode || sacBudget <= 0) return false;
    return Math.max(0, finite(now) - sacLastBirthAt) <= SAC_TIDE_SILENCE_S;
  }

  // The authored strand, named: the held share once no sac remains to deliver it.
  function sacStrandedAt(now) {
    return (hiveMode && sacBudget > 0 && !sacTidePendingAt(now)) ? sacBudget : 0;
  }

  // The mourning census: living cells still bending toward a corpse.
  function griefLive(now) {
    for (let j = 0; j < CAP; j++) {
      if (alive[j] && griefUntil[j] > finite(now)) return true;
    }
    return false;
  }

  function griefMournerCount(now) {
    let count = 0;
    for (let j = 0; j < CAP; j++) {
      if (alive[j] && griefUntil[j] > finite(now)) count += 1;
    }
    return count;
  }

  // The panic census: living cells mid-scatter or mid-knot (scatter always ends before its
  // knot does, so one upper bound answers both).
  function panicLive(now) {
    for (let j = 0; j < CAP; j++) {
      if (alive[j] && knotUntil[j] > finite(now)) return true;
    }
    return false;
  }

  function panicCount(now) {
    let count = 0;
    for (let j = 0; j < CAP; j++) {
      if (alive[j] && knotUntil[j] > finite(now)) count += 1;
    }
    return count;
  }

  // The aggression census: living cells mid-rush (the window is one flat authored band, so
  // one clock answers the whole kind — unlike panic's scatter-then-knot pair).
  function aggressionLive(now) {
    for (let j = 0; j < CAP; j++) {
      if (alive[j] && aggrUntil[j] > finite(now)) return true;
    }
    return false;
  }

  function aggressionCount(now) {
    let count = 0;
    for (let j = 0; j < CAP; j++) {
      if (alive[j] && aggrUntil[j] > finite(now)) count += 1;
    }
    return count;
  }

  /** A sac's acid drip — the same pool pipeline a spitter splash leaves behind. */
  function hivePool(x, z, ttl = HIVE_POOL_TTL_S) {
    const slot = poolCursor % BROOD_POOL_MAX;
    poolCursor += 1;
    poolX[slot] = finite(x);
    poolZ[slot] = finite(z);
    poolAge[slot] = 0;
    poolTtl[slot] = Math.max(0.5, Number.isFinite(ttl) ? ttl : HIVE_POOL_TTL_S);
    if (poolCount < BROOD_POOL_MAX) poolCount += 1;
    publish();
  }

  /**
   * The Domino seam (row 270). The arena passes one credited death's actual position; this
   * engine — the only writer of these buffers — adds the shared radial falloff to every living
   * cell and chain segment around it. The velocity write is exactly what the room's own slams
   * do (additive, integrated next step): the flock's step carries it, a freed segment keeps
   * weaving faster, an attached one reads it as flex for a tick. Returns the count moved.
   */
  function applyLegendaryShove(request) {
    const center = request && (request.center || request);
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return 0;
    let moved = 0;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const dv = dominoDeltaVelocity(center, { x: px[i], z: pz[i] });
      if (!dv.x && !dv.z) continue;
      vx[i] += dv.x;
      vz[i] += dv.z;
      moved += 1;
    }
    for (let i = 0; i < TENDRIL_SEG_MAX; i++) {
      if (!segAlive[i]) continue;
      const dv = dominoDeltaVelocity(center, { x: segX[i], z: segZ[i] });
      if (!dv.x && !dv.z) continue;
      segVX[i] += dv.x;
      segVZ[i] += dv.z;
      moved += 1;
    }
    return moved;
  }

  function publish() {
    view.aliveCount = aliveCount;
    view.pendingCount = pendingPlan ? pendingPlan.reduce((sum, part) => sum + part.count, 0) : 0;
    view.attackLimit = broodAttackLimit(liveWave);
    view.nextAttackAt = nextAttackAt;
    view.wave = liveWave;
    view.lobCount = lobCount;
    view.poolCount = poolCount;
    view.tendril = tendrilMode;
    view.segAliveCount = segAliveCount;
    view.hive = hiveMode;
    view.sacBudget = sacBudget;
    view.sacStranded = sacStrandedAt(finite(getState()?.simTime));
    // B-BLOOM cascade kind on the view — the data contract's own seam ("published on the
    // view"); the authored urgency order reads panic (the pack breaking), then aggression
    // (the pack rushing you), then grief (the pack mourning) while each window is live.
    const cascadeNow = finite(getState()?.simTime);
    view.cascade = panicLive(cascadeNow) ? BROOD_CASCADE_PANIC
      : (aggressionLive(cascadeNow) ? BROOD_CASCADE_AGGRESSION
      : (griefLive(cascadeNow) ? BROOD_CASCADE_GRIEF : BROOD_CASCADE_NONE));
    view.reserveFamily = reserveFamily;
    view.reserveBudget = reserveBudget;
    view.strain = strainDef ? strainDef.id : null;
    // The Machine's instruments — retained records, refilled every publish. A turret
    // mid-windup publishes its promised arc (state 0) so the pivot reads before the
    // beam exists; live sweeps publish the walking edge (state 1).
    view.machineReserve = machineReserve;
    // Retained records refilled at a write cursor: truncating to `length = 0` would drop
    // the refs and force a fresh {} per record per publish — the cursor keeps the pool.
    let beamRecN = 0;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i] || beamState[i] !== 1) continue;
      const def = liveFamilyDef[family[i]];
      if (!def || !def.beam) continue;
      let rec = viewBeams[beamRecN];
      if (!rec) rec = viewBeams[beamRecN] = {};
      const arc = def.beamArc > 0 ? def.beamArc : 1.6;
      rec.x = px[i]; rec.z = pz[i];
      rec.a0 = teleDir[i] - arc * 0.5; rec.a1 = teleDir[i] + arc * 0.5;
      rec.t = 0; rec.total = 1;
      rec.range = def.beamRange > 0 ? def.beamRange : 130;
      rec.width = def.beamWidth > 0 ? def.beamWidth : 5;
      rec.state = 0;
      beamRecN += 1;
    }
    for (let b = 0; b < BEAM_MAX; b++) {
      if (!beamAlive[b]) continue;
      let rec = viewBeams[beamRecN];
      if (!rec) rec = viewBeams[beamRecN] = {};
      rec.x = beamX[b]; rec.z = beamZ[b];
      rec.a0 = beamA0[b]; rec.a1 = beamA1[b];
      rec.t = beamT[b]; rec.total = beamTotal[b];
      rec.range = beamReach[b]; rec.width = beamWidth[b];
      rec.state = 1;
      beamRecN += 1;
    }
    viewBeams.length = beamRecN;
    let linkRecN = 0;
    let auraRecN = 0;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const def = liveFamilyDef[family[i]];
      if (!def) continue;
      if (def.linkShield && linkPartner[i] >= 0 && alive[linkPartner[i]]) {
        let rec = viewLinks[linkRecN];
        if (!rec) rec = viewLinks[linkRecN] = {};
        rec.x1 = px[i]; rec.z1 = pz[i];
        rec.x2 = px[linkPartner[i]]; rec.z2 = pz[linkPartner[i]];
        linkRecN += 1;
      }
      if (def.magnets) {
        let rec = viewAuras[auraRecN];
        if (!rec) rec = viewAuras[auraRecN] = {};
        rec.x = px[i]; rec.z = pz[i];
        rec.r = def.magnetRadius > 0 ? def.magnetRadius : 30;
        auraRecN += 1;
      }
    }
    viewLinks.length = linkRecN;
    viewAuras.length = auraRecN;
    // The radius the damage queries add the victim's reach to, so the drawn footprints can use the
    // SAME number (telegraphFootprint.js). Runtime mirror, never serialized.
    view.victimRadius = playerRad;
    const state = getState();
    if (state && state[SWARM_BROOD_STATE_KEY] !== view) {
      // Assign once; the view identity is stable for the engine's whole life.
      state[SWARM_BROOD_STATE_KEY] = view;
    }
  }

  setFamilyMirror(BROOD_FAMILY_DEFS);
  publish();

  return {
    id: 'swarmBrood',
    view,
    prepareWave,
    spawnWave,
    canPrepareBank(state) {
      return !bankPlayed && !spawnRequestedBankAttempted
        && swarmBankEligible(state?.run, liveWave, pendingPlan);
    },
    planBank(state, candidate = null) {
      return this.canPrepareBank(state) ? planSwarmBank(state, state?.run, liveWave, pendingPlan, candidate) : null;
    },
    // Admission-only preview for the two opening lessons after an earned, moving
    // fight. It spends no lives, RNG, time or scenery. The arena owns any new rock.
    canPrepareOpeningContinuation(state) {
      const run = state?.run;
      return state?.mode === 'flight' && !openingVolleyAttempted && !!pendingPlan && liveWave === run?.wave
        && (liveWave === 3 || liveWave === 4) && run?.kind === 'survival'
        && run.phase === 'active' && run.ruleset === 'swarm' && run.arenaId === 'helios_core'
        && !run.arenaMutators?.length && !(state?.rockCore?.ratingT > 0);
    },
    planOpeningContinuation(state, candidate = null) {
      if (!this.canPrepareOpeningContinuation(state)) return null;
      const spitter = familyIndexOf('spitter'), mite = familyIndexOf('mite');
      if (spitter < 0 || (liveWave === 4 && mite < 0)) return null;
      const placement = openingPlacementState(state);
      if (!placement) return null;
      const preview = candidate ? { ...placement, entities: new Map(placement.entities).set(candidate.id, candidate) } : placement;
      return liveWave === 3
        ? planSwarmOpeningSpitter(preview, state.run, liveWave, pendingPlan, liveFamilyRadius[spitter])
        : planSwarmOpeningCrossfire(preview, state.run, liveWave, pendingPlan, liveFamilyRadius[mite], liveFamilyRadius[spitter]);
    },
    step,
    clear,
    onExplosion,
    queryProjectileHit,
    queryNearestDirectTarget,
    commitProjectileHit,
    damageSegment,
    // B4 — the Hive's seams: sacs spend the wave's reserve, sacs drip acid, and a sac's
    // death is answered by the authored grief loop at the corpse (BROOD_CASCADE_EVENTS).
    sacRelease,
    hivePool,
    hiveSacFell,
    // B-BLOOM aggression — the relay/hit seam: the arena forwards a relay entity's hit
    // receipt (`combat:damage` on the Queen or the Tendril's head) and the authored
    // aggression cascade arms here.
    relayHit,
    // Row-270 — the Domino shove lands here through the arena, never across the buffers' owner.
    applyLegendaryShove,
    /** Live population figures, for tests and the lab overlay. */
    census() {
      return { alive: aliveCount, cap: CAP, min: SWARM_BROOD_MIN, wave: liveWave, sacBudget,
        sacStranded: sacStrandedAt(finite(getState()?.simTime)), reserveBudget, machineReserve,
        mourners: griefMournerCount(finite(getState()?.simTime)),
        panicking: panicCount(finite(getState()?.simTime)),
        aggravated: aggressionCount(finite(getState()?.simTime)) };
    },
    // Test seams: direct, read-only unless named as a seam.
    _bodies: { px, pz, vx, vz, alive, family, heading, hp, phase, timer, teleX, teleZ, teleDir, serial, seedPhase, gluedUntil, birthLeft, birthTold, liveFamilyId, liveFamilyRadius, affix, commandBuff, shielded, linkPartner, channelEntity, squadId, squadSlot, beamState },
    _machine() {
      return { reserve: machineReserve, squads: squadCount, beams: beamCount };
    },
    // The staged composition, read-only for tests and the lab overlay: null when no bank
    // is live, else its phase and the three (slot, spawn serial) pairs it holds.
    _bank() {
      return bank
        ? { phase: bank.phase, until: bank.until,
          slots: [[bank.first, bank.firstLife], [bank.spit, bank.spitLife], [bank.second, bank.secondLife]] }
        : null;
    },
    _beams: { x: beamX, z: beamZ, a0: beamA0, a1: beamA1, t: beamT, total: beamTotal, range: beamRange, width: beamWidth, alive: beamAlive, owner: beamOwner },
    _lobs: { x: lobX, z: lobZ, t: lobT, total: lobTotal, tx: lobTX, tz: lobTZ, alive: lobAlive },
    _pools: { x: poolX, z: poolZ, age: poolAge, ttl: poolTtl },
    // B3 — the Tendril's chain: read-only buffers plus one write seam for the split test.
    _segs: { x: segX, z: segZ, vx: segVX, vz: segVZ, hp: segHp, alive: segAlive, lead: segLead, heading: segHeading },
    _tendril() {
      return { mode: tendrilMode, headSeen: tendrilHeadSeen, done: tendrilDone, spawned: wormSpawned, headFound };
    },
    _hive() {
      return { mode: hiveMode, sacBudget, immediateQuota,
        sacStranded: sacStrandedAt(finite(getState()?.simTime)), lastBirthAt: sacLastBirthAt };
    },
    _splitter() {
      return { reserve: splitterReserve };
    },
    _mother() {
      return { reserve: motherReserve };
    },
    _reserve() {
      return { family: reserveFamily, left: reserveBudget, releaseAt: reserveReleaseAt };
    },
    _strain() {
      return { id: strainDef ? strainDef.id : null, mark: strainMark, left: strainLeft };
    },
    _setFamilyMirrorForTest: setFamilyMirror,
    _killDirectForTest(i, cause) {
      killCount.fill(0);
      creditedCount.fill(0);
      killCredits.fill(0);
      killScore.fill(0);
      deathScratchCount = 0;
      kill(i, cause, px[i], pz[i]);
      flushKillsFrom(getState());
      publish();
    },
    _killSegDirectForTest(i, cause) {
      killCount.fill(0);
      creditedCount.fill(0);
      killCredits.fill(0);
      killScore.fill(0);
      deathScratchCount = 0;
      killSeg(i, cause, segX[i], segZ[i]);
      flushKillsFrom(getState());
      publish();
    },
  };
}

function finitePoint(point) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function segmentCircleT(from, to, x, z, radius) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const lengthSq = dx * dx + dz * dz;
  const mx = from.x - x, mz = from.z - z;
  const radiusSq = Math.max(0, radius) ** 2;
  const c = mx * mx + mz * mz - radiusSq;
  if (c <= 0) return 0;
  if (lengthSq <= 1e-10) return null;
  const b = mx * dx + mz * dz;
  const discriminant = b * b - lengthSq * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / lengthSq;
  return t >= 0 && t <= 1 ? t : null;
}

function directCandidateBefore(t, kind, life, otherT, otherKind, otherLife) {
  return t < otherT || (t === otherT && (kind < otherKind || (kind === otherKind && life < otherLife)));
}

// Conservative advancement against a line whose two ends may move independently.
// Each step is bounded by the maximum relative endpoint travel, so it cannot skip a
// contact or turn a future/previous-only geometric crossing into an actual hit.
// A nearly tangent unresolved approach fails closed after 32 iterations.
function movingDiscCutsLink(x0, z0, x1, z1, radius, ax0, az0, ax1, az1, bx0, bz0, bx1, bz1) {
  const mx = x1 - x0, mz = z1 - z0;
  const adx = ax1 - ax0, adz = az1 - az0, bdx = bx1 - bx0, bdz = bz1 - bz0;
  const bound = Math.max(Math.hypot(mx - adx, mz - adz), Math.hypot(mx - bdx, mz - bdz));
  if (!(bound > 0)) return false;
  let t = 0;
  for (let n = 0; n < 32 && t <= 1; n++) {
    const ax = ax0 + adx * t, az = az0 + adz * t;
    const bx = bx0 + bdx * t, bz = bz0 + bdz * t;
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const rx = x0 + mx * t - ax, rz = z0 + mz * t - az;
    const u = len2 > 0 ? Math.max(0, Math.min(1, (rx * dx + rz * dz) / len2)) : 0;
    const gap = Math.hypot(rx - u * dx, rz - u * dz) - radius;
    if (gap <= 1e-6) return true;
    t += gap / bound;
  }
  return false;
}
