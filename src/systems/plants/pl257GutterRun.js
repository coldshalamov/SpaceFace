// PL-257 The gutter run — "Fly through debris weather with lamps dead and a stranger falls
// in beside you just long enough to clamp a working lamp to your hull, no channel, no name:
// 'Dark out here. Take mine.'"
// What the player can do: Keep it mounted; or strip and sell it — the giver's yard number is
// engraved inside, and givers compare notes.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; variety via
//   hash32 (src/core/rng.js). No Three.js/DOM imports.
// - Traffic ops mixin (hull-to-hull lane reaction): the stranger is a REAL passing civilian
//   hull; NPC movement ONLY via requestTrafficReaction (src/systems/trafficReactionLease.js).
//   Returns true only while the stranger is flying its clamp run.
// - "Lamps dead" is the real night band + no mounted lamp stamp on the player hull; "debris
//   weather" is real debris bodies near the player (counted once per sim tick, bounded).
// - The clamp is physical: a working-lamp prop spawned at the hull plus a mounted stamp the
//   renderer-neutral world can read. Stripping = collecting the lamp prop into the hold
//   (pickup:collected receipt); givers compare notes and stop falling in.
// - Bounded Maps with tuning.memoryCap; cooldown per stranger hull; session state resets via
//   RESET events (sector:exit/save:loaded/game-new), not unsubscribes.
// - Guards: exclude data.isGate/isWormhole; exclude the player from NPC predicates; gate on
//   state.mode === 'flight'.

import { hash32 } from '../../core/rng.js';
import { isNightAt } from './pl146FirstCaller.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_GUTTER_EVENT = 'plants:pl257:gutter';
export const PLANTS_GUTTER_STRIPPED_EVENT = 'plants:pl257:stripped';

export const GUTTER_RUN_TUNING = Object.freeze({
  plId: 'pl257',
  debrisCount: 2,            // debris weather: this many debris bodies within scan range
  debrisScanWu: 420,
  clampRangeWu: 60,          // alongside range that counts as the clamp pass
  clampHoldS: 3,             // fall in beside you "just long enough"
  escortRangeWu: 260,        // the stranger keeps this far at most during the run
  runCooldownS: 240,         // one gutter run per stranger per cooldown
  lampCooldownS: 600,        // and no lamp for you again this fast
  lampStripperBlockS: 1800,  // givers compare notes: no more lamps after a strip
  lampRadius: 3,
  lampMass: 2,
  memoryCap: 16,
  night: { dayLengthS: 240, nightFraction: 0.25 },   // the dark band (pl146 convention)
});

export const PL_257_LAMP_STAMP = 'plantsPl257LampMounted';   // on the player hull
export const PL_257_STRIPPER_STAMP = 'plantsPl257StripperUntil'; // session memory, also mirrored on player data

/** Pure: the engraved yard number inside a clamped lamp — deterministic per stranger hull. */
export function lampYardNo(hullId) {
  return hash32('plantsPl257YardNo', String(hullId ?? 'lamp')) % 900 + 100;
}

