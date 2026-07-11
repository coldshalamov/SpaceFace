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
import { frameToGlobal, globalToFrame } from './coordinates.js';

export const SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION = 1;
export const SG02_DYNAMIC_BODY_OWNER_DT = 1 / 60;
export const SG02_DYNAMIC_BODY_OWNER_QUANTUM = 1e-4;
const POSE_RESYNC_EPS2 = 1e-4;

const CAPTURE_SLACK_S = 0.1;
const MAX_STRETCH_RATIO = 0.45;
const REEL_SAFE_STRETCH_RATIO = 0.43;
const STRETCH_EPSILON = 1e-6;
// While the pilot actively reels in (holds G / negative reelDelta), the winch hauls harder so a
// thrusting target can't cancel the pull by matching the spring force. This multiplier is GATED to
// active reel only — it does not affect neutral auto-hold or slingshot capture, so the massline-feel
// golden (which issues no reel command) is unaffected. 1.15 = +15% pull while reeling.
const REEL_BOOST_K_MULT = 1.15;
// When actively reeling, the winch must still shorten the line against a fleeing target. The
// opening-speed guard (safeReelRestLength) and the per-step re-lengthening (reelSlip) exist to keep
// the line from snapping under sudden yanks — but applied indiscriminately they make reel-in
// impossible against any thrust (the bug: "I never get closer"). Below, the reelSlip path only
// re-lengthens when stretch is right at the break edge, so a violently fleeing capital can still
// snap the line (the intended escape) but a normal haul no longer pays out.
const REEL_SLIP_RELENGTH_RATIO = 0.95;
const MAX_TETHER_RELEASE_YAW_RATE = 3.4;
const MAX_TETHER_LOADED_YAW_RATE = 5.2;
const MAX_TETHER_OPENING_SPEED_PAD = 10;
const MIN_TETHER_OPENING_SPEED_LIMIT = 160;
const MAX_TETHER_OPENING_SPEED_LIMIT = 260;
const MIN_TETHER_ABSOLUTE_SPEED_LIMIT = 260;
const MAX_TETHER_ABSOLUTE_SPEED_LIMIT = 420;
const TETHER_NOSE_BASE_RATE = 1.5;
const TETHER_NOSE_SPEED_RATE = 4.8;
const TETHER_NOSE_RATE_GAIN = 2.5;
const TETHER_NOSE_SPEED_FOR_AUTHORITY = 120;
const SPRING_TUNES = Object.freeze({
  tether_standard: Object.freeze({ K: 140, zeta: 0.95, captureS: 0.35, maxStretchRatio: 0.72, reelSafeStretchRatio: 0.66 }),
  attachment_massline: Object.freeze({ K: 170, zeta: 0.90, captureS: 0.30 }),
});

// Contact-response materials, keyed by physicsBody.material (physicsAuthority.defaultMaterial).
// friction is 0 EVERYWHERE: hulls in vacuum have no grip, and — mechanically — contact friction
// on ball colliders is what converted every bump into huge yaw spin (tangential impulse × body
// radius over the yaw inertia) and then converted that spin back into linear velocity. Zero
// friction removes both failure modes at the source; hulls scrape and slide instead.
// restitution stays low so plating crunches and sheds energy rather than bouncing like diamond;
// rock keeps the hardest edge. angularDamping models RCS auto-stabilization on powered craft
// (a bumped ship visibly steadies itself over ~2.5 s); debris and wrecks keep tumbling.
// `ghost` colliders join no contact pairs at all: projectiles do their damage through the
// swept-segment tests in physics.js — a solver contact on top of that double-hit every target
// with real momentum (~20 wu/s per bullet), which is why combat shoved ships around at random.
const CONTACT_MATERIALS = Object.freeze({
  ship:       Object.freeze({ friction: 0, restitution: 0.12, angularDamping: 0.4, ghost: false }),
  projectile: Object.freeze({ friction: 0, restitution: 0,    angularDamping: 0,    ghost: true }),
  rock:       Object.freeze({ friction: 0, restitution: 0.22, angularDamping: 0.02, ghost: false }),
  station:    Object.freeze({ friction: 0, restitution: 0.06, angularDamping: 0,    ghost: false }),
  debris:     Object.freeze({ friction: 0, restitution: 0.16, angularDamping: 0.06, ghost: false }),
  payload:    Object.freeze({ friction: 0, restitution: 0.10, angularDamping: 0.15, ghost: false }),
  sensor:     Object.freeze({ friction: 0, restitution: 0.10, angularDamping: 0.10, ghost: false }),
  default:    Object.freeze({ friction: 0, restitution: 0.15, angularDamping: 0.05, ghost: false }),
});

