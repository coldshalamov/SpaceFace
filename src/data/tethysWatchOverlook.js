// Tethys change-of-watch overlook. Four released kit bodies replace the four
// generated core-kit slots; this does not add a place, actor, timer or event owner.
// Coordinates are sector-local. The real Customs station supplies the global
// translation, just as world._toGlobal does for authored one-offs.

export const TETHYS_WATCH_OVERLOOK_SECTOR_ID = 'sector_tethys_junction';
export const TETHYS_WATCH_OVERLOOK_ANCHOR = Object.freeze({
  stationId: 'station_customs', x: -640, z: -1180,
});

const point = (x, z) => Object.freeze({ x, z });

// Authoring/clearance references, not navigation targets or proximity triggers.
// A pilot can stop beside the working yard, then take the outside pass for the
// cache-side view. Neither position is a sanctuary from the existing law/sim.
export const TETHYS_WATCH_OVERLOOK_STOPS = Object.freeze([
  Object.freeze({ id: 'watch', pos: point(-1100, -960), clearRadius: 36,
    lookAt: point(-744.39, -1198.41) }), // existing customs patrol's western beat
  Object.freeze({ id: 'cache', pos: point(-1240, 140), clearRadius: 36,
    lookAt: point(-1380, 420) }), // the real Quiet Cache, not a second receiver
]);

// Open approach and outside pass. The middle legs remain west of the service-yard
// waypoint, log survey sweep, counterweight cradle and z=-520 transfer corridor.
// This is composition evidence only: no autopilot or route is installed here.
export const TETHYS_WATCH_OVERLOOK_PASS = Object.freeze([
  point(-1400, -1150), point(-1100, -1120), point(-1100, -960),
  point(-1100, -850), point(-1240, -780), point(-1320, -320), point(-1240, 140),
]);

export const TETHYS_WATCH_OVERLOOK_PROPS = Object.freeze([
  Object.freeze({
    placeId: 'place_freight_platform', name: 'Watch-change Apron',
    pos: point(-1168, -960), rot: -Math.PI / 2,
    // Forge's -Y approach lip exports as +Z. Entity yaw -pi/2 faces that
    // green-lit edge east into the empty stopping space, not into the rack.
  }),
  Object.freeze({
    placeId: 'place_worklight_tower', name: 'Watch-change Worklight',
    pos: point(-1168, -1018), rot: -Math.PI / 2,
    // Its four-sided crown marks the apron edge; no new spotlight is implied.
  }),
  Object.freeze({
    placeId: 'place_observation_blister', name: 'Outer Log Lookout',
    pos: point(-1310, 100), rot: 0,
    // The released dome is radial. Its position, not a fictional directional
    // window, offers the second view as the pilot comes around the yard.
  }),
  Object.freeze({
    placeId: 'place_hull_rack', name: 'Outer Log Rib Rack',
    pos: point(-1160, 80), rot: Math.atan2(340, -220),
    // The +X run of stripped ribs lies along the cache bearing. Kept east of
    // the pilot's open pass: evidence of the yard, not a wall across it.
  }),
]);

/** Resolve only a unique, named live station anchor. Missing/ambiguous input
 * leaves ordinary kit selection in charge rather than inventing a global origin. */
export function tethysWatchOverlookForSector(sectorId, anchors = {}) {
  if (sectorId !== TETHYS_WATCH_OVERLOOK_SECTOR_ID) return null;
  const matches = (anchors.stations || []).filter((row) =>
    row?.stationId === TETHYS_WATCH_OVERLOOK_ANCHOR.stationId);
  if (matches.length !== 1) return null;
  const origin = matches[0].pos;
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;
  const dx = origin.x - TETHYS_WATCH_OVERLOOK_ANCHOR.x;
  const dz = origin.z - TETHYS_WATCH_OVERLOOK_ANCHOR.z;
  return Object.freeze(TETHYS_WATCH_OVERLOOK_PROPS.map((prop) => Object.freeze({
    ...prop,
    pos: point(prop.pos.x + dx, prop.pos.z + dz),
    anchorPos: point(origin.x, origin.z),
  })));
}