/** Pure: does the player count as lamps-dead in debris weather right now? */
export function isGutterDark(state, player, debrisNear, t = GUTTER_RUN_TUNING) {
  if (!state || !player || !player.pos) return false;
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  if (!isNightAt(now, t.night)) return false;
  if (player.data && player.data[PL_257_LAMP_STAMP]) return false;
  return debrisNear >= t.debrisCount;
}

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export const gutterRunOps = {
  _initGutterRun() {
    this._gutterMemory = new Map();       // hullId -> { lastRunAt, lastAt }
    this._gutterRun = null;               // { hullId, since }
    this._gutterDebrisTick = -1;
    this._gutterDebrisNear = 0;
    const bus = this.bus;
    if (!bus || typeof bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = bus.on(event, fn);
      if (typeof off === 'function') this._gutterUnsubs.push(off);
    };
    this._gutterUnsubs = this._gutterUnsubs || [];
    on('pickup:collected', (p) => this._onGutterPickup(p || {}));
    on('sector:exit', () => this._resetGutter());
    on('save:loaded', () => this._resetGutter());
    on('game:new', () => this._resetGutter());
    on('game:newGame', () => this._resetGutter());
  },

  _resetGutter() {
    if (this._gutterRun && this.state) {
      const e = this.state.entities && this.state.entities.get
        ? this.state.entities.get(this._gutterRun.hullId) : null;
      if (e) releaseTrafficReaction(this, e);
    }
    this._gutterRun = null;
    this._gutterDebrisTick = -1;
    if (this._gutterMemory) this._gutterMemory.clear();
  },

  _gutterMemoryMap() {
    if (!(this._gutterMemory instanceof Map)) this._gutterMemory = new Map();
    return this._gutterMemory;
  },

  /** Debris weather: real debris bodies near the player, counted once per sim tick. */
  _gutterCountDebris(state, player) {
    const tick = Number.isInteger(state.tick) ? state.tick : 0;
    if (tick === this._gutterDebrisTick) return this._gutterDebrisNear;
    this._gutterDebrisTick = tick;
    let count = 0;
    const entities = state.entities;
    if (!entities || !player) return 0;
    const scan = (e) => {
      if (!e || e.alive === false || e.type !== 'debris' || !e.pos) return;
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      if (d <= GUTTER_RUN_TUNING.debrisScanWu) count += 1;
    };
    if (typeof entities.values === 'function') { for (const e of entities.values()) scan(e); }
    else if (Array.isArray(entities)) { for (const e of entities) scan(e); }
    this._gutterDebrisNear = count;
    return count;
  },

  /** Stripping: the lamp prop collected into the hold. Givers compare notes. */
  _onGutterPickup(p) {
    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const collectorId = p && p.collectorId;
    if (collectorId == null || collectorId !== state.playerId) return;
    const pickupId = p && p.pickupId;
    const lamp = pickupId != null && state.entities && state.entities.get
      ? state.entities.get(pickupId) : null;
    if (!lamp || !lamp.data || lamp.data.plantsPl257Lamp !== true) return;
    const now = finite(state.simTime, 0);
    const player = state.entities.get(state.playerId);
    if (player) {
      player.data = player.data || {};
      delete player.data[PL_257_LAMP_STAMP];
      player.data[PL_257_STRIPPER_STAMP] = now + GUTTER_RUN_TUNING.lampStripperBlockS;
    }
    this.bus.emit(PLANTS_GUTTER_STRIPPED_EVENT, { pickupId, yardNo: lamp.data.plantsPl257YardNo, t: now });
  },

  /**
   * Per-hull hook from the traffic dispatch: a stranger falls in beside a lamps-dead hull in
   * debris weather and clamps a working lamp on it. Returns true only while this hull is
   * flying its clamp run (single writer via the traffic reaction lease).
   */
  _reactGutterRun(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
    if (!player || player.alive === false || !player.pos || !player.vel) return false;
    if (e.id === state.playerId) return false;
    const data = e.data || (e.data = {});
    if (data.isGate || data.isWormhole || data.disabled || data.derelict) return false;

    const now = finite(state.simTime, 0);
    const memory = this._gutterMemoryMap();

    // Mid-run: hold the clamp pass alongside, then clamp and peel.
    const run = this._gutterRun;
    if (run && run.hullId === e.id) {
      const toPlayer = Math.atan2(
        finite(player.pos.z) - finite(e.pos.z),
        finite(player.pos.x) - finite(e.pos.x),
      );
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      const aim = d > GUTTER_RUN_TUNING.clampRangeWu ? toPlayer : Math.atan2(finite(player.vel.z), finite(player.vel.x));
      requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: d <= GUTTER_RUN_TUNING.clampRangeWu,
      }, 2);
      run.lastAt = now;
      if (now - run.since >= GUTTER_RUN_TUNING.clampHoldS || d <= GUTTER_RUN_TUNING.clampRangeWu) {
        this._gutterClamp(e, state, player, now);
        releaseTrafficReaction(this, e);
        this._gutterRun = null;
      }
      return true;
    }
    if (run) return false; // one stranger at a time; the others stay out of the dark

    const row = memory.get(e.id);
    if (row && !(now >= row.lastAt)) memory.delete(e.id);
    if (!row) {
      while (memory.size >= GUTTER_RUN_TUNING.memoryCap) memory.delete(memory.keys().next().value);
      memory.set(e.id, { lastRunAt: -Infinity, lastAt: now });
    } else {
      row.lastAt = now;
    }
    const memRow = memory.get(e.id);
    if (now - memRow.lastRunAt < GUTTER_RUN_TUNING.runCooldownS) return false;

    if (!isGutterDark(state, player, this._gutterCountDebris(state, player))) return false;
    // Givers compare notes: a stripped lamp buys you a long dark stretch.
    const stripperUntil = player.data ? player.data[PL_257_STRIPPER_STAMP] : null;
    if (Number.isFinite(stripperUntil) && now < stripperUntil) return false;
    const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
    if (d > GUTTER_RUN_TUNING.escortRangeWu) return false;

    this._gutterRun = { hullId: e.id, since: now, lastAt: now };
    memRow.lastRunAt = now;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_GUTTER_EVENT, { kind: 'fell_in', hullId: e.id, t: now });
    }
    return true;
  },

  /** The clamp: a working-lamp prop at the hull plus the mounted stamp; no channel, no name. */
  _gutterClamp(e, state, player, now) {
    if (player.data && player.data[PL_257_LAMP_STAMP]) return;
    const lastLampAt = this._gutterLampAt || -Infinity;
    if (now - lastLampAt < GUTTER_RUN_TUNING.lampCooldownS) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const yardNo = lampYardNo(e.id);
    let lampId = null;
    if (typeof spawnEntity === 'function') {
      const ent = spawnEntity({
        type: 'payload',
        pos: { x: finite(player.pos.x) + 8, z: finite(player.pos.z) - 4 },
        vel: { x: finite(player.vel.x), z: finite(player.vel.z) },
        radius: GUTTER_RUN_TUNING.lampRadius,
        mass: GUTTER_RUN_TUNING.lampMass,
        physicsBody: { mass: GUTTER_RUN_TUNING.lampMass },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_gutter_lamp',
          plantsPl257Lamp: true,
          plantsPl257YardNo: yardNo,
          scanLabel: `A working lamp, clamped on fast — yard no. ${yardNo} engraved inside`,
          swarmFloorPad: { label: 'A working lamp — yours' },
          masslineTetherable: true,
        },
      });
      if (ent && ent.id != null) lampId = ent.id;
    }
    player.data = player.data || {};
    player.data[PL_257_LAMP_STAMP] = { yardNo, lampId, mountedAt: now, fromHullId: e.id };
    this._gutterLampAt = now;
    if (this.bus && typeof this.bus.emit === 'function') {
      // The row's exact line — no channel, no name.
      const id = `plants:pl257:dark:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: '', category: 'traffic', text: 'Dark out here. Take mine.', ttl: 5, persist: false });
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        voice.say({ channel: 'bark', id, text: 'Dark out here. Take mine.', ttl: 5 });
      } else {
        this.bus.emit('voice:say', { channel: 'bark', id, text: 'Dark out here. Take mine.', ttl: 5 });
      }
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.4, rate: 1.0 });
      this.bus.emit(PLANTS_GUTTER_EVENT, { kind: 'clamped', hullId: e.id, lampId, yardNo, t: now });
    }
  },
};
