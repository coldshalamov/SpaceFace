// Match integrator for isolated Kinetic League prototypes.
//
// Same semi-implicit Euler the field kernel documents (Δv = a·dt, then Δx = v·dt).
// Contact impulses are exchanged along the contact normal. This is not a world
// physics backend and does not replace Rapier. The player hull never receives
// contact impulse (no involuntary knockback). Magnetic sports sample
// sampleFieldAcceleration from the live field kernel.

import { normalizeField, sampleFieldAcceleration } from '../../core/fields/fieldKernel.js';
import { clamp, finiteXZ, speedOf } from './geometry.js';

const _fieldOut = { ax: 0, az: 0 };

export function makeBody(spec) {
  return {
    id: spec.id,
    role: spec.role,
    x: spec.x,
    z: spec.z,
    vx: spec.vx || 0,
    vz: spec.vz || 0,
    radius: spec.radius,
    mass: spec.mass,
    restitution: spec.restitution ?? 0.4,
    drag: spec.drag || 0,
    dynamic: spec.dynamic !== false,
    knockback: spec.knockback !== false,
    maxSpeed: spec.maxSpeed ?? 160,
    maxAccel: spec.maxAccel ?? 0,
    alive: spec.alive !== false,
    fieldType: spec.fieldType || null,
    fieldResponseMult: spec.fieldResponseMult ?? 1,
  };
}

export function makeCircle(spec) {
  return {
    kind: 'circle',
    id: spec.id,
    tag: spec.tag || 'post',
    x: spec.x,
    z: spec.z,
    radius: spec.radius,
    restitution: spec.restitution ?? 0.55,
    railId: spec.railId || null,
  };
}

export function makeSegment(spec) {
  return {
    kind: 'segment',
    id: spec.id,
    tag: spec.tag || 'rail',
    x1: spec.x1,
    z1: spec.z1,
    x2: spec.x2,
    z2: spec.z2,
    restitution: spec.restitution ?? 0.9,
    railId: spec.railId,
  };
}

function capSpeed(body) {
  const s = speedOf(body);
  if (s > body.maxSpeed && s > 0) {
    const k = body.maxSpeed / s;
    body.vx *= k;
    body.vz *= k;
  }
}

function applyDrag(body, dt) {
  if (!(body.drag > 0)) return;
  const s = speedOf(body);
  if (s <= 1e-8) {
    body.vx = 0;
    body.vz = 0;
    return;
  }
  const drop = Math.min(s, body.drag * dt);
  const k = (s - drop) / s;
  body.vx *= k;
  body.vz *= k;
  if (speedOf(body) < 0.05) {
    body.vx = 0;
    body.vz = 0;
  }
}

/**
 * @param {object} session
 * @param {{thrustX?:number,thrustZ?:number,tether?:boolean,cut?:boolean}} command
 * @param {number} dt
 * @param {Array<object>} contacts filled with contact records
 */
export function integrateMatch(session, command, dt, contacts) {
  const cmd = command || {};
  const ship = session.bodies.find((b) => b.role === 'ship' && b.alive);
  if (ship) {
    const tx = clamp(Number.isFinite(cmd.thrustX) ? cmd.thrustX : 0, -1, 1);
    const tz = clamp(Number.isFinite(cmd.thrustZ) ? cmd.thrustZ : 0, -1, 1);
    ship.vx += tx * ship.maxAccel * dt;
    ship.vz += tz * ship.maxAccel * dt;
    capSpeed(ship);
  }
  applyTether(session, cmd, dt, contacts);
  for (const body of session.bodies) {
    if (!body.alive || !body.dynamic) continue;
    if (body.role === 'keeper' || body.role === 'charge') {
      const force = session.rivalForce ? session.rivalForce(body, session) : null;
      if (force && Number.isFinite(force.fx) && Number.isFinite(force.fz)) {
        body.vx += (force.fx / body.mass) * dt;
        body.vz += (force.fz / body.mass) * dt;
      }
    }
    if (body.fieldType && session.fields && session.fields.length) {
      const profile = {
        mass: body.mass,
        type: body.fieldType,
        dynamic: true,
        id: body.id,
        fieldResponseMult: body.fieldResponseMult,
      };
      sampleFieldAcceleration(
        { x: body.x, z: body.z },
        { x: body.vx, z: body.vz },
        session.fields,
        session.simTime,
        profile,
        _fieldOut,
      );
      body.vx += _fieldOut.ax * dt;
      body.vz += _fieldOut.az * dt;
    }
    applyDrag(body, dt);
    capSpeed(body);
    body.x += body.vx * dt;
    body.z += body.vz * dt;
  }
  resolveContacts(session, contacts);
}

