// Physics system: integrate positions, rebuild the spatial hash, broad-phase + circle/circle
// collision with response, swept projectile tests. Runs as steps 5-7 of the sim spine (§2.3).
// Velocity is updated by flight (thrust/drag); physics integrates position from velocity.
import { Masks } from './entity.js';
import {
  createSg02DynamicBodyOwner,
  directContactCausalActorId,
} from './sg02DynamicBodyOwner.js';
import { hasActiveSpatialHash } from './spatialQuery.js';
import {
  clearPickupAcceptanceRetry,
  finiteWholePickupAmount,
  PICKUP_ACCEPTANCE_RETRY_S,
  pickupAcceptanceRetryBlocks,
  resolvePickupAcceptance,
  setPickupAcceptanceRetry,
} from './pickupAcceptance.js';
import { combatFlag } from '../data/featureFlags.js';
import {
  ensureActivityClassified,
  resetActivityRuntimeForRestore,
} from '../world/activityRuntime.js';
import {
  resolveBerthWorld,
  resolveCollisionProxyManifest,
} from '../data/collisionProxyManifests.js';

const DEFAULT_MATERIAL = Object.freeze({
  push: 1,
  restitution: 0.18,
  tangentDamping: 0.04,
  impactScale: 1,
});

const COLLISION_MATERIALS = Object.freeze({
  ship: DEFAULT_MATERIAL,
  drone: { push: 0.9, restitution: 0.16, tangentDamping: 0.06, impactScale: 0.7 },
  payload: { push: 0.75, restitution: 0.08, tangentDamping: 0.18, impactScale: 0.5 },
  asteroid: { push: 1, restitution: 0.24, tangentDamping: 0.08, impactScale: 1.1 },
  station: { push: 0.48, restitution: 0.05, tangentDamping: 0.35, impactScale: 0.35 },
});
const DYNAMIC_SPATIAL_QUERY_MIN_COLLIDABLES = 96;
const DYNAMIC_SPATIAL_QUERY_MIN_ASTEROIDS = 96;
const PICKUP_SPATIAL_PAIR_THRESHOLD = 128;
const PLAYER_PROJECTILE_NEAR_MISS_MARGIN = 22;
const ZERO_FRAME_ORIGIN = Object.freeze({ x: 0, z: 0 });
// Exact (or sub-ulp) XZ overlap: hypot is 0 so dx/dist is {0,0} and pushApart is a no-op.
// 1e-12 world units is far below gameplay contact scale; 47-A goldens never co-locate.
const DEGENERATE_SEP2 = 1e-24;
const DEGENERATE_SEP_CLAMP = 0.0001;
const _contactNormalScratch = { x: 1, z: 0 };

