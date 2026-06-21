// SG-02 dynamic body owner.
//
// The same authority powers the focused laboratory checks and the explicit production
// `rapier-dynamic` backend. Flight/combat write membrane commands; this owner consumes them,
// steps real Rapier dynamic bodies, and mirrors the post-solve state back to entities.

import {
  consumePhysicsCommand,
  measureThrusterAuthority,
  resolvePhysicsBodySpec,
  writePhysicsTelemetry,
} from './physicsAuthority.js';

export const SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION = 1;
export const SG02_DYNAMIC_BODY_OWNER_DT = 1 / 60;
export const SG02_DYNAMIC_BODY_OWNER_QUANTUM = 1e-4;

const RAPIER_COMPAT_INIT_WARNING = 'using deprecated parameters for the initialization function';
let rapierInitPromise = null;

export async function createSg02DynamicBodyOwner(options = {}) {
  const RAPIER = options.RAPIER || await loadRapierCompat();
  return new Sg02DynamicBodyOwner(RAPIER, options);
}

export function createSg02CombatPhysicsPort(owner) {
  if (!owner || typeof owner.applyImpulse !== 'function') {
    throw new Error('SG-02 combat physics port requires a dynamic body owner');
  }
  return Object.freeze({
    applyImpulse(input) { return owner.applyImpulse(input); },
    createAttachment(input) { return owner.createAttachment(input); },
    setAttachmentReel(input) { return owner.setAttachmentReel(input); },
    cutAttachment(input) { return owner.cutAttachment(input); },
    getAttachmentTelemetry(input) { return owner.getAttachmentTelemetry(input); },
  });
}

export class Sg02DynamicBodyOwner {
  constructor(RAPIER, options = {}) {
    if (!RAPIER || !RAPIER.World) throw new Error('SG-02 dynamic body owner requires Rapier');
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.fixedDt = positive(options.fixedDt, SG02_DYNAMIC_BODY_OWNER_DT);
    this.quantum = positive(options.quantum, SG02_DYNAMIC_BODY_OWNER_QUANTUM);
    this.records = new Map();
    this.attachments = new Map();
    this.tick = 0;
    this.accumulator = 0;
    this.mode = String(options.mode || 'sg02-dynamic-lab');
  }

  syncFromEntities(entities = []) {
    const live = new Set();
    for (const entity of entities) {
      if (!entity || entity.alive === false) continue;
      const spec = resolvePhysicsBodySpec(entity);
      if (!spec || !(spec.radius > 0)) continue;
      live.add(entity.id);
      const rec = this.records.get(entity.id);
      if (!rec || rec.revision !== spec.revision) {
        if (rec) this._removeRecord(entity.id, rec);
        this.records.set(entity.id, this._createRecord(entity, spec));
      }
    }

    for (const [id, rec] of this.records) {
      if (!live.has(id)) this._removeRecord(id, rec);
    }
  }

  step(dt = this.fixedDt) {
    this.accumulator += Math.min(Math.max(0, finite(dt)), 0.25);
    while (this.accumulator + 1e-12 >= this.fixedDt) {
      this._stepFixed();
      this.accumulator -= this.fixedDt;
    }
    return this.diagnostics();
  }

  quantizedSnapshot() {
    const q = this.quantum;
    return Array.from(this.records.values())
      .sort((a, b) => compareIds(a.entity.id, b.entity.id))
      .map((rec) => {
        const p = rec.body.translation();
        const v = rec.body.linvel();
        const w = rec.body.angvel();
        return {
          id: rec.entity.id,
          x: quantize(p.x, q),
          z: quantize(p.z, q),
          yaw: quantize(yawFromQuat(rec.body.rotation()), q),
          vx: quantize(v.x, q),
          vz: quantize(v.z, q),
          wy: quantize(w.y, q),
          revision: rec.revision,
        };
      });
  }

  diagnostics() {
    let dynamicBodies = 0;
    let ccdBodies = 0;
    let lockedPlaneBodies = 0;
    for (const rec of this.records.values()) {
      if (rec.spec.dynamic) dynamicBodies++;
      if (rec.ccdEnabled) ccdBodies++;
      if (isPlaneLocked(rec.body)) lockedPlaneBodies++;
    }
    return {
      schemaVersion: SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
      tick: this.tick,
      fixedDt: this.fixedDt,
      bodies: this.records.size,
      attachments: this.attachments.size,
      dynamicBodies,
      ccdBodies,
      lockedPlaneBodies,
    };
  }

