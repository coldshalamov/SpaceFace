import * as THREE from 'three';

// Harness pops are hidden↔onscreen while the projected center is inside NDC 0.8
// (the inner 80% of the viewport). 0.92 is that region plus a margin, so a
// center the grade calls "inner" is inside the hold.
export const PICTURE_HOLD_NDC = 0.92;

const _world = new THREE.Vector3();
const _camSpace = new THREE.Vector3();

/**
 * Project a mesh origin to NDC. `out.ok` is false behind the camera
 * (camera-space z > 0; the camera looks down local −z) or when the point is non-finite.
 * @param {THREE.Camera|null} camera
 * @param {THREE.Object3D|null} mesh
 * @param {{ok:boolean,x:number,y:number}} out
 */
export function projectEntityCenter(camera, mesh, out) {
  out.ok = false;
  out.x = 0;
  out.y = 0;
  if (!camera || !camera.matrixWorldInverse || !mesh || typeof mesh.getWorldPosition !== 'function') return out;
  mesh.getWorldPosition(_world);
  if (!Number.isFinite(_world.x) || !Number.isFinite(_world.y) || !Number.isFinite(_world.z)) return out;
  _camSpace.copy(_world).applyMatrix4(camera.matrixWorldInverse);
  if (!Number.isFinite(_camSpace.z) || _camSpace.z > 0) return out;
  _world.project(camera);
  if (!Number.isFinite(_world.x) || !Number.isFinite(_world.y) || !Number.isFinite(_world.z)) return out;
  if (_world.z < -1 || _world.z > 1) return out;
  out.ok = true;
  out.x = _world.x;
  out.y = _world.y;
  return out;
}

/**
 * Once a root has been submitted inside the hold, keep it submitted.
 * A later hide (pending latch, missing pose, leaving the query) reads as
 * hidden even off screen, and the next inner sample is then a pop.
 * The latch clears on rebind, not when the center leaves the glass.
 * @param {object|null} userData
 * @param {boolean} submit
 * @param {boolean} inHold
 */
export function pictureHoldSubmit(userData, submit, inHold) {
  if (!userData) return submit !== false;
  let next = submit !== false;
  if (userData.sfPictureHeld === true) next = true;
  if (next && inHold === true) userData.sfPictureHeld = true;
  return next;
}
