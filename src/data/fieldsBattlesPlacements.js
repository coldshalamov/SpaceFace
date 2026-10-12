// AEP / P1 (asset-experience-program chunk p1-fields-battles) — PP-1 field silhouette +
// wayfinding packets and PP-2 staged battle dressing for every sector scoring Cam ≤4 on the
// WORLD_PLACEMENT_AUDIT §5 scorecard (Helios, Veil, Pallas, Io + all fourteen rim sectors).
//
// Two authored one-off records per sector, consumed through the existing seams so nothing is
// decorative:
//   * `oneoff_<x>_waymark`   — PP-1 approach-lane waymark chain: lane_nav buoys / lane_pins
//     running the gate→station approach, terminating in a transponder_gate or traffic_signal,
//     with one silhouette prop (asteroid_seamed / debris_chunk) standing off the chain as the
//     field-mouth landmark the lane steers by.
//   * `oneoff_<x>_battlescar` — PP-2 staged battle site: a cover line of aftermath deb/frag
//     pieces, a hero wreck, and an escalation silhouette looming behind the line. The hero
//     wreck carries physicalBody so it is ropeable like the other aftermath one-offs.
// One authored map-glyph zone per sector names the scar on the chart — the B.10 "map-glyph
// silhouette" item — authored as ZONE_* records inside AUTHORED_PLACE_ZONES (authoredPlaces.js),
// the additive seam whose hold-out list the schedule-matrix test derives from.
// The ambient beats that stage these sites live in the scene-* encounters 586–591, which ride
// the F1 lived-vignette seams (livedWorldDirector ambient pool, compileVignette).

function prop(placeId, dx, dz, rot, radius) {
  return Object.freeze({ placeId, dx, dz, rot, radius });
}

function oneOff(rec) {
  return Object.freeze({
    id: rec.id,
    name: rec.name,
    placeId: rec.placeId,
    sectorId: rec.sectorId,
    anchor: Object.freeze({ type: 'station', id: rec.stationId }),
    offsetLocal: Object.freeze({ x: rec.dx, z: rec.dz }),
    rot: rec.rot,
    radius: rec.radius,
    ...(rec.mass ? { physicalBody: Object.freeze({ mass: rec.mass }) } : {}),
    cluster: Object.freeze({ props: Object.freeze(rec.props) }),
    why: rec.why,
  });
}

// Waymark chain record: the silhouette prop is the record's own body, the lane marks are the
// cluster props (station-relative dx/dz in WU).
function waymark(sectorId, stationId, key, name, dx, dz, silhouette, marks, why) {
  return oneOff({
    id: `oneoff_${key}_waymark`,
    name,
    placeId: silhouette.placeId,
    sectorId,
    stationId,
    dx: dx + silhouette.dx,
    dz: dz + silhouette.dz,
    rot: silhouette.rot,
    radius: silhouette.radius,
    props: marks.map((m) => prop(m[0], m[1], m[2], m[3], m[4])),
    why,
  });
}

// Staged battle site: cover line, hero wreck (record body, ropeable), escalation silhouette.
function battle(sectorId, stationId, key, name, dx, dz, wreck, escalation, line, why) {
  return oneOff({
    id: `oneoff_${key}_battlescar`,
    name,
    placeId: wreck.placeId,
    sectorId,
    stationId,
    dx: dx + wreck.dx,
    dz: dz + wreck.dz,
    rot: wreck.rot,
    radius: wreck.radius,
    mass: wreck.mass,
    props: [
      prop(escalation.placeId, escalation.dx, escalation.dz, escalation.rot, escalation.radius),
      ...line.map((m) => prop(m[0], m[1], m[2], m[3], m[4])),
    ],
    why,
  });
}

