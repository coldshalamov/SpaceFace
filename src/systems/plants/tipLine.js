// PL-295 The tip line — "A stranger on a shared channel gives you the bearing of a rich seam,
// no reason offered, no bill asked.
// Work the seam; or sell the bearing — seams stop surfacing to you, and the stranger never
// explains"
//
// A seeded chance meeting: a stranger spawns near the player and gives one line on the shared
// channel — the bearing of a rich seam, no reason, no bill. The seam is physical: a marked
// rock spawns at the bearing with a rich lot pod beside it. Working the seam is the ordinary
// mining route (muzzle flashes — beam or shot — landing on the seam rock): the rock sheds a
// rich pod and the stranger departs without another word.
//
// - Work the seam: the rock gives up its rich lot; a seamWorked stamp is the receipt.
// - Sell the bearing: docking in range of a station with a 'scan' service while the seam is
//   known and unworked is you passing the tip to a scanner. Seams stop surfacing to you
//   (a season-long embargo on this module's spawns), and the stranger never explains — no
//   line is spoken about it, ever.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; the stranger receives no steering at all.
// - Physical: the seam is a real marked rock plus a real rich pod.
// - No economy mutations: the rich pod is a physical prop; no credit or market write.
// - Bounded Maps capped by tuning.memoryCap; TTL despawns; nothing runs while docked.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { stationInfo } from '../../economy/stationMarketProfile.js';
import { hash32 } from '../../core/rng.js';

export const TIP_LINE_EVENT = 'plants:tipLine';

export const TIP_LINE_TUNING = Object.freeze({
  plId: 'pl295',
  spawnChancePct: 45,
  bearingDistanceWu: 420,      // the seam spawns out along the given bearing
  seamWorkRangeWu: 90,         // muzzle flashes inside this of the rock are working it
  seamShotsNeeded: 2,          // a couple of beam/shot contacts cut the first lot
  embargoSeasonS: 1200,        // "seams stop surfacing to you"
  richPodAmount: 3,
  podRadius: 6,
  strangerTtlS: 300,
  seamTtlS: 600,
  memoryCap: 8,
});

export const TIP_LINE_CALLSIGN = 'SHARED CHANNEL';
export const TIP_LINE_BEARING_LINE = 'Rich seam, bearing 041.';
export const TIP_SEAM_LABEL = 'RICH SEAM — UNCHARTED';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: the seam's position from the giver's position along the authored bearing (041 deg). */
export function seamPointFor(origin, bearingDeg = 41, distanceWu = TIP_LINE_TUNING.bearingDistanceWu) {
  const rad = (finite(bearingDeg, 0) * Math.PI) / 180;
  return {
    x: finite(origin && origin.x) + Math.cos(rad) * finite(distanceWu),
    z: finite(origin && origin.z) + Math.sin(rad) * finite(distanceWu),
  };
}

/** Pure: does this station profile read as a scanner that would buy a bearing? */
export function isScannerStation(info) {
  return !!(info && Array.isArray(info.services) && info.services.includes('scan'));
}

