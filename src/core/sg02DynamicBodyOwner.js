// SG-02 dynamic body owner laboratory.
//
// This module is intentionally not wired into production gameplay yet. It proves that the
// SG-02 physicsAuthority membrane can drive real Rapier dynamic bodies deterministically before
// the full flight/collision/tether runtime replaces the legacy owner.

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

export class Sg02DynamicBodyOwner {
  constructor(RAPIER, options = {}) {
    if (!RAPIER || !RAPIER.World) throw new Error('SG-02 dynamic body owner requires Rapier');
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.fixedDt = positive(options.fixedDt, SG02_DYNAMIC_BODY_OWNER_DT);
    this.quantum = positive(options.quantum, SG02_DYNAMIC_BODY_OWNER_QUANTUM);
    this.records = new Map();
    this.tick = 0;
    this.accumulator = 0;
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
      dynamicBodies,
      ccdBodies,
      lockedPlaneBodies,
    };
  }

  dispose() {
    for (const [id, rec] of this.records) this._removeRecord(id, rec);
    if (this.world && typeof this.world.free === 'function') this.world.free();
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
      mode: 'sg02-dynamic-lab',
    });
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
