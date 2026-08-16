// PR95 Plan 19 — physical anomalies on existing simulation authorities.
//
// Gravity Eddy is an authored WELL registered into the shared fields kernel. Debris River is a
// finite line of ordinary dynamic wreck bodies stepped by Rapier. This adapter only authors and
// rematerializes those bodies; it never integrates their pose or applies a private force.
//
// The river's finite salvage custody lives in one hidden persistent entity. SaveSystem already owns
// persistent-entity serialization, Mining owns depletion and pickup creation, and Cargo owns pickup
// acceptance. Transient wrecks are reconstructed from that ledger on sector entry / Continue, so
// neither a lap nor a load can mint a fresh pool.

import {
  ASHFALL_DEBRIS_RIVER,
  ION_STORM_POCKET,
  ORCUS_DRIFTER_SHOAL,
  ORCUS_GRAVITY_EDDY,
  SCAVENGER_SWARM,
  anomalySiteForSector,
  debrisRiverForSector,
  drifterShoalForSector,
  ionStormForSector,
} from '../data/anomalySites.js';
import { fieldsFlag } from '../data/fields.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { SECTORS } from '../data/sectors.js';
import { SECTOR_ZONES } from '../data/sectorZones.js';
import { Masks } from '../core/entity.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { hash32 } from '../core/rng.js';

