// Tilted top-down chase camera (ARCHITECTURE §0.14): follows player POSITION only (never yaw,
// anti-nausea), with damped follow, velocity look-ahead, aim bias, and trauma-based shake.
// Phase 1: adds a subtle camera roll that counter-leans into the ship's bank so high-G turns feel
// dynamic without violating the no-yaw-follow rule (we never rotate the camera's heading).
import * as THREE from 'three';
import { damp } from '../core/math.js';
import { globalToFrame } from '../core/coordinates.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { readFrameOrigin } from './frameCoordinates.js';
import { CameraDirectorMode, createCameraDirector } from './cameraDirector.js';
import { readVelocityLanguage } from './velocityLanguage.js';

// M2 floating origin: chase focus / camera pose are frame-local. Entity.pos stays galactic-global.
const _frameOriginScratch = { x: 0, z: 0 };
const _playerLocalScratch = { x: 0, z: 0 };
const _playerLocalProxy = { pos: _playerLocalScratch };

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
const ACTIVE_ATTACKER_SAFE_NDC = 0.6;
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
// Shake noise resample interval. Fixed so the shake's frequency content is the same on a 30 Hz and a
// 144 Hz display; only the amplitude envelope follows trauma decay. 32 Hz reads as a hard rattle
// without aliasing into a visible strobe at the low end.
const SHAKE_NOISE_STEP_S = 1 / 32;
const MOTION_REDUCE_SHAKE_SCALE = 0.25;
export const MASSLINE_RELEASE_ZOOM_MIN = 0.06;
export const MASSLINE_RELEASE_ZOOM_MAX = 0.14;
export const MASSLINE_RELEASE_ZOOM_DURATION_S = 0.65;
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
  return !!(state && state.settings && (
    state.settings.video && state.settings.video.motionReduce
    || state.settings.accessibility && state.settings.accessibility.motionPreference === 'reduce'
  ));
}

export function resolveMasslineReleaseCameraCue(payload, motionReduced = false) {
  const bonusDv = Math.max(0, finiteOr(payload && payload.bonusDv, 0));
  const earned = !!(payload && payload.source === 'massline' && payload.physicsEarned && bonusDv > 0);
  const strength = clamp01(bonusDv / 165);
  return {
    source: 'massline',
    physicsEarned: earned,
    zoomFactor: motionReduced || !earned
      ? 0
      : MASSLINE_RELEASE_ZOOM_MIN
        + (MASSLINE_RELEASE_ZOOM_MAX - MASSLINE_RELEASE_ZOOM_MIN) * strength,
    durationS: motionReduced ? 0 : MASSLINE_RELEASE_ZOOM_DURATION_S,
  };
}