  dispose() {
    for (const attachment of this.attachments.values()) this._removeAttachmentJoints(attachment);
    this.attachments.clear();
    for (const [id, rec] of this.records) this._removeRecord(id, rec);
    if (this.world && typeof this.world.free === 'function') this.world.free();
  }

  applyImpulse(input = {}) {
    const rec = this.records.get(input.entityId);
    if (!rec) return false;
    rec.body.applyImpulse(planeForce(input.impulse), true);
    return true;
  }

  createAttachment(input = {}) {
    const attachmentId = String(input.attachmentId || '');
    if (!attachmentId || this.attachments.has(attachmentId)) return false;
    const owner = this.records.get(input.ownerId);
    const target = this.records.get(input.targetId);
    if (!owner || !target || owner === target) return false;
    const sourceWorld = worldPoint(input.sourceWorld, owner.body.translation());
    const targetWorld = worldPoint(input.targetWorld, target.body.translation());
    const restLength = positive(input.restLength, distance2d(sourceWorld, targetWorld));
    const attachment = {
      id: attachmentId,
      defId: String(input.defId || 'unknown'),
      ownerId: owner.entity.id,
      targetId: target.entity.id,
      sourceSocketId: input.sourceSocketId == null ? null : String(input.sourceSocketId),
      targetSocketId: input.targetSocketId == null ? null : String(input.targetSocketId),
      owner,
      target,
      anchorA: localAnchorFromWorld(owner, sourceWorld),
      anchorB: localAnchorFromWorld(target, targetWorld),
      restLength,
      break: normalizeBreak(input.break),
      createdTick: Math.max(0, Math.trunc(finite(input.tick))),
      ropeJoint: null,
    };
    this._createAttachmentJoints(attachment);
    this.attachments.set(attachment.id, attachment);
    return { id: attachment.id, attachmentId: attachment.id, ownerId: attachment.ownerId, targetId: attachment.targetId };
  }

  setAttachmentReel(input = {}) {
    const attachment = this._findAttachment(input);
    if (!attachment) return false;
    attachment.restLength = positive(input.restLength, attachment.restLength);
    this._removeAttachmentJoints(attachment);
    this._createAttachmentJoints(attachment);
    return true;
  }

  cutAttachment(input = {}) {
    const attachment = this._findAttachment(input);
    if (!attachment) return false;
    this._removeAttachmentJoints(attachment);
    this.attachments.delete(attachment.id);
    return true;
  }

  getAttachmentTelemetry(input = {}) {
    const attachment = this._findAttachment(input);
    if (!attachment) return null;
    const source = worldAnchor(attachment.owner, attachment.anchorA);
    const target = worldAnchor(attachment.target, attachment.anchorB);
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const distance = Math.hypot(dx, dz);
    const nx = distance > 1e-9 ? dx / distance : 1;
    const nz = distance > 1e-9 ? dz / distance : 0;
    const ownerVelocity = attachment.owner.body.linvel();
    const targetVelocity = attachment.target.body.linvel();
    const relativeSpeed = (targetVelocity.x - ownerVelocity.x) * nx + (targetVelocity.z - ownerVelocity.z) * nz;
    const stretch = Math.max(0, distance - attachment.restLength);
    const tension = Math.max(0, stretch * attachment.break.stiffness + relativeSpeed * attachment.break.damping);
    const impulse = tension * this.fixedDt;
    return Object.freeze({
      schemaVersion: SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
      attachmentId: attachment.id,
      restLength: attachment.restLength,
      distance,
      stretch,
      relativeSpeed,
      tension,
      impulse,
      sourceWorld: Object.freeze(source),
      targetWorld: Object.freeze(target),
      tick: this.tick,
    });
  }

  _stepFixed() {
    for (const rec of this.records.values()) {
      rec.appliedForce = zero3();
      rec.appliedTorque = zero3();
      rec.maxSpeed = Infinity;
      const command = consumePhysicsCommand(rec.entity);
      if (command) this._applyCommand(rec, command);
    }

    this.world.timestep = this.fixedDt;
    this.world.step();
    this.tick++;

    for (const rec of this.records.values()) {
      this._enforcePlane(rec);
      this._clampSpeed(rec);
      this._syncEntityFromBody(rec);
      this._publishTelemetry(rec);
    }
  }

