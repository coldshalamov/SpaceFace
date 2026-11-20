// The pack brain: how every ordinary Swarm ship thinks. One shared pass per tick instead of one
// tactical stack per hull.
//
// WHAT EACH UNIT DOES
//   * Context steering (contextSteering.js): goals write interest over 16 directions, threats write
//     danger, the safest most-interesting direction wins. Interest: the attack goal (a ring slot
//     around the player's PREDICTED position, an intercept point on a run), the flight's flow
//     (alignment) and its centre (cohesion), a parking point inside a flight for the Zealot.
//     Danger: rocks and hulls along each direction (swept circles from a per-unit hazard cache),
//     flight-mates and other ships on a collision course (reciprocal: each side takes half the
//     avoidance, from relative velocity and time to closest approach), the player's hull outside
//     a committed run, and incoming thrown bodies for kinds that dodge.
//   * Time-to-collision braking near big bodies; lead pursuit and predictive aim at the player.
//   * A small role script per archetype (data in src/data/packArchetypes.js): approach → tell →
//     strike → recover, publishing the same ai:telegraph / ai:doctrinePhase events and going
//     through the same applyAIFiringIntent → engagementAuthority gate as every other hull.
//
// WHAT IT SHARES
//   One uniform grid of all live ships is built per tick (counting-sort into flat Int32Arrays);
//   flights (data.ai.wingId) get one centroid/flow row per tick; thrown bodies are collected once
//   per tick and only if a dodging kind is present. Static hazards are re-queried from the world's
//   spatial hash per unit on a staggered 6-tick cadence (rocks rest; R11).
//
// LEVEL OF DETAIL
//   Near the player every unit thinks every tick. Farther units think every 2nd / 6th tick on an
//   id-hashed phase and re-submit their last motor command in between. Deterministic: stable id
//   order, tick counters, no randomness, no wall clock.
//
// Planning only: motion leaves as normalized thruster requests through the maneuver port.

import { makeThrusterRequest, ManeuverKind, wrapAngle, hashUnit } from '../contracts.js';
import {
  CONTEXT_SLOTS, clearMap, writeInterest, addInterest, writeDanger, writeSweptCircleDanger,
  chooseDirection,
} from './contextSteering.js';
import { packArchetypeFor, PACK_FIRE_PHASE_BY_DOCTRINE, PACK_TELL_FLOOR_TICKS } from '../../data/packArchetypes.js';
import { applyAIFiringIntent, clearAIFiringIntent } from '../../systems/aiFireIntent.js';
import { authorizeAIEngagement } from '../engagementAuthority.js';
import { shovePanicLive } from '../shovePanic.js';
import { isTumbling } from '../../combat/tumbleStatus.js';
import { isCounterplayOwned } from '../counterplay/live.js';
import { isDynamicPhysicsBodyEntity } from '../../core/physicsAuthority.js';
import { modelTruthPlanarRadius } from '../../data/modelTruth.js';

export const PACK_PHASE = Object.freeze({ APPROACH: 0, WINDUP: 1, STRIKE: 2, RECOVER: 3 });
const APPROACH_PHASE_NAME = 'ingress';
const RECOVER_PHASE_NAME = 'extend';

const NEAR_WU = 900;
const MID_WU = 1800;
const GRID_CELL = 160;
const GRID_BUCKETS = 4096;
const NEIGHBOR_WU = 170;
// The world hash buckets bodies by centre, so the query reaches past the lookahead far enough to
// catch the centre of a big station whose skin is already close.
const HAZARD_QUERY_WU = 420;
const HAZARD_SLOTS = 8;
const HAZARD_REFRESH_TICKS = 3;
const SURFACE_WATCH_WU = 220;
const SURFACE_TOUCH_SPEED = 14;
const SURFACE_DECEL = 70;
const SURFACE_MARGIN_WU = 10;
const FIRE_RECHECK_TICKS = 6;
const HAZARD_CLEARANCE = 22;
const TTC_BRAKE_S = 1.5;
const AVOID_HORIZON_S = 1.1;
const BODY_SPEED_MIN = 120;
const AUTH_RETRY_TICKS = 15;
const TURN_FIRST_ANGLE = 1.3;
const YAW_SOFT = 0.55;
const YAW_RATE = 2.4;
const YAW_GAIN = 0.7;
const YAW_LIMIT = 0.62;
const ACCEL_GAIN = 2.6;
const REF_FWD_ACCEL = 96;
const REF_LAT_ACCEL = 52;
const SLEW = 0.1;
const SLEW_FAST = 0.32;
const SHOT_SPEED_REF = 620;
const DODGE_WINDUP_TICKS = { light: 6, medium: 18 };
const DODGE_COOLDOWN_TICKS = { light: 240, medium: 120 };

const EMPTY = Object.freeze([]);

function finite(v, d = 0) { return Number.isFinite(v) ? v : d; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function approach(cur, target, step) {
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

/** Is this live hull one the pack brain should own? Pure; the caller supplies the state. */
export function isPackCandidate(entity, state) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || entity.id === state.playerId) return false;
  const data = entity.data;
  if (!data || data.runCohort !== 'survival') return false;
  const ai = data.ai;
  if (!ai) return false;
  if (!packArchetypeFor(data.lootTableId || data.enemyTypeId)) return false;
  if (data.swarmChampion === true || data.runRole === 'elite' || data.nemesis || data.missionTag) return false;
  if (isCounterplayOwned(entity, state)) return false;
  return true;
}

