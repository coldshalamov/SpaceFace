// PL-297 The open hatch — "A stranger docking ahead of you leaves their hold hatch open
// through flare weather, on purpose, for whoever is caught out in it.
// Shelter, then go; or shelter AND loot — open hatches close to your hull specifically,
// and stay closed"
//
// A chance meeting inside real flare weather: the sector's authored `radiation` hazard zones
// are the flare weather that exists today (declared substitute — the row's "flare weather"
// has no dedicated system; radiation zones are the live hazard). When the player is caught
// inside one, a stranger hull is found parked ahead with their hold hatch open — a real
// story-prop hatch with a shelter zone around it, on purpose, for whoever is caught out.
//
// - Shelter, then go: hold the shelter zone through the flare and leave — the stranger
//   jettisons a fuel cell for the road (freely given) and lamps a wave.
// - Shelter AND loot: scooping one of the pods the flare spilled off their apron while the
//   meeting is live is theft with shelter. The hatch closes to YOUR hull specifically and
//   stays closed: for a long season this module still spawns the meeting, but the hatch
//   prop never opens again — no shelter zone, no gift.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; the stranger receives no steering at all.
// - Physical: the hatch is a real prop; the shelter zone is real proximity; spilled pods and
//   the road gift are real jettisoned-cargo pods.
// - No economy mutations. Bounded Maps capped by tuning.memoryCap; TTL despawns; caps on
//   concurrent meeting props; nothing runs while docked; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { hash32 } from '../../core/rng.js';

export const OPEN_HATCH_EVENT = 'plants:openHatch';

export const OPEN_HATCH_TUNING = Object.freeze({
  plId: 'pl297',
  spawnChancePct: 55,
  flareEnterTicks: 2,          // sweeps inside the flare before the hatch appears
  hatchShelterRangeWu: 70,     // the open hatch's shelter zone
  shelterTicksNeeded: 4,       // hold the zone this many sweeps to have sheltered
  spillPods: 2,                // what the flare shook loose on the apron
  giftPodAmount: 1,
  podRadius: 5,
  closedSeasonS: 2400,         // "close to your hull specifically, and stay closed"
  strangerTtlS: 420,
  podTtlS: 240,
  memoryCap: 8,
});