export const tipLinePlant = {
  modes: ['flight'],
  name: 'plants295',

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
    on('combat:fire', (p) => this._onShot(p));
    on('dock:range', (p) => this._onDockRange(p));
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
    // The stranger's visit is short: they give the bearing, linger a moment, and go.
    const tip = this._memory.get('tip');
    if (tip && tip.strangerId != null && now >= tip.leaveAt) {
      this._remove(tip.strangerId);
      this._memory.delete('tip');
      this.bus.emit(TIP_LINE_EVENT, { kind: 'giver_gone', t: now });
    }
    const seam = this._memory.get('seam');
    if (seam && !seam.worked) {
      const rock = this._entity(seam.rockId);
      if (rock && rock.alive !== false) {
        const player = this._player();
        if (player && player.pos && this._dist(rock.pos, player.pos) <= TIP_LINE_TUNING.seamWorkRangeWu) {
          seam.nearTicks = (seam.nearTicks || 0) + 1;
        }
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
    while (this._memory.size >= TIP_LINE_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, TIP_LINE_TUNING.plId, 'spawn') % 100 >= TIP_LINE_TUNING.spawnChancePct) return;
    // "seams stop surfacing to you": the embargo, once sold, is respected by every spawn.
    const embargo = this._memory.get('embargo');
    if (embargo && finite(embargo.until, 0) > this._now()) {
      this.bus.emit(TIP_LINE_EVENT, { kind: 'seams_hidden', until: embargo.until, t: this._now() });
      return;
    }
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const stranger = this._spawnStranger({ x: base.x + 200, z: base.z - 80 });
    if (!stranger) return;
    // One line on the shared channel — the bearing, no reason, no bill.
    this._comms(`plants:${TIP_LINE_TUNING.plId}:tip:${this._now()}`,
      TIP_LINE_CALLSIGN, TIP_LINE_BEARING_LINE, 7);
    const seamPos = seamPointFor(base);
    const rock = this._spawnSeamRock(seamPos);
    if (rock) this._spawnRichPod({ x: seamPos.x + 20, z: seamPos.z + 12 });
    this._capMemory();
    this._memory.set('tip', { strangerId: stranger.id, givenAt: this._now(), leaveAt: this._now() + 12 });
    if (rock) {
      this._memory.set('seam', { rockId: rock.id, worked: false, shots: 0, nearTicks: 0 });
    }
  },

  _spawnStranger(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'drifter', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [TIP_LINE_TUNING.plId]: { role: 'tip_giver' } };
    ent.data.callsign = TIP_LINE_CALLSIGN;
    this._owned.set(ent.id, { kind: 'stranger', expiresAt: this._now() + TIP_LINE_TUNING.strangerTtlS });
    return ent;
  },

  _spawnSeamRock(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius: 12,
      mass: 1e6,
      hull: 200,
      hullMax: 200,
      data: {
        parentType: 'story_prop',
        scanLabel: TIP_SEAM_LABEL,
        storyPropKind: 'rich_seam',
        richSeam: true,
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'seam_rock', expiresAt: this._now() + TIP_LINE_TUNING.seamTtlS });
    return ent;
  },

  _spawnRichPod(pos) {
    const pod = spawnJettisonedCargoPod(this.state, {
      commodityId: 'cmdty_ore_goldium', amount: TIP_LINE_TUNING.richPodAmount,
      radius: TIP_LINE_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
      ownerId: null, ownerName: TIP_LINE_CALLSIGN,
      richSource: { source: 'rich_seam', richQty: TIP_LINE_TUNING.richPodAmount },
    }, this.helpers);
    if (!pod || pod.id == null) return null;
    pod.data = pod.data || {};
    pod.data.plants = { ...(pod.data.plants || {}), [TIP_LINE_TUNING.plId]: { role: 'rich_lot' } };
    this._owned.set(pod.id, { kind: 'rich_pod', expiresAt: this._now() + TIP_LINE_TUNING.seamTtlS });
    return pod;
  },

  // Working the seam: the ordinary mining route — beam/shot contacts on the seam rock.
  _onShot(p) {
    if (!this._flight() || !p || !this.state) return;
    if (p.ownerId !== this.state.playerId) return;
    const seam = this._memory.get('seam');
    if (!seam || seam.worked) return;
    const rock = this._entity(seam.rockId);
    if (!rock || !p.origin) return;
    if (this._dist(p.origin, rock.pos) > TIP_LINE_TUNING.seamWorkRangeWu) return;
    seam.shots += 1;
    if (seam.shots < TIP_LINE_TUNING.seamShotsNeeded) return;
    seam.worked = true;
    const now = this._now();
    // The seam surfaces its lot: a fresh rich pod sheds off the rock.
    const rockPos = rock.pos;
    this._spawnRichPod({ x: finite(rockPos.x) + 16, z: finite(rockPos.z) - 10 });
    this._cue('confirm', rockPos, 0.7, 1);
    this.bus.emit(TIP_LINE_EVENT, { kind: 'seam_worked', rockId: seam.rockId, t: now });
    // The stranger never explains: they simply go.
    const tip = this._memory.get('tip');
    if (tip && tip.strangerId != null) this._remove(tip.strangerId);
  },

  // Selling the bearing: a scanner station in range while the seam is known and unworked.
  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const seam = this._memory.get('seam');
    if (!seam || seam.worked) return;
    if (this._memory.get('embargo')) return;
    const info = stationInfo(this.state, p.stationId);
    if (!isScannerStation(info)) return;
    const now = this._now();
    this._capMemory();
    this._memory.set('embargo', { until: now + TIP_LINE_TUNING.embargoSeasonS });
    // "and the stranger never explains" — nothing is said. The record is the only trace.
    this.bus.emit(TIP_LINE_EVENT, { kind: 'bearing_sold', stationId: p.stationId, until: now + TIP_LINE_TUNING.embargoSeasonS, t: now });
  },

  _onKilled(p) {
    const seam = this._memory.get('seam');
    if (!seam || !p || p.id !== seam.rockId) return;
    this._memory.delete('seam');
    this.bus.emit(TIP_LINE_EVENT, { kind: 'seam_gone', rockId: p.id, t: this._now() });
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
    const embargo = this._memory.get('embargo');
    if (embargo && now >= embargo.until) this._memory.delete('embargo');
    const seam = this._memory.get('seam');
    if (seam && this._entity(seam.rockId) == null) this._memory.delete('seam');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // The sold-bearing embargo rides across sector changes; a session boundary (save:loaded,
    // game:new, game:newGame) lifts it and resets everything else.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keep = sectoral && this._memory ? this._memory.get('embargo') : null;
    if (this._memory) this._memory.clear();
    if (keep) this._memory.set('embargo', keep);
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(TIP_LINE_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
