import { globalToFrame } from '../core/coordinates.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { readFrameOrigin } from './frameCoordinates.js';

export const CAMERA_DIRECTOR_MIN_ZOOM = 58;
// 58-180 is the authored/aesthetic pair band, not a clipping mandate. Exact Focus acquisition is
// allowed to use the chase camera's existing legal 330 ceiling when conservative bounds need it.
export const CAMERA_DIRECTOR_MAX_ZOOM = 180;
export const CAMERA_DIRECTOR_ENGINE_MAX_ZOOM = 330;
// Standard combat-pair margin: content stays inside NDC +/-0.80 → 10% context each side.
export const CAMERA_DIRECTOR_SAFE_NDC = 0.8;
// Flyby Focus primary pair: 15–20% context margin each side (NDC 0.60–0.70). 0.65 ≈ 17.5%.
export const CAMERA_DIRECTOR_FOCUS_SAFE_NDC = 0.65;
export const CAMERA_DIRECTOR_EASE_S = 0.35;

// Nearby active hostiles expand Focus/combat-tether zoom so attackers are not cropped off-frame.
export const CAMERA_DIRECTOR_THREAT_CONTEXT_RANGE = 280;

// Pair framing is functional geometry, so motion-reduction preferences do not alter its pose.
// Decorative shake remains outside the director in the chase-camera presentation layer.
// M2: focus outputs are frame-local; entity.pos is read as galactic-global and projected here.
//
// CAMERA-FOCUS-SEPARATION: ordinary mining/asteroid/non-hostile tether never enters combat pair
// modes (TETHER_PAIR / FOCUS_PAIR). Only hostile ship/drone massline and Flyby Focus do. Ordinary
// tether stays FOLLOW so chase composition can apply modest bias + threat-aware zoom-out.

export const CameraDirectorMode = Object.freeze({
  FOLLOW: 'FOLLOW',
  FOCUS_PAIR: 'FOCUS_PAIR',
  TETHER_PAIR: 'TETHER_PAIR',
  RECOVER: 'RECOVER',
});

const DEFAULT_FOV = 50;
const DEFAULT_ASPECT = 16 / 9;
const DEFAULT_TILT_DEG = 60;
const DEFAULT_ZOOM = 72;
const DEFAULT_RADIUS = 4;
const FOLLOW_MIN_ZOOM = 45;
const FIT_SEARCH_STEPS = 24;

const _frameOriginScratch = { x: 0, z: 0 };
const _entityLocalA = { x: 0, z: 0 };
const _entityLocalB = { x: 0, z: 0 };
const _entityLocalThreat = { x: 0, z: 0 };

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value) {
  const t = clamp(finiteOr(value, 0), 0, 1);
  return t * t * (3 - 2 * t);
}

