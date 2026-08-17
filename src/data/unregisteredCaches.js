// Plan 30 — the Unregistered Caches chain.
//
// The plan asks for "6–10 across the graph, each clued by a bar rumor or a black-box log", holding
// unique cosmetics, old-tech modules, and one forbidden tech item. Every cache below is an
// ALREADY-AUTHORED `type: 'cache', hidden: true` POI with a real world position — this module gives
// those bodies an identity, contents, and a durable record, it does not invent new geography.
//
// It runs on the same grammar as `pallasHiddenCache.js` via `hiddenCacheCore.js`. Pallas remains
// the one cache with a moral disposition fork; the chain is the plain shape: clue → find → open.
//
// Two legitimate discovery routes, per the plan's "rumor, puzzle, or exploration" rule:
//   • CLUE — the live bar "Cache Coordinate" rumor already offers these exact POIs as approximate
//     search circles, and a black-box log names two of them outright. Owning that clue is durable.
//   • EXPLORATION — hidden POIs have always required close approach rather than a sweep, so
//     stumbling onto one while flying is a real find and is deliberately NOT gated behind the clue.
//
// The Codex row unlocks on the first cache opened and deepens as the chain fills. It never gates
// progression: every reward here is a cosmetic, a spare hull module, or a physical cargo lot.

import {
  clampedCount,
  finiteNumber,
} from './hiddenCacheCore.js';

export const UNREGISTERED_CACHES_SCHEMA_VERSION = 1;
export const UNREGISTERED_CACHE_RECORD_ID = 'unregistered-caches:chain:v1';

function cargo(commodityId, qty, pickupName) {
  return Object.freeze({ commodityId, qty, pickupName });
}

/**
 * `grant` is an optional module instance handed over by the existing `ships.grantModule` writer —
 * the same owner unique-wreck recovery uses. `cosmetic` names a marking style that becomes
 * commissionable once this cache is open (see shipCustomization.js).
 */
function cache(id, sectorId, cachePoiId, name, story, contents) {
  return Object.freeze({
    id,
    sectorId,
    cachePoiId,
    signalId: `signal:poi:${cachePoiId}`,
    name,
    story,
    lotId: `unregistered-cache:${id}:lot:v1`,
    provenanceId: `unregistered-cache:${id}:provenance:v1`,
    cargo: contents.cargo,
    grantModuleId: contents.grantModuleId || null,
    cosmeticMarkingId: contents.cosmeticMarkingId || null,
    forbidden: contents.forbidden === true,
  });
}

export const UNREGISTERED_CACHES = Object.freeze([
  cache('rhea_survey', 'sector_rhea_cinder', 'poi_rhea_claim', 'Burned Survey Cache',
    'A prospector sealed their whole season into an ore drum and never came back for it. The tally sheet inside is still legible; the name on it is not.',
    { cargo: cargo('cmdty_salvage_electronics', 3, 'Burned Survey Drum') }),

  cache('eris_quiet_drop', 'sector_eris_margin', 'poi_eris_drop', 'Quiet Drop Point',
    'A courier drop nobody came to empty. The handover tags were cut through rather than scanned, which is how you know the courier was the one who ran.',
    { cargo: cargo('cmdty_stolen_goods', 3, 'Uncollected Drop') }),

  cache('eris_margin_ledger', 'sector_eris_margin', 'poi_eris_dead_drop', 'Margin Dead Drop',
    'A Quiet dead drop kept running long after its handler stopped answering. Whatever it was staging is now just property with no owner.',
    { cargo: cargo('cmdty_electronics', 2, 'Dead-Drop Consignment'),
      cosmeticMarkingId: 'quiet_margin' }),

  cache('phoebe_silent_vault', 'sector_phoebe_echo', 'poi_phoebe_vault', 'Silent Vault',
    'Someone welded a drive housing shut around a working coil and left it inside a shrine field. The weld is the message: this was hidden, not lost.',
    { cargo: cargo('cmdty_quantum_cores', 1, 'Sealed Vault Core'),
      grantModuleId: 'mod_engine_warp_l' }),

  cache('nereid_shoal', 'sector_nereid_shoal', 'poi_nereid_cache', 'Shoal Cache',
    'Ice-runners kept a spare season under the shoal so a bad crossing would not end them. The crossing ended them anyway.',
    { cargo: cargo('cmdty_ice_water', 6, 'Shoal Reserve') }),

  cache('proteus_below_deck', 'sector_proteus_well', 'poi_proteus_stash', 'Below-Deck Cache',
    'A hull compartment that was never on any deck plan, opened from the inside. Its shelving is machined; whoever built it expected to keep using it.',
    { cargo: cargo('cmdty_weapons', 2, 'Below-Deck Case'),
      cosmeticMarkingId: 'below_deck' }),

  cache('nyx_march_drop', 'sector_nyx_march', 'poi_nyx_cache', 'March Drop Cache',
    'A march-lane drop wrapped against radiation with far more care than its contents deserve. The wrapping is the interesting part.',
    { cargo: cargo('cmdty_refined_metals', 3, 'March Drop Bundle') }),

  cache('kepler_raider_stash', 'sector_kepler_scar', 'poi_kepler_stash', 'Raider Stash',
    'A raider crew\'s working stash, still sorted by what sells where. They were organised right up until they were not.',
    { cargo: cargo('cmdty_stolen_goods', 4, 'Sorted Raider Stash') }),

  // The plan's single forbidden item. It sits in the deepest dark on the graph and is the one
  // authored source of a module that otherwise exists with no way to obtain it at all.
  cache('sedna_vault', 'sector_sedna_dark', 'poi_sedna_vault', 'Sedna Vault',
    'A hull-signature spoofer, cased and inventoried, in a vault nobody filed. Fitting it makes heavy guns believe you are worth their attention. That is the whole product.',
    { cargo: cargo('cmdty_salvage_electronics', 2, 'Vault Inventory Case'),
      grantModuleId: 'mod_mass_faker_forbidden', forbidden: true }),
]);

