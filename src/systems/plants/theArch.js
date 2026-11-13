// PL-167 The arch — "Where the growth bridged two hulls, locals fly through the living
// arch — wide on the exhale, narrow on the inhale."
// What the player can do: "Thread it on the exhale; or on the inhale, if you must."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the breath is a fixed period with a
//   seeded phase (hash32); no Math.random/Date.now; no Three.js/DOM imports.
// - All state on `this` (session-only); the two arch mouths are this module's own props
//   and they move only in this module's update — the gap widens on the exhale and closes
//   on the inhale.
// - Anchors sector_charon_expanse / poi_charon_hull_garden (Three Hull Garden) with
//   station_expanse as fallback; never edits src/data.
// - The inhale's squeeze is a real queued impulse (queuePhysicsImpulse), small and
//   sideways — the growth makes room the hard way.

import { hash32 } from '../../core/rng.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const PLANTS_ARCH_EVENT = 'plants:theArch';

export const ARCH_TUNING = Object.freeze({
  plId: 'pl167',
  sectorId: 'sector_charon_expanse',
  stationId: 'station_expanse',
  poiId: 'poi_charon_hull_garden',
  breathPeriodS: 40,          // one full breath
  mouthGapWideWu: 96,         // exhale
  mouthGapNarrowWu: 44,       // inhale
  squeezeImpulse: 140,
  crossCooldownS: 10,         // re-arms once you leave the arch water
  rearWu: 200,
  memoryCap: 4,               // crossing receipts
});

/** Pure: exhale is the first half of the seeded breath cycle. */
export function exhaleOpen(simTime, phase, periodS = ARCH_TUNING.breathPeriodS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  const m = ((t - phase) % periodS + periodS) % periodS;
  return m < periodS / 2;
}

/** Pure: the breath phase for a sector. */
export function breathPhase(seed, sectorId, salt = 'pl167-breath') {
  const h = Number.isFinite(hash32(seed, sectorId, salt)) ? hash32(seed, sectorId, salt) : 0;
  return h % ARCH_TUNING.breathPeriodS;
}

/** Pure: does the segment prev->pos cross segment ab? */
export function crossesSegment(prev, pos, a, b) {
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

export const theArchPlant = {
  name: 'plants167',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._portId = null;
    this._starId = null;
    this._prevPos = null;
    this._wasExhale = true;
    this._lastCross = 0;
    this._armed = true;
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._cleanup());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== ARCH_TUNING.sectorId) return;
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    this._ensureProps(anchor);
    this._accum += dt;
    if (this._accum < 0.5) return;   // 2 Hz — a slow breath, a fast thread
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const player = s.entities && s.entities.get(s.playerId);
    if (!player || !player.pos) return;
    const phase = breathPhase(s.meta && s.meta.seed, ARCH_TUNING.sectorId);
    const exhale = exhaleOpen(now, phase);

    // the living arch breathes: the mouths drift apart and back
    const gap = exhale ? ARCH_TUNING.mouthGapWideWu : ARCH_TUNING.mouthGapNarrowWu;
    const a = { x: anchor.pos.x, z: anchor.pos.z };
    const b = { x: anchor.pos.x + gap, z: anchor.pos.z };
    const port = this._portId != null ? s.entities.get(this._portId) : null;
    const star = this._starId != null ? s.entities.get(this._starId) : null;
    if (port) { port.pos.x = a.x; port.pos.z = a.z; }
    if (star) { star.pos.x = b.x; star.pos.z = b.z; }

    const distToArch = Math.min(
      Math.hypot(player.pos.x - a.x, player.pos.z - a.z),
      Math.hypot(player.pos.x - b.x, player.pos.z - b.z),
    );
    if (distToArch > ARCH_TUNING.rearWu) this._armed = true;

    const crossed = crossesSegment(this._prevPos, player.pos, a, b);
    this._prevPos = { x: player.pos.x, z: player.pos.z };
    if (crossed && this._armed && now - this._lastCross >= ARCH_TUNING.crossCooldownS) {
      this._lastCross = now;
      this._armed = false;
      if (exhale) {
        // Threaded on the exhale: wide, clean.
        this._say(`plants:pl167:wide:${Math.floor(now)}`, 'Wide on the exhale. Clean.', 6);
        this.bus.emit('audio:cue', { id: 'confirm', position: player.pos, gain: 0.7, rate: 1.0 });
        this.bus.emit(PLANTS_ARCH_EVENT, { kind: 'threadedWide', gap, t: now });
      } else {
        // On the inhale, if you must: the growth makes room the hard way.
        queuePhysicsImpulse(player, { x: 0, z: ARCH_TUNING.squeezeImpulse },
          { tick: s.tick, externalEffect: true });
        this._say(`plants:pl167:narrow:${Math.floor(now)}`, 'Narrow on the inhale.', 6);
        this.bus.emit('audio:cue', { id: 'warning', position: player.pos, gain: 0.4, rate: 0.8 });
        this.bus.emit(PLANTS_ARCH_EVENT, { kind: 'threadedNarrow', gap, t: now });
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
      if (e && e.alive !== false && e.data && e.data.poiId === ARCH_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === ARCH_TUNING.poiId) return e;
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
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === ARCH_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _ensureProps(anchor) {
    if (this._portId != null) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const port = this._spawn({
      type: 'beacon',
      pos: { x: anchor.pos.x, z: anchor.pos.z },
      vel: { x: 0, z: 0 },
      radius: 9,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The living arch — port mouth, grown over two hulls',
        storyPropKind: 'arch_mouth_port',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'ARCH — PORT' },
      },
    });
    this._portId = port ? port.id : null;
    const star = this._spawn({
      type: 'beacon',
      pos: { x: anchor.pos.x + ARCH_TUNING.mouthGapWideWu, z: anchor.pos.z },
      vel: { x: 0, z: 0 },
      radius: 9,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The living arch — starboard mouth',
        storyPropKind: 'arch_mouth_starboard',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'ARCH — STARBOARD' },
      },
    });
    this._starId = star ? star.id : null;
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [ARCH_TUNING.plId]: { role: 'arch' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'THE GARDEN', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl, key: ARCH_TUNING.plId });
    }
  },

  _cleanup() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const id of this._ownedIds) removeEntity(id);
    }
    this._ownedIds = new Set();
    this._portId = null;
    this._starId = null;
    this._prevPos = null;
    this._armed = true;
  },
};
