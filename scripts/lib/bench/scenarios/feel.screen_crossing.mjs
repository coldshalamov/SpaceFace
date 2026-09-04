// B3 — the fight stays on screen. Crossing time at cruise and the camera-open clause
// above the cap, measured on the real path (bootRealPath + flightV3 + rapier-dynamic).
import {
  CHASE_ZOOM_DEFAULT,
  resolveSpeedZoomFactor,
  resolveExceptionalSpeedZoomFactor,
} from '../../../../src/render/camera.js';
import { resolveExceptionalSpeed } from '../../../../src/render/velocityLanguage.js';
import { queuePhysicsImpulse } from '../../../../src/core/physicsAuthority.js';
import { bootRealPath, writeRealPathInput } from '../realPath.mjs';

const SETTLE_TICKS = 18;
const CRUISE_HOLD_TICKS = 900;
const HULL_ID = 'ship_kestrel';
const HULL_NAME = 'Hitch (starter)';
/** The camera's own default aspect (src/render/camera.js clampFocusToPlayerSafeRect). */
const FRAME_ASPECT = 16 / 9;
/** Floating-point slack when asking "did the depth ever go backwards as speed rose?". */
const MONOTONIC_EPSILON_WU = 1e-9;

/**
 * Visible chase-camera ground depth in WU at a given player speed, from the live camera code.
 * CAMERA_ZOOM_MAX bounds only the manual setZoom; the live speed-zoom target is not clamped by it.
 */
export function screenDepthWuAtSpeed(speed, { fovDeg, maxSpeedRef, physicsEarned = false } = {}) {
  const ordinary = resolveSpeedZoomFactor(speed, maxSpeedRef, false);
  const factor = physicsEarned
    ? resolveExceptionalSpeedZoomFactor(resolveExceptionalSpeed(speed, maxSpeedRef, true), ordinary)
    : ordinary;
  const zoom = CHASE_ZOOM_DEFAULT * factor;
  return 2 * Math.tan((fovDeg * Math.PI / 180) * 0.5) * zoom * 0.72;
}

