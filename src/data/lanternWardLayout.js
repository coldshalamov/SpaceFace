// LW-01 — one authored shore around the existing Candle Fleet.
// All positions are offsets from the live poi_memorial anchor. These are not a
// second sector frame, spawn system or collision writer. World/physics consume
// this same geometry contract; the renderer does not choose an object's pose.

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const point = (x, z) => ({ x, z });

export const LANTERN_WARD_ID = 'district_helios_lantern_ward';
export const LANTERN_WARD_SECTOR = 'sector_helios_prime';
export const LANTERN_WARD_ANCHOR = 'poi_memorial';
export const LANTERN_WARD_ASSET_VERSION = 1;

// At the current anchor (1680,-820), the action triangle is 120 x 45 WU.
// The two service cheeks leave 84 WU, the outer freight throat at least 180 WU.
// Neither the historical 25th plinth nor its NE Pit Line bearing is a work socket.
export const LANTERN_WARD_OFFSETS = freeze({
  approach: point(30, 250),
  cradle: point(30, 170),
  lamp: point(30, 170),
  obstruction: point(95, 170),
  receiver: point(150, 125),
  serviceStand: point(120, 155),
  serviceCutNorth: point(95, 116),
  serviceCutSouth: point(95, 224),
  passengerDock: point(-55, 238),
  passengerDockFar: point(224, 70),
  maintenanceSource: point(-40, 202),
  maintenanceFace: point(-28, 150),
  bypassWest: point(-5, 320),
  bypassEast: point(211, 320),
  whiteSide: point(246, -15),
});

// Coordinates use the game's +X-forward, +Y-up, XZ-flight axes, metres = WU.
// Collision shapes are local XZ boxes. The payload is a separate finite object.
// No bounding circle is advertised as a traversable hollow: the 7 WU goods seat
// is cargo-scale, and the explicitly open service cut is defined by two bodies.
export const LANTERN_WARD_BODY_CONTRACTS = freeze({
  cradle: {
    assetId: 'place_lw_lantern_cradle',
    size: [30.4, 7.8, 18.4], center: [0, 1.7, 0], radius: 17.8,
    sockets: {
      tow_point: [14, 0, 0], tow_rear: [-13.2, 0, 0],
      lamp_seat: [0, 0, 0], lamp_retain_left: [-2.4, 1.3, -4.5],
      lamp_retain_right: [-2.4, 1.3, 4.5],
      service_approach: [0, 0, -16], service_power: [-3.2, 2.2, -3.4],
    },
    collision: [
      // Open unloading face. The separate lamp exits diagonally toward the
      // receiver through the same gap drawn in the north rail and enamel skin.
      { x: -8.7, z: -6.3, hx: 4.7, hz: 2.4 },
      { x: 12.6, z: -6.3, hx: 0.8, hz: 2.4 },
      { x: -0.6, z: 6.3, hx: 12.8, hz: 2.4 },
      { x: -10.8, z: 0, hx: 2.1, hz: 6.3 },
      // The recessed landing plate is beneath the lamp's flight-plane hull.
      // Filling its projection with an OBB would eject the separate payload.
      // The rails leave a 7.8 WU well: cargo can seat, a ship cannot pass.
      { x: 12.6, z: 0, hx: 2.6, hz: 1.6 },
    ],
    // Retainers and arm remain inside the platform's conservative load envelope.
    machineryEnvelope: { x: -1, z: 0, hx: 10, hz: 9.2 },
  },
  lamp: {
    assetId: 'place_lw_family_lamp', size: [6.8, 8.9, 6.8], center: [0, 4.25, 0], radius: 4.9,
    sockets: { lamp_foot: [0, 0, 0], service_power: [-3.2, 2.2, 0] },
    collision: [{ x: 0, z: 0, hx: 3.3, hz: 3.3 }],
  },
  receiver: {
    assetId: 'place_lw_family_receiver', size: [25.2, 7.2, 20.4], center: [0, 2.2, 0], radius: 16.3,
    sockets: {
      lamp_seat: [0, 0, 0], service_power: [5.4, 2.9, 0.8],
      service_approach: [-21, 0, 10], worker_brace: [6.4, 1.65, 2.3],
    },
    collision: [
      { x: 0, z: -7.2, hx: 11.6, hz: 2.8 },
      { x: 9, z: 0, hx: 3.1, hz: 7 },
      // The open cup supports the lamp vertically; it is not a planar solid.
    ],
  },
  obstruction: {
    assetId: 'place_lw_fallen_service_mast', size: [58, 7.3, 12], center: [0, 2, 0], radius: 29.7,
    sockets: { tow_point: [0, 0, 0], tow_end: [-27.2, 0, 0] },
    collision: [{ x: 0, z: 0, hx: 29, hz: 6 }],
  },
  service_face: {
    assetId: 'place_lw_service_shutter', size: [24.6, 9.2, 20.4], center: [0, 2.6, 0], radius: 16,
    sockets: {
      service_power: [5.4, 2.9, 0.8], worker_brace: [6.4, 1.65, 2.3],
      service_approach: [0, 0, 21],
    },
    collision: [
      { x: 0, z: -7.2, hx: 11.2, hz: 3 },
      { x: 9, z: 0, hx: 3.1, hz: 7 },
      { x: 0, z: -3.6, hx: 8.2, hz: 0.7 },
    ],
  },
  service_cheek: {
    assetId: 'place_lw_service_cheek', size: [25, 10.6, 24], center: [0, 3.3, 0], radius: 17.4,
    sockets: { service_line: [0, 3.4, 0] },
    collision: [{ x: 0, z: 0, hx: 12.5, hz: 12 }],
  },
  shore_spine: {
    assetId: 'place_lw_shore_spine', size: [57, 6.2, 12], center: [0, 1.1, 0], radius: 29.2,
    sockets: { join_front: [28, 0, 0], join_rear: [-28, 0, 0] },
    collision: [{ x: 0, z: 0, hx: 28.5, hz: 6 }],
  },
});

