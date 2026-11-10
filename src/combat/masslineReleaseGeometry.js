/**
 * Exact free-flight contact and a bounded, explicitly conditional COAST-window forecast.
 * A window is evidence about the current exit vector, never permission to steer a payload.
 * Radii are physical world radii; no minimum angle or inflated aim-assist hitbox is used.
 */
const TAU = Math.PI * 2;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const radius = v => Math.max(0, finite(v));
const validPoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const invalid = () => ({ valid: false, onSolution: false, hit: false, errorRad: Math.PI,
  tolRad: 0, interceptAngle: 0, payloadSpeed: 0, relativeSpeed: 0,
  timeToSolution: null, timeOfFlight: 0, impactTime: null, closestTime: 0,
  missDistance: null, clearance: null, predicted: null, fieldAware: false,
  projectedPath: null, fieldDistortionRad: 0, model: 'invalid' });

/** Relative ray against a disk, including contact between fixed samples. */
export function sweptDiskContact(px, pz, vx, vz, contactRadius, horizon = 6) {
  if (![px, pz, vx, vz, contactRadius, horizon].every(Number.isFinite) || contactRadius < 0 || horizon < 0) {
    return { valid: false, hit: false, impactTime: null, closestTime: 0, distance: null };
  }
  const vv = vx * vx + vz * vz, dot = px * vx + pz * vz;
  if (!Number.isFinite(vv) || !Number.isFinite(dot)) return { valid: false, hit: false, impactTime: null, closestTime: 0, distance: null };
  const closestTime = vv > 1e-14 ? clamp(-dot / vv, 0, horizon) : 0;
  const distance = Math.hypot(px + vx * closestTime, pz + vz * closestTime);
  const c = px * px + pz * pz - contactRadius * contactRadius;
  if (!Number.isFinite(c) || !Number.isFinite(distance)) return { valid: false, hit: false, impactTime: null, closestTime: 0, distance: null };
  let impactTime = c <= 0 ? 0 : null;
  if (impactTime == null && vv > 1e-14 && dot < 0) {
    const discriminant = dot * dot - vv * c;
    if (!Number.isFinite(discriminant)) return { valid: false, hit: false, impactTime: null, closestTime: 0, distance: null };
    // Roundoff tolerance is scale-relative and only affects tangency, not gameplay grace.
    const eps = Number.EPSILON * 16 * Math.max(1, dot * dot, Math.abs(vv * c));
    if (discriminant >= -eps) {
      const root = Math.sqrt(Math.max(0, discriminant));
      // c / (-dot + root) is the cancellation-resistant form of the entry root.
      const t = c / (-dot + root);
      if (t >= 0 && t <= horizon + 1e-10) impactTime = Math.min(t, horizon);
    }
  }
  return { valid: true, hit: impactTime != null, impactTime, closestTime, distance };
}