function newRecord(entity, arch, tick, seed) {
  const id = entity.id;
  return {
    entity,
    arch,
    id,
    hash: hashUnit(seed, id, 'pack'),
    side: hashUnit(seed, id, 'side') < 0.5 ? -1 : 1,
    phase: PACK_PHASE.APPROACH,
    phaseTick: tick,
    cooldownUntil: tick + Math.floor(hashUnit(seed, id, 'first') * 90),
    authRetryAt: 0,
    cycle: 0,
    strikeX: 0, strikeZ: 0, closest: Infinity,
    // motor
    lastRot: finite(entity.rot), lastRotTick: tick,
    smF: 0, smR: 0, smT: 0,
    dirX: Math.cos(finite(entity.rot)), dirZ: Math.sin(finite(entity.rot)),
    lastThinkTick: -1,
    req: null,
    reqKind: ManeuverKind.INTERCEPT,
    // hazard cache: x, z, r per slot
    hz: new Float32Array(HAZARD_SLOTS * 3), hzCount: 0, hzTick: -1000,
    // dodge
    dodgeUntil: 0, dodgeArmTick: -1, dodgeCooldownUntil: 0, dodgeX: 0, dodgeZ: 0,
    fireCheckedTick: -1,
    // the decision-shaped record the shared fire gate reads (mutated, never reallocated)
    fire: {
      entityId: id,
      directive: { objective: { kind: 'focus', targetId: null, targetObserved: true, reason: '' } },
      combatDoctrine: { doctrineId: '', phase: '', fireWindow: true, cycle: 0, phaseStartedTick: 0, targetId: null },
      action: { actionId: 'pack_strike' },
    },
  };
}

export class PackBrain {
  constructor({ seed = 1 } = {}) {
    this.seed = (Number(seed) >>> 0) || 1;
    this.records = new Map();
    this.units = [];
    this.cap = 0;
    this._grow(64);
    this.gridHead = new Int32Array(GRID_BUCKETS);
    this.flightKeys = new Map();
    this.flightCount = 0;
    this.flightSum = new Float64Array(64 * 5); // x, z, vx, vz, n
    this.bodies = [];
    this.hazardScratch = [];
    this.interest = new Float32Array(CONTEXT_SLOTS);
    this.danger = new Float32Array(CONTEXT_SLOTS);
    this.choice = { x: 1, z: 0, danger: 0, interest: 0 };
    this.lastStats = { units: 0, thinks: 0, hazardQueries: 0 };
  }

  _grow(n) {
    const cap = Math.max(n, this.cap * 2);
    const keep = (Old, T) => { const a = new T(cap); if (Old) a.set(Old.subarray(0, this.cap)); return a; };
    this.px = keep(this.px, Float32Array); this.pz = keep(this.pz, Float32Array);
    this.vx = keep(this.vx, Float32Array); this.vz = keep(this.vz, Float32Array);
    this.rad = keep(this.rad, Float32Array);
    this.gridNext = keep(this.gridNext, Int32Array);
    this.flightOf = keep(this.flightOf, Int32Array);
    this.cap = cap;
  }

  reset() {
    this.records.clear();
    this.units.length = 0;
    this.flightKeys.clear();
  }

  /** Hand every hull back to the tactical stack (bench A/B switch). */
  releaseAll() {
    for (const [id, rec] of this.records) this._release(id, rec);
    this.units.length = 0;
  }

  has(entityId) { return this.records.has(entityId); }

  inspect(entityId) {
    const r = this.records.get(entityId);
    return r ? { phase: r.phase, cycle: r.cycle, doctrineId: r.fire.combatDoctrine.doctrineId } : null;
  }

  /**
   * One pass for the whole pack. `ships` is the tick's shipLike view; `ctx` carries the bus and
   * the maneuver port. Returns the number of units driven.
   */
  step(state, ctx, ships, tick) {
    const player = state.entities && state.entities.get(state.playerId);
    const playerLive = !!(player && player.alive !== false && player.pos);
    const units = this.units;
    units.length = 0;
    // ---- membership (stable id order) -------------------------------------------------------
    for (let i = 0; i < ships.length; i++) {
      const e = ships[i];
      if (!isPackCandidate(e, state)) continue;
      let rec = this.records.get(e.id);
      const arch = packArchetypeFor(e.data.lootTableId || e.data.enemyTypeId);
      if (!rec || rec.entity !== e) {
        rec = newRecord(e, arch, tick, this.seed);
        this.records.set(e.id, rec);
        this._adopt(e, arch);
      }
      rec.seen = tick;
      units.push(rec);
    }
    if (this.records.size !== units.length) {
      for (const [id, rec] of this.records) if (rec.seen !== tick) this._release(id, rec);
    }
    if (!units.length) { this.lastStats.units = 0; return 0; }
    units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // ---- shared snapshot: every ship into one grid --------------------------------------------
    const n = ships.length;
    if (n > this.cap) this._grow(n);
    const head = this.gridHead;
    head.fill(-1);
    let anyDodger = false;
    for (let i = 0; i < n; i++) {
      const e = ships[i];
      const ok = e && e.alive !== false && e.pos;
      this.px[i] = ok ? e.pos.x : 1e9; this.pz[i] = ok ? e.pos.z : 1e9;
      this.vx[i] = ok && e.vel ? e.vel.x : 0; this.vz[i] = ok && e.vel ? e.vel.z : 0;
      this.rad[i] = ok ? finite(e.radius, 12) : 0;
      if (!ok) { this.gridNext[i] = -1; continue; }
      const b = cellKey(this.px[i], this.pz[i]);
      this.gridNext[i] = head[b];
      head[b] = i;
    }
    // flights: one centroid / flow row per wing id
    this._buildFlights(ships, n);
    for (const rec of units) if (rec.arch.dodgeTier !== 'fodder') { anyDodger = true; break; }
    this._collectBodies(state, anyDodger);

    const px = playerLive ? player.pos.x : 0;
    const pz = playerLive ? player.pos.z : 0;
    const pvx = playerLive && player.vel ? player.vel.x : 0;
    const pvz = playerLive && player.vel ? player.vel.z : 0;
    const port = ctx.maneuverPort;
    let thinks = 0;
    let hazardQueries = 0;
    for (const rec of units) {
      const e = rec.entity;
      const dx = e.pos.x - px;
      const dz = e.pos.z - pz;
      const d2 = dx * dx + dz * dz;
      const period = !playerLive ? 6 : d2 < NEAR_WU * NEAR_WU ? 1 : d2 < MID_WU * MID_WU ? 2 : 6;
      const due = period === 1 || ((tick + Math.floor(rec.hash * period)) % period) === 0 || rec.req == null;
      if (!due) {
        if (rec.req && port) port.request(retick(rec, tick));
        continue;
      }
      // Adoption ticks differ, so the 6-tick refresh is naturally staggered across the pack.
      if (rec.hzTick < 0 || tick - rec.hzTick >= HAZARD_REFRESH_TICKS) {
        this._refreshHazards(state, rec, tick);
        hazardQueries++;
      }
      thinks++;
      this._think(state, ctx, rec, tick, playerLive ? player : null, px, pz, pvx, pvz, ships);
      if (rec.req && port) port.request(rec.req);
    }
    this.lastStats.units = units.length;
    this.lastStats.thinks = thinks;
    this.lastStats.hazardQueries = hazardQueries;
    return units.length;
  }

