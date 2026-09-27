// BP-02.1/C3 Scan-Reveals-Loadout, extended to wreck investigation.
//
// Additive listener over scanner's scan:pulse seam. Ships resolve loadouts (untouched
// behavior); wrecks now resolve in three tiers — a far pulse sees a silhouette, a near
// pulse names the ledger loss behind it, a close pulse reads the manifest. Stories only
// ever attach when the wreck's provenance lossId matches a real lossLedger entry;
// generic debris reads class-only at every tier and never borrows a story.
//
// Writes only entity.data.scanRevealed plus a small durable investigated-loss memory
// (state.scanReveal) so a surveyed field stays surveyed. UI reads; AI/combat never do.
import {
  buildShipScanReveal, buildWreckScanReveal, debrisCacheFor, sameScanReveal,
  spawnDebrisCachePods,
} from '../data/scanReveal.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';

const INVESTIGATED_CAP = 64;
// INF-U14: the survey pays. Deep investigations used to end in a toast — the
// scan:wreckInvestigated event had no listeners at all. Now the first deep read
// of a loss-linked wreck files a cartography claim through the canonical credit
// writer, cold cases pay a premium, and surveyed-field milestones post chart
// bonuses. Generic debris (no ledger loss behind it) still pays nothing.
const CARTOGRAPHY_BOUNTY_CR = 150;
const CARTOGRAPHY_COLD_MULT = 2;
const CARTOGRAPHY_MILESTONE_CR = Object.freeze({ 3: 200, 6: 450, 10: 800 });

export const scanReveal = {
  name: 'scanReveal',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._onScanPulse = (payload) => this._scan(payload || {});
    if (this.bus && typeof this.bus.on === 'function') this.bus.on('scan:pulse', this._onScanPulse);
  },

  _scan(payload) {
    const state = this.state;
    const origin = payload && payload.pos;
    if (!state || !origin) return;
    const playerId = state.playerId;
    const list = indexedShipLikeScan(state);
    for (const entity of list) {
      if (!entity || entity.id === playerId) continue;
      const data = entity.data || (entity.data = {});
      const reveal = buildShipScanReveal(entity, state, {
        origin,
        now: state.simTime || 0,
        previous: data.scanRevealed || null,
      });
      if (!reveal) continue;
      if (sameScanReveal(data.scanRevealed, reveal)) {
        data.scanRevealed = { ...reveal, revealedAt: data.scanRevealed.revealedAt };
        continue;
      }
      data.scanRevealed = reveal;
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('scan:shipRevealed', reveal);
    }
    this._scanWrecks(state, origin);
  },

  _scanWrecks(state, origin) {
    const now = state.simTime || 0;
    const lossCache = new Map();
    for (const entity of indexedTypeScan(state, 'wrecks')) {
      if (!entity || entity.type !== 'wreck') continue;
      const data = entity.data || (entity.data = {});
      const lossId = data.provenance && data.provenance.lossId;
      const loss = lossId ? findLossById(state, lossId, lossCache) : null;
      const known = lossId ? isInvestigated(state, lossId) : false;
      const reveal = buildWreckScanReveal(entity, state, {
        origin,
        now,
        previous: data.scanRevealed || null,
        loss,
        known,
      });
      if (!reveal) continue;
      if (sameScanReveal(data.scanRevealed, reveal)) {
        data.scanRevealed = { ...reveal, revealedAt: data.scanRevealed.revealedAt };
        continue;
      }
      data.scanRevealed = reveal;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('scan:wreckRevealed', reveal);
        if (reveal.quality === 'deep' && reveal.lossId && !known) {
          recordInvestigated(state, reveal, loss, now);
          const paid = this._fileCartographyClaim(state, reveal, loss, now);
          this.bus.emit('scan:wreckInvestigated', {
            entityId: entity.id,
            lossId: reveal.lossId,
            story: reveal.story,
            salvageHint: reveal.salvageHint,
            cold: reveal.cold,
            paid,
            at: now,
          });
          this._surveyMilestone(state, loss, now);
        } else if (reveal.quality === 'deep' && !reveal.lossId && data.debrisCache == null) {
          // INF-U18 v1: generic debris never borrows a story — but a deep read
          // can expose a sealed survivor cache. Once per hull either way.
          this._resolveDebrisCache(state, entity, now, 'scan');
        }
      }
    }
  },

  // INF-U14 v1: the first deep read of a loss-linked wreck files a cartography
  // claim. Cold cases (stripped pools, nothing left to loot) pay double — the
  // chart is the only value left in them. Recorded BEFORE paying so a re-scan
  // can never double-claim; economy stays the sole credit writer.
  _fileCartographyClaim(state, reveal, loss, now) {
    const cold = reveal.cold === true;
    const paid = CARTOGRAPHY_BOUNTY_CR * (cold ? CARTOGRAPHY_COLD_MULT : 1);
    const sectorId = (loss && loss.sectorId)
      || (state.world && state.world.currentSectorId) || null;
    this.bus.emit('economy:grantCredits', {
      amount: paid, reason: 'survey_cartography',
      lossId: reveal.lossId, sectorId, cold, at: now,
    });
    this.bus.emit('toast', {
      text: cold
        ? `Cold case closed — cartography office pays ${paid} cr for the chart.`
        : `Survey logged — cartography office pays ${paid} cr.`,
      kind: 'good', ttl: 4,
    });
    return paid;
  },

  // A surveyed field stays surveyed: toast the count when a sector's investigated
  // losses cross 3 / 6 / 10. Milestones persist in the same memory, one toast each.
  // INF-U14 v2: each milestone also posts a chart bonus through the same writer.
  _surveyMilestone(state, loss, now) {
    const memory = ensureMemory(state);
    const sectorId = (loss && loss.sectorId) || 'unknown';
    let count = 0;
    for (const id of Object.keys(memory.investigated || {})) {
      if (memory.investigated[id] && memory.investigated[id].sectorId === sectorId) count += 1;
    }
    const tier = count >= 10 ? 10 : count >= 6 ? 6 : count >= 3 ? 3 : 0;
    if (!tier) return;
    const key = `${sectorId}:${tier}`;
    if (memory.milestones[key]) return;
    memory.milestones[key] = { at: now, count };
    const sec = state.world && state.world.sectors && state.world.sectors[sectorId];
    const name = (sec && sec.name) || 'this debris field';
    if (this.bus && typeof this.bus.emit === 'function') {
      const bonus = CARTOGRAPHY_MILESTONE_CR[tier] || 0;
      if (bonus > 0) {
        this.bus.emit('economy:grantCredits', {
          amount: bonus, reason: 'survey_chart_bonus',
          sectorId, tier, count, at: now,
        });
      }
      this.bus.emit('toast', {
        text: bonus > 0
          ? `Debris field surveyed: ${count} wrecks identified in ${name} — chart bonus ${bonus} cr.`
          : `Debris field surveyed: ${count} wrecks identified in ${name}.`,
        kind: 'good', ttl: 4,
      });
    }
  },

  // INF-U18 v1+v3: roll the sealed cache once, expose it as physical pods,
  // and stamp the hull so neither the scan nor the beam path pays twice.
  _resolveDebrisCache(state, entity, now, via) {
    const data = entity.data || (entity.data = {});
    if (data.debrisCache != null) return null;
    const seed = (state.meta && state.meta.seed) || 1;
    const cache = debrisCacheFor(entity, seed);
    if (!cache) {
      data.debrisCache = 'empty';
      return null;
    }
    data.debrisCache = 'claimed';
    const specs = spawnDebrisCachePods(this.bus, entity, cache, now);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', {
        text: via === 'beam'
          ? 'The beam cracked a sealed cache in the debris!'
          : `Sealed cache in the debris — ${specs.length} pods exposed!`,
        kind: 'good', ttl: 4,
      });
      this.bus.emit('scan:debrisCache', {
        entityId: entity.id,
        wreckId: entity.id,
        via,
        kind: cache.kind,
        cold: cache.cold,
        lots: cache.lots.map((lot) => ({ ...lot })),
        at: now,
      });
    }
    return cache;
  },

  destroy() {
    if (this.bus && this._onScanPulse && typeof this.bus.off === 'function') {
      this.bus.off('scan:pulse', this._onScanPulse);
    }
    this._onScanPulse = null;
  },
};

