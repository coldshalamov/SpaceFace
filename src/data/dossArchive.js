// PQ-048.16 — Pure, durable evidence readers for Prof. Halev Doss's archive.
//
// The archive deliberately does not own a new progression bag. Each entry is derived from the
// existing physical record that produced it, so replays and Continue cannot award it twice.

export const DOSS_ARCHIVE_CONTACT_ID = 'contact_halev_doss';
export const DOSS_ARCHIVE_COUNTER_ID = 'doss.sources';

export const DOSS_ARCHIVE_MAP_TARGET = Object.freeze({
  sectorId: 'sector_helios_prime',
  poiId: 'poi_memorial',
  pos: Object.freeze({ x: 1680, z: -820 }),
  label: 'The Candle Fleet',
});

export const DOSS_ARCHIVE_SOURCES = Object.freeze([
  Object.freeze({
    id: 'vesta_shift_end_cache',
    flag: 'doss_vesta_shift_end_cache',
    title: 'Vesta Forge shift-end cache',
  }),
  Object.freeze({
    id: 'veil_resonance_obelisk',
    flag: 'doss_veil_resonance_obelisk',
    title: 'The Resonance Obelisk',
  }),
  Object.freeze({
    id: 'lung_of_charon_case',
    flag: 'doss_lung_of_charon_case',
    title: 'The Lung of Charon',
  }),
]);

const SOURCE_BY_ID = new Map(DOSS_ARCHIVE_SOURCES.map((source) => [source.id, source]));

const VESTA = Object.freeze({
  recordId: 'vesta-ore-cache:shift-end:v1',
  receiptId: 'vesta-ore-cache:resolution:v1',
  sectorId: 'sector_vesta_forge',
  cachePoiId: 'poi_vesta_ore_cache',
  factionId: 'faction_dmc',
  repDelta: 6,
  lotId: 'vesta-ore-cache-lot:v1',
  commodityId: 'cmdty_ore_bronzium',
  totalQty: 6,
});

const VESTA_OUTCOMES = Object.freeze({
  preserve: Object.freeze({
    phase: 'preserved',
    label: 'PRESERVE',
    detail: 'Seal left intact. The fixed cache remains in the ship chart for a later return.',
  }),
  report: Object.freeze({
    phase: 'reported',
    label: 'REPORT',
    detail: 'DMC dispatch acknowledged the sealed cache report.',
  }),
  take: Object.freeze({
    phase: 'taken',
    label: 'TAKE',
    detail: 'Seal opened. Six units of legal nickel ore remain a physical recovery, limited by hold space.',
  }),
});

const OBELISK = Object.freeze({
  sectorId: 'sector_veil_nebula',
  poiId: 'poi_anomaly',
  type: 'anomaly',
  name: 'The Resonance Obelisk',
});

const LUNG = Object.freeze({
  sectorId: 'sector_charon_expanse',
  poiId: 'poi_charon_tether_wreck',
  artifactId: 'case:lung-of-charon:recovery:poi_charon_tether_wreck',
  sourceRef: 'landmark_c7_lung_of_charon',
  title: 'The Lung of Charon',
});

const LUNG_OUTCOMES = Object.freeze({
  rescue: 'The hab-pod survivors were recovered alive. The snapped tether is logged as a completed rescue.',
  blackbox: 'The hab-pod black box was secured. The snapped tether incident is closed without a second claim.',
  strip: 'The snapped hab-pod was stripped for components. The survivor signal is closed in the case record.',
  abandoned: 'The incident was abandoned on departure from Charon Expanse. No recovery settlement was issued.',
  failed: 'The Lung of Charon recovery closed without a settlement.',
});

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

// Durable timestamps are raw save data. Do not coerce null or strings into apparently valid
// source history; zero is a valid legacy simulation timestamp.
function timestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function source(id, copy, detail = null) {
  const definition = SOURCE_BY_ID.get(id);
  return definition ? Object.freeze({
    id: definition.id,
    flag: definition.flag,
    title: definition.title,
    copy,
    detail,
  }) : null;
}

