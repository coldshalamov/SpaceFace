// Pure, deterministic circuit geometry. Neither Three.js nor world-state writers belong here.
const finitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const circuitLaps = (p) => Math.max(1, Math.min(100, Math.round(Number(p?.laps) || 1)));

/** Normal into a checkpoint. Gate zero is the grid; closed courses explicitly repeat it at end. */
export function gateApproach(gates, index, out = {}) {
  if (!Array.isArray(gates) || gates.length < 2 || !finitePoint(gates[index])) return null;
  const b = gates[index];
  const a = index > 0 ? gates[index - 1] : gates[1];
  if (!finitePoint(a)) return null;
  const sign = index > 0 ? 1 : -1;
  const dx = (b.x - a.x) * sign;
  const dz = (b.z - a.z) * sign;
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-6)) return null;
  out.x = b.x - dx / length;
  out.z = b.z - dz / length;
  out.nx = dx / length;
  out.nz = dz / length;
  return out;
}

/** Swept plane intersection, not the frame endpoint. Returns the time fraction, or null. */
export function planeCrossFraction({ prev, pos, vel, from, gate, radius }) {
  if (![prev, pos, from, gate].every(finitePoint) || !(Number.isFinite(radius) && radius > 0)) return null;
  const dx = gate.x - from.x, dz = gate.z - from.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-6)) return null;
  const nx = dx / length, nz = dz / length;
  const before = (prev.x - gate.x) * nx + (prev.z - gate.z) * nz;
  const after = (pos.x - gate.x) * nx + (pos.z - gate.z) * nz;
  if (!(before < 0 && after >= 0 && after > before)) return null;
  if (vel && (!finitePoint(vel) || vel.x * nx + vel.z * nz <= 0)) return null;
  const t = -before / (after - before);
  const x = prev.x + (pos.x - prev.x) * t - gate.x;
  const z = prev.z + (pos.z - prev.z) * t - gate.z;
  return Math.abs(x * nz - z * nx) <= radius ? t : null;
}

export function segmentProjection(pos, a, b, out = {}) {
  if (![pos, a, b].every(finitePoint)) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const t = length > 1e-6
    ? Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.z - a.z) * dz) / (length * length))) : 0;
  out.t = t;
  out.distance = Math.hypot(pos.x - a.x - dx * t, pos.z - a.z - dz * t);
  out.length = length;
  return out;
}

/** Distance-weighted reference pace at current progress, never distance to the finish alone. */
export function circuitProgress(params, pos, gates, out = {}) {
  const count = Array.isArray(gates) ? gates.length : 0;
  const next = Math.max(0, Math.min(count - 1, params?.nextGate | 0));
  let total = 0, done = 0;
  for (let i = 1; i < count; i++) {
    const length = Math.hypot(gates[i].x - gates[i-1].x, gates[i].z - gates[i-1].z);
    total += length;
    if (i < next) done += length;
  }
  const seg = next > 0 && pos ? segmentProjection(pos, gates[next - 1], gates[next]) : null;
  if (seg) done += seg.t * seg.length;
  const laps = circuitLaps(params);
  const lap = Math.max(0, Math.min(laps - 1, params?.lap | 0));
  out.fraction = total > 0 ? Math.min(1, (lap * total + done) / (laps * total)) : 0;
  out.distance = seg ? seg.distance : 0;
  out.length = total;
  return out;
}

/** The active upcoming gate index in 0..gates.length-1, or null if course is not active / finished. */
export function circuitUpcomingGate(params) {
  if (!params || !Array.isArray(params.gates) || params.gates.length < 2) return null;
  if (params.finished || params.phase === 'finished' || params.phase === 'handoff') return null;
  const laps = circuitLaps(params);
  const lap = Math.max(0, params.lap | 0);
  if (lap >= laps) return null;
  const next = Math.max(0, params.nextGate | 0);
  if (next >= params.gates.length) return null;
  return next;
}

/**
 * Lit state for a gate aperture: 'cleared', 'upcoming', 'boost', or 'base'.
 * Never returns 'upcoming' or 'boost' for a passed gate.
 */
