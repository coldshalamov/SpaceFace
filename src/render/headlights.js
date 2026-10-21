// Ship headlights are light. A fixed pool of real THREE.SpotLights: slot 0 rides the player's
// bow, the rest go to the nearest powered NPC hulls, so lamps sweep across the dark sides of the
// ships and rocks around you. Vacuum scatters nothing, so a headlight is only ever seen where it
// lands on a surface. Never add beam, lens or cone geometry to fake one (owner, 2026-10-20).
//
// The pool is mounted once with the sector light rig, before the shader warm-up, and stays
// mounted and visible for the renderer's lifetime. three bakes the light count into every
// program, so a lamp switches off by intensity, never by `.visible` or by unmounting.
// Look values: LOOK_HEADLIGHT in src/data/lookMoods.js. +X forward on the XZ plane, heading `rot`.

import * as THREE from 'three';
import { LOOK_HEADLIGHT } from '../data/lookMoods.js';
import { noteShadowCensusLightMutation } from './shadowDepthAdmission.js';

export const HEADLIGHT_POOL_SIZE = 3;
// NPC lamp assignment is re-scored a few times a second; poses update every frame.
const ASSIGN_INTERVAL = 0.25;

const _local = { x: 0, z: 0 };
const _forward = new THREE.Vector3();

function poweredShip(entity, playerId) {
  return entity && entity.type === 'ship' && entity.alive !== false && entity.id !== playerId
    && entity.pos && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)
    && entity.docked !== true && entity.derelict !== true
    && !(entity.data && (entity.data.derelict === true || entity.data.disabled === true));
}

export class HeadlightPool {
  constructor(scene, { size = HEADLIGHT_POOL_SIZE, look = LOOK_HEADLIGHT } = {}) {
    this.look = look;
    this.group = new THREE.Group();
    this.group.name = 'SF_HeadlightPool';
    this.slots = [];
    for (let i = 0; i < Math.max(1, size); i++) {
      const light = new THREE.SpotLight(look.colorHex, 0, look.range, look.angle, look.penumbra, look.decay);
      light.name = `SF_Headlight_${i}`;
      light.castShadow = false;
      light.visible = true;
      this.group.add(light);
      this.group.add(light.target);
      // `entity` is the hull the lamp is on; `next` waits for the lamp to fade out before taking it.
      this.slots.push({ light, entity: null, next: null, level: 0 });
    }
    this._assignClock = ASSIGN_INTERVAL;
    this._nearEntity = new Array(Math.max(0, size - 1)).fill(null);
    this._nearDist = new Float64Array(Math.max(0, size - 1));
    this.scene = null;
    if (scene) {
      scene.add(this.group);
      this.scene = scene;
      noteShadowCensusLightMutation();
    }
  }

  get size() { return this.slots.length; }

