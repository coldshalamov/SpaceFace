// Drift-bomb ordnance system — the "bomb bay" combat verb (design/ORDNANCE_BOMBS_SPEC.md).
//
// RELEASED ordnance, not thrown ordnance: a bomb leaves the bay at the ship's CURRENT velocity
// (full momentum inheritance) and coasts under BOMB_DRIFT.dragPerS — very low drag, so it keeps
// travelling roughly with the ship, falls behind only as the ship keeps thrusting, and keeps
// going wherever it was going when the pilot veers off. The fuze is proximity (hostiles only)
// or time; the payload is one of eight verbs in src/data/bombs.js.
//
// Input contract (read-only, consumed by write-back like every edge verb):
//   state.input.actions.dropBomb  (Digit9 default) — release the selected bomb
//   state.input.actions.cycleBomb (Comma default)  — cycle the bay's selected payload
//
// Ownership / single-writer laws this file obeys (ARCHITECTURE §3, root AGENTS.md §6):
//   • Damage: ONLY through the one damage router (helpers.routeCombatDamage → combat kernel
//     routeDamage). No hull writes, no shield writes. Statuses ride damage packets.
//   • Impulses: ONLY through the physics authority — helpers.combatPhysics.applyImpulse for
//     blasts (the impulseCharges/weapons port) and queuePhysicsImpulse for continuous pull
//     (the fields port: additive a·mass·dt per tick, consumed by the same tick's solve).
//     Never a direct entity.vel write.
//   • Hitstun: blast shoves are published to the ONE hitstun law (publishHitstunImpulse) so a
//     bomb-thrown hull loses its helm exactly like a gun-shoved one. Bombs do NOT prime chains
//     (that state belongs to impulseCharges alone).
//   • Timers: state.simTime / state.tick only. No Math.random, no wall clock. Tumble direction
//     is a fixed function of entity id.
//
// Golden safety (the impulseCharges precedent, not the fields flag precedent): the system is a
// strict no-op until the player presses the verb — nothing auto-spawns a bomb, no NPC doctrine
// drops one, and per-tick work is zero with an empty bucket. It is absent from the 47a curated
// sim list, so the deterministic golden never executes a bomb.
//
// Save policy: transient. Bomb entities never serialize (only the player + flags.persistent
// entities do — saveSystem._serializeEntities), and state.bombs (selected payload + cooldown)
// is runtime-only: a save/reload legitimately clears an in-flight cooldown, same policy as the
// fields cooldowns. Selection resets to the first payload on load; persisting it is refinement
// work in the spec.

import { BOMB_DEFS, BOMB_DRIFT, BOMB_IDS, bombDef } from '../data/bombs.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  publishHitstunImpulse,
  recordImpulseProvenance,
  signedHitSide,
} from '../combat/impulseKernel.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { FIELD_COUPLING } from '../data/fields.js';

export const BOMB_TYPE = 'bomb';
// Bounded causal blast payload for presentation. VFX may only illustrate real shove directions
// (the impulse-charge law); this caps the list it may draw from.
export const BOMB_SHOVE_CAP = 8;

const BLAST_DAMAGE_TYPES = new Set(['ship', 'drone', 'station']);
const TRIGGER_TYPES = new Set(['ship', 'drone']);

/** Sim clock, never wall time (root AGENTS.md §2/§6). */
function simNow(state) {
  if (!state) return 0;
  return Number.isFinite(state.simTime) ? state.simTime : (state.tick || 0) / 60;
}

/** Solver mass, authored body first — the same read the hitstun law uses. */
function massOf(entity, fallback = 1) {
  const body = entity && entity.physicsBody;
  const m = body && Number(body.mass) > 0 ? Number(body.mass) : Number(entity && entity.mass);
  return Number.isFinite(m) && m > 0 ? m : fallback;
}

function linearFalloff(dist, radius) {
  if (!(radius > 0)) return 0;
  return Math.max(0, 1 - dist / radius);
}

function liveBombList(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.bombs)) return index.bombs;
  return (state && state.entityList) || [];
}

function shipLikeList(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return (state && state.entityList) || [];
}

