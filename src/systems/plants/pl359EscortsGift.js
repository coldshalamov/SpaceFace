// PL-359 The escort's gift — "Walk a slow convoy through dangerous water to the far end and
// they press their spare countermeasure on you at the gate."
// What the player can do: Arrive with them; or peel off at the last leg — gifts need
// arrivals, and convoys remember departures.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; anchors via
//   hash32. No Three.js/DOM.
// - SEAM NOTE (honest): the only scripted convoys are claim-relay mules owned by npcJobs, so
//   this plant authors its slow convoy (darkStretch convention): a leader + trailer walking a
//   leased line from a fixed start to the sector's REAL gate (a data.isGate body; else a
//   deterministic far point). "Dangerous water" = real hostile hulls in the sector at arming
//   or during the walk. Escorting = staying inside escort range from arming to arrival.
//   The gift is a real story-prop canister (their spare countermeasure) pressed on you at the
//   gate. Peeling off inside the last leg is remembered: the next convoy in that sector
//   refuses.
// - NPC movement ONLY via requestTrafficReaction (ambient hulls: direct intent write stands).
// - Bounded Maps with tuning.memoryCap; RESET on sector:exit / save:loaded / game:new /
//   game:newGame; destroy() unsubscribes + despawns owned.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_ESCORT_EVENT = 'plants:pl359:escort';

export const ESCORT_TUNING = Object.freeze({
  plId: 'pl359',
  walkSpeedWu: 26,           // a slow convoy
  escortRangeWu: 200,
  arriveRangeWu: 70,         // the far end
  lastLegFrac: 0.7,          // peel off inside this and they remember
  convoyGrudgeS: 1200,       // convoys remember departures
  memoryCap: 4,
});

export const CONVOY_CALLSIGN = 'SLOW CONVOY';

/** Pure: a real hostile hull (the dangerous water). */
export function isHostileHull(e, state = null) {
  if (!e || e.alive === false || e.type !== 'ship') return false;
  if (state && e.id === state.playerId) return false;
  const d = e.data || {};
  if (d.isGate || d.isWormhole || d.disabled || d.derelict) return false;
  const ai = d.ai || {};
  return ai.hostile === true || d.isHostile === true || e.team === 1;
}

