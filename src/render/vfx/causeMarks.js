// Bounded world-space marks: hull scars, a wreck handoff streak, and a field edge.
// Line segments in the play plane. Not camera-facing cards.
import * as THREE from 'three';
import {
  createHandoffBook,
  createScarBook,
  fieldDodgeEdge,
  noteHullScar,
  noteKillHandoff,
  offerWreckHandoff,
  releaseHullScars,
  scarWorldEnds,
  wreckStreakOn,
} from './effectsCause.js';

const SCARS = 24;
const RING = 28;
const HANDOFF = 3;
const CUTS = 4;
const SHAPES = 24;
const SEGMENTS = SCARS + RING + HANDOFF + CUTS + SHAPES;

export class CauseMarkLayer {
  constructor(scene, toLocal) {
    this.scene = scene;
    this.toLocal = toLocal || ((x, z, out) => { out.x = x; out.z = z; return out; });
    this.scars = createScarBook(SCARS);
    this.handoff = createHandoffBook();
    this.wells = [];
    this.cuts = [];
    this.shapes = [];
    this._local = { x: 0, z: 0 };
    this._resolve = null;
    this._fallbackBook = { get: (id) => (this._resolve ? this._resolve(id) : null) };
    this._streak = { wreckId: 0, ax: 0, az: 0, bx: 0, bz: 0 };
    this.positions = new Float32Array(SEGMENTS * 2 * 3);
    this.colors = new Float32Array(SEGMENTS * 2 * 3);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'sf-cause-marks';
    if (scene && typeof scene.add === 'function') scene.add(this.mesh);
  }

  noteScar(hit) {
    return noteHullScar(this.scars, hit);
  }

  noteKill(kill, now) {
    return noteKillHandoff(this.handoff, kill, now);
  }

  offerWreck(entity, now) {
    return offerWreckHandoff(this.handoff, entity, now);
  }

  noteCut(mark, now) {
    if (!mark || mark.vanish || mark.sprite) return false;
    const ax = Number(mark.ax);
    const az = Number(mark.az);
    const bx = Number(mark.bx);
    const bz = Number(mark.bz);
    if (![ax, az, bx, bz].every(Number.isFinite)) return false;
    if (this.cuts.length >= CUTS) this.cuts.shift();
    this.cuts.push({
      ax, az, bx, bz,
      gain: Math.max(0.1, Number(mark.gain) > 0 ? Number(mark.gain) : 0.1),
      until: Number(now) + 0.55,
    });
    return true;
  }

  noteSilhouette(mark, now) {
    if (!mark || mark.sprite || mark.vanish || !Array.isArray(mark.segments) || mark.segments.length < 2) {
      return false;
    }
    const segments = [];
    for (let i = 0; i < mark.segments.length; i++) {
      const src = mark.segments[i];
      const ax = Number(src && src.ax);
      const az = Number(src && src.az);
      const bx = Number(src && src.bx);
      const bz = Number(src && src.bz);
      if (![ax, az, bx, bz].every(Number.isFinite)) continue;
      segments.push({ ax, az, bx, bz });
    }
    if (segments.length < 2) return false;
    if (this.shapes.length >= 6) this.shapes.shift();
    this.shapes.push({ segments, until: Number(now) + 0.7 });
    return true;
  }

  noteWell(well) {
    const edge = fieldDodgeEdge(well);
    if (!edge.alive || !well || well.id == null) return false;
    for (let i = 0; i < this.wells.length; i++) {
      if (this.wells[i].id === well.id) {
        this.wells[i].radius = edge.radius;
        return true;
      }
    }
    if (this.wells.length >= 4) this.wells.shift();
    this.wells.push({
      id: well.id,
      radius: edge.radius,
      expireAt: Number(well.expireAt),
    });
    return true;
  }

  forgetWell(id) {
    this.wells = this.wells.filter((well) => well.id !== id);
  }

  releaseHull(id) {
    releaseHullScars(this.scars, id);
  }