  _adopt(e, arch) {
    const ai = e.data.ai;
    ai.packBrain = true;
    // A role cluster may have been stamped as a passive cohort member before adoption; the pack
    // brain flies AND fights, so it takes the hull back from that unarmed path.
    if (ai.passive === true && ai.allowPassiveManeuver === false) {
      ai.passive = false;
      delete ai.allowPassiveManeuver;
    }
    delete ai.squadRecipe; delete ai.autoSquadRecipe; delete ai.squadFrameId;
    if (ai.autoSquadSocket === true) { delete ai.squadSocket; delete ai.autoSquadSocket; }
    if (arch.doctrineId && ai.combatDoctrineId !== 'pack_pursuit') ai.combatDoctrineId = arch.doctrineId;
  }

  _release(id, rec) {
    this.records.delete(id);
    const ai = rec.entity && rec.entity.data && rec.entity.data.ai;
    if (ai && rec.entity.alive !== false) delete ai.packBrain;
  }

  _buildFlights(ships, n) {
    const keys = this.flightKeys;
    keys.clear();
    let count = 0;
    const sum = this.flightSum;
    for (let i = 0; i < n; i++) {
      const e = ships[i];
      const wing = e && e.alive !== false && e.data && e.data.ai && e.data.ai.packBrain === true
        ? (e.data.ai.wingId || e.data.ai.squadId || null) : null;
      if (wing == null) { this.flightOf[i] = -1; continue; }
      let f = keys.get(wing);
      if (f === undefined) {
        f = count++;
        keys.set(wing, f);
        if (f * 5 + 5 > sum.length) {
          const next = new Float64Array(sum.length * 2); next.set(sum); this.flightSum = next;
        }
        const s = this.flightSum; s[f * 5] = 0; s[f * 5 + 1] = 0; s[f * 5 + 2] = 0; s[f * 5 + 3] = 0; s[f * 5 + 4] = 0;
      }
      this.flightOf[i] = f;
      const s = this.flightSum;
      s[f * 5] += this.px[i]; s[f * 5 + 1] += this.pz[i];
      s[f * 5 + 2] += this.vx[i]; s[f * 5 + 3] += this.vz[i]; s[f * 5 + 4] += 1;
    }
    this.flightCount = count;
    const s = this.flightSum;
    for (let f = 0; f < count; f++) {
      const k = s[f * 5 + 4] || 1;
      s[f * 5] /= k; s[f * 5 + 1] /= k; s[f * 5 + 2] /= k; s[f * 5 + 3] /= k;
    }
    // Index each record's flight for O(1) reads in _think.
    for (let i = 0; i < n; i++) {
      const e = ships[i];
      const rec = e && this.records.get(e.id);
      if (rec && rec.entity === e) { rec.flight = this.flightOf[i]; rec.slotIndex = i; }
    }
  }

  _collectBodies(state, wanted) {
    const out = this.bodies;
    out.length = 0;
    if (!wanted) return;
    const index = state.entityIndex;
    const rows = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
      && Array.isArray(index.physicsBodies) ? index.physicsBodies : EMPTY;
    for (const b of rows) {
      if (!b || b.alive === false || !b.pos || !b.vel || b.collides === false) continue;
      if (b.type === 'projectile' || b.type === 'pickup' || b.type === 'fieldEmitter') continue;
      const s2 = b.vel.x * b.vel.x + b.vel.z * b.vel.z;
      if (s2 < BODY_SPEED_MIN * BODY_SPEED_MIN) continue;
      if (b.type === 'ship' && !isTumbling(state, b)) continue;
      out.push(b);
    }
  }

  _refreshHazards(state, rec, tick) {
    rec.hzTick = tick;
    rec.hzCount = 0;
    const hash = state.spatialHash;
    if (!hash || typeof hash.queryRadius !== 'function') return;
    const e = rec.entity;
    const scratch = this.hazardScratch;
    scratch.length = 0;
    hash.queryRadius(e.pos.x, e.pos.z, HAZARD_QUERY_WU, scratch);
    // keep the nearest HAZARD_SLOTS solid non-ship bodies
    const hz = rec.hz;
    let count = 0;
    for (let i = 0; i < scratch.length; i++) {
      const b = scratch[i];
      if (!b || b === e || b.alive === false || !b.pos || b.collides === false) continue;
      const t = b.type;
      if (t === 'ship' || t === 'drone' || t === 'projectile' || t === 'pickup' || t === 'fieldEmitter'
        || t === 'fx') continue;
      const r = steeringRadius(b);
      if (r < 6) continue;
      const dx = b.pos.x - e.pos.x; const dz = b.pos.z - e.pos.z;
      const gap = Math.sqrt(dx * dx + dz * dz) - r;
      if (count < HAZARD_SLOTS) {
        hz[count * 3] = b.pos.x; hz[count * 3 + 1] = b.pos.z; hz[count * 3 + 2] = r;
        count++;
      } else {
        // replace the farthest kept hazard
        let worst = -1; let worstGap = gap;
        for (let k = 0; k < HAZARD_SLOTS; k++) {
          const kx = hz[k * 3] - e.pos.x; const kz = hz[k * 3 + 1] - e.pos.z;
          const kg = Math.sqrt(kx * kx + kz * kz) - hz[k * 3 + 2];
          if (kg > worstGap) { worstGap = kg; worst = k; }
        }
        if (worst >= 0) { hz[worst * 3] = b.pos.x; hz[worst * 3 + 1] = b.pos.z; hz[worst * 3 + 2] = r; }
      }
    }
    rec.hzCount = count;
    scratch.length = 0;
  }