export const physics = {
  name: 'physics',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._scratch = [];
    this._statics = [];
    this._prevPosScratch = { x: 0, z: 0 };
    this._projectileSweepLimitScratch = { x: 0, z: 0, expired: false };
    this._segmentHitScratch = createSegmentHitRecord();
    this._bestSegmentHitScratch = createSegmentHitRecord();
    this._nearMissClosestScratch = { x: 0, z: 0, distance: 0 };
    this._nearMissEmitted = new WeakSet();
    this._pairMaterialScratch = createPairMaterialRecord();
    this._impactOptionsScratch = { backend: 'custom', tick: 0, normal: { x: 0, z: 0 }, causalActorId: null };
    this._pairMarks = new Map(); // low id -> Map<high id, stamp>; avoids per-frame string pair keys
    this._pairStamp = 1;
    this._dockStationId = null;
    this._gateEntityId = null;
    this._rapier = null;
    this._rapierInit = null;
    this._rapierToken = 0;
    this._sg02 = null;
    this._sg02Init = null;
    this._sg02Token = 0;
    this._sg02CombatPhysics = createDeferredSg02CombatPhysicsPort(this);
    this._spatialHashNeedsRebuild = false;
    if (ctx.helpers && !ctx.helpers.combatPhysics) ctx.helpers.combatPhysics = this._sg02CombatPhysics;
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('save:loaded', () => this._resetSg02AfterLoad());
    }
    this._diag = {
      backend: 'custom',
      rapierReady: false,
      bodies: 0,
      colliders: 0,
      ccdBodies: 0,
      rapierContacts: 0,
      rapierEvents: 0,
      sg02Ready: false,
      sg02Bodies: 0,
      sg02DynamicBodies: 0,
      sg02Attachments: 0,
      sg02SyncMode: 'none',
      sg02SyncFullEntities: 0,
      sg02SyncStaticEntities: 0,
      sg02SyncDynamicEntities: 0,
      sweptShipContacts: 0,
      sweptProjectileHits: 0,
      nearMissReceipts: 0,
      pickupCollections: 0,
      pickupPairChecks: 0,
      pickupSpatialQueries: 0,
      tickMs: 0,
      activityS0: 0,
      activityS1: 0,
      activityS2: 0,
      activityS3: 0,
      activityPhysicsBodies: 0,
    };
  },

  update(dt, state) {
    const t0 = nowMs();
    this._diag.sweptShipContacts = 0;
    this._diag.sweptProjectileHits = 0;
    this._diag.nearMissReceipts = 0;
    this._diag.pickupCollections = 0;
    this._diag.pickupPairChecks = 0;
    this._diag.pickupSpatialQueries = 0;
    if (usesSg02DynamicAuthority(state)) {
      this._updateSg02DynamicAuthority(dt, state);
      this._syncDynamicSpatialHash(state);
      this.collectPickups(state);
      this.sweepProjectiles(dt, state);
      this.updateDockRange(state);
      this._countCollisionPairWork(state);
      this._diag.tickMs = Math.max(0, nowMs() - t0);
      this._publishRuntime(state);
      return;
    }
    this._disableSg02DynamicAuthority();
    this.integrate(dt, state);
    this._rebuildSpatialHash(state);
    this._spatialHashNeedsRebuild = false;
    this.sweepShipStatics(dt, state);
    this.sweepProjectiles(dt, state);
    this.collectPickups(state);
    if (this._spatialHashNeedsRebuild) this._rebuildSpatialHash(state);
    this.collide(dt, state);
    this._syncOptionalBackend(dt, state);
    this.updateDockRange(state);
    this._countCollisionPairWork(state);
    this._diag.tickMs = Math.max(0, nowMs() - t0);
    this._publishRuntime(state);
  },

  /** Tier-1 causal mirror of the pair-evaluation work this tick's solve already measured. */
  _countCollisionPairWork(state) {
    const tier1 = state.perfRuntime && state.perfRuntime.tier1;
    if (!tier1 || !tier1.isEnabled()) return;
    if (this._diag.rapierContacts > 0) {
      tier1.countCollisionPairs(this._diag.rapierContacts, 'sg02-contact-pairs');
    }
    if (this._diag.sweptShipContacts > 0) {
      tier1.countCollisionPairs(this._diag.sweptShipContacts, 'swept-ship-contacts');
    }
    if (this._diag.sweptProjectileHits > 0) {
      tier1.countCollisionPairs(this._diag.sweptProjectileHits, 'swept-projectile-hits');
    }
    if (this._diag.pickupPairChecks > 0) {
      tier1.countCollisionPairs(this._diag.pickupPairChecks, 'pickup-pair-checks');
    }
  },

  _rebuildSpatialHash(state) {
    const hash = state.spatialHash;
    if (!hash) return;
    // Tier-1 causal count: the broad-phase membership walk visits each listed collider once.
    const tier1 = state.perfRuntime && state.perfRuntime.tier1;
    const countVisits = tier1 && tier1.isEnabled() ? tier1 : null;
    const layers = spatialHashLayersFromState(state);
    if (layers && typeof hash.rebuildLayers === 'function') {
      if (countVisits) {
        countVisits.countEntityVisits(
          layers.statics.length + layers.dynamics.length,
          'spatial-rebuild-layers',
        );
      }
      hash.rebuildLayers(layers.statics, layers.dynamics, layers.staticVersion);
      return;
    }
    if (countVisits) countVisits.countEntityVisits(state.entityList.length, 'spatial-rebuild');
    hash.rebuild(state.entityList);
  },

  _syncDynamicSpatialHash(state) {
    const hash = state.spatialHash;
    if (!hash) return;
    if (shouldMaintainDynamicSpatialHash(state)) {
      this._rebuildSpatialHash(state);
    } else if (typeof hash.deactivate === 'function') {
      hash.deactivate();
    } else if (typeof hash.clear === 'function') {
      hash.clear();
      if (hash.diagnostics) hash.diagnostics.activeBuckets = 0;
    }
  },

  _publishRuntime(state) {
    state.physicsRuntime = state.physicsRuntime || {};
    state.physicsRuntime.diagnostics = this._diag;
    if (this._sg02 && this._diag.backend === 'rapier-dynamic' && shouldPublishSg02Snapshot(state)) {
      state.physicsRuntime.sg02Snapshot = this._sg02.quantizedSnapshot({ liveOnly: true });
    } else {
      delete state.physicsRuntime.sg02Snapshot;
    }
  },

  async prepareBackend(state, options = {}) {
    const reset = options.reset === true;
    if (!usesSg02DynamicAuthority(state)) {
      if (reset) this._disableSg02DynamicAuthority();
      return true;
    }

    if (reset) this._disableSg02DynamicAuthority();
    this._updateSg02DynamicAuthority(0, state);
    if (this._sg02Init) await this._sg02Init;
    this._updateSg02DynamicAuthority(0, state);
    this._diag.tickMs = 0;
    this._publishRuntime(state);
    return this._diag.sg02Ready === true;
  },

  collectPickups(state) {
    const pickups = (state.entityIndex && state.entityIndex.pickups) || state.entityList;
    const collectors = (state.entityIndex && state.entityIndex.shipLike) || state.entityList;
    if (!pickups || !collectors || !pickups.length || !collectors.length) return;
    if (shouldUsePickupSpatialQuery(state, pickups, collectors)) {
      this._collectPickupsSpatial(state, pickups, collectors);
      return;
    }
    for (const pk of pickups) {
      if (!isLivePickup(pk)) continue;
      for (const col of collectors) {
        if (!pk.alive) break;
        this._diag.pickupPairChecks++;
        this._tryCollectPickup(pk, col);
      }
    }
  },

  _collectPickupsSpatial(state, pickups, collectors) {
    const out = this._scratch;
    const queryCollectors = collectors.length <= pickups.length;
    if (queryCollectors) {
      const maxPickupRadius = maxLivePickupRadius(pickups);
      for (const col of collectors) {
        if (!isPickupCollector(col)) continue;
        out.length = 0;
        state.spatialHash.queryRadius(col.pos.x, col.pos.z, (col.radius || 0) + maxPickupRadius, out);
        this._diag.pickupSpatialQueries++;
        for (const pk of out) {
          if (!isLivePickup(pk)) continue;
          this._diag.pickupPairChecks++;
          this._tryCollectPickup(pk, col);
        }
      }
      return;
    }

    const maxCollectorRadius = maxLiveCollectorRadius(collectors);
    for (const pk of pickups) {
      if (!isLivePickup(pk)) continue;
      out.length = 0;
      state.spatialHash.queryRadius(pk.pos.x, pk.pos.z, (pk.radius || 0) + maxCollectorRadius, out);
      this._diag.pickupSpatialQueries++;
      for (const col of out) {
        if (!pk.alive) break;
        if (!isPickupCollector(col)) continue;
        this._diag.pickupPairChecks++;
        this._tryCollectPickup(pk, col);
      }
    }
  },

  _tryCollectPickup(pk, col) {
    if (!isPickupCollector(col)) return false;
    if (!canCollide(pk, col) && !canCollide(col, pk)) return false;
    const dx = col.pos.x - pk.pos.x;
    const dz = col.pos.z - pk.pos.z;
    const rsum = (col.radius || 0) + (pk.radius || 0);
    if (dx * dx + dz * dz > rsum * rsum) return false;
    return this._applyPickupCollection(pk, col, this.bus, this.state);
  },

  _applyPickupCollection(pk, col, bus, state) {
    if (pickupAcceptanceRetryBlocks(
      pk && pk.data,
      col && col.id,
      state && state.playerId,
      state && state.simTime,
    )) return false;
    const requested = finiteWholePickupAmount(pk && pk.data && pk.data.amount);
    if (requested <= 0) {
      // Invalid physical quantities are quarantined without publishing a collectible event. Leaving
      // Infinity/NaN/missing amounts alive would create an inexhaustible overlap source.
      clearPickupAcceptanceRetry(pk && pk.data);
      pk.alive = false;
      return false;
    }
    const payload = emitPickupCollected(bus, pk, col);
    const acceptance = resolvePickupAcceptance(payload, requested);
    if (acceptance.rejected <= 0) {
      pk.alive = false;
    } else if (acceptance.accepted > 0) {
      pk.data = pk.data || {};
      pk.data.amount = acceptance.rejected;
    }
    if (acceptance.rejected > 0) {
      pk.data = pk.data || {};
      const ownerRetryAt = Number(payload.acceptanceRetryAt);
      setPickupAcceptanceRetry(
        pk.data,
        col && col.id,
        Number.isFinite(ownerRetryAt)
          ? ownerRetryAt
          : (state.simTime || 0) + PICKUP_ACCEPTANCE_RETRY_S,
      );
    } else if (pk.data) {
      clearPickupAcceptanceRetry(pk.data);
    }
    if (acceptance.accepted > 0 || acceptance.legacyFullConsume) this._diag.pickupCollections++;
    return acceptance.accepted > 0 || acceptance.legacyFullConsume;
  },

  _updateSg02DynamicAuthority(dt, state) {
    this._disableRapierBackend();
    this._diag.backend = 'rapier-dynamic';
    if (!this._sg02Init && !this._sg02) {
      const token = ++this._sg02Token;
      this._sg02Init = createSg02DynamicBodyOwner({
        mode: 'rapier-dynamic',
        captureContactImpacts: combatFlag('weaponImpulseConsequences'),
        publishTelemetry: shouldPublishSg02Telemetry(state),
        frameOrigin: worldFrameOrigin(state),
        frameOriginSeq: worldFrameOriginSeq(state),
      })
        .then((owner) => {
          const currentBackend = state.settings && state.settings.gameplay && state.settings.gameplay.physicsBackend;
          if (token !== this._sg02Token || currentBackend !== 'rapier-dynamic') {
            if (owner && typeof owner.dispose === 'function') owner.dispose();
            return null;
          }
          this._sg02 = owner;
          this._syncSg02FrameOrigin(state);
          return owner;
        })
        .catch((err) => {
          if (token === this._sg02Token) {
            console.warn('[physics] SG-02 dynamic authority failed; craft motion is fail-closed', err);
            this._sg02 = null;
            this._sg02Init = null;
          }
          return null;
        });
    }

    if (!this._sg02) {
      this._diag.rapierReady = false;
      this._diag.sg02Ready = false;
      this._diag.sg02Bodies = 0;
      this._diag.sg02DynamicBodies = 0;
      this._diag.sg02Attachments = 0;
      this._diag.sg02SyncMode = 'none';
      this._diag.sg02SyncFullEntities = 0;
      this._diag.sg02SyncStaticEntities = 0;
      this._diag.sg02SyncDynamicEntities = 0;
      return;
    }

    this._sg02.publishTelemetry = shouldPublishSg02Telemetry(state);
    this._syncSg02FrameOrigin(state);
    this._syncSg02DynamicAuthorityEntities(state);
    this._reconcileCombatPhysicsBeforeStep();
    const sdiag = this._sg02.step(dt);
    const sg02ImpactCount = this._emitSg02ContactImpacts(state);
    this._diag.rapierReady = true;
    this._diag.sg02Ready = true;
    this._diag.bodies = sdiag.bodies;
    this._diag.colliders = Number.isFinite(sdiag.colliders) ? sdiag.colliders : sdiag.bodies;
    this._diag.ccdBodies = sdiag.ccdBodies || 0;
    this._diag.rapierContacts = sg02ImpactCount;
    this._diag.rapierEvents = sg02ImpactCount;
    this._diag.sg02Bodies = sdiag.bodies;
    this._diag.sg02DynamicBodies = sdiag.dynamicBodies || 0;
    this._diag.sg02Attachments = sdiag.attachments || 0;
    this._diag.sg02SyncMode = sdiag.syncMode || 'none';
    this._diag.sg02SyncFullEntities = sdiag.syncFullEntities || 0;
    this._diag.sg02SyncStaticEntities = sdiag.syncStaticEntities || 0;
    this._diag.sg02SyncDynamicEntities = sdiag.syncDynamicEntities || 0;
  },

  _emitSg02ContactImpacts(state) {
    if (!this._sg02 || typeof this._sg02.drainContactImpacts !== 'function') return 0;
    const receipts = this._sg02.drainContactImpacts();
    if (!Array.isArray(receipts) || !receipts.length) return 0;
    let emitted = 0;
    for (const receipt of receipts) {
      const a = state.entities && state.entities.get ? state.entities.get(receipt.aId) : null;
      const b = state.entities && state.entities.get ? state.entities.get(receipt.bId) : null;
      if (!a || !b || a.alive === false || b.alive === false) continue;
      const material = pairMaterialInto(this._pairMaterialScratch, a, b);
      const dp = emitPhysicsImpact(this.bus, state, a, b, receipt.impulse, material, receipt.pos, {
        backend: 'rapier-dynamic',
        // Owner tick is lifetime-local and restarts whenever SG-02 is rebuilt. Consequence
        // provenance/status expiry belongs to the canonical simulation tick.
        tick: state.tick,
        normal: receipt.normal,
        causalActorId: receipt.causalActorId,
      });
      if (dp > 0) emitted++;
    }
    return emitted;
  },

  _syncSg02FrameOrigin(state) {
    if (!this._sg02 || typeof this._sg02.setFrameOrigin !== 'function') return false;
    return this._sg02.setFrameOrigin(worldFrameOrigin(state), worldFrameOriginSeq(state));
  },

  _resetSg02AfterLoad() {
    this._disableSg02DynamicAuthority();
    // Entity restore rebuilds station/gate objects while UI docking alerts were cleared by the
    // previous dock. Reset edge caches so the first post-load physics step re-emits range=true
    // even when the rematerialized structural entity keeps the same stable station/gate id.
    this._dockStationId = null;
    this._gateEntityId = null;
    // The respawn also swapped every persistent entity object for a fresh one at the same tick.
    // Drop the cached activity classification so the next sync layers read live entities instead
    // of scratch arrays holding retired (alive=false) references — same ids and counts would
    // otherwise never bump physicsStaticVersion and the statics would never reconcile.
    resetActivityRuntimeForRestore(this.state);
    if (this.state) this._publishRuntime(this.state);
  },

  _syncSg02DynamicAuthorityEntities(state) {
    const activity = ensureActivityClassified(state);
    if (activity && this._diag) {
      this._diag.activityS0 = activity.counts.s0;
      this._diag.activityS1 = activity.counts.s1;
      this._diag.activityS2 = activity.counts.s2;
      this._diag.activityS3 = activity.counts.s3;
      this._diag.activityPhysicsBodies = activity.counts.physics;
    }
    if (this._sg02 && typeof this._sg02.syncFromEntityLayers === 'function' && activity) {
      this._sg02.syncFromEntityLayers(
        activity.physicsStatics,
        activity.physicsDynamics,
        activity.physicsStaticVersion || 0,
        null,
      );
      return;
    }
    this._sg02.syncFromEntities(state.entityList);
  },

  _disableSg02DynamicAuthority() {
    if (this._sg02 || this._sg02Init) this._sg02Token++;
    if (this._sg02 && typeof this._sg02.dispose === 'function') this._sg02.dispose();
    this._sg02 = null;
    this._sg02Init = null;
    this._diag.sg02Ready = false;
    this._diag.sg02Bodies = 0;
    this._diag.sg02DynamicBodies = 0;
    this._diag.sg02Attachments = 0;
    this._diag.sg02SyncMode = 'none';
    this._diag.sg02SyncFullEntities = 0;
    this._diag.sg02SyncStaticEntities = 0;
    this._diag.sg02SyncDynamicEntities = 0;
  },

  _reconcileCombatPhysicsBeforeStep() {
    const reconcile = this.helpers && this.helpers.reconcileCombatPhysicsAttachments;
    if (typeof reconcile === 'function') reconcile();
  },

  integrate(dt, state) {
    const b = state.bounds;
    for (const e of physicsMovableEntities(state)) {
      if (!e.alive) continue;
      // sector soft boundary: gentle inward acceleration past the soft radius
      if (e.type === 'ship' && b) {
        const dx = e.pos.x - b.center.x, dz = e.pos.z - b.center.z;
        const d = Math.hypot(dx, dz);
        if (d > b.radius) {
          const over = (d - b.radius) / Math.max(1, b.hardRadius - b.radius);
          const k = 60 * Math.min(1, over);
          e.vel.x -= (dx / d) * k * dt;
          e.vel.z -= (dz / d) * k * dt;
        }
      }
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      // NOTE: e.rot is NOT integrated here. Rotation (yaw + bank) is fully owned by flight.js
      // (Phase 1 fix: the old `e.rot += e.angVel*dt` here double-applied rotation, since flight
      // already advanced e.rot). Projectiles set their own rot in weapons/spawn; flight sets ships'.
    }
  },

  collide(dt, state) {
    const bus = this.bus;
    const out = this._scratch;
    const stamp = this._nextPairStamp();
    const source = (state.entityIndex && state.entityIndex.collidables) || state.entityList;
    for (const a of source) {
      if (!a.alive || !a.collides) continue;
      if (!shouldStartBroadphasePairSearch(a)) continue;
      out.length = 0;
      state.spatialHash.queryRadius(a.pos.x, a.pos.z, a.radius + 4, out);
      for (const bEnt of out) {
        if (!a.alive) break;
        if (bEnt === a || !bEnt.alive || !bEnt.collides) continue;
        if (!(a.collisionMask & maskOf(bEnt)) && !(bEnt.collisionMask & maskOf(a))) continue;
        if (this._pairSeen(a.id, bEnt.id, stamp)) continue;
        if (!a.alive || !bEnt.alive) continue;
        let dx = bEnt.pos.x - a.pos.x, dz = bEnt.pos.z - a.pos.z;
        const rsum = a.radius + bEnt.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > rsum * rsum) continue;
        let dist = Math.sqrt(d2);
        if (d2 <= DEGENERATE_SEP2) {
          dist = dist || DEGENERATE_SEP_CLAMP;
          const n = fallbackContactNormalInto(a, bEnt, _contactNormalScratch);
          dx = n.x * dist;
          dz = n.z * dist;
        }
        this.resolvePair(a, bEnt, dist, dx, dz, bus, state);
      }
    }
  },

  sweepShipStatics(dt, state) {
    const out = this._scratch;
    const useHash = hasActiveSpatialHash(state.spatialHash);
    const statics = this._statics;
    if (!useHash) {
      statics.length = 0;
      const source = (state.entityIndex && state.entityIndex.statics) || state.entityList;
      for (const e of source) {
        if (e.alive && e.collides && (e.type === 'asteroid' || e.type === 'station')) statics.push(e);
      }
      if (!statics.length) return;
    }
    const ships = (state.entityIndex && state.entityIndex.shipLike) || state.entityList;
    for (const ship of ships) {
      if (!ship.alive || !ship.collides || (ship.type !== 'ship' && ship.type !== 'drone')) continue;
      const start = previousPosInto(this._prevPosScratch, ship, dt);
      const end = ship.pos;
      let candidates = statics;
      if (useHash) {
        const sweepRadius = Math.hypot(end.x - start.x, end.z - start.z) * 0.5 + (ship.radius || 0);
        out.length = 0;
        state.spatialHash.queryRadius((start.x + end.x) * 0.5, (start.z + end.z) * 0.5, sweepRadius, out);
        candidates = out;
      }
      let bestTarget = null;
      const hit = this._segmentHitScratch;
      const bestHit = this._bestSegmentHitScratch;
      for (const target of candidates) {
        if (!target.alive || !target.collides || (target.type !== 'asteroid' && target.type !== 'station')) continue;
        if (target === ship || (!canCollide(ship, target) && !canCollide(target, ship))) continue;
        if (!segmentCircleHitInto(hit, start, end, target.pos, (ship.radius || 0) + (target.radius || 0))) continue;
        if (!bestTarget || hit.t < bestHit.t) {
          bestTarget = target;
          copySegmentHit(bestHit, hit);
        }
      }
      if (!bestTarget) continue;
      const nx = bestHit.nx, nz = bestHit.nz;
      const skin = 0.01;
      const nextX = bestHit.x + nx * skin;
      const nextZ = bestHit.z + nz * skin;
      if (useHash && spatialCellSpanChanged(state.spatialHash, ship, nextX, nextZ)) {
        this._spatialHashNeedsRebuild = true;
      }
      ship.pos.x = nextX;
      ship.pos.z = nextZ;
      applySurfaceResponse(ship, nx, nz, materialFor(bestTarget));
      this._diag.sweptShipContacts++;
    }
  },

  sweepProjectiles(dt, state) {
    const out = this._scratch;
    const useHash = hasActiveSpatialHash(state.spatialHash);
    const projectiles = (state.entityIndex && state.entityIndex.projectiles) || state.entityList;
    for (const proj of projectiles) {
      if (!proj.alive || proj.type !== 'projectile' || !proj.collides) continue;
      const start = previousPosInto(this._prevPosScratch, proj, dt);
      const limit = this._projectileSweepLimitScratch;
      if (!projectileSweepLimitInto(limit, proj, start, proj.pos)) {
        proj.alive = false;
        continue;
      }
      const end = limit;
      let candidates = (state.entityIndex && state.entityIndex.collidables) || state.entityList;
      if (useHash) {
        const sweepRadius = Math.hypot(end.x - start.x, end.z - start.z) * 0.5 + (proj.radius || 0);
        out.length = 0;
        state.spatialHash.queryRadius((start.x + end.x) * 0.5, (start.z + end.z) * 0.5, sweepRadius, out);
        candidates = out;
      }
      let bestTarget = null;
      const hit = this._segmentHitScratch;
      const bestHit = this._bestSegmentHitScratch;
      for (const tgt of candidates) {
        if (!tgt.alive || tgt === proj || !tgt.collides || tgt.type === 'projectile') continue;
        if (proj.ownerId === tgt.id) continue;
        if (!canCollide(proj, tgt) && !canCollide(tgt, proj)) continue;
        if (!segmentCircleHitInto(hit, start, end, tgt.pos, (proj.radius || 0) + (tgt.radius || 0))) continue;
        if (!bestTarget || hit.t < bestHit.t) {
          bestTarget = tgt;
          copySegmentHit(bestHit, hit);
        }
      }
      if (!bestTarget) {
        this._considerProjectileNearMiss(proj, start, end, state);
        if (limit.expired) {
          proj.pos.x = end.x;
          proj.pos.z = end.z;
          proj.alive = false;
        }
        continue;
      }
      proj.pos.x = bestHit.x;
      proj.pos.z = bestHit.z;
      this.bus.emit('projectile:hit', projectileHitPayload(proj, bestTarget, { x: proj.pos.x, z: proj.pos.z }));
      proj.alive = false;
      this._diag.sweptProjectileHits++;
    }
  },

  _considerProjectileNearMiss(proj, start, end, state) {
    if (!this.bus || this._nearMissEmitted.has(proj)) return;
    const player = state && state.entities && state.entities.get(state.playerId);
    if (!player || !player.alive || !player.pos || proj.ownerId === player.id) return;
    if (proj.team != null && player.team != null && proj.team === player.team) return;
    const hitRadius = (proj.radius || 0) + (player.radius || 0);
    const closest = closestPointOnSegmentInto(this._nearMissClosestScratch, start, end, player.pos);
    if (closest.distance <= hitRadius || closest.distance > hitRadius + PLAYER_PROJECTILE_NEAR_MISS_MARGIN) return;
    this._nearMissEmitted.add(proj);
    const pd = proj.data || {};
    this.bus.emit('projectile:nearMiss', {
      projectileId: proj.id,
      ownerId: proj.ownerId == null ? null : proj.ownerId,
      targetId: player.id,
      weaponId: pd.weaponId || null,
      damageType: pd.damageType || 'kinetic',
      distance: closest.distance,
      pos: { x: closest.x, z: closest.z },
      direction: segmentDirection(start, end),
      tick: Number.isFinite(state.tick) ? state.tick | 0 : 0,
    });
    this._diag.nearMissReceipts++;
  },

  resolvePair(a, b, dist, dx, dz, bus, state) {
    const ta = a.type, tb = b.type;
    // projectile hits
    if (ta === 'projectile' || tb === 'projectile') {
      const proj = ta === 'projectile' ? a : b;
      const tgt = ta === 'projectile' ? b : a;
      if (tgt.type === 'projectile') return;
      if (proj.ownerId === tgt.id) return; // never hit owner
      bus.emit('projectile:hit', projectileHitPayload(proj, tgt, { x: proj.pos.x, z: proj.pos.z }));
      proj.alive = false;
      return;
    }
    // pickups
    if (ta === 'pickup' || tb === 'pickup') {
      const pk = ta === 'pickup' ? a : b;
      const col = ta === 'pickup' ? b : a;
      if (col.type !== 'ship' && col.type !== 'drone') return;
      this._applyPickupCollection(pk, col, bus, state);
      return;
    }
    // station hull contact — soft, no physical push. Dock-range enter/exit is tracked once per
    // frame in updateDockRange() so the UI receives both true and false transitions.
    if (ta === 'station' || tb === 'station') {
      // soft bounce off station hull
      const material = pairMaterialInto(this._pairMaterialScratch, a, b);
      const n = contactNormalInto(a, b, dist, dx, dz, _contactNormalScratch);
      const nx = n.x, nz = n.z;
      const impactOptions = directContactImpactOptions(this._impactOptionsScratch, state, a, b, nx, nz);
      pushApart(a, b, dist, dx, dz, material.push);
      const impulseMag = impulse(a, b, nx, nz, material);
      emitPhysicsImpact(bus, state, a, b, impulseMag, material, { x: a.pos.x, z: a.pos.z }, impactOptions);
      return;
    }
    // ship/ship and ship/asteroid: separate + restitution impulse
    const material = pairMaterialInto(this._pairMaterialScratch, a, b);
    const n = contactNormalInto(a, b, dist, dx, dz, _contactNormalScratch);
    const nx = n.x, nz = n.z;
    const impactOptions = directContactImpactOptions(this._impactOptionsScratch, state, a, b, nx, nz);
    pushApart(a, b, dist, dx, dz, material.push);
    const impulseMag = impulse(a, b, nx, nz, material);
    const impactDp = emitPhysicsImpact(bus, state, a, b, impulseMag, material, { x: a.pos.x, z: a.pos.z }, impactOptions);
    bus.emit('collision', {
      aId: a.id,
      bId: b.id,
      impulse: Math.max(0.1, impulseMag * material.impactScale * 0.01),
      dp: impactDp,
      pos: { x: a.pos.x, z: a.pos.z },
    });
  },

  updateDockRange(state) {
    const player = state.entities.get(state.playerId);
    let nextStationId = null;
    let nextDist = Infinity;
    let nextGate = null;
    let nextGateDist = Infinity;

    if (player && player.alive) {
      const stations = (state.entityIndex && state.entityIndex.stations) || state.entityList;
      const playerSpeed = Math.hypot(
        player.vel && Number.isFinite(player.vel.x) ? player.vel.x : 0,
        player.vel && Number.isFinite(player.vel.z) ? player.vel.z : 0,
      );
      for (const st of stations) {
        if (!st.alive || st.type !== 'station') continue;
        const data = st.data || {};
        if (data.isGate) {
          const range = ((data.dockRadius || st.radius || 80) + (player.radius || 0)) * 1.5;
          const d = Math.hypot(st.pos.x - player.pos.x, st.pos.z - player.pos.z);
          if (d <= range + 28 && d < nextGateDist) {
            nextGateDist = d;
            nextGate = st;
          }
          continue;
        }
        if (!data.stationId) continue;
        // PQ-008 truthful exterior docking: stations declaring a collisionProxyManifest dock at
        // their berth, not at a forgiving center radius. The berth gate requires proximity AND a
        // slow approach; everything else about the dock:range seam is unchanged.
        const manifest = resolveCollisionProxyManifest(st);
        if (manifest && manifest.docking) {
          const berth = resolveBerthWorld(st, manifest);
          const dBerth = Math.hypot(berth.x - player.pos.x, berth.z - player.pos.z);
          if (dBerth <= manifest.docking.berth.dockRadius && playerSpeed <= manifest.docking.berth.speedGate && dBerth < nextDist) {
            nextDist = dBerth;
            nextStationId = data.stationId;
          }
          continue;
        }
        const range = ((data.dockRadius || st.radius || 80) + (player.radius || 0)) * 1.5;
        const d = Math.hypot(st.pos.x - player.pos.x, st.pos.z - player.pos.z);
        if (d <= range && d < nextDist) {
          nextDist = d;
          nextStationId = data.stationId;
        }
      }
    }

    if (nextStationId !== this._dockStationId) {
      if (this._dockStationId) {
        this.bus.emit('dock:range', { stationId: this._dockStationId, shipId: state.playerId, inRange: false });
      }
      this._dockStationId = nextStationId;
      if (nextStationId) {
        this.bus.emit('dock:range', { stationId: nextStationId, shipId: state.playerId, inRange: true });
      }
    }

    const nextGateId = nextGate ? nextGate.id : null;
    if (nextGateId !== this._gateEntityId) {
      if (this._gateEntityId) this.bus.emit('gate:range', { gateId: this._gateEntityId, shipId: state.playerId, inRange: false });
      this._gateEntityId = nextGateId;
      if (nextGate) {
        const data = nextGate.data || {};
        this.bus.emit('gate:range', {
          gateId: nextGate.id,
          shipId: state.playerId,
          inRange: true,
          gateTo: data.gateTo || null,
          name: data.name || 'Jump Gate',
        });
      }
    }
  },

  _syncOptionalBackend(dt, state) {
    const backend = state.settings && state.settings.gameplay && state.settings.gameplay.physicsBackend;
    this._diag.backend = backend === 'rapier' ? 'rapier' : 'custom';
    if (backend !== 'rapier') {
      this._disableRapierBackend();
      return;
    }
    if (!this._rapierInit) {
      const token = ++this._rapierToken;
      this._rapierInit = import('./rapierCollisionWorld.js')
        .then((m) => m.createRapierCollisionWorld())
        .then((backendWorld) => {
          const currentBackend = state.settings && state.settings.gameplay && state.settings.gameplay.physicsBackend;
          if (token !== this._rapierToken || currentBackend !== 'rapier') {
            if (backendWorld && typeof backendWorld.dispose === 'function') backendWorld.dispose();
            return null;
          }
          this._rapier = backendWorld;
          return backendWorld;
        })
        .catch((err) => {
          if (token === this._rapierToken) {
            console.warn('[physics] Rapier backend failed; falling back to custom collision', err);
            this._rapier = null;
            this._rapierInit = null;
            this._diag.backend = 'custom';
          }
          return null;
        });
    }
    if (!this._rapier) return;
    this._rapier.syncFromEntities(state.entityList);
    this._rapier.step(dt);
    const rdiag = this._rapier.diagnostics();
    this._diag.rapierReady = true;
    this._diag.bodies = rdiag.bodies;
    this._diag.colliders = rdiag.colliders;
    this._diag.ccdBodies = rdiag.ccdBodies || 0;
    this._diag.rapierContacts = rdiag.contacts || 0;
    this._diag.rapierEvents = rdiag.collisionEvents || 0;
  },

  _disableRapierBackend() {
    if (this._rapier || this._rapierInit) this._rapierToken++;
    if (this._rapier && typeof this._rapier.dispose === 'function') this._rapier.dispose();
    this._rapier = null;
    this._rapierInit = null;
    this._diag.rapierReady = false;
    this._diag.bodies = 0;
    this._diag.colliders = 0;
    this._diag.ccdBodies = 0;
    this._diag.rapierContacts = 0;
    this._diag.rapierEvents = 0;
  },

  _nextPairStamp() {
    let stamp = this._pairStamp + 1;
    if (stamp > 0x7fffffff) {
      this._pairMarks.clear();
      stamp = 1;
    }
    this._pairStamp = stamp;
    return stamp;
  },

  _pairSeen(aId, bId, stamp) {
    const lo = aId < bId ? aId : bId;
    const hi = aId < bId ? bId : aId;
    let row = this._pairMarks.get(lo);
    if (!row) { row = new Map(); this._pairMarks.set(lo, row); }
    if (row.get(hi) === stamp) return true;
    row.set(hi, stamp);
    return false;
  },
};

