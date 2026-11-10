// Rescue-prop integrator. Player velocity and position are never written by contact.
// Impulses land on mercy-owned bodies only. The step is one LOOP_FIXED_DT tick.

import {
  ATTACH_RANGE, CLAMP_FORCE, CLAMP_RANGE, CLAMP_REL_SPEED, LINE_DRAG, MAX_BODY_STEPS,
  PLAYER_ACCEL, PLAYER_DRAG, PLAYER_MAX_SPEED, REEL_SPEED, REST_MAX, REST_MIN,
  RIG_RANGE, STAB_RANGE, STAB_RATE, TETHER_DAMPING, TETHER_MAX_ACCEL, TETHER_MAX_TENSION,
  TETHER_SNAP_TANGENTIAL, TETHER_SNAP_TENSION, TETHER_STIFFNESS,
} from './constants.js';
import { accrue } from './gates.js';
import { deepestOverlap, refreshModel } from './models.js';

function hypot(x, z) {
  return Math.hypot(x, z);
}

function seeTool(inc, name) {
  if (!inc.toolsSeen.includes(name)) inc.toolsSeen.push(name);
}

export function integratePlayer(rt, cmd, dt) {
  const player = rt.player;
  player.prev.x = player.pos.x;
  player.prev.z = player.pos.z;
  if (!player.alive) return;
  player.vel.x += cmd.thrustX * PLAYER_ACCEL * dt;
  player.vel.z += cmd.thrustZ * PLAYER_ACCEL * dt;
  const drag = Math.exp(-PLAYER_DRAG * dt);
  player.vel.x *= drag;
  player.vel.z *= drag;
  const speed = hypot(player.vel.x, player.vel.z);
  if (speed > PLAYER_MAX_SPEED) {
    const scale = PLAYER_MAX_SPEED / speed;
    player.vel.x *= scale;
    player.vel.z *= scale;
  }
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
}

function bodyByLocal(rt, inc, localId) {
  if (!inc || !localId) return null;
  return rt.bodies[`${inc.uid}:${localId}`] || null;
}

function applyDrives(rt, inc, dt) {
  for (const body of inc.bodyList) {
    if (!body.alive) continue;
    if (body.pursue) {
      const target = bodyByLocal(rt, inc, body.pursue);
      if (target) {
        const dx = target.pos.x - body.pos.x;
        const dz = target.pos.z - body.pos.z;
        const dist = hypot(dx, dz) || 1;
        body.vel.x = (dx / dist) * body.speed;
        body.vel.z = (dz / dist) * body.speed;
      }
    } else if (body.driven && !body.driveHeld) {
      if (body.driveVel) {
        body.vel.x = body.driveVel.x;
        body.vel.z = body.driveVel.z;
      }
      if (body.angVelDrive != null) body.angVel = body.angVelDrive;
    }
    if (body.driveHeld) {
      body.angVel = 0;
      if (body.role === 'door' || body.driven) {
        body.vel.x = 0;
        body.vel.z = 0;
      }
    }
    if (!body.kinematic && body.alive) {
      const well = inc.well;
      if (well && well.alive !== false) {
        const dx = well.pos.x - body.pos.x;
        const dz = well.pos.z - body.pos.z;
        const dist = hypot(dx, dz);
        if (dist < well.field && dist > 0.5) {
          const accel = well.strength * (1 - dist / well.field);
          body.vel.x += (dx / dist) * accel * dt;
          body.vel.z += (dz / dist) * accel * dt;
        }
      }
    }
  }
}

