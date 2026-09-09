// PQ-048.12 — stable data contract for the Vesta shift-end ore cache.
// World owns the mutable record; scanner, map, prompt, cargo, factions, and ledger only consume
// this identity or receive intents/events derived from it.

export const VESTA_ORE_CACHE = Object.freeze({
  schemaVersion: 1,
  recordId: 'vesta-ore-cache:shift-end:v1',
  sectorId: 'sector_vesta_forge',
  relayPoiId: 'poi_vesta_slag_relay',
  cachePoiId: 'poi_vesta_ore_cache',
  relaySignalId: 'signal:poi:poi_vesta_slag_relay',
  cacheSignalId: 'signal:poi:poi_vesta_ore_cache',
  evidenceId: 'vesta-relay-ore-residue:v1',
  searchCenterLocal: Object.freeze({ x: 260, z: 900 }),
  searchRadiusWu: 600,
  cacheLocalPos: Object.freeze({ x: 540, z: 1100 }),
  lotId: 'vesta-ore-cache-lot:v1',
  provenanceId: 'vesta-shift-end-cache:v1',
  commodityId: 'cmdty_ore_bronzium',
  totalQty: 6,
  reportFactionId: 'faction_dmc',
  reportRepDelta: 6,
});

export const VESTA_ORE_CACHE_CHOICES = Object.freeze([
  Object.freeze({
    id: 'preserve',
    label: 'PRESERVE',
    consequence: 'Leave the sealed shift-end cache in place and retain its fixed return in the chart.',
  }),
  Object.freeze({
    id: 'report',
    label: 'REPORT',
    consequence: 'File the cache with DMC dispatch; the faction system applies the acknowledged report.',
  }),
  Object.freeze({
    id: 'take',
    label: 'TAKE',
    consequence: 'Break the seal and recover the six-unit legal nickel-ore lot through physical pickup.',
  }),
]);

const PHASES = new Set(['unfound', 'searching', 'choice', 'preserved', 'reported', 'taken']);
const TERMINAL_PHASES = new Set(['preserved', 'reported', 'taken']);

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function point(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clonePlain(child)]));
}

export function freshVestaOreCacheState() {
  return {
    schemaVersion: VESTA_ORE_CACHE.schemaVersion,
    recordId: VESTA_ORE_CACHE.recordId,
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

export function normalizeVestaOreCacheState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = freshVestaOreCacheState();
  out.phase = PHASES.has(source.phase) ? source.phase : 'unfound';
  if (source.evidence && source.evidence.evidenceId === VESTA_ORE_CACHE.evidenceId) {
    out.evidence = {
      evidenceId: VESTA_ORE_CACHE.evidenceId,
      sourcePoiId: VESTA_ORE_CACHE.relayPoiId,
      signalId: VESTA_ORE_CACHE.relaySignalId,
      foundAt: Math.max(0, finite(source.evidence.foundAt, 0)),
      carrier: 'physical_relay_ore_residue',
    };
  }
  const searchCenter = point(source.search && source.search.center);
  if (searchCenter) {
    out.search = {
      center: searchCenter,
      radius: Math.max(1, finite(source.search.radius, VESTA_ORE_CACHE.searchRadiusWu)),
      sourceEvidenceId: VESTA_ORE_CACHE.evidenceId,
    };
  }
  const fixedPos = point(source.cache && source.cache.fixedPos);
  if (fixedPos) {
    out.cache = {
      poiId: VESTA_ORE_CACHE.cachePoiId,
      fixedPos,
      foundAt: Math.max(0, finite(source.cache.foundAt, 0)),
    };
  }
  if (TERMINAL_PHASES.has(out.phase) && source.receipt && source.receipt.id) {
    out.choiceId = String(source.choiceId || source.receipt.choiceId || out.phase);
    out.resolvedAt = Math.max(0, finite(source.resolvedAt == null ? source.receipt.resolvedAt : source.resolvedAt, 0));
    out.receipt = clonePlain(source.receipt);
  }
  if (out.phase === 'taken') {
    const lot = source.cargoLot && typeof source.cargoLot === 'object' ? source.cargoLot : {};
    const totalQty = VESTA_ORE_CACHE.totalQty;
    const collectedQty = Math.max(0, Math.min(totalQty, Math.floor(finite(lot.collectedQty, 0))));
    const lostQty = Math.max(0, Math.min(totalQty - collectedQty, Math.floor(finite(lot.lostQty, 0))));
    out.cargoLot = {
      lotId: VESTA_ORE_CACHE.lotId,
      provenanceId: VESTA_ORE_CACHE.provenanceId,
      commodityId: VESTA_ORE_CACHE.commodityId,
      totalQty,
      collectedQty,
      lostQty,
      remainingQty: Math.max(0, totalQty - collectedQty - lostQty),
      collectionReceipts: Array.isArray(lot.collectionReceipts)
        ? lot.collectionReceipts.filter((entry) => entry && typeof entry.id === 'string')
          .slice(-16).map((entry) => ({
            id: String(entry.id),
            acceptedQty: Math.max(0, Math.floor(finite(entry.acceptedQty, 0))),
            lostQty: Math.max(0, Math.floor(finite(entry.lostQty, 0))),
          }))
        : [],
    };
  }
  return out;
}

export function vestaOreCacheSignalAvailable(state, sourceId) {
  if (sourceId === VESTA_ORE_CACHE.relayPoiId) return true;
  if (sourceId !== VESTA_ORE_CACHE.cachePoiId) return true;
  const phase = normalizeVestaOreCacheState(state && state.world && state.world.vestaOreCache).phase;
  return phase !== 'unfound';
}

export function vestaOreCacheSignalCopy(sourceId) {
  if (sourceId === VESTA_ORE_CACHE.relayPoiId) {
    return {
      classification: 'ORE-RESIDUE RELAY',
      detail: 'Shift-end tally dust is fused into the physical relay housing. Investigate the relay to recover its approximate search patch.',
    };
  }
  if (sourceId === VESTA_ORE_CACHE.cachePoiId) {
    return {
      classification: 'SEALED ORE RETURN',
      detail: 'Dense legal ore mass inside debris. Investigate the physical return before deciding its disposition.',
    };
  }
  return null;
}

export function vestaOreCacheChoice(choiceId) {
  return VESTA_ORE_CACHE_CHOICES.find((choice) => choice.id === choiceId) || null;
}

export function isVestaOreCacheTerminal(phase) {
  return TERMINAL_PHASES.has(phase);
}
