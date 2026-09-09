// Loot shards (Wave M2 §4.3, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The finding that reframed this feature: pickup MAGNETISM already ships (mining._updatePickups —
// homing vacuum: inherits player velocity + relative approach, pickups only). The real chore was
// that a ship kill drops ONLY a salvage wreck you must sit on with the beam. So: on a player kill
// of a hostile ship, ALSO emit the shipped `loot:drop` seam with an immediate victim-scaled burst —
// materials from hull class/cargo, plus physical credit chips. Mining spawns each entry as its own
// pickup; cargo still owns commodity collection, and credit chips settle through economy on scoop.
// The bulk salvage wreck (and the whole salvage career) is untouched.
//
// Deterministic: each victim gets a stateless roll derived from the CURRENT run seed plus durable
// victim identity. There is no private cursor to serialize or accidentally carry across New Game.
// The core sim PRNG is never consumed by reward selection; pickup presentation still owns its
// ordinary placement draws downstream.
//
// D2 — civilian manifest cargo body (AQUARIUM-REPAIRS):
// A destroyed manifest-carrying civilian hull used to leave only cargoManifest strings on a dead
// entity. On death we spawn EXACTLY ONE tetherable `payload` via spawnPayloadEntity (industrial-beam
// pattern) whose salvagePool is that manifest. Cargo state stays cargo-owned — the payload carries
// a salvagePool snapshot, not a second cargo writer. Hostiles still take the shard path only.
//
// Payload cost / cap declaration:
// - Entity: one dynamic `payload` (collides, mass ≥ 20, hull, ownership stamp).
// - Save: flags.persistent so save/Continue round-trips the body (type `payload` is NOT a
//   world-record durable candidate — entityHasDurableMarkers excludes it).
// - Cap: MAX_CIVILIAN_MANIFEST_PAYLOADS live bodies. Excess disposes the oldest
//   (lowest entity id) — same bounded-eviction idea as aftermath wreck markers. Sector transition
//   despawns un-anchored transient payloads via handlePayloadSectorTransition; these bodies set
//   transientSector:false so a claimed/persistent body survives sector change while the cap still
//   bounds total residency.
//
// PQ-148.00 — jettisoned hold pods use the same spawnPayloadEntity body (JETTISONED_CARGO_PAYLOAD_TYPE),
// mass by contents, flags.persistent, cap MAX_JETTISONED_CARGO_PODS. Cargo.js remains the inventory writer.
//
// PQ-148.01 — volatile classes (agy catalog: src/data/commodityVolatileClasses.js). Explosive slam
// publishes a radial impulse; corrosive contact ticks hull (not a distance aura); superdense couples
// harder to fields and cannot be thrown far. Silhouette/lamp live on the pod for render to read later.
//
// PQ-148.02 — field pods stamp legality/owner for a customs scan cone (lawSecurity). An outlaw
// catch-net body can stop a flying pod; heat still rises only via contraband:scanned → heat.js.
//
// PQ-148.03 — pods carry origin/destination/owner. A spilled named pod's owner reacts
// (restitution / bounty / thanks) through barkDirector + comms:log.
import { spawnPayloadEntity } from '../combat/industrialBeam.js';
import { createVictimRewardRng, missionOwnsReward, runOwnsReward } from '../combat/rewardEligibility.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { cargoIdentityOf, identityFromManifest } from '../data/cargoIdentity.js';
import { COMMODITIES } from '../data/commodities.js';
import { volatileClassOf } from '../data/commodityVolatileClasses.js';
import { massline2Flag } from '../data/featureFlags.js';
import { rollKillRewardItems } from '../data/killRewards.js';
import { forEachJobInteractable } from '../world/livingWorldViews.js';
import { isHostileToPlayer } from './scanner.js';

const SHARD_REWARD_SALT = 'loot_shards_reward_v3';

/** Live-resident cap for civilian-manifest cargo bodies (see file header). */
export const MAX_CIVILIAN_MANIFEST_PAYLOADS = 6;
export const CIVILIAN_MANIFEST_PAYLOAD_TYPE = 'civilian_manifest';

/**
 * PQ-148.00 — player-jettisoned / spilled hold pods reuse the industrial-beam payload body.
 * Cap matches the packet budget (≤ 48 live pods per sector). TTL is not applied; residency is
 * `flags.persistent` plus this eviction bound. Cargo inventory stays cargo-owned.
 */
export const MAX_JETTISONED_CARGO_PODS = 48;
export const JETTISONED_CARGO_PAYLOAD_TYPE = 'jettisoned_cargo';
export const JETTISONED_CARGO_MASS_FLOOR = 20;

