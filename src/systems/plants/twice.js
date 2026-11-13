// PL-142 Twice — "Flash once at Lark as she passes lights-off and she flashes back,
// once. Flash twice, and something further off answers — twice, both times you try it."
// What the player can do: "Stick to once; or keep trying twice, and start mapping who
// answers."
//
// Substituted trigger, honestly: there is no lamp-flash input seam in today's sim. The
// ordinary gesture reachable now is a shot's muzzle flash — one player shot near Lark
// during her lights-off pass reads as one flash; a second shot inside the window reads
// as two. The same substitution is shipped precedent (src/systems/plants/waveBackPlant.js).
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; hash32 seeds Lark's lane and the far
//   answerer's position; no Math.random/Date.now; no Three.js/DOM imports.
// - All state on `this` (session-only); bounded answer ledger (tuning.memoryCap);
//   per-attempt cooldown.
// - Anchors sector_nyx_march / poi_nyx_dark_lantern with station_nyx_march as fallback;
//   Lark and the answerer are this module's own spawned props.

import { hash32 } from '../../core/rng.js';

export const PLANTS_TWICE_EVENT = 'plants:twice';

export const TWICE_TUNING = Object.freeze({
  plId: 'pl142',
  sectorId: 'sector_nyx_march',
  stationId: 'station_nyx_march',
  poiId: 'poi_nyx_dark_lantern',
  larkPeriodS: 120,         // her pass comes round on this clock
  passWindowS: 14,          // she is lights-off inside this window of the pass
  shotRangeWu: 420,         // near enough that a shot reads as aimed at her
  doubleWindowS: 2.5,       // two shots inside this = twice
  answererFlashS: 0.7,
  answerSecondFlashS: 1.2,  // the second flash, scheduled in sim time
  farDistWu: 900,           // the answering thing sits further off the lane
  attemptCooldownS: 3,
  memoryCap: 6,             // who answers, mapped (bounded ledger)
});

/** Pure: is Lark mid-pass (lights-off) at `simTime`? */
export function larkLightsOff(simTime, periodS = TWICE_TUNING.larkPeriodS, windowS = TWICE_TUNING.passWindowS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  return ((t % periodS) + periodS) % periodS < windowS;
}

/** Pure: do these shot times contain a double flash inside the window? */
export function isDoubleFlash(shotTimes, now, windowS = TWICE_TUNING.doubleWindowS) {
  const recent = shotTimes.filter((t) => now - t <= windowS);
  return recent.length >= 2;
}

/** Pure: the far answerer's seeded position off the lantern. */
export function answererPos(anchorPos, seed, sectorId, distWu = TWICE_TUNING.farDistWu) {
  const h = Number.isFinite(hash32(seed, sectorId, 'pl142-far')) ? hash32(seed, sectorId, 'pl142-far') : 0;
  const bearing = (h % 6283) / 1000;
  return {
    x: anchorPos.x + Math.cos(bearing) * distWu,
    z: anchorPos.z + Math.sin(bearing) * distWu,
  };
}