  _think(state, ctx, rec, tick, player, px, pz, pvx, pvz, ships) {
    const e = rec.entity;
    const arch = rec.arch;
    const ai = e.data.ai;
    const ex = e.pos.x; const ez = e.pos.z;
    const evx = e.vel ? e.vel.x : 0; const evz = e.vel ? e.vel.z : 0;
    const rot = finite(e.rot);
    const radius = finite(e.radius, 12);
    const now = finite(state.simTime);

    // A tumbling hull has lost its helm: no drive, no torque, no gun.
    if (isTumbling(state, e)) {
      this._setPhase(ctx, rec, PACK_PHASE.RECOVER, tick, player);
      this._holdFire(e);
      rec.req = makeThrusterRequest(e.id, tick, { kind: ManeuverKind.HOLD, targetHeading: rot,
        reason: 'pack_tumbling' });
      rec.smF = 0; rec.smR = 0; rec.smT = 0;
      rec.lastRot = rot; rec.lastRotTick = tick;
      return;
    }
    if (!player) {
      this._holdFire(e);
      rec.req = makeThrusterRequest(e.id, tick, { kind: ManeuverKind.HOLD, brake: true, targetHeading: rot,
        reason: 'pack_no_target' });
      return;
    }

    const toPx = px - ex; const toPz = pz - ez;
    const dist = Math.sqrt(toPx * toPx + toPz * toPz) || 1;
    const panicked = shovePanicLive(ai, now);
    const age = tick - rec.phaseTick;
    const cruise = arch.speed;
    const strikeSpeed = cruise * arch.strikeSpeedMult;
    // Lead pursuit: where the player will be when we get there.
    const leadT = clamp(dist / Math.max(60, cruise), 0, 1.6);
    const predX = px + pvx * leadT; const predZ = pz + pvz * leadT;

    // ---- role script ------------------------------------------------------------------------
    if (panicked && (rec.phase === PACK_PHASE.WINDUP || rec.phase === PACK_PHASE.STRIKE)) {
      this._setPhase(ctx, rec, PACK_PHASE.RECOVER, tick, player);
    }
    switch (rec.phase) {
      case PACK_PHASE.APPROACH: {
        const armed = !panicked && tick >= rec.cooldownUntil && dist <= arch.ingressWU;
        if (armed && tick >= rec.authRetryAt && this._authorized(state, rec, player, tick)) {
          this._beginWindup(ctx, rec, tick, player, predX, predZ, ex, ez);
        } else if (armed) {
          rec.authRetryAt = tick + AUTH_RETRY_TICKS;
        }
        break;
      }
      case PACK_PHASE.WINDUP: {
        const tell = Math.max(arch.windupTicks, arch.attack === 'gun_pass' ? 1 : PACK_TELL_FLOOR_TICKS);
        if (age >= tell) {
          // Commit the run on the intercept line computed NOW: a sidestep during the run is the
          // player's counter, so the bearing does not chase.
          const ip = intercept(ex, ez, px, pz, pvx, pvz, strikeSpeed);
          let sx = ip.x - ex; let sz = ip.z - ez;
          const sl = Math.sqrt(sx * sx + sz * sz) || 1;
          sx /= sl; sz /= sl;
          rec.strikeX = sx; rec.strikeZ = sz; rec.closest = dist;
          this._setPhase(ctx, rec, PACK_PHASE.STRIKE, tick, player);
        }
        break;
      }
      case PACK_PHASE.STRIKE: {
        rec.closest = Math.min(rec.closest, dist);
        const passed = rec.closest < 140 && dist > rec.closest + 45;
        const done = arch.attack === 'gun_hold'
          ? age >= arch.strikeMaxTicks || dist > arch.ingressWU * 1.4
          : (age >= arch.strikeMinTicks && passed) || age >= arch.strikeMaxTicks;
        if (done) this._setPhase(ctx, rec, PACK_PHASE.RECOVER, tick, player);
        break;
      }
      case PACK_PHASE.RECOVER: {
        if (age >= arch.recoverTicks && !panicked) {
          rec.cooldownUntil = tick + Math.floor(arch.cooldownTicks * (0.7 + rec.hash * 0.6));
          this._setPhase(ctx, rec, PACK_PHASE.APPROACH, tick, player);
        }
        break;
      }
      default: break;
    }

    // ---- interest ---------------------------------------------------------------------------
    const interest = this.interest; const danger = this.danger;
    clearMap(interest); clearMap(danger);
    const w = arch.interest;
    let speed = cruise;
    let faceX = 0; let faceZ = 0; let aim = false;
    const f = rec.flight;
    const fs = this.flightSum;
    const hasFlight = f != null && f >= 0 && fs[f * 5 + 4] > 1;
    let goalX = 0; let goalZ = 0;
    if (rec.phase === PACK_PHASE.STRIKE && arch.attack !== 'gun_hold') {
      goalX = rec.strikeX; goalZ = rec.strikeZ;
      writeInterest(interest, goalX, goalZ, 1.4 * w.goal, 0.05);
      speed = strikeSpeed;
      aim = arch.attack === 'gun_pass';
    } else if (rec.phase === PACK_PHASE.WINDUP) {
      const ip = intercept(ex, ez, px, pz, pvx, pvz, strikeSpeed);
      const gx = ip.x - ex; const gz = ip.z - ez; const gl = Math.sqrt(gx * gx + gz * gz) || 1;
      goalX = gx / gl; goalZ = gz / gl;
      writeInterest(interest, goalX, goalZ, w.goal, 0.2);
      speed = cruise * (arch.attack === 'ram_fuse' ? 0.55 : arch.attack === 'gun_hold' ? 0.4 : 0.95);
      aim = true;
    } else if (rec.phase === PACK_PHASE.RECOVER) {
      // Break off along the run, then swing back to the ring on the far side.
      const rx = rec.strikeX || -toPx / dist; const rz = rec.strikeZ || -toPz / dist;
      if (panicked) { goalX = -toPx / dist; goalZ = -toPz / dist; }
      else if (age < arch.recoverTicks * 0.5) { goalX = rx; goalZ = rz; }
      else {
        const s = this._ringSlot(rec, predX, predZ, ex, ez, arch.ringWU * 1.15, hasFlight ? f : -1);
        goalX = s.x; goalZ = s.z;
      }
      writeInterest(interest, goalX, goalZ, w.goal, 0.25);
    } else {
      // APPROACH / gun_hold STRIKE: a ring slot around the predicted player (or a seat inside the
      // flight for anchorToFlight kinds).
      let gx; let gz;
      if (arch.anchorToFlight === 'centroid' && this.flightCount > 0) {
        const c = this._nearestFlightCentre(rec, ex, ez);
        if (c) {
          // Sit inside the river, on its player-facing half, never closer than the ring.
          const cx = c.x + (px - c.x) * 0.15; const cz = c.z + (pz - c.z) * 0.15;
          gx = cx - ex; gz = cz - ez;
          const cd = Math.hypot(cx - px, cz - pz);
          if (cd < arch.ringWU * 0.8) { gx = ex - px; gz = ez - pz; }
        }
      }
      if (gx === undefined) {
        const s = this._ringSlot(rec, predX, predZ, ex, ez, arch.ringWU, hasFlight ? f : -1);
        gx = s.x; gz = s.z;
      }
      const gl = Math.sqrt(gx * gx + gz * gz);
      if (gl > 1e-3) { goalX = gx / gl; goalZ = gz / gl; }
      writeInterest(interest, goalX, goalZ, w.goal, w.side);
      // Arrival: settle onto the slot rather than overshooting it, matching the player's drift.
      if (gl < 90) speed = Math.max(cruise * 0.35, cruise * (gl / 90));
      if (rec.phase === PACK_PHASE.STRIKE) aim = true; // gun_hold fires from its seat
    }
    // Flight flow and cohesion as interest terms: the river's shape.
    if (hasFlight && rec.phase !== PACK_PHASE.STRIKE) {
      const fvx = fs[f * 5 + 2]; const fvz = fs[f * 5 + 3];
      const fl = Math.sqrt(fvx * fvx + fvz * fvz);
      if (fl > 15) addInterest(interest, fvx / fl, fvz / fl, w.flow * 0.6);
      const cx = fs[f * 5] - ex; const cz = fs[f * 5 + 1] - ez;
      const cl = Math.sqrt(cx * cx + cz * cz);
      const spread = arch.separationWU * 2.2;
      if (cl > spread) addInterest(interest, cx / cl, cz / cl, w.cohesion * 0.5 * Math.min(1, (cl - spread) / 200));
    }

    // ---- danger -----------------------------------------------------------------------------
    const dh = arch.danger.hazard;
    const sweepSpeed = Math.max(speed, Math.sqrt(evx * evx + evz * evz));
    let ttc = Infinity;
    for (let k = 0; k < rec.hzCount; k++) {
      const hx = rec.hz[k * 3]; const hzz = rec.hz[k * 3 + 1]; const hr = rec.hz[k * 3 + 2] + radius + HAZARD_CLEARANCE;
      writeSweptCircleDanger(danger, ex, ez, hx, hzz, hr, sweepSpeed, 1.2, dh);
      const t = rayCircleTime(ex, ez, evx, evz, hx, hzz, hr);
      if (t < ttc) ttc = t;
    }
    // Ships: separation + reciprocal avoidance from relative motion.
    const sepWU = arch.separationWU;
    const myIndex = rec.slotIndex;
    const head = this.gridHead; const next = this.gridNext;
    const cx0 = Math.floor(ex / GRID_CELL); const cz0 = Math.floor(ez / GRID_CELL);
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        let j = head[bucketOf(cx0 + gx, cz0 + gz)];
        while (j >= 0) {
          if (j !== myIndex) {
            const ox = this.px[j] - ex; const oz = this.pz[j] - ez;
            const d2 = ox * ox + oz * oz;
            if (d2 < NEIGHBOR_WU * NEIGHBOR_WU && d2 > 1e-6) {
              const other = ships[j];
              const isPlayer = other === player;
              const od = Math.sqrt(d2);
              const mate = !isPlayer && other.data && other.data.ai && other.data.ai.packBrain === true;
              // The player is the run's target: a committed pass skims past, never rams.
              let clear;
              if (isPlayer) {
                if (rec.phase === PACK_PHASE.STRIKE && arch.attack === 'ram_fuse') { j = next[j]; continue; }
                clear = radius + this.rad[j] + (rec.phase === PACK_PHASE.STRIKE ? 14
                  : arch.attack === 'ram_fuse' && rec.phase === PACK_PHASE.WINDUP ? 70 : 60);
              } else {
                clear = radius + this.rad[j] + (mate ? sepWU * 0.5 : 30);
              }
              if (od < clear) {
                writeDanger(danger, ox / od, oz / od, 0.55 + 0.45 * (1 - od / clear), 1.0);
              }
              // Reciprocal avoidance: time to closest approach of the relative motion.
              const rvx = this.vx[j] - evx; const rvz = this.vz[j] - evz;
              const rv2 = rvx * rvx + rvz * rvz;
              if (rv2 > 1) {
                const tca = -(ox * rvx + oz * rvz) / rv2;
                if (tca > 0 && tca < AVOID_HORIZON_S) {
                  const cxp = ox + rvx * tca; const czp = oz + rvz * tca;
                  const miss = Math.sqrt(cxp * cxp + czp * czp);
                  const need = radius + this.rad[j] + (isPlayer ? 10 : 12);
                  if (miss < need) {
                    // Each side owns half the fix (the other hull runs the same rule): shade the
                    // directions toward where the other WILL be, not where it is.
                    const fx = ox + this.vx[j] * tca; const fz = oz + this.vz[j] * tca;
                    const fl = Math.sqrt(fx * fx + fz * fz) || 1;
                    const urgency = (1 - tca / AVOID_HORIZON_S) * (mate ? 0.5 : 0.8);
                    writeDanger(danger, fx / fl, fz / fl, urgency, 0.7);
                  }
                }
              }
            }
          }
          j = next[j];
        }
      }
    }
    // Thrown bodies (only kinds that dodge; fodder is ammunition and never sidesteps).
    if (arch.dodgeTier !== 'fodder' && arch.dodgeTier !== 'heavy' && arch.danger.body > 0) {
      this._dodge(rec, tick, ex, ez, radius, danger, interest);
    }

    const c = chooseDirection(interest, danger, this.choice);
    // Smooth the chosen heading so a near-tie between two slots cannot flicker.
    const blend = rec.phase === PACK_PHASE.STRIKE || tick < rec.dodgeUntil ? 0.6 : 0.35;
    let dx = rec.dirX + (c.x - rec.dirX) * blend; let dz = rec.dirZ + (c.z - rec.dirZ) * blend;
    const dl = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= dl; dz /= dl;
    rec.dirX = dx; rec.dirZ = dz;
    // Danger slows; time-to-collision with a big body brakes.
    speed *= 1 - 0.55 * clamp(c.danger, 0, 1);
    if (ttc < TTC_BRAKE_S) speed *= Math.max(0.25, ttc / TTC_BRAKE_S);
    // Feed the player's drift into the slot chase so a held ring holds while the player moves.
    let vdx = dx * speed; let vdz = dz * speed;
    if (rec.phase === PACK_PHASE.APPROACH || (rec.phase === PACK_PHASE.STRIKE && arch.attack === 'gun_hold')) {
      vdx += pvx * 0.6; vdz += pvz * 0.6;
    }
    // Surface governor: toward every nearby solid, the commanded closing speed may never exceed
    // what the hull can still shed before the surface (v² = 2·a·gap), and never more than the
    // gentle-touch speed at contact. A light hull that meets a wall faster than ~30 WU/s
    // crumples (impulseKernel TERRAIN_CRUMPLE_LAW), so competent pilots never arrive faster.
    let brakeForSurface = false;
    for (let k = 0; k < rec.hzCount; k++) {
      let nx = rec.hz[k * 3] - ex; let nz = rec.hz[k * 3 + 1] - ez;
      const nd = Math.sqrt(nx * nx + nz * nz) || 1;
      nx /= nd; nz /= nd;
      const gap = nd - rec.hz[k * 3 + 2] - radius;
      if (gap > SURFACE_WATCH_WU) continue;
      const allowed = Math.min(cruise, SURFACE_TOUCH_SPEED
        + Math.sqrt(2 * SURFACE_DECEL * Math.max(0, gap - SURFACE_MARGIN_WU)));
      const want = vdx * nx + vdz * nz;
      if (want > allowed) { vdx -= (want - allowed) * nx; vdz -= (want - allowed) * nz; }
      if (evx * nx + evz * nz > allowed + 10) brakeForSurface = true;
    }
    rec.brakeForSurface = brakeForSurface;

    // ---- facing: predictive aim while armed, flight direction otherwise ---------------------
    if (aim) {
      const t = dist / SHOT_SPEED_REF;
      faceX = px + pvx * t - ex; faceZ = pz + pvz * t - ez;
    } else {
      faceX = vdx; faceZ = vdz;
      if (faceX * faceX + faceZ * faceZ < 100) { faceX = toPx; faceZ = toPz; }
    }
    this._motor(rec, tick, e, rot, evx, evz, vdx, vdz, Math.atan2(faceZ, faceX),
      rec.phase === PACK_PHASE.STRIKE || tick < rec.dodgeUntil, cruise);

    // ---- fire: the shared gate decides every shot -------------------------------------------
    // The full gate (authority, lead, friendly lane, optic lane, line of sight) is the costly
    // half of a pack hull's tick. It runs on strike entry and then every FIRE_RECHECK_TICKS on
    // an id-hashed phase; in between the verdict stands (a 0.1 s sight-line refresh), and a
    // dead or vanished target closes the gun at once.
    if (rec.phase === PACK_PHASE.STRIKE && arch.attack !== 'ram_fuse' && !panicked) {
      const due = tick === rec.phaseTick || rec.fireCheckedTick < 0
        || tick - rec.fireCheckedTick >= FIRE_RECHECK_TICKS
        || ((tick + Math.floor(rec.hash * FIRE_RECHECK_TICKS)) % FIRE_RECHECK_TICKS) === 0;
      if (!due) {
        if (player.alive === false) this._holdFire(e);
        return;
      }
      rec.fireCheckedTick = tick;
      const doctrineId = ai.combatDoctrineId || arch.doctrineId;
      const firePhase = PACK_FIRE_PHASE_BY_DOCTRINE[doctrineId] || arch.strikePhase;
      const fire = rec.fire;
      fire.directive.objective.targetId = player.id;
      fire.directive.objective.reason = `combat_doctrine:${doctrineId}:${firePhase}`;
      const cd = fire.combatDoctrine;
      cd.doctrineId = doctrineId; cd.phase = firePhase; cd.cycle = rec.cycle;
      cd.phaseStartedTick = rec.phaseTick; cd.targetId = player.id; cd.fireWindow = true;
      applyAIFiringIntent(fire, state);
    } else {
      this._holdFire(e);
    }
  }

  _authorized(state, rec, player, tick) {
    const arch = rec.arch;
    if (arch.attack === 'ram_fuse') return true; // the dart's weapon is its hull (impulseCharges)
    const ai = rec.entity.data.ai;
    const doctrineId = ai.combatDoctrineId || arch.doctrineId;
    const firePhase = PACK_FIRE_PHASE_BY_DOCTRINE[doctrineId] || arch.strikePhase;
    const verdict = authorizeAIEngagement({ state, self: rec.entity, target: player, tick,
      objectiveReason: `combat_doctrine:${doctrineId}:${firePhase}` });
    return !!(verdict && verdict.ok);
  }

  _beginWindup(ctx, rec, tick, player) {
    this._setPhase(ctx, rec, PACK_PHASE.WINDUP, tick, player);
    const arch = rec.arch;
    const bus = ctx.bus;
    if (!bus || typeof bus.emit !== 'function') return;
    const tell = arch.attack === 'gun_pass' ? arch.windupTicks : Math.max(arch.windupTicks, PACK_TELL_FLOOR_TICKS);
    bus.emit('ai:telegraph', {
      entityId: rec.id,
      targetId: player.id,
      doctrineId: rec.entity.data.ai.combatDoctrineId || arch.doctrineId,
      phase: arch.windupPhase,
      kind: arch.windupKind,
      durationTicks: arch.attack === 'ram_fuse' ? tell + arch.strikeMaxTicks : tell,
      attackLine: null,
      bossStage: 0,
      turretEdge: 0,
      tick,
    });
  }

  _setPhase(ctx, rec, phase, tick, player) {
    if (rec.phase === phase) return;
    rec.phase = phase;
    rec.phaseTick = tick;
    if (phase === PACK_PHASE.WINDUP) rec.cycle += 1;
    const bus = ctx.bus;
    if (!bus || typeof bus.emit !== 'function') return;
    const arch = rec.arch;
    const doctrineId = rec.entity.data.ai.combatDoctrineId || arch.doctrineId;
    const name = phase === PACK_PHASE.WINDUP ? arch.windupPhase
      : phase === PACK_PHASE.STRIKE ? (PACK_FIRE_PHASE_BY_DOCTRINE[doctrineId] || arch.strikePhase)
        : phase === PACK_PHASE.RECOVER ? RECOVER_PHASE_NAME : APPROACH_PHASE_NAME;
    bus.emit('ai:doctrinePhase', {
      entityId: rec.id,
      targetId: player ? player.id : null,
      doctrineId,
      flightProfile: null,
      phase: name,
      fireWindow: phase === PACK_PHASE.STRIKE && arch.attack !== 'ram_fuse',
      maneuverKind: phase === PACK_PHASE.STRIKE ? ManeuverKind.INTERCEPT : ManeuverKind.ORBIT,
      attackLine: null,
      bossStage: 0,
      turretEdge: 0,
      tick,
    });
  }

  _holdFire(e) {
    const data = e.data;
    let intent = data && data.intent;
    if (!intent || (!intent.fire && intent.fireGroup == null)) return;
    if (Object.isFrozen(intent)) intent = data.intent = { ...intent };
    clearAIFiringIntent(intent, 'pack_cycle');
  }

  /** A slot on a ring around the predicted player: the unit's own bearing, spread by flight. */
  _ringSlot(rec, cx, cz, ex, ez, ring, flight) {
    let bx = ex - cx; let bz = ez - cz;
    const bl = Math.sqrt(bx * bx + bz * bz) || 1;
    bx /= bl; bz /= bl;
    // Spread a flight's members across an arc around their shared bearing so they arrive as a
    // front rather than a single file.
    let ang = Math.atan2(bz, bx);
    if (flight >= 0) {
      const fs = this.flightSum;
      const fb = Math.atan2(fs[flight * 5 + 1] - cz, fs[flight * 5] - cx);
      const spread = (rec.hash - 0.5) * 1.1;
      ang = fb + spread;
    }
    const tx = cx + Math.cos(ang) * ring; const tz = cz + Math.sin(ang) * ring;
    const out = this._slot || (this._slot = { x: 0, z: 0 });
    out.x = tx - ex; out.z = tz - ez;
    return out;
  }

  _nearestFlightCentre(rec, ex, ez) {
    const fs = this.flightSum;
    let best = -1; let bestD = 700 * 700;
    for (let f = 0; f < this.flightCount; f++) {
      if (f === rec.flight && fs[f * 5 + 4] <= 1) continue;
      if (fs[f * 5 + 4] < 3) continue;
      const dx = fs[f * 5] - ex; const dz = fs[f * 5 + 1] - ez;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best < 0) return null;
    const out = this._centre || (this._centre = { x: 0, z: 0 });
    out.x = fs[best * 5]; out.z = fs[best * 5 + 1];
    return out;
  }

  _dodge(rec, tick, ex, ez, radius, danger, interest) {
    const arch = rec.arch;
    if (tick < rec.dodgeUntil) {
      writeInterest(interest, rec.dodgeX, rec.dodgeZ, 2.2, 0);
      return;
    }
    for (const b of this.bodies) {
      const ox = b.pos.x - ex; const oz = b.pos.z - ez;
      const rvx = b.vel.x; const rvz = b.vel.z;
      const rv2 = rvx * rvx + rvz * rvz;
      const tca = -(ox * rvx + oz * rvz) / rv2;
      if (!(tca > 0 && tca < 1.2)) continue;
      const mx = ox + rvx * tca; const mz = oz + rvz * tca;
      const miss = Math.sqrt(mx * mx + mz * mz);
      const need = radius + finite(b.radius, 12) + 26;
      if (miss > need) continue;
      // Its path is danger whether or not we dodge yet.
      const rl = Math.sqrt(rv2);
      writeDanger(danger, -rvx / rl, -rvz / rl, 0.5, 0.5);
      if (tick < rec.dodgeCooldownUntil) continue;
      if (rec.dodgeArmTick < 0) { rec.dodgeArmTick = tick; continue; }
      if (tick - rec.dodgeArmTick < (DODGE_WINDUP_TICKS[arch.dodgeTier] || 18)) continue;
      // Sidestep perpendicular to the body's path, away from its line.
      let sx = -rvz / rl; let sz = rvx / rl;
      if (sx * mx + sz * mz > 0) { sx = -sx; sz = -sz; }
      rec.dodgeX = sx; rec.dodgeZ = sz;
      rec.dodgeUntil = tick + 30;
      rec.dodgeArmTick = -1;
      rec.dodgeCooldownUntil = tick + (DODGE_COOLDOWN_TICKS[arch.dodgeTier] || 120);
      writeInterest(interest, sx, sz, 2.2, 0);
      return;
    }
    rec.dodgeArmTick = -1;
  }

  _motor(rec, tick, e, rot, evx, evz, vdx, vdz, face, fast, cruise) {
    const gap = Math.max(1, tick - rec.lastRotTick);
    const wy = wrapAngle(rot - rec.lastRot) / (gap / 60);
    rec.lastRot = rot; rec.lastRotTick = tick;
    const err = wrapAngle(face - rot);
    const desiredWy = clamp(err / YAW_SOFT, -1, 1) * YAW_RATE;
    const torque = Math.abs(err) < 0.03 && Math.abs(wy) < 0.08 ? 0
      : clamp((desiredWy - wy) * YAW_GAIN, -YAW_LIMIT, YAW_LIMIT);
    const c = Math.cos(rot); const s = Math.sin(rot);
    const ax = (vdx - evx) * ACCEL_GAIN; const az = (vdz - evz) * ACCEL_GAIN;
    let fwd = clamp((ax * c + az * s) / REF_FWD_ACCEL, -1, 1);
    const right = clamp((-ax * s + az * c) / REF_LAT_ACCEL, -1, 1);
    // Turn before burning: a hull pointed the wrong way does not floor it sideways.
    const velHeading = Math.atan2(vdz, vdx);
    if (!fast && Math.abs(wrapAngle(velHeading - rot)) > TURN_FIRST_ANGLE && fwd > 0.25) fwd = 0.25;
    const slew = (fast ? SLEW_FAST : SLEW) * gap;
    rec.smF = approach(rec.smF, fwd, slew);
    rec.smR = approach(rec.smR, right, slew);
    rec.smT = approach(rec.smT, torque, slew);
    const speed = Math.sqrt(evx * evx + evz * evz);
    rec.req = makeThrusterRequest(e.id, tick, {
      kind: fast ? ManeuverKind.INTERCEPT : ManeuverKind.ORBIT,
      forceLocal: { forward: rec.smF, right: rec.smR },
      torqueYaw: rec.smT,
      brake: speed > cruise * 1.45 || rec.brakeForSurface === true,
      targetHeading: face,
      horizonTicks: 30,
      reason: 'pack_context_steering',
    });
  }
}

