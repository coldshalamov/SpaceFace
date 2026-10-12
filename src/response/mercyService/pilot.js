// Scripted input trace for fixed-seed runs. This is not tactical AI.
// It writes the same command shape a pilot (or the withheld input adapter) would.

import { PLAYER_RADIUS } from './constants.js';
import { phaseOf } from './gates.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hypot(x, z) {
  return Math.hypot(x, z);
}

export function zeroCommand(policy = null) {
  return {
    policy,
    thrustX: 0,
    thrustZ: 0,
    cut: false,
    tether: null,
    clamp: false,
    clampTarget: null,
    stabilizer: false,
    stabilizerTarget: null,
    containment: false,
    containmentTarget: null,
  };
}

function steer(player, point, speed) {
  const dx = point.x - player.pos.x;
  const dz = point.z - player.pos.z;
  const dist = hypot(dx, dz) || 1;
  const desired = Math.min(speed, dist * 1.6);
  const vx = (dx / dist) * desired;
  const vz = (dz / dist) * desired;
  return {
    thrustX: clamp((vx - player.vel.x) / 10, -1, 1),
    thrustZ: clamp((vz - player.vel.z) / 10, -1, 1),
  };
}

function holdRange(player, target) {
  const dx = target.pos.x - player.pos.x;
  const dz = target.pos.z - player.pos.z;
  const dist = hypot(dx, dz) || 1;
  const standoff = (target.toolR || target.radius || 3) + PLAYER_RADIUS + 1.4;
  let point;
  if (dist > standoff + 2) point = { x: target.pos.x, z: target.pos.z };
  else {
    point = {
      x: target.pos.x - (dx / dist) * standoff,
      z: target.pos.z - (dz / dist) * standoff,
    };
  }
  const speed = dist > 20 ? 42 : 12;
  const thrust = steer(player, point, speed);
  if (dist < standoff + 6) {
    thrust.thrustX = clamp((point.x - player.pos.x) * 0.2 + (target.vel.x - player.vel.x) * 0.18, -1, 1);
    thrust.thrustZ = clamp((point.z - player.pos.z) * 0.2 + (target.vel.z - player.vel.z) * 0.18, -1, 1);
  }
  return thrust;
}

function withTool(thrust, target, tool, policy) {
  const cmd = zeroCommand(policy);
  cmd.thrustX = thrust.thrustX;
  cmd.thrustZ = thrust.thrustZ;
  if (tool === 'clamp') {
    cmd.clamp = true;
    cmd.clampTarget = target.localId;
  } else if (tool === 'stabilizer') {
    cmd.stabilizer = true;
    cmd.stabilizerTarget = target.localId;
  } else if (tool === 'containment') {
    cmd.containment = true;
    cmd.containmentTarget = target.localId;
  }
  return cmd;
}

function tetherCommand(thrust, target, reel, policy, extra = {}) {
  const cmd = zeroCommand(policy);
  cmd.thrustX = thrust.thrustX;
  cmd.thrustZ = thrust.thrustZ;
  cmd.tether = { targetLocal: target.localId, reel };
  if (extra.clamp) {
    cmd.clamp = true;
    cmd.clampTarget = extra.clamp;
  }
  return cmd;
}

export function commandFor(rt, policy) {
  const inc = rt.focus;
  if (!inc) return zeroCommand(policy || 'neglect');
  if (policy === 'neglect' || policy == null) return zeroCommand('neglect');
  if (policy === 'leave') return leaveCommand(rt, inc);
  const order = inc.def.orders[policy] || inc.def.orders[inc.def.defaultOrder];
  const usePolicy = inc.def.orders[policy] ? policy : inc.def.defaultOrder;
  if (!order) return zeroCommand(usePolicy);
  const subject = rt.bodies[`${inc.uid}:${order.subject}`];
  const dest = rt.bodies[`${inc.uid}:${order.dest}`];
  if (!subject || !subject.alive || !dest) return zeroCommand(usePolicy);

  if (order.pin) {
    const pin = rt.bodies[`${inc.uid}:${order.pin}`];
    if (pin && pin.alive && !pin.driveHeld) {
      return withTool(holdRange(rt.player, pin), pin, 'clamp', usePolicy);
    }
  }
  if (order.clear) {
    const junk = rt.bodies[`${inc.uid}:${order.clear}`];
    if (junk && junk.alive && !junkClear(junk, dest)) {
      return dragClear(rt, junk, dest, usePolicy);
    }
  }
  if (order.tools.includes('containment') && subject.volatile && !subject.rigAttached) {
    return withTool(holdRange(rt.player, subject), subject, 'containment', usePolicy);
  }
  if (Math.abs(subject.angVel) > inc.def.spinLimit) {
    return withTool(holdRange(rt.player, subject), subject, 'stabilizer', usePolicy);
  }
  const clampNeeded = order.tools.includes('clamp') || subject.mass > inc.def.clampMass;
  if (clampNeeded && !subject.clampAttached && !inc.latches.secured && order.pin !== subject.localId) {
    // A pin tool on the order should not force a second clamp onto a light capsule
    // once the pin is held. Clamp the subject only when the subject itself needs it.
  }
  const subjectNeedsClamp = subject.mass > inc.def.clampMass
    || (order.tools.includes('clamp') && !order.pin && !order.clear);
  if (subjectNeedsClamp && !subject.clampAttached && phaseOf(inc) !== 'extraction') {
    return withTool(holdRange(rt.player, subject), subject, 'clamp', usePolicy);
  }
  if (!inc.latches.stabilized) return brakeCommand(rt, subject, dest, inc, usePolicy);
  if (!inc.latches.secured) return tensionCommand(rt, subject, dest, usePolicy, subject.clampAttached);
  return towCommand(rt, subject, dest, inc, usePolicy);
}

