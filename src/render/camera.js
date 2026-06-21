// Tilted top-down chase camera (ARCHITECTURE §0.14): follows player POSITION only (never yaw,
// anti-nausea), with damped follow, velocity look-ahead, aim bias, and trauma-based shake.
// Phase 1: adds a subtle camera roll that counter-leans into the ship's bank so high-G turns feel
// dynamic without violating the no-yaw-follow rule (we never rotate the camera's heading).
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

  // smoothed camera roll (visual counter-lean into the player's bank)
  let camRoll = 0;
  const ROLL_MAX = 0.06;   // rad (~3.4°) — gentle, anti-nausea
  const ROLL_LERP = 4.0;   // responsiveness
  // scratch: roll is applied about the camera's local forward axis (the view direction), so the
  // image spins in-plane without changing where the camera points.
  const _rollQ = new THREE.Quaternion();
  const _FORWARD = new THREE.Vector3(0, 0, -1);

  // dynamic zoom — smoothly adapts camera distance to gameplay context
  let _dynamicZoom = c.zoom;
  const ZOOM_LERP = 3.0;   // responsiveness for zoom transitions

  return {
    obj: cam,
    addTrauma(amount) { c.trauma = Math.min(1, c.trauma + amount); },
    setZoom(z) { c.zoom = Math.max(45, Math.min(220, z)); },
    follow(dt) {
      const p = state.entities.get(state.playerId);
      let fx = c.focus.x, fz = c.focus.z;
      let bankForLean = 0;
      let playerSpeed = 0;
      let nearbyEnemies = 0;
      if (p) {
        fx = p.pos.x; fz = p.pos.z;
        playerSpeed = Math.hypot(p.vel.x, p.vel.z);
        if (playerSpeed > 1) {
          const la = Math.min(c.lookAhead, playerSpeed * 0.35);
          fx += (p.vel.x / playerSpeed) * la; fz += (p.vel.z / playerSpeed) * la;
        }
        fx += (state.input.aimWorld.x - p.pos.x) * 0.05;
        fz += (state.input.aimWorld.z - p.pos.z) * 0.05;
        // scan for nearby threats (ships on a different team, alive, within 600 wu)
        let nearestThreat = null;
        let nearestThreatD2 = Infinity;
        for (const e of state.entities.values()) {
          if (e === p) continue;
          if (e.type !== 'ship' || e.team === p.team || e.hull <= 0) continue;
          const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 600 * 600) {
            nearbyEnemies++;
            if (d2 < nearestThreatD2) { nearestThreat = e; nearestThreatD2 = d2; }
          }
        }
        // Combat composes player + nearest threat instead of only following the player. This is the
        // first slice-safe step toward tether/payload framing without creating a parallel camera mode.
        if (nearestThreat && nearestThreatD2 > 1) {
          const d = Math.sqrt(nearestThreatD2);
          const bias = Math.min(90, d * 0.18);
          fx += ((nearestThreat.pos.x - p.pos.x) / d) * bias;
          fz += ((nearestThreat.pos.z - p.pos.z) / d) * bias;
        }
        // counter-lean uses the ship's bank (already smoothed); a fraction keeps it tasteful
        bankForLean = (p.bank || 0) * 0.07;
      }
      c.focus.x = damp(c.focus.x, fx, c.lerp, dt);
      c.focus.z = damp(c.focus.z, fz, c.lerp, dt);

      // --- dynamic zoom ---
      const baseZoom = c.zoom;
      let targetZoom = baseZoom;
      if (p) {
        let zoomFactor = 1.0;

        // combat: push in slightly and preserve threat readability. The old behavior zoomed out,
        // making fights feel detached; 47-A needs pressure, line tension, and target geometry.
        if (nearbyEnemies > 0) {
          zoomFactor = 0.90;
        } else {
          // boost: zoom out 12% for speed feel when not actively composing combat
          if (p.flags && p.flags.boosting) zoomFactor = Math.max(zoomFactor, 1.12);
          // dash: zoom out 20% at high speed (proxy: speed > 110% of maxSpeed)
          if (p.maxSpeed && playerSpeed > p.maxSpeed * 1.1) zoomFactor = Math.max(zoomFactor, 1.20);
          // damage without a visible threat gets a small emergency reveal
          if (c.trauma > 0.1) zoomFactor = Math.max(zoomFactor, 1.05);
          // idle/cruising: zoom in 8% when slow and peaceful
          if (p.maxSpeed && playerSpeed < p.maxSpeed * 0.15 && c.trauma <= 0.1) zoomFactor = Math.min(zoomFactor, 0.92);
        }

        targetZoom = baseZoom * zoomFactor;
      }
      _dynamicZoom = damp(_dynamicZoom, targetZoom, ZOOM_LERP, dt);
      computeOffset(_dynamicZoom);
      if (c.trauma > 0) {
        c.trauma = Math.max(0, c.trauma - 1.6 * dt);
        const t2 = c.trauma * c.trauma;
        c.shakeOffset.set((Math.random() * 2 - 1) * 2.2 * t2, 0, (Math.random() * 2 - 1) * 2.2 * t2);
      } else {
        c.shakeOffset.set(0, 0, 0);
      }
      cam.position.set(c.focus.x + offset.x + c.shakeOffset.x, offset.y, c.focus.z + offset.z + c.shakeOffset.z);
      cam.lookAt(c.focus.x, 0, c.focus.z);
      // apply a gentle, damped roll in the camera's local frame — counter to the ship's bank so the
      // view tips into the turn. lookAt() set the quaternion; we post-multiply a local-Z rotation so
      // we never clobber the heading (safe with the no-yaw-follow rule).
      const targetRoll = Math.max(-ROLL_MAX, Math.min(ROLL_MAX, bankForLean));
      camRoll = damp(camRoll, targetRoll, ROLL_LERP, dt);
      _rollQ.setFromAxisAngle(_FORWARD, camRoll);
      cam.quaternion.multiply(_rollQ);
    },
    onResize() {
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
    },
  };
}
