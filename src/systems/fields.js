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

import { FIELD_DEFS, FIELD_KINDS, FIELD_MAX_ACTIVE, FIELD_END_REASONS, FIELD_PALETTE, fieldsFlag } from '../data/fields.js';
import { createFieldKernel, fieldAffectsBody, fieldRawAcceleration, sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { Masks } from '../core/entity.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { getCombatKernel } from '../combat/kernel.js';
import { KILL_ZONE_WELL_INNER } from '../combat/killCause.js';
import { ensureCombatant } from '../combat/runtime.js';
import { PINNED_STATUS_ID, UNMOORED_STATUS_ID } from '../data/combatDefs.js';

const EMITTER_TYPE = 'fieldEmitter';
const EMITTER_MATERIAL = 'projectile'; // ghost collider: projectile sweeps can hit it, ships don't broadphase against it
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
    // Runtime-only deploy cooldowns (NON-serialized). Cleared on lifecycle boundaries.
    cooldowns: { well: 0, repulsor: 0 },
    lastDenial: null,
    // Published presentation/predictor mirrors (rebuilt each tick).
    snapshot: [],   // id-sorted normalized field records — the PURE predictor seam consumer input
    active: [],     // per-field presentation records for VFX/HUD
    anchored: {},   // hull-anchored fields: fieldId -> { fieldId, sourceId, defKey, activateTick }
    telemetry: { fields: 0, queries: 0, affected: 0, appliedAccelSum: 0 },
  };
}

