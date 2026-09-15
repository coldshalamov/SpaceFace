// Drift-bomb bay: lay a moving trap, commit its fuze, exploit the physical consequence.
// Design and propagation acceptance: design/ORDNANCE_BOMBS_REFINEMENT.md.
// Keep the original payload IDs, damage router, hitstun law and one-shot VFX receipts.
// Bombs alone own bomb kinematics (physicsBody:false). Foreign motion goes through physics.
import { BOMB_DEFS, BOMB_DRIFT, BOMB_IDS, bombDef } from '../data/bombs.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { publishHitstunImpulse, recordImpulseProvenance, signedHitSide } from '../combat/impulseKernel.js';
import { queuePhysicsImpulse, isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { FIELD_COUPLING } from '../data/fields.js';
import {
  integrateBombDrift, sweptBombContact, compareBombEntityIds, bombSurfaceFalloff,
  bombFieldEnvelope, fillBombViscosityImpulse,
} from '../combat/bombDynamics.js';

export const BOMB_TYPE = 'bomb';
export const BOMB_SHOVE_CAP = 8;
const DAMAGE_TYPES = new Set(['ship', 'drone', 'station']);
const LOOSE_TYPES = new Set(['asteroid', 'wreck', 'pickup', 'payload']);
const EMPTY = Object.freeze([]);
const simNow = state => Number.isFinite(state?.simTime) ? state.simTime : (state?.tick || 0) / 60;
const craft = e => e?.type === 'ship' || e?.type === 'drone';
const movable = e => e?.physicsBody !== false && (craft(e) || (LOOSE_TYPES.has(e?.type) && isDynamicPhysicsBodyEntity(e)));
function massOf(e, fallback = 1) {
  const mass = Number(e?.physicsBody?.mass ?? e?.mass);
  return Number.isFinite(mass) && mass > 0 ? mass : fallback;
}
function effectiveMass(state, e) {
  const scale = Number(state.combat?.entities?.[String(e.id)]?.physicsResponse?.massScale) || 1;
  return massOf(e) * Math.max(0.25, Math.min(8, scale));
}
function liveBombList(state) {
  const index = state?.entityIndex;
  return index?.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.bombs)
    ? index.bombs : state?.entityList || EMPTY;
}
function ensureRuntime(state) {
  const rt = state.bombs ||= { selectedId: BOMB_IDS[0], cooldownUntil: 0 };
  rt.cooldowns ||= {};
  if (!BOMB_DEFS[rt.selectedId]) rt.selectedId = BOMB_IDS[0];
  return rt;
}
function blocked(state, owner) {
  return state.mode !== 'flight' || !owner?.alive || owner.flags?.docked || state.ui?.screenStack?.length > 0;
}
function considerShove(rows, id, dx, dz, mag) {
  if (rows.length < BOMB_SHOVE_CAP) { rows.push(Object.freeze({ id, dx, dz, mag })); return; }
  let weakest = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].mag < rows[weakest].mag) weakest = i;
  if (mag > rows[weakest].mag) rows[weakest] = Object.freeze({ id, dx, dz, mag });
}

