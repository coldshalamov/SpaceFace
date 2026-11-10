// Veil's cold side and quiet side. Four existing released bodies replace the
// generated kit allocation; the world owner still owns placement and residency.
// This is a working margin, not a new station, cargo receiver or research owner.

import { OCCUPATIONAL_PLACE_RADIUS } from './occupationalYardDressing.js';

export const VEIL_RESEARCH_EDGE_SECTOR_ID = 'sector_veil_nebula';
export const VEIL_RESEARCH_EDGE_ANCHOR = Object.freeze({
  stationId: 'station_veil', x: 420, z: -1120,
});

const point = (x, z) => Object.freeze({ x, z });

// Separate from the forty-six random-kit models. The locker is existing
// occupational stock and resolves through partsLibrary's explicit PLACE_FILES;
// the other three resolve through its existing everydaySpaceKit family map.
// Do not add the locker to the random pool merely to compose this one place.
export const VEIL_RESEARCH_EDGE_MODELS = Object.freeze([
  Object.freeze({ id: 'place_cold_locker', radius: OCCUPATIONAL_PLACE_RADIUS.place_cold_locker,
    file: 'places/place_cold_locker.glb' }),
  Object.freeze({ id: 'place_utility_module', radius: 8,
    file: 'places/place_utility_module.glb' }),
  Object.freeze({ id: 'place_habitat_pod', radius: 8,
    file: 'places/place_habitat_pod.glb' }),
  Object.freeze({ id: 'place_observation_blister', radius: 8,
    file: 'places/place_observation_blister.glb' }),
]);

// Authoring and clearance references, not navigation targets or safe-zone rules.
// The northern stop frames the near turns, not both complete flight paths.
export const VEIL_RESEARCH_EDGE_STOPS = Object.freeze([
  Object.freeze({ id: 'working_wait', pos: point(540, -1220), clearRadius: 36,
    lookAt: point(459.3, -1224.9) }), // existing tender's service-berth mark
  Object.freeze({ id: 'observation', pos: point(470, -935), clearRadius: 36,
    lookAt: point(380.7, -1015.1) }), // existing tender's anomaly-side mark
]);

export const VEIL_RESEARCH_EDGE_PASSES = Object.freeze({
  // The ordinary eastern station approach is left open; these optional branches
  // separate waiting and looking from the research craft's existing crossing.
  stationApproach: Object.freeze([point(740, -1120), point(510, -1120)]),
  workingWait: Object.freeze([point(740, -1120), point(640, -1220), point(540, -1220)]),
  observation: Object.freeze([point(740, -1120), point(640, -990), point(470, -935)]),
});

export const VEIL_RESEARCH_EDGE_PROPS = Object.freeze([
  Object.freeze({ placeId: 'place_cold_locker', name: 'Instrument Cold Locker',
    pos: point(505, -1290), rot: 0 }),
  Object.freeze({ placeId: 'place_utility_module', name: 'Instrument Service Module',
    pos: point(550, -1290), rot: 0 }),
  Object.freeze({ placeId: 'place_habitat_pod', name: 'Instrument Crew Habitat',
    pos: point(590, -1280), rot: -Math.atan2(60, 50) }),
  // The habitat's real -X airlock faces the waiting space. Its own solar wings
  // supply the visual power relationship; an extra solar array adds no purpose.
  Object.freeze({ placeId: 'place_observation_blister', name: 'North Observation Blister',
    pos: point(535, -885), rot: 0 }),
  // The released dome is radial. No directional window or enterable room is implied.
]);

/** Missing or ambiguous live station identity leaves ordinary dressing in charge.
 * Real station coordinates supply the translation; sector origin is never guessed. */
export function veilResearchEdgeForSector(sectorId, anchors = {}) {
  if (sectorId !== VEIL_RESEARCH_EDGE_SECTOR_ID) return null;
  const matches = (anchors.stations || []).filter((row) =>
    row?.stationId === VEIL_RESEARCH_EDGE_ANCHOR.stationId);
  if (matches.length !== 1) return null;
  const origin = matches[0].pos;
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;
  const dx = origin.x - VEIL_RESEARCH_EDGE_ANCHOR.x;
  const dz = origin.z - VEIL_RESEARCH_EDGE_ANCHOR.z;
  return Object.freeze(VEIL_RESEARCH_EDGE_PROPS.map((prop, index) => Object.freeze({
    ...prop,
    pos: point(prop.pos.x + dx, prop.pos.z + dz),
    radius: VEIL_RESEARCH_EDGE_MODELS[index].radius,
    anchor: 'station',
    anchorPos: point(origin.x, origin.z),
    everydaySpaceKit: true,
  })));
}
