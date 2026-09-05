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
import {
  expandProxyPrimitives,
  proxyScaleFor,
  resolveCollisionProxyManifest,
} from '../data/collisionProxyManifests.js';
import { SHIPS } from '../data/ships.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { frameToGlobal, globalToFrame } from './coordinates.js';
import { loadRapierCompatRuntime } from './rapierCompatRuntime.js';
import { resolveGovernedCombatSpeed } from './flight/propulsionCatalog.js';

export const SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION = 1;
export const SG02_DYNAMIC_BODY_OWNER_DT = 1 / 60;
export const SG02_DYNAMIC_BODY_OWNER_QUANTUM = 1e-4;
// Contact-force receipts are gameplay signals, not solver inputs. A zero threshold makes every
// resting hull pressure and compound-proxy scrape cross the WASM event queue even though the
// smallest routed gameplay impact is 50 impulse. At the production 60 Hz step this floor is only
// 1 impulse, so meaningful damage/mission/audio/VFX contacts remain far above it while contact
// response itself stays bit-for-bit inside Rapier.
export const SG02_CONTACT_FORCE_EVENT_THRESHOLD_N = 60;
const POSE_RESYNC_EPS2 = 1e-4;

const CAPTURE_SLACK_S = 0.1;
const REELED_ATTACHMENT_REPLAY_QUANTUM = 1e-7;
const MAX_STRETCH_RATIO = 0.45;
const REEL_SAFE_STRETCH_RATIO = 0.43;
const STRETCH_EPSILON = 1e-6;
// THE ROPE IS A ROPE (PQ-137.07, FEEL_CONTRACT bar B7; design/VISION.md "swing around a huge
// asteroid and let go flying"). A spring with an authored K stretches in proportion to the load it
// carries, and a hull swinging at 1.5x cruise on a 100 WU line carries mu * v_t^2 / r of it: with
// K = 140 that stretched the line 10 % on the real path (41 % by the audit's arithmetic), and read
// as a bungee. A rope does not care how hard you swing. Its stiffness rises with the coupled load,
// so the line stays within this fraction of its length under whatever swing it is asked to hold,
// and the authored K remains the floor that shapes the gentle regime and the soft catch.
const LOAD_STRETCH_RATIO = 0.05;
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
const SPRING_TUNES = Object.freeze({
  tether_standard: Object.freeze({ K: 140, zeta: 0.95, captureS: 0.35, maxStretchRatio: 1.44, reelSafeStretchRatio: 1.32 }),
  attachment_massline: Object.freeze({ K: 170, zeta: 0.90, captureS: 0.30 }),
});

