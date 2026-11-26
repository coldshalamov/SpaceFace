// PL-166 The bright one — "A funeral tow passes, every light on Rib Street dims — and
// one stranger runs lamps-full straight through it."
// What the player can do: "Flash yours at them once, and Mother Calloway nods at you
// later; or run bright yourself, and be remembered beside them."
//
// Substituted trigger, honestly: there is no lamp-flash input seam; one player shot near
// the tow during its passing reads as one flash, two inside the window as running
// lamps-full (same precedent as src/systems/plants/waveBackPlant.js). The street dims by
// clearing the pads this module owns during the tow's passing — the pad layer is a pure
// read of entity.data.swarmFloorPad each frame (src/ui/floatingText.js).
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; hash32 seeds the crossing bearing; no
//   Math.random/Date.now; no Three.js/DOM imports.
// - All state on `this` (session-only); the tow, the stranger and the street plate are
//   this module's own props; bounded ledgers (tuning.memoryCap).
// - Anchors sector_pallas_drift / station_drift — read from live entities; never edits
//   src/data.

import { hash32 } from '../../core/rng.js';

export const PLANTS_BRIGHT_ONE_EVENT = 'plants:theBrightOne';

export const BRIGHT_ONE_TUNING = Object.freeze({
  plId: 'pl166',
  sectorId: 'sector_pallas_drift',
  stationId: 'station_drift',
  towPeriodS: 600,          // a funeral tow passes once on the sector-day clock
  towWindowS: 30,
  towCrossWu: 520,
  shotRangeWu: 300,
  brightShots: 2,
  shotWindowS: 6,
  nodS: 600,                // the nod holds for a day
  memoryCap: 4,             // tow receipts
});

/** Pure: is the tow mid-passing at `simTime`? */
export function towPassing(simTime, periodS = BRIGHT_ONE_TUNING.towPeriodS, windowS = BRIGHT_ONE_TUNING.towWindowS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  return ((t % periodS) + periodS) % periodS < windowS;
}

/** Pure: the tow's crossing progress, -1..1 across the street. */
export function towProgress(simTime, periodS = BRIGHT_ONE_TUNING.towPeriodS, windowS = BRIGHT_ONE_TUNING.towWindowS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  const phase = ((t % periodS) + periodS) % periodS;
  return Math.min(1, phase / windowS) * 2 - 1;
}

/** Pure: two shots inside the window is running lamps-full. */
export function isBrightRun(shotTimes, now, windowS = BRIGHT_ONE_TUNING.shotWindowS, need = BRIGHT_ONE_TUNING.brightShots) {
  return shotTimes.filter((t) => now - t <= windowS).length >= need;
}

