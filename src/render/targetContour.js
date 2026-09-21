// INF-045 — disciplined target contour. A flat world-space ring around the locked/engaged
// target so its position and hostile tell stay readable when a spectacular effect (e.g. a
// Well) covers the hull itself.
//
// WHY THIS LAYERING. Field force surfaces are transparent, depthWrite:false, renderOrder 16:
// they test depth but never write it. The contour is transparent, depthWrite:false,
// depthTest:true, renderOrder 17: it draws AFTER the effect, passes where the effect wrote
// nothing, and still loses to real occluders (hulls, rock) that wrote depth. No particle or
// bloom budget is touched — the fix is one ring, not a quieter effect.
//
// Discipline: ONE shape for every target (a thin ring at 1.18x hull radius, lifted to the
// force-surface plane). Only the tint carries faction: red = hostile, cyan = everything else,
// matching the lock diamond's established language. The contour never flashes, pulses, or
// scales with damage — identity must survive reduced flash untouched.

import * as THREE from 'three';

import { isHostileToPlayer } from '../systems/scanner.js';

export const TARGET_CONTOUR_RENDER_ORDER = 17;
export const TARGET_CONTOUR_LIFT = 0.5;
export const TARGET_CONTOUR_RADIUS_SCALE = 1.18;
export const TARGET_CONTOUR_HOSTILE_COLOR = 0xff5470;
export const TARGET_CONTOUR_FRIENDLY_COLOR = 0x5fd0ff;

/**
 * Pure subject resolution for the contour. The live SELECTION wins (it is also what aims a
 * Massline throw); the engaged gun target only subjects when there is no live selection, so
 * the guns never fire at a ship with no contour anywhere. Mirrors the target panel's
 * engagedContactReadout subject rule without touching the DOM.
 *
 * @returns {{id, x, z, radius, hostile}|null} world-space subject, or null when uncontoured.
 */
export function resolveTargetContour(state) {
  const player = (state && state.player) || null;
  const entities = state && state.entities;
  if (!player || !entities || typeof entities.get !== 'function') return null;
  const selId = player.targetId != null ? player.targetId : null;
  const selection = selId != null ? entities.get(selId) : null;
  const liveSelection = selection && selection.alive && selection.pos ? selection : null;
  const gunId = player.gunTargetId != null && player.gunTargetId !== selId ? player.gunTargetId : null;
  const engagedCandidate = gunId != null ? entities.get(gunId) : null;
  const engaged = engagedCandidate && engagedCandidate.alive && engagedCandidate.pos ? engagedCandidate : null;
  const subject = liveSelection || engaged;
  if (!subject || !subject.pos) return null;
  return {
    id: subject.id,
    x: subject.pos.x,
    z: subject.pos.z,
    radius: Math.max(2, Number(subject.radius) || 6),
    hostile: isHostileToPlayer(subject, player.team, state),
  };
}

export class TargetContour {
  constructor(scene = null) {
    this._hostileColor = new THREE.Color(TARGET_CONTOUR_HOSTILE_COLOR);
    this._friendlyColor = new THREE.Color(TARGET_CONTOUR_FRIENDLY_COLOR);
    const geo = new THREE.RingGeometry(0.93, 1.0, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: this._friendlyColor.clone(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sf-target-contour';
    mesh.frustumCulled = false;
    mesh.renderOrder = TARGET_CONTOUR_RENDER_ORDER;
    mesh.visible = false;
    if (scene && typeof scene.add === 'function') scene.add(mesh);
    this.mesh = mesh;
    this._x = 0;
    this._z = 0;
    this._disposed = false;
  }

  /** Local-frame target. Copies values; the caller keeps its scratch. */
  setTarget(x, z, radius, hostile) {
    if (this._disposed || !this.mesh) return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const r = Math.max(2, Number(radius) || 6) * TARGET_CONTOUR_RADIUS_SCALE;
    this._x = x;
    this._z = z;
    this.mesh.position.set(x, TARGET_CONTOUR_LIFT, z);
    this.mesh.scale.set(r, 1, r);
    this.mesh.material.color.copy(hostile ? this._hostileColor : this._friendlyColor);
    this.mesh.visible = true;
    return true;
  }

  clear() {
    if (this.mesh) this.mesh.visible = false;
  }

  reproject(dx, dz) {
    if (this._disposed || !this.mesh) return;
    if (!dx && !dz) return;
    this._x += dx;
    this._z += dz;
    this.mesh.position.x = this._x;
    this.mesh.position.z = this._z;
  }

  inspect() {
    return {
      schema: 'spaceface.target-contour.v1',
      visible: !!(this.mesh && this.mesh.visible),
      renderOrder: this.mesh ? this.mesh.renderOrder : null,
      x: this._x,
      z: this._z,
    };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.mesh) {
      this.mesh.removeFromParent();
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh = null;
    }
  }
}
