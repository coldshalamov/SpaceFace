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
import {
  readOwnedExceptionalSpeed,
  readVelocityLanguage,
  resolveExceptionalSpeed,
  VL_EXCEPTIONAL_SPEED_RATIO_MAX,
} from './velocityLanguage.js';
import { resolveGovernedCombatSpeed } from '../core/flight/propulsionCatalog.js';

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
// U13: slightly tighter than the 0.80 pair contract so an active attacker stays readable inside the
// 10% margin even when safe-rect clamping and dodge lead compete for focus.
const ACTIVE_ATTACKER_SAFE_NDC = 0.55;
const COMPOSITION_BIAS_LERP = 1.6;
const COMPOSITION_BIAS_SLEW = 90;
const CONTEXT_ZOOM_LERP = 1.2;
const SAFE_VIEW_X = 0.52;
const SAFE_VIEW_Z = 0.46;
const LOOKAHEAD_MAX = 18;           // wu — normal cap
const LOOKAHEAD_MAX_CRUISE = 26;    // wu — cruise-only cap (spec2/02 §2)
const LOOKAHEAD_SPEED_SCALE = 0.35; // velocity bias multiplier
// U13 (WF-15): when an active attacker owns combat framing, velocity look-ahead must not yank the
// pair out of the safe frame during a dodge. Full look-ahead remains for travel/cruise; combat only
// keeps a fraction so the pilot's dodge still reads without the camera abandoning the threat.
export const ACTIVE_ATTACKER_LOOKAHEAD_SCALE = 0.32;
// Sticky composed-threat hold: dense furballs thrash nearest/active identity every few frames and
// the composition bias slews between anchors. Hold the current anchor briefly unless a challenger
// is meaningfully closer or a new active attacker appears.
export const COMPOSITION_THREAT_STICK_S = 0.28;
export const COMPOSITION_THREAT_STICK_CLOSER = 0.85; // challenger must be < 85% of sticky distance
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
export const SPEED_ZOOM_MAX = 1.35;               // was 1.18 — the at-cruise frame widens ~14 %
export const PHYSICS_EARNED_SPEED_ZOOM_MAX = 3.5; // was 1.55 — "max ~3x at ~550" (FEEL_CONTRACT §C)
export const PHYSICS_EARNED_SPEED_RATIO_MAX = VL_EXCEPTIONAL_SPEED_RATIO_MAX;
const ZOOM_LERP = 1.4;              // /s — speed-zoom ease (spec2/02 §2)
// Boost framing is a sustained state cue, not an ignition impulse. A short Shift tap should barely
// move the view; held boost can still earn a small amount of extra breathing room.
export const BOOST_CAMERA_ZOOM_TARGET = 1.025;
export const BOOST_CAMERA_ZOOM_LERP = 0.8; // /s — deliberately slower than ordinary speed zoom
// U13: single-frame outward zoom cap. The Focus-lease continuity contract forbids a cut larger
// than 6 wu/frame; stay under that while still letting active-attacker minZoom open the frame.
const ZOOM_OUT_STEP_MAX_WU = 5.5;
// R1 gameplay-scale reset: 144 WU is the selected normal framing. At 1600×1000 the starter hull
// occupies ~10.6% of frame width while a nearby structure and three actors can share the view. The
// GameState schema owns the same fresh-run default; explicit runtime camera:zoom choices remain exact.
const DEFAULT_ZOOM = 144;
export const CHASE_ZOOM_DEFAULT = DEFAULT_ZOOM;
export const CHASE_ZOOM_CLOSE = 58; // optional tighter profile (settings.video.chaseClose)
// Flyable-ship remaster stills must use this pose: tools/blender/spaceface_chase_camera.py
// (60° tilt, 50° vertical FOV, offset (0, D*sin60, -D*cos60)). Studio beauty cameras do not count.

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

