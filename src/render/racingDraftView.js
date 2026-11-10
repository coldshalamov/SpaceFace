// One reusable line buffer shows the physical wake envelope; no particles, lights or sim bodies.
import * as THREE from 'three';
import { readFrameOrigin } from './frameCoordinates.js';

export function createRacingDraftView(scene, state) {
  const positions = new Float32Array(3 * 8 * 3), colors = new Float32Array(positions.length);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3), color = new THREE.BufferAttribute(colors, 3);
  position.setUsage(THREE.DynamicDrawUsage); color.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('color', color);
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.48,
    depthWrite: false, toneMapped: false });
  const root = new THREE.LineSegments(geometry, material);
  root.name = 'Physical racing wakes'; root.visible = false; root.frustumCulled = false;
  scene.add(root);
  const origin = {}, quiet = new THREE.Color(0x668c93), active = new THREE.Color(0x9ae9cc);
  let disposed = false, cursor = 0, tint = quiet, lastTime = NaN, lastOwner = null;
  const write = (x, z) => {
    positions[cursor] = x; colors[cursor++] = tint.r;
    positions[cursor] = 0; colors[cursor++] = tint.g;
    positions[cursor] = z; colors[cursor++] = tint.b;
  };
  return {
    root,
    frame(race) {
      if (disposed) return;
      const p = race?.params, wakes = p?.raceDraftWakes;
      root.visible = state.mode === 'flight' && !state.ui?.docked
        && state.world?.currentSectorId === p?.courseSectorId && !!wakes?.length;
      if (!root.visible) return;
      readFrameOrigin(state, origin); root.position.set(-origin.x, 2, -origin.z);
      if (lastTime === state.simTime && lastOwner === p) return;
      lastTime = state.simTime; lastOwner = p; cursor = 0;
      for (let i = 0; i < Math.min(3, wakes.length); i++) {
        const w = wakes[i]; tint = p.raceDraft?.leaderId === w.leaderId ? active : quiet;
        // Near/far crossbars and the two taper rails match the qualifying center-line volume.
        const nx = w.x - w.nx * w.near, nz = w.z - w.nz * w.near;
        const fx = w.x - w.nx * w.far, fz = w.z - w.nz * w.far;
        const ax = nx - w.nz * w.widthNear, az = nz + w.nx * w.widthNear;
        const bx = nx + w.nz * w.widthNear, bz = nz - w.nx * w.widthNear;
        const cx = fx - w.nz * w.widthFar, cz = fz + w.nx * w.widthFar;
        const dx = fx + w.nz * w.widthFar, dz = fz - w.nx * w.widthFar;
        write(ax, az); write(cx, cz); write(bx, bz); write(dx, dz);
        write(ax, az); write(bx, bz); write(cx, cz); write(dx, dz);
      }
      geometry.setDrawRange(0, cursor / 3); position.needsUpdate = true; color.needsUpdate = true;
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose();
    },
  };
}