function applyTether(session, cmd, dt, contacts) {
  const ship = session.bodies.find((b) => b.role === 'ship' && b.alive);
  const payload = (session.tetherFocus
    ? session.bodies.find((b) => b.id === session.tetherFocus && b.alive)
    : null)
    || session.bodies.find((b) => (b.role === 'payload' || b.role === 'ball') && b.alive);
  if (!ship || !payload) return;
  const dx = payload.x - ship.x;
  const dz = payload.z - ship.z;
  const dist = Math.hypot(dx, dz);
  const reach = session.tetherReach ?? 18;
  if (cmd.tether && !session.tether && dist <= reach && dist > 0.01) {
    session.tether = { targetId: payload.id, rest: 11, attachAt: session.simTime };
    session.lastAttachAt = session.simTime;
    session.lastTouch = 'player';
    session.touchAt = session.simTime;
    session.playerTouched = true;
    contacts.push({ kind: 'tether-attach', a: ship.id, b: payload.id });
  }
  if (!session.tether || session.tether.targetId !== payload.id) return;
  if (cmd.cut) {
    const stretch = dist - session.tether.rest;
    const nx = dist > 0.01 ? dx / dist : 0;
    const nz = dist > 0.01 ? dz / dist : 1;
    // Elastic snap: stored stretch is returned toward the ship, then the line is gone.
    const impulse = clamp(stretch, 0, 24) * 7.5;
    if (impulse > 0) {
      payload.vx -= nx * impulse;
      payload.vz -= nz * impulse;
      capSpeed(payload);
    }
    contacts.push({
      kind: 'tether-cut',
      a: ship.id,
      b: payload.id,
      stretch,
      impulse,
      x: payload.x,
      z: payload.z,
    });
    session.tether = null;
    session.lastTouch = 'player';
    session.touchAt = session.simTime;
    return;
  }
  const stretch = dist - session.tether.rest;
  if (stretch > 0 && dist > 0.01) {
    const nx = dx / dist;
    const nz = dz / dist;
    const accel = Math.min(220, stretch * 14);
    // Winch pulls the payload only. The player hull is not yanked.
    payload.vx -= nx * accel * dt;
    payload.vz -= nz * accel * dt;
    capSpeed(payload);
    session.lastTouch = 'player';
    session.touchAt = session.simTime;
  }
}

function resolveContacts(session, contacts) {
  const dynamics = session.bodies.filter((b) => b.alive && b.dynamic);
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < dynamics.length; i++) {
      for (let j = i + 1; j < dynamics.length; j++) {
        collideDynamic(dynamics[i], dynamics[j], contacts, session);
      }
      for (const solid of session.solids) {
        if (solid.kind === 'circle') collideCircle(dynamics[i], solid, contacts, session);
        else if (solid.kind === 'segment') collideSegment(dynamics[i], solid, contacts, session);
      }
    }
  }
}

function collideDynamic(a, b, contacts, session) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let dist = Math.hypot(dx, dz);
  const min = a.radius + b.radius;
  if (dist >= min) return;
  if (dist < 1e-8) {
    dist = 1e-8;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  separate(a, b, nx, nz, min - dist);
  const rvx = b.vx - a.vx;
  const rvz = b.vz - a.vz;
  const velN = rvx * nx + rvz * nz;
  if (velN >= 0) return;
  const e = Math.min(a.restitution, b.restitution);
  const invA = a.knockback ? 1 / a.mass : 0;
  const invB = b.knockback ? 1 / b.mass : 0;
  const inv = invA + invB;
  if (inv <= 0) return;
  const j = -(1 + e) * velN / inv;
  if (invA > 0) {
    a.vx -= j * nx * invA;
    a.vz -= j * nz * invA;
    capSpeed(a);
  }
  if (invB > 0) {
    b.vx += j * nx * invB;
    b.vz += j * nz * invB;
    capSpeed(b);
  }
  noteTouch(session, a, b);
  contacts.push({ kind: 'body', a: a.id, b: b.id, tagA: a.role, tagB: b.role });
}

function separate(a, b, nx, nz, pen) {
  const invA = a.knockback && a.dynamic ? 1 / a.mass : 0;
  const invB = b.knockback && b.dynamic ? 1 / b.mass : 0;
  const inv = invA + invB;
  if (inv <= 0) {
    // Kinematic ship: move only the other body.
    if (!a.knockback && b.knockback) {
      b.x += nx * pen;
      b.z += nz * pen;
    } else if (!b.knockback && a.knockback) {
      a.x -= nx * pen;
      a.z -= nz * pen;
    }
    return;
  }
  if (invA > 0) {
    a.x -= nx * (pen * invA / inv);
    a.z -= nz * (pen * invA / inv);
  }
  if (invB > 0) {
    b.x += nx * (pen * invB / inv);
    b.z += nz * (pen * invB / inv);
  }
}

