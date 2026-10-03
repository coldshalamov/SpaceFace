// PQ-012 / SF-12 — Continuous field system (lifecycle / input / force application / presentation).
//
// Drives the ONE field kernel (src/core/fields/fieldKernel.js) and its three player-facing
// consumers, all reachable on the default route via real input:
//   • Well     (Digit5) — deployed at the aim point; PULLS light bodies/projectiles/marked targets.
//   • Repulsor (Digit6) — dropped at the ship; SHOVES bodies outward.
//   • Cone     (Digit7) — a player-attached sustained forward wedge (toggle); the gravitic snowplow.
//
// Physics: every force crosses the SG-02 command membrane as an ADDITIVE impulse
// (queuePhysicsImpulse — the proven dockingCorridor/Tideline pattern: a·mass·dt per tick). It
// NEVER calls writePhysicsControl (that would replace flight's control command) and never writes
// e.vel or touches Rapier. Registered immediately BEFORE `physics` so impulses land in the same
// tick's solve.
//
// Determinism & golden safety: pure functions of positions / authored strengths / state.simTime.
// No rng, no wall clock. The whole system is a strict no-op unless FIELD_FLAGS.enabled (Tier-B,
// OFF under node), it is absent from sf-sim.mjs's curated list, and nothing auto-spawns a field —
// deploy is player input only. The 47a golden therefore never executes a field.
//
// Save policy: PQ-146 preserves deployed force geometry, emitter identity, expiry and cooldown.
// Old saves without field data still normalize away; sector changes and new games clear fields.

import { FIELD_DEFS, FIELD_KINDS, FIELD_MAX_ACTIVE, FIELD_END_REASONS, FIELD_PALETTE, FIELD_VOLUMES, FIELD_COUPLING, FIELD_FAMILY_READ, WELL_CLUSTER, WELL_GRIND, fieldsFlag, fieldVolumeOf } from '../data/fields.js';
import { createFieldKernel, couplingScale, fieldAffectsBody, fieldContainsPoint, fieldRawAcceleration, sampleFieldAcceleration, wellUsesVelocityTerm } from '../core/fields/fieldKernel.js';
import {
  classifyClusterReceipt,
  mergeClusterSecondaries,
  rateClusterMoment,
} from '../core/fields/clusterDetonate.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { indexedTypeScan, entityIndexLaneVersion } from '../world/livingWorldViews.js';
import { journalFor } from '../combat/stuntEvidence.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { Masks } from '../core/entity.js';
import { getCombatKernel } from '../combat/kernel.js';
import { ensureCombatant } from '../combat/runtime.js';
import { publishHitstunImpulse, signedHitSide } from '../combat/impulseKernel.js';
import { PINNED_STATUS_ID, STATUS_DEFS, UNMOORED_STATUS_ID } from '../data/combatDefs.js';
import { bombDef } from '../data/bombs.js';
import { bombFieldEnvelope, bombSurfaceFalloff, fillBombViscosityImpulse } from '../combat/bombDynamics.js';
import { combatFlag } from '../data/featureFlags.js';
import { queryCombatTableEntities, COMBAT_TABLE_FLAGS } from '../core/combatTable.js';
import {
  ORBIT_NODE_TYPE,
  attachOrbitWorld,
  resetOrbitWorld,
  syncOrbitRuntime,
} from './orbitNodeRuntime.js';
import { planNpcFieldDeploy, npcFieldRole } from '../ai/npcFieldDeploy.js';

const EMITTER_TYPE = 'fieldEmitter';
const EMITTER_MATERIAL = 'projectile'; // ghost collider: projectile sweeps can hit it, ships don't broadphase against it
// PQ-147.01 — NPC tools share the kernel but not the player's four-slot cap.
const FIELD_NPC_MAX_ACTIVE = 4;
const NPC_CONE_HOLD_TICKS = 180;
// Discover new NPC field deploys on this cadence; live cone geometry stays every tick.
const NPC_FIELD_PLAN_PERIOD_TICKS = 4;
// SF-041 (PB-ORD-C): 'mine' rides the loose-body family — a Well/Repulsor cone moves a placed
// mine as the physical body it is (dynamic Rapier hull, displacement only: fields never arm,
// trigger, or damage it; the mines owner keeps that law). Displaced mines keep their owner,
// arm clock and trigger eligibility because those ride the entity's own data.
const FIELD_LOOSE_TYPES = new Set(['pickup', 'wreck', 'payload', 'mine']);
// PQ-137.09 — the well's convergence term is velocity-dependent (see FIELD_DEFS.well.damping),
// and the leaf that authored it says what it is for: "wells converge SHIPS to 30-60 WU/s
// relative". Craft are the subject. The kernel applies the term only when a velocity sample is
// handed to it, so handing it only for craft leaves every other body's pull exactly as authored —
// a projectile still bends on a pure positional curve ("curve the shot"), loose cargo still
// vacuums in ("vacuum the loot"), and debris, payloads and rocks still funnel the way the
// Intake/Tideline reads and the release predictor were built around. It also matches the enemy
// anchor snare's own words: "the source hull is excluded; escorts and the player are not."
export const FIELD_VELOCITY_TERM_TYPES = Object.freeze(new Set(['ship', 'drone']));
const MASS_STATE_TYPES = new Set(['ship', 'drone', 'payload', 'asteroid', 'wreck', 'pickup']);
const MASS_STATE_DURATION_TICKS = 90;
const MASS_STATE_REFRESH_LEAD_TICKS = 30;

function hasOwnEnumKey(obj) {
  if (!obj) return false;
  for (const _k in obj) return true;
  return false;
}

/** Bench A/B: production default ON. Quiet latch skips idle discover+_publish. */
let FIELDS_IDLE_QUIET_LATCH = true;
export function setFieldsIdleQuietLatchForBench(enabled) {
  FIELDS_IDLE_QUIET_LATCH = enabled !== false;
}
export function getFieldsIdleQuietLatchForBench() {
  return FIELDS_IDLE_QUIET_LATCH !== false;
}

/** Membership / scavenger-discover rescan while latched (0.5 s @ 60 Hz). */
const FIELDS_IDLE_QUIET_RESCAN_TICKS = 30;

function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version
    : null;
}

/** Membership lanes for the idle quiet latch — the NPC-field-role census reads
 * index.aiShips (⊆ shipLike) only, so asteroid/pickup churn no longer wakes it. */
const FIELDS_IDLE_QUIET_LANES = ['shipLike'];

function fieldsMembershipVersion(state) {
  const lane = entityIndexLaneVersion(state, FIELDS_IDLE_QUIET_LANES);
  return lane === -1 ? entityIndexVersion(state) : lane;
}

function fieldsIdleSnapshot(rt, kernel, state) {
  const ms = state && state.massSeed;
  if (ms && (ms.phase === 'active' || ms.phase === 'warning')) return false;
  const kernelCount = kernel && typeof kernel.list === 'function'
    ? kernel.list().length
    : 0;
  return !rt.coneActive
    && !rt.skimActive
    && !rt.skimFieldId
    && kernelCount === 0
    && !hasOwnEnumKey(rt.deployed)
    && !hasOwnEnumKey(rt.anchored)
    && !hasOwnEnumKey(rt.npcFields)
    && !hasOwnEnumKey(rt.hitches);
}

/** Awake ships that can arm an NPC cone/well — latch refuses while any are present. */
function anyNpcFieldRoleInterest(state) {
  const index = state && state.entityIndex;
  const ships = (index && index.aiShips)
    || (index && index.ships)
    || (state && state.entityList)
    || [];
  const playerId = state && state.playerId;
  for (let i = 0; i < ships.length; i++) {
    const entity = ships[i];
    if (!entity || entity.type !== 'ship' || entity.id === playerId) continue;
    if (entity.alive === false) continue;
    if (entity.physicsSleeping === true) continue;
    if (npcFieldRole(entity)) return true;
  }
  return false;
}

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
function nowOf(state) { return Number.isFinite(state.simTime) ? state.simTime : state.tick / 60; }

// INF-042 lifecycle: a deployed Well or Repulsor builds, sustains, and dissipates. The kernel
// enforces the SAME phase the records publish — strength itself ramps — so the visual
// lifecycle and the hazard lifecycle cannot disagree: no invisible active field, no
// harmful-looking expired one. Spans are short against a 9s well; pause freezes them with
// simTime; cancellation and sector exit remove the field outright (a killed field
// dissipates nothing). Cone, sheet, seed, and NPC snares (no deploy clock) stay full-force.
export const FIELD_WINDUP_S = 0.4;
export const FIELD_DISSIPATE_S = 0.6;
export const FIELD_PHASE_WINDING = 'winding';
export const FIELD_PHASE_ACTIVE = 'active';
export const FIELD_PHASE_DISSIPATING = 'dissipating';

export function fieldLifecyclePhase(createdAt, expireAt, now) {
  if (!Number.isFinite(createdAt) || !Number.isFinite(expireAt)) {
    return { phase: FIELD_PHASE_ACTIVE, mult: 1 };
  }
  const age = now - createdAt;
  if (age < FIELD_WINDUP_S) {
    return { phase: FIELD_PHASE_WINDING, mult: Math.max(0, Math.min(1, age / FIELD_WINDUP_S)) };
  }
  const remaining = expireAt - now;
  if (remaining < FIELD_DISSIPATE_S) {
    return { phase: FIELD_PHASE_DISSIPATING, mult: Math.max(0, Math.min(1, remaining / FIELD_DISSIPATE_S)) };
  }
  return { phase: FIELD_PHASE_ACTIVE, mult: 1 };
}

/**
 * Enforce the lifecycle on kernel records in place: the sampler, the predictor, and the
 * published records all read this same strength afterwards, so one number is the hazard
 * and the picture. Only clocked Well/Repulsor deployments ramp; everything else passes
 * through untouched.
 */
export function applyFieldLifecycle(fieldsList, now) {
  if (!Array.isArray(fieldsList)) return;
  for (const f of fieldsList) {
    if (!f || (f.kind !== FIELD_KINDS.WELL && f.kind !== FIELD_KINDS.REPULSOR)) continue;
    if (!Number.isFinite(f.createdAt) || !Number.isFinite(f.expireAt)) continue;
    if (f.baseStrength == null) f.baseStrength = f.strength;
    const { phase, mult } = fieldLifecyclePhase(f.createdAt, f.expireAt, now);
    f.lifecyclePhase = phase;
    f.strength = f.baseStrength * mult;
  }
}

function massStatePolarity(kind) {
  if (kind === FIELD_KINDS.WELL) return 1;
  if (kind === FIELD_KINDS.REPULSOR) return -1;
  return 0;
}

/**
 * Reserved-id spawns (tests, authored hulls) do not bump nextEntityId. A field emitter that
 * then allocateEntityId()'s into an occupied slot replaces the player or the pinned target, so
 * the Repulsor never lands on the body the Well just held. Skip occupied ids before every emitter
 * spawn; this is not a second id allocator, it only keeps the existing counter honest.
 */
function advanceEntityIdPastOccupied(state) {
  if (!state || !state.entities || typeof state.entities.has !== 'function') return;
  if (Array.isArray(state.freeIds) && state.freeIds.length > 0) {
    state.freeIds = state.freeIds.filter((id) => Number.isSafeInteger(id) && id > 0 && !state.entities.has(id));
  }
  let next = Number.isSafeInteger(state.nextEntityId) && state.nextEntityId > 0 ? state.nextEntityId : 1;
  while (state.entities.has(next)) next += 1;
  state.nextEntityId = next;
}

function cancelConsumeWithPartners(kernel, entity, runtime, statusId) {
  const def = kernel && kernel.catalog && kernel.catalog.statuses && kernel.catalog.statuses.get(statusId);
  if (!def || !kernel.statuses || typeof kernel.statuses.clear !== 'function') return;
  for (const interaction of def.interactions || []) {
    if (!interaction || interaction.consumeWith !== true) continue;
    const other = interaction.with;
    if (!other || other === statusId) continue;
    kernel.statuses.clear(entity, runtime, other, 'polarity_cancel');
  }
}

function npcConeRoleLabel(entity) {
  const data = entity && entity.data || {};
  const ai = data.ai || {};
  const role = data.trafficRole || data.role || ai.role;
  if (role) return String(role);
  if (ai.doctrine === 'scavenger') return 'scavenger';
  return 'scavenger';
}

function defaultRuntime() {
  return {
    schemaVersion: 1,
    // Deployed Well/Repulsor emitters: fieldId -> { fieldId, kind, emitterId, deployedAt, expireAt }
    deployed: {},
    coneActive: false,
    coneFieldId: null,
    skimActive: false,
    skimFieldId: null,
    // Runtime-only deploy cooldowns (NON-serialized). Cleared on lifecycle boundaries.
    cooldowns: { well: 0, repulsor: 0 },
    lastDenial: null,
    // Published presentation/predictor mirrors (rebuilt each tick).
    snapshot: [],   // id-sorted normalized field records — the PURE predictor seam consumer input
    active: [],     // per-field presentation records for VFX/HUD
    anchored: {},   // hull-anchored fields: fieldId -> { fieldId, sourceId, defKey, activateTick }
    npcFields: {},  // sourceId -> { fieldId, kind, holdUntilTick }
    hitches: {},    // entityId -> { fieldId, sourceId } — PQ-147.02 seed lock
    orbit: { count: 0, nodes: [] },
    // PQ-147.03 — last rated cluster-and-detonate moment (receipts, not a scripted explode).
    cluster: { fieldId: null, primedId: null, actionTick: null, count: 0, kinds: [], rated: false },
    telemetry: { fields: 0, queries: 0, affected: 0, appliedAccelSum: 0, orbitNodes: 0 },
  };
}

function ensureRuntime(state) {
  const f = state.fields;
  if (f && f.schemaVersion === 1) {
    if (!f.anchored || typeof f.anchored !== 'object') f.anchored = {};
    if (!f.orbit || typeof f.orbit !== 'object') f.orbit = { count: 0, nodes: [] };
    if (f.telemetry && typeof f.telemetry === 'object' && f.telemetry.orbitNodes == null) {
      f.telemetry.orbitNodes = 0;
    }
    if (f.skimActive == null) f.skimActive = false;
    if (!Object.prototype.hasOwnProperty.call(f, 'skimFieldId')) f.skimFieldId = null;
    if (!f.npcFields || typeof f.npcFields !== 'object') f.npcFields = {};
    if (!f.hitches || typeof f.hitches !== 'object') f.hitches = {};
    if (!f.cluster || typeof f.cluster !== 'object') {
      f.cluster = { fieldId: null, primedId: null, actionTick: null, count: 0, kinds: [], rated: false };
    }
    return f;
  }
  state.fields = defaultRuntime();
  return state.fields;
}

// powerRail.js already reads slot 8 from planetRuntime.record.collectorOn or planet.collectorOn.
// PlanetRuntime writes collectorOn under planet.player only — feed the existing hook, do not
// restyle the rail.
function feedRailHooks(state, rt) {
  if (!state) return;
  const planet = state.planet;
  const playerPlanet = planet && planet.player;
  if (playerPlanet && typeof playerPlanet.collectorOn === 'boolean') {
    planet.collectorOn = !!playerPlanet.collectorOn;
    if (!state.planetRuntime || state.planetRuntime.fieldsRailMirror) {
      state.planetRuntime = {
        fieldsRailMirror: true,
        collectorOn: planet.collectorOn,
        record: { collectorOn: planet.collectorOn },
      };
    }
  }
  if (rt) {
    rt.skimActive = !!(rt.skimFieldId);
  }
}

function playerOwnedFieldCount(kernel) {
  if (!kernel || typeof kernel.list !== 'function') return 0;
  const list = kernel.list();
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const tag = list[i] && list[i].tag;
    if (tag === 'external' || tag === 'environmental' || tag === 'npc' || tag === ORBIT_NODE_TYPE) continue;
    n++;
  }
  return n;
}

function npcOwnedFieldCount(kernel) {
  if (!kernel || typeof kernel.list !== 'function') return 0;
  const list = kernel.list();
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].tag === 'npc') n++;
  }
  return n;
}

// Aim convention shared with impulse charges / mass seed: direction toward the painted world point,
// else the nose. Pure; no allocation beyond the returned vector.
function aimDirection(player, state) {
  const aw = state.input && state.input.aimWorld;
  if (aw && Number.isFinite(aw.x) && Number.isFinite(aw.z)) {
    const dx = aw.x - player.pos.x, dz = aw.z - player.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) return { x: dx / len, z: dz / len };
  }
  const inp = state.input;
  const angle = Number.isFinite(inp && inp.aimAngle) ? inp.aimAngle : finite(player.rot);
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/**
 * Build the pure body profile consumed by the field kernel. The optional output record lets the
 * production force loop reuse one scratch object; tests/predictors may omit it for a fresh value.
 * Target selection is intentionally absent: only an earned combat-status multiplier changes field
 * response, so clicking another contact can neither grant nor transfer Gravity Mark.
 */
