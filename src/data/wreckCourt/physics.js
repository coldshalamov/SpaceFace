// Wreck Court incident integrator.
//
// Fixed-step Newtonian motion on the XZ plane. No Three.js, no Math.random, no wall clock.
// Incidents are authored as initial bodies plus timed events; present-day debris is whatever
// this stepper produces. Y is up and unused. Heading 0 points +X, positive toward +Z.

import { hash32, mulberry32 } from '../../core/rng.js';
import { SIM_DT } from '../../core/sim.js';

// One sim clock. Live court bodies are Rapier; this incident step uses the same dt.
export const DT = SIM_DT;
export const AMBIENT_K = 40;
export const SHED_K = 900;
export const COOL_TAU_S = 80;

const GRAV_SOFT_FLOOR = 50;

export function jitterSource(seed, caseId) {
  const rng = mulberry32(hash32(seed >>> 0, caseId, 'wreck-court-layout') >>> 0);
  return (salt, amp = 6) => {
    // One draw per call. Salt is mixed by calling order, which the case fixes.
    void salt;
    return (rng() - 0.5) * 2 * amp;
  };
}

export function makeBody(spec) {
  return {
    id: spec.id,
    variant: spec.variant,
    mass: spec.mass,
    radius: spec.radius,
    x: spec.x,
    z: spec.z,
    vx: spec.vx || 0,
    vz: spec.vz || 0,
    heading: spec.heading || 0,
    omega: spec.omega || 0,
    fixed: !!spec.fixed,
    bornAt: spec.bornAt || 0,
    shedTemp: spec.shedTemp == null ? SHED_K : spec.shedTemp,
    thermalLock: spec.thermalLock == null ? null : spec.thermalLock,
    temperature: spec.temperature == null ? SHED_K : spec.temperature,
    integrity: spec.integrity == null ? 1 : spec.integrity,
    volatile: !!spec.volatile,
    fragile: !!spec.fragile,
    crushable: !!spec.crushable,
    occultedBy: spec.occultedBy || null,
    occults: !!spec.occults,
    cargo: spec.cargo ? { ...spec.cargo } : null,
    scar: spec.scar ? { ...spec.scar, faces: (spec.scar.faces || []).map((f) => ({ ...f })) } : null,
    magazine: spec.magazine ? { ...spec.magazine } : null,
    fuel: spec.fuel == null ? null : spec.fuel,
    fuelCapacity: spec.fuelCapacity == null ? null : spec.fuelCapacity,
    turrets: !!spec.turrets,
    transponderGroup: spec.transponderGroup || null,
    transponderHostile: !!spec.transponderHostile,
    mu: spec.mu || 0,
    departBeyond: spec.departBeyond || 0,
    noCollide: !!spec.noCollide,
    flavor: spec.flavor || '',
    destroyed: false,
    departed: false,
    historySpoiled: false,
    trajectoryLocked: false,
    thrust: null,
    role: spec.role || spec.variant,
  };
}

export function ageFromTemperature(temperature) {
  if (!Number.isFinite(temperature)) return null;
  const span = SHED_K - AMBIENT_K;
  const x = (temperature - AMBIENT_K) / span;
  if (x <= 0.03 || x > 1.001) return null;
  const clamped = Math.min(1, x);
  return -COOL_TAU_S * Math.log(clamped);
}

export function temperatureFromAge(age, shedTemp = SHED_K) {
  if (!Number.isFinite(age) || age < 0) return shedTemp;
  return AMBIENT_K + (shedTemp - AMBIENT_K) * Math.exp(-age / COOL_TAU_S);
}

function gravityAccel(body, attractors) {
  let ax = 0;
  let az = 0;
  for (const g of attractors) {
    if (g.id === body.id || g.departed || g.destroyed) continue;
    if (!g.mu) continue;
    const dx = g.x - body.x;
    const dz = g.z - body.z;
    const r = Math.hypot(dx, dz);
    const soft = Math.max(r, g.radius || 0, GRAV_SOFT_FLOOR);
    const inv = g.mu / (soft * soft * soft);
    ax += dx * inv;
    az += dz * inv;
  }
  return { ax, az };
}