/**
 * Distance falloff for a camera shake raised by a WORLD event (a ship dying somewhere) rather than
 * by something happening to the player.
 *
 * `camera:shake` has 13 emitters and the consumer used to read only `{ amount }`, so a shake was a
 * scalar with no notion of where it came from — an NPC exploding at the far edge of the sector hit
 * the player's camera exactly as hard as one exploding on their nose. Emitters that are already
 * player-scoped by construction (player hit, player death, respawn, drill, tether) send no position
 * and are passed through untouched; emitters describing a world event send one and get attenuated.
 *
 * Shape: full strength inside FULL_RADIUS, a 1/d rolloff beyond it, and a linear taper so the
 * contribution reaches exactly zero at CUTOFF_RADIUS instead of trailing off asymptotically. Trauma
 * is squared when it becomes shake amplitude, so mid-range values damp hard already.
 */
export const SHAKE_FULL_RADIUS_WU = 90;
export const SHAKE_CUTOFF_RADIUS_WU = 1200;

export function shakeDistanceAttenuation(distanceWu) {
  const d = Number.isFinite(distanceWu) ? Math.max(0, distanceWu) : 0;
  if (d <= SHAKE_FULL_RADIUS_WU) return 1;
  if (d >= SHAKE_CUTOFF_RADIUS_WU) return 0;
  const rolloff = SHAKE_FULL_RADIUS_WU / d;
  const taper = 1 - (d - SHAKE_FULL_RADIUS_WU) / (SHAKE_CUTOFF_RADIUS_WU - SHAKE_FULL_RADIUS_WU);
  return Math.max(0, Math.min(1, rolloff * taper));
}

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

function readPlayerEntity(state) {
  const entities = state && state.entities;
  if (!entities || typeof entities.get !== 'function') return null;
  return entities.get(state.playerId) || null;
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

function resolveAimLead(input, player, out = null) {
  const result = out || {};
  if (!input || !input.aimWorld || !player || !player.pos) {
    result.x = 0;
    result.z = 0;
    return result;
  }
  const px = finiteOr(player.pos.x, 0);
  const pz = finiteOr(player.pos.z, 0);
  const dx = finiteOr(input.aimWorld.x, px) - px;
  const dz = finiteOr(input.aimWorld.z, pz) - pz;
  const d = Math.hypot(dx, dz);
  if (d <= 0.0001) {
    result.x = 0;
    result.z = 0;
    return result;
  }
  const lead = Math.min(AIM_BIAS_MAX, d * AIM_BIAS);
  result.x = (dx / d) * lead;
  result.z = (dz / d) * lead;
  return result;
}

export function recenterBiasScale(remaining, duration) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (dur <= 0) return 0;
  const t = clamp01(1 - Math.max(0, finiteOr(remaining, 0)) / dur);
  const smooth = t * t * (3 - 2 * t);
  return 1 - smooth;
}

export function clampFocusToPlayerSafeRect(focus, player, options = {}, out = null) {
  const result = out || {};
  const playerX = player && player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
  const playerZ = player && player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
  if (!player || !player.pos) {
    result.x = focus && Number.isFinite(focus.x) ? focus.x : 0;
    result.z = focus && Number.isFinite(focus.z) ? focus.z : 0;
    result.clamped = false;
    delete result.safeX;
    delete result.safeZ;
    return result;
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
  result.x = x;
  result.z = z;
  result.clamped = clamped;
  result.safeX = safeX;
  result.safeZ = safeZ;
  return result;
}

export function resolveSpeedZoomFactor(speed, maxSpeed, physicsEarned = false) {
  const shipMax = Math.max(1, finiteOr(maxSpeed, 120));
  const speedRatio = Math.max(0, finiteOr(speed, 0) / shipMax);
  const ordinaryRatio = Math.min(1, speedRatio);
  const ordinaryFactor = SPEED_ZOOM_MIN + (SPEED_ZOOM_MAX - SPEED_ZOOM_MIN) * ordinaryRatio;
  return resolveExceptionalSpeedZoomFactor(
    resolveExceptionalSpeed(speed, shipMax, physicsEarned),
    ordinaryFactor,
  );
}

/** Apply a normalized, owner-validated shared-record scalar to an ordinary camera factor. */
export function resolveExceptionalSpeedZoomFactor(exceptionalSpeed, ordinaryFactor = SPEED_ZOOM_MAX) {
  const base = Number.isFinite(ordinaryFactor) ? ordinaryFactor : SPEED_ZOOM_MAX;
  const intensity = clamp01(exceptionalSpeed);
  return base + (PHYSICS_EARNED_SPEED_ZOOM_MAX - base) * intensity;
}

/**
 * Smooth the small camera-distance cue owned by sustained player boost.
 *
 * Keeping this separate from `pushZoom` prevents boost taps from scheduling a fresh in/out pulse
 * on every release. The helper is pure so the tap-vs-hold continuity contract can be tested without
 * booting Three.js.
 */
export function stepBoostZoomFactor(current, boosting, dt, motionReduced = false) {
  const value = Number.isFinite(current) ? current : 1;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const target = boosting && !motionReduced ? BOOST_CAMERA_ZOOM_TARGET : 1;
  return damp(value, target, BOOST_CAMERA_ZOOM_LERP, step);
}

export function resolveInitialChaseZoom(zoom) {
  const requested = finiteOr(zoom, DEFAULT_ZOOM);
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, requested));
}

