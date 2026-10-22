export const faction = {
  id: 'faction_free', name: 'Free Frontier', short: 'Frontier', color: '#4ECBE0',
  personality: 'independent', startingRep: 40,
  homeSectors: ['sector_io_reach', 'sector_veil_nebula'],
  controls: ['scattered neutral waystations'],
  fleetClass: 'independent',
  relations: { faction_scn: 0.0, faction_mts: 0.2, faction_dmc: 0.35, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_choir: -0.2, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_free"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#4ECBE0', secondary: '#206070', accent: '#A0EEF8',
    hull: '#808090', emissive: '#4ECBE0', thruster: '#60D8EE',
  },
  shipRoles: [
    { role: 'frontier-runner', weight: 0.5, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_mule'] },
    { role: 'homestead-guard', weight: 0.3, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'frontier-heavy', weight: 0.2, hullIds: ['ship_pelican', 'ship_ironback', 'ship_atlas'] },
  ],
  illegalCommodities: [],
  custom: {
    alliesWhoNeedCover: true,
    rallyBehindRockWalls: true,
    homesteadsGrow: true,
    patchworkHullKits: true,
  },
  voiceRegister: 'independent',
};

// ── W-FRONTIER (build_map §34.5 row 532, expansion bible 02 §7) ─────────────────────────
// "Every captain on this board believes they are temporary." Homesteads are quilts of
// mismatched modules you tow in, snap on, and hold the line over. The runtime owner is
// src/systems/faction_frontier.js (manifest id 'frontierHomesteads').

// The six snap-together homestead modules — throwable, towable, each its own job.
export const FRONTIER_MODULES = Object.freeze([
  { id: 'habitat', mass: 120, radius: 18, label: 'Habitat Module' },
  { id: 'tank',    mass: 90,  radius: 14, label: 'Tank Module' },
  { id: 'solar',   mass: 60,  radius: 20, label: 'Solar Module' },
  { id: 'dock',    mass: 150, radius: 22, label: 'Dock Module' },
  { id: 'garden',  mass: 80,  radius: 16, label: 'Garden Module' },
  { id: 'mast',    mass: 40,  radius: 10, label: 'Mast Module' },
]);

// The frame they snap onto.
export const FRONTIER_FRAME = Object.freeze({
  typeId: 'frontier_homestead_frame',
  radius: 60,
  moduleSlots: 6,             // all six before the welders can finish
  snapRange: 130,             // a module inside this of the frame locks to a slot
});

// E-21 Barn Raising: tow six modules to the frame before a tide or a gate closure, snap
// them on, then hold the line while the welders work. FF: a half-built homestead
// survives, damaged. Leaves: a homestead on the chart.
export const FRONTIER_BARN_RAISING = Object.freeze({
  id: 'E-21',
  windowS: 240,               // the tide/gate closure arrives on this clock
  weldTimeS: 12,              // welders need this long with all six snapped
  partialPenaltyHull: 0.45,   // a half-built homestead survives at this hull fraction
  sectors: Object.freeze(['sector_io_reach']),
  startLine: 'Board\'s open. Modules to the frame, and mind the tide.',
  raisedLine: 'Still temporary — but she\'s standing.',
  strandedLine: 'We\'ll owe you. We always owe somebody.',
});

// Signature toy: the Weld Head — it welds the held object wherever it touches. Build a
// wall, armour a station with a rock, stick a container shut.
export const FRONTIER_WELD_HEAD = Object.freeze({
  id: 'head_weld',
  name: 'Weld Head',
  weldTimeS: 2.5,             // the arc needs this long held on the joint
  line: 'It welds the held object where it touches.',
});

// The mark they leave: a raised homestead persists on the chart, gains traffic on a
// steady beat, and asks for supply runs when it has been left stranded.
export const FRONTIER_HOMESTEAD = Object.freeze({
  trafficPeriodS: 60,         // a raised homestead gains a traffic tick on this beat
  strandedAfterS: 300,        // left alone this long, it starts asking for supply runs
  supplyRadius: 200,          // a supply pod inside this of the homestead lands
  chartMark: 'homestead',
});

export const FRONTIER_BARKS = Object.freeze({
  temporary: 'Still temporary.',
  owe: 'We\'ll owe you. We always owe somebody.',
  board: 'Board\'s open.',
  raised: 'Still temporary — but she\'s standing.',
});

export default faction;
