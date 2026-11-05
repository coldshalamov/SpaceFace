// VX-02 — the Cracker Run: a persistent, unscored free-drive ring on Helios Prime's yard edge.
//
// WHAT THIS IS: one authored arrangement — a plaza mouth southwest of Helios Station, an arcing
// berth-rib row (wide line outside, a real needle gap inside), an apron turn, and a claim-edge
// crossing where the Claim Cracker's fixed south-facing intake cone switches on for 3.5 s of
// every 12 s cycle. The crossing offers three honest lines: the low road (always safe, detours
// south), the anvil thread (a narrow northbound slot between the cone's west tail and the anvil
// — timed), and the open field (weave through live scatter, no authored line). No mission, no
// timer, no gate contract: it is a place. Reaching it leases nothing and changes no setting.
//
// HOW IT COLLIDES: every structure rides the existing solidDressing census — `_spawnPlaceProp`
// stamps a measured-skin fixed body for any placeId whose adopted silhouette clears the floor at
// the authored radius, so the thing the player hits is the thing the player sees. Route markers
// are `place_nav_buoy` at sub-floor silhouette: breadcrumbs, not walls.
//
// HOW THE LANES STAY CLEAR: `VX_FREE_DRIVE_RESERVATION_DISCS` enter `_arrangerForSector` as
// authored reservations before any rock is born. Only the threads and the low road are protected;
// the north field stays live scatter on purpose — weaving it is the third honest option, not a
// defect. Rim-straddling discs are avoided on purpose: a reservation at the field edge starves
// the arranger's re-seat crescent and can pin a rock inside the very lane it guards.
//
// CONE GEOMETRY (verified against environmentalMachinery.js): mouth body (720,-420) r18 facing
// south; cone apex (720,-402), reach 100, effective half-angle ~0.64 rad; anvil body (720,-484)
// r22. The slot between mouth south edge (-438) and anvil north edge (-462) is 24 wu — CLOSED to
// a 28-wu hull, so no lane may author a crossing through the pinch. The anvil thread instead
// rides the cone's west flank: at z -490 the wedge's west edge sits near x 654 and the anvil's
// west edge near x 698, a ~40 wu slot that is inside the cone's tail during surge. Entering it
// in the calm window is the ring's committed line; riding it during the surge is the honest
// price of mistiming — the field shoves south toward the anvil, not through it.

export const VX_FREE_DRIVE_SECTOR_ID = 'sector_helios_prime';

// Public yard navigation, like the nearby Outer Yard Derelict: no hidden/story gate. The fix
// rides the first existing ghost buoy, clear of the solid Mouth. Its runtimeOwner makes this
// an identity row, not an extra physical body or a paid exploration/completion site.
export const VX_FREE_DRIVE_POI = Object.freeze({
  id: 'poi_helios_cracker_run',
  type: 'beacon',
  name: 'Cracker Run',
  pos: Object.freeze({ x: 1060, z: 40 }),
  runtimeOwner: 'vxFreeDriveRing',
  chartNote: 'Unscored free flying through the yard; no start to trigger. This fix is the outer entry buoy. Find the Mouth, then follow buoys north into solid berth ribs. Take the low road south of the Helios Claim Cracker for a safe machinery bypass; its warning precedes the southward shove. Wait for calm before the narrow anvil thread.',
});

// Arrival copy names an existing body. These are presentation semantics, not a
// new checkpoint, route executor or physical entrance position.
export const VX_FREE_DRIVE_ENTRY_GUIDANCE = Object.freeze({
  mouthId: 'vx_ring_plaza_gate',
  nearPoiRadius: 200,
  label: 'Cracker Run · unscored',
  instruction: 'No start. Buoys lead north into solid berth ribs.',
});

/** Add the public fix to the mutable sector catalog without editing the static Atlas. */
export function vxFreeDrivePoisFor(sectorId, pois = []) {
  if (sectorId !== VX_FREE_DRIVE_SECTOR_ID || pois.some((poi) => poi.id === VX_FREE_DRIVE_POI.id)) return pois;
  return [...pois, VX_FREE_DRIVE_POI];
}

