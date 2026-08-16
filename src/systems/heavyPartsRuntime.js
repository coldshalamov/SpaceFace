// Plan 14 physical heavy-part runtime.
//
// Each authored part is one independently damageable child body. Mounted children follow a stable
// parent-local socket; lethal damage detaches that SAME entity as bounded dynamic debris. The parent
// stays alive as a towable/extractable physics asset after its authored strip condition is met.

import { Masks } from '../core/entity.js';
import {
  ensurePhysicsBodySpec,
  setThrusterHealth,
  writePhysicsControl,
} from '../core/physicsAuthority.js';
import { recordImpulseProvenance } from '../combat/impulseKernel.js';
import {
  bindHeavyPartWeapons,
  buildHeavyPartLayouts,
  heavyStripConditionMet,
  worldPointForHeavyPart,
} from '../combat/heavyParts.js';
import { makeEnemySpawnSpec } from './combat.js';

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
const CARRIER_RECIPE_ID = 'heavy_parts_carrier_lite_v1';
const FOUNDRY_RECIPE_ID = 'heavy_parts_foundry_v1';
const FAMILY_INITIAL_TELL_S = 1.25;
const CARRIER_LAUNCH_INTERVAL_S = 1.1;
const CARRIER_ENGAGE_RANGE = 960;
const FOUNDRY_RELEASE_INTERVAL_S = 0.72;
const FOUNDRY_ENGAGE_RANGE = 430;
const CHARGED_ORE_RADIUS = 4.2;
const CHARGED_ORE_MASS = 24;
const CHARGED_ORE_SPEED = 62;
const CHARGED_ORE_BLAST_RADIUS = 145;
const CHARGED_ORE_IMPULSE = 1500;
const IMPULSE_TARGET_TYPES = new Set(['ship', 'drone', 'payload', 'heavyPart']);

