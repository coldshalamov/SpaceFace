// SG-02 dynamic body owner.
//
// The same authority powers the focused laboratory checks and the explicit production
// `rapier-dynamic` backend. Flight/combat write membrane commands; this owner consumes them,
// steps real Rapier dynamic bodies, and mirrors the post-solve state back to entities.

import {
  consumePhysicsCommand,
  consumeProjectileContinuation,
  measureThrusterAuthority,
  resolvePhysicsBodySpec,
  writePhysicsTelemetry,
} from './physicsAuthority.js';
import {
  MAX_PROXY_PRIMITIVES,
  expandProxyPrimitives,
  isCompoundSkinDynamicEligible,
  proxyScaleFor,
  resolveCollisionProxyManifest,
} from '../data/collisionProxyManifests.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { SHIPS } from '../data/ships.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { frameToGlobal, globalToFrame } from './coordinates.js';
import { occupantGenerationOf } from './entity.js';
import { loadRapierCompatRuntime } from './rapierCompatRuntime.js';
import { observeAppliedImpulse, observeConstraint, observeRelease, observeContact, journalFor } from '../combat/stuntEvidence.js';
import { observeAppliedSurfaceTorque } from '../combat/stuntProjectileEvidence.js';
import { SIM_TIER } from '../world/activityClassification.js';
import { combatFlag } from '../data/featureFlags.js';
import { resolveGovernedCombatSpeed } from './flight/propulsionCatalog.js';

export const SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION = 1;
export const SG02_WORLD_SNAPSHOT_SCHEMA_VERSION = 3;
// Independent of envelope schema: NEXT schema 2 also carried shallow geometry.
// Missing/mismatched revisions require authoritative entity-state reconstruction.
export const SG02_NATIVE_GEOMETRY_REVISION = 'xz-support-prism-v2';
export const SG02_DYNAMIC_BODY_OWNER_DT = 1 / 60;
export const SG02_DYNAMIC_BODY_OWNER_QUANTUM = 1e-4;
// Contact-force receipts are gameplay signals, not solver inputs. A zero threshold makes every
// resting hull pressure and compound-proxy scrape cross the WASM event queue even though the
// smallest routed gameplay impact is 50 impulse. At the production 60 Hz step this floor is only
// 1 impulse, so meaningful damage/mission/audio/VFX contacts remain far above it while contact
// response itself stays bit-for-bit inside Rapier.
export const SG02_CONTACT_FORCE_EVENT_THRESHOLD_N = 60;
const POSE_RESYNC_EPS2 = 1e-4;

export function mayRapierIslandSleep(entity, spec) {
  if (!entity || !spec || spec.dynamic !== true) return false;
  if (entity.isPlayer === true) return false;
  if (entity.type === 'projectile' || spec.material === 'projectile') return false;
  if (entity.flags && entity.flags.noInterp) return false;
  const data = entity.data;
  if (data && (data.jobId || data.activityActorSlotId || data.ceresActivityCast)) return false;
  const tier = entity.activity && entity.activity.simTier;
  return tier === SIM_TIER.S2_ABSTRACT
    || tier === SIM_TIER.S3_DORMANT
    || tier === SIM_TIER.S4_AGGREGATE;
}

/** Sleeping islands keep last pose; skip WASM translation/linvel writeback. */
export function shouldSkipSleepingKinematics(entity, spec, opts = {}) {
  if (opts.sleeping !== true) return false;
  if (opts.held === true || opts.hadCommand === true) return false;
  return mayRapierIslandSleep(entity, spec);
}

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
// omega * dt bound for the load-scaled stiffness (semi-implicit Euler at 60 Hz is stable below 2;
// half of one keeps the damping impulse under the body's own momentum as well).
const STABLE_OMEGA_DT = 0.5;
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
// Twin Bridle is the one paired line with an authored tension rating. Keep a small physical
// overshoot window so the attachment service can observe a strict `>` rating breach and cut the
// line, while preventing the spring from injecting an unbounded impulse into either hull.
const TWIN_BRIDLE_DEF_ID = 'attachment_twin_bridle';
const TWIN_BRIDLE_TENSION_OVERSHOOT = 1.05;
// A player cut spends remaining whip PE. Occupational cleanup and load-breaks do not.
const PLAYER_WHIP_RELEASE_REASONS = new Set(['tether_cut', 'cut']);
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
// massline_sensor keeps a dynamic body available to the attachment authority while excluding
// the authored sensor payload from every solver/contact pair; world-site payloads spawn inside
// assemblies.
const CONTACT_MATERIALS = PHYSICS_MATERIALS;

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
const MAX_OWNER_SUBSTEPS = 64;
// Hull-burst overhaul slice A, "pinging off of objects" (owner, 2026-09-29): a hull that has lost
// its helm (control mode 'tumbling') is a projectile, not a piloted craft. Under `combat.tumbleFling`
// it gets a bouncy contact material (Max combine rule, so it beats the ship material's Min and any
// rock/hull it meets), contact may spin it (the helm-locked yaw strip is off), and the per-tick
// contact-sourced velocity bound is raised so a real rebound is not truncated to a 40 WU/s nudge.
// Controlled hulls and the player keep the scraping material above. Placeholders; nothing has
// tuned them (design doc §11.6).
const TUMBLE_RESTITUTION = 0.6;
const TUMBLE_MAX_CONTACT_DV = 160;
// The ship contact material's angularDamping (0.4/s) is documented as an RCS model of the hull's own
// attitude control. A hull that has lost its helm is not acted on by its own propulsion, so it
// carries only a token drag (a debris-like 0.05/s): a 6 rad/s entry spin keeps ~85% of itself over
// a 3 s stun instead of ~30%.
const TUMBLE_ANGULAR_DAMPING = 0.05;
// The solver alone does not ping a SPINNING hull off a rock: an off-centre capsule contact point
// moves faster than the approach (4 rad/s x the hull's length beats a 28 WU/s hit), so the impact
// turns into spin and the hull stops dead against the face (measured: a real Wasp at 28 WU/s
// rebounds 16.8 WU/s with no spin and ~0 with 4.3 rad/s). So the post-step contact pass also
// enforces the ricochet for a tumbling hull that meets a fixed body: the velocity leaving the
// surface is at least TUMBLE_RESTITUTION x the closing speed (bounded by TUMBLE_MAX_CONTACT_DV).
const TUMBLE_RICOCHET_MIN_CLOSING = 6; // WU/s: a graze is not a ping
// Coincident-center guard: a Rapier narrow phase on nearly-concentric collider centers
// degenerates to a ~10^6-unit penetration and the step teleports both bodies — co-created
// spawns land on it deterministically (the aftermath wreck and the manifest payload both spawn
// at victim.pos; the A4 witnessed-kill run flung the pair ±0.76/1.74 MWU at seed 4242).
// The measured concentric window is ~±1.5-2 WU, but the degenerate region around a CAPSULE
// partner is its whole spine segment: a candidate center within ~2 WU of the spine has no
// unique closest feature and the stiffened Package D solver detonates on it even after the
// old ±2.5 slot. The guard therefore climbs the +x ladder until the candidate's center clears
// every partner spine (past the cap centres by EPS_AXIAL) or leaves the spine cylinder
// radially. The nudged pair still overlaps into an ordinary, non-degenerate contact.
const COINCIDENT_SPAWN_BAND = 2.0;           // radial coincidence window, WU
const COINCIDENT_SPAWN_AXIAL_EPS = 2.0;      // extra WU past each spine end (cap-centre window)
const COINCIDENT_SPAWN_NUDGE = 2.5;          // WU per ladder step
const COINCIDENT_SPAWN_MAX_NUDGES = 64;      // 160 WU of pile; a fuller pile keeps the walked slot
const HELM_LOCKED_TYPES = new Set(['ship', 'drone']);

