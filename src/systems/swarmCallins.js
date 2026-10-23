// SEED-SW-01..07 — the swarm call-in director, hosted by survivalArena on the same fixed slot as
// the legendary director. The armory sells charges as spent stock (data/swarmDraft.js owns the
// catalog and the run ledger); this file owns the runtime: what a fire or a call-in DOES.
//
//   smart bomb    stocked — a Bomb press spends one and detonates a room blast (SW-01)
//   orbital lance stocked — a Bomb press spends one, paints ≥0.8 s, then strikes (SW-03)
//   turret drop   called at purchase — an allied turret fights this wave (SW-04)
//   drone wing    called at purchase — four escorts fly this wave (SW-05)
//   shield dome   called at purchase — a planted external repulsor wall on a clock (SW-06)
//   decoy         called at purchase — a soft, fast body the pack's own vote converges on (SW-07)
//
// The two stocked charges sit in the ordnance fallback AFTER the cargo impulse charge and BEFORE
// the drift bomb (powerVerbs arbitrates; input.js resolves the press), so no new power slot or
// key exists. Called allies are real team-0 combat bodies ("team: 0 — the AI auto-targets
// team-1 hostiles", the wingmen contract) spawned through the arena's spawn seam and removed by
// the wave teardown — nothing here persists, and nothing here reads a save.
//
// Every physical effect runs on the fixed tick (the legendary file's law): an input edge only
// enqueues; the blast, the strike and the spawns resolve in update().

import { deliverPhysicalImpulse, queryPhysicalBodies } from '../combat/physicalEffects.js';
import {
  SWARM_CALLIN_MAX_PER_TYPE,
  spendSwarmCallin,
  swarmCallinCount,
} from '../data/swarmDraft.js';
import { makeShipEntitySpec } from './ships.js';
import { isSwarmRuleset } from './survivalSwarm.js';

/** The smart bomb's blast: radius, throw speed, and the packet a hostile hull inside it takes. */
export const SMART_BOMB_RADIUS_WU = 240;
export const SMART_BOMB_MAX_DV_WU_S = 95;
export const SMART_BOMB_DAMAGE = 46;
/** The lance: the paint must be visible for at least this long before the column lands. */
export const LANCE_TELEGRAPH_S = 0.8;
export const LANCE_RADIUS_WU = 34;
export const LANCE_MAX_DV_WU_S = 60;
export const LANCE_DAMAGE = 70;
/** The dome: how long the planted wall holds, and the rim the pack is stopped at. */
export const DOME_DURATION_S = 6;
export const DOME_RADIUS_WU = 190;
export const DOME_STRENGTH = 120;
/** The turret drop: one heavy body that holds where it lands. */
export const TURRET_SHIP_ID = 'ship_ironback';
/** The drone wing: four light fighters. */
export const WING_SHIP_ID = 'ship_wasp';
export const WING_COUNT = 4;
/** The decoy: one soft, fast body the pack prefers by its own doctrine vote. */
export const DECOY_SHIP_ID = 'ship_wasp';
export const DECOY_TTL_S = 7;

function liveSwarmRun(state) {
  const run = state && state.run;
  if (!run || typeof run !== 'object') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (run.phase !== 'active' && run.phase !== 'draft') return null;
  return run;
}

function playerIdOf(state) {
  return state ? state.playerId : null;
}

function shipPos(state) {
  const id = playerIdOf(state);
  const ship = id != null && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id) : null;
  return ship && ship.pos && Number.isFinite(ship.pos.x) && Number.isFinite(ship.pos.z) ? ship.pos : null;
}

function isHostileHull(state, body) {
  if (!body || body.alive === false) return false;
  if (body.id === playerIdOf(state)) return false;
  return body.type === 'ship' || body.type === 'drone';
}

function aimPoint(state) {
  const pos = shipPos(state);
  if (!pos) return null;
  const ship = state.entities && typeof state.entities.get === 'function' ? state.entities.get(playerIdOf(state)) : null;
  const input = state.input || {};
  const fallback = ship && Number.isFinite(ship.rot) ? ship.rot : 0;
  const angle = Number.isFinite(input.aimAngle) ? input.aimAngle : fallback;
  const dist = 320;
  return { x: pos.x + Math.sin(angle) * dist, z: pos.z + Math.cos(angle) * dist };
}

/**
 * The director survivalArena hosts. `init(ctx)` takes the same context a system would;
 * `update(dt, state)` runs on the host's fixed slot; `teardown(reason)` clears wave-scoped calls.
 */