// Structural give: contacts may not change a body's velocity by more than this per fixed tick
// beyond what its own commanded forces/impulses produced. Real plating flexes and crumples; a
// deep-penetration solver spike therefore lands as a firm shove, never a cannon launch. The
// commanded contribution is predicted exactly (impulses mutate linvel immediately; only
// continuous forces integrate inside world.step), so player/tether/AI physics pass through
// untouched — the clamp bites solver contact response alone.
const MAX_CONTACT_DV = 40;       // wu/s of contact-sourced linear delta-v per tick
const MAX_CONTACT_DW = 2.0;      // rad/s of contact-sourced yaw-rate delta per tick
const SANE_MAX_YAW_RATE = 6.0;   // absolute yaw-rate ceiling, above every legit tether clamp

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
    this._frameOrigin = {
      x: finite(options.frameOrigin && options.frameOrigin.x),
      z: finite(options.frameOrigin && options.frameOrigin.z),
    };
    this._frameOriginSeq = normalizeFrameOriginSeq(options.frameOriginSeq);
    this._frameScratch = { x: 0, z: 0 };
    this._globalScratch = { x: 0, z: 0 };
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
      frameOriginSeq: this._frameOriginSeq,
    };
    this.tick = 0;
    this.accumulator = 0;
    this.mode = String(options.mode || 'sg02-dynamic-lab');
    this.publishTelemetry = options.publishTelemetry !== false;
  }

  getFrameOrigin() { return this._frameOrigin; }
  getFrameOriginSeq() { return this._frameOriginSeq; }

  setFrameOrigin(origin, seq) {
    const nx = finite(origin && origin.x);
    const nz = finite(origin && origin.z);
    const nseq = normalizeFrameOriginSeq(seq);
    if (this._frameOrigin.x === nx && this._frameOrigin.z === nz && this._frameOriginSeq === nseq) return false;
    this._frameOrigin.x = nx;
    this._frameOrigin.z = nz;
    this._frameOriginSeq = nseq;
    this._diagnostics.frameOriginSeq = nseq;
    this._reprojectAllBodiesToFrame();
    return true;
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
    const sourceWorld = this._globalPointToFrameLocal(input.sourceWorld, owner.body.translation());
    const targetWorld = this._globalPointToFrameLocal(input.targetWorld, target.body.translation());
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
      forceScale: clamp(finite(input.forceScale, 1), 0, 4),
      reelRevision: Math.max(0, Math.trunc(finite(input.reelRevision))),
      springState: normalizeSpringState(input.springState),
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
    if (usesLegacyRopeSpring(attachment.spring)) {
      attachment.restLength = requested;
      attachment.reelRevision = Math.max(
        Math.max(0, Math.trunc(finite(attachment.reelRevision))) + 1,
        Math.max(0, Math.trunc(finite(input.reelRevision))),
      );
      attachment.spring = normalizeSpring(null, attachment.defId, attachment.break);
      attachment.springState = normalizeSpringState(input.springState);
      this._removeAttachmentJoints(attachment);
      this._createAttachmentJoints(attachment);
      return { restLength: attachment.restLength };
    }
    if (requested < attachment.restLength && attachment.springState) attachment.springState.reelSlip = true;
    attachment.restLength = safeReelRestLength(attachment, requested, this.fixedDt);
    return { restLength: attachment.restLength };
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
    const sourceLocal = worldAnchor(attachment.owner, attachment.anchorA);
    const targetLocal = worldAnchor(attachment.target, attachment.anchorB);
    const dx = targetLocal.x - sourceLocal.x;
    const dz = targetLocal.z - sourceLocal.z;
    const distance = Math.hypot(dx, dz);
    const nx = distance > 1e-9 ? dx / distance : 1;
    const nz = distance > 1e-9 ? dz / distance : 0;
    const ownerVelocity = attachment.owner.body.linvel();
    const targetVelocity = attachment.target.body.linvel();
    const relativeSpeed = (targetVelocity.x - ownerVelocity.x) * nx + (targetVelocity.z - ownerVelocity.z) * nz;
    const stretch = Math.max(0, distance - attachment.restLength);
    const springState = attachment.springState || createSpringState();
    const yank = finite(springState.lastYank || 0, 0);
    const legacyRope = usesLegacyRopeSpring(attachment.spring);
    const spring = legacyRope ? null : (attachment.spring || normalizeSpring(null, attachment.defId, attachment.break));
    const damping = legacyRope
      ? positive(attachment.break.damping, 0)
      : dampingForSpring(spring, reducedMass(attachment.owner, attachment.target));
    const fallbackTension = legacyRope
      ? stretch * positive(attachment.break.stiffness, 10) + relativeSpeed * damping
      : stretch * spring.K + damping * Math.max(0, relativeSpeed);
    const telemetryTension = Math.max(0, springState.lastTension || fallbackTension);
    const telemetryImpulse = Math.max(0, springState.lastImpulse || telemetryTension * this.fixedDt);
    const source = frameToGlobal(sourceLocal, this._frameOrigin);
    const target = frameToGlobal(targetLocal, this._frameOrigin);
    return Object.freeze({
      schemaVersion: SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
      attachmentId: attachment.id,
      restLength: attachment.restLength,
      distance,
      stretch,
      relativeSpeed,
      yank,
      tension: telemetryTension,
      impulse: telemetryImpulse,
      phase: legacyRope ? (stretch > STRETCH_EPSILON ? 'loaded' : 'slack') : (springState.phase || 'slack'),
      captureT: Math.max(0, finite(springState.captureT)),
      springK: legacyRope ? positive(attachment.break.stiffness, 10) : spring.K,
      springDamping: damping,
      breakRequested: legacyRope ? false : !!springState.breakRequested,
      springState: legacyRope ? null : Object.freeze(cloneSpringState(springState)),
      sourceWorld: Object.freeze(source),
      targetWorld: Object.freeze(target),
      tick: this.tick,
    });
  }

  _stepFixed() {
    for (const rec of this.dynamicRecords) {
      setZero3(rec.appliedForce);
      setZero3(rec.appliedTorque);
      setZero3(rec.controlForce);
      setZero3(rec.controlTorque);
      rec.maxSpeed = Infinity;
      resetBodyForces(rec.body);
      const command = consumePhysicsCommand(rec.entity);
      if (command) this._applyCommand(rec, command);
    }

    this._applyAttachmentSprings();

    // Structural-give baseline: at this point every impulse (dash, spring, combat) has already
    // mutated linvel/angvel; only the continuous control force/torque still integrates inside
    // world.step(). Predicting that lets the post-step pass isolate pure contact response.
    for (const rec of this.dynamicRecords) this._captureExpectedKinematics(rec);

    this.world.timestep = this.fixedDt;
    this.world.step();
    this.tick++;
    // Give first (bounds solver contact spikes), tether clamp second (its speed limits stay
    // authoritative — the give must never re-inflate a velocity the tether clamp reduced).
    for (const rec of this.dynamicRecords) this._applyStructuralGive(rec);
    this._clampLoadedTetherBodies();

    for (const rec of this.dynamicRecords) {
      const kinematics = this._enforcePlane(rec);
      this._clampSpeed(rec, kinematics);
      this._syncEntityFromKinematics(rec, kinematics);
      this._publishTelemetry(rec);
    }
  }

  _captureExpectedKinematics(rec) {
    const v = rec.body.linvel();
    const w = rec.body.angvel();
    const e = rec.expected || (rec.expected = { vx: 0, vz: 0, wy: 0 });
    e.vx = finite(v.x) + rec.controlForce.x / rec.spec.mass * this.fixedDt;
    e.vz = finite(v.z) + rec.controlForce.z / rec.spec.mass * this.fixedDt;
    e.wy = finite(w.y) + rec.controlTorque.y / rec.spec.inertiaY * this.fixedDt;
  }

  // Clamp the solver-contact contribution to this tick's velocity change (see MAX_CONTACT_DV).
  // Angular damping also lands in the "excess" term but at ≤0.7% of the rate per tick it never
  // approaches the clamp. The absolute yaw ceiling is the final sanity net: nothing in the game
  // may leave a body spinning faster than SANE_MAX_YAW_RATE, contacts or otherwise.
  _applyStructuralGive(rec) {
    const e = rec.expected;
    if (!e) return;
    const v = rec.body.linvel();
    const w = rec.body.angvel();
    let vx = finite(v.x);
    let vz = finite(v.z);
    let wy = finite(w.y);
    let touched = false;
    const dvx = vx - e.vx;
    const dvz = vz - e.vz;
    const dv = Math.hypot(dvx, dvz);
    if (dv > MAX_CONTACT_DV) {
      const scale = MAX_CONTACT_DV / dv;
      vx = e.vx + dvx * scale;
      vz = e.vz + dvz * scale;
      touched = true;
    }
    const dw = wy - e.wy;
    if (Math.abs(dw) > MAX_CONTACT_DW) {
      wy = e.wy + Math.sign(dw) * MAX_CONTACT_DW;
      touched = true;
    }
    if (Math.abs(wy) > SANE_MAX_YAW_RATE) {
      wy = clamp(wy, -SANE_MAX_YAW_RATE, SANE_MAX_YAW_RATE);
      touched = true;
    }
    if (!touched) return;
    rec.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    rec.body.setAngvel({ x: 0, y: wy, z: 0 }, true);
  }

  _createRecord(entity, spec) {
    const R = this.RAPIER;
    const local = globalToFrame(entity.pos, this._frameOrigin, this._frameScratch);
    const posX = local.x;
    const posZ = local.z;
    const globalX = finite(entity.pos && entity.pos.x);
    const globalZ = finite(entity.pos && entity.pos.z);
    const vel = vector3(entity.vel);
    const material = CONTACT_MATERIALS[spec.material] || CONTACT_MATERIALS.default;
    const desc = (spec.dynamic ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed())
      .setTranslation(posX, 0, posZ)
      .setRotation(quatFromYaw(finite(entity.rot)))
      .setLinvel(vel.x, 0, vel.z)
      .setAngvel({ x: 0, y: finite(entity.angVel), z: 0 })
      .enabledTranslations(true, false, true)
      .enabledRotations(false, true, false)
      .setCcdEnabled(!!spec.ccd);
    if (spec.dynamic && typeof desc.setCanSleep === 'function') {
      // SG-02 save/reload rebuilds Rapier bodies from authoritative sim pose/velocity. Sleeping is
      // hidden solver state, so dynamic bodies stay awake to keep taut attachments replay-stable.
      desc.setCanSleep(false);
    }
    if (spec.dynamic && material.angularDamping > 0 && typeof desc.setAngularDamping === 'function') {
      desc.setAngularDamping(material.angularDamping);
    }
    if (spec.dynamic && typeof desc.setAdditionalMassProperties === 'function') {
      desc.setAdditionalMassProperties(
        spec.mass,
        vector3(spec.centerOfMass),
        { x: 1, y: spec.inertiaY, z: 1 },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    }

    const body = this.world.createRigidBody(desc);
    const colliderDesc = R.ColliderDesc.ball(spec.radius)
      .setDensity(0)
      .setFriction(material.friction)
      .setRestitution(material.restitution);
    if (material.ghost && typeof colliderDesc.setCollisionGroups === 'function') {
      colliderDesc.setCollisionGroups(0);   // member of nothing, filters nothing → zero contacts
    }
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
      controlForce: zero3(),
      controlTorque: zero3(),
      expected: { vx: 0, vz: 0, wy: 0 },
      kinematics: {
        x: posX,
        z: posZ,
        vx: vel.x,
        vz: vel.z,
        yaw: finite(entity.rot),
        wy: finite(entity.angVel),
      },
      maxSpeed: Infinity,
      snapshot: {
        id: entity.id,
        x: quantize(globalX, this.quantum),
        z: quantize(globalZ, this.quantum),
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
      if (rec && massPropertiesOnlyChanged(rec, spec) && this._updateMassPropertiesInPlace(rec, spec)) {
        rec.entity = entity;
        this._maybeResyncBodyPose(rec, entity);
        return rec;
      }
      if (rec) this._removeRecord(entity.id, rec);
      const next = this._createRecord(entity, spec);
      this.records.set(entity.id, next);
      if (next.spec.dynamic) this.dynamicRecords.add(next);
      return next;
    }
    rec.entity = entity;
    this._maybeResyncBodyPose(rec, entity);
    return rec;
  }

  _maybeResyncBodyPose(rec, entity) {
    if (!rec || !rec.body || !entity) return false;
    const local = globalToFrame(entity.pos, this._frameOrigin, this._frameScratch);
    const p = rec.body.translation();
    const dx = local.x - finite(p.x);
    const dz = local.z - finite(p.z);
    const noInterp = !!(entity.flags && entity.flags.noInterp);
    if (!noInterp && dx * dx + dz * dz <= POSE_RESYNC_EPS2) return false;

    const yaw = finite(entity.rot);
    const vx = finite(entity.vel && entity.vel.x);
    const vz = finite(entity.vel && entity.vel.z);
    const wy = finite(entity.angVel);
    rec.body.setTranslation({ x: local.x, y: 0, z: local.z }, true);
    rec.body.setRotation(quatFromYaw(yaw), true);
    rec.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    rec.body.setAngvel({ x: 0, y: wy, z: 0 }, true);
    const kin = rec.kinematics || (rec.kinematics = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, wy: 0 });
    Object.assign(kin, { x: local.x, z: local.z, vx, vz, yaw, wy });
    rec.snapshot.id = entity.id;
    rec.snapshot.x = quantize(finite(entity.pos && entity.pos.x), this.quantum);
    rec.snapshot.z = quantize(finite(entity.pos && entity.pos.z), this.quantum);
    rec.snapshot.yaw = quantize(yaw, this.quantum);
    rec.snapshot.vx = quantize(vx, this.quantum);
    rec.snapshot.vz = quantize(vz, this.quantum);
    rec.snapshot.wy = quantize(wy, this.quantum);
    rec.snapshot.revision = rec.revision;
    if (noInterp && entity.flags) entity.flags.noInterp = false;
    return true;
  }

  _reprojectAllBodiesToFrame() {
    for (const rec of this.records.values()) {
      if (!rec.entity || !rec.body) continue;
      const local = globalToFrame(rec.entity.pos, this._frameOrigin, this._frameScratch);
      rec.body.setTranslation({ x: local.x, y: 0, z: local.z }, true);
      const kin = rec.kinematics || (rec.kinematics = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, wy: 0 });
      kin.x = local.x;
      kin.z = local.z;
      rec.snapshot.x = quantize(finite(rec.entity.pos && rec.entity.pos.x), this.quantum);
      rec.snapshot.z = quantize(finite(rec.entity.pos && rec.entity.pos.z), this.quantum);
    }
  }

  _globalPointToFrameLocal(source, fallbackTranslation) {
    if (source && typeof source === 'object' && (source.x != null || source.z != null)) {
      const local = globalToFrame(source, this._frameOrigin, this._frameScratch);
      return { x: local.x, y: finite(source.y), z: local.z };
    }
    return worldPoint(source, fallbackTranslation);
  }

  _updateMassPropertiesInPlace(rec, spec) {
    if (!rec.body || typeof rec.body.setAdditionalMassProperties !== 'function') return false;
    try {
      rec.body.setAdditionalMassProperties(
        spec.mass,
        vector3(spec.centerOfMass),
        { x: 1, y: spec.inertiaY, z: 1 },
        { x: 0, y: 0, z: 0, w: 1 },
        true,
      );
      rec.spec = spec;
      rec.revision = spec.revision;
      rec.snapshot.revision = spec.revision;
      return true;
    } catch (_) {
      return false;
    }
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
      add3Into(rec.controlForce, force);     // continuous-only tracker for the structural-give
      add3Into(rec.controlTorque, torque);   // baseline (impulses mutate velocity immediately)
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
    const global = frameToGlobal(kinematics, this._frameOrigin, this._globalScratch);
    pos.x = global.x;
    pos.z = global.z;
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
    for (const attachment of this.attachments.values()) {
      if (usesLegacyRopeSpring(attachment.spring)) continue;
      this._applyAttachmentSpring(attachment);
    }
    // reelSlip is an edge signal: setAttachmentReel sets it on each tick it actually shortens the
    // line (i.e. the player is still holding G this tick). Clearing it after the spring pass means
    // the +15% reel boost and the relaxed opening-speed guard only apply during ACTIVE reel — if
    // the player releases G, setAttachmentReel is not called next tick, reelSlip stays false, and
    // the line reverts to normal capture/hold behavior with the break-guard re-armed.
    for (const attachment of this.attachments.values()) {
      if (attachment.springState) attachment.springState.reelSlip = false;
    }
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

    const maxStretchRatio = positive(attachment.spring && attachment.spring.maxStretchRatio, MAX_STRETCH_RATIO);
    const reelSafeStretchRatio = positive(attachment.spring && attachment.spring.reelSafeStretchRatio,
      Math.min(REEL_SAFE_STRETCH_RATIO, Math.max(0.05, maxStretchRatio - 0.04)));

    if (state.reelSlip && restLength > 0 && stretch > restLength * maxStretchRatio * REEL_SLIP_RELENGTH_RATIO) {
      // Only pay out line when stretch is right at the break edge (a violently fleeing capital that
      // would otherwise snap). Normal reel-in no longer re-lengthens, so holding G actually hauls.
      restLength = distance / (1 + maxStretchRatio * REEL_SLIP_RELENGTH_RATIO);
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
      state.lastYank = 0;
      return;
    }

    velocityAtPointInto(scratch.velocityA, attachment.owner, source);
    velocityAtPointInto(scratch.velocityB, attachment.target, target);
    const relativeSpeed = (scratch.velocityB.x - scratch.velocityA.x) * nx + (scratch.velocityB.z - scratch.velocityA.z) * nz;
    const prevRel = finite(state.lastRelativeSpeed, 0);
    const yank = (relativeSpeed - prevRel) / this.fixedDt;
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
    // Active reel hauls harder so a thrusting target can't cancel the pull. GATED to reelSlip
    // (set only on an explicit shorten command from setAttachmentReel) and to the post-capture
    // regime: capture-phase k is left untouched so the soft-catch envelope (massline-feel golden)
    // is preserved. Damping is NOT boosted — only the spring term — so the line pulls harder
    // without becoming twitchy.
    const reelBoost = state.reelSlip && !inCapture ? REEL_BOOST_K_MULT : 1;
    let force = Math.max(0, k * reelBoost * stretch + c * relativeSpeed);
    // Active winch haul: when the player is reeling (reelSlip) and the target is opening distance
    // (positive relativeSpeed = target moving away), add an owner-biased pull beyond the spring so
    // hold-to-reel actually closes gap against a thrusting ship. Without this, a fleeing target's
    // thrust cancels the spring pull and the player never gains ground (the "won't reel in" bug).
    // The haul is proportional to the opening relativeSpeed and bounded so it can never dominate
    // the spring's elasticity model — it only offsets the target's escape velocity. Gated to the
    // post-capture regime so the soft-catch envelope is preserved.
    if (state.reelSlip && !inCapture && relativeSpeed > 0) {
      const haul = clamp(c * 0.6 * relativeSpeed, 0, k * stretch * 1.2);
      force += haul;
    }

    const breakStretch = restLength * maxStretchRatio;
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
      state.lastYank = yank;
      return;
    }

    const forceImpulse = force * this.fixedDt;
    const impulse = forceImpulse * clamp(finite(attachment.forceScale, 1), 0, 4);
    if (impulse > 0) {
      scratch.impulseA.x = nx * impulse;
      scratch.impulseA.y = 0;
      scratch.impulseA.z = nz * impulse;
      scratch.impulseB.x = -scratch.impulseA.x;
      scratch.impulseB.y = 0;
      scratch.impulseB.z = -scratch.impulseA.z;
      applyAttachmentImpulse(attachment, scratch.impulseA, scratch.impulseB, source, target, relativeSpeed);
      accumulateForce(attachment.owner, scratch.impulseA, this.fixedDt);
      accumulateForce(attachment.target, scratch.impulseB, this.fixedDt);
    }

    state.lastTension = force;
    state.lastImpulse = forceImpulse;
    state.lastRelativeSpeed = relativeSpeed;
    state.lastYank = yank;
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
    if (usesLegacyRopeSpring(attachment.spring)) {
      if (!this.RAPIER.JointData.rope) return;
      attachment.contactJoint = this.world.createImpulseJoint(
        this.RAPIER.JointData.rope(attachment.restLength, attachment.anchorA, attachment.anchorB),
        attachment.owner.body,
        attachment.target.body,
        true,
      );
      if (attachment.contactJoint && typeof attachment.contactJoint.setContactsEnabled === 'function') {
        attachment.contactJoint.setContactsEnabled(false);
      }
      return;
    }
    // Spring-mode masslines are integrated manually above. Do not also create a hard Rapier
    // impulse joint: that turns the soft line edge into a solver snap and can inject huge yaw.
  }

  _removeAttachmentJoints(attachment) {
    if (attachment.contactJoint && (!attachment.contactJoint.isValid || attachment.contactJoint.isValid())) {
      this.world.removeImpulseJoint(attachment.contactJoint, true);
    }
    attachment.contactJoint = null;
  }

  _clampLoadedTetherBodies() {
    for (const attachment of this.attachments.values()) {
      if (!isLoadedStandardTether(attachment)) continue;
      clampTetherLoadedYaw(attachment.owner, MAX_TETHER_LOADED_YAW_RATE);
      clampTetherLoadedSpeed(attachment.owner, tetherLoadedSpeedLimit(attachment, attachment.owner));
      clampTetherLoadedSpeed(attachment.target, tetherLoadedSpeedLimit(attachment, attachment.target));
    }
  }

  _releaseSpringOnCut(attachment, reason) {
    if (String(reason || '') !== 'tether_cut') return;
    if (attachment.defId !== 'tether_standard') return;
    applyTetherLinearReleaseKick(attachment);
    clampTetherReleaseYaw(attachment.owner, MAX_TETHER_RELEASE_YAW_RATE);
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
  const maxStretchRatio = positive(value && value.maxStretchRatio, positive(tune && tune.maxStretchRatio, MAX_STRETCH_RATIO));
  return {
    mode: value && value.mode === 'legacy_rope' ? 'legacy_rope' : 'spring',
    K: positive(value && value.K, positive(value && value.k, positive(tune && tune.K, positive(breakValue && breakValue.stiffness, 140)))),
    zeta: positive(value && value.zeta, positive(tune && tune.zeta, 0.95)),
    captureS: positive(value && value.captureS, positive(tune && tune.captureS, 0.35)),
    maxStretchRatio,
    reelSafeStretchRatio: positive(value && value.reelSafeStretchRatio,
      positive(tune && tune.reelSafeStretchRatio, Math.min(REEL_SAFE_STRETCH_RATIO, Math.max(0.05, maxStretchRatio - 0.04)))),
  };
}

