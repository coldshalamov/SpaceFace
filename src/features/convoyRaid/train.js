import { createConvoyRoute, mixConvoySeed, projectRoute, sampleRoute } from './route.js';

/**
 * A six-body maximum articulated train. This module owns only its plain model.
 * planTrainStep emits additive impulses; physicsAuthority is the live movement
 * writer. No carriage is path-snapped, velocity-replaced, or respawned on sever.
 */
export const TRAIN_LIMITS = Object.freeze({
  minCarriages: 3, maxCarriages: 5, maxStep: 1 / 30, solverIterations: 6,
  couplingStiffness: 16000, couplingDamping: 2100, couplingForce: 24000,
  yawStiffness: 38000, yawDamping: 16000, yawTorque: 60000, yawSlack: 0.1,
  strainForce: 6200, maxDriveAccel: 3.6, maxYawAccel: 1.2,
  maxStabilizerAccel: 3.2, maxStabilizerForce: 900,
  maxRecoveryAccel: 1.8, maxBraceSeconds: 8,
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const scalarFields = ['x', 'z', 'vx', 'vz', 'angle', 'omega', 'hp'];
const idString = value => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,100}$/.test(value);
const safeKinematics = row => scalarFields.every(key => Number.isFinite(row[key]))
  && Math.abs(row.x) <= 2e7 && Math.abs(row.z) <= 2e7
  && Math.abs(row.vx) <= 1e6 && Math.abs(row.vz) <= 1e6
  && Math.abs(row.angle) <= 1e7 && Math.abs(row.omega) <= 1e6;

function bodyById(train, id) { return train.bodies.find(body => body.id === id) || null; }
function activeCoupler(train, coupler) {
  return !coupler.severed && !bodyById(train, coupler.aId)?.lost && !bodyById(train, coupler.bId)?.lost;
}
function addEvent(train, event) {
  // A whole train can produce at most six losses and five breaks. Keep a hard
  // cap anyway, including when an external caller never drains its queue.
  if (train.pendingEvents.length < 24) train.pendingEvents.push(event);
}

/** targetIndex is zero-based among carriages, deliberately never a train endpoint. */
export function createTrain({ seed = 4242, id = 'switchback', carriageCount = 4,
  targetIndex = null, route = null, routeDistance = 180, speed = 26 } = {}) {
  const count = clamp(Math.floor(finite(carriageCount, 4)), TRAIN_LIMITS.minCarriages, TRAIN_LIMITS.maxCarriages);
  const stableId = idString(id) ? id : 'switchback';
  const seedValue = finite(seed, 4242) >>> 0;
  const selected = Number.isInteger(targetIndex)
    ? clamp(targetIndex, 1, count - 2) : 1 + mixConvoySeed(seedValue, 0x53a7) % (count - 2);
  const track = route || createConvoyRoute({ seed: seedValue });
  const initialDistance = clamp(finite(routeDistance, 180), 0, track.length);
  const cruiseSpeed = clamp(finite(speed, 26), 8, 38);
  const bodies = [];
  let distance = initialDistance;
  for (let index = 0; index <= count; index++) {
    const tug = index === 0;
    // Hawser uses the authored/native 1.72 x .52 proportions at radius22.
    // Cargo's released container is fitted to diameter28 by the payload renderer.
    const halfLength = tug ? 22 * 0.86 : 14;
    const halfWidth = tug ? 22 * 0.26 : 6.5;
    const radius = tug ? 22 : 14;
    const mass = tug ? 68 : 70 + mixConvoySeed(seedValue, index + 100) % 25;
    if (index > 0) distance -= bodies[index - 1].halfLength + halfLength + 3;
    const frame = sampleRoute(track, distance);
    const target = index - 1 === selected;
    bodies.push({ id: `${stableId}:${tug ? 'tug' : `car:${index - 1}`}`,
      role: tug ? 'tug' : 'carriage', index: index - 1, target,
      serial: tug ? 'SWITCHBACK PRIME' : `SB-${(mixConvoySeed(seedValue, 8103 + index) % 9000) + 1000}`,
      mass, inertia: mass * (halfLength * halfLength * 4 + halfWidth * halfWidth * 4) / 12,
      radius, halfLength, halfWidth, x: frame.x, z: frame.z,
      vx: frame.tx * cruiseSpeed, vz: frame.tz * cruiseSpeed, angle: frame.angle, omega: 0,
      hp: tug ? 900 : 360, maxHp: tug ? 900 : 360, lost: false,
    });
  }
  const couplers = bodies.slice(1).map((body, index) => ({
    id: `${stableId}:coupler:${index}`, aId: bodies[index].id, bId: body.id,
    restLength: 3, integrity: 1, severed: false, severedAt: null, reason: null,
    braceUntil: 0, tension: 0, strain: 0,
  }));
  const train = { schemaVersion: 1, id: stableId, seed: seedValue, carriageCount: count,
    targetIndex: selected, route: track, routeDistance: initialDistance, speed: cruiseSpeed,
    simTime: 0, braceUntil: 0, throttle: 1, bodyIds: bodies.map(body => body.id),
    bodies, couplers, pendingEvents: [] };
  // The target never moves to a surviving or nearest carriage after damage/load.
  Object.defineProperty(train, 'targetId', { value: bodies[selected + 1].id,
    enumerable: true, writable: false, configurable: false });
  return train;
}

/**
 * Copy authoritative observations into the model. Missing observations do not
 * imply destruction (a runtime may be partitioned); explicit lost/hp<=0 does.
 * Once lost, a body cannot be revived by a stale observation.
 */
export function synchronizeTrain(train, observations = []) {
  const lookup = new Map();
  for (const row of Array.isArray(observations) ? observations.slice(0, 32) : []) {
    if (row && !lookup.has(row.id)) lookup.set(row.id, row);
  }
  for (const body of train.bodies) {
    if (body.lost) continue;
    const row = lookup.get(body.id);
    if (!row) continue;
    if (row.lost === true || (Number.isFinite(row.hp) && row.hp <= 0)) {
      markBodyLost(train, body.id, { reason: 'body_lost', simTime: train.simTime });
      continue;
    }
    for (const key of scalarFields) if (Number.isFinite(row[key])) body[key] = row[key];
    // The runtime may read a differently normalized physical mass; consume it
    // explicitly so the solver's J/m agrees with the real owner.
    if (Number.isFinite(row.mass) && row.mass > 0) body.mass = clamp(row.mass, 0.01, 1e6);
    if (Number.isFinite(row.inertia) && row.inertia > 0) body.inertia = clamp(row.inertia, 0.01, 1e10);
  }
  return train;
}

/** Graph splitting is canonical by original body order and bounded by six nodes. */
export function getTrainComponents(train) {
  const remaining = new Set(train.bodies.filter(body => !body.lost).map(body => body.id));
  const components = [];
  for (const seed of train.bodies) {
    if (!remaining.has(seed.id)) continue;
    const bodyIds = [], queue = [seed.id];
    remaining.delete(seed.id);
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      bodyIds.push(id);
      for (const coupler of train.couplers) {
        if (!activeCoupler(train, coupler)) continue;
        const neighbor = coupler.aId === id ? coupler.bId : coupler.bId === id ? coupler.aId : null;
        if (neighbor && remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    const members = train.bodies.filter(body => bodyIds.includes(body.id));
    components.push({ id: bodyIds[0], bodyIds, powered: members.some(body => body.role === 'tug'),
      containsTarget: bodyIds.includes(train.targetId), mass: members.reduce((sum, body) => sum + body.mass, 0) });
  }
  return components;
}

/** Local anchors: a's rear, b's front. Positive yaw is game x -> z. */
export function getCouplerGeometry(train, couplerId, out = {}) {
  const coupler = typeof couplerId === 'object' ? couplerId : train.couplers.find(row => row.id === couplerId);
  if (!coupler) return null;
  const a = bodyById(train, coupler.aId), b = bodyById(train, coupler.bId);
  if (!a || !b) return null;
  const arx = -Math.cos(a.angle) * a.halfLength, arz = -Math.sin(a.angle) * a.halfLength;
  const brx = Math.cos(b.angle) * b.halfLength, brz = Math.sin(b.angle) * b.halfLength;
  out.id = coupler.id; out.aId = a.id; out.bId = b.id;
  out.ax = a.x + arx; out.az = a.z + arz;
  out.bx = b.x + brx; out.bz = b.z + brz;
  out.x = (out.ax + out.bx) / 2; out.z = (out.az + out.bz) / 2;
  out.a = out.a || {}; out.b = out.b || {}; out.mid = out.mid || {};
  out.a.x = out.ax; out.a.z = out.az; out.b.x = out.bx; out.b.z = out.bz;
  out.mid.x = out.x; out.mid.z = out.z;
  out.arx = arx; out.arz = arz; out.brx = brx; out.brz = brz;
  out.length = Math.hypot(out.bx - out.ax, out.bz - out.az);
  out.stretch = out.length - coupler.restLength;
  out.severed = coupler.severed; out.integrity = coupler.integrity;
  out.tension = coupler.tension; out.strain = coupler.strain;
  out.braced = coupler.braceUntil > train.simTime;
  return out;
}

/** Removing a constraint is the entire sever operation. There is no recoil injection. */
export function severCoupler(train, couplerId, { reason = 'cut', simTime = train.simTime } = {}) {
  const coupler = train.couplers.find(row => row.id === couplerId);
  if (!coupler || coupler.severed) return false;
  coupler.severed = true;
  coupler.reason = String(reason).slice(0, 48);
  coupler.severedAt = Math.max(0, finite(simTime, train.simTime));
  coupler.tension = 0;
  addEvent(train, { type: 'coupler_severed', couplerId: coupler.id,
    aId: coupler.aId, bId: coupler.bId, reason: coupler.reason, simTime: coupler.severedAt });
  return true;
}

/** Coupler integrity is separate from carriage hull and from the Massline. */
export function damageCoupler(train, couplerId, amount, options = {}) {
  const coupler = train.couplers.find(row => row.id === couplerId);
  if (!coupler || coupler.severed || !Number.isFinite(amount) || amount <= 0) return false;
  const braced = coupler.braceUntil > finite(options.simTime, train.simTime);
  coupler.integrity = Math.max(0, coupler.integrity - Math.min(1, amount) * (braced ? 0.55 : 1));
  if (coupler.integrity === 0) severCoupler(train, couplerId, { reason: options.reason || 'damage', ...options });
  return true;
}

/** Loss tombstones survive saves; later body observations cannot undo them. */
export function markBodyLost(train, bodyId, { reason = 'destroyed', simTime = train.simTime } = {}) {
  const body = bodyById(train, bodyId);
  if (!body || body.lost) return false;
  body.lost = true; body.hp = 0;
  for (const coupler of train.couplers) {
    if (coupler.aId === bodyId || coupler.bId === bodyId) severCoupler(train, coupler.id, { reason: 'body_lost', simTime });
  }
  addEvent(train, { type: 'body_lost', bodyId, reason: String(reason).slice(0, 48), simTime: finite(simTime) });
  return true;
}

/** Emergency brace is an actuator state: stronger couplers and slower tug, never a transform write. */
export function braceTrain(train, { until = train.simTime + 3, simTime = train.simTime } = {}) {
  const now = Math.max(0, finite(simTime, train.simTime));
  const expiry = clamp(finite(until, now + 3), now, now + TRAIN_LIMITS.maxBraceSeconds);
  train.braceUntil = Math.max(train.braceUntil, expiry);
  for (const coupler of train.couplers) if (!coupler.severed) coupler.braceUntil = Math.max(coupler.braceUntil, expiry);
  return train.braceUntil;
}

function applyScratchImpulse(body, velocity, ix, iz, angularImpulse) {
  velocity.vx += ix / body.mass; velocity.vz += iz / body.mass;
  velocity.omega += angularImpulse / body.inertia;
}

function boundedVector(x, z, maximum) {
  const length = Math.hypot(x, z);
  const scale = length > maximum ? maximum / length : 1;
  return { x: x * scale, z: z * scale };
}

/**
 * One fixed-step impulse plan. Call before the world's physics step, once only.
 * Larger dt is explicitly rejected; the host must substep rather than silently
 * discard time. Scratch solver velocities do not mutate observed body motion.
 */
export function planTrainStep(train, dt, simTime = train.simTime + dt, { drive = true } = {}) {
  if (!Number.isFinite(dt) || dt <= 0) return { impulses: [], events: [], dt: 0 };
  if (dt > TRAIN_LIMITS.maxStep + 1e-9) throw new RangeError('SWITCHBACK physics requires fixed steps <= 1/30s');
  train.simTime = Math.max(train.simTime, finite(simTime, train.simTime + dt));
  const velocities = new Map();
  const totals = new Map();
  for (const body of train.bodies) if (!body.lost) {
    velocities.set(body.id, { vx: body.vx, vz: body.vz, omega: body.omega });
    totals.set(body.id, { bodyId: body.id, ix: 0, iz: 0, angularImpulse: 0, reason: 'convoy_coupling' });
  }
  const apply = (body, ix, iz, angularImpulse, reason = 'convoy_coupling') => {
    if (![ix, iz, angularImpulse].every(Number.isFinite)) return;
    const total = totals.get(body.id), velocity = velocities.get(body.id);
    if (!total || !velocity) return;
    total.ix += ix; total.iz += iz; total.angularImpulse += angularImpulse;
    if (reason !== 'convoy_coupling') total.reason = reason;
    applyScratchImpulse(body, velocity, ix, iz, angularImpulse);
  };

  const tug = train.bodies[0];
  if (!tug.lost && drive) {
    const projection = projectRoute(train.route, tug, train.routeDistance);
    if (projection) {
      const endpoint = sampleRoute(train.route, train.route.length);
      const extension = (tug.x - endpoint.x) * endpoint.tx + (tug.z - endpoint.z) * endpoint.tz;
      train.routeDistance = projection.distance >= train.route.length - 1e-6
        ? train.route.length + Math.max(0, extension) : projection.distance;
    }
    const component = getTrainComponents(train).find(row => row.powered);
    const mass = component?.mass || tug.mass;
    // A physically detached tug keeps moving, with less force and no jump in speed.
    const ahead = sampleRoute(train.route, train.routeDistance + 70);
    let desiredSpeed = train.speed * clamp(finite(train.throttle, 1), 0, 1);
    if (train.braceUntil > train.simTime) desiredSpeed *= 0.38;
    const stoppingDistance = Math.max(0, train.route.length + 110 - train.routeDistance);
    desiredSpeed = Math.min(desiredSpeed, Math.sqrt(2 * 1.8 * stoppingDistance));
    const dx = ahead.x - tug.x, dz = ahead.z - tug.z;
    const length = Math.hypot(dx, dz) || 1;
    const desiredX = dx / length * desiredSpeed, desiredZ = dz / length * desiredSpeed;
    // Force authority scales with currently attached train mass, but is bounded.
    const acceleration = boundedVector((desiredX - tug.vx) * 1.4, (desiredZ - tug.vz) * 1.4,
      TRAIN_LIMITS.maxDriveAccel);
    const drive = boundedVector(acceleration.x * mass * dt, acceleration.z * mass * dt, 5000 * dt);
    const targetAngle = Math.atan2(dz, dx);
    const yawAccel = clamp(wrap(targetAngle - tug.angle) * 3.2 - tug.omega * 3.1,
      -TRAIN_LIMITS.maxYawAccel, TRAIN_LIMITS.maxYawAccel);
    apply(tug, drive.x, drive.z, clamp(yawAccel * tug.inertia, -60000, 60000) * dt, 'convoy_tug');
    // Small consist thrusters damp lateral whipping of the loaded chain. They
    // exchange momentum with exhaust, like the tug, and only run on its powered
    // component. An uncoupled car has no route guidance or automatic braking.
    for (const id of component?.bodyIds || []) {
      const body = bodyById(train, id);
      if (body.role === 'tug') continue;
      const stabilizer = boundedVector((tug.vx - body.vx) * 0.85, (tug.vz - body.vz) * 0.85,
        TRAIN_LIMITS.maxStabilizerAccel);
      const stabilizerImpulse = boundedVector(stabilizer.x * body.mass * dt, stabilizer.z * body.mass * dt,
        TRAIN_LIMITS.maxStabilizerForce * dt);
      apply(body, stabilizerImpulse.x, stabilizerImpulse.z, 0, 'convoy_stabilizer');
    }
  }

  const constraints = [];
  for (const coupler of train.couplers) {
    if (!activeCoupler(train, coupler)) continue;
    const a = bodyById(train, coupler.aId), b = bodyById(train, coupler.bId);
    const g = getCouplerGeometry(train, coupler);
    let nx, nz;
    if (g.length > 1e-6) { nx = (g.bx - g.ax) / g.length; nz = (g.bz - g.az) / g.length; }
    else { nx = -Math.cos(a.angle); nz = -Math.sin(a.angle); }
    const raCrossN = g.arx * nz - g.arz * nx;
    const rbCrossN = g.brx * nz - g.brz * nx;
    const effectiveInvMass = 1 / a.mass + 1 / b.mass
      + raCrossN * raCrossN / a.inertia + rbCrossN * rbCrossN / b.inertia;
    const braced = coupler.braceUntil > train.simTime;
    const stiffness = TRAIN_LIMITS.couplingStiffness * (braced ? 1.6 : 1);
    const damping = TRAIN_LIMITS.couplingDamping * (braced ? 1.3 : 1);
    const softness = 1 / (dt * (damping + dt * stiffness));
    const bias = clamp(g.stretch, -3, 25) * dt * stiffness * softness;
    const forceLimit = TRAIN_LIMITS.couplingForce * (braced ? 1.6 : 1);
    const yawError = wrap(b.angle - a.angle);
    const yawDeflection = Math.sign(yawError) * Math.max(0, Math.abs(yawError) - TRAIN_LIMITS.yawSlack);
    const yawSoftness = 1 / (dt * (TRAIN_LIMITS.yawDamping + dt * TRAIN_LIMITS.yawStiffness * (braced ? 1.6 : 1)));
    const yawBias = yawDeflection * dt * TRAIN_LIMITS.yawStiffness * (braced ? 1.6 : 1) * yawSoftness;
    constraints.push({ coupler, a, b, g, nx, nz, raCrossN, rbCrossN,
      effectiveInvMass, softness, bias, limit: forceLimit * dt, impulse: 0,
      yawSoftness, yawBias, yawImpulse: 0, yawLimit: TRAIN_LIMITS.yawTorque * dt * (braced ? 1.6 : 1) });
  }
  // Sequential impulses with compliance. Six bounded sweeps propagate tug force
  // through the chain without a high-frequency explicit spring explosion.
  for (let iteration = 0; iteration < TRAIN_LIMITS.solverIterations; iteration++) {
    for (let offset = 0; offset < constraints.length; offset++) {
      const c = constraints[iteration % 2 ? constraints.length - 1 - offset : offset];
      const va = velocities.get(c.a.id), vb = velocities.get(c.b.id);
      const avx = va.vx - va.omega * c.g.arz, avz = va.vz + va.omega * c.g.arx;
      const bvx = vb.vx - vb.omega * c.g.brz, bvz = vb.vz + vb.omega * c.g.brx;
      const relative = (bvx - avx) * c.nx + (bvz - avz) * c.nz;
      const increment = -(relative + c.bias + c.softness * c.impulse) / (c.effectiveInvMass + c.softness);
      const next = clamp(c.impulse + increment, -c.limit, c.limit);
      const delta = next - c.impulse; c.impulse = next;
      // Opposite linear impulses at anchor points conserve total linear and
      // angular momentum, including the bodies' orbital momentum about origin.
      apply(c.a, -delta * c.nx, -delta * c.nz, -delta * c.raCrossN);
      apply(c.b, delta * c.nx, delta * c.nz, delta * c.rbCrossN);
      // The coupler's mechanical yaw damper prevents an unforced freight chain
      // folding into a knot. It is a reciprocal torque, never rail steering.
      const yawIncrement = -(vb.omega - va.omega + c.yawBias + c.yawSoftness * c.yawImpulse)
        / (1 / c.a.inertia + 1 / c.b.inertia + c.yawSoftness);
      const yawNext = clamp(c.yawImpulse + yawIncrement, -c.yawLimit, c.yawLimit);
      const yawDelta = yawNext - c.yawImpulse; c.yawImpulse = yawNext;
      apply(c.a, 0, 0, -yawDelta);
      apply(c.b, 0, 0, yawDelta);
    }
  }
  for (const c of constraints) {
    const force = Math.abs(c.impulse) / dt;
    const strength = TRAIN_LIMITS.strainForce * (0.35 + 0.65 * c.coupler.integrity)
      * (c.coupler.braceUntil > train.simTime ? 1.6 : 1);
    c.coupler.tension = clamp(force / strength, 0, 1);
    const overload = Math.max(0, force / strength - 1);
    const severeExtension = Math.max(0, c.g.stretch - 15) / 25;
    c.coupler.strain = clamp(c.coupler.strain + (overload * 2.8 + severeExtension * 1.2 - (overload > 0 ? 0 : 0.32)) * dt, 0, 1);
    if (c.coupler.strain >= 1 || c.g.length > 110) {
      severCoupler(train, c.coupler.id, { reason: 'overload', simTime: train.simTime });
      // A failed link contributed this step's bounded strain impulse. Removing
      // that constraint adds no unphysical separation kick next step.
    }
  }
  const events = train.pendingEvents.splice(0, 24);
  return { impulses: [...totals.values()].filter(row => Math.abs(row.ix) + Math.abs(row.iz)
    + Math.abs(row.angularImpulse) > 1e-10), events, dt };
}

/**
 * Recovery tug applies a bounded external tow at a body's nose. The returned
 * commands require a reciprocal impulse on the actual escort in the runtime.
 * It is deliberately separate from rail coupling and never recouples by snap.
 */
export function planRecoveryTow(train, bodyId, escort, dt) {
  const body = bodyById(train, bodyId);
  if (!body || body.lost || ![escort?.x, escort?.z, escort?.vx, escort?.vz].every(Number.isFinite)
    || !Number.isFinite(dt) || dt <= 0 || dt > TRAIN_LIMITS.maxStep + 1e-9) return null;
  const dx = escort.x - body.x, dz = escort.z - body.z, distance = Math.hypot(dx, dz);
  if (distance < 18 || distance > 85) return null;
  const nx = dx / distance, nz = dz / distance;
  const closing = (escort.vx - body.vx) * nx + (escort.vz - body.vz) * nz;
  const force = clamp((distance - 24) * 14 + closing * 30, 0, Math.min(900, body.mass * TRAIN_LIMITS.maxRecoveryAccel));
  const ix = nx * force * dt, iz = nz * force * dt;
  const rx = Math.cos(body.angle) * body.halfLength, rz = Math.sin(body.angle) * body.halfLength;
  return { bodyId, ix, iz, angularImpulse: rx * iz - rz * ix, reason: 'convoy_recovery',
    recoil: { ix: -ix, iz: -iz } };
}

/** Test/harness-only physical integration of the *model*, never a world entity. */
export function integrateTrainHeadless(train, dt, plan = null) {
  const result = plan || planTrainStep(train, dt, train.simTime + dt);
  for (const impulse of result.impulses) {
    const body = bodyById(train, impulse.bodyId);
    if (!body || body.lost) continue;
    body.vx += impulse.ix / body.mass; body.vz += impulse.iz / body.mass;
    body.omega += impulse.angularImpulse / body.inertia;
  }
  for (const body of train.bodies) if (!body.lost) {
    body.x += body.vx * dt; body.z += body.vz * dt;
    body.angle = wrap(body.angle + body.omega * dt);
  }
  return result;
}

/** Save only scalars/IDs. The route lookup table and pending effects are rebuilt. */
export function serializeTrain(train) {
  return { schemaVersion: 1, id: train.id, seed: train.seed, carriageCount: train.carriageCount,
    targetIndex: train.targetIndex, targetId: train.targetId, routeConfig: structuredClone(train.route.config),
    routeDistance: train.routeDistance, speed: train.speed, simTime: train.simTime,
    braceUntil: train.braceUntil, throttle: train.throttle,
    bodies: train.bodies.map(body => ({ ...body })),
    couplers: train.couplers.map(coupler => ({ ...coupler })) };
}

/** Fail closed on incompatible identity/topology; an absent body is a permanent loss. */
export function restoreTrain(data) {
  if (!data || data.schemaVersion !== 1 || !idString(data.id)
    || !Number.isInteger(data.seed) || !Number.isInteger(data.carriageCount)
    || data.carriageCount < 3 || data.carriageCount > 5
    || !Number.isInteger(data.targetIndex) || data.targetIndex < 1 || data.targetIndex > data.carriageCount - 2
    || !Array.isArray(data.bodies) || data.bodies.length > 6
    || !Array.isArray(data.couplers) || data.couplers.length > 5) return null;
  const config = data.routeConfig;
  if (!config || ![config.origin?.x, config.origin?.z, config.heading].every(Number.isFinite)
    || Math.abs(config.origin.x) > 1e7 || Math.abs(config.origin.z) > 1e7
    || (config.seed >>> 0) !== (data.seed >>> 0)) return null;
  const train = createTrain({ seed: data.seed, id: data.id, carriageCount: data.carriageCount,
    targetIndex: data.targetIndex, route: createConvoyRoute(config), routeDistance: data.routeDistance, speed: data.speed });
  if (data.targetId !== train.targetId) return null;
  train.simTime = Math.max(0, finite(data.simTime));
  train.routeDistance = clamp(finite(data.routeDistance), 0, train.route.length + 1000);
  train.braceUntil = clamp(finite(data.braceUntil), 0, train.simTime + TRAIN_LIMITS.maxBraceSeconds);
  train.throttle = clamp(finite(data.throttle, 1), 0, 1);
  for (const body of train.bodies) {
    const row = data.bodies.find(candidate => candidate?.id === body.id);
    if (!row || row.lost === true || !safeKinematics(row) || row.hp <= 0) {
      body.lost = true; body.hp = 0; continue;
    }
    for (const key of scalarFields) body[key] = row[key];
    // Numeric body authority may have supplied a measured asset mass/inertia.
    body.mass = clamp(finite(row.mass, body.mass), 0.01, 1e6);
    body.inertia = clamp(finite(row.inertia, body.inertia), 0.01, 1e10);
    body.hp = clamp(body.hp, 0, body.maxHp);
  }
  for (const coupler of train.couplers) {
    const row = data.couplers.find(candidate => candidate?.id === coupler.id);
    if (!row || row.aId !== coupler.aId || row.bId !== coupler.bId) {
      coupler.severed = true; coupler.reason = 'missing_saved_link'; continue;
    }
    coupler.severed = row.severed === true || bodyById(train, coupler.aId).lost || bodyById(train, coupler.bId).lost;
    coupler.integrity = clamp(finite(row.integrity), 0, 1);
    if (coupler.integrity === 0) coupler.severed = true;
    coupler.strain = clamp(finite(row.strain), 0, 1);
    coupler.tension = clamp(finite(row.tension), 0, 1);
    coupler.braceUntil = clamp(finite(row.braceUntil), 0, train.simTime + TRAIN_LIMITS.maxBraceSeconds);
    coupler.severedAt = Number.isFinite(row.severedAt) ? Math.max(0, row.severedAt) : null;
    coupler.reason = typeof row.reason === 'string' ? row.reason.slice(0, 48) : null;
  }
  train.pendingEvents.length = 0;
  return train;
}