export const heavyPartsRuntime = {
  id: 'heavyPartsRuntime',
  name: 'heavyPartsRuntime',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('entity:spawned', ({ entity } = {}) => {
        if (entity && entity.type === 'ship') this._ensureParent(entity);
      }));
      this._unsubs.push(this.bus.on('heavyPart:lethal', (payload) => this._detach(payload || {})));
      this._unsubs.push(this.bus.on('projectile:hit', (payload) => this._onProjectileHit(payload || {})));
      this._unsubs.push(this.bus.on('physics:impact', (payload) => this._onPhysicsImpact(payload || {})));
      this._unsubs.push(this.bus.on('entity:killed', ({ id, killerId } = {}) => {
        this._detachRemainingParentParts(id, killerId);
      }));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  update(_dt, state) {
    const ships = state.entityIndex && state.entityIndex.ships || state.entityList || [];
    for (const parent of ships) {
      if (!parent || parent.alive === false || parent.type !== 'ship') continue;
      const runtime = this._ensureParent(parent);
      if (!runtime) continue;
      for (const record of runtime.parts) {
        if (record.destroyed) continue;
        const part = this.helpers.getEntity(record.entityId);
        if (!part || part.alive === false || !part.data || part.data.heavyPartState !== 'mounted') continue;
        const point = worldPointForHeavyPart(parent, record.localOffset);
        part.pos.set(point.x, 0, point.z);
        part.vel.copy(parent.vel);
        part.rot = parent.rot;
        part.angVel = parent.angVel || 0;
      }
      if (runtime.recipeId === CARRIER_RECIPE_ID) this._tickCarrierLite(parent, runtime, state);
      if (runtime.recipeId === FOUNDRY_RECIPE_ID) this._tickFoundry(parent, runtime, state);
      if (parent.data.heavyProwDisabled && parent.data.intent) parent.data.intent.ramPlate = false;
      if (runtime.disabled) this._holdDisabled(parent);
    }
  },

  _ensureParent(parent) {
    const data = parent && parent.data;
    const recipe = data && data.heavyPartRecipe;
    if (!recipe || !Array.isArray(recipe.parts) || recipe.id !== data.heavyPartRecipeId) return null;
    let runtime = data.heavyPartsRuntime;
    if (runtime && runtime.recipeId === recipe.id && Array.isArray(runtime.parts)) {
      this._ensureFightRuntime(runtime);
      bindHeavyPartWeapons(parent, runtime.parts);
      return runtime;
    }

    const layouts = buildHeavyPartLayouts(parent, recipe);
    runtime = data.heavyPartsRuntime = {
      schemaVersion: 1,
      recipeId: recipe.id,
      lethalLocked: true,
      disabled: false,
      parts: [],
    };
    for (const layout of layouts) {
      const point = worldPointForHeavyPart(parent, layout.localOffset);
      const child = this.helpers.spawnEntity({
        type: 'heavyPart',
        pos: point,
        vel: { x: parent.vel.x, z: parent.vel.z },
        rot: parent.rot,
        radius: layout.radius,
        mass: layout.mass,
        team: parent.team,
        ownerId: parent.id,
        factionId: parent.factionId,
        hull: layout.hp,
        hullMax: layout.hp,
        collides: true,
        collisionMask: Masks.PROJECTILE,
        physicsBody: false,
        data: {
          kind: 'heavy_part',
          parentId: parent.id,
          recipeId: recipe.id,
          partId: layout.partId,
          partRole: layout.partRole,
          subsystemId: layout.subsystemId,
          combatProfileId: 'combat_profile_tether_anchor',
          binding: layout.binding,
          heavyPartState: 'mounted',
          masslineTetherable: false,
          noKillReward: true,
          noAftermath: true,
        },
      });
      runtime.parts.push({
        partId: layout.partId,
        partRole: layout.partRole,
        subsystemId: layout.subsystemId,
        binding: layout.binding,
        localOffset: { ...layout.localOffset },
        entityId: child.id,
        destroyed: false,
        weaponSlotIndex: null,
        uses: 0,
      });
    }
    this._ensureFightRuntime(runtime);
    bindHeavyPartWeapons(parent, runtime.parts);
    return runtime;
  },

  _ensureFightRuntime(runtime) {
    if (!runtime || (runtime.recipeId !== CARRIER_RECIPE_ID && runtime.recipeId !== FOUNDRY_RECIPE_ID)) return null;
    for (const record of runtime.parts) {
      if (!Number.isFinite(record.uses) || record.uses < 0) record.uses = 0;
    }
    const kind = runtime.recipeId === CARRIER_RECIPE_ID ? 'carrier_lite' : 'foundry';
    if (!runtime.fight || runtime.fight.kind !== kind) {
      runtime.fight = {
        schemaVersion: 1,
        kind,
        nextActionAt: (Number(this.state && this.state.simTime) || 0) + FAMILY_INITIAL_TELL_S,
        releasedTotal: 0,
      };
    }
    return runtime.fight;
  },

  _tickCarrierLite(parent, runtime, state) {
    const fight = this._ensureFightRuntime(runtime);
    const target = this._hostileTarget(parent, state, CARRIER_ENGAGE_RANGE);
    if (!fight || !target || (state.simTime || 0) < fight.nextActionAt) return;
    const bays = runtime.parts.filter((record) => record.partRole === 'bay'
      && record.binding?.kind === 'launch_bay'
      && !record.destroyed
      && record.uses < positiveCapacity(record.binding.capacity));
    if (!bays.length) return;
    bays.sort((a, b) => {
      const aCapacity = positiveCapacity(a.binding.capacity);
      const bCapacity = positiveCapacity(b.binding.capacity);
      const fillDelta = (a.uses / aCapacity) - (b.uses / bCapacity);
      return fillDelta || String(a.partId).localeCompare(String(b.partId));
    });
    const bay = bays[0];
    const part = this.helpers.getEntity(bay.entityId);
    if (!part || part.alive === false || part.data?.heavyPartState !== 'mounted') return;
    const sequence = fight.releasedTotal;
    const archetype = sequence % 2 === 0 ? 'mote_swarmer' : 'wasp_swarmer';
    const outward = outwardUnit(parent, part);
    const spawnPos = {
      x: part.pos.x + outward.x * (part.radius + 8),
      z: part.pos.z + outward.z * (part.radius + 8),
    };
    const spec = makeEnemySpawnSpec(archetype, 1, spawnPos, {
      factionId: parent.factionId,
      startedTick: state.tick,
      motive: 'carrier_screen_launch',
      engagementTrigger: 'physical_launch_bay_release',
    });
    spec.team = parent.team;
    spec.factionId = parent.factionId;
    spec.vel = {
      x: parent.vel.x + outward.x * 54,
      z: parent.vel.z + outward.z * 54,
    };
    spec.data = {
      ...spec.data,
      encounter: true,
      combat: { ...(spec.data && spec.data.combat), targetId: target.id },
      heavyLaunch: {
        schemaVersion: 1,
        carrierId: parent.id,
        bayPartId: bay.partId,
        sequence,
      },
    };
    const launched = this.helpers.spawnEntity(spec);
    bay.uses++;
    fight.releasedTotal++;
    fight.nextActionAt = (state.simTime || 0) + CARRIER_LAUNCH_INTERVAL_S;
    this.bus.emit('heavy:bayLaunch', {
      parentId: parent.id,
      bayPartId: bay.partId,
      entityId: launched.id,
      archetype,
      used: bay.uses,
      capacity: positiveCapacity(bay.binding.capacity),
      pos: { x: spawnPos.x, z: spawnPos.z },
    });
  },

  _tickFoundry(parent, runtime, state) {
    const fight = this._ensureFightRuntime(runtime);
    const target = this._hostileTarget(parent, state, FOUNDRY_ENGAGE_RANGE);
    if (!fight || !target || (state.simTime || 0) < fight.nextActionAt) return;
    const rack = runtime.parts.find((record) => record.partRole === 'rack'
      && record.binding?.kind === 'ore_mine_rack');
    if (!rack || rack.destroyed || rack.uses >= positiveCapacity(rack.binding.capacity)) return;
    const rackPart = this.helpers.getEntity(rack.entityId);
    if (!rackPart || rackPart.alive === false || rackPart.data?.heavyPartState !== 'mounted') return;
    const toTarget = normalized(target.pos.x - parent.pos.x, target.pos.z - parent.pos.z);
    const outward = outwardUnit(parent, rackPart);
    const spawnPos = {
      x: rackPart.pos.x + outward.x * (rackPart.radius + CHARGED_ORE_RADIUS + 3),
      z: rackPart.pos.z + outward.z * (rackPart.radius + CHARGED_ORE_RADIUS + 3),
    };
    const spread = (rack.uses - 1) * 0.14;
    const releaseDir = rotateUnit(toTarget, spread);
    const mine = this.helpers.spawnEntity({
      type: 'payload',
      team: parent.team,
      factionId: parent.factionId,
      ownerId: parent.id,
      pos: spawnPos,
      vel: {
        x: parent.vel.x + releaseDir.x * CHARGED_ORE_SPEED,
        z: parent.vel.z + releaseDir.z * CHARGED_ORE_SPEED,
      },
      rot: Math.atan2(releaseDir.z, releaseDir.x),
      radius: CHARGED_ORE_RADIUS,
      mass: CHARGED_ORE_MASS,
      hull: 1,
      hullMax: 1,
      collides: true,
      collisionMask: Masks.SHIP | Masks.DRONE | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
      physicsBody: {
        mass: CHARGED_ORE_MASS,
        radius: CHARGED_ORE_RADIUS,
        inertiaY: 0.5 * CHARGED_ORE_MASS * CHARGED_ORE_RADIUS * CHARGED_ORE_RADIUS,
        shape: 'ball',
        dynamic: true,
        ccd: true,
        material: 'debris',
        revision: 1,
      },
      data: {
        kind: 'charged_ore_mine',
        ownerId: parent.id,
        rackPartId: rack.partId,
        releaseIndex: rack.uses,
        detonated: false,
        blastRadius: CHARGED_ORE_BLAST_RADIUS,
        impulse: CHARGED_ORE_IMPULSE,
      },
    });
    ensurePhysicsBodySpec(mine);
    this.helpers.refreshEntityIndex?.(mine);
    rack.uses++;
    fight.releasedTotal++;
    fight.nextActionAt = (state.simTime || 0) + FOUNDRY_RELEASE_INTERVAL_S;
    this.bus.emit('heavy:chargedOreReleased', {
      parentId: parent.id,
      rackPartId: rack.partId,
      mineId: mine.id,
      used: rack.uses,
      capacity: positiveCapacity(rack.binding.capacity),
      pos: { x: spawnPos.x, z: spawnPos.z },
      velocity: { x: mine.vel.x, z: mine.vel.z },
    });
  },

  _hostileTarget(parent, state, maxRange) {
    const combatTargetId = parent.data && parent.data.combat && parent.data.combat.targetId;
    const candidateId = combatTargetId == null ? state.playerId : combatTargetId;
    const target = candidateId == null ? null : this.helpers.getEntity(candidateId);
    if (!target || target.alive === false || target.team === parent.team) return null;
    const dx = target.pos.x - parent.pos.x;
    const dz = target.pos.z - parent.pos.z;
    return dx * dx + dz * dz <= maxRange * maxRange ? target : null;
  },

  _onProjectileHit({ targetId, ownerId } = {}) {
    const mine = this.helpers.getEntity(targetId);
    if (!isChargedOreMine(mine)) return false;
    return this._detonateChargedOre(mine, 'projectile', ownerId);
  },

  _onPhysicsImpact({ aId, bId, causalActorId } = {}) {
    const a = this.helpers.getEntity(aId);
    const b = this.helpers.getEntity(bId);
    const mine = isChargedOreMine(a) ? a : isChargedOreMine(b) ? b : null;
    if (!mine) return false;
    const other = mine === a ? b : a;
    if (!other || other.id === mine.ownerId) return false;
    const trigger = other.type === 'asteroid' || other.type === 'station' ? 'terrain' : 'contact';
    return this._detonateChargedOre(mine, trigger, causalActorId);
  },

  _detonateChargedOre(mine, trigger, actorId) {
    if (!isChargedOreMine(mine) || mine.data.detonated) return false;
    mine.data.detonated = true;
    const pos = { x: mine.pos.x, z: mine.pos.z };
    const blastRadius = Number(mine.data.blastRadius) || CHARGED_ORE_BLAST_RADIUS;
    const impulse = Number(mine.data.impulse) || CHARGED_ORE_IMPULSE;
    const physics = this.helpers && this.helpers.combatPhysics;
    const hits = [];
    for (const entity of this.state.entityList || []) {
      if (!entity || entity === mine || entity.alive === false || !IMPULSE_TARGET_TYPES.has(entity.type)) continue;
      const dx = entity.pos.x - pos.x;
      const dz = entity.pos.z - pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= blastRadius) continue;
      const direction = distance > 1e-5 ? { x: dx / distance, z: dz / distance } : stableDirection(entity.id, mine.id);
      const magnitude = impulse * Math.max(0, 1 - distance / blastRadius);
      const provenance = {
        actorId: actorId == null ? mine.ownerId : actorId,
        weaponId: 'heavy_foundry_charged_ore',
        tag: 'charged_ore_detonation',
        appliedTick: this.state.tick,
      };
      const accepted = physics && typeof physics.applyImpulse === 'function'
        ? physics.applyImpulse({
          entityId: entity.id,
          impulse: { x: direction.x * magnitude, z: direction.z * magnitude },
          point: null,
          reason: 'charged_ore_detonation',
          tick: this.state.tick,
          provenance,
        })
        : false;
      if (accepted !== false) {
        recordImpulseProvenance(entity, { ...provenance, magnitude });
        hits.push(entity.id);
      }
    }
    mine.alive = false;
    this.bus.emit('heavy:chargedOreDetonated', {
      mineId: mine.id,
      parentId: mine.ownerId,
      rackPartId: mine.data.rackPartId,
      trigger,
      actorId: actorId == null ? null : actorId,
      pos,
      blastRadius,
      hits,
    });
    return true;
  },

  _detach({ targetId, attackerId } = {}) {
    const part = this.helpers.getEntity(targetId);
    if (!part || part.type !== 'heavyPart' || !part.data || part.data.heavyPartState !== 'mounted') return false;
    const parent = this.helpers.getEntity(part.data.parentId);
    const runtime = parent && parent.data && parent.data.heavyPartsRuntime;
    const record = runtime && runtime.parts.find((row) => row.entityId === part.id);
    if (!parent || !record || record.destroyed) return false;

    record.destroyed = true;
    const offsetX = part.pos.x - parent.pos.x;
    const offsetZ = part.pos.z - parent.pos.z;
    const omega = Number(parent.angVel) || 0;
    const spinSign = stableSign(parent.id, record.partId);
    const outwardLength = Math.hypot(offsetX, offsetZ) || 1;
    const separation = 3 + (stableUnit(parent.id, record.partId) * 4);
    part.vel.set(
      parent.vel.x - omega * offsetZ + (offsetX / outwardLength) * separation,
      0,
      parent.vel.z + omega * offsetX + (offsetZ / outwardLength) * separation,
    );
    part.angVel = omega + spinSign * (0.7 + stableUnit(record.partId, parent.id) * 0.9);
    part.data.heavyPartState = 'debris';
    part.data.detached = true;
    part.data.detachedById = attackerId == null ? null : attackerId;
    part.data.masslineTetherable = true;
    part.flags.invuln = true;
    part.collisionMask = Masks.SHIP | Masks.DRONE | Masks.ASTEROID | Masks.STATION | Masks.PAYLOAD;
    part.physicsBody = {
      mass: part.mass,
      radius: part.radius,
      inertiaY: Math.max(1, 0.5 * part.mass * part.radius * part.radius),
      shape: 'ball',
      dynamic: true,
      ccd: true,
      material: 'debris',
      revision: 1,
    };
    ensurePhysicsBodySpec(part);
    this.helpers.refreshEntityIndex?.(part);

    if (record.weaponSlotIndex != null) {
      const weapon = parent.data.weapons && parent.data.weapons.find((row) => row.slotIndex === record.weaponSlotIndex);
      if (weapon) weapon.heavyPartDestroyed = true;
    }
    if (record.partRole === 'drive') this._disableBoundDrive(parent, runtime, record);
    if (record.partRole === 'bay') {
      parent.data.disabledHeavyBays = parent.data.disabledHeavyBays || [];
      if (!parent.data.disabledHeavyBays.includes(record.partId)) parent.data.disabledHeavyBays.push(record.partId);
    }
    if (record.partRole === 'prow') parent.data.heavyProwDisabled = true;

    if (!runtime.disabled && heavyStripConditionMet(parent.data.heavyPartRecipe, runtime.parts)) {
      runtime.disabled = true;
      // The strip transition itself never kills the hull. After that living-barge beat, normal
      // terrain/atmosphere/collision damage may finish it and preserve ordinary kill provenance.
      runtime.lethalLocked = false;
      parent.data.heavyDisabled = true;
      parent.data.towable = true;
      parent.data.beamExtractableHeavy = true;
      parent.data.masslineTetherable = true;
      if (parent.data.ai) parent.data.ai.passive = true;
      this._holdDisabled(parent);
      this.bus.emit('heavy:disabled', { parentId: parent.id, recipeId: runtime.recipeId, partId: record.partId });
    }
    this.bus.emit('heavyPart:detached', {
      parentId: parent.id,
      partId: record.partId,
      entityId: part.id,
      attackerId: attackerId == null ? null : attackerId,
      velocity: { x: part.vel.x, z: part.vel.z },
      angVel: part.angVel,
    });
    return true;
  },

  _disableBoundDrive(parent, runtime, record) {
    const drives = runtime.parts.filter((row) => row.partRole === 'drive');
    if (drives.length <= 1) {
      for (const id of ['drive-port', 'drive-starboard', 'rcs-port', 'rcs-starboard']) setThrusterHealth(parent, id, 0);
      return;
    }
    const side = /port/.test(record.partId) ? 'port' : /starboard/.test(record.partId) ? 'starboard' : null;
    if (side) {
      setThrusterHealth(parent, `drive-${side}`, 0);
      setThrusterHealth(parent, `rcs-${side}`, 0);
    }
  },

  _detachRemainingParentParts(parentId, attackerId) {
    const parent = this.helpers.getEntity(parentId);
    const runtime = parent?.data?.heavyPartsRuntime;
    if (!runtime || !Array.isArray(runtime.parts)) return;
    for (const record of runtime.parts) {
      if (!record.destroyed) this._detach({ targetId: record.entityId, attackerId });
    }
  },

  _holdDisabled(parent) {
    const intent = parent.data && parent.data.intent;
    if (intent) {
      intent.fire = false;
      intent.fireGroup = null;
      intent.moveX = 0;
      intent.moveZ = 0;
      intent.turn = 0;
      intent.boost = false;
    }
    parent.flags.boosting = false;
    writePhysicsControl(parent, {
      mode: 'disabled-heavy-barge',
      force: ZERO,
      torque: ZERO,
      source: 'heavy-parts-runtime',
      maxSpeed: Infinity,
    });
  },
};

function stableUnit(a, b) {
  const text = `${String(a)}|${String(b)}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function stableSign(a, b) {
  return stableUnit(a, b) < 0.5 ? -1 : 1;
}

function positiveCapacity(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function normalized(x, z) {
  const length = Math.hypot(x, z);
  return length > 1e-8 ? { x: x / length, z: z / length } : { x: 1, z: 0 };
}

function outwardUnit(parent, part) {
  return normalized(part.pos.x - parent.pos.x, part.pos.z - parent.pos.z);
}

function rotateUnit(unit, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: unit.x * c - unit.z * s, z: unit.x * s + unit.z * c };
}

function stableDirection(a, b) {
  const angle = stableUnit(a, b) * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function isChargedOreMine(entity) {
  return !!(entity && entity.alive !== false && entity.type === 'payload'
    && entity.data && entity.data.kind === 'charged_ore_mine');
}

export default heavyPartsRuntime;
