// PL-165 The rat-run — "A delivery skiff takes Rib Street corner by corner off the
// bounce plates, flat out, every hour. The street parts for it — everyone knows the
// run."
// What the player can do: "Follow its line clean, and the street parts for you too; or
// cut it off, and your tag goes chalked on a plate: the one who cut the run."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the route per day is
//   hash32(seed, sector, dayIndex, corner) — no Math.random/Date.now; no Three.js/DOM.
// - All state on `this` (session-only); the skiff and the plates are this module's own
//   spawned props; bounded ledgers (tuning.memoryCap).
// - Anchors sector_pallas_drift / station_drift (Drift Market, Rib Street's apron) —
//   read from live entities; never edits src/data.
// - The skiff is moved only in this module's update, on its own entity.

import { hash32 } from '../../core/rng.js';

export const PLANTS_RAT_RUN_EVENT = 'plants:ratRun';

export const RAT_RUN_TUNING = Object.freeze({
  plId: 'pl165',
  sectorId: 'sector_pallas_drift',
  stationId: 'station_drift',
  corners: 4,
  legSpanWu: 320,
  runPeriodS: 600,          // every hour on the sector-day clock
  runWindowS: 40,           // the run occupies the first window of the day
  runSpeedWu: 110,
  followRadiusWu: 110,
  cutAheadWu: 70,
  cornerArriveWu: 14,
  memoryCap: 8,             // day receipts
});

/** Pure: the day's seeded route — corner positions off the station. */
export function routeFor(seed, sectorId, dayIndex, corners = RAT_RUN_TUNING.corners, spanWu = RAT_RUN_TUNING.legSpanWu) {
  const pts = [];
  for (let i = 0; i < corners; i++) {
    const h = hash32(seed, sectorId, 'pl165', dayIndex, i);
    const bearing = (h % 6283) / 1000;
    const dist = spanWu * (0.55 + ((h >>> 8) % 100) / 220);
    pts.push({ x: Math.cos(bearing) * dist, z: Math.sin(bearing) * dist });
  }
  return pts;
}

/** Pure: is the player ahead of the nose (within cutAheadWu) on the skiff's heading? */
export function aheadOfNose(skiffPos, skiffVel, playerPos, aheadWu = RAT_RUN_TUNING.cutAheadWu) {
  if (!skiffPos || !skiffVel || !playerPos) return false;
  const dx = playerPos.x - skiffPos.x;
  const dz = playerPos.z - skiffPos.z;
  const d = Math.hypot(dx, dz);
  if (!(d > 0) || d > aheadWu) return false;
  const vlen = Math.hypot(skiffVel.x, skiffVel.z);
  if (!(vlen > 0)) return false;
  return (dx * skiffVel.x + dz * skiffVel.z) / (d * vlen) > 0.6;
}

