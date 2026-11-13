// PL-251 The other side of it — A disabled stranger hails the nearest good hull, and today that is you.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: A disabled stranger hails the nearest good hull, and today that is you
//   What the player can do: Push them to the dock; or fly past — the next time you are down,
//   nobody comes
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via OTHER_SIDE_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; pushing is physical
//   contact, not steering — this plant leases nobody.
// - Cooldowns per stranger key. All session state lives on `this`, never module-level.
//
// Delivery credit requires the player's own effort: a physics:impact between the player and
// the hailed stranger inside pushWindowS, or the player actively tethered to the stranger
// (real tether seams via towWatch). A stranger that merely drifts near a dock credits nobody.

import { attachTowWatch, towTargetIdOf } from './towWatch.js';
import { plantMapOrder } from '../plantEntityViews.js';
import { indexedTypeScan } from '../../world/livingWorldViews.js';

export const PLANTS_STRANGER_HAIL_EVENT = 'plants:strangerHail';
export const PLANTS_STRANGER_DELIVERED_EVENT = 'plants:strangerDelivered';
export const PLANTS_STRANGER_PASSED_EVENT = 'plants:strangerPassed';
export const PLANTS_NO_HELP_CAME_EVENT = 'plants:noHelpCame';

export const OTHER_SIDE_TUNING = Object.freeze({
  othersRangeWu: 500,         // "the nearest good hull is you": within this of the stranger
  goodHullSpeedWu: 30,        // a good hull can actually move
  hailCooldownS: 90,          // a stranger hails once, then waits
  ignoreRangeWu: 700,         // flying past: beyond this while hailed, they give up
  dockArriveRadiusWu: 180,    // pushed to the dock: stranger inside this of a station
  pushWindowS: 8,             // your contact counts toward delivery for this long
  playerDisabledFraction: 0.3,// "the next time you are down": hull at or below this fraction
  noHelpCooldownS: 120,       // the no-help verdict, once per window
  scanBudget: 40,             // entities examined per update tick (bounded walk)
  memoryCap: 16,              // bounded stranger rows + karma row
});

export const STRANGER_HAIL_LINE = 'Hull to dock? Tow?';
export const STRANGER_DELIVERED_LINE = 'Made it. Thanks to you.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a disabled stranger who can hail — civilian, broken, not the player's own.
 */
export function isDisabledStranger(entity, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  const broken = data.disabled === true
    || (Number.isFinite(Number(entity.hull)) && Number.isFinite(Number(entity.hullMax))
      && entity.hullMax > 0 && entity.hull <= entity.hullMax * OTHER_SIDE_TUNING.playerDisabledFraction);
  return broken;
}

/**
 * Decision helper (pure): is the player the nearest good hull to this stranger?
 */
export function playerIsNearestGoodHull(player, stranger, entities, state, tuning = OTHER_SIDE_TUNING) {
  if (!player || player.alive === false || !player.pos) return false;
  if (!stranger || !stranger.pos) return false;
  const goodHull = (e) => e && e.alive !== false && e.type === 'ship' && e.id !== (state && state.playerId)
    && e.id !== stranger.id
    && !(e.data && (e.data.disabled || e.data.derelict));
  let best = null;
  let bestD = Infinity;
  for (const ent of entities) {
    if (!goodHull(ent)) continue;
    const d = Math.hypot(finite(ent.pos.x) - finite(stranger.pos.x), finite(ent.pos.z) - finite(stranger.pos.z));
    if (d < bestD) { best = ent; bestD = d; }
  }
  const playerD = Math.hypot(finite(player.pos.x) - finite(stranger.pos.x), finite(player.pos.z) - finite(stranger.pos.z));
  return playerD <= tuning.othersRangeWu && (!best || playerD <= bestD);
}

/**
 * Memory-row builder (pure): karma row + hail rows, FIFO + stale eviction at the cap.
 */
