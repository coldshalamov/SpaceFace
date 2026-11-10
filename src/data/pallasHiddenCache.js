// PQ-048.13 — stable data contract for the Pallas black-wake weapons cache.
// World owns the mutable record; scanner, map, prompt, cargo, law, and ledger consume this
// identity or receive owner-safe intents/events derived from it.

export const PALLAS_HIDDEN_CACHE = Object.freeze({
  schemaVersion: 1,
  recordId: 'pallas-hidden-weapons-cache:black-wake:v1',
  sectorId: 'sector_pallas_drift',
  cluePoiId: 'poi_pwreck',
  cachePoiId: 'poi_hcache',
  clueSignalId: 'signal:poi:poi_pwreck',
  cacheSignalId: 'signal:poi:poi_hcache',
  evidenceId: 'pallas-black-wake-manifest:v1',
  searchCenterLocal: Object.freeze({ x: -980, z: -760 }),
  searchRadiusWu: 820,
  cacheLocalPos: Object.freeze({ x: -1560, z: -280 }),
  reportStationId: 'station_drift',
  reportFactionId: 'faction_mts',
  reportRepDelta: 5,
});

export const PALLAS_HIDDEN_CACHE_RESOLUTION_ID = 'pallas-hidden-cache:resolution:v1';

export const PALLAS_HIDDEN_CACHE_LOTS = Object.freeze({
  recover: Object.freeze({
    lotId: 'pallas-hidden-weapons-cache:recovered-weapons:v1',
    provenanceId: 'pallas-black-wake-recovered-weapons:v1',
    commodityId: 'cmdty_weapons',
    totalQty: 2,
    pickupName: 'Recovered Weapons Case',
  }),
  criminal_use: Object.freeze({
    lotId: 'pallas-hidden-weapons-cache:criminal-goods:v1',
    provenanceId: 'pallas-black-wake-criminal-goods:v1',
    commodityId: 'cmdty_stolen_goods',
    totalQty: 4,
    pickupName: 'Unregistered Weapons Lot',
  }),
});

export const PALLAS_HIDDEN_CACHE_CHOICES = Object.freeze([
  Object.freeze({
    id: 'recover',
    label: 'RECOVER',
    consequence: 'Secure the weapons case as a finite physical restricted-cargo pickup at the fixed cache.',
  }),
  Object.freeze({
    id: 'report',
    label: 'REPORT',
    consequence: 'File the find only while docked at Drift Market; the faction owner records the report there.',
  }),
  Object.freeze({
    id: 'criminal_use',
    label: 'CRIMINAL USE',
    consequence: 'Break the custody tags into a finite physical stolen-goods lot; black markets buy it and patrol scans can expose it.',
  }),
]);

const PHASES = new Set(['unfound', 'searching', 'choice', 'recovered', 'reported', 'criminal_used']);
const TERMINAL_PHASES = new Set(['recovered', 'reported', 'criminal_used']);
const PHASE_BY_CHOICE = Object.freeze({ recover: 'recovered', report: 'reported', criminal_use: 'criminal_used' });

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function point(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

function lotForChoice(choiceId) {
  return PALLAS_HIDDEN_CACHE_LOTS[choiceId] || null;
}

function hasValidTerminalReceipt(receipt, phase, choiceId) {
  if (!receipt || typeof receipt !== 'object'
    || receipt.id !== PALLAS_HIDDEN_CACHE_RESOLUTION_ID
    || receipt.recordId !== PALLAS_HIDDEN_CACHE.recordId
    || receipt.sectorId !== PALLAS_HIDDEN_CACHE.sectorId
    || receipt.cachePoiId !== PALLAS_HIDDEN_CACHE.cachePoiId
    || receipt.choiceId !== choiceId
    || receipt.outcome !== phase) return false;
  if (choiceId === 'report') {
    return receipt.stationId === PALLAS_HIDDEN_CACHE.reportStationId
      && receipt.factionId === PALLAS_HIDDEN_CACHE.reportFactionId
      && Number(receipt.repDelta) === PALLAS_HIDDEN_CACHE.reportRepDelta;
  }
  const lot = lotForChoice(choiceId);
  return !!lot && receipt.lotId === lot.lotId
    && receipt.commodityId === lot.commodityId
    && Number(receipt.totalQty) === lot.totalQty;
}

function normalizeCargoLot(value, choiceId) {
  const def = lotForChoice(choiceId);
  if (!def || !value || typeof value !== 'object'
    || value.lotId !== def.lotId || value.provenanceId !== def.provenanceId
    || value.commodityId !== def.commodityId) return null;
  const totalQty = def.totalQty;
  const collectedQty = Math.max(0, Math.min(totalQty, Math.floor(finite(value.collectedQty, 0))));
  const lostQty = Math.max(0, Math.min(totalQty - collectedQty, Math.floor(finite(value.lostQty, 0))));
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
          acceptedQty: Math.max(0, Math.floor(finite(entry.acceptedQty, 0))),
          lostQty: Math.max(0, Math.floor(finite(entry.lostQty, 0))),
        }))
      : [],
  };
}

export function freshPallasHiddenCacheState() {
  return {
    schemaVersion: PALLAS_HIDDEN_CACHE.schemaVersion,
    recordId: PALLAS_HIDDEN_CACHE.recordId,
    phase: 'unfound',
    evidence: null,
    search: null,
    cache: null,
    choiceId: null,
    resolvedAt: null,
    receipt: null,
    cargoLot: null,
  };
}