// Contact-response materials, keyed by physicsBody.material (physicsAuthority.defaultMaterial).
// friction is 0 EVERYWHERE: hulls in vacuum have no grip, and — mechanically — contact friction
// on ball colliders is what converted every bump into huge yaw spin (tangential impulse × body
// radius over the yaw inertia) and then converted that spin back into linear velocity. Zero
// friction removes both failure modes at the source; hulls scrape and slide instead.
// Craft restitution is 0 with a Min combine rule so a ship glancing a rock scrapes instead of
// bouncing onto a new heading. Offset capsule contacts still try to yaw the hull; structural
// give strips leftover contact yaw so the nose stays where the pilot/AI pointed it. Weapon and
// Massline torque still land because they are queued before the contact baseline is captured.
// Rock keeps a harder edge for debris-on-debris. angularDamping models RCS on leftover spin
// from authored combat impulses; debris and wrecks keep tumbling.
// `ghost` colliders join no contact pairs at all: projectiles do their damage through the
// swept-segment tests in physics.js — a solver contact on top of that double-hit every target
// with real momentum (~20 wu/s per bullet), which is why combat shoved ships around at random.
const CONTACT_MATERIALS = Object.freeze({
  ship:       Object.freeze({ friction: 0, restitution: 0,    angularDamping: 0.4, ghost: false, restitutionCombine: 'min' }),
  projectile: Object.freeze({ friction: 0, restitution: 0,    angularDamping: 0,    ghost: true }),
  rock:       Object.freeze({ friction: 0, restitution: 0.22, angularDamping: 0.02, ghost: false }),
  station:    Object.freeze({ friction: 0, restitution: 0.06, angularDamping: 0,    ghost: false }),
  debris:     Object.freeze({ friction: 0, restitution: 0.16, angularDamping: 0.06, ghost: false }),
  payload:    Object.freeze({ friction: 0, restitution: 0.10, angularDamping: 0.15, ghost: false }),
  // Keeps a dynamic body available to the attachment authority while excluding the authored
  // sensor payload from every solver/contact pair. World-site payloads spawn inside assemblies.
  massline_sensor: Object.freeze({ friction: 0, restitution: 0, angularDamping: 0.15, ghost: true }),
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
const MAX_CONTACT_DW = 2.0;      // rad/s of contact-sourced yaw-rate delta per tick (debris/rocks)
const CRAFT_CONTACT_YAW_EPS = 0.05;     // leftover contact spin; above damping/solver noise
const SANE_MAX_YAW_RATE = 6.0;   // absolute yaw-rate ceiling, above every legit tether clamp
const HELM_LOCKED_TYPES = new Set(['ship', 'drone']);

export const PLAYER_CONTACT_RESPONSE_FRACTION = 0.25;
export const PLAYER_CONTACT_MAX_CRUISE_FRACTION = 0.10;
export const PLAYER_CONTACT_EVENT_BRIDGE_TICKS = 6;
export const PLAYER_CONTACT_ACTIVITY_EPSILON = 1e-3; // WU/s

// Rank-1 CCD gate (physics-spike diagnosis): CCD on every craft × dense static fields makes
// Rapier TOI work bursty/super-linear. Reserve CCD for genuine fast movers — projectiles
// always (mirrors legacy rapierCollisionWorld wantsCcd), boosting craft, and craft above the
// enable speed; hysteresis keeps the gate from flapping around the band. Idle-craft contacts
// are unchanged: below the gate a body moves < 2.5 wu/tick against ≥10 wu collider radii, so
// discrete collision sees the same contacts CCD would have caught.
const CCD_GATE_ENABLE_SPEED = 150;   // wu/s, above every authored cruise max (~147)
const CCD_GATE_DISABLE_SPEED = 120;  // hysteresis floor while enabled
const DIRECT_CONTACT_CAUSAL_EPSILON = 1e-6;

// Identify a direct-contact initiator from each body's pre-contact contribution toward the other.
// The contact normal must point from A to B. World-space tangential speed is irrelevant, and a
// degenerate/non-closing contact or numerical tie deliberately carries no actor. Positional scalar
// arguments keep this shared custom/Rapier seam allocation-free inside the physics hot loop.
export function directContactCausalActorId(aId, bId, aVx, aVz, bVx, bVz, nx, nz) {
  const normalLength = Math.hypot(finite(nx), finite(nz));
  if (!(normalLength > DIRECT_CONTACT_CAUSAL_EPSILON)) return null;
  const normalX = finite(nx) / normalLength;
  const normalZ = finite(nz) / normalLength;
  const aNormalSpeed = finite(aVx) * normalX + finite(aVz) * normalZ;
  const bNormalSpeed = finite(bVx) * normalX + finite(bVz) * normalZ;
  const closureScale = Math.max(1, Math.abs(aNormalSpeed), Math.abs(bNormalSpeed));
  if (aNormalSpeed - bNormalSpeed <= DIRECT_CONTACT_CAUSAL_EPSILON * closureScale) return null;
  const aContribution = Math.max(0, aNormalSpeed);
  const bContribution = Math.max(0, -bNormalSpeed);
  const scale = Math.max(1, aContribution, bContribution);
  if (Math.abs(aContribution - bContribution) <= DIRECT_CONTACT_CAUSAL_EPSILON * scale) return null;
  return aContribution > bContribution ? aId : bId;
}

// Radial pre-solve closing speed along A-to-B center separation. Static bodies pass 0 velocity.
// Separating and tangential pairs are 0; this is not total relative speed and never abs().
export function preSolveRadialClosingSpeed(aVx, aVz, bVx, bVz, nABx, nABz) {
  const normalLength = Math.hypot(finite(nABx), finite(nABz));
  if (!(normalLength > DIRECT_CONTACT_CAUSAL_EPSILON)) return 0;
  const normalX = finite(nABx) / normalLength;
  const normalZ = finite(nABz) / normalLength;
  const closing = (finite(aVx) - finite(bVx)) * normalX + (finite(aVz) - finite(bVz)) * normalZ;
  return closing > 0 ? closing : 0;
}


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
    applyTorqueImpulse(input) { return owner.applyTorqueImpulse(input); },
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
    this.captureContactImpacts = options.captureContactImpacts !== false;
    this._colliderOwners = new Map();
    this._ghostProjectilePool = new Map();
    this._contactImpacts = [];
    this._eventQueue = this.captureContactImpacts && typeof RAPIER.EventQueue === 'function'
      ? new RAPIER.EventQueue(true) : null;
    this._liveEntityIds = new Set();
    this._liveStaticEntityIds = new Set();
    this._liveDynamicEntityIds = new Set();
    // The normal player-route save/load replaces the simulation entity object while the
    // authoritative Rapier body remains alive. These ids skip one forced scalar pose write after
    // a verified rebind, preserving the body's private numerical continuity across that swap.
    this._reboundEntityIds = new Set();
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
      colliders: 0,
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

  /**
   * Rebind a restored entity to its existing authoritative body when its saved scalar kinematics
   * still describe that body. A materially different save remains authoritative: the ordinary
   * sync path will resync the body from the restored scalars on the next pass.
   */
  rebindEntity(entity) {
    if (!entity || entity.alive === false) return false;
    const rec = this.records.get(entity.id);
    if (!rec || !rec.spec || !rec.spec.dynamic || !bodyStateMatchesEntity(rec, entity, this._frameOrigin, this._frameScratch)) {
      return false;
    }
    rec.entity = entity;
    this._reboundEntityIds.add(entity.id);
    if (entity.flags) entity.flags.noInterp = false;
    return true;
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
        if (this._reuseUnchangedStaticRecord(entity, spec)) continue;
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
      // `orderedEntities` preserves canonical cross-layer body creation order when a static
      // version changes. An existing dynamic encountered there has already consumed this tick's
      // authoritative entity object, so visiting it again here only repeats pose/WASM reads.
      if (dynamicLive.has(entity.id) && this.records.get(entity.id)?.entity === entity) {
        dynamicCount++;
        continue;
      }
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

  _reuseUnchangedStaticRecord(entity, spec) {
    const rec = this.records.get(entity.id);
    if (!rec || rec.spec.dynamic || !recordMatchesSpec(rec, spec)) return false;
    if (rec.proxyId !== proxyIdForEntity(entity)) return false;
    const kinematics = rec.kinematics;
    if (!kinematics || (entity.flags && entity.flags.noInterp)) return false;
    const localX = finite(entity.pos && entity.pos.x) - this._frameOrigin.x;
    const localZ = finite(entity.pos && entity.pos.z) - this._frameOrigin.z;
    const dx = localX - finite(kinematics.x);
    const dz = localZ - finite(kinematics.z);
    if (dx * dx + dz * dz > POSE_RESYNC_EPS2) return false;
    // Keep event/ownership identity current even when a save/rebuild supplied an equivalent
    // replacement object. This mirrors `_syncRecord` without touching Rapier.
    rec.entity = entity;
    return true;
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
    let colliders = 0;
    for (const rec of this.records.values()) {
      colliders += Array.isArray(rec.colliders) && rec.colliders.length ? rec.colliders.length : 1;
    }
    const diag = this._diagnostics;
    diag.tick = this.tick;
    diag.fixedDt = this.fixedDt;
    diag.bodies = this.records.size;
    diag.colliders = colliders;
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
    for (const bucket of this._ghostProjectilePool.values()) {
      for (const entry of bucket) {
        for (const collider of entry.colliders) this.world.removeCollider(collider, false);
        this.world.removeRigidBody(entry.body);
      }
    }
    this._ghostProjectilePool.clear();
    if (this.world && typeof this.world.free === 'function') this.world.free();
    if (this._eventQueue && typeof this._eventQueue.free === 'function') this._eventQueue.free();
    this._eventQueue = null;
    this._colliderOwners.clear();
    this._contactImpacts.length = 0;
    this._reboundEntityIds.clear();
  }

  applyImpulse(input = {}) {
    const rec = this.records.get(input.entityId);
    if (!rec || !rec.spec.dynamic) return false;
    const impulse = planeForce(input.impulse);
    if (input.point && typeof rec.body.applyImpulseAtPoint === 'function') {
      rec.body.applyImpulseAtPoint(impulse, this._globalPointToFrameLocal(input.point, rec.body.translation()), true);
    } else {
      rec.body.applyImpulse(impulse, true);
    }
    return true;
  }

  applyTorqueImpulse(input = {}) {
    const rec = this.records.get(input.entityId);
    return applyYawTorqueImpulse(rec, input.impulse);
  }

  drainContactImpacts() {
    if (!this._contactImpacts.length) return [];
    const out = this._contactImpacts.slice();
    this._contactImpacts.length = 0;
    return out;
  }

  createAttachment(input = {}) {
    const attachmentId = String(input.attachmentId || '');
    if (!attachmentId || this.attachments.has(attachmentId)) return false;
    const owner = this.records.get(input.ownerId);
    const target = this.records.get(input.targetId);
    if (!owner || !target || owner === target) return false;
    const sourceWorld = this._globalPointToFrameLocal(input.sourceWorld, owner.body.translation());
    const targetWorld = this._globalPointToFrameLocal(input.targetWorld, target.body.translation());
    const sourceAnchorLocal = normalizeLocalAnchor(input.sourceAnchorLocal);
    const targetAnchorLocal = normalizeLocalAnchor(input.targetAnchorLocal);
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
      anchorA: sourceAnchorLocal || localAnchorFromWorld(owner, sourceWorld),
      anchorB: targetAnchorLocal || localAnchorFromWorld(target, targetWorld),
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
    const relativeVelocityX = targetVelocity.x - ownerVelocity.x;
    const relativeVelocityZ = targetVelocity.z - ownerVelocity.z;
    const relativeSpeed = relativeVelocityX * nx + relativeVelocityZ * nz;
    const stretch = Math.max(0, distance - attachment.restLength);
    const springState = attachment.springState || createSpringState();
    const yank = finite(springState.lastYank || 0, 0);
    const legacyRope = usesLegacyRopeSpring(attachment.spring);
    const spring = legacyRope ? null : (attachment.spring || normalizeSpring(null, attachment.defId, attachment.break));
    const frameCoupler = usesFrameCoupler(spring);
    const damping = legacyRope
      ? positive(attachment.break.damping, 0)
      : frameCoupler ? 0
        : dampingForSpring(spring, reducedMass(attachment.owner, attachment.target));
    const fallbackTension = legacyRope
      ? stretch * positive(attachment.break.stiffness, 10) + relativeSpeed * damping
      : frameCoupler
        ? 0
        : Math.min(spring.maxForce, stretch * spring.K + damping * Math.max(0, relativeSpeed));
    // Coupler state is initialized at creation, so zero is a measured zero (capture ramp, matched
    // frames, or slack), not a missing sample to replace with a hypothetical full-gain force.
    const telemetryTension = frameCoupler
      ? Math.max(0, springState.lastTension)
      : Math.max(0, springState.lastTension || fallbackTension);
    const telemetryImpulse = frameCoupler
      ? Math.max(0, springState.lastImpulse)
      : Math.max(0, springState.lastImpulse || telemetryTension * this.fixedDt);
    const source = frameToGlobal(sourceLocal, this._frameOrigin);
    const target = frameToGlobal(targetLocal, this._frameOrigin);
    // Coordinate conversion is intentionally XZ-only, but the SG-02 attachment telemetry schema
    // is a 3D point contract. Restore the gameplay plane explicitly instead of leaking undefined
    // y values to checks and downstream physics diagnostics.
    source.y = 0;
    target.y = 0;
    return Object.freeze({
      schemaVersion: SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
      attachmentId: attachment.id,
      restLength: attachment.restLength,
      distance,
      stretch,
      relativeSpeed,
      frameErrorSpeed: frameCoupler ? Math.max(0, relativeSpeed) : 0,
      yank,
      tension: telemetryTension,
      impulse: telemetryImpulse,
      phase: legacyRope ? (stretch > STRETCH_EPSILON ? 'loaded' : 'slack') : (springState.phase || 'slack'),
      captureT: Math.max(0, finite(springState.captureT)),
      springK: legacyRope ? positive(attachment.break.stiffness, 10) : frameCoupler ? 0 : spring.K,
      springDamping: damping,
      // The stiffness the line actually carried this tick (authored K or the load-scaled value,
      // whichever held), the load-scaled value itself, and the worse of the geometric edge and
      // the load rating. B7's instrument reads these; the HUD reads phase.
      stiffness: legacyRope || frameCoupler ? null : Math.max(0, finite(springState.lastStiffness, spring.K)),
      loadStiffness: legacyRope || frameCoupler ? null : Math.max(0, finite(springState.lastLoadStiffness, 0)),
      overloadRatio: legacyRope || frameCoupler ? null : Math.max(0, finite(springState.lastOverloadRatio, 0)),
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
      this._applyBodyResponse(rec, command && command.bodyResponse);
      if (command) this._applyCommand(rec, command);
    }

    this._applyAttachmentSprings();

    // Structural-give baseline: at this point every impulse (dash, spring, combat) has already
    // mutated linvel/angvel; only the continuous control force/torque still integrates inside
    // world.step(). Predicting that lets the post-step pass isolate pure contact response.
    for (const rec of this.dynamicRecords) this._captureExpectedKinematics(rec);

    this.world.timestep = this.fixedDt;
    let stepReceipts = [];
    if (this._eventQueue) {
      this.world.step(this._eventQueue);
      stepReceipts = this._captureContactImpacts() || [];
    } else {
      this.world.step();
    }
    this.tick++;
    // Bound solver contact spikes before publishing the authoritative motion snapshot.
    for (const rec of this.dynamicRecords) this._applyStructuralGive(rec);

    if (stepReceipts.length > 0) {
      this._distributeAppliedPlayerDeltaV(stepReceipts);
      this._contactImpacts.push(...stepReceipts);
    }

    for (const rec of this.dynamicRecords) {
      const kinematics = this._enforcePlane(rec);
      this._clampSpeed(rec, kinematics);
      if (this._hasManualSpringAttachment(rec)) this._canonicalizeManualSpringBody(rec, kinematics);
      this._syncEntityFromKinematics(rec, kinematics);
      this._publishTelemetry(rec);
    }
  }

  _hasManualSpringAttachment(rec) {
    for (const attachment of this.attachments.values()) {
      const reeled = Math.max(0, Math.trunc(finite(attachment.reelRevision))) > 0;
      if (reeled && !usesLegacyRopeSpring(attachment.spring)
        && (attachment.owner === rec || attachment.target === rec)) return true;
    }
    return false;
  }

  _canonicalizeManualSpringBody(rec, kinematics) {
    // A save/load rebuild necessarily discards Rapier's private solver history. Manual springs are
    // otherwise fully serialized, so keep their participating bodies on a deterministic lattice
    // 1,000x finer than SG-02's published snapshot quantum. This prevents reconstruction noise from
    // accumulating into replay-visible drift without quantizing unrelated or unreelled bodies.
    const x = quantize(kinematics.x, REELED_ATTACHMENT_REPLAY_QUANTUM);
    const z = quantize(kinematics.z, REELED_ATTACHMENT_REPLAY_QUANTUM);
    const yaw = quantize(kinematics.yaw, REELED_ATTACHMENT_REPLAY_QUANTUM);
    const vx = quantize(kinematics.vx, REELED_ATTACHMENT_REPLAY_QUANTUM);
    const vz = quantize(kinematics.vz, REELED_ATTACHMENT_REPLAY_QUANTUM);
    const wy = quantize(kinematics.wy, REELED_ATTACHMENT_REPLAY_QUANTUM);
    rec.body.setTranslation({ x, y: 0, z }, true);
    rec.body.setRotation(quatFromYaw(yaw), true);
    rec.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    rec.body.setAngvel({ x: 0, y: wy, z: 0 }, true);
    Object.assign(kinematics, { x, z, yaw, vx, vz, wy });
  }

  _captureExpectedKinematics(rec) {
    const v = rec.body.linvel();
    const w = rec.body.angvel();
    const e = rec.expected || (rec.expected = { vx: 0, vz: 0, wy: 0 });
    const dt = this.fixedDt;
    e.vx = finite(v.x) + rec.controlForce.x / positive(rec.effectiveMass, rec.spec.mass) * dt;
    e.vz = finite(v.z) + rec.controlForce.z / positive(rec.effectiveMass, rec.spec.mass) * dt;
    const wyUndamped = finite(w.y)
      + rec.controlTorque.y / positive(rec.effectiveInertiaY, rec.spec.inertiaY) * dt;
    const damping = contactAngularDamping(rec);
    e.wy = damping > 0 ? wyUndamped / (1 + damping * dt) : wyUndamped;
    // Rapier can integrate a contact-generated angular response into the pose before the
    // post-step structural-give pass clamps that response's angular velocity. Keep the pose a
    // no-contact prediction so a glancing station/rock contact cannot leave a one-frame heading
    // kick behind after its spin has been removed.
    e.yaw = wrapAngle(yawFromQuat(rec.body.rotation()) + e.wy * dt);
  }

  // PQ-137.11: player contact structural give.
  // The player is not ammunition. Preserves the no-contact baseline from _captureExpectedKinematics(),
  // restricts contact velocity response to along heading, limits response to 25% of solver dV,
  // enforces cumulative 10% cruise cap across contact episodes, strips contact yaw, and prevents reversal.
  _applyPlayerStructuralGive(rec) {
    const e = rec.expected;
    if (!e) return 0;
    const v = rec.body.linvel();
    const vx = finite(v.x);
    const vz = finite(v.z);
    const dvx = vx - e.vx;
    const dvz = vz - e.vz;
    const dMag = Math.hypot(dvx, dvz);

    let appliedAlong = 0;
    let actualPlayerDeltaV = 0;

    const isActive = dMag > PLAYER_CONTACT_ACTIVITY_EPSILON;
    if (isActive) {
      const lastTick = rec._playerContactLastTick;
      const gap = Number.isFinite(lastTick) ? this.tick - lastTick : Infinity;
      if (gap > PLAYER_CONTACT_EVENT_BRIDGE_TICKS) {
        rec._playerContactCumulativeDeltaV = 0;
      }
      rec._playerContactLastTick = this.tick;

      const expectedSpeed = Math.hypot(e.vx, e.vz);
      if (expectedSpeed <= PLAYER_CONTACT_ACTIVITY_EPSILON) {
        appliedAlong = 0;
      } else {
        const hx = e.vx / expectedSpeed;
        const hz = e.vz / expectedSpeed;
        const dotD = dvx * hx + dvz * hz;
        const candidateAlong = dotD * PLAYER_CONTACT_RESPONSE_FRACTION;
        const fallback = (rec.entity && (rec.entity.combatSpeed || rec.entity.maxSpeed)) || 0;
        const cruise = resolveGovernedCombatSpeed(rec.entity, null, fallback);
        const eventBudget = PLAYER_CONTACT_MAX_CRUISE_FRACTION * cruise;
        const cumulative = rec._playerContactCumulativeDeltaV || 0;
        const remainingBudget = Math.max(0, eventBudget - cumulative);

        appliedAlong = clamp(candidateAlong, -remainingBudget, remainingBudget);
        if (appliedAlong < -expectedSpeed) {
          appliedAlong = -expectedSpeed;
        }
      }

      actualPlayerDeltaV = Math.abs(appliedAlong);
      rec._playerContactCumulativeDeltaV = (rec._playerContactCumulativeDeltaV || 0) + actualPlayerDeltaV;
    }

    let finalVx = e.vx;
    let finalVz = e.vz;
    if (appliedAlong !== 0) {
      const expectedSpeed = Math.hypot(e.vx, e.vz);
      const hx = e.vx / expectedSpeed;
      const hz = e.vz / expectedSpeed;
      finalVx += hx * appliedAlong;
      finalVz += hz * appliedAlong;
    }
    rec.body.setLinvel({ x: finalVx, y: 0, z: finalVz }, true);

    const yaw = Number.isFinite(e.yaw) ? e.yaw : 0;
    rec.body.setRotation(quatFromYaw(yaw), true);
    rec.body.setAngvel({ x: 0, y: finite(e.wy), z: 0 }, true);

    rec._lastAppliedPlayerDeltaV = actualPlayerDeltaV;
    return actualPlayerDeltaV;
  }

  _distributeAppliedPlayerDeltaV(receipts) {
    for (const rec of this.records.values()) {
      if (rec.entity && rec.entity.isPlayer === true) {
        const playerId = rec.entity.id;
        const playerReceipts = receipts.filter(
          (r) => r.aId === playerId || r.bId === playerId
        );
        if (playerReceipts.length > 0) {
          const actualApplied = rec._lastAppliedPlayerDeltaV || 0;
          let totalImpulse = 0;
          for (const r of playerReceipts) totalImpulse += finite(r.impulse, 0);
          let assigned = 0;
          for (let i = 0; i < playerReceipts.length; i++) {
            const r = playerReceipts[i];
            if (i === playerReceipts.length - 1) {
              r.appliedPlayerDeltaV = actualApplied - assigned;
              continue;
            }
            const share = totalImpulse > 0
              ? (finite(r.impulse, 0) / totalImpulse) * actualApplied
              : actualApplied / playerReceipts.length;
            r.appliedPlayerDeltaV = share;
            assigned += share;
          }
        }
      }
    }
  }

  // Clamp the solver-contact contribution to this tick's velocity change (see MAX_CONTACT_DV).
  // Angular damping also lands in the "excess" term but at ≤0.7% of the rate per tick it never
  // approaches the clamp. The absolute yaw ceiling is the final sanity net: nothing in the game
  // may leave a body spinning faster than SANE_MAX_YAW_RATE, contacts or otherwise.
  // Powered craft keep their helm: contact may shove them off a rock, but leftover contact
  // yaw is stripped so the nose stays on the pilot/AI heading. Combat/Massline torque is
  // already inside expected.wy, so authored tumbles still spin.
  _applyStructuralGive(rec) {
    const e = rec.expected;
    if (!e) return;
    if (rec.entity && rec.entity.isPlayer === true) {
      this._applyPlayerStructuralGive(rec);
      return;
    }
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
    const helmLocked = craftKeepsHelmThroughContact(rec);
    const contactYaw = helmLocked && Math.abs(dw) > CRAFT_CONTACT_YAW_EPS;
    const yawCap = helmLocked ? 0 : MAX_CONTACT_DW;
    if (Math.abs(dw) > (helmLocked ? CRAFT_CONTACT_YAW_EPS : yawCap)) {
      wy = e.wy + Math.sign(dw) * yawCap;
      touched = true;
    }
    if (contactYaw && Number.isFinite(e.yaw)) {
      rec.body.setRotation(quatFromYaw(e.yaw), true);
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
    const material = contactMaterialFor(entity, spec);
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

    // Ghost projectile bodies join no contact pairs, so a retired body is interchangeable with
    // a fresh one at the same shape/mass key. Reuse skips the per-shot createRigidBody +
    // createCollider WASM burst; the pose/velocity reset below restores the exact creation-desc
    // state, and with zero gravity, zero damping, and no contacts the motion is identical.
    const ghostPoolKey = spec.dynamic && material.ghost && spec.material === 'projectile'
      ? ghostProjectilePoolKey(spec)
      : null;
    const pooled = ghostPoolKey ? this._takePooledGhostBody(ghostPoolKey) : null;
    let body;
    let colliders;
    let proxyManifest = null;
    if (pooled) {
      body = pooled.body;
      colliders = pooled.colliders;
      body.setTranslation({ x: posX, y: 0, z: posZ }, true);
      body.setRotation(quatFromYaw(finite(entity.rot)), true);
      body.setLinvel({ x: vel.x, y: 0, z: vel.z }, true);
      body.setAngvel({ x: 0, y: finite(entity.angVel), z: 0 }, true);
      body.setEnabled(true);
    } else {
      body = this.world.createRigidBody(desc);
      proxyManifest = resolveCollisionProxyManifest(entity);
      let colliderDescs;
      if (proxyManifest) {
        colliderDescs = buildCompoundProxyColliderDescs(this.RAPIER, entity, proxyManifest, material, spec, this.captureContactImpacts);
      } else if (spec.shape === 'capsule' || entity.type === 'ship' || entity.type === 'drone') {
        colliderDescs = [buildCraftCapsuleColliderDesc(this.RAPIER, entity, spec, material, this.captureContactImpacts)];
      } else {
        colliderDescs = [buildBallColliderDesc(this.RAPIER, spec, material, this.captureContactImpacts)];
      }
      colliders = colliderDescs.map((colliderDesc) => this.world.createCollider(colliderDesc, body));
    }
    const collider = colliders[0];
    const ccdEnabled = typeof body.isCcdEnabled === 'function' ? body.isCcdEnabled() : !!spec.ccd;
    const record = {
      entity,
      spec,
      revision: spec.revision,
      body,
      collider,
      colliders,
      ccdEnabled,
      proxyId: proxyManifest ? proxyManifest.id : null,
      ghostPoolKey,
      appliedForce: zero3(),
      appliedTorque: zero3(),
      controlForce: zero3(),
      controlTorque: zero3(),
      expected: { vx: 0, vz: 0, wy: 0, yaw: 0 },
      kinematics: {
        x: posX,
        z: posZ,
        vx: vel.x,
        vz: vel.z,
        yaw: finite(entity.rot),
        wy: finite(entity.angVel),
      },
      maxSpeed: Infinity,
      effectiveMass: spec.mass,
      effectiveInertiaY: spec.inertiaY,
      bodyResponseMassScale: 1,
      bodyResponseInertiaScale: 1,
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
    for (const ownedCollider of colliders) this._colliderOwners.set(ownedCollider.handle, { rec: record, collider: ownedCollider });
    return record;
  }

  _removeRecord(id, rec) {
    this._reboundEntityIds.delete(id);
    const live = rec && rec.entity && rec.entity.alive !== false;
    if (live) {
      for (const attachment of this.attachments.values()) {
        if (attachment.owner === rec || attachment.target === rec) return;
      }
    }
    for (const attachment of Array.from(this.attachments.values())) {
      if (attachment.owner === rec || attachment.target === rec) this.cutAttachment({ attachmentId: attachment.id });
    }
    this.dynamicRecords.delete(rec);
    const colliders = Array.isArray(rec.colliders) && rec.colliders.length ? rec.colliders : [rec.collider];
    if (rec.ghostPoolKey != null && typeof rec.body.setEnabled === 'function') {
      // Retire, don't free: disabled bodies/colliders leave the broad phase and the solver.
      rec.body.setEnabled(false);
      let bucket = this._ghostProjectilePool.get(rec.ghostPoolKey);
      if (!bucket) {
        bucket = [];
        this._ghostProjectilePool.set(rec.ghostPoolKey, bucket);
      }
      bucket.push({ body: rec.body, colliders });
      for (const collider of colliders) this._colliderOwners.delete(collider.handle);
      this.records.delete(id);
      return;
    }
    for (const collider of colliders) {
      this._colliderOwners.delete(collider.handle);
      this.world.removeCollider(collider, false);
    }
    this.world.removeRigidBody(rec.body);
    this.records.delete(id);
  }

  _takePooledGhostBody(key) {
    const bucket = this._ghostProjectilePool.get(key);
    if (!bucket || !bucket.length) return null;
    return bucket.pop();
  }

  _syncRecord(entity, spec) {
    const rec = this.records.get(entity.id);
    const preserveRebound = !!(rec && rec.spec && rec.spec.dynamic
      && rec.entity === entity && this._reboundEntityIds.has(entity.id));
    // Compound-proxy membership is part of the collider identity: a station gaining/losing its
    // manifest (or switching manifests) rebuilds the static body, same as any other spec change.
    const proxyId = proxyIdForEntity(entity);
    if (!recordMatchesSpec(rec, spec) || (rec && rec.proxyId !== proxyId)) {
      if (rec && rec.proxyId === proxyId && massPropertiesOnlyChanged(rec, spec) && this._updateMassPropertiesInPlace(rec, spec)) {
        rec.entity = entity;
        if (preserveRebound) this._reboundEntityIds.delete(entity.id);
        else this._maybeResyncBodyPose(rec, entity);
        this._applyCcdGate(rec, entity);
        return rec;
      }
      this._reboundEntityIds.delete(entity.id);
      if (rec) this._removeRecord(entity.id, rec);
      const next = this._createRecord(entity, spec);
      this.records.set(entity.id, next);
      if (next.spec.dynamic) this.dynamicRecords.add(next);
      this._applyCcdGate(next, entity);
      return next;
    }
    rec.entity = entity;
    if (preserveRebound) this._reboundEntityIds.delete(entity.id);
    else this._maybeResyncBodyPose(rec, entity);
    this._applyCcdGate(rec, entity);
    return rec;
  }

  // Rank-1 CCD gate: reevaluate CCD on every sync from live speed/boost state, body-level only.
  // spec.ccd authoring stays intact (no record rebuilds); authored ccd:false is never overridden.
  _applyCcdGate(rec, entity) {
    if (!rec || !rec.spec.dynamic || !rec.spec.ccd) return;
    const type = entity.type;
    let desired = rec.ccdEnabled;
    if (type === 'projectile') {
      desired = true;
    } else if (type === 'ship' || type === 'drone' || type === 'payload') {
      if (entity.flags && entity.flags.boosting) {
        desired = true;
      } else {
        const vel = entity.vel;
        const speed = vel ? Math.hypot(finite(vel.x), finite(vel.z)) : 0;
        desired = rec.ccdEnabled ? speed >= CCD_GATE_DISABLE_SPEED : speed > CCD_GATE_ENABLE_SPEED;
      }
    }
    if (desired === rec.ccdEnabled) return;
    if (typeof rec.body.enableCcd === 'function') rec.body.enableCcd(desired);
    rec.ccdEnabled = desired;
  }

  _captureContactImpacts() {
    if (!this._eventQueue || typeof this._eventQueue.drainContactForceEvents !== 'function') return [];
    const merged = new Map();
    this._eventQueue.drainContactForceEvents((event) => {
      const ownedA = this._colliderOwners.get(event.collider1());
      const ownedB = this._colliderOwners.get(event.collider2());
      if (!ownedA || !ownedB || ownedA.rec === ownedB.rec) return;
      const recA = ownedA.rec;
      const recB = ownedB.rec;
      const rawImpulse = Math.max(0, finite(event.totalForceMagnitude())) * this.fixedDt;
      if (!(rawImpulse > 0)) return;
      const dynamicCaps = [];
      if (recA.spec.dynamic) dynamicCaps.push(effectiveMass(recA) * MAX_CONTACT_DV);
      if (recB.spec.dynamic) dynamicCaps.push(effectiveMass(recB) * MAX_CONTACT_DV);
      if (!dynamicCaps.length) return;
      const boundedImpulse = Math.min(rawImpulse, Math.min(...dynamicCaps));
      if (!(boundedImpulse > 0)) return;

      const direction = event.maxForceDirection();
      const translationA = recA.body.translation();
      const translationB = recB.body.translation();
      let px = (finite(translationA.x) + finite(translationB.x)) * 0.5;
      let pz = (finite(translationA.z) + finite(translationB.z)) * 0.5;
      if (typeof this.world.contactPair === 'function') {
        this.world.contactPair(ownedA.collider, ownedB.collider, (manifold) => {
          if (manifold.numSolverContacts() < 1) return;
          const point = manifold.solverContactPoint(0);
          px = finite(point && point.x, px);
          pz = finite(point && point.z, pz);
        });
      }
      const global = frameToGlobal({ x: px, z: pz }, this._frameOrigin, this._globalScratch);
      const aFirst = compareIds(recA.entity.id, recB.entity.id) <= 0;
      const a = aFirst ? recA : recB;
      const b = aFirst ? recB : recA;
      const aExpected = a.expected;
      const bExpected = b.expected;
      const aKinematics = a.kinematics;
      const bKinematics = b.kinematics;
      const aVx = a.spec.dynamic ? finite(aExpected && aExpected.vx) : 0;
      const aVz = a.spec.dynamic ? finite(aExpected && aExpected.vz) : 0;
      const bVx = b.spec.dynamic ? finite(bExpected && bExpected.vx) : 0;
      const bVz = b.spec.dynamic ? finite(bExpected && bExpected.vz) : 0;
      const nABx = finite(bKinematics && bKinematics.x) - finite(aKinematics && aKinematics.x);
      const nABz = finite(bKinematics && bKinematics.z) - finite(aKinematics && aKinematics.z);
      const causalActorId = directContactCausalActorId(
        a.entity.id,
        b.entity.id,
        aVx,
        aVz,
        bVx,
        bVz,
        nABx,
        nABz,
      );
      const closingSpeed = preSolveRadialClosingSpeed(aVx, aVz, bVx, bVz, nABx, nABz);
      const key = `${String(a.entity.id)}\u0000${String(b.entity.id)}`;
      const existing = merged.get(key);
      const impulse = Math.min((existing && existing.impulse || 0) + boundedImpulse, Math.min(...dynamicCaps));
      const normal = normalizePlanarDirection(direction);
      const isPlayerReceipt = (a.entity && a.entity.isPlayer === true) || (b.entity && b.entity.isPlayer === true);
      const receipt = {
        schemaVersion: 1,
        tick: this.tick + 1,
        aId: a.entity.id,
        bId: b.entity.id,
        impulse,
        pos: { x: finite(global.x), z: finite(global.z) },
        normal,
        causalActorId,
        preSolveClosingSpeed: existing
          ? Math.max(existing.preSolveClosingSpeed, closingSpeed)
          : closingSpeed,
      };
      if (isPlayerReceipt) {
        receipt.appliedPlayerDeltaV = 0;
      }
      merged.set(key, receipt);
    });
    const receipts = [...merged.values()].sort((a, b) => compareIds(a.aId, b.aId) || compareIds(a.bId, b.bId));
    return receipts;
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
      rec.effectiveMass = spec.mass;
      rec.effectiveInertiaY = spec.inertiaY;
      rec.bodyResponseMassScale = 1;
      rec.bodyResponseInertiaScale = 1;
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
      applyYawTorqueImpulse(rec, impulse);
    }
  }

  _applyBodyResponse(rec, response) {
    if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body
      || typeof rec.body.setAdditionalMassProperties !== 'function') return false;
    const massScale = positive(response && response.massScale, 1);
    const inertiaScale = positive(response && response.inertiaScale, massScale);
    if (rec.bodyResponseMassScale === massScale && rec.bodyResponseInertiaScale === inertiaScale) {
      return true;
    }
    const mass = rec.spec.mass * massScale;
    const inertiaY = rec.spec.inertiaY * inertiaScale;
    try {
      rec.body.setAdditionalMassProperties(
        mass,
        vector3(rec.spec.centerOfMass),
        { x: 1, y: inertiaY, z: 1 },
        { x: 0, y: 0, z: 0, w: 1 },
        true,
      );
      rec.effectiveMass = mass;
      rec.effectiveInertiaY = inertiaY;
      rec.bodyResponseMassScale = massScale;
      rec.bodyResponseInertiaScale = inertiaScale;
      return true;
    } catch (_) {
      return false;
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

  // The command's maxSpeed bounds what the body's OWN drive may produce. It never truncates
  // momentum the body was GIVEN — a shove, a rope throw, a well fling, a contact (design/VISION.md:
  // "light ships are ammunition"; "he becomes a projectile"). Before this, an NPC at cruise that took
  // a concussion hit had the whole hit deleted here one tick later. Split this tick's velocity into
  // the part the body had before its continuous control thrust integrated and the part that thrust
  // added; only the thrust-added part is subject to the cap. Impulses mutate linvel before the
  // step, so they land in the "before" part by construction (same split _captureExpectedKinematics
  // relies on).
  _clampSpeed(rec, kinematics = null) {
    if (!Number.isFinite(rec.maxSpeed)) return;
    const vx = kinematics ? kinematics.vx : finite(rec.body.linvel().x);
    const vz = kinematics ? kinematics.vz : finite(rec.body.linvel().z);
    const speed = Math.hypot(vx, vz);
    if (speed <= rec.maxSpeed || speed <= 1e-12) return;
    const mass = effectiveMass(rec);
    const dt = this.fixedDt;
    const cx = Number.isFinite(mass) && mass > 0 ? rec.controlForce.x / mass * dt : 0;
    const cz = Number.isFinite(mass) && mass > 0 ? rec.controlForce.z / mass * dt : 0;
    const bx = vx - cx;
    const bz = vz - cz;
    const base = Math.hypot(bx, bz);
    let nextVx;
    let nextVz;
    if (base >= rec.maxSpeed && base > 1e-12) {
      // Already past the cap on given momentum: thrust may steer or brake, but may not add speed
      // along the velocity it already has.
      const ux = bx / base;
      const uz = bz / base;
      const along = cx * ux + cz * uz;
      if (!(along > 0)) return;
      nextVx = vx - along * ux;
      nextVz = vz - along * uz;
    } else {
      // Thrust carried the body over its cap this tick: it may reach the cap, not exceed it.
      const scale = rec.maxSpeed / speed;
      nextVx = vx * scale;
      nextVz = vz * scale;
    }
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
      mass: positive(rec.effectiveMass, rec.spec.mass),
      inertiaY: positive(rec.effectiveInertiaY, rec.spec.inertiaY),
      force: rec.appliedForce,
      torque: rec.appliedTorque,
      linearAcceleration: {
        x: rec.appliedForce.x / positive(rec.effectiveMass, rec.spec.mass),
        y: 0,
        z: rec.appliedForce.z / positive(rec.effectiveMass, rec.spec.mass),
      },
      angularAccelerationY: rec.appliedTorque.y / positive(rec.effectiveInertiaY, rec.spec.inertiaY),
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
    const spring = attachment.spring || (attachment.spring = normalizeSpring(null, attachment.defId, attachment.break));
    let restLength = positive(attachment.restLength, 0);
    const source = worldAnchorInto(scratch.source, attachment.owner, attachment.anchorA);
    const target = worldAnchorInto(scratch.target, attachment.target, attachment.anchorB);
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const distance = Math.hypot(dx, dz);
    const nx = distance > 1e-9 ? dx / distance : 1;
    const nz = distance > 1e-9 ? dz / distance : 0;
    let stretch = Math.max(0, distance - restLength);

    const maxStretchRatio = positive(spring.maxStretchRatio, MAX_STRETCH_RATIO);
    const reelSafeStretchRatio = positive(spring.reelSafeStretchRatio,
      Math.min(REEL_SAFE_STRETCH_RATIO, Math.max(0.05, maxStretchRatio - 0.04)));

    if (state.reelSlip && restLength > 0 && stretch > restLength * maxStretchRatio * REEL_SLIP_RELENGTH_RATIO) {
      // Only pay out line when stretch is right at the break edge (a violently fleeing capital that
      // would otherwise snap). Normal reel-in no longer re-lengthens, so holding G actually hauls.
      restLength = distance / (1 + maxStretchRatio * REEL_SLIP_RELENGTH_RATIO);
      attachment.restLength = restLength;
      stretch = Math.max(0, distance - restLength);
    }

    if (usesFrameCoupler(spring)) {
      this._applyFrameCoupler(attachment, state, scratch, {
        source, target, distance, restLength, stretch, maxStretchRatio, nx, nz,
      });
      return;
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
    // The coupled load: the centripetal force the line must carry to keep the two bodies on their
    // swing, mu * v_t^2 / r, from the tangential part of the relative velocity at the anchors.
    // Stiffness scaled to that load holds the swing inside LOAD_STRETCH_RATIO of the line; below
    // the load where that matters the authored K is the floor, so gentle play and the soft catch
    // are bit-identical to before. Damping follows the effective stiffness so the line stays at
    // its authored damping ratio instead of ringing when it stiffens.
    const rvx = scratch.velocityB.x - scratch.velocityA.x;
    const rvz = scratch.velocityB.z - scratch.velocityA.z;
    const tangentialSq = Math.max(0, rvx * rvx + rvz * rvz - relativeSpeed * relativeSpeed);
    const coupledLoad = mu * tangentialSq / Math.max(distance, STRETCH_EPSILON);
    const loadStiffness = coupledLoad
      / Math.max(positive(spring.loadStretchRatio, LOAD_STRETCH_RATIO) * restLength, STRETCH_EPSILON);
    const tautK = Math.max(spring.K, loadStiffness);
    const tautDamping = tautK > spring.K ? dampingForStiffness(tautK, spring, mu) : damping;
    const k = inCapture ? tautK * smooth * smooth : tautK;
    const c = inCapture ? tautDamping * (0.5 + 0.5 * smooth) : tautDamping;
    state.lastStiffness = k;
    state.lastLoadStiffness = loadStiffness;
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
    // A specialized Tractor remains a physical rope, not a telekinetic position writer. Its
    // snapshotted finite-force rating caps the complete radial spring/damping/haul result. The
    // ordinary standard line normalizes maxForce to Infinity and is bit-identical here.
    force = Math.min(force, spring.maxForce);

    // Crossing the authored stretch edge enters a recoverable overload regime. The previous path
    // zeroed corrective force and fabricated an immediate threshold breach, making recovery nearly
    // impossible once the line crossed its edge. Keep applying the bounded physical spring while
    // publishing normalized overload telemetry; the semantic massline authority then owns the
    // deterministic grace/catastrophic cut policy. Pulling back inside the edge clears this signal.
    //
    // A line BREAKS by its load rating, never by how far it happens to be stretched (PQ-137.07):
    // the break request and the tension the massline authority grades are the physical force
    // against the authored maxTension. The geometric edge stays as telemetry and as the 'overload'
    // phase the HUD shows, so a line at its edge still reads as strained.
    const geometricOverloadRatio = restLength > 0
      ? stretch / Math.max(restLength * maxStretchRatio, STRETCH_EPSILON)
      : 0;
    const tensionRating = finite(attachment.break.maxTension, Infinity);
    const loadRatio = Number.isFinite(tensionRating) && tensionRating > 0 ? force / tensionRating : 0;
    state.breakRequested = loadRatio >= 1;

    const forceImpulse = force * this.fixedDt;
    const impulse = forceImpulse * clamp(finite(attachment.forceScale, 1), 0, 4);
    if (impulse > 0) {
      scratch.impulseA.x = nx * impulse;
      scratch.impulseA.y = 0;
      scratch.impulseA.z = nz * impulse;
      scratch.impulseB.x = -scratch.impulseA.x;
      scratch.impulseB.y = 0;
      scratch.impulseB.z = -scratch.impulseA.z;
      applyAttachmentImpulse(attachment, scratch.impulseA, scratch.impulseB, source, target);
      accumulateForce(attachment.owner, scratch.impulseA, this.fixedDt);
      accumulateForce(attachment.target, scratch.impulseB, this.fixedDt);
    }

    state.lastTension = force;
    state.lastImpulse = forceImpulse;
    state.lastRelativeSpeed = relativeSpeed;
    state.lastYank = yank;
    state.lastOverloadRatio = Math.max(geometricOverloadRatio, loadRatio);
    state.phase = geometricOverloadRatio > 1 ? 'overload'
      : inCapture ? 'capture'
      : loadRatio >= 0.75 ? 'overload'
      : 'loaded';
    if (inCapture) {
      state.captureT += this.fixedDt;
      if (state.captureT >= captureS) state.captureActive = false;
    }
  }

  _applyFrameCoupler(attachment, state, scratch, geometry) {
    const { source, target, distance, restLength, stretch, maxStretchRatio, nx, nz } = geometry;
    const spring = attachment.spring;
    state.breakRequested = false;
    state.lastStretch = stretch;

    // A coupler is still unilateral: below the chosen line length it is slack and has no authority.
    // The small edge allowance admits the exact engagement distance on the first fixed tick.
    if (distance + STRETCH_EPSILON < restLength) {
      state.slackS += this.fixedDt;
      state.captureT = 0;
      state.captureActive = false;
      state.wasTaut = false;
      state.phase = 'slack';
      state.lastTension = 0;
      state.lastImpulse = 0;
      state.lastRelativeSpeed = 0;
      state.lastFrameErrorSpeed = 0;
      state.lastYank = 0;
      return;
    }

    const velocityA = attachment.owner.body.linvel();
    const velocityB = attachment.target.body.linvel();
    const rvx = finite(velocityB.x) - finite(velocityA.x);
    const rvz = finite(velocityB.z) - finite(velocityA.z);
    const relativeSpeed = rvx * nx + rvz * nz;
    const openingSpeed = Math.max(0, relativeSpeed);
    const previousRelativeSpeed = finite(state.lastRelativeSpeed, 0);
    const yank = (relativeSpeed - previousRelativeSpeed) / this.fixedDt;

    if (!state.wasTaut && state.slackS >= CAPTURE_SLACK_S) {
      state.captureActive = true;
      state.captureT = 0;
    }
    state.wasTaut = true;
    state.slackS = 0;

    const captureS = positive(spring.captureS, 0);
    const inCapture = state.captureActive && state.captureT < captureS;
    const captureX = inCapture && captureS > 0 ? clamp(state.captureT / captureS, 0, 1) : 1;
    const gain = spring.velocityGain * smoothstep(captureX);
    const mu = reducedMass(attachment.owner, attachment.target);
    const force = Math.min(spring.maxForce, mu * gain * openingSpeed);
    const forceImpulse = force * this.fixedDt;
    const impulse = forceImpulse * clamp(finite(attachment.forceScale, 1), 0, 4);
    if (impulse > 0) {
      // A Frame Coupler changes how a taut rope damps separation; it does not gain a
      // sideways velocity controller. Equal/opposite impulses therefore stay on the line.
      scratch.impulseA.x = nx * impulse;
      scratch.impulseA.y = 0;
      scratch.impulseA.z = nz * impulse;
      scratch.impulseB.x = -scratch.impulseA.x;
      scratch.impulseB.y = 0;
      scratch.impulseB.z = -scratch.impulseA.z;
      applyAttachmentImpulse(attachment, scratch.impulseA, scratch.impulseB, source, target);
      accumulateForce(attachment.owner, scratch.impulseA, this.fixedDt);
      accumulateForce(attachment.target, scratch.impulseB, this.fixedDt);
    }

    const geometricOverloadRatio = restLength > 0
      ? stretch / Math.max(restLength * maxStretchRatio, STRETCH_EPSILON)
      : 0;
    state.breakRequested = geometricOverloadRatio > 1;
    state.lastTension = force;
    state.lastImpulse = forceImpulse;
    state.lastRelativeSpeed = relativeSpeed;
    state.lastFrameErrorSpeed = openingSpeed;
    state.lastYank = yank;
    state.phase = geometricOverloadRatio > 1 ? 'overload'
      : inCapture ? 'capture'
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

}

async function loadRapierCompat() {
  return loadRapierCompatRuntime();
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

function normalizeLocalAnchor(value) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: value.x, y: Number.isFinite(value.y) ? value.y : 0, z: value.z };
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
  const requestedMode = value && value.mode;
  return {
    mode: requestedMode === 'legacy_rope' ? 'legacy_rope'
      : requestedMode === 'frame_coupler' ? 'frame_coupler'
        : 'spring',
    K: positive(value && value.K, positive(value && value.k, positive(tune && tune.K, positive(breakValue && breakValue.stiffness, 140)))),
    zeta: positive(value && value.zeta, positive(tune && tune.zeta, 0.95)),
    captureS: positive(value && value.captureS, positive(tune && tune.captureS, 0.35)),
    maxForce: positive(value && value.maxForce, Infinity),
    velocityGain: positive(value && value.velocityGain, 0),
    maxStretchRatio,
    reelSafeStretchRatio: positive(value && value.reelSafeStretchRatio,
      positive(tune && tune.reelSafeStretchRatio, Math.min(REEL_SAFE_STRETCH_RATIO, Math.max(0.05, maxStretchRatio - 0.04)))),
  };
}

function usesLegacyRopeSpring(spring) {
  return spring && spring.mode === 'legacy_rope';
}

function usesFrameCoupler(spring) {
  return spring && spring.mode === 'frame_coupler';
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
    lastFrameErrorSpeed: 0,
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
  state.lastFrameErrorSpeed = Math.max(0, finite(value.lastFrameErrorSpeed));
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
    lastFrameErrorSpeed: state.lastFrameErrorSpeed,
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
  return dampingForStiffness(positive(spring && spring.K, 1), spring, mu);
}

/** Critical-ratio damping for an arbitrary stiffness: the authored zeta, whatever the line's K is now. */
function dampingForStiffness(k, spring, mu) {
  return mu > 0 ? 2 * positive(spring && spring.zeta, 0.95) * Math.sqrt(positive(k, 1) * mu) : 0;
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

function applyAttachmentImpulse(attachment, impulseA, impulseB, source, target) {
  if (attachment && attachment.defId === 'tether_standard') {
    // The standard Massline owns only the radial constraint. Steering, speed policy and release
    // velocity remain with the ordinary flight controller and the player's actual momentum.
    applyCenterImpulse(attachment.owner, impulseA);
    applyCenterImpulse(attachment.target, impulseB);
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

function applyYawTorqueImpulse(rec, value) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body || typeof rec.body.setAngvel !== 'function') return false;
  const impulseY = finite(value && value.y);
  if (impulseY === 0) return true;
  const inertiaY = positive(rec.effectiveInertiaY, rec.spec.inertiaY);
  const current = finite(rec.body.angvel && rec.body.angvel().y);
  // Rapier's applyTorqueImpulse currently produces zero yaw on our Y-only rotation-constrained
  // bodies. The owner is the sanctioned body writer, so apply the identical J = I*deltaOmega
  // relation explicitly rather than leaking an entity.angVel fallback into gameplay systems.
  rec.body.setAngvel({ x: 0, y: current + impulseY / inertiaY, z: 0 }, true);
  return true;
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

function contactMaterialFor(entity, spec) {
  const base = CONTACT_MATERIALS[(spec && spec.material) || 'default'] || CONTACT_MATERIALS.default;
  // Pickup collection is a JS overlap test. A solver contact on a crate spawned inside a hull
  // launches both bodies; ghosting keeps the pickup in the world without knocking the ship.
  if (entity && entity.type === 'pickup' && !base.ghost) {
    return Object.freeze({ ...base, ghost: true });
  }
  return base;
}

function craftKeepsHelmThroughContact(rec) {
  const type = rec && rec.entity && rec.entity.type;
  return HELM_LOCKED_TYPES.has(type);
}

function contactAngularDamping(rec) {
  const material = CONTACT_MATERIALS[(rec && rec.spec && rec.spec.material) || 'default']
    || CONTACT_MATERIALS.default;
  return Math.max(0, finite(material.angularDamping));
}

function applyColliderContactMaterial(R, colliderDesc, material) {
  if (!colliderDesc || !material) return colliderDesc;
  if (typeof colliderDesc.setFriction === 'function') colliderDesc.setFriction(material.friction);
  if (typeof colliderDesc.setRestitution === 'function') colliderDesc.setRestitution(material.restitution);
  if (material.restitutionCombine === 'min' && typeof colliderDesc.setRestitutionCombineRule === 'function') {
    const rule = R && R.CoefficientCombineRule && R.CoefficientCombineRule.Min;
    if (rule != null) colliderDesc.setRestitutionCombineRule(rule);
  }
  return colliderDesc;
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
    rec.spec.shape === spec.shape &&
    rec.spec.mass === spec.mass &&
    rec.spec.inertiaY === spec.inertiaY &&
    rec.spec.material === spec.material;   // material drives collider friction/restitution/groups
}

function proxyIdForEntity(entity) {
  const manifest = resolveCollisionProxyManifest(entity);
  return manifest ? manifest.id : null;
}

function ghostProjectilePoolKey(spec) {
  const com = spec.centerOfMass || {};
  return [spec.shape || 'ball', spec.radius, spec.mass, spec.inertiaY, spec.ccd ? 1 : 0, finite(com.x), finite(com.z)].join('|');
}

const ENEMY_SILHOUETTE_PROPORTIONS = Object.freeze({
  drone_swarm: Object.freeze({ length: 1.0, halfWidth: 0.40, height: 0.30 }),
  sniper_lance: Object.freeze({ length: 1.6, halfWidth: 0.35, height: 0.25 }),
  bruiser_armor: Object.freeze({ length: 1.2, halfWidth: 0.75, height: 0.45 }),
  trader_haul: Object.freeze({ length: 1.3, halfWidth: 0.50, height: 0.40 }),
  pirate_swoop: Object.freeze({ length: 1.45, halfWidth: 0.65, height: 0.30 }),
  corsair_blade: Object.freeze({ length: 1.50, halfWidth: 0.55, height: 0.30 }),
  patrol_interdict: Object.freeze({ length: 1.55, halfWidth: 0.62, height: 0.38 }),
  dreadnought_enemy: Object.freeze({ length: 2.00, halfWidth: 0.85, height: 0.70 }),
});

const CRAFT_PROPORTIONS_CACHE = new Map();
for (const [sil, prop] of Object.entries(ENEMY_SILHOUETTE_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(sil, prop);
}
for (const ship of SHIPS || []) {
  if (ship && ship.id && ship.visuals && ship.visuals.proportions) {
    CRAFT_PROPORTIONS_CACHE.set(ship.id, ship.visuals.proportions);
  }
}
for (const enemy of ENEMY_TYPES || []) {
  if (enemy && enemy.id) {
    const silProp = enemy.silhouette && ENEMY_SILHOUETTE_PROPORTIONS[enemy.silhouette];
    const shipProp = enemy.shipId && CRAFT_PROPORTIONS_CACHE.get(enemy.shipId);
    const prop = silProp || shipProp;
    if (prop) CRAFT_PROPORTIONS_CACHE.set(enemy.id, prop);
  }
}

export function resolveCraftProportions(entity, spec = null) {
  const data = (entity && entity.data) || {};
  if (data.proportions && Number.isFinite(data.proportions.length) && Number.isFinite(data.proportions.halfWidth)) {
    return data.proportions;
  }
  if (data.silhouette && ENEMY_SILHOUETTE_PROPORTIONS[data.silhouette]) {
    return ENEMY_SILHOUETTE_PROPORTIONS[data.silhouette];
  }
  for (const key of [data.defId, data.shipId, data.typeId, data.chassisId, entity && entity.id]) {
    if (typeof key === 'string' && CRAFT_PROPORTIONS_CACHE.has(key)) {
      return CRAFT_PROPORTIONS_CACHE.get(key);
    }
  }
  if (entity && entity.type === 'drone') {
    return { length: 1.0, halfWidth: 0.45, height: 0.30 };
  }
  return { length: 1.35, halfWidth: 0.42, height: 0.30 };
}

function buildCraftCapsuleColliderDesc(R, entity, spec, material, captureContactImpacts = true) {
  const proportions = resolveCraftProportions(entity, spec);
  const R_ref = positive(spec && spec.radius, positive(entity && entity.radius, 14));
  const length = Math.max(0.1, positive(proportions && proportions.length, 1.35) * R_ref);
  const halfWidth = Math.max(0.1, positive(proportions && proportions.halfWidth, 0.42) * R_ref);
  const capRadius = halfWidth;
  const halfHeight = Math.max(0, (length * 0.5) - capRadius);
  const com = (spec && spec.centerOfMass) || {};
  const comX = finite(com.x, 0);
  const comZ = finite(com.z, 0);

  const colliderDesc = R.ColliderDesc.capsule(halfHeight, capRadius)
    .setTranslation(comX, 0, comZ)
    .setRotation(capsulePlanarQuat(1, 0))
    .setDensity(0);
  applyColliderContactMaterial(R, colliderDesc, material);

  if (material.ghost && typeof colliderDesc.setCollisionGroups === 'function') {
    colliderDesc.setCollisionGroups(0);
  }
  if (captureContactImpacts) configureContactEvents(R, colliderDesc, material);
  return colliderDesc;
}

function buildBallColliderDesc(R, spec, material, captureContactImpacts = true) {
  const colliderDesc = R.ColliderDesc.ball(spec.radius).setDensity(0);
  applyColliderContactMaterial(R, colliderDesc, material);
  if (material.ghost && typeof colliderDesc.setCollisionGroups === 'function') {
    colliderDesc.setCollisionGroups(0);   // member of nothing, filters nothing → zero contacts
  }
  if (captureContactImpacts) configureContactEvents(R, colliderDesc, material);
  return colliderDesc;
}

// Compound planar collision proxies (PQ-008 / SF-08 → F18). Manifest primitives are authored in
// normalized station-local units and become a bounded static collider set on the fixed body. The
// body transform (station pos/rot) composes at the body level, so primitives stay entity-local.
// This runs ONCE at record creation — never per frame.
function buildCompoundProxyColliderDescs(R, entity, manifest, material, spec, captureContactImpacts = true) {
  const scale = proxyScaleFor(entity, manifest);
  const primitives = expandProxyPrimitives(manifest, { entity });
  const descs = [];
  for (const primitive of primitives) {
    let desc = null;
    if (primitive.kind === 'circle') {
      desc = R.ColliderDesc.ball(Math.max(0.01, primitive.r * scale))
        .setTranslation(primitive.x * scale, 0, primitive.z * scale);
    } else if (primitive.kind === 'capsule') {
      const ax = primitive.ax * scale;
      const az = primitive.az * scale;
      const bx = primitive.bx * scale;
      const bz = primitive.bz * scale;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      const ux = len > 1e-9 ? dx / len : 1;
      const uz = len > 1e-9 ? dz / len : 0;
      desc = R.ColliderDesc.capsule(Math.max(0, len * 0.5), Math.max(0.01, primitive.r * scale))
        .setTranslation((ax + bx) * 0.5, 0, (az + bz) * 0.5)
        .setRotation(capsulePlanarQuat(ux, uz));
    } else if (primitive.kind === 'obb') {
      desc = R.ColliderDesc.cuboid(
        Math.max(0.01, primitive.hx * scale),
        Math.max(0.01, primitive.hx * scale),
        Math.max(0.01, primitive.hz * scale),
      )
        .setTranslation(primitive.x * scale, 0, primitive.z * scale)
        .setRotation(quatFromYaw(finite(primitive.angleDeg) * (Math.PI / 180)));
    }
    if (!desc) continue;
    desc.setDensity(0);
    applyColliderContactMaterial(R, desc, material);
    if (captureContactImpacts) configureContactEvents(R, desc, material);
    descs.push(desc);
  }
  // Fail-closed: a malformed manifest must not remove collision — fall back to the legacy ball.
  if (!descs.length) return [buildBallColliderDesc(R, spec, material, captureContactImpacts)];
  return descs;
}

function configureContactEvents(R, colliderDesc, material) {
  if (!colliderDesc || material.ghost) return colliderDesc;
  if (typeof colliderDesc.setActiveEvents === 'function' && R.ActiveEvents) {
    colliderDesc.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
  }
  if (typeof colliderDesc.setContactForceEventThreshold === 'function') {
    colliderDesc.setContactForceEventThreshold(SG02_CONTACT_FORCE_EVENT_THRESHOLD_N);
  }
  return colliderDesc;
}

function normalizePlanarDirection(value) {
  const x = finite(value && value.x);
  const z = finite(value && value.z);
  const length = Math.hypot(x, z);
  return length > 1e-9 ? { x: x / length, z: z / length } : { x: 1, z: 0 };
}

// Quaternion rotating the Rapier capsule's local +Y axis onto a planar direction (ux, uz): a 90°
// rotation about the perpendicular axis (uz, 0, -ux).
function capsulePlanarQuat(ux, uz) {
  const s = Math.SQRT1_2;
  return { x: uz * s, y: 0, z: -ux * s, w: s };
}

function massPropertiesOnlyChanged(rec, spec) {
  if (!rec || !rec.spec || !spec) return false;
  const current = rec.spec;
  const massChanged = current.mass !== spec.mass || current.inertiaY !== spec.inertiaY;
  return massChanged &&
    current.dynamic === spec.dynamic &&
    current.ccd === spec.ccd &&
    current.radius === spec.radius &&
    current.shape === spec.shape &&
    current.material === spec.material;
}

function bodyStateMatchesEntity(rec, entity, frameOrigin, frameScratch) {
  if (!rec || !rec.body || !entity) return false;
  const p = rec.body.translation();
  const v = rec.body.linvel();
  const q = rec.body.rotation();
  const w = rec.body.angvel();
  const local = globalToFrame(entity.pos, frameOrigin, frameScratch);
  const dx = local.x - finite(p && p.x);
  const dz = local.z - finite(p && p.z);
  if (dx * dx + dz * dz > POSE_RESYNC_EPS2) return false;
  const savedVx = finite(entity.vel && entity.vel.x);
  const savedVz = finite(entity.vel && entity.vel.z);
  const savedYaw = wrapAngle(entity.rot);
  const bodyYaw = wrapAngle(yawFromQuat(q));
  return savedVx === finite(v && v.x)
    && savedVz === finite(v && v.z)
    && savedYaw === bodyYaw
    && finite(entity.angVel) === finite(w && w.y);
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
