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
import {
  bindHeavyPartWeapons,
  buildHeavyPartLayouts,
  heavyStripConditionMet,
  worldPointForHeavyPart,
} from '../combat/heavyParts.js';

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

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
      });
    }
    bindHeavyPartWeapons(parent, runtime.parts);
    return runtime;
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

export default heavyPartsRuntime;