export function fieldBodyProfile(entity, state, out = null) {
  const profile = out || {};
  const runtime = entity && state && state.combat && state.combat.entities
    ? state.combat.entities[String(entity.id)]
    : null;
  const fieldResponse = runtime && runtime.multipliers && runtime.multipliers.fieldCoupling;
  const massScale = runtime && runtime.physicsResponse && runtime.physicsResponse.massScale;
  const hullMass = positive(entity && entity.physicsBody && entity.physicsBody.mass, positive(entity && entity.mass, 1));
  const hitchMass = entity && entity.data && Number.isFinite(entity.data.hitchMass) && entity.data.hitchMass > 0
    ? entity.data.hitchMass
    : 0;
  profile.mass = hullMass + hitchMass;
  profile.type = entity && entity.type;
  profile.team = entity && entity.team;
  profile.id = entity && entity.id;
  const authoredResponse = entity && entity.physicsBody && Number.isFinite(entity.physicsBody.fieldResponseMult)
    ? Math.max(0, entity.physicsBody.fieldResponseMult)
    : 1;
  profile.fieldResponseMult = (Number.isFinite(fieldResponse) ? Math.max(0, fieldResponse) : 1) * authoredResponse;
  profile.boosting = !!(entity && entity.flags && entity.flags.boosting);
  // Same dynamic-body predicate the impulse loop already uses. Kinematic proxies drop
  // out in the kernel; a heavy dynamic hull stays coupled and only shrugs by mass.
  const dynamic = entity ? isDynamicPhysicsBodyEntity(entity) : true;
  profile.dynamic = dynamic;
  profile.kinematic = dynamic === false;
  profile.hitchedTo = null;
  if (entity && entity.id != null && state && state.fields && state.fields.hitches) {
    const hitch = state.fields.hitches[entity.id] || state.fields.hitches[String(entity.id)];
    if (hitch && hitch.sourceId != null) profile.hitchedTo = hitch.sourceId;
  }
  // The transient mass/inertia scale the physics owner will solve this body at (Pinned = 6x,
  // Unmoored = 0.3x). Coupling never reads it — it is not a mass CLASS, it is the effective solver
  // mass the queued impulse has to be authored against. See _applyForces.
  profile.physicsMassScale = positive(massScale, 1);
  return profile;
}

