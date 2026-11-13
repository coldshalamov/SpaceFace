// PL-105 The standoff — Tethys (design/program/INFERENCE_PLANTS.md, row PL-105).
// "The standoff. Where the two halves' queues merge at the border gate, one Customs ship
// and one Pitborn ship end up nose to nose — every shift, neither yielding."
// What the player can do: Shove them apart and both halves honk thanks; or nudge your
// side's ship through, and the other half closes ranks on you for a week.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The border-gate merge sits on the docking ring (station-bubble multiplier 2.4x over
//   dockRadius, src/data/stationBubbles.js BUBBLE_MULTIPLIERS); the closure bark radius is
//   the noFire ring (1.5x).
// - Nearest-station walk runs off a 1 Hz accumulator (stationSideEventDirector pattern).
// - The shove verdict reads the REAL physics:impact receipt: player-involved impulse over
//   the tuning gate, judged by the impact normal against the partner bearing. A push away
//   from the partner parts the pair; a push through the gate closes the other half's ranks.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time. NPC ships spawn through
//   helpers.spawnEntity(makeShipEntitySpec(...)) as passive team-2 traffic (traffic.js pattern).
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_105_PARTED_EVENT = 'plants:pl105:parted';
export const PL_105_RANK_CLOSED_EVENT = 'plants:pl105:rankClosed';

export const STANDOFF_TUNING = Object.freeze({
  anchorStationId: 'station_customs',   // the border gate on the Tethys seam
  shiftLengthS: 150,                    // one queue merge per shift
  standoffRadiusMult: BUBBLE_MULTIPLIERS.docking,  // 2.4x — merge point on the docking ring
  barkRadiusMult: BUBBLE_MULTIPLIERS.noFire,       // 1.5x — the closed-ranks bark range
  noseGapWu: 26,                        // nose to nose
  shoveImpulseMin: 300,                 // a shove, not a bump
  throughDot: 0.35,                     // normal·towardPartner above this = pushed THROUGH
  honkGoS: 4,                           // honked thanks, then both halves move on
  rankCloseS: 1680,                     // a week of yard shifts (7 x 240 s day)
  closureBarkCooldownS: 45,
  memoryCap: 8,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

function stationsOf(state) {
  const idx = state && state.entityIndex;
  if (idx && Array.isArray(idx.stations) && idx.stations.length) return idx.stations;
  const list = state && state.entityList;
  if (Array.isArray(list)) return list.filter((e) => e && e.type === 'station');
  const out = [];
  const ents = state && state.entities;
  if (ents && typeof ents.values === 'function') {
    for (const e of ents.values()) if (e && e.type === 'station') out.push(e);
  }
  return out;
}

/** Nearest station matching stationId (or any station when null), from the player. */
export function nearestStationOf(state, stationId = null) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return null;
  let best = null;
  let bestD2 = Infinity;
  for (const st of stationsOf(state)) {
    if (!st || st.alive === false || st.type !== 'station') continue;
    if (stationId && (st.data && st.data.stationId || st.id) !== stationId) continue;
    const dx = st.pos.x - player.pos.x;
    const dz = st.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = st; }
  }
  return best;
}

export function mergePointFor(station, shiftIndex, seed, t = STANDOFF_TUNING) {
  const a = (hash32(seed, 'pl105', shiftIndex) % 6283) / 1000;
  const r = dockRadiusOf(station) * t.standoffRadiusMult;
  const n = { x: Math.cos(a), z: Math.sin(a) };
  return {
    x: station.pos.x + n.x * r,
    z: station.pos.z + n.z * r,
    n,
  };
}