export const PLAYER_CONTACT_RESPONSE_FRACTION = 0.25;
export const PLAYER_CONTACT_MAX_CRUISE_FRACTION = 0.10;
// PQ-137.11 A. ONE contact episode gets ONE budget. The 10 % ceiling bounds how much a contact
// EVENT may take; this number is what makes an event an event. At 6 ticks a hull ground along a
// rock, or reeled past traffic on a live line, flickered contact on and off and opened a FRESH
// budget every few ticks — not one big shove but a stream of small legal ones (measured 2026-09-05:
// 10.0 ambient knocks/min in the Helios rope cell, against a budget of 2).
//
// The number is the measured flicker, not a number chosen to pass. Over the three worst Crucible
// cells at seed 4242, 204 re-contacts with the SAME other body: p50 14 ticks, p75 27, p90 55,
// p95 88 — and then a long tail (p99 582) that is plainly a separate encounter. 90 ticks (1.5 s)
// is the p95 of one contact's own flicker: a re-contact inside it continues the same event and
// draws on its REMAINING budget; past it, a new encounter has begun and gets a fresh one.
// Both benches import this constant so the rule and the instrument can never drift apart.
export const PLAYER_CONTACT_EVENT_BRIDGE_TICKS = 90;
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
    this.world.timestep = this.fixedDt;
    if (this.world.integrationParameters) {
      this.world.integrationParameters.maxCcdSubsteps = 4;
      this.world.integrationParameters.numSolverIterations = 12;
      this.world.integrationParameters.normalizedPredictionDistance = 3.5;
      this.world.integrationParameters.contact_natural_frequency = 240;
    }
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
    this._sleepHeld = new Set();
    this._sleepReeled = new Set();
    this._adoptedJoints = null;
    this._staticLayerVersion = null;
    this._frameOrigin = {
      x: finite(options.frameOrigin && options.frameOrigin.x),
      z: finite(options.frameOrigin && options.frameOrigin.z),
    };
    this._frameOriginSeq = normalizeFrameOriginSeq(options.frameOriginSeq);
    this._frameScratch = { x: 0, z: 0 };
    this._globalScratch = { x: 0, z: 0 };
    // Contact-impact merge bookkeeping is retained across ticks: aId -> Map<bId, {stamp,receipt}>
    // replaces per-event `a\0b` string keys, and the emitted receipt list is a reused scratch.
    this._impactMergeRows = new Map();
    // Inner bucket maps are pooled too: clearing returns them here instead of allocating a
    // fresh Map per a-id bucket per tick.
    this._impactByBPool = [];
    this._impactReceipts = [];
    this._impactStamp = 0;
    this._contactPointScratch = { x: 0, z: 0 };
    this._impactNormalScratch = { x: 1, z: 0 };
    // Bound once so the per-event contactPair callback does not allocate a closure per event.
    // Reads/writes _contactPointScratch; last manifold wins, same as the inline closure did.
    this._contactManifoldCb = (manifold) => {
      if (manifold.numSolverContacts() < 1) return;
      const point = manifold.solverContactPoint(0);
      const s = this._contactPointScratch;
      s.x = finite(point && point.x, s.x);
      s.z = finite(point && point.z, s.z);
    };
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

  /**
   * Full-fidelity world capture for save envelopes. Entity-level saves carry each body's
   * position/velocity scalars, but a world rebuilt from them loses the solver's private state —
   * contact-manifold warm starts, island sleep verdicts, activation energy — and the first
   * rebuilt step answers a marginal resting contact up to an f32 ulp differently, which then
   * grows downstream. `World.takeSnapshot()` preserves that state bit-for-bit; the record side
   * (entity ↔ body handles) is stored alongside so the restore can rebind without `userData`.
   */
  exportWorldSnapshot() {
    const world = this.world;
    if (!world || typeof world.takeSnapshot !== 'function'
      || this._contactImpacts.length) return null;
    const nativeGeometryParameters = planarGeometryParameters(world);
    if (!nativeGeometryParameters || !matchesPlanarPrismGeometry(world, this.RAPIER, nativeGeometryParameters)) return null;
    let bytes;
    try { bytes = world.takeSnapshot(); }
    catch (err) { return null; }
    if (!(bytes instanceof Uint8Array) || !bytes.length) return null;
    const bodies = {};
    for (const [id, rec] of this.records) {
      if (!rec || !rec.body) return null;
      bodies[id] = {
        handle: String(rec.body.handle),
        identity: nativeEntityIdentity(rec.entity),
        sourceLife: occupantGenerationOf(rec.entity),
        state: nativeEntityKinematics(rec.entity),
        contract: nativeBodyContract(rec.entity, rec.spec),
        native: nativeBodyProperties(rec.body, rec.colliders),
        effectiveMass: rec.effectiveMass,
        effectiveInertiaY: rec.effectiveInertiaY,
        bodyResponseMassScale: rec.bodyResponseMassScale,
        bodyResponseInertiaScale: rec.bodyResponseInertiaScale,
        tumbleMaterial: rec._tumbleMaterial === true,
        forcesDirty: rec._forcesDirty === true,
        createdCanSleep: rec._createdCanSleep === true,
        sleepAllowed: rec._sleepAllowed ?? null,
        contactEpisode: { lastTick: rec._playerContactLastTick ?? null,
          cumulativeDeltaV: rec._playerContactCumulativeDeltaV ?? 0 },
      };
    }
    const attachments = {};
    for (const [id, attachment] of this.attachments) {
      attachments[id] = nativeAttachmentDescriptor(attachment);
    }
    return {
      schema: SG02_WORLD_SNAPSHOT_SCHEMA_VERSION,
      nativeGeometryRevision: SG02_NATIVE_GEOMETRY_REVISION,
      nativeGeometryParameters,
      backend: 'rapier-dynamic',
      runtime: nativeRuntimeContract(this),
      snapshot: encodeSnapshotBytes(bytes),
      bodies,
      bodyOrder: Array.from(this.records.keys(), String),
      dynamicBodyOrder: Array.from(this.dynamicRecords, rec => String(rec.entity.id)),
      attachments,
      attachmentOrder: Array.from(this.attachments.keys()),
      tick: this.tick,
      accumulator: finite(this.accumulator),
      frameOrigin: { x: this._frameOrigin.x, z: this._frameOrigin.z },
      frameOriginSeq: this._frameOriginSeq,
    };
  }

  /**
   * Native continuation is an all-owner transaction. Resolve identities before adopting any
   * handle; a missing actor, changed body contract, or unclaimed joint means scalar fallback.
   * Schema 1 had only raw IDs and cannot establish this contract; old saves remain loadable.
   */
  adoptWorldSnapshot(payload, entities = [], options = {}) {
    if (!payload || payload.schema !== SG02_WORLD_SNAPSHOT_SCHEMA_VERSION
      || payload.nativeGeometryRevision !== SG02_NATIVE_GEOMETRY_REVISION
      || !samePlanarGeometryParameters(payload.nativeGeometryParameters, planarGeometryParameters(this.world))
      || payload.backend !== 'rapier-dynamic' || !payload.bodies || !payload.attachments
      || Array.isArray(payload.bodies) || Array.isArray(payload.attachments)
      || typeof payload.snapshot !== 'string' || !payload.snapshot
      || !payload.runtime?.engineVersion
      || !sameNativeValue(payload.runtime, nativeRuntimeContract(this))
      || !sameNativeKeys(payload.bodyOrder, payload.bodies)
      || !sameNativeKeys(payload.attachmentOrder, payload.attachments)
      || !Array.isArray(payload.dynamicBodyOrder)) return false;
    let candidate = null;
    let restored = null;
    let validator = null;
    try {
      if (!Number.isSafeInteger(payload.tick) || payload.tick < 0
        || !Number.isFinite(payload.accumulator) || payload.accumulator < 0
        || !Number.isFinite(payload.frameOrigin?.x) || !Number.isFinite(payload.frameOrigin?.z)
        || !Number.isSafeInteger(payload.frameOriginSeq) || payload.frameOriginSeq < 0) return false;
      if (options.entityIdRemap != null) {
        if (!(options.entityIdRemap instanceof Map)) return false;
        const targets = new Set();
        for (const [key, value] of options.entityIdRemap) {
          if (typeof key !== 'string' || value == null) return false;
          // Save owners may include semantic aliases (for example 'player'). Only
          // body claims must be one-to-one; aliases never authorize another body.
          if (!Object.prototype.hasOwnProperty.call(payload.bodies, key)) continue;
          if (targets.has(String(value))) return false;
          targets.add(String(value));
        }
      }
      const bytes = decodeSnapshotBytes(payload.snapshot);
      if (!bytes || !bytes.length) return false;
      restored = this.RAPIER.World.restoreSnapshot(bytes);
      if (!restored) return false;
      if (!samePlanarGeometryParameters(planarGeometryParameters(restored), payload.nativeGeometryParameters)
        || !matchesPlanarPrismGeometry(restored, this.RAPIER, payload.nativeGeometryParameters)) {
        throw new Error('native_geometry_changed');
      }
      candidate = new Sg02DynamicBodyOwner(this.RAPIER, {
        fixedDt: this.fixedDt, quantum: this.quantum, mode: this.mode,
        captureContactImpacts: this.captureContactImpacts, publishTelemetry: this.publishTelemetry,
        frameOrigin: payload.frameOrigin, frameOriginSeq: payload.frameOriginSeq,
      });
      candidate.world.free();
      candidate.world = restored;
      restored = null;
      if (!sameNativeValue(nativeRuntimeContract(candidate), payload.runtime)) throw new Error('native_runtime_changed');
      candidate._restoringNative = true;
      validator = new Sg02DynamicBodyOwner(this.RAPIER, {
        fixedDt: this.fixedDt, quantum: this.quantum, captureContactImpacts: this.captureContactImpacts, frameOrigin: payload.frameOrigin,
      });
      candidate.tick = Math.max(0, Math.trunc(finite(payload.tick)));
      candidate.accumulator = Math.max(0, finite(payload.accumulator));
      const live = entities.filter(entity => entity && entity.alive !== false && resolvePhysicsBodySpec(entity));
      const byId = new Map(live.map(entity => [String(entity.id), entity]));
      if (byId.size !== live.length) throw new Error('duplicate_current_identity');
      const claimed = new Set(), handles = new Set(), remapped = new Map();
      for (const savedId of payload.bodyOrder) {
        const saved = payload.bodies[savedId];
        if (!saved || typeof saved.handle !== 'string' || !saved.handle
          || !Number.isFinite(Number(saved.handle)) || String(Number(saved.handle)) !== saved.handle
          || !['tumbleMaterial', 'forcesDirty', 'createdCanSleep'].every(key => typeof saved[key] === 'boolean')
          || !(saved.sleepAllowed === null || typeof saved.sleepAllowed === 'boolean')) {
          throw new Error('invalid_native_body_descriptor');
        }
        const mappedId = options.entityIdRemap?.get(savedId);
        let entity = mappedId != null ? byId.get(String(mappedId)) : null;
        if (!options.entityIdRemap) entity = byId.get(savedId);
        // Regenerated fixed scenery does not pass through the persistent-actor allocator.
        // Match its identity AND authored contract AND native pose uniquely, never raw ID.
        if (!entity && mappedId == null && options.entityIdRemap) {
          const matches = live.filter(value => {
            const spec = resolvePhysicsBodySpec(value);
            return !spec.dynamic && !claimed.has(value.id)
              && sameNativeValue(nativeEntityIdentity(value), saved.identity)
              && sameNativeValue(nativeBodyContract(value, spec), saved.contract)
              && bodyStateMatchesEntity({ body: candidate.world.getRigidBody(Number(saved.handle)) },
                value, candidate._frameOrigin, candidate._frameScratch);
          });
          if (matches.length === 1) entity = matches[0];
        }
        if (!entity || claimed.has(entity.id)) throw new Error('unresolved_body_identity');
        // Raw-ID adoption is only a same-life shortcut. The save owner's explicit remap
        // authorizes a newly spawned life; a reused live number alone never does.
        if (!options.entityIdRemap && saved.sourceLife != null
          && occupantGenerationOf(entity) !== saved.sourceLife) throw new Error('body_life_changed');
        const spec = resolvePhysicsBodySpec(entity);
        const handle = Number(saved.handle), body = candidate.world.getRigidBody(handle);
        if (!body || handles.has(handle)
          || !sameNativeValue(nativeEntityIdentity(entity), saved.identity)
          || !sameNativeValue(nativeEntityKinematics(entity), saved.state)
          || !sameNativeValue(nativeBodyContract(entity, spec), saved.contract)) throw new Error('body_contract_changed');
        const colliders = Array.from({ length: body.numColliders() }, (_, index) => body.collider(index));
        if (!sameNativeValue(nativeBodyProperties(body, colliders), saved.native)
          || !nativeMassMatches(body, spec, saved)
          || !bodyStateMatchesEntity({ body }, entity, candidate._frameOrigin, candidate._frameScratch)) {
          throw new Error('native_body_mismatch');
        }
        // Compare native geometry against an independently constructed current authored body,
        // not merely against metadata captured alongside the same opaque native bytes.
        const scratchEntity = { ...entity, pos: { ...entity.pos }, prevPos: { ...entity.prevPos },
          vel: { ...entity.vel }, flags: { ...entity.flags }, data: nativePlain(entity.data || {}) };
        const expected = validator._createRecord(scratchEntity, spec);
        validator._applyBodyResponse(expected, { massScale: saved.bodyResponseMassScale, inertiaScale: saved.bodyResponseInertiaScale });
        if (saved.tumbleMaterial) validator._syncTumbleMaterial(expected, true);
        expected.body.recomputeMassPropertiesFromColliders();
        if (!sameNativeValue(nativeBodyProperties(expected.body, expected.colliders), saved.native)) {
          throw new Error('authored_native_geometry_changed');
        }
        const rec = this._adoptRecord.call(candidate, entity, spec, body, colliders);
        validator.world.removeRigidBody(expected.body);
        validator._colliderOwners.clear();
        rec.effectiveMass = saved.effectiveMass;
        rec.effectiveInertiaY = saved.effectiveInertiaY;
        rec.bodyResponseMassScale = saved.bodyResponseMassScale;
        rec.bodyResponseInertiaScale = saved.bodyResponseInertiaScale;
        rec._tumbleMaterial = saved.tumbleMaterial === true;
        rec._forcesDirty = saved.forcesDirty === true;
        rec._createdCanSleep = saved.createdCanSleep === true;
        if (saved.sleepAllowed != null) rec._sleepAllowed = saved.sleepAllowed;
        if (!saved.contactEpisode || !(saved.contactEpisode.lastTick === null
          || Number.isFinite(saved.contactEpisode.lastTick))
          || !Number.isFinite(saved.contactEpisode.cumulativeDeltaV)
          || saved.contactEpisode.cumulativeDeltaV < 0) throw new Error('invalid_contact_episode');
        rec._playerContactLastTick = saved.contactEpisode.lastTick;
        rec._playerContactCumulativeDeltaV = saved.contactEpisode.cumulativeDeltaV;
        claimed.add(entity.id); handles.add(handle); remapped.set(savedId, entity.id);
      }
      if (claimed.size !== live.length) throw new Error('unclaimed_current_body');
      // Disabled pooled bodies still affect future reuse/arena allocation. Until their pool
      // ownership and ordering are serialized, their presence requires honest scalar fallback.
      candidate.world.forEachRigidBody(body => {
        if (!handles.has(body.handle)) throw new Error('unrepresented_native_body');
      });
      const restoreOrder = (keys, expected) => {
        const ordered = keys.map(key => candidate.records.get(remapped.get(key)));
        if (ordered.length !== expected.size || new Set(ordered).size !== expected.size
          || ordered.some(rec => !expected.has(rec))) throw new Error('native_owner_order_mismatch');
        return new Set(ordered);
      };
      candidate.dynamicRecords = restoreOrder(payload.dynamicBodyOrder, candidate.dynamicRecords);
      candidate._adoptedJoints = new Map();
      const jointHandles = new Set();
      const semantic = options.attachments;
      for (const id of payload.attachmentOrder) {
        const saved = payload.attachments[id];
        const ownerId = remapped.get(String(saved.ownerId)), targetId = remapped.get(String(saved.targetId));
        if (ownerId == null || targetId == null) throw new Error('unresolved_joint_endpoint');
        if (semantic && !nativeAttachmentMatchesSemantic(saved, semantic[id], ownerId, targetId)) {
          throw new Error('attachment_contract_changed');
        }
        const current = typeof options.resolveAttachmentContract === 'function'
          ? options.resolveAttachmentContract(id) : null;
        const currentPolicy = nativeAttachmentPolicy(current, saved.defId);
        const savedPolicy = nativeAttachmentPolicy(saved, saved.defId);
        if (!currentPolicy || !savedPolicy || !sameNativeValue(currentPolicy, savedPolicy)) {
          throw new Error('attachment_policy_changed');
        }
        if (saved.joint != null) {
          const handle = Number(saved.joint.handle), joint = candidate.world.getImpulseJoint(handle);
          if (!joint || jointHandles.has(handle)
            || !sameNativeValue(nativeJointProperties(joint), saved.joint.native)
            || joint.body1().handle !== candidate.records.get(ownerId).body.handle
            || joint.body2().handle !== candidate.records.get(targetId).body.handle) throw new Error('joint_identity_changed');
          candidate._adoptedJoints.set(id, { joint, saved });
          jointHandles.add(handle);
        }
        if (!candidate.createAttachment({ ...saved, attachmentId: id, ownerId, targetId })) {
          throw new Error('attachment_adoption_failed');
        }
      }
      if (semantic && Object.values(semantic).some(value => value?.state === 'active' && !candidate.attachments.has(value.id))) {
        throw new Error('unclaimed_semantic_attachment');
      }
      if (candidate._adoptedJoints.size) throw new Error('unbound_native_joint');
      candidate.world.impulseJoints.forEach(joint => {
        if (!jointHandles.has(joint.handle)) throw new Error('unclaimed_native_joint');
      });
      if (candidate.world.multibodyJoints?.len() > 0) throw new Error('unsupported_multibody_joint');
      candidate._adoptedJoints = null;
      candidate._restoringNative = false;
      validator.dispose();
      validator = null;
      this._commitNativeOwner(candidate);
      candidate = null;
      return true;
    } catch (_) {
      if (validator) validator.dispose();
      if (candidate) candidate.dispose();
      else if (restored) restored.free();
      return false;
    }
  }

  // A fallback owns a fresh complete world, never old bodies with their owner maps cleared.
  rebuildWorldFromEntities(entities = [], options = {}) {
    const candidate = new Sg02DynamicBodyOwner(this.RAPIER, {
      fixedDt: this.fixedDt, quantum: this.quantum, mode: this.mode,
      captureContactImpacts: this.captureContactImpacts, publishTelemetry: this.publishTelemetry,
      frameOrigin: options.frameOrigin || this._frameOrigin,
      frameOriginSeq: options.frameOriginSeq ?? this._frameOriginSeq,
    });
    try {
      // Construction may move coincident spawns. Stage those mirrors too so a later
      // native construction failure cannot mutate entities belonging to the old owner.
      const originals = new Map();
      const staged = entities.map(entity => {
        if (!entity) return entity;
        const scratch = { ...entity, pos: entity.pos && { ...entity.pos },
          prevPos: entity.prevPos && { ...entity.prevPos }, vel: entity.vel && { ...entity.vel },
          flags: entity.flags && { ...entity.flags } };
        originals.set(scratch, entity);
        return scratch;
      });
      candidate.syncFromEntities(staged);
      const mirrors = [];
      for (const rec of candidate.records.values()) {
        const scratch = rec.entity, entity = originals.get(scratch);
        for (const property of ['pos', 'prevPos']) {
          for (const key of ['x', 'z']) {
            if (entity[property] && scratch[property] && entity[property][key] !== scratch[property][key]) {
              mirrors.push({ entity: entity[property], key, value: scratch[property][key] });
            }
          }
        }
        rec.entity = entity;
      }
      this._commitNativeOwner(candidate, mirrors);
    } catch (error) { candidate.dispose(); throw error; }
  }

  _commitNativeOwner(candidate, mirrors = []) {
    const previousWorld = this.world, previousQueue = this._eventQueue;
    const contactCallback = this._contactManifoldCb;
    // Native staging must not publish a partial set of sleeping mirrors either. Game entities
    // use ordinary data properties; refuse accessor/read-only destinations before writing any.
    for (const rec of candidate.records.values()) {
      const entity = rec.entity, value = rec.spec.dynamic && rec.body.isSleeping();
      if (entity.physicsSleeping === value) continue;
      mirrors.push({ entity, key: 'physicsSleeping', value });
    }
    for (const mirror of mirrors) {
      const descriptor = Object.getOwnPropertyDescriptor(mirror.entity, mirror.key);
      if (descriptor ? !('value' in descriptor) || !descriptor.writable : !Object.isExtensible(mirror.entity)) {
        throw new Error('entity_mirror_not_writable');
      }
      mirror.descriptor = descriptor;
    }
    // Every owner slot is constructor-owned, configurable data. Check before publication so
    // the following replacement cannot fail midway on an externally sealed/read-only owner.
    if (!Object.isExtensible(this)) throw new Error('native_owner_not_extensible');
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(this))) {
      if (!descriptor.configurable) throw new Error('native_owner_slot_not_configurable');
    }
    let written = 0;
    try {
      for (const mirror of mirrors) {
        Object.defineProperty(mirror.entity, mirror.key, mirror.descriptor
          ? { ...mirror.descriptor, value: mirror.value }
          : { value: mirror.value, writable: true, configurable: true, enumerable: true });
        written++;
      }
    } catch (error) {
      for (let index = written - 1; index >= 0; index--) {
        const mirror = mirrors[index];
        if (mirror.descriptor) Object.defineProperty(mirror.entity, mirror.key, mirror.descriptor);
        else delete mirror.entity[mirror.key];
      }
      throw error;
    }
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    descriptors._contactManifoldCb.value = contactCallback;
    for (const key of Object.keys(this)) if (!(key in descriptors)) delete this[key];
    Object.defineProperties(this, descriptors);
    // Publication succeeded. Cleanup is best-effort and MUST NOT escape into the staging
    // catch, which would otherwise free the world now installed on this owner.
    for (const cleanup of [
      () => previousQueue?.free(),
      () => previousWorld?.free(),
    ]) {
      try { cleanup(); }
      catch (_) { this._diagnostics.nativeCleanupFailed = true; }
    }
  }

  /**
   * Record assembly for a snapshot-restored body — the `_createRecord` tail with the WASM
   * objects supplied instead of built. Kinematics are read back from the body (the snapshot
   * is the authority), so every record mirror starts bit-identical to solver state.
   */
  _adoptRecord(entity, spec, body, colliders) {
    const material = contactMaterialFor(entity, spec);
    const proxyManifest = proxyManifestForBody(entity, spec);
    const translation = body.translation();
    const linvel = body.linvel();
    const angvel = body.angvel();
    const yaw = wrapAngle(yawFromQuat(body.rotation()));
    const posX = translation.x;
    const posZ = translation.z;
    const global = frameToGlobal({ x: posX, z: posZ }, this._frameOrigin, this._globalScratch);
    const wy = -finite(angvel.y);
    const ghostPoolKey = spec.dynamic && material.ghost && spec.material === 'projectile'
      ? ghostProjectilePoolKey(spec)
      : null;
    const record = {
      entity,
      spec,
      revision: spec.revision,
      body,
      collider: colliders[0],
      colliders,
      ccdEnabled: typeof body.isCcdEnabled === 'function' ? body.isCcdEnabled() : !!spec.ccd,
      coincidentSpines: colliders.map((owned) => coincidentSpineForCollider(owned)),
      _createdCanSleep: spec.dynamic === true && mayRapierIslandSleep(entity, spec) === true,
      _postStepSleepSkip: false,
      _postStepReadTick: -1,
      proxyId: proxyManifest ? proxyManifest.id : null,
      ghostPoolKey,
      appliedForce: zero3(),
      appliedTorque: zero3(),
      controlForce: zero3(),
      controlTorque: zero3(),
      // Rapier's user_force/user_torque accumulators persist across world.step() and are
      // captured by takeSnapshot(): the restored body can carry the last step's stale force,
      // which the baseline clears via resetBodyForces at the top of the next _stepFixed.
      // Marking dirty makes the first post-restore step run that same reset instead of
      // integrating the stale force a second time alongside the new command.
      _forcesDirty: true,
      expected: { vx: 0, vz: 0, wy: 0, yaw: 0, x: 0, z: 0 },
      _bodyPoseX: Math.fround(posX),
      _bodyPoseZ: Math.fround(posZ),
      kinematics: {
        x: posX,
        z: posZ,
        vx: linvel.x,
        vz: linvel.z,
        yaw,
        wy,
      },
      maxSpeed: Infinity,
      effectiveMass: spec.mass,
      effectiveInertiaY: spec.inertiaY,
      bodyResponseMassScale: 1,
      bodyResponseInertiaScale: 1,
      snapshot: {
        id: entity.id,
        x: quantize(global.x, this.quantum),
        z: quantize(global.z, this.quantum),
        yaw: quantize(yaw, this.quantum),
        vx: quantize(linvel.x, this.quantum),
        vz: quantize(linvel.z, this.quantum),
        wy: quantize(wy, this.quantum),
        revision: spec.revision,
      },
    };
    for (const owned of colliders) this._colliderOwners.set(owned.handle, { rec: record, collider: owned });
    this.records.set(entity.id, record);
    if (spec.dynamic) this.dynamicRecords.add(record);
    // Same contract as rebindEntity: the restored body already holds the entity's saved
    // scalars, so the next sync must not force a scalar pose write over solver state.
    this._reboundEntityIds.add(entity.id);
    // The restored WASM sleep verdict is authoritative; keep the entity mirror honest so
    // sleep-skip and serialize paths read the same answer the solver holds.
    if (!this._restoringNative) entity.physicsSleeping = spec.dynamic === true && typeof body.isSleeping === 'function'
      ? body.isSleeping() === true
      : false;
    return record;
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
    if (rec.proxyId !== proxyIdForEntity(entity, spec)) return false;
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

  step(dt = this.fixedDt, simTick = null) {
    const fixedDt = this.fixedDt;
    if (!Number.isFinite(fixedDt) || fixedDt <= 0) {
      throw new RangeError(`SG-02 owner step requires a finite positive fixedDt, got ${fixedDt}`);
    }
    const carried = this.accumulator;
    if (!Number.isFinite(carried) || carried < -1e-12) {
      throw new RangeError(
        `SG-02 owner step requires a finite accumulator >= -1e-12, got ${carried}`);
    }
    const prospectiveTotal = carried + Math.min(Math.max(0, finite(dt)), 0.25);
    const estimatedSteps = Math.floor((prospectiveTotal + 1e-12) / fixedDt);
    if (!Number.isSafeInteger(estimatedSteps) || estimatedSteps > MAX_OWNER_SUBSTEPS
        || (estimatedSteps >= 1 && prospectiveTotal - fixedDt === prospectiveTotal)) {
      throw new RangeError(
        `SG-02 owner step cannot progress: accumulator=${carried}, dt=${dt}, fixedDt=${fixedDt}`
        + ` would require ${estimatedSteps} substeps (max ${MAX_OWNER_SUBSTEPS})`);
    }
    this._simTick = Number.isFinite(simTick) ? Math.max(0, Math.trunc(simTick)) : null;
    this.accumulator = prospectiveTotal;
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
    const impulse = planeForceInto(input.impulse, _planeForceScratch);
    const evidenceBefore = journalFor() ? rec.body.linvel() : null;
    // PQ-137.11 C. A hit may not spin the player's hull (owner ruling; the player is already
    // excluded from tumble and hitstun in tumbleStates.js / collisionConsequences.js). An impulse
    // applied at a point OFF the centre of mass IS an angular impulse: measured 2026-09-05, one
    // `weapon_hit` point impulse took the player from 0 to -13.48 rad/s in the Helios rope cell and
    // from +3.15 to -6.19 rad/s at Lagrange — the entire spin in both runs, from a single hit.
    // The LINEAR impulse is passed through in full: nothing is scaled, damped or clamped. Only the
    // torque arm is dropped, and only for the player.
    if (recordTakesOffCentreImpulse(rec) && input.point && typeof rec.body.applyImpulseAtPoint === 'function') {
      const localPoint = this._globalPointToFrameLocal(input.point, rec.body.translation(), _vecWriteScratch);
      const maxTorque = Number.isFinite(input.maxTorque) ? Math.max(0, input.maxTorque) : null;
      if (maxTorque != null) {
        const trans = rec.body.translation();
        const rx = localPoint.x - trans.x;
        const rz = localPoint.z - trans.z;
        const torqueY = rx * impulse.z - rz * impulse.x;
        const clampedTorqueY = Math.max(-maxTorque, Math.min(maxTorque, torqueY));
        rec.body.applyImpulse(impulse, true);
        if (clampedTorqueY !== 0) {
          applyYawTorqueImpulse(rec, { y: clampedTorqueY }, input);
        }
      } else {
        rec.body.applyImpulseAtPoint(impulse, localPoint, true);
      }
    } else {
      if (input.point) rec._playerOffCentreImpulsesCentred = (rec._playerOffCentreImpulsesCentred || 0) + 1;
      rec.body.applyImpulse(impulse, true);
    }
    if (evidenceBefore) observeAppliedImpulse(rec.entity, evidenceBefore, rec.body.linvel(), input.provenance, input.tick, input.reason);
    return true;
  }

  applyTorqueImpulse(input = {}) {
    const rec = this.records.get(input.entityId);
    return applyYawTorqueImpulse(rec, input.impulse, input);
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
    if (!this._restoringNative) {
      this._wakeSleepingBody(owner);
      this._wakeSleepingBody(target);
    }
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
    const reason = typeof input.reason === 'string' && input.reason ? input.reason : 'cut';
    const loadBreak = !!(attachment.springState && attachment.springState.breakRequested);
    if (usesElasticWhipSpring(attachment.spring)) {
      if (!loadBreak && PLAYER_WHIP_RELEASE_REASONS.has(reason)) {
        const evidenceBefore=journalFor()?attachment.target.body.linvel():null;
        this._spendElasticWhipStoredEnergy(attachment);
        if(evidenceBefore)observeAppliedImpulse(attachment.target.entity,evidenceBefore,attachment.target.body.linvel(),
          {actorId:attachment.ownerId,weaponId:attachment.defId,attachmentId:attachment.id},input.tick??this.tick,'constraint');
      } else if (attachment.springState) {
        attachment.springState.lastStoredEnergy = 0;
      }
    }
    observeRelease(attachment.id, input.tick ?? this.tick, loadBreak ? 'break' : reason);
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
      storedEnergy: legacyRope || frameCoupler
        ? 0
        : Math.max(0, finite(springState.lastStoredEnergy, 0.5 * (spring && spring.K ? spring.K : 0) * stretch * stretch)),
      spentEnergy: legacyRope || frameCoupler
        ? 0
        : Math.max(0, finite(springState.lastSpentEnergy, 0)),
      breakRequested: legacyRope ? false : !!springState.breakRequested,
      springState: legacyRope ? null : Object.freeze(cloneSpringState(springState)),
      sourceWorld: Object.freeze(source),
      targetWorld: Object.freeze(target),
      tick: this.tick,
    });
  }

  _stepFixed() {
    const tumbleFling = combatFlag('tumbleFling');
    this._refreshSleepPolicy();
    for (const rec of this.dynamicRecords) {
      setZero3(rec.appliedForce);
      setZero3(rec.appliedTorque);
      setZero3(rec.controlForce);
      setZero3(rec.controlTorque);
      rec.maxSpeed = Infinity;
      rec._tumbling = false;
      const command = consumePhysicsCommand(rec.entity);
      // PQ-133.04: a projectile bounce continuation queued during the previous hit emit lands
      // here, at the start of the next step, before the expected-kinematics capture reads the
      // body — so the bounce rewrite is authoritative motion, never "pure contact response".
      const continuation = consumeProjectileContinuation(rec.entity);
      rec._hadCommand = !!command;
      if (!command && !continuation && this._sleepingRecordSkipsCpu(rec, false)) continue;
      // resetForces/resetTorques carry a wake arg, so they are only safe to skip when the body
      // is provably awake (canSleep=false steady state) and the force accumulator is provably
      // zero — i.e. no addForce/addTorque landed since the last reset (rec._forcesDirty).
      if (rec._forcesDirty === true || rec._sleepAllowed !== false) resetBodyForces(rec.body);
      rec._forcesDirty = false;
      this._applyBodyResponse(rec, command && command.bodyResponse);
      if (command) this._applyCommand(rec, command);
      if (continuation) this._applyProjectileContinuation(rec, continuation);
    }

    if (tumbleFling) {
      for (const rec of this.dynamicRecords) {
        if (rec._tumbling !== rec._tumbleMaterial) this._syncTumbleMaterial(rec, rec._tumbling === true);
      }
    }

    this._applyAttachmentSprings();

    // Structural-give baseline: at this point every impulse (dash, spring, combat) has already
    // mutated linvel/angvel; only the continuous control force/torque still integrates inside
    // world.step(). Predicting that lets the post-step pass isolate pure contact response.
    for (const rec of this.dynamicRecords) {
      if (this._sleepingRecordSkipsCpu(rec, false)) continue;
      this._captureExpectedKinematics(rec);
    }

    let stepReceipts = [];
    if (this._eventQueue) {
      this.world.step(this._eventQueue);
      stepReceipts = this._captureContactImpacts() || [];
    } else {
      this.world.step();
    }
    this.tick++;
    // Bound solver contact spikes before publishing the authoritative motion snapshot. Each
    // body's post-step WASM kinematics are read ONCE into a retained per-record scratch shared
    // by the give pass and _enforcePlane; fields a give rewrites are flagged so the plane pass
    // re-reads the authoritative value instead of the stale scratch.
    this._stepContactReceipts = stepReceipts;
    const looseContactIds = this._looseContactIds || (this._looseContactIds = new Set());
    looseContactIds.clear();
    for (let i = 0; i < stepReceipts.length; i++) {
      const receipt = stepReceipts[i];
      const ra = this.records.get(receipt.aId);
      const rb = this.records.get(receipt.bId);
      if ((ra && ra._tumbling === true) || (rb && rb._tumbling === true)) {
        looseContactIds.add(receipt.aId);
        looseContactIds.add(receipt.bId);
      }
    }
    for (const rec of this.dynamicRecords) {
      // The post-step sleep verdict is authoritative for the rest of the step: world.step is
      // the only sleeper (a body Rapier reports asleep here cannot wake until the next step
      // except via an explicit wake path, and _wakeSleepingBody clears this flag). A sleeping
      // island's kinematics did not move, so neither the WASM readback nor the give pass — which
      // would only compare that frozen pose against a stale prediction — has anything to do.
      rec._postStepSleepSkip = this._sleepingRecordSkipsCpu(rec, true);
      if (rec._postStepSleepSkip) continue;
      this._readPostStepKinematics(rec);
      this._applyStructuralGive(rec);
    }
    this._stepContactReceipts = null;

    if (journalFor()) for (const receipt of stepReceipts) {
      const a = this.records.get(receipt.aId), b = this.records.get(receipt.bId);
      if (a && b) {
        const pa=a.body.translation(),pb=b.body.translation();
        observeContact(a.entity, b.entity, {
        ...receipt,
        positionA:{x:pa.x+this._frameOrigin.x,z:pa.z+this._frameOrigin.z},
        positionB:{x:pb.x+this._frameOrigin.x,z:pb.z+this._frameOrigin.z},
        beforeA: { x: a.expected.vx, z: a.expected.vz }, beforeB: { x: b.expected.vx, z: b.expected.vz },
        afterA: a.body.linvel(), afterB: b.body.linvel(),
      });
      }
    }

    if (stepReceipts.length > 0) {
      this._distributeAppliedPlayerDeltaV(stepReceipts);
      this._contactImpacts.push(...stepReceipts);
      for (let i = 0; i < stepReceipts.length; i++) {
        const receipt = stepReceipts[i];
        this._wakeSleepingBody(this.records.get(receipt.aId));
        this._wakeSleepingBody(this.records.get(receipt.bId));
      }
    }

    for (const rec of this.dynamicRecords) {
      if (rec._postStepSleepSkip === true) {
        rec._skippedSleepKinematics = true;
        this._stampIslandSleep(rec, true);
        continue;
      }
      rec._skippedSleepKinematics = false;
      // A body woken after the verdict was cached (a receipt endpoint roused by
      // _wakeSleepingBody) skipped the post-step read; its scratch must be fresh before
      // _enforcePlane/_clampSpeed consult it, not residue from an earlier step.
      if (rec._postStepReadTick !== this.tick) this._readPostStepKinematics(rec);
      const kinematics = this._enforcePlane(rec);
      this._clampSpeed(rec, kinematics);
      if (this._sleepReeled.has(rec)) this._canonicalizeManualSpringBody(rec, kinematics);
      this._syncEntityFromKinematics(rec, kinematics);
      this._publishTelemetry(rec);
    }
    this._persistIslandSleep();
  }

  _hasManualSpringAttachment(rec) {
    for (const attachment of this.attachments.values()) {
      const reeled = Math.max(0, Math.trunc(finite(attachment.reelRevision))) > 0;
      if (reeled && !usesLegacyRopeSpring(attachment.spring)
        && (attachment.owner === rec || attachment.target === rec)) return true;
    }
    return false;
  }

  _wakeSleepingBody(rec) {
    if (!rec || !rec.body) return;
    // Explicit wakes between the post-step passes invalidate the cached skip verdict.
    rec._postStepSleepSkip = false;
    if (typeof rec.body.wakeUp === 'function') rec.body.wakeUp();
    if (typeof rec.body.setCanSleep === 'function') rec.body.setCanSleep(false);
    if (rec.entity) rec.entity.physicsSleeping = false;
  }

  _refreshSleepPolicy() {
    const held = this._sleepHeld;
    const reeled = this._sleepReeled;
    held.clear();
    reeled.clear();
    for (const attachment of this.attachments.values()) {
      if (attachment.owner) held.add(attachment.owner);
      if (attachment.target) held.add(attachment.target);
      const isReeled = Math.max(0, Math.trunc(finite(attachment.reelRevision))) > 0;
      if (isReeled && !usesLegacyRopeSpring(attachment.spring)) {
        if (attachment.owner) reeled.add(attachment.owner);
        if (attachment.target) reeled.add(attachment.target);
      }
    }
    for (const rec of this.dynamicRecords) {
      const allow = mayRapierIslandSleep(rec.entity, rec.spec) && !held.has(rec)
        && !(rec.entity && rec.entity.flags && rec.entity.flags.noInterp);
      if (rec._sleepAllowed !== allow) {
        rec._sleepAllowed = allow;
        if (rec.body && typeof rec.body.setCanSleep === 'function') rec.body.setCanSleep(allow);
      }
      // Compat RigidBody exposes no setCanSleep, so WASM canSleep is fixed at creation by
      // desc.setCanSleep. A body created while sleep-eligible keeps canSleep=true for life:
      // while ineligible it is kept awake by waking it every tick — the same hammer the old
      // unconditional wakeUp() applied (a body that slept would surface physicsSleeping=true).
      // A body created with canSleep=false can never sleep; the hammer was always a no-op for it.
      if (!allow && rec._createdCanSleep === true
          && rec.body && typeof rec.body.wakeUp === 'function') {
        rec.body.wakeUp();
      }
    }
  }

  _sleepingRecordSkipsCpu(rec, afterStep) {
    if (!rec || !rec.body || typeof rec.body.isSleeping !== 'function') return false;
    // Ineligible bodies are provably awake at this point: either created canSleep=false
    // (cannot sleep) or woken by the keep-awake hammer in _refreshSleepPolicy this tick.
    if (rec._sleepAllowed === false) return false;
    if (rec.body.isSleeping() !== true) return false;
    return shouldSkipSleepingKinematics(rec.entity, rec.spec, {
      sleeping: true,
      held: this._sleepReeled.has(rec),
      hadCommand: afterStep ? false : rec._hadCommand === true,
    });
  }

  _stampIslandSleep(rec, sleeping) {
    if (!rec || !rec.entity || !rec.body) return;
    rec.entity.physicsSleeping = sleeping === true;
    const handle = rec.body.handle;
    rec.entity.physicsIslandId = typeof handle === 'number' ? handle
      : (typeof rec.body.islandId === 'function' ? rec.body.islandId() | 0 : 0);
  }

  _persistIslandSleep() {
    for (const rec of this.dynamicRecords) {
      if (rec._skippedSleepKinematics === true) continue;
      if (!rec.entity || !rec.body || typeof rec.body.isSleeping !== 'function') continue;
      // Ineligible bodies are provably awake (canSleep=false for life, or woken by the
      // keep-awake hammer this same tick) — the WASM read is provably false.
      const sleeping = rec._sleepAllowed === false
        ? false
        : rec.body.isSleeping() === true;
      this._stampIslandSleep(rec, sleeping);
    }
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
    _vecWriteScratch.x = x;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = z;
    rec.body.setTranslation(_vecWriteScratch, true);
    rec._bodyPoseX = Math.fround(x);
    rec._bodyPoseZ = Math.fround(z);
    rec.body.setRotation(quatFromYawInto(yaw, _quatWriteScratch), true);
    _vecWriteScratch.x = vx;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = vz;
    rec.body.setLinvel(_vecWriteScratch, true);
    _vecWriteScratch.x = 0;
    _vecWriteScratch.y = -wy;
    _vecWriteScratch.z = 0;
    rec.body.setAngvel(_vecWriteScratch, true);
    kinematics.x = x;
    kinematics.z = z;
    kinematics.yaw = yaw;
    kinematics.vx = vx;
    kinematics.vz = vz;
    kinematics.wy = wy;
  }

  _captureExpectedKinematics(rec) {
    const v = rec.body.linvel();
    const w = rec.body.angvel();
    const e = rec.expected || (rec.expected = { vx: 0, vz: 0, wy: 0, x: 0, z: 0 });
    const dt = this.fixedDt;
    const yawClampedByWrite = !Number.isFinite(w.y) || Math.abs(w.y) > SANE_MAX_YAW_RATE;
    if (yawClampedByWrite || !Number.isFinite(w.x) || !Number.isFinite(w.z)
        || Math.abs(w.x) > 1e-9 || Math.abs(w.z) > 1e-9) {
      _vecWriteScratch.x = 0;
      _vecWriteScratch.y = boundedYawRate(w.y);
      _vecWriteScratch.z = 0;
      rec.body.setAngvel(_vecWriteScratch, true);
    }
    const wyBody = yawClampedByWrite ? boundedYawRate(w.y) : w.y;
    e.vx = finite(v.x) + rec.controlForce.x / positive(rec.effectiveMass, rec.spec.mass) * dt;
    e.vz = finite(v.z) + rec.controlForce.z / positive(rec.effectiveMass, rec.spec.mass) * dt;
    const wyUndamped = -wyBody
      + rec.controlTorque.y / positive(rec.effectiveInertiaY, rec.spec.inertiaY) * dt;
    const damping = contactAngularDamping(rec);
    let wyPredicted = damping > 0 ? wyUndamped / (1 + damping * dt) : wyUndamped;
    // PQ-137.11 C, the safety net. The player branch of _applyStructuralGive restores this
    // prediction wholesale and returns, so the player used to be the one hull in the game with no
    // absolute yaw ceiling — measured at 13.51 rad/s in the Helios rope cell, and earlier at
    // 160 rad/s off a starter pulse. Every other body passes SANE_MAX_YAW_RATE; so does the player
    // now. Applied HERE, before the pose is integrated, so the restored rotation and the restored
    // rate are the same motion. The player's own commanded yaw peaks near 3 rad/s, so this ceiling
    // never touches steering; it only catches something that spun the hull.
    if (rec.entity && rec.entity.isPlayer === true) {
      rec._playerYawCeilingApplied = yawClampedByWrite
        || Math.abs(wyPredicted) > SANE_MAX_YAW_RATE;
      if (Math.abs(wyPredicted) > SANE_MAX_YAW_RATE) wyPredicted = clamp(wyPredicted, -SANE_MAX_YAW_RATE, SANE_MAX_YAW_RATE);
    }
    e.wy = wyPredicted;
    // Rapier can integrate a contact-generated angular response into the pose before the
    // post-step structural-give pass clamps that response's angular velocity. Keep the pose a
    // no-contact prediction so a glancing station/rock contact cannot leave a one-frame heading
    // kick behind after its spin has been removed.
    e.yaw = wrapAngle(yawFromQuat(rec.body.rotation()) + e.wy * dt);
    let px = rec._bodyPoseX;
    let pz = rec._bodyPoseZ;
    if (!Number.isFinite(px) || !Number.isFinite(pz)) {
      const p = rec.body.translation();
      px = rec._bodyPoseX = Math.fround(p.x);
      pz = rec._bodyPoseZ = Math.fround(p.z);
    }
    e.x = px + e.vx * dt;
    e.z = pz + e.vz * dt;
  }

  // Reads linvel/angvel (and rotation for the player, whose give rule needs solver yaw) into a
  // retained scratch. Rapier's getters allocate fresh objects with no out-parameter API, so the
  // per-record object absorbs the per-tick allocation; dirty flags mark components a give pass
  // rewrote so _enforcePlane re-reads the authoritative WASM value.
  _readPostStepKinematics(rec) {
    rec._postStepReadTick = this.tick;
    const post = rec.postStep || (rec.postStep = {
      v: { x: 0, y: 0, z: 0 },
      w: { x: 0, y: 0, z: 0 },
      q: { x: 0, y: 0, z: 0, w: 1 },
      qRead: false,
      vDirty: false,
      wDirty: false,
      qDirty: false,
    });
    const v = rec.body.linvel();
    const w = rec.body.angvel();
    post.v.x = v.x;
    post.v.y = v.y;
    post.v.z = v.z;
    post.w.x = w.x;
    post.w.y = w.y;
    post.w.z = w.z;
    post.vDirty = false;
    post.wDirty = false;
    post.qDirty = false;
    post.qRead = false;
    if (rec.entity && rec.entity.isPlayer === true) {
      const q = rec.body.rotation();
      post.q.x = q.x;
      post.q.y = q.y;
      post.q.z = q.z;
      post.q.w = q.w;
      post.qRead = true;
    }
    return post;
  }

  _contactResponseDvBudget(rec) {
    const receipts = this._stepContactReceipts;
    if (!receipts || receipts.length === 0) return Infinity;
    const own = rec.entity && rec.entity.id;
    const e = rec.expected;
    const seen = this._contactBudgetIds || (this._contactBudgetIds = new Set());
    seen.clear();
    let slack = 0;
    let involved = false;
    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      const otherId = receipt.aId === own ? receipt.bId : (receipt.bId === own ? receipt.aId : null);
      if (otherId == null || seen.has(otherId)) continue;
      seen.add(otherId);
      involved = true;
      const other = this.records.get(otherId);
      const oe = other && other.expected;
      const ovx = oe ? finite(oe.vx) : 0;
      const ovz = oe ? finite(oe.vz) : 0;
      slack += 2 * Math.hypot(finite(e && e.vx) - ovx, finite(e && e.vz) - ovz);
    }
    if (!involved) return Infinity;
    return (rec._tumbling === true ? TUMBLE_MAX_CONTACT_DV : MAX_CONTACT_DV) + slack;
  }

  _playerContactClosingFraction(rec) {
    const receipts = this._stepContactReceipts;
    if (!receipts || !receipts.length) return null;
    const own = rec.entity && rec.entity.id;
    let maxClosing = 0;
    let involved = false;
    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i];
      if (r.aId === own || r.bId === own) {
        involved = true;
        let closing = r.preSolveClosingSpeed;
        if (!Number.isFinite(closing)) {
          const other = this.records.get(r.aId === own ? r.bId : r.aId);
          const e = rec.expected;
          const oe = other && other.expected;
          const at = rec.kinematics;
          const from = other && other.kinematics;
          // Older/custom receipts can omit the measurement; use the same pre-solve
          // relative motion and body positions as the native contact recorder.
          closing = other ? preSolveRadialClosingSpeed(
            finite(e && e.vx), finite(e && e.vz),
            finite(oe && oe.vx), finite(oe && oe.vz),
            finite(from && from.x) - finite(at && at.x),
            finite(from && from.z) - finite(at && at.z),
          ) : 0;
        }
        if (closing > maxClosing) maxClosing = closing;
      }
    }
    if (!involved) return null;
    const incomingSpeed = Math.hypot(finite(rec.expected && rec.expected.vx), finite(rec.expected && rec.expected.vz));
    return incomingSpeed > 1e-3 ? maxClosing / incomingSpeed : 0;
  }

  // Authoritative "is the player's hull actually touching anything" answer, straight from the
  // narrow phase. Contact-force receipts are a gameplay signal gated by a per-pair force
  // threshold; a light grind or a scrape distributed over compound colliders does contact
  // work without ever earning one. Pairs between the record's own colliders (a compound
  // hull's primitives pack tightly enough to neighbour each other) are self-contact, not
  // contact work. Only consulted on unexplained, receiptless delta-V, so the ordinary
  // no-contact tick costs nothing.
  _playerInLiveContact(rec) {
    const colliders = rec && rec.colliders;
    const world = this.world;
    if (!Array.isArray(colliders) || colliders.length === 0
        || !world || typeof world.contactPairsWith !== 'function') return false;
    for (let i = 0; i < colliders.length; i++) {
      let touching = false;
      try {
        world.contactPairsWith(colliders[i], (other) => {
          if (touching) return;
          const owned = this._colliderOwners.get(other.handle);
          if (!owned || owned.rec !== rec) touching = true;
        });
      } catch (_) {
        touching = false;
      }
      if (touching) return true;
    }
    return false;
  }

  // PQ-137.11: player contact structural give.
  // The player is not ammunition: the solver's planar velocity response is REAL and passes
  // through untouched, but contact may never spin or kick the hull — yaw pose and rate restore
  // to the _captureExpectedKinematics() baseline, yaw-rate ceiling included.
  _applyPlayerStructuralGive(rec) {
    const e = rec.expected;
    if (!e) return 0;
    const post = rec.postStep;
    const v = post && post.vDirty !== true ? post.v : rec.body.linvel();
    const vx = finite(v.x);
    const vz = finite(v.z);

    // OWNER RECEIPTS (PQ-137.11 A). Before restoring anything, record what the SOLVER tried to do
    // to the player's heading and course. The rule's own answer is published beside it, so a
    // receipt can show both "what a rock tried to do to my nose" and "what I let through" instead
    // of only the second. Measured here and nowhere else: after the yaw restore below the evidence
    // is gone. Nothing on this path changes what the rule does.
    const w = post && post.wDirty !== true ? post.w : rec.body.angvel();
    const solverYaw = wrapAngle(yawFromQuat(post && post.qRead === true && post.qDirty !== true ? post.q : rec.body.rotation()));
    const solverHeadingKickRad = Number.isFinite(e.yaw) ? wrapAngle(solverYaw - e.yaw) : 0;
    const solverYawRateKick = -finite(w.y) - finite(e.wy);
    const expectedSpeedForCourse = Math.hypot(e.vx, e.vz);
    const solverSpeed = Math.hypot(vx, vz);
    // A course is only defined when there is motion to have a direction. Two hulls at rest touching
    // have no course to change, and atan2(0, 0) would invent one.
    const solverCourseKickRad = (expectedSpeedForCourse > PLAYER_CONTACT_ACTIVITY_EPSILON
      && solverSpeed > PLAYER_CONTACT_ACTIVITY_EPSILON)
      ? wrapAngle(Math.atan2(vz, vx) - Math.atan2(e.vz, e.vx))
      : 0;

    const rawDvx = Number(v.x) - e.vx;
    const rawDvz = Number(v.z) - e.vz;
    const rawDv = Math.hypot(rawDvx, rawDvz);

    const closingFraction = this._playerContactClosingFraction(rec);
    const unexplained = rawDv > PLAYER_CONTACT_ACTIVITY_EPSILON;
    // A contact-force receipt only exists for collider pairs that crossed the gameplay
    // threshold (SG02_CONTACT_FORCE_EVENT_THRESHOLD_N): a sustained light grind, or a
    // scrape spread across the primitives of compound colliders, stays receiptless while
    // still doing real contact work. Genuinely uncoupled delta-V — rope/joint constraint
    // work, island noise — leaves no receipt AND no live contact pair; only that carries
    // solver momentum the give pass must not rewrite.
    const receiptlessContact = closingFraction == null && unexplained
      && this._playerInLiveContact(rec);
    const isActive = unexplained && (closingFraction != null || receiptlessContact);
    const tickNow = Number.isFinite(this._simTick) ? this._simTick : this.tick;
    if (isActive) {
      const lastTick = rec._playerContactLastTick;
      const gap = Number.isFinite(lastTick) ? tickNow - lastTick : Infinity;
      if (gap > PLAYER_CONTACT_EVENT_BRIDGE_TICKS) {
        rec._playerContactCumulativeDeltaV = 0;
      }
      rec._playerContactLastTick = tickNow;
    }

    const cumulative = rec._playerContactCumulativeDeltaV || 0;
    const preservesSolverResponse = rec._tumbling === true
      || this._sleepHeld.has(rec)
      || closingFraction > 0.55
      || (closingFraction == null && !receiptlessContact);
    let contactDvBudget;
    if (preservesSolverResponse) {
      contactDvBudget = (!Number.isFinite(rawDv)
          || rawDv > (rec._tumbling === true ? TUMBLE_MAX_CONTACT_DV : MAX_CONTACT_DV))
        ? this._contactResponseDvBudget(rec)
        : Infinity;
    } else {
      const fallback = (rec.entity && (rec.entity.combatSpeed || rec.entity.maxSpeed)) || 0;
      const cruise = resolveGovernedCombatSpeed(rec.entity, null, fallback);
      const eventBudget = (Number.isFinite(cruise) && cruise > 0)
        ? PLAYER_CONTACT_MAX_CRUISE_FRACTION * cruise
        : MAX_CONTACT_DV;
      const remainingBudget = Math.max(0, eventBudget - cumulative);
      contactDvBudget = (!Number.isFinite(rawDv) || rawDv > remainingBudget)
        ? remainingBudget
        : Infinity;
    }
    let acceptedVx = vx;
    let acceptedVz = vz;
    if (!Number.isFinite(rawDv) || rawDv > contactDvBudget) {
      if (Number.isFinite(rawDv) && rawDv > 0 && contactDvBudget > 0) {
        const scale = contactDvBudget / rawDv;
        acceptedVx = e.vx + rawDvx * scale;
        acceptedVz = e.vz + rawDvz * scale;
      } else {
        acceptedVx = e.vx;
        acceptedVz = e.vz;
      }
      _vecWriteScratch.x = acceptedVx;
      _vecWriteScratch.y = 0;
      _vecWriteScratch.z = acceptedVz;
      rec.body.setLinvel(_vecWriteScratch, true);
      const predictedX = Number.isFinite(e.x)
        ? e.x : finite(rec._bodyPoseX) + e.vx * this.fixedDt;
      const predictedZ = Number.isFinite(e.z)
        ? e.z : finite(rec._bodyPoseZ) + e.vz * this.fixedDt;
      _vecWriteScratch.x = predictedX + (acceptedVx - e.vx) * this.fixedDt;
      _vecWriteScratch.y = 0;
      _vecWriteScratch.z = predictedZ + (acceptedVz - e.vz) * this.fixedDt;
      rec.body.setTranslation(_vecWriteScratch, true);
      rec._bodyPoseX = Math.fround(_vecWriteScratch.x);
      rec._bodyPoseZ = Math.fround(_vecWriteScratch.z);
      if (post) post.vDirty = true;
    }

    // Only contact work draws on the cruise budget: receipted ordinary contact, and
    // receiptless pushes while a live pair proves the hull is touching. Uncoupled delta-V
    // carries earned solver momentum, not contact work. A live rope deliberately transfers
    // momentum through its constraint, including solid hull contact; keep that solver
    // response subject to the same numerical safety bound as a direct slam. The existing
    // attachment cache is refreshed before every solve, so no contact-time scan or
    // serialized entity metadata decides whether the player is physically coupled.
    const actualPlayerDeltaV = Math.hypot(acceptedVx - e.vx, acceptedVz - e.vz);
    if (isActive && !preservesSolverResponse) {
      rec._playerContactCumulativeDeltaV = cumulative + actualPlayerDeltaV;
    }

    const yaw = Number.isFinite(e.yaw) ? e.yaw : 0;
    rec.body.setRotation(quatFromYawInto(yaw, _quatWriteScratch), true);
    _vecWriteScratch.x = 0;
    _vecWriteScratch.y = -finite(e.wy);
    _vecWriteScratch.z = 0;
    rec.body.setAngvel(_vecWriteScratch, true);
    if (post) {
      post.qDirty = true;
      post.wDirty = true;
    }

    rec._lastAppliedPlayerDeltaV = actualPlayerDeltaV;
    // What the solver asked for, and what the rule answered. Heading applied is ZERO BY
    // CONSTRUCTION — the pose is restored to the no-contact prediction — and it is published
    // anyway, because a number that is always zero because the rule holds is evidence, and a
    // number that is always zero because nobody measured it is not. Applied course is the
    // solver's real course: the velocity answer passed through whole.
    rec._lastSolverPlayerHeadingRad = solverHeadingKickRad;
    rec._lastSolverPlayerYawRateKick = solverYawRateKick;
    rec._lastSolverPlayerCourseRad = solverCourseKickRad;
    rec._lastAppliedPlayerHeadingRad = 0;
    const appliedSpeed = Math.hypot(acceptedVx, acceptedVz);
    rec._lastAppliedPlayerCourseRad = (expectedSpeedForCourse > PLAYER_CONTACT_ACTIVITY_EPSILON
      && appliedSpeed > PLAYER_CONTACT_ACTIVITY_EPSILON)
      ? wrapAngle(Math.atan2(acceptedVz, acceptedVx) - Math.atan2(e.vz, e.vx))
      : 0;
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
            // Heading and course are PER-TICK ANGLES, not a quantity to divide. Splitting them the
            // way delta-V is split, or stamping and then summing, would invent a disagreement out
            // of any tick that produced more than one receipt. Every receipt of the tick carries
            // the whole tick's angle and the reader sums per unique tick.
            r.solverPlayerHeadingRad = finite(rec._lastSolverPlayerHeadingRad, 0);
            r.solverPlayerYawRateKick = finite(rec._lastSolverPlayerYawRateKick, 0);
            r.solverPlayerCourseRad = finite(rec._lastSolverPlayerCourseRad, 0);
            r.appliedPlayerHeadingRad = finite(rec._lastAppliedPlayerHeadingRad, 0);
            r.appliedPlayerCourseRad = finite(rec._lastAppliedPlayerCourseRad, 0);
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
    const post = rec.postStep;
    const v = post && post.vDirty !== true ? post.v : rec.body.linvel();
    const w = post && post.wDirty !== true ? post.w : rec.body.angvel();
    let vx = finite(v.x);
    let vz = finite(v.z);
    let wy = -finite(w.y);
    let touched = false;
    const rawDvx = Number(v.x) - e.vx;
    const rawDvz = Number(v.z) - e.vz;
    const rawDv = Math.hypot(rawDvx, rawDvz);
    const contactDvBudget = (!Number.isFinite(rawDv)
        || rawDv > (rec._tumbling === true ? TUMBLE_MAX_CONTACT_DV : MAX_CONTACT_DV))
      ? this._contactResponseDvBudget(rec)
      : Infinity;
    if (!Number.isFinite(rawDv) || rawDv > contactDvBudget) {
      let acceptedDvx = 0;
      let acceptedDvz = 0;
      if (Number.isFinite(rawDv) && rawDv > 0) {
        const scale = contactDvBudget / rawDv;
        acceptedDvx = rawDvx * scale;
        acceptedDvz = rawDvz * scale;
      }
      const predictedX = Number.isFinite(e.x)
        ? e.x : finite(rec._bodyPoseX) + e.vx * this.fixedDt;
      const predictedZ = Number.isFinite(e.z)
        ? e.z : finite(rec._bodyPoseZ) + e.vz * this.fixedDt;
      _vecWriteScratch.x = predictedX + acceptedDvx * this.fixedDt;
      _vecWriteScratch.y = 0;
      _vecWriteScratch.z = predictedZ + acceptedDvz * this.fixedDt;
      rec.body.setTranslation(_vecWriteScratch, true);
      rec._bodyPoseX = Math.fround(_vecWriteScratch.x);
      rec._bodyPoseZ = Math.fround(_vecWriteScratch.z);
      if (!Number.isFinite(rawDv)) {
        vx = e.vx;
        vz = e.vz;
        touched = true;
      }
    }
    const dvx = vx - e.vx;
    const dvz = vz - e.vz;
    const dv = Math.hypot(dvx, dvz);
    const closingDv = Math.hypot(e.vx, e.vz);
    const baseLimit = rec._tumbling === true || (this._looseContactIds && this._looseContactIds.has(rec.entity.id))
      ? TUMBLE_MAX_CONTACT_DV : MAX_CONTACT_DV;
    const maxContactDv = Math.max(baseLimit, closingDv + baseLimit);
    if (dv > maxContactDv) {
      const scale = maxContactDv / dv;
      vx = e.vx + dvx * scale;
      vz = e.vz + dvz * scale;
      touched = true;
    }
    const dw = wy - e.wy;
    const helmLocked = craftKeepsHelmThroughContact(rec) && rec._tumbling !== true;
    const contactYaw = helmLocked && Math.abs(dw) > CRAFT_CONTACT_YAW_EPS;
    const yawCap = helmLocked ? 0 : (rec._tumbling === true ? SANE_MAX_YAW_RATE : MAX_CONTACT_DW);
    if (Math.abs(dw) > (helmLocked ? CRAFT_CONTACT_YAW_EPS : yawCap)) {
      wy = e.wy + Math.sign(dw) * yawCap;
      touched = true;
    }
    if (contactYaw && Number.isFinite(e.yaw)) {
      rec.body.setRotation(quatFromYawInto(e.yaw, _quatWriteScratch), true);
      if (post) post.qDirty = true;
      touched = true;
    }
    if (Math.abs(wy) > SANE_MAX_YAW_RATE) {
      wy = clamp(wy, -SANE_MAX_YAW_RATE, SANE_MAX_YAW_RATE);
      touched = true;
    }
    if (rec._tumbling === true && this._stepContactReceipts && this._stepContactReceipts.length) {
      const receipts = this._stepContactReceipts;
      const own = rec.entity.id;
      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        const otherId = receipt.aId === own ? receipt.bId : (receipt.bId === own ? receipt.aId : null);
        if (otherId == null) continue;
        const other = this.records.get(otherId);
        if (!other || other.spec.dynamic) continue; // hull-on-hull stays with the solver + raised bounds
        const at = rec.body.translation();
        const from = other.body.translation();
        let nx = finite(receipt.normal && receipt.normal.x);
        let nz = finite(receipt.normal && receipt.normal.z);
        // Orient the contact normal from the fixed body toward this hull.
        if (nx * (finite(at.x) - finite(from.x)) + nz * (finite(at.z) - finite(from.z)) < 0) { nx = -nx; nz = -nz; }
        const closing = -(finite(e.vx) * nx + finite(e.vz) * nz);
        if (!(closing > TUMBLE_RICOCHET_MIN_CLOSING)) continue;
        const wanted = TUMBLE_RESTITUTION * closing;
        const leaving = vx * nx + vz * nz;
        if (leaving < wanted) {
          const add = Math.min(wanted - leaving, TUMBLE_MAX_CONTACT_DV);
          vx += add * nx;
          vz += add * nz;
          touched = true;
        }
      }
    }
    if (!touched) return;
    _vecWriteScratch.x = vx;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = vz;
    rec.body.setLinvel(_vecWriteScratch, true);
    _vecWriteScratch.x = 0;
    _vecWriteScratch.y = -wy;
    _vecWriteScratch.z = 0;
    rec.body.setAngvel(_vecWriteScratch, true);
    if (post) {
      post.vDirty = true;
      post.wDirty = true;
    }
  }

  // A tumbling hull swaps to the projectile contact material and back. Rapier reads the collider's
  // restitution and combine rule at each contact, so the change lands on the next world.step().
  _syncTumbleMaterial(rec, tumbling) {
    const R = this.RAPIER;
    const rules = R && R.CoefficientCombineRule;
    rec._tumbleMaterial = tumbling;
    if (!rules || !Array.isArray(rec.colliders)) return;
    const base = contactMaterialFor(rec.entity, rec.spec);
    const restitution = tumbling ? TUMBLE_RESTITUTION : base.restitution;
    const rule = tumbling ? rules.Max : (base.restitutionCombine === 'min' ? rules.Min
      : base.restitutionCombine === 'max' ? rules.Max
      : rules.Average);
    if (rec.body && typeof rec.body.setAngularDamping === 'function') {
      rec.body.setAngularDamping(tumbling ? TUMBLE_ANGULAR_DAMPING : base.angularDamping);
    }
    for (const collider of rec.colliders) {
      if (typeof collider.setRestitution === 'function') collider.setRestitution(restitution);
      if (rule != null && typeof collider.setRestitutionCombineRule === 'function') collider.setRestitutionCombineRule(rule);
    }
  }

  _createRecord(entity, spec) {
    const R = this.RAPIER;
    const local = globalToFrame(entity.pos, this._frameOrigin, this._frameScratch);
    let posX = local.x;
    const posZ = local.z;
    const vel = vector3(entity.vel);
    const material = contactMaterialFor(entity, spec);
    // Coincident-center guard (see COINCIDENT_SPAWN_* above). Ghost-material bodies skip the
    // ladder entirely: their collision groups join no contact pairs and a projectile's swept
    // segment must keep its authored line. The writeback to entity.pos is required — pose
    // resync reads entity.pos as authored truth, so an unmirrored nudge would be reverted on
    // the next sync for dt=0 init, noInterp, sleep-eligible, and static records alike.
    if (!material.ghost && entity.pos
      && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)) {
      const slotted = this._resolveCoincidentSpawnSlot(posX, posZ, entity, spec);
      if (slotted !== posX) {
        posX = slotted;
        const g = frameToGlobal({ x: posX, z: posZ }, this._frameOrigin, this._globalScratch);
        entity.pos.x = g.x;
        entity.pos.z = g.z;
        if (entity.prevPos && typeof entity.prevPos === 'object') {
          entity.prevPos.x = g.x;
          entity.prevPos.z = g.z;
        }
      }
    }
    const globalX = finite(entity.pos && entity.pos.x);
    const globalZ = finite(entity.pos && entity.pos.z);
    const desc = (spec.dynamic ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed())
      .setTranslation(posX, 0, posZ)
      .setRotation(quatFromYaw(finite(entity.rot)))
      .setLinvel(vel.x, 0, vel.z)
      .setAngvel({ x: 0, y: -boundedYawRate(entity.angVel), z: 0 })
      .enabledTranslations(true, false, true)
      .enabledRotations(false, true, false)
      .setCcdEnabled(!!spec.ccd);
    if (spec.dynamic && typeof desc.setCanSleep === 'function') {
      desc.setCanSleep(mayRapierIslandSleep(entity, spec));
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
      body.setAngvel({ x: 0, y: -boundedYawRate(entity.angVel), z: 0 }, true);
      body.setEnabled(true);
    } else {
      body = this.world.createRigidBody(desc);
      proxyManifest = proxyManifestForBody(entity, spec);
      let colliderDescs;
      if (proxyManifest) {
        colliderDescs = buildCompoundProxyColliderDescs(this.RAPIER, entity, proxyManifest, material, spec, this.captureContactImpacts, this.world.integrationParameters);
      } else if (spec.shape === 'capsule' || (!spec.shape && (entity.type === 'ship' || entity.type === 'drone'))) {
        colliderDescs = [buildCraftCapsuleColliderDesc(this.RAPIER, entity, spec, material, this.captureContactImpacts)];
      } else {
        colliderDescs = [buildBallColliderDesc(this.RAPIER, spec, material, this.captureContactImpacts, entity)];
      }
      colliders = colliderDescs.map((colliderDesc) => this.world.createCollider(colliderDesc, body));
      // Colliders are all density-0: the body's whole mass is the additional properties on the
      // creation desc. rapier-compat defers computing those into effective mass until the first
      // world.step() — a body created mid-run reports mass()=0 and silently drops impulses
      // applied to it (inv_mass not yet computed). A save/reload rebuild creates every body
      // inside the same step that may already carry a queued impulse, so force the deferred
      // recompute now; the live-body re-assert guards builds where the desc value is dropped.
      if (spec.dynamic) {
        if (typeof body.setAdditionalMassProperties === 'function') {
          body.setAdditionalMassProperties(
            spec.mass,
            vector3(spec.centerOfMass),
            { x: 1, y: spec.inertiaY, z: 1 },
            { x: 0, y: 0, z: 0, w: 1 },
            true,
          );
        }
        if (typeof body.recomputeMassPropertiesFromColliders === 'function') {
          body.recomputeMassPropertiesFromColliders();
        }
      }
    }
    if (mayRapierIslandSleep(entity, spec) && entity.physicsSleeping === true
      && typeof body.sleep === 'function') {
      body.sleep();
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
      // Body-local degenerate windows for the coincident-spawn ladder (spine segments for
      // capsules, centre points for balls/offset primitives). Captured once at creation —
      // collider-local offsets and axes never change on a live record.
      coincidentSpines: colliders.map((owned) => coincidentSpineForCollider(owned)),
      _createdCanSleep: spec.dynamic === true && mayRapierIslandSleep(entity, spec) === true,
      _postStepSleepSkip: false,
      _postStepReadTick: -1,
      proxyId: proxyManifest ? proxyManifest.id : null,
      ghostPoolKey,
      appliedForce: zero3(),
      appliedTorque: zero3(),
      controlForce: zero3(),
      controlTorque: zero3(),
      expected: { vx: 0, vz: 0, wy: 0, yaw: 0, x: 0, z: 0 },
      // Mirror of the body's stored f32 translation so _maybeResyncBodyPose can compare without
      // allocating a Rapier vector each sync; refreshed at every setTranslation site.
      _bodyPoseX: Math.fround(posX),
      _bodyPoseZ: Math.fround(posZ),
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
    // Old saves may carry a mirrored entity.playerContactGive episode record; nothing reads it —
    // contact velocity is the solver's answer now, so a rebuilt body simply keeps solving from
    // its live pose.
    for (const ownedCollider of colliders) this._colliderOwners.set(ownedCollider.handle, { rec: record, collider: ownedCollider });
    return record;
  }

  // Smallest free +x slot for a new body whose center would otherwise coincide with an existing
  // body (see COINCIDENT_SPAWN_*). Partners are filtered to bodies that can actually form a
  // contact pair with the candidate: ghost materials and group-filtered classes join no pairs,
  // fixed-fixed pairs never touch, and a dead entity's record is already on its way out. The
  // scan reads the _bodyPoseX/Z mirrors plus the partner's kinematics yaw mirror — every
  // setTranslation/setRotation site and the post-step plane pass maintains them, and a
  // solver-moved body is always awake (sleep-skipped records keep pose), so the mirrors equal
  // the WASM poses and the scan costs no WASM calls.
  _resolveCoincidentSpawnSlot(posX, posZ, candidateEntity, candidateSpec, exclude = null) {
    const candidateDynamic = candidateSpec && candidateSpec.dynamic === true;
    for (let attempts = 0; attempts < COINCIDENT_SPAWN_MAX_NUDGES; attempts++) {
      let coincident = false;
      for (const other of this.records.values()) {
        if (!other || other === exclude) continue;
        if (!candidateDynamic && !(other.spec && other.spec.dynamic)) continue;
        if (!other.entity || other.entity.alive === false) continue;
        if (contactMaterialFor(other.entity, other.spec).ghost) continue;
        if (!collisionPairsForm(candidateEntity, candidateSpec, other.entity, other.spec)) continue;
        const partnerX = finite(other._bodyPoseX, NaN);
        const partnerZ = finite(other._bodyPoseZ, NaN);
        if (!Number.isFinite(partnerX) || !Number.isFinite(partnerZ)) continue;
        if (pointHitsCoincidentWindow(other, partnerX, partnerZ, posX, posZ)) {
          coincident = true;
          break;
        }
      }
      if (!coincident) return posX;
      posX += COINCIDENT_SPAWN_NUDGE;
    }
    return posX;
  }

  // Returns false when a live attachment refuses the remove: the body stays in the world and
  // this record stays managed, so the caller must not create a replacement — that would leave
  // an orphaned body still stepped and colliding but invisible to every records-map consumer.
  _removeRecord(id, rec) {
    this._reboundEntityIds.delete(id);
    const live = rec && rec.entity && rec.entity.alive !== false;
    if (live) {
      for (const attachment of this.attachments.values()) {
        if (attachment.owner === rec || attachment.target === rec) return false;
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
      return true;
    }
    for (const collider of colliders) {
      this._colliderOwners.delete(collider.handle);
      this.world.removeCollider(collider, false);
    }
    this.world.removeRigidBody(rec.body);
    this.records.delete(id);
    return true;
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
    const proxyId = proxyIdForEntity(entity, spec);
    if (!recordMatchesSpec(rec, spec) || (rec && rec.proxyId !== proxyId)) {
      if (rec && rec.proxyId === proxyId && massPropertiesOnlyChanged(rec, spec) && this._updateMassPropertiesInPlace(rec, spec)) {
        rec.entity = entity;
        if (preserveRebound) this._reboundEntityIds.delete(entity.id);
        else this._maybeResyncBodyPose(rec, entity);
        this._applyCcdGate(rec, entity);
        return rec;
      }
      this._reboundEntityIds.delete(entity.id);
      if (rec && this._removeRecord(entity.id, rec) === false) {
        // A live attachment holds the old body; keep the existing record so its replacement
        // would not orphan a body that stays in the world. The spec change retries each sync.
        rec.entity = entity;
        return rec;
      }
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
    if (entity && entity.physicsSleeping === true) return;
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
    // Retained nested-map merge keyed by raw entity ids (aId bucket -> bId -> receipt). Receipt
    // objects, pos, and normal stay fresh per event -- they escape to drainContactImpacts
    // callers -- but the merge structure, output array, and manifold point scratch are reused
    // every step. The final sort is a strict total order on unique (aId,bId) pairs, so bucket
    // flatten order cannot change the result.
    const merged = this._impactMergeRows;
    for (const byB of merged.values()) {
      byB.clear();
      this._impactByBPool.push(byB);
    }
    merged.clear();
    const receipts = this._impactReceipts;
    receipts.length = 0;
    const pointScratch = this._contactPointScratch;
    this._eventQueue.drainContactForceEvents((event) => {
      const ownedA = this._colliderOwners.get(event.collider1());
      const ownedB = this._colliderOwners.get(event.collider2());
      if (!ownedA || !ownedB || ownedA.rec === ownedB.rec) return;
      const recA = ownedA.rec;
      const recB = ownedB.rec;
      const rawImpulse = Math.max(0, finite(event.totalForceMagnitude())) * this.fixedDt;
      if (!(rawImpulse > 0)) return;
      // Scalar running min; identical to Math.min(...dynamicCaps) including NaN propagation.
      let cap = Infinity;
      // A contact with a hull that has lost its helm is a projectile hit: the raised bound applies to
      // BOTH sides, or the struck hull's own 40 WU/s per-tick bound would truncate the knock.
      // The player's own record keeps the ordinary bound: its per-contact delta-V feeds the fragile-cargo
      // and camera-trauma receipts, and a fling must not raise what a hit on the player costs it.
      const tumbleContact = recA._tumbling === true || recB._tumbling === true;
      if (recA.spec.dynamic) {
        cap = Math.min(cap, effectiveMass(recA)
          * (tumbleContact && !(recA.entity && recA.entity.isPlayer === true)
            ? TUMBLE_MAX_CONTACT_DV : MAX_CONTACT_DV));
      }
      if (recB.spec.dynamic) {
        cap = Math.min(cap, effectiveMass(recB)
          * (tumbleContact && !(recB.entity && recB.entity.isPlayer === true)
            ? TUMBLE_MAX_CONTACT_DV : MAX_CONTACT_DV));
      }
      if (cap === Infinity) return;
      const boundedImpulse = Math.min(rawImpulse, cap);
      if (!(boundedImpulse > 0)) return;

      const direction = event.maxForceDirection();
      const translationA = recA.body.translation();
      const translationB = recB.body.translation();
      pointScratch.x = (finite(translationA.x) + finite(translationB.x)) * 0.5;
      pointScratch.z = (finite(translationA.z) + finite(translationB.z)) * 0.5;
      if (typeof this.world.contactPair === 'function') {
        this.world.contactPair(ownedA.collider, ownedB.collider, this._contactManifoldCb);
      }
      const global = frameToGlobal(pointScratch, this._frameOrigin, this._globalScratch);
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
      let byB = merged.get(a.entity.id);
      if (!byB) {
        byB = this._impactByBPool.length ? this._impactByBPool.pop() : new Map();
        merged.set(a.entity.id, byB);
      }
      const existing = byB.get(b.entity.id);
      const impulse = Math.min((existing && existing.impulse || 0) + boundedImpulse, cap);
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
        // Filled by _distributeAppliedPlayerDeltaV. Present from birth so a reader can tell
        // "the rule reported nothing" from "the field does not exist on this build".
        receipt.solverPlayerHeadingRad = 0;
        receipt.solverPlayerYawRateKick = 0;
        receipt.solverPlayerCourseRad = 0;
        receipt.appliedPlayerHeadingRad = 0;
        receipt.appliedPlayerCourseRad = 0;
      }
      byB.set(b.entity.id, receipt);
    });
    for (const byB of merged.values()) {
      for (const receipt of byB.values()) receipts.push(receipt);
    }
    receipts.sort((a, b) => compareIds(a.aId, b.aId) || compareIds(a.bId, b.bId));
    return receipts;
  }

  _maybeResyncBodyPose(rec, entity) {
    if (!rec || !rec.body || !entity) return false;
    if (entity.physicsSleeping === true
      && !(entity.flags && entity.flags.noInterp)
      && shouldSkipSleepingKinematics(entity, rec.spec, { sleeping: true })) {
      return false;
    }
    const local = globalToFrame(entity.pos, this._frameOrigin, this._frameScratch);
    // _bodyPoseX/Z mirror the body's stored f32 translation (maintained at every setTranslation
    // site and refreshed post-step by _enforcePlane), so this comparison usually avoids a WASM
    // object allocation entirely. Falls back to a live read for records created before the
    // mirror existed or touched by an unmaintained path.
    let px = rec._bodyPoseX;
    let pz = rec._bodyPoseZ;
    if (px === undefined || pz === undefined) {
      const p = rec.body.translation();
      px = rec._bodyPoseX = p.x;
      pz = rec._bodyPoseZ = p.z;
    }
    const dx = local.x - finite(px);
    const dz = local.z - finite(pz);
    const noInterp = !!(entity.flags && entity.flags.noInterp);
    if (!noInterp && dx * dx + dz * dz <= POSE_RESYNC_EPS2) return false;

    let resyncX = local.x;
    const resyncZ = local.z;
    // Coincident-center guard (same invariant as _createRecord): a scripted teleport must not
    // land the body concentric with another either — the degenerate narrow phase does not care
    // how the pair got there. The record is excluded so it can never match itself.
    if (!contactMaterialFor(entity, rec.spec).ghost && entity.pos
      && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)) {
      const slotted = this._resolveCoincidentSpawnSlot(
        resyncX, resyncZ, entity, rec.spec, rec);
      if (slotted !== resyncX) {
        resyncX = slotted;
        const g = frameToGlobal({ x: resyncX, z: resyncZ }, this._frameOrigin, this._globalScratch);
        entity.pos.x = g.x;
        entity.pos.z = g.z;
      }
    }

    const yaw = finite(entity.rot);
    const vx = finite(entity.vel && entity.vel.x);
    const vz = finite(entity.vel && entity.vel.z);
    const wy = boundedYawRate(entity.angVel);
    _vecWriteScratch.x = resyncX;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = resyncZ;
    rec.body.setTranslation(_vecWriteScratch, true);
    rec._bodyPoseX = Math.fround(resyncX);
    rec._bodyPoseZ = Math.fround(resyncZ);
    rec.body.setRotation(quatFromYawInto(yaw, _quatWriteScratch), true);
    _vecWriteScratch.x = vx;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = vz;
    rec.body.setLinvel(_vecWriteScratch, true);
    _vecWriteScratch.x = 0;
    _vecWriteScratch.y = -wy;
    _vecWriteScratch.z = 0;
    rec.body.setAngvel(_vecWriteScratch, true);
    if (typeof rec.body.wakeUp === 'function') rec.body.wakeUp();
    if (rec.entity) rec.entity.physicsSleeping = false;
    const kin = rec.kinematics || (rec.kinematics = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, wy: 0 });
    kin.x = resyncX;
    kin.z = resyncZ;
    kin.vx = vx;
    kin.vz = vz;
    kin.yaw = yaw;
    kin.wy = wy;
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
      _vecWriteScratch.x = local.x;
      _vecWriteScratch.y = 0;
      _vecWriteScratch.z = local.z;
      rec.body.setTranslation(_vecWriteScratch, true);
      rec._bodyPoseX = Math.fround(local.x);
      rec._bodyPoseZ = Math.fround(local.z);
      const kin = rec.kinematics || (rec.kinematics = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, wy: 0 });
      kin.x = local.x;
      kin.z = local.z;
      rec.snapshot.x = quantize(finite(rec.entity.pos && rec.entity.pos.x), this.quantum);
      rec.snapshot.z = quantize(finite(rec.entity.pos && rec.entity.pos.z), this.quantum);
    }
  }

  _globalPointToFrameLocal(source, fallbackTranslation, out = null) {
    if (source && typeof source === 'object' && (source.x != null || source.z != null)) {
      const local = globalToFrame(source, this._frameOrigin, this._frameScratch);
      const o = out || { x: 0, y: 0, z: 0 };
      o.x = local.x;
      o.y = finite(source.y);
      o.z = local.z;
      return o;
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
      const force = planeForceInto(command.control.force, _planeForceScratch);
      const torque = yawTorqueInto(command.control.torque, _yawTorqueScratch);
      rec.body.addForce(force, true);
      const currentGameWy = boundedYawRate(-rec.body.angvel().y);
      const inertiaY = positive(rec.effectiveInertiaY, rec.spec.inertiaY);
      const minTorque = (-SANE_MAX_YAW_RATE - currentGameWy) * inertiaY / this.fixedDt;
      const maxTorque = (SANE_MAX_YAW_RATE - currentGameWy) * inertiaY / this.fixedDt;
      if (!Number.isFinite(minTorque) || !Number.isFinite(maxTorque)) {
        throw new RangeError(
          `SG-02 cannot bound control yaw torque: inertiaY=${inertiaY}, fixedDt=${this.fixedDt}`);
      }
      torque.y = clamp(torque.y, minTorque, maxTorque);
      torque.y = -torque.y;
      rec.body.addTorque(torque, true);
      torque.y = -torque.y;
      rec._forcesDirty = true;
      add3Into(rec.appliedForce, force);
      add3Into(rec.appliedTorque, torque);
      add3Into(rec.controlForce, force);     // continuous-only tracker for the structural-give
      add3Into(rec.controlTorque, torque);   // baseline (impulses mutate velocity immediately)
      rec.maxSpeed = positive(command.control.maxSpeed, Infinity);
      rec._tumbling = command.control.mode === 'tumbling' && combatFlag('tumbleFling');
    }
    for (const impulse of command.impulses || []) {
      const before = journalFor() ? rec.body.linvel() : null;
      rec.body.applyImpulse(planeForceInto(impulse, _planeForceScratch), true);
      if (before) observeAppliedImpulse(rec.entity, before, rec.body.linvel(), impulse.provenance, impulse.tick ?? this.tick, impulse.kind);
    }
    for (const impulse of command.torqueImpulses || []) {
      applyYawTorqueImpulse(rec, impulse, impulse);
    }
  }

  // PQ-133.04: apply a consumed projectile bounce continuation to the real Rapier body.
  // setLinvel to the outgoing velocity, setTranslation to the entity's mirrored pose — the
  // command membrane's nudge along the outgoing velocity owns de-penetration exactly once —
  // or to the body pose plus the offset when no mirrored pose exists, setRotation to the
  // outgoing yaw, then wake the body. This is the authoritative-body half of the same write.
  _applyProjectileContinuation(rec, continuation) {
    if (!rec || !rec.body || !continuation) return false;
    const vx = finite(continuation.velocity && continuation.velocity.x);
    const vz = finite(continuation.velocity && continuation.velocity.z);
    const yaw = wrapAngle(finite(continuation.yaw));
    const entityPos = rec.entity && rec.entity.pos;
    let px;
    let pz;
    if (entityPos && Number.isFinite(entityPos.x) && Number.isFinite(entityPos.z)) {
      const local = globalToFrame(entityPos, this._frameOrigin, this._frameScratch);
      px = finite(local.x);
      pz = finite(local.z);
    } else {
      const ox = finite(continuation.offset && continuation.offset.x);
      const oz = finite(continuation.offset && continuation.offset.z);
      const pose = rec.body.translation();
      px = finite(pose.x) + ox;
      pz = finite(pose.z) + oz;
    }
    _vecWriteScratch.x = px;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = pz;
    rec.body.setTranslation(_vecWriteScratch, true);
    rec._bodyPoseX = Math.fround(px);
    rec._bodyPoseZ = Math.fround(pz);
    rec.body.setRotation(quatFromYawInto(yaw, _quatWriteScratch), true);
    _vecWriteScratch.x = vx;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = vz;
    rec.body.setLinvel(_vecWriteScratch, true);
    if (typeof rec.body.wakeUp === 'function') rec.body.wakeUp();
    if (rec.entity) rec.entity.physicsSleeping = false;
    const kin = rec.kinematics || (rec.kinematics = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, wy: 0 });
    kin.x = px;
    kin.z = pz;
    kin.vx = vx;
    kin.vz = vz;
    kin.yaw = yaw;
    return true;
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
    // Reuse the post-step batch read: untouched components still hold the body's values. A give
    // pass that rewrote a component flags it dirty so this pass re-reads the authoritative WASM
    // value (Rapier stores f32, so mirroring the written f64 would diverge by an ulp).
    const post = rec.postStep;
    const p = rec.body.translation();
    const v = post && post.vDirty !== true ? post.v : rec.body.linvel();
    const q = post && post.qRead === true && post.qDirty !== true ? post.q : rec.body.rotation();
    const yaw = wrapAngle(yawFromQuat(q));
    const w = post && post.wDirty !== true ? post.w : rec.body.angvel();
    const x = finite(p.x);
    const z = finite(p.z);
    const vx = finite(v.x);
    const vz = finite(v.z);
    const wy = -finite(w.y);
    // _bodyPoseX/Z mirror the body's stored f32 pose (write sites mirror the f32-rounded value)
    // so _maybeResyncBodyPose can compare without a WASM translation() read.
    if (Math.abs(finite(p.y)) > 1e-9 || x !== p.x || z !== p.z) {
      _vecWriteScratch.x = x;
      _vecWriteScratch.y = 0;
      _vecWriteScratch.z = z;
      rec.body.setTranslation(_vecWriteScratch, true);
      rec._bodyPoseX = Math.fround(x);
      rec._bodyPoseZ = Math.fround(z);
    } else {
      rec._bodyPoseX = p.x;
      rec._bodyPoseZ = p.z;
    }
    if (Math.abs(finite(v.y)) > 1e-9 || vx !== v.x || vz !== v.z) {
      _vecWriteScratch.x = vx;
      _vecWriteScratch.y = 0;
      _vecWriteScratch.z = vz;
      rec.body.setLinvel(_vecWriteScratch, true);
    }
    if (Math.abs(finite(q.x)) > 1e-9 || Math.abs(finite(q.z)) > 1e-9 || !Number.isFinite(q.y) || !Number.isFinite(q.w)) {
      rec.body.setRotation(quatFromYawInto(yaw, _quatWriteScratch), true);
    }
    if (Math.abs(finite(w.x)) > 1e-9 || Math.abs(finite(w.z)) > 1e-9 || w.y !== -wy) {
      _vecWriteScratch.x = 0;
      _vecWriteScratch.y = -wy;
      _vecWriteScratch.z = 0;
      rec.body.setAngvel(_vecWriteScratch, true);
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
    _vecWriteScratch.x = nextVx;
    _vecWriteScratch.y = 0;
    _vecWriteScratch.z = nextVz;
    rec.body.setLinvel(_vecWriteScratch, true);
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
    // Retained input record: writePhysicsTelemetry reads every field synchronously into its own
    // frozen publication, so the input literal does not need to be fresh per call.
    const input = this._telemetryInput || (this._telemetryInput = {
      linearAcceleration: { x: 0, y: 0, z: 0 },
    });
    input.tick = this.tick;
    input.bodyHandle = rec.body.handle;
    input.dynamic = !!rec.spec.dynamic;
    input.ccd = rec.ccdEnabled;
    input.mass = positive(rec.effectiveMass, rec.spec.mass);
    input.inertiaY = positive(rec.effectiveInertiaY, rec.spec.inertiaY);
    input.force = rec.appliedForce;
    input.torque = rec.appliedTorque;
    const linear = input.linearAcceleration;
    linear.x = rec.appliedForce.x / positive(rec.effectiveMass, rec.spec.mass);
    linear.y = 0;
    linear.z = rec.appliedForce.z / positive(rec.effectiveMass, rec.spec.mass);
    input.angularAccelerationY = rec.appliedTorque.y / positive(rec.effectiveInertiaY, rec.spec.inertiaY);
    input.lateralAcceleration = 0;
    input.authority = measureThrusterAuthority(rec.entity);
    input.mode = this.mode;
    writePhysicsTelemetry(rec.entity, input);
  }

  _findAttachment(input = {}) {
    const fromHandle = input.physicsHandle && typeof input.physicsHandle === 'object' ? input.physicsHandle.id : input.physicsHandle;
    const id = String(input.attachmentId || fromHandle || '');
    return id ? this.attachments.get(id) || null : null;
  }

  _applyAttachmentSprings() {
    for (const attachment of this.attachments.values()) {
      if (usesLegacyRopeSpring(attachment.spring)) continue;
      const before = journalFor() ? attachment.target.body.linvel() : null;
      this._applyAttachmentSpring(attachment);
      if (before) observeConstraint(attachment, before, attachment.target.body.linvel(), this.tick);
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
      state.lastSpentEnergy = Math.max(0, finite(state.lastStoredEnergy, 0));
      state.lastStoredEnergy = 0;
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
    // The explicit spring is only stable while omega * dt stays small: on a short line, or a light
    // pair swung hard, the load-scaled stiffness can ask for an omega the 60 Hz step cannot carry
    // (MEASURED 2026-09-05: Cinder Sluice with the rope kit blew a body's position out of the
    // spatial hash). The cap keeps omega * dt at STABLE_OMEGA_DT; the authored K is never lowered
    // by it, and the B7 swing (a 100 WU line at 1.5x cruise) sits an order of magnitude under it.
    const stiffnessCap = mu * (STABLE_OMEGA_DT / this.fixedDt) ** 2;
    const tautK = Math.min(Math.max(spring.K, loadStiffness), Math.max(spring.K, stiffnessCap));
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
    state.breakRequested = loadRatio >= 1
      || (usesElasticWhipSpring(spring) && geometricOverloadRatio >= 1);

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
    {
      const prevStored = Math.max(0, finite(state.lastStoredEnergy, 0));
      state.lastStoredEnergy = 0.5 * spring.K * stretch * stretch;
      state.lastSpentEnergy = Math.max(0, prevStored - state.lastStoredEnergy);
    }
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
    // PQ-029.02: the winched rest length is the hitch. A taut coupler is a unilateral
    // damped spring to that length — tension only, still no sideways frame match.
    const restore = positive(spring.K, 0) * stretch;
    const dashpot = 2 * positive(spring.zeta, 0) * Math.sqrt(positive(spring.K, 0) * mu) * relativeSpeed;
    const openingDamper = mu * gain * openingSpeed;
    const force = Math.min(spring.maxForce, Math.max(0, restore + dashpot + openingDamper));
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
    const tensionRating = finite(attachment.break.maxTension, Infinity);
    const loadRatio = Number.isFinite(tensionRating) && tensionRating > 0 ? force / tensionRating : 0;
    // Same law as the ordinary rope (PQ-137.07): the hitch breaks by load, not by how far
    // a 200-mass tow happens to be stretched in a turn.
    state.breakRequested = loadRatio >= 1;
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
      const restored = this._adoptedJoints?.get(attachment.id);
      if (restored) {
        if (!sameNativeValue(attachment.anchorA, restored.saved.sourceAnchorLocal)
          || !sameNativeValue(attachment.anchorB, restored.saved.targetAnchorLocal)
          || attachment.restLength !== restored.saved.restLength) throw new Error('joint_anchor_changed');
        this._adoptedJoints.delete(attachment.id);
        attachment.contactJoint = restored.joint;
        return;
      }
      if (this._restoringNative) throw new Error('missing_native_joint');
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

  // Remaining ½ k s² is spent as a closing impulse along the line. Magnitude is the stored
  // energy, not a separate weapon table. Load-break zeroes the quantity without this dump.
  _spendElasticWhipStoredEnergy(attachment) {
    const state = attachment.springState || (attachment.springState = createSpringState());
    const energy = Math.max(0, finite(state.lastStoredEnergy, 0));
    if (!(energy > 0)) return 0;
    const scratch = attachment.springScratch || (attachment.springScratch = createSpringScratch());
    const source = worldAnchorInto(scratch.source, attachment.owner, attachment.anchorA);
    const target = worldAnchorInto(scratch.target, attachment.target, attachment.anchorB);
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const distance = Math.hypot(dx, dz);
    const nx = distance > 1e-9 ? dx / distance : 1;
    const nz = distance > 1e-9 ? dz / distance : 0;
    const mu = reducedMass(attachment.owner, attachment.target);
    if (!(mu > 0)) {
      state.lastSpentEnergy = energy;
      state.lastStoredEnergy = 0;
      return 0;
    }
    const impulse = mu * Math.sqrt((2 * energy) / mu);
    scratch.impulseA.x = nx * impulse;
    scratch.impulseA.y = 0;
    scratch.impulseA.z = nz * impulse;
    scratch.impulseB.x = -scratch.impulseA.x;
    scratch.impulseB.y = 0;
    scratch.impulseB.z = -scratch.impulseA.z;
    applyAttachmentImpulse(attachment, scratch.impulseA, scratch.impulseB, source, target);
    writeEntityVelFromBody(attachment.owner);
    writeEntityVelFromBody(attachment.target);
    state.lastSpentEnergy = energy;
    state.lastStoredEnergy = 0;
    return energy;
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
  const requestedMaxForce = positive(value && value.maxForce, Infinity);
  const tensionRating = positive(breakValue && breakValue.maxTension, Infinity);
  const maxForce = String(defId || '') === TWIN_BRIDLE_DEF_ID && Number.isFinite(tensionRating)
    ? Math.min(requestedMaxForce, tensionRating * TWIN_BRIDLE_TENSION_OVERSHOOT)
    : requestedMaxForce;
  return {
    mode: requestedMode === 'legacy_rope' ? 'legacy_rope'
      : requestedMode === 'frame_coupler' ? 'frame_coupler'
        : 'spring',
    K: positive(value && value.K, positive(value && value.k, positive(tune && tune.K, positive(breakValue && breakValue.stiffness, 140)))),
    zeta: positive(value && value.zeta, positive(tune && tune.zeta, 0.95)),
    captureS: positive(value && value.captureS, positive(tune && tune.captureS, 0.35)),
    maxForce,
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

function usesElasticWhipSpring(spring) {
  return !!(spring && spring.K >= 240 && spring.K <= 280 && spring.zeta > 0 && spring.zeta < 0.4);
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
    lastStoredEnergy: 0,
    lastSpentEnergy: 0,
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
  state.lastStoredEnergy = Math.max(0, finite(value.lastStoredEnergy));
  state.lastSpentEnergy = Math.max(0, finite(value.lastSpentEnergy));
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
    lastStoredEnergy: state.lastStoredEnergy,
    lastSpentEnergy: state.lastSpentEnergy,
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

function writeEntityVelFromBody(rec) {
  if (!rec || !rec.body || !rec.entity) return;
  const v = rec.body.linvel();
  const vel = rec.entity.vel || (rec.entity.vel = { x: 0, z: 0 });
  vel.x = finite(v.x);
  vel.z = finite(v.z);
  if (rec.kinematics) {
    rec.kinematics.vx = finite(v.x);
    rec.kinematics.vz = finite(v.z);
  }
}

// PQ-137.11 C. The player's hull never takes an off-centre impulse, from any source: a weapon hit
// at a hardpoint, a charge, a rope anchor. Every other body still does, so a rock still tumbles and
// a hostile still spins when it is hit off-centre.
function recordTakesOffCentreImpulse(rec) {
  return !(rec && rec.entity && rec.entity.isPlayer === true);
}

function applyImpulseAtPoint(rec, impulse, point) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body) return;
  if (recordTakesOffCentreImpulse(rec) && typeof rec.body.applyImpulseAtPoint === 'function') {
    rec.body.applyImpulseAtPoint(impulse, point, true);
    return;
  }
  if (!recordTakesOffCentreImpulse(rec)) {
    rec._playerOffCentreImpulsesCentred = (rec._playerOffCentreImpulsesCentred || 0) + 1;
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

// Write-side scratches for the 60 Hz command/spring passes. Rapier setters copy fields into WASM
// synchronously, so a shared literal is consumed before the next write touches it.
const _planeForceScratch = { x: 0, y: 0, z: 0 };
const _yawTorqueScratch = { x: 0, y: 0, z: 0 };
const _vecWriteScratch = { x: 0, y: 0, z: 0 };
const _quatWriteScratch = { x: 0, y: 0, z: 0, w: 1 };

function planeForceInto(value, out) {
  out.x = finite(value && value.x);
  out.y = 0;
  out.z = finite(value && value.z);
  return out;
}

function yawTorqueInto(value, out) {
  out.x = 0;
  out.y = finite(value && value.y);
  out.z = 0;
  return out;
}

function quatFromYawInto(yaw, out) {
  out.x = 0;
  out.y = -Math.sin(yaw / 2);
  out.z = 0;
  out.w = Math.cos(yaw / 2);
  return out;
}

function applyYawTorqueImpulse(rec, value, evidence = null) {
  if (!rec || !rec.spec || !rec.spec.dynamic || !rec.body || typeof rec.body.setAngvel !== 'function') return false;
  const impulseY = finite(value && value.y);
  if (impulseY === 0) return true;
  const inertiaY = positive(rec.effectiveInertiaY, rec.spec.inertiaY);
  const current = finite(rec.body.angvel && rec.body.angvel().y);
  // Rapier's applyTorqueImpulse currently produces zero yaw on our Y-only rotation-constrained
  // bodies. The owner is the sanctioned body writer, so apply the identical J = I*deltaOmega
  // relation explicitly rather than leaking an entity.angVel fallback into gameplay systems.
  _vecWriteScratch.x = 0;
  _vecWriteScratch.y = current - impulseY / inertiaY;
  _vecWriteScratch.z = 0;
  rec.body.setAngvel(_vecWriteScratch, true);
  // The post-write angvel() allocates a fresh Rapier vector; observeAppliedSurfaceTorque
  // returns early without a journal, so only pay the read when a journal exists.
  if (journalFor()) observeAppliedSurfaceTorque(rec.entity, -current, -rec.body.angvel().y, evidence);
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

const RESOLVED_CONTACT_MATERIALS = new WeakMap();

function contactMaterialFor(entity, spec) {
  const base = CONTACT_MATERIALS[(spec && spec.material) || 'default'] || CONTACT_MATERIALS.default;
  const overrides = spec && spec.contact;
  if (!overrides) return base;
  let merged = RESOLVED_CONTACT_MATERIALS.get(spec);
  if (!merged) {
    merged = Object.freeze({ ...base, ...overrides });
    RESOLVED_CONTACT_MATERIALS.set(spec, merged);
  }
  return merged;
}

function craftKeepsHelmThroughContact(rec) {
  const type = rec && rec.entity && rec.entity.type;
  return HELM_LOCKED_TYPES.has(type);
}

function contactAngularDamping(rec) {
  // The owner's own prediction of the spin the solver will damp; it must match the body's damping.
  if (rec && rec._tumbling === true) return TUMBLE_ANGULAR_DAMPING;
  const material = contactMaterialFor(rec && rec.entity, rec && rec.spec);
  return Math.max(0, finite(material.angularDamping));
}

function applyColliderContactMaterial(R, colliderDesc, material) {
  if (!colliderDesc || !material) return colliderDesc;
  if (typeof colliderDesc.setFriction === 'function') colliderDesc.setFriction(material.friction);
  if (typeof colliderDesc.setRestitution === 'function') colliderDesc.setRestitution(material.restitution);
  if (material.restitutionCombine != null && typeof colliderDesc.setRestitutionCombineRule === 'function') {
    const rules = R && R.CoefficientCombineRule;
    const rule = rules && (material.restitutionCombine === 'min' ? rules.Min
      : material.restitutionCombine === 'max' ? rules.Max
      : material.restitutionCombine === 'average' ? rules.Average
      : null);
    if (rule != null) colliderDesc.setRestitutionCombineRule(rule);
  }
  return colliderDesc;
}

function quatFromYaw(yaw) {
  return { x: 0, y: -Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function yawFromQuat(q) {
  return -Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

// Deterministic pair key for restored impulse joints — f64 handles print in whatever notation
// JS picks; both sides feed the same handles so the key matches on a lookup.
function jointPairKey(a, b) {
  return a <= b ? a + '|' + b : b + '|' + a;
}

// Base64 is the envelope's binary channel. btoa/atob exist in browsers and modern Node;
// Buffer covers any older host without dragging in a dependency.
// Save-time only: canonical values keep typed shape arrays and property order JSON-stable.
function nativePlain(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(nativePlain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => typeof value[key] !== 'function' && value[key] !== undefined)
    .map(key => [key, nativePlain(value[key])]));
  return typeof value === 'number' && !Number.isFinite(value) ? null : value;
}
function sameNativeValue(a, b) { return JSON.stringify(nativePlain(a)) === JSON.stringify(nativePlain(b)); }
function sameNativeKeys(order, records) {
  return Array.isArray(order) && order.length === Object.keys(records).length
    && new Set(order).size === order.length
    && order.every(key => typeof key === 'string' && Object.prototype.hasOwnProperty.call(records, key));
}
function nativeRuntimeContract(owner) {
  const parameters = owner.world.integrationParameters;
  return nativePlain({ engine: 'rapier3d-compat', engineVersion: owner.RAPIER.version?.() || null,
    fixedDt: owner.fixedDt, quantum: owner.quantum, mode: owner.mode,
    captureContactImpacts: owner.captureContactImpacts, gravity: owner.world.gravity,
    integration: Object.fromEntries(['dt', 'contact_erp', 'contact_natural_frequency', 'lengthUnit', 'normalizedAllowedLinearError',
      'normalizedPredictionDistance', 'numSolverIterations', 'numInternalPgsIterations',
      'minIslandSize', 'maxCcdSubsteps'].map(key => [key, parameters[key]])) });
}
function nativeEntityKinematics(entity) {
  return { x: finite(entity.pos?.x), z: finite(entity.pos?.z), vx: finite(entity.vel?.x),
    vz: finite(entity.vel?.z), yaw: finite(entity.rot), wy: finite(entity.angVel) };
}
function nativeEntityIdentity(entity) {
  const data = entity.data || {};
  return nativePlain({ type: entity.type, isPlayer: entity.isPlayer === true,
    defId: entity.defId ?? data.defId ?? null, shipId: entity.shipId ?? data.shipId ?? null,
    worldRecordId: data.worldRecordId ?? entity.worldRecordId ?? null,
    worldObjectId: data.worldObjectId ?? null, siteId: data.siteId ?? null,
    worldSiteId: data.worldSiteId ?? entity.worldSiteId ?? null,
    worldSitePayloadId: data.worldSitePayloadId ?? null,
    worldSiteComponentId: data.worldSiteComponentId ?? null,
    worldSiteCollisionProxyId: data.worldSiteCollisionProxyId ?? null,
    worldSiteProxy: data.worldSiteProxy ?? null,
    persistenceOwner: data.persistenceOwner ?? null,
    payloadId: data.payloadId ?? null, stationId: data.stationId ?? entity.stationId ?? null,
    gateId: data.gateId ?? entity.gateId ?? null, poiId: data.poiId ?? null });
}
function nativeBodyContract(entity, spec) {
  const manifest = proxyManifestForBody(entity, spec);
  return nativePlain({ spec, manifest,
    proxyScale: manifest ? proxyScaleFor(entity, manifest) : null,
    proportions: spec.shape === 'capsule' ? resolveCraftProportions(entity, spec) : null,
    material: contactMaterialFor(entity, spec),
    collisionGroups: computeCollisionGroups(entity, spec, contactMaterialFor(entity, spec)),
    canSleep: mayRapierIslandSleep(entity, spec) });
}
function nativeColliderShape(collider) {
  // Read the actual native geometry. collider.shape may cache the pre-hull input vertices
  // on a freshly created wrapper, whereas a restored wrapper exposes canonical hull vertices.
  const type = collider.shapeType();
  if (type === 0) return { type, radius: collider.radius() };
  if (type === 1 || type === 12) return { type, halfExtents: collider.halfExtents(),
    ...(type === 12 ? { borderRadius: collider.roundRadius() } : {}) };
  if (type === 2) return { type, radius: collider.radius(), halfHeight: collider.halfHeight() };
  if (type === 9 || type === 16) return { type, vertices: collider.vertices(), indices: collider.indices(),
    ...(type === 16 ? { borderRadius: collider.roundRadius() } : {}) };
  throw new Error('unsupported_native_shape');
}
function nativeBodyProperties(body, colliders) {
  return nativePlain({ type: body.bodyType(), enabled: body.isEnabled(), inverseMass: body.effectiveInvMass(),
    mass: body.mass(), inertia: body.principalInertia(),
    centerOfMass: body.localCom(), linearDamping: body.linearDamping(), angularDamping: body.angularDamping(),
    colliders: colliders.map(collider => ({ shape: nativeColliderShape(collider),
      translation: collider.translationWrtParent(), rotation: collider.rotationWrtParent(),
      enabled: collider.isEnabled(), activeEvents: collider.activeEvents(),
      activeCollisionTypes: collider.activeCollisionTypes(), contactSkin: collider.contactSkin(),
      contactForceEventThreshold: collider.contactForceEventThreshold(),
      sensor: collider.isSensor(), groups: collider.collisionGroups(), solverGroups: collider.solverGroups(),
      friction: collider.friction(), restitution: collider.restitution(), density: collider.density(),
      frictionCombineRule: collider.frictionCombineRule(), restitutionCombineRule: collider.restitutionCombineRule(),
    })) });
}
function nativeMassMatches(body, spec, saved) {
  if (body.isDynamic() !== spec.dynamic) return false;
  if (!spec.dynamic) return true;
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 2e-6);
  return saved.bodyResponseMassScale > 0 && saved.bodyResponseInertiaScale > 0
    && close(saved.effectiveMass, spec.mass * saved.bodyResponseMassScale)
    && close(saved.effectiveInertiaY, spec.inertiaY * saved.bodyResponseInertiaScale)
    && close(body.mass(), saved.effectiveMass)
    && close(body.principalInertia().y, saved.effectiveInertiaY);
}
function nativeJointProperties(joint) {
  return nativePlain({ type: joint.type(), body1: String(joint.body1().handle), body2: String(joint.body2().handle),
    anchor1: joint.anchor1(), anchor2: joint.anchor2(), contactsEnabled: joint.contactsEnabled() });
}
function nativeAttachmentDescriptor(attachment) {
  return nativePlain({ attachmentId: attachment.id, defId: attachment.defId,
    ownerId: attachment.ownerId, targetId: attachment.targetId,
    sourceSocketId: attachment.sourceSocketId, targetSocketId: attachment.targetSocketId,
    sourceAnchorLocal: attachment.anchorA, targetAnchorLocal: attachment.anchorB,
    restLength: attachment.restLength, break: attachment.break, spring: attachment.spring,
    forceScale: attachment.forceScale, reelRevision: attachment.reelRevision,
    springState: attachment.springState, tick: attachment.createdTick,
    joint: attachment.contactJoint ? { handle: String(attachment.contactJoint.handle),
      native: nativeJointProperties(attachment.contactJoint) } : null });
}
function nativeAttachmentMatchesSemantic(saved, semantic, ownerId, targetId) {
  return semantic?.state === 'active' && semantic.id === saved.attachmentId
    && semantic.ownerId === ownerId && semantic.targetId === targetId && semantic.defId === saved.defId
    && semantic.sourceSocketId === saved.sourceSocketId && semantic.targetSocketId === saved.targetSocketId
    && sameNativeValue(normalizeLocalAnchor(semantic.sourceAnchorLocal), normalizeLocalAnchor(saved.sourceAnchorLocal))
    && sameNativeValue(normalizeLocalAnchor(semantic.targetAnchorLocal), normalizeLocalAnchor(saved.targetAnchorLocal))
    && semantic.restLength === saved.restLength
    && Math.max(0, Math.trunc(finite(semantic.reelRevision))) === saved.reelRevision
    && sameNativeValue(normalizeSpringState(semantic.physicsSpringState), normalizeSpringState(saved.springState));
}
function nativeAttachmentPolicy(input, defId) {
  if (!input || !['restLength', 'break', 'spring', 'forceScale', 'reelRevision', 'springState']
    .every(key => Object.prototype.hasOwnProperty.call(input, key))
    || !Number.isFinite(input.restLength) || !(input.restLength > 0)
    || !input.break || typeof input.break !== 'object' || Array.isArray(input.break)
    || !input.spring || typeof input.spring !== 'object' || Array.isArray(input.spring)) return null;
  const brk = normalizeBreak(input.break);
  return {
    restLength: input.restLength,
    break: brk,
    spring: normalizeSpring(input.spring, defId, input.break),
    forceScale: clamp(finite(input.forceScale, 1), 0, 4),
    reelRevision: Math.max(0, Math.trunc(finite(input.reelRevision))),
    springState: normalizeSpringState(input.springState),
  };
}

function encodeSnapshotBytes(bytes) {
  if (typeof Buffer === 'function' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function decodeSnapshotBytes(text) {
  if (typeof text !== 'string' || !text) return null;
  try {
    if (typeof Buffer === 'function' && typeof Buffer.from === 'function') {
      const buf = Buffer.from(text, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch (err) {
    return null;
  }
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
    rec.spec.material === spec.material &&   // material drives collider friction/restitution/groups
    rec.spec.contact === spec.contact;
}

// Measured skins (`skin:<census row>`) ride fixed bodies and eligible solid dynamics alike;
// closed dynamic skins compact to one tolerance-checked convex hull (`skin:<row>:hull`), openings
// and non-fitting silhouettes keep the bounded compound — deterministic across save/reload (Package C).
function proxyManifestForBody(entity, spec) {
  const manifest = resolveCollisionProxyManifest(entity);
  if (manifest && spec && spec.dynamic && typeof manifest.id === 'string' && manifest.id.startsWith('skin:')) {
    if (!isCompoundSkinDynamicEligible(entity)) return null;
  }
  return manifest;
}

function proxyIdForEntity(entity, spec) {
  const manifest = proxyManifestForBody(entity, spec);
  return manifest ? manifest.id : null;
}

function ghostProjectilePoolKey(spec) {
  const com = spec.centerOfMass || {};
  return [spec.shape || 'ball', spec.radius, spec.mass, spec.inertiaY, spec.ccd ? 1 : 0, finite(com.x), finite(com.z)].join('|');
}

export const ENEMY_SILHOUETTE_PROPORTIONS = Object.freeze({
  drone_swarm: Object.freeze({ length: 1.72, halfWidth: 0.36, height: 0.26 }),
  sniper_lance: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  detonator_dart: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  bruiser_armor: Object.freeze({ length: 1.72, halfWidth: 0.43, height: 0.31 }),
  trader_haul: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  pirate_swoop: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.27 }),
  corsair_blade: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.24 }),
  patrol_interdict: Object.freeze({ length: 1.72, halfWidth: 0.77, height: 0.25 }),
  dreadnought_enemy: Object.freeze({ length: 1.72, halfWidth: 0.47, height: 0.49 }),
});

export const TRAFFIC_ROLE_PROPORTIONS = Object.freeze({
  arclight: Object.freeze({ length: 1.72, halfWidth: 0.32, height: 0.48 }),
  courier: Object.freeze({ length: 1.72, halfWidth: 0.39, height: 0.28 }),
  customs: Object.freeze({ length: 1.72, halfWidth: 0.21, height: 0.49 }),
  express: Object.freeze({ length: 1.72, halfWidth: 0.40, height: 0.56 }),
  hauler: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  miner: Object.freeze({ length: 1.72, halfWidth: 0.34, height: 0.51 }),
  ore_carrier: Object.freeze({ length: 1.72, halfWidth: 0.19, height: 0.35 }),
  pirate: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  prospector: Object.freeze({ length: 1.72, halfWidth: 0.24, height: 0.30 }),
  rescue: Object.freeze({ length: 1.72, halfWidth: 0.23, height: 0.31 }),
  salvor: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.39 }),
  shuttle: Object.freeze({ length: 1.72, halfWidth: 0.25, height: 0.33 }),
  smuggler: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.31 }),
  surveyor: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.42 }),
  sweeper: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.38 }),
  tanker: Object.freeze({ length: 1.72, halfWidth: 0.16, height: 0.33 }),
  tender: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.33 }),
  tug: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.38 }),
});