function usesLegacyRopeSpring(spring) {
  return spring && spring.mode === 'legacy_rope';
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
    lastYank: 0,
    lastTension: 0,
    lastImpulse: 0,
  };
}

function normalizeSpringState(value = null) {
  const state = createSpringState();
  if (!value || typeof value !== 'object') return state;
  state.slackS = Math.max(0, finite(value.slackS, state.slackS));
  state.captureT = Math.max(0, finite(value.captureT, state.captureT));
  state.captureActive = !!value.captureActive;
  state.wasTaut = !!value.wasTaut;
  state.reelSlip = !!value.reelSlip;
  state.phase = typeof value.phase === 'string' && value.phase ? value.phase : state.phase;
  state.breakRequested = !!value.breakRequested;
  state.lastStretch = Math.max(0, finite(value.lastStretch));
  state.lastRelativeSpeed = finite(value.lastRelativeSpeed);
  state.lastYank = finite(value.lastYank);
  state.lastTension = Math.max(0, finite(value.lastTension));
  state.lastImpulse = Math.max(0, finite(value.lastImpulse));
  return state;
}

function cloneSpringState(value = null) {
  const state = normalizeSpringState(value);
  return {
    slackS: state.slackS,
    captureT: state.captureT,
    captureActive: state.captureActive,
    wasTaut: state.wasTaut,
    reelSlip: state.reelSlip,
    phase: state.phase,
    breakRequested: state.breakRequested,
    lastStretch: state.lastStretch,
    lastRelativeSpeed: state.lastRelativeSpeed,
    lastYank: state.lastYank,
    lastTension: state.lastTension,
    lastImpulse: state.lastImpulse,
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
  const spring = attachment.spring || normalizeSpring(null, attachment.defId, attachment.break);
  const maxStretchRatio = positive(spring && spring.maxStretchRatio, MAX_STRETCH_RATIO);
  const reelSafeStretchRatio = positive(spring && spring.reelSafeStretchRatio,
    Math.min(REEL_SAFE_STRETCH_RATIO, Math.max(0.05, maxStretchRatio - 0.04)));
  const state = attachment.springState;
  const activeReel = !!(state && state.reelSlip);
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
  // Active winch: shorten steadily against tension. Only the snap-break edge may veto a shorten —
  // the softer reelSafeStretch guard made haul-in impossible whenever the line was loaded and the
  // target was opening distance (the player "never got closer"). Passive / non-reel paths keep the
  // opening-speed guard so yanks still cannot snap the line through an accidental shorten.
  if (activeReel) {
    const minByBreakEdge = distance / (1 + maxStretchRatio);
    return Math.max(requested, minByBreakEdge);
  }
  const spanForGuard = distance + openingSpeed * Math.max(0, finite(dt));
  const minByGuard = spanForGuard / (1 + reelSafeStretchRatio);
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

function applyAttachmentImpulse(attachment, impulseA, impulseB, source, target, relativeSpeed) {
  if (attachment && attachment.defId === 'tether_standard') {
    applyCenterImpulse(attachment.owner, impulseA);
    applyCenterImpulse(attachment.target, impulseB);
    applyTetherNoseTorqueImpulse(attachment, source, target, relativeSpeed);
    clampTetherLoadedYaw(attachment.owner, MAX_TETHER_LOADED_YAW_RATE);
    clampTetherLoadedSpeed(attachment.owner, tetherLoadedSpeedLimit(attachment, attachment.owner));
    clampTetherLoadedSpeed(attachment.target, tetherLoadedSpeedLimit(attachment, attachment.target));
    return;
  }
  applyImpulseAtPoint(attachment.owner, impulseA, source);
  applyImpulseAtPoint(attachment.target, impulseB, target);
}

function applyCenterImpulse(rec, impulse) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body) return;
  rec.body.applyImpulse(impulse, true);
}