function applyThrust(body, dt) {
  if (!body.thrust || body.destroyed || body.departed) return { ax: 0, az: 0 };
  const phase = body.thrust;
  if (phase.remaining <= 0) {
    body.thrust = null;
    return { ax: 0, az: 0 };
  }
  const h = Math.min(dt, phase.remaining);
  phase.remaining -= h;
  const scale = dt > 0 ? h / dt : 0;
  if (phase.mode === 'heading') {
    body.heading += (phase.spin || 0) * h;
    const ax = Math.cos(body.heading) * phase.accel * scale;
    const az = Math.sin(body.heading) * phase.accel * scale;
    if (body.fuel != null && body.fuel > 0) body.fuel = Math.max(0, body.fuel - h);
    if (phase.remaining <= 0) body.thrust = null;
    return { ax, az };
  }
  if (phase.remaining <= 0) body.thrust = null;
  return { ax: phase.ax * scale, az: phase.az * scale };
}

function tetherForces(body, bodies, tethers) {
  let ax = 0;
  let az = 0;
  for (const tether of tethers) {
    if (tether.broken) continue;
    if (tether.a !== body.id && tether.b !== body.id) continue;
    const otherId = tether.a === body.id ? tether.b : tether.a;
    const other = bodies.find((b) => b.id === otherId);
    if (!other || other.destroyed || other.departed) {
      tether.broken = true;
      continue;
    }
    const dx = other.x - body.x;
    const dz = other.z - body.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    const stretch = dist - tether.rest;
    const force = tether.stiffness * stretch;
    if (Math.abs(force) > tether.breakForce) {
      tether.broken = true;
      if (!tether.brokeAt) {
        tether.brokeAt = { x: (body.x + other.x) / 2, z: (body.z + other.z) / 2 };
        // dx points from this end toward the other. The torn face looks that way.
        if (tether.shearOnBreak) {
          tether.shearFrom = body.id;
          tether.shearNx = dx / dist;
          tether.shearNz = dz / dist;
        }
      }
      continue;
    }
    // Pull toward the other when stretched (stretch > 0). dx points at the other.
    const fx = (force * dx) / dist;
    const fz = (force * dz) / dist;
    if (!body.fixed) {
      ax += fx / body.mass;
      az += fz / body.mass;
    }
  }
  return { ax, az };
}