export const FACTION_HULL_PROPORTIONS = Object.freeze({
  'span:faction_dmc': Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  'span:faction_mts': Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  'span:faction_reach': Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  'wasp:faction_free': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_mts': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_scn': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
});

export const CRAFT_COLLISION_PROPORTIONS = Object.freeze({
  dart: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.43 }),
  hornet: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.54 }),
  wasp: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  drifter: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.35 }),
  kestrel: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.31 }),
  pelican: Object.freeze({ length: 1.72, halfWidth: 0.77, height: 0.25 }),
  mule: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.33 }),
  hawser: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.38 }),
  bastion: Object.freeze({ length: 1.72, halfWidth: 0.35, height: 0.41 }),
  ironback: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.33 }),
  ranger: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.33 }),
  warden: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.45 }),
  colossus: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.39 }),
  leviathan: Object.freeze({ length: 1.72, halfWidth: 0.47, height: 0.49 }),
  ship_dart: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.43 }),
  ship_hornet: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.54 }),
  ship_wasp: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  ship_drifter: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.35 }),
  ship_kestrel: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.31 }),
  ship_pelican: Object.freeze({ length: 1.72, halfWidth: 0.77, height: 0.25 }),
  ship_mule: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.33 }),
  ship_hawser: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.38 }),
  ship_bastion: Object.freeze({ length: 1.72, halfWidth: 0.35, height: 0.41 }),
  ship_ironback: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.33 }),
  ship_ranger: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.33 }),
  ship_warden: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.45 }),
  ship_colossus: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.39 }),
  ship_leviathan: Object.freeze({ length: 1.72, halfWidth: 0.47, height: 0.49 }),
  'wasp:faction_free': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_mts': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_scn': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
});