export function otherSideRowFor(memory, key, now, cap = OTHER_SIDE_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || (key !== 'karma' && old.phase === 'done')) memory.delete(id);
      }
      for (const id of memory.keys()) {
        if (memory.size < cap) break;
        if (id !== 'karma') memory.delete(id);
      }
      if (memory.size >= cap) return null;
    }
    if (key === 'karma') {
      row = { karma: 0, lastNoHelpAt: -Infinity, lastAt: now };
    } else {
      row = { phase: 'none', hailedAt: -Infinity, deadline: -Infinity, playerContactAt: -Infinity, lastAt: now };
    }
    memory.set(key, row);
  }
  return row;
}

/**
 * Standalone plant: a disabled stranger hails the nearest good hull — today, the player.
 * Push them to the dock, or fly past and owe the lane.
 */
export const otherSidePlant = {
  name: 'plantsPl251',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._otherSideMemory = new Map();
    this._otherSideTowMemory = new Map();
    this._otherSideCursor = 0;
    if (this.bus && typeof this.bus.on === 'function') {
      this._otherSideOff = [
        this.bus.on('physics:impact', (p) => this._onOtherSideImpact(p)),
        this.bus.on('sector:exit', () => this._otherSideReset()),
        this.bus.on('save:loaded', () => this._otherSideReset()),
      ];
    }
    attachTowWatch(this, 'otherSide', () => this._otherSideTowMemory);
  },

  _otherSideReset() {
    this._otherSideMemory = new Map();
    this._otherSideCursor = 0;
  },

  _otherSideTowMemoryMap() {
    if (!(this._otherSideTowMemory instanceof Map)) this._otherSideTowMemory = new Map();
    return this._otherSideTowMemory;
  },

  /** physics:impact receipt: the player's own hull contact with a hailed stranger. */
  _onOtherSideImpact(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.causalActorId !== this.state.playerId) return;
    const now = finite(this.state.simTime, 0);
    const hitId = payload.aId === this.state.playerId ? payload.bId : payload.aId;
    if (hitId == null) return;
    const row = this._otherSideMemory.get(`stranger:${hitId}`);
    if (!row || row.phase !== 'hailed' || row.entity !== this._otherSideEntityById(hitId)) return;
    row.playerContactAt = now;
    row.lastAt = now;
  },

  _otherSideEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  update() {
    if (!this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const now = finite(this.state.simTime, 0);
    const player = this._otherSideEntityById(this.state.playerId);
    if (!player || player.alive === false || !player.pos) return;

    const karmaRow = otherSideRowFor(this._otherSideMemory, 'karma', now);
    if (!karmaRow) return;
    karmaRow.lastAt = now;

    const ents = plantMapOrder(this.state);
    const budget = Math.min(OTHER_SIDE_TUNING.scanBudget, ents.length);

    for (let i = 0; i < budget; i += 1) {
      const idx = (this._otherSideCursor + i) % ents.length;
      const ent = ents[idx];
      if (!ent || ent.type !== 'ship' || ent.alive === false || ent.id === player.id) continue;
      const key = `stranger:${ent.id}`;
      let row = this._otherSideMemory.get(key);
      if (row && (row.entity !== ent || !(now >= row.lastAt))) {
        this._otherSideMemory.delete(key);
        row = null;
      }
      if (row) row.lastAt = now;

      if (!row || row.phase === 'none') {
        // Only a real hail needs a row in the bounded rescue memory.
        if (!isDisabledStranger(ent, this.state)) continue;
        if (!playerIsNearestGoodHull(player, ent, ents, this.state)) continue;
        if (row && now - row.hailedAt < OTHER_SIDE_TUNING.hailCooldownS) continue;
        row = row || otherSideRowFor(this._otherSideMemory, key, now);
        if (!row) continue;
        row.entity = ent;
        row.phase = 'hailed';
        row.hailedAt = now;
        row.deadline = now + OTHER_SIDE_TUNING.hailCooldownS;
        if (ent.data) {
          ent.data.lampsFlashing = true;
          ent.data.lampFlashUntil = now + 1.5;
        }
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_STRANGER_HAIL_EVENT, { strangerId: ent.id, t: now });
          this.bus.emit('comms:popup', {
            id: `plants:pl251:hail:${ent.id}`,
            sender: 'DISABLED HULL',
            category: 'traffic',
            text: STRANGER_HAIL_LINE,
            ttl: 6,
          });
        }
        continue;
      }

      if (row.phase === 'hailed') {
        const stranger = ent;
        if (!stranger.pos) {
          row.phase = 'none';
          continue;
        }

        // Pushed to the dock — BY YOU: delivery credits only the player's own effort (hull
        // contact inside pushWindowS, or an active tether to this stranger).
        const contactFresh = now - row.playerContactAt <= OTHER_SIDE_TUNING.pushWindowS;
        const tethered = towTargetIdOf(this.state, this._otherSideTowMemoryMap(), now) === stranger.id;
        if (contactFresh || tethered) {
          const stations = Array.isArray(this.state.stations)
            ? this.state.stations
            : indexedTypeScan(this.state, 'stations');
          for (const station of stations) {
            if (!station || station.type !== 'station' || station.alive === false || !station.pos) continue;
            const sd = station.data || {};
            if (sd.isGate || sd.isWormhole) continue;
            const d = Math.hypot(finite(stranger.pos.x) - finite(station.pos.x), finite(stranger.pos.z) - finite(station.pos.z));
            if (d <= OTHER_SIDE_TUNING.dockArriveRadiusWu) {
              row.phase = 'done';
              karmaRow.karma += 1;
              if (this.bus && typeof this.bus.emit === 'function') {
                this.bus.emit(PLANTS_STRANGER_DELIVERED_EVENT, { strangerId: stranger.id, stationId: sd.stationId || station.id, t: now });
                this.bus.emit('comms:popup', {
                  id: `plants:pl251:delivered:${stranger.id}`,
                  sender: 'DISABLED HULL',
                  category: 'traffic',
                  text: STRANGER_DELIVERED_LINE,
                  ttl: 6,
                });
                this.bus.emit('audio:cue', { id: 'confirm', position: { x: stranger.pos.x, z: stranger.pos.z }, gain: 0.6, rate: 1 });
              }
              break;
            }
          }
        }
        if (row.phase === 'done') continue;

        // Fly past: beyond ignore range while hailed, they give up on you.
        const dp = Math.hypot(finite(stranger.pos.x) - finite(player.pos.x), finite(stranger.pos.z) - finite(player.pos.z));
        if (now >= row.deadline && dp > OTHER_SIDE_TUNING.ignoreRangeWu) {
          row.phase = 'done';
          karmaRow.karma -= 1;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_STRANGER_PASSED_EVENT, { strangerId: stranger.id, karma: karmaRow.karma, t: now });
          }
        }
        continue;
      }
    }
    this._otherSideCursor = (this._otherSideCursor + budget) % Math.max(1, ents.length);

    // The next time you are down, nobody comes.
    const down = (Number.isFinite(Number(player.hull)) && Number.isFinite(Number(player.hullMax)) && player.hullMax > 0
      && player.hull <= player.hullMax * OTHER_SIDE_TUNING.playerDisabledFraction)
      || (player.data && player.data.disabled === true);
    if (down && karmaRow.karma < 0 && now - karmaRow.lastNoHelpAt >= OTHER_SIDE_TUNING.noHelpCooldownS) {
      karmaRow.lastNoHelpAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_NO_HELP_CAME_EVENT, { karma: karmaRow.karma, t: now });
        this.bus.emit('audio:cue', { id: 'ui_deny', position: { x: player.pos.x, z: player.pos.z }, gain: 0.5, rate: 0.8 });
      }
    }
  },

  destroy() {
    if (this._otherSideOff) {
      for (const off of this._otherSideOff) {
        if (typeof off === 'function') off();
      }
      this._otherSideOff = null;
    }
  },
};