  /**
   * Pose and fade every lamp for this frame.
   * @param {object} state  game state (playerId, entities / entityList)
   * @param {number} dt     frame seconds
   * @param {{toLocal:Function}} membrane  galactic -> frame-local XZ
   * @param {{playerLamp?:boolean, meshes?:Map}} [opts]  playerLamp=false hands the player's bow to
   *   another owner; `meshes` (entity id -> presented root) lets a lamp ride the drawn, interpolated
   *   hull instead of the raw sim pose, so it never jitters against the ship it is mounted on.
   */
  update(state, dt, membrane, opts) {
    if (!state || !membrane || typeof membrane.toLocal !== 'function') return;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const look = this.look;
    const player = state.playerId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    const playerLit = !!(player && player.alive !== false && player.pos && !(opts && opts.playerLamp === false));
    this.slots[0].next = playerLit ? player : null;

    this._assignClock += step;
    if (this._assignClock >= ASSIGN_INTERVAL) {
      this._assignClock = 0;
      this._assignNpcLamps(state, player);
    }

    const rate = look.fadeSeconds > 0 ? step / look.fadeSeconds : 1;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const want = slot.entity && slot.entity === slot.next && slot.entity.alive !== false ? 1 : 0;
      slot.level = want ? Math.min(1, slot.level + rate) : Math.max(0, slot.level - rate);
      if (slot.level <= 0 && slot.entity !== slot.next) slot.entity = slot.next;
      const light = slot.light;
      const entity = slot.entity;
      if (!entity || slot.level <= 0 || !entity.pos) {
        light.intensity = 0;
        continue;
      }
      const root = opts && opts.meshes ? opts.meshes.get(entity.id) : null;
      let fx, fz;
      if (root && root.parent && root.visible !== false) {
        _local.x = root.position.x;
        _local.z = root.position.z;
        _forward.set(1, 0, 0).applyQuaternion(root.quaternion);
        const len = Math.hypot(_forward.x, _forward.z) || 1;
        fx = _forward.x / len;
        fz = _forward.z / len;
      } else {
        membrane.toLocal(entity.pos, _local);
        const rot = Number.isFinite(entity.rot) ? entity.rot : 0;
        fx = Math.cos(rot);
        fz = Math.sin(rot);
      }
      const local = _local;
      const nose = (Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 8) * look.noseFactor;
      const x = local.x + fx * nose;
      const z = local.z + fz * nose;
      // Mounted high and pitched down: the chase camera sees the tops of hulls and rocks, so a
      // lamp raking along the plane would only graze what the player can see.
      light.position.set(x, look.height, z);
      light.target.position.set(x + fx * look.aimDistance, look.aimHeight, z + fz * look.aimDistance);
      light.target.updateMatrixWorld();
      const eased = slot.level * slot.level * (3 - 2 * slot.level);
      light.intensity = look.intensity * (i === 0 ? 1 : look.npcIntensity) * eased;
    }
  }

  // The NPC lamps go to the nearest powered hulls. A lamp keeps its hull while that hull stays in
  // reach (no flicker as rankings shuffle); a freed lamp fades out before it moves.
  _assignNpcLamps(state, player) {
    const npcSlots = this.slots.length - 1;
    if (npcSlots <= 0) return;
    const reach = this.look.npcReach;
    const px = player && player.pos ? player.pos.x : NaN;
    const pz = player && player.pos ? player.pos.z : NaN;
    const near = (entity) => Number.isFinite(px)
      && Math.hypot(entity.pos.x - px, entity.pos.z - pz) <= reach;
    for (let i = 1; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const held = slot.next;
      if (held && !(poweredShip(held, state.playerId) && near(held)
        && state.entities && state.entities.get(held.id) === held)) slot.next = null;
    }
    if (!Number.isFinite(px)) return;
    const nearEntity = this._nearEntity;
    const nearDist = this._nearDist;
    let count = 0;
    const list = Array.isArray(state.entityList) ? state.entityList
      : (state.entities && typeof state.entities.values === 'function' ? state.entities.values() : null);
    if (!list) return;
    for (const entity of list) {
      if (!poweredShip(entity, state.playerId)) continue;
      const d = Math.hypot(entity.pos.x - px, entity.pos.z - pz);
      if (d > reach) continue;
      let lit = false;
      for (let i = 1; i < this.slots.length; i++) if (this.slots[i].next === entity) { lit = true; break; }
      if (lit) continue;
      // Keep only the nearest `npcSlots` unlit hulls: a fixed insertion list, no allocation.
      let at = count;
      while (at > 0 && nearDist[at - 1] > d) at--;
      if (at >= npcSlots) continue;
      for (let k = Math.min(count, npcSlots - 1); k > at; k--) {
        nearEntity[k] = nearEntity[k - 1];
        nearDist[k] = nearDist[k - 1];
      }
      nearEntity[at] = entity;
      nearDist[at] = d;
      if (count < npcSlots) count++;
    }
    let c = 0;
    for (let i = 1; i < this.slots.length && c < count; i++) {
      if (!this.slots[i].next) this.slots[i].next = nearEntity[c++];
    }
    for (let k = 0; k < nearEntity.length; k++) nearEntity[k] = null;
  }

  /** Session/sector boundary: every lamp off at once, hulls forgotten. The lights stay mounted. */
  clear() {
    for (const slot of this.slots) {
      slot.entity = null;
      slot.next = null;
      slot.level = 0;
      slot.light.intensity = 0;
    }
    this._assignClock = ASSIGN_INTERVAL;
  }

  dispose() {
    const mounted = this.group.parent != null;
    this.group.removeFromParent();
    for (const slot of this.slots) slot.light.dispose?.();
    if (mounted) noteShadowCensusLightMutation();
    this.scene = null;
  }
}