export const theBrightOnePlant = {
  modes: ['flight'],
  name: 'plants166',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._towId = null;
    this._strangerId = null;
    this._plateId = null;
    this._rememberId = null;
    this._lastTowDay = -1;
    this._wasPassing = false;
    this._shotTimes = [];
    this._flashedOnce = false;
    this._nodUntil = 0;
    this._receipts = new Map();   // towDay -> 'flashed' | 'bright' (bounded)
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('combat:fire', (p) => this._onShot(p));
    on('dock:range', (p) => this._onDockRange(p));
    on('sector:exit', () => this._cleanup());
    on('game:newGame', () => this._resetForNewGame());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== BRIGHT_ONE_TUNING.sectorId) return;
    const station = this._station();
    if (!station) return;
    this._accum += dt;
    if (this._accum < 0.5) return;   // 2 Hz
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const passing = towPassing(now);
    const towDay = Math.floor(now / BRIGHT_ONE_TUNING.towPeriodS);

    if (passing && !this._wasPassing) this._startPass(towDay, station, now);
    if (passing) this._paceProps(station, now);
    if (!passing && this._wasPassing) this._endPass(towDay, now);
    this._wasPassing = passing;
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._cleanup();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _station() {
    const s = this.state;
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const list of lists) {
      if (!list) continue;
      for (const e of list) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === BRIGHT_ONE_TUNING.stationId) return e;
      }
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === BRIGHT_ONE_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _bearing(station) {
    const s = this.state;
    const h = Number.isFinite(hash32(s.meta && s.meta.seed, BRIGHT_ONE_TUNING.sectorId, 'pl166-street'))
      ? hash32(s.meta && s.meta.seed, BRIGHT_ONE_TUNING.sectorId, 'pl166-street') : 0;
    return (h % 6283) / 1000;
  },

  _startPass(towDay, station, now) {
    const s = this.state;
    this._lastTowDay = towDay;
    this._shotTimes = [];
    this._flashedOnce = false;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const b = this._bearing(station);
    const ux = Math.cos(b);
    const uz = Math.sin(b);
    const spawnEntity = this.helpers.spawnEntity;
    // every light on Rib Street dims: the pad this module owns goes dark for the passing
    this._plateId = this._spawnProp(spawnEntity, station, {
      type: 'beacon',
      pos: { x: station.pos.x + uz * 60, z: station.pos.z - ux * 60 },
      data: {
        parentType: 'story_prop',
        scanLabel: 'Rib Street — the run\u2019s street',
        storyPropKind: 'rib_street_dim',
        swarmFloorPad: { label: 'RIB STREET' },
      },
    });
    const progress = towProgress(now);
    this._towId = this._spawnProp(spawnEntity, station, {
      type: 'beacon',
      pos: { x: station.pos.x + ux * BRIGHT_ONE_TUNING.towCrossWu * progress, z: station.pos.z + uz * BRIGHT_ONE_TUNING.towCrossWu * progress },
      data: {
        parentType: 'story_prop',
        scanLabel: 'Funeral tow — every light dims for it',
        storyPropKind: 'funeral_tow',
        swarmFloorPad: { label: 'FUNERAL TOW' },
      },
    });
    // one stranger runs lamps-full straight through it, the other way
    this._strangerId = this._spawnProp(spawnEntity, station, {
      type: 'beacon',
      pos: { x: station.pos.x - ux * BRIGHT_ONE_TUNING.towCrossWu * progress, z: station.pos.z - uz * BRIGHT_ONE_TUNING.towCrossWu * progress },
      data: {
        parentType: 'story_prop',
        scanLabel: 'A stranger — lamps-full, straight through',
        storyPropKind: 'bright_stranger',
        lampsFlashing: true,
        lampFlashUntil: now + BRIGHT_ONE_TUNING.towWindowS,
        swarmFloorPad: { label: 'LAMPS-FULL' },
      },
    });
  },

  _spawnProp(spawnEntity, station, spec) {
    const ent = spawnEntity({
      type: spec.type || 'beacon',
      pos: spec.pos,
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        ...spec.data,
        tetherable: true,
        masslineTetherable: true,
        parentType: spec.data.parentType || 'story_prop',
        plants: { [BRIGHT_ONE_TUNING.plId]: { role: 'street' } },
      },
    });
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent && ent.id != null ? ent.id : null;
  },

  _paceProps(station, now) {
    const s = this.state;
    const b = this._bearing(station);
    const ux = Math.cos(b);
    const uz = Math.sin(b);
    const progress = towProgress(now);
    const tow = this._towId != null ? s.entities.get(this._towId) : null;
    if (tow) {
      tow.pos.x = station.pos.x + ux * BRIGHT_ONE_TUNING.towCrossWu * progress;
      tow.pos.z = station.pos.z + uz * BRIGHT_ONE_TUNING.towCrossWu * progress;
    }
    const stranger = this._strangerId != null ? s.entities.get(this._strangerId) : null;
    if (stranger) {
      stranger.pos.x = station.pos.x - ux * BRIGHT_ONE_TUNING.towCrossWu * progress;
      stranger.pos.z = station.pos.z - uz * BRIGHT_ONE_TUNING.towCrossWu * progress;
      if (stranger.data) {
        stranger.data.lampFlashUntil = now + 2;   // lamps-full, straight through
        stranger.data.lampsFlashing = true;
      }
    }
    // the street stays dim while the tow passes
    const plate = this._plateId != null ? s.entities.get(this._plateId) : null;
    if (plate && plate.data && plate.data.swarmFloorPad && plate.data.swarmFloorPad.label !== '') {
      plate.data.swarmFloorPad = { label: '' };
    }
  },

  _endPass(towDay, now) {
    const s = this.state;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    for (const key of ['_towId', '_strangerId', '_plateId']) {
      const id = this[key];
      if (id != null && typeof removeEntity === 'function') removeEntity(id);
      this[key] = null;
    }
    if (this._flashedOnce) {
      this._nodUntil = now + BRIGHT_ONE_TUNING.nodS;
      if (!this._receipts.has(towDay)) {
        this._receipts.set(towDay, 'flashed');
        this._trimReceipts();
      }
      this.bus.emit(PLANTS_BRIGHT_ONE_EVENT, { kind: 'flashedOnce', t: now });
    }
    if (this._rememberId != null && typeof removeEntity === 'function') removeEntity(this._rememberId);
    this._rememberId = null;
  },

  _onShot(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== BRIGHT_ONE_TUNING.sectorId) return;
    if (p.ownerId !== s.playerId) return;
    if (!towPassing(Number.isFinite(s.simTime) ? s.simTime : 0)) return;
    const station = this._station();
    const tow = this._towId != null ? s.entities.get(this._towId) : null;
    if (!station || !tow || !tow.pos) return;
    const player = s.entities && s.entities.get(s.playerId);
    const from = p.origin || (player && player.pos);
    if (!from) return;
    if (Math.hypot(from.x - tow.pos.x, from.z - tow.pos.z) > BRIGHT_ONE_TUNING.shotRangeWu) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    this._shotTimes.push(now);
    this._shotTimes = this._shotTimes.filter((t) => now - t <= BRIGHT_ONE_TUNING.shotWindowS);
    if (isBrightRun(this._shotTimes, now)) {
      // run bright yourself: remembered beside them
      this._shotTimes = [];
      this._flashedOnce = false;
      const towDay = Math.floor(now / BRIGHT_ONE_TUNING.towPeriodS);
      this._receipts.set(towDay, 'bright');
      this._trimReceipts();
      this._chalkRemember(station);
      this.bus.emit('audio:cue', { id: 'warning', position: from, gain: 0.7, rate: 0.8 });
      this._say(`plants:pl166:bright:${towDay}`, 'Remembered beside the stranger.', 6);
      this.bus.emit(PLANTS_BRIGHT_ONE_EVENT, { kind: 'ranBright', t: now });
      return;
    }
    if (!this._flashedOnce) {
      this._flashedOnce = true;
      this.bus.emit('audio:cue', { id: 'confirm', position: from, gain: 0.6, rate: 1.2 });
    }
  },

  _chalkRemember(station) {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (this._rememberId != null && typeof removeEntity === 'function') removeEntity(this._rememberId);
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: station.pos.x + 48, z: station.pos.z + 36 },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Chalk on the plate — remembered beside them',
        storyPropKind: 'bright_remembered',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'REMEMBERED' },
        plants: { [BRIGHT_ONE_TUNING.plId]: { role: 'remembered' } },
      },
    });
    this._rememberId = ent ? ent.id : null;
  },

  _onDockRange(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== BRIGHT_ONE_TUNING.sectorId) return;
    if (p.stationId !== BRIGHT_ONE_TUNING.stationId || !p.inRange) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    if (this._nodUntil > 0 && now <= this._nodUntil) {
      this._nodUntil = 0;
      // Flash yours at them once: Mother Calloway nods at you later.
      this._say(`plants:pl166:nod:${Math.floor(now)}`, 'Calloway nods as you pass.', 6);
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.6, rate: 0.9 });
      this.bus.emit(PLANTS_BRIGHT_ONE_EVENT, { kind: 'nod', t: now });
    }
  },

  _trimReceipts() {
    while (this._receipts.size > BRIGHT_ONE_TUNING.memoryCap) {
      const oldest = this._receipts.keys().next().value;
      this._receipts.delete(oldest);
    }
  },


  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'MOTHER CALLOWAY', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl, key: BRIGHT_ONE_TUNING.plId });
    }
  },

  _cleanup() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const id of this._ownedIds) removeEntity(id);
    }
    this._ownedIds = new Set();
    this._towId = null;
    this._strangerId = null;
    this._plateId = null;
    this._rememberId = null;
    this._wasPassing = false;
    this._shotTimes = [];
    this._nodUntil = 0;
  },

  // game:newGame: the previous run's street props are already gone — drop the ids and
  // stamps WITHOUT removing, so the new run's first passing spawns fresh and no stale
  // id is removed into a reused live entity at the next sector:exit.
  _resetForNewGame() {
    this._ownedIds = new Set();
    this._towId = null;
    this._strangerId = null;
    this._plateId = null;
    this._rememberId = null;
    this._lastTowDay = -1;
    this._wasPassing = false;
    this._shotTimes = [];
    this._flashedOnce = false;
    this._nodUntil = 0;
    this._receipts = new Map();
  },
};
