// Plan 25 — The Fuel Stack causal landmark.
//
// World owns its station body and chart registration; Economy owns the cheap berth transaction;
// Combat owns health/death; SG-02 owns every resulting velocity change. This system owns only the
// landmark's durable discovered/blown state and the transient component/debris materialization.

import { Masks } from '../core/entity.js';
import { ensurePhysicsBodySpec } from '../core/physicsAuthority.js';
import { triggerEmberCookOff } from '../combat/cookOff.js';
import { FUEL_STACK } from '../data/fuelStackLandmark.js';

const SCHEMA_VERSION = 1;
const DEBRIS_MASK = Masks.SHIP | Masks.DRONE | Masks.ASTEROID | Masks.STATION
  | Masks.PROJECTILE | Masks.PAYLOAD | Masks.WRECK;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function whole(value, fallback = 0) {
  return Math.max(0, Math.floor(finite(value, fallback)));
}

function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    discovered: false,
    blown: false,
    blownAtS: null,
    fuelPurchasedUnits: 0,
    blastCount: 0,
    lastBlastAffected: 0,
  };
}

function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    discovered: source.discovered === true,
    blown: source.blown === true,
    blownAtS: Number.isFinite(Number(source.blownAtS)) ? Number(source.blownAtS) : null,
    fuelPurchasedUnits: whole(source.fuelPurchasedUnits),
    blastCount: whole(source.blastCount),
    lastBlastAffected: whole(source.lastBlastAffected),
  };
}

function isFuelStackComponent(entity) {
  return !!(entity && entity.alive !== false && entity.data
    && entity.data.fuelStackLandmarkId === FUEL_STACK.id
    && Number.isInteger(entity.data.fuelStackComponentSlot));
}

function isFuelStackTransient(entity) {
  return !!(entity && entity.data && entity.data.fuelStackLandmarkId === FUEL_STACK.id);
}

function stableDebrisAngle(index) {
  return (index * 2.399963229728653) + Math.PI * 0.125;
}