const LEDGER_SCHEMA = 1;
const LEDGER_KIND = 'anomaly_runtime_ledger';

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function whole(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function poolTotal(pool) {
  return Object.values(pool || {}).reduce((sum, qty) => sum + whole(qty), 0);
}

function normalizePool(input, authoredMax) {
  const out = {};
  const hasInput = !!input && typeof input === 'object' && !Array.isArray(input);
  for (const id of Object.keys(authoredMax || {}).sort()) {
    const max = whole(authoredMax[id]);
    const qty = clamp(whole(hasInput ? input[id] : max, hasInput ? 0 : max), 0, max);
    if (qty > 0) out[id] = qty;
  }
  return out;
}

function resolveAnchor(site) {
  const zones = site && SECTOR_ZONES[site.sectorId];
  const zone = Array.isArray(zones)
    ? zones.find((candidate) => candidate && candidate.id === site.zoneId)
    : null;
  if (!zone || !zone.center) return null;
  const global = sectorLocalToGlobalForSector(zone.center, site.sectorId);
  if (!global || !Number.isFinite(global.x) || !Number.isFinite(global.z)) return null;
  return { x: global.x, z: global.z };
}

function resolveZoneVolume(site) {
  const zones = site && SECTOR_ZONES[site.sectorId];
  const zone = Array.isArray(zones)
    ? zones.find((candidate) => candidate && candidate.id === site.zoneId)
    : null;
  if (!zone || !zone.center || !(finite(zone.radius) > 0)) return null;
  const global = sectorLocalToGlobalForSector(zone.center, site.sectorId);
  if (!global || !Number.isFinite(global.x) || !Number.isFinite(global.z)) return null;
  return Object.freeze({
    x: global.x,
    z: global.z,
    radius: zone.radius,
    zoneId: zone.id,
  });
}

function resolveRiverBasis(site) {
  if (!site) return null;
  const sector = SECTORS.find((candidate) => candidate && candidate.id === site.sectorId);
  const hazard = sector && Array.isArray(sector.hazards)
    ? sector.hazards.find((candidate) => candidate && candidate.type === site.hazard.type
      && finite(candidate.center && candidate.center.x) === site.hazard.center.x
      && finite(candidate.center && candidate.center.z) === site.hazard.center.z
      && finite(candidate.radius) === site.hazard.radius)
    : null;
  if (!hazard) return null;

  const start = sectorLocalToGlobalForSector(site.start, site.sectorId);
  const end = sectorLocalToGlobalForSector(site.end, site.sectorId);
  const dx = finite(end && end.x) - finite(start && start.x);
  const dz = finite(end && end.z) - finite(start && start.z);
  const length = Math.hypot(dx, dz);
  if (!(length > 1)) return null;
  const ux = dx / length;
  const uz = dz / length;
  return Object.freeze({
    start: Object.freeze({ x: start.x, z: start.z }),
    end: Object.freeze({ x: end.x, z: end.z }),
    length,
    ux,
    uz,
    nx: -uz,
    nz: ux,
  });
}

function initialBodyRecord(definition, site, basis) {
  const along = clamp(finite(definition.t), 0, 1) * basis.length;
  const lateral = finite(definition.lateral);
  return {
    id: definition.id,
    depleted: false,
    pool: normalizePool(definition.pool, definition.pool),
    salvageTimeLeft: site.salvageTimeS,
    carry: 0,
    total: poolTotal(definition.pool),
    laps: 0,
    pos: {
      x: basis.start.x + basis.ux * along + basis.nx * lateral,
      z: basis.start.z + basis.uz * along + basis.nz * lateral,
    },
    vel: { x: basis.ux * site.speed, z: basis.uz * site.speed },
  };
}

function normalizeBodyRecord(input, definition, site, basis) {
  const fallback = initialBodyRecord(definition, site, basis);
  const pool = normalizePool(input && input.pool, definition.pool);
  const depleted = !!(input && input.depleted) || poolTotal(pool) <= 0;
  const rawPos = input && input.pos;
  const px = finite(rawPos && rawPos.x, fallback.pos.x);
  const pz = finite(rawPos && rawPos.z, fallback.pos.z);
  const relX = px - basis.start.x;
  const relZ = pz - basis.start.z;
  const along = relX * basis.ux + relZ * basis.uz;
  const lateral = relX * basis.nx + relZ * basis.nz;
  const positionInBounds = along >= -site.wrapMargin * 2
    && along <= basis.length + site.wrapMargin * 2
    && Math.abs(lateral) <= site.hazard.radius * 2;

  let vx = finite(input && input.vel && input.vel.x, fallback.vel.x);
  let vz = finite(input && input.vel && input.vel.z, fallback.vel.z);
  const speed = Math.hypot(vx, vz);
  const maxSpeed = site.speed * 3;
  if (!(speed > 0.01)) {
    vx = fallback.vel.x;
    vz = fallback.vel.z;
  } else if (speed > maxSpeed) {
    vx = vx / speed * maxSpeed;
    vz = vz / speed * maxSpeed;
  }

  return {
    id: definition.id,
    depleted,
    pool,
    salvageTimeLeft: clamp(finite(input && input.salvageTimeLeft, site.salvageTimeS), 0, site.salvageTimeS),
    carry: clamp(finite(input && input.carry), 0, Math.max(0, poolTotal(definition.pool))),
    total: poolTotal(definition.pool),
    laps: whole(input && input.laps),
    pos: positionInBounds ? { x: px, z: pz } : fallback.pos,
    vel: { x: vx, z: vz },
  };
}

function cloneBodyRecord(record) {
  return {
    id: record.id,
    depleted: !!record.depleted,
    pool: { ...(record.pool || {}) },
    salvageTimeLeft: finite(record.salvageTimeLeft),
    carry: finite(record.carry),
    total: whole(record.total),
    laps: whole(record.laps),
    pos: { x: finite(record.pos && record.pos.x), z: finite(record.pos && record.pos.z) },
    vel: { x: finite(record.vel && record.vel.x), z: finite(record.vel && record.vel.z) },
  };
}

function riverBodies(state, siteId = ASHFALL_DEBRIS_RIVER.id) {
  return (state && state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.anomalySiteId === siteId);
}

function seedOf(state) {
  return (state && state.meta && state.meta.seed >>> 0) || 1;
}

export function scavengerSwarmAdmitted(seed, sectorId) {
  if (!SCAVENGER_SWARM.sectorIds.includes(sectorId)) return false;
  return hash32(seed >>> 0, sectorId, SCAVENGER_SWARM.id, 'admission')
    % SCAVENGER_SWARM.admissionModulo === 0;
}

function scavengerDrones(state) {
  return (state && state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'drone' && entity.data && entity.data.scavengerSwarmId === SCAVENGER_SWARM.id);
}

function ionStormMarkers(state) {
  return (state && state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'fx' && entity.data
    && entity.data.anomalyStableId === ION_STORM_POCKET.markerStableId);
}

function drifterBodies(state) {
  return (state && state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'drone' && entity.data
    && entity.data.drifterShoalId === ORCUS_DRIFTER_SHOAL.id);
}

function stableUnit(...parts) {
  return hash32(...parts) / 0x100000000;
}

function drifterSlotPose(site, anchor, state, slot) {
  const seed = seedOf(state);
  const angle = stableUnit(seed, site.id, slot, 'angle') * Math.PI * 2;
  const ringT = stableUnit(seed, site.id, slot, 'radius');
  const speedT = stableUnit(seed, site.id, slot, 'speed');
  const bodyT = stableUnit(seed, site.id, slot, 'body-radius');
  const radius = site.ringRadiusMin + (site.ringRadiusMax - site.ringRadiusMin) * ringT;
  const speed = site.tangentialSpeedMin
    + (site.tangentialSpeedMax - site.tangentialSpeedMin) * speedT;
  return Object.freeze({
    angle,
    radius,
    bodyRadius: site.radiusMin + (site.radiusMax - site.radiusMin) * bodyT,
    pos: Object.freeze({
      x: anchor.x + Math.cos(angle) * radius,
      z: anchor.z + Math.sin(angle) * radius,
    }),
    vel: Object.freeze({ x: -Math.sin(angle) * speed, z: Math.cos(angle) * speed }),
  });
}

export function ionStormLightningReceipt(site, volume, state, pulseWindow) {
  if (!site || !volume || !Number.isSafeInteger(pulseWindow)) return null;
  const seed = seedOf(state);
  const angle = stableUnit(seed, site.id, pulseWindow, 'strike-angle') * Math.PI * 2;
  const radial = Math.sqrt(stableUnit(seed, site.id, pulseWindow, 'strike-radius'))
    * volume.radius * site.lightning.reachFraction;
  const end = {
    x: volume.x + Math.cos(angle) * radial,
    z: volume.z + Math.sin(angle) * radial,
  };
  const slantAngle = stableUnit(seed, site.id, pulseWindow, 'strike-slant') * Math.PI * 2;
  const slant = volume.radius * (0.06
    + stableUnit(seed, site.id, pulseWindow, 'strike-span') * 0.08);
  return Object.freeze({
    anomalyId: site.id,
    markerStableId: site.markerStableId,
    sectorId: site.sectorId,
    zoneId: site.zoneId,
    pulseWindow,
    sourceSeed: hash32(seed, site.id, pulseWindow, 'lightning'),
    start: Object.freeze({
      x: end.x + Math.cos(slantAngle) * slant,
      y: site.lightning.altitudeWU,
      z: end.z + Math.sin(slantAngle) * slant,
    }),
    end: Object.freeze({ x: end.x, y: 0.4, z: end.z }),
  });
}

function freshWreckIdentity(state, entity) {
  const data = entity && entity.data;
  const provenance = data && data.provenance;
  const markerId = data && (data.markerId || provenance && provenance.markerId);
  const sectorId = provenance && provenance.sectorId
    || state && state.world && state.world.currentSectorId;
  const freshUntil = Number(data && data.freshUntil);
  if (!entity || entity.alive === false || entity.type !== 'wreck' || !markerId || !sectorId) return null;
  if (!provenance || provenance.source !== 'battle-aftermath') return null;
  if (data.aftermath && data.aftermath.playerLoss || data.ownedPlayerWreck === true) return null;
  if (!Number.isFinite(freshUntil) || freshUntil <= simTimeOf(state)) return null;
  if (poolTotal(data.salvagePool) <= 0) return null;
  return { markerId: String(markerId), sectorId: String(sectorId), freshUntil };
}

function scavengerSlot(markerId, slot, anchor) {
  const angle = hash32(markerId, SCAVENGER_SWARM.id, slot, 'slot') / 0x100000000 * Math.PI * 2;
  const radius = SCAVENGER_SWARM.slotRadiusMin
    + (slot % 3) * SCAVENGER_SWARM.slotRadiusStep;
  return {
    angle,
    x: anchor.pos.x + Math.cos(angle) * radius,
    z: anchor.pos.z + Math.sin(angle) * radius,
  };
}

function boundedImpulse(entity, desiredVx, desiredVz, response = 0.72) {
  const mass = Math.max(0.1, finite(entity && entity.mass, SCAVENGER_SWARM.droneMass));
  const dvx = (desiredVx - finite(entity && entity.vel && entity.vel.x)) * response;
  const dvz = (desiredVz - finite(entity && entity.vel && entity.vel.z)) * response;
  const magnitude = Math.hypot(dvx, dvz);
  const maxDv = SCAVENGER_SWARM.scatterSpeed;
  const scale = magnitude > maxDv ? maxDv / magnitude : 1;
  return queuePhysicsImpulse(entity, {
    x: dvx * scale * mass,
    y: 0,
    z: dvz * scale * mass,
  });
}

export const anomalyRuntime = {
  name: 'anomalyRuntime',

  init(ctx) {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._registered = false;
    this._anchor = { x: 0, z: 0 };
    this._drifterAnnounced = false;
    this._drifterUglinessSpoken = false;
    this._riverBodies = new Map();
    this._riverAnnounced = false;
    this._scavenger = null;
    this._ionStormMarkerId = null;
    this._ionStormPulseWindow = null;
    this._ionStormAnnounced = false;
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs = [
        this.bus.on('sector:exit', () => this._clearTransient('sector_exit')),
        this.bus.on('game:new', () => this._resetAll('new_game')),
        this.bus.on('game:newGame', () => this._resetAll('new_game')),
        this.bus.on('save:restoring', () => this._clearTransient('save_restoring')),
        this.bus.on('save:loaded', () => this._clearTransient('save_loaded', { capture: false })),
        this.bus.on('mining:yield', (payload) => this._onMiningYield(payload)),
        this.bus.on('salvage:completed', (payload) => this._onSalvageCompleted(payload)),
        this.bus.on('aftermathWreck:spawned', (payload) => this._onFreshWreckSpawned(payload)),
        this.bus.on('projectile:hit', (payload) => this._onDrifterProjectileHit(payload)),
      ];
    }
  },

  destroy() {
    this._clearTransient('destroy');
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
  },

  newGame() {
    this._resetAll('new_game');
  },

  update(_dt, state) {
    const sectorId = state && state.world && state.world.currentSectorId;
    const activeRoute = !!(state && state.mode === 'flight');
    this._updateEddy(activeRoute ? anomalySiteForSector(sectorId) : null, state);
    this._updateDrifterShoal(activeRoute ? drifterShoalForSector(sectorId) : null, state);
    this._updateDebrisRiver(activeRoute ? debrisRiverForSector(sectorId) : null, state);
    this._updateScavengerSwarm(activeRoute, state);
    this._updateIonStorm(activeRoute ? ionStormForSector(sectorId) : null, state);
  },

  diagnostics() {
    const fields = this._fieldsSystem();
    const live = fields && typeof fields.hasExternal === 'function'
      ? fields.hasExternal(ORCUS_GRAVITY_EDDY.field.id)
      : this._registered;
    const ledger = this._riverLedger(false);
    const records = ledger && ledger.data && ledger.data.bodies || {};
    return Object.freeze({
      anomalyId: ORCUS_GRAVITY_EDDY.id,
      zoneId: ORCUS_GRAVITY_EDDY.zoneId,
      fieldId: ORCUS_GRAVITY_EDDY.field.id,
      registered: !!live,
      center: Object.freeze({ x: this._anchor.x, z: this._anchor.z }),
      drifterShoal: Object.freeze({
        wildlifeId: ORCUS_DRIFTER_SHOAL.id,
        liveBodies: drifterBodies(this.state).length,
        uglinessSpoken: !!this._drifterUglinessSpoken,
      }),
      debrisRiver: Object.freeze({
        anomalyId: ASHFALL_DEBRIS_RIVER.id,
        liveBodies: riverBodies(this.state).length,
        depletedBodies: Object.values(records).filter((record) => record && record.depleted).length,
      }),
      scavengerSwarm: Object.freeze({
        wildlifeId: SCAVENGER_SWARM.id,
        markerId: this._scavenger && this._scavenger.markerId || null,
        liveDrones: scavengerDrones(this.state).length,
      }),
      ionStorm: Object.freeze({
        anomalyId: ION_STORM_POCKET.id,
        markerStableId: ION_STORM_POCKET.markerStableId,
        liveMarkers: ionStormMarkers(this.state).length,
        lastPulseWindow: this._ionStormPulseWindow,
      }),
    });
  },

  _updateIonStorm(site, state) {
    if (!site || !this.helpers || typeof this.helpers.spawnEntity !== 'function') {
      this._clearIonStorm(!site ? 'inactive_sector' : 'spawn_owner_missing');
      return;
    }
    const volume = resolveZoneVolume(site);
    if (!volume) {
      this._clearIonStorm('canonical_zone_missing');
      return;
    }

    const matches = ionStormMarkers(state);
    let marker = matches[0] || null;
    for (let i = 1; i < matches.length; i++) this._removeEntity(matches[i]);
    if (!marker) {
      marker = this.helpers.spawnEntity({
        type: 'fx',
        team: 2,
        factionId: null,
        pos: { x: volume.x, z: volume.z },
        vel: { x: 0, z: 0 },
        radius: volume.radius,
        mass: 0,
        hull: 1,
        hullMax: 1,
        collides: false,
        collisionMask: 0,
        flags: { persistent: false, noInterp: true },
        data: {
          kind: 'ionStormPocket',
          parentType: 'environment',
          name: site.name,
          label: site.name,
          scanLabel: site.name,
          anomalySiteId: site.id,
          anomalyStableId: site.markerStableId,
          sectorId: site.sectorId,
          zoneId: site.zoneId,
          worldSiteTargetable: false,
          noOrdinaryRewards: true,
          ordinaryRewardsSuppressed: true,
          bountyCr: 0,
          loot: [],
          radarJamming: {
            environmental: true,
            sourceId: site.markerStableId,
            radiusWU: volume.radius,
            maxSmearWU: site.radar.maxSmearWU,
            truthRadiusWU: site.radar.truthRadiusWU,
          },
          shieldRechargeZone: {
            sourceId: site.markerStableId,
            radiusWU: volume.radius,
            multiplier: site.shieldRechargeMultiplier,
          },
        },
      });
      this._ionStormPulseWindow = Math.floor(simTimeOf(state) / site.lightning.cadenceS);
    }
    this._ionStormMarkerId = marker.id;
    marker.pos.x = volume.x;
    marker.pos.z = volume.z;
    marker.radius = volume.radius;

    if (!this._ionStormAnnounced) {
      this._ionStormAnnounced = true;
      this.bus && this.bus.emit && this.bus.emit('anomaly:registered', {
        anomalyId: site.id,
        markerStableId: site.markerStableId,
        sectorId: site.sectorId,
        zoneId: site.zoneId,
        center: { x: volume.x, z: volume.z },
        radius: volume.radius,
        presentation: 'ion_storm_pocket',
      });
    }

    const player = state && state.entities && state.entities.get(state.playerId);
    const dx = finite(player && player.pos && player.pos.x) - volume.x;
    const dz = finite(player && player.pos && player.pos.z) - volume.z;
    const inside = !!(player && player.alive !== false && dx * dx + dz * dz <= volume.radius * volume.radius);
    const pulseWindow = Math.floor(simTimeOf(state) / site.lightning.cadenceS);
    if (!inside) {
      this._ionStormPulseWindow = pulseWindow;
      return;
    }
    if (this._ionStormPulseWindow == null) this._ionStormPulseWindow = pulseWindow;
    if (pulseWindow <= this._ionStormPulseWindow) return;
    this._ionStormPulseWindow = pulseWindow;
    const receipt = ionStormLightningReceipt(site, volume, state, pulseWindow);
    if (receipt && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:ionStormLightning', receipt);
    }
  },

  _updateDrifterShoal(site, state) {
    if (!site || !this.helpers || typeof this.helpers.spawnEntity !== 'function') {
      this._clearDrifterShoal(!site ? 'inactive_sector' : 'spawn_owner_missing');
      return;
    }
    const anchor = resolveAnchor(site);
    const fields = this._fieldsSystem();
    const fieldLive = !!(fields && typeof fields.hasExternal === 'function'
      && fields.hasExternal(site.fieldId));
    if (!anchor || !fieldLive) {
      this._clearDrifterShoal(!anchor ? 'canonical_zone_missing' : 'field_owner_missing');
      return;
    }

    const bySlot = new Map();
    for (const body of drifterBodies(state)) {
      const slot = whole(body.data && body.data.drifterSlot, -1);
      if (slot < 0 || slot >= site.count) {
        this._removeEntity(body);
        continue;
      }
      if (!bySlot.has(slot)) bySlot.set(slot, body);
      else this._removeEntity(body);
    }
    for (let slot = 0; slot < site.count; slot++) {
      if (!bySlot.has(slot)) bySlot.set(slot, this._spawnDrifterBody(site, anchor, state, slot));
    }

    const video = state && state.settings && state.settings.video || {};
    const accessibility = state && state.settings && state.settings.accessibility || {};
    for (const body of bySlot.values()) {
      if (!body || body.alive === false || !body.data) continue;
      body.data.drifterPresentationTime = simTimeOf(state);
      body.data.drifterMotionReduce = !!(video.motionReduce || accessibility.reducedMotion);
      body.data.drifterFlashReduce = !!(
        video.flashReduce || accessibility.flashReduce || accessibility.reducedFlash
      );
    }

    if (!this._drifterAnnounced) {
      this._drifterAnnounced = true;
      this.bus && this.bus.emit && this.bus.emit('anomaly:registered', {
        anomalyId: site.id,
        sectorId: site.sectorId,
        zoneId: site.zoneId,
        fieldId: site.fieldId,
        bodyCount: site.count,
        presentation: 'physical_drifter_shoal',
      });
    }
  },

  _spawnDrifterBody(site, anchor, state, slot) {
    const pose = drifterSlotPose(site, anchor, state, slot);
    const stableId = `${site.id}:slot:${slot}`;
    return this.helpers.spawnEntity({
      type: 'drone',
      team: 2,
      factionId: null,
      pos: { x: pose.pos.x, z: pose.pos.z },
      vel: { x: pose.vel.x, z: pose.vel.z },
      rot: Math.atan2(pose.vel.z, pose.vel.x),
      angVel: (slot % 2 === 0 ? 1 : -1) * (0.025 + slot * 0.002),
      radius: pose.bodyRadius,
      mass: site.mass,
      hull: 1,
      hullMax: 1,
      collides: true,
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.PROJECTILE,
      flags: { invuln: true },
      physicsBody: {
        schemaVersion: 1,
        radius: pose.bodyRadius,
        mass: site.mass,
        inertiaY: Math.max(1, site.mass * pose.bodyRadius * pose.bodyRadius * 0.45),
        dynamic: true,
        ccd: false,
        shape: 'ball',
        material: 'default',
        revision: 0,
      },
      data: {
        kind: 'drifter_wildlife',
        parentType: 'environment',
        name: 'Bioluminescent Drifter',
        label: 'Bioluminescent Drifter',
        scanLabel: 'Bioluminescent Drifter',
        neutralWildlife: true,
        drifterShoalId: site.id,
        drifterSlot: slot,
        anomalyStableId: stableId,
        drifterFieldId: site.fieldId,
        drifterPresentationTime: simTimeOf(state),
        drifterMotionReduce: false,
        drifterFlashReduce: false,
        drifterHitPulse: 0,
        drifterFlickerUntil: 0,
        worldSiteTargetable: false,
        targetable: false,
        noHudHealth: true,
        ordinaryRewardsSuppressed: true,
        noOrdinaryRewards: true,
        bountyCr: 0,
        loot: [],
        weapons: [],
      },
    });
  },

  _onDrifterProjectileHit(payload) {
    if (!payload || payload.targetId == null) return false;
    const body = this.state && this.state.entities && this.state.entities.get(payload.targetId);
    if (!body || body.alive === false || !body.data
      || body.data.drifterShoalId !== ORCUS_DRIFTER_SHOAL.id) return false;
    body.data.drifterHitPulse = whole(body.data.drifterHitPulse) + 1;
    body.data.drifterFlickerUntil = simTimeOf(this.state) + 0.65;
    const receipt = {
      anomalyId: ORCUS_DRIFTER_SHOAL.id,
      entityId: body.id,
      stableId: body.data.anomalyStableId,
      hitPulse: body.data.drifterHitPulse,
      cosmeticOnly: true,
      combatOutcome: false,
    };
    this.bus && this.bus.emit && this.bus.emit('anomaly:drifterFlicker', receipt);

    if (payload.ownerId !== this.state.playerId || this._drifterUglinessSpoken) return true;
    this._drifterUglinessSpoken = true;
    const voicePayload = {
      channel: 'bark',
      text: ORCUS_DRIFTER_SHOAL.uglinessBark,
      kind: 'drifterUgliness',
      ttl: 1.4,
      id: `drifterUgliness:${ORCUS_DRIFTER_SHOAL.id}`,
      factionId: 'faction_free',
    };
    const accepted = this.helpers && this.helpers.voice
      && typeof this.helpers.voice.say === 'function'
      ? this.helpers.voice.say(voicePayload)
      : false;
    if (!accepted && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', {
        text: voicePayload.text,
        kind: voicePayload.kind,
        ttl: voicePayload.ttl,
      });
    }
    this.bus && this.bus.emit && this.bus.emit('anomaly:drifterUglinessBark', {
      ...receipt,
      text: voicePayload.text,
      voiceAccepted: !!accepted,
    });
    return true;
  },

  _updateEddy(site, state) {
    if (!fieldsFlag('enabled') || !site) {
      this._clearEddy(!site ? 'inactive_sector' : 'inactive_route');
      return;
    }
    const anchor = resolveAnchor(site);
    if (!anchor) {
      this._clearEddy('zone_missing');
      return;
    }
    this._anchor.x = anchor.x;
    this._anchor.z = anchor.z;

    const fields = this._fieldsSystem();
    if (!fields || typeof fields.registerEnvironmental !== 'function') {
      this._registered = false;
      return;
    }
    const live = typeof fields.hasExternal === 'function'
      ? fields.hasExternal(site.field.id)
      : this._registered;
    if (live) {
      this._registered = true;
      return;
    }

    fields.registerEnvironmental({
      ...site.field,
      center: { x: anchor.x, z: anchor.z },
      sourceId: site.id,
      ownerId: null,
      team: null,
      createdAt: simTimeOf(state),
    });
    this._registered = typeof fields.hasExternal === 'function'
      ? fields.hasExternal(site.field.id)
      : true;
    if (this._registered && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:registered', {
        anomalyId: site.id,
        poiId: site.poiId,
        zoneId: site.zoneId,
        fieldId: site.field.id,
        center: { x: anchor.x, z: anchor.z },
        presentation: 'environmental_well',
      });
    }
  },

  _updateDebrisRiver(site, state) {
    if (!site) {
      this._clearRiver('inactive_sector');
      return;
    }
    const basis = resolveRiverBasis(site);
    if (!basis || !this.helpers || typeof this.helpers.spawnEntity !== 'function') {
      this._clearRiver('canonical_site_missing');
      return;
    }
    const ledger = this._riverLedger(true, site, basis);
    if (!ledger) return;
    this._syncRiverBodies(site, basis, ledger);

    for (const definition of site.bodies) {
      const entity = this._riverEntity(definition.id);
      if (!entity) continue;
      const record = ledger.data.bodies[definition.id];
      this._captureRiverBody(record, entity, definition, site);
      const relX = entity.pos.x - basis.start.x;
      const relZ = entity.pos.z - basis.start.z;
      const along = relX * basis.ux + relZ * basis.uz;
      if (along > basis.length + site.wrapMargin) {
        this._wrapRiverBody(definition, record, site, basis);
      }
    }

    if (!this._riverAnnounced) {
      this._riverAnnounced = true;
      this.bus && this.bus.emit && this.bus.emit('anomaly:registered', {
        anomalyId: site.id,
        sectorId: site.sectorId,
        bodyCount: site.bodies.length,
        presentation: 'moving_wreck_line',
      });
    }
  },

  _syncRiverBodies(site, basis, ledger) {
    const candidates = new Map();
    for (const entity of riverBodies(this.state, site.id)) {
      const bodyId = entity.data && entity.data.anomalyBodyId;
      if (!site.bodies.some((definition) => definition.id === bodyId)) {
        this._removeEntity(entity);
        continue;
      }
      if (!candidates.has(bodyId)) candidates.set(bodyId, entity);
      else this._removeEntity(entity);
    }

    for (const definition of site.bodies) {
      const record = ledger.data.bodies[definition.id];
      const candidate = candidates.get(definition.id) || null;
      if (record.depleted) {
        if (candidate) this._removeEntity(candidate);
        this._riverBodies.delete(definition.id);
        continue;
      }
      if (candidate) {
        this._riverBodies.set(definition.id, candidate.id);
        this._captureRiverBody(record, candidate, definition, site);
      } else {
        this._spawnRiverBody(definition, record, site, basis);
      }
    }
  },

  _spawnRiverBody(definition, record, site, basis) {
    if (!record || record.depleted || poolTotal(record.pool) <= 0) return null;
    const entity = this.helpers.spawnEntity({
      type: 'wreck',
      team: 2,
      factionId: null,
      pos: { x: record.pos.x, z: record.pos.z },
      vel: { x: record.vel.x, z: record.vel.z },
      rot: Math.atan2(basis.uz, basis.ux),
      angVel: definition.id === 'dish' || definition.id === 'pod' ? 0.09 : -0.045,
      radius: definition.radius,
      mass: definition.mass,
      hull: 1,
      hullMax: 1,
      collides: true,
      collisionMask: Masks.SHIP | Masks.PROJECTILE,
      physicsBody: {
        schemaVersion: 1,
        radius: definition.radius,
        mass: definition.mass,
        inertiaY: Math.max(1, definition.mass * definition.radius * definition.radius * 0.5),
        dynamic: true,
        ccd: false,
        material: 'debris',
        revision: whole(record.laps),
      },
      data: {
        kind: 'wreck',
        parentType: 'environment',
        name: `${site.name} ${definition.id}`,
        label: `${site.name} Wreckage`,
        scanLabel: `${site.name} Wreckage`,
        anomalySiteId: site.id,
        anomalyBodyId: definition.id,
        anomalyStableId: `${site.id}:${definition.id}`,
        anomalyLap: whole(record.laps),
        worldSiteTargetable: false,
        noOrdinaryRewards: true,
        ordinaryRewardsSuppressed: true,
        bountyCr: 0,
        loot: [],
        salvagePool: { ...record.pool },
        salvageTimeLeft: record.salvageTimeLeft,
        _carry: record.carry,
        _total: record.total,
      },
    });
    this._riverBodies.set(definition.id, entity.id);
    return entity;
  },

  _wrapRiverBody(definition, record, site, basis) {
    const entity = this._riverEntity(definition.id);
    if (entity) this._captureRiverBody(record, entity, definition, site);
    record.laps = whole(record.laps) + 1;
    record.pos = {
      x: basis.start.x + basis.nx * finite(definition.lateral),
      z: basis.start.z + basis.nz * finite(definition.lateral),
    };
    record.vel = { x: basis.ux * site.speed, z: basis.uz * site.speed };
    if (entity) this._removeEntity(entity);
    this._riverBodies.delete(definition.id);
    return this._spawnRiverBody(definition, record, site, basis);
  },

  _captureRiverBody(record, entity, definition, site) {
    if (!record || !entity || entity.alive === false) return;
    record.pos = { x: finite(entity.pos && entity.pos.x), z: finite(entity.pos && entity.pos.z) };
    record.vel = { x: finite(entity.vel && entity.vel.x), z: finite(entity.vel && entity.vel.z) };
    record.pool = normalizePool(entity.data && entity.data.salvagePool, definition.pool);
    record.salvageTimeLeft = clamp(
      finite(entity.data && entity.data.salvageTimeLeft, site.salvageTimeS),
      0,
      site.salvageTimeS,
    );
    record.carry = clamp(finite(entity.data && entity.data._carry), 0, record.total);
    if (poolTotal(record.pool) <= 0 || entity.data && entity.data._salvaged === true) {
      record.depleted = true;
    }
  },

  _captureRiver(site = ASHFALL_DEBRIS_RIVER) {
    const ledger = this._riverLedger(false);
    if (!ledger || !ledger.data || !ledger.data.bodies) return;
    for (const definition of site.bodies) {
      const record = ledger.data.bodies[definition.id];
      const entity = this._riverEntity(definition.id);
      if (record && entity) this._captureRiverBody(record, entity, definition, site);
    }
  },

  _onMiningYield(payload) {
    if (!payload || payload.sourceEntityId == null) return;
    const entity = this.state && this.state.entities && this.state.entities.get(payload.sourceEntityId);
    if (!entity || !entity.data || entity.data.anomalySiteId !== ASHFALL_DEBRIS_RIVER.id) return;
    const definition = ASHFALL_DEBRIS_RIVER.bodies.find((row) => row.id === entity.data.anomalyBodyId);
    const ledger = this._riverLedger(false);
    const record = ledger && ledger.data && ledger.data.bodies && ledger.data.bodies[entity.data.anomalyBodyId];
    if (definition && record) this._captureRiverBody(record, entity, definition, ASHFALL_DEBRIS_RIVER);
  },

  _onSalvageCompleted(payload) {
    if (!payload || payload.wreckId == null) return;
    const entity = this.state && this.state.entities && this.state.entities.get(payload.wreckId);
    if (!entity || !entity.data || entity.data.anomalySiteId !== ASHFALL_DEBRIS_RIVER.id) return;
    const bodyId = entity.data.anomalyBodyId;
    const ledger = this._riverLedger(false);
    const record = ledger && ledger.data && ledger.data.bodies && ledger.data.bodies[bodyId];
    if (!record) return;
    record.pool = {};
    record.salvageTimeLeft = 0;
    record.carry = 0;
    record.depleted = true;
    this._riverBodies.delete(bodyId);
  },

  _riverLedger(create, site = ASHFALL_DEBRIS_RIVER, basis = resolveRiverBasis(site)) {
    const matches = (this.state && this.state.entityList || []).filter((entity) => entity
      && entity.alive !== false && entity.type === 'fx' && entity.data
      && entity.data.kind === LEDGER_KIND && entity.data.siteId === site.id);
    let ledger = matches[0] || null;
    for (let i = 1; i < matches.length; i++) this._removeEntity(matches[i]);
    if (!ledger && !create) return null;
    if (!basis) return null;
    if (!ledger) {
      ledger = this.helpers.spawnEntity({
        type: 'fx',
        pos: { x: basis.start.x, z: basis.start.z },
        vel: { x: 0, z: 0 },
        radius: 0,
        mass: 0,
        collides: false,
        flags: { persistent: true },
        data: {
          kind: LEDGER_KIND,
          schemaVersion: LEDGER_SCHEMA,
          siteId: site.id,
          sectorId: site.sectorId,
          bodies: {},
        },
      });
    }
    const inputBodies = ledger.data && ledger.data.bodies && typeof ledger.data.bodies === 'object'
      ? ledger.data.bodies
      : {};
    const normalized = {};
    for (const definition of site.bodies) {
      normalized[definition.id] = normalizeBodyRecord(inputBodies[definition.id], definition, site, basis);
    }
    ledger.collides = false;
    ledger.flags = Object.assign({}, ledger.flags, { persistent: true });
    ledger.data = {
      kind: LEDGER_KIND,
      schemaVersion: LEDGER_SCHEMA,
      siteId: site.id,
      sectorId: site.sectorId,
      bodies: normalized,
    };
    return ledger;
  },

  _riverEntity(bodyId) {
    const knownId = this._riverBodies.get(bodyId);
    const known = knownId != null && this.state && this.state.entities
      ? this.state.entities.get(knownId)
      : null;
    if (known && known.alive !== false && known.data && known.data.anomalyBodyId === bodyId) return known;
    const found = riverBodies(this.state).find((entity) => entity.data.anomalyBodyId === bodyId) || null;
    if (found) this._riverBodies.set(bodyId, found.id);
    else this._riverBodies.delete(bodyId);
    return found;
  },

  _onFreshWreckSpawned(payload) {
    if (!payload || payload.entityId == null || !this.state || this.state.mode !== 'flight') return;
    const entity = this.state.entities && this.state.entities.get(payload.entityId);
    this._considerScavengerWreck(entity);
  },

  _considerScavengerWreck(entity) {
    const identity = freshWreckIdentity(this.state, entity);
    if (!identity) return false;
    const currentSectorId = this.state && this.state.world && this.state.world.currentSectorId;
    if (identity.sectorId !== currentSectorId
      || !scavengerSwarmAdmitted(seedOf(this.state), identity.sectorId)) return false;
    if (this._scavenger && this._scavenger.markerId !== identity.markerId) return false;
    this._scavenger = {
      markerId: identity.markerId,
      sectorId: identity.sectorId,
      wreckEntityId: entity.id,
      freshUntil: identity.freshUntil,
    };
    this._syncScavengerDrones(entity);
    return true;
  },

  _updateScavengerSwarm(activeRoute, state) {
    const sectorId = state && state.world && state.world.currentSectorId;
    if (!activeRoute || !scavengerSwarmAdmitted(seedOf(state), sectorId)) {
      this._clearScavenger(!activeRoute ? 'inactive_route' : 'inactive_sector');
      return;
    }

    if (!this._scavenger) {
      const candidates = (state.entityList || [])
        .filter((entity) => !!freshWreckIdentity(state, entity))
        .sort((a, b) => String(a.data && a.data.markerId).localeCompare(String(b.data && b.data.markerId)));
      if (candidates.length) this._considerScavengerWreck(candidates[0]);
      if (!this._scavenger) {
        for (const drone of scavengerDrones(state)) this._removeEntity(drone);
        return;
      }
    }

    const anchor = state.entities && state.entities.get(this._scavenger.wreckEntityId);
    const identity = freshWreckIdentity(state, anchor);
    if (!identity || identity.markerId !== this._scavenger.markerId
      || identity.sectorId !== sectorId) {
      this._clearScavenger(!anchor || anchor.alive === false ? 'wreck_removed' : 'wreck_cold');
      return;
    }
    this._scavenger.freshUntil = identity.freshUntil;
    this._syncScavengerDrones(anchor);

    const player = state.entities && state.entities.get(state.playerId);
    const now = simTimeOf(state);
    for (const drone of scavengerDrones(state)) {
      if (!drone.data || drone.data.scavengerMarkerId !== identity.markerId) continue;
      if (now + 1e-9 < finite(drone.data.scavengerNextImpulseAt)) continue;
      const playerDistance = player && player.alive !== false
        ? Math.hypot(drone.pos.x - player.pos.x, drone.pos.z - player.pos.z)
        : Infinity;
      if (playerDistance <= SCAVENGER_SWARM.scatterRadius) {
        let dx = drone.pos.x - player.pos.x;
        let dz = drone.pos.z - player.pos.z;
        let length = Math.hypot(dx, dz);
        if (!(length > 1e-6)) {
          const fallback = scavengerSlot(identity.markerId, drone.data.scavengerSlot, anchor);
          dx = Math.cos(fallback.angle);
          dz = Math.sin(fallback.angle);
          length = 1;
        }
        boundedImpulse(
          drone,
          dx / length * SCAVENGER_SWARM.scatterSpeed,
          dz / length * SCAVENGER_SWARM.scatterSpeed,
          0.9,
        );
        drone.data.scavengerPhase = 'scatter';
      } else if (playerDistance >= SCAVENGER_SWARM.returnRadius) {
        const slot = scavengerSlot(identity.markerId, drone.data.scavengerSlot, anchor);
        const dx = slot.x - drone.pos.x;
        const dz = slot.z - drone.pos.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 3) {
          const speed = Math.min(SCAVENGER_SWARM.returnSpeed, Math.max(5, distance * 0.65));
          boundedImpulse(drone, dx / distance * speed, dz / distance * speed, 0.62);
          drone.data.scavengerPhase = 'return';
        } else {
          boundedImpulse(drone, 0, 0, 0.72);
          drone.data.scavengerPhase = 'forage';
        }
      }
      drone.data.scavengerNextImpulseAt = now + SCAVENGER_SWARM.impulseCadenceS;
    }
  },

  _syncScavengerDrones(anchor) {
    if (!this._scavenger || !anchor || anchor.alive === false) return;
    const bySlot = new Map();
    for (const drone of scavengerDrones(this.state)) {
      const slot = whole(drone.data && drone.data.scavengerSlot, -1);
      if (drone.data.scavengerMarkerId !== this._scavenger.markerId
        || slot < 0 || slot >= SCAVENGER_SWARM.count) {
        this._removeEntity(drone);
        continue;
      }
      if (!bySlot.has(slot)) bySlot.set(slot, drone);
      else this._removeEntity(drone);
    }
    for (let slot = 0; slot < SCAVENGER_SWARM.count; slot++) {
      if (!bySlot.has(slot)) this._spawnScavengerDrone(anchor, slot);
    }
  },

  _spawnScavengerDrone(anchor, slot) {
    if (!this._scavenger || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const position = scavengerSlot(this._scavenger.markerId, slot, anchor);
    return this.helpers.spawnEntity({
      type: 'drone',
      team: 2,
      factionId: null,
      pos: { x: position.x, z: position.z },
      vel: { x: finite(anchor.vel && anchor.vel.x), z: finite(anchor.vel && anchor.vel.z) },
      rot: position.angle + Math.PI,
      radius: SCAVENGER_SWARM.droneRadius,
      mass: SCAVENGER_SWARM.droneMass,
      hull: 1,
      hullMax: 1,
      collides: true,
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.WRECK,
      flags: { invuln: true },
      physicsBody: {
        schemaVersion: 1,
        radius: SCAVENGER_SWARM.droneRadius,
        mass: SCAVENGER_SWARM.droneMass,
        inertiaY: SCAVENGER_SWARM.droneMass * SCAVENGER_SWARM.droneRadius ** 2 * 0.5,
        dynamic: true,
        ccd: false,
        material: 'debris',
        revision: 0,
      },
      data: {
        kind: 'scavenger_wildlife',
        name: 'Unclaimed Scavenger',
        scanLabel: 'Unclaimed Scavenger',
        scavengerSwarmId: SCAVENGER_SWARM.id,
        scavengerMarkerId: this._scavenger.markerId,
        scavengerWreckId: anchor.id,
        scavengerSlot: slot,
        scavengerPhase: 'forage',
        scavengerNextImpulseAt: 0,
        worldSiteTargetable: false,
        ordinaryRewardsSuppressed: true,
        noOrdinaryRewards: true,
        bountyCr: 0,
        loot: [],
      },
    });
  },

  _clearScavenger(why) {
    const prior = this._scavenger;
    for (const drone of scavengerDrones(this.state)) this._removeEntity(drone);
    this._scavenger = null;
    if (prior && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:unregistered', {
        anomalyId: SCAVENGER_SWARM.id,
        markerId: prior.markerId,
        why,
      });
    }
  },

  _fieldsSystem() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('fields')
      : null;
  },

  _removeEntity(entity) {
    if (!entity || entity.alive === false) return false;
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(entity.id);
      return true;
    }
    entity.alive = false;
    return true;
  },

  _clearRiver(why, { capture = true } = {}) {
    if (capture) this._captureRiver();
    for (const entity of riverBodies(this.state)) this._removeEntity(entity);
    if (this._riverAnnounced && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:unregistered', {
        anomalyId: ASHFALL_DEBRIS_RIVER.id,
        why,
      });
    }
    this._riverBodies.clear();
    this._riverAnnounced = false;
  },

  _clearEddy(why) {
    const fields = this._fieldsSystem();
    const live = fields && typeof fields.hasExternal === 'function'
      ? fields.hasExternal(ORCUS_GRAVITY_EDDY.field.id)
      : this._registered;
    if (live && fields && typeof fields.unregisterExternal === 'function') {
      fields.unregisterExternal(ORCUS_GRAVITY_EDDY.field.id);
    }
    if (this._registered && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:unregistered', {
        anomalyId: ORCUS_GRAVITY_EDDY.id,
        fieldId: ORCUS_GRAVITY_EDDY.field.id,
        why,
      });
    }
    this._registered = false;
  },

  _clearDrifterShoal(why) {
    const hadBodies = drifterBodies(this.state).length > 0;
    for (const body of drifterBodies(this.state)) this._removeEntity(body);
    if ((hadBodies || this._drifterAnnounced) && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:unregistered', {
        anomalyId: ORCUS_DRIFTER_SHOAL.id,
        why,
      });
    }
    this._drifterAnnounced = false;
  },

  _clearIonStorm(why) {
    const hadMarker = ionStormMarkers(this.state).length > 0;
    for (const marker of ionStormMarkers(this.state)) this._removeEntity(marker);
    this._ionStormMarkerId = null;
    this._ionStormPulseWindow = null;
    if ((hadMarker || this._ionStormAnnounced) && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:unregistered', {
        anomalyId: ION_STORM_POCKET.id,
        markerStableId: ION_STORM_POCKET.markerStableId,
        why,
      });
    }
    this._ionStormAnnounced = false;
  },

  _clearTransient(why, options) {
    this._clearEddy(why);
    this._clearDrifterShoal(why);
    this._clearRiver(why, options);
    this._clearScavenger(why);
    this._clearIonStorm(why);
  },

  _resetAll(why) {
    this._clearTransient(why, { capture: false });
    this._drifterUglinessSpoken = false;
    const ledger = this._riverLedger(false);
    if (ledger) this._removeEntity(ledger);
  },
};

export function debrisRiverLedgerSnapshot(state) {
  const ledger = (state && state.entityList || []).find((entity) => entity && entity.alive !== false
    && entity.type === 'fx' && entity.data && entity.data.kind === LEDGER_KIND
    && entity.data.siteId === ASHFALL_DEBRIS_RIVER.id);
  if (!ledger || !ledger.data || !ledger.data.bodies) return null;
  const bodies = {};
  for (const definition of ASHFALL_DEBRIS_RIVER.bodies) {
    const record = ledger.data.bodies[definition.id];
    if (record) bodies[definition.id] = cloneBodyRecord(record);
  }
  return Object.freeze({
    siteId: ledger.data.siteId,
    sectorId: ledger.data.sectorId,
    bodies: Object.freeze(bodies),
  });
}

export default anomalyRuntime;