  _createRecord(entity, spec) {
    const R = this.RAPIER;
    const pos = vector3(entity.pos);
    const vel = vector3(entity.vel);
    const desc = (spec.dynamic ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed())
      .setTranslation(pos.x, 0, pos.z)
      .setRotation(quatFromYaw(finite(entity.rot)))
      .setLinvel(vel.x, 0, vel.z)
      .setAngvel({ x: 0, y: finite(entity.angVel), z: 0 })
      .enabledTranslations(true, false, true)
      .enabledRotations(false, true, false)
      .setCcdEnabled(!!spec.ccd);
    if (spec.dynamic && typeof desc.setAdditionalMassProperties === 'function') {
      desc.setAdditionalMassProperties(
        spec.mass,
        vector3(spec.centerOfMass),
        { x: 1, y: spec.inertiaY, z: 1 },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    }

    const body = this.world.createRigidBody(desc);
    const colliderDesc = R.ColliderDesc.ball(spec.radius).setDensity(0);
    const collider = this.world.createCollider(colliderDesc, body);
    const ccdEnabled = typeof body.isCcdEnabled === 'function' ? body.isCcdEnabled() : !!spec.ccd;
    return {
      entity,
      spec,
      revision: spec.revision,
      body,
      collider,
      ccdEnabled,
      appliedForce: zero3(),
      appliedTorque: zero3(),
      maxSpeed: Infinity,
    };
  }

  _removeRecord(id, rec) {
    for (const attachment of Array.from(this.attachments.values())) {
      if (attachment.owner === rec || attachment.target === rec) this.cutAttachment({ attachmentId: attachment.id });
    }
    this.world.removeCollider(rec.collider, false);
    this.world.removeRigidBody(rec.body);
    this.records.delete(id);
  }

  _applyCommand(rec, command) {
    if (command.control) {
      const force = planeForce(command.control.force);
      const torque = yawTorque(command.control.torque);
      rec.body.addForce(force, true);
      rec.body.addTorque(torque, true);
      rec.appliedForce = add3(rec.appliedForce, force);
      rec.appliedTorque = add3(rec.appliedTorque, torque);
      rec.maxSpeed = positive(command.control.maxSpeed, Infinity);
    }
    for (const impulse of command.impulses || []) {
      rec.body.applyImpulse(planeForce(impulse), true);
    }
    for (const impulse of command.torqueImpulses || []) {
      rec.body.applyTorqueImpulse(yawTorque(impulse), true);
    }
  }

  _enforcePlane(rec) {
    const p = rec.body.translation();
    const v = rec.body.linvel();
    const yaw = yawFromQuat(rec.body.rotation());
    const w = rec.body.angvel();
    rec.body.setTranslation({ x: finite(p.x), y: 0, z: finite(p.z) }, true);
    rec.body.setLinvel({ x: finite(v.x), y: 0, z: finite(v.z) }, true);
    rec.body.setRotation(quatFromYaw(yaw), true);
    rec.body.setAngvel({ x: 0, y: finite(w.y), z: 0 }, true);
  }

  _clampSpeed(rec) {
    if (!Number.isFinite(rec.maxSpeed)) return;
    const v = rec.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    if (speed <= rec.maxSpeed || speed <= 1e-12) return;
    const scale = rec.maxSpeed / speed;
    rec.body.setLinvel({ x: v.x * scale, y: 0, z: v.z * scale }, true);
  }

  _syncEntityFromBody(rec) {
    const p = rec.body.translation();
    const v = rec.body.linvel();
    const w = rec.body.angvel();
    rec.entity.pos = { ...(rec.entity.pos || {}), x: finite(p.x), z: finite(p.z) };
    rec.entity.vel = { ...(rec.entity.vel || {}), x: finite(v.x), z: finite(v.z) };
    rec.entity.rot = wrapAngle(yawFromQuat(rec.body.rotation()));
    rec.entity.angVel = finite(w.y);
  }

  _publishTelemetry(rec) {
    writePhysicsTelemetry(rec.entity, {
      tick: this.tick,
      bodyHandle: rec.body.handle,
      dynamic: !!rec.spec.dynamic,
      ccd: rec.ccdEnabled,
      mass: rec.spec.mass,
      inertiaY: rec.spec.inertiaY,
      force: rec.appliedForce,
      torque: rec.appliedTorque,
      linearAcceleration: {
        x: rec.appliedForce.x / rec.spec.mass,
        y: 0,
        z: rec.appliedForce.z / rec.spec.mass,
      },
      angularAccelerationY: rec.appliedTorque.y / rec.spec.inertiaY,
      lateralAcceleration: 0,
      authority: measureThrusterAuthority(rec.entity),
      mode: this.mode,
    });
  }

  _findAttachment(input = {}) {
    const fromHandle = input.physicsHandle && typeof input.physicsHandle === 'object' ? input.physicsHandle.id : input.physicsHandle;
    const id = String(input.attachmentId || fromHandle || '');
    return id ? this.attachments.get(id) || null : null;
  }

  _createAttachmentJoints(attachment) {
    attachment.ropeJoint = this.world.createImpulseJoint(
      this.RAPIER.JointData.rope(attachment.restLength, attachment.anchorA, attachment.anchorB),
      attachment.owner.body,
      attachment.target.body,
      true,
    );
    if (attachment.ropeJoint && typeof attachment.ropeJoint.setContactsEnabled === 'function') {
      attachment.ropeJoint.setContactsEnabled(false);
    }
  }

  _removeAttachmentJoints(attachment) {
    if (attachment.ropeJoint && (!attachment.ropeJoint.isValid || attachment.ropeJoint.isValid())) {
      this.world.removeImpulseJoint(attachment.ropeJoint, true);
    }
    attachment.ropeJoint = null;
  }
}

async function loadRapierCompat() {
  const mod = await import('@dimforge/rapier3d-compat');
  const RAPIER = mod.default || mod;
  if (!rapierInitPromise) {
    rapierInitPromise = runRapierInitWithFilteredWarning(RAPIER).catch((err) => {
      rapierInitPromise = null;
      throw err;
    });
  }
  await rapierInitPromise;
  return RAPIER;
}

async function runRapierInitWithFilteredWarning(RAPIER) {
  if (!RAPIER || typeof RAPIER.init !== 'function') return;
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    await RAPIER.init();
    return;
  }
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const text = args.map(String).join(' ');
    if (text.includes(RAPIER_COMPAT_INIT_WARNING)) return;
    originalWarn.apply(console, args);
  };
  try {
    await RAPIER.init();
  } finally {
    console.warn = originalWarn;
  }
}