// Entity types that can be battlefield threat context. Flyby Focus leases ships AND drones
// (src/systems/flybyFocus.js:81 `isHostileShip`), so a ship-only filter here made a leased drone
// invisible to threat composition — no bias, no zoom floor, not even counted as a nearby enemy.
// Hostility is still decided by isHostileToPlayer; this only widens which shapes are asked.
function isComposableThreatType(entity) {
  return entity.type === 'ship' || entity.type === 'drone';
}

// A live Flyby Focus lease names the contact the GAME has decided the player is dealing with right
// now: state.player.flybyFocus.targetId is its dedicated lease authority while Focus slows time to
// 50% and opens the latch window. The lease is granted on pass GEOMETRY (proximity + closing speed,
// flybyFocus.js:173-213), not on the
// leased ship having targeted the player, so a genuine high-speed pass by a hostile whose combat
// target is someone else read as ambient traffic here and could leave the frame for the whole
// three-second window.
//
// This does NOT give focus camera authority — that takeover (FOCUS_PAIR) was removed deliberately
// and stays removed. The lease only promotes an already-hostile contact from ambient to active
// attacker inside the composition the chase camera already runs: the same damped, slew-limited bias
// and the same safe-rect clamp every other attacker gets. Focus still never moves the camera; what
// it points at just stops falling off the edge of the screen.
function readFlybyLeaseTargetId(state) {
  const focus = state && state.player && state.player.flybyFocus;
  if (!focus || focus.active !== true || focus.targetId == null) return null;
  return focus.targetId;
}

/**
 * Cheap gate for combat look-ahead attenuation (U13). True when the chase camera is about to
 * treat an active attacker as functional framing — sticky hold still active, live Flyby lease, or
 * any hostile currently targeting the player. Pure; does not mutate sticky.
 */
export function playerHasActiveAttackerFraming(state, player, sticky = null) {
  if (!state || !player) return false;
  if (sticky && sticky.wasActive && sticky.remainS > 0 && sticky.id != null) {
    const held = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(sticky.id)
      : null;
    if (held && held.alive !== false && held.hull > 0) return true;
  }
  if (readFlybyLeaseTargetId(state) != null) return true;
  if (!state.entities || typeof state.entities.values !== 'function') return false;
  for (const e of cameraThreatCandidates(state)) {
    if (e === player) continue;
    if (!isComposableThreatType(e) || e.alive === false || e.hull <= 0 || !e.pos) continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    const combat = e.data && e.data.combat;
    if (combat && (combat.targetId === player.id || combat.lockTarget === player.id)) return true;
  }
  return false;
}

function extendCompositionMinZoom(minZoom, item, fx, fz, tanHalf, aspect, tilt) {
  const radius = Math.max(0, finiteOr(item.radius, 4));
  const dx = Math.abs(item.pos.x - fx);
  const dz = Math.abs(item.pos.z - fz);
  return Math.max(
    minZoom,
    Math.cos(tilt) * dz + radius + (dx + radius) / (tanHalf * aspect * ACTIVE_ATTACKER_SAFE_NDC),
    Math.cos(tilt) * dz + radius + (Math.sin(tilt) * dz + radius) / (tanHalf * ACTIVE_ATTACKER_SAFE_NDC),
  );
}

function cameraThreatCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return state && state.entities && typeof state.entities.values === 'function'
    ? state.entities.values()
    : [];
}

