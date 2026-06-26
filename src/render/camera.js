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
const SAFE_VIEW_X = 0.52;
const SAFE_VIEW_Z = 0.46;
const CRUISE_LOOKAHEAD_MAX = 12;
const CRUISE_LOOKAHEAD_SPEED_SCALE = 0.16;
const AIM_BIAS = 0.02;
const AIM_BIAS_MAX = 18;
const SHAKE_POS_MAX = 1.55;
const MOTION_REDUCE_SHAKE_SCALE = 0.25;

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function isMotionReduced(state) {
  return !!(state && state.settings && state.settings.video && state.settings.video.motionReduce);
}

function resolveAimLead(input, player) {
  if (!input || !input.aimWorld || !player || !player.pos) return { x: 0, z: 0 };
  const px = finiteOr(player.pos.x, 0);
  const pz = finiteOr(player.pos.z, 0);
  const dx = finiteOr(input.aimWorld.x, px) - px;
  const dz = finiteOr(input.aimWorld.z, pz) - pz;
  const d = Math.hypot(dx, dz);
  if (d <= 0.0001) return { x: 0, z: 0 };
  const lead = Math.min(AIM_BIAS_MAX, d * AIM_BIAS);
  return { x: (dx / d) * lead, z: (dz / d) * lead };
}