function usesSg02DynamicAuthority(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  return gameplay && gameplay.physicsBackend === 'rapier-dynamic';
}

function worldFrameOrigin(state) {
  const origin = state && state.world && state.world.frameOrigin;
  return origin && typeof origin === 'object' ? origin : ZERO_FRAME_ORIGIN;
}

function worldFrameOriginSeq(state) {
  const seq = state && state.world && state.world.frameOriginSeq;
  return Number.isSafeInteger(seq) && seq >= 0 ? seq : 0;
}

/**
 * Broad-phase membership is the same causal active set as Rapier. Far dormant
 * colliders stay in entityList; they are not hashed, queried, or solved.
 */
export function spatialHashLayersFromState(state) {
  const activity = ensureActivityClassified(state);
  if (activity && Array.isArray(activity.physicsStatics) && Array.isArray(activity.physicsDynamics)) {
    return {
      statics: activity.physicsStatics,
      dynamics: activity.physicsDynamics,
      staticVersion: activity.physicsStaticVersion || 0,
    };
  }
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready &&
    Array.isArray(index.spatialStatics) && Array.isArray(index.spatialDynamics)) {
    return {
      statics: index.spatialStatics,
      dynamics: index.spatialDynamics,
      staticVersion: index.spatialStaticVersion || 0,
    };
  }
  return null;
}