function applyImpulseAtPoint(rec, impulse, point) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body) return;
  if (typeof rec.body.applyImpulseAtPoint === 'function') {
    rec.body.applyImpulseAtPoint(impulse, point, true);
    return;
  }
  rec.body.applyImpulse(impulse, true);
}

function applyTetherNoseTorqueImpulse(attachment, source, target, relativeSpeed) {
  const rec = attachment && attachment.owner;
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body) return;
  if (!source || !target) return;
  const ownerPos = rec.body.translation();
  const dx = finite(target.x) - finite(ownerPos.x);
  const dz = finite(target.z) - finite(ownerPos.z);
  const distance = Math.hypot(dx, dz);
  if (!(distance > 1e-6)) return;

  const desired = Math.atan2(dz, dx);
  const yaw = yawFromQuat(rec.body.rotation());
  const error = wrapAngle(desired - yaw);
  if (Math.abs(error) <= 0.001) return;

  const ownerV = rec.body.linvel();
  const targetBody = attachment.target && attachment.target.body;
  const targetV = targetBody && typeof targetBody.linvel === 'function'
    ? targetBody.linvel()
    : zero3();
  const nx = dx / distance;
  const nz = dz / distance;
  const tangentSpeed = (finite(ownerV.x) - finite(targetV.x)) * -nz + (finite(ownerV.z) - finite(targetV.z)) * nx;
  const authority = clamp(
    (Math.abs(tangentSpeed) + Math.max(0, finite(relativeSpeed)) * 0.35) / TETHER_NOSE_SPEED_FOR_AUTHORITY,
    0,
    1,
  );
  const maxRate = TETHER_NOSE_BASE_RATE + TETHER_NOSE_SPEED_RATE * authority;
  const targetRate = clamp(error * TETHER_NOSE_RATE_GAIN, -maxRate, maxRate);
  const currentRate = yawRate(rec);
  const maxDelta = 0.11 + authority * 0.30;
  const deltaRate = clamp(targetRate - currentRate, -maxDelta, maxDelta);
  if (Math.abs(deltaRate) <= 1e-5) return;
  const inertia = positive(rec.spec && rec.spec.inertiaY, 1);
  rec.body.applyTorqueImpulse({ x: 0, y: deltaRate * inertia, z: 0 }, true);
}