function applyTether(rt, inc, cmd, dt) {
  const tether = rt.tether;
  inc.tensionNow = 0;
  if (!rt.player.alive) {
    tether.attached = false;
    return;
  }
  if (cmd.cut) {
    tether.attached = false;
    tether.targetId = null;
    return;
  }
  if (cmd.tether) {
    const next = bodyByLocal(rt, inc, cmd.tether.targetLocal);
    if (next && next.alive) {
      const dx = next.pos.x - rt.player.pos.x;
      const dz = next.pos.z - rt.player.pos.z;
      const dist = hypot(dx, dz);
      if (!tether.attached || tether.targetId !== next.id) {
        if (dist <= ATTACH_RANGE) {
          tether.attached = true;
          tether.targetId = next.id;
          tether.rest = Math.max(REST_MIN, Math.min(REST_MAX, dist));
          tether.snapped = false;
          seeTool(inc, 'tether');
        }
      }
      tether.reel = cmd.tether.reel;
    }
  }
  if (!tether.attached) return;
  const target = rt.bodies[tether.targetId];
  if (!target || !target.alive || target.kinematic) {
    tether.attached = false;
    return;
  }
  const dx = target.pos.x - rt.player.pos.x;
  const dz = target.pos.z - rt.player.pos.z;
  const dist = hypot(dx, dz) || 1e-6;
  const nx = dx / dist;
  const nz = dz / dist;
  tether.rest = Math.max(REST_MIN, Math.min(REST_MAX, tether.rest + tether.reel * REEL_SPEED * dt));
  const stretch = dist - tether.rest;
  const rel = (target.vel.x - rt.player.vel.x) * nx + (target.vel.z - rt.player.vel.z) * nz;
  let tension = 0;
  if (stretch > 0) tension += TETHER_STIFFNESS * stretch;
  if (rel > 0) tension += TETHER_DAMPING * rel;
  tension = Math.max(0, tension);
  const tangential = Math.abs(target.angVel) * (target.toolR || target.radius || 1);
  if ((tangential > TETHER_SNAP_TANGENTIAL && tension > TETHER_SNAP_TENSION) || tension > TETHER_MAX_TENSION) {
    tether.attached = false;
    tether.snapped = true;
    tether.targetId = null;
    inc.snapCount += 1;
    inc.tensionNow = tension;
    return;
  }
  const maxForce = TETHER_MAX_ACCEL * target.mass;
  const applied = Math.min(tension, maxForce);
  const speed0 = hypot(target.vel.x, target.vel.z);
  target.vel.x += -nx * (applied / target.mass) * dt;
  target.vel.z += -nz * (applied / target.mass) * dt;
  const drag = Math.exp(-LINE_DRAG * dt);
  target.vel.x *= drag;
  target.vel.z *= drag;
  const speed1 = hypot(target.vel.x, target.vel.z);
  inc.arrest += applied * dt + target.mass * Math.max(0, speed0 - speed1);
  inc.peakTension = Math.max(inc.peakTension, applied);
  inc.tensionNow = applied;
}

function applyTools(rt, inc, cmd, dt) {
  if (!rt.player.alive) return;
  for (const body of inc.bodyList) {
    if (!body.alive) continue;
    const dx = body.pos.x - rt.player.pos.x;
    const dz = body.pos.z - rt.player.pos.z;
    const dist = hypot(dx, dz);
    if (body.clampAttached && cmd.clampTarget && cmd.clampTarget !== body.localId && !body.driveHeld) {
      body.clampAttached = false;
    }
    if (cmd.clamp && cmd.clampTarget === body.localId) {
      const rel = hypot(body.vel.x - rt.player.vel.x, body.vel.z - rt.player.vel.z);
      const canSeat = dist <= CLAMP_RANGE && (body.kinematic || rel <= CLAMP_REL_SPEED);
      if (!body.clampAttached && canSeat) {
        body.clampAttached = true;
        seeTool(inc, 'clamp');
        if (body.driven || body.role === 'door' || body.role === 'gantry') {
          body.driveHeld = true;
          inc.arrest += 30;
        }
      }
      if (body.clampAttached && !body.kinematic) {
        const maxA = CLAMP_FORCE / Math.max(body.mass, 1);
        const ax = Math.max(-maxA, Math.min(maxA, (rt.player.vel.x - body.vel.x) * 3.2));
        const az = Math.max(-maxA, Math.min(maxA, (rt.player.vel.z - body.vel.z) * 3.2));
        const speed0 = hypot(body.vel.x, body.vel.z);
        body.vel.x += ax * dt;
        body.vel.z += az * dt;
        const slot = 9;
        const pdx = rt.player.pos.x - body.pos.x;
        const pdz = rt.player.pos.z - body.pos.z;
        const pd = hypot(pdx, pdz) || 1;
        if (pd > slot) {
          const pull = Math.min(maxA, (pd - slot) * 1.4);
          body.vel.x += (pdx / pd) * pull * dt;
          body.vel.z += (pdz / pd) * pull * dt;
        }
        const speed1 = hypot(body.vel.x, body.vel.z);
        inc.arrest += body.mass * Math.abs(speed0 - speed1) + 10 * dt;
      }
      if (body.clampAttached && dist > CLAMP_RANGE + 10 && !body.driveHeld) body.clampAttached = false;
    }
    if (cmd.stabilizer && cmd.stabilizerTarget === body.localId && dist <= STAB_RANGE && !body.kinematic) {
      const before = Math.abs(body.angVel);
      body.angVel *= Math.exp(-STAB_RATE * dt);
      inc.stabWork += body.mass * (before - Math.abs(body.angVel));
      seeTool(inc, 'stabilizer');
    }
    if (cmd.containment && cmd.containmentTarget === body.localId && body.volatile && dist <= RIG_RANGE) {
      if (!body.rigAttached) seeTool(inc, 'containment');
      body.rigAttached = true;
    }
    if (body.volatile && !body.rigAttached) body.spread += (body.ventPerS || 0) * dt;
  }
}

