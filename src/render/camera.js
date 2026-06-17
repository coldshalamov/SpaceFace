// Tilted top-down chase camera (ARCHITECTURE §0.14): follows player POSITION only (never yaw,
// anti-nausea), with damped follow, velocity look-ahead, aim bias, and trauma-based shake.
import * as THREE from 'three';
import { damp } from '../core/math.js';

export function createChaseCamera(state) {
  // Far plane is deep (14k) so distant planets + far star layers render; fog still fades mid-distance.
  const cam = new THREE.PerspectiveCamera(state.settings.video.fov || 50, window.innerWidth / window.innerHeight, 1, 14000);
  const c = state.camera;
  c.shakeOffset = new THREE.Vector3();
  c.focus = new THREE.Vector3();
  const tiltRad = (c.tilt || 60) * Math.PI / 180;
  const offset = new THREE.Vector3();
  const computeOffset = (D) => offset.set(0, D * Math.sin(tiltRad), -D * Math.cos(tiltRad));
  computeOffset(c.zoom);
  cam.position.copy(offset);
  cam.lookAt(0, 0, 0);

  return {
    obj: cam,
    addTrauma(amount) { c.trauma = Math.min(1, c.trauma + amount); },
    setZoom(z) { c.zoom = Math.max(45, Math.min(130, z)); },
    follow(dt) {
      const p = state.entities.get(state.playerId);
      let fx = c.focus.x, fz = c.focus.z;
      if (p) {
        fx = p.pos.x; fz = p.pos.z;
        const sp = Math.hypot(p.vel.x, p.vel.z);
        if (sp > 1) {
          const la = Math.min(c.lookAhead, sp * 0.35);
          fx += (p.vel.x / sp) * la; fz += (p.vel.z / sp) * la;
        }
        fx += (state.input.aimWorld.x - p.pos.x) * 0.05;
        fz += (state.input.aimWorld.z - p.pos.z) * 0.05;
      }
      c.focus.x = damp(c.focus.x, fx, c.lerp, dt);
      c.focus.z = damp(c.focus.z, fz, c.lerp, dt);
      computeOffset(c.zoom);
      if (c.trauma > 0) {
        c.trauma = Math.max(0, c.trauma - 1.6 * dt);
        const t2 = c.trauma * c.trauma;
        c.shakeOffset.set((Math.random() * 2 - 1) * 2.2 * t2, 0, (Math.random() * 2 - 1) * 2.2 * t2);
      } else {
        c.shakeOffset.set(0, 0, 0);
      }
      cam.position.set(c.focus.x + offset.x + c.shakeOffset.x, offset.y, c.focus.z + offset.z + c.shakeOffset.z);
      cam.lookAt(c.focus.x, 0, c.focus.z);
    },
    onResize() {
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
    },
  };
}