export function clampFocusToPlayerSafeRect(focus, player, options = {}) {
  const playerX = player && player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
  const playerZ = player && player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
  if (!player || !player.pos) {
    return {
      x: focus && Number.isFinite(focus.x) ? focus.x : 0,
      z: focus && Number.isFinite(focus.z) ? focus.z : 0,
      clamped: false,
    };
  }
  const zoom = Number.isFinite(options.zoom) ? options.zoom : 95;
  const fov = Number.isFinite(options.fov) ? options.fov : 50;
  const aspect = Math.max(0.45, Number.isFinite(options.aspect) ? options.aspect : 16 / 9);
  const halfV = Math.tan((fov * Math.PI / 180) * 0.5) * zoom * 0.72;
  const halfH = halfV * aspect;
  const safeX = Math.max(14, halfH * SAFE_VIEW_X);
  const safeZ = Math.max(22, halfV * SAFE_VIEW_Z);
  let x = focus && Number.isFinite(focus.x) ? focus.x : playerX;
  let z = focus && Number.isFinite(focus.z) ? focus.z : playerZ;
  let clamped = false;
  const dx = x - playerX;
  const dz = z - playerZ;
  if (dx > safeX) { x = playerX + safeX; clamped = true; }
  else if (dx < -safeX) { x = playerX - safeX; clamped = true; }
  if (dz > safeZ) { z = playerZ + safeZ; clamped = true; }
  else if (dz < -safeZ) { z = playerZ - safeZ; clamped = true; }
  return { x, z, clamped, safeX, safeZ };
}

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
  const computeOffset = (D) => {
    const distance = finiteOr(D, 95);
    return offset.set(0, distance * Math.sin(tiltRad), -distance * Math.cos(tiltRad));
  };
  computeOffset(c.zoom);
  cam.position.copy(offset);
  cam.lookAt(0, 0, 0);

  // smoothed camera roll (visual counter-lean into the player's bank)
  let camRoll = 0;
  const ROLL_MAX = 0.035;  // rad (~2.0 deg): readable bank feel without swimming the horizon.
  const ROLL_LERP = 3.2;   // responsiveness
  // scratch: roll is applied about the camera's local forward axis (the view direction), so the
  // image spins in-plane without changing where the camera points.
  const _rollQ = new THREE.Quaternion();
  const _FORWARD = new THREE.Vector3(0, 0, -1);
  // GR-6: rotational shake. Translational shake alone reads as a float; adding a small angular jitter
  // (roll + pitch about the camera's local axes) gives trauma real impact. Scaled by trauma² so it's
  // imperceptible at low trauma and punchy near death. Pitch (about local X) is the most visceral.
  const SHAKE_ROT_ROLL = 0.024;  // rad (~1.4 deg) max roll from shake
  const SHAKE_ROT_PITCH = 0.012; // rad (~0.7 deg) max pitch from shake
  const _shakeRollQ = new THREE.Quaternion();
  const _shakePitchQ = new THREE.Quaternion();
  const _camRight = new THREE.Vector3(1, 0, 0);

  // dynamic zoom — smoothly adapts camera distance to gameplay context
  let _dynamicZoom = finiteOr(c.zoom, 95);
  const ZOOM_LERP = 1.9;   // slower transitions reduce zoom pumping in normal flight

  // Push-zoom: a transient multiplicative nudge to the camera distance for scripted moments (docking
  // fly-in, jump, cutscenes). set with pushZoom(factor, duration): the factor eases in then back out
  // over the duration, multiplying targetZoom during its active window. 0 = inactive. This cooperates
  // with the dynamic-zoom system (it biases the SAME _dynamicZoom the rest of the game uses) instead
  // of clobbering c.zoom the way the old uiRoot hard-set did.
  let _pushZoom = 0;          // current multiplicative offset added to the zoom factor (0 = none)
  let _pushZoomDecay = 0;     // per-second decay rate (derived from duration at push time)
  let _snappedPlayerId = null;

  function snapToEntity(p) {
    if (!p || !p.pos) return false;
    const px = finiteOr(p.pos.x, 0);
    const pz = finiteOr(p.pos.z, 0);
    c.focus.set(px, 0, pz);
    _dynamicZoom = finiteOr(c.zoom, 95);
    computeOffset(_dynamicZoom);
    cam.position.set(c.focus.x + offset.x, offset.y, c.focus.z + offset.z);
    cam.lookAt(c.focus.x, 0, c.focus.z);
    _snappedPlayerId = p.id;
    return true;
  }

  return {
    obj: cam,
    addTrauma(amount) {
      const a = Number.isFinite(amount) ? Math.max(0, amount) : 0;
      if (a <= 0) return;
      const scale = isMotionReduced(state) ? MOTION_REDUCE_SHAKE_SCALE : 1;
      c.trauma = Math.min(1, Math.max(0, c.trauma || 0) + a * scale);
    },
    setZoom(z) { c.zoom = Math.max(45, Math.min(220, finiteOr(z, c.zoom || 95))); },
    snapToPlayer() {
      const p = state.entities.get(state.playerId);
      return snapToEntity(p);
    },
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
      const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1 / 15) : 0;
      const p = state.entities.get(state.playerId);
      let fx = finiteOr(c.focus.x, 0), fz = finiteOr(c.focus.z, 0);
      let bankForLean = 0;
      let playerSpeed = 0;
      let nearbyEnemies = 0;
      let hasTetherFocus = false;
      if (p && p.pos) {
        if (_snappedPlayerId !== p.id || !Number.isFinite(c.focus.x) || !Number.isFinite(c.focus.z)) {
          snapToEntity(p);
        }
        fx = finiteOr(p.pos.x, 0); fz = finiteOr(p.pos.z, 0);
        const vx = p.vel ? finiteOr(p.vel.x, 0) : 0;
        const vz = p.vel ? finiteOr(p.vel.z, 0) : 0;
        playerSpeed = Math.hypot(vx, vz);
        const focusGap = Math.hypot(c.focus.x - fx, c.focus.z - fz);
        if (focusGap > Math.max(320, _dynamicZoom * 2.6)) {
          snapToEntity(p);
        }
        if (playerSpeed > 1) {
          const la = Math.min(c.lookAhead, CRUISE_LOOKAHEAD_MAX, playerSpeed * CRUISE_LOOKAHEAD_SPEED_SCALE);
          fx += (vx / playerSpeed) * la; fz += (vz / playerSpeed) * la;
        }
        const aimLead = resolveAimLead(state.input, p);
        fx += aimLead.x;
        fz += aimLead.z;
        const composition = resolveChaseComposition(state, p, { x: fx, z: fz });
        fx = composition.x;
        fz = composition.z;
        nearbyEnemies = composition.nearbyEnemies;
        hasTetherFocus = composition.hasTetherFocus;
        const desiredSafe = clampFocusToPlayerSafeRect({ x: fx, z: fz }, p, {
          zoom: _dynamicZoom,
          fov: cam.fov,
          aspect: cam.aspect,
        });
        fx = desiredSafe.x;
        fz = desiredSafe.z;
        // counter-lean uses the ship's bank (already smoothed); a fraction keeps it tasteful
        bankForLean = (Number.isFinite(p.bank) ? p.bank : 0) * 0.045;
      }
      const followLerp = finiteOr(c.lerp, 6);
      c.focus.x = damp(c.focus.x, fx, followLerp, frameDt);
      c.focus.z = damp(c.focus.z, fz, followLerp, frameDt);

      // --- dynamic zoom ---
      const baseZoom = finiteOr(c.zoom, 95);
      let targetZoom = baseZoom;
      if (p && p.pos) {
        let zoomFactor = 1.0;
        const composeDx = fx - finiteOr(p.pos.x, fx);
        const composeDz = fz - finiteOr(p.pos.z, fz);
        const compositionLead = Math.hypot(composeDx, composeDz);

        // combat: push in slightly and preserve threat readability. The old behavior zoomed out,
        // making fights feel detached; 47-A needs pressure, line tension, and target geometry.
        if (nearbyEnemies > 0) {
          zoomFactor = 0.90;
          if (compositionLead > 55) {
            zoomFactor = Math.min(0.98, zoomFactor + Math.min(0.08, (compositionLead - 55) / 900));
          }
        } else if (hasTetherFocus) {
          zoomFactor = 0.94;
          if (compositionLead > 55) {
            zoomFactor = Math.min(1.0, zoomFactor + Math.min(0.06, (compositionLead - 55) / 900));
          }
        } else {
          // boost: modest zoom-out for speed feel without making ordinary flight breathe too much
          if (p.flags && p.flags.boosting) zoomFactor = Math.max(zoomFactor, 1.06);
          // dash: slightly wider at high speed (proxy: speed > 110% of maxSpeed)
          if (p.maxSpeed && playerSpeed > p.maxSpeed * 1.1) zoomFactor = Math.max(zoomFactor, 1.10);
          // damage without a visible threat gets a small emergency reveal
          if (c.trauma > 0.1) zoomFactor = Math.max(zoomFactor, 1.03);
          // idle/cruising: small zoom-in when slow and peaceful
          if (p.maxSpeed && playerSpeed < p.maxSpeed * 0.15 && c.trauma <= 0.1) zoomFactor = Math.min(zoomFactor, 0.96);
        }

        targetZoom = baseZoom * zoomFactor;
      }
      // scripted push-zoom (dock fly-in / jump): widens the view multiplicatively while active, then
      // decays. Applied to targetZoom so it eases through the same _dynamicZoom damping as everything
      // else — no jarring snap, no fight with the dynamic-zoom logic.
      if (_pushZoom > 0.0001) {
        targetZoom *= (1 + _pushZoom);
        _pushZoom += -_pushZoom * _pushZoomDecay * frameDt;
        if (_pushZoom < 0.0001) _pushZoom = 0;
      }
      _dynamicZoom = damp(_dynamicZoom, targetZoom, ZOOM_LERP, frameDt);
      if (p && p.pos) {
        const safeFocus = clampFocusToPlayerSafeRect(c.focus, p, { zoom: _dynamicZoom, fov: cam.fov, aspect: cam.aspect });
        if (safeFocus.clamped) {
          c.focus.x = safeFocus.x;
          c.focus.z = safeFocus.z;
        }
      }
      computeOffset(_dynamicZoom);
      let shakeRoll = 0;
      let shakePitch = 0;
      if (c.trauma > 0) {
        c.trauma = Math.max(0, c.trauma - 1.6 * frameDt);
        const t2 = c.trauma * c.trauma;
        const shakeScale = isMotionReduced(state) ? MOTION_REDUCE_SHAKE_SCALE : 1;
        c.shakeOffset.set(
          (Math.random() * 2 - 1) * SHAKE_POS_MAX * shakeScale * t2,
          0,
          (Math.random() * 2 - 1) * SHAKE_POS_MAX * shakeScale * t2,
        );
        // GR-6: angular shake — roll + pitch jitter, trauma²-scaled. Sampled once per frame from
        // trauma so it stays coherent with the translational shake rather than vibrating independently.
        shakeRoll = (Math.random() * 2 - 1) * SHAKE_ROT_ROLL * shakeScale * t2;
        shakePitch = (Math.random() * 2 - 1) * SHAKE_ROT_PITCH * shakeScale * t2;
      } else {
        c.shakeOffset.set(0, 0, 0);
      }
      cam.position.set(c.focus.x + offset.x + c.shakeOffset.x, offset.y, c.focus.z + offset.z + c.shakeOffset.z);
      cam.lookAt(c.focus.x, 0, c.focus.z);
      // apply a gentle, damped roll in the camera's local frame — counter to the ship's bank so the
      // view tips into the turn. lookAt() set the quaternion; we post-multiply a local-Z rotation so
      // we never clobber the heading (safe with the no-yaw-follow rule).
      const targetRoll = Math.max(-ROLL_MAX, Math.min(ROLL_MAX, bankForLean));
      camRoll = damp(camRoll, targetRoll, ROLL_LERP, frameDt);
      _rollQ.setFromAxisAngle(_FORWARD, camRoll);
      cam.quaternion.multiply(_rollQ);
      // GR-6: apply rotational shake after the bank roll. Post-multiplying local-axis quats keeps the
      // shake in the camera's frame (spins the image, never drags the heading).
      if (shakeRoll) { _shakeRollQ.setFromAxisAngle(_FORWARD, shakeRoll); cam.quaternion.multiply(_shakeRollQ); }
      if (shakePitch) { _shakePitchQ.setFromAxisAngle(_camRight, shakePitch); cam.quaternion.multiply(_shakePitchQ); }
    },
    onResize() {
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
    },
  };
}
