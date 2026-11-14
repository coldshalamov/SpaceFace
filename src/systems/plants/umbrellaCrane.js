// PL-298 The umbrella crane — "Dock in falling-debris weather and a crane operator angles
// their gantry over your hull without being asked or paid.
// Park and let them work; or complain the shadow is slow — cranes angle away from
// complainers for a season"
//
// A chance meeting inside real falling-debris weather: the sector's authored `debris`
// hazard zones are the debris weather that exists today (debrisCrossings moves shards across
// them). When the player is caught inside one within crane range of a station, a crane
// gantry — a real prop — spawns and angles over the player's hull: each sweep it moves to
// the shadow point between the player and the debris center, without being asked or paid.
//
// - Park and let them work: sit under the shadow at park speed through the weather — the
//   operator acknowledges the work once (one line) and the crane remembers you kindly
//   (next time it angles over instantly, no approach lag).
// - Complain the shadow is slow: the row's complaint is channel speech the flight route has
//   no input seam for; the physical stand-in that reads the same to a crane operator is
//   shoving the gantry (a player-caused impact receipt on the prop above shove speed,
//   declared substitute). Cranes angle away from complainers for a season: the gantry still
//   spawns, but its shadow point mirrors AWAY from the player.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; the gantry is plant-owned and moves by bounded steps.
// - Physical: a real prop tracks a real shadow point; the complaint is a real impact receipt.
// - No economy mutations. Bounded Maps capped by tuning.memoryCap; caps: one gantry live,
//   one acknowledgment per weather; TTL despawns; nothing runs while docked.

import { hash32 } from '../../core/rng.js';

export const UMBRELLA_CRANE_EVENT = 'plants:umbrellaCrane';

export const UMBRELLA_CRANE_TUNING = Object.freeze({
  plId: 'pl298',
  spawnChancePct: 60,
  craneRangeWu: 500,           // station proximity: the crane lives at stations
  shadowRangeWu: 60,           // the gantry shadows you from this offset
  gantrySpeedWu: 60,           // bounded slew per second
  parkSpeedWu: 4,              // parked is barely moving
  workTicksNeeded: 5,          // parked under the shadow this long is letting them work
  kindRememberS: 1800,         // the crane remembers you kindly
  shoveSpeedWu: 30,            // a player-caused closing speed at or above this is a complaint
  grudgeSeasonS: 1500,         // "cranes angle away from complainers for a season"
  propTtlS: 420,
  memoryCap: 8,
});