export const fields = {
  name: 'fields',

  init(ctx) {
    for (const unsub of this._lifecycleUnsubs || []) unsub();
    this._lifecycleUnsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._kernel = createFieldKernel();
    this._orbitWorld = attachOrbitWorld(this._kernel);
    this._orbitScanned = false;
    this._combatKernel = getCombatKernel(ctx);
    // Reused scratch — zero per-tick allocation in the force loop.
    this._queryOut = [];
    this._looseListsScratch = [null, null, null];
    this._impulseScratch = { x: 0, y: 0, z: 0 };
    // Stunt-evidence reuse: one record per field object (kernel retains field records and mutates
    // them in place, so the WeakMap drops rows with expired fields). queuePhysicsImpulse copies
    // kind/tick/provenance onto the pooled impulse vector synchronously, and every command drains
    // in the physics step before the next fields tick can rewrite the row — so a shared row per
    // (field, tick) is observably identical to the old fresh-object-per-entity evidence.
    this._evidenceRows = new WeakMap();
    this._evidenceAmbiguous = { kind: 'field', tick: 0, provenance: null };
    this._affected = new Map();
    this._massStateFields = new Map();
    this._massStateStrengths = new Map();
    // PB-ORD-B pin watch: bodies already inside a pin-capable field this force pass.
    this._pinWatch = [];
    this._pinWatchSeen = new Set();
    this._familyPrevPins = new Set();
    this._familyPrevMines = new Set();
    this._familyShell = null;
    this._accel = { ax: 0, az: 0 };
    this._massStateAccel = { ax: 0, az: 0 };
    this._wellScratch = { ax: 0, az: 0 };
    this._wellAccum = new WeakMap();
    this._wellBodies = new Set();
    // PQ-137.09 grind ledger: pairKey -> { aId, bId, fieldId, ticks, lastTick, announced }
    this._grindPairs = new Map();
    this._grindScratch = [];
    this._flingPairs = new Map();
    this._clusterCargo = new Set();
    this._clusterTerrain = new Set();
    this._clusterSecondaries = [];
    this._clusterCtx = {
      primedId: null,
      playerId: null,
      actionTick: 0,
      cargoIds: this._clusterCargo,
      terrainIds: this._clusterTerrain,
      primedTumbled: false,
      chainStarted: false,
      entityOf: null,
    };
    this._bodyProfile ={ mass: 1, type: null, team: null, id: null, fieldResponseMult: 1, physicsMassScale: 1, boosting: false, hitchedTo: null, primed: false };
    this._coneCenter = { x: 0, z: 0 };
    this._coneDir = { x: 1, z: 0 };
    // Mass Seed hitch post: the live seed mirrors into a kernel lock-ring; ring-entry edges
    // (rope-delivered bodies and loose mass drifting in) latch hitches through it.
    this._seedLockFieldId = null;
    this._insideRing = new Map();
    this._fieldsIdleQuiet = null;
    ensureRuntime(ctx.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._lifecycleUnsubs = [
        this.bus.on('sector:exit', () => this._clearAll(FIELD_END_REASONS.cleared, 'sector_exit')),
        this.bus.on('sector:enter', () => this._clearAll(FIELD_END_REASONS.cleared, 'sector_enter')),
        this.bus.on('game:new', () => this._clearAll(FIELD_END_REASONS.cleared, 'new_game')),
        this.bus.on('save:loaded', () => {
          if(!this._restoredOnLoad)this._clearAll(FIELD_END_REASONS.cleared, 'save_loaded');
          this._restoredOnLoad=false;
          this._rebuildAnchoredFieldsFromEntities();
        }),
        this.bus.on('entity:spawned', (payload) => this._onEntitySpawned(payload)),
        this.bus.on('fields:deployed', (p) => this._onWellDeployed(p)),
        this.bus.on('chain:slam', (p) => this._onClusterReceipt('chain:slam', p)),
        this.bus.on('chain:detonated', (p) => this._onClusterReceipt('chain:detonated', p)),
        this.bus.on('charge:detonated', (p) => this._onClusterReceipt('charge:detonated', p)),
        this.bus.on('combat:tumbled', (p) => this._onClusterReceipt('combat:tumbled', p)),
        this.bus.on('combat:collisionConsequence', (p) => this._onClusterReceipt('combat:collisionConsequence', p)),
        this.bus.on('physics:impact', (p) => this._onClusterReceipt('physics:impact', p)),
        // Re-roping a hitched body is the manual release: the latch path is player-only, so a
        // hitch on the seed ring is cut by roping the same body again.
        this.bus.on('tether:latched', (p) => this._onTetherLatchedForHitch(p)),
      ];
    }
  },

  newGame() {
    this._clearAll(FIELD_END_REASONS.cleared, 'new_game');
  },

  serialize() {
    const rt=ensureRuntime(this.state);
    // orbit_node fields are pure functions of (host, simTime, index) — they respawn on the
    // first orbit rescan; persisting them would restore orphaned frozen repulsors.
    return {revision:1,fields:this._kernel.list().filter(f=>f.tag!=='external'&&f.tag!==ORBIT_NODE_TYPE).slice(0,32).map(f=>({...f,
      durationS:Number.isFinite(f.durationS)?f.durationS:null,expireAt:Number.isFinite(f.expireAt)?f.expireAt:null})),
      deployed:rt.deployed,anchored:rt.anchored,npcFields:rt.npcFields,hitches:rt.hitches,cooldowns:rt.cooldowns};
  },
  deserialize(raw,remap=new Map()) {
    for (const _ of this.deserializeChunked(raw, remap)) { /* sync lane: every batch inline */ }
  },

  // Generator twin so the async restore lane can paint between kernel/hitch/NPC sections —
  // a mature deploy ledger is the heavy stretch on this path. Yields sit only at section
  // boundaries; the register order is the sync lane's, so the run stays bit-identical.
  *deserializeChunked(raw,remap=new Map()) {
    this._restoredOnLoad=false;
    if(raw?.revision!==1||!Array.isArray(raw.fields))return;
    const mapped=id=>id==null?id:remap.get(String(id))??id,rt=defaultRuntime();
    this._kernel.clear();
    // Kernel fields are rebuilt from the save; the orbit world must not keep stale
    // node ids (they'd block respawn via hostHasNodes) — and _orbitScanned resets so
    // the first post-load idle tick rescans immediately rather than waiting a cadence.
    if (this._orbitWorld) resetOrbitWorld(this._orbitWorld);
    this._orbitScanned = false;
    this._seedLockFieldId = null;
    let restored = 0;
    for(const saved of raw.fields.slice(0,32)) {
      const f=structuredClone(saved);
      // Legacy saves may carry orbit_node entries — poses are recomputed from the
      // live host on the next rescan; restoring them would freeze orphan repulsors.
      if(f.tag===ORBIT_NODE_TYPE)continue;
      const sourceId=mapped(f.sourceId),ownerId=mapped(f.ownerId);
      if(sourceId!=null&&!this.state.entities.get(sourceId))continue;
      if(f.expireAt!=null&&f.expireAt<=nowOf(this.state))continue;
      const record=this._kernel.register({...f,sourceId,ownerId,durationS:f.durationS??Infinity});
      if(f.expireAt!=null)record.expireAt=f.expireAt;
      const d=raw.deployed?.[f.id];
      if(d&&this.state.entities.get(mapped(d.emitterId)))rt.deployed[f.id]={...d,emitterId:mapped(d.emitterId),expireAt:d.expireAt??Infinity};
      const a=raw.anchored?.[f.id];if(a)rt.anchored[f.id]={...a,sourceId:mapped(a.sourceId)};
      if (++restored % 8 === 0) yield 'fields-kernel-batch';
    }
    yield 'fields-kernel';
    for(const [id,h] of Object.entries(raw.hitches??{})){const eid=mapped(id);const ent=this.state.entities.get(eid)||this.state.entities.get(Number(eid));if(ent&&this._kernel.has(h.fieldId))rt.hitches[eid]={...h,sourceId:mapped(h.sourceId)};}
    yield 'fields-hitches';
    // NPC cone recs are id-keyed mirror state for kernel fields already restored
    // above — without them the field lives on as an orphan nobody retires.
    for(const [sid,rec] of Object.entries(raw.npcFields??{})){if(rec&&this._kernel.has(rec.fieldId))rt.npcFields[mapped(sid)]={...rec,sourceId:mapped(rec.sourceId??sid)};}
    rt.cooldowns=raw.cooldowns??rt.cooldowns;
    this.state.fields=rt;this._restoredOnLoad=true;
  },

  /**
   * PQ-140.02 field-disruptor: collapse every player-owned well/repulsor/cone whose emitter sits
   * inside `radius` of `origin`. Anchor snares (enemy-owned) are not the player's plan and stay.
   */
  disruptNear(state, origin, radius, sourceId = null) {
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return 0;
    const rt = ensureRuntime(state);
    const r = Number.isFinite(radius) && radius > 0 ? radius : 420;
    const r2 = r * r;
    let n = 0;
    for (const rec of Object.values(rt.deployed || {})) {
      if (!rec) continue;
      const emitter = state.entities && state.entities.get && state.entities.get(rec.emitterId);
      const pos = (emitter && emitter.pos) || rec.center;
      if (!pos) continue;
      const dx = pos.x - origin.x;
      const dz = pos.z - origin.z;
      if ((dx * dx + dz * dz) > r2) continue;
      this._retireDeployed(state, rt, rec, FIELD_END_REASONS.disrupted);
      n += 1;
    }
    if (rt.coneActive) {
      const player = this._player(state);
      if (player && player.pos) {
        const dx = player.pos.x - origin.x;
        const dz = player.pos.z - origin.z;
        if ((dx * dx + dz * dz) <= r2) {
          this._setConeActive(state, rt, false, FIELD_END_REASONS.disrupted);
          n += 1;
        }
      }
    }
    if (n > 0 && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('fields:specialistDisrupt', { sourceId, count: n, radius: r });
    }
    return n;
  },

  /**
   * PQ-147.02 — plant a hostile/environmental field that can trap the player.
   * tag npc/environmental so it does not eat the player deploy cap. No owner exclude
   * unless the caller passes filters. Well/repulsor/seed spawn a shootable emitter.
   */
  plantField(state, spec = {}) {
    const s = state && state.entities ? state : this.state;
    if (!this._kernel || !s) return null;
    const defKey = String(spec.defKey || spec.kind || 'well');
    const def = FIELD_DEFS[defKey];
    if (!def) return null;
    const rt = ensureRuntime(s);
    const now = nowOf(s);
    const fieldId = String(spec.id || `field_plant_${defKey}_${s.tick}`);
    const cx = finite(spec.center && spec.center.x);
    const cz = finite(spec.center && spec.center.z);
    let sourceId = spec.sourceId != null ? spec.sourceId : null;
    let emitter = null;
    const wantEmitter = spec.emitter !== false
      && (defKey === 'well' || defKey === 'repulsor' || defKey === 'seed');
    if (wantEmitter) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity === 'function') {
        advanceEntityIdPastOccupied(s);
        const hull = positive(def.hull, 42);
        const rad = positive(def.emitterRadius, 6);
        emitter = spawnEntity({
          type: EMITTER_TYPE,
          pos: { x: cx, z: cz },
          vel: { x: 0, z: 0 },
          rot: 0,
          radius: rad,
          hull,
          hullMax: hull,
          collides: true,
          collisionMask: Masks.PROJECTILE,
          physicsBody: { dynamic: false, ccd: false, material: EMITTER_MATERIAL, mass: 20, radius: rad },
          team: spec.team != null ? spec.team : 1,
          ownerId: spec.ownerId != null ? spec.ownerId : null,
          ttl: Infinity,
          data: {
            kind: 'field_emitter',
            fieldEmitter: true,
            fieldKind: defKey,
            fieldId,
            planted: true,
            radius: def.radius,
          },
        });
        if (emitter) sourceId = emitter.id;
      }
    }
    const dir = spec.dir || { x: 1, z: 0 };
    const record = this._kernel.register({
      id: fieldId,
      kind: def.kind,
      volume: fieldVolumeOf(def),
      center: { x: cx, z: cz },
      dir,
      radius: positive(spec.radius, def.radius),
      strength: spec.strength != null ? spec.strength : def.strength,
      damping: spec.damping != null ? spec.damping : (def.damping || 0),
      falloff: positive(spec.falloff, def.falloff),
      halfAngleRad: def.halfAngleRad,
      edgeSoftRad: def.edgeSoftRad,
      halfWidth: def.halfWidth,
      lockStrength: spec.lockStrength != null ? spec.lockStrength : (def.lockStrength || 0),
      durationS: spec.durationS != null ? spec.durationS : Infinity,
      sourceId,
      ownerId: spec.ownerId != null ? spec.ownerId : sourceId,
      team: spec.team,
      createdAt: now,
      tag: spec.tag || 'npc',
      maxAffected: spec.maxAffected,
      filters: spec.filters === undefined ? null : spec.filters,
    });
    if (emitter) {
      rt.deployed[fieldId] = {
        fieldId,
        kind: defKey,
        emitterId: emitter.id,
        deployedAt: now,
        expireAt: Infinity,
        planted: true,
      };
    }
    this.bus.emit('fields:deployed', {
      fieldId,
      kind: defKey,
      sourceId,
      planted: true,
      center: { x: cx, z: cz },
      radius: record.radius,
    });
    return { fieldId: record.id, emitterId: emitter && emitter.id, record };
  },

  latchFieldHitch(state, entityId, fieldId) {
    const s = state && state.entities ? state : this.state;
    if (!this._kernel || entityId == null || !fieldId) return null;
    const field = this._kernel.get(fieldId);
    if (!field) return null;
    const rt = ensureRuntime(s);
    const rec = { fieldId, sourceId: field.sourceId, attachedAt: nowOf(s) };
    rt.hitches[entityId] = rec;
    this.bus.emit('fields:hitchLatched', { entityId, fieldId, sourceId: rec.sourceId });
    return rec;
  },

  cutFieldHitch(state, entityId) {
    const s = state && state.entities ? state : this.state;
    if (entityId == null) return false;
    const rt = ensureRuntime(s);
    const hitch = rt.hitches[entityId] || rt.hitches[String(entityId)];
    if (!hitch) return false;
    delete rt.hitches[entityId];
    delete rt.hitches[String(entityId)];
    this.bus.emit('fields:hitchCut', { entityId, fieldId: hitch.fieldId, sourceId: hitch.sourceId });
    return true;
  },

  // Re-roping a hitched body is the manual release. The latch event is emitted only by the
  // player's latch path, so this can never cut an NPC's rope.
  _onTetherLatchedForHitch(payload) {
    if (!payload || payload.targetId == null) return;
    this.cutFieldHitch(this.state, payload.targetId);
  },

  // The Mass Seed's lock-ring is a real kernel field while the seed lives: FIELD_DEFS.seed
  // carries lockStrength 400 and the kernel's hitch branch is already implemented — it just
  // never had a producer. tag 'external' keeps the mirror out of serialize, the deploy cap,
  // and the Intake-funnel publish records (_publishSeedVolume already draws the ring).
  _syncSeedLockField(state, rt) {
    const ms = state && state.massSeed;
    const live = !!ms && (ms.phase === 'active' || ms.phase === 'warning');
    const seedEnt = live && ms.seedId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(ms.seedId)
      : null;
    const fieldId = seedEnt && seedEnt.alive !== false ? `field_seed_lock_${ms.seedId}` : null;
    if (fieldId) {
      // Defensive: a different seed's mirror must never linger — seedId changes pass through a
      // null-fieldId tick today, but a skipped tick would leak the stale field and its hitches.
      if (this._seedLockFieldId && this._seedLockFieldId !== fieldId
        && this._kernel.has(this._seedLockFieldId)) {
        this._kernel.unregister(this._seedLockFieldId);
      }
      let rec = this._kernel.get(fieldId);
      const sx = finite(seedEnt.pos && seedEnt.pos.x);
      const sz = finite(seedEnt.pos && seedEnt.pos.z);
      if (!rec) {
        const def = FIELD_DEFS.seed;
        rec = this._kernel.register({
          id: fieldId,
          kind: FIELD_KINDS.WELL,
          volume: FIELD_VOLUMES.RING,
          center: { x: sx, z: sz },
          radius: def.radius,
          strength: 0,
          falloff: def.falloff,
          durationS: Infinity,
          // sourceId MUST be the seed entity id: hitchLockAcceleration matches
          // field.sourceId against profile.hitchedTo, which comes from rt.hitches[].sourceId.
          sourceId: ms.seedId,
          ownerId: ms.ownerId,
          team: seedEnt.team != null ? seedEnt.team : null,
          createdAt: nowOf(state),
          lockStrength: def.lockStrength,
          tag: 'external',
        });
        // CV-EAR: the lock-ring appearing IS the seed's deploy — publish it so the audio
        // voice path (fields:deployed → accessibility cue) hears it like every other power.
        this.bus.emit('fields:deployed', {
          fieldId, kind: 'seed', sourceId: ms.seedId, ownerId: ms.ownerId,
          center: { x: sx, z: sz }, radius: def.radius,
        });
      } else {
        rec.center.x = sx;
        rec.center.z = sz;
      }
      this._seedLockFieldId = fieldId;
      return;
    }
    if (this._seedLockFieldId && this._kernel.has(this._seedLockFieldId)) {
      const deadId = this._seedLockFieldId;
      this._kernel.unregister(deadId);
      for (const id of Object.keys(rt.hitches || {})) {
        if (rt.hitches[id] && rt.hitches[id].fieldId === deadId) delete rt.hitches[id];
      }
    }
    this._seedLockFieldId = null;
  },

  // Ring-entry edge trigger: a body the rope delivers into the lock-ring (or loose mass that
  // drifts in) latches a hitch and gets clamped to the anchor. Edge-triggered, never level —
  // a body freed inside the ring by re-roping must not re-latch until it exits and returns.
  // Ships and drones never auto-catch: the ring is a parking tool, not a passive trap.
  _syncHitches(state, rt) {
    if (rt.hitches) {
      for (const id of Object.keys(rt.hitches)) {
        const rec = rt.hitches[id];
        // Object.keys stringifies numeric entity ids — look up both forms or every
        // legitimate hitch is swept the tick after it latches.
        const ent = state.entities && state.entities.get
          ? (state.entities.get(id) || state.entities.get(Number(id)))
          : null;
        if (!rec || !ent || ent.alive === false || !this._kernel.has(rec.fieldId)) delete rt.hitches[id];
      }
    }
    const field = this._seedLockFieldId ? this._kernel.get(this._seedLockFieldId) : null;
    // Two-map swap keeps the edge memory zero-alloc: prev holds last tick's membership,
    // ring is the cleared spare written fresh this tick.
    const prev = this._insideRing || (this._insideRing = new Map());
    const ring = this._insideRingPrev || (this._insideRingPrev = new Map());
    ring.clear();
    this._insideRing = ring;
    this._insideRingPrev = prev;
    if (!field) return;
    const latch = (ent) => {
      if (!ent || ent.id == null || !ent.pos || ent.alive === false) return;
      // The anchor itself is never its own catch — roping the seed is the primary verb and a
      // self-hitch is pure toast/cue noise — and only bodies the kernel can move take a hitch
      // (a tethered station or chunk of static rock would be a junk record).
      if (ent.id === field.sourceId || ent.type === 'massSeed') return;
      if (!isDynamicPhysicsBodyEntity(ent)) return;
      const inside = fieldContainsPoint(field, ent.pos.x, ent.pos.z);
      ring.set(ent.id, inside);
      if (!inside || prev.get(ent.id) === true) return;
      if (rt.hitches[ent.id] || rt.hitches[String(ent.id)]) return;
      if (Object.keys(rt.hitches).length >= 16) return;
      const rec = this.latchFieldHitch(state, ent.id, field.id);
      if (rec) {
        this.bus.emit('toast', { text: 'Hitched to the anchor', kind: 'info', ttl: 1.6 });
        this.bus.emit('audio:cue', { id: 'lock_acquired' });
        this._emitDeployCue('seed', field.center.x, field.center.z, field.radius);
      }
    };
    // The rope is the delivery verb: whatever the player is towing gets checked this tick.
    const tether = state.player && state.player.tether;
    const tetheredId = tether && tether.active ? tether.targetId : null;
    if (tetheredId != null) {
      const ent = state.entities && state.entities.get
        ? (state.entities.get(tetheredId) || state.entities.get(String(tetheredId)))
        : null;
      latch(ent);
    }
    // Loose mass drifting through the ring is caught: same edge rule, same latch.
    const index = state && state.entityIndex;
    const lists = [];
    if (index && index.__spacefaceEntityIndexV1) {
      lists.push(index.pickups, index.wrecks, index.payloads, index.mines);
    } else {
      lists.push(state && state.entityList);
    }
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const ent of list) {
        if (!ent || ent.alive === false || !ent.pos) continue;
        if (!FIELD_LOOSE_TYPES.has(ent.type) && !(ent.data && ent.data.majorDebris)) continue;
        latch(ent);
      }
    }
  },

  update(dt, state) {
    const rt = ensureRuntime(state);
    this._familyDt = dt;
    // Golden-safety gate (layer b): strict no-op unless enabled (OFF under node).
    if (!fieldsFlag('enabled')) {
      if (this._familyPrevPins) this._familyPrevPins.clear();
      if (this._familyPrevMines) this._familyPrevMines.clear();
      rt.familyRead = EMPTY_FAMILY_READ;
      return;
    }
    if (state.mode !== 'flight') {
      // Not flying (docked / station): apply no forces, but still tick expiry + destruction so a
      // field never outlives its bounded lifetime while the player is away, and keep the cone off.
      if (rt.coneActive) this._setConeActive(state, rt, false, FIELD_END_REASONS.toggledOff);
      this._syncSkimSheet(state, rt);
      this._syncEmitters(state, rt, /*applyForces*/ false, dt);
      this._syncSeedLockField(state, rt);
      this._syncHitches(state, rt);
      // Deferred well-contact records must drain while docked too — otherwise a body
      // touched just before docking holds stale bookkeeping until the next flight.
      this._flushEndedWells(state);
      this._publish(state, rt, 0, 0, 0);
      this._fieldsIdleQuiet = null;
      state.fieldsRuntime = state.fieldsRuntime || {};
      state.fieldsRuntime.quietLatched = false;
      return;
    }
    this._handleInput(state, rt);
    // Skim sheet mirrors the planet collector latch — must run even when the kernel is empty
    // so turning the scoop on can arm a sheet without a pre-existing field.
    this._syncSkimSheet(state, rt);
    // Quiet flight: no player cone/deployed/anchored/npc/skim and an empty kernel — after
    // npc-plan-cadence, deepen with an idle quiet latch: skip the discover walk and the
    // quiet-path producers for up to 0.5 s while membership is stable; wake on entity-index
    // bump, rescan, or leaving idle (input/skim already ran above and clear idle when the
    // player deploys). Unlatched idle still runs every quiet-path producer each tick.
    let idle = fieldsIdleSnapshot(rt, this._kernel, state);
    if (idle) {
      if (FIELDS_IDLE_QUIET_LATCH !== false) {
        const membership = fieldsMembershipVersion(state);
        const tick = state.tick | 0;
        const quiet = this._fieldsIdleQuiet;
        if (quiet
          && membership !== null
          && quiet.membership === membership
          && ((tick - (quiet.armedTick | 0)) < FIELDS_IDLE_QUIET_RESCAN_TICKS)
          && (!this._wellBodies || this._wellBodies.size === 0)) {
          state.fieldsRuntime = state.fieldsRuntime || {};
          state.fieldsRuntime.quietLatched = true;
          // Kernel is empty, but a tar cloud or a mine on the rim still needs its read.
          this._publishFamilyRead(state, rt, dt);
          return;
        }
        // Refuse latch while any awake scavenger/sweeper/salvor/anchor role exists — those
        // still need the cadenced discover walk so loose-mass cones can arm (PQ-147.01).
        // Also refuse if entity index is absent (membership is null) so fallback stays truthful.
        const refuseLatch = membership == null || anyNpcFieldRoleInterest(state);
        if (refuseLatch) this._fieldsIdleQuiet = null;
        // Producers must stay live while unlatched-idle: a mass-seed ring or a newly
        // orbit-capable host has to bootstrap out of an empty kernel, the cadenced
        // NPC discover lets a scavenger spin up, and deferred well bookkeeping
        // still needs its flush so external unregisters retire cleanly.
        this._syncSeedLockField(state, rt);
        this._syncNpcFields(state, rt);
        // First-ever scan fires immediately so a fitted host doesn't wait out the
        // cadence; later rescans ride the NPC plan period.
        if (this._orbitScanned !== true || ((state.tick | 0) % NPC_FIELD_PLAN_PERIOD_TICKS) === 0) this._syncOrbit(state);
        // Hitch bookkeeping must still run: its prev/inside swap is what ages out
        // ring-membership memory, and a same-tick latch on a just-registered seed
        // ring matches the non-idle order.
        this._syncHitches(state, rt);
        this._flushEndedWells(state);
        idle = fieldsIdleSnapshot(rt, this._kernel, state);
        if (idle) {
          if (!refuseLatch) this._fieldsIdleQuiet = { membership, armedTick: tick };
          this._publish(state, rt, 0, 0, 0);
          state.fieldsRuntime = state.fieldsRuntime || {};
          state.fieldsRuntime.quietLatched = !refuseLatch;
          return;
        }
        // A producer armed something (seed ring / NPC cone / hitch) — fall through
        // to the live force path with the latch disarmed.
        this._fieldsIdleQuiet = null;
      } else {
        // Bench A/B: unlatched idle keeps every quiet-path producer live (see above).
        this._syncSeedLockField(state, rt);
        this._syncNpcFields(state, rt);
        if (this._orbitScanned !== true || ((state.tick | 0) % NPC_FIELD_PLAN_PERIOD_TICKS) === 0) this._syncOrbit(state);
        this._syncHitches(state, rt);
        this._flushEndedWells(state);
        this._publish(state, rt, 0, 0, 0);
        state.fieldsRuntime = state.fieldsRuntime || {};
        state.fieldsRuntime.quietLatched = false;
        return;
      }
    } else if (this._fieldsIdleQuiet) {
      this._fieldsIdleQuiet = null;
    }
    this._syncCone(state, rt);
    this._syncNpcFields(state, rt);
    this._syncAnchoredFields(state, rt);
    this._syncOrbit(state);
    this._syncEmitters(state, rt, /*applyForces*/ true, dt);
    this._syncSeedLockField(state, rt);
    this._syncHitches(state, rt);
    // _syncEmitters returns nothing; force application happens in _applyForces so the accel sum can
    // be published. Order: geometry settled → forces → publish.
    const applied = this._applyForces(dt, state, rt);
    this._publish(state, rt, applied.queries, applied.affected, applied.accelSum);
    state.fieldsRuntime = state.fieldsRuntime || {};
    state.fieldsRuntime.quietLatched = false;
  },

  _onEntitySpawned(payload) {
    if (!fieldsFlag('enabled')) return;
    const entity = payload && payload.entity;
    if (!entity || entity.alive === false) return;
    this._registerAnchoredField(entity);
  },

  _registerAnchoredField(entity) {
    const data = entity && entity.data;
    const anchor = data && data.fieldAnchor;
    if (!anchor || !this._kernel) return null;
    const defKey = String(anchor.defKey || anchor.fieldDef || 'anchorSnare');
    const def = FIELD_DEFS[defKey];
    if (!def) return null;
    const rt = ensureRuntime(this.state);
    const existing = Object.values(rt.anchored).find((rec) => rec && rec.sourceId === entity.id);
    if (existing && this._kernel.has(existing.fieldId)) return existing.fieldId;
    // An enemy snare is not one of the player's six wells. Filling the player cap
    // used to refuse the anchor, so the kite plan survived the specialist.
    if (defKey !== 'anchorSnare' && playerOwnedFieldCount(this._kernel) >= FIELD_MAX_ACTIVE) return null;
    const now = nowOf(this.state);
    const spinupTicks = Math.max(0, Math.floor(Number(anchor.spinupTicks ?? def.spinupTicks) || 0));
    const fieldId = String(anchor.fieldId || `field_anchor_${entity.id}`);
    const radius = positive(anchor.radius, def.radius);
    const strength = positive(anchor.strength, def.strength);
    const record = this._kernel.register({
      id: fieldId,
      kind: def.kind,
      center: { x: entity.pos.x, z: entity.pos.z },
      radius,
      strength: spinupTicks > 0 ? 0 : strength,
      damping: positive(anchor.damping, def.damping || 0),
      falloff: positive(anchor.falloff, def.falloff),
      durationS: Infinity,
      sourceId: entity.id,
      ownerId: entity.id,
      team: entity.team,
      createdAt: now,
      maxAffected: positive(anchor.maxAffected, def.maxAffected),
      tag: anchor.presentationTag || 'environmental',
      filters: { excludeId: entity.id },
    });
    rt.anchored[fieldId] = {
      fieldId,
      defKey,
      sourceId: entity.id,
      // Spawn-time equipment: the well arms itself once the authored spinup elapses (the
      // pre-PB-TAC-B behavior, kept for hull-only fixtures and save rebuilds). The SF-049
      // doctrine cycle — driven through setAnchorArmed by the specialist verb — modulates
      // `armed` per engagement: disarmed on the approach/recovery legs, re-armed with a fresh
      // spinup only across the telegraphed commit.
      armed: true,
      spinupTicks,
      activateTick: (this.state.tick | 0) + spinupTicks,
      strength,
      radius,
    };
    this.bus.emit('fields:anchorRegistered', {
      fieldId,
      sourceId: entity.id,
      kind: defKey,
      radius,
      activateTick: rt.anchored[fieldId].activateTick,
    });
    this._emitDeployCue('well', entity.pos.x, entity.pos.z, radius);
    return record.id;
  },

  _syncAnchoredFields(state, rt) {
    const ids = Object.keys(rt.anchored || {});
    for (const fieldId of ids) {
      const rec = rt.anchored[fieldId];
      const entity = state.entities && state.entities.get ? state.entities.get(rec.sourceId) : null;
      if (!entity || entity.alive === false) {
        this._kernel.unregister(fieldId);
        delete rt.anchored[fieldId];
        this.bus.emit('fields:ended', { fieldId, kind: rec.defKey, reason: FIELD_END_REASONS.destroyed });
        continue;
      }
      this._kernel.update(fieldId, {
        center: { x: entity.pos.x, z: entity.pos.z },
        // SF-049: `armed` is the doctrine cycle's gate (default true for hull-record rebuilds).
        // An unarmed or still-spinning well exerts no pull — the zone bites only after its
        // controller telegraphed the commit and the spinup elapsed.
        strength: rec.armed !== false && (state.tick | 0) >= rec.activateTick ? rec.strength : 0,
      });
    }
  },

  /**
   * SF-049 (PB-TAC-B): the anchor doctrine cycle's handle on its well. The specialist verb
   * drives it per decision tick: armed across the telegraphed commit (field_spool ->
   * anchor_hold), disarmed on every other leg, so a recovery always separates two bites and a
   * re-arm restarts the hull's own spinup. Idempotent while the request is unchanged — an
   * already-armed well is NOT re-spun. Returns the live record state (the owner's confirmation)
   * or null when no well belongs to this source.
   */
  setAnchorArmed(state, sourceId, armed, tick = null) {
    const s = state && state.entities ? state : this.state;
    if (!s || sourceId == null) return null;
    const rt = ensureRuntime(s);
    const rec = Object.values(rt.anchored || {}).find((row) => row && row.sourceId === sourceId);
    if (!rec) return null;
    const want = armed === true;
    if (rec.armed !== want) {
      rec.armed = want;
      if (want) {
        const now = Number.isInteger(tick) ? tick : (s.tick | 0);
        rec.activateTick = now + (Number(rec.spinupTicks) || 0);
      }
    }
    return { fieldId: rec.fieldId, armed: rec.armed === true, activateTick: rec.activateTick, radius: rec.radius };
  },

  _rebuildAnchoredFieldsFromEntities() {
    const state = this.state;
    if (!state || !fieldsFlag('enabled')) return;
    const source = state.entityList || [];
    for (const entity of source) {
      if (entity && entity.alive !== false) this._registerAnchoredField(entity);
    }
  },

  // ── input / deploy ─────────────────────────────────────────────────────────────────────────

  _handleInput(state, rt) {
    const actions = state.input && state.input.actions;
    if (!actions) return;
    if (actions.deployWell) { actions.deployWell = false; this._deployRadial(state, rt, 'well'); }
    if (actions.deployRepulsor) { actions.deployRepulsor = false; this._deployRadial(state, rt, 'repulsor'); }
    if (actions.toggleClearingCone) { actions.toggleClearingCone = false; this._toggleCone(state, rt); }
  },

  _player(state) {
    return state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  },

  _deployBlocked(state, player) {
    if (!player || !player.alive) return true;
    if (player.flags && player.flags.docked) return true;
    if (state.ui && state.ui.screenStack && state.ui.screenStack.length > 0) return true;
    return false;
  },

  _deployRadial(state, rt, kind) {
    const player = this._player(state);
    if (this._deployBlocked(state, player)) return;
    const def = FIELD_DEFS[kind];
    const now = nowOf(state);
    const cd = rt.cooldowns[kind] || 0;
    if (now < cd) {
      rt.lastDenial = { kind, reason: 'cooldown', at: now, readyAt: cd };
      this.bus.emit('fields:deployDenied', { kind, reason: 'cooldown', readyAt: cd });
      this.bus.emit('toast', { text: `${kind === 'well' ? 'Well' : 'Repulsor'} recharging — ${Math.ceil(cd - now)}s`, kind: 'warn', ttl: 1.6 });
      this.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }

    // Placement: the Well is thrown to the aim point (up to deployRange); the Repulsor drops at the
    // ship (behind you mid-chase).
    let cx = player.pos.x, cz = player.pos.z;
    if (kind === 'well') {
      const dir = aimDirection(player, state);
      const aw = state.input && state.input.aimWorld;
      let dist = def.deployRange;
      if (aw && Number.isFinite(aw.x) && Number.isFinite(aw.z)) {
        dist = Math.min(def.deployRange, Math.hypot(aw.x - player.pos.x, aw.z - player.pos.z));
      }
      dist = Math.max(finite(player.radius, 6) + def.emitterRadius + def.spawnGap, dist);
      cx = player.pos.x + dir.x * dist;
      cz = player.pos.z + dir.z * dist;
    }

    // Enforce the active-field cap by retiring the oldest deployed emitter (bounded work + read).
    this._enforceCap(state, rt);

    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    advanceEntityIdPastOccupied(state);
    const fieldId = `field_${kind}_${state.tick}_${player.id}`;
    const expireAt = now + def.durationS;
    const emitter = spawnEntity({
      type: EMITTER_TYPE,
      pos: { x: cx, z: cz },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: def.emitterRadius,
      hull: def.hull,
      hullMax: def.hull,
      collides: true,
      collisionMask: Masks.PROJECTILE, // shootable by projectile sweeps only (mine/mass-seed family)
      physicsBody: { dynamic: false, ccd: false, material: EMITTER_MATERIAL, mass: 20, radius: def.emitterRadius },
      team: player.team,
      ownerId: player.id,
      ttl: def.durationS + 1, // hard backstop; the system despawns on expireAt first
      data: {
        kind: 'field_emitter',
        fieldEmitter: true,
        fieldKind: kind,
        fieldId,
        ownerId: player.id,
        radius: def.radius,
        expireAt,
      },
    });
    if (!emitter) return;

    this._kernel.register({
      id: fieldId,
      kind: def.kind,
      center: { x: cx, z: cz },
      radius: def.radius,
      strength: def.strength,
      // PQ-137.09 — the deploy path never forwarded the authored damping, so the ONE field record
      // the kernel built for a player-deployed Well or Repulsor always read damping 0 no matter
      // what the data said. Every other register site (the anchor snare, external profiles) does
      // forward it; this one silently dropped it. Without this line the well's convergence law
      // does not exist on the default route and a body just falls faster and faster.
      damping: def.damping,
      falloff: def.falloff,
      volume: fieldVolumeOf(def),
      innerRadius: def.innerRadius || 0,
      innerSoft: def.innerSoft || 0,
      durationS: def.durationS,
      sourceId: emitter.id,
      ownerId: player.id,
      team: player.team,
      createdAt: now,
      // The deploying hull never feels its own tool (same rule the enemy anchor snare applies to
      // its source hull): the Well/Repulsor exist to move OTHER bodies. Without this the
      // ship-centered Repulsor flings the player off-center on the first drift tick, and a
      // well dropped on the cursor yanks the player's own approach path.
      filters: { excludeId: player.id },
    });
    rt.deployed[fieldId] = { fieldId, kind, emitterId: emitter.id, deployedAt: now, expireAt };
    rt.cooldowns[kind] = now + def.cooldownS;
    rt.lastDenial = null;

    this.bus.emit('fields:deployed', { fieldId, kind, sourceId: emitter.id, center: { x: cx, z: cz }, radius: def.radius, expireAt });
    this._emitDeployCue(kind, cx, cz, def.radius);
    // CV-EAR: no generic UI confirm here — each power's own deploy voice arrives via the
    // fields:deployed → accessibility-cue path in audioSystem.
  },

  _toggleCone(state, rt) {
    const player = this._player(state);
    if (this._deployBlocked(state, player)) return;
    this._setConeActive(state, rt, !rt.coneActive, FIELD_END_REASONS.toggledOff);
  },

  _setConeActive(state, rt, active, offReason) {
    if (active === rt.coneActive) return;
    const player = this._player(state);
    if (active) {
      if (this._deployBlocked(state, player)) return;
      const def = FIELD_DEFS.cone;
      const now = nowOf(state);
      const fieldId = `field_cone_${player.id}`;
      const rot = finite(player.rot);
      const dir = { x: Math.cos(rot), z: Math.sin(rot) };
      const center = { x: player.pos.x + dir.x * def.originGap, z: player.pos.z + dir.z * def.originGap };
      this._kernel.register({
        id: fieldId, kind: def.kind, center, dir, radius: def.radius, strength: def.strength,
        falloff: def.falloff, halfAngleRad: def.halfAngleRad, edgeSoftRad: def.edgeSoftRad,
        volume: fieldVolumeOf(def),
        durationS: Infinity, sourceId: player.id, team: player.team, createdAt: now,
        // Owner exclusion, same rule as the deployed tools: the rig never pushes its own hull.
        // The wedge apex sits ahead of the nose so geometry already keeps the player out; this
        // keeps that guarantee true regardless of future originGap/geometry tuning.
        filters: { excludeId: player.id },
      });
      rt.coneActive = true;
      rt.coneFieldId = fieldId;
      // CV-EAR: the cone's deploy is a fields:deployed emit like every other power (the wedge
      // only used coneToggled before, so the audio voice path never saw a player cone open).
      this.bus.emit('fields:deployed', {
        fieldId, kind: 'cone', sourceId: player.id, center, radius: def.radius, isPlayer: true,
      });
      this.bus.emit('fields:coneToggled', { active: true, fieldId });
    } else {
      if (rt.coneFieldId) this._kernel.unregister(rt.coneFieldId);
      const wasId = rt.coneFieldId;
      rt.coneActive = false;
      rt.coneFieldId = null;
      this.bus.emit('fields:coneToggled', { active: false, fieldId: wasId, reason: offReason });
      this.bus.emit('audio:cue', { id: 'ui_deny', gain: 0.4 });
    }
  },

  _syncCone(state, rt) {
    if (!rt.coneActive || !rt.coneFieldId) return;
    const player = this._player(state);
    if (!player || !player.alive || (player.flags && player.flags.docked)) {
      this._setConeActive(state, rt, false, FIELD_END_REASONS.toggledOff);
      return;
    }
    const def = FIELD_DEFS.cone;
    const rot = finite(player.rot);
    this._coneDir.x = Math.cos(rot); this._coneDir.z = Math.sin(rot);
    this._coneCenter.x = player.pos.x + this._coneDir.x * def.originGap;
    this._coneCenter.z = player.pos.z + this._coneDir.z * def.originGap;
    this._kernel.update(rt.coneFieldId, { center: this._coneCenter, dir: this._coneDir });
  },

  /**
   * PQ-147.01 — scavenger-doctrine NPCs hold a clearing cone when loose mass is nearby.
   * Same kernel, same wedge volume as the player cone. Not a damage aura.
   */
  applyNpcFieldPlan(state, entity) {
    if (!fieldsFlag('enabled')) return null;
    if (!entity || entity.alive === false || entity.type !== 'ship') return null;
    if (state && entity.id === state.playerId) return null;
    const rt = ensureRuntime(state || this.state);
    const plan = planNpcFieldDeploy(entity, state || this.state, { radius: FIELD_DEFS.cone.radius });
    const live = rt.npcFields[entity.id];
    const tick = (state && state.tick) | 0;
    let wantOn = !!(plan && plan.action === 'on' && plan.kind === 'cone');
    if (!wantOn && live && live.kind === 'cone' && tick < live.holdUntilTick) wantOn = true;
    if (wantOn && entity.flags && entity.flags.docked) wantOn = false;
    if (wantOn) {
      if (live && live.kind === 'cone' && this._kernel && this._kernel.has(live.fieldId)) {
        if (plan && plan.action === 'on') live.holdUntilTick = tick + NPC_CONE_HOLD_TICKS;
        return live.fieldId;
      }
      return this._setNpcCone(state || this.state, rt, entity, true);
    }
    if (live) this._setNpcCone(state || this.state, rt, entity, false);
    return null;
  },

  _setNpcCone(state, rt, entity, active) {
    if (!entity || !this._kernel) return null;
    const live = rt.npcFields[entity.id];
    if (active) {
      if (live && live.kind === 'cone' && this._kernel.has(live.fieldId)) return live.fieldId;
      if (npcOwnedFieldCount(this._kernel) >= FIELD_NPC_MAX_ACTIVE) return null;
      const def = FIELD_DEFS.cone;
      const now = nowOf(state);
      const rot = finite(entity.rot);
      const dir = { x: Math.cos(rot), z: Math.sin(rot) };
      const center = { x: entity.pos.x + dir.x * def.originGap, z: entity.pos.z + dir.z * def.originGap };
      const fieldId = `field_cone_npc_${entity.id}`;
      this._kernel.register({
        id: fieldId,
        kind: def.kind,
        center,
        dir,
        radius: def.radius,
        strength: def.strength,
        falloff: def.falloff,
        halfAngleRad: def.halfAngleRad,
        edgeSoftRad: def.edgeSoftRad,
        volume: fieldVolumeOf(def),
        durationS: Infinity,
        sourceId: entity.id,
        ownerId: entity.id,
        team: entity.team,
        createdAt: now,
        tag: 'npc',
        filters: { excludeId: entity.id },
      });
      const deployRole = npcConeRoleLabel(entity);
      rt.npcFields[entity.id] = {
        fieldId,
        kind: 'cone',
        sourceId: entity.id,
        role: deployRole,
        holdUntilTick: (state.tick | 0) + NPC_CONE_HOLD_TICKS,
      };
      this.bus.emit('fields:deployed', {
        fieldId,
        kind: 'cone',
        sourceId: entity.id,
        npc: true,
        role: deployRole,
        center,
        radius: def.radius,
      });
      this.bus.emit('fields:coneToggled', { active: true, fieldId, sourceId: entity.id, npc: true });
      this._emitDeployCue('cone', center.x, center.z, def.radius);
      return fieldId;
    }
    if (!live) return null;
    if (live.fieldId) this._kernel.unregister(live.fieldId);
    delete rt.npcFields[entity.id];
    this.bus.emit('fields:ended', { fieldId: live.fieldId, kind: live.kind, reason: FIELD_END_REASONS.toggledOff });
    this.bus.emit('fields:coneToggled', { active: false, fieldId: live.fieldId, sourceId: entity.id, npc: true });
    return null;
  },

  _syncNpcFields(state, rt) {
    const npcFields = rt.npcFields || {};
    const ids = Object.keys(npcFields);
    const tick = (state.tick | 0);
    for (let i = 0; i < ids.length; i++) {
      const sourceId = ids[i];
      const rec = npcFields[sourceId];
      const entity = state.entities && state.entities.get ? state.entities.get(Number(sourceId) || sourceId) : null;
      const live = entity && entity.alive !== false ? entity : null;
      const resolved = live || (state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(sourceId)
        : null);
      const hull = resolved && resolved.alive !== false ? resolved : null;
      if (!hull) {
        if (rec && rec.fieldId && this._kernel) this._kernel.unregister(rec.fieldId);
        delete npcFields[sourceId];
        if (rec) this.bus.emit('fields:ended', { fieldId: rec.fieldId, kind: rec.kind, reason: FIELD_END_REASONS.destroyed });
        continue;
      }
      if (rec.kind !== 'cone' || !rec.fieldId) continue;
      const def = FIELD_DEFS.cone;
      const rot = finite(hull.rot);
      this._coneDir.x = Math.cos(rot); this._coneDir.z = Math.sin(rot);
      this._coneCenter.x = hull.pos.x + this._coneDir.x * def.originGap;
      this._coneCenter.z = hull.pos.z + this._coneDir.z * def.originGap;
      this._kernel.update(rec.fieldId, { center: this._coneCenter, dir: this._coneDir });
      // Live cones refresh/retire every tick (hold window + loose-mass probe). Cheap vs the
      // all-ship discover walk below — typically 0–4 owners.
      this.applyNpcFieldPlan(state, hull);
    }
    // Discover new NPC deploys on cadence. Quiet traffic paid a full aiShips walk every
    // tick even when nobody held a scavenger role; live geometry stays above.
    if ((tick % NPC_FIELD_PLAN_PERIOD_TICKS) !== 0) return;
    const ships = (state.entityIndex && state.entityIndex.aiShips)
      || (state.entityIndex && state.entityIndex.ships)
      || state.entityList
      || [];
    for (let i = 0; i < ships.length; i++) {
      const entity = ships[i];
      if (!entity || entity.type !== 'ship' || entity.id === state.playerId) continue;
      if (npcFields[entity.id] || npcFields[String(entity.id)]) continue;
      if (entity.physicsSleeping === true) continue;
      this.applyNpcFieldPlan(state, entity);
    }
  },

  // PQ-147.00 — Skim Collector is a ship-attached scoop SHEET. PlanetRuntime owns collectorOn;
  // this system only mirrors that latch into the kernel so the volume bends loose mass.
  _syncSkimSheet(state, rt) {
    const player = this._player(state);
    const planet = state.planet;
    const collectorOn = !!(planet && planet.player && planet.player.collectorOn);
    const want = collectorOn
      && state.mode === 'flight'
      && player
      && player.alive
      && !(player.flags && player.flags.docked);
    if (!want) {
      if (rt.skimFieldId && this._kernel) this._kernel.unregister(rt.skimFieldId);
      rt.skimActive = false;
      rt.skimFieldId = null;
      return;
    }
    const def = FIELD_DEFS.skim;
    const rot = finite(player.rot);
    const dir = { x: Math.cos(rot), z: Math.sin(rot) };
    const center = {
      x: player.pos.x + dir.x * def.originGap,
      z: player.pos.z + dir.z * def.originGap,
    };
    const fieldId = rt.skimFieldId || `field_skim_${player.id}`;
    if (!this._kernel.has(fieldId)) {
      this._kernel.register({
        id: fieldId,
        kind: def.kind,
        volume: fieldVolumeOf(def),
        center,
        dir,
        radius: def.radius,
        halfWidth: def.halfWidth,
        strength: def.strength,
        falloff: def.falloff,
        durationS: Infinity,
        sourceId: player.id,
        ownerId: player.id,
        team: player.team,
        createdAt: nowOf(state),
        filters: { excludeId: player.id },
      });
      rt.skimFieldId = fieldId;
      this._emitDeployCue('sheet', center.x, center.z, def.radius);
      // CV-EAR: the sheet opening IS the skim deploy — publish it so the audio voice path
      // (fields:deployed → accessibility cue) hears it like every other power.
      this.bus.emit('fields:deployed', {
        fieldId, kind: 'skim', sourceId: player.id, center, radius: def.radius, isPlayer: true,
      });
    } else {
      this._kernel.update(fieldId, { center, dir });
    }
    rt.skimActive = true;
  },

  // ── lifecycle: expiry + destruction cleanup (brief req 8) ────────────────────────────────────

  _syncOrbit(state) {
    if (!this._orbitWorld) this._orbitWorld = attachOrbitWorld(this._kernel);
    this._orbitScanned = true;
    syncOrbitRuntime(this, state);
  },

  _enforceCap(state, rt) {
    const ids = Object.keys(rt.deployed);
    if (playerOwnedFieldCount(this._kernel) < FIELD_MAX_ACTIVE) return;
    // Retire the oldest deployed emitter so a new deploy always fits under the cap.
    let oldest = null;
    for (const id of ids) {
      const rec = rt.deployed[id];
      if (!oldest || rec.deployedAt < oldest.deployedAt) oldest = rec;
    }
    if (oldest) this._retireDeployed(state, rt, oldest, FIELD_END_REASONS.replaced);
  },

  _syncEmitters(state, rt, applyForces, dt) {
    const now = nowOf(state);
    const ids = Object.keys(rt.deployed);
    for (const id of ids) {
      const rec = rt.deployed[id];
      const entity = state.entities && state.entities.get ? state.entities.get(rec.emitterId) : null;
      if (!entity || entity.alive === false) {
        // Destroyed (shot down) or swept: unregister the field the SAME tick, no orphan force/VFX.
        this._retireDeployed(state, rt, rec, FIELD_END_REASONS.destroyed);
        continue;
      }
      if (now >= rec.expireAt) {
        entity.alive = false;
        this._retireDeployed(state, rt, rec, FIELD_END_REASONS.expired);
        continue;
      }
      // Keep the kernel geometry aligned with the (static) emitter position defensively.
      this._kernel.update(rec.fieldId, { center: { x: entity.pos.x, z: entity.pos.z } });
    }
  },

  _retireDeployed(state, rt, rec, reason) {
    this._kernel.unregister(rec.fieldId);
    delete rt.deployed[rec.fieldId];
    const entity = state.entities && state.entities.get ? state.entities.get(rec.emitterId) : null;
    if (entity && entity.alive !== false && reason !== FIELD_END_REASONS.expired) entity.alive = false;
    // Cooldown starts when a deployed field actually leaves the field (not on a replacement).
    // Planted hostile fields must not write the player's well/repulsor cooldown.
    if (reason !== FIELD_END_REASONS.replaced && !rec.planted && rt.cooldowns[rec.kind] != null && FIELD_DEFS[rec.kind]) {
      rt.cooldowns[rec.kind] = nowOf(state) + FIELD_DEFS[rec.kind].cooldownS;
    }
    if (rt.hitches) {
      for (const id of Object.keys(rt.hitches)) {
        if (rt.hitches[id] && rt.hitches[id].fieldId === rec.fieldId) delete rt.hitches[id];
      }
    }
    // The cluster watch belongs to this field: once it retires, later detonation receipts must
    // not keep accumulating secondaries under a dead well's id and publish a phantom premium cue.
    if (rt.cluster && rt.cluster.fieldId === rec.fieldId) {
      rt.cluster = null;
      this._clusterSecondaries = [];
    }
    const pos = entity && entity.pos ? { x: entity.pos.x, z: entity.pos.z } : null;
    this._emitCollapseCue(rec.kind, pos);
    this.bus.emit('fields:ended', { fieldId: rec.fieldId, kind: rec.kind, reason });
    if (reason === FIELD_END_REASONS.destroyed || reason === FIELD_END_REASONS.expired) {
      this.bus.emit('audio:cue', { id: 'sfx_explosion_small', gain: 0.35 });
    }
  },

  _clearAll(reason, why) {
    const state = this.state;
    if (!state) return;
    const rt = ensureRuntime(state);
    for (const id of Object.keys(rt.deployed)) {
      const rec = rt.deployed[id];
      const entity = state.entities && state.entities.get ? state.entities.get(rec.emitterId) : null;
      if (entity && entity.alive !== false) entity.alive = false;
    }
    if (this._orbitWorld) resetOrbitWorld(this._orbitWorld);
    this._orbitScanned = false;
    if (this._kernel) this._kernel.clear();
    this._seedLockFieldId = null;
    if (this._insideRing) this._insideRing.clear();
    if (this._insideRingPrev) this._insideRingPrev.clear();
    this._wellAccum = new WeakMap();
    this._wellBodies = new Set();
    if (this._pinWatch) this._pinWatch.length = 0;
    if (this._pinWatchSeen) this._pinWatchSeen.clear();
    if (this._familyPrevPins) this._familyPrevPins.clear();
    if (this._familyPrevMines) this._familyPrevMines.clear();
    if (this._grindPairs) this._grindPairs.clear();
    if (this._flingPairs) this._flingPairs.clear();
    if (this._clusterCargo) this._clusterCargo.clear();
    if (this._clusterTerrain) this._clusterTerrain.clear();
    this._clusterSecondaries = [];
    if (this._clusterCtx) {
      this._clusterCtx.primedId = null;
      this._clusterCtx.actionTick = 0;
      this._clusterCtx.primedTumbled = false;
      this._clusterCtx.chainStarted = false;
    }
    this.bus && this.bus.emit && this.bus.emit('fields:cleared', { reason, why });
    state.fields = defaultRuntime();
    this._fieldsIdleQuiet = null;
    state.fieldsRuntime = state.fieldsRuntime || {};
    state.fieldsRuntime.quietLatched = false;
  },

  // ── PQ-013 external authored profiles (the planet's attraction rides the SAME kernel) ─────────
  //
  // A long-lived, authored world profile (STEP 12: "the planet's attraction rides the SAME kernel
  // as a large authored field profile — NO bespoke planet gravity path"). It shares register/
  // unregister, falloff, the acceleration cap, the coupling shrug, the force membrane and the pure
  // predictor seam with the player tools, but it is NOT a deploy: no emitter entity, no cooldown,
  // no cap slot, no Intake-funnel VFX (tag 'external' filters it out of rt.active). _clearAll
  // (sector transitions / load / new game) wipes it with everything else — the owning system
  // (planetRuntime) re-registers on its next tick, which is exactly the transient-save contract.
  registerExternal(spec) {
    if (!this._kernel || !spec) return null;
    return this._kernel.register({ ...spec, tag: 'external', durationS: Infinity });
  },

  // SF-22: authored environmental machinery uses the same force/predictor path but deliberately
  // opts into the pooled world-space field presentation. It remains external to player deploy
  // lifecycle/cooldowns; the owning environment adapter unregisters it on calm/sector/load.
  registerEnvironmental(spec) {
    if (!this._kernel || !spec) return null;
    return this._kernel.register({ ...spec, tag: 'environmental', durationS: Infinity });
  },

  unregisterExternal(id) {
    return this._kernel ? this._kernel.unregister(id) : false;
  },

  updateExternal(id, patch) {
    return this._kernel ? this._kernel.update(id, patch) : null;
  },

  hasExternal(id) {
    return !!(this._kernel && this._kernel.has(id));
  },

  // ── force application (the ONE kernel → membrane) ────────────────────────────────────────────

  _forceableBody(e) {
    if (!e || e.alive === false || !e.pos) return false;
    if (e.type === EMITTER_TYPE || e.type === 'massSeed' || e.type === 'fx') return false;
    // Only dynamic Rapier bodies can be moved by an impulse; fixed bodies (stations, gates, static
    // asteroids, the emitters/anchors themselves) ignore it. Gating here spares wasted membrane
    // writes and keeps the affected count honest.
    return isDynamicPhysicsBodyEntity(e);
  },

  _collectFieldCandidates(field, state, out) {
    const queryRadius = this.helpers && this.helpers.queryRadius;
    if (typeof queryRadius === 'function') {
      queryRadius(field.center, field.radius, out);
    } else {
      out.length = 0;
    }
    const seen = this._candidateSeen || (this._candidateSeen = new Set());
    seen.clear();
    for (let i = 0; i < out.length; i++) seen.add(out[i]);
    const combatScratch = this._combatTableScratch || (this._combatTableScratch = []);
    queryCombatTableEntities(
      state,
      field.center.x,
      field.center.z,
      field.radius,
      combatScratch,
      COMBAT_TABLE_FLAGS.SHIP | COMBAT_TABLE_FLAGS.PROJECTILE | COMBAT_TABLE_FLAGS.WRECK,
    );
    for (let i = 0; i < combatScratch.length; i++) {
      const e = combatScratch[i];
      if (!e || seen.has(e)) continue;
      seen.add(e);
      out.push(e);
    }
    const r2 = field.radius * field.radius;
    const cx = field.center.x;
    const cz = field.center.z;
    const index = state && state.entityIndex;
    // Retained loose-list scratch: same iteration order (pickups, wrecks, payloads, mines)
    // without a per-field array literal each tick.
    const lists = this._looseListsScratch;
    if (index && index.__spacefaceEntityIndexV1) {
      lists[0] = index.pickups;
      lists[1] = index.wrecks;
      lists[2] = index.payloads;
      lists[3] = index.mines;
      lists.length = 4;
    } else {
      lists[0] = state && state.entityList;
      lists.length = 1;
    }
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      if (!list) continue;
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (!e || seen.has(e) || e.alive === false || !e.pos) continue;
        if (!FIELD_LOOSE_TYPES.has(e.type) && !(e.data && e.data.majorDebris)) continue;
        const dx = e.pos.x - cx;
        const dz = e.pos.z - cz;
        if (dx * dx + dz * dz > r2) continue;
        out.push(e);
        seen.add(e);
      }
    }
    return out;
  },

  _profileFor(e, state) {
    const profile = fieldBodyProfile(e, state, this._bodyProfile);
    profile.primed = this._isPrimedLight(e, state);
    return profile;
  },

  _considerMassState(field, entity) {
    if (!field || field.tag != null || field.ownerId == null) return;
    if (field.kind !== FIELD_KINDS.WELL && field.kind !== FIELD_KINDS.REPULSOR) return;
    if (!MASS_STATE_TYPES.has(entity.type) || String(entity.id) === String(field.ownerId)) return;
    // PQ-147.03 — a primed light is ammunition. Pinning it would park the detonator in the clump.
    if (field.kind === FIELD_KINDS.WELL && this._isPrimedLight(entity, this.state)) return;
    fieldRawAcceleration(field, entity.pos.x, entity.pos.z, this._massStateAccel);
    const strength = this._massStateAccel.ax * this._massStateAccel.ax
      + this._massStateAccel.az * this._massStateAccel.az;
    if (!(strength > 0)) return;
    const previousField = this._massStateFields.get(entity);
    if (previousField) {
      const prevPol = massStatePolarity(previousField.kind);
      const nextPol = massStatePolarity(field.kind);
      if (prevPol && nextPol && prevPol !== nextPol) {
        // Opposite polarity: the newer field is the counterplay verb. Strength does not
        // veto it — a Well sitting on a body must not swallow a later Repulsor.
        const prevCreated = finite(previousField.createdAt);
        const nextCreated = finite(field.createdAt);
        const newer = nextCreated > prevCreated
          || (nextCreated === prevCreated && String(field.id) > String(previousField.id));
        if (!newer) return;
        this._massStateStrengths.set(entity, strength);
        this._massStateFields.set(entity, field);
        return;
      }
    }
    const previous = this._massStateStrengths.get(entity);
    if (previous != null && previous >= strength) return;
    this._massStateStrengths.set(entity, strength);
    this._massStateFields.set(entity, field);
  },

  _refreshMassState(state, entity, field) {
    const statusId = field.kind === FIELD_KINDS.WELL ? PINNED_STATUS_ID : UNMOORED_STATUS_ID;
    const kernel = this._combatKernel;
    if (!kernel || !kernel.statuses) return;
    const runtime = ensureCombatant(state, entity, kernel.catalog);
    if (!runtime) return;
    cancelConsumeWithPartners(kernel, entity, runtime, statusId);
    const tick = state.tick >>> 0;
    const active = runtime.statuses && runtime.statuses[statusId];
    if (active && active.expiresTick > tick + MASS_STATE_REFRESH_LEAD_TICKS) return;
    const alreadyPending = (runtime.pendingStatuses || []).some((pending) => pending
      && pending.id === statusId && pending.applyTick >= tick);
    if (alreadyPending) return;
    kernel.statuses.schedule(entity, runtime, {
      id: statusId,
      stacks: 1,
      durationTicks: MASS_STATE_DURATION_TICKS,
    }, {
      attackerId: field.ownerId,
      actionId: `field:${field.id}`,
    });
  },

  _applyForces(dt, state, rt) {
    const now = nowOf(state);
    if (this._kernel && typeof this._kernel.expire === 'function') this._kernel.expire(now);
    const fieldsList = this._kernel.list();
    // INF-042: the lifecycle runs before sampling, so force, predictor, and records agree.
    applyFieldLifecycle(fieldsList, now);
    if (fieldsList.length === 0 || dt <= 0) {
      if (fieldsList.length === 0) {
        this._pinWatch.length = 0;
        this._pinWatchSeen.clear();
        this._massStateFields.clear();
        this._massStateStrengths.clear();
      }
      this._flushEndedWells(state);
      return { queries: 0, affected: 0, accelSum: 0 };
    }
    this._pinWatch.length = 0;
    this._pinWatchSeen.clear();
    const queryRadius = this.helpers && this.helpers.queryRadius;
    const affected = this._affected;
    affected.clear();
    this._massStateFields.clear();
    this._massStateStrengths.clear();
    let queries = 0;
    // One bounded spatial-hash query per active field, then union cargo/debris/wrecks that the
    // hash never stored because they spawn with collides:false (jettisoned cargo). A well that
    // only tugs colliding hulls is a toy for ships, not a pile-maker.
    for (let i = 0; i < fieldsList.length; i++) {
      const field = fieldsList[i];
      this._collectFieldCandidates(field, state, this._queryOut);
      if (typeof queryRadius === 'function') queries++;
      let fieldAffected = 0;
      const maxAffected = Number.isFinite(field.maxAffected) ? field.maxAffected : Infinity;
      for (let j = 0; j < this._queryOut.length; j++) {
        const e = this._queryOut[j];
        this._noteFamilyPin(field, e);
        if (this._forceableBody(e)) {
          const profile = this._profileFor(e, state);
          if (!fieldAffectsBody(field, profile)) continue;
          affected.set(e, true);
          this._considerMassState(field, e);
          fieldAffected++;
          if (fieldAffected >= maxAffected) break;
        }
      }
    }
    const accel = this._accel;
    let affectedCount = 0, accelSum = 0;
    for (const e of affected.keys()) {
      const massStateField = this._massStateFields.get(e);
      if (massStateField) this._refreshMassState(state, e, massStateField);
      const profile = this._profileFor(e, state);
      const velSample = (FIELD_VELOCITY_TERM_TYPES.has(e.type) && wellUsesVelocityTerm(profile))
        ? e.vel
        : null;
      sampleFieldAcceleration(e.pos, velSample, fieldsList, now, profile, accel);
      if (accel.ax === 0 && accel.az === 0) continue;
      // p = a·m·dt, where m must be the mass the SOLVER will use this tick — not the authored one.
      // A Well pins the very bodies it pulls (massScale 6) and a Repulsor unmoors the ones it shoves
      // (massScale 0.3), both applied in this same tick by the combat kernel. Authoring the impulse
      // against the base mass therefore delivered a/6 to a pinned body (the Intake crept instead of
      // clumping) and a/0.3 to an unmoored one — 300 wu/s^2 realized as 1000, straight through the
      // FIELD_MAX_ACCEL 820 safety bound the kernel had already clamped. Scaling here restores the
      // data contract ("Δv per tick = a·dt, MASS-INDEPENDENT") and makes the cap mean what it says.
      // Same seam momentumSink.js uses for effective mass; still one additive membrane write.
      const mass = positive(e.physicsBody && e.physicsBody.mass, positive(e.mass, 1))
        * positive(profile.physicsMassScale, 1);
      // Scratch input: queuePhysicsImpulse copies x/y/z into its pooled command vector before
      // returning, so the literal does not need to be fresh per affected body.
      const impulse = this._impulseScratch;
      impulse.x = accel.ax * mass * dt;
      impulse.y = 0;
      impulse.z = accel.az * mass * dt;
      queuePhysicsImpulse(e, impulse, this._fieldEvidence(e, fieldsList, state, profile));
      this._accumulateWellDelta(e, fieldsList, profile, accel, dt, state);
      this._noteWellClusterBody(e, fieldsList, profile, accel, state);
      affectedCount++;
      accelSum += Math.hypot(accel.ax, accel.az);
    }
    this._detectWellGrind(state);
    this._flushEndedWells(state);
    this._publishClusterWatch(state);
    return { queries, affected: affectedCount, accelSum };
  },

  /**
   * PQ-137.09 — "wells … prime on grind."
   *
   * A well converges the hulls it holds onto each other (FIELD_DEFS.well.damping gives that
   * convergence a 45 WU/s equilibrium instead of an unbounded fall). Two hulls that stay in
   * surface contact inside the well for WELL_GRIND.ticks consecutive ticks are no longer two
   * ships near each other; they are one clump being worked against itself, and the well hands
   * them to the chain owner as primed. This system only OBSERVES — it emits `well:grind` and
   * never writes primed state (single writer: src/systems/impulseCharges.js).
   *
   * Bounded: membership is `_wellBodies` (ships/drones under a well, player excluded), truncated
   * to WELL_GRIND.maxPairBodies in id-sorted order so the pairwise test is deterministic and its
   * cost cannot grow with population.
   */
  _detectWellGrind(state) {
    const ledger = this._grindPairs;
    if (!ledger) return;
    const tick = state.tick | 0;
    const bodies = this._grindScratch;
    bodies.length = 0;
    for (const entity of this._wellBodies) {
      if (!entity || entity.alive === false || !entity.pos) continue;
      const rec = this._wellAccum.get(entity);
      if (!rec || !rec.touched) continue;
      bodies.push(entity);
    }
    if (bodies.length >= 2) {
      // Id-sorted: the pair scan, the ledger keys and the emission order are then identical on
      // every replay of the same seed regardless of Set insertion history.
      bodies.sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
      if (bodies.length > WELL_GRIND.maxPairBodies) bodies.length = WELL_GRIND.maxPairBodies;
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          const dx = b.pos.x - a.pos.x;
          const dz = b.pos.z - a.pos.z;
          const gap = Math.hypot(dx, dz) - finite(a.radius, 0) - finite(b.radius, 0);
          if (gap > WELL_GRIND.contactSlackWu) continue;
          const key = `${a.id}|${b.id}`;
          let pair = ledger.get(key);
          if (!pair) {
            pair = { aId: a.id, bId: b.id, ticks: 0, lastTick: tick, announced: false, fieldId: null };
            ledger.set(key, pair);
          }
          pair.ticks += 1;
          pair.lastTick = tick;
          const rec = this._wellAccum.get(a) || this._wellAccum.get(b);
          pair.fieldId = (rec && rec.fieldId) || pair.fieldId;
          if (!pair.announced && pair.ticks >= WELL_GRIND.ticks) {
            pair.announced = true;
            this.bus.emit('well:grind', {
              schemaVersion: 1,
              aId: a.id,
              bId: b.id,
              fieldId: pair.fieldId,
              ticks: pair.ticks,
              pos: { x: (a.pos.x + b.pos.x) * 0.5, z: (a.pos.z + b.pos.z) * 0.5 },
              tick,
            });
          }
        }
      }
    }
    // A pair that broke contact this tick loses its streak: a grind is CONSECUTIVE contact, and
    // pruning here is also what keeps the ledger from growing without bound.
    for (const [key, pair] of ledger) {
      if (pair.lastTick !== tick) ledger.delete(key);
    }
  },

  // Same computation as stuntEvidence.fieldEvidenceInput — first containing field wins,
  // a second match collapses to provenance:null — but returns retained per-field records
  // instead of a fresh evidence object per affected body. See init for the lifetime argument.
  _fieldEvidence(entity, fields, state, profile) {
    const j = journalFor(state);
    const life = j && j.lives.get(`${typeof entity.id}:${String(entity.id)}`);
    if (!life || (!j.bodies.has(life.id) && entity.type !== 'projectile')) return null;
    let match = null;
    for (const f of fields) {
      if (!(f.radius > 0) || !f.center
        || !fieldContainsPoint(f, entity.pos.x, entity.pos.z)
        || (profile && !fieldAffectsBody(f, profile))) continue;
      if (match) {
        const ambiguous = this._evidenceAmbiguous;
        ambiguous.tick = state.tick;
        return ambiguous;
      }
      match = f;
    }
    if (!match) return null;
    let row = this._evidenceRows.get(match);
    if (!row) {
      row = {
        kind: 'field',
        tick: 0,
        provenance: { actorId: null, field: { id: null, ownerId: null, x: 0, z: 0, radius: 0 } },
      };
      this._evidenceRows.set(match, row);
    }
    const p = row.provenance, pf = p.field;
    row.tick = state.tick;
    p.actorId = match.ownerId;
    pf.id = match.id; pf.ownerId = match.ownerId;
    pf.x = match.center.x; pf.z = match.center.z; pf.radius = match.radius;
    return row;
  },

  _accumulateWellDelta(entity, fieldsList, profile, appliedAccel, dt, state) {
    if (!entity || entity.id === state.playerId) return;
    if (entity.type !== 'ship' && entity.type !== 'drone') return;
    let wellOwnerId = null;
    let wellFieldId = null;
    let wellAffects = false;
    for (let i = 0; i < fieldsList.length; i++) {
      const field = fieldsList[i];
      if (!field || field.kind !== FIELD_KINDS.WELL) continue;
      if (!fieldAffectsBody(field, profile)) continue;
      fieldRawAcceleration(field, entity.pos.x, entity.pos.z, this._wellScratch, entity.vel);
      if (this._wellScratch.ax === 0 && this._wellScratch.az === 0) continue;
      wellAffects = true;
      wellOwnerId = field.ownerId;
      wellFieldId = field.id;
      break;
    }
    if (!wellAffects) return;
    let rec = this._wellAccum.get(entity);
    if (!rec) {
      rec = { dx: 0, dz: 0, attackerId: null, attackerMass: 1, touched: false, fieldId: null };
      this._wellAccum.set(entity, rec);
      this._wellBodies.add(entity);
    }
    rec.dx += finite(appliedAccel && appliedAccel.ax) * dt;
    rec.dz += finite(appliedAccel && appliedAccel.az) * dt;
    rec.touched = true;
    rec.attackerId = wellOwnerId;
    rec.fieldId = wellFieldId;
    const owner = wellOwnerId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(wellOwnerId)
      : null;
    rec.attackerMass = positive(owner && (owner.physicsBody && owner.physicsBody.mass || owner.mass), 1);
  },

  _flushEndedWells(state) {
    if (!this._wellBodies || this._wellBodies.size === 0) return;
    const ended = [];
    for (const entity of this._wellBodies) {
      const rec = this._wellAccum.get(entity);
      if (!rec) {
        ended.push(entity);
        continue;
      }
      if (rec.touched) {
        rec.touched = false;
        continue;
      }
      this._publishWellHitstun(entity, rec, state);
      ended.push(entity);
    }
    for (const entity of ended) {
      this._wellBodies.delete(entity);
      this._wellAccum.delete(entity);
    }
  },

  _publishWellHitstun(entity, rec, state) {
    if (!entity || !rec) return;
    if (!combatFlag('weaponImpulseConsequences')) return;
    const deltaV = Math.hypot(rec.dx, rec.dz);
    if (!(deltaV > 0)) return;
    const victimMass = positive(entity.physicsBody && entity.physicsBody.mass, positive(entity.mass, 1));
    publishHitstunImpulse(this.bus, {
      source: 'well',
      victimId: entity.id,
      attackerId: rec.attackerId,
      attackerMass: rec.attackerMass,
      victimMass,
      deltaV,
      dirX: rec.dx,
      dirZ: rec.dz,
      hitSide: signedHitSide(entity, { x: rec.dx, z: rec.dz }, {
        pos: {
          x: finite(entity.pos && entity.pos.x),
          z: finite(entity.pos && entity.pos.z) + Math.max(4, (entity.radius || 8) * 0.75),
        },
      }, entity.id),
      tick: state && state.tick,
    });
  },

  // ── PQ-147.03 cluster and detonate (observe the 137.09 primed-light seam) ────────────────────

  _isPrimedLight(entity, state) {
    if (!entity || entity.alive === false) return false;
    if (entity.type !== 'ship' && entity.type !== 'drone') return false;
    if (state && entity.id === state.playerId) return false;
    const charges = this.registry && this.registry.get && this.registry.get('impulseCharges');
    if (charges && typeof charges.isPrimed === 'function' && charges.isPrimed(entity, state || this.state)) {
      return true;
    }
    if (charges && typeof charges._armedChargeOn === 'function') {
      if (charges._armedChargeOn(state || this.state, entity.id)) return true;
    }
    const list = indexedTypeScan(state, 'charges');
    if (!list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const charge = list[i];
      if (!charge || charge.alive === false || charge.type !== 'charge') continue;
      const data = charge.data;
      if (data && data.armed && data.hostId === entity.id) return true;
    }
    return false;
  },

  _onWellDeployed(payload) {
    if (!payload || payload.kind !== 'well') return;
    const state = this.state;
    if (!state) return;
    const rt = ensureRuntime(state);
    this._beginClusterWatch(state, rt, payload.fieldId, payload.sourceId);
  },

  _beginClusterWatch(state, rt, fieldId, sourceId) {
    const tick = state.tick | 0;
    this._clusterSecondaries = [];
    this._clusterCargo.clear();
    this._clusterTerrain.clear();
    const ctx = this._clusterCtx;
    ctx.primedId = null;
    ctx.playerId = state.playerId;
    ctx.actionTick = tick;
    ctx.primedTumbled = false;
    ctx.chainStarted = false;
    ctx.entityOf = (id) => (state.entities && state.entities.get ? state.entities.get(id) : null);
    const field = this._kernel && typeof this._kernel.get === 'function' && fieldId != null
      ? this._kernel.get(fieldId)
      : null;
    rt.cluster = {
      fieldId: fieldId || null,
      primedId: null,
      actionTick: tick,
      sourceId: sourceId != null ? sourceId : null,
      // fields:deployed's sourceId is the emitter entity, not the deployer — the field's own
      // ownerId is the author of the moment.
      ownerId: (field && field.ownerId != null) ? field.ownerId : (sourceId != null ? sourceId : null),
      pos: (field && field.center) ? { x: field.center.x, z: field.center.z } : null,
      count: 0,
      kinds: [],
      rated: false,
    };
    if (this._flingPairs) this._flingPairs.clear();
  },

  _noteWellClusterBody(entity, fieldsList, profile, accel, state) {
    if (!entity || !entity.pos) return;
    if (entity.type === 'pickup' || entity.type === 'payload' || entity.type === 'wreck') {
      this._clusterCargo.add(entity.id);
    }
    if (entity.type === 'asteroid' || entity.type === 'station') {
      this._clusterTerrain.add(entity.id);
    }
    let well = null;
    for (let i = 0; i < fieldsList.length; i++) {
      const field = fieldsList[i];
      if (!field || field.kind !== FIELD_KINDS.WELL) continue;
      // External strength-0 lock rings are parking tools, not wells — without the tag/strength
      // gate a seed mirror (id-sorted before field_well_*) steals cluster attribution and can
      // emit a well:fling it never produced.
      if (field.tag != null || !(field.strength > 0)) continue;
      if (!fieldAffectsBody(field, profile)) continue;
      well = field;
      break;
    }
    if (!well) return;
    const rt = ensureRuntime(state);
    if (!rt.cluster || rt.cluster.actionTick == null) {
      this._beginClusterWatch(state, rt, well.id, well.ownerId);
    }
    const primed = profile.primed === true || this._isPrimedLight(entity, state);
    if (primed && rt.cluster.primedId == null) {
      rt.cluster.primedId = entity.id;
      this._clusterCtx.primedId = entity.id;
    }
    if (!primed) return;
    const mag = Math.hypot(finite(accel && accel.ax), finite(accel && accel.az));
    if (!(mag >= WELL_CLUSTER.flingMinAccel)) return;
    const key = `${well.id}|${entity.id}`;
    let rec = this._flingPairs.get(key);
    if (!rec) {
      rec = { ticks: 0, announced: false, fieldId: well.id, targetId: entity.id, ownerId: well.ownerId };
      this._flingPairs.set(key, rec);
    }
    rec.ticks += 1;
    if (rec.announced || rec.ticks < WELL_CLUSTER.flingTicks) return;
    rec.announced = true;
    this.bus.emit('well:fling', {
      schemaVersion: 1,
      actorId: rec.ownerId ?? null,
      wellId: rec.fieldId,
      sourceId: rec.fieldId,
      targetId: rec.targetId,
      victimId: rec.targetId,
      primed: true,
      tick: state.tick | 0,
    });
  },

  _onClusterReceipt(eventName, payload) {
    const state = this.state;
    if (!state || !payload) return;
    const rt = state.fields;
    if (!rt || !rt.cluster || rt.cluster.actionTick == null) return;
    const ctx = this._clusterCtx;
    ctx.playerId = state.playerId;
    ctx.actionTick = rt.cluster.actionTick;
    ctx.primedId = rt.cluster.primedId;
    ctx.nowTick = state.tick | 0;
    const incoming = classifyClusterReceipt(eventName, payload, ctx);
    if (!incoming.length) return;
    // The watch position is the well's kernel center; only when the kernel record is missing
    // does a receipt that actually produced secondaries get to stamp it — ambient impacts and
    // unrelated detonations carry their own pos and would misplace the presentation.
    if (rt.cluster.pos == null && payload.pos && Number.isFinite(payload.pos.x)) {
      rt.cluster.pos = { x: payload.pos.x, z: payload.pos.z };
    }
    this._clusterSecondaries = mergeClusterSecondaries(this._clusterSecondaries, incoming);
    const rating = rateClusterMoment(this._clusterSecondaries);
    rt.cluster.count = rating.count;
    rt.cluster.kinds = rating.kinds;
    rt.cluster.rated = rating.rated;
    if (rating.rated && !rt.cluster.published) {
      rt.cluster.published = true;
      this.bus.emit('fields:clusterDetonate', {
        schemaVersion: 1,
        fieldId: rt.cluster.fieldId,
        primedId: rt.cluster.primedId,
        ownerId: rt.cluster.ownerId != null ? rt.cluster.ownerId : rt.cluster.sourceId,
        sourceId: rt.cluster.sourceId,
        pos: rt.cluster.pos || null,
        tier: rating.tier,
        secondaries: this._clusterSecondaries.slice(),
        count: rating.count,
        kinds: rating.kinds,
        rated: true,
        tick: state.tick | 0,
      });
    }
  },

  _publishClusterWatch(state) {
    const rt = state && state.fields;
    if (!rt || !rt.cluster || rt.cluster.actionTick == null) return;
    if (rt.cluster.captureAnnounced) return;
    let primed = null;
    let neighbors = 0;
    for (const entity of this._wellBodies) {
      if (!entity || entity.alive === false) continue;
      if (this._isPrimedLight(entity, state)) {
        primed = entity;
        if (rt.cluster.primedId == null) {
          rt.cluster.primedId = entity.id;
          this._clusterCtx.primedId = entity.id;
        }
      } else {
        neighbors += 1;
      }
    }
    neighbors += this._clusterCargo.size;
    if (!primed || neighbors < WELL_CLUSTER.minNeighbors) return;
    rt.cluster.captureAnnounced = true;
    this.bus.emit('well:capture', {
      schemaVersion: 1,
      actorId: rt.cluster.sourceId ?? null,
      wellId: rt.cluster.fieldId,
      sourceId: rt.cluster.fieldId,
      targetId: primed.id,
      victimId: primed.id,
      bodies: neighbors + 1,
      tick: state.tick | 0,
    });
  },

  // ── presentation publish (VFX/HUD/predictor mirror) ──────────────────────────────────────────

  _publish(state, rt, queries, affected, accelSum) {
    const fieldsList = this._kernel.list();
    rt.snapshot = fieldsList; // the PURE predictor seam: id-sorted normalized records (no alloc)
    // Reuse the active array + its record objects in place (bible §10: no per-tick allocation in an
    // update path). Bounded by FIELD_MAX_ACTIVE; VFX/HUD read this on the SAME tick it is written.
    const active = rt.active;
    const engaged = affected > 0;
    let n = 0;
    for (let i = 0; i < fieldsList.length; i++) {
      const f = fieldsList[i];
      // PQ-013: external authored profiles (the planet's attraction) stay in the SNAPSHOT (the
      // predictor must see the bend) but out of the deploy-tool presentation records — the planet
      // carries its own visual language (bands/sheath), never an Intake funnel or a HUD chip.
      if (f.tag === 'external' || f.tag === ORBIT_NODE_TYPE) continue;
      let rec = active[n];
      if (!rec) rec = active[n] = { center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } };
      n++;
      rec.id = f.id; rec.kind = f.kind;
      // Presentation uses these identities to exclude the emitter from surface deflection.
      rec.sourceId = f.sourceId ?? null; rec.ownerId = f.ownerId ?? null;
      rec.tag = f.tag;
      rec.center.x = f.center.x; rec.center.z = f.center.z;
      rec.dir.x = f.dir.x; rec.dir.z = f.dir.z;
      rec.radius = f.radius; rec.strength = f.strength; rec.falloff = f.falloff;
      // INF-042: the enforced phase travels with the record, so the VFX owner and the HUD
      // word the same lifecycle the kernel is forcing. Unphased kinds read active.
      rec.phase = f.lifecyclePhase || FIELD_PHASE_ACTIVE;
      rec.halfAngleRad = f.halfAngleRad; rec.halfWidth = f.halfWidth;
      rec.volume = f.volume || fieldVolumeOf(f);
      rec.palette = FIELD_PALETTE[f.kind] || FIELD_PALETTE[rec.volume] || null;
      rec.expireAt = f.expireAt;  // Infinity for the sustained cone; the HUD countdown chip reads it
      // engaged = this tick actually pulled/pushed a body: a contact-response cue, NOT an
      // animation power switch. Presence in active owns the powered lifecycle; empty-space
      // fields still build, sustain and dissipate (force-language lifecycle v2).
      rec.engaged = engaged;
      // PQ-139.05: wells publish RAW kernel radius/strength for the DistortionField producer.
      // Non-wells stay at zero. Presentation only — kernel forces are unchanged. The refraction
      // pass is a SpaceRenderGraph composite sample and is not visible when
      // settings.video.renderGraph is false.
      const isWell = f.kind === FIELD_KINDS.WELL;
      rec.distortionRadius = isWell ? finite(f.radius, 0) : 0;
      rec.distortionStrength = isWell ? Math.max(0, finite(f.strength, 0)) : 0;
    }
    n = this._publishSeedVolume(state, active, n);
    active.length = n; // trim retired fields
    feedRailHooks(state, rt);
    this._publishFamilyRead(state, rt, this._familyDt);
    const tel = rt.telemetry;
    tel.fields = fieldsList.length; tel.queries = queries; tel.affected = affected; tel.appliedAccelSum = accelSum;
    tel.orbitNodes = rt.orbit && Number.isInteger(rt.orbit.count) ? rt.orbit.count : 0;
  },

  // Mass Seed is a Rapier lock, not a gravity well. Publish a RING volume so the rail/drills/VFX
  // grammar can name the shape without drawing a sphere or inventing a second force owner.
  _publishSeedVolume(state, active, n) {
    const ms = state && state.massSeed;
    const phase = ms && ms.phase;
    const live = phase === 'travel' || phase === 'locking' || phase === 'active' || phase === 'warning';
    if (!live) return n;
    const def = FIELD_DEFS.seed;
    let sx = finite(ms.lockPos && ms.lockPos.x);
    let sz = finite(ms.lockPos && ms.lockPos.z);
    const seedEnt = ms.seedId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(ms.seedId)
      : null;
    if (seedEnt && seedEnt.pos) {
      sx = finite(seedEnt.pos.x, sx);
      sz = finite(seedEnt.pos.z, sz);
    }
    let rec = active[n];
    if (!rec) rec = active[n] = { center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } };
    rec.id = 'field_seed_present';
    rec.sourceId = ms.seedId ?? null; rec.ownerId = ms.ownerId ?? null;
    rec.kind = 'seed';
    rec.tag = 'power';
    rec.volume = fieldVolumeOf(def);
    rec.center.x = sx; rec.center.z = sz;
    rec.dir.x = 1; rec.dir.z = 0;
    rec.radius = def.radius;
    rec.strength = 0;
    rec.phase = FIELD_PHASE_ACTIVE;
    rec.falloff = 1;
    rec.halfAngleRad = 0;
    rec.halfWidth = 0;
    rec.palette = FIELD_PALETTE.seed;
    rec.expireAt = Infinity;
    rec.engaged = true;
    rec.distortionRadius = 0;
    rec.distortionStrength = 0;
    // Hitch badge: the ring is a parking tool — HUD/VFX consumers can show what's clamped.
    const hitches = state.fields && state.fields.hitches;
    rec.hitchedCount = hitches ? Object.keys(hitches).length : 0;
    return n + 1;
  },

  // ── VFX cues (presentation bus; renderer consumes — no renderer fork) ─────────────────────────

  _emitDeployCue(kind, x, z, radius) {
    const pal = FIELD_PALETTE[kind] || FIELD_PALETTE.well;
    const color = kind === 'repulsor'
      ? pal.coreWarm
      : (pal.core || pal.scoop || pal.ring || pal.filament || '#39d0ff');
    this.bus.emit('presentation:vfxCue', {
      id: `field.${kind}.deploy`,
      lane: 'field',
      family: 'field',
      field: true,
      volume: fieldVolumeOf(kind),
      particles: 20,
      lights: 1,
      magnitude: 0.9,
      radius,
      position: { x, z },
      material: 'energy',
      color,
      flashReduced: true,
    });
  },

  // Bodies already gathered for the force pass. Kinematic and other refusals stay in the
  // watch so the pin read can say why they were not held. This does not write a force.
  _noteFamilyPin(field, entity) {
    if (!field || field.tag != null || field.ownerId == null) return;
    if (field.kind !== FIELD_KINDS.WELL && field.kind !== FIELD_KINDS.REPULSOR) return;
    if (!entity || entity.alive === false || !entity.pos) return;
    if (!MASS_STATE_TYPES.has(entity.type) && entity.type !== 'station') return;
    if (this._pinWatch.length >= FIELD_FAMILY_READ.maxPinWatch) return;
    if (this._pinWatchSeen.has(entity)) return;
    if (!fieldContainsPoint(field, entity.pos.x, entity.pos.z)) return;
    this._pinWatchSeen.add(entity);
    this._pinWatch.push(entity);
  },

  _publishFamilyRead(state, rt, dt) {
    const shell = this._familyShell || (this._familyShell = createFamilyShell());
    const list = this._kernel && typeof this._kernel.list === 'function' ? this._kernel.list() : EMPTY_SNAPSHOT;
    const step = Number.isFinite(dt) ? dt : (Number.isFinite(this._familyDt) ? this._familyDt : 1 / 60);
    readFieldFamily({
      state,
      fields: list,
      now: nowOf(state),
      dt: step,
      pinWatch: this._pinWatch,
      massFields: this._massStateFields,
      prevPins: this._familyPrevPins,
      prevMines: this._familyPrevMines,
      isPrimed: (entity) => this._isPrimedLight(entity, state),
    }, shell);
    rt.familyRead = shell;
  },

  _emitCollapseCue(kind, pos) {
    if (!pos) return;
    this.bus.emit('presentation:vfxCue', {
      id: `field.${kind}.collapse`,
      lane: 'field',
      particles: 16,
      lights: 1,
      magnitude: 0.8,
      position: { x: pos.x, z: pos.z },
      material: 'energy',
      flashReduced: true,
    });
  },
};

