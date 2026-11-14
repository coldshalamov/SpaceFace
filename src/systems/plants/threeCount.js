// PL-141 Three-count — "Wait out one beam beside Sabine's rock and she counts you
// across: 'One. Two.' Then a mark chalked for you on the waiting rock — you are one of
// the counters now."
// What the player can do: "Cross on her count, safe; or cross early, and your mark gets
// crossed out."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the beam is a fixed period; hash32
//   seeds the crossing line bearing; no Math.random/Date.now; no Three.js/DOM imports.
// - All state on `this` (session-only); cooldown per beam key; mark state lives on the
//   module's own spawned prop.
// - Anchors sector_eris_margin / poi_eris_mark_stone (the Mark Stone) with
//   station_eris_margin as fallback; props spawned by this module only (never edits
//   src/data).

import { hash32 } from '../../core/rng.js';

export const PLANTS_THREE_COUNT_EVENT = 'plants:threeCount';

export const THREE_COUNT_TUNING = Object.freeze({
  plId: 'pl141',
  sectorId: 'sector_eris_margin',
  stationId: 'station_eris_margin',
  poiId: 'poi_eris_mark_stone',
  beamPeriodS: 24,          // one beam, then the count
  countAtFrac: 0.75,        // "One." at three-quarters of a beam
  crossGraceS: 5,           // after "Two." you may cross, safe
  waitRingWu: 220,          // beside the rock
  lineHalfWu: 320,          // the crossing line through the rock
  crossCooldownS: 8,
  memoryCap: 8,             // beam keys
});

/** Pure: the count state after holding `heldS` beside the rock. */
export function countState(heldS, tuning = THREE_COUNT_TUNING) {
  if (heldS >= tuning.beamPeriodS) return 'counted';
  if (heldS >= tuning.beamPeriodS * tuning.countAtFrac) return 'counting';
  return 'waiting';
}

/** Pure: does the segment prev->pos cross line ab (both by side sign and span)? */
export function crossesLine(prev, pos, a, b) {
  if (!prev || !pos || !a || !b) return false;
  const ux = b.x - a.x;
  const uz = b.z - a.z;
  const len = Math.hypot(ux, uz);
  if (!(len > 0)) return false;
  const nx = uz / len;
  const nz = -ux / len;
  const d0 = (prev.x - a.x) * nx + (prev.z - a.z) * nz;
  const d1 = (pos.x - a.x) * nx + (pos.z - a.z) * nz;
  if (d0 === d1) return false;
  const t = d0 / (d0 - d1);
  if (t < 0 || t > 1) return false;
  const x = prev.x + (pos.x - prev.x) * t;
  const z = prev.z + (pos.z - prev.z) * t;
  const s = ((x - a.x) * ux + (z - a.z) * uz) / (len * len);
  return s >= 0 && s <= 1;
}

