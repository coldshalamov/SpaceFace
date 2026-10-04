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

import { mulberry32 } from '../core/rng.js';
import { sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';
import { validateRunState } from '../core/runState.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { gateBearing } from './waveMaterialization.js';
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
  BROOD_PLAYER_RAM_SPEED,
  BROOD_POOL_MAX,
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

const DT = 1 / 60;
const CAP = SWARM_BROOD_MAX;

// family FSM phases (published; the renderer reads them for the telegraph language)
export const BROOD_PHASE_FLOCK = 0;
export const BROOD_PHASE_WINDUP = 1;
export const BROOD_PHASE_DASH = 2;
export const BROOD_PHASE_RECOVER = 3;
export const BROOD_PHASE_LATCHED = 4;

// --- spatial hash: open hashing over 16wu cells, chained lists in retained arrays -----------
const CELL = 16;
const GRID_TABLE = 4096; // power of two
const GRID_MASK = GRID_TABLE - 1;

function cellKey(cx, cz) {
  return ((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & GRID_MASK);
}

// mover/rock caches — rebuilt into retained arrays every tick, never reallocated
const ROCK_CACHE_MAX = 64;
const MOVER_CACHE_MAX = 96;

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
  const routeDamage = typeof deps.routeDamage === 'function' ? deps.routeDamage : null;

  // body state
  const px = new Float32Array(CAP);
  const pz = new Float32Array(CAP);
  const vx = new Float32Array(CAP);
  const vz = new Float32Array(CAP);
  const heading = new Float32Array(CAP);
  const family = new Uint8Array(CAP);   // index into the family mirror
  const hp = new Float32Array(CAP);
  const alive = new Uint8Array(CAP);
  const phase = new Uint8Array(CAP);    // family FSM phase (see BROOD_PHASE_*)
  const timer = new Float32Array(CAP);  // FSM clock
  const seedPhase = new Float32Array(CAP);
  const serial = new Int32Array(CAP);
  const teleX = new Float32Array(CAP);  // windup target point (marker/line end)
  const teleZ = new Float32Array(CAP);
  const teleDir = new Float32Array(CAP); // windup bearing (the charger's line)

  // spatial hash
  const gridHead = new Int32Array(GRID_TABLE);
  const gridNext = new Int32Array(CAP);

  // caches
  const rockX = new Float32Array(ROCK_CACHE_MAX);
  const rockZ = new Float32Array(ROCK_CACHE_MAX);
  const rockR = new Float32Array(ROCK_CACHE_MAX);
  const rockVX = new Float32Array(ROCK_CACHE_MAX);
  const rockVZ = new Float32Array(ROCK_CACHE_MAX);
  let rockCount = 0;
  const movX = new Float32Array(MOVER_CACHE_MAX);
  const movZ = new Float32Array(MOVER_CACHE_MAX);
  const movVX = new Float32Array(MOVER_CACHE_MAX);
  const movVZ = new Float32Array(MOVER_CACHE_MAX);
  const movMass = new Float32Array(MOVER_CACHE_MAX);
  const movRad = new Float32Array(MOVER_CACHE_MAX);
  const movIsPlayer = new Uint8Array(MOVER_CACHE_MAX);
  const movIsHead = new Uint8Array(MOVER_CACHE_MAX);
  let movCount = 0;

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
  const killCredits = new Int32Array(CAUSE_N);
  const killScore = new Int32Array(CAUSE_N);
  const killPosX = new Float32Array(CAUSE_N);
  const killPosZ = new Float32Array(CAUSE_N);
  const CAUSE_INDEX = {};
  SWARM_BROOD_KILL_CAUSES.forEach((cause, i) => { CAUSE_INDEX[cause] = i; });

  // field sampling scratch — reused for every body, every tick
  const accel = { ax: 0, az: 0 };
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

  // --- B4: the Hive's reserve (see src/systems/theHiveArena.js) ------------------------
  //
  // Inside the Hive, part of the wave's own planned cohort is held back: the wave opens
  // with (total - reserve) bodies and the room's spawn sacs release the rest on their
  // cadence through sacRelease(). The reserve is still the SAME plan — immediate plus
  // reserve never exceeds the population law's total; a sac killed early strands its
  // share, which is the tide the player cut.
  let hiveMode = false;
  let sacBudget = 0;
  let immediateQuota = Infinity;

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
  };

  // --- family table mirror (numeric fields the hot loop reads, rebuilt on demand) ----------

  const FAMILY_SLOT_MAX = 8;
  const liveFamilyId = new Array(FAMILY_SLOT_MAX).fill(null);
  const liveFamilyDef = new Array(FAMILY_SLOT_MAX).fill(null);
  const liveFamilyRadius = new Float32Array(FAMILY_SLOT_MAX);
  const liveFamilyMass = new Float32Array(FAMILY_SLOT_MAX);
  const liveFamilyHull = new Float32Array(FAMILY_SLOT_MAX);
  const liveFamilySpeed = new Float32Array(FAMILY_SLOT_MAX);
  let liveFamilyCount = 0;

  function setFamilyMirror(defs) {
    liveFamilyCount = 0;
    for (let i = 0; i < Math.min(defs.length, FAMILY_SLOT_MAX); i++) {
      const def = defs[i];
      liveFamilyId[liveFamilyCount] = def.id;
      liveFamilyDef[liveFamilyCount] = def;
      liveFamilyRadius[liveFamilyCount] = def.radius;
      liveFamilyMass[liveFamilyCount] = def.mass;
      liveFamilyHull[liveFamilyCount] = def.hull;
      liveFamilySpeed[liveFamilyCount] = def.speed;
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
    if (!pay) {
      pay = swarmBroodKillPay(familyIdStr);
      killPayCache.set(familyIdStr, pay);
    }
    return pay;
  }

  // --- lifecycle --------------------------------------------------------------------------

  function clear(reason = 'clear') {
    if (aliveCount > 0) alive.fill(0);
    aliveCount = 0;
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
    immediateQuota = Infinity;
    publish();
    void reason;
  }

  /** Plan the wave's cohort. Called at run:wavePlanned; spawning happens at wave start. */
  function prepareWave(run, wave) {
    const seed = finite(run && run.seed, 1);
    const w = Math.max(1, Math.trunc(Number(wave) || 1));
    clear('wave_planned');
    rng = mulberry32(broodStreamSeed(seed, w));
    pendingPlan = swarmBroodPlan(w, rng);
    // The Tendril's wave arms the body: the engine waits for the champion hull to materialize
    // (a real entity, stamped by its catalog id) and trails the chain behind it.
    tendrilMode = swarmBroodBossFor(w) === SWARM_BROOD_TENDRIL_ID;
    // B4 — the Hive holds a share of its own cohort in the sacs. The reserve is part of
    // the SAME plan total: spawnWave delivers the rest at the wave's open.
    let planned = 0;
    for (const part of pendingPlan) planned += Number.isInteger(part.count) ? part.count : 0;
    sacBudget = swarmBroodSacReserve(planned, run && run.arenaId);
    hiveMode = sacBudget > 0;
    immediateQuota = planned - sacBudget;
    liveWave = w;
    view.wave = liveWave;
    view.tendril = tendrilMode;
    publish();
  }

  /** Fill the planned cohort around the player anchor, in clumps on the wave's gate ring. */
  function spawnWave(state) {
    if (!pendingPlan || pendingPlan.length === 0) return 0;
    const player = state && state.entities && state.playerId != null
      ? state.entities.get(state.playerId) : null;
    const ax = finite(player && player.pos && player.pos.x);
    const az = finite(player && player.pos && player.pos.z);
    const familyIndex = buildFamilyIndex();
    const distance = 165;
    let spawned = 0;
    let groupIndex = 0;
    for (const part of pendingPlan) {
      const found = familyIndex.get(part.id);
      const famIdx = found == null ? -1 : found;
      if (famIdx < 0) continue;
      // Clumps of ~18 on walked gate bearings: arrivals read as packs on several sides — the
      // same throw-shaped grammar SWARM-03 gave ship batches.
      const clumpSize = 18;
      let remaining = part.count;
      while (remaining > 0) {
        const bearing = gateBearing(GATE_RING[groupIndex % GATE_RING.length]);
        groupIndex += 1;
        const baseAngle = Math.atan2(bearing.z, bearing.x);
        const cx = ax + Math.cos(baseAngle) * distance;
        const cz = az + Math.sin(baseAngle) * distance;
        const n = Math.min(clumpSize, remaining);
        remaining -= n;
        for (let i = 0; i < n; i++) {
          // B4 — the Hive's reserve stays in the sacs: the wave's open delivers only the
          // plan's immediate share; the sacs pay the rest out on their own clock.
          if (spawned >= immediateQuota) { pendingPlan = null; publish(); return spawned; }
          const slot = findFreeSlot();
          if (slot < 0) { pendingPlan = null; publish(); return spawned; } // the cap is the law
          const a = rng() * Math.PI * 2;
          const r = Math.sqrt(rng()) * 30;
          spawnAt(slot, famIdx, cx + Math.cos(a) * r, cz + Math.sin(a) * r);
          spawned += 1;
        }
      }
    }
    pendingPlan = null;
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
    alive[slot] = 1;
    phase[slot] = BROOD_PHASE_FLOCK;
    timer[slot] = 0;
    seedPhase[slot] = rng() * Math.PI * 2;
    serial[slot] = nextSerial++;
    aliveCount += 1;
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

  function cachePlayer(state) {
    playerRef = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    playerX = finite(playerRef && playerRef.pos && playerRef.pos.x);
    playerZ = finite(playerRef && playerRef.pos && playerRef.pos.z);
    playerVX = finite(playerRef && playerRef.vel && playerRef.vel.x);
    playerVZ = finite(playerRef && playerRef.vel && playerRef.vel.z);
    playerRad = finite(playerRef && playerRef.radius, 6);
    playerMass = Math.max(1, finite(playerRef && playerRef.mass, 400));
  }

  function cacheRocks(state) {
    rockCount = 0;
    const list = indexedTypeScan(state, 'asteroids');
    for (let i = 0; i < list.length && rockCount < ROCK_CACHE_MAX; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos) continue;
      if (e.collides === false) continue;
      // The Tendril head is never terrain — it plows the flock through the MOVER cache like
      // any heavy body. Under the index it never reaches this list anyway; on the un-indexed
      // fallback every entity lands here, and without the guard the worm eats its own neck.
      if (e.data && e.data.lootTableId === TENDRIL_HEAD_LOOT_ID) continue;
      rockX[rockCount] = finite(e.pos.x);
      rockZ[rockCount] = finite(e.pos.z);
      rockR[rockCount] = finite(e.radius, 10) * 1.05;
      rockVX[rockCount] = finite(e.vel && e.vel.x);
      rockVZ[rockCount] = finite(e.vel && e.vel.z);
      rockCount += 1;
    }
  }

  function cacheMovers(state) {
    movCount = 0;
    headFound = false;
    const list = indexedShipLikeScan(state);
    const playerId = state.playerId;
    for (let i = 0; i < list.length && movCount < MOVER_CACHE_MAX; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || !e.vel) continue;
      if (e.type !== 'ship' && e.type !== 'drone') continue;
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
      movX[movCount] = finite(e.pos.x);
      movZ[movCount] = finite(e.pos.z);
      movVX[movCount] = finite(e.vel.x);
      movVZ[movCount] = finite(e.vel.z);
      movMass[movCount] = finite(e.mass, 1);
      movRad[movCount] = finite(e.radius, 6);
      movIsPlayer[movCount] = e.id === playerId ? 1 : 0;
      movIsHead[movCount] = isHead ? 1 : 0;
      movCount += 1;
    }
  }

  function rebuildGrid() {
    gridHead.fill(-1);
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const key = cellKey(Math.floor(px[i] / CELL), Math.floor(pz[i] / CELL));
      gridNext[i] = gridHead[key];
      gridHead[key] = i;
    }
  }

  // --- the step ---------------------------------------------------------------------------

  function step(state) {
    const run = liveSwarmRun(state);
    if (!run || run.phase !== 'active' || state.mode !== 'flight') return false;
    // The Tendril wave keeps stepping while the body may still exist — the champion hull can
    // materialize after the flock dies, and the chain outlives it by exactly one collapse.
    const tendrilWatching = tendrilMode && !tendrilDone;
    // B4 — the sac reserve keeps the step alive too: the Hive's tide may still be held.
    if (aliveCount <= 0 && lobCount <= 0 && poolCount <= 0 && segAliveCount <= 0
      && !tendrilWatching && sacBudget <= 0) { publish(); return false; }

    cachePlayer(state);
    cacheRocks(state);
    cacheMovers(state);
    rebuildGrid();
    killCount.fill(0);
    killCredits.fill(0);
    killScore.fill(0);

    const fields = fieldList() || EMPTY_FIELDS;
    const simTime = finite(state.simTime);
    const dt = DT;
    const dragKeep = Math.max(0, 1 - BROOD_DRAG_PER_S * dt);
    const fieldsEmpty = fields.length === 0;
    const linkR2 = BROOD_LINK_RADIUS * BROOD_LINK_RADIUS;
    const sepR = BROOD_SEP_RADIUS;

    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const fam = family[i];

      // -- latched leechers ride the host: glue position, brake, shed by wall scrape
      if (phase[i] === BROOD_PHASE_LATCHED) {
        stepLatched(i, fam, dt, state);
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
              if (j !== i && alive[j] && phase[j] !== BROOD_PHASE_LATCHED) {
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
        const def = liveFamilyDef[fam];
        if (dp > 24 && dp > 1e-4) {
          const diveT = simTime * 0.42 + seedPhase[i];
          const seek = (diveT % 1) < 0.22 ? 26 : 9;
          ax += (dxp / dp) * seek;
          az += (dzp / dp) * seek;
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
        }

        // -- integrate (semi-implicit Euler, the sim's shape)
        vx[i] = (vx[i] + ax * dt) * dragKeep;
        vz[i] = (vz[i] + az * dt) * dragKeep;
        const speed2 = vx[i] * vx[i] + vz[i] * vz[i];
        const speedCap = liveFamilySpeed[fam] * 2.4;
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
          timer[i] -= dt;
          if (timer[i] <= 0) {
            if (def.id === 'spitter') fireLob(i, fam);
            else if (def.id === 'charger') beginDash(i, fam);
            else phase[i] = BROOD_PHASE_FLOCK;
          }
        } else if (def && def.id === 'spitter') {
          stepSpitter(i, dp, dt);
        } else if (def && def.id === 'charger') {
          stepCharger(i, dp);
        } else if (def && def.id === 'leecher') {
          stepLeecher(i, fam, dp);
        }
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
        const moving = relx * relx + relz * relz >= BROOD_PLOW_MIN_SPEED * BROOD_PLOW_MIN_SPEED;
        kill(i, moving ? 'collision' : 'terrain', px[i], pz[i]);
        break;
      }
      if (!alive[i]) continue;

      // -- deaths by plow: a heavy body moving fast through the pack. The throw, the swing,
      //    the ship itself — whatever the massline latches and releases is exactly such a body.
      for (let m = 0; m < movCount; m++) {
        const dx = px[i] - movX[m];
        const dz = pz[i] - movZ[m];
        const rr = movRad[m] + rad;
        if (dx * dx + dz * dz > rr * rr) continue;
        const relx = movVX[m] - vx[i];
        const relz = movVZ[m] - vz[i];
        const relSpeed2 = relx * relx + relz * relz;
        const isPlayer = movIsPlayer[m] === 1;
        const ramSpeed = isPlayer ? BROOD_PLAYER_RAM_SPEED : BROOD_PLOW_MIN_SPEED;
        if (relSpeed2 >= ramSpeed * ramSpeed && (isPlayer || movMass[m] >= BROOD_PLOW_MIN_MASS)) {
          kill(i, 'collision', px[i], pz[i]);
          break;
        }
      }
    }

    sweepWhipLine(state);
    stepLobs(state, dt);
    stepPools(state, dt);
    stepTendril(state, dt, simTime);
    flushKills(state);
    publish();
    return true;
  }

  // --- the spitter: a marked arc, then a splash that stays a beat ---------------------------

  function stepSpitter(i, dp, dt) {
    if (phase[i] !== BROOD_PHASE_FLOCK) return;
    timer[i] -= dt;
    if (timer[i] > 0 || dp > BROOD_SPITTER_LOB_RANGE || dp < 1e-4) return;
    // Lead the marker by the flight time so a moving pilot must actually move to dodge.
    const flightS = dp / BROOD_SPITTER_LOB_SPEED;
    teleX[i] = playerX + playerVX * flightS;
    teleZ[i] = playerZ + playerVZ * flightS;
    phase[i] = BROOD_PHASE_WINDUP;
    timer[i] = BROOD_SPITTER_WINDUP_S;
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
    if (routeDamage && playerRef && playerRef.alive !== false) {
      const dx = playerX - x;
      const dz = playerZ - z;
      if (dx * dx + dz * dz <= (BROOD_SPITTER_SPLASH_RADIUS + playerRad * 0.5) ** 2) {
        routePlayerDamage(BROOD_SPITTER_SPLASH_DAMAGE, x, z, 'brood_acid');
      }
    }
    // The acid does not spare the swarm: bodies in the splash die by it.
    const r2 = BROOD_SPITTER_SPLASH_RADIUS * BROOD_SPITTER_SPLASH_RADIUS;
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const dx = px[i] - x;
      const dz = pz[i] - z;
      if (dx * dx + dz * dz <= r2) kill(i, 'explosive', x, z);
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
      if (playerRef && playerRef.alive !== false) {
        const dx = playerX - poolX[i];
        const dz = playerZ - poolZ[i];
        if (dx * dx + dz * dz <= (BROOD_SPITTER_POOL_RADIUS + playerRad * 0.5) ** 2) playerIn = true;
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
    void state;
  }

  function routePlayerDamage(damage, x, z, sourceId) {
    if (!routeDamage || !(damage > 0)) return;
    routeDamage({
      attackerId: null,
      targetId: playerRef ? playerRef.id : null,
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
  function stepCharger(i, dp) {
    // The recover beat: the pass is spent and the body is exposed until it re-arms.
    if (phase[i] === BROOD_PHASE_RECOVER) {
      timer[i] -= DT;
      if (timer[i] <= 0) phase[i] = BROOD_PHASE_FLOCK;
      return;
    }
    if (dp > BROOD_CHARGER_RANGE || dp < 1e-4) return;
    // The tell: the line draws toward where the pass will go, for the whole windup.
    const lead = dp / BROOD_CHARGER_DASH_SPEED;
    teleX[i] = playerX + playerVX * lead;
    teleZ[i] = playerZ + playerVZ * lead;
    teleDir[i] = Math.atan2(teleZ[i] - pz[i], teleX[i] - px[i]);
    phase[i] = BROOD_PHASE_WINDUP;
    timer[i] = BROOD_CHARGER_WINDUP_S;
  }

  /** One tick of a live pass: the hull takes it and the shove it carries, once per dash. */
  function stepChargerDash(i, fam, state) {
    const rad = liveFamilyRadius[fam];
    if (playerRef && playerRef.alive !== false) {
      const sx = playerX - px[i];
      const sz = playerZ - pz[i];
      const rr = playerRad + rad;
      if (sx * sx + sz * sz <= rr * rr) {
        routePlayerDamage(BROOD_CHARGER_SLAM_DAMAGE, px[i], pz[i], 'brood_charger');
        const d = Math.sqrt(sx * sx + sz * sz) || 1;
        // The pass lands as an ADDITIVE shove across the membrane, never a velocity write.
        queuePhysicsImpulse(playerRef, {
          x: (sx / d) * BROOD_CHARGER_SHOVE_DV * playerMass,
          y: 0,
          z: (sz / d) * BROOD_CHARGER_SHOVE_DV * playerMass,
        });
        phase[i] = BROOD_PHASE_RECOVER;
        timer[i] = BROOD_CHARGER_RECOVER_S;
        return;
      }
    }
    timer[i] -= DT;
    if (timer[i] <= 0) {
      phase[i] = BROOD_PHASE_RECOVER;
      timer[i] = BROOD_CHARGER_RECOVER_S;
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
    if (dp <= BROOD_LEECHER_LATCH_RANGE + playerRad * 0.5 && playerRef
      && playerRef.alive !== false) {
      phase[i] = BROOD_PHASE_LATCHED;
      timer[i] = 0;
      teleDir[i] = seedPhase[i];
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
    if (speed > 1 && playerRef) {
      const dv = Math.min(BROOD_LEECHER_BRAKE_ACCEL * dt, speed);
      queuePhysicsImpulse(playerRef, {
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
  function killSeg(i, cause, sampleX, sampleZ) {
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
    const pay = killPayFor(TENDRIL_SEG_PAY_FAMILY);
    killCredits[c] += pay.credits;
    killScore[c] += pay.score;
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
      if (segContactT[i] <= 0 && playerRef && playerRef.alive !== false && sp2 > 1) {
        const dx = playerX - segX[i];
        const dz = playerZ - segZ[i];
        const rr = playerRad + TENDRIL_SEG_RADIUS;
        if (dx * dx + dz * dz <= rr * rr) {
          routePlayerDamage(TENDRIL_SEG_CONTACT_DAMAGE, segX[i], segZ[i], 'brood_tendril');
          const d = Math.sqrt(dx * dx + dz * dz) || 1;
          queuePhysicsImpulse(playerRef, {
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
        killSeg(i, moving ? 'collision' : 'terrain', segX[i], segZ[i]);
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
        if (relSpeed2 >= ramSpeed * ramSpeed && (isPlayer || movMass[m] >= BROOD_PLOW_MIN_MASS)) {
          killSeg(i, 'collision', segX[i], segZ[i]);
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
    const halfWidth = 2.0;
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

  function onExplosion(payload) {
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
    killCredits.fill(0);
    killScore.fill(0);
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      const dx = px[i] - ex;
      const dz = pz[i] - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 > shoveR2) continue;
      if (d2 <= killR2) {
        kill(i, 'explosive', ex, ez);
        continue;
      }
      const d = Math.sqrt(d2) || 1;
      const falloff = 1 - d / shoveR;
      vx[i] += (dx / d) * falloff * 90;
      vz[i] += (dz / d) * falloff * 90;
    }
    for (let i = 0; i < TENDRIL_SEG_MAX; i++) {
      if (!segAlive[i]) continue;
      const dx = segX[i] - ex;
      const dz = segZ[i] - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 <= killR2) killSeg(i, 'explosive', ex, ez);
      // A blast shove on a chain is just a faster weave for a tick — the projection next
      // tick pulls it back onto the line, which reads as the body flexing, not breaking.
    }
    flushKillsFrom(getState());
    publish();
  }

  // --- death bookkeeping -------------------------------------------------------------------

  function kill(i, cause, sampleX, sampleZ) {
    alive[i] = 0;
    aliveCount -= 1;
    const c = CAUSE_INDEX[cause];
    if (c == null) return;
    killCount[c] += 1;
    if (killCount[c] === 1) {
      killPosX[c] = finite(sampleX);
      killPosZ[c] = finite(sampleZ);
    }
    const pay = killPayFor(liveFamilyId[family[i]]);
    killCredits[c] += pay.credits;
    killScore[c] += pay.score;
  }

  function flushKills(state) {
    flushKillsFrom(state);
  }

  function flushKillsFrom(state) {
    const run = state ? liveSwarmRun(state) : null;
    const wave = run ? run.wave : liveWave;
    const canPay = !!(run && bus);
    for (let c = 0; c < CAUSE_N; c++) {
      const count = killCount[c];
      if (count <= 0) continue;
      const cause = SWARM_BROOD_KILL_CAUSES[c];
      if (bus) {
        bus.emit('swarm:broodKills', {
          count,
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
    killCount.fill(0);
    killCredits.fill(0);
    killScore.fill(0);
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
    if (born > 0) publish();
    return born;
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

  function publish() {
    view.aliveCount = aliveCount;
    view.wave = liveWave;
    view.lobCount = lobCount;
    view.poolCount = poolCount;
    view.tendril = tendrilMode;
    view.segAliveCount = segAliveCount;
    view.hive = hiveMode;
    view.sacBudget = sacBudget;
    const state = getState();
    if (state && state[SWARM_BROOD_STATE_KEY] !== view) {
      // Assign once; the view identity is stable for the engine's whole life.
      state[SWARM_BROOD_STATE_KEY] = view;
    }
  }

  setFamilyMirror(SWARM_BROOD_FAMILIES);
  publish();

  return {
    id: 'swarmBrood',
    view,
    prepareWave,
    spawnWave,
    step,
    clear,
    onExplosion,
    // B4 — the Hive's seams: sacs spend the wave's reserve, sacs drip acid.
    sacRelease,
    hivePool,
    /** Live population figures, for tests and the lab overlay. */
    census() {
      return { alive: aliveCount, cap: CAP, min: SWARM_BROOD_MIN, wave: liveWave, sacBudget };
    },
    // Test seams: direct, read-only unless named as a seam.
    _bodies: { px, pz, vx, vz, alive, family, heading, hp, phase, timer, teleX, teleZ, teleDir, serial, seedPhase },
    _lobs: { x: lobX, z: lobZ, t: lobT, total: lobTotal, tx: lobTX, tz: lobTZ, alive: lobAlive },
    _pools: { x: poolX, z: poolZ, age: poolAge, ttl: poolTtl },
    // B3 — the Tendril's chain: read-only buffers plus one write seam for the split test.
    _segs: { x: segX, z: segZ, vx: segVX, vz: segVZ, hp: segHp, alive: segAlive, lead: segLead, heading: segHeading },
    _tendril() {
      return { mode: tendrilMode, headSeen: tendrilHeadSeen, done: tendrilDone, spawned: wormSpawned, headFound };
    },
    _hive() {
      return { mode: hiveMode, sacBudget, immediateQuota };
    },
    _setFamilyMirrorForTest: setFamilyMirror,
    _killDirectForTest(i, cause) {
      killCount.fill(0);
      killCredits.fill(0);
      killScore.fill(0);
      kill(i, cause, px[i], pz[i]);
      flushKillsFrom(getState());
      publish();
    },
    _killSegDirectForTest(i, cause) {
      killCount.fill(0);
      killCredits.fill(0);
      killScore.fill(0);
      killSeg(i, cause, segX[i], segZ[i]);
      flushKillsFrom(getState());
      publish();
    },
  };
}
