// PL-169 The old trail — "Someone's trail runs into an ash drift and stops. Follow it:
// the out-trail is there too, wind-filled, and a lamp still burns where they rested."
// What the player can do: "Follow it through; or plough your own line beside it — both
// trails stay."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the trail is a seeded line
//   (hash32(seed, sector, salt, marker)); no Math.random/Date.now; no Three.js/DOM.
// - All state on `this` (session-only); markers are this module's own spawned props;
//   your ploughed line is bounded (tuning.ownLineCap).
// - Anchors sector_ashfall_reach / poi_ashfall_burn_lamp (the Burn Lamp field) with
//   station_ashcache as fallback; never edits src/data.

import { hash32 } from '../../core/rng.js';

export const PLANTS_OLD_TRAIL_EVENT = 'plants:theOldTrail';

export const OLD_TRAIL_TUNING = Object.freeze({
  plId: 'pl169',
  sectorId: 'sector_ashfall_reach',
  stationId: 'station_ashcache',
  poiId: 'poi_ashfall_burn_lamp',
  markers: 5,
  legWu: 160,               // spacing between trail markers
  markerRangeWu: 90,        // close enough to have "followed" a marker
  restLampIdx: 2,           // a lamp still burns where they rested
  outTrailCount: 3,
  ploughRangeWu: 140,       // a throw landing this close ploughs beside the trail
  ploughLinesNeeded: 2,
  ownLineCap: 4,            // memoryCap: your line's markers
  memoryCap: 16,            // all trail props this module may hold
});

/** Pure: the seeded trail line: marker positions off the anchor. */
export function trailLine(anchorPos, seed, sectorId, count = OLD_TRAIL_TUNING.markers, legWu = OLD_TRAIL_TUNING.legWu) {
  const h = Number.isFinite(hash32(seed, sectorId, 'pl169-heading')) ? hash32(seed, sectorId, 'pl169-heading') : 0;
  const bearing = (h % 6283) / 1000;
  const ux = Math.cos(bearing);
  const uz = Math.sin(bearing);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const drift = ((hash32(seed, sectorId, 'pl169', i) % 100) / 100 - 0.5) * 40;
    pts.push({
      x: anchorPos.x + ux * legWu * (i + 1) - uz * drift,
      z: anchorPos.z + uz * legWu * (i + 1) + ux * drift,
    });
  }
  return { pts, bearing };
}

/** Pure: did the player pass marker idx+1 in order? */
export function inOrder(progress, idx) {
  return idx === progress;
}