function junkClear(junk, dest) {
  return Math.abs(junk.pos.z - dest.pos.z) > 16;
}

function dragClear(rt, junk, dest, policy) {
  const park = { x: dest.pos.x, z: dest.pos.z + 28 };
  const dist = hypot(junk.pos.x - park.x, junk.pos.z - park.z);
  if (dist < 6 && hypot(junk.vel.x, junk.vel.z) < 3.5) {
    return tensionCommand(rt, junk, { pos: park }, policy, true);
  }
  return towCommand(rt, junk, { pos: park, recoveryRadius: 6, localId: 'clear' }, { def: { extractSpeed: 8 } }, policy, junk.localId);
}

function approachPoint(subject, dest, lead) {
  const dx = dest.pos.x - subject.pos.x;
  const dz = dest.pos.z - subject.pos.z;
  const dist = hypot(dx, dz) || 1;
  return { x: subject.pos.x + (dx / dist) * lead, z: subject.pos.z + (dz / dist) * lead };
}

function brakeCommand(rt, subject, dest, inc, policy) {
  const speed = hypot(subject.vel.x, subject.vel.z);
  let point;
  if (inc.arrest < inc.def.minArrest && speed > 0.8) {
    point = {
      x: subject.pos.x - (subject.vel.x / speed) * 14,
      z: subject.pos.z - (subject.vel.z / speed) * 14,
    };
  } else {
    point = approachPoint(subject, dest, 12);
  }
  const reel = inc.arrest < inc.def.minArrest ? -1 : 1;
  const thrust = steer(rt.player, point, inc.arrest < inc.def.minArrest ? 28 : 16);
  const cmd = tetherCommand(thrust, subject, reel, policy);
  if (subject.clampAttached) {
    cmd.clamp = true;
    cmd.clampTarget = subject.localId;
  }
  return cmd;
}

function tensionCommand(rt, subject, dest, policy, clamped) {
  const point = approachPoint(subject, dest, 11);
  const thrust = steer(rt.player, point, 14);
  if (clamped || subject.clampAttached) {
    const cmd = withTool(holdRange(rt.player, subject), subject, 'clamp', policy);
    cmd.tether = { targetLocal: subject.localId, reel: -0.4 };
    return cmd;
  }
  return tetherCommand(thrust, subject, -1, policy);
}

function towCommand(rt, subject, dest, inc, policy, clampLocal = null) {
  const dx = dest.pos.x - subject.pos.x;
  const dz = dest.pos.z - subject.pos.z;
  const dist = hypot(dx, dz) || 1;
  const radius = dest.recoveryRadius || 12;
  const nx = dx / dist;
  const nz = dz / dist;
  const inside = dist < radius * 0.85;
  let point;
  let speed;
  let reel = -0.35;
  if (inside) {
    point = { x: dest.pos.x, z: dest.pos.z };
    speed = 5;
    reel = 0;
  } else if (dist < radius + 18) {
    point = { x: dest.pos.x, z: dest.pos.z };
    speed = 14;
    reel = -0.5;
  } else {
    point = { x: subject.pos.x + nx * 12, z: subject.pos.z + nz * 12 };
    speed = 22;
  }
  const thrust = steer(rt.player, point, speed);
  const cmd = tetherCommand(thrust, subject, reel, policy, { clamp: clampLocal });
  if (subject.clampAttached && !clampLocal) {
    cmd.clamp = true;
    cmd.clampTarget = subject.localId;
  }
  return cmd;
}

function leaveCommand(rt, inc) {
  const names = Object.keys(inc.def.orders);
  const subject = rt.bodies[`${inc.uid}:${inc.def.orders[names[0]].subject}`];
  const origin = subject ? subject.pos : { x: 0, z: 0 };
  const dx = rt.player.pos.x - origin.x;
  const dz = rt.player.pos.z - origin.z;
  const dist = hypot(dx, dz) || 1;
  const point = { x: origin.x + (dx / dist) * 240, z: origin.z + (dz / dist) * 240 };
  const thrust = steer(rt.player, point, 48);
  const cmd = zeroCommand('leave');
  cmd.thrustX = thrust.thrustX;
  cmd.thrustZ = thrust.thrustZ;
  cmd.cut = true;
  return cmd;
}
