// Plan 49 smuggling is a physical visibility problem, not a menu roll. This module is pure policy:
// encounterScripts owns the patrol phase, Flight owns controls/velocity, anomalyRuntime owns storm
// markers, and the renderer only consumes the same immutable cone dimensions.

export const CUSTOMS_SCAN_CONE = Object.freeze({
  rangeWU: 720,
  visualReachWU: 120,
  halfAngleRad: Math.PI * 0.18,
  acquireThreshold: 1,
  hotAcquirePerS: 0.52,
  coldAcquirePerS: 0.075,
  outsideDecayPerS: 0.24,
  stormSignalMultiplier: 0.34,
  decoyCaptureRadiusWU: 92,
});

const INPUT_EPSILON = 0.08;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function playerEnginesDark(state) {
  const input = state && state.input || {};
  const actions = input.actions || {};
  const hotAxis = Math.max(
    Math.abs(finite(input.thrust, finite(input.moveZ))),
    Math.abs(finite(input.strafe, finite(input.moveX))),
    Math.abs(finite(input.yaw)),
  );
  return hotAxis <= INPUT_EPSILON
    && input.boost !== true
    && input.afterburner !== true
    && input.brake !== true
    && actions.boost !== true
    && actions.afterburner !== true
    && actions.brake !== true;
}

export function ionStormSignalMultiplier(state, point) {
  if (!state || !point) return 1;
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  for (const marker of list) {
    if (!marker || marker.alive === false || marker.data?.kind !== 'ionStormPocket' || !marker.pos) continue;
    const radius = Math.max(0, finite(marker.radius));
    const dx = finite(point.x) - finite(marker.pos.x);
    const dz = finite(point.z) - finite(marker.pos.z);
    if (radius > 0 && dx * dx + dz * dz <= radius * radius) {
      return CUSTOMS_SCAN_CONE.stormSignalMultiplier;
    }
  }
  return 1;
}

export function customsScanSample(state, observer, player, dtS = 1) {
  if (!observer?.pos || !player?.pos) {
    return Object.freeze({ insideCone: false, enginesDark: false, stormMultiplier: 1, exposureDelta: 0 });
  }
  const dx = finite(player.pos.x) - finite(observer.pos.x);
  const dz = finite(player.pos.z) - finite(observer.pos.z);
  const distanceWU = Math.hypot(dx, dz);
  const heading = finite(observer.rot);
  const forwardX = Math.cos(heading);
  const forwardZ = Math.sin(heading);
  const dot = distanceWU > 1e-6 ? (dx * forwardX + dz * forwardZ) / distanceWU : 1;
  const insideCone = distanceWU <= CUSTOMS_SCAN_CONE.rangeWU
    && dot >= Math.cos(CUSTOMS_SCAN_CONE.halfAngleRad);
  const enginesDark = playerEnginesDark(state);
  const stormMultiplier = ionStormSignalMultiplier(state, player.pos);
  const dt = Math.max(0, Math.min(2, finite(dtS)));
  const baseRate = enginesDark ? CUSTOMS_SCAN_CONE.coldAcquirePerS : CUSTOMS_SCAN_CONE.hotAcquirePerS;
  const exposureDelta = insideCone
    ? baseRate * stormMultiplier * dt
    : -CUSTOMS_SCAN_CONE.outsideDecayPerS * dt;
  return Object.freeze({
    insideCone,
    enginesDark,
    stormMultiplier,
    exposureDelta,
    distanceWU,
    bearingDot: dot,
  });
}

export function customsScanPresentation() {
  return Object.freeze({
    kind: 'customs_scan_lattice',
    rangeWU: CUSTOMS_SCAN_CONE.rangeWU,
    visualRangeWU: CUSTOMS_SCAN_CONE.visualReachWU,
    halfAngleRad: CUSTOMS_SCAN_CONE.halfAngleRad,
    technique: 'hard_line_fan',
  });
}