  clear() {
    this.scars.slots.length = 0;
    this.handoff.pending.length = 0;
    this.handoff.active = null;
    this.wells.length = 0;
    this.cuts.length = 0;
    this.shapes.length = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.clear();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  _seg(cursor, ax, az, bx, bz, r, g, b) {
    if (cursor >= SEGMENTS) return cursor;
    const localA = this.toLocal(ax, az, this._local);
    const x0 = localA.x;
    const z0 = localA.z;
    const localB = this.toLocal(bx, bz, this._local);
    const base = cursor * 6;
    this.positions[base] = x0;
    this.positions[base + 1] = 0.42;
    this.positions[base + 2] = z0;
    this.positions[base + 3] = localB.x;
    this.positions[base + 4] = 0.42;
    this.positions[base + 5] = localB.z;
    for (let k = 0; k < 2; k++) {
      this.colors[base + k * 3] = r;
      this.colors[base + k * 3 + 1] = g;
      this.colors[base + k * 3 + 2] = b;
    }
    return cursor + 1;
  }

  update(now, resolveEntity, reduced, entities) {
    let cursor = 0;
    const scarGain = reduced ? 0.55 : 0.9;
    for (let i = this.scars.slots.length - 1; i >= 0; i--) {
      const slot = this.scars.slots[i];
      const hull = resolveEntity && resolveEntity(slot.hullId);
      const ends = scarWorldEnds(slot, hull, now);
      if (!ends) {
        this.scars.slots.splice(i, 1);
        continue;
      }
      cursor = this._seg(cursor, ends.ax, ends.az, ends.bx, ends.bz, 0.86 * scarGain, 0.62 * scarGain, 0.34 * scarGain);
    }
    this._resolve = resolveEntity || null;
    const lookup = entities && typeof entities.get === 'function' ? entities : this._fallbackBook;
    const streak = wreckStreakOn(this.handoff, lookup, now, this._streak);
    if (!streak) {
      this.handoff.active = null;
    } else {
      cursor = this._seg(cursor, streak.ax, streak.az, streak.bx, streak.bz, 1, 0.55, 0.22);
      this.handoff.active.flashed = true;
    }
    for (let i = this.cuts.length - 1; i >= 0; i--) {
      const cut = this.cuts[i];
      if (now > cut.until) {
        this.cuts.splice(i, 1);
        continue;
      }
      const gain = cut.gain;
      cursor = this._seg(cursor, cut.ax, cut.az, cut.bx, cut.bz, 0.72 * gain, 0.9 * gain, gain);
    }
    const shapeGain = reduced ? 0.55 : 0.92;
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const shape = this.shapes[i];
      if (now > shape.until) {
        this.shapes.splice(i, 1);
        continue;
      }
      const segments = shape.segments;
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        cursor = this._seg(cursor, seg.ax, seg.az, seg.bx, seg.bz, 0.78 * shapeGain, 0.86 * shapeGain, 0.95 * shapeGain);
      }
    }
    const ringGain = reduced ? 0.45 : 0.8;
    for (let w = this.wells.length - 1; w >= 0; w--) {
      const well = this.wells[w];
      const ent = resolveEntity && resolveEntity(well.id);
      if (!ent || ent.alive === false || !ent.pos) {
        this.wells.splice(w, 1);
        continue;
      }
      const edge = fieldDodgeEdge({
        radius: Number(ent.data && ent.data.blastRadius) || well.radius,
        expireAt: Number(ent.data && ent.data.dieAt) || well.expireAt,
        now,
        dirX: 1,
        dirZ: 0,
      });
      if (!edge.alive) {
        this.wells.splice(w, 1);
        continue;
      }
      const radius = edge.radius;
      for (let s = 0; s < RING && cursor < SEGMENTS; s++) {
        const a0 = (s / RING) * Math.PI * 2;
        const a1 = ((s + 1) / RING) * Math.PI * 2;
        cursor = this._seg(
          cursor,
          ent.pos.x + Math.cos(a0) * radius,
          ent.pos.z + Math.sin(a0) * radius,
          ent.pos.x + Math.cos(a1) * radius,
          ent.pos.z + Math.sin(a1) * radius,
          0.45 * ringGain,
          0.72 * ringGain,
          1 * ringGain,
        );
      }
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, cursor * 2);
    this.mesh.visible = cursor > 0;
    return cursor;
  }
}
