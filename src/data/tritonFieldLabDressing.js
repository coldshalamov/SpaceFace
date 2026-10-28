// A small Archive field office around the existing research mast. These four
// released pieces replace the sector's generated kit; they are not new stations,
// scan targets, receivers, inhabitants or a second research-state owner.
import { OCCUPATIONAL_PLACE_RADIUS } from './occupationalYardDressing.js';

export const TRITON_FIELD_LAB_SECTOR = 'sector_triton_wake';
export const TRITON_FIELD_LAB_POI = 'poi_triton_field_lab';
const point = (x, z) => Object.freeze({ x, z });

// Offsets use the live POI, including its galactic origin. The existing mast
// remains at the origin; the separate Wake Lab station is never an anchor.
export const TRITON_FIELD_LAB_PROPS = Object.freeze([
  Object.freeze({ placeId: 'place_freight_platform', name: 'Archive Instrument Apron',
    offset: point(45, 0), rot: 0, radius: OCCUPATIONAL_PLACE_RADIUS.place_freight_platform }),
  Object.freeze({ placeId: 'place_utility_module', name: 'Archive Instrument Service',
    offset: point(68, 30), rot: Math.PI / 2, radius: 8 }),
  // The habitat's native -X airlock faces the apron, not the survey approach.
  Object.freeze({ placeId: 'place_habitat_pod', name: 'Archive Field Habitat',
    offset: point(68, -30), rot: Math.atan2(-30, 23), radius: 8 }),
  Object.freeze({ placeId: 'place_observation_blister', name: 'Archive Watch Dome',
    offset: point(15, 40), rot: 0, radius: 8 }),
]);

// Authoring references only. They do not register navigation points, protective
// zones or required bearings. Ordinary research accepts any qualifying position.
export const TRITON_FIELD_LAB_APPROACH = Object.freeze([
  point(-320, -80), point(-220, 0), point(-100, 0),
]);
export const TRITON_FIELD_LAB_WATCH_STOP = Object.freeze({
  pos: point(-45, 40), clearRadius: 36,
});

export function tritonFieldLabDressingForSector(sectorId, anchors = {}) {
  if (sectorId !== TRITON_FIELD_LAB_SECTOR) return null;
  const matches = (anchors.pois || []).filter(row => row?.poiId === TRITON_FIELD_LAB_POI);
  if (matches.length !== 1) return null;
  const poi = matches[0], origin = poi.pos;
  if (poi.type !== 'anomaly' || poi.hidden === true || !origin
      || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;
  return Object.freeze(TRITON_FIELD_LAB_PROPS.map(prop => Object.freeze({
    placeId: prop.placeId, name: prop.name, radius: prop.radius, rot: prop.rot,
    pos: point(origin.x + prop.offset.x, origin.z + prop.offset.z),
    anchor: 'poi', anchorPos: point(origin.x, origin.z), everydaySpaceKit: true,
  })));
}
