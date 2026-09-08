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
// Save policy: transient. The kernel + runtime mirror + emitter entities NORMALIZE AWAY on load
// (massSeed pattern). Deploy cooldowns are runtime-only (state.fields.cooldowns) — non-serialized,
// cleared on save:loaded/sector:exit/game:new — which deliberately sidesteps the save-schema mutex
// (a save/reload legitimately clears an in-flight field cooldown).

import { FIELD_DEFS, FIELD_KINDS, FIELD_MAX_ACTIVE, FIELD_END_REASONS, FIELD_PALETTE, WELL_CLUSTER, WELL_GRIND, fieldsFlag, fieldVolumeOf } from '../data/fields.js';
import { createFieldKernel, fieldAffectsBody, fieldRawAcceleration, sampleFieldAcceleration, wellUsesVelocityTerm } from '../core/fields/fieldKernel.js';
import {
  classifyClusterReceipt,
  mergeClusterSecondaries,
  rateClusterMoment,
} from '../core/fields/clusterDetonate.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { Masks } from '../core/entity.js';
import { getCombatKernel } from '../combat/kernel.js';
import { ensureCombatant } from '../combat/runtime.js';
import { publishHitstunImpulse, signedHitSide } from '../combat/impulseKernel.js';
import { PINNED_STATUS_ID, UNMOORED_STATUS_ID } from '../data/combatDefs.js';
import { combatFlag } from '../data/featureFlags.js';
import {
  ORBIT_NODE_TYPE,
  attachOrbitWorld,
  resetOrbitWorld,
  syncOrbitRuntime,
} from './orbitNodeRuntime.js';
import { planNpcFieldDeploy } from '../ai/npcFieldDeploy.js';