// Test/consumer seam: pure read of the published field snapshot for a predictor or HUD.
export function activeFieldSnapshot(state) {
  return (state && state.fields && Array.isArray(state.fields.snapshot)) ? state.fields.snapshot : EMPTY_SNAPSHOT;
}
const EMPTY_SNAPSHOT = Object.freeze([]);

function statusById(id) {
  for (let i = 0; i < STATUS_DEFS.length; i++) {
    if (STATUS_DEFS[i] && STATUS_DEFS[i].id === id) return STATUS_DEFS[i];
  }
  return null;
}
const PIN_STATUS_DEF = statusById(PINNED_STATUS_ID);
const PIN_MASS_SCALE = PIN_STATUS_DEF && PIN_STATUS_DEF.effects && PIN_STATUS_DEF.effects.physicsResponse
  ? PIN_STATUS_DEF.effects.physicsResponse.massScale
  : 6;
const GOO_STATUS_DEF = statusById('status_goo');
const GOO_MAX_STACKS = GOO_STATUS_DEF && GOO_STATUS_DEF.stacking ? GOO_STATUS_DEF.stacking.maxStacks : 3;
const GOO_MOVEMENT = GOO_STATUS_DEF && GOO_STATUS_DEF.effects && GOO_STATUS_DEF.effects.multipliers
  ? GOO_STATUS_DEF.effects.multipliers.movement
  : 0.72;