/** Current exit vector. Translation/velocity-frame invariant for a moving target. */
export function solveCadenceRelease(payload, aim, opts = {}) {
  if (!validPoint(payload?.pos) || !validPoint(payload?.vel) || !validPoint(aim?.pos)
      || aim.vel != null && !validPoint(aim.vel)) return invalid();
  const av = aim.vel || { x: 0, z: 0 };
  const px = aim.pos.x - payload.pos.x, pz = aim.pos.z - payload.pos.z;
  const vx = av.x - payload.vel.x, vz = av.z - payload.vel.z;
  const relativeSpeed = Math.hypot(vx, vz), payloadSpeed = Math.hypot(payload.vel.x, payload.vel.z);
  const combinedRadius = radius(payload.radius) + radius(aim.radius);
  const horizon = clamp(finite(opts.horizon, 6), 0, 6);
  const contact = sweptDiskContact(px, pz, vx, vz, combinedRadius, horizon);
  if (!contact.valid) return invalid();
  const valid = relativeSpeed > 1e-6;
  const distance = Math.hypot(px, pz);
  const errorRad = valid ? wrap(Math.atan2(pz, px) - Math.atan2(-vz, -vx)) : Math.PI;
  const tolRad = distance > 0 ? Math.asin(Math.min(1, combinedRadius / distance)) : Math.PI;
  const time = contact.impactTime ?? contact.closestTime;
  const targetX = aim.pos.x + av.x * time, targetZ = aim.pos.z + av.z * time;
  const heading = Math.atan2(payload.vel.z, payload.vel.x);
  const interceptAngle = Math.atan2(targetZ - payload.pos.z, targetX - payload.pos.x);
  const result = {
    valid, onSolution: valid && contact.hit, hit: contact.hit, errorRad, tolRad,
    interceptAngle, payloadSpeed, relativeSpeed,
    timeToSolution: contact.hit ? 0 : null, // A ray has no future orbital clock. Only the coast model supplies one.
    timeOfFlight: time, impactTime: contact.impactTime, closestTime: contact.closestTime,
    missDistance: Math.max(0, contact.distance - combinedRadius),
    clearance: combinedRadius - contact.distance,
    predicted: { x: payload.pos.x + payload.vel.x * time, z: payload.pos.z + payload.vel.z * time },
    fieldAware: false, projectedPath: null, fieldDistortionRad: 0,
    model: 'constant_velocity', predictionHorizon: horizon,
  };
  if (typeof opts.fieldSampler !== 'function') return result;

  // Field-assisted prediction uses the same semi-implicit shape as the existing predictor,
  // but sweeps relative segments instead of testing vertices (thin targets cannot tunnel).
  // The sampler is a snapshot; this is not a promise about a manoeuvring target or future fields.
  const dt = clamp(finite(opts.fieldDt, 1 / 60), 1 / 240, 1 / 15);
  const steps = clamp(Math.ceil(finite(opts.fieldSteps, 90)), 1, 360);
  let x = payload.pos.x, z = payload.pos.z, ux = payload.vel.x, uz = payload.vel.z;
  let closest = Infinity, closestTime = 0, closestX = x, closestZ = z, impactTime = null;
  const path = [{ x, z }];
  for (let i = 0; i < steps; i++) {
    const acc = opts.fieldSampler(x, z, ux, uz);
    if (!Number.isFinite(acc?.ax) || !Number.isFinite(acc?.az)) return { ...invalid(), model: 'invalid_field' };
    ux += acc.ax * dt; uz += acc.az * dt;
    const t0 = i * dt;
    const rx = aim.pos.x + av.x * t0 - x, rz = aim.pos.z + av.z * t0 - z;
    const seg = sweptDiskContact(rx, rz, av.x - ux, av.z - uz, combinedRadius, dt);
    if (!seg.valid || !Number.isFinite(ux) || !Number.isFinite(uz)) return { ...invalid(), model: 'invalid_field' };
    if (seg.distance < closest) {
      closest = seg.distance; closestTime = t0 + seg.closestTime;
      closestX = x + ux * seg.closestTime; closestZ = z + uz * seg.closestTime;
    }
    if (impactTime == null && seg.hit) impactTime = t0 + seg.impactTime;
    x += ux * dt; z += uz * dt; path.push({ x, z });
  }
  const hit = impactTime != null;
  return { ...result, valid: true, hit, onSolution: hit,
    timeToSolution: hit ? 0 : null, // an orbital ETA is not valid inside an accelerating field
    timeOfFlight: impactTime ?? closestTime, impactTime, closestTime,
    missDistance: Math.max(0, closest - combinedRadius), clearance: combinedRadius - closest,
    predicted: { x: closestX, z: closestZ }, fieldAware: true, projectedPath: path,
    fieldClosestDist: closest, fieldClosestTime: closestTime,
    fieldDistortionRad: wrap(Math.atan2(closestZ - payload.pos.z, closestX - payload.pos.x) - heading),
    model: 'frozen_field', predictionHorizon: steps * dt };
}

/**
 * Advisory collateral corridor (INF-078). Names the nearest known body inside the danger
 * region of the CURRENT predicted throw — the corridor from the payload along the
 * projected path (or the straight ray to the predicted point) with a readability pad.
 *
 * Pure presentation geometry: it never authorizes, prevents, or prices anything. Stale or
 * degraded solutions, missing predictions, and unmeasurable spots all return null rather
 * than a certainty the prediction cannot support.
 *
 * @param {object} solution mirrored throw solution (predicted, projectedPath, degraded,
 *   decisionStale, valid).
 * @param {{x,z}} payloadPos current payload position.
 * @param {number} payloadRadius physical payload radius.
 * @param {Array<{x,z,r,label}>} spots known candidate bodies with finite positions/radii.
 * @returns {{label:string, clearance:number}|null} nearest intersecting spot, if any.
 */