// Ledger lookup by lossId: current sector first, then every recorded sector. The wreck
// doesn't carry its sector, so the sweep is the honest match; insertion order is stable.
function findLossById(state, lossId, cache) {
  if (cache.has(lossId)) return cache.get(lossId);
  const ledger = state && state.lossLedger;
  const bySector = (ledger && ledger.bySector) || {};
  const current = state && state.world && state.world.currentSectorId;
  const ordered = current && bySector[current] ? [current] : [];
  for (const sectorId of Object.keys(bySector)) {
    if (sectorId !== current) ordered.push(sectorId);
  }
  let found = null;
  for (const sectorId of ordered) {
    const arr = bySector[sectorId];
    if (!Array.isArray(arr)) continue;
    found = arr.find((entry) => entry && entry.lossId === lossId) || null;
    if (found) break;
  }
  cache.set(lossId, found);
  return found;
}

function ensureMemory(state) {
  if (!state.scanReveal || typeof state.scanReveal !== 'object') {
    state.scanReveal = { investigated: {}, milestones: {} };
  }
  const memory = state.scanReveal;
  if (!memory.investigated || typeof memory.investigated !== 'object') memory.investigated = {};
  if (!memory.milestones || typeof memory.milestones !== 'object') memory.milestones = {};
  return memory;
}

function isInvestigated(state, lossId) {
  const memory = state && state.scanReveal;
  return !!(memory && memory.investigated && memory.investigated[lossId]);
}

function recordInvestigated(state, reveal, loss, now) {
  const memory = ensureMemory(state);
  memory.investigated[reveal.lossId] = {
    at: now,
    sectorId: (loss && loss.sectorId) || (state.world && state.world.currentSectorId) || null,
    entityId: reveal.entityId,
  };
  const ids = Object.keys(memory.investigated);
  if (ids.length > INVESTIGATED_CAP) {
    ids.sort((a, b) => (memory.investigated[a].at || 0) - (memory.investigated[b].at || 0));
    for (let i = 0; i < ids.length - INVESTIGATED_CAP; i++) delete memory.investigated[ids[i]];
  }
}

export default scanReveal;