export const scenario = {
  id: 'feel.screen_crossing',
  label: 'B3 The fight stays on screen — crossing time at cruise and the camera-open clause above the cap (real path)',
  async run(seed) {
    const eventTrace = [];
    const host = await bootPlayer(seed, HULL_ID);
    try {
      const player = host.player;
      settle(host);
      pushTrace(eventTrace, host, 'settle:end');

      const samples = [];
      host.step(CRUISE_HOLD_TICKS, {
        before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); },
        after: ({ state, host: h }) => {
          samples.push({ simTime: state.simTime, speed: planarSpeed(h.player) });
        },
      });
      const cruiseSpeed = samples.length ? samples[samples.length - 1].speed : 0;
      const { fovDeg, maxSpeedRef } = chaseCameraRefs(host.state, player);
      const screenDepthAtCruiseWu = screenDepthWuAtSpeed(cruiseSpeed, {
        fovDeg,
        maxSpeedRef,
        physicsEarned: false,
      });
      const crossingAtCruiseS = cruiseSpeed > 0 ? screenDepthAtCruiseWu / cruiseSpeed : null;
      pushTrace(eventTrace, host, 'cruise:sampled', { cruiseSpeed, screenDepthAtCruiseWu, crossingAtCruiseS });

      // ---- the camera-band clause (FEEL_CONTRACT B3, rewritten 2026-09-03) ----------------------
      // "Above the cap the camera opens with speed: visible depth grows monotonically, reaches
      //  >= 1.5x the at-cruise depth at 2x cruise and >= 2.5x at 3x cruise, and the starter hull
      //  never falls below 4 % of frame width."
      // Both exit speeds are REACHED by a physics impulse through the authority, never written.
      host.step(1, {
        before: ({ state, host: h }) => {
          writeRealPathInput(state, { moveZ: 1 });
          queueCruiseMultipleImpulse(h.player, cruiseSpeed, 2);
        },
      });
      const exitSpeed2x = planarSpeed(player);
      const depthAt2xWu = screenDepthWuAtSpeed(exitSpeed2x, { fovDeg, maxSpeedRef, physicsEarned: true });
      pushTrace(eventTrace, host, 'exit2x:sampled', { exitSpeed: exitSpeed2x, depthWu: depthAt2xWu });

      host.step(1, {
        before: ({ state, host: h }) => {
          writeRealPathInput(state, { moveZ: 1 });
          queueCruiseMultipleImpulse(h.player, cruiseSpeed, 3);
        },
      });
      const exitSpeed3x = planarSpeed(player);
      const depthAt3xWu = screenDepthWuAtSpeed(exitSpeed3x, { fovDeg, maxSpeedRef, physicsEarned: true });
      pushTrace(eventTrace, host, 'exit3x:sampled', { exitSpeed: exitSpeed3x, depthWu: depthAt3xWu });

      // The opening curve between the cap and the fastest speed reached, straight off the live
      // camera functions: monotonic growth, and the hull's smallest share of the frame.
      const hullWidthWu = hullWidthOf(player);
      const sweep = sampleOpeningCurve({
        fromSpeed: cruiseSpeed,
        toSpeed: exitSpeed3x,
        fovDeg,
        maxSpeedRef,
        hullWidthWu,
      });

      const growth2x = screenDepthAtCruiseWu > 0 ? depthAt2xWu / screenDepthAtCruiseWu : null;
      const growth3x = screenDepthAtCruiseWu > 0 ? depthAt3xWu / screenDepthAtCruiseWu : null;

      const bars = [
        {
          bar: 'B3',
          label: `seconds to cross the visible depth at cruise, ${HULL_NAME}`,
          value: crossingAtCruiseS,
          unit: 's',
          met: Number.isFinite(crossingAtCruiseS) && crossingAtCruiseS >= 1.2,
          note: `screen depth ${screenDepthAtCruiseWu} WU read from the live chase camera at cruise ${cruiseSpeed} WU/s; camera speed reference maxSpeed=${maxSpeedRef}`,
        },
        {
          bar: 'B3',
          label: `visible depth at 2x cruise, as a multiple of the at-cruise depth, ${HULL_NAME}`,
          value: growth2x,
          unit: 'x at-cruise depth',
          met: Number.isFinite(growth2x) && growth2x >= 1.5,
          note: `reached ${exitSpeed2x} WU/s by a physics impulse (target 2x cruise = ${2 * cruiseSpeed}); depth ${depthAt2xWu} WU vs ${screenDepthAtCruiseWu} WU at cruise`,
        },
        {
          bar: 'B3',
          label: `visible depth at 3x cruise, as a multiple of the at-cruise depth, ${HULL_NAME}`,
          value: growth3x,
          unit: 'x at-cruise depth',
          met: Number.isFinite(growth3x) && growth3x >= 2.5,
          note: `reached ${exitSpeed3x} WU/s by a physics impulse (target 3x cruise = ${3 * cruiseSpeed}); depth ${depthAt3xWu} WU`,
        },
        {
          bar: 'B3',
          label: `visible depth grows monotonically from cruise to 3x cruise, ${HULL_NAME}`,
          value: sweep.monotonic ? 1 : 0,
          unit: 'bool',
          met: sweep.monotonic === true,
          note: `${sweep.samples} samples of the live camera depth between ${cruiseSpeed} and ${exitSpeed3x} WU/s; largest backward step ${sweep.worstBackstepWu} WU`,
        },
        {
          bar: 'B3',
          label: `smallest share of frame width the starter hull ever falls to, ${HULL_NAME}`,
          value: sweep.minHullFramePct,
          unit: '% of frame width',
          met: Number.isFinite(sweep.minHullFramePct) && sweep.minHullFramePct >= 4,
          note: `hull ${hullWidthWu} WU (2 x collisionRadius) against frame width = visible depth x ${FRAME_ASPECT} (the camera's own default aspect); worst case at ${sweep.minHullFrameSpeed} WU/s`,
        },
      ];

      return {
        eventTrace,
        metrics: {
          seed,
          cruiseSpeed,
          maxSpeedRef,
          fovDeg,
          hullWidthWu,
          frameAspect: FRAME_ASPECT,
          screenDepthAtCruiseWu,
          crossingAtCruiseS,
          exitSpeed2x,
          depthAt2xWu,
          depthGrowthAt2x: growth2x,
          exitSpeed3x,
          depthAt3xWu,
          depthGrowthAt3x: growth3x,
          openingMonotonic: sweep.monotonic,
          openingWorstBackstepWu: sweep.worstBackstepWu,
          minHullFramePct: sweep.minHullFramePct,
          minHullFrameSpeed: sweep.minHullFrameSpeed,
          realPathProof: host.proof(),
          bars,
        },
      };
    } finally {
      host.dispose();
    }
  },
};