function ensureRuntime(state) {
  const f = state.fields;
  if (f && f.schemaVersion === 1) {
    if (!f.anchored || typeof f.anchored !== 'object') f.anchored = {};
    return f;
  }
  state.fields = defaultRuntime();
  return state.fields;
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
  profile.mass = positive(entity && entity.physicsBody && entity.physicsBody.mass, positive(entity && entity.mass, 1));
  profile.type = entity && entity.type;
  profile.team = entity && entity.team;
  profile.id = entity && entity.id;
  profile.fieldResponseMult = Number.isFinite(fieldResponse) ? Math.max(0, fieldResponse) : 1;
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
    this._combatKernel = getCombatKernel(ctx);
    // Reused scratch — zero per-tick allocation in the force loop.
    this._queryOut = [];
    this._affected = new Map();
    this._massStateFields = new Map();
    this._massStateStrengths = new Map();
    this._accel = { ax: 0, az: 0 };
    this._massStateAccel = { ax: 0, az: 0 };
    this._wellInnerPrevious = new Set();
    this._wellInnerCurrent = new Set();
    this._bodyProfile = { mass: 1, type: null, team: null, id: null, fieldResponseMult: 1, physicsMassScale: 1 };
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
        this.bus.on('ai:doctrinePhase', (payload) => this._onDoctrinePhase(payload)),
      ];
    }
  },

  newGame() {
    this._clearAll(FIELD_END_REASONS.cleared, 'new_game');
  },

  update(dt, state) {
    const rt = ensureRuntime(state);
    // Golden-safety gate (layer b): strict no-op unless enabled (OFF under node).
    if (!fieldsFlag('enabled')) return;
    if (state.mode !== 'flight') {
      // Not flying (docked / station): apply no forces, but still tick expiry + destruction so a
      // field never outlives its bounded lifetime while the player is away, and keep the cone off.
      if (rt.coneActive) this._setConeActive(state, rt, false, FIELD_END_REASONS.toggledOff);
      this._syncEmitters(state, rt, /*applyForces*/ false, dt);
      this._publish(state, rt, 0, 0, 0);
      return;
    }
    this._handleInput(state, rt);
    this._syncCone(state, rt);
    this._syncAnchoredFields(state, rt);
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
    if (existing) return existing.fieldId;
    const spinupTicks = Math.max(0, Math.floor(Number(anchor.spinupTicks ?? def.spinupTicks) || 0));
    const fieldId = String(anchor.fieldId || `field_anchor_${entity.id}`);
    const radius = positive(anchor.radius, def.radius);
    const strength = positive(anchor.strength, def.strength);
    const phaseGated = anchor.familyKey === 'flea_snare';
    rt.anchored[fieldId] = {
      fieldId,
      defKey,
      sourceId: entity.id,
      activateTick: (this.state.tick | 0) + spinupTicks,
      strength,
      radius,
      phaseGated,
      phase: phaseGated ? 'approach' : null,
      familyKey: anchor.familyKey || null,
      familyCap: positive(anchor.familyCap, Infinity),
    };
    if (phaseGated) return fieldId;
    return this._activateAnchoredField(entity, rt.anchored[fieldId], spinupTicks);
  },

  _activateAnchoredField(entity, rec, spinupTicks = 0) {
    if (!entity || !rec || !this._kernel) return null;
    if (this._kernel.has(rec.fieldId)) return rec.fieldId;
    if (this._kernel.size >= FIELD_MAX_ACTIVE) return null;
    const anchor = entity.data && entity.data.fieldAnchor || {};
    const def = FIELD_DEFS[rec.defKey];
    if (!def) return null;
    const now = nowOf(this.state);
    const record = this._kernel.register({
      id: rec.fieldId,
      kind: def.kind,
      center: { x: entity.pos.x, z: entity.pos.z },
      radius: rec.radius,
      strength: spinupTicks > 0 ? 0 : rec.strength,
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
    rec.activateTick = (this.state.tick | 0) + spinupTicks;
    this.bus.emit('fields:anchorRegistered', {
      fieldId: rec.fieldId,
      sourceId: entity.id,
      kind: rec.defKey,
      radius: rec.radius,
      activateTick: rec.activateTick,
    });
    this._emitDeployCue('well', entity.pos.x, entity.pos.z, rec.radius);
    return record.id;
  },

  _onDoctrinePhase(payload) {
    if (!payload || payload.entityId == null) return;
    const rt = ensureRuntime(this.state);
    for (const rec of Object.values(rt.anchored)) {
      if (rec && rec.sourceId === payload.entityId && rec.phaseGated) rec.phase = String(payload.phase || 'approach');
    }
  },

  _syncAnchoredFields(state, rt) {
    const ids = Object.keys(rt.anchored || {}).sort((a, b) => {
      const left = rt.anchored[a] && rt.anchored[a].sourceId;
      const right = rt.anchored[b] && rt.anchored[b].sourceId;
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      const leftKey = String(left);
      const rightKey = String(right);
      return leftKey < rightKey ? -1 : (leftKey > rightKey ? 1 : 0);
    });
    for (const fieldId of ids) {
      const rec = rt.anchored[fieldId];
      const entity = state.entities && state.entities.get ? state.entities.get(rec.sourceId) : null;
      if (!entity || entity.alive === false) {
        if (this._kernel.has(fieldId)) this._kernel.unregister(fieldId);
        delete rt.anchored[fieldId];
        this.bus.emit('fields:ended', { fieldId, kind: rec.defKey, reason: FIELD_END_REASONS.destroyed });
        continue;
      }
      if (rec.phaseGated) {
        const passive = entity.data && entity.data.ai && entity.data.ai.passive === true;
        const shouldBeActive = !passive && rec.phase === 'anchor_hold';
        if (!shouldBeActive) {
          if (this._kernel.has(fieldId)) {
            this._kernel.unregister(fieldId);
            this.bus.emit('fields:ended', { fieldId, kind: rec.defKey, reason: FIELD_END_REASONS.toggledOff });
          }
          continue;
        }
        if (!this._kernel.has(fieldId)) {
          const familyActive = Object.values(rt.anchored).filter((other) => other && other !== rec
            && other.familyKey === rec.familyKey && this._kernel.has(other.fieldId)).length;
          if (familyActive >= rec.familyCap || !this._activateAnchoredField(entity, rec, 0)) continue;
        }
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
      falloff: def.falloff,
      durationS: def.durationS,
      sourceId: emitter.id,
      ownerId: player.id,
      team: player.team,
      createdAt: now,
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
        durationS: Infinity, sourceId: player.id, team: player.team, createdAt: now,
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

  // ── lifecycle: expiry + destruction cleanup (brief req 8) ────────────────────────────────────

  _enforceCap(state, rt) {
    const ids = Object.keys(rt.deployed);
    if (this._kernel.size < FIELD_MAX_ACTIVE) return;
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
    if (reason !== FIELD_END_REASONS.replaced && rt.cooldowns[rec.kind] != null) {
      rt.cooldowns[rec.kind] = nowOf(state) + FIELD_DEFS[rec.kind].cooldownS;
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
    if (this._kernel) this._kernel.clear();
    this._wellInnerPrevious.clear();
    this._wellInnerCurrent.clear();
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

  _profileFor(e, state) {
    return fieldBodyProfile(e, state, this._bodyProfile);
  },

  _considerMassState(field, entity) {
    if (!field || field.tag != null || field.ownerId == null) return;
    if (field.kind !== FIELD_KINDS.WELL && field.kind !== FIELD_KINDS.REPULSOR) return;
    if (!MASS_STATE_TYPES.has(entity.type) || String(entity.id) === String(field.ownerId)) return;
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
    const fieldsList = this._kernel.list();
    const now = nowOf(state);
    if (fieldsList.length === 0 || dt <= 0) {
      this._wellInnerPrevious.clear();
      this._wellInnerCurrent.clear();
      return { queries: 0, affected: 0, accelSum: 0 };
    }
    const queryRadius = this.helpers && this.helpers.queryRadius;
    const affected = this._affected;
    affected.clear();
    this._massStateFields.clear();
    this._massStateStrengths.clear();
    const wellInnerPrevious = this._wellInnerPrevious;
    const wellInnerCurrent = this._wellInnerCurrent;
    wellInnerCurrent.clear();
    let queries = 0;
    // One bounded spatial-hash query per active field (dormant = zero queries). Union the candidates
    // so a body inside two fields is force-summed once, then capped once.
    for (let i = 0; i < fieldsList.length; i++) {
      const field = fieldsList[i];
      if (typeof queryRadius === 'function') {
        queryRadius(field.center, field.radius, this._queryOut);
        queries++;
        let fieldAffected = 0;
        const maxAffected = Number.isFinite(field.maxAffected) ? field.maxAffected : Infinity;
        for (let j = 0; j < this._queryOut.length; j++) {
          const e = this._queryOut[j];
          if (this._forceableBody(e)) {
            const profile = this._profileFor(e, state);
            if (!fieldAffectsBody(field, profile)) continue;
            this._applyWellInnerCapture(state, rt, field, e, wellInnerPrevious, wellInnerCurrent);
            if (e.alive === false) continue;
            affected.set(e, true);
            this._considerMassState(field, e);
            fieldAffected++;
            if (fieldAffected >= maxAffected) break;
          }
        }
      }
    }
    this._wellInnerPrevious = wellInnerCurrent;
    this._wellInnerCurrent = wellInnerPrevious;
    const accel = this._accel;
    let affectedCount = 0, accelSum = 0;
    for (const e of affected.keys()) {
      const massStateField = this._massStateFields.get(e);
      if (massStateField) this._refreshMassState(state, e, massStateField);
      const profile = this._profileFor(e, state);
      sampleFieldAcceleration(e.pos, e.vel, fieldsList, now, profile, accel);
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
      affectedCount++;
      accelSum += Math.hypot(accel.ax, accel.az);
    }
    return { queries, affected: affectedCount, accelSum };
  },

  _applyWellInnerCapture(state, rt, field, entity, previous, current) {
    const deployed = rt.deployed && rt.deployed[field.id];
    const def = FIELD_DEFS.well;
    if (!deployed || deployed.kind !== 'well' || field.kind !== FIELD_KINDS.WELL) return;
    if (entity.type !== 'ship' && entity.type !== 'drone') return;
    if (entity.id === field.ownerId) return;
    if (field.team != null && entity.team != null && field.team === entity.team) return;
    const dx = entity.pos.x - field.center.x;
    const dz = entity.pos.z - field.center.z;
    if (Math.hypot(dx, dz) > def.innerBandRadius) return;
    const key = `${field.id}:${entity.id}`;
    current.add(key);
    if (previous.has(key)) return;
    const packet = scalarHitToDamagePacket({
      damage: def.collapseDamage,
      damageType: 'kinetic',
      pos: { x: entity.pos.x, z: entity.pos.z },
      source: { kind: 'field_well', fieldId: field.id, zone: KILL_ZONE_WELL_INNER },
    });
    this._combatKernel.routeDamage({
      attackerId: field.ownerId,
      targetId: entity.id,
      packet,
      origin: { kind: 'field_well', id: field.id, sourceId: field.sourceId },
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
      if (f.tag === 'external') continue;
      let rec = active[n];
      if (!rec) rec = active[n] = { center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } };
      n++;
      rec.id = f.id; rec.kind = f.kind;
      rec.tag = f.tag;
      rec.center.x = f.center.x; rec.center.z = f.center.z;
      rec.dir.x = f.dir.x; rec.dir.z = f.dir.z;
      rec.radius = f.radius; rec.strength = f.strength; rec.falloff = f.falloff;
      rec.halfAngleRad = f.halfAngleRad;
      rec.palette = f.tag === 'hostile' ? FIELD_PALETTE.hostileSnare : FIELD_PALETTE[f.kind];
      rec.expireAt = f.expireAt;  // Infinity for the sustained cone; the HUD countdown chip reads it
      // engaged = this tick actually pulled/pushed a body (state-driven; drives the world-space
      // engagement tell — no affected body, no articulation, per bible §4).
      rec.engaged = engaged;
    }
    active.length = n; // trim retired fields
    const tel = rt.telemetry;
    tel.fields = fieldsList.length; tel.queries = queries; tel.affected = affected; tel.appliedAccelSum = accelSum;
  },

  // ── VFX cues (presentation bus; renderer consumes — no renderer fork) ─────────────────────────

  _emitDeployCue(kind, x, z, radius) {
    const pal = FIELD_PALETTE[kind];
    this.bus.emit('presentation:vfxCue', {
      id: `field.${kind}.deploy`,
      lane: 'field',
      particles: 20,
      lights: 1,
      magnitude: 0.9,
      radius,
      position: { x, z },
      material: 'energy',
      color: kind === 'repulsor' ? pal.coreWarm : pal.core,
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
