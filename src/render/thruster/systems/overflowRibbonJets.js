// Short swept-ribbon jets for ships the production fleet could not admit.
//
// Same sheet construction as the player plume (plasmaRibbons.js), with fewer
// ribbons and stations so a busy scene does not grow a second sprite language.
// Slots are fixed at construction. claim/endFrame only mutate them.
// A ship that cannot take a slot is drawn as nothing — never as a flash or needle.
// This pool holds no flight history. Length here is the live jet only.

import { PlasmaRibbonPlume } from '../ribbon/plasmaRibbons.js';

export const OVERFLOW_ROLE_MAIN = 1;
export const OVERFLOW_ROLE_REVERSE_LEFT = 2;
export const OVERFLOW_ROLE_REVERSE_RIGHT = 3;
export const OVERFLOW_ROLE_VENT_PORT = 4;
export const OVERFLOW_ROLE_VENT_STARBOARD = 5;

/** Drive and brake jets. Nearest claimants win; the rest are suppressed. */
export const OVERFLOW_DRIVE_CAPACITY = 12;
/** Lateral weapon-vent sheets. Not stolen by the drive pool. */
export const OVERFLOW_VENT_CAPACITY = 4;

/** Below the player plume (12 / 56 / 7). Across stays >= 3 so the sheet can crease. */
export const OVERFLOW_JET_RIBBONS = 4;
export const OVERFLOW_JET_STATIONS = 16;
export const OVERFLOW_JET_ACROSS = 3;

/** How long a claimed drive jet keeps drawing between emit ticks. */
export const OVERFLOW_HOLD_S = 0.12;
/** Weapon-vent sheet lifetime. One event, then it burns out. */
export const OVERFLOW_VENT_LIFE_S = 0.42;

function paintDrive(plume, r, g, b) {
  const u = plume.material.uniforms;
  u.uCoreColor.value.setRGB(0.96, 0.97, 1);
  u.uMidColor.value.setRGB(r, g, b);
  u.uEdgeColor.value.setRGB(r * 0.22, g * 0.28, Math.min(1, b * 0.9));
}

function paintSteam(plume) {
  const u = plume.material.uniforms;
  u.uCoreColor.value.setRGB(0.94, 0.97, 1);
  u.uMidColor.value.setRGB(0.72, 0.86, 0.96);
  u.uEdgeColor.value.setRGB(0.42, 0.58, 0.78);
}

export class OverflowRibbonJets {
  constructor(THREE_NS, opts = {}) {
    this.THREE = THREE_NS;
    this.driveCapacity = opts.driveCapacity || OVERFLOW_DRIVE_CAPACITY;
    this.ventCapacity = opts.ventCapacity || OVERFLOW_VENT_CAPACITY;
    this.group = new THREE_NS.Group();
    this.group.name = 'sf-overflow-jets';
    this.group.visible = false;
    this.driveSlots = new Array(this.driveCapacity);
    this.ventSlots = new Array(this.ventCapacity);
    for (let i = 0; i < this.driveCapacity; i++) {
      this.driveSlots[i] = this._makeSlot(THREE_NS, `drive-${i}`);
    }
    for (let i = 0; i < this.ventCapacity; i++) {
      this.ventSlots[i] = this._makeSlot(THREE_NS, `vent-${i}`);
    }
    this.admitted = 0;
    this.rejected = 0;
    this._disposed = false;
    this._attached = false;
  }

  _makeSlot(T, name) {
    const plume = new PlasmaRibbonPlume(T, {
      ribbons: OVERFLOW_JET_RIBBONS,
      stations: OVERFLOW_JET_STATIONS,
      across: OVERFLOW_JET_ACROSS,
      jetLength: 8,
    });
    plume.mesh.name = `sf-overflow-jet-${name}`;
    const u = plume.material.uniforms;
    u.uCoherence.value = 0.48;
    u.uRollAmp.value = 0.45;
    u.uSwirl.value = 1.05;
    u.uWobble.value = 0.75;
    u.uCurve.value = 0.85;
    u.uFlowRate.value = 2.4;
    u.uAxialFreq.value = 3.2;
    plume.attach(this.group);
    const slot = {
      plume,
      entityId: null,
      role: 0,
      dist2: Infinity,
      hold: 0,
      life: 0,
      baseRadiance: 1.2,
      nozzle: { x: 0, y: 0, z: 0, aftX: -1, aftY: 0, aftZ: 0 },
      shape: {
        drive: 0,
        boost: 0,
        dash: 0,
        spool: 0,
        jetLength: 8,
        throatRadius: 0.9,
        spread: 1.05,
        radiance: 1.2,
        opacity: 0.17,
      },
    };
    slot.paint = (r, g, b) => paintDrive(plume, r, g, b);
    slot.paintSteam = () => paintSteam(plume);
    return slot;
  }