function considerShove(shoves, id, dirX, dirZ, mag) {
  const shove = { id, dx: dirX, dz: dirZ, mag };
  if (shoves.length < BOMB_SHOVE_CAP) {
    shoves.push(shove);
    return;
  }
  let weakest = 0;
  for (let i = 1; i < shoves.length; i++) {
    if (shoves[i].mag < shoves[weakest].mag) weakest = i;
  }
  if (mag > shoves[weakest].mag) shoves[weakest] = shove;
}

function freezeShoves(shoves) {
  const out = new Array(shoves.length);
  for (let i = 0; i < shoves.length; i++) {
    const row = shoves[i];
    out[i] = Object.freeze({ id: row.id, dx: row.dx, dz: row.dz, mag: row.mag });
  }
  return Object.freeze(out);
}

/** Runtime bay state (selected payload + cooldown). Runtime-only; never serialized. */
function ensureRuntime(state) {
  let rt = state.bombs;
  if (!rt || typeof rt !== 'object') {
    rt = state.bombs = { selectedId: BOMB_IDS[0], cooldownUntil: 0 };
  }
  if (!BOMB_DEFS[rt.selectedId]) rt.selectedId = BOMB_IDS[0];
  return rt;
}

export const bombs = {
  name: 'bombs',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._scanScratch = [];
    this._shoveScratch = [];
    ensureRuntime(ctx.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs = [
        this.bus.on('sector:exit', () => this.releaseAll('sector_exit')),
        this.bus.on('sector:enter', () => this.releaseAll('sector_enter')),
        this.bus.on('game:new', () => this._resetRuntime('new_game')),
        this.bus.on('save:loaded', () => this._resetRuntime('save_loaded')),
      ];
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  newGame() {
    this._resetRuntime('new_game');
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const rt = ensureRuntime(state);

    this._handleCycle(rt, state);
    this._tickBombs(dt, state);

    const player = state.entities.get(state.playerId);
    if (!player || !player.alive) return;
    this._handleDrop(player, rt, state);
  },

  // ── verbs ─────────────────────────────────────────────────────────────────────────────────

  _handleCycle(rt, state) {
    const actions = state.input && state.input.actions;
    if (!actions?.cycleBomb) return;
    actions.cycleBomb = false;
    if (state.ui && state.ui.screenStack && state.ui.screenStack.length > 0) return;

    const index = BOMB_IDS.indexOf(rt.selectedId);
    const next = BOMB_IDS[(index + 1) % BOMB_IDS.length];
    rt.selectedId = next;
    const def = BOMB_DEFS[next];
    this.bus.emit('bombs:cycle', { payloadId: next, name: def.name, index: (index + 1) % BOMB_IDS.length });
    this.bus.emit('toast', { text: `Bomb bay: ${def.name}`, kind: 'info', ttl: 1.6 });
  },

  _handleDrop(player, rt, state) {
    const actions = state.input && state.input.actions;
    if (!actions?.dropBomb) return;
    actions.dropBomb = false;

    const now = simNow(state);
    if (now < (rt.cooldownUntil || 0)) return;
    if (player.flags && player.flags.docked) return;
    if (state.ui && state.ui.screenStack && state.ui.screenStack.length > 0) return;

    const def = bombDef(rt.selectedId);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    // Release along the flight path when genuinely moving, else off the nose: a bomb dropped on
    // a turn leaves along the path the ship was actually flying.
    const heading = speed > 12
      ? Math.atan2(player.vel.z, player.vel.x)
      : (player.rot || 0);
    const cf = Math.cos(heading);
    const sf = Math.sin(heading);
    const standoff = (player.radius || 6) + BOMB_DRIFT.dropStandoffWu;

    // Bay cap: the OLDEST live bomb is evicted first (the impulse-charge rack law).
    const active = [];
    for (const e of liveBombList(state)) {
      if (e && e.alive && e.type === BOMB_TYPE && e.data && e.data.ownerId === player.id) active.push(e);
    }
    active.sort((a, b) => (a.data.spawnedAt || 0) - (b.data.spawnedAt || 0));
    while (active.length >= BOMB_DRIFT.maxActive) {
      const oldest = active.shift();
      if (oldest) oldest.alive = false;
    }

    const px = player.pos.x - cf * standoff;
    const pz = player.pos.z - sf * standoff;
    const bomb = this.helpers.spawnEntity({
      type: BOMB_TYPE,
      pos: { x: px, z: pz },
      // FULL momentum inheritance — the release law. No throw speed is added; drag does the
      // falling-behind, thrust does the walking-away.
      vel: { x: player.vel.x, z: player.vel.z },
      rot: heading,
      radius: 1.4,
      mass: 2,
      collides: false,
      team: player.team,
      ownerId: player.id,
      data: {
        kind: 'bomb',
        bombId: def.id,
        ownerId: player.id,
        phase: 'drift',
        armed: false,
        armedAt: now + BOMB_DRIFT.armS,
        detonateAt: now + def.fuzeS,
        fieldEndsAt: 0,
        nextFieldTick: 0,
        detonatedTick: 0,
        triggered: false,
        spawnedAt: now,
        // Fixed tumble sign from the entity id: two bombs of one salvo counter-rotate, no rng.
        spinRadS: ((Math.abs(Math.trunc(player.id)) + 1) % 2 === 0 ? 1 : -1) * BOMB_DRIFT.maxSpinRadS,
        sectorId: state.world && state.world.currentSectorId || null,
      },
    });
    if (!bomb) return;

    rt.cooldownUntil = now + def.cooldownS;
    this.bus.emit('bombs:dropped', {
      bombId: bomb.id,
      payloadId: def.id,
      ownerId: player.id,
      pos: { x: px, z: pz },
      vel: { x: player.vel.x, z: player.vel.z },
      radius: def.radius,
    });
    this.bus.emit('audio:cue', { id: 'massline.bombDrop', position: { x: px, z: pz }, gain: 0.5 });
  },

  // ── drift / fuze / fields ────────────────────────────────────────────────────────────────

  _tickBombs(dt, state) {
    const list = liveBombList(state);
    if (!list.length) return;
    const now = simNow(state);
    for (const bomb of list) {
      if (!bomb || !bomb.alive || bomb.type !== BOMB_TYPE) continue;
      const d = bomb.data;
      if (!d) continue;

      // The drift law: exponential decay + plain integration. The bomb owns its own kinematics
      // (collides:false, no physics body) exactly like the impulse-charge coast phase.
      const drag = Math.exp(-BOMB_DRIFT.dragPerS * dt);
      bomb.vel.x *= drag;
      bomb.vel.z *= drag;
      bomb.pos.x += bomb.vel.x * dt;
      bomb.pos.z += bomb.vel.z * dt;
      bomb.rot += d.spinRadS * dt;

      if (d.phase === 'field') {
        this._tickField(bomb, d, state, now);
        continue;
      }

      if (!d.armed) {
        if (now >= (d.armedAt || 0)) {
          d.armed = true;
          this.bus.emit('bombs:armed', {
            bombId: bomb.id, payloadId: d.bombId, pos: { x: bomb.pos.x, z: bomb.pos.z },
          });
        }
      } else {
        const intruder = this._findTriggerVictim(state, bomb, d);
        if (intruder) {
          this._detonate(bomb, d, state, 'proximity');
          continue;
        }
      }
      if (now >= (d.detonateAt || Infinity)) {
        this._detonate(bomb, d, state, 'fuze');
      }
    }
  },

  /** Hostiles only: same-team hulls (and the owner, whatever their team) never trip the fuze. */
  _findTriggerVictim(state, bomb, d) {
    const def = bombDef(d.bombId);
    const r = def.triggerRadius;
    const bx = bomb.pos.x;
    const bz = bomb.pos.z;
    let best = null;
    let bestDistance = Infinity;
    const source = shipLikeList(state);
    for (let i = 0; i < source.length; i++) {
      const e = source[i];
      if (!e || !e.alive || e.id === bomb.id) continue;
      if (!TRIGGER_TYPES.has(e.type)) continue;
      if (e.id === d.ownerId) continue;
      if (bomb.team != null && e.team != null && e.team === bomb.team) continue;
      // Math.hypot keeps finite ordering at extreme coordinates (the mines note).
      const distance = Math.hypot(e.pos.x - bx, e.pos.z - bz) - (e.radius || 0);
      if (distance > r) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = e;
      }
    }
    return best;
  },

  _detonate(bomb, d, state, trigger) {
    const def = bombDef(d.bombId);
    const pos = { x: bomb.pos.x, z: bomb.pos.z };
    d.triggered = true;
    d.detonatedTick = state.tick | 0;

    // Field payloads (singularity/goo) detonate INTO their volume: the initial burst resolves
    // now, the volume persists through its field phase, the entity stays alive until it ends.
    if (def.field) {
      this._beginField(bomb, d, def, state, pos, trigger);
      return;
    }

    const result = this._blastVictims(state, {
      pos,
      def,
      ownerId: d.ownerId,
      originId: bomb.id,
      trigger,
    });
    bomb.alive = false;
    this._emitDetonated(bomb, d, def, state, pos, trigger, result);
  },

  _emitDetonated(bomb, d, def, state, pos, trigger, result) {
    this.bus.emit('bombs:detonated', {
      schemaVersion: 1,
      bombId: bomb.id,
      payloadId: def.id,
      ownerId: d.ownerId,
      pos,
      radius: def.radius,
      trigger,
      hits: result ? result.hits : [],
      shoves: result ? result.shoves : Object.freeze([]),
    });
    this.bus.emit('audio:cue', { id: def.audioCue, position: pos, gain: 0.65 });
  },

  // ── the one blast body ────────────────────────────────────────────────────────────────────
  //
  // Every instant payload (and the singularity's collapse) resolves through this single loop so
  // a fuze pop and a proximity pop are the same physics — never a second blast implementation
  // with its own falloff. Friendly-fire on (the ordnance law): the blast may hit the dropper
  // and allies; only the FUZE scan is hostile-only.
  _blastVictims(state, { pos, def, ownerId, originId, trigger, impulseOverride = null, damageOverride = null }) {
    const radius = Math.max(0, Number(def.radius) || 0);
    const impulse = impulseOverride != null ? Math.max(0, impulseOverride) : Math.max(0, Number(def.impulse) || 0);
    const damage = damageOverride != null ? Math.max(0, damageOverride) : Math.max(0, Number(def.damage) || 0);
    const player = state.entities.get(state.playerId);
    const attackerMass = massOf(ownerId != null ? state.entities.get(ownerId) : null, massOf(player, 1));
    const hits = [];
    const shoves = this._shoveScratch;
    shoves.length = 0;

    const source = shipLikeList(state);
    for (let i = 0; i < source.length; i++) {
      const ent = source[i];
      if (!ent || !ent.alive) continue;
      if (ent.id === originId) continue;
      const dx = ent.pos.x - pos.x;
      const dz = ent.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius) continue;
      const falloff = linearFalloff(dist, radius);
      if (falloff <= 0) continue;

      let dirX = 0, dirZ = 1;
      if (dist > 1e-4) { dirX = dx / dist; dirZ = dz / dist; }
      const magnitude = impulse * falloff;

      if (magnitude > 0 && (ent.type === 'ship' || ent.type === 'drone')) {
        this._applyImpulse(ent, dirX * magnitude, dirZ * magnitude, state, 'bomb_blast');
        considerShove(shoves, ent.id, dirX, dirZ, magnitude);
        this._publishHitstun(state, ent, {
          dirX, dirZ, magnitude, ownerId, attackerMass, payloadId: def.id, trigger,
        });
      }

      if (BLAST_DAMAGE_TYPES.has(ent.type) && (damage > 0 || (def.statuses && def.statuses.length))) {
        const packet = scalarHitToDamagePacket({
          damage: damage * falloff,
          damageType: def.damageType,
          pos,
          penetration: def.penetration || 0,
          heat: def.heat || 0,
          statuses: def.statuses || [],
          subsystemShare: def.subsystemShare == null ? null : def.subsystemShare,
          shieldBypass: def.shieldBypass || 0,
          source: { kind: 'bomb', payloadId: def.id, bombId: originId },
        });
        packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
        this._routeDamage({
          attackerId: ownerId,
          targetId: ent.id,
          packet,
          origin: { kind: 'bomb', id: originId, payloadId: def.id },
        });
        hits.push(ent.id);
      }
    }

    const frozen = freezeShoves(shoves);
    shoves.length = 0;
    return { hits, shoves: frozen };
  },

  /**
   * The blast's fling, published to the ONE hitstun law — same shape as the impulse-charge
   * publish so a bomb-thrown hull is taken by the same helms rule. Bombs do NOT prime chains:
   * primed state has one writer (impulseCharges) and a bomb is not a plate.
   */
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

  // ── persistent field payloads ─────────────────────────────────────────────────────────────

  _beginField(bomb, d, def, state, pos, trigger) {
    const field = def.field;
    if (field.kind === 'goo') {
      // The burst: the splat stings and sticks; the volume then re-applies the tar. The entity
      // STAYS ALIVE through the field phase — the volume is the bomb.
      const result = this._blastVictims(state, { pos, def, ownerId: d.ownerId, originId: bomb.id, trigger });
      d.phase = 'field';
      d.fieldEndsAt = simNow(state) + field.durationS;
      d.nextFieldTick = (state.tick | 0) + field.tickEveryTicks;
      this._emitDetonated(bomb, d, def, state, pos, trigger, result);
      return;
    }

    // Singularity: no blast on arrival — the pull IS the payload. Volume starts now; the entity
    // keeps drifting (the moving source is the neutron slug's whole identity).
    d.phase = 'field';
    d.fieldEndsAt = simNow(state) + field.durationS;
    d.nextFieldTick = (state.tick | 0) + field.tickEveryTicks;
    this._emitDetonated(bomb, d, def, state, pos, trigger, null);
  },

  _tickField(bomb, d, state, now) {
    const def = bombDef(d.bombId);
    const field = def.field;
    if (!field) { bomb.alive = false; return; }
    const pos = { x: bomb.pos.x, z: bomb.pos.z };
    const tick = state.tick | 0;

    if (field.kind === 'singularity') {
      this._tickSingularityPull(bomb, d, def, field, state, pos);
      if (tick >= (d.nextFieldTick || 0)) {
        d.nextFieldTick = tick + field.tickEveryTicks;
        this._tickSingularityCrush(bomb, d, def, field, state, pos);
      }
    } else if (field.kind === 'goo') {
      if (tick >= (d.nextFieldTick || 0)) {
        d.nextFieldTick = tick + field.tickEveryTicks;
        this._tickGooReapply(bomb, d, def, field, state, pos);
      }
    }

    if (now >= (d.fieldEndsAt || 0)) {
      this._endField(bomb, d, def, field, state, pos);
    }
  },

  /**
   * Continuous pull through the fields port: additive a·mass·dt per tick, mass-coupled with the
   * SAME coupling curve as the field kernel (heavy hulls shrug; refMass 12 / floor 0.05), so a
   * neutron slug never out-couples a Well and the feel contract's shrug law stays one curve.
   * Friendly pull ON — fly into your own slug and it takes you too (ordnance law).
   */
  _tickSingularityPull(bomb, d, def, field, state, pos) {
    const dt = 1 / 60;
    const radius = Math.max(1, Number(def.radius) || 1);
    const strength = Math.max(0, Number(field.strength) || 0);
    const source = shipLikeList(state);
    for (let i = 0; i < source.length; i++) {
      const ent = source[i];
      if (!ent || !ent.alive || ent.id === bomb.id) continue;
      if (ent.type !== 'ship' && ent.type !== 'drone') continue;
      const dx = pos.x - ent.pos.x;
      const dz = pos.z - ent.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius || dist < 1e-4) continue;
      const falloff = linearFalloff(dist, radius);
      const mass = massOf(ent, 1);
      const couple = Math.max(
        FIELD_COUPLING.minShipCouple,
        FIELD_COUPLING.refMass / Math.max(mass, FIELD_COUPLING.refMass),
      );
      const accel = strength * falloff * couple;
      const magnitude = accel * mass * dt;
      queuePhysicsImpulse(ent, { x: (dx / dist) * magnitude, z: (dz / dist) * magnitude });
    }
  },

  /** Crush ticks: the clump pays plasma while it is dragged through the inner band. */
  _tickSingularityCrush(bomb, d, def, field, state, pos) {
    const inner = Math.max(1, Number(field.crushInnerRadius) || 1);
    const source = shipLikeList(state);
    for (let i = 0; i < source.length; i++) {
      const ent = source[i];
      if (!ent || !ent.alive) continue;
      if (ent.type !== 'ship' && ent.type !== 'drone') continue;
      const dist = Math.hypot(ent.pos.x - pos.x, ent.pos.z - pos.z);
      if (dist > inner) continue;
      const packet = scalarHitToDamagePacket({
        damage: field.crushDamage,
        damageType: 'plasma',
        pos,
        source: { kind: 'bomb', payloadId: def.id, bombId: bomb.id, phase: 'crush' },
      });
      packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
      this._routeDamage({
        attackerId: d.ownerId,
        targetId: ent.id,
        packet,
        origin: { kind: 'bomb', id: bomb.id, payloadId: def.id },
      });
    }
  },

  /** Tar volume: re-apply the goo status while a hull stays inside (refresh + stack build). */
  _tickGooReapply(bomb, d, def, field, state, pos) {
    const radius = Math.max(1, Number(def.radius) || 1);
    const source = shipLikeList(state);
    for (let i = 0; i < source.length; i++) {
      const ent = source[i];
      if (!ent || !ent.alive) continue;
      if (ent.type !== 'ship' && ent.type !== 'drone') continue;
      const dist = Math.hypot(ent.pos.x - pos.x, ent.pos.z - pos.z);
      if (dist > radius) continue;
      const packet = scalarHitToDamagePacket({
        damage: 0,
        damageType: 'kinetic',
        pos,
        statuses: [{ id: 'status_goo', stacks: field.applyStacks || 1 }],
        source: { kind: 'bomb', payloadId: def.id, bombId: bomb.id, phase: 'tar' },
      });
      packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
      this._routeDamage({
        attackerId: d.ownerId,
        targetId: ent.id,
        packet,
        origin: { kind: 'bomb', id: bomb.id, payloadId: def.id },
      });
    }
  },

  _endField(bomb, d, def, field, state, pos) {
    bomb.alive = false;
    if (field.kind === 'singularity') {
      // The collapse: everything the slug gathered gets a modest outward snap — the clump does
      // not silently stop, it answers.
      const result = this._blastVictims(state, {
        pos,
        def,
        ownerId: d.ownerId,
        originId: bomb.id,
        trigger: 'collapse',
        impulseOverride: field.collapseImpulse,
        damageOverride: field.collapseDamage,
      });
      this.bus.emit('bombs:detonated', {
        schemaVersion: 1,
        bombId: bomb.id,
        payloadId: def.id,
        ownerId: d.ownerId,
        pos,
        radius: def.radius,
        trigger: 'collapse',
        hits: result.hits,
        shoves: result.shoves,
      });
      this.bus.emit('audio:cue', { id: def.audioCue, position: pos, gain: 0.65 });
    }
    this.bus.emit('bombs:fieldEnded', {
      schemaVersion: 1,
      bombId: bomb.id,
      payloadId: def.id,
      ownerId: d.ownerId,
      pos,
      trigger: field.kind === 'singularity' ? 'collapse' : 'expired',
    });
  },

  // ── ports ─────────────────────────────────────────────────────────────────────────────────

  _applyImpulse(ent, impulseX, impulseZ, state, reason) {
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return false;
    const accepted = physics.applyImpulse({
      entityId: ent.id,
      impulse: { x: impulseX, z: impulseZ },
      point: null,
      reason,
      tick: state.tick,
    });
    return accepted !== false;
  },

  _routeDamage(request) {
    const helpers = this.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') {
      return helpers.routeCombatDamage(request);
    }
    const combatSys = this.registry && this.registry.get && this.registry.get('combat');
    if (combatSys && typeof combatSys.ensureKernel === 'function') {
      return combatSys.ensureKernel().routeDamage(request);
    }
    this.bus.emit('combat:routeDamage', request);
    return null;
  },

  // ── lifecycle ─────────────────────────────────────────────────────────────────────────────

  /** Release every live bomb (sector transitions, new game, save load). */
  releaseAll(reason = 'release') {
    const state = this.state;
    if (!state) return 0;
    let n = 0;
    for (const e of liveBombList(state)) {
      if (!e || !e.alive || e.type !== BOMB_TYPE) continue;
      e.alive = false;
      n++;
    }
    if (n && this.bus) this.bus.emit('bombs:released', { count: n, reason });
    return n;
  },

  _resetRuntime(reason) {
    this.releaseAll(reason);
    if (this.state) {
      const rt = ensureRuntime(this.state);
      rt.cooldownUntil = 0;
    }
  },
};

/** Live bomb entities (tests, HUD, future AI droppers). */
export function listBombs(state) {
  const out = [];
  for (const e of liveBombList(state)) {
    if (e && e.alive && e.type === BOMB_TYPE) out.push(e);
  }
  return out;
}