function integrateBodies(rt, dt) {
  const ids = Object.keys(rt.bodies).sort();
  let stepped = 0;
  for (let i = 0; i < ids.length; i++) {
    const body = rt.bodies[ids[i]];
    if (!body || !body.alive) continue;
    if (stepped >= MAX_BODY_STEPS) {
      rt.stats.deferredBodies += 1;
      continue;
    }
    stepped += 1;
    rt.stats.bodySteps += 1;
    body.prev.x = body.pos.x;
    body.prev.z = body.pos.z;
    if (body.kinematic) {
      body.pos.x += body.vel.x * dt;
      body.pos.z += body.vel.z * dt;
      body.rot = (body.rot || 0) + (body.angVel || 0) * dt;
      continue;
    }
    body.pos.x += body.vel.x * dt;
    body.pos.z += body.vel.z * dt;
    body.rot = (body.rot || 0) + (body.angVel || 0) * dt;
  }
  rt.stats.lastBodies = stepped;
  rt.stats.maxBodiesThisTick = Math.max(rt.stats.maxBodiesThisTick || 0, stepped);
}

function separatePair(a, b) {
  const hit = deepestOverlap(a, b);
  if (!hit) return false;
  const aDyn = !a.kinematic && a.alive;
  const bDyn = !b.kinematic && b.alive;
  if (aDyn && bDyn) {
    const share = a.mass / (a.mass + b.mass || 1);
    a.pos.x -= hit.nx * hit.pen * (1 - share);
    a.pos.z -= hit.nz * hit.pen * (1 - share);
    b.pos.x += hit.nx * hit.pen * share;
    b.pos.z += hit.nz * hit.pen * share;
  } else if (aDyn) {
    a.pos.x -= hit.nx * hit.pen;
    a.pos.z -= hit.nz * hit.pen;
    const vn = a.vel.x * hit.nx + a.vel.z * hit.nz;
    if (vn > 0) {
      a.vel.x -= vn * hit.nx;
      a.vel.z -= vn * hit.nz;
    }
  } else if (bDyn) {
    b.pos.x += hit.nx * hit.pen;
    b.pos.z += hit.nz * hit.pen;
    const vn = b.vel.x * hit.nx + b.vel.z * hit.nz;
    if (vn < 0) {
      b.vel.x -= vn * hit.nx;
      b.vel.z -= vn * hit.nz;
    }
  }
  return true;
}

function hurt(body, amount, by) {
  if (!body || !(amount > 0) || !body.alive) return;
  if (body.role === 'berth' || body.role === 'barge' || body.role === 'well') return;
  body.hull -= amount;
  if (body.hull <= 0) {
    body.hull = 0;
    body.alive = false;
    body.killedBy = by;
  }
  refreshModel(body);
}

function collideBodies(rt, dt) {
  const ids = Object.keys(rt.bodies).sort();
  const live = [];
  for (let i = 0; i < ids.length; i++) {
    const body = rt.bodies[ids[i]];
    if (body && body.alive && body.modelState !== 'destroyed') live.push(body);
  }
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.kinematic && b.kinematic) continue;
      const overlap = deepestOverlap(a, b);
      if (!overlap) continue;
      const lethal = (a.damagePerS || 0) > 0 || (b.damagePerS || 0) > 0;
      if (!lethal) separatePair(a, b);
      else {
        // Machinery keeps the bite. Cancel closing speed and deal the authored damage.
        const dyn = !a.kinematic ? a : b;
        const sign = dyn === b ? 1 : -1;
        const vn = dyn.vel.x * overlap.nx * sign + dyn.vel.z * overlap.nz * sign;
        if (vn < 0) {
          dyn.vel.x -= vn * overlap.nx * sign;
          dyn.vel.z -= vn * overlap.nz * sign;
        }
      }
      if (a.damagePerS) hurt(b, a.damagePerS * dt, a.localId);
      if (b.damagePerS) hurt(a, b.damagePerS * dt, b.localId);
    }
    const body = live[i];
    if (body.kinematic) continue;
    const hitPlayer = circleHit(rt.player.pos, rt.player.radius, body);
    if (hitPlayer) {
      // Depenetrate the rescue body only. Player hull is not written.
      const dx = body.pos.x - rt.player.pos.x;
      const dz = body.pos.z - rt.player.pos.z;
      const dist = hypot(dx, dz) || 1e-6;
      const nx = dx / dist;
      const nz = dz / dist;
      const pen = rt.player.radius + (body.toolR || body.radius) - dist;
      if (pen > 0) {
        body.pos.x += nx * pen;
        body.pos.z += nz * pen;
        const vn = (body.vel.x - rt.player.vel.x) * nx + (body.vel.z - rt.player.vel.z) * nz;
        if (vn < 0) {
          body.vel.x -= vn * nx;
          body.vel.z -= vn * nz;
        }
      }
    }
  }
}