const EMPTY_FAMILY_READ = Object.freeze({
  edge: Object.freeze({ active: false, law: 'viscosity', controlFrozen: false, clouds: Object.freeze([]) }),
  pin: Object.freeze({
    law: 'mass_response', massScale: PIN_MASS_SCALE, storedImpulse: 0, teleports: false, rows: Object.freeze([]),
  }),
  bend: Object.freeze({ active: false, samples: Object.freeze([]), projectiles: Object.freeze([]) }),
  breakout: Object.freeze({ mines: Object.freeze([]) }),
});

const _famAccel = { ax: 0, az: 0 };
const _famRaw = { ax: 0, az: 0 };
const _famVisc = { x: 0, y: 0, z: 0 };
const _famVel = { x: 0, z: 0 };
const _famFrame = { x: 0, z: 0 };
const _nextInside = [];
const _famProfile = {
  mass: 1, type: null, team: null, id: null, fieldResponseMult: 1,
  physicsMassScale: 1, boosting: false, hitchedTo: null, primed: false, dynamic: true, kinematic: false,
};
const _bucket = [];
const _goo = [];
const _tools = [];
const _held = [];
const _heldSet = new Set();
const _releasedIds = [];

function cmpEntityId(a, b) {
  const x = a && a.id != null ? String(a.id) : '';
  const y = b && b.id != null ? String(b.id) : '';
  return x < y ? -1 : x > y ? 1 : 0;
}