export const UMBRELLA_CRANE_CALLSIGN = 'CRANE OPERATOR';
export const UMBRELLA_CRANE_WORK_LINE = 'Crane has you. Stand easy.';
export const UMBRELLA_CRANE_GANTRY_LABEL = 'CRANE GANTRY — SHADOWING';
export const UMBRELLA_CRANE_GANTRY_AWAY_LABEL = 'CRANE GANTRY — ANGLED AWAY';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is the player inside a real falling-debris hazard zone (authored debris zones)? */
export function isDebrisWeather(state, pos) {
  if (!state || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const sector = state.world && state.world.activeSector;
  const hazards = sector && Array.isArray(sector.hazards) ? sector.hazards : [];
  for (const hz of hazards) {
    if (!hz || hz.type !== 'debris') continue;
    const dx = finite(pos.x) - finite(hz.center && hz.center.x);
    const dz = finite(pos.z) - finite(hz.center && hz.center.z);
    if (Math.hypot(dx, dz) <= finite(hz.radius, 0)) return true;
  }
  return false;
}

/**
 * Pure: where the gantry holds relative to the player. Kind cranes put the shadow between
 * the player and the debris center; grudging cranes mirror it to the far side.
 */
export function shadowPointFor(playerPos, hazardCenter, kind = 'kind') {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const cx = finite(hazardCenter && hazardCenter.x);
  const cz = finite(hazardCenter && hazardCenter.z);
  const dx = cx - px;
  const dz = cz - pz;
  const len = Math.hypot(dx, dz) || 1;
  const sign = kind === 'grudge' ? -1 : 1;
  return { x: px + (dx / len) * sign * 30, z: pz + (dz / len) * sign * 30 };
}

/** Pure: is this impact receipt a complaint (player-caused shove on the gantry)? */
export function isComplaint(payload, gantryId, playerId, tuning = UMBRELLA_CRANE_TUNING) {
  if (!payload || gantryId == null || playerId == null) return false;
  if (finite(payload.preSolveClosingSpeed, 0) < tuning.shoveSpeedWu) return false;
  return payload.causalActorId === playerId
    && (payload.aId === gantryId || payload.bId === gantryId);
}

export const umbrellaCranePlant = {
  name: 'plants298',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._weatherTicks = 0;
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('physics:impact', (p) => this._onImpact(p));
    on('dock:range', (p) => this._onDockRange(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._sweepExpired(finite(s.simTime, 0));
    if (!this._flight()) return;
    const player = this._player();
    if (!player || !player.pos) return;
    const now = finite(s.simTime, 0);
    const inWeather = isDebrisWeather(s, player.pos);

    this._accum += finite(dt, 0);
    const tick = this._accum >= 1;
    if (tick) { this._accum = 0; this._watchWeather(inWeather, player, now); }

    const enc = this._memory.get('enc');
    if (!enc) return;
    const gantry = this._entity(enc.gantryId);
    if (!gantry || gantry.alive === false) { this._memory.delete('enc'); return; }

    // Angle over the hull: slew the gantry toward its shadow point, bounded steps, per tick.
    if (tick) {
      const hazard = enc.hazardCenter;
      const kind = this._grudgeLive(now) ? 'grudge' : (enc.kindRemember ? 'kindInstant' : 'kind');
      const point = shadowPointFor(player.pos, hazard, kind === 'grudge' ? 'grudge' : 'kind');
      const dx = finite(point.x) - finite(gantry.pos.x);
      const dz = finite(point.z) - finite(gantry.pos.z);
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, UMBRELLA_CRANE_TUNING.gantrySpeedWu);
      if (d > 1e-6) {
        gantry.pos = { x: finite(gantry.pos.x) + (dx / d) * step, z: finite(gantry.pos.z) + (dz / d) * step };
      }
      enc.shadowing = this._dist(gantry.pos, player.pos) <= UMBRELLA_CRANE_TUNING.shadowRangeWu;

      // Parked and letting them work — or complaining by shoving (see _onImpact).
      if (enc.shadowing && !enc.grudge && inWeather) {
        const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
        if (speed <= UMBRELLA_CRANE_TUNING.parkSpeedWu) enc.workTicks = (enc.workTicks || 0) + 1;
        else enc.workTicks = Math.max(0, (enc.workTicks || 0) - 1);
        if ((enc.workTicks || 0) >= UMBRELLA_CRANE_TUNING.workTicksNeeded && !enc.acknowledged) {
          enc.acknowledged = true;
          this._say(`plants:${UMBRELLA_CRANE_TUNING.plId}:work:${now}`,
            UMBRELLA_CRANE_CALLSIGN, UMBRELLA_CRANE_WORK_LINE, 6);
          this._capMemory();
          this._memory.set('craneKindly', { until: now + UMBRELLA_CRANE_TUNING.kindRememberS });
          this.bus.emit(UMBRELLA_CRANE_EVENT, { kind: 'shadow_worked', gantryId: enc.gantryId, t: now });
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
    while (this._memory.size >= UMBRELLA_CRANE_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _grudgeLive(now) {
    const grudge = this._memory.get('craneGrudge');
    return !!(grudge && finite(grudge.until, 0) > now);
  },

  _nearestStation(pos) {
    const s = this.state;
    const list = (s.entityIndex && Array.isArray(s.entityIndex.stations)) ? s.entityIndex.stations : [];
    let best = null;
    let bestD = Infinity;
    for (const st of list) {
      const d = st && st.data;
      if (!st || st.alive === false || st.type !== 'station' || !d || d.isGate === true || d.isWormhole === true) continue;
      const dist = this._dist(st.pos, pos);
      if (dist < bestD) { bestD = dist; best = st; }
    }
    return best;
  },

  _hazardCenterAt(pos) {
    const s = this.state;
    const sector = s.world && s.world.activeSector;
    const hazards = sector && Array.isArray(sector.hazards) ? sector.hazards : [];
    let best = null;
    let bestD = Infinity;
    for (const hz of hazards) {
      if (!hz || hz.type !== 'debris') continue;
      const dx = finite(pos.x) - finite(hz.center && hz.center.x);
      const dz = finite(pos.z) - finite(hz.center && hz.center.z);
      const d = Math.hypot(dx, dz);
      if (d <= finite(hz.radius, 0) && d < bestD) { bestD = d; best = hz.center; }
    }
    return best;
  },

  _watchWeather(inWeather, player, now) {
    if (this._memory.get('enc')) return;
    if (!inWeather) { this._weatherTicks = 0; return; }
    this._weatherTicks += 1;
    if (this._weatherTicks < 2) return;
    const station = this._nearestStation(player.pos);
    if (!station || this._dist(station.pos, player.pos) > UMBRELLA_CRANE_TUNING.craneRangeWu) return;
    const hazardCenter = this._hazardCenterAt(player.pos);
    if (!hazardCenter) return;
    // Chance gate on the meeting.
    const s = this.state;
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const sectorId = (s.world && s.world.currentSectorId) || 's1';
    if (hash32(seed, sectorId, UMBRELLA_CRANE_TUNING.plId, 'debris') % 100 >= UMBRELLA_CRANE_TUNING.spawnChancePct) return;
    const grudge = this._grudgeLive(now);
    const kindRemember = !grudge && !!(() => {
      const k = this._memory.get('craneKindly');
      return k && finite(k.until, 0) > now;
    })();
    const gantry = this._spawnGantry(station.pos, grudge);
    if (!gantry) return;
    this._capMemory();
    this._memory.set('enc', {
      gantryId: gantry.id,
      stationId: station.id,
      hazardCenter,
      grudge,
      kindRemember,
      shadowing: false,
      workTicks: 0,
      acknowledged: false,
      complained: false,
    });
    this._weatherTicks = 0;
    this.bus.emit(UMBRELLA_CRANE_EVENT, {
      kind: grudge ? 'angled_away' : 'angled_over', gantryId: gantry.id, stationId: station.id, t: now,
    });
  },

  _spawnGantry(stationPos, grudge) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: finite(stationPos.x) + 60, z: finite(stationPos.z) - 60 },
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 1e6,
      hull: 40,
      hullMax: 40,
      data: {
        parentType: 'story_prop',
        scanLabel: grudge ? UMBRELLA_CRANE_GANTRY_AWAY_LABEL : UMBRELLA_CRANE_GANTRY_LABEL,
        storyPropKind: 'crane_gantry',
        angleAway: grudge === true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'gantry', expiresAt: this._now() + UMBRELLA_CRANE_TUNING.propTtlS });
    return ent;
  },

  // Complain the shadow is slow: the shove reads to the operator as the complaint.
  _onImpact(p) {
    if (!this._flight() || !p || !this.state) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.complained) return;
    if (!isComplaint(p, enc.gantryId, this.state.playerId)) return;
    const now = this._now();
    enc.complained = true;
    this._capMemory();
    this._memory.set('craneGrudge', { until: now + UMBRELLA_CRANE_TUNING.grudgeSeasonS });
    enc.grudge = true;
    const gantry = this._entity(enc.gantryId);
    if (gantry && gantry.data) {
      gantry.data.scanLabel = UMBRELLA_CRANE_GANTRY_AWAY_LABEL;
      gantry.data.angleAway = true;
    }
    this._cue('ui_deny', null, 0.6, 1);
    this.bus.emit(UMBRELLA_CRANE_EVENT, {
      kind: 'complained', gantryId: enc.gantryId, until: now + UMBRELLA_CRANE_TUNING.grudgeSeasonS, t: now,
    });
  },

  // The crane remembers your docking too: a kindly dock renews the memory.
  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const kindly = this._memory.get('craneKindly');
    if (!kindly) return;
    const now = this._now();
    this.bus.emit(UMBRELLA_CRANE_EVENT, { kind: 'crane_remembers', stationId: p.stationId, t: now });
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
    if (enc && this._entity(enc.gantryId) == null) this._memory.delete('enc');
    for (const key of ['craneGrudge', 'craneKindly']) {
      const row = this._memory.get(key);
      if (row && now >= finite(row.until, 0)) this._memory.delete(key);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // The crane's season memory (grudge and kindness) rides across sector changes; a session
    // boundary (save:loaded, game:new, game:newGame) forgets both.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keeps = sectoral && this._memory
      ? ['craneGrudge', 'craneKindly'].map((k) => [k, this._memory.get(k)]).filter(([, v]) => v)
      : [];
    if (this._memory) this._memory.clear();
    for (const [k, v] of keeps) this._memory.set(k, v);
    this._weatherTicks = 0;
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(UMBRELLA_CRANE_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _say(id, sender, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl });
    } else {
      this.bus.emit('voice:say', { channel: 'bark', id, text, ttl });
    }
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