/**
 * Optional sticky bag for dense-scene threat thrash (U13). Mutated in place by resolveChaseComposition
 * when provided by the live chase camera. Pure callers (checks/tests) omit it and get frame-instant
 * selection exactly as before.
 *
 *   sticky = { id: null|entityId, remainS: number, wasActive: boolean }
 */
export function resolveChaseComposition(state, player, focus, view = {}, out = null, tetherOut = null, sticky = null) {
  const result = out || {};
  let fx = focus && Number.isFinite(focus.x) ? focus.x : (player && player.pos ? player.pos.x : 0);
  let fz = focus && Number.isFinite(focus.z) ? focus.z : (player && player.pos ? player.pos.z : 0);
  let nearbyEnemies = 0;
  let nearestThreat = null;
  let nearestThreatD2 = Infinity;
  let activeAttacker = null;
  let activeAttackerD2 = Infinity;
  let nearestThreatTied = false;
  let activeAttackerTied = false;
  let zoomBias = 0;

  if (!state || !player || !player.pos || !state.entities || typeof state.entities.values !== 'function') {
    result.x = fx;
    result.z = fz;
    result.nearbyEnemies = nearbyEnemies;
    result.hasThreatFocus = false;
    delete result.hasActiveAttacker;
    result.hasTetherFocus = false;
    result.zoomBias = zoomBias;
    result.minZoom = 0;
    result.composedThreatId = null;
    return result;
  }

  const leasedTargetId = readFlybyLeaseTargetId(state);

  // Combat composes player + nearest threat instead of only following the player.
  for (const e of cameraThreatCandidates(state)) {
    if (e === player) continue;
    if (!isComposableThreatType(e) || e.alive === false || e.hull <= 0 || !e.pos) continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    const combat = e.data && e.data.combat;
    const attacksPlayer = !!(combat && (combat.targetId === player.id || combat.lockTarget === player.id))
      || (leasedTargetId != null && e.id === leasedTargetId);
    if (attacksPlayer && d2 < activeAttackerD2) {
      activeAttacker = e;
      activeAttackerD2 = d2;
      activeAttackerTied = false;
    } else if (activeAttacker && attacksPlayer && d2 === activeAttackerD2) {
      activeAttackerTied = true;
    }
    if (d2 < THREAT_COMPOSE_RANGE * THREAT_COMPOSE_RANGE) {
      nearbyEnemies++;
      if (d2 < nearestThreatD2) {
        nearestThreat = e;
        nearestThreatD2 = d2;
        nearestThreatTied = false;
      } else if (nearestThreat && d2 === nearestThreatD2) {
        nearestThreatTied = true;
      }
    }
  }

  if (activeAttackerTied || nearestThreatTied) {
    // Reconciliation can rebuild shipLike from swap-removed entityList order, while the legacy scan
    // used Map insertion order. Resolve all exact ties in one conditional Map pass so the first-wins
    // contract stays exact without turning a symmetric formation into repeated full-map scans.
    let resolvedActive = activeAttackerTied ? null : activeAttacker;
    let resolvedNearest = nearestThreatTied ? null : nearestThreat;
    for (const e of state.entities.values()) {
      if (e === player) continue;
      if (!isComposableThreatType(e) || e.alive === false || e.hull <= 0 || !e.pos) continue;
      if (!isHostileToPlayer(e, player.team, state)) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      const combat = e.data && e.data.combat;
      const attacksPlayer = !!(combat && (combat.targetId === player.id || combat.lockTarget === player.id))
        || (leasedTargetId != null && e.id === leasedTargetId);
      if (activeAttackerTied && !resolvedActive && attacksPlayer && d2 === activeAttackerD2) {
        resolvedActive = e;
      }
      if (nearestThreatTied && !resolvedNearest && d2 === nearestThreatD2) {
        resolvedNearest = e;
      }
      if (resolvedActive && resolvedNearest) break;
    }
    if (resolvedActive) activeAttacker = resolvedActive;
    if (resolvedNearest) nearestThreat = resolvedNearest;
  }

  // U13 sticky composition: hold the prior composed threat briefly so a dense furball does not slew
  // the chase bias between near-equidistant attackers every frame. Active attackers still win over
  // passive nearest, and a meaningfully closer challenger breaks the hold immediately.
  let composedThreat = activeAttacker || nearestThreat;
  let composedThreatD2 = activeAttacker ? activeAttackerD2 : nearestThreatD2;
  let composedIsActive = !!activeAttacker;
  if (sticky && state.entities && typeof state.entities.get === 'function') {
    const dtStick = Math.max(0, finiteOr(view.dt, 0));
    if (sticky.remainS > 0) sticky.remainS = Math.max(0, sticky.remainS - dtStick);
    const held = sticky.id != null ? state.entities.get(sticky.id) : null;
    const heldAlive = !!(held && held.alive !== false && held.hull > 0 && held.pos
      && isComposableThreatType(held) && isHostileToPlayer(held, player.team, state));
    if (heldAlive) {
      const heldD2 = (held.pos.x - player.pos.x) ** 2 + (held.pos.z - player.pos.z) ** 2;
      const challenger = activeAttacker || nearestThreat;
      const challengerD2 = activeAttacker ? activeAttackerD2 : nearestThreatD2;
      const closerBreak = challenger && challenger !== held
        && challengerD2 < heldD2 * COMPOSITION_THREAT_STICK_CLOSER * COMPOSITION_THREAT_STICK_CLOSER;
      const activeUpgrade = activeAttacker && activeAttacker !== held && !sticky.wasActive;
      if (sticky.remainS > 0 && !closerBreak && !activeUpgrade) {
        composedThreat = held;
        composedThreatD2 = heldD2;
        const combat = held.data && held.data.combat;
        composedIsActive = !!(combat && (combat.targetId === player.id || combat.lockTarget === player.id))
          || (leasedTargetId != null && held.id === leasedTargetId);
      } else if (composedThreat) {
        sticky.id = composedThreat.id;
        sticky.remainS = COMPOSITION_THREAT_STICK_S;
        sticky.wasActive = composedIsActive;
      } else {
        sticky.id = null;
        sticky.remainS = 0;
        sticky.wasActive = false;
      }
    } else if (composedThreat) {
      sticky.id = composedThreat.id;
      sticky.remainS = COMPOSITION_THREAT_STICK_S;
      sticky.wasActive = composedIsActive;
    } else {
      sticky.id = null;
      sticky.remainS = 0;
      sticky.wasActive = false;
    }
  }

  if (composedThreat && composedThreatD2 > 1) {
    const d = Math.sqrt(composedThreatD2);
    // A contact actively attacking the player is functional context, not ambient composition.
    // Bias near the pair midpoint; passive hostiles keep the restrained ordinary chase nudge.
    const bias = composedIsActive
      ? d * 0.5
      : Math.min(THREAT_COMPOSE_MAX_BIAS, d * THREAT_COMPOSE_FRACTION);
    fx += ((composedThreat.pos.x - player.pos.x) / d) * bias;
    fz += ((composedThreat.pos.z - player.pos.z) / d) * bias;
    zoomBias = Math.max(zoomBias, THREAT_ZOOM_BASE + clamp01(d / THREAT_COMPOSE_RANGE) * THREAT_ZOOM_RANGE);
  }

  const tetherAnchor = resolveTetherCompositionAnchor(state, player, tetherOut);
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
  // minZoom / safe-rect geometry must use the player's authored base FOV, never the feel-layer FOV
  // punch. Punching the projection is spectacle; letting it reframe combat composition is thrash.
  const compositionFov = Math.max(10, Math.min(140, finiteOr(view.baseFov, finiteOr(view.fov, 50))));
  if (composedIsActive && composedThreat && player.pos) {
    const tanHalf = Math.tan(compositionFov * Math.PI / 360);
    const aspect = Math.max(0.45, finiteOr(view.aspect, 16 / 9));
    const tilt = Math.max(1, Math.min(89, finiteOr(view.tiltDeg, 60))) * Math.PI / 180;
    // Fit against the biased composition focus AND against the player position. The chase follow
    // may safe-rect-clamp focus back toward the ship after this returns; a minZoom computed only
    // at the ideal midpoint would then under-zoom and crop the attacker (U13 dense-scene miss).
    const px = player.pos.x;
    const pz = player.pos.z;
    minZoom = extendCompositionMinZoom(minZoom, player, fx, fz, tanHalf, aspect, tilt);
    minZoom = extendCompositionMinZoom(minZoom, composedThreat, fx, fz, tanHalf, aspect, tilt);
    minZoom = extendCompositionMinZoom(minZoom, player, px, pz, tanHalf, aspect, tilt);
    minZoom = extendCompositionMinZoom(minZoom, composedThreat, px, pz, tanHalf, aspect, tilt);
    minZoom = Math.min(CAMERA_ZOOM_MAX, minZoom);
  }

  result.x = fx;
  result.z = fz;
  result.nearbyEnemies = nearbyEnemies;
  result.hasThreatFocus = !!nearestThreat || !!composedThreat;
  result.hasActiveAttacker = composedIsActive;
  result.hasTetherFocus = !!tetherAnchor;
  result.zoomBias = Math.min(CONTEXT_ZOOM_MAX, zoomBias);
  result.minZoom = minZoom;
  result.composedThreatId = composedThreat ? composedThreat.id : null;
  return result;
}