function shouldMaintainDynamicSpatialHash(state) {
  const index = state && state.entityIndex;
  if (!index || !index.__spacefaceEntityIndexV1) return true;
  const collidables = Array.isArray(index.collidables) ? index.collidables.length : 0;
  const asteroids = Array.isArray(index.asteroids) ? index.asteroids.length : 0;
  return collidables >= DYNAMIC_SPATIAL_QUERY_MIN_COLLIDABLES ||
    asteroids >= DYNAMIC_SPATIAL_QUERY_MIN_ASTEROIDS;
}

function shouldUsePickupSpatialQuery(state, pickups, collectors) {
  return hasActiveSpatialHash(state && state.spatialHash) &&
    pickups.length * collectors.length >= PICKUP_SPATIAL_PAIR_THRESHOLD;
}

function isLivePickup(e) {
  return !!(e && e.alive && e.collides && e.type === 'pickup' && e.pos);
}

function isPickupCollector(e) {
  return !!(e && e.alive && e.collides && (e.type === 'ship' || e.type === 'drone') && e.pos);
}

function maxLivePickupRadius(pickups) {
  let radius = 0;
  for (const pk of pickups) {
    if (isLivePickup(pk) && (pk.radius || 0) > radius) radius = pk.radius || 0;
  }
  return radius;
}