function retick(rec, tick) {
  const r = rec.req;
  if (r.tick === tick) return r;
  rec.req = makeThrusterRequest(r.entityId, tick, {
    kind: r.kind, forceLocal: r.forceLocal, torqueYaw: r.torqueYaw, boost: r.boost, brake: r.brake,
    targetHeading: r.targetHeading, horizonTicks: r.horizonTicks, reason: r.reason,
  });
  return rec.req;
}

/** Where to aim a run at speed `s` to meet a target moving at (vx, vz). Falls back to lead 1 s. */
export function intercept(ex, ez, tx, tz, vx, vz, s) {
  const rx = tx - ex; const rz = tz - ez;
  const a = vx * vx + vz * vz - s * s;
  const b = 2 * (rx * vx + rz * vz);
  const c = rx * rx + rz * rz;
  let t = 1;
  if (Math.abs(a) < 1e-6) t = b !== 0 ? -c / b : 1;
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a); const t2 = (-b + sq) / (2 * a);
      t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
      if (!Number.isFinite(t)) t = 1;
    }
  }
  t = clamp(t, 0, 2.5);
  const out = INTERCEPT_OUT;
  out.x = tx + vx * t; out.z = tz + vz * t;
  return out;
}
const INTERCEPT_OUT = { x: 0, z: 0 };

