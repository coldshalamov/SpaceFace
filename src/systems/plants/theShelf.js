// PL-139 The shelf — "Leave anything against the wall on the inhale; on the exhale it
// sits flush in the wall, kept. Leave it too long and it is part of the road."
// What the player can do: "Take it back on the exhale, on the Line; or start a row of
// things you meant to keep."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the breathing seam is the Bolus iris
//   clock (bolusIrisOpen, src/data/theBolus.js) — no Math.random/Date.now; no Three.js.
// - All state on `this` (session-only); the shelf ledger is a bounded Map
//   (tuning.memoryCap); nothing here writes entity.vel — the flush-in is a position
//   settle onto the authored wall line.
// - Anchors sector_the_bolus / BOLUS_WALL_X (the Cartilage Road wall) — constants from
//   src/data/theBolus.js; the module spawns nothing until the player leaves something.
// - "Part of the road" converts a kept body to a dressing row via insertDressingRow —
//   the world's own dressing table contract (session-scope), never a src/data edit.

import { BOLUS_SECTOR_ID, BOLUS_WALL_X, bolusIrisOpen } from '../../data/theBolus.js';
import { insertDressingRow } from '../../world/dressingTable.js';

export const PLANTS_SHELF_EVENT = 'plants:theShelf';

export const SHELF_TUNING = Object.freeze({
  plId: 'pl139',
  sectorId: BOLUS_SECTOR_ID,
  wallX: BOLUS_WALL_X,
  shelfWidthWu: 120,      // against the wall: this close to the wall line
  scanRadiusWu: 900,      // how far the shelf watches from the wall
  roadCycles: 3,          // kept through this many exhales = part of the road
  memoryCap: 8,           // items on the shelf ledger
});

/** Pure: is this body against the wall (on the shelf strip)? */
export function againstTheWall(pos, wallX = SHELF_TUNING.wallX, widthWu = SHELF_TUNING.shelfWidthWu) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  return Math.abs(pos.x - wallX) <= widthWu;
}

/** Pure: shelf verdict for a ledgered item this exhale edge. */
export function shelfEdgeVerdict(cycles, roadCycles = SHELF_TUNING.roadCycles) {
  return cycles + 1 >= roadCycles ? 'road' : 'kept';
}

export const theShelfPlant = {
  name: 'plants139',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ledger = new Map();     // entityId -> { leftAt, keptAt, cycles }
    this._wasExhale = false;
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('pickup:collected', (p) => this._onTakenBack(p));
    on('tether:snapCatch', (p) => this._onTakenBack(p));
    on('sector:exit', () => { this._ledger = new Map(); this._wasExhale = false; });
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== SHELF_TUNING.sectorId) return;
    this._accum += dt;
    if (this._accum < 1) return;   // 1 Hz — the breath is slow
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const exhale = bolusIrisOpen(now);

    if (!exhale) this._watchShelf(now);
    if (exhale && !this._wasExhale) this._onExhaleEdge(now);
    this._wasExhale = exhale;
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._ledger = new Map();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _watchShelf(now) {
    const s = this.state;
    if (this._ledger.size >= SHELF_TUNING.memoryCap) return;
    const seen = [];
    const seenIds = new Set();
    const consider = (e) => {
      if (!e || e.alive === false || !e.pos) return;
      if (!againstTheWall(e.pos, SHELF_TUNING.wallX, SHELF_TUNING.shelfWidthWu)) return;
      if (Math.abs(e.pos.x - SHELF_TUNING.wallX) > SHELF_TUNING.scanRadiusWu) return;
      if (e.id === s.playerId) return;
      if (e.data && e.data.plants && e.data.plants[SHELF_TUNING.plId]) return;   // never shelf my own props
      if (this._ledger.has(e.id) || seenIds.has(e.id)) return;
      if (e.type !== 'payload' && e.type !== 'pickup') return;
      seenIds.add(e.id);
      seen.push(e);
    };
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) consider(e);
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) consider(e);
    }
    for (const e of seen) {
      if (this._ledger.size >= SHELF_TUNING.memoryCap) break;
      this._ledger.set(e.id, { leftAt: now, keptAt: null, cycles: 0 });
      this.bus.emit(PLANTS_SHELF_EVENT, { kind: 'leftOnInhale', entityId: e.id, t: now });
    }
  },

  _onExhaleEdge(now) {
    const s = this.state;
    let keptCount = 0;
    for (const [id, rec] of this._ledger) {
      const e = s.entities && s.entities.get(id);
      if (!e || e.alive === false) { this._ledger.delete(id); continue; }
      if (rec.keptAt == null) {
        // On the exhale it sits flush in the wall, kept.
        e.pos.x = SHELF_TUNING.wallX;
        if (!e.data) e.data = {};
        e.data.swarmFloorPad = { label: 'THE SHELF — KEPT' };
        rec.keptAt = now;
        keptCount += 1;
      } else {
        rec.cycles += 1;
        if (shelfEdgeVerdict(rec.cycles, SHELF_TUNING.roadCycles) === 'road') {
          this._makeRoad(e, rec);
          continue;
        }
      }
    }
    if (keptCount > 0) {
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.6, rate: 0.7 });
      this.bus.emit(PLANTS_SHELF_EVENT, { kind: 'kept', count: keptCount, t: now });
    }
  },

  _makeRoad(e, rec) {
    this._ledger.delete(e.id);
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') removeEntity(e.id);
    // Leave it too long and it is part of the road: a dressing row on the wall line.
    if (e.pos && typeof insertDressingRow === 'function') {
      try {
        insertDressingRow(this.state, {
          type: 'shelf_road',
          pos: { x: SHELF_TUNING.wallX, z: e.pos.z },
          rot: 0,
          radius: 10,
          data: {
            plants: { [SHELF_TUNING.plId]: { role: 'road' } },
            scanLabel: 'Part of the road — kept too long',
          },
        });
      } catch (err) { /* the road keeps its shape even if the table refuses a row */ }
    }
    this.bus.emit(PLANTS_SHELF_EVENT, { kind: 'road', entityId: e.id, t: this._now() });
  },

  _onTakenBack(p) {
    const s = this.state;
    if (!s || !p || p.id == null) return;
    const rec = this._ledger.get(p.id);
    if (!rec) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const onExhale = bolusIrisOpen(now);
    this._ledger.delete(p.id);
    const e = s.entities && s.entities.get(p.id);
    if (e && e.data && e.data.swarmFloorPad && e.data.swarmFloorPad.label === 'THE SHELF — KEPT') {
      delete e.data.swarmFloorPad;
    }
    if (onExhale) {
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.6, rate: 1.0 });
      this.bus.emit(PLANTS_SHELF_EVENT, { kind: 'takenBack', entityId: p.id, t: now });
    }
  },

  _now() {
    return Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
  },
};