function resolveCircles(bodies) {
  const ordered = bodies.filter((b) => !b.destroyed && !b.departed);
  for (let iter = 0; iter < 3; iter += 1) {
    for (let i = 0; i < ordered.length; i += 1) {
      for (let k = i + 1; k < ordered.length; k += 1) {
        const a = ordered[i];
        const b = ordered[k];
        if (a.noCollide || b.noCollide) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        let dist = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (dist >= min || dist < 1e-8) {
          if (dist < 1e-8 && min > 0) {
            // Deterministic shove so a perfect overlap still has a normal.
            dist = 1e-4;
          } else continue;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        const pen = min - dist;
        const invA = a.fixed ? 0 : 1 / a.mass;
        const invB = b.fixed ? 0 : 1 / b.mass;
        const inv = invA + invB;
        if (inv <= 0) continue;
        if (!a.fixed) {
          a.x -= nx * pen * (invA / inv);
          a.z -= nz * pen * (invA / inv);
        }
        if (!b.fixed) {
          b.x += nx * pen * (invB / inv);
          b.z += nz * pen * (invB / inv);
        }
        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const vn = rvx * nx + rvz * nz;
        if (vn >= 0) continue;
        const e = 0.15;
        const j = -(1 + e) * vn / inv;
        if (!a.fixed) {
          a.vx -= (j * invA) * nx;
          a.vz -= (j * invA) * nz;
        }
        if (!b.fixed) {
          b.vx += (j * invB) * nx;
          b.vz += (j * invB) * nz;
        }
        a._hit = (a._hit || 0) + 1;
        b._hit = (b._hit || 0) + 1;
      }
    }
  }
}

function spawnChild(parent, spec, t) {
  const dvx = spec.dvx || 0;
  const dvz = spec.dvz || 0;
  const dv = Math.hypot(dvx, dvz);
  // Put pieces outside each other along their departure so the first contact
  // solve does not invent an impulse the incident never had.
  const sep = dv > 0.05 ? (spec.radius || 4) * 3 : 0;
  const ox = spec.ox != null ? spec.ox : (dv > 0.05 ? (dvx / dv) * sep : 0);
  const oz = spec.oz != null ? spec.oz : (dv > 0.05 ? (dvz / dv) * sep : 0);
  const child = makeBody({
    ...spec,
    x: parent.x + ox,
    z: parent.z + oz,
    vx: parent.vx + dvx,
    vz: parent.vz + dvz,
    heading: spec.heading == null ? parent.heading : spec.heading,
    bornAt: t,
    temperature: SHED_K,
  });
  return child;
}

function fireEvent(event, bodies, tethers, log, t) {
  log.push({ t, kind: event.kind, id: event.id || event.from || null, note: event.note || '' });
  if (event.kind === 'impulse') {
    const body = bodies.find((b) => b.id === event.id);
    if (!body || body.fixed || body.destroyed) return;
    body.vx += event.jx / body.mass;
    body.vz += event.jz / body.mass;
    if (event.breach) body.integrity = 0;
    return;
  }
  if (event.kind === 'thrust') {
    const body = bodies.find((b) => b.id === event.id);
    if (!body || body.destroyed) return;
    body.thrust = { mode: 'world', ax: event.ax, az: event.az, remaining: event.duration };
    return;
  }
  if (event.kind === 'thrust_heading') {
    const body = bodies.find((b) => b.id === event.id);
    if (!body || body.destroyed) return;
    body.omega = event.spin || 0;
    body.thrust = {
      mode: 'heading',
      accel: event.accel,
      spin: event.spin || 0,
      remaining: event.duration,
    };
    return;
  }
  if (event.kind === 'split') {
    const parent = bodies.find((b) => b.id === event.id);
    if (!parent || parent.destroyed || parent.departed) return;
    parent.destroyed = true;
    parent.departed = true;
    for (const piece of event.children) bodies.push(spawnChild(parent, piece, t));
    if (event.radiant) scorchNearby(parent, bodies, event.radiant);
    return;
  }
  if (event.kind === 'eject' || event.kind === 'shed') {
    const parent = bodies.find((b) => b.id === event.from);
    if (!parent || parent.destroyed || parent.departed) return;
    const child = spawnChild(parent, event.child, t);
    if (event.kind === 'shed' && !child.noCollide && event.child.ox == null && event.child.oz == null) {
      // Vent scale leaves beside the hull with the parent's velocity, not inside it.
      const hx = Math.cos(parent.heading);
      const hz = Math.sin(parent.heading);
      const dist = parent.radius + child.radius + 1.5;
      child.x = parent.x - hx * dist;
      child.z = parent.z - hz * dist;
      child.vx = parent.vx;
      child.vz = parent.vz;
    }
    if (event.part) {
      const sp = Math.hypot(parent.vx, parent.vz) || 1;
      const nx = parent.vx / sp;
      const nz = parent.vz / sp;
      child.scar = { nx, nz, material: 'tensile_neck', faces: [{ kind: 'neck', nx, nz }] };
    }
    if (event.kind === 'eject' && parent.mass > child.mass) parent.mass -= child.mass;
    bodies.push(child);
    return;
  }
  if (event.kind === 'tether') {
    const a = bodies.find((b) => b.id === event.a);
    const b = bodies.find((b) => b.id === event.b);
    let rest = event.rest;
    if (rest === 'current' && a && b) rest = Math.hypot(a.x - b.x, a.z - b.z);
    tethers.push({
      a: event.a,
      b: event.b,
      rest,
      stiffness: event.stiffness,
      breakForce: event.breakForce,
      broken: false,
      brokeAt: null,
      partOnBreak: !!event.partOnBreak,
      shearOnBreak: !!event.shearOnBreak,
      shearFrom: null,
      shearNx: 0,
      shearNz: 0,
      sheared: false,
      spawned: false,
    });
    return;
  }
  if (event.kind === 'untether') {
    for (const tether of tethers) {
      if (tether.broken) continue;
      if ((tether.a === event.a && tether.b === event.b) || (tether.a === event.b && tether.b === event.a)) {
        tether.broken = true;
      }
    }
    return;
  }
  if (event.kind === 'patch') {
    const body = bodies.find((b) => b.id === event.id);
    if (!body) return;
    for (const [key, value] of Object.entries(event.fields || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) body[key] = { ...body[key], ...value };
      else body[key] = value;
    }
    return;
  }
  if (event.kind === 'fuel') {
    const body = bodies.find((b) => b.id === event.id);
    if (!body) return;
    body.fuel = event.remaining;
    return;
  }
  if (event.kind === 'depart') {
    const body = bodies.find((b) => b.id === event.id);
    if (body) body.departed = true;
    return;
  }
  if (event.kind === 'coat') {
    const body = bodies.find((b) => b.id === event.id);
    const other = bodies.find((b) => b.id === event.other);
    if (!body || !other) return;
    const dx = other.x - body.x;
    const dz = other.z - body.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    body.scar = { nx, nz, material: 'polymer_coat', faces: [{ kind: 'coat', nx, nz }] };
    if (event.integrity != null) body.integrity = event.integrity;
    return;
  }
  if (event.kind === 'reflect') {
    const body = bodies.find((b) => b.id === event.id);
    const plate = bodies.find((b) => b.id === event.plate);
    if (!body || body.destroyed) return;
    const nlen = Math.hypot(event.nx || 0, event.nz || 0) || 1;
    const nnx = (event.nx || 0) / nlen;
    const nnz = (event.nz || 0) / nlen;
    const dot = body.vx * nnx + body.vz * nnz;
    body.vx -= 2 * dot * nnx;
    body.vz -= 2 * dot * nnz;
    body.heading = Math.atan2(body.vz, body.vx);
    if (plate && !(plate.scar && (plate.scar.faces || []).some((f) => f.kind === 'plate'))) {
      plate.scar = { nx: nnx, nz: nnz, material: 'folded_ore', faces: [{ kind: 'plate', nx: nnx, nz: nnz }] };
      plate.integrity = Math.min(plate.integrity ?? 1, 0.9);
    }
  }
}

function scorchNearby(origin, bodies, range) {
  for (const other of bodies) {
    if (other.id === origin.id || other.destroyed || other.departed || other.fixed) continue;
    const dx = origin.x - other.x;
    const dz = origin.z - other.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || dist < 1) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    other.scar = { nx, nz, material: 'soot', faces: [{ kind: 'soot', nx, nz }] };
    other.integrity = Math.min(other.integrity ?? 1, 0.64);
  }
}