export const ratRunPlant = {
  name: 'plants165',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._skiffId = null;
    this._plateIds = [];
    this._chalkId = null;
    this._lastDay = -1;
    this._route = [];
    this._cornerIdx = 0;
    this._cornersHit = new Set();
    this._cutDone = false;
    this._running = false;
    this._runT = 0;
    this._dayReceipts = new Map();   // dayIndex -> 'parts' | 'cut' (bounded)
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._cleanup());
    on('game:newGame', () => this._resetForNewGame());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== RAT_RUN_TUNING.sectorId) return;
    const station = this._station();
    if (!station) return;
    this._accum += dt;
    if (this._accum < 0.5) return;   // 2 Hz — flat out, but the street is small
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const dayIndex = Math.floor(now / RAT_RUN_TUNING.runPeriodS);
    const dayT = ((now % RAT_RUN_TUNING.runPeriodS) + RAT_RUN_TUNING.runPeriodS) % RAT_RUN_TUNING.runPeriodS;
    const player = s.entities && s.entities.get(s.playerId);

    if (dayIndex !== this._lastDay) {
      this._startRun(dayIndex, station);
    }
    if (!this._running) return;
    this._runT += 0.5;

    const skiff = this._skiffId != null ? s.entities.get(this._skiffId) : null;
    if (!skiff || !player || !player.pos) { this._endRun(false, now); return; }

    // steer the skiff corner to corner, flat out
    const target = this._route[Math.min(this._cornerIdx, this._route.length - 1)];
    if (!target) { this._endRun(true, now); return; }
    const dx = station.pos.x + target.x - skiff.pos.x;
    const dz = station.pos.z + target.z - skiff.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= RAT_RUN_TUNING.cornerArriveWu) {
      if (player.pos && Math.hypot(player.pos.x - skiff.pos.x, player.pos.z - skiff.pos.z) <= RAT_RUN_TUNING.followRadiusWu) {
        this._cornersHit.add(this._cornerIdx);
      }
      this._cornerIdx += 1;
      if (this._cornerIdx >= this._route.length) { this._endRun(true, now); return; }
    } else {
      const step = RAT_RUN_TUNING.runSpeedWu * 0.5;
      skiff.vel.x = dx / d * RAT_RUN_TUNING.runSpeedWu;
      skiff.vel.z = dz / d * RAT_RUN_TUNING.runSpeedWu;
      skiff.pos.x += dx / d * Math.min(step, d);
      skiff.pos.z += dz / d * Math.min(step, d);
      // cut it off: ahead of the nose inside the corridor
      if (!this._cutDone && player.pos && aheadOfNose(skiff.pos, skiff.vel, player.pos, RAT_RUN_TUNING.cutAheadWu)) {
        this._cutDone = true;
        this._chalk(player);
        this._endRun(false, now);
        return;
      }
    }
    if (this._runT > RAT_RUN_TUNING.runWindowS) this._endRun(false, now);
    if (dayT > RAT_RUN_TUNING.runWindowS && !this._running) this._lastDay = dayIndex;
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
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === RAT_RUN_TUNING.stationId) return e;
      }
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === RAT_RUN_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _startRun(dayIndex, station) {
    const s = this.state;
    this._lastDay = dayIndex;
    this._route = routeFor(s.meta && s.meta.seed, RAT_RUN_TUNING.sectorId, dayIndex);
    this._cornerIdx = 0;
    this._cornersHit = new Set();
    this._cutDone = false;
    this._runT = 0;
    this._running = true;
    this._despawnRunProps();
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    // The bounce plates: everyone knows the run.
    for (let i = 0; i < this._route.length; i++) {
      const plate = this._spawn({
        type: 'beacon',
        pos: { x: station.pos.x + this._route[i].x, z: station.pos.z + this._route[i].z },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: 'Bounce plate — the run takes it',
          storyPropKind: 'rib_street_plate',
          tetherable: true,
          masslineTetherable: true,
          swarmFloorPad: { label: 'BOUNCE PLATE' },
        },
      });
      if (plate) this._plateIds.push(plate.id);
    }
    const skiff = this._spawn({
      type: 'beacon',
      pos: { x: station.pos.x, z: station.pos.z },
      vel: { x: 0, z: 0 },
      radius: 7,
      mass: 40,
      hull: 26,
      hullMax: 26,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Delivery skiff — the run, flat out',
        storyPropKind: 'rib_street_skiff',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'THE RUN' },
      },
    });
    this._skiffId = skiff ? skiff.id : null;
  },

  _endRun(completed, now) {
    const s = this.state;
    this._running = false;
    const dayIndex = this._lastDay;
    if (completed && this._cornersHit.size >= RAT_RUN_TUNING.corners && !this._cutDone) {
      // Follow its line clean: the street parts for you too.
      this._dayReceipts.set(dayIndex, 'parts');
      this._trimReceipts();
      this._say(`plants:pl165:parts:${dayIndex}`, 'The street parts for you.', 6);
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.7, rate: 1.1 });
      this.bus.emit(PLANTS_RAT_RUN_EVENT, { kind: 'streetParts', cornersHit: this._cornersHit.size, t: now });
    } else if (!this._cutDone) {
      this._dayReceipts.set(dayIndex, 'ran');
      this._trimReceipts();
    }
    this._despawnRunProps();
  },

  _chalk(player) {
    const s = this.state;
    const dayIndex = this._lastDay;
    this._dayReceipts.set(dayIndex, 'cut');
    this._trimReceipts();
    this.bus.emit('audio:cue', { id: 'ui_deny', position: player.pos, gain: 0.8 });
    this._say(`plants:pl165:cut:${dayIndex}`, 'Chalked on a plate.', 6);
    this.bus.emit(PLANTS_RAT_RUN_EVENT, { kind: 'cutOff', t: this._now() });
    // your tag goes chalked on a plate
    if (this._chalkId != null || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const station = this._station();
    if (!station) return;
    const plate = this._spawn({
      type: 'beacon',
      pos: { x: station.pos.x + 60, z: station.pos.z - 40 },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'A plate on Rib Street — your tag, chalked',
        storyPropKind: 'rib_street_chalk',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'CHALKED · CUT THE RUN' },
      },
    });
    this._chalkId = plate ? plate.id : null;
  },

  _trimReceipts() {
    while (this._dayReceipts.size > RAT_RUN_TUNING.memoryCap) {
      const oldest = this._dayReceipts.keys().next().value;
      this._dayReceipts.delete(oldest);
    }
  },

  _despawnRunProps() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity !== 'function') return;
    if (this._skiffId != null) { removeEntity(this._skiffId); this._skiffId = null; }
    for (const id of this._plateIds) removeEntity(id);
    this._plateIds = [];
  },

  _now() {
    return Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [RAT_RUN_TUNING.plId]: { role: 'run' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'RIB STREET', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl, key: RAT_RUN_TUNING.plId });
    }
  },

  _cleanup() {
    this._despawnRunProps();
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function' && this._chalkId != null) removeEntity(this._chalkId);
    this._chalkId = null;
    for (const id of this._ownedIds) {
      if (typeof removeEntity === 'function') removeEntity(id);
    }
    this._ownedIds = new Set();
    this._running = false;
    this._route = [];
    this._cornersHit = new Set();
  },

  // game:newGame: the previous run's entities are already gone. Drop the ids, the day
  // stamp and the day receipts WITHOUT removing — the run's ids are reused by the new
  // game's own spawns, and a stale `_despawnRunProps` at the first Drift visit would
  // delete live new-game entities.
  _resetForNewGame() {
    this._skiffId = null;
    this._plateIds = [];
    this._chalkId = null;
    this._ownedIds = new Set();
    this._lastDay = -1;
    this._dayReceipts = new Map();
    this._running = false;
    this._route = [];
    this._cornerIdx = 0;
    this._cornersHit = new Set();
    this._cutDone = false;
    this._runT = 0;
  },
};