export const twicePlant = {
  name: 'plants142',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._larkId = null;
    this._answererId = null;
    this._shotTimes = [];
    this._lastAttempt = 0;
    this._answers = new Map();   // attemptKey -> far point (bounded)
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('combat:fire', (p) => this._onShot(p));
    on('sector:exit', () => this._cleanup());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== TWICE_TUNING.sectorId) return;
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    this._accum += dt;
    if (this._accum < 0.5) return;   // 2 Hz — Lark's pace
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    this._ensureLark(anchor, now);
    const lark = this._larkId != null ? s.entities.get(this._larkId) : null;
    if (lark) {
      if (lark.data && Number.isFinite(lark.data.plants142SecondFlashAt) && now >= lark.data.plants142SecondFlashAt) {
        // scheduled second flash lands here
        lark.data.plants142SecondFlashAt = null;
      }
      const answerer = this._answererId != null ? s.entities.get(this._answererId) : null;
      if (answerer && answerer.data && Number.isFinite(answerer.data.plants142SecondFlashAt)
        && now >= answerer.data.plants142SecondFlashAt) {
        answerer.data.lampsFlashing = true;
        answerer.data.lampFlashUntil = now + TWICE_TUNING.answererFlashS;
        answerer.data.plants142SecondFlashAt = null;
        this.bus.emit('audio:cue', { id: 'confirm', position: answerer.pos, gain: 0.5, rate: 0.7 });
      }
      // Lark runs lights-off: no lamps, no pad, mid-pass.
      if (lark.data) {
        const off = larkLightsOff(now);
        if (off) { delete lark.data.swarmFloorPad; }
        else { lark.data.swarmFloorPad = { label: 'LARK' }; }
      }
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
      if (e && e.alive !== false && e.data && e.data.poiId === TWICE_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === TWICE_TUNING.poiId) return e;
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
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === TWICE_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _ensureLark(anchor, now) {
    if (this._larkId != null) {
      const lark = this.state.entities && this.state.entities.get(this._larkId);
      if (lark && lark.alive !== false) return this._paceLark(anchor, now);
      this._larkId = null;
    }
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const spawnEntity = this.helpers.spawnEntity;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: anchor.pos.x, z: anchor.pos.z },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 24,
      hull: 20,
      hullMax: 20,
      data: {
        parentType: 'story_prop',
        scanLabel: 'LARK — runner, lights-off',
        storyPropKind: 'lark_runner',
        tetherable: true,
        masslineTetherable: true,
      },
    });
    if (ent && ent.id != null) {
      this._larkId = ent.id;
      this._ownedIds.add(ent.id);
      this._paceLark(anchor, now);
    }
  },

  _paceLark(anchor, now) {
    const s = this.state;
    const lark = this._larkId != null ? s.entities.get(this._larkId) : null;
    if (!lark) return;
    const h = Number.isFinite(hash32(s.meta && s.meta.seed, TWICE_TUNING.sectorId, 'pl142-lane'))
      ? hash32(s.meta && s.meta.seed, TWICE_TUNING.sectorId, 'pl142-lane') : 0;
    const bearing = (h % 6283) / 1000;
    const span = 300;
    const phase = ((now % TWICE_TUNING.larkPeriodS) + TWICE_TUNING.larkPeriodS) % TWICE_TUNING.larkPeriodS;
    const t = phase / TWICE_TUNING.passWindowS;   // she crosses inside the window
    const travel = Math.min(1, t) * 2 - 1;        // -1..1 across the span
    lark.pos.x = anchor.pos.x + Math.cos(bearing) * span * travel;
    lark.pos.z = anchor.pos.z + Math.sin(bearing) * span * travel;
  },

  _onShot(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== TWICE_TUNING.sectorId) return;
    if (p.ownerId !== s.playerId) return;   // your flash, not the lane's
    const anchor = this._poi() || this._station();
    const lark = this._larkId != null ? s.entities.get(this._larkId) : null;
    if (!anchor || !lark || !lark.pos) return;
    const origin = p.origin || p.pos;
    const player = s.entities && s.entities.get(s.playerId);
    const from = origin || (player && player.pos);
    if (!from) return;
    const dist = Math.hypot(from.x - lark.pos.x, from.z - lark.pos.z);
    if (dist > TWICE_TUNING.shotRangeWu) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    if (!larkLightsOff(now)) return;        // flash at her as she passes lights-off

    this._shotTimes.push(now);
    this._shotTimes = this._shotTimes.filter((t) => now - t <= TWICE_TUNING.doubleWindowS);

    if (isDoubleFlash(this._shotTimes, now)) {
      this._lastAttempt = now;
      this._shotTimes = [];
      // Twice: something further off answers — twice, both times you try it.
      const answerer = this._ensureAnswerer(anchor);
      if (!answerer) return;
      answerer.data.lampsFlashing = true;
      answerer.data.lampFlashUntil = now + TWICE_TUNING.answererFlashS;
      answerer.data.plants142SecondFlashAt = now + TWICE_TUNING.answerSecondFlashS;
      this.bus.emit('audio:cue', { id: 'confirm', position: answerer.pos, gain: 0.5, rate: 0.7 });
      const attemptKey = String(Math.floor(now));
      if (!this._answers.has(attemptKey)) {
        if (this._answers.size >= TWICE_TUNING.memoryCap) {
          const oldest = this._answers.keys().next().value;
          this._answers.delete(oldest);
        }
        this._answers.set(attemptKey, { x: answerer.pos.x, z: answerer.pos.z });
      }
      this.bus.emit(PLANTS_TWICE_EVENT, {
        kind: 'farAnsweredTwice', attempts: this._answers.size,
        answererPos: { x: answerer.pos.x, z: answerer.pos.z }, t: now,
      });
      return;
    }

    // One flash: she flashes back, once.
    this._lastAttempt = now;
    lark.data.lampsFlashing = true;
    lark.data.lampFlashUntil = now + TWICE_TUNING.answererFlashS;
    this.bus.emit('audio:cue', { id: 'confirm', position: lark.pos, gain: 0.6, rate: 1.4 });
    this.bus.emit(PLANTS_TWICE_EVENT, { kind: 'flashBack', t: now });
  },

  _ensureAnswerer(anchor) {
    const s = this.state;
    if (this._answererId != null) {
      const e = s.entities && s.entities.get(this._answererId);
      if (e && e.alive !== false) return e;
      this._answererId = null;
    }
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const pos = answererPos(anchor.pos, s.meta && s.meta.seed, TWICE_TUNING.sectorId);
    const n = this._answers.size + 1;
    const ent = spawnEntity({
      type: 'beacon',
      pos,
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Something further off — it answers twice',
        storyPropKind: 'twice_answerer',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: `ANSWER ${n}` },
      },
    });
    if (ent && ent.id != null) {
      this._answererId = ent.id;
      this._ownedIds.add(ent.id);
    }
    return ent || null;
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [TWICE_TUNING.plId]: { role: 'lark' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _cleanup() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const id of this._ownedIds) removeEntity(id);
    }
    this._ownedIds = new Set();
    this._larkId = null;
    this._answererId = null;
    this._shotTimes = [];
    this._answers = new Map();
  },
};
