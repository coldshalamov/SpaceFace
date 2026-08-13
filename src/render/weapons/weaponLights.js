import * as THREE from 'three';

export const WEAPON_LIGHT_POOL_SIZE = 16;

export function visiblePointLightBudget(eventLightCount) {
  return (Number(eventLightCount) || 0) + WEAPON_LIGHT_POOL_SIZE;
}

export class WeaponLightPool {
  constructor(scene, options = {}) {
    this.capacity = Math.max(1, options.capacity || WEAPON_LIGHT_POOL_SIZE);
    this.slots = [];
    this._scratch = new THREE.Color();
    this.group = new THREE.Group();
    this.group.name = 'SF_WeaponLightPool';
    for (let i = 0; i < this.capacity; i++) {
      const light = new THREE.PointLight(0x39d0ff, 0, 16, 2);
      light.name = `SF_WeaponLight_${i}`;
      light.visible = true;
      light.castShadow = false;
      this.group.add(light);
      this.slots.push({
        light,
        age: 0,
        life: 0.12,
        peak: 0,
        priority: 0,
        alive: 0,
      });
    }
    if (scene) scene.add(this.group);
  }

  spawn({ x, y, z, color, intensity, distance, life, priority }) {
    let slot = this.slots[0];
    for (let i = 0; i < this.slots.length; i++) {
      const candidate = this.slots[i];
      if (!candidate.alive) { slot = candidate; break; }
      if (candidate.priority < slot.priority) slot = candidate;
    }
    slot.alive = 1;
    slot.age = 0;
    slot.life = Math.max(0.05, life || 0.12);
    slot.peak = Math.max(0, intensity || 2);
    slot.priority = Number.isFinite(priority) ? priority : 0.5;
    slot.light.position.set(x || 0, y || 0.4, z || 0);
    slot.light.distance = Math.max(4, distance || 14);
    slot.light.decay = 2;
    this._scratch.set(color || '#39d0ff');
    slot.light.color.copy(this._scratch);
    slot.light.intensity = slot.peak;
    return slot;
  }

  update(dt) {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.alive) {
        slot.light.intensity = 0;
        continue;
      }
      slot.age += dt;
      if (slot.age >= slot.life) {
        slot.alive = 0;
        slot.priority = 0;
        slot.light.intensity = 0;
        continue;
      }
      const t = slot.age / slot.life;
      slot.light.intensity = slot.peak * (1 - t) * (1 - t);
    }
  }

  get size() {
    return this.capacity;
  }

  dispose() {
    for (const slot of this.slots) {
      if (slot.light.parent) slot.light.parent.remove(slot.light);
      slot.light.dispose?.();
    }
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