function clampTetherLoadedYaw(rec, limit) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body || !(limit > 0)) return;
  const current = yawRate(rec);
  const next = clamp(current, -limit, limit);
  if (Math.abs(next - current) > 1e-9 && typeof rec.body.setAngvel === 'function') {
    rec.body.setAngvel({ x: 0, y: next, z: 0 }, true);
  }
  if (rec.entity) rec.entity.angVel = next;
}

function clampTetherLoadedSpeed(rec, limit) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body || !(limit > 0)) return;
  const v = rec.body.linvel();
  const vx = finite(v && v.x);
  const vz = finite(v && v.z);
  const speed = Math.hypot(vx, vz);
  if (!(speed > limit) || speed <= 1e-9) return;
  const scale = limit / speed;
  const next = { x: vx * scale, y: 0, z: vz * scale };
  rec.body.setLinvel(next, true);
  if (rec.entity && rec.entity.vel) {
    rec.entity.vel.x = next.x;
    rec.entity.vel.z = next.z;
  }
}

function clampTetherReleaseYaw(rec, limit) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body || !(limit > 0)) return;
  const current = yawRate(rec);
  const next = clamp(current, -limit, limit);
  if (typeof rec.body.setAngvel === 'function' && Math.abs(next - current) > 1e-9) {
    rec.body.setAngvel({ x: 0, y: next, z: 0 }, true);
  }
  if (rec.entity) rec.entity.angVel = next;
}