export const bombs = {
  name: 'bombs',
  init(ctx) {
    this.destroy();
    Object.assign(this, { state: ctx.state, bus: ctx.bus, helpers: ctx.helpers, registry: ctx.registry });
    this._active = [];
    this._targets = [];
    this._gooCoverage = [];
    this._motion = {};
    this._viscosity = { x: 0, y: 0, z: 0 };
    this._ownerCooldowns = new Map();
    ensureRuntime(ctx.state);
    this._unsubs = [
      this.bus.on('sector:exit', () => this.releaseAll('sector_exit')),
      this.bus.on('sector:enter', () => this.releaseAll('sector_enter')),
      this.bus.on('game:new', () => this._resetRuntime('new_game')),
      this.bus.on('save:loaded', () => this._resetRuntime('save_loaded')),
    ];
  },
  destroy() {
    this.releaseAll('destroy');
    for (const off of this._unsubs || EMPTY) if (typeof off === 'function') off();
    this._unsubs = [];
    this._ownerCooldowns?.clear();
    this.state = this.bus = this.helpers = this.registry = null;
  },
  newGame() { this._resetRuntime('new_game'); },
  update(dt, state) {
    if (state.mode !== 'flight' || !(dt > 0) || !Number.isFinite(dt)) return;
    const rt = ensureRuntime(state), actions = state.input?.actions;
    const player = state.entities.get(state.playerId);
    if (actions?.cycleBomb) {
      actions.cycleBomb = false;
      if (!blocked(state, player)) {
        const index = (BOMB_IDS.indexOf(rt.selectedId) + 1) % BOMB_IDS.length;
        const def = bombDef(rt.selectedId = BOMB_IDS[index]);
        this.bus.emit('bombs:cycle', { payloadId: def.id, name: def.name, index });
        this.bus.emit('toast', { text: `Bomb bay: ${def.name}`, kind: 'info', ttl: 1.6 });
      }
    }
    this._collect(state);
    // R is the existing shared ordnance command. Read it BEFORE impulseCharges consumes it;
    // never clear another owner's edge. Both consumers are pinned by a manifest-order test.
    if (actions?.chargeDetonate && !blocked(state, player)) this.commandDetonate(player.id, state);
    this._tickBombs(dt, state);
    if (actions?.dropBomb) {
      actions.dropBomb = false;
      if (!blocked(state, player)) this.drop(player, rt.selectedId, state);
    }
  },

  // One eligibility scan and one stable order per occupied tick, NOT eight payload-specific
  // whole-world scans. The spatial hash excludes noncolliding loose bodies: using it alone
  // would silently drop valid targets. This complete scan is bounded by live world population.
  _collect(state) {
    this._active.length = 0;
    for (const e of liveBombList(state)) if (e?.alive && e.type === BOMB_TYPE && e.data) this._active.push(e);
    this._active.sort(compareBombEntityIds);
    this._targets.length = 0;
    if (!this._active.length) return;
    for (const e of state.entityList || EMPTY) {
      if (e?.alive && e.pos && (DAMAGE_TYPES.has(e.type) || movable(e))) this._targets.push(e);
    }
    this._targets.sort(compareBombEntityIds);
  },

  // Public common release path for later AI adoption. No NPC doctrine is enabled by this PR.
  // Caller must hold a live entity; it cannot smuggle an unregistered owner into attribution.
  drop(owner, payloadId, state = this.state) {
    if (!state || blocked(state, owner) || state.entities.get(owner.id) !== owner || !BOMB_DEFS[payloadId]) return null;
    const now = simNow(state), rt = ensureRuntime(state);
    let bay = owner.id === state.playerId ? rt : this._ownerCooldowns.get(owner.id);
    if (!bay) this._ownerCooldowns.set(owner.id, bay = { cooldownUntil: 0, cooldowns: {} });
    if (now < Math.max(bay.cooldownUntil || 0, bay.cooldowns[payloadId] || 0)) return null;
    let owned = 0, total = 0;
    for (const e of liveBombList(state)) {
      if (!e?.alive || e.type !== BOMB_TYPE) continue;
      total++;
      if (e.data?.ownerId === owner.id) owned++;
    }
    if (owned >= BOMB_DRIFT.maxActive || total >= BOMB_DRIFT.maxWorldActive) {
      this.bus.emit('bombs:denied', { ownerId: owner.id, reason: owned >= BOMB_DRIFT.maxActive ? 'bay_full' : 'world_full' });
      if (owner.id === state.playerId) this.bus.emit('toast', { text: 'Bomb bay full — trigger armed ordnance or let its fuze finish.', kind: 'info', ttl: 1.6 });
      return null; // no cooldown, no eviction, no free explosion
    }
    const def = bombDef(payloadId), vx = Number(owner.vel?.x) || 0, vz = Number(owner.vel?.z) || 0;
    const heading = Math.hypot(vx, vz) > 12 ? Math.atan2(vz, vx) : owner.rot || 0;
    const standoff = Math.max(0, owner.radius || 6) + BOMB_DRIFT.dropStandoffWu;
    const pos = { x: owner.pos.x - Math.cos(heading) * standoff, z: owner.pos.z - Math.sin(heading) * standoff };
    const bomb = this.helpers.spawnEntity({
      type: BOMB_TYPE, pos, vel: { x: vx, z: vz }, rot: heading,
      radius: 1.4, mass: 2, collides: false, physicsBody: false, team: owner.team, ownerId: owner.id,
      data: {
        kind: 'bomb', bombId: def.id, ownerId: owner.id, phase: 'drift', armed: false,
        armedAt: now + BOMB_DRIFT.armS, detonateAt: now + def.fuzeS,
        spawnedAt: now, fieldStartedAt: 0, fieldEndsAt: 0, nextFieldTick: 0,
        triggered: false, spinRadS: 0, sectorId: state.world?.currentSectorId || null,
      },
    });
    if (!bomb) return null;
    bomb.data.spinRadS = (Math.abs(Math.trunc(bomb.id)) % 2 ? 1 : -1) * BOMB_DRIFT.maxSpinRadS;
    bay.cooldownUntil = now + BOMB_DRIFT.releaseIntervalS;
    bay.cooldowns[payloadId] = now + def.cooldownS;
    this.bus.emit('bombs:dropped', { bombId: bomb.id, payloadId, ownerId: owner.id, pos, vel: { x: vx, z: vz }, radius: def.radius });
    this.bus.emit('audio:cue', { id: 'massline.bombDrop', position: pos, gain: 0.5 });
    return bomb;
  },

  commandDetonate(ownerId, state = this.state) {
    if (!state || blocked(state, state.entities.get(ownerId))) return 0;
    let count = 0;
    for (const e of liveBombList(state)) {
      if (e?.alive && e.type === BOMB_TYPE && e.data?.ownerId === ownerId && e.data.phase === 'drift'
        && simNow(state) >= e.data.armedAt) {
        this._prime(e, 'command', simNow(state)); count++;
      }
    }
    if (count) this.bus.emit('bombs:commanded', { ownerId, count, tick: state.tick });
    return count;
  },

  _prime(bomb, trigger, now) {
    const d = bomb.data;
    if (d.phase !== 'drift') return false;
    d.phase = 'warning';
    d.trigger = trigger;
    d.warningAt = now;
    d.resolveAt = Math.min(d.detonateAt, now + BOMB_DRIFT.warningS);
    this.bus.emit('bombs:primed', {
      bombId: bomb.id, payloadId: d.bombId, ownerId: d.ownerId, trigger,
      pos: { x: bomb.pos.x, z: bomb.pos.z }, resolveAt: d.resolveAt, radius: bombDef(d.bombId).radius,
    });
    return true;
  },

  _tickBombs(dt, state) {
    const now = simNow(state), start = now - dt;
    for (const bomb of this._active) {
      if (!bomb.alive) continue;
      const d = bomb.data;
      const x0 = bomb.pos.x, z0 = bomb.pos.z;
      // Bombs are outside core's physics-movable index, so their owner snapshots interpolation.
      if (bomb.prevPos) { bomb.prevPos.x = x0; bomb.prevPos.z = z0; }
      bomb.prevRot = bomb.rot;
      integrateBombDrift(this._motion, x0, z0, bomb.vel.x, bomb.vel.z, dt, d.phase === 'field'
        ? bombDef(d.bombId).field?.driftDragPerS ?? BOMB_DRIFT.dragPerS : BOMB_DRIFT.dragPerS);
      // Explicit kinematic exception: these are bomb-owned entities, never foreign bodies.
      bomb.pos.x = this._motion.x; bomb.pos.z = this._motion.z;
      bomb.vel.x = this._motion.vx; bomb.vel.z = this._motion.vz;
      bomb.rot += (d.spinRadS || 0) * dt;
      if (d.phase === 'field') {
        if (now >= d.fieldEndsAt) this._endField(bomb, state, 'expired');
        continue;
      }
      if (!d.armed && now >= d.armedAt) {
        d.armed = true;
        this.bus.emit('bombs:armed', { bombId: bomb.id, payloadId: d.bombId, pos: { x: bomb.pos.x, z: bomb.pos.z } });
      }
      if (d.phase === 'drift') {
        if (d.armed && this._findTriggerVictim(state, bomb, d, x0, z0, dt, Math.max(0, (d.armedAt - start) / dt))) {
          this._prime(bomb, 'proximity', now);
        } else if (now >= d.detonateAt - BOMB_DRIFT.warningS) this._prime(bomb, 'fuze', now);
      }
      if (d.phase === 'warning' && now + 1e-9 >= d.resolveAt) this._detonate(bomb, d, state, d.trigger);
    }
    // Resolve ALL lifecycle transitions before fields sample one another. New fields get no
    // retroactive force for time before opening; expired ones contribute no final ghost impulse.
    // Count overlaps ONCE: O(fields * targets), never an O(fields² * targets) inner brake scan.
    this._gooCoverage.length = this._targets.length;
    this._gooCoverage.fill(0);
    for (const bomb of this._active) {
      if (!bomb.alive || bomb.data.phase !== 'field' || bomb.data.fieldStartedAt >= now) continue;
      const def = bombDef(bomb.data.bombId);
      if (def.field?.kind !== 'goo') continue;
      for (let i = 0; i < this._targets.length; i++) {
        const ent = this._targets[i];
        if (ent.alive && movable(ent) && bombSurfaceFalloff(Math.hypot(ent.pos.x - bomb.pos.x, ent.pos.z - bomb.pos.z), ent.radius, def.radius) > 0) this._gooCoverage[i]++;
      }
    }
    for (const bomb of this._active) {
      if (bomb.alive && bomb.data.phase === 'field') this._tickField(bomb, state, Math.min(dt, now - bomb.data.fieldStartedAt));
    }
  },

  _findTriggerVictim(state, bomb, d, x0 = bomb.pos.x, z0 = bomb.pos.z, dt = 0, minT = 0) {
    let best = null, bestT = Infinity;
    const def = bombDef(d.bombId);
    for (const e of this._targets) {
      if (!e.alive || !craft(e) || e.id === d.ownerId || (bomb.team != null && e.team != null && e.team === bomb.team)) continue;
      const t = sweptBombContact(e.pos.x - x0, e.pos.z - z0,
        e.pos.x + (e.vel?.x || 0) * dt - bomb.pos.x,
        e.pos.z + (e.vel?.z || 0) * dt - bomb.pos.z,
        def.triggerRadius + Math.max(0, e.radius || 0), minT);
      if (t < bestT) { best = e; bestT = t; } // stable sorted-ID tie break
    }
    return best;
  },

  _detonate(bomb, d, state, trigger) {
    if (!bomb.alive || d.triggered || (d.phase !== 'drift' && d.phase !== 'warning')) return false;
    const def = bombDef(d.bombId), pos = { x: bomb.pos.x, z: bomb.pos.z };
    d.triggered = true; d.detonatedTick = state.tick;
    const result = def.field?.kind === 'singularity' ? null
      : this._blastVictims(state, { pos, def, ownerId: d.ownerId, originId: bomb.id, trigger });
    if (def.field) {
      d.phase = 'field'; d.fieldStartedAt = simNow(state); d.fieldEndsAt = d.fieldStartedAt + def.field.durationS;
      d.nextFieldTick = state.tick + def.field.tickEveryTicks;
    } else { d.phase = 'spent'; bomb.alive = false; }
    this._emitDetonated(bomb, d, def, state, pos, trigger, result);
    return true;
  },
  _emitDetonated(bomb, d, def, state, pos, trigger, result) {
    this.bus.emit('bombs:detonated', {
      schemaVersion: 2, bombId: bomb.id, payloadId: def.id, ownerId: d.ownerId,
      pos, vel: { x: bomb.vel.x, z: bomb.vel.z }, radius: def.radius, trigger,
      hits: result?.hits || EMPTY, shoves: result?.shoves || EMPTY,
    });
    this.bus.emit('audio:cue', { id: def.audioCue, position: pos, gain: 0.65 });
  },

  _blastVictims(state, { pos, def, ownerId, originId, trigger, impulseOverride = null, damageOverride = null }) {
    const impulse = impulseOverride ?? def.impulse, damage = damageOverride ?? def.damage;
    const hits = [], shoves = [], attackerMass = massOf(state.entities.get(ownerId));
    for (const ent of this._targets) {
      if (!ent.alive || ent.id === originId) continue;
      const dx = ent.pos.x - pos.x, dz = ent.pos.z - pos.z, dist = Math.hypot(dx, dz);
      const falloff = bombSurfaceFalloff(dist, ent.radius, def.radius);
      if (!(falloff > 0)) continue;
      let dirX = dist > 1e-8 ? dx / dist : 0, dirZ = dist > 1e-8 ? dz / dist : 1;
      // Havoc is a cross-current, not a recoloured radial concussion. Preserve total impulse.
      if (def.tangentRatio) {
        const q = def.tangentRatio, norm = Math.hypot(1, q), x = dirX;
        dirX = (dirX - dirZ * q) / norm; dirZ = (dirZ + x * q) / norm;
      }
      const magnitude = impulse * falloff;
      if (magnitude > 0 && movable(ent) && this._applyImpulse(ent, dirX * magnitude, dirZ * magnitude, state, 'bomb_blast')) {
        considerShove(shoves, ent.id, dirX, dirZ, magnitude);
        this._publishHitstun(state, ent, { dirX, dirZ, magnitude, ownerId, attackerMass, payloadId: def.id, trigger });
      }
      if (DAMAGE_TYPES.has(ent.type) && (damage > 0 || def.statuses?.length)) {
        const packet = scalarHitToDamagePacket({
          damage: damage * falloff, damageType: def.damageType, pos,
          penetration: def.penetration || 0, heat: def.heat || 0, statuses: def.statuses || EMPTY,
          subsystemShare: def.subsystemShare ?? null, shieldBypass: def.shieldBypass || 0,
          source: { kind: 'bomb', payloadId: def.id, bombId: originId },
        });
        packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
        const result = this._routeDamage({ attackerId: ownerId, targetId: ent.id, packet, origin: { kind: 'bomb', id: originId, payloadId: def.id } });
        // hits are routing receipts, not a claim of hull loss (shields/armour may absorb it).
        if (result !== false && result?.ok !== false) hits.push(ent.id);
      }
    }
    shoves.sort((a, b) => b.mag - a.mag || compareBombEntityIds(a, b));
    return { hits: Object.freeze(hits), shoves: Object.freeze(shoves) };
  },
  _publishHitstun(state, victim, input) {
    if (!victim || victim.alive === false) return;
    if (victim.type !== 'ship' && victim.type !== 'drone') return;
    if (victim.id === state.playerId) return; // B13: the player is never stunned
    const victimMass = massOf(victim, 1);
    const deltaV = input.magnitude / victimMass;
    if (!(deltaV > 0)) return;
    const hitSide = signedHitSide(victim, { x: input.dirX, z: input.dirZ }, {
      pos: {
        x: Number(victim.pos && victim.pos.x) || 0,
        z: (Number(victim.pos && victim.pos.z) || 0) + Math.max(4, (victim.radius || 8) * 0.75),
      },
    }, victim.id);
    const provenance = Object.freeze({
      schemaVersion: 1,
      kind: 'bomb',
      source: input.trigger || 'fuze',
      tag: 'bomb_blast',
      payloadId: input.payloadId == null ? null : String(input.payloadId),
    });
    recordImpulseProvenance(victim, {
      actorId: input.ownerId == null ? null : input.ownerId,
      weaponId: input.payloadId == null ? null : input.payloadId,
      tag: 'bomb_blast',
      appliedTick: state.tick | 0,
      magnitude: input.magnitude,
    });
    publishHitstunImpulse(this.bus, {
      source: 'bomb',
      victimId: victim.id,
      attackerId: input.ownerId == null ? null : input.ownerId,
      attackerMass: Math.max(0.1, Number(input.attackerMass) || 1),
      victimMass,
      deltaV,
      dirX: input.dirX,
      dirZ: input.dirZ,
      hitSide,
      provenance,
      tick: state.tick,
    });
  },

  _tickField(bomb, state, dt) {
    if (!(dt > 0)) return;
    const d = bomb.data, def = bombDef(d.bombId), f = def.field;
    if (!f) return;
    const envelope = bombFieldEnvelope(simNow(state), d.fieldStartedAt, f.durationS, f.endStrength ?? 1);
    const applyStatusTick = state.tick >= d.nextFieldTick;
    // No historical damage burst after a long step: update is a fixed 60 Hz contract. Advance
    // the cadence arithmetically, so an irregular fixture cannot permanently phase-shift it.
    if (applyStatusTick) d.nextFieldTick += (Math.floor((state.tick - d.nextFieldTick) / f.tickEveryTicks) + 1) * f.tickEveryTicks;
    for (let targetIndex = 0; targetIndex < this._targets.length; targetIndex++) {
      const ent = this._targets[targetIndex];
      if (!ent.alive || ent.id === bomb.id) continue;
      const dx = bomb.pos.x - ent.pos.x, dz = bomb.pos.z - ent.pos.z, dist = Math.hypot(dx, dz);
      const falloff = bombSurfaceFalloff(dist, ent.radius, def.radius);
      if (!(falloff > 0)) continue;
      if (f.kind === 'singularity' && movable(ent) && dist > 1e-8) {
        const mass = massOf(ent), couple = Math.max(FIELD_COUPLING.minShipCouple, FIELD_COUPLING.refMass / Math.max(mass, FIELD_COUPLING.refMass));
        const j = f.strength * envelope * falloff * couple * mass * dt;
        queuePhysicsImpulse(ent, { x: dx / dist * j, z: dz / dist * j });
      } else if (f.kind === 'goo' && movable(ent)) {
        const coverage = this._gooCoverage[targetIndex] || 1;
        if (fillBombViscosityImpulse(this._viscosity, ent.vel, bomb.vel, effectiveMass(state, ent), dt, f.dragPerS * falloff, 1 / Math.max(1, coverage))) {
          queuePhysicsImpulse(ent, this._viscosity);
        }
      }
      if (!applyStatusTick || !craft(ent)) continue;
      const crush = f.kind === 'singularity' && Math.max(0, dist - (ent.radius || 0)) <= f.crushInnerRadius;
      if (f.kind !== 'goo' && !crush) continue;
      const packet = scalarHitToDamagePacket({
        damage: crush ? f.crushDamage : 0, damageType: crush ? 'plasma' : 'kinetic', pos: bomb.pos,
        statuses: crush ? EMPTY : [{ id: 'status_goo', stacks: f.applyStacks }],
        source: { kind: 'bomb', payloadId: def.id, bombId: bomb.id, phase: crush ? 'crush' : 'tar' },
      });
      packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
      this._routeDamage({ attackerId: d.ownerId, targetId: ent.id, packet, origin: { kind: 'bomb', id: bomb.id, payloadId: def.id } });
    }
  },

  _endField(bomb, state, reason) {
    if (!bomb.alive || bomb.data.phase !== 'field') return;
    const d = bomb.data, def = bombDef(d.bombId), pos = { x: bomb.pos.x, z: bomb.pos.z };
    bomb.alive = false; d.phase = 'spent';
    if (reason === 'expired' && def.field?.kind === 'singularity') {
      const result = this._blastVictims(state, { pos, def, ownerId: d.ownerId, originId: bomb.id, trigger: 'collapse',
        impulseOverride: def.field.collapseImpulse, damageOverride: def.field.collapseDamage });
      this._emitDetonated(bomb, d, def, state, pos, 'collapse', result);
    }
    this.bus?.emit('bombs:fieldEnded', {
      schemaVersion: 2, bombId: bomb.id, payloadId: def.id, ownerId: d.ownerId, pos,
      trigger: reason === 'expired' && def.field?.kind === 'singularity' ? 'collapse' : reason,
    });
  },
  _applyImpulse(ent, x, z, state, reason) {
    const physics = this.helpers?.combatPhysics;
    return !!physics?.applyImpulse && physics.applyImpulse({ entityId: ent.id, impulse: { x, z }, point: null, reason, tick: state.tick }) !== false;
  },
  _routeDamage(request) {
    if (typeof this.helpers?.routeCombatDamage === 'function') return this.helpers.routeCombatDamage(request);
    const combat = this.registry?.get?.('combat');
    if (combat?.ensureKernel) return combat.ensureKernel().routeDamage(request);
    this.bus.emit('combat:routeDamage', request);
    return null;
  },
  releaseAll(reason = 'release') {
    if (!this.state) return 0;
    let count = 0;
    for (const e of liveBombList(this.state)) {
      if (!e?.alive || e.type !== BOMB_TYPE) continue;
      if (e.data?.phase === 'field') this._endField(e, this.state, reason);
      e.alive = false;
      if (e.data) e.data.phase = 'spent';
      count++;
    }
    this._ownerCooldowns?.clear();
    if (count) this.bus?.emit('bombs:released', { count, reason });
    return count;
  },
  _resetRuntime(reason) {
    this.releaseAll(reason);
    if (this.state) Object.assign(ensureRuntime(this.state), { selectedId: BOMB_IDS[0], cooldownUntil: 0, cooldowns: {} });
  },
};

/** Allocating convenience for tooling/HUD, never used inside the sim hot path. */
export function listBombs(state) {
  return [...liveBombList(state)].filter(e => e?.alive && e.type === BOMB_TYPE);
}