function resolveTetherCompositionAnchor(state, player, out = null) {
  if (!state || !player || !state.entities || typeof state.entities.get !== 'function') return null;

  let x = 0;
  let z = 0;
  let weightTotal = 0;
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (attachments) {
    for (const attachmentId in attachments) {
      if (!Object.prototype.hasOwnProperty.call(attachments, attachmentId)) continue;
      const attachment = attachments[attachmentId];
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
        const result = out || {};
        result.x = other.pos.x;
        result.z = other.pos.z;
        return result;
      }
    }
    return null;
  }
  const result = out || {};
  result.x = x / weightTotal;
  result.z = z / weightTotal;
  return result;
}

export function createChaseCamera(state) {
  // Far plane is deep (14k) so distant planets + far star layers render; fog still fades mid-distance.
  const cam = new THREE.PerspectiveCamera(state.settings.video.fov || 50, window.innerWidth / window.innerHeight, 1, 14000);
  const c = state.camera;
  c.zoom = resolveInitialChaseZoom(c.zoom);
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
  let _boostZoomFactor = 1;

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
  // U13 sticky composed-threat bag — keeps dense furball bias from thrashing every frame.
  const _compositionSticky = { id: null, remainS: 0, wasActive: false };
  const cameraDirector = createCameraDirector();
  let _directorFrame = cameraDirector.output;
  const _directorView = {
    followX: 0,
    followZ: 0,
    followZoom: DEFAULT_ZOOM,
    fov: cam.fov,
    baseFov: cam.fov,
    aspect: cam.aspect,
    tiltDeg: c.tilt || 60,
    dt: 0,
  };
  // FOLLOW runs every rendered frame. Keep its temporary value records camera-owned so ordinary
  // flight does not manufacture garbage merely to pass the same numbers between pure calculations.
  // Exported helpers still allocate by default; only this live route opts into reusable outputs.
  const _aimLeadScratch = { x: 0, z: 0 };
  const _compositionFocusScratch = { x: 0, z: 0 };
  const _compositionScratch = {
    x: 0,
    z: 0,
    nearbyEnemies: 0,
    hasThreatFocus: false,
    hasActiveAttacker: false,
    hasTetherFocus: false,
    zoomBias: 0,
    minZoom: 0,
  };
  const _tetherAnchorScratch = { x: 0, z: 0 };
  const _safeFocusInputScratch = { x: 0, z: 0 };
  const _safeFocusOptionsScratch = { zoom: DEFAULT_ZOOM, fov: cam.fov, aspect: cam.aspect };
  const _safeFocusScratch = { x: 0, z: 0, clamped: false, safeX: 0, safeZ: 0 };

  function snapToEntity(p) {
    if (!p || !p.pos || !Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z)) return false;
    const frameOrigin = readFrameOrigin(state, _frameOriginScratch);
    globalToFrame(p.pos, frameOrigin, _playerLocalScratch);
    const px = _playerLocalScratch.x;
    const pz = _playerLocalScratch.z;
    c.focus.set(px, 0, pz);
    _dynamicZoom = resolveBaseZoom();
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
      return snapToEntity(readPlayerEntity(state));
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
      const p = readPlayerEntity(state);
      let fx = finiteOr(c.focus.x, 0), fz = finiteOr(c.focus.z, 0);
      let bankForLean = 0;
      let playerSpeed = 0;
      let directorOwnsComposition = false;
      if (p && p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z)) {
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
        // Authored base FOV (settings) drives composition geometry. The feel-layer punch rides on
        // cam.fov for spectacle only — it must not reframe minZoom / safe-rect every recoil tick.
        const baseFov = Math.max(
          10,
          Math.min(140, finiteOr(state.settings && state.settings.video && state.settings.video.fov, 50)),
        );
        // Cheap combat-framing gate for look-ahead attenuation: sticky active hold, live lease, or
        // any hostile currently targeting the player. Avoids a full composition pass before lead.
        const combatLookaheadScale = playerHasActiveAttackerFraming(state, p, _compositionSticky)
          ? ACTIVE_ATTACKER_LOOKAHEAD_SCALE
          : 1;

        if (playerSpeed > 1) {
          const laCap = isCruising(state) ? LOOKAHEAD_MAX_CRUISE : LOOKAHEAD_MAX;
          const la = Math.min(c.lookAhead, laCap, playerSpeed * LOOKAHEAD_SPEED_SCALE) * combatLookaheadScale;
          fx += (vx / playerSpeed) * la; fz += (vz / playerSpeed) * la;
          // Band-3 velocity lead (ADR D7): at >5x combat speed a few WU of camera lead along the
          // velocity vector read as terrifying speed. READ, never re-derived — `readVelocityLanguage`
          // is the one consumer of the record `feel.js` publishes; a reader that derived its own band
          // would become a second producer and drift from what the streaks and the sky are saying.
          // The record forces cameraLeadWU to 0 under motionReduce, so this single read respects it
          // without the camera lane second-guessing the field's reduction.
          // Under active-attacker framing the lead is scaled with ordinary look-ahead so extreme-speed
          // combat still keeps the pair readable instead of leading into empty space.
          const vl = readVelocityLanguage(state);
          const leadWU = vl && vl.drive && Number.isFinite(vl.drive.cameraLeadWU) ? vl.drive.cameraLeadWU : 0;
          if (leadWU > 0) {
            const combatLead = leadWU * combatLookaheadScale;
            fx += (vx / playerSpeed) * combatLead; fz += (vz / playerSpeed) * combatLead;
          }
        }
        const aimLead = resolveAimLead(state.input, p, _aimLeadScratch);
        fx += aimLead.x;
        fz += aimLead.z;
        const baseFx = fx;
        const baseFz = fz;
        _directorView.followX = baseFx;
        _directorView.followZ = baseFz;
        _directorView.followZoom = resolveBaseZoom() * _speedZoomFactor;
        _directorView.fov = baseFov;
        _directorView.baseFov = baseFov;
        _directorView.aspect = cam.aspect;
        _directorView.tiltDeg = c.tilt || 60;
        _directorView.dt = frameDt;
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
          _compositionFocusScratch.x = baseFx;
          _compositionFocusScratch.z = baseFz;
          const composition = resolveChaseComposition(
            state,
            p,
            _compositionFocusScratch,
            _directorView,
            _compositionScratch,
            _tetherAnchorScratch,
            _compositionSticky,
          );
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
          _safeFocusInputScratch.x = fx;
          _safeFocusInputScratch.z = fz;
          _safeFocusOptionsScratch.zoom = _dynamicZoom;
          _safeFocusOptionsScratch.fov = baseFov;
          _safeFocusOptionsScratch.aspect = cam.aspect;
          const desiredSafe = clampFocusToPlayerSafeRect(
            _safeFocusInputScratch,
            _playerLocalProxy,
            _safeFocusOptionsScratch,
            _safeFocusScratch,
          );
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
      fx = finiteOr(fx, finiteOr(c.focus.x, 0));
      fz = finiteOr(fz, finiteOr(c.focus.z, 0));
      if (directorOwnsComposition) {
        c.focus.x = fx;
        c.focus.z = fz;
      } else {
        // damp() propagates NaN. A poisoned focus (death/corrupt pos) must recover, not stick.
        c.focus.x = damp(finiteOr(c.focus.x, fx), fx, followLerp, frameDt);
        c.focus.z = damp(finiteOr(c.focus.z, fz), fz, followLerp, frameDt);
      }
      if (!Number.isFinite(c.focus.x)) c.focus.x = fx;
      if (!Number.isFinite(c.focus.z)) c.focus.z = fz;

      // --- dynamic zoom ---
      // chaseClose forces a tighter accessibility/profile choice; otherwise honor the exact c.zoom
      // selection, whose fresh-run schema default is the R1 144-WU recovery frame.
      const baseZoom = resolveBaseZoom();
      let targetZoom = baseZoom;
      if (p && p.pos) {
        // Speed zoom target is sampled at a low cadence so the camera does not retarget every frame
        // from raw velocity noise. The actual distance still eases every frame through _dynamicZoom.
        _speedZoomSampleT -= frameDt;
        if (_speedZoomSampleT <= 0) {
          // Reduced motion keeps the ordinary 0.88..1.18 speed framing but suppresses the larger
          // physics-earned pullback, matching the existing Massline release-camera contract.
          // PQ-137.03: the ordinary frame is keyed to the hull's GOVERNED combat speed, not to the
          // legacy derived `maxSpeed`. `p.maxSpeed` is ships.js's derived stat (engine topSpeed x
          // SPEED_SCALE x handling x speedMass) and does not move with the drive catalog; for the
          // starter it reads 172 against a governed cruise of 95, so a frame keyed to it would be
          // saturated everywhere the fight actually happens.
          const governedCap = resolveGovernedCombatSpeed(p, state, p.maxSpeed || 120);
          const ordinarySpeedZoom = resolveSpeedZoomFactor(playerSpeed, governedCap, false);
          // The above-cap opening is NOT computed here. `velocityLanguage`'s owner-bound record is
          // the single writer (check-chase-camera-juice cycle 15 pins that), and it is still keyed to
          // `player.maxSpeed` in src/render/feel.js:421 — which is why FEEL_CONTRACT B3's "visible
          // depth reaches 1.5x at 2x cruise" cannot pass yet. Re-keying that one line is filed as a
          // cross-lane request; when it lands, this reads the right number with no change here.
          const exceptionalSpeed = isMotionReduced(state) ? 0 : readOwnedExceptionalSpeed(state);
          _speedZoomFactor = resolveExceptionalSpeedZoomFactor(
            exceptionalSpeed,
            ordinarySpeedZoom,
          );
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
      _boostZoomFactor = stepBoostZoomFactor(
        _boostZoomFactor,
        !!(p && p.flags && p.flags.boosting),
        frameDt,
        isMotionReduced(state),
      );
      if (!directorOwnsComposition) targetZoom *= _boostZoomFactor;
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
      if (directorOwnsComposition) {
        _dynamicZoom = _directorFrame.zoom;
      } else {
        let nextZoom = damp(_dynamicZoom, targetZoom, ZOOM_LERP, frameDt);
        // When minZoom is demanding more distance than the ease would open this frame, step toward
        // the floor at the continuity cap so a distant active attacker re-enters without a cut.
        if (_contextMinZoom > _dynamicZoom + 0.5 && targetZoom >= _contextMinZoom - 1e-6) {
          nextZoom = Math.max(nextZoom, Math.min(_contextMinZoom, _dynamicZoom + ZOOM_OUT_STEP_MAX_WU));
        }
        // Hard continuity cap on any outward jump (damp alone can overshoot 6 wu on a large gap).
        if (nextZoom > _dynamicZoom) {
          nextZoom = Math.min(nextZoom, _dynamicZoom + ZOOM_OUT_STEP_MAX_WU);
        }
        _dynamicZoom = nextZoom;
      }
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
        // Use authored base FOV so feel-layer punches cannot expand/contract the safe rect mid-dodge.
        const safeBaseFov = Math.max(
          10,
          Math.min(140, finiteOr(state.settings && state.settings.video && state.settings.video.fov, 50)),
        );
        _safeFocusOptionsScratch.zoom = _dynamicZoom;
        _safeFocusOptionsScratch.fov = safeBaseFov;
        _safeFocusOptionsScratch.aspect = cam.aspect;
        const safeFocus = clampFocusToPlayerSafeRect(
          c.focus,
          _playerLocalProxy,
          _safeFocusOptionsScratch,
          _safeFocusScratch,
        );
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
