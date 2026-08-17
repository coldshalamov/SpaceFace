// Plan 30 — the shared hidden-cache record grammar.
//
// `pallasHiddenCache.js` was the single authored instance of this shape. Plan 30 asks for 6–10
// caches across the graph, so the grammar Pallas proved lives here and both owners run on it
// rather than the chain carrying a second copy of it.
//
// The grammar is always the same three moves:
//   1. a physical clue carrier (a wreck manifest, a black-box log, a bought bar rumor) makes an
//      APPROXIMATE search patch durable — never the cache coordinate itself;
//   2. the durable patch is what makes the cache POI's own scanner signal admissible;
//   3. investigating the cache moves the record to a terminal phase that can never be re-minted
//      from a malformed save.
//
// Purity contract: no state reads, no RNG, no clock, no entity writes. World owns the mutable
// record, Scanner owns the physical signal, Codex only reads.

/** The discovery phases every hidden cache shares before its owner-specific terminal states. */
export const HIDDEN_CACHE_DISCOVERY_PHASES = Object.freeze(['unfound', 'searching', 'found']);

export function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/** Sector-local XZ only. A half-written point is no point at all — it never becomes {x:0,z:0}. */
export function localPoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

export function clampedCount(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(finiteNumber(value, min))));
}

/**
 * Normalize the durable evidence stamp a clue carrier writes. The carrier identity is authored, so
 * a save that names a different evidence id is discarded rather than trusted.
 */
export function normalizeCacheEvidence(source, spec) {
  if (!source || typeof source !== 'object' || source.evidenceId !== spec.evidenceId) return null;
  return {
    evidenceId: spec.evidenceId,
    sourcePoiId: spec.cluePoiId,
    signalId: spec.clueSignalId,
    foundAt: Math.max(0, finiteNumber(source.foundAt, 0)),
    carrier: spec.clueCarrier,
  };
}

/** The approximate patch. Radius is authored; a save may not widen or shrink it into a pin. */
export function normalizeCacheSearch(source, spec) {
  const center = localPoint(source && source.center);
  if (!center) return null;
  return {
    center,
    radius: Math.max(1, finiteNumber(source.radius, spec.searchRadiusWu)),
    sourceEvidenceId: spec.evidenceId,
  };
}

export function normalizeCacheSite(source, spec) {
  const fixedPos = localPoint(source && source.fixedPos);
  if (!fixedPos) return null;
  return {
    poiId: spec.cachePoiId,
    fixedPos,
    foundAt: Math.max(0, finiteNumber(source.foundAt, 0)),
  };
}

/**
 * Shared collection bookkeeping for a finite physical lot. Collected + lost can never exceed the
 * authored total, so a tampered save cannot mint a bigger shipment than the cache ever held.
 */
export function normalizeCacheCargoLot(value, def) {
  if (!def || !value || typeof value !== 'object'
    || value.lotId !== def.lotId || value.provenanceId !== def.provenanceId
    || value.commodityId !== def.commodityId) return null;
  const totalQty = def.totalQty;
  const collectedQty = clampedCount(value.collectedQty, 0, totalQty);
  const lostQty = clampedCount(value.lostQty, 0, totalQty - collectedQty);
  return {
    lotId: def.lotId,
    provenanceId: def.provenanceId,
    commodityId: def.commodityId,
    totalQty,
    collectedQty,
    lostQty,
    remainingQty: Math.max(0, totalQty - collectedQty - lostQty),
    collectionReceipts: Array.isArray(value.collectionReceipts)
      ? value.collectionReceipts.filter((entry) => entry && typeof entry.id === 'string')
        .slice(-16).map((entry) => ({
          id: String(entry.id),
          acceptedQty: Math.max(0, Math.floor(finiteNumber(entry.acceptedQty, 0))),
          lostQty: Math.max(0, Math.floor(finiteNumber(entry.lostQty, 0))),
        }))
      : [],
  };
}

/**
 * The demotion rule every cache owner shares: a terminal phase that fails its own receipt check
 * falls back to the furthest phase the surviving discovery facts actually support. Continue may
 * never re-mint a reward, and it may also never erase a legitimately recovered search patch.
 *
 * `foundPhase` is the owner's name for "standing at the cache, not yet resolved" — Pallas calls it
 * `choice` because its disposition is a real fork; the chain calls it `found`.
 */
export function demotedDiscoveryPhase(record, foundPhase = 'found') {
  if (record && record.evidence && record.search) return record.cache ? foundPhase : 'searching';
  return 'unfound';
}

/** Repair an in-flight (non-terminal) discovery phase against the facts that back it. */
export function repairedDiscoveryPhase(phase, record, foundPhase = 'found') {
  if (phase === 'searching' && (!record.evidence || !record.search)) return 'unfound';
  if (phase === foundPhase && (!record.evidence || !record.search || !record.cache)) {
    return record.evidence && record.search ? 'searching' : 'unfound';
  }
  return phase;
}

/**
 * One cache's signal admissibility rule, shared by every instance: the clue is always audible, the
 * cache itself only after its own search patch is durable. This is what keeps a cache from being
 * found by sweeping the sector with no clue at all.
 */
export function cacheSignalAdmissible(spec, sourceId, phase) {
  if (sourceId === spec.cluePoiId) return true;
  if (sourceId !== spec.cachePoiId) return true;
  return phase !== 'unfound';
}
