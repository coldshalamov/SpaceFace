// Tilted top-down chase camera (ARCHITECTURE §0.14): follows player POSITION only (never yaw,
// anti-nausea), with damped follow, velocity look-ahead, aim bias, and trauma-based shake.
// Phase 1: adds a subtle camera roll that counter-leans into the ship's bank so high-G turns feel
// dynamic without violating the no-yaw-follow rule (we never rotate the camera's heading).
import * as THREE from 'three';
import { damp } from '../core/math.js';

const THREAT_COMPOSE_RANGE = 600;
const THREAT_COMPOSE_MAX_BIAS = 90;
const THREAT_COMPOSE_FRACTION = 0.18;
const TETHER_COMPOSE_MAX_BIAS = 130;
const TETHER_COMPOSE_FRACTION = 0.24;

export function resolveChaseComposition(state, player, focus) {
  let fx = focus && Number.isFinite(focus.x) ? focus.x : (player && player.pos ? player.pos.x : 0);
  let fz = focus && Number.isFinite(focus.z) ? focus.z : (player && player.pos ? player.pos.z : 0);
  let nearbyEnemies = 0;
  let nearestThreat = null;
  let nearestThreatD2 = Infinity;

  if (!state || !player || !player.pos || !state.entities || typeof state.entities.values !== 'function') {
    return { x: fx, z: fz, nearbyEnemies, hasThreatFocus: false, hasTetherFocus: false };
  }

  // Combat composes player + nearest threat instead of only following the player.
  for (const e of state.entities.values()) {
    if (e === player) continue;
    if (e.type !== 'ship' || e.alive === false || e.team === player.team || e.hull <= 0 || !e.pos) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < THREAT_COMPOSE_RANGE * THREAT_COMPOSE_RANGE) {
      nearbyEnemies++;
      if (d2 < nearestThreatD2) {
        nearestThreat = e;
        nearestThreatD2 = d2;
      }
    }
  }

  if (nearestThreat && nearestThreatD2 > 1) {
    const d = Math.sqrt(nearestThreatD2);
    const bias = Math.min(THREAT_COMPOSE_MAX_BIAS, d * THREAT_COMPOSE_FRACTION);
    fx += ((nearestThreat.pos.x - player.pos.x) / d) * bias;
    fz += ((nearestThreat.pos.z - player.pos.z) / d) * bias;
  }

  const tetherAnchor = resolveTetherCompositionAnchor(state, player);
  if (tetherAnchor) {
    const dx = tetherAnchor.x - player.pos.x;
    const dz = tetherAnchor.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1) {
      const bias = Math.min(TETHER_COMPOSE_MAX_BIAS, d * TETHER_COMPOSE_FRACTION);
      fx += (dx / d) * bias;
      fz += (dz / d) * bias;
    }
  }

  return {
    x: fx,
    z: fz,
    nearbyEnemies,
    hasThreatFocus: !!nearestThreat,
    hasTetherFocus: !!tetherAnchor,
  };
}

function resolveTetherCompositionAnchor(state, player) {
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!attachments || !state.entities || typeof state.entities.get !== 'function') return null;

  let x = 0;
  let z = 0;
  let weightTotal = 0;
  for (const attachment of Object.values(attachments)) {
    if (!attachment || attachment.state !== 'active') continue;
    let otherId = null;
    if (attachment.ownerId === player.id) otherId = attachment.targetId;
    else if (attachment.targetId === player.id) otherId = attachment.ownerId;
    if (otherId == null) continue;

    const other = state.entities.get(otherId);
    if (!other || !other.alive || !other.pos) continue;
    const isPayload = other.type === 'payload' || !!(other.data && other.data.tetherPayload);
    const weight = isPayload ? 1.35 : 1.0;
    x += other.pos.x * weight;
    z += other.pos.z * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) return null;
  return { x: x / weightTotal, z: z / weightTotal };
}

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

  // Push-zoom: a transient multiplicative nudge to the camera distance for scripted moments (docking
  // fly-in, jump, cutscenes). set with pushZoom(factor, duration): the factor eases in then back out
  // over the duration, multiplying targetZoom during its active window. 0 = inactive. This cooperates
  // with the dynamic-zoom system (it biases the SAME _dynamicZoom the rest of the game uses) instead
  // of clobbering c.zoom the way the old uiRoot hard-set did.
  let _pushZoom = 0;          // current multiplicative offset added to the zoom factor (0 = none)
  let _pushZoomDecay = 0;     // per-second decay rate (derived from duration at push time)

  return {
    obj: cam,
    addTrauma(amount) { c.trauma = Math.min(1, c.trauma + amount); },
    setZoom(z) { c.zoom = Math.max(45, Math.min(220, z)); },
    // pushZoom(factor, durationS): factor>0 pushes the camera OUT (wider) for `durationS`, easing in
    // and out. e.g. pushZoom(0.25, 0.8) widens the view 25% over 0.8s for a dock approach reveal.
    // The effect is additive on top of the dynamic zoom and decays smoothly.
    pushZoom(factor, durationS) {
      const f = Math.max(0, factor || 0);
      const d = Math.max(0.1, durationS || 0.5);
      _pushZoom = f;
      // ease in over ~half the duration, out over the other half → symmetric decay rate
      _pushZoomDecay = 4.0 / d;
    },
    follow(dt) {
      const p = state.entities.get(state.playerId);
      let fx = c.focus.x, fz = c.focus.z;
      let bankForLean = 0;
      let playerSpeed = 0;
      let nearbyEnemies = 0;
      let hasTetherFocus = false;
      if (p) {
        fx = p.pos.x; fz = p.pos.z;
        playerSpeed = Math.hypot(p.vel.x, p.vel.z);
        if (playerSpeed > 1) {
          const la = Math.min(c.lookAhead, playerSpeed * 0.35);
          fx += (p.vel.x / playerSpeed) * la; fz += (p.vel.z / playerSpeed) * la;
        }
        fx += (state.input.aimWorld.x - p.pos.x) * 0.05;
        fz += (state.input.aimWorld.z - p.pos.z) * 0.05;
        const composition = resolveChaseComposition(state, p, { x: fx, z: fz });
        fx = composition.x;
        fz = composition.z;
        nearbyEnemies = composition.nearbyEnemies;
        hasTetherFocus = composition.hasTetherFocus;
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
        } else if (hasTetherFocus) {
          zoomFactor = 0.93;
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
      // scripted push-zoom (dock fly-in / jump): widens the view multiplicatively while active, then
      // decays. Applied to targetZoom so it eases through the same _dynamicZoom damping as everything
      // else — no jarring snap, no fight with the dynamic-zoom logic.
      if (_pushZoom > 0.0001) {
        targetZoom *= (1 + _pushZoom);
        _pushZoom += -_pushZoom * _pushZoomDecay * dt;
        if (_pushZoom < 0.0001) _pushZoom = 0;
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
