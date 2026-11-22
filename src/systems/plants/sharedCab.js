// PL-301 The shared cab — "Two strangers bound for the same junction offer to draft with
// you, three ships pacing one another to split the fuel burn.
// Agree and fly the line; or draft along uninvited — pacing clubs do not invite loners twice"
//
// A seeded chance meeting: two strangers form a pacing pair near the player, bound for the
// nearest junction (a transit gate), and make one invite on the shared channel — a slot
// abeam of the pair, three ships abreast. The offer window is short.
//
// - Agree and fly the line: hold the abeam slot through the window and the club flies — the
//   pair steers to match your heading (traffic reaction lease, abort on refusal), and while
//   three abreast hold the line, the split burn drops real fuel pods at the line's center
//   every dividendEveryS. At the junction: lamps and one sign-off.
// - Draft along uninvited: sit in their draft corridor (directly astern of the trailing
//   ship) through the whole window without taking the slot — you take the benefit without
//   joining, and pacing clubs do not invite loners twice: for a season clubs still form on
//   the route but never invite, never slot, never split.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; the pair steers only through the reaction lease (abort on
//   refusal); the player is never steered and never the NPC.
// - Physical: the slot is real proximity geometry; the split is real fuel pods.
// - No economy mutations: pods are props. Bounded Maps capped by tuning.memoryCap; caps:
//   one club (two strangers) live; cooldowns; TTL despawns; nothing runs while docked.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const SHARED_CAB_EVENT = 'plants:sharedCab';

export const SHARED_CAB_TUNING = Object.freeze({
  plId: 'pl301',
  spawnChancePct: 50,
  pairCount: 2,                // two strangers, one club
  slotRangeWu: 70,             // the abeam slot's tolerance
  draftRangeWu: 80,            // the astern draft corridor
  offerWindowS: 20,            // agree in this long or not at all
  lineTicksNeeded: 4,          // hold the line this many sweeps before the split starts
  dividendEveryS: 12,          // the split burn's cadence
  tripWindowS: 100,            // the shared leg's length
  arriveGateRangeWu: 300,      // the junction ends the leg
  lonerSeasonS: 1200,          // "do not invite loners twice"
  strangerTtlS: 300,
  podTtlS: 120,
  podAmount: 1,
  podRadius: 5,
  memoryCap: 8,
});

export const SHARED_CAB_CALLSIGN = 'PACING CLUB';
export const SHARED_CAB_INVITE_LINE = 'Room for three. Split the burn.';
export const SHARED_CAB_SIGNOFF_LINE = 'Cab settled. Good line.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: the club's slot point — abeam of the pair's lead, on the player's side. */
export function slotPointFor(pairPos, pairRot, side, distanceWu = 90) {
  const rot = finite(pairRot, 0);
  const px = finite(pairPos && pairPos.x);
  const pz = finite(pairPos && pairPos.z);
  const perpX = -Math.sin(rot);
  const perpZ = Math.cos(rot);
  return { x: px + perpX * side * finite(distanceWu, 90), z: pz + perpZ * side * finite(distanceWu, 90) };
}

/**
 * Pure: is the player lurking in the draft corridor (inside asternDist directly behind the
 * trailing ship) rather than flying the slot?
 */
export function isLurkingAstern(playerPos, trailPos, trailRot, asternDist, corridorHalfWidthWu) {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const tx = finite(trailPos && trailPos.x);
  const tz = finite(trailPos && trailPos.z);
  const rot = finite(trailRot, 0);
  const dx = px - tx;
  const dz = pz - tz;
  const along = dx * Math.cos(rot) + dz * Math.sin(rot); // + is ahead of the trail ship
  if (along > -6 || along < -finite(asternDist, 0)) return false;
  const lateral = Math.abs(dx * -Math.sin(rot) + dz * Math.cos(rot));
  return lateral <= finite(corridorHalfWidthWu, 0);
}

