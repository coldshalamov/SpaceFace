// SWARM-07 B7 (build-map row 270) — the room-control legendaries.
//
//   * DOMINO — every credited kill shoves the room outward from the body that actually died.
//   * GRAVITON HEART — a weak gravity well that follows the ship and pulls the room inward.
//
// ONE DIRECTOR, TWO EFFECTS
// -------------------------
// The armory owns the purchase; this file owns the runtime. The director is hosted by
// survivalArena, whose registered fixed-step slot runs BEFORE fields and physics: a Heart well
// registered on this tick is felt by the field pass on this tick, and a Domino impulse queued on
// this tick is solved by the physics pass on this tick.
//
// Death callbacks are nested inside combat. A kill can be reported from inside a damage
// resolution, and a shove that ran there would move bodies while the solver was reading them.
// So a death only ENQUEUES a copied position here; the physical effect runs on the fixed tick, in
// a stable order, with no recursion.
//
// OWNERSHIP
// ---------
// The run's own modifier ledger says which legendaries are live (`ownedSwarmLegendaryIds`).
// Nothing here writes that ledger and nothing here reads a save: a legendary lives exactly as long
// as the run that bought it. The Brood engine does not know what a legendary is — it reports where
// bodies died and takes a shove request; the director decides whether the room has earned one.
//
// The field is EXTERNAL, not environmental: `fields.serialize` drops external fields, so a Continue
// can never restore a well the run no longer owns, and the run's absence of records means no well.

import { deliverPhysicalImpulse, queryPhysicalBodies } from '../combat/physicalEffects.js';
import { schedulePhysicalBlast } from '../combat/physicalEffects.js';
import { createRewardDeathLedger, runOwnsReward } from '../combat/rewardEligibility.js';
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { validateRunState } from '../core/runState.js';
import { ownedSwarmLegendaryIds } from '../data/swarmDraft.js';
import { runLifetime } from './runSession.js';
import { isSwarmRuleset } from './survivalSwarm.js';

/** How far one Domino shove reaches, in world units. */
export const DOMINO_RADIUS_WU = 120;
/** The fastest a single body is thrown by one shove, in world units per second. */
export const DOMINO_MAX_DV_WU_S = 30;
/** The Domino cue is texture, not a per-kill stinger: at most one every quarter simulation second. */
export const DOMINO_CUE_INTERVAL_S = 0.25;
export const DOMINO_CUE_ID = 'sfx_field_deploy_repulsor';
export const HEART_CUE_ID = 'sfx_field_deploy_well';

/** The Heart's field id and shape. The well is weak on purpose — it gathers, it does not crush. */
export const HEART_FIELD_ID = 'swarm_legendary_graviton_heart';
export const HEART_RADIUS_WU = 180;
export const HEART_STRENGTH = 35;
export const HEART_FALLOFF = 1.5;

/** SEED-SW-08 — the volatile hulls blast: radius, packet, and how hard it throws. */
export const VOLATILE_RADIUS_WU = 90;
export const VOLATILE_DAMAGE = 34;
export const VOLATILE_MAX_DV_WU_S = 55;
/** SEED-SW-11 — the bumper reflect: strength and the per-body contact cooldown. */
export const BUMPER_MAX_DV_WU_S = 70;
export const BUMPER_COOLDOWN_S = 1.5;
/** SEED-SW-12 — the second sun: how close a body stands to the kill, and how hard it burns. */
export const SECOND_SUN_RADIUS_WU = 110;
export const SECOND_SUN_BURN = 12;

/**
 * The Domino radial calculation, shared by both populations.
 *
 * Outward delta velocity for a body at `position` relative to a death at `center`: linear falloff
 * from the maximum at the death to zero at (and beyond) the radius, and zero at the centre itself
 * (a body that died where it stood is not thrown by its own death). Invalid coordinates are zero —
 * a shove with no direction is no shove.
 */
