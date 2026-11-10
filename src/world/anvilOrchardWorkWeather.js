// Read-only local work-route warning. The saved machinery phase and authored field
// geometry remain authoritative; this neither applies forces nor changes custody.
import { ANVIL_ORCHARD, normalizeOrchardRecord, orchardHistoryFitsTick, orchardPhase } from '../data/anvilOrchard.js';
import { isOrchardFrame } from '../data/anvilOrchardIdentity.js';
import { ANVIL_ORCHARD_GUST_PROFILE as GUST, anvilOrchardGustGeometry } from '../data/environmentalMachinery.js';

// Clip a segment against the cone's two side planes and radial disk. Expanding
// both by the hull radius is conservative at corners, never a narrower field.
export function orchardWorkSegmentExposed(a, b, geometry, radius = 0) {
  if (!geometry || ![a?.x, a?.z, b?.x, b?.z, radius].every(Number.isFinite) || radius < 0) return false;
  const x = a.x - geometry.center.x, z = a.z - geometry.center.z;
  const dx = b.x - a.x, dz = b.z - a.z;
  const dir = geometry.dir, angle = GUST.halfAngleRad + GUST.edgeSoftRad;
  const sine = Math.sin(angle), cosine = Math.cos(angle);
  let entry = 0, exit = 1;
  for (const sign of [-1, 1]) {
    const nx = sine * dir.x + sign * cosine * (-dir.z);
    const nz = sine * dir.z + sign * cosine * dir.x;
    const start = nx * x + nz * z + radius;
    const delta = nx * dx + nz * dz;
    if (Math.abs(delta) < 1e-12) {
      if (start < 0) return false;
      continue;
    }
    const crossing = -start / delta;
    if (delta > 0) entry = Math.max(entry, crossing);
    else exit = Math.min(exit, crossing);
    if (entry > exit) return false;
  }
  const length2 = dx * dx + dz * dz;
  const nearest = length2 ? Math.max(entry, Math.min(exit, -(x * dx + z * dz) / length2)) : entry;
  return Math.hypot(x + nearest * dx, z + nearest * dz) <= GUST.radius + radius;
}

export function orchardWorkerWeather(state, worker, target) {
  if (state?.mode !== 'flight' || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
    || !Number.isSafeInteger(state.tick) || state.entities?.get(worker?.id) !== worker) return null;
  // Match the force owner's residency fallback. A missing/stale planet cache does
  // not turn off a still-resident authored gust source.
  let frame = state.entities.get(state.planet?.orchardFrameId);
  if (!isOrchardFrame(frame)) {
    frame = null;
    for (const candidate of state.entities.values()) {
      if (isOrchardFrame(candidate)) {
        frame = candidate;
        break;
      }
    }
  }
  if (!frame) return null;
  const row = normalizeOrchardRecord(state.sites?.anvilOrchard);
  if (!row || row.frameStatus !== 'intact' || !orchardHistoryFitsTick(row, state.tick)) return null;
  const phase = orchardPhase(row, state.tick);
  if (!phase || phase.phase === 'calm') return null;
  const geometry = anvilOrchardGustGeometry(frame), radius = worker.radius;
  if (!geometry || !Number.isFinite(radius) || radius < 0) return null;
  const exposed = orchardWorkSegmentExposed(worker.pos, worker.pos, geometry, radius);
  const crossing = orchardWorkSegmentExposed(worker.pos, target, geometry, radius);
  return exposed || crossing ? { phase: phase.phase, remainingTicks: phase.remainingTicks, exposed, crossing } : null;
}
