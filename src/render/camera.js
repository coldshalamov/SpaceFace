// Tilted top-down chase camera (ARCHITECTURE §0.14): follows player POSITION only (never yaw,
// anti-nausea), with damped follow, velocity look-ahead, aim bias, and trauma-based shake.
// Phase 1: adds a subtle camera roll that counter-leans into the ship's bank so high-G turns feel
// dynamic without violating the no-yaw-follow rule (we never rotate the camera's heading).
import * as THREE from 'three';
import { damp } from '../core/math.js';

const THREAT_COMPOSE_RANGE = 600;
const THREAT_COMPOSE_MAX_BIAS = 42;
const THREAT_COMPOSE_FRACTION = 0.08;
const TETHER_COMPOSE_MAX_BIAS = 64;
const TETHER_COMPOSE_FRACTION = 0.12;
export const CONTEXT_ZOOM_MAX = 0.14;
const THREAT_ZOOM_BASE = 0.04;
const THREAT_ZOOM_RANGE = 0.08;
const TETHER_ZOOM_BASE = 0.03;
const TETHER_ZOOM_RANGE = 0.06;
const COMPOSITION_BIAS_LERP = 1.6;
const COMPOSITION_BIAS_SLEW = 90;
const CONTEXT_ZOOM_LERP = 1.2;
const SAFE_VIEW_X = 0.52;
const SAFE_VIEW_Z = 0.46;
const LOOKAHEAD_MAX = 18;           // wu — normal cap
const LOOKAHEAD_MAX_CRUISE = 26;    // wu — cruise-only cap (spec2/02 §2)
const LOOKAHEAD_SPEED_SCALE = 0.35; // velocity bias multiplier
const AIM_BIAS = 0.02;
const AIM_BIAS_MAX = 18;
const SHAKE_POS_MAX = 1.55;
const MOTION_REDUCE_SHAKE_SCALE = 0.25;
const TRAUMA_DECAY_PER_S = 1.8;
const MAX_MOMENTUM_TRAUMA = 0.5;
export const CAMERA_ZOOM_MIN = 45;
export const CAMERA_ZOOM_MAX = 330; // 50% more manual zoom-out than the previous 220 wu ceiling.
export const SPEED_ZOOM_SAMPLE_INTERVAL = 0.125; // seconds — 8 Hz target updates, smoothed per-frame.
export const SPEED_ZOOM_MIN = 0.88;  // slowest / idle factor (spec2/02 §2)
export const SPEED_ZOOM_MAX = 1.18;  // high-speed factor
const ZOOM_LERP = 1.4;              // /s — speed-zoom ease (spec2/02 §2)
// Top-50 rank-13 chase juice: default frame sits closer so hull bank/nose read in stills.
// Spec2/02 §2 previously used 88 wu; close chase keeps the same system with a tighter default.
const DEFAULT_ZOOM = 72;            // wu — chase distance (readable ship at store-still scale)
export const CHASE_ZOOM_DEFAULT = DEFAULT_ZOOM;
export const CHASE_ZOOM_CLOSE = 58; // optional tighter profile (settings.video.chaseClose)

export const CAMERA_TRAUMA_TUNING = Object.freeze({
  decayPerSecond: TRAUMA_DECAY_PER_S,
  maxMomentumTrauma: MAX_MOMENTUM_TRAUMA,
  motionReduceShakeScale: MOTION_REDUCE_SHAKE_SCALE,
  sources: Object.freeze({
    shieldBreak: 0.3,
    kill: 0.25,
    cruiseDrop: 0.2,
    slingshotRelease: 0.15,
    playerDeath: 1.0,
  }),
});

export function traumaFromMomentumExchange(dp) {
  const value = Number.isFinite(dp) ? Math.max(0, dp) : 0;
  return Math.min(MAX_MOMENTUM_TRAUMA, value / 8000);
}

export function decayCameraTrauma(trauma, dt) {
  const value = Number.isFinite(trauma) ? Math.max(0, trauma) : 0;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return Math.max(0, value - TRAUMA_DECAY_PER_S * step);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteOr(value, 0)));
}