/** PQ-148.01 — slam bar (WU/s closing) before an explosive pod cooks off a radial shove. */
export const EXPLOSIVE_SLAM_CLOSING_SPEED = 12;
export const EXPLOSIVE_BLAST_RADIUS = 80;
export const EXPLOSIVE_BLAST_IMPULSE = 900;
export const CORROSIVE_HULL_TICK = 8;
export const CORROSIVE_TICK_COOLDOWN_S = 0.35;
/** Extra fieldResponseMult on top of mass-shrug; fields.js still applies the unmarked pull. */
export const SUPERDENSE_FIELD_RESPONSE = 2.5;

/** PQ-148.02 — outlaw catch-net body that stops a flying pod past a customs cone. */
export const OUTLAW_CATCH_NET_TYPE = 'outlaw_catch_net';

const LEGALITY_BY_ID = new Map((COMMODITIES || []).map((row) => [row.id, row.legality || 'legal']));

const VOLATILE_BLAST_TYPES = new Set(['ship', 'drone', 'payload']);
const VOLATILE_HULL_TYPES = new Set(['ship', 'drone']);
const _nearbyScratch = [];
const _catchNetScratch = [];
const _catchPodScratch = [];
const _fieldDense = { ax: 0, az: 0 };
const _fieldBase = { ax: 0, az: 0 };
const _denseProfile = { mass: 1, type: 'payload', id: null, fieldResponseMult: 1 };
const _baseProfile = { mass: 1, type: 'payload', id: null, fieldResponseMult: 1 };

export function lootShardItemsFor(seed, victim) {
  const rng = createVictimRewardRng(seed, victim, SHARD_REWARD_SALT);
  return rollKillRewardItems(rng, victim);
}

/** Expected-value helper for tests and balance audit (basePrice at equilibrium). */
export function lootShardBasePriceEv(items, commodityBasePriceById) {
  if (!Array.isArray(items) || !commodityBasePriceById) return 0;
  let total = 0;
  for (const it of items) {
    if (!it || !it.commodityId) continue;
    const price = Number(commodityBasePriceById.get?.(it.commodityId)
      ?? commodityBasePriceById[it.commodityId]) || 0;
    total += price * Math.max(0, Number(it.qty) || 0);
  }
  return total;
}

/** True when a cargoManifest carries at least one positive commodity line. */
export function validCivilianManifestForPayload(manifest) {
  if (!manifest || !Array.isArray(manifest.lines) || manifest.lines.length === 0) return false;
  let total = 0;
  for (let i = 0; i < manifest.lines.length; i++) {
    const line = manifest.lines[i];
    if (!line || typeof line.commodityId !== 'string' || !line.commodityId) return false;
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty <= 0) return false;
    total += qty;
  }
  return total > 0;
}

/** Map manifest lines → salvagePool object (industrial-beam / mining drain shape). */
export function salvagePoolFromManifest(manifest) {
  const pool = {};
  if (!manifest || !Array.isArray(manifest.lines)) return pool;
  for (let i = 0; i < manifest.lines.length; i++) {
    const line = manifest.lines[i];
    if (!line || typeof line.commodityId !== 'string') continue;
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    pool[line.commodityId] = (pool[line.commodityId] || 0) + qty;
  }
  return pool;
}

function isCivilianManifestPayload(entity) {
  return !!(entity
    && entity.alive !== false
    && entity.type === 'payload'
    && entity.data
    && entity.data.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE);
}

