// Plan 30 — "Names in the Stars", discovered through hardware rather than through the chart.
//
// DELIBERATE CONSTRAINT: `constellationLabels.js` is authored `interactive: false` and is
// presentation-only on purpose. Nothing in this module touches it, and the galaxy chart gets no new
// per-label hook. The constellations stay exactly what they are — background sky.
//
// The legitimate route is exploration of real objects instead: every lane beacon in the frontier
// was stamped by its fabricator, and three of those stamps carry the same handles the sky does.
// Read all three plates in three different regions and the Codex makes the connection for you.
// Until then the row stays honestly locked — no proximity inference, no prose matching.
//
// Purity contract: frozen data + pure readers. World owns the durable plate records.

import { CONTRIBUTOR_CONSTELLATIONS } from './constellationLabels.js';

export const STAR_SIGNATURE_SCHEMA_VERSION = 1;

function plate(sectorId, poiId, constellationId, handle, engraving) {
  return Object.freeze({
    sectorId,
    poiId,
    signalId: `signal:poi:${poiId}`,
    constellationId,
    handle,
    engraving,
  });
}

/**
 * One plate per region so the set cannot be completed without actually crossing the graph. Each
 * `constellationId` must resolve against the authored sky; `STAR_SIGNATURE_LABELS` proves it.
 */
export const STAR_SIGNATURE_PLATES = Object.freeze([
  plate('sector_proteus_well', 'poi_proteus_buoy', 'constellation_cold_shalamov', 'COLD SHALAMOV',
    'A fabricator\'s plate riveted inside the buoy skirt, stamped rather than printed: BUILT COLD SHALAMOV. Beneath it, scratched by hand and much later, four dots and a line.'),
  plate('sector_haumea_rift', 'poi_haumea_buoy', 'constellation_spaceface_orchestrator', 'SPACEFACE ORCHESTRATOR',
    'The range buoy\'s service hatch carries a commissioning plate: SPACEFACE ORCHESTRATOR, RANGE SET AND LEFT RUNNING. Somebody has added a small four-point figure in the same hand.'),
  plate('sector_hyperion_cut', 'poi_hyperion_beacon', 'constellation_gfx_remaster', 'GFX REMASTER',
    'Under the lamp housing, where nobody was meant to look: GFX REMASTER — REBUILT THE LIGHT. The same four dots again, and this time an arrow pointing up out of the plane.'),
]);

export const STAR_SIGNATURE_BY_POI = new Map(
  STAR_SIGNATURE_PLATES.map((row) => [row.poiId, row]),
);

/** The sky labels the plates name. Presentation-only reads: id, label. Nothing is mutated. */
export const STAR_SIGNATURE_LABELS = Object.freeze(STAR_SIGNATURE_PLATES.map((row) => {
  const constellation = CONTRIBUTOR_CONSTELLATIONS.find((entry) => entry.id === row.constellationId);
  return Object.freeze({
    poiId: row.poiId,
    constellationId: row.constellationId,
    label: constellation ? constellation.label : row.handle,
  });
}));

export function freshStarSignatureState() {
  return { schemaVersion: STAR_SIGNATURE_SCHEMA_VERSION, plates: {} };
}

export function normalizeStarSignatureState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = freshStarSignatureState();
  const rows = source.plates && typeof source.plates === 'object' ? source.plates : {};
  for (const def of STAR_SIGNATURE_PLATES) {
    const row = rows[def.poiId];
    // A plate is either genuinely read at a real time, or it is not read. There is no partial
    // state to repair and nothing here can be re-minted, so a junk stamp is simply discarded.
    const readAt = Number(row && row.readAt);
    if (!row || typeof row !== 'object' || !Number.isFinite(readAt) || readAt < 0) continue;
    out.plates[def.poiId] = { readAt, constellationId: def.constellationId };
  }
  return out;
}

export function starSignatureProgress(state) {
  const own = state && state.world && state.world.starSignatures;
  const plates = own && own.plates && typeof own.plates === 'object' ? own.plates : {};
  const read = STAR_SIGNATURE_PLATES.filter((def) => !!plates[def.poiId]);
  return {
    total: STAR_SIGNATURE_PLATES.length,
    read: read.length,
    complete: read.length === STAR_SIGNATURE_PLATES.length,
    handles: read.map((def) => def.handle),
  };
}

export function starSignaturePlateFor(poiId) {
  return STAR_SIGNATURE_BY_POI.get(poiId) || null;
}
