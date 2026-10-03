// volatileExposure.js — NXB-008 "Recover a volatile load by managing its physical exposure,
// not a scripted timer" (build_map §1C H row 199; packet design/program/next-wave-2026-09-28/build/NXB-008.md).
//
// WHAT THIS OWNS — exactly one record: `pod.data.volatileExposure` on EXPLOSIVE-class
// jettisoned-cargo pods (src/systems/lootShards.js pod family; the opening hauler raid's
// fuel-cell lot is the named shipment). The record is a plain JSON-safe object riding the pod
// body, so it survives towing, line cuts, re-latches, and save round-trips for free — never
// reset by relatching, docking refusal, or a save (packet acceptance 2). It dies with the pod:
// no global ledger, no state-level list, no extra full-state copy.
//
// WHAT DRIVES IT — only real exposure facts reaching the body, never elapsed time alone:
//   • mechanical shock   — physics:impact contacts above a glancing bar (below lootShards'
//                          existing 12 WU/s cook-off slam, which stays untouched as the rupture);
//                          an overload line snap (tether:broken reason 'physics_break') dumps
//                          its stored strain into the load the same way;
//   • heat               — accepted thermal damage packets against the pod (combat:damage),
//                          adjacency to any body with an active status_burning (cadenced local
//                          spatial query on the SAME bounded payloads index lootShards already
//                          scans per frame — not a new universe scan), and chain heat from a
//                          nearby cargo:volatileSlam detonation (event-driven);
//   • cooling            — a load with no shock and no heat within reach soaks back toward
//                          stable (the sheltered continuation). Absence of exposure is the only
//                          thing that ever improves the load; nothing bad happens on a timer.
//
// WHAT ESCALATES — two graded states a player can read and manage at the camera:
//   • VENT (first threshold): the container boils off a fraction of its units as a REAL physical
//     pod through lootShards' own spawnJettisonedCargoPod (the ordinary spill owner — same
//     identity stamps, persistent, scoopable). Pressure relief lowers exposure. An imperfect
//     recovery still yields usable freight (packet acceptance 3).
//   • RUPTURE (abuse continues after a vent, or nothing left to spill): one thermal packet
//     through the ORDINARY damage owner (combat kernel routeDamage — 'payload' is damageable
//     membership) cooks the pod off. The cue publishes only when the packet was ACCEPTED
//     (NXI-030 law: a rejected packet is not a hit). lootShards' hard-slam detonation remains
//     the impact-driven rupture path; this file never reimplements it.
//
// Determinism: state.simTime/state.tick only, hash32-seeded scatter, no Math.random, no wall
// clock. Presentation observes accepted facts (bus events + presentation:vfxCue lane).

import { hash32 } from '../core/rng.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isJettisonedCargoPod, spawnJettisonedCargoPod, EXPLOSIVE_SLAM_CLOSING_SPEED, EXPLOSIVE_BLAST_RADIUS } from './lootShards.js';
import { volatileClassOf } from '../data/commodityVolatileClasses.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';

export const VOLATILE_EXPOSURE_SCHEMA = 1;

// ── Exposure vocabulary (authored, exported so the focused suite pins behavior, not literals) ──

/** Cadence of the heat/cooling pass, in sim ticks (0.25 s at the 60 Hz fixed step). */
export const EXPOSURE_TICKS = 15;
/** Closing speed (WU/s) below which a contact is a brush, not a shock. Below lootShards' 12 slam bar. */
export const SHOCK_CLOSING_MIN = 5;
/** dp floor that counts as a shock even at low closing speed (mirrors lootShards' 80 slam dp bar). */
export const SHOCK_DP_MIN = 80;
/** Same-pod shock cooldown so a sustained crush cannot pump the record every tick. */
export const SHOCK_COOLDOWN_S = 0.35;
/** Glancing shock: load gained at the bar, rising linearly toward the slam bar. */
export const GLANCING_SHOCK_BASE = 0.12;
export const GLANCING_SHOCK_RISE = 0.02;
/** A slam-bar impact that lootShards did not cook off still destabilizes the container hard. */
export const SLAM_SHOCK_LOAD = 0.45;
export const MAX_LOAD_PER_SHOCK = 0.5;
/** Overload line snap: stored strain dumps into the towed load (SF-022's pumping price). */
export const SNAP_SHOCK_LOAD = 0.4;
/** Accepted thermal damage against the pod: load gained per applied point, capped per packet. */
export const HEAT_DAMAGE_LOAD_SCALE = 1 / 60;
export const MAX_LOAD_PER_PACKET = 0.35;
/** Burning adjacency: load per second at the source, scaled by 1 - dist/radius and burn stacks. */
export const HEAT_RADIUS_WU = 110;
export const HEAT_RATE_PER_S = 0.35;
/** Chain heat from a volatile slam detonation inside the blast radius. */
export const SLAM_CHAIN_LOAD = 0.35;
/** Cooling: only with no shock and no heat for this long, at this rate (≈28 s full soak). */
export const COOL_DELAY_S = 3;
export const COOL_RATE_PER_S = 0.035;
/** The vent threshold and its pressure relief. */
export const VENT_LOAD = 1;
export const VENT_FRACTION = 0.25;
export const VENT_RELIEF = 0.65;
export const VENT_KICK_WU_S = 10;
/** The vented pod comes off a destabilizing container: it inherits half the parent's load. */
export const VENT_INHERIT_LOAD = 0.5;
/** Rupture thermal packet through the ordinary damage owner. */
export const RUPTURE_DAMAGE = 160;

