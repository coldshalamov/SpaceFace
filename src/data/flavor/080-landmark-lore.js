import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 80;
export const flavorId = 'landmark_lore';
export const flavorKind = 'scan_lore';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Four scan fragments for each of the nineteen physical C-landmark targets.',
  entries: [
    {
      id: 'wreck_cathedral', programSlot: 'C1', targetRef: 'landmark_c1_wreck_cathedral_concord_vigilant',
      displayName: 'The Wreck Cathedral', location: { sectorId: 'sector_io_reach', zoneId: 'zone_io_derelict' },
      identity: { vesselName: 'Concord Vigilant', disambiguatesFrom: 'wreck_isc_vigilant' },
      lines: [
        { id: 'c1_01', text: 'Concord Vigilant held the lane nine hours. Civilians jumped behind her.' },
        { id: 'c1_02', text: 'The hull broke aft of the bridge. The Marker survived.' },
        { id: 'c1_03', text: 'Concord claims the bow. Frontier claims the stern.' },
        { id: 'c1_04', text: 'Neither tows it. Scavengers nest inside the engine bells.' },
        { id: 'c1_05', text: 'Vigilant\u2019s nine-hour hold is a Concord training case. The civilians are a footnote in the same case file.' },
      ],
    },
    {
      id: 'resonance_obelisk', programSlot: 'C2', targetRef: 'landmark_c2_resonance_obelisk',
      displayName: 'The Resonance Obelisk',
      location: { sectorId: 'sector_veil_nebula', zoneId: 'zone_veil_anomaly', poiId: 'poi_anomaly' },
      lines: [
        { id: 'c2_01', text: 'Material analysis returns nothing recognized as matter.' },
        { id: 'c2_02', text: 'Pulse interval is shorter than your previous scan record.' },
        { id: 'c2_03', text: 'Vael patrol logs tighten after every recorded pulse increase.' },
        { id: 'c2_04', text: 'The dark companion is a door that forgot its other side.' },
      ],
    },
    {
      id: 'candle_fleet', programSlot: 'C3', targetRef: 'landmark_c3_candle_fleet',
      displayName: 'The Candle Fleet', location: { sectorId: 'sector_helios_prime', zoneId: 'zone_helios_memorial' },
      lines: [
        { id: 'c3_01', text: "Twenty-four flames burn. The recovered hull's plinth stays dark." },
        { id: 'c3_02', text: 'Families paid for the candles. Concord pays only for flame.' },
        { id: 'c3_03', text: "Every damaged candle returns. Concord's incident ledger gains a line." },
        { id: 'c3_04', text: "Black-box telemetry smears once along the convoy's final course." },
        { id: 'c3_05', text: 'The plinth was dark before the convoy sailed. Someone filed it lit anyway.' },
      ],
    },
    {
      id: 'vault_maw', programSlot: 'C4', targetRef: 'landmark_c4_vault_maw',
      displayName: 'The Vault Maw', location: { sectorId: 'sector_ashfall_reach', zoneId: 'zone_ashfall_vault', poiId: 'poi_vault_maw' },
      lines: [
        { id: 'c4_01', text: 'Six stone petals meet like a jaw around sealed records.' },
        { id: 'c4_02', text: 'Thousands of keyholes cover the teeth. One is real.' },
        { id: 'c4_03', text: 'Wrong keys wake the guard before they fit.' },
        { id: 'c4_04', text: 'One seam answers a filing code absent from every public ledger.' },
      ],
    },
    {
      id: 'iron_maw', programSlot: 'C5', targetRef: 'landmark_c5_iron_maw',
      displayName: 'The Iron Maw', location: { sectorId: 'sector_ashfall_reach', zoneId: 'zone_ashfall_approach' },
      lines: [
        { id: 'c5_01', text: 'The Iron Maw was grown as a Deep-Mother. It turned.' },
        { id: 'c5_02', text: 'Seven capital colors scar the ram-bow. Every color has provenance.' },
        { id: 'c5_03', text: 'The dorsal gap is a toll lane, not a mercy.' },
        { id: 'c5_04', text: 'Three lance shots. Three precursor constructs went dark.' },
        { id: 'c5_05', text: 'The Maw keeps the toll lane lit. A MTS lease renews the fuel every cycle under REF 44-C.' },
      ],
    },
    {
      id: 'caved_shaft', programSlot: 'C6', targetRef: 'landmark_c6_caved_shaft',
      displayName: 'The Caved Shaft', location: { sectorId: 'sector_hyperion_cut', poiId: 'poi_hyperion_driller' },
      lines: [
        { id: 'c6_01', text: 'The drill mast fell inward. The asteroid was hollow.' },
        { id: 'c6_02', text: 'Every ordinary probe returns without telemetry.' },
        { id: 'c6_03', text: 'The snapped auger struck something harder than drill-steel.' },
        { id: 'c6_04', text: 'One special probe returned a single image. No telemetry followed.' },
      ],
    },
    {
      id: 'lung_of_charon', programSlot: 'C7', targetRef: 'landmark_c7_lung_of_charon',
      displayName: 'The Lung-of-Charon',
      location: { sectorId: 'sector_charon_expanse', zoneId: 'zone_charon_colony', poiId: 'poi_charon_tether_wreck' },
      lines: [
        { id: 'c7_01', text: "Birth records begin three generations after the barge's scheduled arrival." },
        { id: 'c7_02', text: 'Destination field: GARDEN WORLD. Navigation answer: NO MATCH.' },
        { id: 'c7_03', text: 'Air, medicine, and seeds buy more here than pride.' },
        { id: 'c7_04', text: 'A snapped tether can turn a home into a distress signal.' },
      ],
    },
    {
      id: 'flight_deck', programSlot: 'C8', targetRef: 'landmark_c8_flight_deck',
      displayName: 'The Flight Deck', location: { sectorId: 'sector_kepler_scar', poiId: 'poi_kepler_hulk' },
      lines: [
        { id: 'c8_01', text: 'The carrier Void-Reach died upside-down. Its market did not.' },
        { id: 'c8_02', text: 'Launch rails hang above the stalls. Tall pilots duck.' },
        { id: 'c8_03', text: 'Reach neon spells: we killed this, now we live in it.' },
        { id: 'c8_04', text: 'Carrier-grade surplus moves beneath the deck that once launched it.' },
      ],
    },
    {
      id: 'shard_sphere', programSlot: 'C9', targetRef: 'landmark_c9_shard_sphere',
      displayName: 'The Shard Sphere', location: { sectorId: 'sector_phoebe_echo', stationId: 'station_phoebe_echo' },
      lines: [
        { id: 'c9_01', text: 'Sixty shards hold a perfect sphere without visible force.' },
        { id: 'c9_02', text: 'Each shard remembers one note of the Vael schism.' },
        { id: 'c9_03', text: 'Together they replay a song nobody finished.' },
        { id: 'c9_04', text: 'Hostility turns the instrument into a storm.' },
      ],
    },
    {
      id: 'funnel', programSlot: 'C10', targetRef: 'landmark_c10_funnel',
      displayName: 'The Funnel', location: { sectorId: 'sector_proteus_well', poiId: 'poi_proteus_hulk' },
      lines: [
        { id: 'c10_01', text: 'The freighter was cut into a throat on purpose.' },
        { id: 'c10_02', text: 'Large hulls enter one-way. Quiet craft leave single-file.' },
        { id: 'c10_03', text: 'Violet strips mark the safe path and the ambush path.' },
        { id: 'c10_04', text: 'Something valuable sleeps beneath debris ordinary scanners call floor.' },
      ],
    },
    {
      id: 'ringworld_arc', programSlot: 'C11', targetRef: 'landmark_c11_ringworld_arc',
      displayName: 'The Ringworld Arc', location: { sectorId: 'sector_sedna_dark', poiId: 'poi_sedna_ringworld' },
      lines: [
        { id: 'c11_01', text: 'The ring survives. Its star does not.' },
        { id: 'c11_02', text: 'Dead rivers cross the inner face beneath cycling city lights.' },
        { id: 'c11_03', text: 'Those batteries should have failed before human history.' },
        { id: 'c11_04', text: 'The city grid spells something no translator will commit to.' },
      ],
    },
    {
      id: 'metronome', programSlot: 'C12', targetRef: 'landmark_c12_metronome',
      displayName: 'The Metronome', location: { sectorId: 'sector_eris_margin', poiId: 'poi_eris_metronome' },
      lines: [
        { id: 'c12_01', text: 'The beam crosses the galactic plane every eight seconds.' },
        { id: 'c12_02', text: 'Navigators call it a lighthouse. The radiation disagrees.' },
        { id: 'c12_03', text: 'Quiet schedules use Metronome-rotations instead of local time.' },
        { id: 'c12_04', text: "Quiet crossing logs cluster precisely between the beam's returns." },
      ],
    },
    {
      id: 'concord_citadel', programSlot: 'C13a', targetRef: 'landmark_c13a_concord_citadel',
      displayName: 'Concord Citadel', location: { sectorId: 'sector_helios_prime', zoneId: 'zone_helios_core', stationId: 'station_coalition' },
      lines: [
        { id: 'c13a_01', text: 'Four lance turrets remained live through forty years of peace.' },
        { id: 'c13a_02', text: "The gold sun is core space's largest authorized hologram." },
        { id: 'c13a_03', text: 'Original registry still reads STATION COALITION beneath the armor.' },
        { id: 'c13a_04', text: 'Order begins here, with every broadside already loaded.' },
      ],
    },
    {
      id: 'meridian_exchange_spire', programSlot: 'C13b', targetRef: 'landmark_c13b_meridian_exchange_spire',
      displayName: 'Meridian Exchange Spire', location: { sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_hub' },
      lines: [
        { id: 'c13b_01', text: 'Twelve platforms honor the founding houses. Three stay dark.' },
        { id: 'c13b_02', text: 'Meridian records list all twelve as continuously represented.' },
        { id: 'c13b_03', text: 'Board access opens doors the public manifest omits.' },
        { id: 'c13b_04', text: 'Every price in Tethys looks upward toward this spire.' },
      ],
    },
    {
      id: 'drift_crucible', programSlot: 'C13c', targetRef: 'landmark_c13c_drift_crucible',
      displayName: 'Drift Crucible', location: { sectorId: 'sector_ceres_belt', zoneId: 'zone_ceres_refinery' },
      lines: [
        { id: 'c13c_01', text: 'The Crucible has run eighty years without shutdown.' },
        { id: 'c13c_02', text: 'Ore-haulers feed it while shift crews change beneath them.' },
        { id: 'c13c_03', text: "Founders' names are welded where the molten load can see them." },
        { id: 'c13c_04', text: "Half the sector's economy leaves this cage as metal." },
      ],
    },
    {
      id: 'skerris_throne', programSlot: 'C13d', targetRef: 'landmark_c13d_skerris_throne',
      displayName: 'Skerris Throne', location: { sectorId: 'sector_sker_haven', zoneId: 'zone_sker_haven' },
      lines: [
        { id: 'c13d_01', text: "Every wall was once somebody else's hull." },
        { id: 'c13d_02', text: 'Each trophy answers to a raid story, if scanned.' },
        { id: 'c13d_03', text: 'The skull grows larger after every successful Reach raid.' },
        { id: 'c13d_04', text: 'No architect designed the Throne. Survivors kept welding.' },
      ],
    },
    {
      id: 'resonant_cathedral', programSlot: 'C13e', targetRef: 'landmark_c13e_resonant_cathedral',
      displayName: 'Resonant Cathedral', location: { sectorId: 'sector_vesta_forge', zoneId: 'zone_vesta_forge' },
      lines: [
        { id: 'c13e_01', text: 'Old foundry notices forbid Choir assembly beneath the present arch.' },
        { id: 'c13e_02', text: 'Twin magenta spires tune themselves to the old shift rhythm.' },
        { id: 'c13e_03', text: 'The resonance arch turns industrial noise into liturgy.' },
        { id: 'c13e_04', text: "Shield telemetry falls inside the arch's surviving note." },
      ],
    },
    {
      id: 'quiessence', programSlot: 'C14', targetRef: 'landmark_c14_quiessence',
      displayName: 'The Quiessence', location: { sectorId: 'sector_pallas_drift', zoneId: 'zone_pallas_drift', locationLabel: 'Hollow Station' },
      lines: [
        { id: 'c14_01', text: 'Seventeen freighters remain exactly where their crews stopped.' },
        { id: 'c14_02', text: 'Cargo seals remain intact. Every boarding hatch remains closed.' },
        { id: 'c14_03', text: 'The Quiet preserve the formation, not the explanation.' },
        { id: 'c14_04', text: 'The violet buoy repeats one statement: they are not dead.' },
        { id: 'c14_05', text: 'Seventeen transponders answer. Seventeen life-support returns are still under appeal.' },
      ],
    },
    {
      id: 'tide_locked_watcher', programSlot: 'C15', targetRef: 'landmark_c15_tide_locked_watcher',
      displayName: 'The Tide-Locked Watcher', location: { sectorId: 'sector_triton_wake', poiId: 'poi_triton_watcher' },
      lines: [
        { id: 'c15_01', text: 'The carved eye has watched empty space for eighty million years.' },
        { id: 'c15_02', text: 'Stellar drift says a star once occupied its gaze.' },
        { id: 'c15_03', text: 'Enter the sightline. Your scanners dim; one note sounds.' },
        { id: 'c15_04', text: 'A second silent vigil changed the warning into a greeting.' },
      ],
    },
  ],
});