export function isJettisonedCargoPod(entity) {
  return !!(entity
    && entity.alive !== false
    && entity.type === 'payload'
    && entity.data
    && entity.data.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
}

export function isOutlawCatchNet(entity) {
  return !!(entity
    && entity.alive !== false
    && entity.data
    && (entity.data.outlawCatchNet === true || entity.data.payloadType === OUTLAW_CATCH_NET_TYPE));
}

export function commodityLegality(commodityId) {
  if (typeof commodityId !== 'string' || !commodityId) return 'legal';
  return LEGALITY_BY_ID.get(commodityId) || 'legal';
}

/** Mass of a cargo pod body: contents × unit mass, never below the payload floor. */
export function cargoPodMassForContents(unitMass, amount) {
  const qty = Math.max(0, Number(amount) || 0);
  const per = Number.isFinite(unitMass) ? unitMass : 0.5;
  return Math.max(JETTISONED_CARGO_MASS_FLOOR, qty * per);
}

/** Jettison eject scale from the volatile catalog (superdense throwRangeMult = 0.5). */
export function volatileThrowSpeedScale(commodityId) {
  const klass = volatileClassOf(commodityId);
  const mult = klass && Number(klass.throwRangeMult);
  return Number.isFinite(mult) && mult > 0 ? mult : 1;
}

/** PQ-148.03 — copy origin/destination/owner onto pod data without inventing a second cargo writer. */
export function stampCargoIdentity(target, spec = {}) {
  if (!target || !spec || typeof spec !== 'object') return target;
  const identity = spec.cargoIdentity && typeof spec.cargoIdentity === 'object'
    ? spec.cargoIdentity
    : (identityFromManifest(spec, spec) || cargoIdentityOf(spec));
  const originId = spec.originId ?? spec.originStationId ?? (identity && identity.originId);
  const destinationId = spec.destinationId ?? spec.destStationId ?? (identity && identity.destinationId);
  const ownerId = spec.ownerId != null ? spec.ownerId : (identity && identity.ownerId);
  const ownerName = spec.ownerName != null ? spec.ownerName : (identity && identity.ownerName);
  if (originId != null) target.originId = originId;
  if (destinationId != null) target.destinationId = destinationId;
  if (ownerId != null) target.ownerId = ownerId;
  if (ownerName != null) target.ownerName = ownerName;
  const stamped = cargoIdentityOf(target);
  if (stamped) target.cargoIdentity = stamped;
  return target;
}

function displayNameOf(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  return data.displayName || data.name || data.freighterLabel || data.freighterName || entity.name || null;
}

/** Lamp + silhouette the render can read later. Does not import src/render. */
export function stampVolatilePresentation(target, commodityId) {
  if (!target) return target;
  const klass = volatileClassOf(commodityId);
  if (!klass) return target;
  target.volatileClass = klass.id;
  target.volatileLamp = klass.lamp;
  target.volatileSilhouette = klass.silhouetteNote;
  return target;
}

export function fieldProfileForVolatilePod(pod, out = null) {
  const klass = volatileClassOf(pod && pod.data);
  const body = pod && pod.physicsBody;
  const mass = Number.isFinite(body && body.mass) && body.mass > 0
    ? body.mass
    : (Number.isFinite(pod && pod.mass) && pod.mass > 0 ? pod.mass : JETTISONED_CARGO_MASS_FLOOR);
  const profile = out || {};
  profile.mass = mass;
  profile.type = (pod && pod.type) || 'payload';
  profile.id = pod && pod.id;
  profile.fieldResponseMult = (klass && klass.fieldPull) ? SUPERDENSE_FIELD_RESPONSE : 1;
  return profile;
}

function simNow(state) {
  if (!state) return 0;
  return Number.isFinite(state.simTime) ? state.simTime : (state.tick || 0) / 60;
}

function entityById(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function impactClosingSpeed(payload) {
  if (Number.isFinite(payload && payload.preSolveClosingSpeed)) {
    return Math.abs(payload.preSolveClosingSpeed);
  }
  if (Number.isFinite(payload && payload.playerDeltaV)) {
    return Math.abs(payload.playerDeltaV);
  }
  return Math.max(0, Number(payload && payload.dp) || Number(payload && payload.impulse) || 0);
}

function combatKernelOf(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  if (combat && typeof combat.ensureKernel === 'function') return combat.ensureKernel();
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}

function applyRadialPublishedImpulse(host, origin, skipId, magnitude, radius, reason, tick) {
  const physics = host.helpers && host.helpers.combatPhysics;
  if (!physics || typeof physics.applyImpulse !== 'function' || !origin) return 0;
  const state = host.state;
  const nearby = queryNearbyEntities(state, origin, radius, _nearbyScratch, state && state.entityList);
  let applied = 0;
  for (let i = 0; i < nearby.length; i++) {
    const entity = nearby[i];
    if (!entity || entity.alive === false || entity.id === skipId || !entity.pos) continue;
    if (!VOLATILE_BLAST_TYPES.has(entity.type)) continue;
    const dx = entity.pos.x - origin.x;
    const dz = entity.pos.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (!(dist > 1e-4) || dist > radius) continue;
    const fall = 1 - dist / radius;
    const mag = magnitude * fall;
    if (!(mag > 0)) continue;
    const inv = 1 / dist;
    const accepted = physics.applyImpulse({
      entityId: entity.id,
      impulse: { x: dx * inv * mag, z: dz * inv * mag },
      point: null,
      reason,
      tick,
    });
    if (accepted !== false) applied += mag;
  }
  return applied;
}

function routeCorrosiveHullTick(host, target, damage, pos, pod = null) {
  const packet = scalarHitToDamagePacket({
    damage,
    damageType: 'thermal',
    pos: pos && Number.isFinite(pos.x) ? { x: pos.x, z: pos.z } : (target.pos || null),
    source: { kind: 'volatile_corrosive' },
    shieldBypass: 1,
  });
  packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
  const attackerId = pod && pod.ownerId != null
    ? pod.ownerId
    : (pod && pod.data && pod.data.ownerId != null ? pod.data.ownerId : null);
  const origin = { kind: 'volatile_corrosive', id: pod && pod.id != null ? pod.id : (target && target.id) };
  const helpers = host.helpers;
  if (helpers && typeof helpers.routeCombatDamage === 'function') {
    return helpers.routeCombatDamage({
      attackerId,
      targetId: target.id,
      packet,
      origin,
    });
  }
  const kernel = combatKernelOf(host);
  if (kernel && typeof kernel.routeDamage === 'function') {
    return kernel.routeDamage({
      attackerId,
      targetId: target.id,
      packet,
      origin,
    });
  }
  return null;
}

/**
 * Stamp cargo-collection fields onto a payload spec/entity without inventing a second cargo writer.
 * `pickup:collected` still reads kind/commodityId/amount/richLotSource from the body.
 */
function applyJettisonedCargoData(target, spec) {
  if (!target) return target;
  const amount = Math.max(0, Math.floor(Number(spec.amount) || 0));
  const commodityId = spec.commodityId;
  const richSource = spec.richSource;
  target.kind = 'cargo';
  target.commodityId = commodityId;
  target.amount = amount;
  target.jettisonedCargo = true;
  if (richSource) target.richLotSource = { ...richSource, richQty: amount };
  if (spec.pickupEmbargoUntil != null) target.pickupEmbargoUntil = spec.pickupEmbargoUntil;
  if (target.despawnAt != null) delete target.despawnAt;
  target.legality = commodityLegality(commodityId);
  stampCargoIdentity(target, spec);
  stampVolatilePresentation(target, commodityId);
  return target;
}

/**
 * Spawn one tetherable colliding cargo pod via spawnPayloadEntity (same path as civilian manifests).
 * Save/Continue residency is `flags.persistent`. Does not write player cargo.
 */
export function spawnJettisonedCargoPod(state, spec = {}, helpers = null) {
  const amount = Math.max(0, Math.floor(Number(spec.amount) || 0));
  if (!(amount > 0) || typeof spec.commodityId !== 'string' || !spec.commodityId) return null;

  const mass = cargoPodMassForContents(spec.unitMass, amount);
  const radius = Math.max(3, Math.min(25, Number(spec.radius) || 3));
  const cargoStamp = {
    commodityId: spec.commodityId,
    amount,
    richSource: spec.richSource || null,
    pickupEmbargoUntil: spec.pickupEmbargoUntil,
    ownerId: spec.ownerId,
    ownerName: spec.ownerName,
    originId: spec.originId ?? spec.originStationId,
    destinationId: spec.destinationId ?? spec.destStationId,
    cargoIdentity: spec.cargoIdentity,
  };

  const spawnHelpers = helpers && typeof helpers.spawnEntity === 'function'
    ? {
      spawnEntity(payloadSpec) {
        if (payloadSpec && payloadSpec.data) applyJettisonedCargoData(payloadSpec.data, cargoStamp);
        payloadSpec.flags = Object.assign({}, payloadSpec.flags, { persistent: true });
        return helpers.spawnEntity(payloadSpec);
      },
    }
    : helpers;

  const entity = spawnPayloadEntity(state, {
    pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
    vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 },
    radius,
    mass,
    hull: 100,
    hullMax: 100,
    ownerId: spec.ownerId != null ? spec.ownerId : null,
    factionId: spec.factionId || 'player',
    salvagePool: { [spec.commodityId]: amount },
    payloadType: JETTISONED_CARGO_PAYLOAD_TYPE,
    worldRecordId: null,
    transientSector: false,
  }, spawnHelpers);

  if (entity) {
    entity.data = entity.data || {};
    applyJettisonedCargoData(entity.data, cargoStamp);
    entity.flags = Object.assign({}, entity.flags, { persistent: true });
    if (entity.data.despawnAt != null) delete entity.data.despawnAt;
  }

  enforceJettisonedCargoPodCap(
    state,
    helpers && helpers.removeEntity,
    MAX_JETTISONED_CARGO_PODS,
  );
  return entity || null;
}

/**
 * Bound live civilian-manifest payloads. Disposes oldest (lowest id) first — mirrors the
 * aftermath-wreck MAX_PER_SECTOR bounded eviction pattern without inventing a new ledger.
 */
export function enforceCivilianManifestPayloadCap(
  state,
  removeEntity,
  max = MAX_CIVILIAN_MANIFEST_PAYLOADS,
) {
  if (!state || !Number.isFinite(max) || max < 0) return 0;
  const found = [];
  const list = state.entityList;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      if (isCivilianManifestPayload(list[i])) found.push(list[i]);
    }
  } else if (state.entities && typeof state.entities.values === 'function') {
    for (const entity of state.entities.values()) {
      if (isCivilianManifestPayload(entity)) found.push(entity);
    }
  }
  if (found.length <= max) return 0;
  found.sort((a, b) => (a.id | 0) - (b.id | 0));
  const drop = found.length - max;
  let removed = 0;
  for (let i = 0; i < drop; i++) {
    const entity = found[i];
    if (!entity) continue;
    if (typeof removeEntity === 'function') {
      removeEntity(entity.id, { immediate: true, reason: 'manifest_payload_cap' });
    } else entity.alive = false;
    removed += 1;
  }
  return removed;
}