function maxLiveCollectorRadius(collectors) {
  let radius = 0;
  for (const col of collectors) {
    if (isPickupCollector(col) && (col.radius || 0) > radius) radius = col.radius || 0;
  }
  return radius;
}

function shouldPublishSg02Snapshot(state) {
  if (typeof window === 'undefined') return true;
  const runtime = state && state.physicsRuntime;
  return !!(runtime && runtime.publishSg02Snapshot === true)
    || window.__SF_PUBLISH_SG02_SNAPSHOT__ === true;
}

function shouldPublishSg02Telemetry(state) {
  if (typeof window === 'undefined') return true;
  const runtime = state && state.physicsRuntime;
  return !!(runtime && runtime.publishSg02Telemetry === true)
    || window.__SF_PUBLISH_SG02_TELEMETRY__ === true;
}

function physicsMovableEntities(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.movables) return index.movables;
  return (state && state.entityList) || [];
}

function spatialCellSpanChanged(hash, entity, nextX, nextZ) {
  if (!hash || !entity || !entity.pos) return true;
  const cell = Number.isFinite(hash.cell) && hash.cell > 0 ? hash.cell : 64;
  const radius = entity.radius || 0;
  const beforeX0 = Math.floor((entity.pos.x - radius) / cell);
  const beforeX1 = Math.floor((entity.pos.x + radius) / cell);
  const beforeZ0 = Math.floor((entity.pos.z - radius) / cell);
  const beforeZ1 = Math.floor((entity.pos.z + radius) / cell);
  const afterX0 = Math.floor((nextX - radius) / cell);
  const afterX1 = Math.floor((nextX + radius) / cell);
  const afterZ0 = Math.floor((nextZ - radius) / cell);
  const afterZ1 = Math.floor((nextZ + radius) / cell);
  return beforeX0 !== afterX0 || beforeX1 !== afterX1 || beforeZ0 !== afterZ0 || beforeZ1 !== afterZ1;
}