export function normalizePallasHiddenCacheState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = freshPallasHiddenCacheState();
  out.phase = PHASES.has(source.phase) ? source.phase : 'unfound';
  if (source.evidence && source.evidence.evidenceId === PALLAS_HIDDEN_CACHE.evidenceId) {
    out.evidence = {
      evidenceId: PALLAS_HIDDEN_CACHE.evidenceId,
      sourcePoiId: PALLAS_HIDDEN_CACHE.cluePoiId,
      signalId: PALLAS_HIDDEN_CACHE.clueSignalId,
      foundAt: Math.max(0, finite(source.evidence.foundAt, 0)),
      carrier: 'physical_pirate_wreck_manifest',
    };
  }
  const searchCenter = point(source.search && source.search.center);
  if (searchCenter) {
    out.search = {
      center: searchCenter,
      radius: Math.max(1, finite(source.search.radius, PALLAS_HIDDEN_CACHE.searchRadiusWu)),
      sourceEvidenceId: PALLAS_HIDDEN_CACHE.evidenceId,
    };
  }
  const fixedPos = point(source.cache && source.cache.fixedPos);
  if (fixedPos) {
    out.cache = {
      poiId: PALLAS_HIDDEN_CACHE.cachePoiId,
      fixedPos,
      foundAt: Math.max(0, finite(source.cache.foundAt, 0)),
    };
  }

  const expectedChoice = Object.entries(PHASE_BY_CHOICE)
    .find(([, phase]) => phase === out.phase)?.[0] || null;
  const receiptChoice = String(source.choiceId || source.receipt && source.receipt.choiceId || '');
  if (TERMINAL_PHASES.has(out.phase) && expectedChoice === receiptChoice
    && hasValidTerminalReceipt(source.receipt, out.phase, expectedChoice) && out.cache) {
    out.choiceId = expectedChoice;
    out.resolvedAt = Math.max(0, finite(
      source.resolvedAt == null ? source.receipt.resolvedAt : source.resolvedAt,
      0,
    ));
    const lot = lotForChoice(expectedChoice);
    out.receipt = {
      id: PALLAS_HIDDEN_CACHE_RESOLUTION_ID,
      recordId: PALLAS_HIDDEN_CACHE.recordId,
      sectorId: PALLAS_HIDDEN_CACHE.sectorId,
      cachePoiId: PALLAS_HIDDEN_CACHE.cachePoiId,
      choiceId: expectedChoice,
      outcome: out.phase,
      title: String(source.receipt.title || 'BLACK-WAKE CACHE DISPOSITION RECORDED'),
      detail: String(source.receipt.detail || 'Outcome recorded.'),
      resolvedAt: out.resolvedAt,
      ...(expectedChoice === 'report' ? {
        stationId: PALLAS_HIDDEN_CACHE.reportStationId,
        factionId: PALLAS_HIDDEN_CACHE.reportFactionId,
        repDelta: PALLAS_HIDDEN_CACHE.reportRepDelta,
      } : {
        lotId: lot.lotId,
        commodityId: lot.commodityId,
        totalQty: lot.totalQty,
      }),
    };
    out.cargoLot = normalizeCargoLot(source.cargoLot, expectedChoice);
  } else if (TERMINAL_PHASES.has(out.phase)) {
    // A malformed terminal record never mints a replacement reward or report on Continue.
    out.phase = out.evidence && out.search
      ? (out.cache ? 'choice' : 'searching')
      : 'unfound';
  }
  if (out.phase === 'searching' && (!out.evidence || !out.search)) out.phase = 'unfound';
  if (out.phase === 'choice' && (!out.evidence || !out.search || !out.cache)) {
    out.phase = out.evidence && out.search ? 'searching' : 'unfound';
  }
  return out;
}

export function pallasHiddenCacheSignalAvailable(state, sourceId) {
  if (sourceId === PALLAS_HIDDEN_CACHE.cluePoiId) return true;
  if (sourceId !== PALLAS_HIDDEN_CACHE.cachePoiId) return true;
  const phase = normalizePallasHiddenCacheState(state && state.world && state.world.pallasHiddenCache).phase;
  return phase !== 'unfound';
}

export function pallasHiddenCacheSignalCopy(sourceId) {
  if (sourceId === PALLAS_HIDDEN_CACHE.cluePoiId) {
    return {
      classification: 'BLACK-WAKE WEAPONS TRACE',
      detail: 'The pirate wreck still carries a physical manifest fragment. Investigate it to recover an approximate Pallas search patch.',
    };
  }
  if (sourceId === PALLAS_HIDDEN_CACHE.cachePoiId) {
    return {
      classification: 'SEALED WEAPONS CACHE',
      detail: 'A sealed weapons mass sits inside the debris. Investigate the physical cache before choosing its disposition.',
    };
  }
  return null;
}

export function pallasHiddenCacheChoice(choiceId) {
  return PALLAS_HIDDEN_CACHE_CHOICES.find((choice) => choice.id === choiceId) || null;
}

export function pallasHiddenCacheLot(choiceId) {
  return lotForChoice(choiceId);
}

export function isPallasHiddenCacheTerminal(phase) {
  return TERMINAL_PHASES.has(phase);
}