// Kit dimensions remain native. Closely spaced homes are joined by the narrow
// service spine instead of scaling household doors into station-sized doors.
// These are suggestions to the existing dressing owner, never spawned here.
export const LANTERN_WARD_KIT_DRESSING = freeze([
  { id: 'apron_dock', placeId: 'place_shuttle_dock', name: 'Apron Commuter Berth', offset: point(-55, 238), rot: 0, radius: 14 },
  { id: 'apron_wait', placeId: 'place_passenger_platform', name: 'Apron Waiting Rail', offset: point(-66, 211), rot: -0.1, radius: 9 },
  { id: 'apron_goods', placeId: 'place_freight_platform', name: 'Nessa’s Parts Apron', offset: point(-55, 171), rot: 0.12, radius: 14 },
  { id: 'steps_home_a', placeId: 'place_habitat_pod', name: 'Lantern Steps · Engine-Bell Home', offset: point(-85, 154), rot: -0.36, radius: 8 },
  { id: 'steps_home_b', placeId: 'place_habitat_pod', name: 'Lantern Steps · Patchwork Home', offset: point(-123, 124), rot: -0.65, radius: 8 },
  { id: 'steps_garden', placeId: 'place_observation_blister', name: 'Steps Garden Blister', offset: point(-139, 112), rot: 0.25, radius: 8 },
  { id: 'steps_home_c', placeId: 'place_habitat_pod', name: 'Lantern Steps · Upper Home', offset: point(-160, 58), rot: -1.18, radius: 8 },
  { id: 'steps_solar', placeId: 'place_solar_array', name: 'Steps Shared Shade', offset: point(-191, 28), rot: -0.18, radius: 12 },
  { id: 'steps_home_d', placeId: 'place_habitat_pod', name: 'Lantern Steps · North Home', offset: point(-164, -74), rot: -2.12, radius: 8 },
  { id: 'steps_service', placeId: 'place_utility_module', name: 'Steps Water and Power', offset: point(-190, -33), rot: -1.55, radius: 8 },
  { id: 'family_home', placeId: 'place_habitat_pod', name: 'Family Light · Home Berth', offset: point(174, 105), rot: 0.52, radius: 8 },
  { id: 'family_garden', placeId: 'place_observation_blister', name: 'Family Light · Planted Window', offset: point(184, 117), rot: 0.42, radius: 8 },
  { id: 'white_dock', placeId: 'place_shuttle_dock', name: 'White Side Passenger Berth', offset: point(224, 70), rot: -Math.PI / 2, radius: 14 },
  { id: 'white_platform', placeId: 'place_inspection_platform', name: 'White Side Registry Walk', offset: point(243, 30), rot: Math.PI / 2, radius: 12 },
  { id: 'white_signal', placeId: 'place_customs_pylon', name: 'White Side Lane Marker', offset: point(246, -15), rot: 0, radius: 8 },
]);

export const LANTERN_WARD_SHORE_SPINES = freeze([
  { id: 'steps_lower', offset: point(-99, 159), rot: 0.72 },
  { id: 'steps_middle', offset: point(-145, 110), rot: 1.16 },
  { id: 'steps_upper', offset: point(-175, 55), rot: 1.52 },
  { id: 'steps_back', offset: point(-179, -5), rot: 1.65 },
  { id: 'steps_north', offset: point(-162, -64), rot: 1.95 },
  { id: 'white_rim', offset: point(249, 64), rot: Math.PI / 2, whiteSide: true },
]);

export function lanternWardPoint(anchor, keyOrOffset, out = {}) {
  const offset = typeof keyOrOffset === 'string' ? LANTERN_WARD_OFFSETS[keyOrOffset] : keyOrOffset;
  if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)
      || !Number.isFinite(offset?.x) || !Number.isFinite(offset?.z)) return null;
  out.x = anchor.x + offset.x;
  out.z = anchor.z + offset.z;
  return out;
}

export function lanternWardSocketWorld(entity, name, out = {}) {
  const role = entity?.data?.lanternWardRole;
  const socket = LANTERN_WARD_BODY_CONTRACTS[role]?.sockets[name];
  if (!socket || !Number.isFinite(entity?.pos?.x) || !Number.isFinite(entity?.pos?.z)
      || !Number.isFinite(entity?.rot)) return null;
  const c = Math.cos(entity.rot), s = Math.sin(entity.rot);
  out.x = entity.pos.x + socket[0] * c - socket[2] * s;
  out.y = socket[1];
  out.z = entity.pos.z + socket[0] * s + socket[2] * c;
  return out;
}