function isPlaneLocked(body) {
  const p = body.translation();
  const v = body.linvel();
  const w = body.angvel();
  return Math.abs(p.y) < 1e-9 && Math.abs(v.y) < 1e-9 && Math.abs(w.x) < 1e-9 && Math.abs(w.z) < 1e-9;
}

function worldPoint(source, fallback = zero3()) {
  return { x: finite(source && source.x, fallback.x), y: finite(source && source.y, 0), z: finite(source && source.z, fallback.z) };
}

function localAnchorFromWorld(rec, world) {
  const p = rec.body.translation();
  const yaw = yawFromQuat(rec.body.rotation());
  const dx = finite(world.x) - p.x;
  const dz = finite(world.z) - p.z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: c * dx + s * dz, y: 0, z: -s * dx + c * dz };
}

function worldAnchor(rec, local) {
  const p = rec.body.translation();
  const yaw = yawFromQuat(rec.body.rotation());
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: p.x + c * local.x - s * local.z,
    y: 0,
    z: p.z + s * local.x + c * local.z,
  };
}

function normalizeBreak(value = {}) {
  return {
    maxTension: positive(value.maxTension, Infinity),
    maxImpulse: positive(value.maxImpulse, Infinity),
    stiffness: positive(value.stiffness, 10),
    damping: positive(value.damping, 0),
  };
}

function distance2d(a, b) {
  return Math.hypot(finite(b.x) - finite(a.x), finite(b.z) - finite(a.z));
}

function planeForce(value) {
  const v = vector3(value);
  return { x: v.x, y: 0, z: v.z };
}

function yawTorque(value) {
  const v = vector3(value);
  return { x: 0, y: v.y, z: 0 };
}

function vector3(source) {
  return {
    x: finite(source && source.x),
    y: finite(source && source.y),
    z: finite(source && source.z),
  };
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function zero3() {
  return { x: 0, y: 0, z: 0 };
}

function quatFromYaw(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function yawFromQuat(q) {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

function quantize(value, quantum) {
  return Math.round(finite(value) / quantum) * quantum;
}

function compareIds(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function wrapAngle(value) {
  let out = finite(value);
  while (out <= -Math.PI) out += Math.PI * 2;
  while (out > Math.PI) out -= Math.PI * 2;
  return out;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