function partCables(bodies, tethers, t) {
  for (const tether of tethers) {
    if (!tether.broken || !tether.partOnBreak || tether.spawned || !tether.brokeAt) continue;
    tether.spawned = true;
    const a = bodies.find((b) => b.id === tether.a);
    const b = bodies.find((b) => b.id === tether.b);
    if (!a || !b) continue;
    const child = spawnChild(a, {
      id: 'cable_end',
      variant: 'wc_cable',
      mass: 6,
      radius: 5,
      dvx: 0,
      dvz: 0,
      integrity: 0.45,
      noCollide: true,
      flavor: 'The end that stayed at the break.',
    }, t);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    child.scar = { nx, nz, material: 'tensile_neck', faces: [{ kind: 'neck', nx, nz }] };
    child.x = tether.brokeAt.x;
    child.z = tether.brokeAt.z;
    child.vx = (a.vx + b.vx) / 2;
    child.vz = (a.vz + b.vz) / 2;
    bodies.push(child);
  }
}

function stampShear(body, nx, nz) {
  const faces = (body.scar?.faces || []).filter((f) => f.kind !== 'shear').map((f) => ({ ...f }));
  faces.push({ kind: 'shear', nx, nz });
  body.scar = { nx, nz, material: 'torn_alloy', faces };
}