function rayCircleTime(px, pz, vx, vz, cx, cz, r) {
  const v2 = vx * vx + vz * vz;
  if (v2 < 1) return Infinity;
  const ox = cx - px; const oz = cz - pz;
  const b = (ox * vx + oz * vz) / v2;
  if (b <= 0) return Infinity;
  const c = (ox * ox + oz * oz - r * r) / v2;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = b - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}

// Fixed solids steer on their measured skin (the same rule aiPorts' sensor frame uses); dynamic
// bodies on their gameplay radius. Cached per entity object.
const STEER_RADIUS_CACHE = new WeakMap();
function steeringRadius(b) {
  if (isDynamicPhysicsBodyEntity(b)) return finite(b.radius, 0);
  const cached = STEER_RADIUS_CACHE.get(b);
  if (cached && cached.radius === b.radius) return cached.value;
  const value = Math.max(finite(b.radius, 0), finite(modelTruthPlanarRadius(b), 0));
  STEER_RADIUS_CACHE.set(b, { radius: b.radius, value });
  return value;
}

function bucketOf(cx, cz) {
  return (((cx * 73856093) ^ (cz * 19349663)) >>> 0) & (GRID_BUCKETS - 1);
}
function cellKey(x, z) {
  return bucketOf(Math.floor(x / GRID_CELL), Math.floor(z / GRID_CELL));
}
