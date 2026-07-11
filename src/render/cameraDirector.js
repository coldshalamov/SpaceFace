import { globalToFrame } from '../core/coordinates.js';
import { readFrameOrigin } from './frameCoordinates.js';

export const CAMERA_DIRECTOR_MIN_ZOOM = 58;
// 58-180 is the authored/aesthetic pair band, not a clipping mandate. Exact Focus acquisition is
// allowed to use the chase camera's existing legal 330 ceiling when conservative bounds need it.
export const CAMERA_DIRECTOR_MAX_ZOOM = 180;
export const CAMERA_DIRECTOR_ENGINE_MAX_ZOOM = 330;
export const CAMERA_DIRECTOR_SAFE_NDC = 0.8;
export const CAMERA_DIRECTOR_EASE_S = 0.35;

// Pair framing is functional geometry, so motion-reduction preferences do not alter its pose.
// Decorative shake remains outside the director in the chase-camera presentation layer.
// M2: focus outputs are frame-local; entity.pos is read as galactic-global and projected here.

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

function requiredZoomForLocal(localX, localZ, radius, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt) {
  const r = Math.max(0, finiteOr(radius, DEFAULT_RADIUS));
  const dx = Math.abs(localX - focusX) + r;
  const dz = Math.abs(localZ - focusZ);
  // Treat entity.radius as a sphere, not a ground-plane disc. A sphere can consume one full radius
  // along both the camera-up and camera-depth axes regardless of chase tilt.
  const depthReserve = cosTilt * dz + r;
  const horizontal = dx / (CAMERA_DIRECTOR_SAFE_NDC * tanHalfFov * aspect) + depthReserve;
  const vertical = (sinTilt * dz + r) / (CAMERA_DIRECTOR_SAFE_NDC * tanHalfFov) + depthReserve;
  return Math.max(horizontal, vertical, CAMERA_DIRECTOR_MIN_ZOOM);
}

function requiredZoomForEntity(entity, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, localOut) {
  const local = globalToFrame(entity.pos, frameOrigin, localOut || _entityLocalA);
  return requiredZoomForLocal(
    local.x, local.z, entityRadius(entity),
    focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt,
  );
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

  function requiredPairZoom(first, second, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin) {
    return Math.max(
      requiredZoomForEntity(first, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, _entityLocalA),
      requiredZoomForEntity(second, focusX, focusZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin, _entityLocalB),
    );
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
      if (tether && tether.active) {
        targetId = tether.targetId;
        target = entityFor(state, targetId);
        if (target) requestedMode = CameraDirectorMode.TETHER_PAIR;
      } else if (focus && focus.active) {
        targetId = focus.targetId;
        target = entityFor(state, targetId);
        if (target) requestedMode = CameraDirectorMode.FOCUS_PAIR;
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
        const desiredX = (
          Math.min(pLx - playerRadius, tLx - targetRadius)
          + Math.max(pLx + playerRadius, tLx + targetRadius)
        ) * 0.5;
        const desiredZ = (
          Math.min(pLz - playerRadius, tLz - targetRadius)
          + Math.max(pLz + playerRadius, tLz + targetRadius)
        ) * 0.5;
        const desiredRequired = requiredPairZoom(
          player, target, desiredX, desiredZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin,
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

        let required = requiredPairZoom(
          player, target, candidateX, candidateZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin,
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
            const probeRequired = requiredPairZoom(
              player, target, probeX, probeZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin,
            );
            if (probeRequired <= fitLimit) hi = mid;
            else lo = mid;
          }
          candidateX = startX + (desiredX - startX) * hi;
          candidateZ = startZ + (desiredZ - startZ) * hi;
          required = requiredPairZoom(
            player, target, candidateX, candidateZ, tanHalfFov, aspect, sinTilt, cosTilt, frameOrigin,
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