  attach(scene) {
    if (this._disposed || !scene || this._attached) return this.group;
    scene.add(this.group);
    this._attached = true;
    return this.group;
  }

  /**
   * Reserve a drive or brake slot. Reuses this entity's slot when it already has one.
   * Returns null when every slot is held by something nearer — caller must not draw a sprite.
   */
  claim(entityId, role, dist2) {
    const slots = this.driveSlots;
    const dist = Number.isFinite(dist2) ? dist2 : 0;
    let same = null;
    let free = null;
    let worst = null;
    let worstDist = -1;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.entityId === entityId && slot.role === role) {
        same = slot;
        break;
      }
      const live = slot.hold > 0;
      if (!live) {
        if (!free) free = slot;
        continue;
      }
      if (slot.dist2 > worstDist) {
        worst = slot;
        worstDist = slot.dist2;
      }
    }
    const slot = same || free || (worst && dist < worst.dist2 ? worst : null);
    if (!slot) {
      this.rejected += 1;
      return null;
    }
    slot.entityId = entityId;
    slot.role = role;
    slot.dist2 = dist;
    slot.hold = OVERFLOW_HOLD_S;
    slot.life = 0;
    this.admitted += 1;
    return slot;
  }

  /** Lateral vent sheet. Always returns a slot when the vent pool exists; oldest loses. */
  claimVent(entityId, role) {
    const slots = this.ventSlots;
    let same = null;
    let free = null;
    let oldest = null;
    let oldestLife = Infinity;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.entityId === entityId && slot.role === role) {
        same = slot;
        break;
      }
      if (slot.life <= 0 && !free) free = slot;
      if (slot.life < oldestLife) {
        oldest = slot;
        oldestLife = slot.life;
      }
    }
    const slot = same || free || oldest;
    if (!slot) return null;
    slot.entityId = entityId;
    slot.role = role;
    slot.hold = 0;
    slot.life = OVERFLOW_VENT_LIFE_S;
    this.admitted += 1;
    return slot;
  }

  endFrame(dt, camera, motionScale = 1, flashScale = 1) {
    if (this._disposed) return;
    const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    const motion = Number.isFinite(motionScale) ? motionScale : 1;
    const flash = Number.isFinite(flashScale) ? flashScale : 1;
    let any = false;
    any = this._presentSlots(this.driveSlots, step, camera, motion, flash, true) || any;
    any = this._presentSlots(this.ventSlots, step, camera, motion, flash, false) || any;
    this.group.visible = any;
  }

  _presentSlots(slots, step, camera, motion, flash, holdBased) {
    let any = false;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const plume = slot.plume;
      if (holdBased) {
        if (slot.hold > 0) slot.hold = Math.max(0, slot.hold - step);
        if (!(slot.hold > 0) || !(slot.shape.drive > 0.002)) {
          if (plume.mesh.visible) plume.reset();
          if (!(slot.hold > 0)) slot.entityId = null;
          continue;
        }
      } else if (slot.life > 0) {
        slot.life = Math.max(0, slot.life - step);
        const fade = slot.life / OVERFLOW_VENT_LIFE_S;
        slot.shape.drive = Math.max(0.2, fade);
        if (!(slot.life > 0)) {
          plume.reset();
          slot.entityId = null;
          continue;
        }
      } else {
        if (plume.mesh.visible) plume.reset();
        continue;
      }
      const throat = slot.shape.throatRadius || 0.8;
      const u = plume.material.uniforms;
      u.uWidthNear.value = throat * 0.55;
      u.uWidthFar.value = throat * 1.15;
      u.uEmbed.value = throat * 0.45;
      const ventFade = holdBased ? 1 : Math.max(0.35, slot.life / OVERFLOW_VENT_LIFE_S);
      slot.shape.radiance = slot.baseRadiance * flash * ventFade;
      slot.shape.dash = 0;
      slot.shape.spool = slot.shape.drive;
      if (camera) plume.setCamera(camera);
      plume.update(step * motion, slot.nozzle, slot.shape);
      any = any || plume.mesh.visible;
    }
    return any;
  }

  reset() {
    const clear = (slots) => {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        slot.hold = 0;
        slot.life = 0;
        slot.entityId = null;
        slot.shape.drive = 0;
        slot.plume.reset();
      }
    };
    clear(this.driveSlots);
    clear(this.ventSlots);
    this.group.visible = false;
    this.admitted = 0;
    this.rejected = 0;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    const drop = (slots) => {
      for (let i = 0; i < slots.length; i++) slots[i].plume.dispose();
    };
    drop(this.driveSlots);
    drop(this.ventSlots);
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