export const THROW_COLLATERAL_PAD = 6; // wu — corridor readability tolerance, not aim assist
export function resolveThrowCollateral(solution, payloadPos, payloadRadius, spots) {
  if (!solution || solution.valid !== true
      || solution.degraded === true || solution.decisionStale === true) return null;
  if (!validPoint(payloadPos) || !validPoint(solution.predicted)) return null;
  const halfWidth = radius(payloadRadius) + THROW_COLLATERAL_PAD;
  const path = solution.projectedPath;
  let bestLabel = '';
  let bestClearance = Infinity;
  let found = false;
  const list = spots || [];
  for (let s = 0; s < list.length; s++) {
    const spot = list[s];
    if (!spot || !validPoint(spot) || !Number.isFinite(spot.r) || spot.r < 0) continue;
    let distance = Infinity;
    let prev = payloadPos;
    if (Array.isArray(path)) {
      for (let i = 0; i < path.length; i++) {
        const point = path[i];
        if (!validPoint(point)) continue;
        distance = Math.min(distance, segmentDistance(prev, point, spot));
        prev = point;
      }
    }
    distance = Math.min(distance, segmentDistance(prev, solution.predicted, spot));
    if (!Number.isFinite(distance) || distance > spot.r + halfWidth) continue;
    const clearance = distance - spot.r;
    if (!found || clearance < bestClearance) {
      found = true;
      bestClearance = clearance;
      bestLabel = typeof spot.label === 'string' && spot.label ? spot.label : 'PROTECTED BODY';
    }
  }
  if (!found) return null;
  return { label: bestLabel, clearance: bestClearance };
}

function segmentDistance(a, b, p) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-14 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/**
 * SF-027 (PB-MASS-B) — own-route swept-contact delta. The release tangent crossing the PILOT'S
 * OWN route is the one victim class the body corridor cannot name: the pilot's hull is neither a
 * law-protected spot nor stationary cargo, and the cut changes the line's topology, not the
 * pilot's velocity — the honest own route is the current hull velocity extrapolated.
 *
 * Swept moving-vs-moving closest approach, in the pilot's advancing frame: the pilot sits at that
 * frame's origin, so each payload path segment (payload step minus the pilot's same-interval
 * advance) reduces to a segment-to-origin distance. That catches a contact BETWEEN samples a
 * vertex-only read would fly straight past — the delta this helper exists for. Classification
 * stays bounded to the solution's own projected horizon (the initial segment; nothing past it is
 * promised), and the same advisory discipline as resolveThrowCollateral applies: stale, degraded,
 * or unmeasurable inputs return null rather than a certainty, and nothing here suppresses the
 * release or steers the body.
 *
 * @returns {{label:string, clearance:number, closestTime:number}|null}
 */
export function resolveThrowOwnRouteRisk(solution, payloadPos, payloadRadius, playerPos, playerVel, playerRadius) {
  if (!solution || solution.valid !== true
      || solution.degraded === true || solution.decisionStale === true) return null;
  if (!validPoint(payloadPos) || !validPoint(playerPos)) return null;
  const halfWidth = radius(payloadRadius) + Math.max(0, radius(playerRadius));
  const vx = validPoint(playerVel) ? playerVel.x : 0;
  const vz = validPoint(playerVel) ? playerVel.z : 0;
  // Payload waypoints on a time axis: the field-aware path already samples its own integration;
  // the constant-velocity model is the straight tangent to the predicted contact.
  let waypoints = null;
  let stepS = 0;
  if (Array.isArray(solution.projectedPath) && solution.projectedPath.length >= 2) {
    waypoints = solution.projectedPath;
    // Path points sit one solver step apart; the recorded horizon reconstructs that step exactly.
    // The 1 s cap bounds the pilot's own straight-line extrapolation per step on degenerate
    // records (a horizon claiming seconds across two points would otherwise pre-tell a long
    // pilot course the advisory never promised).
    stepS = clamp(finite(solution.predictionHorizon, 0) / (waypoints.length - 1), 1e-6, 1);
  } else {
    if (!validPoint(solution.predicted)) return null;
    waypoints = [payloadPos, solution.predicted];
    stepS = Math.max(0, finite(solution.timeOfFlight, 0));
  }
  const playerAt = (t) => ({ x: playerPos.x + vx * t, z: playerPos.z + vz * t });
  const origin = { x: 0, z: 0 };
  let closest = Infinity;
  let closestTime = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    if (!validPoint(a) || !validPoint(b)) continue;
    const t0 = (i - 1) * stepS;
    const t1 = i * stepS;
    const pa = playerAt(t0);
    const pb = playerAt(t1);
    // Relative segment in the pilot's advancing frame; the pilot is the frame origin.
    const distance = segmentDistance({ x: a.x - pa.x, z: a.z - pa.z }, { x: b.x - pb.x, z: b.z - pb.z }, origin);
    if (distance < closest) { closest = distance; closestTime = t0; }
  }
  if (!Number.isFinite(closest)) return null;
  const clearance = closest - halfWidth;
  if (clearance > 0) return null;
  return { label: 'YOUR ROUTE', clearance, closestTime };
}