function createDeferredSg02CombatPhysicsPort(host) {
  const owner = () => host && host._sg02;
  return Object.freeze({
    applyImpulse(input) {
      const runtime = owner();
      return runtime ? runtime.applyImpulse(input) : false;
    },
    applyTorqueImpulse(input) {
      const runtime = owner();
      return runtime ? runtime.applyTorqueImpulse(input) : false;
    },
    createAttachment(input) {
      const runtime = owner();
      return runtime ? runtime.createAttachment(input) : false;
    },
    setAttachmentReel(input) {
      const runtime = owner();
      return runtime ? runtime.setAttachmentReel(input) : false;
    },
    cutAttachment(input) {
      const runtime = owner();
      return runtime ? runtime.cutAttachment(input) : false;
    },
    getAttachmentTelemetry(input) {
      const runtime = owner();
      return runtime ? runtime.getAttachmentTelemetry(input) : null;
    },
  });
}

const MINE_COLLISION_CATEGORY = 1 << 8;

function maskOf(e) {
  switch (e.type) {
    case 'ship': return Masks.SHIP;
    case 'asteroid': return Masks.ASTEROID;
    case 'station': return Masks.STATION;
    case 'projectile': return Masks.PROJECTILE;
    case 'pickup': return Masks.PICKUP;
    case 'drone': return Masks.DRONE;
    case 'payload': return Masks.PAYLOAD;
    case 'wreck': return Masks.WRECK;
    case 'mine': return MINE_COLLISION_CATEGORY;
    // PQ-011: anchor seeds share the deployed-device category — projectile sweeps/hits resolve
    // (the seed spawns with collisionMask PROJECTILE), ships never broadphase against it.
    case 'massSeed': return MINE_COLLISION_CATEGORY;
    case 'masslineSnareAnchor': return MINE_COLLISION_CATEGORY;
    default: return 0;
  }
}

