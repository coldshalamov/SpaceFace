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
  ORCUS_GRAVITY_EDDY,
  anomalySiteForSector,
  debrisRiverForSector,
} from '../data/anomalySites.js';
import { fieldsFlag } from '../data/fields.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { SECTORS } from '../data/sectors.js';
import { SECTOR_ZONES } from '../data/sectorZones.js';
import { Masks } from '../core/entity.js';

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
    this._riverBodies = new Map();
    this._riverAnnounced = false;
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs = [
        this.bus.on('sector:exit', () => this._clearTransient('sector_exit')),
        this.bus.on('game:new', () => this._resetAll('new_game')),
        this.bus.on('game:newGame', () => this._resetAll('new_game')),
        this.bus.on('save:restoring', () => this._clearTransient('save_restoring')),
        this.bus.on('save:loaded', () => this._clearTransient('save_loaded', { capture: false })),
        this.bus.on('mining:yield', (payload) => this._onMiningYield(payload)),
        this.bus.on('salvage:completed', (payload) => this._onSalvageCompleted(payload)),
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
    this._updateDebrisRiver(activeRoute ? debrisRiverForSector(sectorId) : null, state);
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
      debrisRiver: Object.freeze({
        anomalyId: ASHFALL_DEBRIS_RIVER.id,
        liveBodies: riverBodies(this.state).length,
        depletedBodies: Object.values(records).filter((record) => record && record.depleted).length,
      }),
    });
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

  _clearTransient(why, options) {
    this._clearEddy(why);
    this._clearRiver(why, options);
  },

  _resetAll(why) {
    this._clearTransient(why, { capture: false });
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