const EMITTER_TYPE = 'fieldEmitter';
const EMITTER_MATERIAL = 'projectile'; // ghost collider: projectile sweeps can hit it, ships don't broadphase against it
// PQ-147.01 — NPC tools share the kernel but not the player's four-slot cap.
const FIELD_NPC_MAX_ACTIVE = 4;
const NPC_CONE_HOLD_TICKS = 180;
const FIELD_LOOSE_TYPES = new Set(['pickup', 'wreck', 'payload']);
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

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
function nowOf(state) { return Number.isFinite(state.simTime) ? state.simTime : state.tick / 60; }

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
  profile.fieldResponseMult = Number.isFinite(fieldResponse) ? Math.max(0, fieldResponse) : 1;
  profile.boosting = !!(entity && entity.flags && entity.flags.boosting);
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
    this._combatKernel = getCombatKernel(ctx);
    // Reused scratch — zero per-tick allocation in the force loop.
    this._queryOut = [];
    this._affected = new Map();
    this._massStateFields = new Map();
    this._massStateStrengths = new Map();
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
    ensureRuntime(ctx.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._lifecycleUnsubs = [
        this.bus.on('sector:exit', () => this._clearAll(FIELD_END_REASONS.cleared, 'sector_exit')),
        this.bus.on('sector:enter', () => this._clearAll(FIELD_END_REASONS.cleared, 'sector_enter')),
        this.bus.on('game:new', () => this._clearAll(FIELD_END_REASONS.cleared, 'new_game')),
        this.bus.on('save:loaded', () => {
          this._clearAll(FIELD_END_REASONS.cleared, 'save_loaded');
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
      ];
    }
  },

  newGame() {
    this._clearAll(FIELD_END_REASONS.cleared, 'new_game');
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

  update(dt, state) {
    const rt = ensureRuntime(state);
    // Golden-safety gate (layer b): strict no-op unless enabled (OFF under node).
    if (!fieldsFlag('enabled')) return;
    if (state.mode !== 'flight') {
      // Not flying (docked / station): apply no forces, but still tick expiry + destruction so a
      // field never outlives its bounded lifetime while the player is away, and keep the cone off.
      if (rt.coneActive) this._setConeActive(state, rt, false, FIELD_END_REASONS.toggledOff);
      this._syncSkimSheet(state, rt);
      this._syncEmitters(state, rt, /*applyForces*/ false, dt);
      this._publish(state, rt, 0, 0, 0);
      return;
    }
    this._handleInput(state, rt);
    this._syncCone(state, rt);
    this._syncNpcFields(state, rt);
    this._syncSkimSheet(state, rt);
    this._syncAnchoredFields(state, rt);
    this._syncOrbit(state);
    this._syncEmitters(state, rt, /*applyForces*/ true, dt);
    // _syncEmitters returns nothing; force application happens in _applyForces so the accel sum can
    // be published. Order: geometry settled → forces → publish.
    const applied = this._applyForces(dt, state, rt);
    this._publish(state, rt, applied.queries, applied.affected, applied.accelSum);
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
    if (playerOwnedFieldCount(this._kernel) >= FIELD_MAX_ACTIVE) return null;
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
        strength: (state.tick | 0) >= rec.activateTick ? rec.strength : 0,
      });
    }
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
    this.bus.emit('audio:cue', { id: 'confirm' });
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
      this.bus.emit('fields:coneToggled', { active: true, fieldId });
      this.bus.emit('audio:cue', { id: 'confirm' });
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
      rt.npcFields[entity.id] = {
        fieldId,
        kind: 'cone',
        sourceId: entity.id,
        holdUntilTick: (state.tick | 0) + NPC_CONE_HOLD_TICKS,
      };
      this.bus.emit('fields:deployed', {
        fieldId,
        kind: 'cone',
        sourceId: entity.id,
        npc: true,
        role: 'scavenger',
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
    const ids = Object.keys(rt.npcFields || {});
    for (let i = 0; i < ids.length; i++) {
      const sourceId = ids[i];
      const rec = rt.npcFields[sourceId];
      const entity = state.entities && state.entities.get ? state.entities.get(Number(sourceId) || sourceId) : null;
      const live = entity && entity.alive !== false ? entity : null;
      const resolved = live || (state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(sourceId)
        : null);
      const hull = resolved && resolved.alive !== false ? resolved : null;
      if (!hull) {
        if (rec && rec.fieldId && this._kernel) this._kernel.unregister(rec.fieldId);
        delete rt.npcFields[sourceId];
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
    }
    const ships = (state.entityIndex && state.entityIndex.aiShips)
      || (state.entityIndex && state.entityIndex.ships)
      || state.entityList
      || [];
    for (let i = 0; i < ships.length; i++) {
      const entity = ships[i];
      if (!entity || entity.type !== 'ship' || entity.id === state.playerId) continue;
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
    } else {
      this._kernel.update(fieldId, { center, dir });
    }
    rt.skimActive = true;
  },

  // ── lifecycle: expiry + destruction cleanup (brief req 8) ────────────────────────────────────

  _syncOrbit(state) {
    if (!this._orbitWorld) this._orbitWorld = attachOrbitWorld(this._kernel);
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
    if (this._kernel) this._kernel.clear();
    this._wellAccum = new WeakMap();
    this._wellBodies = new Set();
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
    const r2 = field.radius * field.radius;
    const cx = field.center.x;
    const cz = field.center.z;
    const index = state && state.entityIndex;
    const lists = index && index.__spacefaceEntityIndexV1
      ? [index.pickups, index.wrecks, index.payloads]
      : [state && state.entityList];
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
    if (fieldsList.length === 0 || dt <= 0) {
      this._flushEndedWells(state);
      return { queries: 0, affected: 0, accelSum: 0 };
    }
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
      queuePhysicsImpulse(e, { x: accel.ax * mass * dt, y: 0, z: accel.az * mass * dt });
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
    const list = state && state.entityList;
    if (!list) return false;
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
    rt.cluster = {
      fieldId: fieldId || null,
      primedId: null,
      actionTick: tick,
      sourceId: sourceId != null ? sourceId : null,
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
      actorId: rec.ownerId != null ? rec.ownerId : state.playerId,
      playerId: state.playerId,
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
    if (payload.tick == null) payload.tick = ctx.nowTick;
    const incoming = classifyClusterReceipt(eventName, payload, ctx);
    if (!incoming.length) return;
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
      actorId: state.playerId,
      playerId: state.playerId,
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
      rec.tag = f.tag;
      rec.center.x = f.center.x; rec.center.z = f.center.z;
      rec.dir.x = f.dir.x; rec.dir.z = f.dir.z;
      rec.radius = f.radius; rec.strength = f.strength; rec.falloff = f.falloff;
      rec.halfAngleRad = f.halfAngleRad; rec.halfWidth = f.halfWidth;
      rec.volume = f.volume || fieldVolumeOf(f);
      rec.palette = FIELD_PALETTE[f.kind] || FIELD_PALETTE[rec.volume] || null;
      rec.expireAt = f.expireAt;  // Infinity for the sustained cone; the HUD countdown chip reads it
      // engaged = this tick actually pulled/pushed a body (state-driven; drives the world-space
      // engagement tell — no affected body, no articulation, per bible §4).
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
    rec.kind = 'seed';
    rec.tag = 'power';
    rec.volume = fieldVolumeOf(def);
    rec.center.x = sx; rec.center.z = sz;
    rec.dir.x = 1; rec.dir.z = 0;
    rec.radius = def.radius;
    rec.strength = 0;
    rec.falloff = 1;
    rec.halfAngleRad = 0;
    rec.halfWidth = 0;
    rec.palette = FIELD_PALETTE.seed;
    rec.expireAt = Infinity;
    rec.engaged = true;
    rec.distortionRadius = 0;
    rec.distortionStrength = 0;
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