const BUOY = 'place_nav_buoy';
const PIN = 'place_lane_pin';
const GATE = 'place_transponder_gate';
const SIGNAL = 'place_traffic_signal';
const IBOUOY = 'place_interdiction_buoy';
const SEAMED = 'place_asteroid_seamed';
const CHUNK = 'place_debris_chunk';
const HULK = 'place_dead_hulk';
const PMAST = 'place_pirate_sensor_mast';
const WRECK_CORVETTE = 'place_aftermath_wreck_corvette_forward__stripped_heavy';
const WRECK_FREIGHTER = 'place_aftermath_wreck_ore_freighter_bow__stripped';
const WRECK_FREIGHTER_DERELICT = 'place_aftermath_wreck_ore_freighter_bow__derelict';
const WRECK_LINER_DRUM = 'place_aftermath_wreck_liner_drum__derelict';
const WRECK_LINER_BOW = 'place_aftermath_wreck_liner_bow';
const WRECK_COCKPIT = 'place_aftermath_aft_cockpit_section';
const WRECK_TURRET = 'place_aftermath_wreck_corvette_turret';
const WRECK_ENGINE = 'place_aftermath_wreck_corvette_engine';
const DEB_BELT = 'place_aftermath_deb_corvette_armor_belt';
const DEB_RING = 'place_aftermath_deb_corvette_barbette_ring';
const FRAG_GRATING = 'place_aftermath_frag_grating_sheet';
const FRAG_PLATE = 'place_aftermath_frag_plate_curl';
const FRAG_STRUT = 'place_aftermath_frag_strut_shard';
const FRAG_RIB = 'place_aftermath_frag_rib_cluster';
const FRAG_PIPE = 'place_aftermath_frag_pipe_tangle';
const FRAG_CABLE = 'place_aftermath_frag_cable_bundle';