function canCollide(a, b) {
  return !!(a.collisionMask & maskOf(b));
}

function shouldStartBroadphasePairSearch(e) {
  return e.type !== 'station' && e.type !== 'asteroid' && e.type !== 'wreck' && e.type !== 'pickup';
}

export function projectileHitPayload(proj, targetOrId, pos) {
  const pd = proj.data || {};
  const target = targetOrId && typeof targetOrId === 'object' ? targetOrId : null;
  const targetId = target ? target.id : targetOrId;
  const velocityX = Number(proj.vel && proj.vel.x);
  const velocityZ = Number(proj.vel && proj.vel.z);
  const rotation = Number(proj.rot) || 0;
  const vx = Number.isFinite(velocityX) ? velocityX : Math.cos(rotation);
  const vz = Number.isFinite(velocityZ) ? velocityZ : Math.sin(rotation);
  const speed = Math.hypot(vx, vz) || 1;
  const approach = { x: vx / speed, z: vz / speed };
  let nx = target && target.pos ? Number(pos.x) - Number(target.pos.x) : -approach.x;
  let nz = target && target.pos ? Number(pos.z) - Number(target.pos.z) : -approach.z;
  const normalLength = Math.hypot(nx, nz);
  if (normalLength > 1e-8) {
    nx /= normalLength;
    nz /= normalLength;
  } else {
    nx = -approach.x;
    nz = -approach.z;
  }
  const normal = { x: nx, z: nz };
  const payload = {
    targetId,
    ownerId: proj.ownerId,
    damage: pd.damage || 0,
    damageType: pd.damageType || 'kinetic',
    pos,
    approach,
    normal,
  };
  if (pd.weaponId != null) payload.weaponId = pd.weaponId;
  if (pd.damagePacket) payload.damagePacket = cloneDamagePacketWithHit(pd.damagePacket, pos, approach, normal);
  return payload;
}

function cloneDamagePacketWithHit(packet, pos, approach, normal) {
  const out = {
    ...packet,
    channels: { ...(packet.channels || {}) },
    statuses: (packet.statuses || []).map((status) => ({ ...status })),
    flags: packet.flags ? { ...packet.flags } : undefined,
    source: packet.source ? { ...packet.source } : undefined,
    hit: {
      ...(packet.hit || {}),
      pos: { x: Number(pos.x) || 0, z: Number(pos.z) || 0 },
      approach: { ...approach },
      normal: { ...normal },
    },
  };
  if (packet.impulse) out.impulse = { ...packet.impulse };
  return out;
}

function emitPickupCollected(bus, pk, col) {
  const d = pk.data || {};
  const payload = {
    pickupId: pk.id,
    collectorId: col.id,
    kind: d.kind,
    amount: d.amount,
    commodityId: d.commodityId,
    pos: { x: pk.pos.x, z: pk.pos.z },
  };
  bus.emit('pickup:collected', payload);
  return payload;
}

function invMass(e) { return (e.type === 'station' || e.type === 'asteroid') ? 0 : 1 / Math.max(0.1, e.mass); }

function materialFor(e) {
  return COLLISION_MATERIALS[e.type] || DEFAULT_MATERIAL;
}

function createPairMaterialRecord() {
  return {
    push: DEFAULT_MATERIAL.push,
    restitution: DEFAULT_MATERIAL.restitution,
    tangentDamping: DEFAULT_MATERIAL.tangentDamping,
    impactScale: DEFAULT_MATERIAL.impactScale,
  };
}

function pairMaterialInto(out, a, b) {
  const ma = materialFor(a);
  const mb = materialFor(b);
  out.push = Math.min(ma.push, mb.push);
  out.restitution = Math.min(ma.restitution, mb.restitution);
  out.tangentDamping = Math.max(ma.tangentDamping, mb.tangentDamping);
  out.impactScale = Math.min(ma.impactScale, mb.impactScale);
  return out;
}

function applySurfaceResponse(e, nx, nz, material) {
  const rel = e.vel.x * nx + e.vel.z * nz;
  if (rel < 0) {
    e.vel.x -= nx * rel * (1 + material.restitution);
    e.vel.z -= nz * rel * (1 + material.restitution);
  }
  if (material.tangentDamping > 0) {
    const vt = e.vel.x * -nz + e.vel.z * nx;
    e.vel.x += nz * vt * material.tangentDamping;
    e.vel.z -= nx * vt * material.tangentDamping;
  }
}

function fallbackContactNormalInto(a, b, out) {
  const aIsLo = a.id < b.id;
  const lo = aIsLo ? a : b;
  const hi = aIsLo ? b : a;
  const rvx = ((hi.vel && hi.vel.x) || 0) - ((lo.vel && lo.vel.x) || 0);
  const rvz = ((hi.vel && hi.vel.z) || 0) - ((lo.vel && lo.vel.z) || 0);
  const rv2 = rvx * rvx + rvz * rvz;
  let nx = 1, nz = 0;
  if (rv2 > DEGENERATE_SEP2) {
    const inv = 1 / Math.sqrt(rv2);
    nx = rvx * inv;
    nz = rvz * inv;
  }
  if (!aIsLo) {
    nx = -nx;
    nz = -nz;
  }
  out.x = nx;
  out.z = nz;
  return out;
}

function contactNormalInto(a, b, dist, dx, dz, out) {
  const n2 = dx * dx + dz * dz;
  if (n2 <= DEGENERATE_SEP2) return fallbackContactNormalInto(a, b, out);
  out.x = dx / dist;
  out.z = dz / dist;
  return out;
}

function pushApart(a, b, dist, dx, dz, scale) {
  const pen = (a.radius + b.radius) - dist;
  if (pen <= 0) return;
  const ima = invMass(a), imb = invMass(b);
  const tot = ima + imb;
  if (tot === 0) return;
  const n = contactNormalInto(a, b, dist, dx, dz, _contactNormalScratch);
  const nx = n.x, nz = n.z;
  const push = pen * scale;
  a.pos.x -= nx * push * (ima / tot); a.pos.z -= nz * push * (ima / tot);
  b.pos.x += nx * push * (imb / tot); b.pos.z += nz * push * (imb / tot);
}