export function createSwarmCallinsDirector(ctx) {
  const api = {
    name: 'swarmCallins',

    init() {
      this._state = ctx && ctx.state;
      this._bus = ctx && ctx.bus;
      this._helpers = ctx && ctx.helpers;
      this._registry = ctx && ctx.registry;
      this._unsubs = [];
      this._lances = [];
      this._allies = [];
      this._domes = [];
      this._prevBomb = false;
    },

    destroy() {
      for (const off of this._unsubs || []) if (typeof off === 'function') off();
      this._unsubs = [];
    },

    /** Wave teardown: called bodies leave with their wave; stocked charges and pending strikes stay. */
    teardown() {
      this._releaseAllies();
      this._releaseDomes();
      this._prevBomb = false;
    },

    /** Live state, for tests and diagnostics. Read-only. */
    callinState() {
      return {
        lances: this._lances.length,
        allies: this._allies.length,
        domes: this._domes.length,
      };
    },

    /** The fixed tick. The bomb edge is read here too — the host's slot owns the whole resolution. */
    update(_dt, state) {
      const st = state || this._state;
      const run = liveSwarmRun(st);
      if (!run || st.mode !== 'flight') {
        this._prevBomb = false;
        return;
      }
      this._tickLances(st);
      this._expireDomes(st);
      this._expireAllies(st);
      this._readBombPress(st, run);
    },

    // ---- the stocked charges (SW-01 smart bomb, SW-03 orbital lance) ------------------------

    _readBombPress(st, run) {
      const actions = st.input && st.input.actions;
      const pressed = !!(actions && actions.swarmBombThrow);
      const edge = pressed && !this._prevBomb;
      this._prevBomb = pressed;
      if (!edge) return;
      const pos = shipPos(st);
      if (!pos) return;
      if (swarmCallinCount(run, 'smart_bomb') > 0) {
        const before = swarmCallinCount(run, 'smart_bomb');
        const after = spendSwarmCallin(run, 'smart_bomb');
        if (after >= before) return; // the ledger refused the spend; no fire happened
        this._detonateSmartBomb(st, pos);
        return;
      }
      if (swarmCallinCount(run, 'orbital_lance') > 0) {
        const target = this._latchedTarget(st) || aimPoint(st);
        if (!target) return;
        const before = swarmCallinCount(run, 'orbital_lance');
        const after = spendSwarmCallin(run, 'orbital_lance');
        if (after >= before) return;
        this._lances.push({ atS: (st.simTime || 0) + LANCE_TELEGRAPH_S, x: target.x, z: target.z });
        this._emit(st, 'swarm:callinTelegraph', { callinId: 'orbital_lance', x: target.x, z: target.z, atS: (st.simTime || 0) + LANCE_TELEGRAPH_S });
      }
    },

    /** The hull the player's line is holding, when the lance has a better target than the aim. */
    _latchedTarget(st) {
      const tether = st.player && st.player.tether;
      const id = tether && tether.active ? tether.targetId : null;
      const body = id != null && st.entities && typeof st.entities.get === 'function' ? st.entities.get(id) : null;
      return body && body.pos && Number.isFinite(body.pos.x) ? { x: body.pos.x, z: body.pos.z } : null;
    },

    _detonateSmartBomb(st, pos) {
      const myId = playerIdOf(st);
      // The throw: every physical body in the room except the player is thrown outward. Brood
      // cells ride the same promotion rule as Domino's shove.
      const bodies = queryPhysicalBodies(st, pos, SMART_BOMB_RADIUS_WU, this._helpers, []);
      for (const body of bodies) {
        if (!body || body.id === myId) continue;
        let dx = body.pos.x - pos.x;
        let dz = body.pos.z - pos.z;
        let d = Math.hypot(dx, dz);
        if (d < 1e-3) { dx = 0; dz = 1; d = 1; } // a body hugging the bomb still takes the radial throw
        const falloff = 1 - Math.min(1, d / SMART_BOMB_RADIUS_WU);
        const dv = SMART_BOMB_MAX_DV_WU_S * (0.35 + 0.65 * falloff);
        deliverPhysicalImpulse(st, body, { x: (dx / d) * dv * (body.mass || 1), z: (dz / d) * dv * (body.mass || 1) }, {
          source: 'swarm_smart_bomb', cause: 'bomb',
        });
      }
      // The break: hostile hulls in the radius take one real packet through the combat seam.
      this._damageHostiles(st, pos, SMART_BOMB_RADIUS_WU, SMART_BOMB_DAMAGE, 'swarm_smart_bomb');
      this._emit(st, 'swarm:smartBomb', { x: pos.x, z: pos.z, radiusWu: SMART_BOMB_RADIUS_WU });
    },

    _damageHostiles(st, pos, radiusWu, damage, weaponId) {
      const route = this._helpers && this._helpers.routeCombatDamage;
      if (typeof route !== 'function' || !(damage > 0)) return;
      const bodies = queryPhysicalBodies(st, pos, radiusWu, this._helpers, [], { includeAnchored: false });
      for (const body of bodies) {
        if (!isHostileHull(st, body)) continue;
        route({
          attackerId: playerIdOf(st),
          targetId: body.id,
          packet: { channels: { kinetic: damage }, statuses: [], hit: { pos: { x: body.pos.x, z: body.pos.z } } },
          origin: { kind: 'weapon', id: weaponId },
        });
      }
    },

    _tickLances(st) {
      if (!this._lances.length) return;
      const now = st.simTime || 0;
      const due = this._lances.filter((lance) => lance.atS <= now);
      if (!due.length) return;
      this._lances = this._lances.filter((lance) => lance.atS > now);
      for (const lance of due) {
        const bodies = queryPhysicalBodies(st, lance, LANCE_RADIUS_WU, this._helpers, [], { includeAnchored: false });
        for (const body of bodies) {
          if (!isHostileHull(st, body)) continue;
          let dx = body.pos.x - lance.x;
          let dz = body.pos.z - lance.z;
          let d = Math.hypot(dx, dz);
          if (d < 1e-3) { dx = 0; dz = 1; d = 1; } // a body dead-center still takes the column's shove
          const accepted = deliverPhysicalImpulse(st, body, { x: (dx / d) * LANCE_MAX_DV_WU_S * (body.mass || 1), z: (dz / d) * LANCE_MAX_DV_WU_S * (body.mass || 1) }, {
            source: 'swarm_orbital_lance', cause: 'strike',
          });
        }
        this._damageHostiles(st, lance, LANCE_RADIUS_WU, LANCE_DAMAGE, 'swarm_orbital_lance');
        this._emit(st, 'swarm:callinStrike', { callinId: 'orbital_lance', x: lance.x, z: lance.z });
      }
    },

    // ---- the called charges (SW-04 turret, SW-05 wing, SW-06 dome, SW-07 decoy) -------------

    /**
     * A purchased call-in resolves here, on the caller's tick. Returns true when the room took
     * the body — the purchase already spent the credits, so a false return must refund upstream.
     */
    callIn(st, run, callinId) {
      const pos = shipPos(st);
      if (!pos) return false;
      if (callinId === 'turret_drop') return this._callTurret(st, pos);
      if (callinId === 'drone_wing') return this._callWing(st, pos);
      if (callinId === 'shield_dome') return this._callDome(st, pos);
      if (callinId === 'decoy') return this._callDecoy(st, pos);
      return false;
    },

    /** One allied combat body, spawned through the arena seam and tracked for the teardown. */
    _spawnAlly(st, spec, ttlS) {
      const spawn = this._helpers && this._helpers.spawnEntity;
      if (typeof spawn !== 'function') return null;
      const body = spawn(spec);
      if (body) this._allies.push({ body, deadlineS: (st.simTime || 0) + (Number.isFinite(ttlS) ? ttlS : Infinity) });
      return body;
    },

    _callTurret(st, pos) {
      const spec = makeShipEntitySpec(TURRET_SHIP_ID, {
        team: 0,
        factionId: 'faction_scn',
        pos: { x: pos.x, z: pos.z },
        ai: {
          archetype: 'guard',
          squadId: 'swarm_callin',
          motive: 'player_command',
          holdPosition: true,
          engagementTrigger: 'always',
        },
      });
      spec.data = spec.data || {};
      spec.data.swarmCallin = 'turret_drop';
      const body = this._spawnAlly(st, spec);
      if (body) this._emit(st, 'swarm:callinDeployed', { callinId: 'turret_drop', id: body.id });
      return !!body;
    },

    _callWing(st, pos) {
      let spawned = 0;
      for (let i = 0; i < WING_COUNT; i += 1) {
        const angle = (Math.PI * 2 * i) / WING_COUNT;
        const spec = makeShipEntitySpec(WING_SHIP_ID, {
          team: 0,
          factionId: 'faction_scn',
          pos: { x: pos.x + Math.sin(angle) * 26, z: pos.z + Math.cos(angle) * 26 },
          ai: {
            archetype: 'interceptor',
            squadId: 'swarm_callin',
            motive: 'player_command',
            engagementTrigger: 'always',
            combatDoctrineId: 'interceptor_flyby',
          },
        });
        spec.data = spec.data || {};
        spec.data.swarmCallin = 'drone_wing';
        if (this._spawnAlly(st, spec)) spawned += 1;
      }
      if (spawned) this._emit(st, 'swarm:callinDeployed', { callinId: 'drone_wing', count: spawned });
      return spawned === WING_COUNT;
    },

    _callDome(st, pos) {
      const fields = this._fields();
      if (!fields || typeof fields.registerExternal !== 'function') return false;
      const untilS = (st.simTime || 0) + DOME_DURATION_S;
      const record = fields.registerExternal({
        id: 'swarm_callin_shield_dome',
        kind: 'repulsor',
        center: { x: pos.x, z: pos.z },
        ownerId: playerIdOf(st),
        radius: DOME_RADIUS_WU,
        strength: DOME_STRENGTH,
        damping: 0,
        falloff: 1.4,
      });
      if (!record) return false;
      this._domes.push({ untilS });
      this._emit(st, 'swarm:callinDeployed', { callinId: 'shield_dome', x: pos.x, z: pos.z, radiusWu: DOME_RADIUS_WU });
      return true;
    },

    _callDecoy(st, pos) {
      const input = st.input || {};
      const angle = Number.isFinite(input.aimAngle) ? input.aimAngle : 0;
      const spec = makeShipEntitySpec(DECOY_SHIP_ID, {
        team: 0,
        factionId: 'faction_scn',
        pos: { x: pos.x + Math.sin(angle) * 14, z: pos.z + Math.cos(angle) * 14 },
        ai: {
          archetype: 'guard',
          squadId: 'swarm_callin',
          motive: 'hold',
          engagementTrigger: 'never',
        },
      });
      spec.data = spec.data || {};
      spec.data.swarmCallin = 'decoy';
      const body = this._spawnAlly(st, spec, DECOY_TTL_S);
      if (body) this._emit(st, 'swarm:callinDeployed', { callinId: 'decoy', id: body.id });
      return !!body;
    },

    _fields() {
      return this._registry && typeof this._registry.get === 'function' ? this._registry.get('fields') : null;
    },

    _expireDomes(st) {
      if (!this._domes.length) return;
      const now = st.simTime || 0;
      const fields = this._fields();
      this._domes = this._domes.filter((dome) => {
        if (now < dome.untilS) return true;
        if (fields && typeof fields.unregisterExternal === 'function') fields.unregisterExternal('swarm_callin_shield_dome');
        return false;
      });
    },

    _expireAllies(st) {
      if (!this._allies.length) return;
      const now = st.simTime || 0;
      this._allies = this._allies.filter((entry) => {
        if (!entry.body || entry.body.alive === false) return false;
        if (now < entry.deadlineS) return true;
        this._despawn(entry.body);
        return false;
      });
    },

    _releaseAllies() {
      for (const entry of this._allies) {
        if (!entry.body || entry.body.alive === false) continue;
        this._despawn(entry.body);
      }
      this._allies.length = 0;
    },

    /** Remove one called body through the arena's own seam, or honestly kill it without one. */
    _despawn(body) {
      const despawn = this._helpers && this._helpers.despawnEntity;
      if (typeof despawn === 'function') despawn.call(this._helpers, body.id);
      else body.alive = false;
    },

    _releaseDomes() {
      const fields = this._fields();
      if (this._domes.length && fields && typeof fields.unregisterExternal === 'function') {
        fields.unregisterExternal('swarm_callin_shield_dome');
      }
      this._domes.length = 0;
    },

    _emit(st, event, payload) {
      if (this._bus && typeof this._bus.emit === 'function') this._bus.emit(event, payload);
    },
  };
  return api;
}

/** How many more of one charge the rack accepts (the armory's shelf test). */
export function swarmCallinRackSpace(run, callinId) {
  return Math.max(0, SWARM_CALLIN_MAX_PER_TYPE - swarmCallinCount(run, callinId));
}