/**
 * Bound live jettisoned-cargo pods. Disposes oldest (lowest id) first — same eviction as
 * civilian-manifest payloads. Unowned scraps are not given a TTL here; the cap is the bound.
 */
export function enforceJettisonedCargoPodCap(
  state,
  removeEntity,
  max = MAX_JETTISONED_CARGO_PODS,
) {
  if (!state || !Number.isFinite(max) || max < 0) return 0;
  const found = [];
  const list = state.entityList;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      if (isJettisonedCargoPod(list[i])) found.push(list[i]);
    }
  } else if (state.entities && typeof state.entities.values === 'function') {
    for (const entity of state.entities.values()) {
      if (isJettisonedCargoPod(entity)) found.push(entity);
    }
  }
  if (found.length <= max) return 0;
  found.sort((a, b) => (a.id | 0) - (b.id | 0));
  const drop = found.length - max;
  let removed = 0;
  for (let i = 0; i < drop; i++) {
    const entity = found[i];
    if (!entity) continue;
    if (typeof removeEntity === 'function') {
      removeEntity(entity.id, { immediate: true, reason: 'jettisoned_cargo_pod_cap' });
    } else entity.alive = false;
    removed += 1;
  }
  return removed;
}

export const lootShards = {
  id: 'lootShards',
  name: 'lootShards',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry || null;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p || {})));
      this._unsubs.push(this.bus.on('physics:impact', (p) => this._onPodImpact(p || {})));
      this._unsubs.push(this.bus.on('freight:cargoSpilled', (p) => this._onFreightCargoSpilled(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update(dt, state) {
    const live = state || this.state;
    this._catchPodsInNets(live);
    this._pullSuperdensePods(dt, live);
  },

  _catchPodsInNets(state) {
    if (!state || state.mode !== 'flight') return;
    const index = state.entityIndex;
    // Pods are payloads. No payload bucket means no pods to catch.
    if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.payloads)
      && index.payloads.length === 0) {
      return;
    }
    const nets = _catchNetScratch;
    const pods = _catchPodScratch;
    nets.length = 0;
    pods.length = 0;
    forEachJobInteractable(state, (entity) => {
      if (isOutlawCatchNet(entity) && entity.pos) nets.push(entity);
      else if (isJettisonedCargoPod(entity) && entity.pos && entity.data && !entity.data.caughtByNet) {
        pods.push(entity);
      }
    });
    if (nets.length === 0 || pods.length === 0) return;
    for (let n = 0; n < nets.length; n++) {
      const net = nets[n];
      const netR = Math.max(1, Number(net.radius) || 8);
      for (let p = 0; p < pods.length; p++) {
        const pod = pods[p];
        if (pod.data.caughtByNet) continue;
        const dx = pod.pos.x - net.pos.x;
        const dz = pod.pos.z - net.pos.z;
        const reach = netR + Math.max(1, Number(pod.radius) || 3);
        if (dx * dx + dz * dz > reach * reach) continue;
        this._markCaughtByNet(pod, net);
      }
    }
  },

  _markCaughtByNet(pod, net) {
    if (!pod || !pod.data || pod.data.caughtByNet) return;
    const state = this.state;
    pod.data.caughtByNet = true;
    pod.data.caughtByNetId = net && net.id;
    const physics = this.helpers && this.helpers.combatPhysics;
    const vx = Number(pod.vel && pod.vel.x) || 0;
    const vz = Number(pod.vel && pod.vel.z) || 0;
    const mass = Number.isFinite(pod.mass) && pod.mass > 0 ? pod.mass : JETTISONED_CARGO_MASS_FLOOR;
    if (physics && typeof physics.applyImpulse === 'function' && (vx || vz)) {
      physics.applyImpulse({
        entityId: pod.id,
        impulse: { x: -vx * mass, z: -vz * mass },
        point: null,
        reason: 'outlaw_catch_net',
        tick: state && state.tick,
      });
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:caughtByNet', { podId: pod.id, netId: net && net.id });
    }
  },

  _onPodImpact(payload) {
    this._onCatchNetImpact(payload);
    this._onVolatileImpact(payload);
  },

  _onCatchNetImpact(payload) {
    const state = this.state;
    if (!state || !payload) return;
    const a = entityById(state, payload.aId);
    const b = entityById(state, payload.bId);
    const pod = isJettisonedCargoPod(a) ? a : (isJettisonedCargoPod(b) ? b : null);
    const net = isOutlawCatchNet(a) ? a : (isOutlawCatchNet(b) ? b : null);
    if (!pod || !net) return;
    this._markCaughtByNet(pod, net);
  },

  _onVolatileImpact(payload) {
    const state = this.state;
    if (!state || !payload) return;
    const a = entityById(state, payload.aId);
    const b = entityById(state, payload.bId);
    const pod = isJettisonedCargoPod(a) ? a : (isJettisonedCargoPod(b) ? b : null);
    if (!pod || !pod.data) return;
    const klass = volatileClassOf(pod.data) || volatileClassOf(pod.data.volatileClass);
    if (!klass) return;
    const other = pod === a ? b : a;
    if (klass.slam === 'radial_impulse') {
      this._detonateExplosiveSlam(pod, payload, klass);
      return;
    }
    if (klass.slam === 'hull_tick') {
      this._tickCorrosiveContact(pod, other, payload, klass);
    }
  },

  _detonateExplosiveSlam(pod, payload, klass) {
    if (pod.data.volatileDetonated) return;
    const closing = impactClosingSpeed(payload);
    const dp = Math.max(0, Number(payload.dp) || Number(payload.impulse) || 0);
    if (closing < EXPLOSIVE_SLAM_CLOSING_SPEED && dp < 80) return;
    const amount = Math.max(1, Number(pod.data.amount) || 1);
    const magnitude = EXPLOSIVE_BLAST_IMPULSE * Math.min(2, 0.5 + amount / 16);
    const origin = payload.pos && Number.isFinite(payload.pos.x)
      ? payload.pos
      : pod.pos;
    const applied = applyRadialPublishedImpulse(
      this,
      origin,
      pod.id,
      magnitude,
      EXPLOSIVE_BLAST_RADIUS,
      'volatile_explosive_slam',
      this.state && this.state.tick,
    );
    if (!(applied > 0)) return;
    pod.data.volatileDetonated = true;
    pod.data.volatileSlamImpulse = applied;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:volatileSlam', {
        class: klass.id,
        podId: pod.id,
        appliedImpulse: applied,
        closingSpeed: closing,
      });
    }
  },

  _tickCorrosiveContact(pod, other, payload, klass) {
    if (!other || other.alive === false || !VOLATILE_HULL_TYPES.has(other.type)) return;
    const now = simNow(this.state);
    const last = Number(pod.data.volatileCorrosiveAt);
    if (Number.isFinite(last) && now - last < CORROSIVE_TICK_COOLDOWN_S) return;
    const hullBefore = Number(other.hull);
    const result = routeCorrosiveHullTick(this, other, CORROSIVE_HULL_TICK, payload.pos || pod.pos, pod);
    const hullAfter = Number(other.hull);
    const lost = Number.isFinite(hullBefore) && Number.isFinite(hullAfter)
      ? Math.max(0, hullBefore - hullAfter)
      : CORROSIVE_HULL_TICK;
    if (!(lost > 0) && !result) return;
    pod.data.volatileCorrosiveAt = now;
    pod.data.volatileCorrosiveTick = lost > 0 ? lost : CORROSIVE_HULL_TICK;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:volatileCorrosive', {
        class: klass.id,
        podId: pod.id,
        targetId: other.id,
        hullTick: pod.data.volatileCorrosiveTick,
      });
    }
  },

  _pullSuperdensePods(dt, state) {
    if (!state || state.mode !== 'flight') return;
    const step = Number(dt);
    if (!(step > 0)) return;
    const snapshot = state.fields && Array.isArray(state.fields.snapshot) ? state.fields.snapshot : null;
    if (!snapshot || snapshot.length === 0) return;
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return;
    const index = state.entityIndex;
    const list = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.payloads)
      ? index.payloads
      : state.entityList;
    if (!Array.isArray(list)) return;
    const now = simNow(state);
    for (let i = 0; i < list.length; i++) {
      const pod = list[i];
      if (!isJettisonedCargoPod(pod) || !pod.pos) continue;
      const klass = volatileClassOf(pod.data);
      if (!klass || !klass.fieldPull) continue;
      const dense = fieldProfileForVolatilePod(pod, _denseProfile);
      _baseProfile.mass = dense.mass;
      _baseProfile.type = dense.type;
      _baseProfile.id = dense.id;
      _baseProfile.fieldResponseMult = 1;
      sampleFieldAcceleration(pod.pos, pod.vel, snapshot, now, dense, _fieldDense);
      sampleFieldAcceleration(pod.pos, pod.vel, snapshot, now, _baseProfile, _fieldBase);
      const ax = _fieldDense.ax - _fieldBase.ax;
      const az = _fieldDense.az - _fieldBase.az;
      if (ax === 0 && az === 0) continue;
      const mass = dense.mass;
      physics.applyImpulse({
        entityId: pod.id,
        impulse: { x: ax * mass * step, z: az * mass * step },
        point: null,
        reason: 'volatile_superdense_field',
        tick: state.tick,
      });
    }
  },

  _onKilled(payload) {
    if (!massline2Flag('lootShards')) return;
    const state = this.state;
    const victim = payload.id != null && state.entities && state.entities.get
      ? state.entities.get(payload.id) : null;
    const type = victim ? victim.type : payload.type;
    if (type !== 'ship' && type !== 'drone') return;
    if (payload.id === state.playerId) return;
    if (!victim) return;
    // Contracts own contract-target rewards. Fail closed for mission hulls.
    if (missionOwnsReward(victim)) return;
    // Survival bodies drop their own run-wallet chip through survivalRewards. A second campaign
    // shard burst on the same hull would pay the Adventure purse mid-run (PQ-133 CRU-015).
    if (runOwnsReward(victim)) return;

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    // Production combat snapshots canonical hostility before synchronous damage consequences can
    // grant a clean victim retaliation authority. Older publishers fall back to current live truth.
    const targetHostileToPlayer = typeof payload.targetHostileToPlayer === 'boolean'
      ? payload.targetHostileToPlayer
      : !!(player && isHostileToPlayer(victim, player.team, state));

    // D2: non-hostile (civilian / traffic / convoy) hull with a real manifest → one cargo body.
    // Any killer: ambient predation and player piracy both leave a takeable body in the world.
    if (!targetHostileToPlayer) {
      this._trySpawnCivilianManifestPayload(payload, victim);
      return;
    }

    // Hostile path: player-earned shard burst only.
    if (payload.killerId !== state.playerId) return;
    if (!player) return;
    const pos = (victim && victim.pos) || payload.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const items = lootShardItemsFor(state.meta && state.meta.seed, victim);
    const vel = victim.vel && typeof victim.vel === 'object'
      ? {
        x: Number.isFinite(victim.vel.x) ? victim.vel.x : 0,
        z: Number.isFinite(victim.vel.z) ? victim.vel.z : 0,
      }
      : { x: 0, z: 0 };
    // Credits stay inside the physical chip items. A top-level credits field would look like
    // the authored combat grant-at-death receipt; AC-01 settles only on collection.
    this.bus.emit('loot:drop', {
      pos: { x: pos.x, z: pos.z },
      items,
      vel,
      source: 'kill_burst',
    });
  },

  /**
   * Spawn exactly one payload carrying the victim's cargoManifest as salvagePool.
   * Cap: one per hull death; MAX_CIVILIAN_MANIFEST_PAYLOADS live bodies.
   */
  _trySpawnCivilianManifestPayload(payload, victim) {
    if (!victim || !victim.data) return null;
    // One payload per hull death — stamp survives if the dead entity lingers for a tick.
    if (victim.data.manifestPayloadDropped === true) return null;
    // PQ-047 freight custody owns the physical spill for authored manifest carriers (disable/death
    // pods through encounterScripts). Do not invent a second conserved body on the same hull.
    if (victim.data.freightRewardOwner === 'manifest_custody') return null;
    const custody = victim.data.freightCustody;
    if (custody && (custody.status === 'carrier' || custody.status === 'spilled'
      || custody.custodyId != null)) return null;
    const manifest = victim.data.cargoManifest;
    if (!validCivilianManifestForPayload(manifest)) return null;

    const pos = victim.pos || payload.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;

    const pool = salvagePoolFromManifest(manifest);
    const radius = Math.max(3, Math.min(25, Math.round((Number(victim.radius) || 10) * 0.4)));
    const mass = Math.max(20, radius * 12);
    const vel = victim.vel && typeof victim.vel === 'object'
      ? {
        x: Number.isFinite(victim.vel.x) ? victim.vel.x * 0.15 : 0,
        z: Number.isFinite(victim.vel.z) ? victim.vel.z * 0.15 : 0,
      }
      : { x: 0, z: 0 };

    const entity = spawnPayloadEntity(this.state, {
      pos: { x: pos.x, z: pos.z },
      vel,
      radius,
      mass,
      hull: 100,
      hullMax: 100,
      // Unclaimed jettison: player takes custody via tether/beam, not auto-ownership.
      ownerId: null,
      factionId: victim.factionId || 'neutral',
      salvagePool: pool,
      payloadType: CIVILIAN_MANIFEST_PAYLOAD_TYPE,
      worldRecordId: null,
      transientSector: false,
    }, this.helpers);
    entity.data.sourceVictimId = victim.id;
    entity.data.manifestId = typeof manifest.manifestId === 'string' ? manifest.manifestId : null;
    stampCargoIdentity(entity.data, identityFromManifest(manifest, {
      ownerId: manifest.ownerId || victim.id,
      ownerName: manifest.ownerName || displayNameOf(victim),
      originId: manifest.originId || manifest.originStationId,
      destinationId: manifest.destinationId || manifest.destStationId,
      role: manifest.role || 'civilian',
      isCivilian: true,
    }) || {
      ownerId: victim.id,
      ownerName: displayNameOf(victim),
      originId: manifest.originId || manifest.originStationId || null,
      destinationId: manifest.destinationId || manifest.destStationId || null,
    });
    // Save/Continue: payloads are not world-record candidates; persist via entity flags.
    entity.flags = Object.assign({}, entity.flags, { persistent: true });
    victim.data.manifestPayloadDropped = true;

    enforceCivilianManifestPayloadCap(
      this.state,
      this.helpers && this.helpers.removeEntity,
      MAX_CIVILIAN_MANIFEST_PAYLOADS,
    );
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('loot:manifestPayload', {
        payloadId: entity.id,
        victimId: victim.id,
        salvagePool: { ...entity.data.salvagePool },
      });
    }
    return entity;
  },

  /**
   * Freight pods spawn in encounterScripts (pickup + freightCustodyPod). Stamp the named
   * origin/destination/owner onto those bodies when the existing spill event fires.
   */
  _onFreightCargoSpilled(payload) {
    const state = this.state;
    if (!state || !payload) return 0;
    const carrier = entityById(state, payload.carrierId);
    const manifest = (carrier && carrier.data && carrier.data.cargoManifest)
      || payload.manifest
      || null;
    const identity = identityFromManifest(manifest || payload, {
      ownerId: payload.ownerId || (manifest && manifest.ownerId) || (carrier && carrier.id),
      ownerName: payload.ownerName || (manifest && manifest.ownerName) || displayNameOf(carrier),
      originId: payload.originId,
      destinationId: payload.destinationId,
      role: (manifest && manifest.role) || payload.role || 'civilian',
      isCivilian: true,
    });
    if (!identity) return 0;
    const list = state.entityList || [];
    let stamped = 0;
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      const data = entity && entity.data;
      if (!data) continue;
      const freight = data.freightCustodyPod;
      const freightMatch = freight && typeof freight === 'object'
        && (freight.custodyId === payload.custodyId
          || freight.manifestId === payload.manifestId
          || freight.encounterId === payload.encounterId);
      const payloadMatch = entity.type === 'payload'
        && (data.sourceVictimId === payload.carrierId
          || (data.jettisonedCargo === true
            && (data.ownerId == null || String(data.ownerId) === String(identity.ownerId))));
      if (!freightMatch && !payloadMatch) continue;
      stampCargoIdentity(data, identity);
      stamped += 1;
    }
    return stamped;
  },
};