export function applyMasslineReleaseCameraCue(cameraController, state, payload = {}) {
  const cue = resolveMasslineReleaseCameraCue(payload, isMotionReduced(state));
  const receipt = {
    schema: 'spaceface.masslineReleaseCameraCue.v1',
    releaseId: payload.releaseId || null,
    source: cue.source,
    physicsEarned: cue.physicsEarned,
    zoomFactor: cue.zoomFactor,
    durationS: cue.durationS,
    tick: Math.max(0, Math.trunc(finiteOr(state && state.tick, 0))),
  };
  if (cue.physicsEarned && cameraController && typeof cameraController.easeRecenter === 'function') {
    cameraController.easeRecenter(0.4);
  }
  if (cue.zoomFactor > 0 && cameraController && typeof cameraController.pushZoom === 'function') {
    cameraController.pushZoom(cue.zoomFactor, cue.durationS);
  }
  if (state) {
    if (!state.render) state.render = {};
    state.render.lastMasslineReleaseCue = receipt;
  }
  return receipt;
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

export function resolveChaseComposition(state, player, focus, view = {}) {
  let fx = focus && Number.isFinite(focus.x) ? focus.x : (player && player.pos ? player.pos.x : 0);
  let fz = focus && Number.isFinite(focus.z) ? focus.z : (player && player.pos ? player.pos.z : 0);
  let nearbyEnemies = 0;
  let nearestThreat = null;
  let nearestThreatD2 = Infinity;
  let activeAttacker = null;
  let activeAttackerD2 = Infinity;
  let zoomBias = 0;

  if (!state || !player || !player.pos || !state.entities || typeof state.entities.values !== 'function') {
    return { x: fx, z: fz, nearbyEnemies, hasThreatFocus: false, hasTetherFocus: false, zoomBias, minZoom: 0 };
  }

  // Combat composes player + nearest threat instead of only following the player.
  for (const e of state.entities.values()) {
    if (e === player) continue;
    if (e.type !== 'ship' || e.alive === false || e.hull <= 0 || !e.pos) continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    const combat = e.data && e.data.combat;
    const attacksPlayer = !!(combat && (combat.targetId === player.id || combat.lockTarget === player.id));
    if (attacksPlayer && d2 < activeAttackerD2) {
      activeAttacker = e;
      activeAttackerD2 = d2;
    }
    if (d2 < THREAT_COMPOSE_RANGE * THREAT_COMPOSE_RANGE) {
      nearbyEnemies++;
      if (d2 < nearestThreatD2) {
        nearestThreat = e;
        nearestThreatD2 = d2;
      }
    }
  }

  const composedThreat = activeAttacker || nearestThreat;
  const composedThreatD2 = activeAttacker ? activeAttackerD2 : nearestThreatD2;
  if (composedThreat && composedThreatD2 > 1) {
    const d = Math.sqrt(composedThreatD2);
    // A contact actively attacking the player is functional context, not ambient composition.
    // Bias near the pair midpoint; passive hostiles keep the restrained ordinary chase nudge.
    const bias = activeAttacker
      ? d * 0.5
      : Math.min(THREAT_COMPOSE_MAX_BIAS, d * THREAT_COMPOSE_FRACTION);
    fx += ((composedThreat.pos.x - player.pos.x) / d) * bias;
    fz += ((composedThreat.pos.z - player.pos.z) / d) * bias;
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

  let minZoom = 0;
  if (activeAttacker) {
    const fov = Math.max(10, Math.min(140, finiteOr(view.fov, 50)));
    const tanHalf = Math.tan(fov * Math.PI / 360);
    const aspect = Math.max(0.45, finiteOr(view.aspect, 16 / 9));
    const tilt = Math.max(1, Math.min(89, finiteOr(view.tiltDeg, 60))) * Math.PI / 180;
    for (const item of [player, activeAttacker]) {
      const radius = Math.max(0, finiteOr(item.radius, 4));
      const dx = Math.abs(item.pos.x - fx);
      const dz = Math.abs(item.pos.z - fz);
      minZoom = Math.max(
        minZoom,
        Math.cos(tilt) * dz + radius + (dx + radius) / (tanHalf * aspect * ACTIVE_ATTACKER_SAFE_NDC),
        Math.cos(tilt) * dz + radius + (Math.sin(tilt) * dz + radius) / (tanHalf * ACTIVE_ATTACKER_SAFE_NDC),
      );
    }
    minZoom = Math.min(CAMERA_ZOOM_MAX, minZoom);
  }

  return {
    x: fx,
    z: fz,
    nearbyEnemies,
    hasThreatFocus: !!nearestThreat,
    hasActiveAttacker: !!activeAttacker,
    hasTetherFocus: !!tetherAnchor,
    zoomBias: Math.min(CONTEXT_ZOOM_MAX, zoomBias),
    minZoom,
  };
}

function resolveTetherCompositionAnchor(state, player) {
  if (!state || !player || !state.entities || typeof state.entities.get !== 'function') return null;

  let x = 0;
  let z = 0;
  let weightTotal = 0;
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (attachments) {
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
  }

  // Ordinary mining/massline: state.player.tether is the HUD-facing authority and may be present
  // before combat.attachments is mirrored. Use it so modest tether composition + threat context
  // still work when the director intentionally stays on FOLLOW for non-hostile latches.
  if (weightTotal <= 0) {
    const tether = state.player && state.player.tether;
    if (tether && tether.active && tether.targetId != null) {
      const other = state.entities.get(tether.targetId);
      if (other && other.alive !== false && other.pos
        && Number.isFinite(other.pos.x) && Number.isFinite(other.pos.z)) {
        return { x: other.pos.x, z: other.pos.z };
      }
    }
    return null;
  }
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
  let _pushZoomPeak = 0;      // rise target while easing in; 0 once the peak has been reached
  let _pushZoomRise = 0;      // per-second rise rate (derived from duration at push time)
  // Shake noise is resampled at a fixed rate so shake FREQUENCY does not track display refresh.
  let _shakeNoiseT = 0;
  const _shakeNoise = [0, 0, 0, 0];   // posX, posZ, roll, pitch — held between resample steps
  // FR-5: transient recenter after boost-release / tether-slingshot. While active, the lookahead +
  // aim + composition bias is scaled down so the frame glides to player-centered instead of the
  // sudden velocity change snapping the lookahead. Decays over its window with an ease-out.
  let _recenterT = 0;         // seconds remaining in the recenter window
  let _recenterDur = 0;       // total window length (for the ease fraction)
  let _snappedPlayerId = null;
  let _compositionBiasX = 0;
  let _compositionBiasZ = 0;
  let _contextZoomBias = 0;
  let _contextMinZoom = 0;
  let _dynamicNear = cam.near;
  const cameraDirector = createCameraDirector();
  let _directorFrame = cameraDirector.output;
  const _directorView = {
    followX: 0,
    followZ: 0,
    followZoom: DEFAULT_ZOOM,
    fov: cam.fov,
    aspect: cam.aspect,
    tiltDeg: c.tilt || 60,
  };

  function snapToEntity(p) {
    if (!p || !p.pos) return false;
    const frameOrigin = readFrameOrigin(state, _frameOriginScratch);
    globalToFrame(p.pos, frameOrigin, _playerLocalScratch);
    const px = _playerLocalScratch.x;
    const pz = _playerLocalScratch.z;
    c.focus.set(px, 0, pz);
    _dynamicZoom = finiteOr(c.zoom, DEFAULT_ZOOM);
    _dynamicNear = 1;
    if (cam.near !== 1) {
      cam.near = 1;
      cam.updateProjectionMatrix();
    }
    _speedZoomFactor = SPEED_ZOOM_MIN;
    _speedZoomSampleT = 0;
    computeOffset(_dynamicZoom);
    cam.position.set(c.focus.x + offset.x, offset.y, c.focus.z + offset.z);
    cam.lookAt(c.focus.x, 0, c.focus.z);
    cam.updateMatrixWorld(true);
    _directorFrame = cameraDirector.reset(px, pz, _dynamicZoom);
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
    // M2: on frameOriginSeq change, reproject local focus/camera so the frame does not one-frame jump.
    // Composition biases are relative and stay valid; director absolute focus is shifted by the same delta.
    reprojectFrame(dx, dz) {
      const ox = Number.isFinite(dx) ? dx : 0;
      const oz = Number.isFinite(dz) ? dz : 0;
      if (ox === 0 && oz === 0) return;
      if (c.focus) {
        c.focus.x += ox;
        c.focus.z += oz;
      }
      cam.position.x += ox;
      cam.position.z += oz;
      if (cameraDirector && typeof cameraDirector.reprojectFrame === 'function') {
        cameraDirector.reprojectFrame(ox, oz);
      } else if (_directorFrame) {
        _directorFrame.focusX = finiteOr(_directorFrame.focusX, 0) + ox;
        _directorFrame.focusZ = finiteOr(_directorFrame.focusZ, 0) + oz;
      }
      cam.updateMatrixWorld(true);
    },
    composition() { return _directorFrame; },
    // pushZoom(factor, durationS): factor>0 pushes the camera OUT (wider), factor<0 pushes IN
    // (tighter) for `durationS`, easing in and out. e.g. pushZoom(0.25, 0.8) widens 25% over 0.8s;
    // pushZoom(-0.04, 0.25) tightens to 0.96x for 0.25s (kill-cam kiss). The effect is additive on
    // top of the dynamic zoom and decays smoothly.
    pushZoom(factor, durationS) {
      const f = Number.isFinite(factor) ? factor : 0;
      const d = Math.max(0.05, durationS || 0.5);
      // Ease IN to the peak rather than jumping to it. The docstring above has always promised
      // "eases in then back out", but this used to be `_pushZoom = f` — a single-frame step. The
      // biggest caller is uiRoot.js's dock fly-in at pushZoom(-0.45, 1.2), so the camera snapped 45%
      // tighter in one frame and then eased out, which read as a cut rather than a move. The rise is
      // deliberately ~3x the decay rate so the peak still lands early in the window and the overall
      // envelope keeps its old shape; only the discontinuity is gone.
      _pushZoomPeak = f;
      _pushZoomRise = 12.0 / d;
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
      let directorOwnsComposition = false;
      if (p && p.pos) {
        if (_snappedPlayerId !== p.id || !Number.isFinite(c.focus.x) || !Number.isFinite(c.focus.z)) {
          snapToEntity(p);
        }
        // Frame-local player target: composition biases stay relative (global deltas === local deltas).
        const frameOrigin = readFrameOrigin(state, _frameOriginScratch);
        globalToFrame(p.pos, frameOrigin, _playerLocalScratch);
        _playerLocalProxy.pos = _playerLocalScratch;
        fx = _playerLocalScratch.x;
        fz = _playerLocalScratch.z;
        const vx = p.vel ? finiteOr(p.vel.x, 0) : 0;
        const vz = p.vel ? finiteOr(p.vel.z, 0) : 0;
        playerSpeed = Math.hypot(vx, vz);
        const focusGap = Math.hypot(c.focus.x - fx, c.focus.z - fz);
        if (_directorFrame.mode === CameraDirectorMode.FOLLOW
          && focusGap > Math.max(320, _dynamicZoom * 2.6)) {
          snapToEntity(p);
          globalToFrame(p.pos, readFrameOrigin(state, _frameOriginScratch), _playerLocalScratch);
          fx = _playerLocalScratch.x;
          fz = _playerLocalScratch.z;
        }
        if (playerSpeed > 1) {
          const laCap = isCruising(state) ? LOOKAHEAD_MAX_CRUISE : LOOKAHEAD_MAX;
          const la = Math.min(c.lookAhead, laCap, playerSpeed * LOOKAHEAD_SPEED_SCALE);
          fx += (vx / playerSpeed) * la; fz += (vz / playerSpeed) * la;
          // Band-3 velocity lead (ADR D7): at >5x combat speed a few WU of camera lead along the
          // velocity vector read as terrifying speed. READ, never re-derived — `readVelocityLanguage`
          // is the one consumer of the record `feel.js` publishes; a reader that derived its own band
          // would become a second producer and drift from what the streaks and the sky are saying.
          // The record forces cameraLeadWU to 0 under motionReduce, so this single read respects it
          // without the camera lane second-guessing the field's reduction.
          const vl = readVelocityLanguage(state);
          const leadWU = vl && vl.drive && Number.isFinite(vl.drive.cameraLeadWU) ? vl.drive.cameraLeadWU : 0;
          if (leadWU > 0) {
            fx += (vx / playerSpeed) * leadWU; fz += (vz / playerSpeed) * leadWU;
          }
        }
        const aimLead = resolveAimLead(state.input, p);
        fx += aimLead.x;
        fz += aimLead.z;
        const baseFx = fx;
        const baseFz = fz;
        _directorView.followX = baseFx;
        _directorView.followZ = baseFz;
        _directorView.followZoom = resolveBaseZoom() * _speedZoomFactor;
        _directorView.fov = cam.fov;
        _directorView.aspect = cam.aspect;
        _directorView.tiltDeg = c.tilt || 60;
        // Seed pair entry from the pose the player actually saw last frame, not the director's
        // undamped FOLLOW request. Functional pair framing is identical under reduced motion.
        if (_directorFrame.mode === CameraDirectorMode.FOLLOW) {
          _directorFrame = cameraDirector.syncFollow(c.focus.x, c.focus.z, _dynamicZoom);
        }
        _directorFrame = cameraDirector.step(frameDt, state, p, _directorView);
        directorOwnsComposition = _directorFrame.mode !== CameraDirectorMode.FOLLOW;
        if (directorOwnsComposition) {
          fx = _directorFrame.focusX;
          fz = _directorFrame.focusZ;
          _compositionBiasX = 0;
          _compositionBiasZ = 0;
          _contextZoomBias = 0;
          _contextMinZoom = 0;
        } else {
          // Seed focus is frame-local; threat/tether biases are pure relative offsets (origin-invariant).
          const composition = resolveChaseComposition(state, p, { x: baseFx, z: baseFz }, _directorView);
          const motionScale = isMotionReduced(state) ? 0.35 : 1;
          // Keeping an active attacker visible is functional combat framing, not decorative motion.
          // Reduced-motion may soften ambient/tether bias but must not move the actual threat out of
          // the zoom geometry that was computed to contain it.
          const compositionScale = composition.hasActiveAttacker ? 1 : motionScale;
          const desiredBiasX = (composition.x - baseFx) * compositionScale;
          const desiredBiasZ = (composition.z - baseFz) * compositionScale;
          _compositionBiasX = dampSlewed(_compositionBiasX, desiredBiasX, COMPOSITION_BIAS_LERP, COMPOSITION_BIAS_SLEW, frameDt);
          _compositionBiasZ = dampSlewed(_compositionBiasZ, desiredBiasZ, COMPOSITION_BIAS_LERP, COMPOSITION_BIAS_SLEW, frameDt);
          _contextZoomBias = damp(_contextZoomBias, (composition.zoomBias || 0) * compositionScale, CONTEXT_ZOOM_LERP, frameDt);
          _contextMinZoom = Math.max(0, finiteOr(composition.minZoom, 0));
          fx = baseFx + _compositionBiasX;
          fz = baseFz + _compositionBiasZ;
          const desiredSafe = clampFocusToPlayerSafeRect({ x: fx, z: fz }, _playerLocalProxy, {
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
            fx = _playerLocalScratch.x + (fx - _playerLocalScratch.x) * biasScale;
            fz = _playerLocalScratch.z + (fz - _playerLocalScratch.z) * biasScale;
          }
        }
        // counter-lean uses the ship's bank (already smoothed); fraction tuned for chase readability
        bankForLean = (Number.isFinite(p.bank) ? p.bank : 0) * 0.068;
      }
      const followLerp = finiteOr(c.lerp, 6);
      if (directorOwnsComposition) {
        c.focus.x = fx;
        c.focus.z = fz;
      } else {
        c.focus.x = damp(c.focus.x, fx, followLerp, frameDt);
        c.focus.z = damp(c.focus.z, fz, followLerp, frameDt);
      }

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
        targetZoom = Math.max(targetZoom, _contextMinZoom);
        const tether = state.player && state.player.tether;
        if (!directorOwnsComposition && tether && tether.active) {
          // Mining/neutral massline keeps the ordinary chase camera. Slowing to work a tether must
          // never make speed-zoom collapse the battlefield around player + rock; preserve the
          // player's selected tactical distance and let context bias widen from there.
          targetZoom = Math.max(targetZoom, baseZoom * (1 + _contextZoomBias));
        }
      }
      // scripted push-zoom (dock fly-in / jump / kill-cam): multiplies the view while active, then
      // decays. Negative factors push IN (tighter). Applied to targetZoom so it eases through the
      // same _dynamicZoom damping as everything else.
      // damp() rather than Euler (`x += -x * rate * dt`) in both phases: killCam() pushes with a
      // 0.25 s duration, so _pushZoomDecay is 16/s, and against follow()'s 1/15 s frameDt clamp the
      // Euler step factor reached 1.067 — past 1, which flips the sign. Because the factor is applied
      // as `targetZoom *= (1 + _pushZoom)`, a sign flip pulls the camera through the ship. damp() is
      // exp(-rate*dt) and cannot overshoot at any dt.
      if (Math.abs(_pushZoom) > 0.0001 || Math.abs(_pushZoomPeak) > 0.0001) {
        if (!directorOwnsComposition) targetZoom *= (1 + _pushZoom);
        if (Math.abs(_pushZoomPeak) > 0.0001) {
          _pushZoom = damp(_pushZoom, _pushZoomPeak, _pushZoomRise, frameDt);
          // Hand off to the decay phase once the rise has essentially arrived, so a push always
          // returns to 0 even if the peak is never reached exactly.
          if (Math.abs(_pushZoomPeak - _pushZoom) <= Math.abs(_pushZoomPeak) * 0.06) _pushZoomPeak = 0;
        } else {
          _pushZoom = damp(_pushZoom, 0, _pushZoomDecay, frameDt);
          if (Math.abs(_pushZoom) < 0.0001) _pushZoom = 0;
        }
      }
      _dynamicZoom = directorOwnsComposition
        ? _directorFrame.zoom
        : damp(_dynamicZoom, targetZoom, ZOOM_LERP, frameDt);
      // Oversized authored gates can physically surround the chase camera even while the aperture
      // is correctly composed. The director derives a conservative near plane from the mounted
      // gate's real depth bounds; easing is owned by the same 0.35 s transition as focus/zoom.
      // Ordinary chase, manual flight, and Flyby Focus all remain at the canonical 1 wu near plane.
      const nextNear = directorOwnsComposition ? finiteOr(_directorFrame.nearPlane, 1) : 1;
      _dynamicNear = Math.max(1, Math.min(160, nextNear));
      if (Math.abs(cam.near - _dynamicNear) > 0.01) {
        cam.near = _dynamicNear;
        cam.updateProjectionMatrix();
      }
      if (p && p.pos && !directorOwnsComposition) {
        // Safe-rect is frame-local (player proxy holds projected XZ for this frame).
        const safeFocus = clampFocusToPlayerSafeRect(c.focus, _playerLocalProxy, { zoom: _dynamicZoom, fov: cam.fov, aspect: cam.aspect });
        if (safeFocus.clamped) {
          c.focus.x = safeFocus.x;
          c.focus.z = safeFocus.z;
        }
      }
      if (!directorOwnsComposition) {
        _directorFrame = cameraDirector.syncFollow(c.focus.x, c.focus.z, _dynamicZoom);
      }
      computeOffset(_dynamicZoom);
      let shakeRoll = 0;
      let shakePitch = 0;
      if (c.trauma > 0) {
        c.trauma = decayCameraTrauma(c.trauma, frameDt);
        const t2 = c.trauma * c.trauma;
        // Shake amplitude = motionReduce factor × band-3 shakeScale × trauma². The two reductions are
        // composed deliberately rather than folded: motionReduce is the player's accessibility choice
        // and is owned HERE; shakeScale is the ADR D7 band-3 design choice (1 → 0.55 across ratio
        // 5 → 10) and is owned by velocityLanguage.js, which the field leaves UNSCALED by motionReduce
        // so the camera lane's own motionReduce handling is what carries the accessibility reduction.
        const motionScale = isMotionReduced(state) ? MOTION_REDUCE_SHAKE_SCALE : 1;
        const vl = readVelocityLanguage(state);
        const bandShake = vl && vl.drive && Number.isFinite(vl.drive.shakeScale) ? vl.drive.shakeScale : 1;
        const shakeScale = motionScale * bandShake;
        // Resample the shake noise on a FIXED-RATE accumulator, not once per rendered frame. The
        // amplitude was already frame-rate independent (trauma decays against frameDt above), but the
        // *frequency* was the display refresh rate: the same trauma read as a fast buzz at 144 Hz and
        // a slow wobble at 30 Hz, so shake felt like a different effect on different monitors. Held
        // between steps, so the four channels stay mutually coherent the way the note below requires.
        _shakeNoiseT += frameDt;
        while (_shakeNoiseT >= SHAKE_NOISE_STEP_S) {
          _shakeNoiseT -= SHAKE_NOISE_STEP_S;
          _shakeNoise[0] = Math.random() * 2 - 1;
          _shakeNoise[1] = Math.random() * 2 - 1;
          _shakeNoise[2] = Math.random() * 2 - 1;
          _shakeNoise[3] = Math.random() * 2 - 1;
        }
        c.shakeOffset.set(
          _shakeNoise[0] * SHAKE_POS_MAX * shakeScale * t2,
          0,
          _shakeNoise[1] * SHAKE_POS_MAX * shakeScale * t2,
        );
        // GR-6: angular shake — roll + pitch jitter, trauma²-scaled. Sampled together with the
        // translational channels so it stays coherent rather than vibrating independently.
        shakeRoll = _shakeNoise[2] * SHAKE_ROT_ROLL * shakeScale * t2;
        shakePitch = _shakeNoise[3] * SHAKE_ROT_PITCH * shakeScale * t2;
      } else {
        c.shakeOffset.set(0, 0, 0);
        // Arm the resampler so the FIRST shaking frame displaces immediately. Without this the
        // fixed-rate accumulator can swallow up to one step (31 ms) before the first sample lands,
        // which both softens the impact the shake is reacting to and leaves shakeOffset at zero on
        // the frame trauma arrives.
        _shakeNoiseT = SHAKE_NOISE_STEP_S;
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