function entityFor(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const entity = state.entities.get(id);
  if (!entity || entity.alive === false || !entity.pos) return null;
  if (!Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return null;
  return entity;
}

function entityRadius(entity) {
  return Math.max(0, finiteOr(entity && entity.radius, DEFAULT_RADIUS));
}

/** Hostile ship/drone massline may request combat pair framing; asteroids, civilians, and clean-law
 * patrols may not. Keep this presentation classification aligned with the live team model without
 * importing a sim system into render code. */
export function isCombatPairTetherTarget(state, player, target) {
  if (!target || target.alive === false) return false;
  if (target.type !== 'ship' && target.type !== 'drone') return false;
  const pTeam = player && player.team;
  if (pTeam == null) return false;
  // Share the same fresh hostility oracle as Flyby Focus acquisition and the contact strip. A raw
  // team mismatch is not authorization: traders, parleying raiders, and clean patrols stay neutral.
  return isHostileToPlayer(target, pTeam, state);
}

function isActiveHostileThreat(state, player, entity, primaryTarget) {
  if (!entity || entity === player || entity === primaryTarget) return false;
  if (entity.alive === false || !entity.pos) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  if (entity.hull != null && entity.hull <= 0) return false;
  const pTeam = player && player.team;
  return pTeam != null && isHostileToPlayer(entity, pTeam, state);
}

function requiredZoomForLocal(
  localX, localZ, radius, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt,
  safeNdc = CAMERA_DIRECTOR_SAFE_NDC,
) {
  const r = Math.max(0, finiteOr(radius, DEFAULT_RADIUS));
  const safe = Math.max(0.2, finiteOr(safeNdc, CAMERA_DIRECTOR_SAFE_NDC));
  const dx = Math.abs(localX - focusX) + r;
  const dz = Math.abs(localZ - focusZ);
  // Treat entity.radius as a sphere, not a ground-plane disc. A sphere can consume one full radius
  // along both the camera-up and camera-depth axes regardless of chase tilt.
  const depthReserve = cosTilt * dz + r;
  const horizontal = dx / (safe * tanHalfFov * aspect) + depthReserve;
  const vertical = (sinTilt * dz + r) / (safe * tanHalfFov) + depthReserve;
  return Math.max(horizontal, vertical, CAMERA_DIRECTOR_MIN_ZOOM);
}

function requiredZoomForEntity(
  entity, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, localOut,
  safeNdc = CAMERA_DIRECTOR_SAFE_NDC,
) {
  const local = globalToFrame(entity.pos, frameOrigin, localOut || _entityLocalA);
  return requiredZoomForLocal(
    local.x, local.z, entityRadius(entity),
    focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, safeNdc,
  );
}

function requiredThreatContextZoom(
  state, player, primaryTarget, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin,
) {
  if (!state || !player || !player.pos || !state.entities || typeof state.entities.values !== 'function') {
    return CAMERA_DIRECTOR_MIN_ZOOM;
  }
  const range = CAMERA_DIRECTOR_THREAT_CONTEXT_RANGE;
  const range2 = range * range;
  let required = CAMERA_DIRECTOR_MIN_ZOOM;
  for (const ent of state.entities.values()) {
    if (!isActiveHostileThreat(state, player, ent, primaryTarget)) continue;
    const dx = ent.pos.x - player.pos.x;
    const dz = ent.pos.z - player.pos.z;
    if (dx * dx + dz * dz > range2) continue;
    required = Math.max(
      required,
      requiredZoomForEntity(
        ent, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin,
        _entityLocalThreat, CAMERA_DIRECTOR_SAFE_NDC,
      ),
    );
  }
  return required;
}

export function createCameraDirector() {
  const output = {
    mode: CameraDirectorMode.FOLLOW,
    focusX: 0,
    focusZ: 0,
    zoom: 72,
    targetId: null,
    overflow: false,
    preferredBandExceeded: false,
    requiredZoom: 72,
  };
  let initialized = false;
  let transitionStartX = 0;
  let transitionStartZ = 0;
  let transitionStartZoom = DEFAULT_ZOOM;
  let transitionElapsed = CAMERA_DIRECTOR_EASE_S;

  function syncFollow(focusX = 0, focusZ = 0, zoom = DEFAULT_ZOOM) {
    output.mode = CameraDirectorMode.FOLLOW;
    output.focusX = finiteOr(focusX, 0);
    output.focusZ = finiteOr(focusZ, 0);
    output.zoom = finiteOr(zoom, DEFAULT_ZOOM);
    output.targetId = null;
    output.overflow = false;
    output.preferredBandExceeded = false;
    output.requiredZoom = output.zoom;
    transitionStartX = output.focusX;
    transitionStartZ = output.focusZ;
    transitionStartZoom = output.zoom;
    transitionElapsed = CAMERA_DIRECTOR_EASE_S;
    initialized = true;
    return output;
  }

  function reset(focusX = 0, focusZ = 0, zoom = DEFAULT_ZOOM) {
    return syncFollow(focusX, focusZ, zoom);
  }

  function beginTransition() {
    transitionStartX = output.focusX;
    transitionStartZ = output.focusZ;
    transitionStartZoom = output.zoom;
    transitionElapsed = 0;
  }

  function requiredPairZoom(first, second, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, safeNdc) {
    return Math.max(
      requiredZoomForEntity(first, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, _entityLocalA, safeNdc),
      requiredZoomForEntity(second, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, _entityLocalB, safeNdc),
    );
  }

  function requiredCombatZoom(
    state, player, target, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, pairSafeNdc,
  ) {
    const pairRequired = requiredPairZoom(
      player, target, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, pairSafeNdc,
    );
    const threatRequired = requiredThreatContextZoom(
      state, player, target, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin,
    );
    return Math.max(pairRequired, threatRequired);
  }

  return {
    output,
    reset,
    syncFollow,
    reprojectFrame(dx, dz) {
      const ox = Number.isFinite(dx) ? dx : 0;
      const oz = Number.isFinite(dz) ? dz : 0;
      if (ox === 0 && oz === 0) return;
      output.focusX += ox;
      output.focusZ += oz;
      transitionStartX += ox;
      transitionStartZ += oz;
    },
    step(dt, state, player, view = {}) {
      const frameOrigin = readFrameOrigin(state, _frameOriginScratch);
      // view.followX/Z are already frame-local from the chase camera. Fallback converts player global.
      let followX = finiteOr(view.followX, NaN);
      let followZ = finiteOr(view.followZ, NaN);
      if (!Number.isFinite(followX) || !Number.isFinite(followZ)) {
        if (player && player.pos) {
          globalToFrame(player.pos, frameOrigin, _entityLocalA);
          followX = _entityLocalA.x;
          followZ = _entityLocalA.z;
        } else {
          followX = 0;
          followZ = 0;
        }
      }
      const followZoom = finiteOr(view.followZoom, DEFAULT_ZOOM);
      const frameDt = clamp(finiteOr(dt, 0), 0, 0.1);
      if (!initialized) reset(followX, followZ, followZoom);

      const tether = state && state.player && state.player.tether;
      const focus = state && state.player && state.player.flybyFocus;
      let requestedMode = CameraDirectorMode.FOLLOW;
      let targetId = null;
      let target = null;
      let pairSafeNdc = CAMERA_DIRECTOR_FOCUS_SAFE_NDC;

      // Combat Focus is authoritative when active. Ordinary (asteroid/non-hostile) tether never
      // steals combat pair ownership — leave FOLLOW so chase composition stays modest + threat-aware.
      // Hostile ship/drone massline may own TETHER_PAIR after Focus latches onto the same contact.
      if (focus && focus.active) {
        targetId = focus.targetId;
        target = entityFor(state, targetId);
        if (target && isCombatPairTetherTarget(state, player, target)) {
          requestedMode = CameraDirectorMode.FOCUS_PAIR;
          pairSafeNdc = CAMERA_DIRECTOR_FOCUS_SAFE_NDC;
        } else {
          // Presentation fails closed if a stale/corrupt Focus lease points at mining clutter,
          // civilians, allies, or clean lawful traffic. The sim clears the lease on its next tick;
          // the render path must not expose even one pair-camera takeover frame in the meantime.
          targetId = null;
          target = null;
        }
      }
      if (requestedMode === CameraDirectorMode.FOLLOW && tether && tether.active) {
        targetId = tether.targetId;
        target = entityFor(state, targetId);
        if (target && isCombatPairTetherTarget(state, player, target)) {
          requestedMode = CameraDirectorMode.TETHER_PAIR;
          pairSafeNdc = CAMERA_DIRECTOR_FOCUS_SAFE_NDC;
        } else {
          // Non-combat tether: drop pair intent; keep FOLLOW.
          targetId = null;
          target = null;
        }
      } else if (
        requestedMode === CameraDirectorMode.FOCUS_PAIR
        && tether && tether.active
        && tether.targetId === focus.targetId
        && isCombatPairTetherTarget(state, player, target)
      ) {
        // Same-target Focus→tether handoff: combat massline takes pair ownership without a jump.
        requestedMode = CameraDirectorMode.TETHER_PAIR;
        pairSafeNdc = CAMERA_DIRECTOR_FOCUS_SAFE_NDC;
      }

      const playerValid = !!(player && player.pos && Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z));
      if (requestedMode !== CameraDirectorMode.FOLLOW && playerValid) {
        const wasSamePair = (output.mode === CameraDirectorMode.FOCUS_PAIR || output.mode === CameraDirectorMode.TETHER_PAIR)
          && output.targetId === targetId;
        if (!wasSamePair) beginTransition();

        const fov = clamp(finiteOr(view.fov, DEFAULT_FOV), 10, 140);
        const aspect = Math.max(0.25, finiteOr(view.aspect, DEFAULT_ASPECT));
        const tilt = clamp(finiteOr(view.tiltDeg, DEFAULT_TILT_DEG), 1, 89) * Math.PI / 180;
        const tanHalfFov = Math.tan(fov * Math.PI / 360);
        const sinTilt = Math.sin(tilt);
        const cosTilt = Math.cos(tilt);
        const playerRadius = entityRadius(player);
        const targetRadius = entityRadius(target);
        globalToFrame(player.pos, frameOrigin, _entityLocalA);
        globalToFrame(target.pos, frameOrigin, _entityLocalB);
        const pLx = _entityLocalA.x;
        const pLz = _entityLocalA.z;
        const tLx = _entityLocalB.x;
        const tLz = _entityLocalB.z;
        // Primary pair midpoint stays on player + authoritative Focus/tether target (not the crowd).
        const desiredX = (
          Math.min(pLx - playerRadius, tLx - targetRadius)
          + Math.max(pLx + playerRadius, tLx + targetRadius)
        ) * 0.5;
        const desiredZ = (
          Math.min(pLz - playerRadius, tLz - targetRadius)
          + Math.max(pLz + playerRadius, tLz + targetRadius)
        ) * 0.5;
        const desiredRequired = requiredCombatZoom(
          state, player, target, desiredX, desiredZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, pairSafeNdc,
        );
        const impossible = desiredRequired > CAMERA_DIRECTOR_ENGINE_MAX_ZOOM + 1e-9;
        const fitLimit = desiredRequired <= CAMERA_DIRECTOR_MAX_ZOOM + 1e-9
          ? CAMERA_DIRECTOR_MAX_ZOOM
          : CAMERA_DIRECTOR_ENGINE_MAX_ZOOM;

        let candidateX;
        let candidateZ;
        let candidateZoom;
        if (transitionElapsed < CAMERA_DIRECTOR_EASE_S) {
          transitionElapsed = Math.min(CAMERA_DIRECTOR_EASE_S, transitionElapsed + frameDt);
          const ease = smoothstep01(transitionElapsed / CAMERA_DIRECTOR_EASE_S);
          candidateX = transitionStartX + (desiredX - transitionStartX) * ease;
          candidateZ = transitionStartZ + (desiredZ - transitionStartZ) * ease;
          const desiredZoom = clamp(desiredRequired, CAMERA_DIRECTOR_MIN_ZOOM, CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);
          candidateZoom = transitionStartZoom + (desiredZoom - transitionStartZoom) * ease;
        } else {
          const followAlpha = 1 - Math.exp(-frameDt / CAMERA_DIRECTOR_EASE_S);
          candidateX = output.focusX + (desiredX - output.focusX) * followAlpha;
          candidateZ = output.focusZ + (desiredZ - output.focusZ) * followAlpha;
          candidateZoom = output.zoom + (clamp(desiredRequired, CAMERA_DIRECTOR_MIN_ZOOM, CAMERA_DIRECTOR_ENGINE_MAX_ZOOM) - output.zoom) * followAlpha;
        }

        let required = requiredCombatZoom(
          state, player, target, candidateX, candidateZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, pairSafeNdc,
        );
        if (!impossible && required > fitLimit) {
          const startX = candidateX;
          const startZ = candidateZ;
          let lo = 0;
          let hi = 1;
          for (let i = 0; i < FIT_SEARCH_STEPS; i++) {
            const mid = (lo + hi) * 0.5;
            const probeX = startX + (desiredX - startX) * mid;
            const probeZ = startZ + (desiredZ - startZ) * mid;
            const probeRequired = requiredCombatZoom(
              state, player, target, probeX, probeZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, pairSafeNdc,
            );
            if (probeRequired <= fitLimit) hi = mid;
            else lo = mid;
          }
          candidateX = startX + (desiredX - startX) * hi;
          candidateZ = startZ + (desiredZ - startZ) * hi;
          required = requiredCombatZoom(
            state, player, target, candidateX, candidateZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, pairSafeNdc,
          );
        }

        output.mode = requestedMode;
        output.focusX = candidateX;
        output.focusZ = candidateZ;
        output.zoom = clamp(Math.max(candidateZoom, required), CAMERA_DIRECTOR_MIN_ZOOM, CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);
        output.targetId = targetId;
        output.overflow = impossible;
        output.preferredBandExceeded = output.zoom > CAMERA_DIRECTOR_MAX_ZOOM + 1e-9;
        output.requiredZoom = required;
        return output;
      }

      const leavingPair = output.mode === CameraDirectorMode.FOCUS_PAIR || output.mode === CameraDirectorMode.TETHER_PAIR;
      if (leavingPair) beginTransition();
      if (leavingPair || output.mode === CameraDirectorMode.RECOVER) {
        transitionElapsed = Math.min(CAMERA_DIRECTOR_EASE_S, transitionElapsed + frameDt);
        const ease = smoothstep01(transitionElapsed / CAMERA_DIRECTOR_EASE_S);
        output.mode = transitionElapsed >= CAMERA_DIRECTOR_EASE_S
          ? CameraDirectorMode.FOLLOW
          : CameraDirectorMode.RECOVER;
        output.focusX = transitionStartX + (followX - transitionStartX) * ease;
        output.focusZ = transitionStartZ + (followZ - transitionStartZ) * ease;
        output.zoom = clamp(
          transitionStartZoom + (followZoom - transitionStartZoom) * ease,
          FOLLOW_MIN_ZOOM,
          CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
        );
        output.targetId = null;
        output.overflow = false;
        output.preferredBandExceeded = output.mode === CameraDirectorMode.RECOVER
          && output.zoom > CAMERA_DIRECTOR_MAX_ZOOM + 1e-9;
        output.requiredZoom = output.zoom;
        return output;
      }

      output.mode = CameraDirectorMode.FOLLOW;
      output.focusX = followX;
      output.focusZ = followZ;
      output.zoom = clamp(followZoom, FOLLOW_MIN_ZOOM, CAMERA_DIRECTOR_ENGINE_MAX_ZOOM);
      output.targetId = null;
      output.overflow = false;
      output.preferredBandExceeded = false;
      output.requiredZoom = output.zoom;
      return output;
    },
  };
}