export function createPl105Standoff() {
  return {
    name: 'plantsPl105',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._pair = null;          // { customsId, pitbornId, merge, shiftIndex, partedAt }
      this._seenShift = -1;       // one standoff per shift
      this._rankClosedUntil = -Infinity;
      this._lastClosureBark = -Infinity;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
    },

    _reset() {
      this._removeOwned();
      this._pair = null;
      this._accum = 0;
    },

    _removeOwned() {
      const rm = this.helpers && this.helpers.removeEntity;
      if (typeof rm !== 'function' || !this._pair) return;
      for (const id of [this._pair.customsId, this._pair.pitbornId]) {
        if (id != null) rm(id);
      }
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 7) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.5) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('audio:cue', { id, gain });
    },

    _spawnPair(station, now) {
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = STANDOFF_TUNING;
      const seed = this.state && this.state.meta && this.state.meta.seed;
      const shiftIndex = Math.floor(now / t.shiftLengthS);
      const m = mergePointFor(station, shiftIndex, seed, t);
      const half = t.noseGapWu / 2;
      const posA = { x: m.x + m.n.x * half, z: m.z + m.n.z * half };
      const posB = { x: m.x - m.n.x * half, z: m.z - m.n.z * half };
      const mk = (side, pos, face) => {
        const spec = makeShipEntitySpec('ship_kestrel', {
          team: 2,
          factionId: side === 'customs' ? 'faction_scn' : 'faction_pit',
          pos,
          rot: Math.atan2(face.x, -face.z),
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl105 = side;
        spec.data.callsign = side === 'customs' ? 'Customs queue' : 'Pitborn queue';
        spec.data.swarmFloorPad = { label: side === 'customs' ? 'CUSTOMS QUEUE' : 'PITBORN QUEUE' };
        return spawn(spec);
      };
      const a = mk('customs', posA, { x: -m.n.x, z: -m.n.z });
      const b = mk('pitborn', posB, { x: m.n.x, z: m.n.z });
      if (!a || !b) return;
      this._pair = { customsId: a.id, pitbornId: b.id, merge: m, shiftIndex, partedAt: null };
      this._seenShift = shiftIndex;
    },

    /** One queued merge per shift while the border gate is the anchor. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz — no per-frame work
      this._accum = 0;

      // A parted pair honks and goes.
      if (this._pair && this._pair.partedAt != null && now - this._pair.partedAt >= STANDOFF_TUNING.honkGoS) {
        this._removeOwned();
        this._pair = null;
      }

      const station = nearestStationOf(s, STANDOFF_TUNING.anchorStationId);
      if (!station) return;
      const shiftIndex = Math.floor(now / STANDOFF_TUNING.shiftLengthS);
      if (!this._pair && shiftIndex !== this._seenShift && now >= this._rankClosedUntil) {
        this._spawnPair(station, now);
      }
      if (this._pair && this._pair.partedAt == null) {
        this._holdPair(station, now);
      }
      // The wrong choice echoes: while ranks are closed, the gate half barks at the player.
      if (now < this._rankClosedUntil && now - this._lastClosureBark >= STANDOFF_TUNING.closureBarkCooldownS) {
        const player = s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
        const barkR = dockRadiusOf(station) * STANDOFF_TUNING.barkRadiusMult;
        if (player && player.pos) {
          const d = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
          if (d <= barkR) {
            this._lastClosureBark = now;
            this._popup(`plants:pl105:bark:${Math.round(now)}`, 'Pitborn queue',
              'Closed ranks. Come back when the week is out.');
            this._cue('ui_deny', 0.4);
          }
        }
      }
    },

    // Neither yields: hold the two hulls nose to nose for the shift.
    _holdPair(station, now) {
      const pair = this._pair;
      if (!this.state || !this.state.entities || typeof this.state.entities.get !== 'function') return;
      const get = (id) => this.state.entities.get(id);
      const a = get(pair.customsId);
      const b = get(pair.pitbornId);
      if (!a || !b || a.alive === false || b.alive === false) { this._pair = null; return; }
      const t = STANDOFF_TUNING;
      const half = t.noseGapWu / 2;
      if (a.pos) { a.pos.x = pair.merge.x + pair.merge.n.x * half; a.pos.z = pair.merge.z + pair.merge.n.z * half; }
      if (b.pos) { b.pos.x = pair.merge.x - pair.merge.n.x * half; b.pos.z = pair.merge.z - pair.merge.n.z * half; }
    },

    /** A shove is a real player-involved impact receipt over the impulse gate, judged by
     *  the impact normal against the partner bearing: away parts the pair, through closes ranks. */
    _onImpact(p) {
      const pair = this._pair;
      if (!pair || pair.partedAt != null || !p || !p.playerInvolved) return;
      if (!(Number(p.impulse) >= STANDOFF_TUNING.shoveImpulseMin)) return;
      let member = null;
      let partnerId = null;
      let side = null;
      if (p.aId === pair.customsId) { member = 'a'; partnerId = pair.pitbornId; side = 'customs'; }
      else if (p.bId === pair.customsId) { member = 'b'; partnerId = pair.pitbornId; side = 'customs'; }
      else if (p.aId === pair.pitbornId) { member = 'a'; partnerId = pair.customsId; side = 'pitborn'; }
      else if (p.bId === pair.pitbornId) { member = 'b'; partnerId = pair.customsId; side = 'pitborn'; }
      if (!side) return;
      const now = this._now();
      if (!this.state || !this.state.entities || typeof this.state.entities.get !== 'function') return;
      const get = (id) => this.state.entities.get(id);
      const partner = get(partnerId);
      const body = get(p[member === 'a' ? 'aId' : 'bId']);
      if (!partner || !partner.pos || !body || !body.pos) return;
      const tx = partner.pos.x - body.pos.x;
      const tz = partner.pos.z - body.pos.z;
      const len = Math.hypot(tx, tz) || 1;
      const dot = (Number(p.normal && p.normal.x) * tx + Number(p.normal && p.normal.z) * tz) / len;
      if (dot > STANDOFF_TUNING.throughDot) {
        // Nudged through the gate: the other half closes ranks on the player for a week.
        this._rankClosedUntil = now + STANDOFF_TUNING.rankCloseS;
        this._popup(`plants:pl105:closed:${Math.round(now)}`, side === 'customs' ? 'Pitborn queue' : 'Customs queue',
          'Ranks close around the gate. A week, no thanks.');
        this._cue('ui_deny', 0.6);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PL_105_RANK_CLOSED_EVENT, { side, until: this._rankClosedUntil, t: now });
        }
        this._removeOwned();
        this._pair = null;
        return;
      }
      // Shoved apart: both halves honk thanks.
      pair.partedAt = now;
      this._popup(`plants:pl105:thanks_a:${Math.round(now)}`, 'Customs queue', 'Two short honks — thanks.');
      this._popup(`plants:pl105:thanks_b:${Math.round(now)}`, 'Pitborn queue', 'Two short honks — thanks.');
      this._cue('confirm', 0.5);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PL_105_PARTED_EVENT, { side, t: now });
      }
    },

    _onKilled(p) {
      if (!this._pair || p.id !== this._pair.customsId && p.id !== this._pair.pitbornId) return;
      this._removeOwned();
      this._pair = null;
    },
  };
}

export const pl105Standoff = createPl105Standoff();