export const theOldTrailPlant = {
  name: 'plants169',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._markerIds = [];
    this._lampId = null;
    this._ownLineIds = [];
    this._progress = 0;
    this._revealed = false;
    this._throughDone = false;
    this._bothDone = false;
    this._ploughPoses = [];
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('massline:throw', (p) => this._onThrow(p));
    on('sector:exit', () => this._resetVisit());
    // game:newGame: no sector:exit fires at the boot boundary, so the trail's markers,
    // rest lamp and progress flags would survive into the new game — the trail and lamp
    // never respawn and _followedThrough stamps lamps on a live reused id-holder.
    on('game:newGame', () => this._resetVisit());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== OLD_TRAIL_TUNING.sectorId) return;
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    this._accum += dt;
    if (this._accum < 1) return;   // 1 Hz — ash drift pace
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    this._ensureProps(anchor, now);
    const player = s.entities && s.entities.get(s.playerId);
    if (!player || !player.pos) return;

    if (!this._throughDone) {
      const anchor2 = this._poi() || this._station();
      const line = trailLine(anchor2.pos, s.meta && s.meta.seed, OLD_TRAIL_TUNING.sectorId);
      for (let i = 0; i < line.pts.length; i++) {
        const d = Math.hypot(player.pos.x - line.pts[i].x, player.pos.z - line.pts[i].z);
        if (d <= OLD_TRAIL_TUNING.markerRangeWu && inOrder(this._progress, i)) {
          this._progress = i + 1;
          if (this._progress >= OLD_TRAIL_TUNING.markers) this._followedThrough(anchor2, now);
          break;
        }
      }
    }
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawnOwned();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _poi() {
    const s = this.state;
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) {
      if (e && e.alive !== false && e.data && e.data.poiId === OLD_TRAIL_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === OLD_TRAIL_TUNING.poiId) return e;
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
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === OLD_TRAIL_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _ensureProps(anchor, now) {
    if (this._markerIds.length > 0) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const s = this.state;
    const line = trailLine(anchor.pos, s.meta && s.meta.seed, OLD_TRAIL_TUNING.sectorId);
    for (let i = 0; i < line.pts.length; i++) {
      const isEnd = i === line.pts.length - 1;
      const isRest = i === OLD_TRAIL_TUNING.restLampIdx;
      const marker = this._spawn({
        type: 'beacon',
        pos: line.pts[i],
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: isEnd ? 'The old trail — it runs into the ash and stops' : `The old trail — marker ${i + 1}`,
          storyPropKind: 'old_trail_marker',
          tetherable: true,
          masslineTetherable: true,
          swarmFloorPad: { label: isEnd ? 'THE TRAIL STOPS' : `OLD TRAIL ${i + 1}` },
        },
      });
      if (marker) this._markerIds.push(marker.id);
      if (isRest && this._lampId == null) {
        const lamp = this._spawn({
          type: 'beacon',
          pos: { x: line.pts[i].x + 14, z: line.pts[i].z + 14 },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          data: {
            parentType: 'story_prop',
            scanLabel: 'A lamp still burns where they rested',
            storyPropKind: 'old_trail_lamp',
            tetherable: true,
            masslineTetherable: true,
            swarmFloorPad: { label: 'THEIR LAMP' },
          },
        });
        this._lampId = lamp ? lamp.id : null;
      }
    }
  },

  _followedThrough(anchor, now) {
    this._throughDone = true;
    // Follow it: the out-trail is there too, wind-filled.
    const s = this.state;
    if (!this._revealed && this.helpers && typeof this.helpers.spawnEntity === 'function') {
      this._revealed = true;
      const line = trailLine(anchor.pos, s.meta && s.meta.seed, OLD_TRAIL_TUNING.sectorId);
      const last = line.pts[line.pts.length - 1];
      const ux = Math.cos(line.bearing);
      const uz = Math.sin(line.bearing);
      for (let i = 0; i < OLD_TRAIL_TUNING.outTrailCount; i++) {
        const out = this._spawn({
          type: 'beacon',
          pos: { x: last.x + ux * OLD_TRAIL_TUNING.legWu * (i + 1), z: last.z + uz * OLD_TRAIL_TUNING.legWu * (i + 1) },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          data: {
            parentType: 'story_prop',
            scanLabel: 'The out-trail — wind-filled, but there',
            storyPropKind: 'old_trail_out',
            tetherable: true,
            masslineTetherable: true,
            swarmFloorPad: { label: 'OUT-TRAIL — WIND-FILLED' },
          },
        });
        if (out) { this._markerIds.push(out.id); if (out.id != null) this._ownedIds.add(out.id); }
      }
    }
    // the lamp finds the follower
    const lamp = this._lampId != null ? s.entities.get(this._lampId) : null;
    if (lamp && lamp.data) {
      lamp.data.lampsFlashing = true;
      lamp.data.lampFlashUntil = now + 5;
    }
    this._say(`plants:pl169:through:${Math.floor(now)}`, "Out-trail's there. Wind-filled.", 6);
    this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.6, rate: 0.9 });
    this.bus.emit(PLANTS_OLD_TRAIL_EVENT, { kind: 'followedThrough', t: now });
  },

  _onThrow(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== OLD_TRAIL_TUNING.sectorId) return;
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    const player = s.entities && s.entities.get(s.playerId);
    const from = p.pos || (player && player.pos);
    if (!from) return;
    const line = trailLine(anchor.pos, s.meta && s.meta.seed, OLD_TRAIL_TUNING.sectorId);
    const nearTrail = line.pts.some((pt) => Math.hypot(from.x - pt.x, from.z - pt.z) <= OLD_TRAIL_TUNING.ploughRangeWu);
    if (!nearTrail) return;
    // plough your own line beside it
    const dupe = this._ploughPoses.some((pt) => Math.hypot(from.x - pt.x, from.z - pt.z) < 40);
    if (!dupe) this._ploughPoses.push({ x: from.x, z: from.z });
    if (this._ownLineIds.length < OLD_TRAIL_TUNING.ownLineCap && !dupe
      && this.helpers && typeof this.helpers.spawnEntity === 'function') {
      const spawnEntity = this.helpers.spawnEntity;
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: from.x, z: from.z },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: 'Your line — ploughed beside the old trail',
          storyPropKind: 'old_trail_own_line',
          tetherable: true,
          masslineTetherable: true,
          swarmFloorPad: { label: 'YOUR LINE' },
          plants: { [OLD_TRAIL_TUNING.plId]: { role: 'own_line' } },
        },
      });
      if (ent && ent.id != null) { this._ownLineIds.push(ent.id); this._ownedIds.add(ent.id); }
    }
    if (this._ownLineIds.length >= OLD_TRAIL_TUNING.ploughLinesNeeded && !this._bothDone) {
      this._bothDone = true;
      // both trails stay
      this._say(`plants:pl169:both:${Math.floor(Number.isFinite(s.simTime) ? s.simTime : 0)}`, 'Both trails stay.', 6);
      this.bus.emit(PLANTS_OLD_TRAIL_EVENT, {
        kind: 'bothTrails', ownMarkers: this._ownLineIds.length, t: Number.isFinite(s.simTime) ? s.simTime : 0,
      });
    }
  },

  _resetVisit() {
    this._progress = 0;
    this._throughDone = false;
    this._bothDone = false;
    this._revealed = false;
    this._ploughPoses = [];
    this._despawnOwned();
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [OLD_TRAIL_TUNING.plId]: { role: 'trail' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'THE TRAIL', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'info', id, text, ttl, key: OLD_TRAIL_TUNING.plId });
    }
  },

  _despawnOwned() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity !== 'function') return;
    for (const id of this._ownedIds) removeEntity(id);
    this._ownedIds = new Set();
    this._markerIds = [];
    this._lampId = null;
    this._ownLineIds = [];
  },
};
