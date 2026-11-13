// PL-244 Paper trail — Your unpaid fines chase you from dock to dock as paper tags taped to your berth post.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Your unpaid fines chase you from dock to dock as paper tags taped to your
//   berth post
//   What the player can do: Pay them; or let them accumulate — a bouquet of debts
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via PAPER_TRAIL_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; paper tags are props
//  spawned at the berth post, so this plant steers nobody.
// - Cooldowns per station key. All session state lives on `this`, never module-level.
//
// Incidents are the receipt's real shape: `law:incidentOpened` carries attackerId/victimId/
// victimAnchor (lawSecurity publicIncident). Only incidents where attackerId === playerId
// count as your unpaid fines. Tags are physical props taped at the berth post.

import { hash32 } from '../../core/rng.js';

export const PLANTS_PAPER_TRAIL_TAG_EVENT = 'plants:paperTrailTagged';
export const PLANTS_PAPER_TRAIL_PAID_EVENT = 'plants:paperTrailPaid';
export const PLANTS_PAPER_TRAIL_BOUQUET_EVENT = 'plants:paperTrailBouquet';

export const PAPER_TRAIL_TUNING = Object.freeze({
  tagRadius: 2,               // a paper tag is small
  tagMass: 1,                 // it is paper
  tagHull: 2,
  bouquetCap: 5,              // "a bouquet of debts": most tags one berth post will hold
  berthOffsetWu: 34,          // tags tape onto the berth post, this far off the station heart
  tagSpreadWu: 6,             // successive tags tape on slightly apart
  memoryCap: 16,              // bounded station rows
});

export const PAPER_TRAIL_CLEAN_LINE = 'Clean slate. About time.';
export const PAPER_TRAIL_BOUQUET_LINE = 'Quite the bouquet.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): how many unpaid fines trail the player — the plant's own ledger of
 * `law:incidentOpened` receipts attributed to the player (attackerId === playerId).
 */
export function outstandingFinesOf(incidentCount = 0) {
  return Math.max(0, Math.floor(Number(incidentCount) || 0));
}

/**
 * Memory-row builder (pure): per-station berth-post row, FIFO + stale eviction at the cap.
 */
export function paperTrailRowFor(memory, stationId, now, cap = PAPER_TRAIL_TUNING.memoryCap) {
  if (!memory || !stationId) return null;
  let row = memory.get(stationId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { tagIds: [], bouquetAt: -Infinity, lastAt: now };
    memory.set(stationId, row);
  }
  return row;
}