function createFamilyShell() {
  return {
    edge: { active: false, law: 'viscosity', controlFrozen: false, focusId: null, clouds: [] },
    pin: { law: 'mass_response', massScale: PIN_MASS_SCALE, storedImpulse: 0, teleports: false, rows: [] },
    bend: { active: false, samples: [], projectiles: [] },
    breakout: { mines: [] },
  };
}

function takeRow(pool, index, make) {
  let row = pool[index];
  if (!row) row = pool[index] = make();
  return row;
}

function copyBucket(state, key, type) {
  _bucket.length = 0;
  const index = state && state.entityIndex;
  const ready = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index[key]));
  const source = ready ? index[key] : (state && state.entityList);
  if (!source) return _bucket;
  for (let i = 0; i < source.length; i++) {
    const entity = source[i];
    if (!entity || entity.alive === false) continue;
    if (!ready && entity.type !== type) continue;
    _bucket.push(entity);
  }
  _bucket.sort(cmpEntityId);
  return _bucket;
}

function isLiveGoo(bomb, now) {
  if (!bomb || bomb.alive === false || bomb.type !== 'bomb' || !bomb.pos || !bomb.data) return false;
  const data = bomb.data;
  if (data.retired === true || data.phase !== 'field') return false;
  if (!(data.fieldStartedAt <= now)) return false;
  const field = bombDef(data.bombId).field;
  if (!field || field.kind !== 'goo') return false;
  const envelope = bombFieldEnvelope(now, data.fieldStartedAt, field.durationS, field.endStrength ?? 1);
  return envelope > 0;
}