function vestaEvidence(state) {
  const own = object(state && state.world && state.world.vestaOreCache);
  const receipt = object(own && own.receipt);
  if (!own || !receipt || own.recordId !== VESTA.recordId || receipt.id !== VESTA.receiptId
    || receipt.recordId !== VESTA.recordId || receipt.sectorId !== VESTA.sectorId
    || receipt.cachePoiId !== VESTA.cachePoiId) return null;
  const choiceId = String(own.choiceId || '');
  const outcome = VESTA_OUTCOMES[choiceId];
  if (!outcome || own.phase !== outcome.phase || receipt.choiceId !== choiceId
    || receipt.outcome !== outcome.phase || receipt.title !== `SHIFT-END CACHE ${outcome.label}`
    || receipt.detail !== outcome.detail || !timestamp(own.resolvedAt)
    || !timestamp(receipt.resolvedAt) || own.resolvedAt !== receipt.resolvedAt) return null;
  if (choiceId === 'report' && (receipt.factionId !== VESTA.factionId || receipt.repDelta !== VESTA.repDelta)) return null;
  if (choiceId === 'take' && (receipt.lotId !== VESTA.lotId || receipt.commodityId !== VESTA.commodityId
    || receipt.totalQty !== VESTA.totalQty)) return null;
  return source('vesta_shift_end_cache', `Vesta Forge shift-end cache: ${outcome.detail}`, choiceId);
}

function obeliskEvidence(state) {
  const rec = object(state && state.world && state.world.discovery
    && state.world.discovery[OBELISK.sectorId]
    && state.world.discovery[OBELISK.sectorId].pois
    && state.world.discovery[OBELISK.sectorId].pois[OBELISK.poiId]);
  if (!rec || rec.discovered !== true || rec.identified !== true || rec.investigated !== true
    || rec.type !== OBELISK.type || rec.name !== OBELISK.name
    || !timestamp(rec.investigatedAt)) return null;
  return source(
    'veil_resonance_obelisk',
    'Veil Nebula: The Resonance Obelisk was physically investigated after triangulation.',
  );
}

function lungEvidence(state) {
  const rec = object(state && state.world && state.world.discovery
    && state.world.discovery[LUNG.sectorId]
    && state.world.discovery[LUNG.sectorId].pois
    && state.world.discovery[LUNG.sectorId].pois[LUNG.poiId]);
  const artifact = object(rec && rec.landmarkArtifact);
  if (!rec || rec.discovered !== true || rec.identified !== true || rec.investigated !== true
    || !artifact || artifact.id !== LUNG.artifactId || artifact.title !== LUNG.title
    || artifact.sourceRef !== LUNG.sourceRef || !timestamp(artifact.returnedAt)) return null;
  const outcome = Object.entries(LUNG_OUTCOMES).find(([, body]) => artifact.body === body);
  if (!outcome) return null;
  return source('lung_of_charon_case', `The Lung of Charon: ${outcome[1]}`, outcome[0]);
}

/** Read only the durable source records. Invalid or partial receipts deliberately disappear. */
export function dossArchiveEvidence(state) {
  return [vestaEvidence(state), obeliskEvidence(state), lungEvidence(state)].filter(Boolean);
}

export function dossArchiveSourceCount(state) {
  return dossArchiveEvidence(state).length;
}

export function dossArchiveComplete(state) {
  return dossArchiveSourceCount(state) === DOSS_ARCHIVE_SOURCES.length;
}

export function dossArchiveMapOffer(state) {
  if (!dossArchiveComplete(state)) return null;
  return {
    ...DOSS_ARCHIVE_MAP_TARGET,
    pos: { ...DOSS_ARCHIVE_MAP_TARGET.pos },
  };
}
