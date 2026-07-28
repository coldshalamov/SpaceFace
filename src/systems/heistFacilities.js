// PQ-019A: physical facility embodiment and deterministic cargo-capsule schedule.
//
// Ownership boundary:
// - Sole writer for state.heistFacilities and the entities it creates.
// - Emits candidate receipts only. It never settles cargo, credits, reputation,
//   WANTED heat, missions, patrols, or saves.

import { Masks } from '../core/entity.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  PQ019_CAPSULE,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
  projectPq019FacilitySocket,
} from '../data/heistFacilities.js';

const HEIST_FACILITIES_SCHEMA_VERSION = 1;
const MAX_CANDIDATE_RECEIPTS = 32;

function makeState() {
  return {
    schemaVersion: HEIST_FACILITIES_SCHEMA_VERSION,
    facilities: {},
    schedule: null,
    capsuleEntityId: null,
    candidateReceipts: [],
    candidateIds: {},
  };
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function cleanScheduleId(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function entityIsAlive(state, id) {
  if (id == null || !state?.entities?.get) return null;
  const entity = state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

function stableNumber(value) {
  return Number(finite(value).toFixed(6));
}

function scheduleReceipt(scheduleId, launchAtSimT) {
  return Object.freeze({
    accepted: true,
    receiptId: `pq019a:schedule:${scheduleId}:${stableNumber(launchAtSimT).toFixed(6)}`,
    scheduleId,
    launchAtSimT: stableNumber(launchAtSimT),
    source: 'heistFacilities',
  });
}

function deniedReceipt(request, active) {
  return Object.freeze({
    accepted: false,
    reason: 'active_schedule',
    scheduleId: cleanScheduleId(request?.scheduleId),
    launchAtSimT: Number.isFinite(request?.launchAtSimT)
      ? stableNumber(request.launchAtSimT)
      : null,
    activeScheduleId: active.scheduleId,
    source: 'heistFacilities',
  });
}

export const heistFacilities = {
  name: 'heistFacilities',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    ctx.heistFacilities = this;

    if (!this.state.heistFacilities
      || this.state.heistFacilities.schemaVersion !== HEIST_FACILITIES_SCHEMA_VERSION) {
      this.state.heistFacilities = makeState();
    }
    this._normalizeState();

    if (this._wiredBus === this.bus) {
      if (this.state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID) {
        this.materializeForSector(PQ019_HEIST_SECTOR_ID);
      }
      return;
    }
    this._wiredBus = this.bus;

    this.bus.on('sector:enter', ({ sectorId } = {}) => this.materializeForSector(sectorId));
    this.bus.on('sector:exit', ({ sectorId } = {}) => this._dematerializeSector(sectorId));
    this.bus.on('entity:destroyed', ({ id } = {}) => this._onEntityDestroyed(id));
    this.bus.on('physics:impact', (impact = {}) => this._onPhysicsImpact(impact));
    this.bus.on('heist:requestLaunchSchedule', (request = {}) => {
      this.requestLaunchSchedule(request);
    });

    if (this.state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID) {
      this.materializeForSector(PQ019_HEIST_SECTOR_ID);
    }
  },

  newGame() {
    this.state.heistFacilities = makeState();
    if (this.state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID) {
      this.materializeForSector(PQ019_HEIST_SECTOR_ID);
    }
  },

  update(_dt, state) {
    const owned = state.heistFacilities;
    const schedule = owned?.schedule;
    if (!schedule || schedule.status !== 'scheduled') return;
    if (state.world?.currentSectorId !== PQ019_HEIST_SECTOR_ID) return;
    if (state.simTime + 1e-9 < schedule.launchAtSimT) return;
    this._launchScheduledCapsule(schedule);
  },

  materializeForSector(sectorId) {
    if (sectorId !== PQ019_HEIST_SECTOR_ID) return 0;
    let created = 0;
    for (const facility of Object.values(PQ019_FACILITIES)) {
      const record = this._facilityRecord(facility.id);
      let visual = entityIsAlive(this.state, record.visualEntityId)
        || this._findOwnedEntity(facility.id, `${facility.role}_visual`);
      if (!visual) {
        visual = this._spawnFacilityVisual(facility);
        created++;
      }
      record.visualEntityId = visual.id;

      let head = entityIsAlive(this.state, record.headEntityId)
        || this._findOwnedEntity(facility.id, `${facility.role}_head`);
      if (!head) {
        head = this._spawnFacilityHead(facility);
        created++;
      }
      record.headEntityId = head.id;
    }
    return created;
  },

  requestLaunchSchedule(request = {}) {
    const scheduleId = cleanScheduleId(request.scheduleId);
    const launchAtSimT = Number(request.launchAtSimT);
    if (!scheduleId || !Number.isFinite(launchAtSimT) || launchAtSimT < 0) {
      const denied = Object.freeze({
        accepted: false,
        reason: 'invalid_schedule',
        scheduleId,
        launchAtSimT: Number.isFinite(launchAtSimT) ? stableNumber(launchAtSimT) : null,
        source: 'heistFacilities',
      });
      this.bus.emit('heist:launchScheduleReceipt', denied);
      return denied;
    }

    const owned = this.state.heistFacilities;
    const active = owned.schedule;
    if (active) {
      if (active.scheduleId === scheduleId
        && active.launchAtSimT === stableNumber(launchAtSimT)) {
        this.bus.emit('heist:launchScheduleReceipt', active.receipt);
        return active.receipt;
      }
      const denied = deniedReceipt(request, active);
      this.bus.emit('heist:launchScheduleReceipt', denied);
      return denied;
    }

    const receipt = scheduleReceipt(scheduleId, launchAtSimT);
    owned.schedule = {
      scheduleId,
      launchAtSimT: receipt.launchAtSimT,
      status: 'scheduled',
      receipt,
      capsuleEntityId: null,
      launchedAtTick: null,
    };
    this.bus.emit('heist:launchScheduleReceipt', receipt);
    return receipt;
  },

  _normalizeState() {
    const owned = this.state.heistFacilities;
    if (!owned.facilities || typeof owned.facilities !== 'object') owned.facilities = {};
    if (!Array.isArray(owned.candidateReceipts)) owned.candidateReceipts = [];
    if (!owned.candidateIds || typeof owned.candidateIds !== 'object') owned.candidateIds = {};
    if (owned.capsuleEntityId != null
      && !Number.isInteger(Number(owned.capsuleEntityId))) {
      owned.capsuleEntityId = null;
    }
  },

  _facilityRecord(facilityId) {
    const records = this.state.heistFacilities.facilities;
    if (!records[facilityId]) {
      records[facilityId] = {
        facilityId,
        visualEntityId: null,
        headEntityId: null,
      };
    }
    return records[facilityId];
  },

  _findOwnedEntity(facilityId, role) {
    return this.state.entityList.find((entity) => (
      entity?.alive !== false
      && entity.data?.heistFacilityId === facilityId
      && entity.data?.heistFacilityRole === role
    )) || null;
  },

  _global(localPos) {
    return sectorLocalToGlobalForSector(localPos, PQ019_HEIST_SECTOR_ID);
  },

  _spawnFacilityVisual(facility) {
    return this.helpers.spawnEntity({
      type: 'fx',
      factionId: facility.factionId,
      pos: this._global(facility.localPos),
      rot: facility.rot,
      radius: Math.max(20, facility.headRadius * 2),
      mass: 0,
      collides: false,
      ttl: Infinity,
      flags: { noInterp: true },
      homeSectorId: facility.sectorId,
      data: {
        heistFacilityId: facility.id,
        heistFacilityRole: `${facility.role}_visual`,
        runtimeOwner: 'heistFacilities',
        sectorId: facility.sectorId,
        homeSectorId: facility.sectorId,
        placeId: facility.placeId,
        placeScale: facility.placeScale,
        name: facility.name,
        worldDressing: true,
        placeRadius: Math.max(20, facility.headRadius * 2),
      },
    });
  },

  _spawnFacilityHead(facility) {
    const socketLocal = projectPq019FacilitySocket(facility);
    const mass = 1e9;
    return this.helpers.spawnEntity({
      type: 'fx',
      _noMesh: true,
      factionId: facility.factionId,
      pos: this._global(socketLocal),
      rot: facility.rot,
      radius: facility.headRadius,
      mass,
      hull: 1e9,
      hullMax: 1e9,
      collides: true,
      collisionMask: Masks.PAYLOAD,
      ttl: Infinity,
      flags: { noInterp: true, invuln: true },
      homeSectorId: facility.sectorId,
      physicsBody: {
        dynamic: false,
        radius: facility.headRadius,
        mass,
        inertiaY: 0.5 * mass * facility.headRadius * facility.headRadius,
        ccd: false,
        material: 'station',
      },
      data: {
        heistFacilityId: facility.id,
        heistFacilityRole: `${facility.role}_head`,
        runtimeOwner: 'heistFacilities',
        sectorId: facility.sectorId,
        homeSectorId: facility.sectorId,
        socketName: facility.socketName,
        payloadCustodyOnly: true,
      },
    });
  },

  _dematerializeSector(sectorId) {
    if (sectorId !== PQ019_HEIST_SECTOR_ID) return;
    const owned = this.state.heistFacilities;
    const activeCapsule = this._activeScheduleCapsule(owned.schedule);
    if (activeCapsule) this.helpers.removeEntity(activeCapsule.id);
    owned.capsuleEntityId = null;
    if (owned.schedule) owned.schedule.capsuleEntityId = null;

    for (const facility of Object.values(PQ019_FACILITIES)) {
      const record = this._facilityRecord(facility.id);
      if (record.visualEntityId != null) this.helpers.removeEntity(record.visualEntityId);
      if (record.headEntityId != null) this.helpers.removeEntity(record.headEntityId);
      record.visualEntityId = null;
      record.headEntityId = null;
    }
  },

  _launchScheduledCapsule(schedule) {
    const owned = this.state.heistFacilities;
    const rebound = this._activeScheduleCapsule(schedule);
    if (rebound) {
      schedule.status = 'launched';
      return rebound;
    }

    this.materializeForSector(PQ019_HEIST_SECTOR_ID);
    const launcher = this._facilityHead('heist_launcher');
    const catcher = this._facilityHead('lawful_catcher');
    if (!launcher || !catcher) return null;

    const dx = catcher.pos.x - launcher.pos.x;
    const dz = catcher.pos.z - launcher.pos.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0) || !Number.isFinite(length)) return null;
    const nx = dx / length;
    const nz = dz / length;
    const clearance = launcher.radius + PQ019_CAPSULE.radius + 2;
    const capsule = this.helpers.spawnEntity({
      type: 'payload',
      factionId: PQ019_CAPSULE.legalOwnerFactionId,
      ownerId: PQ019_CAPSULE.ownerId,
      team: 2,
      pos: {
        x: launcher.pos.x + nx * clearance,
        z: launcher.pos.z + nz * clearance,
      },
      vel: {
        x: nx * PQ019_CAPSULE.launchSpeed,
        z: nz * PQ019_CAPSULE.launchSpeed,
      },
      rot: Math.atan2(nz, nx),
      radius: PQ019_CAPSULE.radius,
      mass: PQ019_CAPSULE.mass,
      hull: PQ019_CAPSULE.hull,
      hullMax: PQ019_CAPSULE.hull,
      collides: true,
      ttl: Infinity,
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      physicsBody: {
        dynamic: true,
        radius: PQ019_CAPSULE.radius,
        mass: PQ019_CAPSULE.mass,
        inertiaY: 0.5 * PQ019_CAPSULE.mass * PQ019_CAPSULE.radius * PQ019_CAPSULE.radius,
        ccd: true,
        material: 'payload',
      },
      data: {
        heistFacilityRole: 'cargo_capsule',
        heistPayloadStableId: PQ019_CAPSULE.stableId,
        authoredPayloadAssetId: PQ019_CAPSULE.authoredPayloadAssetId,
        legalOwnerFactionId: PQ019_CAPSULE.legalOwnerFactionId,
        ownerId: PQ019_CAPSULE.ownerId,
        launchScheduleId: schedule.scheduleId,
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        transientSector: true,
      },
    });

    owned.capsuleEntityId = capsule.id;
    schedule.capsuleEntityId = capsule.id;
    schedule.status = 'launched';
    schedule.launchedAtTick = this.state.tick | 0;
    this.bus.emit('heist:capsuleLaunched', Object.freeze({
      scheduleId: schedule.scheduleId,
      capsuleEntityId: capsule.id,
      payloadStableId: PQ019_CAPSULE.stableId,
      launchedAtTick: schedule.launchedAtTick,
      source: 'heistFacilities',
    }));
    return capsule;
  },

  _facilityHead(facilityId) {
    const facility = PQ019_FACILITIES[facilityId];
    if (!facility) return null;
    const record = this._facilityRecord(facilityId);
    return entityIsAlive(this.state, record.headEntityId)
      || this._findOwnedEntity(facilityId, `${facility.role}_head`);
  },

  _onEntityDestroyed(id) {
    if (id == null) return;
    const owned = this.state.heistFacilities;
    if (owned.capsuleEntityId === id) owned.capsuleEntityId = null;
    if (owned.schedule?.capsuleEntityId === id) owned.schedule.capsuleEntityId = null;
    for (const record of Object.values(owned.facilities)) {
      if (record.visualEntityId === id) record.visualEntityId = null;
      if (record.headEntityId === id) record.headEntityId = null;
    }
  },

  _onPhysicsImpact(impact) {
    if (!(Number(impact.dp) > 0)) return;
    const a = entityIsAlive(this.state, impact.aId);
    const b = entityIsAlive(this.state, impact.bId);
    if (!a || !b) return;

    const owned = this.state.heistFacilities;
    const schedule = owned.schedule;
    if (!schedule || schedule.status !== 'launched') return;
    const activeCapsule = this._activeScheduleCapsule(schedule);
    if (!activeCapsule) return;
    const capsule = a.id === activeCapsule.id
      ? a
      : (b.id === activeCapsule.id ? b : null);
    if (!capsule) return;
    const head = capsule === a ? b : a;
    const facilityId = head.data?.heistFacilityId;
    if (!facilityId || head.data?.heistFacilityRole !== `${facilityId}_head`) return;
    if (facilityId !== 'lawful_catcher' && facilityId !== 'fence_receiver') return;
    if (!head.collides || head.collisionMask !== Masks.PAYLOAD
      || head.physicsBody?.dynamic !== false) return;

    const kind = facilityId === 'lawful_catcher'
      ? 'lawful_catch_contact'
      : 'fence_contact';
    const tick = Math.max(0, Math.trunc(finite(impact.tick, this.state.tick)));
    const scheduleId = schedule.scheduleId;
    const receiptId = [
      'pq019a',
      scheduleId,
      PQ019_CAPSULE.stableId,
      facilityId,
      tick,
    ].join(':');
    if (owned.candidateIds[receiptId]) return;

    const receipt = Object.freeze({
      receiptId,
      kind,
      source: 'physics:impact',
      scheduleId,
      payloadEntityId: capsule.id,
      payloadStableId: PQ019_CAPSULE.stableId,
      facilityId,
      physicsImpactDp: stableNumber(impact.dp),
      tick,
      pos: Object.freeze({
        x: stableNumber(impact.pos?.x),
        z: stableNumber(impact.pos?.z),
      }),
    });
    owned.candidateIds[receiptId] = true;
    owned.candidateReceipts.push(receipt);
    while (owned.candidateReceipts.length > MAX_CANDIDATE_RECEIPTS) {
      const removed = owned.candidateReceipts.shift();
      if (removed) delete owned.candidateIds[removed.receiptId];
    }
    this.bus.emit('heist:facilityCandidate', receipt);
  },

  _activeScheduleCapsule(schedule) {
    const owned = this.state.heistFacilities;
    const capsuleId = owned.capsuleEntityId;
    if (!schedule || capsuleId == null || schedule.capsuleEntityId !== capsuleId) return null;
    const capsule = entityIsAlive(this.state, capsuleId);
    if (!this._isOwnedCapsule(capsule)) return null;
    if (capsule.data.launchScheduleId !== schedule.scheduleId) return null;
    return capsule;
  },

  _isOwnedCapsule(entity) {
    return !!entity
      && entity.type === 'payload'
      && entity.data?.heistFacilityRole === 'cargo_capsule'
      && entity.data?.heistPayloadStableId === PQ019_CAPSULE.stableId
      && entity.data?.runtimeOwner === 'heistFacilities';
  },
};

export default heistFacilities;
