// PL-201 The odd queue — "Outside Yusuf Tane's fitting berth, mismatched hulls queue in
// silence — the half-legal, the ugly, the wrong | Bring your worst; or count the hulls and
// wonder at all of it"
//
// SEAM NOTE (honest): Sker Bazaar is the station_sker body in sector_sker_haven
// (src/data/sectors.js:1102). The odd queue is a fixed line of slots laid off the live
// station body; slot 0 is Yusuf Tane's fitting berth lamp. The mismatched hulls are real
// neutral strangers (makeShipEntitySpec, team 2, passive, station faction) parked nose-in
// at the tail slots. Park at the tail and the queue advances one slot to take you —
// silence, no honking. Bump a queued hull and the queue will not move for the shift.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the berth
//   lamp and the queued hulls, clears session state. Maps bounded by tuning.memoryCap.
// - Queue advance is cooldown-gated (advanceCooldownS); a bumped hull blocks the shift.

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_201_JOIN_EVENT = 'plants:pl201:joined';
export const PL_201_ADVANCE_EVENT = 'plants:pl201:advanced';
export const PL_201_BUMPED_EVENT = 'plants:pl201:bumped';

export const ODD_QUEUE_TUNING = Object.freeze({
  sectorId: 'sector_sker_haven',
  stationId: 'station_sker',
  queueCount: 3,              // mismatched hulls behind the berth
  slotSpacingWu: 55,
  berthOffsetWu: 240,         // berth lamp sits this far off the station body
  bearingSalt: 'plantsPl201Queue',
  hullDefs: Object.freeze(['ship_kestrel', 'ship_mule', 'ship_drifter']),
  factionId: 'faction_reach', // station_sker's faction
  joinGateSpeed: 5,           // park this slow to join
  joinHoldS: 6,               // hold the tail slot this long
  advanceCooldownS: 30,       // the queue never advances twice in a hurry
  bumpColdS: 90,              // a bumped hull freezes the queue for the shift
  hullRadius: 8,
  memoryCap: 6,
});

/** Fixed queue layout off the live station body: index 0 is the berth lamp, 1..queueCount
 *  are the queued hulls, queueCount+1 is the open tail slot a joiner is taken into. */
export function queueSlotsFor(origin, t = ODD_QUEUE_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const slots = [];
  for (let i = 0; i <= t.queueCount + 1; i += 1) {
    const along = t.berthOffsetWu + i * t.slotSpacingWu;
    slots.push({ x: origin.x + dir.x * along, z: origin.z + dir.z * along });
  }
  return slots;
}

function stationOf(state, stationId) {
  if (!state) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  const pools = [];
  if (list.length) pools.push(list);
  if (state.entities && typeof state.entities.values === 'function') pools.push([...state.entities.values()]);
  for (const pool of pools) {
    for (const e of pool) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      if (((e.data && e.data.stationId) || e.id) === stationId) return e;
    }
  }
  return null;
}