/**
 * First release aperture within 1.5 s, sampled at fixed ticks. The pair coasts about its measured
 * COM; the aim continues linearly. This forecast is only offered for a settled, near-taut swing.
 * It teaches WHEN to cut. The actual cut is ALWAYS checked against solveCadenceRelease NOW.
 * No autopilot, no reversal, no retargeting, and no authorisation based on an old forecast.
 */
export function forecastCadenceWindow(owner, payload, aim, opts = {}) {
  const none = reason => ({ model: 'coast', reliable: false, reason, enterS: null, exitS: null, widthS: null });
  if (!validPoint(owner?.pos) || !validPoint(owner?.vel) || !validPoint(payload?.pos)
      || !validPoint(payload?.vel) || !validPoint(aim?.pos)) return none('missing_state');
  const rx = payload.pos.x - owner.pos.x, rz = payload.pos.z - owner.pos.z;
  const vx = payload.vel.x - owner.vel.x, vz = payload.vel.z - owner.vel.z;
  const rr = rx * rx + rz * rz, distance = Math.sqrt(rr);
  if (!(distance > 1e-6)) return none('coincident');
  const omega = (rx * vz - rz * vx) / rr;
  const radial = (rx * vx + rz * vz) / distance, tangent = Math.abs(omega) * distance;
  if (Math.abs(omega) < 0.02 || Math.abs(radial) > Math.max(2, tangent * 0.25)) return none('settle_swing');
  if (finite(opts.restLength, distance) - distance > Math.max(0.5, distance * 0.025)) return none('slack');
  if (opts.fieldAware) return none('field');
  const ma = Math.max(0.1, finite(owner.physicsBody?.mass, finite(owner.mass, 1)));
  const mb = Math.max(0.1, finite(payload.physicsBody?.mass, finite(payload.mass, 1)));
  const share = ma / (ma + mb);
  const cx = owner.pos.x + rx * (1 - share), cz = owner.pos.z + rz * (1 - share);
  const cvx = owner.vel.x + vx * (1 - share), cvz = owner.vel.z + vz * (1 - share);
  const av = aim.vel || { x: 0, z: 0 };
  const dt = 1 / 60, ticks = clamp(Math.floor(finite(opts.horizon, 1.5) / dt), 1, 120);
  const p = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: radius(payload.radius) };
  const a = { pos: { x: 0, z: 0 }, vel: av, radius: radius(aim.radius) };
  let enterS = null, exitS = null;
  for (let tick = 0; tick <= ticks; tick++) {
    const t = tick * dt, c = Math.cos(omega * t), s = Math.sin(omega * t);
    const qx = (rx * c - rz * s) * share, qz = (rx * s + rz * c) * share;
    p.pos.x = cx + cvx * t + qx; p.pos.z = cz + cvz * t + qz;
    p.vel.x = cvx - omega * qz; p.vel.z = cvz + omega * qx;
    a.pos.x = aim.pos.x + av.x * t; a.pos.z = aim.pos.z + av.z * t;
    const shot = solveCadenceRelease(p, a, { horizon: finite(opts.flightHorizon, 6) });
    if (shot.onSolution && enterS == null) enterS = t;
    if (!shot.onSolution && enterS != null) { exitS = t; break; }
  }
  return { model: 'coast', reliable: true, reason: enterS == null ? 'no_window' : null,
    enterS, exitS, widthS: enterS != null && exitS != null ? exitS - enterS : null,
    horizonS: ticks * dt, resolutionS: dt, omega };
}