const BURNING_STATUS_ID = 'status_burning';
const _nearScratch = [];
const _heatProfile = { mass: 1, type: 'payload', id: null, fieldResponseMult: 1 };

function nowOf(state) {
  return Number.isFinite(state.simTime) ? state.simTime : (state.tick || 0) / 60;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function isExplosiveVolatilePod(entity) {
  if (!isJettisonedCargoPod(entity)) return false;
  const klass = volatileClassOf(entity.data);
  return !!klass && klass.id === 'explosive';
}

function ensureRecord(pod, now) {
  const data = pod.data || (pod.data = {});
  let rec = data.volatileExposure;
  if (!rec || rec.schemaVersion !== VOLATILE_EXPOSURE_SCHEMA) {
    rec = data.volatileExposure = {
      schemaVersion: VOLATILE_EXPOSURE_SCHEMA,
      load: 0,
      vents: 0,
      ventedUnits: 0,
      shocks: 0,
      stage: 'stable',
      lastShockAt: -Infinity,
      lastHeatAt: -Infinity,
      lastVentAt: -Infinity,
    };
  }
  if (!Number.isFinite(rec.load)) rec.load = 0;
  return rec;
}

/** Condition words describe exposure level. None of them promises a countdown (NXI-031). */
export function volatileExposureStageOf(rec) {
  if (!rec) return 'stable';
  if (rec.load >= VENT_LOAD) return 'venting';
  if (rec.load >= 0.67) return 'critical';
  if (rec.load >= 0.34) return 'warming';
  return 'stable';
}

/** UI/condition seam: every explosive volatile pod and its current exposure. Demand-scanned. */
export function volatileExposureReadout(state) {
  if (!state) return [];
  const rows = [];
  const list = payloadScanList(state);
  if (!Array.isArray(list)) return rows;
  for (let i = 0; i < list.length; i++) {
    const pod = list[i];
    if (!pod || pod.alive === false || !isExplosiveVolatilePod(pod)) continue;
    const rec = pod.data.volatileExposure;
    rows.push({
      podId: pod.id,
      commodityId: pod.data.commodityId,
      amount: Math.max(0, Math.floor(Number(pod.data.amount) || 0)),
      load: clamp01(Number(rec && rec.load) || 0),
      vents: Math.max(0, Math.floor(Number(rec && rec.vents) || 0)),
      stage: volatileExposureStageOf(rec),
    });
  }
  return rows;
}

function payloadScanList(state) {
  const index = state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Array.isArray(index.payloads)
    ? index.payloads
    : (state.entityList || null);
}

function combatKernelOf(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  if (combat && typeof combat.ensureKernel === 'function') return combat.ensureKernel();
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}

function routeCombatDamageOf(host) {
  const helpers = host.helpers;
  if (helpers && typeof helpers.routeCombatDamage === 'function') return helpers.routeCombatDamage;
  const kernel = combatKernelOf(host);
  return kernel && typeof kernel.routeDamage === 'function' ? kernel.routeDamage : null;
}

function voiceOf(host) {
  return host.helpers && host.helpers.voice;
}

function announceVolatile(host, text) {
  const bus = host.bus;
  const voice = voiceOf(host);
  if (voice && typeof voice.say === 'function') {
    const said = voice.say({ channel: 'alert', text, kind: 'volatileExposure', ttl: 3 });
    if (said) return;
  }
  if (bus && typeof bus.emit === 'function') bus.emit('toast', { text, kind: 'warn', ttl: 3 });
}

function activeBurnStacks(state, body, tick) {
  if (!body || body.alive === false) return 0;
  // Read-ONLY status peek: burning is only ever applied through the kernel, and applying a
  // status materializes the combatant runtime. A body without a runtime cannot be burning, so
  // this pass must never ensureCombatant rocks/pods into existence just to read them.
  const warmEntities = state.combat && state.combat.entities;
  const runtime = warmEntities ? warmEntities[String(body.id)] : null;
  const active = runtime && runtime.statuses && runtime.statuses[BURNING_STATUS_ID];
  if (!active || !(Number(active.expiresTick) > tick)) return 0;
  return Math.max(1, Math.floor(Number(active.stacks) || 1));
}

export const volatileExposure = {
  id: 'volatileExposure',
  name: 'volatileExposure',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('physics:impact', (p) => this._onPhysicsImpact(p || {})));
      this._unsubs.push(this.bus.on('combat:damage', (p) => this._onCombatDamage(p || {})));
      this._unsubs.push(this.bus.on('tether:broken', (p) => this._onTetherSnap(p || {})));
      this._unsubs.push(this.bus.on('cargo:volatileSlam', (p) => this._onSlamChain(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  // Heat soak + cooling run on the fixed cadence; everything else is event-driven.
  update(dt, state) {
    if (!state || state.mode !== 'flight') return;
    if (!Number.isInteger(state.tick) || state.tick % EXPOSURE_TICKS !== 0) return;
    const stepS = EXPOSURE_TICKS / 60;
    this._exposurePass(state, stepS);
  },

  // ── fact: mechanical shock ──────────────────────────────────────────────────────────────

  _onPhysicsImpact(payload) {
    const state = this.state;
    if (!state || !payload) return;
    const a = state.entities && state.entities.get ? state.entities.get(payload.aId) : null;
    const b = state.entities && state.entities.get ? state.entities.get(payload.bId) : null;
    const pod = isExplosiveVolatilePod(a) ? a : (isExplosiveVolatilePod(b) ? b : null);
    if (!pod || pod.alive === false) return;
    const closingRaw = Number.isFinite(payload.preSolveClosingSpeed)
      ? Math.abs(payload.preSolveClosingSpeed)
      : (Number.isFinite(payload.playerDeltaV) ? Math.abs(payload.playerDeltaV) : 0);
    const dp = Math.max(0, Number(payload.dp) || Number(payload.impulse) || 0);
    if (closingRaw < SHOCK_CLOSING_MIN && dp < SHOCK_DP_MIN) return;
    const now = nowOf(state);
    const rec = ensureRecord(pod, now);
    if (Number.isFinite(rec.lastShockAt) && now - rec.lastShockAt < SHOCK_COOLDOWN_S) return;
    const hard = closingRaw >= EXPLOSIVE_SLAM_CLOSING_SPEED || dp >= SHOCK_DP_MIN;
    const add = hard
      ? SLAM_SHOCK_LOAD
      : Math.min(MAX_LOAD_PER_SHOCK, GLANCING_SHOCK_BASE + (closingRaw - SHOCK_CLOSING_MIN) * GLANCING_SHOCK_RISE);
    rec.lastShockAt = now;
    rec.shocks = (Math.floor(rec.shocks) || 0) + 1;
    this._applyLoad(state, pod, rec, add, now, 'shock');
  },

  // ── fact: accepted thermal damage against the pod itself ────────────────────────────────

  _onCombatDamage(payload) {
    const state = this.state;
    if (!state || !payload) return;
    if (payload.targetId == null) return;
    const pod = state.entities && state.entities.get ? state.entities.get(payload.targetId) : null;
    if (!pod || pod.alive === false || !isExplosiveVolatilePod(pod)) return;
    // The rupture's own packet is a CONSEQUENCE of exposure, not a new heat fact — without this
    // guard it would re-enter this listener mid-kill and stack a second escalation.
    if (pod.data.volatileDetonated) return;
    const channels = payload.channels;
    const thermal = Math.max(0, Number(channels && channels.thermal) || 0);
    const applied = Math.max(0, Number(payload.applied) || 0);
    if (!(thermal > 0) && !(payload.damageType === 'thermal' && applied > 0)) return;
    const now = nowOf(state);
    const rec = ensureRecord(pod, now);
    rec.lastHeatAt = now;
    this._applyLoad(state, pod, rec, Math.min(MAX_LOAD_PER_PACKET, applied * HEAT_DAMAGE_LOAD_SCALE), now, 'heat');
  },

  // ── fact: overload line snap dumps strain into the towed load ───────────────────────────

  _onTetherSnap(payload) {
    const state = this.state;
    if (!state || !payload) return;
    // 'physics_break' is the solver's overload break; deliberate cuts ('tether_cut') never punish.
    if (payload.reason !== 'physics_break') return;
    if (payload.targetId == null) return;
    const pod = state.entities && state.entities.get ? state.entities.get(payload.targetId) : null;
    if (!pod || pod.alive === false || !isExplosiveVolatilePod(pod)) return;
    const now = nowOf(state);
    const rec = ensureRecord(pod, now);
    if (Number.isFinite(rec.lastShockAt) && now - rec.lastShockAt < SHOCK_COOLDOWN_S) return;
    rec.lastShockAt = now;
    rec.shocks = (Math.floor(rec.shocks) || 0) + 1;
    this._applyLoad(state, pod, rec, SNAP_SHOCK_LOAD, now, 'snap');
  },

  // ── fact: a neighbouring volatile slam detonation heats the lot ─────────────────────────

  _onSlamChain(payload) {
    const state = this.state;
    if (!state || !payload) return;
    const origin = state.entities && state.entities.get ? state.entities.get(payload.podId) : null;
    const pos = origin && origin.pos ? origin.pos : null;
    if (!pos) return;
    const now = nowOf(state);
    const list = payloadScanList(state);
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const pod = list[i];
      if (!pod || pod.alive === false || pod.id === payload.podId || !isExplosiveVolatilePod(pod)) continue;
      const dx = pod.pos.x - pos.x;
      const dz = pod.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (!(dist <= EXPLOSIVE_BLAST_RADIUS)) continue;
      const rec = ensureRecord(pod, now);
      rec.lastHeatAt = now;
      this._applyLoad(state, pod, rec, SLAM_CHAIN_LOAD * (1 - dist / EXPLOSIVE_BLAST_RADIUS), now, 'chain_heat');
    }
  },

  // ── cadenced pass: burning adjacency heats; an untouched lot soaks back toward stable ────

  _exposurePass(state, stepS) {
    const list = payloadScanList(state);
    if (!Array.isArray(list) || list.length === 0) return;
    const canReadFire = !!state.combat;
    const now = nowOf(state);
    const tick = state.tick;
    for (let i = 0; i < list.length; i++) {
      const pod = list[i];
      if (!pod || pod.alive === false || !pod.pos || !isExplosiveVolatilePod(pod)) continue;
      const rec = ensureRecord(pod, now);
      let heat = 0;
      if (canReadFire) {
        // queryNearbyEntities answers from the active spatial hash when the world provides one
        // (covers ships and drones); the entityList fallback keeps focused harnesses honest.
        const nearby = queryNearbyEntities(state, pod.pos, HEAT_RADIUS_WU, _nearScratch, state.entityList);
        for (let j = 0; j < nearby.length; j++) {
          const body = nearby[j];
          if (!body || body.alive === false || body.id === pod.id) continue;
          const stacks = activeBurnStacks(state, body, tick);
          if (!stacks) continue;
          const dx = body.pos.x - pod.pos.x;
          const dz = body.pos.z - pod.pos.z;
          const dist = Math.hypot(dx, dz);
          if (!(dist <= HEAT_RADIUS_WU)) continue;
          const fall = 1 - dist / HEAT_RADIUS_WU;
          heat += HEAT_RATE_PER_S * (0.5 + 0.25 * stacks) * fall * stepS;
        }
      }
      if (heat > 0) {
        rec.lastHeatAt = now;
        this._applyLoad(state, pod, rec, heat, now, 'fire');
        continue;
      }
      // Cooling — the sheltered continuation. Never runs while the load is being shocked or
      // heated, and it is the ONLY thing that ever improves the load. Nothing worsens on time.
      const shockedRecently = Number.isFinite(rec.lastShockAt) && now - rec.lastShockAt < COOL_DELAY_S;
      const heatedRecently = Number.isFinite(rec.lastHeatAt) && now - rec.lastHeatAt < COOL_DELAY_S;
      if (!shockedRecently && !heatedRecently && rec.load > 0) {
        rec.load = Math.max(0, rec.load - COOL_RATE_PER_S * stepS);
        this._publishStage(state, pod, rec, now);
      }
    }
  },

  // ── shared accumulator + escalation ─────────────────────────────────────────────────────

  _applyLoad(state, pod, rec, add, now, cause) {
    if (!(add > 0)) return;
    rec.load = clamp01(rec.load + add);
    this._publishStage(state, pod, rec, now, cause);
    if (rec.load >= VENT_LOAD) this._escalate(state, pod, rec, now);
  },

  _publishStage(state, pod, rec, now, cause = null) {
    const stage = volatileExposureStageOf(rec);
    if (stage === rec.stage) return;
    rec.stage = stage;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:volatileExposed', {
        podId: pod.id,
        commodityId: pod.data.commodityId,
        amount: Math.max(0, Math.floor(Number(pod.data.amount) || 0)),
        load: clamp01(rec.load),
        stage,
        cause,
        t: now,
      });
    }
  },

  _escalate(state, pod, rec, now) {
    const amount = Math.max(0, Math.floor(Number(pod.data.amount) || 0));
    if (rec.vents < 1 && amount >= 2) {
      this._ventPod(state, pod, rec, now, amount);
      return;
    }
    this._rupturePod(state, pod, rec, now, amount);
  },

  // VENT — the container boils off part of its load as a real pod through the ordinary spill
  // owner (spawnJettisonedCargoPod: identity stamps, persistence, residency cap included).
  _ventPod(state, pod, rec, now, amount) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') {
      // No physical spill is possible: fail closed to the rupture path instead of silently
      // deleting units through a non-physical write.
      this._rupturePod(state, pod, rec, now, amount);
      return;
    }
    const ventQty = Math.min(amount - 1, Math.max(1, Math.floor(amount * VENT_FRACTION)));
    if (!(ventQty > 0)) {
      this._rupturePod(state, pod, rec, now, amount);
      return;
    }
    const podBodyMass = Math.max(1, Number(pod.physicsBody && pod.physicsBody.mass) || Number(pod.mass) || 1);
    const unitMass = podBodyMass / Math.max(1, amount);
    const seed = (state.meta && state.meta.seed) || 1;
    const ang = ((hash32(seed, state.tick, 'volatile-vent') >>> 0) / 4294967296) * Math.PI * 2;
    const ventRadius = Math.max(3, Math.min(25, Math.ceil(2 + ventQty * 0.35)));
    const gap = (Number(pod.radius) || 3) + ventRadius + 2;
    const spawned = spawnJettisonedCargoPod(state, {
      commodityId: pod.data.commodityId,
      amount: ventQty,
      unitMass,
      radius: ventRadius,
      pos: { x: pod.pos.x + Math.cos(ang) * gap, z: pod.pos.z + Math.sin(ang) * gap },
      vel: {
        x: (Number(pod.vel && pod.vel.x) || 0) + Math.cos(ang) * VENT_KICK_WU_S,
        z: (Number(pod.vel && pod.vel.z) || 0) + Math.sin(ang) * VENT_KICK_WU_S,
      },
      ownerId: pod.data.ownerId != null ? pod.data.ownerId : null,
      ownerName: pod.data.ownerName,
      originId: pod.data.originId,
      destinationId: pod.data.destinationId,
      cargoIdentity: pod.data.cargoIdentity,
    }, this.helpers);
    if (!spawned) {
      // The ordinary owner refused the body: no units vanish.
      this._rupturePod(state, pod, rec, now, amount);
      return;
    }
    // The boiled-off lot came off a destabilizing container.
    spawned.data.volatileExposure = {
      schemaVersion: VOLATILE_EXPOSURE_SCHEMA,
      load: clamp01(rec.load * VENT_INHERIT_LOAD),
      vents: 0,
      ventedUnits: 0,
      shocks: 0,
      stage: 'warming',
      lastShockAt: now,
      lastHeatAt: now,
      lastVentAt: -Infinity,
    };
    pod.data.amount = amount - ventQty;
    // The scoop path for payload bodies drains data.salvagePool FIRST (mining._collectPayload)
    // and only falls back to data.amount when no pool exists — spawnJettisonedCargoPod stamped
    // the pool at the FULL jettisoned quantity, so the split must reduce BOTH or a scooped
    // parent would credit the pre-vent quantity on top of the vented child (P1 fix). Key
    // deletion at zero mirrors the pool's own drain convention; an emptied pool hands the
    // remaining data.amount back to the ordinary amount-branch scoop instead of stranding it.
    const pool = pod.data.salvagePool;
    if (pool && typeof pool === 'object' && pod.data.commodityId != null) {
      const remaining = Math.max(0, (Number(pool[pod.data.commodityId]) || 0) - ventQty);
      if (remaining > 0) pool[pod.data.commodityId] = remaining;
      else delete pool[pod.data.commodityId];
    }
    rec.vents = (Math.floor(rec.vents) || 0) + 1;
    rec.ventedUnits = (Math.floor(rec.ventedUnits) || 0) + ventQty;
    rec.lastVentAt = now;
    rec.load = Math.max(0, rec.load - VENT_RELIEF);
    this._publishStage(state, pod, rec, now, 'vent');
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:volatileVent', {
        podId: pod.id,
        ventedPodId: spawned.id,
        commodityId: pod.data.commodityId,
        ventedQty: ventQty,
        remainingQty: pod.data.amount,
        load: clamp01(rec.load),
        vents: rec.vents,
        pos: { x: pod.pos.x, z: pod.pos.z },
      });
      this.bus.emit('presentation:vfxCue', {
        id: 'cargoVolatile.vent',
        lane: 'utility',
        particles: 16,
        lights: 0,
        magnitude: 0.7,
        position: { x: pod.pos.x, z: pod.pos.z },
        material: 'energy',
        sourceId: pod.id,
        targetId: spawned.id,
        flashReduced: true,
      });
      this.bus.emit('audio:cue', { id: 'alert' });
    }
    announceVolatile(this, `Volatile load venting: ${ventQty} units boiled off — handle it gently`);
  },

  // RUPTURE — the abused lot cooks off through the ORDINARY damage owner. The cue publishes
  // only when the packet was accepted (NXI-030): a rejected packet is not a rupture, the body
  // is not marked detonated, and the load parks just under the bar so a later fact can still
  // escalate it.
  _rupturePod(state, pod, rec, now, amount) {
    const route = routeCombatDamageOf(this);
    if (!route) {
      rec.load = Math.max(0, VENT_LOAD - 0.01); // retryable once a damage owner exists
      rec.lastVentAt = now;
      this._publishStage(state, pod, rec, now, 'rupture_refused');
      return;
    }
    const packet = scalarHitToDamagePacket({
      damage: RUPTURE_DAMAGE,
      damageType: 'thermal',
      pos: { x: pod.pos.x, z: pod.pos.z },
      source: { kind: 'volatile_exposure_rupture' },
      shieldBypass: 1,
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    // Mark BEFORE routing: the kernel emits combat:damage mid-route while the body still reads
    // alive, and this body cooking off is not a new heat fact (the mark is that fact). A rejected
    // packet restores the previous mark — lootShards' own slam may already have set it.
    const wasDetonated = pod.data.volatileDetonated === true;
    pod.data.volatileDetonated = true;
    const result = route({
      attackerId: null,
      targetId: pod.id,
      packet,
      origin: { kind: 'volatile_exposure_rupture', id: pod.id },
    });
    const accepted = !result || result.ok !== false;
    if (!accepted) {
      if (!wasDetonated) pod.data.volatileDetonated = false;
      rec.load = Math.max(0, VENT_LOAD - 0.01);
      rec.lastVentAt = now;
      // The parked load is a real condition change; the stage words must say so (P2a).
      this._publishStage(state, pod, rec, now, 'rupture_refused');
      return;
    }
    rec.load = Math.max(0, VENT_LOAD - 0.01);
    rec.lastVentAt = now;
    // If the accepted packet somehow failed to kill the body, do not leave OUR mark on it:
    // lootShards' own slam must stay able to play, and the mark must not lie (P2b). A mark that
    // pre-dated this packet (lootShards' slam) is not ours to clear.
    if (pod.alive !== false && pod.destroyed !== true && !wasDetonated) {
      pod.data.volatileDetonated = false;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:volatileRupture', {
        podId: pod.id,
        class: 'explosive',
        commodityId: pod.data.commodityId,
        destroyedQty: amount,
        pos: { x: pod.pos.x, z: pod.pos.z },
        cause: 'exposure',
      });
      this.bus.emit('presentation:vfxCue', {
        id: 'cargoVolatile.rupture',
        lane: 'combat',
        particles: 26,
        lights: 1,
        magnitude: 0.9,
        position: { x: pod.pos.x, z: pod.pos.z },
        material: 'fire',
        sourceId: pod.id,
        targetId: null,
        flashReduced: true,
      });
      this.bus.emit('audio:cue', { id: 'sfx_explosion_small', gain: 0.45 });
    }
    announceVolatile(this, `Volatile load ruptured: the remaining ${amount} units are gone`);
  },
};

export default volatileExposure;