export const sharedCabPlant = {
  modes: ['flight'],
  name: 'plants301',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._accum += finite(dt, 0);
    if (this._accum < 1) return;
    this._accum = 0;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const lead = this._entity(enc.leadId);
    const trail = this._entity(enc.trailId);
    const player = this._player();
    if (!lead || lead.alive === false || !player || !player.pos) { this._memory.delete('enc'); return; }

    // The pair's heading: toward the junction gate.
    const gate = this._nearestGate(lead.pos);
    let pairRot = finite(lead.rot, 0);
    if (gate && gate.pos) {
      pairRot = Math.atan2(finite(gate.pos.z) - finite(lead.pos.z), finite(gate.pos.x) - finite(lead.pos.x));
      this._steer(lead, { x: finite(gate.pos.x), z: finite(gate.pos.z) });
      if (trail) {
        const trailPoint = { x: finite(gate.pos.x) - Math.cos(pairRot) * 70, z: finite(gate.pos.z) - Math.sin(pairRot) * 70 };
        this._steer(trail, trailPoint);
      }
    }

    // Offer window: agree and fly the line, or lurk astern uninvited.
    const inWindow = now - enc.startedAt <= SHARED_CAB_TUNING.offerWindowS;
    if (inWindow && !enc.agreed && !enc.loner) {
      const slot = slotPointFor(lead.pos, pairRot, enc.slotSide);
      const inSlot = this._dist(slot, player.pos) <= SHARED_CAB_TUNING.slotRangeWu;
      if (inSlot) {
        enc.agreed = true;
        this.bus.emit(SHARED_CAB_EVENT, { kind: 'agreed', leadId: enc.leadId, t: now });
      } else if (trail && isLurkingAstern(player.pos, trail.pos, pairRot,
        SHARED_CAB_TUNING.draftRangeWu, 30)) {
        enc.lurkTicks = (enc.lurkTicks || 0) + 1;
        if (enc.lurkTicks >= Math.max(2, Math.floor(SHARED_CAB_TUNING.offerWindowS / 2))) {
          // Draft along uninvited: the club closes formation and never invites you again.
          enc.loner = true;
          this._capMemory();
          this._memory.set('loner', { until: now + SHARED_CAB_TUNING.lonerSeasonS });
          this.bus.emit(SHARED_CAB_EVENT, {
            kind: 'uninvited', leadId: enc.leadId, until: now + SHARED_CAB_TUNING.lonerSeasonS, t: now,
          });
        }
      }
    }

    // The line: only a joined club splits the burn.
    if (enc.agreed && !enc.loner) {
      const slot = slotPointFor(lead.pos, pairRot, enc.slotSide);
      const inSlot = this._dist(slot, player.pos) <= SHARED_CAB_TUNING.slotRangeWu * 1.4;
      if (inSlot) enc.lineTicks = (enc.lineTicks || 0) + 1;
      else enc.lineTicks = Math.max(0, (enc.lineTicks || 0) - 1);
      if ((enc.lineTicks || 0) >= SHARED_CAB_TUNING.lineTicksNeeded
          && now - (enc.lastSplitAt || -Infinity) >= SHARED_CAB_TUNING.dividendEveryS) {
        enc.lastSplitAt = now;
        const mid = {
          x: (finite(lead.pos.x) + finite(player.pos.x)) / 2,
          z: (finite(lead.pos.z) + finite(player.pos.z)) / 2,
        };
        const pod = this._dropFuelPod(mid, now);
        this.bus.emit(SHARED_CAB_EVENT, { kind: 'split_burn', podId: pod ? pod.id : null, t: now });
      }
    }

    // The junction: lamps and the sign-off for a club that flew the line.
    const arrived = (gate && this._dist(gate.pos, player.pos) <= SHARED_CAB_TUNING.arriveGateRangeWu)
      || now - enc.startedAt >= SHARED_CAB_TUNING.tripWindowS;
    if (arrived && !enc.signedOff) {
      enc.signedOff = true;
      if (enc.agreed && !enc.loner) {
        lead.data.lampsFlashing = true;
        lead.data.lampFlashUntil = now + 1.2;
        this._comms(`plants:${SHARED_CAB_TUNING.plId}:signoff:${now}`,
          SHARED_CAB_CALLSIGN, SHARED_CAB_SIGNOFF_LINE, 6);
        this.bus.emit(SHARED_CAB_EVENT, { kind: 'arrived_together', leadId: enc.leadId, t: now });
      }
      this._endClub();
    }
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
  },

  // ---- internals ----

  _flight() {
    return !!this.state && (this.state.mode == null || this.state.mode === 'flight');
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _dist(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return Infinity;
    return Math.hypot(a.x - b.x, a.z - b.z);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s) return null;
    if (s.entities && typeof s.entities.get === 'function') return s.entities.get(id) || null;
    if (Array.isArray(s.entityList)) return s.entityList.find((e) => e && e.id === id) || null;
    return null;
  },

  _nearestGate(pos) {
    const s = this.state;
    const list = (s.entityIndex && Array.isArray(s.entityIndex.stations)) ? s.entityIndex.stations : [];
    let best = null;
    let bestD = Infinity;
    for (const st of list) {
      const d = st && st.data;
      if (!st || st.alive === false || st.type !== 'station' || !d || d.isGate !== true) continue;
      const dist = this._dist(st.pos, pos);
      if (dist < bestD) { bestD = dist; best = st; }
    }
    return best;
  },

  _capMemory() {
    while (this._memory.size >= SHARED_CAB_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _steer(ent, point) {
    if (!ent || !point) return false;
    const dx = finite(point.x) - finite(ent.pos && ent.pos.x);
    const dz = finite(point.z) - finite(ent.pos && ent.pos.z);
    const d = Math.hypot(dx, dz) || 1;
    const held = requestTrafficReaction(this, ent, {
      moveX: dx / d, moveZ: dz / d,
      boost: false, fire: false, fireGroup: null, aimAngle: Math.atan2(dz, dx), brake: d < 40,
    }, 3);
    if (!held) releaseTrafficReaction(this, ent); // refused: abort
    return held;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, SHARED_CAB_TUNING.plId, 'spawn') % 100 >= SHARED_CAB_TUNING.spawnChancePct) return;
    // "pacing clubs do not invite loners twice": clubs still form; the invite never comes.
    const loner = this._memory.get('loner');
    const lonerLive = !!(loner && finite(loner.until, 0) > this._now());
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    if (this._owned.size >= SHARED_CAB_TUNING.pairCount) return;
    // The pair is already in line ahead/astern on the road to the junction, and the offered
    // slot is the open abeam seat: lead + perp*90 lands just ahead of the player's bow.
    const gate = this._nearestGate(base);
    const dirX = gate && gate.pos ? finite(gate.pos.x) - finite(base.x) : 1;
    const dirZ = gate && gate.pos ? finite(gate.pos.z) - finite(base.z) : 0;
    const dirLen = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / dirLen;
    const dz = dirZ / dirLen;
    const leadPos = {
      x: finite(base.x) + dx * 160 - dz * 90,
      z: finite(base.z) + dz * 160 + dx * 90,
    };
    const trailPos = {
      x: finite(base.x) + dx * 80 - dz * 90,
      z: finite(base.z) + dz * 80 + dx * 90,
    };
    const lead = this._spawnPairShip(leadPos, 'lead', Math.atan2(dz, dx));
    if (!lead) return;
    const trail = this._spawnPairShip(trailPos, 'trail', Math.atan2(dz, dx));
    this._capMemory();
    this._memory.set('enc', {
      leadId: lead.id,
      trailId: trail ? trail.id : null,
      startedAt: this._now(),
      slotSide: 1,
      agreed: false,
      loner: lonerLive,
      lurkTicks: 0,
      lineTicks: 0,
      lastSplitAt: null,
      signedOff: false,
      invited: !lonerLive,
    });
    if (!lonerLive) {
      this._comms(`plants:${SHARED_CAB_TUNING.plId}:invite:${this._now()}`,
        SHARED_CAB_CALLSIGN, SHARED_CAB_INVITE_LINE, 7);
      this.bus.emit(SHARED_CAB_EVENT, { kind: 'invited', leadId: lead.id, t: this._now() });
    } else {
      this.bus.emit(SHARED_CAB_EVENT, { kind: 'no_invite', leadId: lead.id, t: this._now() });
    }
  },

  _spawnPairShip(pos, role, rot = 0) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_ranger', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z }, rot,
      ai: { archetype: 'pacer', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [SHARED_CAB_TUNING.plId]: { role } };
    ent.data.callsign = SHARED_CAB_CALLSIGN;
    this._owned.set(ent.id, { kind: 'pair', role, expiresAt: this._now() + SHARED_CAB_TUNING.strangerTtlS });
    return ent;
  },

  _dropFuelPod(pos, now) {
    const pod = spawnJettisonedCargoPod(this.state, {
      commodityId: 'cmdty_fuel_cells', amount: SHARED_CAB_TUNING.podAmount,
      radius: SHARED_CAB_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
      ownerId: null, ownerName: SHARED_CAB_CALLSIGN,
    }, this.helpers);
    if (!pod || pod.id == null) return null;
    pod.data = pod.data || {};
    pod.data.plants = { ...(pod.data.plants || {}), [SHARED_CAB_TUNING.plId]: { role: 'split_burn' } };
    this._owned.set(pod.id, { kind: 'fuel_pod', expiresAt: this._now() + SHARED_CAB_TUNING.podTtlS });
    return pod;
  },

  _endClub() {
    const enc = this._memory.get('enc');
    if (!enc) return;
    this._memory.delete('enc');
    for (const [id, row] of [...this._owned]) {
      if (row.kind === 'pair') this._remove(id);
    }
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p) return;
    if (p.id === enc.leadId || p.id === enc.trailId) {
      this._endClub();
      this.bus.emit(SHARED_CAB_EVENT, { kind: 'club_broken', hullId: p.id, t: this._now() });
    }
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
    const enc = this._memory.get('enc');
    if (enc && this._entity(enc.leadId) == null) this._memory.delete('enc');
    const loner = this._memory.get('loner');
    if (loner && now >= loner.until) this._memory.delete('loner');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // "pacing clubs do not invite loners twice": the loner stamp rides across sectors;
    // a session boundary (save:loaded, game:new, game:newGame) clears it.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keep = sectoral && this._memory ? this._memory.get('loner') : null;
    if (this._memory) this._memory.clear();
    if (keep) this._memory.set('loner', keep);
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(SHARED_CAB_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },
};