export function createPl359EscortsGift() {
  return {
    name: 'plantsPl359',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._owned = new Map();     // id -> kind
      this._convoy = null;         // { leaderId, trailerId, gateId, gatePos, startAt, dangerSeen, walked, total }
      this._grudgeUntil = -Infinity;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p = {}) => this._onSectorEnter(p));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      const rm = this.helpers && this.helpers.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._owned.keys()) rm(id);
      }
      if (this._owned) this._owned.clear();
      this._convoy = null;
      this._grudgeUntil = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _entities() {
      const s = this.state;
      const ents = s && s.entities;
      if (ents && typeof ents.values === 'function') return [...ents.values()];
      if (Array.isArray(ents)) return ents;
      return Array.isArray(s && s.entityList) ? s.entityList : [];
    },

    _findGate(player) {
      let gate = null;
      let gateD = Infinity;
      for (const e of this._entities()) {
        if (!e || e.alive === false || !e.pos) continue;
        const d = e.data || {};
        if (d.isGate !== true) continue;
        const dd = player ? Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) : dd0(e.pos);
        if (dd < gateD) { gateD = dd; gate = e; }
      }
      if (gate) return { id: gate.id, pos: { x: gate.pos.x, z: gate.pos.z } };
      // No gate built here: a deterministic far point.
      const sectorId = (this.state.world && this.state.world.currentSectorId) || 's1';
      const h = hash32('plantsPl359Far', sectorId);
      return { id: null, pos: { x: 600 + (h % 900), z: -400 + ((h >>> 8) % 900) } };
    },

    _onSectorEnter(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      if (now < this._grudgeUntil) return; // convoys remember departures
      const dangerous = this._entities().some((e) => isHostileHull(e, s));
      if (!dangerous) return;
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player || !player.pos) return;
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function') return;
      const gate = this._findGate(player);
      const start = { x: player.pos.x + 220, z: player.pos.z - 120 };
      const spec = makeShipEntitySpec('ship_mule', {
        team: 2, factionId: 'faction_free', pos: { x: start.x, z: start.z },
        ai: { archetype: 'hauler', passive: true },
      });
      const leader = spawnEntity(spec);
      if (!leader || leader.id == null) return;
      leader.data = leader.data || {};
      leader.data.callsign = CONVOY_CALLSIGN;
      leader.data.plants = { ...(leader.data.plants || {}), [ESCORT_TUNING.plId]: { role: 'convoy_leader' } };
      const spec2 = makeShipEntitySpec('ship_mule', {
        team: 2, factionId: 'faction_free', pos: { x: start.x + 26, z: start.z + 18 },
        ai: { archetype: 'hauler', passive: true },
      });
      const trailer = spawnEntity(spec2);
      if (trailer && trailer.id != null) {
        trailer.data = trailer.data || {};
        trailer.data.plants = { ...(trailer.data.plants || {}), [ESCORT_TUNING.plId]: { role: 'convoy_trailer' } };
      }
      this._owned.set(leader.id, 'leader');
      if (trailer && trailer.id != null) this._owned.set(trailer.id, 'trailer');
      const total = Math.hypot(gate.pos.x - start.x, gate.pos.z - start.z);
      this._convoy = {
        leaderId: leader.id,
        trailerId: trailer && trailer.id != null ? trailer.id : null,
        gateId: gate.id,
        gatePos: gate.pos,
        startAt: now,
        dangerSeen: false,
        walked: 0,
        total,
        lastX: start.x,
        lastZ: start.z,
      };
      const id = `plants:pl359:convoy:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: CONVOY_CALLSIGN, category: 'traffic', text: 'A slow convoy, walking for the gate. The water is not kind.', ttl: 7, persist: false });
      this.bus.emit(PLANTS_ESCORT_EVENT, { kind: 'convoy_formed', leaderId: leader.id, gateId: gate.id, t: now });
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const convoy = this._convoy;
      if (!convoy) return;
      const now = this._now();
      const leader = s.entities && s.entities.get ? s.entities.get(convoy.leaderId) : null;
      const trailer = convoy.trailerId != null && s.entities && s.entities.get
        ? s.entities.get(convoy.trailerId) : null;
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!leader || leader.alive === false || !leader.pos) { this._endConvoy('lost'); return; }

      // The walk: a leased line toward the gate, slow.
      const aim = Math.atan2(convoy.gatePos.z - leader.pos.z, convoy.gatePos.x - leader.pos.x);
      requestTrafficReaction(this, leader, {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
      }, 2);
      if (trailer && trailer.alive !== false && trailer.pos) {
        const trail = Math.atan2(leader.pos.z - trailer.pos.z, leader.pos.x - trailer.pos.x);
        requestTrafficReaction(this, trailer, {
          moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: trail, brake: false,
        }, 2);
      }
      convoy.walked += Math.hypot(leader.pos.x - convoy.lastX, leader.pos.z - convoy.lastZ);
      convoy.lastX = leader.pos.x;
      convoy.lastZ = leader.pos.z;

      if (!convoy.dangerSeen && this._entities().some((e) => {
        if (!isHostileHull(e, s) || !e.pos) return false;
        const d = Math.hypot(e.pos.x - leader.pos.x, e.pos.z - leader.pos.z);
        return d <= 400;
      })) {
        convoy.dangerSeen = true;
        this.bus.emit(PLANTS_ESCORT_EVENT, { kind: 'danger', leaderId: leader.id, t: now });
      }

      const progress = convoy.total > 0 ? Math.min(1, convoy.walked / convoy.total) : 0;
      const arrived = Math.hypot(leader.pos.x - convoy.gatePos.x, leader.pos.z - convoy.gatePos.z) <= ESCORT_TUNING.arriveRangeWu;
      const escorting = player && player.pos
        && Math.hypot(player.pos.x - leader.pos.x, player.pos.z - leader.pos.z) <= ESCORT_TUNING.escortRangeWu;

      if (!escorting && progress < ESCORT_TUNING.lastLegFrac) {
        // Peeling off early: no gift, no grudge yet — gifts need arrivals.
        this._endConvoy('peeled_early');
        return;
      }
      if (!escorting && progress >= ESCORT_TUNING.lastLegFrac) {
        // Peel off at the last leg: convoys remember departures.
        this._endConvoy('peeled_last_leg');
        this._grudgeUntil = now + ESCORT_TUNING.convoyGrudgeS;
        const id = `plants:pl359:remember:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: CONVOY_CALLSIGN, category: 'traffic', text: 'Gifts need arrivals. Convoys remember departures.', ttl: 7, persist: false });
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.45, rate: 0.9 });
        this.bus.emit(PLANTS_ESCORT_EVENT, { kind: 'remembered', until: this._grudgeUntil, t: now });
        return;
      }
      if (arrived) {
        this._arrive(leader, player, now);
      }
    },

    _arrive(leader, player, now) {
      // Arrived with them: they press their spare countermeasure on you at the gate.
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity === 'function' && player && player.pos) {
        const ent = spawnEntity({
          type: 'beacon',
          pos: { x: player.pos.x + 12, z: player.pos.z - 8 },
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_spare_countermeasure',
            plantsPl359Gift: true,
            scanLabel: 'Their spare countermeasure, pressed on you at the gate',
            swarmFloorPad: { label: 'SPARE CM — YOURS' },
            masslineTetherable: true,
          },
        });
        if (ent && ent.id != null) this._owned.set(ent.id, 'gift');
      }
      const data = leader.data || (leader.data = {});
      data.lampsFlashing = true;
      data.lampFlashUntil = now + 1.2;
      const id = `plants:pl359:gift:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: CONVOY_CALLSIGN, category: 'traffic', text: 'At the gate, their spare countermeasure is in your hands. No charge.', ttl: 8, persist: false });
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
      this.bus.emit(PLANTS_ESCORT_EVENT, { kind: 'gift', leaderId: leader.id, t: now });
      this._endConvoy('arrived');
    },

    _endConvoy(why) {
      const rm = this.helpers && this.helpers.removeEntity;
      const s = this.state;
      if (s) {
        const leader = this._convoy && s.entities && s.entities.get
          ? s.entities.get(this._convoy.leaderId) : null;
        const trailer = this._convoy && this._convoy.trailerId != null && s.entities && s.entities.get
          ? s.entities.get(this._convoy.trailerId) : null;
        if (leader) releaseTrafficReaction(this, leader);
        if (trailer) releaseTrafficReaction(this, trailer);
      }
      if (typeof rm === 'function') {
        for (const [id, kind] of this._owned) {
          if (kind !== 'gift') rm(id);
        }
      }
      for (const [id, kind] of this._owned) {
        if (kind === 'gift') this._owned.delete(id);
      }
      this._convoy = null;
      this.bus.emit(PLANTS_ESCORT_EVENT, { kind: 'ended', why, t: this._now() });
    },
  };
}

function dd0(pos) {
  return Math.hypot(Number(pos && pos.x) || 0, Number(pos && pos.z) || 0);
}

export const pl359EscortsGift = createPl359EscortsGift();