export const fuelStack = {
  name: 'fuelStack',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry || null;
    this._cascadeActive = false;
    this._cascadeReceipts = [];
    this.state.fuelStack = normalizeState(this.state.fuelStack);
    this._unsubs = [
      this.bus.on('sector:enter', (payload) => this._onSectorEnter(payload || {})),
      this.bus.on('sector:exit', () => this._retireTransientBodies()),
      this.bus.on('heavyPart:lethal', (receipt) => this._onComponentLethal(receipt || {})),
      this.bus.on('combat:emberCookOff', (receipt) => this._onCookOff(receipt || {})),
      this.bus.on('fuelStack:refueled', (receipt) => this._onRefueled(receipt || {})),
      this.bus.on('save:restoring', () => this._retireTransientBodies()),
    ];
  },

  newGame() {
    this._retireTransientBodies();
    this.state.fuelStack = freshState();
    this._cascadeActive = false;
    this._cascadeReceipts = [];
  },

  update(_dt, state) {
    if (!state || state.world?.currentSectorId !== FUEL_STACK.sectorId) return;
    this._ensureComponents();
    if (state.fuelStack.discovered) return;
    const player = state.entities?.get?.(state.playerId);
    const station = this._stationEntity();
    if (!player || player.alive === false || !station || !player.pos || !station.pos) return;
    const distance = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
    if (distance > FUEL_STACK.arrivalRadius) return;
    state.fuelStack.discovered = true;
    this.bus.emit('poi:discovered', {
      poiId: FUEL_STACK.stationId,
      sectorId: FUEL_STACK.sectorId,
      source: FUEL_STACK.id,
      position: { x: station.pos.x, z: station.pos.z },
    });
    this.bus.emit('fuelStack:discovered', {
      landmarkId: FUEL_STACK.id,
      stationId: FUEL_STACK.stationId,
      distanceWU: distance,
      blown: state.fuelStack.blown,
    });
    this.bus.emit('toast', {
      text: state.fuelStack.blown
        ? 'THE FUEL STACK — pressure ring offline'
        : `THE FUEL STACK — ${FUEL_STACK.fuelCrPerUnit} CR/u · live flame cages`,
      kind: state.fuelStack.blown ? 'warn' : 'info',
      ttl: 4,
    });
  },

  serialize() {
    return normalizeState(this.state && this.state.fuelStack);
  },

  deserialize(value) {
    this._retireTransientBodies();
    this.state.fuelStack = normalizeState(value);
    this._cascadeActive = false;
    this._cascadeReceipts = [];
  },

  _onSectorEnter(payload) {
    this._retireTransientBodies();
    if (payload.sectorId !== FUEL_STACK.sectorId) return;
    this._ensureComponents();
  },

  _stationEntity() {
    for (const entity of this.state && this.state.entityList || []) {
      if (entity && entity.alive !== false && entity.type === 'station'
        && entity.data?.stationId === FUEL_STACK.stationId) return entity;
    }
    return null;
  },

  _components() {
    return (this.state && this.state.entityList || [])
      .filter(isFuelStackComponent)
      .sort((a, b) => a.data.fuelStackComponentSlot - b.data.fuelStackComponentSlot);
  },

  _ensureComponents() {
    if (this.state.fuelStack.blown) return 0;
    const station = this._stationEntity();
    if (!station || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return 0;
    const present = new Map(this._components().map((entity) => [entity.data.fuelStackComponentSlot, entity]));
    let spawned = 0;
    for (const definition of FUEL_STACK.components) {
      if (present.has(definition.slot)) continue;
      const entity = this.helpers.spawnEntity({
        type: 'heavyPart',
        team: 2,
        factionId: null,
        pos: {
          x: station.pos.x + definition.offset.x,
          z: station.pos.z + definition.offset.z,
        },
        vel: { x: 0, z: 0 },
        rot: definition.rot,
        angVel: 0,
        radius: FUEL_STACK.componentRadius,
        mass: 180,
        hull: FUEL_STACK.componentHull,
        hullMax: FUEL_STACK.componentHull,
        collides: true,
        collisionMask: Masks.PROJECTILE,
        physicsBody: false,
        flags: { persistent: false },
        data: {
          kind: 'fuel_stack_pressure_cage',
          name: `Fuel Stack flame cage ${definition.slot + 1}`,
          scanLabel: `VOLATILE FLAME CAGE ${definition.slot + 1} — CASCADE RISK`,
          parentId: station.id,
          partId: `heavy_ramscoop_drive_cluster_fuel_${definition.slot}`,
          partRole: 'pressure_cage',
          heavyPartState: 'mounted',
          fuelStackLandmarkId: FUEL_STACK.id,
          fuelStackComponentSlot: definition.slot,
          masslineTetherable: false,
          noOrdinaryRewards: true,
          noKillReward: true,
          noAftermath: true,
          deathCookOff: { ...FUEL_STACK.cookOff },
        },
      });
      if (entity) spawned++;
    }
    return spawned;
  },

  _spawnRuptureDebris(origin) {
    if (!origin || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return [];
    const spawned = [];
    for (let index = 0; index < FUEL_STACK.debrisCount; index++) {
      const angle = stableDebrisAngle(index);
      const radius = 4.8 + (index % 3) * 1.1;
      const mass = 22 + index * 5;
      const distance = 34 + (index % 4) * 13;
      const entity = this.helpers.spawnEntity({
        type: 'wreck',
        team: 2,
        factionId: null,
        pos: {
          x: origin.x + Math.cos(angle) * distance,
          z: origin.z + Math.sin(angle) * distance,
        },
        vel: { x: 0, z: 0 },
        rot: angle,
        angVel: (index % 2 ? -1 : 1) * (0.25 + index * 0.04),
        radius,
        mass,
        hull: 1,
        hullMax: 1,
        ttl: Infinity,
        collides: true,
        collisionMask: DEBRIS_MASK,
        physicsBody: {
          schemaVersion: 1,
          dynamic: true,
          ccd: true,
          radius,
          mass,
          inertiaY: 0.5 * mass * radius * radius,
          material: 'debris',
          shape: 'ball',
          revision: 1,
        },
        flags: { persistent: false },
        data: {
          kind: 'fuel_stack_rupture_debris',
          parentType: 'reactor',
          sourceId: FUEL_STACK.stationId,
          fuelStackLandmarkId: FUEL_STACK.id,
          fuelStackDebrisSlot: index,
          masslineTetherable: true,
          noAftermath: true,
        },
      });
      if (!entity) continue;
      ensurePhysicsBodySpec(entity);
      this.helpers.refreshEntityIndex?.(entity);
      spawned.push(entity);
    }
    return spawned;
  },

  _onComponentLethal(receipt) {
    const source = this.state?.entities?.get?.(receipt.targetId);
    if (!isFuelStackComponent(source)) return false;
    // Combat has already reduced this component to zero hull and deliberately handed the physical
    // child to its owner. Fire the existing bounded cook-off while the source is still queryable,
    // then retire only this Fuel Stack-owned transient body.
    const result = triggerEmberCookOff({
      state: this.state,
      bus: this.bus,
      helpers: this.helpers,
      source,
      killerId: receipt.attackerId ?? null,
      lethal: {
        origin: receipt.origin || null,
        packet: receipt.packet || null,
        result: receipt.result || null,
      },
    });
    source.alive = false;
    return result || true;
  },

  _onCookOff(receipt) {
    const source = this.state?.entities?.get?.(receipt.sourceId);
    if (!isFuelStackComponent(source)) return false;
    if (this._cascadeActive) {
      this._cascadeReceipts.push(receipt);
      return true;
    }
    if (this.state.fuelStack.blown) return false;

    this._cascadeActive = true;
    this._cascadeReceipts = [receipt];
    this.state.fuelStack.blown = true;
    this.state.fuelStack.blownAtS = finite(this.state.simTime);
    this.state.fuelStack.blastCount += 1;
    const components = this._components();
    this._spawnRuptureDebris(source.pos);

    const combat = this.registry && this.registry.get ? this.registry.get('combat') : null;
    if (combat && typeof combat.onHit === 'function') {
      for (const component of components) {
        if (component.id === source.id || component.alive === false) continue;
        combat.onHit({
          targetId: component.id,
          ownerId: receipt.actorId,
          damage: FUEL_STACK.componentHull * 4,
          damageType: 'explosive',
          pos: { x: component.pos.x, z: component.pos.z },
          weaponId: receipt.weaponId || null,
          origin: { kind: 'environment', id: FUEL_STACK.id },
        });
      }
    }

    const affectedIds = new Set();
    for (const pulse of this._cascadeReceipts) {
      for (const affected of pulse && pulse.affected || []) affectedIds.add(affected.entityId);
    }
    this.state.fuelStack.lastBlastAffected = affectedIds.size;
    const result = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      landmarkId: FUEL_STACK.id,
      stationId: FUEL_STACK.stationId,
      sourceId: receipt.sourceId,
      actorId: receipt.actorId ?? null,
      pulseCount: this._cascadeReceipts.length,
      affectedBodyCount: affectedIds.size,
      blownAtS: this.state.fuelStack.blownAtS,
    });
    this.bus.emit('fuelStack:blown', result);
    this.bus.emit('toast', { text: 'FUEL STACK CASCADE — pressure wall moving wreckage', kind: 'warn', ttl: 5 });
    this._cascadeActive = false;
    this._cascadeReceipts = [];
    return result;
  },

  _onRefueled(receipt) {
    if (receipt.stationId !== FUEL_STACK.stationId) return false;
    this.state.fuelStack.fuelPurchasedUnits += whole(receipt.units);
    return true;
  },

  _retireTransientBodies() {
    for (const entity of this.state && this.state.entityList || []) {
      if (entity && entity.alive !== false && isFuelStackTransient(entity)) entity.alive = false;
    }
  },

  destroy() {
    for (const unsub of this._unsubs || []) unsub?.();
    this._unsubs = [];
    this._cascadeActive = false;
    this._cascadeReceipts = [];
  },
};

export default fuelStack;