function circleHit(pos, radius, body) {
  const dx = body.pos.x - pos.x;
  const dz = body.pos.z - pos.z;
  const reach = radius + (body.toolR || body.radius || 0);
  return dx * dx + dz * dz < reach * reach;
}

function recoveryZone(inc, body) {
  const named = inc.def.orders[inc.intentOrder] || inc.def.orders[inc.def.defaultOrder];
  if (!named) return null;
  const zone = inc.bodyList.find((row) => row.localId === named.dest && row.recoveryRadius);
  if (!zone) return null;
  const dx = body.pos.x - zone.pos.x;
  const dz = body.pos.z - zone.pos.z;
  if (dx * dx + dz * dz <= zone.recoveryRadius * zone.recoveryRadius) return zone;
  return null;
}

function orderForDelivery(inc, subjectLocal, destLocal) {
  const named = inc.def.orders[inc.intentOrder];
  if (named && named.subject === subjectLocal && named.dest === destLocal) return inc.intentOrder;
  const names = Object.keys(inc.def.orders);
  for (let i = 0; i < names.length; i++) {
    const order = inc.def.orders[names[i]];
    if (order.subject === subjectLocal && order.dest === destLocal) return names[i];
  }
  return null;
}

function trackDelivery(inc, dt) {
  if (!inc.latches.secured || !inc.securedId) return;
  const body = inc.bodyList.find((row) => row.id === inc.securedId);
  if (!body || !body.alive) return;
  const zone = recoveryZone(inc, body);
  const stepDist = hypot(body.pos.x - body.prev.x, body.pos.z - body.prev.z);
  const speed = hypot(body.vel.x, body.vel.z);
  if (!zone) {
    body.wasOutside = true;
    body.crossHold = 0;
    body.crossMax = 0;
    return;
  }
  if (stepDist > inc.def.maxStep) {
    body.wasOutside = false;
    body.crossHold = 0;
    body.crossMax = 0;
    return;
  }
  if (!body.wasOutside) return;
  if (speed > inc.def.extractSpeed) {
    body.crossHold = 0;
    body.crossMax = 0;
    return;
  }
  const meter = { crossHold: body.crossHold, crossHoldMax: body.crossMax };
  const held = accrue(meter, 'crossHold', dt, true);
  body.crossHold = meter.crossHold;
  body.crossMax = meter.crossHoldMax;
  if (held >= inc.def.extractHold) {
    body.delivered = true;
    body.deliveredTo = zone.localId;
    body.resolvedOrder = orderForDelivery(inc, body.localId, zone.localId);
  }
}

export function noteImpact(body, amount) {
  if (!body) return body;
  hurt(body, amount, 'impact');
  return body;
}

export function prepareIncident(rt, inc, cmd, dt, withPilotTools) {
  if (!inc || inc.latches.settled || inc.failedForward) return;
  applyDrives(rt, inc, dt);
  if (withPilotTools) {
    applyTether(rt, inc, cmd, dt);
    applyTools(rt, inc, cmd, dt);
  } else {
    for (const body of inc.bodyList) {
      if (body.volatile && body.alive && !body.rigAttached) body.spread += (body.ventPerS || 0) * dt;
    }
  }
}

export function integrateWorld(rt, dt) {
  integrateBodies(rt, dt);
  collideBodies(rt, dt);
}

export function finishIncident(rt, inc, dt) {
  if (!inc || inc.latches.settled || inc.failedForward) return;
  for (const body of inc.bodyList) refreshModel(body);
  trackDelivery(inc, dt);
}

export function horizonKill(inc) {
  const fail = inc.def.failure;
  if (!fail || fail.kind !== 'horizon') return null;
  const well = inc.bodyList.find((body) => body.localId === fail.hazard);
  const subject = inc.bodyList.find((body) => body.localId === fail.subject);
  if (!well || !subject || !subject.alive) return subject && !subject.alive ? subject : null;
  const dist = hypot(subject.pos.x - well.pos.x, subject.pos.z - well.pos.z);
  if (dist < well.horizon) {
    subject.hull = 0;
    subject.alive = false;
    subject.killedBy = well.localId;
    refreshModel(subject);
    return subject;
  }
  return null;
}