function gooResidual(speed, mass, drag, frame, dt) {
  _famVel.x = speed;
  _famVel.z = 0;
  if (!(dt > 0) || !fillBombViscosityImpulse(_famVisc, _famVel, frame, mass, dt, drag, 1)) return speed;
  return speed + _famVisc.x / mass;
}

function playerEntity(state) {
  if (!state || !state.entities || typeof state.entities.get !== 'function' || state.playerId == null) return null;
  const player = state.entities.get(state.playerId);
  return player && player.alive !== false && player.pos ? player : null;
}

function gooStatus(state, entity) {
  if (!entity || !state || !state.combat || !state.combat.entities) return null;
  const runtime = state.combat.entities[String(entity.id)];
  const status = runtime && runtime.statuses && runtime.statuses.status_goo;
  if (!status || !(status.stacks > 0)) return null;
  if (status.expiresTick != null && status.expiresTick <= (state.tick | 0)) return null;
  return status;
}

function isPinField(field) {
  return !!(field && field.tag == null && field.ownerId != null
    && (field.kind === FIELD_KINDS.WELL || field.kind === FIELD_KINDS.REPULSOR));
}

function fieldLive(fields, field) {
  if (!field || !fields) return false;
  for (let i = 0; i < fields.length; i++) if (fields[i] === field) return true;
  return false;
}

function anchorOf(type, couple) {
  if (type === 'pickup' || type === 'projectile') return 'full';
  if (couple <= FIELD_COUPLING.minShipCouple + 1e-9) return 'shrug';
  return 'full';
}

function blankPin(row) {
  row.id = null;
  row.phase = 'ineligible';
  row.reason = 'unaffected';
  row.fieldId = null;
  row.fieldKind = null;
  row.fieldX = 0;
  row.fieldZ = 0;
  row.x = 0;
  row.z = 0;
  row.couple = 0;
  row.anchor = 'none';
  row.storedImpulse = 0;
  row.teleports = false;
  row.massScale = PIN_MASS_SCALE;
}

function writeHeldPin(row, entity, field, state) {
  const profile = fieldBodyProfile(entity, state, _famProfile);
  const couple = couplingScale(profile);
  blankPin(row);
  row.id = entity.id;
  row.phase = 'held';
  row.reason = 'held';
  row.fieldId = field.id;
  row.fieldKind = field.kind;
  row.fieldX = field.center.x;
  row.fieldZ = field.center.z;
  row.x = entity.pos.x;
  row.z = entity.pos.z;
  row.couple = couple;
  row.anchor = anchorOf(profile.type, couple);
}

function containingPinField(fields, entity) {
  let best = null;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!isPinField(field) || !fieldContainsPoint(field, entity.pos.x, entity.pos.z)) continue;
    if (!best || String(field.id) < String(best.id)) best = field;
  }
  return best;
}

function writeRefusedPin(row, entity, field, state, isPrimed) {
  const profile = fieldBodyProfile(entity, state, _famProfile);
  const couple = couplingScale(profile);
  const primed = typeof isPrimed === 'function' && isPrimed(entity) === true;
  blankPin(row);
  row.id = entity.id;
  row.x = entity.pos.x;
  row.z = entity.pos.z;
  row.couple = couple;
  if (!field) {
    row.reason = 'unaffected';
    return;
  }
  row.fieldId = field.id;
  row.fieldKind = field.kind;
  row.fieldX = field.center.x;
  row.fieldZ = field.center.z;
  if (!MASS_STATE_TYPES.has(entity.type)) {
    row.reason = 'ineligible_type';
    return;
  }
  if (String(entity.id) === String(field.ownerId)
    || (field.filters && field.filters.excludeId != null && profile.id === field.filters.excludeId)) {
    row.reason = 'source_excluded';
    return;
  }
  if (field.kind === FIELD_KINDS.WELL && primed) {
    row.reason = 'primed';
    return;
  }
  if (profile.dynamic === false || profile.kinematic === true) {
    row.reason = 'kinematic';
    return;
  }
  if (!fieldAffectsBody(field, profile)) {
    row.reason = 'unaffected';
    return;
  }
  fieldRawAcceleration(field, entity.pos.x, entity.pos.z, _famRaw, null);
  if (!(Math.hypot(_famRaw.ax, _famRaw.az) > 0)) {
    row.reason = 'unaffected';
    return;
  }
  // The force pass did not keep this body. Same law, not a second pin.
  row.reason = 'unaffected';
}

function pushTool(field) {
  if (!field || !(field.radius > 0) || !(field.strength > 0) || field.tag === 'external') return;
  _tools.push(field);
}

function overlapSample(a, b, out) {
  let x = (a.center.x + b.center.x) * 0.5;
  let z = (a.center.z + b.center.z) * 0.5;
  if (Math.hypot(x - a.center.x, z - a.center.z) < 1 || Math.hypot(x - b.center.x, z - b.center.z) < 1) {
    x = a.center.x + Math.min(a.radius, b.radius) * 0.35;
    z = a.center.z;
  }
  out.x = x;
  out.z = z;
}