export const OPEN_HATCH_CALLSIGN = 'OPEN HATCH';
export const OPEN_HATCH_HATCH_LABEL = 'HOLD HATCH — OPEN';
export const OPEN_HATCH_SHUT_LABEL = 'HOLD HATCH — SHUT';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is the player inside a real flare-weather hazard zone (authored radiation zones)? */
export function isFlareWeather(state, pos) {
  if (!state || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const sector = state.world && state.world.activeSector;
  const hazards = sector && Array.isArray(sector.hazards) ? sector.hazards : [];
  for (const hz of hazards) {
    if (!hz || hz.type !== 'radiation') continue;
    const dx = finite(pos.x) - finite(hz.center && hz.center.x);
    const dz = finite(pos.z) - finite(hz.center && hz.center.z);
    if (Math.hypot(dx, dz) <= finite(hz.radius, 0)) return true;
  }
  return false;
}

export const openHatchPlant = {
  name: 'plants297',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._flareTicks = 0;
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('pickup:collected', (p) => this._onPickupCollected(p));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._sweepExpired(finite(s.simTime, 0));
    if (!this._flight()) return;
    const player = this._player();
    if (!player || !player.pos) return;
    const now = finite(s.simTime, 0);

    this._accum += finite(dt, 0);
    if (this._accum >= 1) {
      this._accum = 0;
      this._watchFlare(player, now);
    }

    const enc = this._memory.get('enc');
    if (!enc) return;
    const stranger = this._entity(enc.strangerId);
    const hatch = this._entity(enc.hatchId);
    if (!stranger || stranger.alive === false) { this._memory.delete('enc'); return; }
    if (!enc.hatchClosedForYou) {
      // Shelter: hold the hatch zone through the flare.
      const inShelter = hatch && this._dist(hatch.pos, player.pos) <= OPEN_HATCH_TUNING.hatchShelterRangeWu
        && isFlareWeather(s, player.pos);
      if (inShelter) enc.shelterTicks = (enc.shelterTicks || 0) + 1;
      else enc.shelterTicks = Math.max(0, (enc.shelterTicks || 0) - 1);
      // Then go: leaving the flare with shelter banked earns the road gift.
      if ((enc.shelterTicks || 0) >= OPEN_HATCH_TUNING.shelterTicksNeeded
          && !isFlareWeather(s, player.pos) && !enc.gifted) {
        enc.gifted = true;
        this._dropGiftPod(stranger.pos, now);
        stranger.data.lampsFlashing = true;
        stranger.data.lampFlashUntil = now + 1.2;
        this._cue('confirm', stranger.pos, 0.7, 1);
        this.bus.emit(OPEN_HATCH_EVENT, { kind: 'sheltered_then_gone', strangerId: enc.strangerId, t: now });
      }
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

  _capMemory() {
    while (this._memory.size >= OPEN_HATCH_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _closedForYou(now) {
    const closed = this._memory.get('closedForYou');
    return !!(closed && finite(closed.until, 0) > now);
  },

  _watchFlare(player, now) {
    if (this._memory.get('enc')) return;
    if (!isFlareWeather(this.state, player.pos)) { this._flareTicks = 0; return; }
    this._flareTicks += 1;
    if (this._flareTicks < OPEN_HATCH_TUNING.flareEnterTicks) return;
    // Chance gate on the meeting.
    const s = this.state;
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const sectorId = (s.world && s.world.currentSectorId) || 's1';
    if (hash32(seed, sectorId, OPEN_HATCH_TUNING.plId, 'flare') % 100 >= OPEN_HATCH_TUNING.spawnChancePct) return;
    const closedForYou = this._closedForYou(now);
    const stranger = this._spawnStranger({ x: finite(player.pos.x) + 150, z: finite(player.pos.z) + 40 });
    if (!stranger) return;
    // The hatch: open on purpose — unless it is closed to your hull specifically.
    const hatch = closedForYou
      ? this._spawnHatchProp(stranger.pos, OPEN_HATCH_SHUT_LABEL, true)
      : this._spawnHatchProp(stranger.pos, OPEN_HATCH_HATCH_LABEL, false);
    // The flare shook a few pods loose on the apron.
    const spillIds = [];
    if (!closedForYou) {
      for (let i = 0; i < OPEN_HATCH_TUNING.spillPods; i++) {
        const pod = this._spawnSpillPod({
          x: finite(stranger.pos.x) + 24 + i * 18,
          z: finite(stranger.pos.z) + 26,
        });
        if (pod) spillIds.push(pod.id);
      }
    }
    this._capMemory();
    this._memory.set('enc', {
      strangerId: stranger.id,
      hatchId: hatch ? hatch.id : null,
      spillIds,
      hatchClosedForYou: closedForYou,
      shelterTicks: 0,
      gifted: false,
    });
    this._flareTicks = 0;
    this.bus.emit(OPEN_HATCH_EVENT, {
      kind: closedForYou ? 'hatch_shut_to_you' : 'hatch_open', strangerId: stranger.id, t: now,
    });
  },

  _spawnStranger(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'parked', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [OPEN_HATCH_TUNING.plId]: { role: 'open_hatch_host' } };
    ent.data.callsign = OPEN_HATCH_CALLSIGN;
    this._owned.set(ent.id, { kind: 'stranger', expiresAt: this._now() + OPEN_HATCH_TUNING.strangerTtlS });
    return ent;
  },

  _spawnHatchProp(hostPos, label, shut) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: finite(hostPos.x) + 18, z: finite(hostPos.z) - 14 },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: label,
        storyPropKind: 'hold_hatch',
        shelterOpen: !shut,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'hatch', expiresAt: this._now() + OPEN_HATCH_TUNING.strangerTtlS });
    return ent;
  },

  _spawnPod(pos, ownerName, kind) {
    const pod = spawnJettisonedCargoPod(this.state, {
      commodityId: 'cmdty_fuel_cells', amount: OPEN_HATCH_TUNING.giftPodAmount,
      radius: OPEN_HATCH_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
      ownerId: null, ownerName,
    }, this.helpers);
    if (!pod || pod.id == null) return null;
    pod.data = pod.data || {};
    pod.data.plants = { ...(pod.data.plants || {}), [OPEN_HATCH_TUNING.plId]: { role: kind } };
    this._owned.set(pod.id, { kind: 'pod', expiresAt: this._now() + OPEN_HATCH_TUNING.podTtlS });
    return pod;
  },

  _spawnSpillPod(pos) {
    return this._spawnPod(pos, OPEN_HATCH_CALLSIGN, 'spill');
  },

  _dropGiftPod(pos, now) {
    const pod = this._spawnPod({ x: finite(pos.x) + 30, z: finite(pos.z) - 20 }, OPEN_HATCH_CALLSIGN, 'road_gift');
    this.bus.emit(OPEN_HATCH_EVENT, { kind: 'road_gift', podId: pod ? pod.id : null, t: now });
    return pod;
  },

  // Shelter AND loot: scooping the spill while the meeting is live closes hatches to you.
  _onPickupCollected(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const podId = p.pickupId != null ? p.pickupId : null;
    if (podId == null || !enc.spillIds.includes(podId)) return;
    const now = this._now();
    this._capMemory();
    this._memory.set('closedForYou', { until: now + OPEN_HATCH_TUNING.closedSeasonS });
    // The hatch shuts in front of you, now and for the season.
    const hatch = this._entity(enc.hatchId);
    if (hatch && hatch.data) {
      hatch.data.scanLabel = OPEN_HATCH_SHUT_LABEL;
      hatch.data.shelterOpen = false;
    }
    enc.hatchClosedForYou = true;
    this._cue('ui_deny', null, 0.6, 1);
    this.bus.emit(OPEN_HATCH_EVENT, { kind: 'hatch_closed_to_you', podId, until: now + OPEN_HATCH_TUNING.closedSeasonS, t: now });
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.strangerId) return;
    this._memory.delete('enc');
    this.bus.emit(OPEN_HATCH_EVENT, { kind: 'host_gone', hullId: p.id, t: this._now() });
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
    if (enc && this._entity(enc.strangerId) == null) this._memory.delete('enc');
    const closed = this._memory.get('closedForYou');
    if (closed && now >= closed.until) this._memory.delete('closedForYou');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // "close to your hull specifically, and stay closed": the lock rides across sectors;
    // a session boundary (save:loaded, game:new, game:newGame) unlocks it.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keep = sectoral && this._memory ? this._memory.get('closedForYou') : null;
    if (this._memory) this._memory.clear();
    if (keep) this._memory.set('closedForYou', keep);
    this._flareTicks = 0;
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(OPEN_HATCH_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