export const threeCountPlant = {
  name: 'plants141',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._sabineId = null;
    this._markId = null;
    this._prevPos = null;
    this._heldS = 0;
    this._saidOne = false;
    this._counterUntil = 0;
    this._beamKeys = new Map();   // beamKey -> true (bounded)
    this._crossCooldown = 0;
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._cleanup());
    // game:newGame: _cleanup drops the stale _sabineId/_markId (its removals no-op — the
    // old entities are already gone), and the absolute stamps _crossCooldown/_counterUntil
    // reset, or crossings stay unjudged for ~33 min and one safe-cross comes unearned.
    on('game:newGame', () => { this._cleanup(); this._crossCooldown = 0; this._counterUntil = 0; });
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== THREE_COUNT_TUNING.sectorId) return;
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    this._ensureProps(anchor);
    this._accum += dt;
    if (this._accum < 0.5) return;   // 2 Hz — the beam is slow
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const player = s.entities && s.entities.get(s.playerId);
    if (!player || !player.pos) return;
    const dist = Math.hypot(player.pos.x - anchor.pos.x, player.pos.z - anchor.pos.z);

    // crossing judgment
    const beamKey = String(Math.floor(now / THREE_COUNT_TUNING.beamPeriodS));
    const line = this._line(anchor);
    const crossed = crossesLine(this._prevPos, player.pos, line.a, line.b);
    this._prevPos = { x: player.pos.x, z: player.pos.z };
    if (crossed && now >= this._crossCooldown) {
      this._crossCooldown = now + THREE_COUNT_TUNING.crossCooldownS;
      if (now < this._counterUntil) {
        this._say(`plants:pl141:safe:${beamKey}`, 'Across on her count.', 6);
        this.bus.emit('audio:cue', { id: 'confirm', position: player.pos, gain: 0.7, rate: 1.0 });
        this.bus.emit(PLANTS_THREE_COUNT_EVENT, { kind: 'crossedSafe', t: now });
        this._counterUntil = 0;
      } else if (this._heldS > 2 && this._markId != null) {
        this._setMark('YOUR MARK — CROSSED OUT');
        this._say(`plants:pl141:early:${beamKey}`, "Early. Mark's out.", 6);
        this.bus.emit('audio:cue', { id: 'ui_deny', position: player.pos, gain: 0.6 });
        this.bus.emit(PLANTS_THREE_COUNT_EVENT, { kind: 'crossedOut', t: now });
        this._heldS = 0;
        this._saidOne = false;
      }
    }

    // the wait and the count
    if (dist <= THREE_COUNT_TUNING.waitRingWu) {
      this._heldS += 0.5;
      const state = countState(this._heldS, THREE_COUNT_TUNING);
      if (state === 'counting' && !this._saidOne) {
        this._saidOne = true;
        this._say(`plants:pl141:one:${beamKey}`, 'One.', 5);
      }
      if (state === 'counted' && !this._beamKeys.has(beamKey)) {
        this._beamKeys.set(beamKey, true);
        if (this._beamKeys.size > THREE_COUNT_TUNING.memoryCap) {
          const oldest = this._beamKeys.keys().next().value;
          this._beamKeys.delete(oldest);
        }
        this._say(`plants:pl141:two:${beamKey}`, 'Two.', 5);
        this._counterUntil = now + THREE_COUNT_TUNING.crossGraceS;
        this._setMark('YOUR MARK — COUNTER');
        this.bus.emit('audio:cue', { id: 'confirm', position: anchor.pos, gain: 0.6, rate: 0.9 });
        this.bus.emit(PLANTS_THREE_COUNT_EVENT, { kind: 'marked', t: now });
        this._heldS = 0;
        this._saidOne = false;
      }
    } else if (dist > THREE_COUNT_TUNING.waitRingWu * 2) {
      this._heldS = 0;
      this._saidOne = false;
    }
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

  _poi() {
    const s = this.state;
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) {
      if (e && e.alive !== false && e.data && e.data.poiId === THREE_COUNT_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === THREE_COUNT_TUNING.poiId) return e;
      }
    }
    return null;
  },

  _station() {
    const s = this.state;
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const list of lists) {
      if (!list) continue;
      for (const e of list) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === THREE_COUNT_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _line(anchor) {
    const s = this.state;
    const h = Number.isFinite(hash32(s.meta && s.meta.seed, THREE_COUNT_TUNING.sectorId, 'pl141-line'))
      ? hash32(s.meta && s.meta.seed, THREE_COUNT_TUNING.sectorId, 'pl141-line') : 0;
    const bearing = (h % 6283) / 1000;
    const ux = Math.cos(bearing);
    const uz = Math.sin(bearing);
    return {
      a: { x: anchor.pos.x + ux * THREE_COUNT_TUNING.lineHalfWu, z: anchor.pos.z + uz * THREE_COUNT_TUNING.lineHalfWu },
      b: { x: anchor.pos.x - ux * THREE_COUNT_TUNING.lineHalfWu, z: anchor.pos.z - uz * THREE_COUNT_TUNING.lineHalfWu },
    };
  },

  _ensureProps(anchor) {
    if (this._sabineId != null) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const sabine = this._spawn({
      type: 'beacon',
      pos: { x: anchor.pos.x + 40, z: anchor.pos.z + 24 },
      vel: { x: 0, z: 0 },
      radius: 8,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'SABINE — waits out the beam',
        storyPropKind: 'sabine_rock',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'SABINE\u2019S ROCK' },
      },
    });
    this._sabineId = sabine ? sabine.id : null;
    const mark = this._spawn({
      type: 'beacon',
      pos: { x: anchor.pos.x - 34, z: anchor.pos.z - 30 },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The waiting rock — a mark chalked for you',
        storyPropKind: 'sabine_mark',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'THE WAITING ROCK' },
      },
    });
    this._markId = mark ? mark.id : null;
  },

  _setMark(label) {
    if (this._markId == null) return;
    const mark = this.state.entities && this.state.entities.get(this._markId);
    if (mark && mark.data) mark.data.swarmFloorPad = { label };
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [THREE_COUNT_TUNING.plId]: { role: 'rock' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'SABINE', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl, key: THREE_COUNT_TUNING.plId });
    }
  },

  _cleanup() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const id of this._ownedIds) removeEntity(id);
    }
    this._ownedIds = new Set();
    this._sabineId = null;
    this._markId = null;
    this._prevPos = null;
    this._heldS = 0;
    this._saidOne = false;
    this._counterUntil = 0;
    this._beamKeys = new Map();
  },
};