function impulse(a, b, nx, nz, material) {
  const ima = invMass(a), imb = invMass(b);
  const tot = ima + imb;
  if (tot === 0) return 0;
  const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
  const relN = rvx * nx + rvz * nz;
  if (relN > 0) return 0;
  const j = -(1 + material.restitution) * relN / tot;
  a.vel.x -= j * nx * ima; a.vel.z -= j * nz * ima;
  b.vel.x += j * nx * imb; b.vel.z += j * nz * imb;
  if (material.tangentDamping > 0) {
    const tx = -nz, tz = nx;
    const relT = rvx * tx + rvz * tz;
    const jt = -relT * material.tangentDamping / tot;
    a.vel.x -= jt * tx * ima; a.vel.z -= jt * tz * ima;
    b.vel.x += jt * tx * imb; b.vel.z += jt * tz * imb;
  }
  return Math.abs(j);
}

function emitPhysicsImpact(bus, state, a, b, impulseMag, material, pos, options = {}) {
  if (!bus || typeof bus.emit !== 'function') return 0;
  const dp = Math.max(0, finiteOrZero(impulseMag) * Math.max(0, finiteOrZero(material && material.impactScale) || 1));
  if (!(dp > 0)) return 0;
  const trauma = Math.min(0.5, dp / 8000);
  const playerId = state && state.playerId;
  const playerInvolved = playerId != null && (a.id === playerId || b.id === playerId);
  let playerDeltaV = 0;
  if (playerInvolved) {
    const player = a.id === playerId ? a : b;
    playerDeltaV = dp / Math.max(0.1, finiteOrZero(player && player.mass) || 1);
  }
  bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    backend: String(options.backend || 'custom'),
    tick: Number.isFinite(options.tick) ? Math.max(0, Math.trunc(options.tick)) : Math.max(0, Math.trunc(state && state.tick || 0)),
    aId: a.id,
    bId: b.id,
    dp,
    trauma,
    impulse: finiteOrZero(impulseMag),
    playerInvolved,
    playerDeltaV,
    causalActorId: options.causalActorId == null ? null : options.causalActorId,
    pos: { x: finiteOrZero(pos && pos.x), z: finiteOrZero(pos && pos.z) },
    normal: normalizedPlanar(options.normal),
  });
  return dp;
}

function directContactImpactOptions(out, state, a, b, nx, nz) {
  out.tick = Math.max(0, Math.trunc(state && state.tick || 0));
  out.normal.x = nx;
  out.normal.z = nz;
  out.causalActorId = directContactCausalActorId(
    a.id,
    b.id,
    a.vel && a.vel.x,
    a.vel && a.vel.z,
    b.vel && b.vel.x,
    b.vel && b.vel.z,
    nx,
    nz,
  );
  return out;
}

function normalizedPlanar(value) {
  const x = finiteOrZero(value && value.x);
  const z = finiteOrZero(value && value.z);
  const length = Math.hypot(x, z);
  return length > 1e-9 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function createSegmentHitRecord() {
  return { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0 };
}

function copySegmentHit(out, hit) {
  out.hit = hit.hit;
  out.t = hit.t;
  out.x = hit.x;
  out.z = hit.z;
  out.nx = hit.nx;
  out.nz = hit.nz;
  return out;
}

function previousPosInto(out, e, dt) {
  if (e.prevPos && Number.isFinite(e.prevPos.x) && Number.isFinite(e.prevPos.z)) return e.prevPos;
  out.x = e.pos.x - ((e.vel && e.vel.x) || 0) * dt;
  out.z = e.pos.z - ((e.vel && e.vel.z) || 0) * dt;
  return out;
}

function closestPointOnSegmentInto(out, start, end, point) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9
    ? clamp01(((point.x - start.x) * dx + (point.z - start.z) * dz) / len2)
    : 0;
  out.x = start.x + dx * t;
  out.z = start.z + dz * t;
  out.distance = Math.hypot(out.x - point.x, out.z - point.z);
  return out;
}

function segmentDirection(start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  return length > 1e-9 ? { x: dx / length, z: dz / length } : { x: 0, z: 0 };
}

function projectileSweepLimitInto(out, projectile, start, end) {
  const data = projectile && projectile.data || {};
  const origin = data.spawnPos || data.origin || null;
  const maxDistance = Number(data.maxDistance);
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z) || !(maxDistance > 0)) {
    out.x = end.x;
    out.z = end.z;
    out.expired = false;
    return true;
  }
  const sx = start.x - origin.x;
  const sz = start.z - origin.z;
  const ex = end.x - origin.x;
  const ez = end.z - origin.z;
  const max2 = maxDistance * maxDistance;
  if (sx * sx + sz * sz >= max2) return false;
  if (ex * ex + ez * ez <= max2) {
    out.x = end.x;
    out.z = end.z;
    out.expired = false;
    return true;
  }

  const dx = ex - sx;
  const dz = ez - sz;
  const a = dx * dx + dz * dz;
  if (a <= 1e-9) return false;
  const b = 2 * (sx * dx + sz * dz);
  const c = sx * sx + sz * sz - max2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  const t = t0 >= 0 && t0 <= 1 ? t0 : (t1 >= 0 && t1 <= 1 ? t1 : 1);
  out.x = start.x + (end.x - start.x) * t;
  out.z = start.z + (end.z - start.z) * t;
  out.expired = true;
  return true;
}

function segmentCircleHitInto(out, start, end, center, radius) {
  const sx = start.x, sz = start.z;
  const ex = end.x, ez = end.z;
  const dx = ex - sx, dz = ez - sz;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 0.000001) {
    const ox = sx - center.x, oz = sz - center.z;
    const d = Math.hypot(ox, oz) || 0.0001;
    if (d > radius) {
      out.hit = false;
      return false;
    }
    out.hit = true;
    out.t = 0;
    out.x = sx;
    out.z = sz;
    out.nx = ox / d;
    out.nz = oz / d;
    return true;
  }
  const relX = sx - center.x;
  const relZ = sz - center.z;
  const r2 = radius * radius;
  const startDist2 = relX * relX + relZ * relZ;
  if (startDist2 <= r2) {
    const d = Math.sqrt(startDist2);
    const len = Math.sqrt(len2);
    const nx = d > 0.0001 ? relX / d : -dx / len;
    const nz = d > 0.0001 ? relZ / d : -dz / len;
    out.hit = true;
    out.t = 0;
    out.x = center.x + nx * radius;
    out.z = center.z + nz * radius;
    out.nx = nx;
    out.nz = nz;
    return true;
  }

  const b = 2 * (relX * dx + relZ * dz);
  const c = startDist2 - r2;
  const disc = b * b - 4 * len2 * c;
  if (disc < 0) {
    out.hit = false;
    return false;
  }

  const sqrtDisc = Math.sqrt(disc);
  const invDenom = 1 / (2 * len2);
  let t = (-b - sqrtDisc) * invDenom;
  if (t < 0 || t > 1) {
    t = (-b + sqrtDisc) * invDenom;
    if (t < 0 || t > 1) {
      out.hit = false;
      return false;
    }
  }

  const x = sx + dx * t;
  const z = sz + dz * t;
  const ox = x - center.x, oz = z - center.z;
  const d = Math.hypot(ox, oz) || 0.0001;
  const nx = ox / d, nz = oz / d;
  out.hit = true;
  out.t = t;
  out.x = center.x + nx * radius;
  out.z = center.z + nz * radius;
  out.nx = nx;
  out.nz = nz;
  return true;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
