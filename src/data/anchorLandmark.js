// PR95 Plan 25 — The Anchor landmark contract.
//
// The existing Orcus Gravity Eddy owns all force behavior. This record only binds a physical
// station/market and one meaningful upstream rumor to that canonical field identity.

import { ORCUS_GRAVITY_EDDY } from './anomalySites.js';

export const ORCUS_ANCHOR = Object.freeze({
  stationId: 'station_orcus_anchor',
  name: 'The Anchor',
  sectorId: ORCUS_GRAVITY_EDDY.sectorId,
  signalPoiId: ORCUS_GRAVITY_EDDY.poiId,
  zoneId: ORCUS_GRAVITY_EDDY.zoneId,
  fieldId: ORCUS_GRAVITY_EDDY.field.id,
  fixedLocalPos: Object.freeze({ x: 0, z: 0 }),
  stationType: 'blackmarket',
  factionId: 'faction_vael',
  services: Object.freeze(['black_market', 'trade', 'repair', 'refuel', 'missions']),
  sourceStationId: 'station_kepler_scar',
  sourceSectorId: 'sector_kepler_scar',
  rumorId: 'frontier-rumor:station_kepler_scar:the-anchor',
  rumorText: 'Past the Scar, one station refuses to fall into the Orcus well. Everything else curls around it. The fence is inside the ring.',
});