function dampSlewed(current, target, lerp, maxSpeed, dt) {
  const desired = damp(current, target, lerp, dt);
  const maxStep = Math.max(0, maxSpeed * dt);
  const delta = desired - current;
  if (delta > maxStep) return current + maxStep;
  if (delta < -maxStep) return current - maxStep;
  return desired;
}

function isMotionReduced(state) {
  return !!(state && state.settings && state.settings.video && state.settings.video.motionReduce);
}

function isCruising(state) {
  const c = state && state.player && state.player.cruise;
  return !!(c && c.phase === 'cruising');
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

export function recenterBiasScale(remaining, duration) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (dur <= 0) return 0;
  const t = clamp01(1 - Math.max(0, finiteOr(remaining, 0)) / dur);
  const smooth = t * t * (3 - 2 * t);
  return 1 - smooth;
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
  const zoom = Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM;
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

export function resolveSpeedZoomFactor(speed, maxSpeed) {
  const shipMax = Math.max(1, finiteOr(maxSpeed, 120));
  const speedRatio = clamp01(finiteOr(speed, 0) / shipMax);
  return SPEED_ZOOM_MIN + (SPEED_ZOOM_MAX - SPEED_ZOOM_MIN) * speedRatio;
}

export function resolveChaseComposition(state, player, focus) {
  let fx = focus && Number.isFinite(focus.x) ? focus.x : (player && player.pos ? player.pos.x : 0);
  let fz = focus && Number.isFinite(focus.z) ? focus.z : (player && player.pos ? player.pos.z : 0);
  let nearbyEnemies = 0;
  let nearestThreat = null;
  let nearestThreatD2 = Infinity;
  let zoomBias = 0;

  if (!state || !player || !player.pos || !state.entities || typeof state.entities.values !== 'function') {
    return { x: fx, z: fz, nearbyEnemies, hasThreatFocus: false, hasTetherFocus: false, zoomBias };
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
    zoomBias = Math.max(zoomBias, THREAT_ZOOM_BASE + clamp01(d / THREAT_COMPOSE_RANGE) * THREAT_ZOOM_RANGE);
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
      zoomBias = Math.min(CONTEXT_ZOOM_MAX, zoomBias + TETHER_ZOOM_BASE + clamp01(d / THREAT_COMPOSE_RANGE) * TETHER_ZOOM_RANGE);
    }
  }

  return {
    x: fx,
    z: fz,
    nearbyEnemies,
    hasThreatFocus: !!nearestThreat,
    hasTetherFocus: !!tetherAnchor,
    zoomBias: Math.min(CONTEXT_ZOOM_MAX, zoomBias),
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
    const distance = finiteOr(D, DEFAULT_ZOOM);
    return offset.set(0, distance * Math.sin(tiltRad), -distance * Math.cos(tiltRad));
  };
  computeOffset(c.zoom);
  cam.position.copy(offset);
  cam.lookAt(0, 0, 0);

  // smoothed camera roll (visual counter-lean into the player's bank)
  let camRoll = 0;
  const ROLL_MAX = 0.052;  // rad (~3.0 deg): bank-readable, horizon still stable
  const ROLL_LERP = 3.6;   // slightly snappier lean
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
  function resolveBaseZoom() {
    const video = state.settings && state.settings.video;
    if (video && video.chaseClose) return CHASE_ZOOM_CLOSE;
    return finiteOr(c.zoom, DEFAULT_ZOOM);
  }
  let _dynamicZoom = resolveBaseZoom();
  let _speedZoomFactor = SPEED_ZOOM_MIN;
  let _speedZoomSampleT = 0;

  // Push-zoom: a transient multiplicative nudge to the camera distance for scripted moments (docking
  // fly-in, jump, cutscenes). set with pushZoom(factor, duration): the factor eases in then back out
  // over the duration, multiplying targetZoom during its active window. 0 = inactive. This cooperates
  // with the dynamic-zoom system (it biases the SAME _dynamicZoom the rest of the game uses) instead
  // of clobbering c.zoom the way the old uiRoot hard-set did.
  let _pushZoom = 0;          // current multiplicative offset added to the zoom factor (0 = none)
  let _pushZoomDecay = 0;     // per-second decay rate (derived from duration at push time)
  // FR-5: transient recenter after boost-release / tether-slingshot. While active, the lookahead +
  // aim + composition bias is scaled down so the frame glides to player-centered instead of the
  // sudden velocity change snapping the lookahead. Decays over its window with an ease-out.
  let _recenterT = 0;         // seconds remaining in the recenter window
  let _recenterDur = 0;       // total window length (for the ease fraction)
  let _snappedPlayerId = null;
  let _compositionBiasX = 0;
  let _compositionBiasZ = 0;
  let _contextZoomBias = 0;

  function snapToEntity(p) {
    if (!p || !p.pos) return false;
    const px = finiteOr(p.pos.x, 0);
    const pz = finiteOr(p.pos.z, 0);
    c.focus.set(px, 0, pz);
    _dynamicZoom = finiteOr(c.zoom, DEFAULT_ZOOM);
    _speedZoomFactor = SPEED_ZOOM_MIN;
    _speedZoomSampleT = 0;
    computeOffset(_dynamicZoom);
    cam.position.set(c.focus.x + offset.x, offset.y, c.focus.z + offset.z);
    cam.lookAt(c.focus.x, 0, c.focus.z);
    cam.updateMatrixWorld(true);
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
    setZoom(z) { c.zoom = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, finiteOr(z, c.zoom || DEFAULT_ZOOM))); },
    snapToPlayer() {
      const p = state.entities.get(state.playerId);
      return snapToEntity(p);
    },
    // pushZoom(factor, durationS): factor>0 pushes the camera OUT (wider), factor<0 pushes IN
    // (tighter) for `durationS`, easing in and out. e.g. pushZoom(0.25, 0.8) widens 25% over 0.8s;
    // pushZoom(-0.04, 0.25) tightens to 0.96x for 0.25s (kill-cam kiss). The effect is additive on
    // top of the dynamic zoom and decays smoothly.
    pushZoom(factor, durationS) {
      const f = Number.isFinite(factor) ? factor : 0;
      const d = Math.max(0.05, durationS || 0.5);
      _pushZoom = f;
      // ease in over ~half the duration, out over the other half → symmetric decay rate
      _pushZoomDecay = 4.0 / d;
    },
    killCam() {
      // Kill-cam "kiss" (spec2/02 §2): tighten to 0.96x for 250 ms on player kill only.
      this.pushZoom(-0.04, 0.25);
    },
    // FR-5: ease the camera back to a player-centered pose over durS after a boost-release or a
    // tether slingshot, instead of letting the sudden velocity change snap the lookahead. Respects
    // motionReduce (shortened). Cruise-drop settle stays owned by its own spec2/02 §1 path.
    easeRecenter(durS) {
      const base = Math.max(0.05, Number.isFinite(durS) ? durS : 0.4);
      _recenterDur = isMotionReduced(state) ? base * 0.25 : base;
      _recenterT = _recenterDur;
    },
    follow(dt) {
      const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1 / 15) : 0;
      const p = state.entities.get(state.playerId);
      let fx = finiteOr(c.focus.x, 0), fz = finiteOr(c.focus.z, 0);
      let bankForLean = 0;
      let playerSpeed = 0;
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
          const laCap = isCruising(state) ? LOOKAHEAD_MAX_CRUISE : LOOKAHEAD_MAX;
          const la = Math.min(c.lookAhead, laCap, playerSpeed * LOOKAHEAD_SPEED_SCALE);
          fx += (vx / playerSpeed) * la; fz += (vz / playerSpeed) * la;
        }
        const aimLead = resolveAimLead(state.input, p);
        fx += aimLead.x;
        fz += aimLead.z;
        const baseFx = fx;
        const baseFz = fz;
        const composition = resolveChaseComposition(state, p, { x: baseFx, z: baseFz });
        const motionScale = isMotionReduced(state) ? 0.35 : 1;
        const desiredBiasX = (composition.x - baseFx) * motionScale;
        const desiredBiasZ = (composition.z - baseFz) * motionScale;
        _compositionBiasX = dampSlewed(_compositionBiasX, desiredBiasX, COMPOSITION_BIAS_LERP, COMPOSITION_BIAS_SLEW, frameDt);
        _compositionBiasZ = dampSlewed(_compositionBiasZ, desiredBiasZ, COMPOSITION_BIAS_LERP, COMPOSITION_BIAS_SLEW, frameDt);
        _contextZoomBias = damp(_contextZoomBias, (composition.zoomBias || 0) * motionScale, CONTEXT_ZOOM_LERP, frameDt);
        fx = baseFx + _compositionBiasX;
        fz = baseFz + _compositionBiasZ;
        const desiredSafe = clampFocusToPlayerSafeRect({ x: fx, z: fz }, p, {
          zoom: _dynamicZoom,
          fov: cam.fov,
          aspect: cam.aspect,
        });
        fx = desiredSafe.x;
        fz = desiredSafe.z;
        // FR-5: during the recenter window, ease the accumulated lookahead/aim/composition bias
        // toward the ship so a boost-release or slingshot glides to center rather than snapping.
        if (_recenterT > 0) {
          _recenterT = Math.max(0, _recenterT - frameDt);
          const biasScale = recenterBiasScale(_recenterT, _recenterDur);
          fx = p.pos.x + (fx - p.pos.x) * biasScale;
          fz = p.pos.z + (fz - p.pos.z) * biasScale;
        }
        // counter-lean uses the ship's bank (already smoothed); fraction tuned for chase readability
        bankForLean = (Number.isFinite(p.bank) ? p.bank : 0) * 0.068;
      }
      const followLerp = finiteOr(c.lerp, 6);
      c.focus.x = damp(c.focus.x, fx, followLerp, frameDt);
      c.focus.z = damp(c.focus.z, fz, followLerp, frameDt);

      // --- dynamic zoom ---
      // Rank-13: chaseClose setting forces a tighter base; otherwise honor c.zoom (default 72).
      const baseZoom = resolveBaseZoom();
      let targetZoom = baseZoom;
      if (p && p.pos) {
        // Speed zoom target is sampled at a low cadence so the camera does not retarget every frame
        // from raw velocity noise. The actual distance still eases every frame through _dynamicZoom.
        _speedZoomSampleT -= frameDt;
        if (_speedZoomSampleT <= 0) {
          _speedZoomFactor = resolveSpeedZoomFactor(playerSpeed, p.maxSpeed || 120);
          _speedZoomSampleT = SPEED_ZOOM_SAMPLE_INTERVAL;
        }
        targetZoom = baseZoom * _speedZoomFactor;
        targetZoom *= (1 + _contextZoomBias);
        // Flyby Focus (overnight B1): pull camera in slightly so player + pass target stay framed.
        const ff = state.player && state.player.flybyFocus;
        if (ff && Number.isFinite(ff.zoom) && ff.zoom > 0.01) {
          targetZoom *= (1 - Math.min(0.22, ff.zoom * 0.18));
        }
      }
      // scripted push-zoom (dock fly-in / jump / kill-cam): multiplies the view while active, then
      // decays. Negative factors push IN (tighter). Applied to targetZoom so it eases through the
      // same _dynamicZoom damping as everything else.
      if (Math.abs(_pushZoom) > 0.0001) {
        targetZoom *= (1 + _pushZoom);
        _pushZoom += -_pushZoom * _pushZoomDecay * frameDt;
        if (Math.abs(_pushZoom) < 0.0001) _pushZoom = 0;
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
        c.trauma = decayCameraTrauma(c.trauma, frameDt);
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