// A clamp parts when the line force exceeds breakForce. The faces are the
// direction of that load, written here, not on the spawned bodies.
function shearClamps(bodies, tethers, log, t) {
  for (const tether of tethers) {
    if (!tether.shearOnBreak || !tether.broken || tether.sheared || !tether.brokeAt || tether.shearFrom == null) continue;
    const from = bodies.find((b) => b.id === tether.shearFrom);
    const toId = tether.a === tether.shearFrom ? tether.b : tether.a;
    const to = bodies.find((b) => b.id === toId);
    if (!from || !to) continue;
    tether.sheared = true;
    stampShear(from, tether.shearNx, tether.shearNz);
    stampShear(to, -tether.shearNx, -tether.shearNz);
    log.push({ t, kind: 'shear', id: from.id, note: 'clamp parted under load' });
  }
}

function cutGrooves(bodies, log, t) {
  for (const round of bodies) {
    if (round.variant !== 'wc_round' || round.destroyed || round.departed || round._grooved) continue;
    const px = round.x - round.vx * DT;
    const pz = round.z - round.vz * DT;
    for (const rock of bodies) {
      if (rock.variant !== 'wc_rock' || rock.destroyed || rock.departed) continue;
      if (!segmentBlocked(px, pz, round.x, round.z, rock)) continue;
      const sp = Math.hypot(round.vx, round.vz) || 1;
      const nx = -round.vx / sp;
      const nz = -round.vz / sp;
      const faces = (rock.scar?.faces || []).map((f) => ({ ...f }));
      if (!faces.some((f) => f.kind === 'groove')) faces.push({ kind: 'groove', nx, nz });
      rock.scar = {
        nx: rock.scar?.nx ?? nx,
        nz: rock.scar?.nz ?? nz,
        material: rock.scar?.material || 'stone',
        faces,
      };
      round._grooved = true;
      log.push({ t, kind: 'groove', id: rock.id, note: 'round cut the far face in flight' });
    }
  }
}

function sweepDepart(bodies) {
  for (const body of bodies) {
    if (body.destroyed || body.departed || !body.departBeyond) continue;
    if (Math.hypot(body.x, body.z) > body.departBeyond) {
      body.departed = true;
    }
  }
}

/**
 * Integrate an incident to `until` seconds.
 * Returns present bodies (departed ships omitted; destroyed parents omitted) and the event log.
 */
export function runIncident({ bodies, events = [], until, assayPoints = [], gravityIds = [] }) {
  const live = bodies.map((b) => ({ ...b, scar: b.scar ? { ...b.scar, faces: (b.scar.faces || []).map((f) => ({ ...f })) } : null, cargo: b.cargo ? { ...b.cargo } : null, magazine: b.magazine ? { ...b.magazine } : null }));
  const tethers = [];
  const log = [];
  const queue = events.map((event, index) => ({ ...event, index })).sort((a, b) => a.t - b.t || a.index - b.index);
  let cursor = 0;
  const steps = Math.round(until / DT);
  for (let step = 0; step < steps; step += 1) {
    const t = (step + 1) * DT;
    while (cursor < queue.length && queue[cursor].t <= t + 1e-9) {
      fireEvent(queue[cursor], live, tethers, log, queue[cursor].t);
      cursor += 1;
    }
    const attractors = live.filter((b) => b.mu && !b.destroyed && !b.departed);
    for (const body of live) {
      if (body.fixed || body.destroyed || body.departed) continue;
      const g = gravityAccel(body, attractors);
      const th = applyThrust(body, DT);
      const te = tetherForces(body, live, tethers);
      body.vx += (g.ax + th.ax + te.ax) * DT;
      body.vz += (g.az + th.az + te.az) * DT;
      body.x += body.vx * DT;
      body.z += body.vz * DT;
      if (!body.thrust || body.thrust.mode !== 'heading') body.heading += body.omega * DT;
    }
    resolveCircles(live);
    partCables(live, tethers, t);
    shearClamps(live, tethers, log, t);
    cutGrooves(live, log, t);
    sweepDepart(live);
  }
  for (const body of live) {
    if (body.thermalLock != null) body.temperature = body.thermalLock;
    else body.temperature = temperatureFromAge(Math.max(0, until - body.bornAt), body.shedTemp);
    body._presentTime = until;
  }
  const present = live.filter((b) => !b.departed && !b.destroyed);
  return {
    bodies: present,
    departed: live.filter((b) => b.departed && !b.destroyed),
    tethers,
    events: log,
    until,
    assayPoints,
    gravityIds,
  };
}