export const paperTrailOps = {
  _initPaperTrail(ctx = {}) {
    this._paperTrailMemory = new Map();
    this._paperTrailIncidents = 0;
    if (this.bus && typeof this.bus.on === 'function' && !this._paperTrailInstalled) {
      this._paperTrailInstalled = true;
      this.bus.on('dock:range', (p) => this._onPaperTrailDockRange(p));
      this.bus.on('law:incidentOpened', (p) => this._onPaperTrailIncident(p));
      // A fine actually paid at a window clears one chase-paper row: the live seam is
      // lawSecurity's law:fineAssessed receipt ({stationId, amount, paid, choice, ...}).
      this.bus.on('law:fineAssessed', (p) => this._onPaperTrailFinePaid(p));
    }
  },

  _paperTrailMemoryMap() {
    if (!(this._paperTrailMemory instanceof Map)) this._paperTrailMemory = new Map();
    return this._paperTrailMemory;
  },

  _paperTrailStationById(id) {
    if (id == null || !this.state || !Array.isArray(this.state.stations)) return null;
    return this.state.stations.find(
      (s) => s && ((s.data && s.data.stationId) || s.id) === id,
    ) || null;
  },

  _onPaperTrailIncident(payload) {
    if (!payload || !this.state) return;
    // Only the player's own attributed incidents count as fines chasing you.
    if (payload.attackerId !== this.state.playerId) return;
    this._paperTrailIncidents += 1;
  },

  // One fine actually paid (paid, not a re-read of an already-settled row) clears one tag.
  _onPaperTrailFinePaid(payload) {
    if (!payload || payload.paid !== true || payload.alreadySettled === true) return;
    if (this._paperTrailIncidents > 0) this._paperTrailIncidents -= 1;
  },

  _onPaperTrailDockRange(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    // UI re-emits of dock:range carry no shipId — only physics receipts with the player's
    // shipId drive the paper trail.
    if (payload.shipId !== this.state.playerId || payload.inRange !== true) return;
    const station = this._paperTrailStationById(payload.stationId);
    if (!station) return;
    const now = finite(this.state.simTime, 0);
    const stationId = payload.stationId;
    const row = paperTrailRowFor(this._paperTrailMemoryMap(), stationId, now);
    if (!row) return;
    row.lastAt = now;

    const fines = outstandingFinesOf(this._paperTrailIncidents);

    // Pay them: clean slate, the tags come off the post.
    if (fines <= 0) {
      if (row.tagIds.length) {
        const removeEntity = this.helpers && this.helpers.removeEntity;
        if (typeof removeEntity === 'function') {
          for (const tagId of row.tagIds) removeEntity(tagId);
        }
        row.tagIds = [];
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_PAPER_TRAIL_PAID_EVENT, { stationId, t: now });
          this.bus.emit('audio:cue', { id: 'confirm', position: { x: station.pos.x, z: station.pos.z }, gain: 0.6, rate: 1 });
          this.bus.emit('comms:popup', {
            id: 'plants:pl244:paid',
            sender: 'DOCK',
            category: 'traffic',
            text: PAPER_TRAIL_CLEAN_LINE,
            ttl: 5,
          });
        }
      }
      return;
    }

    // Let them accumulate: one paper tag per new fine, taped to your berth post, dock to dock.
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const ang = (hash32(String(stationId), 'paperTrail', 'post') % 6283) / 1000;
    const px = finite(station.pos.x) + Math.cos(ang) * PAPER_TRAIL_TUNING.berthOffsetWu;
    const pz = finite(station.pos.z) + Math.sin(ang) * PAPER_TRAIL_TUNING.berthOffsetWu;

    let tagged = 0;
    while (row.tagIds.length < fines && row.tagIds.length < PAPER_TRAIL_TUNING.bouquetCap) {
      const i = row.tagIds.length;
      const tag = spawnEntity({
        type: 'cargo',
        pos: { x: px + (i % 3) * PAPER_TRAIL_TUNING.tagSpreadWu, z: pz + Math.floor(i / 3) * PAPER_TRAIL_TUNING.tagSpreadWu },
        vel: { x: 0, z: 0 },
        radius: PAPER_TRAIL_TUNING.tagRadius,
        mass: PAPER_TRAIL_TUNING.tagMass,
        physicsBody: { mass: PAPER_TRAIL_TUNING.tagMass },
        hull: PAPER_TRAIL_TUNING.tagHull,
        hullMax: PAPER_TRAIL_TUNING.tagHull,
        data: {
          paperTag: true,
          playerId: this.state.playerId,
          tetherable: true,
          masslineTetherable: true,
          scanLabel: 'Paper tag',
        },
      });
      if (!tag || tag.id == null) break;
      row.tagIds.push(tag.id);
      tagged += 1;
    }

    if (tagged > 0 && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_PAPER_TRAIL_TAG_EVENT, { stationId, tags: row.tagIds.length, fines, t: now });
      if (row.tagIds.length >= PAPER_TRAIL_TUNING.bouquetCap && row.bouquetAt < 0) {
        row.bouquetAt = now;
        this.bus.emit(PLANTS_PAPER_TRAIL_BOUQUET_EVENT, { stationId, tags: row.tagIds.length, t: now });
        this.bus.emit('comms:popup', {
          id: 'plants:pl244:bouquet',
          sender: 'DOCK',
          category: 'traffic',
          text: PAPER_TRAIL_BOUQUET_LINE,
          ttl: 5,
        });
      }
    }
  },
};