export function createPl201OddQueue() {
  return {
    name: 'plantsPl201',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._berthId = null;
      this._hullIds = [];         // tail hulls, index 0 nearest the berth
      this._holdSince = null;
      this._lastAdvanceAt = -Infinity;
      this._blockedUntil = null;
      this._joined = false;
      this._advancedForJoin = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('sector:exit', () => this._drop());
      on('save:loaded', () => this._drop());
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._drop();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._berthId != null) rm(this._berthId);
        for (const id of this._hullIds || []) rm(id);
      }
      this._berthId = null;
      this._hullIds = [];
      this._holdSince = null;
      this._lastAdvanceAt = -Infinity;
      this._blockedUntil = null;
      this._joined = false;
      this._advancedForJoin = false;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _ensure(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = ODD_QUEUE_TUNING;
      const slots = queueSlotsFor(origin, t);
      if (this._berthId == null) {
        const berth = spawn({
          type: 'beacon',
          pos: { x: slots[0].x, z: slots[0].z },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_fitting_berth',
            plantsPl201Berth: true,
            scanLabel: 'Yusuf Tane\u2019s fitting berth — the odd queue',
            swarmFloorPad: { label: 'The fitting berth' },
            lampsFlashing: true,
          },
        });
        if (berth && berth.id != null) this._berthId = berth.id;
      }
      // Mismatched hulls queue nose-in behind the berth, in silence.
      while (this._hullIds.length < t.queueCount) {
        const i = this._hullIds.length;
        const spec = makeShipEntitySpec(t.hullDefs[i % t.hullDefs.length], {
          team: 2,
          factionId: t.factionId,
          pos: { x: slots[i + 1].x, z: slots[i + 1].z },
          rot: Math.atan2(slots[0].z - slots[i + 1].z, slots[0].x - slots[i + 1].x),
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl201Queued = true;
        spec.data.parentType = 'story_prop';
        spec.data.queueSlot = i + 1;
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._hullIds.push(ent.id);
        else break;
      }
    },

    _slotPos(origin, slot) {
      const slots = queueSlotsFor(origin, ODD_QUEUE_TUNING);
      return slots[Math.min(slot, slots.length - 1)];
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p) return;
      const hit = [p.aId, p.bId]
        .map((id) => (id != null && s.entities?.get ? s.entities.get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl201Queued === true);
      if (!hit) return;
      const otherId = p.aId === hit.id ? p.bId : p.aId;
      if (otherId !== s.playerId) return;
      const now = this._now();
      this._blockedUntil = now + ODD_QUEUE_TUNING.bumpColdS;
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_201_BUMPED_EVENT, { hullId: hit.id, t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== ODD_QUEUE_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, ODD_QUEUE_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const t = ODD_QUEUE_TUNING;
      const now = this._now();
      this._ensure(station.pos);

      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const slots = queueSlotsFor(station.pos, t);
      const tailSlot = this._hullIds.length + 1 - (this._joined ? 1 : 0);
      const tail = slots[Math.min(tailSlot, slots.length - 1)];
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const dTail = Math.hypot(player.pos.x - tail.x, player.pos.z - tail.z);

      // Hold the tail slot slow, and the queue takes you: one slot of silence.
      // A bumped queue keeps its place: it takes and advances nobody while cold.
      const cold = this._blockedUntil != null && now < this._blockedUntil;
      if (!this._joined && !cold && dTail <= t.hullRadius * 2 && speed <= t.joinGateSpeed) {
        if (this._holdSince == null) this._holdSince = now;
        else if (now - this._holdSince >= t.joinHoldS) {
          this._joined = true;
          this._holdSince = null;
          this.bus?.emit('comms:popup', {
            id: `plants:pl201:joined:${Math.round(now)}`,
            sender: 'Yusuf Tane',
            category: 'traffic',
            text: 'Bring your worst.',
            ttl: 7,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'confirm' });
          this.bus?.emit(PL_201_JOIN_EVENT, { slot: tailSlot, t: now });
        }
      } else if (dTail > t.hullRadius * 4) {
        this._holdSince = null;
        if (this._joined) {
          // You left: the queue closes up behind you.
          this._joined = false;
          this._advancedForJoin = false;
        }
      }

      // The queue advances one slot the moment it takes you — the head hull steps into the
      // fitting berth — and never again for the same join. A bumped queue keeps its place.
      const canAdvance = now >= this._lastAdvanceAt + t.advanceCooldownS
        && (this._blockedUntil == null || now >= this._blockedUntil);
      if (canAdvance && this._joined && !this._advancedForJoin) {
        this._lastAdvanceAt = now;
        this._advancedForJoin = true;
        let moved = false;
        for (let i = 0; i < this._hullIds.length; i += 1) {
          const hull = s.entities?.get ? s.entities.get(this._hullIds[i]) : null;
          const slot = this._slotPos(station.pos, i);
          if (hull?.pos && Math.hypot(hull.pos.x - slot.x, hull.pos.z - slot.z) > 1) {
            hull.pos.x = slot.x;
            hull.pos.z = slot.z;
            moved = true;
          }
        }
        this.bus?.emit(PL_201_ADVANCE_EVENT, { hulls: this._hullIds.length, moved, t: now });
      }
    },
  };
}

export const pl201OddQueue = createPl201OddQueue();