export function segmentBlocked(px, pz, bx, bz, rock) {
  const abx = bx - px;
  const abz = bz - pz;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-6) return false;
  const apx = rock.x - px;
  const apz = rock.z - pz;
  let u = (apx * abx + apz * abz) / ab2;
  u = Math.max(0, Math.min(1, u));
  const cx = px + abx * u;
  const cz = pz + abz * u;
  const dist = Math.hypot(cx - rock.x, cz - rock.z);
  return dist < rock.radius * 0.9 && u > 0.04 && u < 0.96;
}

export function bodyVisible(body, player, bodies) {
  if (!body || body.departed) return false;
  if (!body.occultedBy) return true;
  const rock = bodies.find((b) => b.id === body.occultedBy);
  if (!rock || rock.destroyed || rock.departed) return true;
  return !segmentBlocked(player.x, player.z, body.x, body.z, rock);
}

/** Momentum-balanced in-plane dvs. `rng` is optional jitter on angle, in radians via `spread`. */
export function balancedRadial(count, speed, mass, turn = 0) {
  const raw = [];
  for (let i = 0; i < count; i += 1) {
    const a = turn + (i / count) * Math.PI * 2;
    raw.push({ dvx: Math.cos(a) * speed, dvz: Math.sin(a) * speed, mass });
  }
  let mx = 0;
  let mz = 0;
  let m = 0;
  for (const p of raw) {
    mx += p.mass * p.dvx;
    mz += p.mass * p.dvz;
    m += p.mass;
  }
  const cx = mx / m;
  const cz = mz / m;
  return raw.map((p) => ({ ...p, dvx: p.dvx - cx, dvz: p.dvz - cz }));
}

export function integratePoint(state, seconds, gravity, dt = DT) {
  let x = state.x;
  let z = state.z;
  let vx = state.vx;
  let vz = state.vz;
  const steps = Math.max(1, Math.round(seconds / dt));
  const h = seconds / steps;
  for (let i = 0; i < steps; i += 1) {
    let ax = 0;
    let az = 0;
    if (gravity && gravity.mu) {
      const dx = gravity.x - x;
      const dz = gravity.z - z;
      const r = Math.hypot(dx, dz);
      const soft = Math.max(r, gravity.soft || GRAV_SOFT_FLOOR);
      const inv = gravity.mu / (soft * soft * soft);
      ax = dx * inv;
      az = dz * inv;
    }
    vx += ax * h;
    vz += az * h;
    x += vx * h;
    z += vz * h;
  }
  return { x, z, vx, vz };
}

export function backIntegratePoint(state, seconds, gravity, dt = DT) {
  let x = state.x;
  let z = state.z;
  let vx = state.vx;
  let vz = state.vz;
  const steps = Math.max(1, Math.round(seconds / dt));
  const h = seconds / steps;
  for (let i = 0; i < steps; i += 1) {
    x -= vx * h;
    z -= vz * h;
    let ax = 0;
    let az = 0;
    if (gravity && gravity.mu) {
      const dx = gravity.x - x;
      const dz = gravity.z - z;
      const r = Math.hypot(dx, dz);
      const soft = Math.max(r, gravity.soft || GRAV_SOFT_FLOOR);
      const inv = gravity.mu / (soft * soft * soft);
      ax = dx * inv;
      az = dz * inv;
    }
    vx -= ax * h;
    vz -= az * h;
  }
  return { x, z, vx, vz };
}
