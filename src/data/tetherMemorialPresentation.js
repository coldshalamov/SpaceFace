// The earned memorial line is read again whenever the world rebuilds its real POI.
export const TETHER_MEMORIAL_POI_ID = 'poi_charon_tether_memorial';
export const TETHER_MEMORIAL_WALL_FLAG = 'wall_knows';
export const TETHER_MEMORIAL_SCAN_LABEL = 'Tether Memorial — one line newer';
export const TETHER_MEMORIAL_SCAN_DESCRIPTION = 'The intake town\u2019s names, one per bunk that did not make the last '
  + 'boat. Between them, in the same paint as every bunk line: a new date, and a hull that '
  + 'came back. No hand signed it.';

export function tetherMemorialPresentation(state, poiId) {
  return poiId === TETHER_MEMORIAL_POI_ID && state.story?.flags?.[TETHER_MEMORIAL_WALL_FLAG] != null
    ? { scanLabel: TETHER_MEMORIAL_SCAN_LABEL, scanDescription: TETHER_MEMORIAL_SCAN_DESCRIPTION }
    : {};
}