export const UNREGISTERED_CACHE_BY_ID = new Map(UNREGISTERED_CACHES.map((row) => [row.id, row]));
export const UNREGISTERED_CACHE_BY_POI = new Map(
  UNREGISTERED_CACHES.map((row) => [row.cachePoiId, row]),
);

/** Marking styles this chain is the only source of. Shipworks reads this to gate its list. */
export const UNREGISTERED_CACHE_COSMETICS = Object.freeze(
  UNREGISTERED_CACHES.filter((row) => row.cosmeticMarkingId)
    .map((row) => Object.freeze({ cacheId: row.id, markingId: row.cosmeticMarkingId })),
);

const CACHE_PHASES = new Set(['unfound', 'clued', 'opened']);

export function freshUnregisteredCachesState() {
  return {
    schemaVersion: UNREGISTERED_CACHES_SCHEMA_VERSION,
    recordId: UNREGISTERED_CACHE_RECORD_ID,
    caches: {},
  };
}

function normalizeCacheRow(value, def) {
  const source = value && typeof value === 'object' ? value : {};
  const phase = CACHE_PHASES.has(source.phase) ? source.phase : 'unfound';
  const out = {
    phase,
    cluedAt: null,
    openedAt: null,
    grantedModuleId: null,
    collectedQty: 0,
  };
  if (phase === 'unfound') return out;
  if (source.cluedAt != null) out.cluedAt = Math.max(0, finiteNumber(source.cluedAt, 0));
  if (phase === 'clued') return out;
  // `opened` is the only phase that can carry a consequence, so it must carry its own stamp. A
  // save that claims `opened` with no open time falls back to the clue it can still prove.
  // The `== null` guard matters: `Number(null)` is 0, which would otherwise read as a valid stamp.
  const openedAt = source.openedAt == null ? NaN : Number(source.openedAt);
  if (!Number.isFinite(openedAt) || openedAt < 0) {
    out.phase = out.cluedAt == null ? 'unfound' : 'clued';
    return out;
  }
  out.openedAt = openedAt;
  out.grantedModuleId = source.grantedModuleId === def.grantModuleId ? def.grantModuleId : null;
  out.collectedQty = clampedCount(source.collectedQty, 0, def.cargo.qty);
  return out;
}

export function normalizeUnregisteredCachesState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = freshUnregisteredCachesState();
  const rows = source.caches && typeof source.caches === 'object' ? source.caches : {};
  for (const def of UNREGISTERED_CACHES) {
    const row = normalizeCacheRow(rows[def.id], def);
    // An untouched cache stays absent rather than writing nine idle rows into every save.
    if (row.phase !== 'unfound') out.caches[def.id] = row;
  }
  return out;
}

export function unregisteredCacheRow(state, cacheId) {
  const own = state && state.world && state.world.unregisteredCaches;
  const rows = own && own.caches && typeof own.caches === 'object' ? own.caches : null;
  return rows && rows[cacheId] || null;
}

export function unregisteredCacheOpened(state, cacheId) {
  const row = unregisteredCacheRow(state, cacheId);
  return !!row && row.phase === 'opened';
}

/** Chain progress for the Codex row: how many of the authored caches are actually open. */
export function unregisteredCacheProgress(state) {
  let clued = 0;
  let opened = 0;
  let forbiddenFound = false;
  const openedIds = [];
  for (const def of UNREGISTERED_CACHES) {
    const row = unregisteredCacheRow(state, def.id);
    if (!row) continue;
    if (row.phase === 'clued') clued++;
    if (row.phase === 'opened') {
      opened++;
      openedIds.push(def.id);
      if (def.forbidden) forbiddenFound = true;
    }
  }
  return { total: UNREGISTERED_CACHES.length, clued, opened, openedIds, forbiddenFound };
}

export function unregisteredCacheSignalCopy(poiId) {
  const def = UNREGISTERED_CACHE_BY_POI.get(poiId);
  if (!def) return null;
  return {
    classification: 'UNREGISTERED CACHE',
    detail: `${def.name} carries no board posting and no custody tag. Investigate the physical cache to open it.`,
  };
}