export const VX_FREE_DRIVE_STRUCTURES = Object.freeze([
  // ── Departure plaza: the mouth, southwest of the station apron ─────────────
  Object.freeze({
    id: 'vx_ring_plaza_gate',
    name: 'Cracker Run — the Mouth',
    placeId: 'place_conveyor_truss',
    localPos: Object.freeze({ x: 1180, z: -30 }),
    rot: 2.6 + Math.PI, radius: 68,
    why: 'The berth\'s heavy conveyor cap turns its ochre end toward the entry; round the solid deck to reach the ribs.',
  }),
  // ── The berth ribs: an arc bowed northeast — the outside line is the long way,
  //    the thread through the gaps cuts the corner; one gap is a real needle. ──
  Object.freeze({
    id: 'vx_ring_rib_1',
    name: 'Berth Rib — outer post',
    placeId: 'place_conveyor_truss',
    localPos: Object.freeze({ x: 1080, z: 150 }),
    rot: 0.8, radius: 44,
    why: 'The first heavy rib repeats the Mouth\'s conveyor web; the wide line bows out northeast of its solid span.',
  }),
  Object.freeze({
    id: 'vx_ring_rib_2',
    name: 'Berth Rib — the arm',
    placeId: 'place_transfer_arm',
    localPos: Object.freeze({ x: 930, z: 300 }),
    rot: 0.7, radius: 26,
    why: 'A cargo arm frozen mid-swing; its footprint is what it looks like — solid.',
  }),
  Object.freeze({
    id: 'vx_ring_rib_3',
    name: 'Berth Rib — centre truss',
    placeId: 'place_conveyor_truss',
    localPos: Object.freeze({ x: 800, z: 470 }),
    rot: 0.6, radius: 30,
    why: 'The committed line threads between this truss and the mast — about 45 wu of air.',
  }),
  Object.freeze({
    id: 'vx_ring_rib_4',
    name: 'Berth Rib — the needle mast',
    placeId: 'place_extraction_mast',
    localPos: Object.freeze({ x: 730, z: 540 }),
    rot: 0.5, radius: 24,
    why: 'The mast that makes the needle; one committed sideways move, no slalom.',
  }),
  Object.freeze({
    id: 'vx_ring_rib_5',
    name: 'Berth Rib — apron post',
    placeId: 'place_conveyor_truss',
    localPos: Object.freeze({ x: 680, z: 840 }),
    rot: 0.3, radius: 44,
    why: 'The last heavy rib closes the stripped berth\'s silhouette before the apron opens west — a wide, forgiving turn.',
  }),
  // ── Apron corner: the west gate of the run ─────────────────────────────────
  Object.freeze({
    id: 'vx_ring_apron_mouth',
    name: 'Apron Mouth',
    placeId: 'place_freight_platform',
    localPos: Object.freeze({ x: 640, z: 1030 }),
    rot: 0.3, radius: 60,
    why: 'The broad freight apron caps the berth; the run turns west across the face of its solid platform.',
  }),
  Object.freeze({
    id: 'vx_ring_hulk_gate',
    name: 'The Hulk Gate',
    placeId: 'place_dead_hulk',
    localPos: Object.freeze({ x: -220, z: 820 }),
    rot: 2.2, radius: 50,
    why: 'A dead ore hulk parked as the west corner; the run bends north around her.',
  }),
  // ── The turn down to the claim edge ────────────────────────────────────────
  Object.freeze({
    id: 'vx_ring_the_turn',
    name: 'The Turn',
    placeId: 'place_dead_hulk',
    localPos: Object.freeze({ x: 300, z: 80 }),
    rot: 4.0, radius: 45,
    why: 'Second hulk, brighter scrap — the mark for the drop to the Cracker line.',
  }),
  // ── Claim edge: racks mark where the live field starts; cages wall the low
  //    road's south side. The gap between them is the cone's shadow. ──────────
  Object.freeze({
    id: 'vx_ring_chute_n1',
    name: 'Field-edge rack — first',
    placeId: 'place_container_rack',
    localPos: Object.freeze({ x: 450, z: -340 }),
    rot: 0.1, radius: 18,
    why: 'Claim-side container rack; north of it the field is live scatter — your problem.',
  }),
  Object.freeze({
    id: 'vx_ring_chute_n2',
    name: 'Field-edge rack — mid',
    placeId: 'place_container_rack',
    localPos: Object.freeze({ x: 620, z: -350 }),
    rot: 0.1, radius: 18,
    why: 'Mid-rack; the claim machinery wakes south of this line.',
  }),
  Object.freeze({
    id: 'vx_ring_chute_n3',
    name: 'Field-edge rack — last',
    placeId: 'place_container_rack',
    localPos: Object.freeze({ x: 800, z: -350 }),
    rot: 0.1, radius: 18,
    why: 'Last cover before the cone\'s shadow.',
  }),
  Object.freeze({
    id: 'vx_ring_chute_s1',
    name: 'Low road south wall — first cage',
    placeId: 'place_scrap_cage',
    localPos: Object.freeze({ x: 520, z: -575 }),
    rot: 0.2, radius: 18,
    why: 'Scrap cage on the refuge side; hold this line and the surge cannot reach you.',
  }),
  Object.freeze({
    id: 'vx_ring_chute_s2',
    name: 'Low road south wall — mid cage',
    placeId: 'place_scrap_cage',
    localPos: Object.freeze({ x: 700, z: -585 }),
    rot: 0.2, radius: 18,
    why: 'The low road\'s marker, level with the Cracker mouth.',
  }),
  Object.freeze({
    id: 'vx_ring_chute_s3',
    name: 'Low road south wall — last cage',
    placeId: 'place_scrap_cage',
    localPos: Object.freeze({ x: 880, z: -565 }),
    rot: 0.2, radius: 18,
    why: 'The cages run out here — you are past the machine either way.',
  }),
]);

