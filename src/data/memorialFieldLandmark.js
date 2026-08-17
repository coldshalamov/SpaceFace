// Plan 25 — Memorial Field / The Candle Fleet.
//
// The authored POI and modeled twenty-four-lantern array already live in sectors/sectorAnchors.
// This stable descriptor binds that admitted place to one coarse Coalition watch log and the
// existing SurvivorPod custody owner; it owns no runtime state or rescue rewards.

export const MEMORIAL_FIELD = Object.freeze({
  id: 'landmark_memorial_field',
  name: 'Memorial Field — The Candle Fleet',
  sectorId: 'sector_helios_prime',
  poiId: 'poi_memorial',
  landmarkGlb: 'place_memorial_array',
  sourceStationId: 'station_coalition',
  rumorId: 'frontier-rumor:landmark:memorial-field-survivor',
  rumorText: 'Coalition watch logged one living transponder between the dark twenty-fifth plinth and the outer candles. The field stays weapons-quiet: search the lantern ring, take the pod on the Massline, and bring it under lawful station protection.',
  revealRadius: 700,
  arrivalRadius: 150,
  podOffset: Object.freeze({ x: 62, z: -38 }),
  podDrift: Object.freeze({ x: -3, z: 2 }),
  podSource: 'memorial_field_rumor',
  podMarkerId: 'poi_memorial:outer-candle-survivor',
  memoryId: 'survivor:memorial-field:outer-candle',
  scanLabel: 'Candle Fleet Survivor Pod',
});

export default MEMORIAL_FIELD;