const CRAFT_PROPORTIONS_CACHE = new Map();
for (const [sil, prop] of Object.entries(ENEMY_SILHOUETTE_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(sil, prop);
}
for (const [role, prop] of Object.entries(TRAFFIC_ROLE_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(role, prop);
  CRAFT_PROPORTIONS_CACHE.set(`traffic:${role}`, prop);
}
for (const [key, prop] of Object.entries(FACTION_HULL_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(key, prop);
}
for (const [key, prop] of Object.entries(CRAFT_COLLISION_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(key, prop);
}
for (const ship of SHIPS || []) {
  if (ship && ship.id && ship.visuals && ship.visuals.proportions) {
    if (!CRAFT_PROPORTIONS_CACHE.has(ship.id)) {
      CRAFT_PROPORTIONS_CACHE.set(ship.id, ship.visuals.proportions);
    }
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
  for (const key of [
    data.defId,
    data.shipId,
    data.typeId,
    data.chassisId,
    data.trafficRole,
    data.trafficRole ? `traffic:${data.trafficRole}` : null,
    entity && entity.id,
  ]) {
    if (typeof key === 'string' && CRAFT_PROPORTIONS_CACHE.has(key)) {
      return CRAFT_PROPORTIONS_CACHE.get(key);
    }
  }
  if (entity && entity.type === 'drone') {
    return { length: 1.0, halfWidth: 0.45, height: 0.30 };
  }
  return { length: 1.35, halfWidth: 0.42, height: 0.30 };
}

const COLLISION_GROUP_SOLID   = 0x0001; // stations, rocks
const COLLISION_GROUP_CRAFT   = 0x0002; // ships, drones, pods
const COLLISION_GROUP_DEBRIS  = 0x0004; // wrecks, payloads
const COLLISION_GROUP_PICKUP  = 0x0008; // pickups (cargo, ore)

function computeCollisionGroups(entity, spec, material) {
  if (material && material.ghost) return 0;
  if (entity && entity.type === 'pickup') {
    // Pickups collide with solids and debris, but pass through craft for JS collection
    return (COLLISION_GROUP_PICKUP << 16) | (COLLISION_GROUP_SOLID | COLLISION_GROUP_DEBRIS);
  }
  if (entity && (entity.type === 'ship' || entity.type === 'drone')) {
    // Craft collide with solids, other craft, and debris, but exclude pickups (avoiding solver knock)
    return (COLLISION_GROUP_CRAFT << 16) | (COLLISION_GROUP_SOLID | COLLISION_GROUP_CRAFT | COLLISION_GROUP_DEBRIS);
  }
  if (entity && (entity.type === 'wreck' || entity.type === 'payload')) {
    // Debris/payloads collide with everything
    return (COLLISION_GROUP_DEBRIS << 16) | (COLLISION_GROUP_SOLID | COLLISION_GROUP_CRAFT | COLLISION_GROUP_DEBRIS | COLLISION_GROUP_PICKUP);
  }
  // Solids (stations, rocks, default) collide with everything
  return (COLLISION_GROUP_SOLID << 16) | (COLLISION_GROUP_SOLID | COLLISION_GROUP_CRAFT | COLLISION_GROUP_DEBRIS | COLLISION_GROUP_PICKUP);
}

// Would the two bodies actually form a contact pair? The coincident-spawn ladder must model the
// same rule as the collider builders: membership-vs-filter in both directions. Ghost materials
// produce empty groups, and pickups vs craft never pair — neither may trigger or force a nudge.
function collisionPairsForm(entityA, specA, entityB, specB) {
  const groupsA = computeCollisionGroups(entityA, specA, contactMaterialFor(entityA, specA));
  const groupsB = computeCollisionGroups(entityB, specB, contactMaterialFor(entityB, specB));
  const memberA = (groupsA >>> 16) & 0xffff;
  const memberB = (groupsB >>> 16) & 0xffff;
  return (memberA & (groupsB & 0xffff)) !== 0 && (memberB & (groupsA & 0xffff)) !== 0;
}

// The degenerate narrow-phase window for one collider, captured in body-local planar terms.
// A capsule's hazard is its whole spine segment: a partner centre within the band around the
// segment leaves EPA without a unique closest feature, and the Package D solver detonates on
// the residual overlap (Package D measured it detonating even at the cap-centre boundary, so
// the window extends COINCIDENT_SPAWN_AXIAL_EPS past each end). Balls, cuboids, and offset
// primitives degenerate only about their own centre — the halfLen-0 special case that matches
// the original measured ±~1.5-2 WU concentric window.
function coincidentSpineForCollider(collider) {
  const shape = collider && collider.shape;
  const halfLen = shape && Number.isFinite(shape.halfHeight) ? Math.max(0, shape.halfHeight) : 0;
  const off = collider && typeof collider.translationWrtParent === 'function'
    ? collider.translationWrtParent()
    : { x: 0, y: 0, z: 0 };
  const q = collider && typeof collider.rotationWrtParent === 'function'
    ? collider.rotationWrtParent()
    : { x: 0, y: 0, z: 0, w: 1 };
  // Collider-local +Y (the capsule axis) rotated by the collider's own local rotation, then
  // projected onto the plane. For a yaw-only world this composes exactly with the body yaw.
  const ux = 2 * (finite(q.x) * finite(q.y) - finite(q.w) * finite(q.z));
  const uz = 2 * (finite(q.w) * finite(q.x) + finite(q.y) * finite(q.z));
  const len = Math.hypot(ux, uz);
  return {
    ox: finite(off && off.x),
    oz: finite(off && off.z),
    ux: len > 1e-9 ? ux / len : 1,
    uz: len > 1e-9 ? uz / len : 0,
    halfLen,
  };
}

// True when a candidate centre at (posX,posZ) — frame coords — sits inside any of the partner's
// degenerate windows: |axial| <= halfLen + EPS_AXIAL along the collider spine while radially
// inside COINCIDENT_SPAWN_BAND, per collider. A point-window collider (halfLen 0) reduces to the
// radial band around its offset centre.
function pointHitsCoincidentWindow(rec, partnerX, partnerZ, posX, posZ) {
  const spines = rec && rec.coincidentSpines;
  if (!spines || !spines.length) {
    // Pre-fix records and exotic builders carry no captured spines; fall back to the square band.
    return Math.abs(posX - partnerX) < COINCIDENT_SPAWN_BAND
      && Math.abs(posZ - partnerZ) < COINCIDENT_SPAWN_BAND;
  }
  const yaw = finite(rec.kinematics && rec.kinematics.yaw);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  for (const spine of spines) {
    // Body-local offset/axis rotated by the partner's current yaw into the frame plane.
    const cx = partnerX + spine.ox * cos - spine.oz * sin;
    const cz = partnerZ + spine.ox * sin + spine.oz * cos;
    const ux = spine.ux * cos - spine.uz * sin;
    const uz = spine.ux * sin + spine.uz * cos;
    const rx = posX - cx;
    const rz = posZ - cz;
    const axial = rx * ux + rz * uz;
    const radialSq = rx * rx + rz * rz - axial * axial;
    if (Math.abs(axial) <= spine.halfLen + COINCIDENT_SPAWN_AXIAL_EPS
      && radialSq < COINCIDENT_SPAWN_BAND * COINCIDENT_SPAWN_BAND) {
      return true;
    }
  }
  return false;
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

  if (typeof colliderDesc.setCollisionGroups === 'function') {
    colliderDesc.setCollisionGroups(computeCollisionGroups(entity, spec, material));
  }
  if (captureContactImpacts) configureContactEvents(R, colliderDesc, material);
  return colliderDesc;
}

function buildBallColliderDesc(R, spec, material, captureContactImpacts = true, entity = null) {
  const colliderDesc = R.ColliderDesc.ball(spec.radius).setDensity(0);
  applyColliderContactMaterial(R, colliderDesc, material);
  if (typeof colliderDesc.setCollisionGroups === 'function') {
    colliderDesc.setCollisionGroups(computeCollisionGroups(entity, spec, material));
  }
  if (captureContactImpacts) configureContactEvents(R, colliderDesc, material);
  return colliderDesc;
}

// Compound planar collision proxies (PQ-008 / SF-08 → F18). Manifest primitives are authored in
// normalized station-local units and become a bounded static collider set on the fixed body. The
// body transform (station pos/rot) composes at the body level, so primitives stay entity-local.
// This runs ONCE at record creation — never per frame.
// Native contact settings are part of the exact replay contract, independently
// of the scale-relative geometric extrusion policy.
function planarGeometryParameters(world) {
  const p = world && world.integrationParameters;
  if (!p) return null;
  const result = {
    lengthUnit: p.lengthUnit,
    normalizedPredictionDistance: p.normalizedPredictionDistance,
    normalizedAllowedLinearError: p.normalizedAllowedLinearError,
  };
  if (!(result.lengthUnit > 0) || result.normalizedPredictionDistance < 0
      || result.normalizedAllowedLinearError < 0
      || !Object.values(result).every(Number.isFinite)) return null;
  return result;
}

function samePlanarGeometryParameters(a, b) {
  return !!a && !!b && a.lengthUnit === b.lengthUnit
    && a.normalizedPredictionDistance === b.normalizedPredictionDistance
    && a.normalizedAllowedLinearError === b.normalizedAllowedLinearError;
}

function matchesPlanarPrismGeometry(world, R, parameters) {
  let matches = true;
  world.forEachCollider((collider) => {
    if (!matches || collider.shapeType() !== R.ShapeType.ConvexPolyhedron) return;
    const vertices = collider.shape.vertices;
    if (!vertices || vertices.length < 18 || vertices.length % 3 !== 0) { matches = false; return; }
    const planar = [];
    for (let i = 0; i < vertices.length; i += 3) {
      if (![vertices[i], vertices[i + 1], vertices[i + 2]].every(Number.isFinite)) { matches = false; return; }
      planar.push({ x: vertices[i], z: vertices[i + 2] });
    }
    const expectedHalfY = Math.fround(planarProxyPrismHalfHeight(planar, 1, parameters));
    let upper = false; let lower = false;
    for (let i = 1; i < vertices.length; i += 3) {
      if (Math.abs(vertices[i]) !== expectedHalfY) { matches = false; return; }
      upper ||= vertices[i] > 0;
      lower ||= vertices[i] < 0;
    }
    matches = upper && lower;
  });
  return matches;
}

// The solver is constrained to XZ, but Rapier computes contacts in 3D. A shallow
// prism permits a roof normal along locked Y. Give each projected convex piece a
// roof farther away than its enclosing planar radius, plus the contact envelope.
// XZ coordinates/decomposition and zero-density authored mass stay unchanged.
export function planarProxyPrismHalfHeight(verts, scale) {
  let minX = Infinity; let maxX = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;
  let coordinateScale = 0;
  for (const v of verts) {
    const x = Math.fround(v.x * scale); const z = Math.fround(v.z * scale);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    coordinateScale = Math.max(coordinateScale, Math.abs(x), Math.abs(z));
  }
  const cx = (minX + maxX) * 0.5; const cz = (minZ + maxZ) * 0.5;
  let reach = 0;
  for (const v of verts) {
    reach = Math.max(reach, Math.hypot(Math.fround(v.x * scale) - cx, Math.fround(v.z * scale) - cz));
  }
  // Predictive-contact distance and allowed penetration do not inflate shapes.
  // Adding those absolute world distances here destroys similarity at tiny scales.
  // Keep only a relative f32 margin for vertex conversion/support arithmetic and
  // local offsets. The roof lies strictly beyond the projected enclosing radius.
  const roundoff = 32 * (2 ** -23) * Math.max(coordinateScale, reach);
  return reach + roundoff;
}

function convexPrismDesc(R, verts, scale, parameters) {
  const halfY = planarProxyPrismHalfHeight(verts, scale, parameters);
  const points = new Float32Array(verts.length * 6);
  for (let i = 0; i < verts.length; i += 1) {
    const px = verts[i].x * scale;
    const pz = verts[i].z * scale;
    points[i * 3] = px;
    points[i * 3 + 1] = halfY;
    points[i * 3 + 2] = pz;
    const j = (verts.length + i) * 3;
    points[j] = px;
    points[j + 1] = -halfY;
    points[j + 2] = pz;
  }
  return R.ColliderDesc.convexHull(points);
}

function dressProxyColliderDesc(R, desc, entity, spec, material, captureContactImpacts) {
  desc.setDensity(0);
  applyColliderContactMaterial(R, desc, material);
  if (typeof desc.setCollisionGroups === 'function') {
    desc.setCollisionGroups(computeCollisionGroups(entity, spec, material));
  }
  if (captureContactImpacts) configureContactEvents(R, desc, material);
  return desc;
}

function buildCompoundProxyColliderDescs(R, entity, manifest, material, spec, captureContactImpacts = true, parameters = {}) {
  const scale = proxyScaleFor(entity, manifest);
  const hasConvexHull = typeof R.ColliderDesc.convexHull === 'function';
  if (Array.isArray(manifest.compactHull) && manifest.compactHull.length >= 3 && hasConvexHull) {
    const hullDesc = convexPrismDesc(R, manifest.compactHull, scale, parameters);
    if (hullDesc) {
      return [dressProxyColliderDesc(R, hullDesc, entity, spec, material, captureContactImpacts)];
    }
  }
  if (Array.isArray(manifest.planarPolygon)
    && manifest.planarPolygon.length >= 3
    && manifest.planarPolygon.length <= MAX_PROXY_PRIMITIVES
    && hasConvexHull) {
    const verts = manifest.planarPolygon;
    const descs = [];
    let ok = true;
    for (let i = 0; i < verts.length; i += 1) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const ax = a.x * scale;
      const az = a.z * scale;
      const bx = b.x * scale;
      const bz = b.z * scale;
      if (Math.abs(ax * bz - az * bx) < 1e-9) continue;
      const desc = convexPrismDesc(R, [{ x: 0, z: 0 }, a, b], scale, parameters);
      if (!desc) { ok = false; break; }
      descs.push(desc);
    }
    if (ok && descs.length) {
      for (const desc of descs) dressProxyColliderDesc(R, desc, entity, spec, material, captureContactImpacts);
      return descs;
    }
  }
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
    if (typeof desc.setCollisionGroups === 'function') {
      desc.setCollisionGroups(computeCollisionGroups(entity, spec, material));
    }
    if (captureContactImpacts) configureContactEvents(R, desc, material);
    descs.push(desc);
  }
  // Fail-closed: a malformed manifest must not remove collision — fall back to the legacy ball.
  if (!descs.length) return [buildBallColliderDesc(R, spec, material, captureContactImpacts, entity)];
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

function contactOverrideEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.friction === b.friction && a.restitution === b.restitution
    && a.angularDamping === b.angularDamping && a.restitutionCombine === b.restitutionCombine;
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
    current.material === spec.material &&
    contactOverrideEquals(current.contact, spec.contact);
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
    && finite(entity.angVel) === -finite(w && w.y);
}

function wrapAngle(value) {
  let out = finite(value);
  if (Math.abs(out) > Math.PI * 3) out %= Math.PI * 2;
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

function boundedYawRate(value) {
  return clamp(finite(value), -SANE_MAX_YAW_RATE, SANE_MAX_YAW_RATE);
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