function isLoadedStandardTether(attachment) {
  if (!attachment || attachment.defId !== 'tether_standard') return false;
  const state = attachment.springState;
  if (!state) return false;
  if (state.lastStretch > STRETCH_EPSILON) return true;
  const phase = String(state.phase || 'slack');
  return phase !== 'slack';
}

function tetherLoadedSpeedLimit(attachment, rec) {
  const base = positive(rec && rec.entity && rec.entity.maxSpeed, 170);
  const opening = Math.max(0, finite(attachment && attachment.springState && attachment.springState.lastRelativeSpeed));
  if (opening > 0.5) {
    return clamp(base + MAX_TETHER_OPENING_SPEED_PAD, MIN_TETHER_OPENING_SPEED_LIMIT, MAX_TETHER_OPENING_SPEED_LIMIT);
  }
  return clamp(base * 1.75 + 40, MIN_TETHER_ABSOLUTE_SPEED_LIMIT, MAX_TETHER_ABSOLUTE_SPEED_LIMIT);
}

function yawRate(rec) {
  const w = rec && rec.body && typeof rec.body.angvel === 'function' ? rec.body.angvel() : null;
  return finite(w && w.y, finite(rec && rec.entity && rec.entity.angVel));
}

function applyTetherLinearReleaseKick(attachment) {
  const rec = attachment && attachment.owner;
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body) return;
  const scratch = attachment.springScratch || (attachment.springScratch = createSpringScratch());
  const source = worldAnchorInto(scratch.source, rec, attachment.anchorA);
  const target = worldAnchorInto(scratch.target, attachment.target, attachment.anchorB);
  const dx = target.x - source.x;
  const dz = target.z - source.z;
  const distance = Math.hypot(dx, dz);
  const stretch = Math.max(0, distance - positive(attachment.restLength, distance));
  if (!(stretch > STRETCH_EPSILON)) return;
  const nx = distance > 1e-9 ? dx / distance : 1;
  const nz = distance > 1e-9 ? dz / distance : 0;
  velocityAtPointInto(scratch.velocityA, rec, source);
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
  const mass = effectiveMass(rec);
  if (!Number.isFinite(mass) || !(mass > 0)) return;
  const spring = attachment.spring || normalizeSpring(null, attachment.defId, attachment.break);
  const releaseSpeed = Math.min(55, Math.sqrt(Math.max(0, spring.K * stretch * stretch / mass)) * 0.45);
  if (!(releaseSpeed > 0)) return;
  scratch.impulseA.x = tx * releaseSpeed * mass;
  scratch.impulseA.y = 0;
  scratch.impulseA.z = tz * releaseSpeed * mass;
  rec.body.applyImpulse(scratch.impulseA, true);
  if (rec.entity && rec.entity.vel) {
    rec.entity.vel.x += scratch.impulseA.x / mass;
    rec.entity.vel.z += scratch.impulseA.z / mass;
  }
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
    rec.spec.inertiaY === spec.inertiaY &&
    rec.spec.material === spec.material;   // material drives collider friction/restitution/groups
}

function massPropertiesOnlyChanged(rec, spec) {
  if (!rec || !rec.spec || !spec) return false;
  const current = rec.spec;
  const massChanged = current.mass !== spec.mass || current.inertiaY !== spec.inertiaY;
  return massChanged &&
    current.dynamic === spec.dynamic &&
    current.ccd === spec.ccd &&
    current.radius === spec.radius &&
    current.material === spec.material;
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

function normalizeFrameOriginSeq(seq) {
  if (Number.isSafeInteger(seq) && seq >= 0) return seq;
  const n = Math.trunc(finite(seq));
  return n >= 0 ? n : 0;
}
