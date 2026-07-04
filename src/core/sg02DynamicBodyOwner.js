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

const CAPTURE_SLACK_S = 0.1;
const MAX_STRETCH_RATIO = 0.45;
const REEL_SAFE_STRETCH_RATIO = 0.43;
const STRETCH_EPSILON = 1e-6;
const SPRING_TUNES = Object.freeze({
  tether_standard: Object.freeze({ K: 140, zeta: 0.95, captureS: 0.35 }),
  attachment_massline: Object.freeze({ K: 170, zeta: 0.90, captureS: 0.30 }),
});

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
    this.dynamicRecords = new Set();
    this.attachments = new Map();
    this._liveEntityIds = new Set();
    this._liveStaticEntityIds = new Set();
    this._liveDynamicEntityIds = new Set();
    this._staticLayerVersion = null;
    this._diagnostics = {
      schemaVersion: SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
      tick: 0,
      fixedDt: this.fixedDt,
      bodies: 0,
      attachments: 0,
      dynamicBodies: 0,
      ccdBodies: 0,
      lockedPlaneBodies: 0,
      syncMode: 'none',
      syncFullEntities: 0,
      syncStaticEntities: 0,
      syncDynamicEntities: 0,
      syncStaticVersion: -1,
    };
    this.tick = 0;
    this.accumulator = 0;
    this.mode = String(options.mode || 'sg02-dynamic-lab');
    this.publishTelemetry = options.publishTelemetry !== false;
  }

  syncFromEntities(entities = []) {
    const live = this._liveEntityIds;
    live.clear();
    let count = 0;
    for (const entity of entities) {
      if (!entity || entity.alive === false) continue;
      const spec = resolvePhysicsBodySpec(entity);
      if (!spec || !(spec.radius > 0)) continue;
      live.add(entity.id);
      count++;
      this._syncRecord(entity, spec);
    }

    for (const [id, rec] of this.records) {
      if (!live.has(id)) this._removeRecord(id, rec);
    }
    this._staticLayerVersion = null;
    this._writeSyncDiagnostics('full', count, 0, 0, -1);
  }

  syncFromEntityLayers(staticEntities = [], dynamicEntities = [], staticVersion = 0, orderedEntities = null) {
    const version = Math.max(0, Math.trunc(finite(staticVersion)));
    const staticChanged = this._staticLayerVersion !== version;
    const dynamicLive = this._liveDynamicEntityIds;
    dynamicLive.clear();

    let staticCount = 0;
    if (staticChanged) {
      const staticLive = this._liveStaticEntityIds;
      staticLive.clear();
      const source = orderedEntities || staticEntities;
      for (const entity of source) {
        if (!entity || entity.alive === false) continue;
        const spec = resolvePhysicsBodySpec(entity);
        if (!spec || !(spec.radius > 0)) continue;
        if (spec.dynamic) {
          if (orderedEntities) {
            dynamicLive.add(entity.id);
            this._syncRecord(entity, spec);
          }
          continue;
        }
        staticLive.add(entity.id);
        staticCount++;
        this._syncRecord(entity, spec);
      }
      for (const [id, rec] of this.records) {
        if (!rec.spec.dynamic && !staticLive.has(id)) this._removeRecord(id, rec);
      }
      this._staticLayerVersion = version;
    }

    let dynamicCount = 0;
    for (const entity of dynamicEntities) {
      if (!entity || entity.alive === false) continue;
      const spec = resolvePhysicsBodySpec(entity);
      if (!spec || !(spec.radius > 0) || !spec.dynamic) continue;
      dynamicLive.add(entity.id);
      dynamicCount++;
      this._syncRecord(entity, spec);
    }
    for (const [id, rec] of this.records) {
      if (rec.spec.dynamic && !dynamicLive.has(id)) this._removeRecord(id, rec);
    }

    this._writeSyncDiagnostics('layered', 0, staticCount, dynamicCount, version);
  }

  step(dt = this.fixedDt) {
    this.accumulator += Math.min(Math.max(0, finite(dt)), 0.25);
    while (this.accumulator + 1e-12 >= this.fixedDt) {
      this._stepFixed();
      this.accumulator -= this.fixedDt;
    }
    return this.diagnostics();
  }

  quantizedSnapshot(options = {}) {
    const records = [];
    for (const rec of this.records.values()) {
      if (options.liveOnly && rec.entity && rec.entity.alive === false) continue;
      records.push(rec);
    }
    return records
      .sort((a, b) => compareIds(a.entity.id, b.entity.id))
      .map((rec) => ({ ...rec.snapshot }));
  }

  diagnostics() {
    let ccdBodies = 0;
    for (const rec of this.dynamicRecords) {
      if (rec.ccdEnabled) ccdBodies++;
    }
    const diag = this._diagnostics;
    diag.tick = this.tick;
    diag.fixedDt = this.fixedDt;
    diag.bodies = this.records.size;
    diag.attachments = this.attachments.size;
    diag.dynamicBodies = this.dynamicRecords.size;
    diag.ccdBodies = ccdBodies;
    diag.lockedPlaneBodies = this.records.size;
    return diag;
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
      spring: normalizeSpring(input.spring || (input.break && input.break.spring), input.defId, input.break),
      springState: createSpringState(),
      springScratch: createSpringScratch(),
      createdTick: Math.max(0, Math.trunc(finite(input.tick))),
      contactJoint: null,
    };
    this._createAttachmentJoints(attachment);
    this.attachments.set(attachment.id, attachment);
    return { id: attachment.id, attachmentId: attachment.id, ownerId: attachment.ownerId, targetId: attachment.targetId };
  }

  setAttachmentReel(input = {}) {
    const attachment = this._findAttachment(input);
    if (!attachment) return false;
    const requested = positive(input.restLength, attachment.restLength);
    if (requested < attachment.restLength && attachment.springState) attachment.springState.reelSlip = true;
    attachment.restLength = safeReelRestLength(attachment, requested, this.fixedDt);
    return true;
  }

  cutAttachment(input = {}) {
    const attachment = this._findAttachment(input);
    if (!attachment) return false;
    this._releaseSpringOnCut(attachment, input.reason);
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
    const springState = attachment.springState || createSpringState();
    const spring = attachment.spring || normalizeSpring(null, attachment.defId, attachment.break);
    const mu = reducedMass(attachment.owner, attachment.target);
    const damping = dampingForSpring(spring, mu);
    const telemetryTension = Math.max(0, springState.lastTension || (stretch * spring.K + damping * Math.max(0, relativeSpeed)));
    const telemetryImpulse = Math.max(0, springState.lastImpulse || telemetryTension * this.fixedDt);
    return Object.freeze({
      schemaVersion: SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
      attachmentId: attachment.id,
      restLength: attachment.restLength,
      distance,
      stretch,
      relativeSpeed,
      tension: telemetryTension,
      impulse: telemetryImpulse,
      phase: springState.phase || 'slack',
      captureT: Math.max(0, finite(springState.captureT)),
      springK: spring.K,
      springDamping: damping,
      breakRequested: !!springState.breakRequested,
      sourceWorld: Object.freeze(source),
      targetWorld: Object.freeze(target),
      tick: this.tick,
    });
  }

  _stepFixed() {
    for (const rec of this.dynamicRecords) {
      setZero3(rec.appliedForce);
      setZero3(rec.appliedTorque);
      rec.maxSpeed = Infinity;
      resetBodyForces(rec.body);
      const command = consumePhysicsCommand(rec.entity);
      if (command) this._applyCommand(rec, command);
    }

    this._applyAttachmentSprings();

    this.world.timestep = this.fixedDt;
    this.world.step();
    this.tick++;

    for (const rec of this.dynamicRecords) {
      const kinematics = this._enforcePlane(rec);
      this._clampSpeed(rec, kinematics);
      this._syncEntityFromKinematics(rec, kinematics);
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
      kinematics: {
        x: pos.x,
        z: pos.z,
        vx: vel.x,
        vz: vel.z,
        yaw: finite(entity.rot),
        wy: finite(entity.angVel),
      },
      maxSpeed: Infinity,
      snapshot: {
        id: entity.id,
        x: quantize(pos.x, this.quantum),
        z: quantize(pos.z, this.quantum),
        yaw: quantize(finite(entity.rot), this.quantum),
        vx: quantize(vel.x, this.quantum),
        vz: quantize(vel.z, this.quantum),
        wy: quantize(finite(entity.angVel), this.quantum),
        revision: spec.revision,
      },
    };
  }

  _removeRecord(id, rec) {
    for (const attachment of Array.from(this.attachments.values())) {
      if (attachment.owner === rec || attachment.target === rec) this.cutAttachment({ attachmentId: attachment.id });
    }
    this.dynamicRecords.delete(rec);
    this.world.removeCollider(rec.collider, false);
    this.world.removeRigidBody(rec.body);
    this.records.delete(id);
  }

  _syncRecord(entity, spec) {
    const rec = this.records.get(entity.id);
    if (!recordMatchesSpec(rec, spec)) {
      if (rec) this._removeRecord(entity.id, rec);
      const next = this._createRecord(entity, spec);
      this.records.set(entity.id, next);
      if (next.spec.dynamic) this.dynamicRecords.add(next);
      return next;
    }
    rec.entity = entity;
    return rec;
  }

  _writeSyncDiagnostics(mode, full, statics, dynamics, staticVersion) {
    const diag = this._diagnostics;
    diag.syncMode = mode;
    diag.syncFullEntities = full;
    diag.syncStaticEntities = statics;
    diag.syncDynamicEntities = dynamics;
    diag.syncStaticVersion = staticVersion;
  }

  _applyCommand(rec, command) {
    if (command.control) {
      const force = planeForce(command.control.force);
      const torque = yawTorque(command.control.torque);
      rec.body.addForce(force, true);
      rec.body.addTorque(torque, true);
      add3Into(rec.appliedForce, force);
      add3Into(rec.appliedTorque, torque);
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
    const q = rec.body.rotation();
    const yaw = wrapAngle(yawFromQuat(q));
    const w = rec.body.angvel();
    const x = finite(p.x);
    const z = finite(p.z);
    const vx = finite(v.x);
    const vz = finite(v.z);
    const wy = finite(w.y);
    if (Math.abs(finite(p.y)) > 1e-9 || x !== p.x || z !== p.z) {
      rec.body.setTranslation({ x, y: 0, z }, true);
    }
    if (Math.abs(finite(v.y)) > 1e-9 || vx !== v.x || vz !== v.z) {
      rec.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    }
    if (Math.abs(finite(q.x)) > 1e-9 || Math.abs(finite(q.z)) > 1e-9 || !Number.isFinite(q.y) || !Number.isFinite(q.w)) {
      rec.body.setRotation(quatFromYaw(yaw), true);
    }
    if (Math.abs(finite(w.x)) > 1e-9 || Math.abs(finite(w.z)) > 1e-9 || wy !== w.y) {
      rec.body.setAngvel({ x: 0, y: wy, z: 0 }, true);
    }
    const out = rec.kinematics || (rec.kinematics = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, wy: 0 });
    out.x = x;
    out.z = z;
    out.vx = vx;
    out.vz = vz;
    out.yaw = yaw;
    out.wy = wy;
    return out;
  }

  _clampSpeed(rec, kinematics = null) {
    if (!Number.isFinite(rec.maxSpeed)) return;
    const vx = kinematics ? kinematics.vx : finite(rec.body.linvel().x);
    const vz = kinematics ? kinematics.vz : finite(rec.body.linvel().z);
    const speed = Math.hypot(vx, vz);
    if (speed <= rec.maxSpeed || speed <= 1e-12) return;
    const scale = rec.maxSpeed / speed;
    const nextVx = vx * scale;
    const nextVz = vz * scale;
    rec.body.setLinvel({ x: nextVx, y: 0, z: nextVz }, true);
    if (kinematics) {
      kinematics.vx = nextVx;
      kinematics.vz = nextVz;
    }
  }

  _syncEntityFromKinematics(rec, kinematics) {
    const pos = rec.entity.pos || (rec.entity.pos = { x: 0, z: 0 });
    const vel = rec.entity.vel || (rec.entity.vel = { x: 0, z: 0 });
    pos.x = kinematics.x;
    pos.z = kinematics.z;
    vel.x = kinematics.vx;
    vel.z = kinematics.vz;
    rec.entity.rot = kinematics.yaw;
    rec.entity.angVel = kinematics.wy;
    rec.snapshot.id = rec.entity.id;
    rec.snapshot.x = quantize(pos.x, this.quantum);
    rec.snapshot.z = quantize(pos.z, this.quantum);
    rec.snapshot.yaw = quantize(kinematics.yaw, this.quantum);
    rec.snapshot.vx = quantize(vel.x, this.quantum);
    rec.snapshot.vz = quantize(vel.z, this.quantum);
    rec.snapshot.wy = quantize(rec.entity.angVel, this.quantum);
    rec.snapshot.revision = rec.revision;
  }

  _publishTelemetry(rec) {
    if (!this.publishTelemetry) return;
    if (!rec.spec.dynamic) return;
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

  _applyAttachmentSprings() {
    for (const attachment of this.attachments.values()) this._applyAttachmentSpring(attachment);
  }

  _applyAttachmentSpring(attachment) {
    const state = attachment.springState || (attachment.springState = createSpringState());
    const scratch = attachment.springScratch || (attachment.springScratch = createSpringScratch());
    let restLength = positive(attachment.restLength, 0);
    const source = worldAnchorInto(scratch.source, attachment.owner, attachment.anchorA);
    const target = worldAnchorInto(scratch.target, attachment.target, attachment.anchorB);
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const distance = Math.hypot(dx, dz);
    const nx = distance > 1e-9 ? dx / distance : 1;
    const nz = distance > 1e-9 ? dz / distance : 0;
    let stretch = Math.max(0, distance - restLength);

    if (state.reelSlip && restLength > 0 && stretch > restLength * REEL_SAFE_STRETCH_RATIO) {
      restLength = distance / (1 + REEL_SAFE_STRETCH_RATIO);
      attachment.restLength = restLength;
      stretch = Math.max(0, distance - restLength);
    }

    state.breakRequested = false;
    state.lastStretch = stretch;
    if (!(stretch > STRETCH_EPSILON)) {
      state.slackS += this.fixedDt;
      state.captureT = 0;
      state.captureActive = false;
      state.wasTaut = false;
      state.phase = 'slack';
      state.lastTension = 0;
      state.lastImpulse = 0;
      state.lastRelativeSpeed = 0;
      return;
    }

    velocityAtPointInto(scratch.velocityA, attachment.owner, source);
    velocityAtPointInto(scratch.velocityB, attachment.target, target);
    const relativeSpeed = (scratch.velocityB.x - scratch.velocityA.x) * nx + (scratch.velocityB.z - scratch.velocityA.z) * nz;
    const spring = attachment.spring || (attachment.spring = normalizeSpring(null, attachment.defId, attachment.break));
    const mu = reducedMass(attachment.owner, attachment.target);
    const damping = dampingForSpring(spring, mu);

    if (!state.wasTaut && state.slackS >= CAPTURE_SLACK_S) {
      state.captureActive = true;
      state.captureT = 0;
    }
    state.wasTaut = true;
    state.slackS = 0;

    const captureS = positive(spring.captureS, 0);
    const inCapture = state.captureActive && state.captureT < captureS;
    const captureX = inCapture && captureS > 0 ? clamp(state.captureT / captureS, 0, 1) : 1;
    const smooth = smoothstep(captureX);
    const k = inCapture ? spring.K * smooth * smooth : spring.K;
    const c = inCapture ? damping * (0.5 + 0.5 * smooth) : damping;
    let force = Math.max(0, k * stretch + c * relativeSpeed);

    const breakStretch = restLength * MAX_STRETCH_RATIO;
    if (stretch > breakStretch) {
      state.breakRequested = true;
      state.phase = 'overload';
      force = 0;
      state.lastTension = Math.max(
        spring.K * stretch + damping * Math.max(0, relativeSpeed),
        finite(attachment.break.maxTension) + 1,
      );
      state.lastImpulse = Math.max(state.lastTension * this.fixedDt, finite(attachment.break.maxImpulse) + 1);
      state.lastRelativeSpeed = relativeSpeed;
      return;
    }

    const impulse = force * this.fixedDt;
    if (impulse > 0) {
      scratch.impulseA.x = nx * impulse;
      scratch.impulseA.y = 0;
      scratch.impulseA.z = nz * impulse;
      scratch.impulseB.x = -scratch.impulseA.x;
      scratch.impulseB.y = 0;
      scratch.impulseB.z = -scratch.impulseA.z;
      applyImpulseAtPoint(attachment.owner, scratch.impulseA, source);
      applyImpulseAtPoint(attachment.target, scratch.impulseB, target);
      accumulateForce(attachment.owner, scratch.impulseA, this.fixedDt);
      accumulateForce(attachment.target, scratch.impulseB, this.fixedDt);
    }

    state.lastTension = force;
    state.lastImpulse = impulse;
    state.lastRelativeSpeed = relativeSpeed;
    state.phase = inCapture ? 'capture'
      : force >= finite(attachment.break.maxTension, Infinity) * 0.75 ? 'overload'
      : 'loaded';
    if (inCapture) {
      state.captureT += this.fixedDt;
      if (state.captureT >= captureS) state.captureActive = false;
    }
  }

  _createAttachmentJoints(attachment) {
    attachment.contactJoint = null;
    if (!this.RAPIER.JointData.generic) return;
    attachment.contactJoint = this.world.createImpulseJoint(
      this.RAPIER.JointData.generic(attachment.anchorA, attachment.anchorB, { x: 1, y: 0, z: 0 }, 0),
      attachment.owner.body,
      attachment.target.body,
      true,
    );
    if (attachment.contactJoint && typeof attachment.contactJoint.setContactsEnabled === 'function') {
      attachment.contactJoint.setContactsEnabled(false);
    }
  }

  _removeAttachmentJoints(attachment) {
    if (attachment.contactJoint && (!attachment.contactJoint.isValid || attachment.contactJoint.isValid())) {
      this.world.removeImpulseJoint(attachment.contactJoint, true);
    }
    attachment.contactJoint = null;
  }

  _releaseSpringOnCut(attachment, reason) {
    if (String(reason || '') !== 'tether_cut') return;
    if (attachment.defId !== 'tether_standard') return;
    const scratch = attachment.springScratch || (attachment.springScratch = createSpringScratch());
    const source = worldAnchorInto(scratch.source, attachment.owner, attachment.anchorA);
    const target = worldAnchorInto(scratch.target, attachment.target, attachment.anchorB);
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const distance = Math.hypot(dx, dz);
    const stretch = Math.max(0, distance - positive(attachment.restLength, distance));
    if (!(stretch > STRETCH_EPSILON)) return;
    velocityAtPointInto(scratch.velocityA, attachment.owner, source);
    const nx = distance > 1e-9 ? dx / distance : 1;
    const nz = distance > 1e-9 ? dz / distance : 0;
    const radialSpeed = scratch.velocityA.x * nx + scratch.velocityA.z * nz;
    let tx = scratch.velocityA.x - nx * radialSpeed;
    let tz = scratch.velocityA.z - nz * radialSpeed;
    const tangentSpeed = Math.hypot(tx, tz);
    if (!(tangentSpeed > 1e-6)) {
      tx = -nz;
      tz = nx;
    } else {
      tx /= tangentSpeed;
      tz /= tangentSpeed;
    }
    const mass = effectiveMass(attachment.owner);
    if (!Number.isFinite(mass) || !(mass > 0)) return;
    const spring = attachment.spring || normalizeSpring(null, attachment.defId, attachment.break);
    const releaseSpeed = Math.min(55, Math.sqrt(Math.max(0, spring.K * stretch * stretch / mass)) * 0.45);
    if (!(releaseSpeed > 0)) return;
    scratch.impulseA.x = tx * releaseSpeed * mass;
    scratch.impulseA.y = 0;
    scratch.impulseA.z = tz * releaseSpeed * mass;
    applyImpulseAtPoint(attachment.owner, scratch.impulseA, source);
    if (attachment.owner.entity && attachment.owner.entity.vel) {
      attachment.owner.entity.vel.x += scratch.impulseA.x / mass;
      attachment.owner.entity.vel.z += scratch.impulseA.z / mass;
    }
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

function resetBodyForces(body) {
  if (!body) return;
  if (typeof body.resetForces === 'function') body.resetForces(true);
  if (typeof body.resetTorques === 'function') body.resetTorques(true);
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

function normalizeSpring(value = {}, defId = '', breakValue = {}) {
  const tune = SPRING_TUNES[String(defId || '')] || null;
  return {
    K: positive(value && value.K, positive(value && value.k, positive(tune && tune.K, positive(breakValue && breakValue.stiffness, 140)))),
    zeta: positive(value && value.zeta, positive(tune && tune.zeta, 0.95)),
    captureS: positive(value && value.captureS, positive(tune && tune.captureS, 0.35)),
  };
}

function createSpringState() {
  return {
    slackS: CAPTURE_SLACK_S,
    captureT: 0,
    captureActive: false,
    wasTaut: false,
    reelSlip: false,
    phase: 'slack',
    breakRequested: false,
    lastStretch: 0,
    lastRelativeSpeed: 0,
    lastTension: 0,
    lastImpulse: 0,
  };
}

function createSpringScratch() {
  return {
    source: zero3(),
    target: zero3(),
    velocityA: zero3(),
    velocityB: zero3(),
    impulseA: zero3(),
    impulseB: zero3(),
  };
}

function safeReelRestLength(attachment, requested, dt = SG02_DYNAMIC_BODY_OWNER_DT) {
  const current = positive(attachment && attachment.restLength, requested);
  if (!(requested < current)) return requested;
  const scratch = attachment.springScratch || (attachment.springScratch = createSpringScratch());
  const source = worldAnchorInto(scratch.source, attachment.owner, attachment.anchorA);
  const target = worldAnchorInto(scratch.target, attachment.target, attachment.anchorB);
  const distance = distance2d(source, target);
  const dx = target.x - source.x;
  const dz = target.z - source.z;
  const invD = distance > 1e-9 ? 1 / distance : 0;
  velocityAtPointInto(scratch.velocityA, attachment.owner, source);
  velocityAtPointInto(scratch.velocityB, attachment.target, target);
  const openingSpeed = invD > 0
    ? Math.max(0, (scratch.velocityB.x - scratch.velocityA.x) * dx * invD + (scratch.velocityB.z - scratch.velocityA.z) * dz * invD)
    : 0;
  const predictedDistance = distance + openingSpeed * Math.max(0, finite(dt));
  const minByGuard = predictedDistance / (1 + REEL_SAFE_STRETCH_RATIO);
  return Math.max(requested, minByGuard);
}

function reducedMass(a, b) {
  const ma = effectiveMass(a);
  const mb = effectiveMass(b);
  if (!Number.isFinite(ma) && !Number.isFinite(mb)) return 0;
  if (!Number.isFinite(ma)) return positive(mb, 0);
  if (!Number.isFinite(mb)) return positive(ma, 0);
  const sum = ma + mb;
  return sum > 0 ? (ma * mb) / sum : 0;
}

function effectiveMass(rec) {
  if (!rec || !rec.spec || !rec.spec.dynamic) return Infinity;
  if (rec.body && typeof rec.body.mass === 'function') return positive(rec.body.mass(), positive(rec.spec.mass, 1));
  return positive(rec.spec.mass, 1);
}

function dampingForSpring(spring, mu) {
  return mu > 0 ? 2 * positive(spring && spring.zeta, 0.95) * Math.sqrt(positive(spring && spring.K, 1) * mu) : 0;
}

function distance2d(a, b) {
  return Math.hypot(finite(b.x) - finite(a.x), finite(b.z) - finite(a.z));
}

function worldAnchorInto(out, rec, local) {
  const p = rec.body.translation();
  const yaw = yawFromQuat(rec.body.rotation());
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = p.x + c * local.x - s * local.z;
  out.y = 0;
  out.z = p.z + s * local.x + c * local.z;
  return out;
}

function velocityAtPointInto(out, rec, point) {
  if (rec.body && typeof rec.body.velocityAtPoint === 'function') {
    const v = rec.body.velocityAtPoint(point);
    out.x = finite(v.x);
    out.y = 0;
    out.z = finite(v.z);
    return out;
  }
  const v = rec.body.linvel();
  out.x = finite(v.x);
  out.y = 0;
  out.z = finite(v.z);
  return out;
}

function applyImpulseAtPoint(rec, impulse, point) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body) return;
  if (typeof rec.body.applyImpulseAtPoint === 'function') {
    rec.body.applyImpulseAtPoint(impulse, point, true);
    return;
  }
  rec.body.applyImpulse(impulse, true);
}

function accumulateForce(rec, impulse, dt) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !(dt > 0)) return;
  const invDt = 1 / dt;
  rec.appliedForce.x += impulse.x * invDt;
  rec.appliedForce.y += impulse.y * invDt;
  rec.appliedForce.z += impulse.z * invDt;
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

function add3Into(a, b) {
  a.x += b.x;
  a.y += b.y;
  a.z += b.z;
  return a;
}

function zero3() {
  return { x: 0, y: 0, z: 0 };
}

function setZero3(value) {
  value.x = 0;
  value.y = 0;
  value.z = 0;
  return value;
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

function recordMatchesSpec(rec, spec) {
  if (!rec || !spec) return false;
  return rec.revision === spec.revision &&
    rec.spec.dynamic === spec.dynamic &&
    rec.spec.ccd === spec.ccd &&
    rec.spec.radius === spec.radius &&
    rec.spec.mass === spec.mass &&
    rec.spec.inertiaY === spec.inertiaY;
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

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