export function dominoDeltaVelocity(center, position) {
  const out = { x: 0, z: 0 };
  if (!center || !position) return out;
  const cx = Number(center.x);
  const cz = Number(center.z);
  const px = Number(position.x);
  const pz = Number(position.z);
  if (!Number.isFinite(cx) || !Number.isFinite(cz) || !Number.isFinite(px) || !Number.isFinite(pz)) return out;
  const dx = px - cx;
  const dz = pz - cz;
  const distance = Math.hypot(dx, dz);
  if (!(distance > 0) || distance >= DOMINO_RADIUS_WU) return out;
  const dv = DOMINO_MAX_DV_WU_S * (1 - distance / DOMINO_RADIUS_WU);
  out.x = (dx / distance) * dv;
  out.z = (dz / distance) * dv;
  return out;
}

/**
 * The director survivalArena hosts. `init(ctx)` takes the same context a system would;
 * `update(dt, state)` runs on the host's fixed slot; `teardown(reason)` calms and clears.
 */
export function createSwarmLegendaryDirector(ctx) {
  const api = {
    name: 'swarmLegendaries',

    init() {
      this._state = ctx && ctx.state;
      this._bus = ctx && ctx.bus;
      this._helpers = ctx && ctx.helpers;
      this._registry = ctx && ctx.registry;
      this._unsubs = [];
      this._pending = [];
      this._seenBrood = new Set();
      this._deathLedger = createRewardDeathLedger();
      this._scratch = [];
      this._wave = -1;
      this._lifetime = null;
      this._heart = false;
      this._lastCueAt = -Infinity;
      if (this._bus && typeof this._bus.on === 'function') {
        this._unsubs.push(this._bus.on('entity:killed', (p) => this._onEntityKilled(p)));
        // SEED-SW-08/11 — the contact receipts feed the throw economy (volatile hulls) and the
        // cover (bumper walls). Queue-only: the physical effect resolves on the fixed tick.
        this._unsubs.push(this._bus.on('combat:collisionConsequence', (p) => this._onCollisionConsequence(p)));
        this._volatileSeen = new Set();
        this._bumperCooldown = new Map();
        this._volatileBlasts = [];
        this._bumperReflects = [];
        this._unsubs.push(this._bus.on('swarm:broodDeathPositions', (p) => this._onBroodDeathPositions(p)));
        this._unsubs.push(this._bus.on('run:waveCleared', () => this.teardown('wave_cleared')));
        this._unsubs.push(this._bus.on('run:started', () => this.teardown('run_started')));
        this._unsubs.push(this._bus.on('run:ended', () => this.teardown('run_ended')));
        this._unsubs.push(this._bus.on('game:new', () => this.teardown('game_new')));
        this._unsubs.push(this._bus.on('save:restoring', () => this.teardown('save_restoring')));
        this._unsubs.push(this._bus.on('save:loaded', () => this.teardown('save_loaded')));
        this._unsubs.push(this._bus.on('sector:enter', () => this.teardown('sector_enter')));
        this._unsubs.push(this._bus.on('sector:exit', () => this.teardown('sector_exit')));
      }
    },

    destroy() {
      this.teardown('destroy');
      for (const off of this._unsubs || []) if (typeof off === 'function') off();
      this._unsubs = [];
    },

    /**
     * The fixed tick. Everything physical happens here — never inside a death callback.
     */
    update(_dt, state) {
      const st = state || this._state;
      const run = this._liveRun(st);
      const lifetime = run ? runLifetime(run) : null;
      // A new run is a new room: the old dedup state and the old well do not carry over.
      if (this._lifetime !== lifetime) {
        // Only a flip between two real epochs is a new room. runSession stamps the WeakMap
        // lazily, so null -> {} mid-run is materialization, not a new run — wiping the dedup
        // ledger here would pay a duplicate kill. Real run boundaries already arrive through
        // the bus (run:started/run:ended/game:new/save:*) as teardown().
        if (this._lifetime != null && lifetime != null) {
          this._resetRound();
          this._releaseHeart();
        }
        this._lifetime = lifetime;
      }
      if (!run || run.phase !== 'active' || st.mode !== 'flight') {
        this._pending.length = 0;
        this._releaseHeart();
        return;
      }
      const wave = Number.isInteger(run.wave) ? run.wave : 0;
      if (wave !== this._wave) {
        // `_wave` stays -1 through loadout/draft (the early return above), so the first active
        // tick is an adoption, not a change — wiping the ledger here pays a kill reported
        // between activation and this tick twice.
        if (this._wave >= 0) this._resetRound();
        this._wave = wave;
      }
      const owned = ownedSwarmLegendaryIds(run);
      this._maintainHeart(st, owned.includes('graviton_heart'));
      // Second sun reads the death ledger before Domino's pass empties it.
      this._applySecondSun(st, owned.includes('second_sun'));
      this._applyDomino(st, run, owned.includes('domino'));
      this._volatileAndBumper(st, owned);
    },

    /** Wave teardown: the room forgets its effects but the run keeps what it bought. */
    teardown(reason) {
      this._pending.length = 0;
      this._resetRound();
      this._releaseHeart();
      this._lastTeardown = reason;
    },

    /** Live state, for tests and diagnostics. Read-only. */
    legendaryState() {
      return {
        heart: this._heart,
        pending: this._pending.length,
        wave: this._wave,
        lifetime: this._lifetime,
      };
    },

    // ---- events (queue only) ---------------------------------------------------------------

    /**
     * A ship died. The eligibility law is the chain's own: the body belongs to this run, the
     * player is the actor, and this body has not already been claimed for payment.
     */
    _onEntityKilled(payload) {
      const state = this._state;
      const run = this._liveRun(state);
      if (!run || run.phase !== 'active' || state.mode !== 'flight') return;
      const id = payload && payload.id;
      if (id == null) return;
      const victim = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(id)
        : null;
      if (!runOwnsReward(victim)) return;
      const actor = payload.killerId ?? payload.provenance?.actorId;
      if (actor !== state.playerId) return;
      // One shove per body: a second terminal observation of the same hull is a duplicate. A
      // reused entity id carrying a NEW body object is a new life and stays eligible.
      if (!this._deathLedger.claim(victim)) return;
      const pos = this._deathPos(victim, payload);
      if (!pos) return;
      this._pending.push({
        kind: 'ship',
        key: `ship:${id}`,
        pos,
        lifetime: runLifetime(run),
        wave: Number.isInteger(run.wave) ? run.wave : 0,
      });
    },

    /** The Brood tier reported where bodies died. One shove per credited body, per wave. */
    _onBroodDeathPositions(payload) {
      const state = this._state;
      const run = this._liveRun(state);
      if (!run || !payload) return;
      const deaths = Array.isArray(payload.deaths) ? payload.deaths : [];
      const lifetime = runLifetime(run);
      const wave = Number.isInteger(run.wave) ? run.wave : 0;
      for (const death of deaths) {
        if (!death || typeof death.key !== 'string') continue;
        if (this._seenBrood.has(death.key)) continue;
        const pos = death.pos;
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
        this._seenBrood.add(death.key);
        this._pending.push({
          kind: 'brood',
          key: `brood:${death.key}`,
          pos: { x: pos.x, z: pos.z },
          lifetime,
          wave,
        });
      }
    },

    // ---- effects (fixed tick only) -----------------------------------------------------------

    /**
     * The Heart: exactly one well, centred on the ship, following it every tick. The well is
     * external, so it never enters a save, and it carries no grind or exit-hitstun consequences —
     * a room-control legendary gathers bodies; it does not grind them.
     */
    _maintainHeart(state, owned) {
      const fields = this._fields();
      if (!owned || !fields || typeof fields.registerExternal !== 'function') {
        // No fields owner means no well. There is no substitute force calculation.
        this._releaseHeart();
        return;
      }
      const player = this._player(state);
      // A dead or missing player owns no well — the Heart rides a live hull only.
      if (!player || !player.pos || player.alive === false) {
        this._releaseHeart();
        return;
      }
      const center = { x: player.pos.x, z: player.pos.z };
      if (!this._heart) {
        const record = fields.registerExternal({
          id: HEART_FIELD_ID,
          kind: 'well',
          center,
          ownerId: state.playerId,
          radius: HEART_RADIUS_WU,
          strength: HEART_STRENGTH,
          damping: 0,
          falloff: HEART_FALLOFF,
          wellConsequences: { grindPriming: false, exitHitstun: false },
        });
        if (!record) return; // the kernel refused it: retry on a later tick, never a substitute
        this._heart = true;
        this._emit('audio:cue', { id: HEART_CUE_ID, gain: 0.4 });
        return;
      }
      if (typeof fields.hasExternal === 'function' && !fields.hasExternal(HEART_FIELD_ID)) {
        // The kernel lost the well (a sector change, a save restore). Take it back on a later
        // valid tick rather than leaving the room without it, and never register twice.
        this._heart = false;
        return;
      }
      if (typeof fields.updateExternal === 'function') fields.updateExternal(HEART_FIELD_ID, { center });
    },

    /**
     * Domino: every queued credited death pushes the bodies around it outward.
     *
     * Ships go through the physics owner (an impulse sized on the recipient's own mass, delivered
     * with the combat physics port and the player's provenance). The Brood tier is not an entity
     * population — the arena's public seam takes the request and the engine that owns those
     * buffers applies it.
     */
    _applyDomino(state, run, owned) {
      const pending = this._pending;
      if (!owned) {
        pending.length = 0;
        return;
      }
      if (pending.length === 0) return;
      const lifetime = runLifetime(run);
      const wave = Number.isInteger(run.wave) ? run.wave : 0;
      const helpers = this._helpers;
      const port = helpers && helpers.combatPhysics;
      const arena = this._arena();
      let shoved = 0;
      for (const death of pending) {
        if (death.lifetime !== lifetime || death.wave !== wave) continue; // a stale room
        // Domino reads room-wide: EVERY credited death shoves both populations — the
        // Brood flock through its own owner and the entity bodies through the physics
        // port — so a flock kill beside a ship still moves the ship and vice versa.
        if (arena && typeof arena.applyLegendaryShove === 'function') {
          arena.applyLegendaryShove({ center: death.pos });
          shoved += 1;
        }
        const bodies = queryPhysicalBodies(state, death.pos, DOMINO_RADIUS_WU, helpers, this._scratch, {
          includeAnchored: false,
        });
        for (const body of bodies) {
          if (!body || body.id === state.playerId || body.alive === false) continue;
          const dv = dominoDeltaVelocity(death.pos, body.pos);
          if (!dv.x && !dv.z) continue;
          const spec = resolvePhysicsBodySpec(body);
          const mass = spec && Number.isFinite(spec.mass) ? spec.mass : 1;
          const accepted = deliverPhysicalImpulse(state, body, { x: dv.x * mass, z: dv.z * mass }, {
            actorId: state.playerId,
            kind: 'swarm_legendary_domino',
            tag: 'swarm_legendary_domino',
          }, { port });
          if (accepted !== false) shoved += 1;
        }
      }
      pending.length = 0;
      if (shoved > 0) this._cueDomino(state);
    },

    _cueDomino(state) {
      const now = Number.isFinite(state && state.simTime) ? state.simTime : 0;
      if (now - this._lastCueAt < DOMINO_CUE_INTERVAL_S) return;
      this._lastCueAt = now;
      this._emit('audio:cue', { id: DOMINO_CUE_ID, gain: 0.4 });
    },

    // ---- SEED-SW-08/11/12 branches ---------------------------------------------------------

    /**
     * SW-08 VOLATILE HULLS — a body the PLAYER threw (massline provenance on the contact
     * receipt) detonates on its FIRST solid impact: once per thrown body, the blast snaps its
     * recipients at the contact, and the packet goes through the combat seam with the player's
     * name on it. Unthrown wrecks and gun kills never detonate; nothing physical runs inside
     * the receipt callback — the queue resolves here on the fixed tick.
     * SW-11 BUMPER WALLS — a hostile body that met arena cover is thrown back into the room,
     * once per body per cooldown. The player's own contacts never enter this branch.
     */
    _onCollisionConsequence(receipt) {
      if (!receipt || typeof receipt !== 'object') return;
      const tag = String((receipt.provenance && receipt.provenance.tag) || '');
      const actorId = receipt.provenance && receipt.provenance.actorId;
      const state = this._state;
      const run = this._liveRun(state);
      const owned = run ? ownedSwarmLegendaryIds(run) : [];
      if (owned.includes('volatile_hulls') && actorId === state.playerId
        && /^(massline|rope|tether|sling|whip|bridle|twin_bridle|monofilament|snarl|tow_flail|flail)/.test(tag)
        && receipt.otherId != null && !this._volatileSeen.has(receipt.otherId)) {
        this._volatileSeen.add(receipt.otherId);
        this._volatileBlasts.push({ targetId: receipt.targetId, otherId: receipt.otherId });
      }
      if (owned.includes('bumper_walls') && receipt.targetHostile === true
        && receipt.otherType === 'asteroid' && receipt.targetId != null) {
        const now = Number.isFinite(state && state.simTime) ? state.simTime : 0;
        if (now >= (this._bumperCooldown.get(receipt.targetId) || 0)) {
          this._bumperCooldown.set(receipt.targetId, now + BUMPER_COOLDOWN_S);
          this._bumperReflects.push({ targetId: receipt.targetId, otherId: receipt.otherId });
        }
      }
      if (this._volatileSeen.size > 256) this._volatileSeen.clear();
      if (this._bumperCooldown.size > 256) this._bumperCooldown.clear();
    },

    _volatileAndBumper(state) {
      const helpers = this._helpers;
      const port = helpers && helpers.combatPhysics;
      const get = (id) => (state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) : null);
      while (this._volatileBlasts.length) {
        const blast = this._volatileBlasts.shift();
        const target = get(blast.targetId);
        const other = get(blast.otherId);
        const center = (target && target.pos) || (other && other.pos);
        if (!center) continue;
        schedulePhysicalBlast(state, {
          center,
          radius: VOLATILE_RADIUS_WU,
          helpers,
          onBody: (body) => {
            if (!body || body.id === state.playerId) return;
            const route = helpers && helpers.routeCombatDamage;
            if (typeof route === 'function') {
              route({
                attackerId: state.playerId,
                targetId: body.id,
                packet: { channels: { kinetic: VOLATILE_DAMAGE }, statuses: [], hit: { pos: { x: body.pos.x, z: body.pos.z } } },
                origin: { kind: 'weapon', id: 'swarm_volatile_hulls' },
              });
            }
            let dx = body.pos.x - center.x;
            let dz = body.pos.z - center.z;
            let d = Math.hypot(dx, dz);
            if (d < 1e-3) { dx = 0; dz = 1; d = 1; }
            const spec = resolvePhysicsBodySpec(body);
            const mass = spec && Number.isFinite(spec.mass) ? spec.mass : 1;
            deliverPhysicalImpulse(state, body, { x: (dx / d) * VOLATILE_MAX_DV_WU_S * mass, z: (dz / d) * VOLATILE_MAX_DV_WU_S * mass }, {
              actorId: state.playerId, kind: 'swarm_legendary_volatile', tag: 'swarm_legendary_volatile',
            }, { port });
          },
        });
      }
      while (this._bumperReflects.length) {
        const reflect = this._bumperReflects.shift();
        const target = get(reflect.targetId);
        const cover = get(reflect.otherId);
        if (!target || !target.pos || target.alive === false) continue;
        let dx = target.pos.x - (cover && cover.pos ? cover.pos.x : target.pos.x);
        let dz = target.pos.z - (cover && cover.pos ? cover.pos.z : target.pos.z);
        let d = Math.hypot(dx, dz);
        if (d < 1e-3) { dx = 0; dz = 1; d = 1; }
        const spec = resolvePhysicsBodySpec(target);
        const mass = spec && Number.isFinite(spec.mass) ? spec.mass : 1;
        deliverPhysicalImpulse(state, target, { x: (dx / d) * BUMPER_MAX_DV_WU_S * mass, z: (dz / d) * BUMPER_MAX_DV_WU_S * mass }, {
          kind: 'swarm_legendary_bumper', tag: 'swarm_legendary_bumper',
        }, { port });
      }
    },

    /**
     * SW-12 SECOND SUN — every credited death ignites what stood close to it: a short burn
     * packet routed through the combat seam, resolved here on the fixed tick (never inside a
     * death callback). `chain_reactor`'s chain-25 gate is its own perk and stays untouched.
     */
    _applySecondSun(state, owned) {
      if (!owned || !this._pending.length) return;
      const route = this._helpers && this._helpers.routeCombatDamage;
      if (typeof route !== 'function') return;
      const lifetime = runLifetime(state.run);
      const wave = Number.isInteger(state.run.wave) ? state.run.wave : 0;
      const deaths = this._pending.filter((death) => death.lifetime === lifetime && death.wave === wave);
      if (!deaths.length) return;
      for (const death of deaths) {
        const near = queryPhysicalBodies(state, death.pos, SECOND_SUN_RADIUS_WU, this._helpers, this._scratch, {
          includeAnchored: false,
        });
        for (const body of near) {
          if (!body || body.id === state.playerId || body.alive === false) continue;
          route({
            attackerId: state.playerId,
            targetId: body.id,
            packet: { channels: { thermal: SECOND_SUN_BURN }, statuses: [{ id: 'burn', stacks: 1 }], hit: { pos: { x: body.pos.x, z: body.pos.z } } },
            origin: { kind: 'weapon', id: 'swarm_second_sun' },
          });
        }
      }
    },

    // ---- plumbing ---------------------------------------------------------------------------

    _resetRound() {
      // NOTE: `_pending` is deliberately NOT cleared here. Each queued death carries its own
      // (lifetime, wave) stamp — _applyDomino skips stale entries and empties the list after
      // every pass, and teardown() clears it explicitly. A kill reported between a run/wave
      // boundary and this director's first tick would otherwise be silently dropped.
      this._seenBrood.clear();
      if (this._deathLedger) this._deathLedger.clear();
      this._wave = -1;
    },

    _releaseHeart() {
      if (!this._heart) return;
      this._heart = false;
      const fields = this._fields();
      if (fields && typeof fields.unregisterExternal === 'function') fields.unregisterExternal(HEART_FIELD_ID);
    },

    _deathPos(victim, payload) {
      const fromVictim = victim && victim.pos;
      if (fromVictim && Number.isFinite(fromVictim.x) && Number.isFinite(fromVictim.z)) {
        return { x: fromVictim.x, z: fromVictim.z };
      }
      const fromPayload = payload && payload.pos;
      if (fromPayload && Number.isFinite(fromPayload.x) && Number.isFinite(fromPayload.z)) {
        return { x: fromPayload.x, z: fromPayload.z };
      }
      return null;
    },

    _liveRun(state) {
      const run = state && state.run;
      if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
      if (run.kind !== 'survival') return null;
      if (!isSwarmRuleset(run.ruleset)) return null;
      if (run.phase === 'inactive') return null;
      if (!validateRunState(run).ok) return null;
      return run;
    },

    _player(state) {
      if (!state || state.playerId == null || !state.entities) return null;
      return typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
    },

    _fields() {
      const registry = this._registry;
      if (!registry || typeof registry.get !== 'function') return null;
      return registry.get('fields') || null;
    },

    _arena() {
      const registry = this._registry;
      if (!registry || typeof registry.get !== 'function') return null;
      return registry.get('swarmArena') || null;
    },

    _emit(event, payload) {
      if (this._bus && typeof this._bus.emit === 'function') this._bus.emit(event, payload);
    },
  };
  return api;
}

export default createSwarmLegendaryDirector;