export function circuitGateLitState(params, index) {
  if (!params || !Array.isArray(params.gates) || !Number.isInteger(index) || index < 0 || index >= params.gates.length) return 'base';
  const upcoming = circuitUpcomingGate(params);
  const next = Math.max(0, params.nextGate | 0);
  const laps = circuitLaps(params);
  const lap = Math.max(0, params.lap | 0);
  const finished = params.finished || params.phase === 'finished' || params.phase === 'handoff' || lap >= laps || upcoming === null;

  if (finished) return 'cleared';
  // A closed circuit's last gate repeats gate 0's position (the finish line), so both rings must
  // light together or the cleared start ring hides the lit one.
  if (params.closedCircuit && upcoming === params.gates.length - 1 && index === 0) {
    return 'upcoming';
  }
  if (index === upcoming) {
    return 'upcoming';
  }
  if (index < next) {
    return 'cleared';
  }
  if (index === params.boostGateIndex) {
    return 'boost';
  }
  return 'base';
}

/** Sample a looping pace marker, including the closing segment. Caller may reuse `out`. */
export function circuitPacePoint(gates, distance, out = {}) {
  if (!Array.isArray(gates) || gates.length < 2 || !Number.isFinite(distance)) return null;
  let total = 0;
  for (let i = 1; i < gates.length; i++) total += Math.hypot(gates[i].x-gates[i-1].x,gates[i].z-gates[i-1].z);
  if (!(total > 0)) return null;
  let remain = ((distance % total) + total) % total;
  for (let i = 1; i < gates.length; i++) {
    const a = gates[i-1], b = gates[i];
    const length = Math.hypot(b.x-a.x,b.z-a.z);
    if (length <= 1e-6) continue;
    if (remain <= length || i === gates.length-1) {
      const t = Math.min(1, remain / length);
      out.x = a.x+(b.x-a.x)*t; out.z = a.z+(b.z-a.z)*t;
      out.heading = Math.atan2(b.z-a.z,b.x-a.x);
      return out;
    }
    remain -= length;
  }
  return null;
}

/** A single fixed-step may cross several ordered gates; each intersection must be later. */
export function advanceCircuit(params, sample) {
  const { prev, pos, vel, gates, previousTime, now } = sample;
  const events = [];
  if (!Array.isArray(gates) || gates.length < 2 || !finitePoint(prev) || !finitePoint(pos)
      || !Number.isFinite(params.raceStartSimS) || !Number.isFinite(now)
      || !Number.isFinite(previousTime) || now < previousTime) return events;
  let lastFraction = -1;
  // Bounded even for corrupt saves / coincident gates. No unbounded catch-up loop.
  for (let guard = 0; guard < gates.length; guard++) {
    const next = Math.max(0, params.nextGate | 0);
    if (next >= gates.length) break;
    const from = gateApproach(gates, next);
    const fraction = planeCrossFraction({ prev, pos, vel, from, gate: gates[next], radius: Number(params.gateRadiusWU) || 90 });
    if (fraction === null || fraction <= lastFraction) break;
    lastFraction = fraction;
    const crossedAt = previousTime + fraction * (now - previousTime);
    if (crossedAt < params.raceStartSimS) break; // no pre-green crossing credit
    const elapsed = Math.max(0, crossedAt - params.raceStartSimS);
    const lap = Math.max(0, params.lap | 0);
    params.nextGate = next + 1;
    params.raceOpened = true;
    params.orderWarnGate = null;
    const event = { gateIndex: next, lap, elapsedS: elapsed, finished: false, lapCompleted: false };
    if (next === gates.length - 1) {
      event.lapCompleted = true;
      event.lapTimeS = elapsed - (Number(params.lastLapElapsedS) || 0);
      params.lastLapElapsedS = elapsed;
      if (lap + 1 >= circuitLaps(params)) event.finished = true;
      else { params.lap = lap + 1; params.nextGate = params.closedCircuit ? 1 : 0; }
    }
    events.push(event);
    if (event.finished) break;
  }
  return events;
}

/** Chase-view touch controls are car-like axes, not a feedback loop against camera yaw lag. */
export function racingTouchDrive(stick, out = {}) {
  const clamp = value => Number.isFinite(value) ? Math.max(-1, Math.min(1,value)) : 0;
  const magnitude = Math.max(0, clamp(stick?.magnitude));
  out.turn = clamp(stick?.x) * magnitude;
  out.thrust = Math.max(0, -clamp(stick?.y)) * magnitude;
  out.brake = !!stick?.brake || (clamp(stick?.y) > 0.35 && magnitude > 0.1);
  if (out.brake) out.thrust = 0;
  return out;
}
