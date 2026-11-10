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

import { foundryScoreFromPlan } from '../data/swarmFoundryScore.js';
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
import { planSwarmOpeningSpitter } from './swarmOpeningSpitter.js';
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
// One original Foundry offcut has a cover seat without displacing ordinary stones.
const ROCK_STORAGE_MAX = ROCK_CACHE_MAX + 1;
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
  let spawnRequestedBankAttempted = false;
  let foundryScore = null, foundryTicks = 0, foundryLastTick = null;
  let openingVolleyAttempted = false;
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
    bank = null;
    spawnRequestedBankAttempted = false;
    foundryScore = null; foundryTicks = 0; foundryLastTick = null;
    openingVolleyAttempted = false;
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
    const now = finite(state?.simTime);
    nextSpawnAttemptAt = now + 0.5;
    const player = state?.entities?.get?.(state.playerId);
    const ax = finite(player?.pos?.x), az = finite(player?.pos?.z);
    const familyIndex = buildFamilyIndex();
    // Let the guard pair speak before the second new shape. This clock counts
    // active pilot play; waiting in the room cannot spend the Cyst's approach.
    if (!openingVolleyAttempted && foundryScore?.cystAtTick > foundryTicks) {
      // Approach the authored edge without spending another half-second poll.
      // The Cyst's full six-second read must finish before the ship crowd at840.
      nextSpawnAttemptAt = Math.min(nextSpawnAttemptAt,
        now + Math.max(0, foundryScore.cystAtTick - foundryTicks - 1) * DT);
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
      const spitter = familyIndex.get('spitter');
      const mixedMite = familyIndex.get('mite');
      const mixed = mixedMite == null || spitter == null ? null : planSwarmOpeningCrossfire(
        state, state.run, liveWave, pendingPlan, liveFamilyRadius[mixedMite], liveFamilyRadius[spitter]);
      const mixedSlots = [];
      for (let i = 0; mixed && i < CAP && mixedSlots.length < 4; i++) if (!alive[i]) mixedSlots.push(i);
      if (mixed && mixedSlots.length === 4) {
        for (let i = 0; i < 3; i++) spawnAt(mixedSlots[i], mixedMite, mixed.mites[i].x, mixed.mites[i].z);
        spawnAt(mixedSlots[3], spitter, mixed.spitter.x, mixed.spitter.z);
        pendingPlan.find(part => part.id === 'mite').count -= 3;
        pendingPlan.find(part => part.id === 'spitter').count -= 1;
        openingBeat = { remaining: 6, lastTick: state.tick, attackPending: true,
          lives: mixedSlots.map(slot => ({ slot, life: serial[slot] })) };
        attackAfter[mixedSlots[3]] = Infinity;
        openingRamp = { remaining: 0, lastTick: state.tick, group: 0, course: mixed.course };
        assignMotherShares();
        publish();
        return 4;
      }
      const debut = spitter == null ? null : planSwarmOpeningSpitter(
        state, state.run, liveWave, pendingPlan, liveFamilyRadius[spitter]);
      const debutSlot = debut ? findFreeSlot() : -1;
      if (debut && debutSlot >= 0) {
        spawnAt(debutSlot, spitter, debut.pos.x, debut.pos.z);
        pendingPlan.find(part => part.id === 'spitter').count -= 1;
        // One ordinary marked lob gets room to speak. Killing this life releases
        // the crowd early; otherwise the existing six active-second beat does.
        openingBeat = { remaining: 6, lastTick: state.tick, attackPending: true,
          lives: [{ slot: debutSlot, life: serial[debutSlot] }] };
        attackAfter[debutSlot] = Infinity;
        openingRamp = { remaining: 0, lastTick: state.tick, group: 0, course: debut.course };
        assignMotherShares();
        publish();
        return 1;
      }
      const mite = familyIndex.get('mite');
      const wreck = foundryScore && mite != null ? planSwarmOpeningWreck(
        state, state.run, liveWave, pendingPlan, liveFamilyRadius[mite]) : null;
      const layout = wreck || (mite == null ? null : planSwarmOpeningVolley(
        state, state.run, liveWave, pendingPlan, liveFamilyRadius[mite]));
      const free = [];
      for (let i = 0; layout && i < CAP && free.length < 3; i++) if (!alive[i]) free.push(i);
      if (layout && free.length === 3) {
        for (let i = 0; i < 3; i++) spawnAt(free[i], mite, layout.points[i].x, layout.points[i].z);
        pendingPlan.find(part => part.id === 'mite').count -= 3;
        // Let the existing pebble-and-pack choice read before the full gate pressure.
        // These are ordinary live enemies, not parked practice targets. The same plan
        // resumes on their defeat or after six seconds of active pilot play.
        openingBeat = { remaining: 6, lastTick: state.tick, lives: free.map(slot => ({ slot, life: serial[slot] })) };
        const dx = layout.points[0].x - ax, dz = layout.points[0].z - az;
        const distance = Math.hypot(dx, dz);
        openingRamp = { remaining: 0, lastTick: state.tick, group: 0,
          course: { x: ax, z: az, ux: dx / distance, uz: dz / distance, player } };
        assignMotherShares();
        publish();
        return 3;
      }
    }
    // Admit the whole vignette atomically before the usual gate arrivals. It spends the
    // existing plan and never moves the chosen rock or an already-live brood body.
    if (!bankPlayed && !spawnRequestedBankAttempted && !['slip_the_lance', 'break_the_guard'].includes(foundryScore?.id)) {
      spawnRequestedBankAttempted = true;
      const layout = planSwarmBank(state, state?.run, liveWave, pendingPlan);
      const charger = familyIndex.get('charger'), spitter = familyIndex.get('spitter');
      const free = [];
      for (let i = 0; i < CAP && free.length < 3; i++) if (!alive[i]) free.push(i);
      if (layout && charger != null && spitter != null && free.length === 3) {
        spawnAt(free[0], charger, layout.first.x, layout.first.z);
        spawnAt(free[1], spitter, layout.spitter.x, layout.spitter.z);
        spawnAt(free[2], charger, layout.second.x, layout.second.z);
        pendingPlan.find(part => part.id === 'charger').count -= 2;
        pendingPlan.find(part => part.id === 'spitter').count -= 1;
        bank = { first: free[0], spit: free[1], second: free[2],
          firstLife: serial[free[0]], spitLife: serial[free[1]], secondLife: serial[free[2]],
          phase: 'first', until: now + 8, readPending: !!foundryScore?.bankReadS, flankX: layout.flankX, flankZ: layout.flankZ,
          rockId: layout.rockId };
        bankPlayed = true;
        if (foundryScore?.bankReadS > 0) {
          openingBeat = { remaining: foundryScore.bankReadS, lastTick: state.tick, attackPending: true,
            lives: free.map(slot => ({ slot, life: serial[slot] })) };
          for (const slot of free) attackAfter[slot] = Infinity;
          assignMotherShares();
          publish();
          return 3;
        }
        spawned += 3;
      }
    }
    for (const part of pendingPlan) {
      const readTicks = foundryScore ? Math.max(foundryScore.broodReadTicks,
        part.id === 'spore_drift' ? foundryScore.sporeReadTicks : 0) : 0;
      if (foundryTicks < readTicks) { deferred.push(part); continue; }
      const famIdx = familyIndex.get(part.id);
      if (famIdx == null) continue;
      let owed = 0;
      for (let start = 0; start < part.count;) {
        if (arrivalBudget <= 0) { owed += part.count - start; break; }
        const gates = openingRamp?.course && openingRamp.gates || GATE_RING;
        const bearing = gateBearing(gates[groupIndex++ % gates.length]);
        const course = openingRamp?.course;
        const distance = course?.distance || 165;
        const cx = course ? course.x + (-bearing.x * course.uz - bearing.z * course.ux) * distance : ax + bearing.x * 165;
        const cz = course ? course.z + (bearing.x * course.ux - bearing.z * course.uz) * distance : az + bearing.z * 165;
        const n = Math.min(18, part.count - start, arrivalBudget);
        start += n;
        arrivalBudget -= n;
        for (let i = 0; i < n; i++) {
          const slot = findFreeSlot();
          if (slot < 0) { owed++; continue; }
          const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 30;
          const open = findSwarmArrival(state, { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r },
            liveFamilyRadius[famIdx], { clearance: BROOD_SPAWN_ROCK_CLEARANCE,
              ...(packReserved ? { reserved: packReserved, reservedClearance: 1,
                clusterCenter: { x: cx, z: cz }, clusterRadius: 30, clusterAngle: 0 } : {}) });
          if (!open || (packReserved && Math.hypot(open.x - cx, open.z - cz) > 30.001) || (course && Math.hypot(open.x - ax, open.z - az) > (course.maxPlayerDistance || 300))) { owed++; continue; }
          spawnAt(slot, famIdx, open.x, open.z);
          if (packReserved) packReserved.push({ alive: true, pos: { x: open.x, z: open.z }, radius: liveFamilyRadius[famIdx] });
          if (liveFamilyDef[famIdx] && liveFamilyDef[famIdx].burrows) parkBurrower(slot);
          if (liveFamilyDef[famIdx] && liveFamilyDef[famIdx].rooted) parkRooted(slot);
          spawned++;
        }
      }
      if (owed > 0) deferred.push({ ...part, count: owed });
    }
    pendingPlan = deferred.length ? deferred : null;
    if (openingRamp) {
      openingRamp.group = groupIndex;
      if (!pendingPlan) openingRamp = null;
    }
    // B5 — the reserve drops on the wave's own clock: first spawn starts the timer,
    // so a held-back group always lands mid-wave rather than at the open.
    if (reserveBudget > 0 && !Number.isFinite(reserveReleaseAt)) {
      reserveReleaseAt = now + SWARM_BROOD_RESERVE_DELAY_S;
    }
    assignMotherShares();
    publish();
    return spawned;
  }

  function spawnAt(slot, famIdx, x, z) {
    px[slot] = x;
    pz[slot] = z;
    vx[slot] = 0;
    vz[slot] = 0;
    heading[slot] = rng() * Math.PI * 2;
    family[slot] = famIdx;
    hp[slot] = liveFamilyHull[famIdx];
    creditUntil[slot] = 0;
    attackAfter[slot] = finite(getState()?.simTime) + BROOD_ATTACK_ARRIVAL_S;
    alive[slot] = 1;
    phase[slot] = BROOD_PHASE_FLOCK;
    timer[slot] = 0;
    seedPhase[slot] = rng() * Math.PI * 2;
    serial[slot] = nextSerial++;
    chunkBornTick[slot] = finite(getState()?.tick);
    swellStage[slot] = 0;
    swellUntil[slot] = 0;
    primeUntil[slot] = 0;
    gluedUntil[slot] = 0;
    dragTold[slot] = 0;
    // A reused slot never inherits a dead cell's mourning — or its panic, or its rush.
    griefUntil[slot] = 0;
    panicUntil[slot] = 0;
    knotUntil[slot] = 0;
    aggrUntil[slot] = 0;
    // Per-slot reserve flags die with the body too — a reused slot never inherits a dead
    // mother's told-flag or an unspent share of her tide.
    birthLeft[slot] = 0;
    birthTold[slot] = 0;
    // B6 — the strain stamp: a carrier-family body takes the wave's mark while the
    // budget holds. The mark is a STANDING property — like the glassback's shell it
    // never speaks a telegraph line: its debut rides the slam card (the strain's own
    // counter) and its read is the mark's tint, not a per-wave bark that would starve
    // the two-line telegraph budget for the rest of the run.
    affix[slot] = 0;
    if (strainLeft > 0 && strainDef && liveFamilyId[famIdx] === strainDef.familyId) {
      affix[slot] = strainMark;
      strainLeft -= 1;
    }
    // The Machine's per-body state dies with the slot the same way — a reused cell
    // never inherits a dead linker's charge, a channel's target, or a squad seat.
    shielded[slot] = 0;
    linkPartner[slot] = -1;
    linkBrokenUntil[slot] = 0;
    linkStartedTick[slot] = Infinity;
    linkTargetLife[slot] = 0;
    channelEntity[slot] = -1;
    channelTold[slot] = 0;
    channelSource[slot] = null;
    channelGeneration[slot] = 0;
    beamState[slot] = 0;
    beamSlotOf[slot] = -1;
    contactAfter[slot] = 0;
    squadId[slot] = -1;
    squadSlot[slot] = 0;
    const spawnDef = liveFamilyDef[famIdx];
    if (spawnDef && spawnDef.formation) {
      const size = Math.max(3, Math.trunc(spawnDef.squadSize) || 6);
      const squad = Math.min(SQUAD_MAX - 1, Math.floor(formationSpawns / size));
      if (squad >= squadCount) {
        squadCount = squad + 1;
        squadSeed[squad] = rng() * Math.PI * 2;
        squadCursor[squad] = 0;
        squadPeelAt[squad] = finite(getState()?.simTime) + 2 + rng() * 2;
        squadDefIdx[squad] = famIdx;
      }
      squadId[slot] = squad;
      squadSlot[slot] = formationSpawns % size;
      formationSpawns += 1;
    }
    aliveCount += 1;
  }

  // A rooted body plants itself against the nearest rock face — the sentry read — and
  // keeps that spot in teleX/teleZ for the rest of its life. No rocks, it holds its
  // arrival point.
  function parkRooted(slot) {
    let best = -1;
    let bestD = Infinity;
    const x = px[slot];
    const z = pz[slot];
    for (let r = 0; r < rockCount; r++) {
      const dx = x - rockX[r];
      const dz = z - rockZ[r];
      const d = dx * dx + dz * dz;
      if (d < bestD) { best = r; bestD = d; }
    }
    const rad = liveFamilyRadius[family[slot]];
    if (best >= 0 && bestD < 120 * 120) {
      const dx = x - rockX[best];
      const dz = z - rockZ[best];
      const d = Math.sqrt(bestD) || 1;
      px[slot] = rockX[best] + (dx / d) * (rockR[best] + rad + 2);
      pz[slot] = rockZ[best] + (dz / d) * (rockR[best] + rad + 2);
    }
    vx[slot] = 0;
    vz[slot] = 0;
    teleX[slot] = px[slot];
    teleZ[slot] = pz[slot];
    heading[slot] = Math.atan2(playerZ - pz[slot], playerX - px[slot]);
  }

  function parkBurrower(slot) {
    if (rockCount <= 0) return;
    let best = 0;
    let bestD = Infinity;
    const x = px[slot];
    const z = pz[slot];
    for (let r = 0; r < rockCount; r++) {
      const dx = x - rockX[r];
      const dz = z - rockZ[r];
      const d = dx * dx + dz * dz;
      if (d < bestD) { best = r; bestD = d; }
    }
    px[slot] = rockX[best];
    pz[slot] = rockZ[best];
    vx[slot] = 0;
    vz[slot] = 0;
    phase[slot] = BROOD_PHASE_BURIED;
    teleX[slot] = rockX[best];
    teleZ[slot] = rockZ[best];
    timer[slot] = 0;
  }

  function findFreeSlot() {
    for (let i = 0; i < CAP; i++) if (!alive[i]) return i;
    return -1;
  }

  // --- caches ------------------------------------------------------------------------------

  let playerX = 0;
  let playerZ = 0;
  let playerVX = 0;
  let playerVZ = 0;
  let playerRad = 6;
  let playerMass = 400;
  let playerRef = null;
  // The body the flock physically prosecutes this tick — the hot towed signature when one
  // rides the pilot's Massline, else the pilot. RW-02 second slice: the brood is blind, it
  // steers by the loudest signature on the line, not by the hull's outline. Steering,
  // telegraphs, splashes, latches, shoves, and the damage target all read through this ref,
  // so a cooled, severed, or eaten lure hands the signature back to the pilot next tick —
  // the same authored towed_lure threshold the seekers use, the same signature source.
  let signatureRef = null;

  function cachePlayer(state) {
    playerRef = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    const lure = playerTowedLure(state, state.player && state.player.tether);
    signatureRef = lure && lure.lure.hot === true ? lure.towed : playerRef;
    playerX = finite(signatureRef && signatureRef.pos && signatureRef.pos.x);
    playerZ = finite(signatureRef && signatureRef.pos && signatureRef.pos.z);
    playerVX = finite(signatureRef && signatureRef.vel && signatureRef.vel.x);
    playerVZ = finite(signatureRef && signatureRef.vel && signatureRef.vel.z);
    playerRad = finite(signatureRef && signatureRef.radius, 6);
    const body = signatureRef && resolvePhysicsBodySpec(signatureRef);
    playerMass = Math.max(1, finite(body?.mass, finite(signatureRef?.mass, 400)));
  }

  function playerOwnsBody(state, entity) {
    const playerId = state?.playerId;
    if (playerId == null || !entity) return false;
    if (entity.id === playerId) return true;
    const tether = state.player?.tether;
    if (tether?.active && tether.targetId === entity.id) return true;
    return readRecentImpulseProvenance(entity, state.tick)?.actorId === playerId;
  }

  // Observe native chunk motion, never infer a path across a gap, recycle or teleport.
  function observeBossChunk(e, tick, x, z, radius, dx, dz) {
    let history = chunkHistory.get(e);
    if (!history || history.generation !== e.occupantGeneration || history.radius !== radius) {
      history = { tick: tick, x: x, z: z,
        fromX: x, fromZ: z, swept: false,
        vx: dx, vz: dz,
        generation: e.occupantGeneration, radius: radius };
      chunkHistory.set(e, history);
    } else if (history.tick !== tick) {
      const consecutive = history.tick + 1 === tick;
      history.fromX = consecutive ? history.x : x;
      history.fromZ = consecutive ? history.z : z;
      const travel = Math.hypot(x - history.x, z - history.z);
      const possibleTravel = Math.max(Math.hypot(history.vx, history.vz),
        Math.hypot(dx, dz)) * DT + 0.01;
      history.swept = consecutive && travel <= possibleTravel;
      history.tick = tick; history.x = x; history.z = z;
      history.vx = dx; history.vz = dz;
    }
    return history;
  }

  function cacheRocks(state) {
    rockCount = 0;
    rockEntities.fill(null);
    const list = indexedTypeScan(state, 'asteroids');
    for (let i = 0; i < list.length && rockCount < ROCK_CACHE_MAX; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos) continue;
      // A pending Foundry Bank cannot turn an idle pilot into credited terrain.
      if (e.id === state.playerId && bank?.readPending && !swarmPilotHasActed(state)) continue;
      // The broad fallback must not also treat champion movers as terrain.
      if (e.type === 'wreck' && e.data?.swarmBossChunk === true) continue;
      if (e.collides === false) continue;
      // The Tendril head is never terrain — it plows the flock through the MOVER cache like
      // any heavy body. Under the index it never reaches this list anyway; on the un-indexed
      // fallback every entity lands here, and without the guard the worm eats its own neck.
      if (e.data && e.data.lootTableId === TENDRIL_HEAD_LOOT_ID) continue;
      rockEntities[rockCount] = e;
      rockCredited[rockCount] = playerOwnsBody(state, e) ? 1 : 0;
      rockX[rockCount] = finite(e.pos.x);
      rockZ[rockCount] = finite(e.pos.z);
      rockR[rockCount] = finite(e.radius, 10) * 1.05;
      rockVX[rockCount] = finite(e.vel && e.vel.x);
      rockVZ[rockCount] = finite(e.vel && e.vel.z);
      rockCount += 1;
    }
    // The same original can be left as shelter instead of thrown. Slow drift
    // uses the room's existing slide/slam law; fast flight stays exclusively in
    // the champion mover pass with its matched observation interval.
    const offcut = state.entities?.get?.(state.run?.telemetry?.foundryMawOffcut?.id);
    if (state.run?.wave < 6 || !isFoundryWreckKept(state, offcut)
      || !swarmPilotHasActed(state) || offcut.collides === false || offcut.physicsBody === false
      || !physicsBodyNativeReady(offcut) || Number.isFinite(offcut.data?.despawnAt)
      || !Number.isFinite(offcut.pos?.x) || !Number.isFinite(offcut.pos?.z)
      || !Number.isFinite(offcut.vel?.x) || !Number.isFinite(offcut.vel?.z)) return;
    const body = resolvePhysicsBodySpec(offcut);
    if (!body?.dynamic || body.material === 'sensor' || body.material === 'massline_sensor'
      || PHYSICS_MATERIALS[body.material]?.ghost === true
      || !(body.radius > 0) || !(body.mass >= BROOD_PLOW_MIN_MASS)) return;
    const history = observeBossChunk(offcut, state.tick, offcut.pos.x, offcut.pos.z,
      body.radius, offcut.vel.x, offcut.vel.z);
    const travel = history.swept ? Math.hypot(offcut.pos.x - history.fromX,
      offcut.pos.z - history.fromZ) / DT : 0;
    if (Math.max(travel, Math.hypot(offcut.vel.x, offcut.vel.z)) >= BROOD_PLOW_MIN_SPEED) return;
    rockEntities[rockCount] = offcut;
    rockX[rockCount] = offcut.pos.x; rockZ[rockCount] = offcut.pos.z;
    rockR[rockCount] = body.radius;
    rockVX[rockCount] = offcut.vel.x; rockVZ[rockCount] = offcut.vel.z;
    rockCredited[rockCount] = playerOwnsBody(state, offcut) ? 1 : 0;
    rockCount += 1;
  }

  function cacheMovers(state) {
    movCount = 0;
    linkMoverEntities.fill(null);
    chunkSwept.fill(0);
    chunkEntities.fill(null);
    headFound = false;
    const list = indexedShipLikeScan(state);
    const playerId = state.playerId;
    for (let i = 0; i < list.length && movCount < MOVER_CACHE_MAX; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || !e.vel) continue;
      if (e.type !== 'ship' && e.type !== 'drone') continue;
      // Native motion continues, but this held Bank has not admitted player rams yet.
      if (e.id === playerId && bank?.readPending && !swarmPilotHasActed(state)) continue;
      // The Tendril's head is the wave's champion hull — a real entity found by its catalog
      // stamp, the same read-only seam every other system uses to recognize a named hull.
      const isHead = e.data && e.data.lootTableId === TENDRIL_HEAD_LOOT_ID;
      if (isHead) {
        headX = finite(e.pos.x);
        headZ = finite(e.pos.z);
        headVX = finite(e.vel.x);
        headVZ = finite(e.vel.z);
        headFound = true;
      }
      linkMoverEntities[movCount] = e;
      movX[movCount] = finite(e.pos.x);
      movZ[movCount] = finite(e.pos.z);
      movVX[movCount] = finite(e.vel.x);
      movVZ[movCount] = finite(e.vel.z);
      movMass[movCount] = finite(e.mass, 1);
      movRad[movCount] = finite(e.radius, 6);
      movIsPlayer[movCount] = e.id === playerId ? 1 : 0;
      movCredited[movCount] = playerOwnsBody(state, e) ? 1 : 0;
      movIsHead[movCount] = isHead ? 1 : 0;
      movRemainId[movCount] = -1;
      movSplashR[movCount] = 0;
      movGlueS[movCount] = 0;
      movCount += 1;
    }
    // W-BLOOM-LOW remains: bodies the brood left are real thrown mass — the line's catch and
    // the free fling both plow the flock through this cache. Only payload entities carrying
    // the broodRemain stamp opt in; every other payload keeps its own semantics and stays out.
    const payloads = indexedTypeScan(state, 'payloads');
    for (let i = 0; i < payloads.length && movCount < MOVER_CACHE_MAX; i++) {
      const e = payloads[i];
      if (!e || e.alive === false || !e.pos || !e.vel) continue;
      const rem = e.data && e.data.broodRemain;
      if (!rem) continue;
      linkMoverEntities[movCount] = e;
      movX[movCount] = finite(e.pos.x);
      movZ[movCount] = finite(e.pos.z);
      movVX[movCount] = finite(e.vel.x);
      movVZ[movCount] = finite(e.vel.z);
      movMass[movCount] = finite(e.mass, 1);
      movRad[movCount] = finite(e.radius, 6);
      movIsPlayer[movCount] = 0;
      movCredited[movCount] = playerOwnsBody(state, e) ? 1 : 0;
      movIsHead[movCount] = 0;
      movRemainId[movCount] = e.id;
      movSplashR[movCount] = finite(rem.splashRadius);
      movGlueS[movCount] = finite(rem.glueS);
      movCount += 1;
    }
    bossChunkStart = movCount;
    cacheBossChunks(state);
  }

  const bossChunkCandidates = Array.from({ length: BOSS_CHUNK_CACHE_MAX }, () =>
    ({ entity: null, body: null, history: null, distance: Infinity }));

  function bossChunkTargetEligible(slot, simTime) {
    if (!alive[slot] || phase[slot] === BROOD_PHASE_LATCHED || phase[slot] === BROOD_PHASE_WRAPPED) return false;
    const def = liveFamilyDef[family[slot]];
    if (def?.burrows && (phase[slot] === BROOD_PHASE_BURIED || phase[slot] === BROOD_PHASE_WINDUP)) return false;
    // The ordinary flock's due fuse runs before contact. Keep that death's cause/owner.
    if (phase[slot] !== BROOD_PHASE_DASH && !def?.rooted && !def?.bounces
      && ((swellStage[slot] === 1 && simTime >= swellUntil[slot])
        || (primeUntil[slot] && simTime >= primeUntil[slot]))) return false;
    return true;
  }

  function bossChunkTargetObserved(state, slot) {
    if (!bossChunkTargetPhysical[slot] || chunkBornTick[slot] >= state.tick || cellObservedTick[slot] + 1 !== state.tick
      || cellObservedLife[slot] !== serial[slot]) return false;
    const possible = Math.max(Math.hypot(cellObservedVX[slot], cellObservedVZ[slot]),
      Math.hypot(vx[slot], vz[slot])) * DT + 0.01;
    return Math.hypot(px[slot] - cellObservedX[slot], pz[slot] - cellObservedZ[slot]) <= possible;
  }

  function cacheBossChunks(state) {
    if (!swarmPilotHasActed(state)) return;
    let count = 0;
    const wrecks = indexedTypeScan(state, 'wrecks');
    for (let i = 0; i < wrecks.length; i++) {
      const e = wrecks[i];
      if (!e || e.type !== 'wreck' || e.alive === false || e.collides === false
        || e.data?.swarmBossChunk !== true || e.data.physicalRole !== 'throw_mass'
        || !Number.isFinite(e.pos?.x) || !Number.isFinite(e.pos?.z)
        || !Number.isFinite(e.vel?.x) || !Number.isFinite(e.vel?.z)) continue;
      const body = resolvePhysicsBodySpec(e);
      if (!body?.dynamic || body.material === 'massline_sensor' || body.material === 'sensor'
        || !(Number.isFinite(body.mass) && body.mass >= BROOD_PLOW_MIN_MASS)
        || !(Number.isFinite(body.radius) && body.radius > 0)) continue;
      const history = observeBossChunk(e, state.tick, e.pos.x, e.pos.z, body.radius, e.vel.x, e.vel.z);
      const travel = history.swept ? Math.hypot(e.pos.x - history.fromX, e.pos.z - history.fromZ) / DT : 0;
      // Resting trophies are not weapons. Preserve a genuine fast crossing that just braked.
      if (Math.max(travel, Math.hypot(e.vel.x, e.vel.z)) < BROOD_PLOW_MIN_SPEED) continue;
      const fromX = history.swept ? history.fromX : e.pos.x;
      const fromZ = history.swept ? history.fromZ : e.pos.z;
      let distance = Infinity;
      // If many old chunks are still in flight, retain the paths nearest the actual
      // living crowd, not the first eight wreck IDs or whichever is nearest the pilot.
      // This ranks candidates only; the existing per-cell contact law decides every hit.
      for (let slot = 0; slot < CAP; slot++) {
        if (!bossChunkTargetEligible(slot, finite(state.simTime))) continue;
        const matched = history.swept && bossChunkTargetObserved(state, slot);
        const dx = matched ? fromX - cellObservedX[slot] : e.pos.x - px[slot];
        const dz = matched ? fromZ - cellObservedZ[slot] : e.pos.z - pz[slot];
        const mx = matched ? e.pos.x - fromX - (px[slot] - cellObservedX[slot]) : 0;
        const mz = matched ? e.pos.z - fromZ - (pz[slot] - cellObservedZ[slot]) : 0;
        const len2 = mx * mx + mz * mz;
        const t = len2 > 0 ? Math.max(0, Math.min(1, -(dx * mx + dz * mz) / len2)) : 0;
        distance = Math.min(distance, Math.hypot(dx + mx * t, dz + mz * t)
          - body.radius - liveFamilyRadius[family[slot]]);
      }
      for (let slot = 0; slot < TENDRIL_SEG_MAX; slot++) {
        if (!segAlive[slot]) continue;
        // Segments keep endpoint-only contact, so relevance claims no future path.
        distance = Math.min(distance, Math.hypot(e.pos.x - segX[slot], e.pos.z - segZ[slot])
          - body.radius - TENDRIL_SEG_RADIUS);
      }
      if (!Number.isFinite(distance) || (count === BOSS_CHUNK_CACHE_MAX
        && distance >= bossChunkCandidates[count - 1].distance)) continue;
      let at = Math.min(count, BOSS_CHUNK_CACHE_MAX - 1);
      const candidate = bossChunkCandidates[at];
      candidate.entity = e; candidate.body = body; candidate.history = history; candidate.distance = distance;
      while (at > 0 && bossChunkCandidates[at - 1].distance > distance) {
        bossChunkCandidates[at] = bossChunkCandidates[at - 1]; at--;
      }
      bossChunkCandidates[at] = candidate;
      count = Math.min(BOSS_CHUNK_CACHE_MAX, count + 1);
    }
    for (let i = 0; i < count; i++) {
      const { entity: e, body, history } = bossChunkCandidates[i];
      chunkEntities[movCount] = e;
      linkMoverEntities[movCount] = e;
      movX[movCount] = e.pos.x; movZ[movCount] = e.pos.z;
      movVX[movCount] = e.vel.x; movVZ[movCount] = e.vel.z;
      movMass[movCount] = body.mass; movRad[movCount] = body.radius;
      movIsPlayer[movCount] = 0; movIsHead[movCount] = 0;
      movCredited[movCount] = playerOwnsBody(state, e) ? 1 : 0;
      movRemainId[movCount] = -1; movSplashR[movCount] = 0; movGlueS[movCount] = 0;
      chunkFromX[movCount] = history.fromX; chunkFromZ[movCount] = history.fromZ;
      chunkSwept[movCount] = history.swept ? 1 : 0;
      movCount++;
    }
    // The selection is transient, never a second owner or an entity lifetime pin.
    for (const candidate of bossChunkCandidates) {
      candidate.entity = null; candidate.body = null; candidate.history = null;
    }
  }

  // Champion chunks compare the SAME observed interval for both participants,
  // before this tick advances the cells. Never pair last tick's native flight with
  // the target's next movement, or test the same chunk again in the later plow pass.
  function sweepBossChunks(state) {
    if (bossChunkResolvedTick === state.tick) return true;
    bossChunkResolvedTick = state.tick;
    const run = liveSwarmRun(state), epoch = chunkEpoch;
    for (let i = 0; i < CAP; i++) {
      if (!bossChunkTargetEligible(i, finite(state.simTime))) continue;
      const tx = px[i], tz = pz[i], rad = liveFamilyRadius[family[i]];
      const cx = tx - cellObservedX[i], cz = tz - cellObservedZ[i];
      const observed = bossChunkTargetObserved(state, i);
      let first = Infinity, contact = -1, hitX = tx, hitZ = tz;
      for (let m = bossChunkStart; m < movCount; m++) {
        const entity = chunkEntities[m];
        if (!entity || entity.alive === false || state.entities?.get?.(entity.id) !== entity
          || chunkHistory.get(entity)?.generation !== entity.occupantGeneration) continue;
        let at = null;
        if (chunkSwept[m] && observed) {
          const mx = movX[m] - chunkFromX[m], mz = movZ[m] - chunkFromZ[m];
          const rx = mx - cx, rz = mz - cz, floor = BROOD_PLOW_MIN_SPEED * DT;
          if (mx * mx + mz * mz >= floor * floor && rx * rx + rz * rz >= floor * floor) {
            chunkSweepFrom.x = chunkFromX[m] - cellObservedX[i];
            chunkSweepFrom.z = chunkFromZ[m] - cellObservedZ[i];
            chunkSweepTo.x = movX[m] - tx; chunkSweepTo.z = movZ[m] - tz;
            at = segmentCircleT(chunkSweepFrom, chunkSweepTo, 0, 0, movRad[m] + rad);
          }
        }
        // First observations and newly born lives still have real current contact,
        // but cannot inherit a path sampled before they existed.
        let endpoint = false;
        if (at == null) {
          const dx = tx - movX[m], dz = tz - movZ[m], reach = rad + movRad[m];
          const rx = movVX[m] - vx[i], rz = movVZ[m] - vz[i];
          if (dx * dx + dz * dz <= reach * reach
            && rx * rx + rz * rz >= BROOD_PLOW_MIN_SPEED * BROOD_PLOW_MIN_SPEED) {
            at = 1; endpoint = true;
          }
        }
        if (at == null || at >= first) continue;
        first = at; contact = m;
        hitX = endpoint ? tx : cellObservedX[i] + cx * at;
        hitZ = endpoint ? tz : cellObservedZ[i] + cz * at;
      }
      if (contact < 0) continue;
      kill(i, 'collision', hitX, hitZ, !!movCredited[contact] || creditUntil[i] > finite(state.simTime));
      if (epoch !== chunkEpoch || run !== liveSwarmRun(state)
        || run?.phase !== 'active' || state.mode !== 'flight') return false;
    }
    return true;
  }

  function rebuildGrid() {
    gridHead.fill(-1);
    gridMaxSpeed = 0;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const cx = gridCellX[i] = Math.floor(px[i] / CELL);
      const cz = gridCellZ[i] = Math.floor(pz[i] / CELL);
      gridMaxSpeed = Math.max(gridMaxSpeed, Math.hypot(vx[i], vz[i]));
      const key = cellKey(cx, cz);
      gridNext[i] = gridHead[key];
      gridHead[key] = i;
    }
    gridReady = true;
  }

  // --- the step ---------------------------------------------------------------------------

  function step(state) {
    const run = liveSwarmRun(state);
    if (!run || run.phase !== 'active' || state.mode !== 'flight') return false;
    if (foundryScore && foundryLastTick !== state.tick) {
      foundryLastTick = state.tick;
      if (swarmPilotHasActed(state)) foundryTicks = Math.min(Math.max(720, foundryScore.broodReadTicks), foundryTicks + 1);
    }
    validateOpeningCourse(state);
    if (openingBeat) {
      if (openingBeat.lastTick !== state.tick) {
        openingBeat.lastTick = state.tick;
        if (swarmPilotHasActed(state)) {
          if (openingBeat.attackPending) {
            for (const { slot, life } of openingBeat.lives) if (alive[slot] && serial[slot] === life) {
              attackAfter[slot] = finite(state.simTime) + BROOD_ATTACK_ARRIVAL_S;
            }
            openingBeat.attackPending = false;
          }
          openingBeat.remaining = Math.max(0, openingBeat.remaining - DT);
        }
      }
      if (!openingBeatHasLives() || openingBeat.remaining <= 1e-8) {
        openingBeat = null;
        nextSpawnAttemptAt = 0;
      }
    }
    if (openingRamp && !openingBeat && (!foundryScore || swarmPilotHasActed(state)) && openingRamp.lastTick !== state.tick) {
      openingRamp.lastTick = state.tick;
      openingRamp.remaining = Math.max(0, openingRamp.remaining - DT);
    }
    if (spawnRequested && pendingPlan?.length && finite(state.simTime) >= nextSpawnAttemptAt) spawnWave(state);
    // The Tendril wave keeps stepping while the body may still exist — the champion hull can
    // materialize after the flock dies, and the chain outlives it by exactly one collapse.
    const tendrilWatching = tendrilMode && !tendrilDone;
    // B4 — the sac reserve keeps the step alive too: the Hive's tide may still be held.
    // But a held tide is deliverable only while a live unspent sac still births on its
    // cadence. Every sac killed before its share hatches strands that share on purpose
    // ("the tide the player cut"), and a budget that has stayed silent past two full
    // cadences has no sac left to deliver it — it must not hold the step's door open.
    // Without this read, an emptied Hive room whose sacs all died unspent grinds the
    // whole engine (player/rock/mover caches, the grid, the aura and link passes) on
    // zero bodies every tick until the wave refit. The budget itself stays accounted:
    // the strand is the authored tide, now named where the room can read it.
    const sacTidePending = sacTidePendingAt(finite(state.simTime));
    // B5 — so does an armed late reserve whose drop clock has already been set.
    const reservePending = reserveBudget > 0 && Number.isFinite(reserveReleaseAt);
    if (aliveCount <= 0 && lobCount <= 0 && poolCount <= 0 && segAliveCount <= 0
      && !tendrilWatching && !sacTidePending && !reservePending) { publish(); return false; }

    cachePlayer(state);
    cacheRocks(state);
    cacheMovers(state);
    rebuildGrid();
    // B6 — the commander strain's pack buff: every body inside a live leader's
    // authored radius takes the flag. The pass walks the same spatial hash the
    // flock scans, once per live leader (the count band keeps that handful small)
    // — and it runs off the LIVE marks, so killing a leader drops its aura on this
    // very tick. Leaders never flag each other: the pack does the whipping, not
    // the head. `cmdAccel`/`cmdSpeed` are the strain row's own multipliers over the
    // flock's ordinary dive force and speed cap.
    commandBuff.fill(0);
    let cmdAccel = 1;
    let cmdSpeed = 1;
    if (strainDef && strainDef.commandRadius > 0 && strainMark > 0) {
      const cmdR = strainDef.commandRadius;
      const cmdR2 = cmdR * cmdR;
      const span = Math.ceil(cmdR / CELL);
      for (let c = 0; c < CAP; c++) {
        if (!alive[c] || affix[c] !== strainMark) continue;
        const ccx = Math.floor(px[c] / CELL);
        const ccz = Math.floor(pz[c] / CELL);
        for (let gx = ccx - span; gx <= ccx + span; gx++) {
          for (let gz = ccz - span; gz <= ccz + span; gz++) {
            for (let j = gridHead[cellKey(gx, gz)]; j !== -1; j = gridNext[j]) {
              if (!alive[j] || affix[j] === strainMark) continue;
              const dx = px[j] - px[c];
              const dz = pz[j] - pz[c];
              if (dx * dx + dz * dz <= cmdR2) commandBuff[j] = 1;
            }
          }
        }
      }
      cmdAccel = finite(strainDef.commandAccel, 1);
      cmdSpeed = finite(strainDef.commandSpeed, 1);
    }
    const simTime = finite(state.simTime);
    advanceBank(simTime);
    // The Machine's link pass: rebuild the shield flags off the live links the same
    // way the commander's aura rebuilds off the live marks — a broken beam drops its
    // partner's protection this same tick. A thrown body crossing the beam is the
    // authored break: the shield was never the partner's hull.
    shielded.fill(0);
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const linkDef = liveFamilyDef[family[i]];
      if (!linkDef || !linkDef.linkShield) continue;
      stepLinkUpkeep(i, linkDef, simTime);
      const partner = linkPartner[i];
      if (partner >= 0 && alive[partner] && shielded[partner] === 0) shielded[partner] = 1;
    }
    // B5 — the held specialist group drops once, mid-wave, through the same gate ring.
    if (reservePending && finite(state.simTime) >= reserveReleaseAt) releaseReserve(state);
    killCount.fill(0);
    creditedCount.fill(0);
    killCredits.fill(0);
    killScore.fill(0);

    if (!sweepBossChunks(state)) return false;
    if (run !== liveSwarmRun(state) || run.phase !== 'active' || state.mode !== 'flight') return false;
    // Record the same interval's start before virtual movement; next step compares
    // this real observation to the current position, alongside native payload history.
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      bossChunkTargetPhysical[i] = bossChunkTargetEligible(i, simTime) ? 1 : 0;
      cellObservedTick[i] = state.tick; cellObservedLife[i] = serial[i];
      cellObservedX[i] = px[i]; cellObservedZ[i] = pz[i];
      cellObservedVX[i] = vx[i]; cellObservedVZ[i] = vz[i];
    }

    const fields = fieldList() || EMPTY_FIELDS;
    const dt = DT;
    attackClock = simTime;
    // Windups, committed passes and airborne lobs share one attention budget. Never cancel
    // a committed attack; just defer the next tell until the room has a readable opening.
    attackSlots = broodAttackLimit(liveWave) - lobCount;
    for (let i = 0; i < CAP; i++) {
      if (alive[i] && (phase[i] === BROOD_PHASE_WINDUP || phase[i] === BROOD_PHASE_DASH)) attackSlots--;
    }
    brakeDvBudget = Math.min(Math.hypot(playerVX, playerVZ),
      BROOD_LEECHER_BRAKE_ACCEL * dt * BROOD_LEECHER_STACK_MAX);
    playerFields.length = 0;
    for (const field of fields) {
      if (state.playerId != null && field?.ownerId === state.playerId) playerFields.push(field);
    }
    const dragKeep = Math.max(0, 1 - BROOD_DRAG_PER_S * dt);
    const fieldsEmpty = fields.length === 0;
    const linkR2 = BROOD_LINK_RADIUS * BROOD_LINK_RADIUS;
    const sepR = BROOD_SEP_RADIUS;

    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const fam = family[i];
      const def = liveFamilyDef[fam];
      // B6 — the commander's aura: a flagged body hunts under the strain's own
      // multipliers this tick (dive force and speed cap below). Off-flag, the
      // ordinary law — the flag never rewrites a baseline.
      const hot = commandBuff[i] === 1;

      // W-BLOOM-LOW leech glue: a sticky remain latched on — the body crawls against its own
      // steering until the clock lets go, dash bodies included (a pinned pass never lands).
      // The glue dies with the cell; a freed body keeps its motion the moment it is out.
      if (gluedUntil[i] > simTime) {
        vx[i] *= BROOD_GLUE_KEEP;
        vz[i] *= BROOD_GLUE_KEEP;
      }

      // -- latched leechers ride the host: glue position, brake, shed by wall scrape
      if (phase[i] === BROOD_PHASE_LATCHED) {
        stepLatched(i, fam, dt, state);
        continue;
      }

      // -- a wrapped eel rides the host the same way: constrict, shed by the same scrape
      if (phase[i] === BROOD_PHASE_WRAPPED) {
        stepWrapped(i, fam, dt);
        continue;
      }

      // A buried burrower stays inside its rock. Windup holds that same point so the
      // telegraph finishes before the body leaves the silhouette. Rock contact would
      // shove or kill a body parked in the stone, so this path skips it.
      if (def && def.burrows
          && (phase[i] === BROOD_PHASE_BURIED || phase[i] === BROOD_PHASE_WINDUP)) {
        stepBurrower(i, def, dt);
        continue;
      }

      const bx = px[i];
      const bz = pz[i];

      // -- the committed pass: fixed velocity, no steering, until it lands, times out —
      //    or meets a rock (the dodge reward; the contact deaths below handle that).
      if (phase[i] === BROOD_PHASE_DASH) {
        px[i] += vx[i] * dt;
        pz[i] += vz[i] * dt;
        stepChargerDash(i, fam, state);
      } else if (def && def.rooted) {
        // The Machine's planted bodies: pinned to the root point the whole life — no
        // flock, no seek, no integrate. The beam turret's own FSM is the only motion
        // it owns; contact law below still decides what thrown mass does to it.
        stepRootedBody(i, def, simTime);
      } else if (def && def.bounces) {
        // The sawblade is ballistic — no flock, no seek, no steering at all. It keeps
        // its own powered speed, reflects off rock and bounds, and cuts the pack by
        // the room's own relative-velocity law.
        stepSawblade(i, def, dt, simTime, state);
      } else {

        // -- flocking: neighbor forces through the spatial hash (3x3 cells covers both radii)
        let sepx = 0, sepz = 0;
        let cohx = 0, cohz = 0, alix = 0, aliz = 0, linkn = 0;
        const cx0 = Math.floor(bx / CELL);
        const cz0 = Math.floor(bz / CELL);
        for (let gx = cx0 - 1; gx <= cx0 + 1; gx++) {
          for (let gz = cz0 - 1; gz <= cz0 + 1; gz++) {
            let j = gridHead[cellKey(gx, gz)];
            while (j !== -1) {
              if (j !== i && alive[j] && phase[j] !== BROOD_PHASE_LATCHED
                  && phase[j] !== BROOD_PHASE_WRAPPED) {
                const dx = px[j] - bx;
                const dz = pz[j] - bz;
                const d2 = dx * dx + dz * dz;
                if (d2 < linkR2 && d2 > 1e-6) {
                  cohx += px[j]; cohz += pz[j];
                  alix += vx[j]; aliz += vz[j];
                  linkn += 1;
                  if (d2 < sepR * sepR) {
                    const d = Math.sqrt(d2);
                    const push = (1 - d / sepR) * 90 / d;
                    sepx -= dx * push;
                    sepz -= dz * push;
                  }
                }
              }
              j = gridNext[j];
            }
          }
        }

        let ax = sepx;
        let az = sepz;
        if (linkn > 0) {
          const inv = 1 / linkn;
          // cohesion: steer toward the flock centre; alignment: steer toward the flock heading
          ax += (cohx * inv - bx) * 1.6;
          az += (cohz * inv - bz) * 1.6;
          ax += (alix * inv - vx[i]) * 1.1;
          az += (aliz * inv - vz[i]) * 1.1;
        }

        // -- the family's stalk differs before its attack; the mite simply seeks and dives
        const dxp = playerX - bx;
        const dzp = playerZ - bz;
        const dp = Math.sqrt(dxp * dxp + dzp * dzp);
        // The Machine's movers steer to their own business instead of the signature's
        // dive: a formation body rides its squad anchor, a linker hovers on its charge,
        // a salvager runs down wreckage. Flocking forces above still apply — the squad
        // reads inside the room, not beside it.
        const machineSteer = def && (def.formation || def.linkShield || def.repairs || def.assembles);
        if (!machineSteer && dp > 24 && dp > 1e-4) {
          const diveT = simTime * 0.42 + seedPhase[i];
          // A commander-flagged body presses the signature the strain's own factor
          // harder — same dive clock, a hotter seek.
          const seek = ((diveT % 1) < 0.22 ? 26 : 9) * (hot ? cmdAccel : 1);
          ax += (dxp / dp) * seek;
          az += (dzp / dp) * seek;
        }
        if (machineSteer) {
          machineAccel.ax = ax;
          machineAccel.az = az;
          if (def.formation) steerFormation(i, def, simTime, machineAccel);
          else if (def.linkShield) steerLinker(i, def, machineAccel);
          else steerSalvager(i, def, simTime, machineAccel);
          ax = machineAccel.ax;
          az = machineAccel.az;
        }
        // wake_eel `trails`: the eel does not seek the hull, it rides the wake — steer to
        // a point astern of the signature's velocity so it wraps from behind. A coiling
        // eel has already committed: it plants with the tell instead of chasing the wake.
        if (def && def.trails && phase[i] !== BROOD_PHASE_WINDUP) {
          const tx = playerX - playerVX * 0.9;
          const tz = playerZ - playerVZ * 0.9;
          const tdx = tx - bx;
          const tdz = tz - bz;
          const td = Math.sqrt(tdx * tdx + tdz * tdz);
          if (td > 1e-4) {
            ax += (tdx / td) * 22;
            az += (tdz / td) * 22;
          }
        }
        // lantern_cyst `seeksHeat`+`primeRange`: inside the glow range the cyst primes —
        // primeS later it detonates itself whether or not anything touched it.
        if (def && def.primeRange > 0) {
          if (dp <= def.primeRange) {
            // The arming is the prime family's tell — "the glow brightens", "it is alight",
            // "winding up astern" — spoken once per approach; leaving range re-arms it.
            if (!primeUntil[i]) {
              primeUntil[i] = simTime + (def.primeS || 1.1);
              emitTelegraph(i, def);
            }
          } else {
            primeUntil[i] = 0;
          }
        }
        // spore_drift `hazard`+`slowRadius`: the cloud is not an attack — inside it the
        // signature decelerates as the haze clings to the hull.
        if (def && def.hazard && def.slowRadius > 0 && dp < def.slowRadius
            && signatureRef && signatureRef.vel) {
          const speed = Math.hypot(playerVX, playerVZ);
          if (speed > 1e-3) {
            const decel = Math.min(speed, (def.slowAccel || 20) * dt);
            signatureRef.vel.x -= (playerVX / speed) * decel;
            signatureRef.vel.z -= (playerVZ / speed) * decel;
            // The bite is the hazard family's tell — "it clings", "the drag is on you" —
            // spoken once per hold; a fresh hold after shedding the radius speaks again.
            if (!dragTold[i]) {
              dragTold[i] = 1;
              emitTelegraph(i, def);
            }
          }
        } else if (def && def.hazard) {
          dragTold[i] = 0;
        }
        // bellows fuse: an armed bellows detonates on its own clock (swells two-hit law).
        if (swellStage[i] === 1 && simTime >= swellUntil[i]) {
          kill(i, 'explosive', px[i], pz[i]);
          continue;
        }
        // The family's own proximity fuse is an environmental burst. A real
        // shot/throw still enters its existing credited damage/contact path.
        if (primeUntil[i] && simTime >= primeUntil[i]) {
          kill(i, 'explosive', px[i], pz[i], false);
          continue;
        }

        // -- B-BLOOM panic: while the window is live the cascade replaces the ordinary
        // jitter — scatter bolts outward from the trigger centroid, the knot converges
        // back onto it. The room's fields below still add on top: a panicking pack is
        // still mass in the room's physics, the same law the current-rider keeps. Only
        // plain flocking panics: a windup holds so the telegraph tells the truth, a
        // committed dash runs its line, a staged bank beat runs its own language — the
        // attack language outranks the cascade. Inside the knot radius the override lets
        // go: the ball has re-formed and the pack's own cohesion holds it tight. Grief
        // yields while the fresher cascade runs and resumes on its own clock when the
        // panic lets go.
        if (panicUntil[i] > simTime && phase[i] === BROOD_PHASE_FLOCK && !bankStaged(i)) {
          const pdx = bx - panicX[i];
          const pdz = bz - panicZ[i];
          const pd = Math.hypot(pdx, pdz) || 1;
          ax = (pdx / pd) * BROOD_PANIC_SCATTER_ACCEL;
          az = (pdz / pd) * BROOD_PANIC_SCATTER_ACCEL;
        } else if (knotUntil[i] > simTime && phase[i] === BROOD_PHASE_FLOCK && !bankStaged(i)) {
          const kdx = panicX[i] - bx;
          const kdz = panicZ[i] - bz;
          const kd = Math.hypot(kdx, kdz);
          if (kd > BROOD_PANIC_KNOT_RADIUS) {
            ax = (kdx / kd) * BROOD_PANIC_REFORM_ACCEL;
            az = (kdz / kd) * BROOD_PANIC_REFORM_ACCEL;
          }
        } else if (aggrUntil[i] > simTime && phase[i] === BROOD_PHASE_FLOCK && !bankStaged(i)) {
          // -- B-BLOOM aggression: the relay was hit — the brood stops feeding and rushes
          // the player together, tracking the LIVE signature for its whole authored window.
          // The room's fields still add on top below: a rushing pack is still mass in the
          // room's physics, the same law the panic keeps.
          if (dp > 1e-4) {
            ax = (dxp / dp) * BROOD_AGGRESSION_ACCEL;
            az = (dzp / dp) * BROOD_AGGRESSION_ACCEL;
          }
        }

        // -- the room's fields: the SAME kernel the ships feel, sampled at the brood's own point
        if (!fieldsEmpty) {
          posScratch.x = px[i];
          posScratch.z = pz[i];
          velScratch.x = vx[i];
          velScratch.z = vz[i];
          fieldProfileScratch.mass = liveFamilyMass[fam];
          fieldProfileScratch.id = serial[i];
          sampleFieldAcceleration(posScratch, velScratch, fields, simTime, fieldProfileScratch, accel);
          ax += accel.ax;
          az += accel.az;
          if (playerFields.length) {
            sampleFieldAcceleration(posScratch, velScratch, playerFields, simTime, fieldProfileScratch, creditAccel);
            if (Math.abs(creditAccel.ax) + Math.abs(creditAccel.az) > 1e-6) creditUntil[i] = simTime + BROOD_CREDIT_WINDOW_S;
          }
        }
        // -- B-BLOOM grief: a mourner bends toward its corpse until it reaches the mourning
        // ring or the clock lets go. Only plain flocking bends: a windup holds so the
        // telegraph tells the truth, a committed dash runs the line it drew, a latched
        // body rides its host, a staged bank beat runs its own language — the attack
        // language outranks the mourning. A live panic or aggression window outranks it
        // too (the fresher cascade replaces the jitter; the grief clock keeps running
        // underneath and resumes when the window lets go). The bend rides the ordinary
        // integration below, so the family speed cap and the drag stay honest.
        if (griefUntil[i] > simTime && panicUntil[i] <= simTime && knotUntil[i] <= simTime
            && aggrUntil[i] <= simTime
            && phase[i] === BROOD_PHASE_FLOCK && !bankStaged(i)) {
          const gdx = griefX[i] - bx;
          const gdz = griefZ[i] - bz;
          const gd = Math.hypot(gdx, gdz);
          if (gd > BROOD_GRIEF_RING) {
            ax += (gdx / gd) * BROOD_GRIEF_ACCEL;
            az += (gdz / gd) * BROOD_GRIEF_ACCEL;
          }
        }

        // The brood mother walks at her authored speed. Flock separation would
        // otherwise pin her inside the mite ball while she drops the tide.
        if (def && def.births && dp > 1e-4) {
          const walk = liveFamilySpeed[fam] * BROOD_DRAG_PER_S;
          ax = (dxp / dp) * walk;
          az = (dzp / dp) * walk;
        }

        // -- integrate (semi-implicit Euler, the sim's shape)
        vx[i] = (vx[i] + ax * dt) * dragKeep;
        vz[i] = (vz[i] + az * dt) * dragKeep;
        const speed2 = vx[i] * vx[i] + vz[i] * vz[i];
        // A commander-flagged body runs the strain's own factor faster — the hard
        // BROOD_MAX_SPEED clamp still holds above it.
        const speedCap = liveFamilySpeed[fam] * 2.4 * (hot ? cmdSpeed : 1);
        const cap2 = Math.min(BROOD_MAX_SPEED * BROOD_MAX_SPEED, speedCap * speedCap);
        if (speed2 > cap2) {
          const k = Math.sqrt(cap2 / speed2);
          vx[i] *= k;
          vz[i] *= k;
        }
        px[i] += vx[i] * dt;
        pz[i] += vz[i] * dt;
        if (speed2 > 4) {
          const target = Math.atan2(vz[i], vx[i]);
          let d = target - heading[i];
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          heading[i] += d * Math.min(1, 8 * dt);
        }

        // -- the attack language (B2). A windup holds position so the telegraph tells the truth.
        if (def && phase[i] === BROOD_PHASE_WINDUP) {
          // hold: the body plants while its marker/line speaks
          vx[i] *= 0.7;
          vz[i] *= 0.7;
          // The eel's coil is a windup with an out: leave the authored reach and it whiffs.
          if (def.wrapRange > 0
              && (dp > def.wrapRange || !signatureRef || signatureRef.alive === false)) {
            phase[i] = BROOD_PHASE_FLOCK;
            timer[i] = 0;
            attackAfter[i] = simTime + BROOD_WRAP_RETRY_S;
          } else if (channelEntity[i] >= 0 && !trackChannel(i, def)) {
            // The salvager's channel aborts the moment its wreck stops being there —
            // caught by the pilot, spent, flung out of reach, or pulped mid-weld.
            phase[i] = BROOD_PHASE_FLOCK;
            timer[i] = 0;
            channelEntity[i] = -1;
            channelTold[i] = 0;
            channelSource[i] = null;
          } else {
            timer[i] -= dt;
            if (timer[i] <= 0) {
              if (def.id === 'spitter') fireLob(i, fam);
              else if (def.id === 'charger') beginDash(i, fam);
              else if (def.wrapRange > 0) beginWrap(i, fam);
              else if (channelEntity[i] >= 0) { if (!finishChannel(i, def)) return false; }
              else if (def.formation) beginFormationDash(i, def);
              else phase[i] = BROOD_PHASE_FLOCK;
            }
          }
        } else if (def && def.id === 'spitter') {
          stepSpitter(i, def, dp, dt);
        } else if (def && def.id === 'charger') {
          stepCharger(i, def, dp);
        } else if (def && def.id === 'leecher') {
          stepLeecher(i, fam, dp);
        } else if (def && def.wrapRange > 0) {
          stepEelWrap(i, def, dp);
        } else if (def && (def.repairs || def.assembles)) {
          stepSalvagerArm(i, def, simTime);
        } else if (def && def.formation) {
          stepFormationPeel(i, def, simTime, dp);
        }
        if (def && def.births) stepMother(i, def, dt, simTime);
      }

      // -- deaths by contact: rocks. The room's walls are ammunition too — and a rock that is
      //    MOVING fast relative to the body is a thrown rock: the kill reads collision
      //    (SLUNG), not terrain (SLAMMED). Whose momentum did the work decides the word.
      const rad = liveFamilyRadius[fam];
      for (let r = 0; r < rockCount; r++) {
        const dx = px[i] - rockX[r];
        const dz = pz[i] - rockZ[r];
        const rr = rockR[r] + rad;
        if (dx * dx + dz * dz > rr * rr) continue;
        const relx = rockVX[r] - vx[i];
        const relz = rockVZ[r] - vz[i];
        const rel2 = relx * relx + relz * relz;
        const moving = rel2 >= BROOD_PLOW_MIN_SPEED * BROOD_PLOW_MIN_SPEED;
        const slam = liveFamilySpeed[fam] * BROOD_TERRAIN_SLAM_FACTOR;
        if (moving && (rockVX[r] * rockVX[r] + rockVZ[r] * rockVZ[r]) >= BROOD_PLOW_MIN_SPEED * BROOD_PLOW_MIN_SPEED) {
          kill(i, 'collision', px[i], pz[i], !!rockCredited[r] || creditUntil[i] > simTime);
          break;
        }
        // The sawblade does not die on the room's face — it ricochets: reflect off the
        // contact normal and keep flying. A still wall is its racket, not its grave; a
        // THROWN rock still cracks it by the mass law above.
        if (def && def.bounces) {
          const d = Math.sqrt(dx * dx + dz * dz) || 1;
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          px[i] = rockX[r] + nx * rr;
          pz[i] = rockZ[r] + nz * rr;
          const into = (vx[i] - rockVX[r]) * nx + (vz[i] - rockVZ[r]) * nz;
          if (into < 0) {
            vx[i] -= 2 * into * nx;
            vz[i] -= 2 * into * nz;
          }
          break;
        }
        // A rooted body is pinned to its own point — the slide solve would walk it off
        // the face it planted on. It repins next tick regardless.
        if (def && def.rooted) break;
        if (rel2 >= slam * slam) {
          // S3 fair credit: the dash is the body's own committed attack steer — a brood
          // that suicides on the room's face is machinery the player did not trigger,
          // an environmental death like any drifting body's slam. Only the player's own
          // momentum (a shoved rock, a recent impulse window) earns the credit.
          kill(i, 'terrain', px[i], pz[i], !!rockCredited[r] || creditUntil[i] > simTime);
          break;
        }
        // A body under its own steering meets the rock and slides along its face.
        const d = Math.sqrt(dx * dx + dz * dz);
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        px[i] = rockX[r] + nx * rr;
        pz[i] = rockZ[r] + nz * rr;
        const into = (vx[i] - rockVX[r]) * nx + (vz[i] - rockVZ[r]) * nz;
        if (into < 0) {
          vx[i] -= into * nx;
          vz[i] -= into * nz;
        }
        break;
      }
      if (!alive[i]) continue;

      // -- deaths by plow: a heavy body moving fast through the pack. The throw, the swing,
      //    the ship itself — whatever the massline latches and releases is exactly such a body.
      for (let m = 0; m < bossChunkStart; m++) {
        const dx = px[i] - movX[m];
        const dz = pz[i] - movZ[m];
        const rr = movRad[m] + rad;
        if (dx * dx + dz * dz > rr * rr) continue;
        // W-BLOOM-LOW leech: a sticky remain adheres on any touch — the body is pinned, not
        // killed, and the leech is spent. Glue beats feeding the dash another ram.
        if (movGlueS[m] > 0) {
          gluedUntil[i] = Math.max(gluedUntil[i], simTime + movGlueS[m]);
          vx[i] *= 0.08;
          vz[i] *= 0.08;
          emitRemainSpent(m);
          break;
        }
        const relx = movVX[m] - vx[i];
        const relz = movVZ[m] - vz[i];
        const relSpeed2 = relx * relx + relz * relz;
        const isPlayer = movIsPlayer[m] === 1;
        const ramSpeed = isPlayer ? BROOD_PLAYER_RAM_SPEED : BROOD_PLOW_MIN_SPEED;
        // The mass gate keeps ambient pebbles from shredding the brood; a remain is a thrown
        // weapon the kill authored, so speed alone decides whether it lands.
        if (relSpeed2 >= ramSpeed * ramSpeed && (isPlayer || movMass[m] >= BROOD_PLOW_MIN_MASS || movRemainId[m] >= 0)) {
          const credited = !!movCredited[m] || creditUntil[i] > simTime;
          kill(i, 'collision', px[i], pz[i], credited);
          // W-BLOOM-LOW burst remains: an acid sac or a glass shard shatters on impact and
          // its splash kills by 'explosive' law — each hit family's own kill-gate decides.
          if (movSplashR[m] > 0) {
            splashKillAround(px[i], pz[i], movSplashR[m], credited);
            emitRemainSpent(m);
          }
          break;
        }
      }
    }

    sweepWhipLine(state);
    stepLobs(state, dt);
    stepPools(state, dt);
    stepBeams(simTime);
    stepTendril(state, dt, simTime);
    flushKills(state);
    publish();
    return true;
  }

  // --- the family's tell: one line, once per attack-language beat ----------------------------
  //
  // Every family authors {bark,line,cue} (src/data/swarmBrood.js) and the announce subscriber
  // speaks it rate-limited; the engine's law is one emit per REAL telegraph transition — a
  // windup arming, a prime, a latch, a swell, a grip — never per tick. Families whose
  // authored line describes a standing property instead of a transition stay silent: the
  // mite's dive is the flock itself, and the glassback's and keelback's armor never leaves
  // FLOCK.
  function emitTelegraph(i, def) {
    if (!bus || !def) return;
    const tele = def.telegraph;
    if (!tele || typeof tele.line !== 'string' || !tele.line) return;
    bus.emit('swarm:broodTelegraph', {
      familyId: def.id,
      bark: tele.bark,
      line: tele.line,
      cue: tele.cue,
      pos: { x: px[i], z: pz[i] },
    });
  }

  // --- the spitter: a marked arc, then a splash that stays a beat ---------------------------

  function stepBurrower(i, def, dt) {
    px[i] = teleX[i];
    pz[i] = teleZ[i];
    vx[i] = 0;
    vz[i] = 0;
    if (phase[i] === BROOD_PHASE_BURIED) {
      const dx = playerX - px[i];
      const dz = playerZ - pz[i];
      const range = def.burstRange > 0 ? def.burstRange : 64;
      if (dx * dx + dz * dz > range * range) return;
      emitTelegraph(i, def);
      phase[i] = BROOD_PHASE_WINDUP;
      timer[i] = def.windupS > 0 ? def.windupS : 0.5;
      return;
    }
    timer[i] -= dt;
    if (timer[i] > 0) return;
    const dx = playerX - px[i];
    const dz = playerZ - pz[i];
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    let exit = liveFamilyRadius[family[i]] + 4;
    for (let r = 0; r < rockCount; r++) {
      const rdx = rockX[r] - teleX[i];
      const rdz = rockZ[r] - teleZ[i];
      if (rdx * rdx + rdz * rdz < 1) {
        exit = rockR[r] + liveFamilyRadius[family[i]] + 2;
        break;
      }
    }
    const speed = liveFamilySpeed[family[i]];
    vx[i] = (dx / d) * speed;
    vz[i] = (dz / d) * speed;
    px[i] += (dx / d) * exit;
    pz[i] += (dz / d) * exit;
    phase[i] = BROOD_PHASE_FLOCK;
    timer[i] = 0;
  }

  function takeAttackSlot() {
    if (attackSlots <= 0 || attackClock + 1e-9 < nextAttackAt) return false;
    attackSlots--;
    nextAttackAt = attackClock + BROOD_ATTACK_GAP_S;
    return true;
  }

  function bankLife(slot, life) { return alive[slot] && serial[slot] === life; }

  // B-BLOOM yield: a staged bank slot runs its own beat. The composition's attack language
  // outranks the cascades exactly like the windup hold does — without this, a mourner's bend
  // (or a panic bolt) walks the NEXT staged pass off its flank into the room's scrum before
  // its stage ever calls it, and the authored beat dies of room noise. The room's mourning
  // keeps everything else it had: unstaged cells bend, the clock runs, nothing is cancelled.
  function bankStaged(i) {
    return bank != null
      && ((i === bank.first && serial[i] === bank.firstLife)
        || (i === bank.spit && serial[i] === bank.spitLife)
        || (i === bank.second && serial[i] === bank.secondLife));
  }

  function advanceBank(now) {
    if (!bank) return;
    if (bank.readPending) {
      if (!swarmPilotHasActed(getState())) return;
      bank.until = now + foundryScore.bankReadS;
      bank.readPending = false;
    }
    if (now >= bank.until) { bank = null; return; }
    const firstAlive = bankLife(bank.first, bank.firstLife);
    if (bank.phase === 'first' && (!firstAlive
        || phase[bank.first] === BROOD_PHASE_DASH || phase[bank.first] === BROOD_PHASE_RECOVER)) {
      bank.phase = 'spit';
    }
    if (bank.phase === 'spit' && (!bankLife(bank.spit, bank.spitLife)
        || phase[bank.spit] === BROOD_PHASE_WINDUP)) bank.phase = 'second';
    if (bank.phase === 'second' && (!bankLife(bank.second, bank.secondLife)
        || phase[bank.second] === BROOD_PHASE_WINDUP)) bank = null;
    if (!bank) return;
    // A pilot can fly away from any staged approach. Do not keep the sequence armed while its
    // next actor is chasing beyond a useful attack window; ordinary AI takes over immediately.
    const next = bank.phase === 'first' ? bank.first : bank.phase === 'spit' ? bank.spit : bank.second;
    const reach = (bank.phase === 'spit' ? BROOD_SPITTER_LOB_RANGE : BROOD_CHARGER_RANGE) + 40;
    const dx = px[next] - playerX, dz = pz[next] - playerZ;
    if (phase[next] === BROOD_PHASE_FLOCK && dx * dx + dz * dz > reach * reach) bank = null;
  }

  function bankAttackAllowed(i) {
    if (!bank) return true;
    // The composition sequences its three own bodies, not the rest of the wave. Other
    // attackers still contend for the ordinary shared attack slots and inter-attack gap.
    const staged = (i === bank.first && serial[i] === bank.firstLife)
      || (i === bank.spit && serial[i] === bank.spitLife)
      || (i === bank.second && serial[i] === bank.secondLife);
    if (!staged) return true;
    if (bank.phase === 'first') return i === bank.first && serial[i] === bank.firstLife;
    if (bank.phase === 'spit') return i === bank.spit && serial[i] === bank.spitLife;
    return i === bank.second && serial[i] === bank.secondLife
      && (!bankLife(bank.first, bank.firstLife) || phase[bank.first] === BROOD_PHASE_RECOVER
        || phase[bank.first] === BROOD_PHASE_FLOCK);
  }

  function stepSpitter(i, def, dp, dt) {
    if (phase[i] !== BROOD_PHASE_FLOCK) return;
    timer[i] -= dt;
    if (!bankAttackAllowed(i) || attackClock < attackAfter[i] || timer[i] > 0 || dp > BROOD_SPITTER_LOB_RANGE || dp < 1e-4 || !takeAttackSlot()) return;
    // Lead the marker by the flight time so a moving pilot must actually move to dodge.
    const flightS = dp / BROOD_SPITTER_LOB_SPEED;
    teleX[i] = playerX + playerVX * flightS;
    teleZ[i] = playerZ + playerVZ * flightS;
    if (bank && bank.phase === 'spit' && i === bank.spit && serial[i] === bank.spitLife) {
      teleX[i] += bank.flankX * 38;
      teleZ[i] += bank.flankZ * 38;
    }
    plantOnLine(i);
    phase[i] = BROOD_PHASE_WINDUP;
    timer[i] = BROOD_SPITTER_WINDUP_S;
    emitTelegraph(i, def);
    void dt;
  }

  function fireLob(i, fam) {
    const slot = findFreeLob();
    if (slot < 0) { phase[i] = BROOD_PHASE_FLOCK; timer[i] = BROOD_SPITTER_COOLDOWN_S; return; }
    const sx = px[i];
    const sz = pz[i];
    const dx = teleX[i] - sx;
    const dz = teleZ[i] - sz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const flightS = Math.max(0.12, d / BROOD_SPITTER_LOB_SPEED);
    lobX[slot] = sx;
    lobZ[slot] = sz;
    lobVX[slot] = dx / flightS;
    lobVZ[slot] = dz / flightS;
    lobT[slot] = 0;
    lobTotal[slot] = flightS;
    lobTX[slot] = teleX[i];
    lobTZ[slot] = teleZ[i];
    lobAlive[slot] = 1;
    lobCount += 1;
    phase[i] = BROOD_PHASE_FLOCK;
    timer[i] = BROOD_SPITTER_COOLDOWN_S;
    void fam;
  }

  function findFreeLob() {
    for (let i = 0; i < BROOD_LOB_MAX; i++) if (!lobAlive[i]) return i;
    return -1;
  }

  function stepLobs(state, dt) {
    if (lobCount <= 0) return;
    let live = 0;
    for (let i = 0; i < BROOD_LOB_MAX; i++) {
      if (!lobAlive[i]) continue;
      lobT[i] += dt;
      if (lobT[i] >= lobTotal[i]) {
        lobAlive[i] = 0;
        lobCount -= 1;
        splash(lobTX[i], lobTZ[i], state);
        continue;
      }
      lobX[i] += lobVX[i] * dt;
      lobZ[i] += lobVZ[i] * dt;
      live += 1;
    }
    lobCount = live;
  }

  function splash(x, z, state) {
    // The pilot: dodge the marker, take nothing.
    if (routeDamage && signatureRef && signatureRef.alive !== false) {
      const dx = playerX - x;
      const dz = playerZ - z;
      if (dx * dx + dz * dz <= circleHitRadius(BROOD_SPITTER_SPLASH_RADIUS, playerRad) ** 2) {
        routePlayerDamage(BROOD_SPITTER_SPLASH_DAMAGE, x, z, 'brood_acid');
      }
    }
    // The acid does not spare the swarm: bodies in the splash die by it.
    const r2 = BROOD_SPITTER_SPLASH_RADIUS * BROOD_SPITTER_SPLASH_RADIUS;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const dx = px[i] - x;
      const dz = pz[i] - z;
      if (dx * dx + dz * dz <= r2) kill(i, 'explosive', x, z, creditUntil[i] > finite(state.simTime));
    }
    // The pool that stays a beat.
    const slot = poolCursor % BROOD_POOL_MAX;
    poolCursor += 1;
    poolX[slot] = x;
    poolZ[slot] = z;
    poolAge[slot] = 0;
    poolTtl[slot] = BROOD_SPITTER_POOL_TTL_S;
    if (poolCount < BROOD_POOL_MAX) poolCount += 1;
    void state;
  }

  function stepPools(state, dt) {
    if (poolCount <= 0) return;
    let live = 0;
    let playerIn = false;
    for (let i = 0; i < BROOD_POOL_MAX; i++) {
      if (poolAge[i] >= poolTtl[i]) continue;
      poolAge[i] += dt;
      if (poolAge[i] >= poolTtl[i]) continue;
      live += 1;
      if (signatureRef && signatureRef.alive !== false) {
        const dx = playerX - poolX[i];
        const dz = playerZ - poolZ[i];
        if (dx * dx + dz * dz <= circleHitRadius(BROOD_SPITTER_POOL_RADIUS, playerRad) ** 2) playerIn = true;
      }
    }
    poolCount = live;
    // Acid burn accrues on a half-second beat and routes through the damage owner.
    if (playerIn && routeDamage) {
      acidTickAcc += dt;
      if (acidTickAcc >= 0.5) {
        acidTickAcc -= 0.5;
        routePlayerDamage(BROOD_SPITTER_POOL_DPS * 0.5, playerX, playerZ, 'brood_acid_pool');
      }
    } else {
      acidTickAcc = 0;
    }
    // S9 — the pool is the splash's own law standing: the acid does not spare the swarm.
    // Brood bodies burn down on the same DPS reading the player takes; ships in the field
    // (escorts, call-ins) take it on a half-second stamp, so standing in acid is a choice
    // with a price for everything alive in the room.
    if (live > 0) {
      const burn = BROOD_SPITTER_POOL_DPS * dt;
      const pr2 = BROOD_SPITTER_POOL_RADIUS * BROOD_SPITTER_POOL_RADIUS;
      for (let i = 0; i < CAP; i++) {
        if (!alive[i]) continue;
        let inPool = false;
        for (let p = 0; p < BROOD_POOL_MAX; p++) {
          if (poolAge[p] >= poolTtl[p]) continue;
          const dx = px[i] - poolX[p];
          const dz = pz[i] - poolZ[p];
          if (dx * dx + dz * dz <= pr2) { inPool = true; break; }
        }
        if (!inPool) continue;
        hp[i] -= burn;
        if (hp[i] <= 0) kill(i, 'explosive', px[i], pz[i], creditUntil[i] > finite(state.simTime));
      }
      const tick = Number.isInteger(state.tick) ? state.tick : 0;
      const bodies = state.entityIndex && Array.isArray(state.entityIndex.shipLike)
        ? state.entityIndex.shipLike : (state.entityList || []);
      for (const body of bodies) {
        if (!body || body.alive === false || body.id === state.playerId || !body.pos) continue;
        if (body.type && body.type !== 'ship' && body.type !== 'drone') continue;
        let inPool = false;
        for (let p = 0; p < BROOD_POOL_MAX; p++) {
          if (poolAge[p] >= poolTtl[p]) continue;
          const dx = body.pos.x - poolX[p];
          const dz = body.pos.z - poolZ[p];
          if (dx * dx + dz * dz <= pr2) { inPool = true; break; }
        }
        if (!inPool) continue;
        const data = body.data || (body.data = {});
        if (Number.isFinite(data.broodAcidAt) && tick - data.broodAcidAt < 30) continue;
        data.broodAcidAt = tick;
        if (routeDamage) {
          routeDamage({
            attackerId: null,
            targetId: body.id,
            packet: scalarHitToDamagePacket({
              damage: BROOD_SPITTER_POOL_DPS * 0.5,
              damageType: BROOD_PLASMA_TYPE,
              pos: { x: body.pos.x, z: body.pos.z },
              source: { kind: 'swarm_brood', id: 'brood_acid_pool' },
            }),
            origin: { kind: 'swarm_brood', id: 'brood_acid_pool' },
          });
        }
      }
    }
    void state;
  }

  function routePlayerDamage(damage, x, z, sourceId) {
    if (!routeDamage || !(damage > 0)) return;
    routeDamage({
      attackerId: null,
      targetId: signatureRef ? signatureRef.id : null,
      packet: scalarHitToDamagePacket({
        damage,
        damageType: BROOD_PLASMA_TYPE,
        pos: { x, z },
        source: { kind: 'swarm_brood', id: sourceId },
      }),
      origin: { kind: 'swarm_brood', id: sourceId },
    });
  }

  // --- the charger: a line telegraph, then a committed pass ---------------------------------

  /** Arms the pass when the pilot is inside its read: the line draws for the whole windup. */
  function stepCharger(i, def, dp) {
    // The recover beat: the pass is spent and the body is exposed until it re-arms.
    if (phase[i] === BROOD_PHASE_RECOVER) {
      timer[i] -= DT;
      if (timer[i] <= 0) phase[i] = BROOD_PHASE_FLOCK;
      return;
    }
    if (!bankAttackAllowed(i) || attackClock < attackAfter[i] || phase[i] !== BROOD_PHASE_FLOCK || dp > BROOD_CHARGER_RANGE || dp < 1e-4 || !takeAttackSlot()) return;
    // The tell: the line draws toward where the pass will go, for the whole windup.
    const lead = dp / BROOD_CHARGER_DASH_SPEED;
    teleX[i] = playerX + playerVX * lead;
    teleZ[i] = playerZ + playerVZ * lead;
    teleDir[i] = Math.atan2(teleZ[i] - pz[i], teleX[i] - px[i]);
    plantOnLine(i);
    phase[i] = BROOD_PHASE_WINDUP;
    timer[i] = BROOD_CHARGER_WINDUP_S;
    emitTelegraph(i, def);
  }

  // The plant: lateral velocity off the drawn line dies at the stamp. The hold law says the
  // body plants while its marker speaks — the buried family's windup has always zeroed the
  // velocity outright, and this is that same truth for the LED-drawn holds, kept axial so an
  // inward run keeps its inward speed. A body the room shoved or grieved sideways starts its
  // hold on the line, not drifting across it.
  function plantOnLine(i) {
    const dx = teleX[i] - px[i];
    const dz = teleZ[i] - pz[i];
    const d = Math.hypot(dx, dz);
    if (!(d > 1e-4)) return;
    const ax = dx / d, az = dz / d;
    const along = vx[i] * ax + vz[i] * az;
    vx[i] = along * ax;
    vz[i] = along * az;
  }

  /** One tick of a live pass: the hull takes it and the shove it carries, once per dash. */
  function stepChargerDash(i, fam, state) {
    const rad = liveFamilyRadius[fam];
    // The committed pass is the same law for every family that dives — the formation
    // drone authors its own bite and its own exposed beat instead of the charger's.
    const def = liveFamilyDef[fam];
    const slamDamage = def && def.dashDamage > 0 ? def.dashDamage : BROOD_CHARGER_SLAM_DAMAGE;
    const recoverS = def && def.dashRecoverS > 0 ? def.dashRecoverS : BROOD_CHARGER_RECOVER_S;
    const sourceId = def && def.formation ? 'machine_formation' : 'brood_charger';
    if (signatureRef && signatureRef.alive !== false) {
      const sx = playerX - px[i];
      const sz = playerZ - pz[i];
      const rr = corridorHalfWidth(rad, playerRad);
      if (sx * sx + sz * sz <= rr * rr) {
        routePlayerDamage(slamDamage, px[i], pz[i], sourceId);
        const d = Math.sqrt(sx * sx + sz * sz) || 1;
        // The pass lands as an ADDITIVE shove across the membrane, never a velocity write.
        queuePhysicsImpulse(signatureRef, {
          x: (sx / d) * BROOD_CHARGER_SHOVE_DV * playerMass,
          y: 0,
          z: (sz / d) * BROOD_CHARGER_SHOVE_DV * playerMass,
        });
        phase[i] = BROOD_PHASE_RECOVER;
        timer[i] = recoverS;
        return;
      }
    }
    timer[i] -= DT;
    if (timer[i] <= 0) {
      phase[i] = BROOD_PHASE_RECOVER;
      timer[i] = recoverS;
    }
    void state;
  }

  function beginDash(i, fam) {
    void fam;
    const dx = teleX[i] - px[i];
    const dz = teleZ[i] - pz[i];
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    vx[i] = (dx / d) * BROOD_CHARGER_DASH_SPEED;
    vz[i] = (dz / d) * BROOD_CHARGER_DASH_SPEED;
    phase[i] = BROOD_PHASE_DASH;
    timer[i] = BROOD_CHARGER_DASH_MAX_S;
  }

  // --- the leecher: latch, brake, and the shed verb the pilot already owns -------------------

  function stepLeecher(i, fam, dp) {
    if (dp <= BROOD_LEECHER_LATCH_RANGE + playerRad * 0.5 && signatureRef
      && signatureRef.alive !== false) {
      phase[i] = BROOD_PHASE_LATCHED;
      timer[i] = 0;
      teleDir[i] = seedPhase[i];
      // The latch is the leecher's beat — the line promises the drag that is now on the
      // hull, and shedding it is the answer the tell carries.
      emitTelegraph(i, liveFamilyDef[fam]);
      stepLatched(i, fam, DT, null);
    }
  }

  function stepLatched(i, fam, dt, state) {
    // Ride the host at a hull offset so it reads as attached, not overlapping.
    const rad = liveFamilyRadius[fam];
    const angle = seedPhase[i];
    const offset = playerRad + rad * 0.6;
    px[i] = playerX + Math.cos(angle) * offset;
    pz[i] = playerZ + Math.sin(angle) * offset;
    vx[i] = playerVX;
    vz[i] = playerVZ;
    heading[i] = angle + Math.PI; // head into the hull it is drinking from
    // The drag: an ADDITIVE braking impulse across the membrane, capped so it can never
    // reverse the hull — a drag, not a tether.
    const speed = Math.sqrt(playerVX * playerVX + playerVZ * playerVZ);
    if (speed > 1 && signatureRef) {
      // All latches share this tick's budget. N independent min(dv, speed) checks could
      // sum to more than the ship's entire momentum and reverse it in one solver step.
      const dv = Math.min(BROOD_LEECHER_BRAKE_ACCEL * dt, brakeDvBudget);
      brakeDvBudget -= dv;
      queuePhysicsImpulse(signatureRef, {
        x: -(playerVX / speed) * dv * playerMass,
        y: 0,
        z: -(playerVZ / speed) * dv * playerMass,
      });
    }
    // The shed: a wall scrape — the pilot's own physical verb, not a timer.
    if (speed >= BROOD_SHED_SPEED) {
      for (let r = 0; r < rockCount; r++) {
        const dx = playerX - rockX[r];
        const dz = playerZ - rockZ[r];
        const rr = rockR[r] + playerRad;
        if (dx * dx + dz * dz <= rr * rr) {
          kill(i, 'collision', px[i], pz[i]);
          return;
        }
      }
    }
    void state;
  }

  // --- the wake eel's wrap: trails the wake, coils, then a bounded constricting grip --------
  //
  // `wrapRange`/`wrapS` are authored (src/data/swarmBrood.js): inside the reach the eel
  // commits to the coil — a planted windup that speaks the family's line once — and a
  // signature still inside when the coil ends takes the grip. The pilot's outs are the
  // tier's own verbs: leave the reach during the coil, kill the body, or scrape it off on
  // a wall exactly like a latched leech.

  /** Arms the coil when the signature is inside the authored reach; the line is the tell. */
  function stepEelWrap(i, def, dp) {
    if (phase[i] !== BROOD_PHASE_FLOCK) return;
    if (attackClock < attackAfter[i] || dp > def.wrapRange || dp < 1e-4) return;
    if (!signatureRef || signatureRef.alive === false) return;
    phase[i] = BROOD_PHASE_WINDUP;
    timer[i] = def.wrapS > 0 ? def.wrapS : 1;
    emitTelegraph(i, def);
  }

  /** The coil finished with the signature still inside — the wrap lands. */
  function beginWrap(i, fam) {
    phase[i] = BROOD_PHASE_WRAPPED;
    timer[i] = BROOD_WRAP_HOLD_S;
    void fam;
  }

  /** One tick of the grip: ride the hull like a latch, brake it, shed by the same scrape. */
  function stepWrapped(i, fam, dt) {
    if (!signatureRef || signatureRef.alive === false) {
      phase[i] = BROOD_PHASE_FLOCK;
      timer[i] = 0;
      return;
    }
    // Ride the host at a hull offset — the same position glue the latch uses.
    const rad = liveFamilyRadius[fam];
    const angle = seedPhase[i];
    const offset = playerRad + rad * 0.6;
    px[i] = playerX + Math.cos(angle) * offset;
    pz[i] = playerZ + Math.sin(angle) * offset;
    vx[i] = playerVX;
    vz[i] = playerVZ;
    heading[i] = angle + Math.PI;
    // The constriction is the latch's own drag: an additive, budget-capped brake across the
    // membrane that can never reverse the hull — a squeeze, not a new damage channel.
    const speed = Math.sqrt(playerVX * playerVX + playerVZ * playerVZ);
    if (speed > 1) {
      const dv = Math.min(BROOD_LEECHER_BRAKE_ACCEL * dt, brakeDvBudget);
      brakeDvBudget -= dv;
      queuePhysicsImpulse(signatureRef, {
        x: -(playerVX / speed) * dv * playerMass,
        y: 0,
        z: -(playerVZ / speed) * dv * playerMass,
      });
    }
    // The out is the leecher's verb verbatim: scrape a wall fast enough and it kills the grip.
    if (speed >= BROOD_SHED_SPEED) {
      for (let r = 0; r < rockCount; r++) {
        const dx = playerX - rockX[r];
        const dz = playerZ - rockZ[r];
        const rr = rockR[r] + playerRad;
        if (dx * dx + dz * dz <= rr * rr) {
          kill(i, 'collision', px[i], pz[i]);
          return;
        }
      }
    }
    // The grip is bounded — it lets go on its own, then waits before it can coil again.
    timer[i] -= dt;
    if (timer[i] <= 0) {
      phase[i] = BROOD_PHASE_FLOCK;
      timer[i] = 0;
      attackAfter[i] = attackClock + BROOD_WRAP_RETRY_S;
    }
  }

  // --- the Machine's mechanisms (src/data/swarmMachine.js) ----------------------------------
  //
  // One flag per row, one mechanism per flag, all of it running on the same buffers and
  // the same law vocabulary the flesh uses: a rooted body is a planted one, a formation
  // is steering plus the same committed pass the charger owns, a shield is a kill-refusal
  // on the partner's byte, a channel is a windup that ends by consuming wreckage instead
  // of firing, and a beam is a sweeping edge that burns by the room's terrain law.

  /** A rooted body never moves: pinned to the root point, its beam FSM is its only life. */
  function stepRootedBody(i, def, simTime) {
    px[i] = teleX[i];
    pz[i] = teleZ[i];
    vx[i] = 0;
    vz[i] = 0;
    if (def.beam) stepBeamTurret(i, def, simTime);
  }

  /**
   * The turret's three-state clock: cooling (counting to the next windup), winding
   * (teleDir tracks the signature so the drawn arc tells the truth), sweeping (the
   * beam pool owns the edge). The sweep itself steps once per tick in stepBeams.
   */
  function stepBeamTurret(i, def, simTime) {
    if (beamState[i] === 0) {
      timer[i] -= DT;
      if (timer[i] > 0) return;
      const dx = playerX - px[i];
      const dz = playerZ - pz[i];
      const reach = def.beamRange > 0 ? def.beamRange : 130;
      if (!signatureRef || signatureRef.alive === false
          || dx * dx + dz * dz > reach * reach * 1.44 || !takeAttackSlot()) {
        timer[i] = 0.4;
        return;
      }
      beamState[i] = 1;
      timer[i] = def.beamWindupS > 0 ? def.beamWindupS : 1.2;
      teleDir[i] = Math.atan2(dz, dx);
      emitTelegraph(i, def);
      return;
    }
    if (beamState[i] === 1) {
      // The pivot tracks through the windup — the arc the card promises is the arc fired.
      teleDir[i] = Math.atan2(playerZ - pz[i], playerX - px[i]);
      timer[i] -= DT;
      if (timer[i] <= 0) {
        if (fireBeam(i, def)) beamState[i] = 2;
        else { beamState[i] = 0; timer[i] = def.beamCooldownS > 0 ? def.beamCooldownS : 4; }
      }
      return;
    }
    void simTime;
    // state 2: the pool owns the sweep until the beam slot frees itself.
  }

  function fireBeam(i, def) {
    for (let b = 0; b < BEAM_MAX; b++) {
      if (beamAlive[b]) continue;
      const arc = def.beamArc > 0 ? def.beamArc : 1.6;
      beamAlive[b] = 1;
      beamX[b] = px[i];
      beamZ[b] = pz[i];
      beamA0[b] = teleDir[i] - arc * 0.5;
      beamA1[b] = teleDir[i] + arc * 0.5;
      beamT[b] = 0;
      beamTotal[b] = def.beamSweepS > 0 ? def.beamSweepS : 1;
      beamRange[b] = def.beamRange > 0 ? def.beamRange : 130;
      beamReach[b] = beamRange[b];
      beamWidth[b] = def.beamWidth > 0 ? def.beamWidth : 5;
      beamDamage[b] = def.beamDamage > 0 ? def.beamDamage : 18;
      beamHitPlayer[b] = 0;
      beamOwner[b] = i;
      beamCount += 1;
      beamSlotOf[i] = b;
      return true;
    }
    return false;
  }

  /** Kill a body's live sweep (the turret died mid-arc) — the edge dies with the mount. */
  function freeBeamOf(i) {
    const b = beamSlotOf[i];
    if (b < 0) return;
    if (beamAlive[b] && beamOwner[b] === i) {
      beamAlive[b] = 0;
      beamCount -= 1;
    }
    beamSlotOf[i] = -1;
    beamState[i] = 0;
  }

  /**
   * One tick of every live sweep: walk the edge a0→a1, burn the signature once per
   * sweep, and cut every pack cell the segment crosses by the room's 'terrain' law —
   * credited only when the player's hand was already on the body (the beam is the
   * room's weapon the player can aim).
   */
  function stepBeams(simTime) {
    if (beamCount <= 0) return;
    for (let b = 0; b < BEAM_MAX; b++) {
      if (!beamAlive[b]) continue;
      const owner = beamOwner[b];
      if (owner < 0 || !alive[owner]) {
        beamAlive[b] = 0;
        beamCount -= 1;
        continue;
      }
      beamT[b] += DT;
      const t = Math.min(1, beamT[b] / beamTotal[b]);
      const a = beamA0[b] + (beamA1[b] - beamA0[b]) * t;
      segA.x = beamX[b];
      segA.z = beamZ[b];
      segB.x = beamX[b] + Math.cos(a) * beamRange[b];
      segB.z = beamZ[b] + Math.sin(a) * beamRange[b];
      const cover = beamCoverFraction(beamWidth[b]);
      beamReach[b] = beamRange[b] * cover;
      segB.x = segA.x + (segB.x - segA.x) * cover;
      segB.z = segA.z + (segB.z - segA.z) * cover;
      if (cover > 0 && !beamHitPlayer[b] && signatureRef && signatureRef.alive !== false) {
        const hit = segmentCircleT(segA, segB, playerX, playerZ, beamWidth[b] + playerRad);
        if (hit != null) {
          beamHitPlayer[b] = 1;
          routePlayerDamage(beamDamage[b], beamX[b], beamZ[b], 'machine_beam');
        }
      }
      for (let j = 0; j < CAP; j++) {
        if (cover <= 0 || !alive[j] || j === owner) continue;
        const hit = segmentCircleT(segA, segB, px[j], pz[j],
          beamWidth[b] + liveFamilyRadius[family[j]]);
        if (hit != null) kill(j, 'terrain', px[j], pz[j], creditUntil[j] > simTime);
      }
      // The sweep may have cut its own turret through a burst chain — freeBeamOf already
      // retired the slot; touching the expiry now would spend beamCount twice.
      if (beamAlive[b] && beamT[b] >= beamTotal[b]) {
        beamAlive[b] = 0;
        beamCount -= 1;
        if (alive[owner]) {
          const def = liveFamilyDef[family[owner]];
          beamState[owner] = 0;
          beamSlotOf[owner] = -1;
          timer[owner] = def && def.beamCooldownS > 0 ? def.beamCooldownS : 4;
        }
      }
    }
  }

  // Cover is a live native solid, not the flock's padded collision disc. Inspect the
  // asteroid index directly: the 64-entry movement cache must not make later stones
  // transparent. No damage, custody or movement is written here.
  function beamCoverFraction(width) {
    const state = getState();
    const stones = indexedTypeScan(state, 'asteroids');
    let nearest = 1;
    for (let r = 0; r < stones.length; r++) {
      const stone = stones[r];
      if (stone?.type !== 'asteroid' || stone.alive === false || stone.collides === false
        || stone.physicsBody === false || state.entities?.get?.(stone.id) !== stone
        || !physicsBodyNativeReady(stone)
        || !Number.isFinite(stone.pos?.x) || !Number.isFinite(stone.pos?.z)) continue;
      const body = resolvePhysicsBodySpec(stone);
      if (!body || body.material === 'sensor' || body.material === 'massline_sensor'
        || !(Number.isFinite(body.radius) && body.radius > 0)) continue;
      const contact = segmentCircleT(segA, segB, stone.pos.x, stone.pos.z, body.radius + width);
      if (contact != null && contact < nearest) nearest = contact;
    }
    return nearest;
  }

  /**
   * The sawblade: ballistic, powered, lawful. No steering — it holds its authored cruise,
   * reflects off rock faces and the room's edge, cuts pack bodies it crosses fast by the
   * same relative-velocity law the whip keeps, and bites the hull once per authored
   * window. The player who learns its lanes feeds it the room; the room feeds it back.
   */
  function stepSawblade(i, def, dt, simTime, state) {
    const cruise = def.bounceSpeed > 0 ? def.bounceSpeed : liveFamilySpeed[family[i]];
    let sp = Math.hypot(vx[i], vz[i]);
    if (sp < cruise) {
      if (sp > 1e-4) { const k = cruise / sp; vx[i] *= k; vz[i] *= k; }
      else { vx[i] = cruise; vz[i] = 0; }
    } else if (sp > cruise * 1.6) {
      const k = (cruise * 1.6) / sp;
      vx[i] *= k;
      vz[i] *= k;
    }
    px[i] += vx[i] * dt;
    pz[i] += vz[i] * dt;
    sp = Math.hypot(vx[i], vz[i]);
    if (sp > 4) heading[i] = Math.atan2(vz[i], vx[i]);
    // The room's edge is its racket: past the authored bound it turns back for the meat.
    const bounds = def.bounceBounds > 0 ? def.bounceBounds : 320;
    const bdx = playerX - px[i];
    const bdz = playerZ - pz[i];
    if (bdx * bdx + bdz * bdz > bounds * bounds) {
      const bd = Math.sqrt(bdx * bdx + bdz * bdz) || 1;
      vx[i] = (bdx / bd) * cruise;
      vz[i] = (bdz / bd) * cruise;
    }
    // It cuts whatever it crosses fast enough — the pack included, credited like any plow.
    const rad = liveFamilyRadius[family[i]];
    let cuts = 0;
    for (let j = 0; j < CAP && cuts < 6; j++) {
      if (j === i || !alive[j]) continue;
      const dx = px[j] - px[i];
      const dz = pz[j] - pz[i];
      const rr = rad + liveFamilyRadius[family[j]];
      if (dx * dx + dz * dz > rr * rr) continue;
      const rvx = vx[j] - vx[i];
      const rvz = vz[j] - vz[i];
      if (rvx * rvx + rvz * rvz < BROOD_PLOW_MIN_SPEED * BROOD_PLOW_MIN_SPEED) continue;
      kill(j, 'collision', px[j], pz[j], creditUntil[j] > simTime);
      cuts += 1;
    }
    // The hull bite — once per authored window, then the blade bounces off.
    if (signatureRef && signatureRef.alive !== false && simTime >= contactAfter[i]) {
      const dx = playerX - px[i];
      const dz = playerZ - pz[i];
      const rr = rad + playerRad;
      if (dx * dx + dz * dz <= rr * rr) {
        routePlayerDamage(def.contactDamage > 0 ? def.contactDamage : 14,
          px[i], pz[i], 'machine_sawblade');
        contactAfter[i] = simTime + (def.contactCooldownS > 0 ? def.contactCooldownS : 0.5);
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        vx[i] = -(dx / d) * cruise;
        vz[i] = -(dz / d) * cruise;
      }
    }
    void state;
  }

  /**
   * The squad weave: the anchor orbits the signature on the squad's seeded lissajous —
   * the Galaga pattern — and each member steers to its seat on the anchor's ring.
   * Deterministic off simTime alone; a dead seat just stays empty.
   */
  function steerFormation(i, def, simTime, out) {
    const sq = squadId[i];
    if (sq < 0) return;
    const seed = squadSeed[sq];
    const size = Math.max(3, Math.trunc(def.squadSize) || 6);
    const anchorX = playerX + Math.cos(seed + simTime * 0.30) * 110
      + Math.cos(seed * 2.7 + simTime * 0.83) * 46;
    const anchorZ = playerZ + Math.sin(seed * 1.3 + simTime * 0.22) * 110
      + Math.sin(seed + simTime * 0.61) * 46;
    const ang = (squadSlot[i] % size) * ((Math.PI * 2) / size) + seed;
    out.ax += (anchorX + Math.cos(ang) * 18 - px[i]) * 3.0;
    out.az += (anchorZ + Math.sin(ang) * 18 - pz[i]) * 3.0;
  }

  /** The peel: the squad's clock is due — this free member draws its dive line and arms. */
  function stepFormationPeel(i, def, simTime, dp) {
    const sq = squadId[i];
    if (sq < 0 || phase[i] !== BROOD_PHASE_FLOCK) return;
    const reach = def.dashRange > 0 ? def.dashRange : 130;
    // The squad's own clock paces the peel (peelEveryS runs far slower than the
    // room's attack gap) — competing for the shared budget's SLOT keeps the read
    // honest, but the global gap gate would starve the wing under livelier rosters.
    if (simTime < squadPeelAt[sq] || attackClock < attackAfter[i]
        || dp > reach || dp < 1e-4 || attackSlots <= 0) return;
    attackSlots--;
    nextAttackAt = attackClock + BROOD_ATTACK_GAP_S;
    const speed = def.dashSpeed > 0 ? def.dashSpeed : 150;
    const lead = dp / speed;
    teleX[i] = playerX + playerVX * lead;
    teleZ[i] = playerZ + playerVZ * lead;
    teleDir[i] = Math.atan2(teleZ[i] - pz[i], teleX[i] - px[i]);
    phase[i] = BROOD_PHASE_WINDUP;
    timer[i] = def.dashWindupS > 0 ? def.dashWindupS : 0.7;
    squadPeelAt[sq] = simTime + (def.peelEveryS > 0 ? def.peelEveryS : 2.4);
    emitTelegraph(i, def);
  }

  /** The peel commits: fixed velocity at the marked point — the charger's dodge law. */
  function beginFormationDash(i, def) {
    const dx = teleX[i] - px[i];
    const dz = teleZ[i] - pz[i];
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const speed = def.dashSpeed > 0 ? def.dashSpeed : BROOD_CHARGER_DASH_SPEED;
    vx[i] = (dx / d) * speed;
    vz[i] = (dz / d) * speed;
    phase[i] = BROOD_PHASE_DASH;
    timer[i] = def.dashMaxS > 0 ? def.dashMaxS : BROOD_CHARGER_DASH_MAX_S;
  }

  /** The linker hovers at slack range off its charge — the beam stays drawn, not taut. */
  function steerLinker(i, def, out) {
    const p = linkPartner[i];
    if (p < 0 || !alive[p]) return;
    const dx = px[i] - px[p];
    const dz = pz[i] - pz[p];
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const hold = (def.linkRange > 0 ? def.linkRange : 90) * 0.55;
    out.ax += ((px[p] + (dx / d) * hold) - px[i]) * 2.0;
    out.az += ((pz[p] + (dz / d) * hold) - pz[i]) * 2.0;
  }

  /**
   * The link pass's per-linker upkeep: keep the charge alive, in range and unbroken —
   * a thrown body crossing the beam snaps it and starts the reform clock — or pick a
   * fresh charge off the pack (never another linker: a shield chain would draw itself).
   * The partner flag is written by the caller after this runs.
   */
  function stepLinkUpkeep(i, def, simTime) {
    const range = def.linkRange > 0 ? def.linkRange : 90;
    if (linkPartner[i] >= 0) {
      const p = linkPartner[i];
      if (!alive[p]) {
        linkPartner[i] = -1;
      } else {
        const dx = px[p] - px[i];
        const dz = pz[p] - pz[i];
        if (dx * dx + dz * dz > range * range * 1.5) {
          linkPartner[i] = -1;
          linkBrokenUntil[i] = simTime + 1.5;
        } else {
          // Thrown mass across the beam: the authored break verb.
          segA.x = px[i];
          segA.z = pz[i];
          segB.x = px[p];
          segB.z = pz[p];
          const state = getState();
          const observedLink = linkStartedTick[i] < state.tick
            && linkTargetLife[i] === serial[p]
            && bossChunkTargetObserved(state, i) && bossChunkTargetObserved(state, p);
          let cut = false;
          // Stones live outside the mover cache. Their native solid, not the padded
          // terrain disc, is what the pilot can physically put across this beam.
          if (swarmPilotHasActed(state)) {
            for (let r = 0; r < rockCount && !cut; r++) {
              const entity = rockEntities[r];
              if (entity?.type !== 'asteroid') continue;
              cut = massCutsLink(i, p, entity, state, observedLink);
            }
            for (let m = 0; m < movCount && !cut; m++) {
              cut = massCutsLink(i, p, linkMoverEntities[m], state, observedLink);
            }
          }
          if (cut) {
            linkPartner[i] = -1;
            linkBrokenUntil[i] = simTime + (def.linkReformS > 0 ? def.linkReformS : 7);
          }
        }
      }
    }
    if (linkPartner[i] < 0 && simTime >= linkBrokenUntil[i]) {
      let best = -1;
      let bestD = range * range;
      for (let j = 0; j < CAP; j++) {
        if (j === i || !alive[j]) continue;
        const jd = liveFamilyDef[family[j]];
        if (jd && jd.linkShield) continue;
        const dx = px[j] - px[i];
        const dz = pz[j] - pz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) { best = j; bestD = d2; }
      }
      if (best >= 0) {
        linkPartner[i] = best;
        linkStartedTick[i] = finite(getState()?.tick);
        linkTargetLife[i] = serial[best];
        // First contact observations begin when this visible beam exists, never
        // while the pilot is still protected at the start of the round.
        const state = getState();
        if (swarmPilotHasActed(state)) {
          for (let r = 0; r < rockCount; r++) {
            if (rockEntities[r]?.type === 'asteroid') observeLinkMass(rockEntities[r], state);
          }
          for (let m = 0; m < movCount; m++) observeLinkMass(linkMoverEntities[m], state);
        }
        emitTelegraph(i, def);
      }
    }
  }

  // Match observed native mass travel to the SAME interval of both living beam ends.
  // Never borrow a newly formed link, a replaced life, a skipped tick or a teleport.
  function observeLinkMass(entity, state) {
    if (!entity || entity.alive === false || entity.collides === false || entity.physicsBody === false
      || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)
      || !Number.isFinite(entity.vel?.x) || !Number.isFinite(entity.vel?.z)) return null;
    const body = resolvePhysicsBodySpec(entity);
    if (!body?.dynamic || body.material === 'sensor' || body.material === 'massline_sensor'
      || !(Number.isFinite(body.radius) && body.radius > 0)) return null;
    const x = entity.pos.x, z = entity.pos.z, dx = entity.vel.x, dz = entity.vel.z;
    let history = linkMassHistory.get(entity);
    if (!history || history.body !== entity.physicsBody || history.radius !== body.radius
      || history.generation !== entity.occupantGeneration) {
      history = { tick: state.tick, x, z, fromX: x, fromZ: z, vx: dx, vz: dz,
        radius: body.radius, generation: entity.occupantGeneration, body: entity.physicsBody, swept: false };
      linkMassHistory.set(entity, history);
    } else if (history.tick !== state.tick) {
      const consecutive = history.tick + 1 === state.tick;
      history.fromX = consecutive ? history.x : x;
      history.fromZ = consecutive ? history.z : z;
      history.swept = consecutive && Math.hypot(x - history.x, z - history.z)
        <= Math.max(Math.hypot(history.vx, history.vz), Math.hypot(dx, dz)) * DT + 0.01;
      history.tick = state.tick; history.x = x; history.z = z;
      history.vx = dx; history.vz = dz;
    }
    return history;
  }

  function massCutsLink(i, p, entity, state, observedLink) {
    const mass = observeLinkMass(entity, state);
    if (!mass) return false;
    const radius = mass.radius + 1;
    const speed = Math.hypot(entity.vel.x, entity.vel.z);
    if (speed >= BROOD_PLOW_MIN_SPEED
      && segmentCircleT(segA, segB, entity.pos.x, entity.pos.z, radius) != null) return true;
    // A glue/splash remain may already be spent by an earlier contact along this
    // interval. Its consumption owner decides that ordering after the link pass.
    // Keep its existing endpoint verb; only reusable mass gains a swept beam cut.
    const remain = entity.data?.broodRemain;
    if (finite(remain?.glueS) > 0 || finite(remain?.splashRadius) > 0) return false;
    if (!mass.swept || !observedLink
      || Math.hypot(entity.pos.x - mass.fromX, entity.pos.z - mass.fromZ) < BROOD_PLOW_MIN_SPEED * DT) return false;
    return movingDiscCutsLink(mass.fromX, mass.fromZ, entity.pos.x, entity.pos.z, radius,
      cellObservedX[i], cellObservedZ[i], px[i], pz[i],
      cellObservedX[p], cellObservedZ[p], px[p], pz[p]);
  }

  // A real pilot catch takes this tool out of the loose stock. Read the canonical,
  // current-life attachment, not the HUD's selected tether or old throw provenance.
  // Keep it in the mover cache: held mass still fights by the ordinary contact laws.
  function salvageRemainAvailable(m) {
    const state = getState(), entity = linkMoverEntities[m];
    if (movRemainId[m] < 0 || !entity || entity.alive === false
      || state.entities?.get(entity.id) !== entity || !entity.data?.broodRemain
      || entity.collides === false || entity.physicsBody === false
      || (Number.isFinite(entity.data.despawnAt) && entity.data.despawnAt <= state.simTime)) return false;
    const player = state.entities?.get(state.playerId);
    const playerLife = occupantGenerationOf(player), life = occupantGenerationOf(entity);
    if (!player || player.alive === false || playerLife == null || life == null) return true;
    const attachments = state.combat?.attachments?.byId;
    for (const key in attachments) {
      const attachment = attachments[key];
      if (attachment?.state === 'active'
        && (attachment.defId === 'tether_standard' || attachment.defId === 'attachment_massline')
        && attachment.ownerId === player.id && attachment.targetId === entity.id
        && attachment.ownerGeneration === playerLife && attachment.targetGeneration === life) return false;
    }
    return true;
  }

  /** The nearest loose throwable remain for a salvager's run, or -1. */
  function nearestRemainMov(i, maxD) {
    let best = -1;
    let bestD = maxD * maxD;
    for (let m = 0; m < movCount; m++) {
      if (!salvageRemainAvailable(m)) continue;
      const dx = movX[m] - px[i];
      const dz = movZ[m] - pz[i];
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { best = m; bestD = d2; }
    }
    return best;
  }

  /** The salvager runs down wreckage — never the signature. */
  function steerSalvager(i, def, simTime, out) {
    const m = nearestRemainMov(i, 800);
    if (m < 0) return;
    const reach = def.repairs ? def.repairRange : def.assembleRange;
    const dx = movX[m] - px[i];
    const dz = movZ[m] - pz[i];
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    if (d > reach * 0.8) {
      out.ax += (dx / d) * 26;
      out.az += (dz / d) * 26;
    }
    void simTime;
  }

  /** The channel arms: a repair needs ONE wreck in reach, an assemble needs the cluster. */
  function stepSalvagerArm(i, def, simTime) {
    if (phase[i] !== BROOD_PHASE_FLOCK || attackClock < attackAfter[i]) return;
    if (def.repairs) {
      const reach = def.repairRange > 0 ? def.repairRange : 14;
      const m = nearestRemainMov(i, 800);
      if (m < 0) return;
      const dx = movX[m] - px[i];
      const dz = movZ[m] - pz[i];
      if (dx * dx + dz * dz > reach * reach) return;
      channelEntity[i] = movRemainId[m];
      channelSource[i] = linkMoverEntities[m];
      channelGeneration[i] = occupantGenerationOf(linkMoverEntities[m]) ?? 0;
      teleX[i] = movX[m];
      teleZ[i] = movZ[m];
      phase[i] = BROOD_PHASE_WINDUP;
      timer[i] = def.repairS > 0 ? def.repairS : 3;
      channelTold[i] = 1;
      emitTelegraph(i, def);
      return;
    }
    const reach = def.assembleRange > 0 ? def.assembleRange : 30;
    const need = Math.max(2, Math.trunc(def.assembleDebrisMin) || 2);
    let first = -1;
    let near = 0;
    for (let m = 0; m < movCount; m++) {
      if (!salvageRemainAvailable(m)) continue;
      const dx = movX[m] - px[i];
      const dz = movZ[m] - pz[i];
      if (dx * dx + dz * dz <= reach * reach) {
        near += 1;
        if (first < 0) first = m;
      }
    }
    if (near < need) return;
    channelEntity[i] = movRemainId[first];
    channelSource[i] = linkMoverEntities[first];
    channelGeneration[i] = occupantGenerationOf(linkMoverEntities[first]) ?? 0;
    teleX[i] = movX[first];
    teleZ[i] = movZ[first];
    phase[i] = BROOD_PHASE_WINDUP;
    timer[i] = def.assembleS > 0 ? def.assembleS : 5;
    channelTold[i] = 1;
    emitTelegraph(i, def);
  }

  /** The channel keeps its wreck: track the entity, abort when it stops being there. */
  function trackChannel(i, def) {
    const id = channelEntity[i];
    if (id < 0) return true;
    const reach = (def.repairs ? def.repairRange * 2.5 : def.assembleRange * 1.5) || 30;
    if (def.assembles) {
      const need = Math.max(2, Math.trunc(def.assembleDebrisMin) || 2);
      let near = 0;
      for (let m = 0; m < movCount; m++) {
        if (!salvageRemainAvailable(m)) continue;
        const dx = movX[m] - px[i], dz = movZ[m] - pz[i];
        if (dx * dx + dz * dz <= reach * reach) near++;
      }
      if (near < need) return false;
    }
    for (let m = 0; m < movCount; m++) {
      if (movRemainId[m] !== id) continue;
      if (!salvageRemainAvailable(m) || linkMoverEntities[m] !== channelSource[i]
        || (occupantGenerationOf(linkMoverEntities[m]) ?? 0) !== channelGeneration[i]) return false;
      teleX[i] = movX[m];
      teleZ[i] = movZ[m];
      const dx = movX[m] - px[i];
      const dz = movZ[m] - pz[i];
      return dx * dx + dz * dz <= reach * reach;
    }
    return false;
  }

  /** The channel lands: the wreck is spent, the mint spends the wave's own reserve. */
  function finishChannel(i, def) {
    const state = getState(), run = liveSwarmRun(state), epoch = chunkEpoch, wave = liveWave, life = serial[i];
    const id = channelEntity[i];
    channelEntity[i] = -1;
    channelTold[i] = 0;
    channelSource[i] = null;
    phase[i] = BROOD_PHASE_FLOCK;
    attackAfter[i] = attackClock + 1.5;
    if (def.repairs) {
      for (let m = 0; m < movCount; m++) {
        if (movRemainId[m] === id && salvageRemainAvailable(m)) {
          emitRemainSpent(m);
          if (!salvageCompletionCurrent(state, run, epoch, wave, i, life)) return false;
          mintMachine(px[i] + 4, pz[i] + 4, def.repairYieldId);
          break;
        }
      }
      return true;
    }
    const reach = def.assembleRange > 0 ? def.assembleRange : 30;
    const need = Math.max(1, Math.trunc(def.assembleDebrisMin) || 2);
    let available = 0;
    for (let m = 0; m < movCount; m++) {
      if (!salvageRemainAvailable(m)) continue;
      const dx = movX[m] - px[i];
      const dz = movZ[m] - pz[i];
      if (dx * dx + dz * dz <= reach * reach) available += 1;
    }
    if (available < need) return true;
    let ate = 0;
    for (let m = 0; m < movCount && ate < need; m++) {
      if (!salvageRemainAvailable(m)) continue;
      const dx = movX[m] - px[i];
      const dz = movZ[m] - pz[i];
      if (dx * dx + dz * dz > reach * reach) continue;
      emitRemainSpent(m);
      if (!salvageCompletionCurrent(state, run, epoch, wave, i, life)) return false;
      ate += 1;
    }
    if (ate === need) mintMachine(px[i] + 4, pz[i] + 4, def.assembleYieldId);
    return true;
  }

  // Spending is a synchronous owner receipt. A cancelled room, fresh attempt or
  // destroyed builder must not continue that old completion into new state.
  function salvageCompletionCurrent(state, run, epoch, wave, i, life) {
    return getState() === state && liveSwarmRun(state) === run && run?.phase === 'active'
      && state.mode === 'flight' && run.wave === wave && liveWave === wave
      && chunkEpoch === epoch && alive[i] === 1 && serial[i] === life;
  }

  /**
   * Mint one rebuilt body from the wave's held-back machine reserve — the budget law
   * the sacs, splitters and mothers already keep: a channel that fires when the reserve
   * is spent simply mints nothing. The yield is authored per family row.
   */
  function mintMachine(x, z, yieldId) {
    if (machineReserve <= 0) return false;
    const yieldIdx = familyIndexOf(yieldId);
    if (yieldIdx < 0) return false;
    const slot = findFreeSlot();
    if (slot < 0) return false;
    spawnAt(slot, yieldIdx, x, z);
    machineReserve -= 1;
    return true;
  }

  /** The magnet's catch circle: its aura eats shots that would have flown past. */
  function directRadiusFor(slot) {
    const def = liveFamilyDef[family[slot]];
    const base = liveFamilyRadius[family[slot]];
    if (def && def.magnets && def.magnetRadius > base) return def.magnetRadius;
    return base;
  }

  // --- B3: the Tendril's body --------------------------------------------------------------
  //
  // The head is a real hull fighting the authored score; the body behind it is this chain.
  // The chain's telegraph is the thing itself — the weave lane is the score's tell, and the
  // body visibly follows the line the head commits to. Segments die by the same room law the
  // flock dies by (rocks, plows, whips, blasts); killing a middle link frees the chain behind
  // it to hunt on its own, and killing the head collapses the whole body. The constraint is
  // the worm's muscle: a hard projection, so the chain holds its spacing through any field.

  /** Lay the chain behind the head the first tick the champion hull is seen. */
  function spawnWorm() {
    // The body trails where the head is heading: its velocity, or toward the pilot when the
    // head has just materialized and is still finding its line.
    const hspd = Math.sqrt(headVX * headVX + headVZ * headVZ);
    let dirx;
    let dirz;
    if (hspd > 1) { dirx = headVX / hspd; dirz = headVZ / hspd; }
    else {
      const dx = playerX - headX;
      const dz = playerZ - headZ;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      dirx = dx / d; dirz = dz / d;
    }
    const n = Math.min(TENDRIL_SEG_PER_WORM, TENDRIL_SEG_MAX);
    for (let k = 0; k < n; k++) {
      segX[k] = headX - dirx * TENDRIL_SEG_SPACING * (k + 1);
      segZ[k] = headZ - dirz * TENDRIL_SEG_SPACING * (k + 1);
      segVX[k] = headVX;
      segVZ[k] = headVZ;
      segHp[k] = TENDRIL_SEG_HULL;
      segAlive[k] = 1;
      segLead[k] = k === 0 ? SEG_LEAD_HEAD : k - 1;
      segHeading[k] = Math.atan2(dirz, dirx);
      segSeed[k] = rng() * Math.PI * 2;
      segContactT[k] = 0;
    }
    segAliveCount = n;
    wormSpawned = true;
    view.segAliveCount = segAliveCount;
  }

  /** The head died — the whole body comes apart with it (the knot's last act). */
  function collapseTendril() {
    tendrilDone = true;
    for (let i = 0; i < TENDRIL_SEG_MAX; i++) {
      if (segAlive[i]) killSeg(i, 'direct', segX[i], segZ[i]);
    }
    view.segAliveCount = 0;
  }

  /** One dead link: the receipt, and the Centipede rule — its follower now leads a free body. */
  function killSeg(i, cause, sampleX, sampleZ, credited = true) {
    if (!segAlive[i]) return;
    segAlive[i] = 0;
    segAliveCount -= 1;
    view.segAliveCount = segAliveCount;
    for (let j = 0; j < TENDRIL_SEG_MAX; j++) {
      if (segAlive[j] && segLead[j] === i) segLead[j] = SEG_LEAD_FREE;
    }
    const c = CAUSE_INDEX[cause];
    if (c == null) return;
    killCount[c] += 1;
    if (killCount[c] === 1) {
      killPosX[c] = finite(sampleX);
      killPosZ[c] = finite(sampleZ);
    }
    if (!credited) return;
    creditedCount[c]++;
    const pay = killPayFor(TENDRIL_SEG_PAY_FAMILY);
    killCredits[c] += pay.credits;
    killScore[c] += pay.score;
    // The Domino receipt: the segment's own coordinates — not the blast sample — because the
    // shove radiates from the body that died. Segments never respawn, so the slot is the life.
    noteCreditedDeath(`seg:${i}`, segX[i], segZ[i]);
  }

  function stepTendril(state, dt, simTime) {
    if (!tendrilMode || tendrilDone) return;
    if (!headFound) {
      // The head vanished after materializing — the champion hull died; the body dies with it.
      if (tendrilHeadSeen) collapseTendril();
      return;
    }
    tendrilHeadSeen = true;
    if (!wormSpawned) spawnWorm();
    if (segAliveCount <= 0) return;
    const spacing = TENDRIL_SEG_SPACING;
    for (let i = 0; i < TENDRIL_SEG_MAX; i++) {
      if (!segAlive[i]) continue;
      const ox = segX[i];
      const oz = segZ[i];
      let lead = segLead[i];
      // A dead or missing lead frees its follower — the split is the counter's second reward.
      if (lead >= 0 && !segAlive[lead]) lead = segLead[i] = SEG_LEAD_FREE;
      if (lead === SEG_LEAD_HEAD && !headFound) lead = segLead[i] = SEG_LEAD_FREE;
      if (lead === SEG_LEAD_FREE) {
        // A free body still hunts: serpentine seek on the pilot, wiggle and all.
        const dx = playerX - ox;
        const dz = playerZ - oz;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        const wob = Math.sin(simTime * TENDRIL_SEG_WIGGLE_RAD_S + segSeed[i])
          * TENDRIL_SEG_WIGGLE_BLEND;
        const nx = dx / d;
        const nz = dz / d;
        const mx = nx - nz * wob;
        const mz = nz + nx * wob;
        const ml = Math.sqrt(mx * mx + mz * mz) || 1;
        segVX[i] = (mx / ml) * TENDRIL_SEG_SPEED;
        segVZ[i] = (mz / ml) * TENDRIL_SEG_SPEED;
        segX[i] += segVX[i] * dt;
        segZ[i] += segVZ[i] * dt;
      } else {
        // Attached: hold the authored spacing behind the lead point — a projection, so the
        // chain is taut through the weave instead of sagging on a spring.
        const tx = lead === SEG_LEAD_HEAD ? headX : segX[lead];
        const tz = lead === SEG_LEAD_HEAD ? headZ : segZ[lead];
        const dx = segX[i] - tx;
        const dz = segZ[i] - tz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > spacing && d > 1e-4) {
          const k = (d - spacing) / d;
          segX[i] -= dx * k;
          segZ[i] -= dz * k;
        }
        segVX[i] = (segX[i] - ox) / dt;
        segVZ[i] = (segZ[i] - oz) / dt;
      }
      const sp2 = segVX[i] * segVX[i] + segVZ[i] * segVZ[i];
      if (sp2 > 4) {
        const target = Math.atan2(segVZ[i], segVX[i]);
        let dh = target - segHeading[i];
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        segHeading[i] += dh * Math.min(1, 8 * dt);
      }
      // Hull contact: the body's approach is its own telegraph — a light sting and a shove,
      // on the same cadence law the flock uses so a chain rakes instead of melting.
      segContactT[i] -= dt;
      if (segContactT[i] <= 0 && signatureRef && signatureRef.alive !== false && sp2 > 1) {
        const dx = playerX - segX[i];
        const dz = playerZ - segZ[i];
        const rr = playerRad + TENDRIL_SEG_RADIUS;
        if (dx * dx + dz * dz <= rr * rr) {
          routePlayerDamage(TENDRIL_SEG_CONTACT_DAMAGE, segX[i], segZ[i], 'brood_tendril');
          const d = Math.sqrt(dx * dx + dz * dz) || 1;
          queuePhysicsImpulse(signatureRef, {
            x: (dx / d) * TENDRIL_SEG_CONTACT_SHOVE_DV * playerMass,
            y: 0,
            z: (dz / d) * TENDRIL_SEG_CONTACT_SHOVE_DV * playerMass,
          });
          segContactT[i] = TENDRIL_SEG_CONTACT_COOLDOWN_S;
        }
      }
      // Deaths by the room — the same law the flock obeys. A fast rock is a thrown rock:
      // the sling's answer to the committed weave lives here, verbatim.
      for (let r = 0; r < rockCount; r++) {
        const dx = segX[i] - rockX[r];
        const dz = segZ[i] - rockZ[r];
        const rr = rockR[r] + TENDRIL_SEG_RADIUS;
        if (dx * dx + dz * dz > rr * rr) continue;
        const relx = rockVX[r] - segVX[i];
        const relz = rockVZ[r] - segVZ[i];
        const moving = relx * relx + relz * relz >= BROOD_PLOW_MIN_SPEED * BROOD_PLOW_MIN_SPEED;
        killSeg(i, moving ? 'collision' : 'terrain', segX[i], segZ[i], !!rockCredited[r]);
        break;
      }
      if (!segAlive[i]) continue;
      // Deaths by plow — everything the flock dies to, EXCEPT its own head (the worm cannot
      // eat itself mid-weave; the head sweeping its own chain is the weave, not a throw).
      for (let m = 0; m < movCount; m++) {
        if (movIsHead[m]) continue;
        const dx = segX[i] - movX[m];
        const dz = segZ[i] - movZ[m];
        const rr = movRad[m] + TENDRIL_SEG_RADIUS;
        if (dx * dx + dz * dz > rr * rr) continue;
        const relx = movVX[m] - segVX[i];
        const relz = movVZ[m] - segVZ[i];
        const relSpeed2 = relx * relx + relz * relz;
        const isPlayer = movIsPlayer[m] === 1;
        const ramSpeed = isPlayer ? BROOD_PLAYER_RAM_SPEED : BROOD_PLOW_MIN_SPEED;
        // The mass gate keeps ambient pebbles from shredding the brood; a remain is a thrown
        // weapon the kill authored, so speed alone decides whether it lands.
        if (relSpeed2 >= ramSpeed * ramSpeed && (isPlayer || movMass[m] >= BROOD_PLOW_MIN_MASS || movRemainId[m] >= 0)) {
          killSeg(i, 'collision', segX[i], segZ[i], !!movCredited[m]);
          break;
        }
      }
    }
  }

  /** The tether line itself is a blade: a taut sweep shreds or bats the brood it crosses. */
  function sweepWhipLine(state) {
    const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    const tether = player && state.player ? state.player.tether : null;
    if (!player || !tether || !tether.active || tether.targetId == null) return;
    const payload = state.entities.get(tether.targetId);
    if (!payload || payload.alive === false || !payload.pos || !payload.vel) return;
    const axp = finite(player.pos.x);
    const azp = finite(player.pos.z);
    const bxp = finite(payload.pos.x);
    const bzp = finite(payload.pos.z);
    const segx = bxp - axp;
    const segz = bzp - azp;
    const len2 = segx * segx + segz * segz;
    if (len2 < 1e-6) return;
    const massSpeed = Math.sqrt(finite(payload.vel.x) * finite(payload.vel.x)
      + finite(payload.vel.z) * finite(payload.vel.z));
    const kills = massSpeed >= BROOD_WHIP_KILL_SPEED;
    const bats = massSpeed >= BROOD_WHIP_BAT_SPEED;
    if (!kills && !bats) return;
    // W-BLOOM-LOW wake eel: its body held on the line is the authored whip — the swing's kill
    // width grows while the eel is the payload and falls back the moment it is released.
    const heldMult = finite(payload.data && payload.data.broodRemain && payload.data.broodRemain.whipMult);
    const halfWidth = 2.0 * (heldMult > 1 ? heldMult : 1);
    const batx = finite(payload.vel.x) * 0.55;
    const batz = finite(payload.vel.z) * 0.55;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const t = ((px[i] - axp) * segx + (pz[i] - azp) * segz) / len2;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const cxn = axp + segx * tc;
      const czn = azp + segz * tc;
      const dx = px[i] - cxn;
      const dz = pz[i] - czn;
      const rr = halfWidth + liveFamilyRadius[family[i]];
      if (dx * dx + dz * dz > rr * rr) continue;
      if (kills) {
        kill(i, 'collision', px[i], pz[i]);
      } else {
        // bat: the line drags the body along the swing
        vx[i] += batx;
        vz[i] += batz;
        creditUntil[i] = finite(state.simTime) + BROOD_CREDIT_WINDOW_S;
      }
    }
    // The same line crosses the Tendril's body — a taut whip severs a link exactly like it
    // shreds a mite, and the freed tail hunts on its own.
    for (let i = 0; i < TENDRIL_SEG_MAX; i++) {
      if (!segAlive[i]) continue;
      const t = ((segX[i] - axp) * segx + (segZ[i] - azp) * segz) / len2;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const cxn = axp + segx * tc;
      const czn = azp + segz * tc;
      const dx = segX[i] - cxn;
      const dz = segZ[i] - czn;
      const rr = halfWidth + TENDRIL_SEG_RADIUS;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (kills) killSeg(i, 'collision', segX[i], segZ[i]);
    }
  }

  // --- explosions (event-driven; the shared blast receipts) --------------------------------

  /** Read-only nearest physical Brood target on a projectile's already-swept segment. */
  function queryProjectileHit({ from, to, radius = 0 } = {}, out = {}) {
    const state = getState();
    const run = liveSwarmRun(state);
    if (!run || run.phase !== 'active' || run.wave !== liveWave || state.mode !== 'flight'
      || !finitePoint(from) || !finitePoint(to)) return null;
    return nearestDirectHit(from, to, radius, out);
  }

  /** Read-only nearest direct-damageable Brood life for a bounded turret target query. */
  function queryNearestDirectTarget({ from, range } = {}, out = {}) {
    const state = getState();
    const run = liveSwarmRun(state);
    const reach = Number(range);
    if (!run || run.phase !== 'active' || run.wave !== liveWave || state.mode !== 'flight'
      || !finitePoint(from) || !Number.isFinite(reach) || reach < 0 || !gridReady) return null;

    let bestDistanceSq = reach * reach;
    let bestKind = 2;
    let bestSlot = -1;
    let bestLife = 0;
    const padding = Math.max(maxLiveFamilyRadius, TENDRIL_SEG_RADIUS)
      + Math.max(maxLiveFamilySpeed, gridMaxSpeed) * DT;
    const minX = Math.floor((from.x - reach - padding) / CELL);
    const minZ = Math.floor((from.z - reach - padding) / CELL);
    const maxX = Math.floor((from.x + reach + padding) / CELL);
    const maxZ = Math.floor((from.z + reach + padding) / CELL);

    // The retained grid bounds this search to nearby cells. The full-capacity fallback is
    // intentionally absent: a turret firing cadence must never turn into a per-turret roster scan.
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        for (let slot = gridHead[cellKey(gx, gz)]; slot !== -1; slot = gridNext[slot]) {
          if (gridCellX[slot] !== gx || gridCellZ[slot] !== gz
            || alive[slot] !== 1 || !(hp[slot] > 0) || !directDamageAllowed(slot)) continue;
          const dx = px[slot] - from.x;
          const dz = pz[slot] - from.z;
          const distanceSq = dx * dx + dz * dz;
          if (distanceSq > bestDistanceSq
            || (distanceSq === bestDistanceSq && bestKind === 0 && serial[slot] >= bestLife)) continue;
          bestDistanceSq = distanceSq;
          bestKind = 0;
          bestSlot = slot;
          bestLife = serial[slot];
        }
      }
    }
    for (let slot = 0; slot < TENDRIL_SEG_MAX; slot++) {
      if (segAlive[slot] !== 1 || !(segHp[slot] > 0)) continue;
      const dx = segX[slot] - from.x;
      const dz = segZ[slot] - from.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > bestDistanceSq
        || (distanceSq === bestDistanceSq && (bestKind === 0
          || (bestKind === 1 && slot >= bestSlot)))) continue;
      bestDistanceSq = distanceSq;
      bestKind = 1;
      bestSlot = slot;
      bestLife = liveWave;
    }
    if (bestSlot < 0) return null;

    const isCell = bestKind === 0;
    const x = isCell ? px[bestSlot] : segX[bestSlot];
    const z = isCell ? pz[bestSlot] : segZ[bestSlot];
    out.ok = true;
    out.wave = liveWave;
    out.kind = isCell ? 'cell' : 'segment';
    out.life = bestLife;
    out.id = isCell ? `cell:${bestLife}` : `segment:${bestSlot}`;
    out.radius = isCell ? liveFamilyRadius[family[bestSlot]] : TENDRIL_SEG_RADIUS;
    out.distanceSq = bestDistanceSq;
    out.pos = out.pos || {};
    out.pos.x = x;
    out.pos.z = z;
    out.vel = out.vel || {};
    out.vel.x = isCell ? vx[bestSlot] : segVX[bestSlot];
    out.vel.z = isCell ? vz[bestSlot] : segVZ[bestSlot];
    return out;
  }

  /** Commit a projectile contact only while the exact Brood slot life still matches. */
  function commitProjectileHit(candidate, { projectileId, ownerId, damage, sourceId, damageType } = {}) {
    const state = getState();
    const run = liveSwarmRun(state);
    const projectile = projectileId == null ? null : state?.entities?.get?.(projectileId);
    if (!run || run.phase !== 'active' || run.wave !== liveWave || state.mode !== 'flight' || !candidate
      || candidate.wave !== liveWave || !projectile || projectile.type !== 'projectile'
      || projectile.id !== projectileId || state.entities.get(projectileId) !== projectile
      || projectileHitObjects.has(projectile)) {
      return { ok: false, reason: 'stale_brood_contact' };
    }
    if (!candidateIsLive(candidate)) return { ok: false, reason: 'stale_brood_life' };
    const amount = Number(damage);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_damage' };
    const credited = isCreditedDirectSource(ownerId, state);
    const result = applyDirectHit(candidate, amount, credited);
    if (!result.ok) return result;
    projectileHitObjects.add(projectile);
    flushKillsFrom(state);
    publish();
    const receipt = {
      projectileId, ownerId: ownerId ?? null, sourceId: sourceId || null, damageType: damageType || null,
      wave: liveWave, targetKind: candidate.kind, targetId: candidateId(candidate),
      targetLife: candidate.life, pos: { x: candidate.x, z: candidate.z }, damage: result.damage,
      hullBefore: result.hullBefore, hullAfter: result.hullAfter, killed: result.killed,
    };
    if (bus) bus.emit('swarm:broodProjectileHit', receipt);
    return { ok: true, ...receipt };
  }

  /** Apply a bounded, ordered Tesla-like sweep through the Brood's own life/death ledger. */
  function damageSegment({ from, to, radius = 0, damage, ownerId, sourceId, maxTargets = DIRECT_HIT_MAX } = {}) {
    const state = getState();
    const run = liveSwarmRun(state);
    if (!run || run.phase !== 'active' || run.wave !== liveWave || state.mode !== 'flight'
      || !finitePoint(from) || !finitePoint(to)) return { hits: 0, reason: 'brood_inactive' };
    const amount = Number(damage);
    if (!Number.isFinite(amount) || amount <= 0) return { hits: 0, reason: 'invalid_damage' };
    const limit = Math.max(1, Math.min(DIRECT_HIT_MAX, Math.trunc(Number(maxTargets) || DIRECT_HIT_MAX)));
    const count = collectSegmentHits(from, to, radius, limit);
    const credited = isCreditedDirectSource(ownerId, state);
    let hits = 0;
    let killed = 0;
    for (let i = 0; i < count; i++) {
      directHitScratch.wave = liveWave;
      directHitScratch.kind = directHitKind[i] === 0 ? 'cell' : 'segment';
      directHitScratch.slot = directHitSlot[i];
      directHitScratch.life = directHitLife[i];
      directHitScratch.t = directHitT[i];
      directHitScratch.x = from.x + (to.x - from.x) * directHitScratch.t;
      directHitScratch.z = from.z + (to.z - from.z) * directHitScratch.t;
      if (!candidateIsLive(directHitScratch)) continue;
      const result = applyDirectHit(directHitScratch, amount, credited);
      if (!result.ok) continue;
      hits++;
      if (result.killed) killed++;
      if (bus) bus.emit('swarm:broodTeslaHit', {
        ownerId: ownerId ?? null, sourceId: sourceId || null, wave: liveWave,
        targetKind: directHitScratch.kind, targetId: candidateId(directHitScratch),
        targetLife: directHitScratch.life, pos: { x: directHitScratch.x, z: directHitScratch.z },
        damage: result.damage, hullBefore: result.hullBefore, hullAfter: result.hullAfter, killed: result.killed,
      });
    }
    if (hits > 0) {
      flushKillsFrom(state);
      publish();
    }
    return { hits, killed };
  }

  function nearestDirectHit(from, to, queryRadius, out) {
    let bestT = Infinity, bestKind = 2, bestSlot = -1, bestLife = 0;
    const radius = Math.max(0, finite(queryRadius));
    if (gridReady) {
      setSegmentQueryBounds(from, to, radius);
      const bounds = segmentQueryBounds;
      for (let gx = bounds.minX; gx <= bounds.maxX; gx++) {
        for (let gz = bounds.minZ; gz <= bounds.maxZ; gz++) {
          for (let i = gridHead[cellKey(gx, gz)]; i !== -1; i = gridNext[i]) {
            if (gridCellX[i] !== gx || gridCellZ[i] !== gz || !alive[i] || !(hp[i] > 0) || !directDamageAllowed(i)) continue;
            const hitT = segmentCircleT(from, to, px[i], pz[i], directRadiusFor(i) + radius);
            if (hitT == null || !directCandidateBefore(hitT, 0, serial[i], bestT, bestKind, bestLife)) continue;
            bestT = hitT; bestKind = 0; bestSlot = i; bestLife = serial[i];
          }
        }
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
      swellUntil[i] = finite(getState()?.simTime) + (Number.isFinite(def.swellS) ? def.swellS : 2.6);
      // The swell is the bellows' authored beat ("it is swelling — strike it again"). A
      // burrowing sweller already spoke its own line cracking out of the rock — that tell
      // names the eruption, not the fuse — so it does not speak twice.
      if (!def.burrows) emitTelegraph(i, def);
      return;
    }
    alive[i] = 0;
    aliveCount -= 1;
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
