import { clamp, wrapAngle } from '../contracts.js';

export function holdManeuver(self) {
  return {
    targetHeading: self && Number.isFinite(self.rot) ? self.rot : 0,
    forward: 0,
    right: 0,
    torqueYaw: 0,
    brake: true,
    boost: false,
  };
}

export function steerToward(self, point, options = {}) {
  if (!self || !self.pos || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    return holdManeuver(self);
  }
  const dx = point.x - self.pos.x;
  const dz = point.z - self.pos.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dz, dx);
  const err = wrapAngle(desired - (Number.isFinite(self.rot) ? self.rot : 0));
  const speed = Math.hypot(self.vel && self.vel.x || 0, self.vel && self.vel.z || 0);
  const arrive = Number.isFinite(options.arrive) ? options.arrive : 36;
  let forward = dist < 1 ? 0 : 1;
  if (dist < arrive) forward = dist / Math.max(arrive, 1);
  if (Math.abs(err) > 1) forward *= 0.25;
  else if (Math.abs(err) > 0.55) forward *= 0.55;
  const brakeDist = Number.isFinite(options.brakeDist) ? options.brakeDist : 28;
  const brakeSpeed = Number.isFinite(options.brakeSpeed) ? options.brakeSpeed : 10;
  const brake = dist < brakeDist && speed > brakeSpeed;
  if (brake) forward = 0;
  const boostDist = Number.isFinite(options.boostDist) ? options.boostDist : 150;
  return {
    targetHeading: desired,
    forward: clamp(forward, -1, 1),
    right: 0,
    torqueYaw: clamp(err / 0.4, -1, 1),
    brake,
    boost: !brake && options.boost === true && dist > boostDist && Math.abs(err) < 0.45,
  };
}

export function steerHeading(self, heading, forward = 1) {
  const desired = Number.isFinite(heading) ? heading : (self && self.rot) || 0;
  const err = wrapAngle(desired - ((self && self.rot) || 0));
  let fwd = clamp(forward, -1, 1);
  if (Math.abs(err) > 1) fwd *= 0.3;
  else if (Math.abs(err) > 0.55) fwd *= 0.6;
  return {
    targetHeading: desired,
    forward: fwd,
    right: 0,
    torqueYaw: clamp(err / 0.4, -1, 1),
    brake: false,
    boost: false,
  };
}

export function steerAway(self, point) {
  if (!self || !self.pos || !point) return steerHeading(self, self && self.rot, 1);
  const heading = Math.atan2(self.pos.z - point.z, self.pos.x - point.x);
  return steerHeading(self, heading, 1);
}

export function steerPerpendicular(self, origin, sign = 1) {
  if (!self || !self.pos || !origin) return steerHeading(self, self && self.rot, 1);
  const dx = self.pos.x - origin.x;
  const dz = self.pos.z - origin.z;
  const side = sign >= 0 ? 1 : -1;
  const heading = Math.atan2(side * dx, side * -dz);
  return steerHeading(self, heading, 1);
}
