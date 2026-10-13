// Orbital Gallery machinery. Runs inside the authoritative sim, ahead of flight,
// fields, and physics. Live play preserves raw input; exhibits alone write a tape packet.
// It does not integrate positions, does not import Three.js, and does not
// touch credits.

import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { createLiveGallery } from './live.js';

const NEUTRAL = Object.freeze({
  moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, cut: false,
});

export const orbitalGallery = {
  name: 'orbitalGallery',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.live = createLiveGallery(ctx);
    this._unsubs = [];
    const on = (name, fn) => { const off = this.bus?.on(name, fn); if (typeof off === 'function') this._unsubs.push(off); };
    on('orbital-gallery:enter', payload => this.start(payload?.scenarioId));
    on('orbital-gallery:retry', () => this.retry());
    on('orbital-gallery:next', () => this.next());
    on('orbital-gallery:leave', () => this.leave());
    on('physics-venues:records', payload => {
      this.live.deserialize(payload?.gallery);
    });
    on('physics:impact', payload => this.live.impact(payload));
    on('tether:broken', payload => this.live.cut(payload));
    for (const name of ['game:exitToMenu', 'sector:exit', 'save:restoring']) on(name, () => this.leave());
    on('game:newGame', () => this.live.newGame());
  },

  start(id) { return this.live.start(id); },
  retry() { return this.live.retry(); },
  next() { return this.live.next(); },
  leave() { this.live?.leave(); },
  status() { return this.live.status(); },
  serialize() { return this.live.serialize(); },
  deserialize(raw) { this.live.deserialize(raw); },
  destroy() { for (const off of this._unsubs || []) off(); this._unsubs = []; this.live?.leave(); },

  update(dt, state) {
    const gallery = state && state.orbitalGallery;
    if (gallery?.source === 'live') {
      if (gallery.liveInput) writeGalleryInput(state, gallery.liveInput);
      this.live.update(dt);
      return;
    }
    if (gallery?.source !== 'exhibit') return;
    if (!gallery || gallery.phase !== 'live') return;
    if (gallery.playStartTick == null) gallery.playStartTick = state.tick;
    const rel = state.tick - gallery.playStartTick;
    const frame = gallery.liveInput || frameAt(gallery.tape, rel);
    writeGalleryInput(state, frame);
    if (frame.boost) gallery.boostTicks = (gallery.boostTicks || 0) + 1;
    if (frame.brake) gallery.brakeTicks = (gallery.brakeTicks || 0) + 1;
    if (frame.cut && gallery.lastCutMark !== frame.mark) {
      gallery.lastCutMark = frame.mark;
      const cut = cutPlayerLines(gallery, state);
      gallery.cuts = (gallery.cuts || 0) + cut;
      if (cut > 0) gallery.tetherLatched = false;
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
  entity.data.galleryMotorWorked = true;
  queuePhysicsImpulse(entity, {
    x: hx * accel * mass * dt,
    y: 0,
    z: hz * accel * mass * dt,
  });
}
