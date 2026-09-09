// PQ-018 immutable presentation catalog for the five physically earned Cathedral receipts.
// Earned state remains under the World Site owner; this module supplies only bounded copy/media.

import landmarkLorePack from './flavor/080-landmark-lore.js';

export const WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION = 1;

const CATALOG_ROOT = 'assets/ships/release/media/wreck-cathedral';
const wreckLore = landmarkLorePack.entries.find((entry) => entry.id === 'wreck_cathedral');
const loreById = new Map((wreckLore && wreckLore.lines || []).map((entry) => [entry.id, entry.text]));

function row({
  pageId,
  title,
  fragmentId,
  body,
  imageName,
  imageSha256,
  imageBytes,
  alt,
  caption,
  mapRef,
}) {
  const fragment = loreById.get(fragmentId);
  if (!fragment) throw new TypeError(`Missing Wreck Cathedral lore fragment ${fragmentId}`);
  return Object.freeze({
    pageId,
    revision: WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION,
    title,
    fragment,
    body,
    provenanceRef: `wreck_cathedral/${fragmentId}`,
    mapRef: Object.freeze(mapRef),
    media: Object.freeze({
      assetId: `evidence.${pageId}`,
      path: `${CATALOG_ROOT}/${imageName}`,
      sha256: imageSha256,
      bytes: imageBytes,
      alt,
      caption,
      license: 'project-original',
      author: 'SpaceFace project',
      sourceAssetId: 'place_landmark_wreck_cathedral',
    }),
  });
}

export const WRECK_CATHEDRAL_EVIDENCE_CATALOG = Object.freeze({
  'wreck_cathedral.missing_convoy': row({
    pageId: 'wreck_cathedral.missing_convoy',
    title: 'The Missing Convoy',
    fragmentId: 'c1_01',
    body: 'The navigation record terminates inside Ceres without a gate-exit acknowledgment. Its final vectors converge on the split capital hull now catalogued as the Wreck Cathedral.',
    imageName: 'neutral_gameplay_distance.png',
    imageSha256: 'fa520d4f22906c730085c4afdf1fd1d673d2be9aa281c4c4735fc90956970e7e',
    imageBytes: 1109031,
    alt: 'The broken bow and stern of the Concord Vigilant separated around a wide black cavity.',
    caption: 'Long-range reconstruction from the recovered navigation record.',
    mapRef: { sectorId: 'sector_ceres_belt', siteId: 'world_site_wreck_cathedral', componentId: 'bridge_navigation_record' },
  }),
  'wreck_cathedral.capital_hull_located': row({
    pageId: 'wreck_cathedral.capital_hull_located',
    title: 'Capital Hull Located',
    fragmentId: 'c1_02',
    body: 'Registry geometry identifies the wreck as the Concord Vigilant despite the missing transponder core. The surviving frame spacing and bridge profile exclude every other hull in the convoy manifest.',
    imageName: 'silhouette_lod0.png',
    imageSha256: '64767180bd92c4aa6015afe6afdde88f17fb693026cea916dcdeeaa79f575d6b',
    imageBytes: 1205346,
    alt: 'Registry silhouette of a capital hull split immediately aft of its bridge.',
    caption: 'Registry geometry match: Concord Vigilant.',
    mapRef: { sectorId: 'sector_ceres_belt', siteId: 'world_site_wreck_cathedral', componentId: 'registry_scan_array' },
  }),
  'wreck_cathedral.clock_stopped_first': row({
    pageId: 'wreck_cathedral.clock_stopped_first',
    title: 'The Clock Stopped First',
    fragmentId: 'c1_03',
    body: 'The emergency relay clock lost synchronization before the structural breakup recorded by the hull sensors. Whatever stopped the convoy interrupted its coordination channel before it tore the Vigilant apart.',
    imageName: 'neutral_close_3q.png',
    imageSha256: '48125e6eb77cf3d309d934d8a2f66f3ed8c8f15e8a9368f75a0ad5c17ef27166',
    imageBytes: 1484307,
    alt: 'Close view of exposed frames, cold blue emergency lights, and the surviving amber Marker.',
    caption: 'Emergency relay timing recovered beside the surviving Marker.',
    mapRef: { sectorId: 'sector_ceres_belt', siteId: 'world_site_wreck_cathedral', componentId: 'emergency_relay_clock' },
  }),
  'wreck_cathedral.released_from_inside': row({
    pageId: 'wreck_cathedral.released_from_inside',
    title: 'Released From Inside',
    fragmentId: 'c1_04',
    body: 'Clamp scoring and displaced fasteners face outward from the fly-through cavity. The carried device was released from inside the Vigilant rather than torn away by an external collision.',
    imageName: 'neutral_flythrough_cavity.png',
    imageSha256: '7c56440e8b8e7a1a982c74d2aa2ecabcf4d824fd0bf62a27c826c888cef81e78',
    imageBytes: 1963279,
    alt: 'View through the capital wreck cavity past torn frames, engine bells, and exposed service structure.',
    caption: 'The clamp fracture faces outward from the traversable cavity.',
    mapRef: { sectorId: 'sector_ceres_belt', siteId: 'world_site_wreck_cathedral', componentId: 'cargo_clamp_forensics' },
  }),
  'wreck_cathedral.what_was_carried': row({
    pageId: 'wreck_cathedral.what_was_carried',
    title: 'What Was Carried',
    fragmentId: 'c1_05',
    body: 'The recovered black box binds the convoy route, relay clock, and internal release to one custody record. Its final entry identifies a classified archive package, but not the party that ordered the transfer.',
    imageName: 'wireframe_flythrough.png',
    imageSha256: '12f1da231b551920fdaa9a34c82e613728e02ace92ff9c6fb6359da3a68140cd',
    imageBytes: 2497616,
    alt: 'Forensic wireframe through the wreck cavity showing the black-box cradle and surrounding structure.',
    caption: 'Receiver reconstruction after physical black-box delivery.',
    mapRef: { sectorId: 'sector_ceres_belt', siteId: 'world_site_wreck_cathedral', componentId: 'marker_service_spine' },
  }),
});

export const WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS = Object.freeze(
  Object.keys(WRECK_CATHEDRAL_EVIDENCE_CATALOG),
);

export function wreckCathedralEvidenceCatalogEntry(pageId, revision = WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION) {
  const rowValue = WRECK_CATHEDRAL_EVIDENCE_CATALOG[pageId] || null;
  return rowValue && rowValue.revision === revision ? rowValue : null;
}

export default WRECK_CATHEDRAL_EVIDENCE_CATALOG;