export function bootPlayer(seed, hullId = HULL_ID) {
  return bootRealPath({
    seed,
    systems: ['actions', 'flightV3', 'physics'],
    hulls: [{ hullId, pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free' }],
    profileId: 'production',
  });
}

export function settle(host) {
  host.step(SETTLE_TICKS, {
    before: ({ state }) => { writeRealPathInput(state, {}); },
  });
}

export function planarSpeed(entity) {
  const vel = entity && entity.vel;
  return Math.hypot((vel && vel.x) || 0, (vel && vel.z) || 0);
}

export function chaseCameraRefs(state, player) {
  const fov = state && state.settings && state.settings.video && Number.isFinite(state.settings.video.fov)
    ? state.settings.video.fov
    : 50;
  const maxSpeedRef = player && Number.isFinite(player.maxSpeed) && player.maxSpeed > 0
    ? player.maxSpeed
    : 120;
  return { fovDeg: fov, maxSpeedRef };
}

/**
 * Physics-earned momentum along the ship's own velocity, delivered through the physics authority
 * (never a velocity write), sized to land the hull at `multiple` x its governed cruise.
 */
export function queueCruiseMultipleImpulse(player, cruiseSpeed, multiple) {
  const v = planarSpeed(player);
  const targetV = multiple * cruiseSpeed;
  const m = Number.isFinite(player.mass) && player.mass > 0 ? player.mass : 1;
  if (!(v > 0)) return;
  const k = (targetV - v) * m / v;
  queuePhysicsImpulse(player, { x: player.vel.x * k, y: 0, z: player.vel.z * k });
}

/** Back-compat name used by feel.earned_speed_kept.mjs (B1 exits the cap at 2x cruise). */
export function queueDoubleCruiseImpulse(player, cruiseSpeed) {
  return queueCruiseMultipleImpulse(player, cruiseSpeed, 2);
}

/**
 * The hull's on-screen width in WU, from the live entity — never a hardcoded ship size. The
 * spawned entity carries `radius` (the same 14 WU the rapier capsule body uses); the drawn hull is
 * two of those across.
 */
export function hullWidthOf(entity) {
  if (!entity) return 0;
  const candidates = [
    entity.radius,
    entity.collisionRadius,
    entity.physicsBody && entity.physicsBody.radius,
    entity.data && entity.data.derived && entity.data.derived.radius,
  ];
  for (const c of candidates) if (Number.isFinite(c) && c > 0) return c * 2;
  return 0;
}

/**
 * Samples the LIVE camera's visible depth across the earned-speed band and reports the two
 * properties FEEL_CONTRACT B3 asks for: that the opening is monotonic, and the smallest share of
 * frame width the hull ever falls to. Frame width uses the camera's own default aspect
 * (clampFocusToPlayerSafeRect defaults to 16/9) because a headless bench has no window.
 */
export function sampleOpeningCurve({ fromSpeed, toSpeed, fovDeg, maxSpeedRef, hullWidthWu, samples = 61 }) {
  if (!(toSpeed > fromSpeed) || !(fromSpeed > 0)) {
    return { monotonic: false, worstBackstepWu: null, minHullFramePct: null, minHullFrameSpeed: null, samples: 0 };
  }
  let prevDepth = null;
  let worstBackstep = 0;
  let minPct = Infinity;
  let minPctSpeed = null;
  for (let i = 0; i < samples; i++) {
    const speed = fromSpeed + ((toSpeed - fromSpeed) * i) / (samples - 1);
    const depth = screenDepthWuAtSpeed(speed, { fovDeg, maxSpeedRef, physicsEarned: true });
    if (prevDepth != null && depth < prevDepth) {
      const back = prevDepth - depth;
      if (back > worstBackstep) worstBackstep = back;
    }
    prevDepth = depth;
    const frameWidth = depth * FRAME_ASPECT;
    const pct = frameWidth > 0 && hullWidthWu > 0 ? (hullWidthWu / frameWidth) * 100 : null;
    if (Number.isFinite(pct) && pct < minPct) {
      minPct = pct;
      minPctSpeed = speed;
    }
  }
  return {
    monotonic: worstBackstep <= MONOTONIC_EPSILON_WU,
    worstBackstepWu: worstBackstep,
    minHullFramePct: Number.isFinite(minPct) ? minPct : null,
    minHullFrameSpeed: minPctSpeed,
    samples,
  };
}

function pushTrace(eventTrace, host, type, extra = {}) {
  const state = host.state;
  eventTrace.push({
    tick: state.tick | 0,
    simTime: state.simTime,
    type,
    ...extra,
  });
}
