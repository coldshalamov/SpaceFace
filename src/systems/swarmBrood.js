// SWARM-07 B1 — the Brood engine: 100-400 light bodies beside the ship swarm
// (SWARM_EXPANSION §4 B1).
//
// WHY A SECOND POPULATION
// -----------------------
// Every enemy today is a full physics ship with AI, guns and a model, capped at 40 hulls. The
// genre's "swarm" means hundreds. The Brood are the other population: light bodies on a flat
// typed array, collision radii only, flocking, that feel the room and die by the room — so
// room kills scale from 3 at a time toward 40 at a time.
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
//
// DETERMINISM
// -----------
// No Math.random, no wall clock, no state.rng consumption (a shared-stream draw here would
// shift every other consumer's sequence and the golden hashes with it). The engine owns a
// mulberry32 stream seeded off (run seed, wave) — the same discipline swarmArena's debris uses —
// and reads state.simTime. Same seed => byte-identical positions tick-over-tick.
//
// PERFORMANCE
// -----------
// Every buffer is allocated once at create. The spatial hash, the rock/mover caches, the field
// sample scratch and the kill receipt scratch are all retained; a step allocates nothing. The
// renderer consumes the same retained buffers through the published view.

import { mulberry32 } from '../core/rng.js';
import { sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';
import { validateRunState } from '../core/runState.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { gateBearing } from './waveMaterialization.js';
import {
  BROOD_DRAG_PER_S,
  BROOD_LINK_RADIUS,
  BROOD_MAX_SPEED,
  BROOD_PLOW_MIN_MASS,
  BROOD_PLOW_MIN_SPEED,
  BROOD_PLAYER_RAM_SPEED,
  BROOD_SEP_RADIUS,
  BROOD_WHIP_BAT_SPEED,
  BROOD_WHIP_KILL_SPEED,
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_KILL_CAUSES,
  SWARM_BROOD_MAX,
  SWARM_BROOD_MIN,
  SWARM_BROOD_STATE_KEY,
  swarmBroodKillPay,
  swarmBroodPlan,
} from '../data/swarmBrood.js';

const DT = 1 / 60;
const CAP = SWARM_BROOD_MAX;

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
 * getState (returns the GameState) }. All buffers are allocated here, once. The published view
 * on state.swarmBrood references the same arrays for the engine's whole life.
 */
export function createBroodEngine(deps = {}) {
  const bus = deps.bus && typeof deps.bus.emit === 'function' ? deps.bus : null;
  const fieldList = typeof deps.fieldList === 'function' ? deps.fieldList : () => EMPTY_FIELDS;
  const getState = typeof deps.getState === 'function' ? deps.getState : () => null;

  // body state
  const px = new Float32Array(CAP);
  const pz = new Float32Array(CAP);
  const vx = new Float32Array(CAP);
  const vz = new Float32Array(CAP);
  const heading = new Float32Array(CAP);
  const family = new Uint8Array(CAP);   // index into the family mirror
  const hp = new Float32Array(CAP);
  const alive = new Uint8Array(CAP);
  const phase = new Uint8Array(CAP);    // family FSM phase (B2: windup/dash/latched)
  const timer = new Float32Array(CAP);  // FSM clock
  const seedPhase = new Float32Array(CAP);
  const serial = new Int32Array(CAP);
  const teleX = new Float32Array(CAP);
  const teleZ = new Float32Array(CAP);
  const teleDir = new Float32Array(CAP);

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
  let movCount = 0;

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

  // engine state
  let nextSerial = 1;
  let aliveCount = 0;
  let rng = mulberry32(1);
  let pendingPlan = null;     // [{ id, count }] composed at prepare, spawned at wave start
  let liveWave = 0;

  const view = {
    schema: 'spaceface.swarmBrood.v1',
    cap: CAP,
    aliveCount: 0,
    wave: 0,
    px, pz, vx, vz, heading, family, hp, alive, phase, timer, seedPhase,
    teleX, teleZ, teleDir,
  };

  // --- family table mirror (numeric fields the hot loop reads, rebuilt on demand) ----------

  const FAMILY_SLOT_MAX = 8;
  const liveFamilyId = new Array(FAMILY_SLOT_MAX).fill(null);
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
    liveWave = w;
    view.wave = liveWave;
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
    phase[slot] = 0;
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

  function cachePlayer(state) {
    const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    void player; // player anchor is read through the movers cache; kept for B2 hazards
  }

  function cacheRocks(state) {
    rockCount = 0;
    const list = indexedTypeScan(state, 'asteroids');
    for (let i = 0; i < list.length && rockCount < ROCK_CACHE_MAX; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos) continue;
      if (e.collides === false) continue;
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
    const list = indexedShipLikeScan(state);
    const playerId = state.playerId;
    for (let i = 0; i < list.length && movCount < MOVER_CACHE_MAX; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || !e.vel) continue;
      if (e.type !== 'ship' && e.type !== 'drone') continue;
      movX[movCount] = finite(e.pos.x);
      movZ[movCount] = finite(e.pos.z);
      movVX[movCount] = finite(e.vel.x);
      movVZ[movCount] = finite(e.vel.z);
      movMass[movCount] = finite(e.mass, 1);
      movRad[movCount] = finite(e.radius, 6);
      movIsPlayer[movCount] = e.id === playerId ? 1 : 0;
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

  let playerX = 0;
  let playerZ = 0;

  function step(state) {
    const run = liveSwarmRun(state);
    if (!run || run.phase !== 'active' || state.mode !== 'flight') return false;
    if (aliveCount <= 0) { publish(); return false; }

    const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    playerX = finite(player && player.pos && player.pos.x);
    playerZ = finite(player && player.pos && player.pos.z);

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
      const bx = px[i];
      const bz = pz[i];

      // -- flocking: neighbor forces through the spatial hash (3x3 cells covers both radii)
      let sepx = 0, sepz = 0;
      let cohx = 0, cohz = 0, alix = 0, aliz = 0, linkn = 0;
      const cx0 = Math.floor(bx / CELL);
      const cz0 = Math.floor(bz / CELL);
      for (let gx = cx0 - 1; gx <= cx0 + 1; gx++) {
        for (let gz = cz0 - 1; gz <= cz0 + 1; gz++) {
          let j = gridHead[cellKey(gx, gz)];
          while (j !== -1) {
            if (j !== i && alive[j]) {
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

      // -- seek the pilot; dive bursts keyed off the body's own seed phase (dodgeable rhythm)
      const dxp = playerX - bx;
      const dzp = playerZ - bz;
      const dp = Math.sqrt(dxp * dxp + dzp * dzp);
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
    flushKills(state);
    publish();
    return true;
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
  }

  // --- explosions (event-driven; the shared blast receipts) --------------------------------

  function onExplosion(payload) {
    if (!payload || aliveCount <= 0) return;
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

  function publish() {
    view.aliveCount = aliveCount;
    view.wave = liveWave;
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
    /** Live population figures, for tests and the lab overlay. */
    census() {
      return { alive: aliveCount, cap: CAP, min: SWARM_BROOD_MIN, wave: liveWave };
    },
    // Test seams: direct, read-only unless named as a seam.
    _bodies: { px, pz, vx, vz, alive, family, heading, hp, phase, timer, teleX, teleZ, teleDir, serial, seedPhase },
    _setFamilyMirrorForTest: setFamilyMirror,
    _killDirectForTest(i, cause) {
      killCount.fill(0);
      killCredits.fill(0);
      killScore.fill(0);
      kill(i, cause, px[i], pz[i]);
      flushKillsFrom(getState());
      publish();
    },
  };
}