function noteTouch(session, a, b) {
  const roles = new Set([a.role, b.role]);
  if (roles.has('ship') && (roles.has('ball') || roles.has('payload') || roles.has('stone') || roles.has('puck'))) {
    session.lastTouch = 'player';
    session.touchAt = session.simTime;
    session.playerTouched = true;
  } else if (roles.has('keeper') && roles.has('ball')) {
    session.lastTouch = 'keeper';
    if (session.simTime - (session.keeperTouchAt ?? -1) > 0.2) {
      session.keeperTouches = (session.keeperTouches || 0) + 1;
      session.keeperTouchAt = session.simTime;
    }
  } else if (roles.has('charge') && (roles.has('payload') || roles.has('ball'))) {
    session.stolen = true;
    session.legalTransfers = 0;
    session.lastTouch = 'charge';
  }
}

function collideCircle(body, solid, contacts, session) {
  if (!body.knockback) return;
  const dx = body.x - solid.x;
  const dz = body.z - solid.z;
  let dist = Math.hypot(dx, dz);
  const min = body.radius + solid.radius;
  if (dist >= min) return;
  if (dist < 1e-8) dist = 1e-8;
  const nx = dx / dist;
  const nz = dz / dist;
  const pen = min - dist;
  body.x += nx * pen;
  body.z += nz * pen;
  const velN = body.vx * nx + body.vz * nz;
  if (velN < 0) {
    const e = Math.min(body.restitution, solid.restitution);
    const j = -(1 + e) * velN;
    body.vx += j * nx;
    body.vz += j * nz;
    capSpeed(body);
  }
  if (solid.tag === 'post' && session.simTime - (session.postAt ?? -1) > 0.15) {
    session.postHits = (session.postHits || 0) + 1;
    session.postAt = session.simTime;
  }
  if (solid.tag === 'bumper' && session.simTime - (session.bumperAt ?? -1) > 0.15) {
    session.bumperHits = (session.bumperHits || 0) + 1;
    session.bumperAt = session.simTime;
  }
  if (solid.tag === 'guard' && session.simTime - (session.guardAt ?? -1) > 0.15) {
    session.guardHits = (session.guardHits || 0) + 1;
    session.guardAt = session.simTime;
  }
  if (solid.railId) noteRail(session, solid.railId);
  contacts.push({ kind: solid.tag, a: body.id, b: solid.id, railId: solid.railId || null });
}

function collideSegment(body, solid, contacts, session) {
  if (!body.knockback) return;
  const dx = solid.x2 - solid.x1;
  const dz = solid.z2 - solid.z1;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((body.x - solid.x1) * dx + (body.z - solid.z1) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = solid.x1 + dx * t;
  const cz = solid.z1 + dz * t;
  let ox = body.x - cx;
  let oz = body.z - cz;
  let dist = Math.hypot(ox, oz);
  if (dist >= body.radius) return;
  if (dist < 1e-6) {
    const len = Math.hypot(dx, dz) || 1;
    ox = -dz / len;
    oz = dx / len;
    dist = 1e-6;
  }
  const nx = ox / dist;
  const nz = oz / dist;
  body.x += nx * (body.radius - dist);
  body.z += nz * (body.radius - dist);
  const velN = body.vx * nx + body.vz * nz;
  if (velN < 0) {
    const e = Math.min(body.restitution, solid.restitution);
    const j = -(1 + e) * velN;
    body.vx += j * nx;
    body.vz += j * nz;
    capSpeed(body);
  }
  if (solid.railId) noteRail(session, solid.railId);
  contacts.push({ kind: 'rail', a: body.id, b: solid.id, railId: solid.railId });
}

function noteRail(session, railId) {
  const now = session.simTime;
  const prev = session.railAt && session.railAt[railId];
  if (prev != null && now - prev < 0.2) return;
  if (!session.railAt) session.railAt = {};
  session.railAt[railId] = now;
  if (!session.railsHit) session.railsHit = [];
  if (!session.railsHit.includes(railId)) session.railsHit.push(railId);
  session.bankContacts = (session.bankContacts || 0) + 1;
}

export function buildFields(specs) {
  if (!specs || !specs.length) return [];
  return specs.map((spec) => normalizeField(spec));
}

export function snapshotBody(body) {
  return {
    id: body.id,
    role: body.role,
    x: body.x,
    z: body.z,
    vx: body.vx,
    vz: body.vz,
    alive: body.alive,
  };
}

export function bodyByRole(session, role) {
  return session.bodies.find((b) => b.role === role && b.alive) || null;
}

export function assertFiniteSession(session) {
  for (const body of session.bodies) {
    if (!finiteXZ(body) || !Number.isFinite(body.vx) || !Number.isFinite(body.vz)) return false;
  }
  return true;
}
