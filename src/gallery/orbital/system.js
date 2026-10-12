// Orbital Gallery machinery. Runs inside the authoritative sim, ahead of flight,
// fields, and physics. It writes the input packet and queues motor impulses.
// It does not integrate positions, does not import Three.js, and does not
// touch credits.

import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

const NEUTRAL = Object.freeze({
  moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, cut: false,
});

export const orbitalGallery = {
  name: 'orbitalGallery',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
  },

  update(dt, state) {
    const gallery = state && state.orbitalGallery;
    if (!gallery || gallery.phase !== 'live') return;
    if (gallery.playStartTick == null) gallery.playStartTick = state.tick;
    const rel = state.tick - gallery.playStartTick;
    const frame = gallery.liveInput || frameAt(gallery.tape, rel);
    writeGalleryInput(state, frame);
    if (frame.boost) gallery.boostTicks = (gallery.boostTicks || 0) + 1;
    if (frame.brake) gallery.brakeTicks = (gallery.brakeTicks || 0) + 1;
    if (frame.cut && gallery.lastCutMark !== frame.mark) {
      gallery.lastCutMark = frame.mark;
      gallery.cuts = (gallery.cuts || 0) + cutPlayerLines(gallery, state);
    }
    driveMotors(gallery, state, dt);
    if (gallery.kernel && typeof gallery.kernel.prePhysics === 'function') {
      gallery.kernel.prePhysics(dt);
    }
  },
};

export function frameAt(tape, rel) {
  const frames = Array.isArray(tape) ? tape : [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (rel <= frame.until) return frame;
  }
  return NEUTRAL;
}

export function writeGalleryInput(state, input = NEUTRAL) {
  const packet = state.input || (state.input = {});
  packet.moveX = axis(input.moveX);
  packet.moveZ = axis(input.moveZ);
  packet.turnIntent = axis(input.turnIntent);
  packet.boost = !!input.boost;
  packet.brake = !!input.brake;
  packet.fire = false;
  if (!packet.actions) packet.actions = {};
  packet.actions.brake = packet.brake;
  packet.actions.autopursuit = false;
  return packet;
}

function axis(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function cutPlayerLines(gallery, state) {
  const kernel = gallery.kernel;
  const playerId = state.playerId;
  if (!kernel || !kernel.attachments || playerId == null) return 0;
  const lines = kernel.attachments.listForEntity(playerId, true) || [];
  let cuts = 0;
  for (const line of lines) {
    if (!line || line.state !== 'active') continue;
    const cut = kernel.attachments.cut(line.id, playerId, 'pilot');
    if (cut && cut.ok !== false) cuts += 1;
  }
  return cuts;
}

function driveMotors(gallery, state, dt) {
  if (!(dt > 0)) return;
  const roles = gallery.roles;
  if (!roles) return;
  const simTime = state.simTime || 0;
  for (const role of Object.keys(roles)) {
    const entity = state.entities.get(roles[role]);
    const motor = entity && entity.data && entity.data.galleryMotor;
    if (!entity || entity.alive === false || !motor) continue;
    stepMotor(entity, motor, simTime, dt);
  }
}

function stepMotor(entity, motor, simTime, dt) {
  let sign = 1;
  if (motor.periodS > 0) {
    const phase = simTime + (motor.phaseS || 0);
    const half = motor.periodS * 0.5;
    const slot = Math.floor(phase / Math.max(half, 1e-4));
    sign = slot % 2 === 0 ? 1 : -1;
  }
  const heading = motor.heading || 0;
  const hx = Math.cos(heading) * sign;
  const hz = Math.sin(heading) * sign;
  const vx = entity.vel ? entity.vel.x : 0;
  const vz = entity.vel ? entity.vel.z : 0;
  const along = vx * hx + vz * hz;
  const err = motor.cruise - along;
  if (Math.abs(err) < 0.05) return;
  const accelCap = motor.accel > 0 ? motor.accel : 60;
  const accel = Math.max(-accelCap, Math.min(accelCap, err / dt));
  const mass = (entity.physicsBody && entity.physicsBody.mass) || entity.mass || 1;
  queuePhysicsImpulse(entity, {
    x: hx * accel * mass * dt,
    y: 0,
    z: hz * accel * mass * dt,
  });
}