export const FIELDS_BATTLES_ONE_OFFS = Object.freeze([

  // ─── sector_helios_prime — Cam 4 ───────────────────────────────────────────────
  // Waymark: the Tethys freight approach east of station_helios, steering by a seamed rock.
  waymark('sector_helios_prime', 'station_helios', 'helios_tethys',
    'The Tethys Run — waymarks on the freight approach',
    380, 60, { placeId: SEAMED, dx: -60, dz: 40, rot: 0.8, radius: 14 },
    [
      [BUOY, 0, 0, 0.2, 8], [PIN, 160, 30, 0.4, 6], [BUOY, 320, 55, 0.1, 8],
      [PIN, 480, 80, 0.5, 6], [GATE, 660, 110, 0.9, 30],
    ],
    'Tethys inbound read the buoy chain off a seamed rock and never touched the starter field.'),
  // Battlescar: the old attack scar west of the core — cover line of corvette remains with a
  // dead hulk looming behind, the "Harbour Scar" the memorial commemorates.
  battle('sector_helios_prime', 'station_helios', 'helios_harbour',
    'Harbour Scar — the attack that made the memorial',
    -1800, 300,
    { placeId: WRECK_CORVETTE, dx: 0, dz: 0, rot: 1.9, radius: 34, mass: 160 },
    { placeId: HULK, dx: -140, dz: -160, rot: 2.7, radius: 90 },
    [
      [DEB_BELT, -90, 60, 0.3, 16], [FRAG_RIB, -20, 90, 2.1, 10], [DEB_RING, 70, 110, 1.4, 12],
      [FRAG_STRUT, 150, 60, 4.0, 5], [IBOUOY, 40, -80, 0.0, 8], [IBOUOY, -60, -60, 0.0, 8],
    ],
    'Reach cutters still hold a cordon on the hulls that fell guarding the harbour.'),

  // ─── sector_veil_nebula — Cam 4 ────────────────────────────────────────────────
  // Waymark: down the null corridor toward the quiet ice.
  waymark('sector_veil_nebula', 'station_veil', 'veil_ice',
    'Quiet Ice Run — waymarks down the null corridor',
    80, 380, { placeId: CHUNK, dx: -40, dz: -30, rot: 1.6, radius: 40 },
    [
      [PIN, 0, 0, 0.0, 6], [BUOY, 60, 340, 0.3, 8], [PIN, 120, 680, 0.1, 6],
      [BUOY, 180, 1020, 0.4, 8], [SIGNAL, 240, 1360, 1.2, 8],
    ],
    'The survey crews pinned lights down the corridor so the ice field would stop eating the lane.'),
  battle('sector_veil_nebula', 'station_veil', 'veil_cordon',
    'The Revoked Cordon — hulls that died enforcing the gate',
    -120, 620,
    { placeId: WRECK_COCKPIT, dx: 0, dz: 0, rot: 0.6, radius: 26, mass: 90 },
    { placeId: WRECK_LINER_DRUM, dx: 160, dz: -140, rot: 3.9, radius: 68 },
    [
      [FRAG_PIPE, -80, 70, 0.9, 8], [DEB_RING, 30, 100, 2.6, 12], [FRAG_PLATE, 110, 40, 1.1, 6],
      [IBOUOY, -40, -90, 0.0, 8], [IBOUOY, 80, -70, 0.0, 8],
    ],
    'Nobody revoked the cordon when the gate revoked itself; the hulls are still on station.'),

  // ─── sector_pallas_drift — Cam 4 ───────────────────────────────────────────────
  // Waymark: up out of the smuggler drift toward the second field.
  waymark('sector_pallas_drift', 'station_drift', 'pallas_reef',
    'Reef Run — waymarks threading the wreck-reef slalom',
    80, 300, { placeId: SEAMED, dx: 50, dz: -40, rot: 2.9, radius: 14 },
    [
      [PIN, 0, 0, 0.2, 6], [BUOY, 60, 280, 0.5, 8], [PIN, 120, 560, 0.3, 6],
      [BUOY, 180, 840, 0.6, 8], [SIGNAL, 240, 1120, 0.9, 8],
    ],
    'The reef eats pilots who cut the corner; the pinned line is the only honest line.'),
  battle('sector_pallas_drift', 'station_drift', 'pallas_scar',
    'Reef Scar — where the belt war left its line',
    -700, 460,
    { placeId: WRECK_FREIGHTER, dx: 0, dz: 0, rot: 4.2, radius: 40, mass: 200 },
    { placeId: WRECK_LINER_BOW, dx: -180, dz: 120, rot: 1.2, radius: 52 },
    [
      [DEB_BELT, -100, -60, 0.5, 16], [FRAG_GRATING, -30, -110, 2.0, 6], [DEB_RING, 60, -120, 3.1, 12],
      [FRAG_CABLE, 140, -70, 0.7, 6], [FRAG_STRUT, 200, -10, 1.9, 5],
    ],
    'The line where two crews dug in and the belt ate them both — the scavengers call it the Scar.'),

  // ─── sector_io_reach — Cam 4 ───────────────────────────────────────────────────
  // Waymark: the supply lane down to the contested belt.
  waymark('sector_io_reach', 'station_reach', 'io_supply',
    'Supply Lane — waymarks down to the contested belt',
    280, -320, { placeId: CHUNK, dx: -50, dz: 30, rot: 0.4, radius: 40 },
    [
      [BUOY, 0, 0, 0.1, 8], [PIN, 260, -300, 0.3, 6], [BUOY, 520, -600, 0.2, 8],
      [PIN, 780, -880, 0.5, 6], [GATE, 1040, -1160, 1.1, 30],
    ],
    'The lane the merc crews fly with lights off — buoys still mark it for the convoys.'),
  // Battlescar: the front line where the Reach and the Quiet hulls froze nose to nose.
  battle('sector_io_reach', 'station_reach', 'io_front',
    'The Front Wake — two lines that never finished',
    -220, -1020,
    { placeId: WRECK_CORVETTE, dx: 0, dz: 0, rot: 2.4, radius: 34, mass: 160 },
    { placeId: HULK, dx: -160, dz: -140, rot: 0.8, radius: 90 },
    [
      [DEB_BELT, -110, 50, 1.0, 16], [DEB_RING, -30, 90, 0.2, 12], [FRAG_RIB, 60, 110, 3.3, 10],
      [FRAG_PLATE, 140, 60, 1.7, 6], [WRECK_TURRET, 220, -40, 4.4, 14], [IBOUOY, 30, -90, 0.0, 8],
    ],
    'Reach line on one side, Quiet line on the other — the wrecks are the border now.'),

  // ─── sector_nyx_march — Cam 3 ──────────────────────────────────────────────────
  waymark('sector_nyx_march', 'station_nyx_march', 'nyx_march',
    'March Line — waymarks across the open floor',
    200, -200, { placeId: SEAMED, dx: -40, dz: 50, rot: 5.1, radius: 14 },
    [
      [PIN, 0, 0, 0.0, 6], [BUOY, 180, -180, 0.3, 8], [PIN, 360, -360, 0.1, 6],
      [BUOY, 540, -540, 0.4, 8], [SIGNAL, 720, -720, 0.8, 8],
    ],
    'The fence keeps the lane honest — a line of lights across a floor with nothing else on it.'),
  battle('sector_nyx_march', 'station_nyx_march', 'nyx_scar',
    'March Scar — the ambush the floor remembers',
    700, 260,
    { placeId: WRECK_FREIGHTER_DERELICT, dx: 0, dz: 0, rot: 1.5, radius: 40, mass: 180 },
    { placeId: HULK, dx: 180, dz: -160, rot: 2.2, radius: 90 },
    [
      [FRAG_STRUT, -90, 60, 0.6, 5], [DEB_RING, -10, 100, 1.8, 12], [FRAG_GRATING, 80, 120, 2.9, 6],
      [DEB_BELT, 160, 50, 0.1, 16], [PMAST, -60, -100, 0.0, 6],
    ],
    'Someone sprang a convoy on the open march; the floor kept the spacing.'),

  // ─── sector_hyperion_cut — Cam 3 ───────────────────────────────────────────────
  waymark('sector_hyperion_cut', 'station_hyperion_cut', 'hyperion_lane',
    'Cut Lane — waymarks down the throat',
    -300, -260, { placeId: CHUNK, dx: 40, dz: 40, rot: 3.3, radius: 40 },
    [
      [BUOY, 0, 0, 0.2, 8], [PIN, -260, -220, 0.4, 6], [BUOY, -520, -440, 0.1, 8],
      [PIN, -780, -660, 0.5, 6], [GATE, -1040, -880, 1.3, 30],
    ],
    'Pinned down the throat of the Cut — the refinery paid for every buoy.'),
  battle('sector_hyperion_cut', 'station_hyperion_cut', 'hyperion_teeth',
    'Cut Teeth — the yard fight the belt swallowed',
    940, -780,
    { placeId: WRECK_COCKPIT, dx: 0, dz: 0, rot: 3.0, radius: 26, mass: 90 },
    { placeId: WRECK_FREIGHTER, dx: -140, dz: 180, rot: 0.9, radius: 40 },
    [
      [DEB_RING, -80, -70, 0.4, 12], [FRAG_PIPE, 0, -120, 1.6, 8], [FRAG_PLATE, 90, -80, 2.5, 6],
      [FRAG_STRUT, 170, -20, 0.8, 5],
    ],
    'The belt keeps what the yards fight over — teeth marks in the seam.'),

  // ─── sector_kepler_scar — Cam 3 ───────────────────────────��────────────────────
  waymark('sector_kepler_scar', 'station_kepler_scar', 'kepler_rim',
    'Rim Run — waymarks out to the gate',
    -420, -200, { placeId: SEAMED, dx: 50, dz: 30, rot: 1.1, radius: 14 },
    [
      [PIN, 0, 0, 0.1, 6], [BUOY, -340, -180, 0.3, 8], [PIN, -680, -360, 0.2, 6],
      [BUOY, -1020, -540, 0.5, 8], [SIGNAL, -1360, -720, 0.7, 8],
    ],
    'The only marked line off the scar floor — everything else is salvage.'),
  battle('sector_kepler_scar', 'station_kepler_scar', 'kepler_grave',
    'Scar Grave — the wreck line the scar is named for',
    800, -400,
    { placeId: WRECK_FREIGHTER_DERELICT, dx: 0, dz: 0, rot: 5.3, radius: 40, mass: 180 },
    { placeId: HULK, dx: 200, dz: 140, rot: 1.8, radius: 90 },
    [
      [DEB_BELT, -120, 60, 0.2, 16], [FRAG_RIB, -40, 110, 1.4, 10], [DEB_RING, 60, 130, 2.7, 12],
      [FRAG_CABLE, 160, 80, 0.5, 6], [WRECK_ENGINE, -80, -140, 3.4, 14],
    ],
    'The grave the scar is named for — a whole line, hulls still in column.'),

  // ─── sector_orcus_shadow — Cam 2 ───────────────────────────────────────────────
  waymark('sector_orcus_shadow', 'station_orcus_shadow', 'orcus_lights',
    'Shadow Lights — waymarks off the research dock',
    -160, 360, { placeId: CHUNK, dx: 40, dz: -30, rot: 0.9, radius: 40 },
    [
      [PIN, 0, 0, 0.2, 6], [BUOY, -140, 340, 0.4, 8], [PIN, -280, 680, 0.1, 6],
      [BUOY, -420, 1020, 0.3, 8], [SIGNAL, -560, 1360, 1.0, 8],
    ],
    'A chain of lights so the supply run does not become a shadow incident.'),
  battle('sector_orcus_shadow', 'station_orcus_shadow', 'orcus_teeth',
    'Shadow Teeth — the contact the archive redacted',
    -720, 760,
    { placeId: WRECK_CORVETTE, dx: 0, dz: 0, rot: 0.7, radius: 34, mass: 160 },
    { placeId: WRECK_LINER_DRUM, dx: -180, dz: -120, rot: 4.6, radius: 68 },
    [
      [DEB_RING, -90, 70, 1.2, 12], [FRAG_PLATE, -10, 120, 0.4, 6], [DEB_BELT, 80, 90, 2.0, 16],
      [FRAG_STRUT, 170, 30, 3.1, 5], [PMAST, -50, -110, 0.0, 6],
    ],
    'A fight the archive reports as weather; the hulls did not get the memo.'),

  // ─── sector_rhea_cinder — Cam 3 ────────────────────────────────────────────────
  waymark('sector_rhea_cinder', 'station_rhea_cinder', 'rhea_claims',
    'Claims Run — waymarks out to the Haumea gate',
    360, 200, { placeId: SEAMED, dx: -50, dz: 40, rot: 2.4, radius: 14 },
    [
      [PIN, 0, 0, 0.0, 6], [BUOY, 320, 180, 0.2, 8], [PIN, 640, 360, 0.4, 6],
      [BUOY, 960, 540, 0.1, 8], [GATE, 1280, 720, 0.6, 30],
    ],
    'Claim crews pinned the gate run — the claims are arguable, the lane is not.'),
  battle('sector_rhea_cinder', 'station_rhea_cinder', 'rhea_teeth',
    'Cinder Teeth — where the claim war burned out',
    640, -820,
    { placeId: WRECK_FREIGHTER, dx: 0, dz: 0, rot: 1.0, radius: 40, mass: 200 },
    { placeId: HULK, dx: 160, dz: 180, rot: 2.9, radius: 90 },
    [
      [DEB_BELT, -110, -50, 0.8, 16], [FRAG_GRATING, -30, -100, 1.9, 6], [DEB_RING, 60, -110, 0.3, 12],
      [FRAG_PIPE, 150, -50, 2.4, 8], [WRECK_TURRET, -70, 130, 4.1, 14],
    ],
    'The claim war burned itself out on this line; the slag keeps the pieces.'),

  // ─── sector_haumea_rift — Cam 3 ───���─��──────────────────────────────────────────
  waymark('sector_haumea_rift', 'station_haumea_rift', 'haumea_fissure',
    'Fissure Run — waymarks to the crack in the ice',
    -100, 220, { placeId: SEAMED, dx: 40, dz: -40, rot: 4.8, radius: 14 },
    [
      [PIN, 0, 0, 0.1, 6], [BUOY, -90, 200, 0.3, 8], [PIN, -180, 400, 0.2, 6],
      [BUOY, -270, 600, 0.5, 8], [SIGNAL, -360, 800, 0.9, 8],
    ],
    'Lights to the crack — the observatory marks the safe throat through the ice.'),
  battle('sector_haumea_rift', 'station_haumea_rift', 'haumea_scar',
    'Fissure Scar — hulls frozen mid-run',
    -1020, 1080,
    { placeId: WRECK_COCKPIT, dx: 0, dz: 0, rot: 2.6, radius: 26, mass: 90 },
    { placeId: WRECK_FREIGHTER_DERELICT, dx: 150, dz: -180, rot: 0.5, radius: 40 },
    [
      [DEB_RING, -80, -60, 1.3, 12], [FRAG_CABLE, 0, -120, 0.6, 6], [FRAG_PLATE, 90, -80, 2.2, 6],
      [FRAG_STRUT, 170, -20, 3.7, 5],
    ],
    'A run through the ice that ended in hulls — the rift kept them mid-stride.'),

  // ─── sector_eris_margin — Cam 3 ────────────────────────────────────────────────
  waymark('sector_eris_margin', 'station_eris_margin', 'eris_fence',
    'Margin Line — waymarks along the fence approach',
    -420, -20, { placeId: CHUNK, dx: -40, dz: 40, rot: 1.8, radius: 40 },
    [
      [PIN, 0, 0, 0.0, 6], [BUOY, -360, -20, 0.2, 8], [PIN, -720, -40, 0.4, 6],
      [BUOY, -1080, -60, 0.1, 8], [SIGNAL, -1440, -80, 0.7, 8],
    ],
    'The fence pinned its own approach — anything off the line answers to the pickets.'),
  battle('sector_eris_margin', 'station_eris_margin', 'eris_drop',
    'Drop Scar — the convoy that dropped into the margin',
    1420, -860,
    { placeId: WRECK_LINER_DRUM, dx: 0, dz: 0, rot: 3.5, radius: 68, mass: 240 },
    { placeId: WRECK_LINER_BOW, dx: 200, dz: -160, rot: 1.1, radius: 52 },
    [
      [DEB_BELT, -120, 80, 0.4, 16], [FRAG_RIB, -30, 130, 2.0, 10], [DEB_RING, 80, 140, 1.5, 12],
      [FRAG_GRATING, 180, 60, 0.9, 6], [WRECK_ENGINE, -90, -150, 3.8, 14], [PMAST, 60, -130, 0.0, 6],
    ],
    'A convoy dropped into the margin and the margin took it piece by piece.'),

  // ─── sector_phoebe_echo — Cam 3 ────────────────────────────────────────────────
  waymark('sector_phoebe_echo', 'station_phoebe_echo', 'phoebe_shrine',
    'Shrine Lights — waymarks down the echo',
    -360, -280, { placeId: SEAMED, dx: 40, dz: 30, rot: 0.6, radius: 14 },
    [
      [PIN, 0, 0, 0.2, 6], [BUOY, -320, -260, 0.4, 8], [PIN, -640, -520, 0.1, 6],
      [BUOY, -960, -780, 0.3, 8], [SIGNAL, -1280, -1040, 0.8, 8],
    ],
    'The shrine-keepers pinned lights toward Haumea — the echo does the rest.'),
  battle('sector_phoebe_echo', 'station_phoebe_echo', 'phoebe_grave',
    'Echo Grave — the fight the shrine prays over',
    -680, 1560,
    { placeId: WRECK_CORVETTE, dx: 0, dz: 0, rot: 4.4, radius: 34, mass: 160 },
    { placeId: HULK, dx: -200, dz: 140, rot: 2.0, radius: 90 },
    [
      [DEB_RING, -100, -60, 0.7, 12], [FRAG_PLATE, -20, -110, 1.8, 6], [DEB_BELT, 70, -120, 0.2, 16],
      [FRAG_PIPE, 160, -50, 2.8, 8], [FRAG_STRUT, 220, 30, 1.0, 5],
    ],
    'The shrine keeps a count of these hulls; the count only goes up.'),

  // ─── sector_nereid_shoal — Cam 3 ───────────────────────────────────────────────
  waymark('sector_nereid_shoal', 'station_nereid', 'nereid_shoals',
    'Shoal Line — waymarks through the rocks',
    -400, 200, { placeId: SEAMED, dx: 50, dz: -40, rot: 3.0, radius: 14 },
    [
      [PIN, 0, 0, 0.1, 6], [BUOY, -340, 180, 0.3, 8], [PIN, -680, 360, 0.2, 6],
      [BUOY, -1020, 540, 0.5, 8], [GATE, -1360, 720, 0.9, 30],
    ],
    'The shoals eat hulls off the pinned line — the buoys are the map.'),
  battle('sector_nereid_shoal', 'station_nereid', 'nereid_scar',
    'Shoal Scar — the ambush line the rocks covered',
    -660, 780,
    { placeId: WRECK_FREIGHTER, dx: 0, dz: 0, rot: 2.2, radius: 40, mass: 200 },
    { placeId: WRECK_COCKPIT, dx: 160, dz: 160, rot: 0.8, radius: 26 },
    [
      [DEB_BELT, -110, 60, 1.6, 16], [FRAG_GRATING, -30, 110, 0.4, 6], [FRAG_PLATE, 60, 130, 2.6, 6],
      [DEB_RING, 150, 70, 1.1, 12], [PMAST, -50, -120, 0.0, 6],
    ],
    'An ambush the shoals still cover — the rocks learned the trick.'),

  // ─── sector_proteus_well — Cam 3 ───────────────────────────────────────────────
  waymark('sector_proteus_well', 'station_proteus', 'proteus_drop',
    'Well Drop — waymarks down to the south gate',
    240, 500, { placeId: CHUNK, dx: -40, dz: -40, rot: 1.4, radius: 40 },
    [
      [PIN, 0, 0, 0.0, 6], [BUOY, 220, 460, 0.2, 8], [PIN, 440, 920, 0.4, 6],
      [BUOY, 660, 1380, 0.1, 8], [SIGNAL, 880, 1840, 0.7, 8],
    ],
    'The den pins the drop so the haulers fall the right way.'),
  battle('sector_proteus_well', 'station_proteus', 'proteus_teeth',
    'Well Teeth — the fight at the seam mouth',
    840, -720,
    { placeId: WRECK_CORVETTE, dx: 0, dz: 0, rot: 1.3, radius: 34, mass: 160 },
    { placeId: WRECK_FREIGHTER_DERELICT, dx: -180, dz: -150, rot: 4.0, radius: 40 },
    [
      [DEB_RING, -90, 70, 0.5, 12], [FRAG_RIB, -10, 120, 2.3, 10], [FRAG_STRUT, 80, 140, 0.8, 5],
      [DEB_BELT, 170, 60, 3.0, 16],
    ],
    'The seam mouth has teeth — hulls stacked where the lanes pinch.'),

  // ─── sector_triton_wake — Cam 3 ────────────────────────────────────────────────
  waymark('sector_triton_wake', 'station_triton', 'triton_glow',
    'Glow Line — waymarks along the radiation edge',
    -220, 460, { placeId: SEAMED, dx: 40, dz: -30, rot: 2.1, radius: 14 },
    [
      [PIN, 0, 0, 0.1, 6], [BUOY, -200, 440, 0.3, 8], [PIN, -400, 880, 0.2, 6],
      [BUOY, -600, 1320, 0.4, 8], [SIGNAL, -800, 1760, 0.8, 8],
    ],
    'Pinned along the safe side of the glow — the lab charts the rest.'),
  battle('sector_triton_wake', 'station_triton', 'triton_scar',
    'Wake Scar — what the wake dragged in',
    -680, 1380,
    { placeId: WRECK_FREIGHTER, dx: 0, dz: 0, rot: 0.4, radius: 40, mass: 200 },
    { placeId: HULK, dx: 180, dz: 170, rot: 3.2, radius: 90 },
    [
      [DEB_BELT, -100, -70, 0.9, 16], [FRAG_CABLE, -20, -120, 1.5, 6], [DEB_RING, 60, -130, 2.1, 12],
      [FRAG_GRATING, 150, -60, 0.3, 6], [FRAG_STRUT, 220, 20, 4.2, 5],
    ],
    'The wake dragged a whole fight in and left it parked against the anomaly.'),

  // ─── sector_eunomia_gulf — Cam 3 ───────────────────────────────────────────────
  waymark('sector_eunomia_gulf', 'station_eunomia', 'eunomia_gate',
    'Gulf Line — waymarks out the west gate',
    -480, 120, { placeId: SEAMED, dx: 50, dz: 40, rot: 4.0, radius: 14 },
    [
      [PIN, 0, 0, 0.0, 6], [BUOY, -440, 120, 0.2, 8], [PIN, -880, 240, 0.4, 6],
      [BUOY, -1320, 360, 0.1, 8], [GATE, -1760, 480, 1.2, 30],
    ],
    'The fence marks its own run — past the buoys the gulf answers to itself.'),
  battle('sector_eunomia_gulf', 'station_eunomia', 'eunomia_scar',
    'Gulf Scar — the salvage war line',
    -540, -180,
    { placeId: WRECK_FREIGHTER_DERELICT, dx: 0, dz: 0, rot: 5.0, radius: 40, mass: 180 },
    { placeId: WRECK_LINER_BOW, dx: -160, dz: -170, rot: 1.7, radius: 52 },
    [
      [DEB_RING, -90, 60, 1.0, 12], [FRAG_PIPE, -10, 110, 0.6, 8], [DEB_BELT, 80, 120, 2.5, 16],
      [FRAG_PLATE, 170, 60, 1.4, 6], [WRECK_TURRET, -60, -140, 3.6, 14],
    ],
    'Two crews claimed the same wreck and made three more.'),

  // ─── sector_sedna_dark — Cam 2 ─────────────────────────────────────────────────
  waymark('sector_sedna_dark', 'station_sedna', 'sedna_dark',
    'Dark Line — waymarks out to the east gate',
    460, -180, { placeId: CHUNK, dx: -50, dz: 40, rot: 0.3, radius: 40 },
    [
      [PIN, 0, 0, 0.0, 6], [BUOY, 420, -160, 0.2, 8], [PIN, 840, -320, 0.4, 6],
      [BUOY, 1260, -480, 0.1, 8], [SIGNAL, 1680, -640, 0.7, 8],
    ],
    'Lights through the dark — the survey crews mark the only line home.'),
  battle('sector_sedna_dark', 'station_sedna', 'sedna_teeth',
    'Dark Teeth — hulls nobody reported',
    -320, -820,
    { placeId: WRECK_CORVETTE, dx: 0, dz: 0, rot: 2.8, radius: 34, mass: 160 },
    { placeId: WRECK_LINER_DRUM, dx: -190, dz: 130, rot: 0.9, radius: 68 },
    [
      [DEB_BELT, -110, -60, 0.5, 16], [FRAG_RIB, -30, -120, 1.9, 10], [FRAG_STRUT, 60, -150, 0.2, 5],
      [DEB_RING, 150, -80, 3.3, 12], [PMAST, -60, 120, 0.0, 6],
    ],
    'No report, no tally — just hulls in a row out where the light gives up.'),

  // ─── sector_dione_lane — Cam 3 ─────────────────────────────────────────────────
  waymark('sector_dione_lane', 'station_dione', 'dione_customs',
    'Customs Run — waymarks down the inspected lane',
    -380, 240, { placeId: SEAMED, dx: 40, dz: -40, rot: 1.2, radius: 14 },
    [
      [PIN, 0, 0, 0.1, 6], [BUOY, -340, 220, 0.3, 8], [PIN, -680, 440, 0.2, 6],
      [BUOY, -1020, 660, 0.5, 8], [GATE, -1360, 880, 1.0, 30],
    ],
    'The customs line — buoys out to the checkpoint so nobody claims the lane by accident.'),
  battle('sector_dione_lane', 'station_dione', 'dione_scar',
    'Lane Scar — the inspection that went loud',
    -720, -780,
    { placeId: WRECK_CORVETTE, dx: 0, dz: 0, rot: 0.9, radius: 34, mass: 160 },
    { placeId: WRECK_COCKPIT, dx: 170, dz: -160, rot: 3.9, radius: 26 },
    [
      [DEB_BELT, -100, 70, 0.8, 16], [FRAG_GRATING, -20, 120, 2.2, 6], [DEB_RING, 70, 140, 0.4, 12],
      [FRAG_PIPE, 160, 80, 1.7, 8], [IBOUOY, -40, -120, 0.0, 8], [IBOUOY, 80, -100, 0.0, 8],
    ],
    'An inspection that escalated — the buoys mark where the lane stopped being polite.'),
]);