// Route breadcrumbs — deliberately sub-floor silhouettes: markers, never walls. The thread
// buoys at (676,-490) and (670,-445) sit inside the cone's west tail: they mark the lip, and
// during the surge they are inside live field — which is the point.
export const VX_FREE_DRIVE_MARKERS = Object.freeze([
  // plaza approach
  Object.freeze({ localPos: Object.freeze({ x: 1060, z: 40 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 940, z: 110 }) }),
  // apron run west
  Object.freeze({ localPos: Object.freeze({ x: 420, z: 1050 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 180, z: 980 }) }),
  Object.freeze({ localPos: Object.freeze({ x: -60, z: 900 }) }),
  // the drop to the claim edge
  Object.freeze({ localPos: Object.freeze({ x: -160, z: 500 }) }),
  Object.freeze({ localPos: Object.freeze({ x: -140, z: 250 }) }),
  Object.freeze({ localPos: Object.freeze({ x: -60, z: 0 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 120, z: -140 }) }),
  // the low road — flanks the anvil thread's branch point
  Object.freeze({ localPos: Object.freeze({ x: 480, z: -525 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 840, z: -525 }) }),
  // the anvil thread: south mouth, mid-slot, and the exit shoulder
  Object.freeze({ localPos: Object.freeze({ x: 680, z: -545 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 676, z: -490 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 670, z: -445 }) }),
  // the return leg to the plaza (west of the station approach)
  Object.freeze({ localPos: Object.freeze({ x: 1000, z: -490 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 1090, z: -350 }) }),
  Object.freeze({ localPos: Object.freeze({ x: 1150, z: -190 }) }),
].map((marker, index) => Object.freeze({ ...marker, id: `vx_ring_marker_${index + 1}` })));

// Authored reservations (sector-local discs) — fed into `_arrangerForSector` so seeded scatter
// respects the run the way it respects machines, boulders and authored slots. Lean on purpose:
// the rib threads, the low road and the anvil-thread mouth are protected; the field interior is
// deliberately left live (the third option). Nothing straddles the field rim — a rim disc starves
// the arranger's re-seat crescent and can pin a rock inside the lane it guards.
const LANE_DISCS = [
  // Optional loose ore tub: keep seeded scatter clear of its starting footprint and approach.
  [1020, 80, 55],
  // plaza mouth
  [1180, -30, 90],
  // the rib-gap threads: one disc centred on each gap along the arc
  [1005, 225, 70], [865, 385, 70], [765, 505, 60], [705, 690, 70],
  // apron mouth + hulk corner approaches
  [640, 1030, 90], [-220, 820, 90],
  // the Turn's approach
  [300, 80, 90],
  // the low road — the always-safe line south of the cone's reach
  [500, -525, 90], [660, -525, 90], [820, -525, 90],
  // the anvil thread's south mouth and exit shoulder (well inside the field)
  [670, -540, 65], [668, -455, 60],
];
export const VX_FREE_DRIVE_RESERVATION_DISCS = Object.freeze(
  LANE_DISCS.map(([x, z, radius]) => Object.freeze({
    localPos: Object.freeze({ x, z }), radius,
  })),
);

export function vxFreeDriveStructuresFor(sectorId) {
  return sectorId === VX_FREE_DRIVE_SECTOR_ID ? VX_FREE_DRIVE_STRUCTURES : [];
}

export function vxFreeDriveMarkersFor(sectorId) {
  return sectorId === VX_FREE_DRIVE_SECTOR_ID ? VX_FREE_DRIVE_MARKERS : [];
}

/** Global-space {pos, radius} reservation discs for `_arrangerForSector`. */
export function vxFreeDriveReservationsFor(sectorId, toGlobal) {
  if (sectorId !== VX_FREE_DRIVE_SECTOR_ID) return [];
  const hop = typeof toGlobal === 'function' ? toGlobal : (p) => p;
  return VX_FREE_DRIVE_RESERVATION_DISCS.map((disc) => ({
    pos: hop(disc.localPos),
    radius: disc.radius,
  }));
}
