import { FRONTIER_ANCHORS } from './frontierRegions/index.js';

// Rules cross the surveyed gate-to-berth approach, outside the port's safe mouth.
const rows = [
  ['sector_nyx_march', 'nyx_crosswind', 'The Hush Fence', 'A crosswind sweeps the fence. Cross on the quiet beat.', 'sheet', 760, 220, 0.5, 0],
  ['sector_kepler_scar', 'kepler_scissor', 'The Scar Scissors', 'The scar pushes outward. Fly the lee behind the breaking plate.', 'cone', 940, 250, 0, 5],
  ['sector_orcus_shadow', 'orcus_draw', 'The Shadow Draw', 'The dark intake draws you back. Approach across its mouth.', 'cone', 820, 290, 1, 10],
  ['sector_rhea_cinder', 'rhea_ashwall', 'The Ash Wall', 'The ash wall shoves broadside. Wait for the vent to close.', 'sheet', 900, 180, 0.5, 15],
  ['sector_phoebe_echo', 'phoebe_echo_return', 'The Echo Return', 'The echo throws you back toward the plate. Go around its narrow throat.', 'cone', 1050, 200, 1, 20],
  ['sector_nereid_shoal', 'nereid_squeeze', 'The Shoal Squeeze', 'The shoal closes across the approach. The outer channel stays open.', 'sheet', 650, 310, 0.5, 25],
  ['sector_proteus_well', 'proteus_funnel', 'The Funnel Lip', 'The funnel pulls down the approach. Skirt the lip before turning in.', 'cone', 1120, 350, 1, 3],
  ['sector_triton_wake', 'triton_wake_shear', 'The Wake Shear', 'The wake cuts diagonally across your line. Cross against the shallow edge.', 'sheet', 820, 270, 0.25, 8],
  ['sector_eunomia_gulf', 'eunomia_recoil', 'The Gulf Recoil', 'The gulf spits loose mass down the channel. Stay behind its anvil.', 'cone', 980, 230, 0, 13],
  ['sector_sedna_dark', 'sedna_dark_hammer', 'The Dark Hammer', 'The dark hammer strikes across the survey approach. Time its pause.', 'sheet', 1180, 190, 0.5, 18],
];

export const SECTOR_PHYSICAL_LAW_SPECS = Object.freeze(rows.map(([sectorId, id, name, rule, kind, strength, radius, turn, phaseOffsetS]) => {
  const anchors = FRONTIER_ANCHORS[sectorId];
  const station = anchors.stations[0].pos, gate = anchors.gates[0].pos;
  const dx = gate.x - station.x, dz = gate.z - station.z, length = Math.hypot(dx, dz);
  const distance = Math.min(950, length * 0.6);
  return Object.freeze({ id, sectorId, rule,
    localPos: Object.freeze({ x: station.x + dx / length * distance, z: station.z + dz / length * distance }),
    rot: Math.atan2(dz, dx) + turn * Math.PI,
    hazardType: 'debris_current', placeId: kind === 'sheet' ? 'place_maintenance_gantry' : 'place_crusher_module',
    phaseOffsetS, hazardRadius: radius + 40,
    mouth: Object.freeze({ name, radius: 44 }),
    anvil: Object.freeze({ radius: 28, mass: 16000, along: radius * 0.7, across: radius * 0.55 }),
    fields: Object.freeze([{ idSuffix: 'law', kind, strength, radius, halfWidth: radius * 0.62,
      halfAngleRad: 0.55, edgeSoftRad: 0.12, falloff: 1.1, along: 0, across: 0, dirAlong: 1 }]),
  });
}));

export const SECTOR_PHYSICAL_LAW_BY_ID = Object.freeze(Object.fromEntries(SECTOR_PHYSICAL_LAW_SPECS.map(spec => [spec.sectorId, spec])));