function bestOverlap(out) {
  let pair = null;
  let bestDist = Infinity;
  let bestKey = '';
  const radial = [];
  for (let i = 0; i < _tools.length; i++) {
    const field = _tools[i];
    if (field.kind === FIELD_KINDS.WELL || field.kind === FIELD_KINDS.REPULSOR) radial.push(field);
  }
  const pool = radial.length >= 2 ? radial : _tools;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      const dist = Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);
      if (dist >= a.radius + b.radius) continue;
      const key = String(a.id) < String(b.id) ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (dist < bestDist - 1e-6 || (Math.abs(dist - bestDist) <= 1e-6 && (bestKey === '' || key < bestKey))) {
        bestDist = dist;
        bestKey = key;
        pair = [a, b];
      }
    }
  }
  if (!pair) return false;
  overlapSample(pair[0], pair[1], out);
  return true;
}

function outsideSample(out) {
  let x = 0;
  let z = 0;
  let reach = 0;
  const source = _tools.length ? _tools : EMPTY_SNAPSHOT;
  for (let i = 0; i < source.length; i++) {
    const field = source[i];
    const edge = Math.abs(field.center.x) + Math.abs(field.center.z) + field.radius;
    if (edge >= reach) {
      reach = edge;
      x = field.center.x;
      z = field.center.z;
    }
  }
  out.x = x + reach + 80;
  out.z = z;
}

function pointInsideAny(fields, x, z) {
  for (let i = 0; i < fields.length; i++) {
    if (fieldContainsPoint(fields[i], x, z)) return true;
  }
  return false;
}

function writeSample(row, fields, x, z, now) {
  row.x = x;
  row.z = z;
  const profile = _famProfile;
  profile.mass = FIELD_COUPLING.refMass;
  profile.type = 'ship';
  profile.team = null;
  profile.id = null;
  profile.fieldResponseMult = 1;
  profile.physicsMassScale = 1;
  profile.boosting = false;
  profile.hitchedTo = null;
  profile.primed = false;
  profile.dynamic = true;
  profile.kinematic = false;
  sampleFieldAcceleration({ x, z }, null, fields, now, profile, _famAccel);
  row.ax = _famAccel.ax;
  row.az = _famAccel.az;
  const contributors = row.contributors || (row.contributors = []);
  let n = 0;
  for (let i = 0; i < fields.length && n < FIELD_FAMILY_READ.maxContributors; i++) {
    const field = fields[i];
    if (!field || !fieldContainsPoint(field, x, z)) continue;
    fieldRawAcceleration(field, x, z, _famRaw, null);
    const contrib = takeRow(contributors, n, () => ({ id: null, kind: null, ax: 0, az: 0 }));
    contrib.id = field.id;
    contrib.kind = field.kind;
    contrib.ax = _famRaw.ax;
    contrib.az = _famRaw.az;
    n++;
  }
  contributors.length = n;
  const resultant = Math.hypot(row.ax, row.az);
  if (n === 0) row.kind = 'inactive';
  else if (resultant < FIELD_FAMILY_READ.equilibriumAccel && n >= 2) row.kind = 'equilibrium';
  else row.kind = 'tendency';
}

function shotOwner(entity) {
  if (!entity) return null;
  if (entity.ownerId != null) return entity.ownerId;
  if (entity.data && entity.data.ownerId != null) return entity.data.ownerId;
  return null;
}

/**
 * PB-ORD-B read of the live field state: tar edge and recovery, pin law, overlap
 * tendency, projectile bend provenance, and mine breakout. Numbers come from the
 * same falloff, viscosity, and acceleration the sim already applies. This function
 * does not write velocity, ownership, or a force.
 */
export function readFieldFamily(input, shell) {
  const out = shell || createFamilyShell();
  const state = input && input.state;
  const fields = input && Array.isArray(input.fields) ? input.fields : EMPTY_SNAPSHOT;
  const now = input && Number.isFinite(input.now) ? input.now : 0;
  const dt = input && Number.isFinite(input.dt) && input.dt > 0 ? input.dt : 1 / 60;
  const isPrimed = input && input.isPrimed;

  _goo.length = 0;
  const bombs = copyBucket(state, 'bombs', 'bomb');
  for (let i = 0; i < bombs.length; i++) if (isLiveGoo(bombs[i], now)) _goo.push(bombs[i]);
  const player = playerEntity(state);
  let focus = null;
  const cloudCount = Math.min(_goo.length, FIELD_FAMILY_READ.maxClouds);
  for (let i = 0; i < cloudCount; i++) {
    const bomb = _goo[i];
    const data = bomb.data;
    const def = bombDef(data.bombId);
    const field = def.field;
    const envelope = bombFieldEnvelope(now, data.fieldStartedAt, field.durationS, field.endStrength ?? 1);
    let overlap = 0;
    for (let j = 0; j < _goo.length; j++) {
      const other = _goo[j];
      const otherRadius = bombDef(other.data.bombId).radius;
      const dist = Math.hypot(other.pos.x - bomb.pos.x, other.pos.z - bomb.pos.z);
      if (bombSurfaceFalloff(dist, 0, otherRadius) > 0) overlap++;
    }
    const share = 1 / Math.max(1, overlap);
    const radius = def.radius;
    const edgeDist = radius * (1 - FIELD_FAMILY_READ.gooEdgeFraction);
    const centerFall = bombSurfaceFalloff(0, 0, radius);
    const edgeFall = bombSurfaceFalloff(edgeDist, 0, radius);
    const centerDrag = field.dragPerS * envelope * centerFall * share;
    const edgeDrag = field.dragPerS * envelope * edgeFall * share;
    let hx = 1;
    let hz = 0;
    let tracked = null;
    if (player && bombSurfaceFalloff(Math.hypot(player.pos.x - bomb.pos.x, player.pos.z - bomb.pos.z), 0, radius) > 0) {
      tracked = player;
      const dx = player.pos.x - bomb.pos.x;
      const dz = player.pos.z - bomb.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 1) { hx = dx / len; hz = dz / len; }
    }
    const status = gooStatus(state, tracked);
    _famFrame.x = bomb.vel && Number.isFinite(bomb.vel.x) ? bomb.vel.x : 0;
    _famFrame.z = bomb.vel && Number.isFinite(bomb.vel.z) ? bomb.vel.z : 0;
    const cloud = takeRow(out.edge.clouds, i, () => ({}));
    cloud.id = bomb.id;
    cloud.ownerId = data.ownerId != null ? data.ownerId : null;
    cloud.x = bomb.pos.x;
    cloud.z = bomb.pos.z;
    cloud.radius = radius;
    cloud.envelope = envelope;
    cloud.overlap = overlap;
    cloud.share = share;
    cloud.centerDrag = centerDrag;
    cloud.edgeDrag = edgeDrag;
    cloud.outsideDrag = 0;
    cloud.recoveryX = hx;
    cloud.recoveryZ = hz;
    cloud.clearX = bomb.pos.x + hx * (radius + 8);
    cloud.clearZ = bomb.pos.z + hz * (radius + 8);
    cloud.trackedId = tracked ? tracked.id : null;
    cloud.stacks = status ? status.stacks : 0;
    cloud.maxStacks = GOO_MAX_STACKS;
    cloud.movement = status ? GOO_MOVEMENT : 1;
    cloud.shedding = !!(status && (status.expiresTick == null || status.expiresTick > (state.tick | 0)));
    cloud.controlFrozen = false;
    cloud.probeLight = gooResidual(FIELD_FAMILY_READ.gooProbeSpeed, FIELD_COUPLING.refMass, centerDrag, _famFrame, dt);
    cloud.probeHeavy = gooResidual(FIELD_FAMILY_READ.gooProbeSpeed, 400, centerDrag, _famFrame, dt);
    if (!focus && tracked) focus = cloud.id;
  }
  out.edge.clouds.length = cloudCount;
  out.edge.active = cloudCount > 0;
  out.edge.law = 'viscosity';
  out.edge.controlFrozen = false;
  out.edge.focusId = focus || (cloudCount ? out.edge.clouds[0].id : null);

  _held.length = 0;
  _heldSet.clear();
  const massFields = input && input.massFields;
  if (massFields && typeof massFields.keys === 'function') {
    for (const entity of massFields.keys()) {
      const field = massFields.get(entity);
      if (!entity || entity.alive === false || !entity.pos || !fieldLive(fields, field)) continue;
      _held.push(entity);
    }
  }
  _held.sort(cmpEntityId);
  let pinCount = 0;
  for (let i = 0; i < _held.length && pinCount < FIELD_FAMILY_READ.maxPins; i++) {
    const entity = _held[i];
    const field = massFields.get(entity);
    const row = takeRow(out.pin.rows, pinCount, () => ({}));
    writeHeldPin(row, entity, field, state);
    _heldSet.add(entity);
    _heldSet.add(String(entity.id));
    pinCount++;
  }
  const watch = input && input.pinWatch;
  if (watch) {
    const sortedWatch = watch.slice().sort(cmpEntityId);
    for (let i = 0; i < sortedWatch.length && pinCount < FIELD_FAMILY_READ.maxPins; i++) {
      const entity = sortedWatch[i];
      if (!entity || _heldSet.has(entity) || _heldSet.has(String(entity.id))) continue;
      const field = containingPinField(fields, entity);
      const row = takeRow(out.pin.rows, pinCount, () => ({}));
      writeRefusedPin(row, entity, field, state, isPrimed);
      if (row.reason === 'unaffected') continue;
      pinCount++;
    }
  }
  const prevPins = input && input.prevPins;
  _releasedIds.length = 0;
  if (prevPins && typeof prevPins.forEach === 'function') {
    prevPins.forEach((id) => {
      if (!_heldSet.has(id) && !_heldSet.has(String(id))) _releasedIds.push(id);
    });
  }
  _releasedIds.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
  for (let i = 0; i < _releasedIds.length && pinCount < FIELD_FAMILY_READ.maxPins; i++) {
    const id = _releasedIds[i];
    const entity = state && state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) : null;
    const row = takeRow(out.pin.rows, pinCount, () => ({}));
    blankPin(row);
    row.id = id;
    row.phase = 'released';
    row.reason = 'released';
    row.storedImpulse = 0;
    row.teleports = false;
    if (entity && entity.pos) {
      row.x = entity.pos.x;
      row.z = entity.pos.z;
    }
    pinCount++;
  }
  out.pin.rows.length = pinCount;
  out.pin.law = 'mass_response';
  out.pin.massScale = PIN_MASS_SCALE;
  out.pin.storedImpulse = 0;
  out.pin.teleports = false;
  if (prevPins && typeof prevPins.clear === 'function') {
    prevPins.clear();
    for (let i = 0; i < _held.length; i++) prevPins.add(_held[i].id);
  }

  _tools.length = 0;
  for (let i = 0; i < fields.length; i++) pushTool(fields[i]);
  const samplePoint = { x: 0, z: 0 };
  let sampleCount = 0;
  if (_tools.length) {
    if (bestOverlap(samplePoint) && sampleCount < FIELD_FAMILY_READ.maxSamples) {
      writeSample(takeRow(out.bend.samples, sampleCount, () => ({})), fields, samplePoint.x, samplePoint.z, now);
      sampleCount++;
    }
    outsideSample(samplePoint);
    if (!pointInsideAny(fields, samplePoint.x, samplePoint.z) && sampleCount < FIELD_FAMILY_READ.maxSamples) {
      writeSample(takeRow(out.bend.samples, sampleCount, () => ({})), fields, samplePoint.x, samplePoint.z, now);
      sampleCount++;
    }
    if (player && pointInsideAny(_tools, player.pos.x, player.pos.z) && sampleCount < FIELD_FAMILY_READ.maxSamples) {
      writeSample(takeRow(out.bend.samples, sampleCount, () => ({})), fields, player.pos.x, player.pos.z, now);
      sampleCount++;
    }
    if (sampleCount < FIELD_FAMILY_READ.maxSamples) {
      const field = _tools[0];
      const inset = Math.min(field.radius * 0.35, Math.max(0, field.radius - 1));
      const ix = field.center.x + inset;
      const iz = field.center.z;
      let duplicate = false;
      for (let s = 0; s < sampleCount; s++) {
        const prev = out.bend.samples[s];
        if (Math.hypot(prev.x - ix, prev.z - iz) < 2) duplicate = true;
      }
      if (!duplicate) {
        writeSample(takeRow(out.bend.samples, sampleCount, () => ({})), fields, ix, iz, now);
        sampleCount++;
      }
    }
  }
  out.bend.samples.length = sampleCount;

  const projectiles = copyBucket(state, 'projectiles', 'projectile');
  let shotCount = 0;
  for (let i = 0; i < projectiles.length && shotCount < FIELD_FAMILY_READ.maxProjectiles; i++) {
    const shot = projectiles[i];
    if (!shot.pos) continue;
    let hits = 0;
    let match = null;
    for (let f = 0; f < fields.length; f++) {
      const field = fields[f];
      if (!field || field.tag === 'external' || !fieldContainsPoint(field, shot.pos.x, shot.pos.z)) continue;
      const profile = fieldBodyProfile(shot, state, _famProfile);
      if (!fieldAffectsBody(field, profile)) continue;
      hits++;
      match = field;
    }
    if (hits === 0) continue;
    const profile = fieldBodyProfile(shot, state, _famProfile);
    const vel = shot.vel || null;
    sampleFieldAcceleration(shot.pos, vel, fields, now, profile, _famAccel);
    const row = takeRow(out.bend.projectiles, shotCount, () => ({}));
    row.id = shot.id;
    row.ownerId = shotOwner(shot);
    row.team = shot.team != null ? shot.team : null;
    row.reassigned = false;
    row.ambiguous = hits > 1;
    row.fieldId = hits === 1 && match ? match.id : null;
    row.fieldOwnerId = hits === 1 && match ? match.ownerId : null;
    row.ax = _famAccel.ax;
    row.az = _famAccel.az;
    row.bent = Math.hypot(row.ax, row.az) > FIELD_FAMILY_READ.equilibriumAccel;
    row.x = shot.pos.x;
    row.z = shot.pos.z;
    shotCount++;
  }
  out.bend.projectiles.length = shotCount;
  out.bend.active = shotCount > 0;
  for (let i = 0; i < sampleCount; i++) {
    if (out.bend.samples[i].kind !== 'inactive') out.bend.active = true;
  }

  const mines = copyBucket(state, 'mines', 'mine');
  const prevMines = input && input.prevMines;
  let mineCount = 0;
  _nextInside.length = 0;
  for (let i = 0; i < mines.length && mineCount < FIELD_FAMILY_READ.maxMines; i++) {
    const mine = mines[i];
    if (!mine.pos) continue;
    let inside = null;
    let insideDist = Infinity;
    for (let f = 0; f < fields.length; f++) {
      const field = fields[f];
      if (!field || field.tag === 'external' || !(field.radius > 0)) continue;
      if (!fieldContainsPoint(field, mine.pos.x, mine.pos.z)) continue;
      const dist = Math.hypot(mine.pos.x - field.center.x, mine.pos.z - field.center.z);
      if (!inside || dist < insideDist) {
        inside = field;
        insideDist = dist;
      }
    }
    const was = !!(prevMines && prevMines.has(mine.id));
    if (!inside && !was) continue;
    const profile = fieldBodyProfile(mine, state, _famProfile);
    sampleFieldAcceleration(mine.pos, mine.vel || null, fields, now, profile, _famAccel);
    let exitX = 1;
    let exitZ = 0;
    let outward = false;
    let nearRim = false;
    const guide = inside;
    if (guide) {
      const dx = mine.pos.x - guide.center.x;
      const dz = mine.pos.z - guide.center.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) { exitX = dx / len; exitZ = dz / len; }
      outward = (_famAccel.ax * exitX + _famAccel.az * exitZ) > 0;
      nearRim = len >= guide.radius * (1 - FIELD_FAMILY_READ.mineRimFraction);
    }
    const leaving = !!(inside && outward && nearRim);
    const left = was && !inside;
    const row = takeRow(out.breakout.mines, mineCount, () => ({}));
    row.id = mine.id;
    row.ownerId = shotOwner(mine);
    row.armed = !!(mine.data && mine.data.armed);
    row.triggered = !!(mine.data && mine.data.triggered);
    row.inside = !!inside;
    row.left = left;
    row.held = !!(inside && !leaving);
    row.breakout = leaving || left;
    row.fieldId = inside ? inside.id : null;
    row.x = mine.pos.x;
    row.z = mine.pos.z;
    row.exitX = exitX;
    row.exitZ = exitZ;
    row.ax = _famAccel.ax;
    row.az = _famAccel.az;
    mineCount++;
    if (inside) _nextInside.push(mine.id);
  }
  out.breakout.mines.length = mineCount;
  if (prevMines && typeof prevMines.clear === 'function') {
    prevMines.clear();
    for (let i = 0; i < _nextInside.length; i++) prevMines.add(_nextInside[i]);
  }
  return out;
}
