// One-shot helper: compute deterministic gate bearings and draft station/field/POI anchors.
// Output is pasted into src/data/sectors.js — not imported at runtime.
import { SECTORS } from '../src/data/sectors.js';

const byId = new Map(SECTORS.map((s) => [s.id, s]));

function gatePos(sector, neighborId) {
  const nb = byId.get(neighborId);
  const wr = sector.worldRadius || 4000;
  const dx = (nb?.position?.x ?? 0) - (sector.position?.x ?? 0);
  const dz = (nb?.position?.y ?? 0) - (sector.position?.y ?? 0);
  const ang = Math.atan2(dz, dx);
  const gateR = wr * 0.82;
  return { x: Math.round(Math.cos(ang) * gateR), z: Math.round(Math.sin(ang) * gateR) };
}

const STATION_LAYOUT = {
  sector_helios_prime: [
    { id: 'station_helios', pos: { x: 1280, z: -420 } },
    { id: 'station_coalition', pos: { x: -920, z: 1080 } },
  ],
  sector_ceres_belt: [
    { id: 'station_ceres', pos: { x: -1100, z: 620 } },
    { id: 'station_beltout', pos: { x: 780, z: -940 } },
  ],
  sector_tethys_junction: [
    { id: 'station_tethys', pos: { x: 1050, z: 380 } },
    { id: 'station_customs', pos: { x: -640, z: -1180 } },
  ],
};

const FIELD_LAYOUT = {
  sector_ceres_belt: [
    { id: 'f_ceres_1', center: { x: 420, z: -720 }, clusterRadius: 480 },
    { id: 'f_ceres_2', center: { x: -680, z: 240 }, clusterRadius: 420 },
    { id: 'f_ceres_3', center: { x: 920, z: 860 }, clusterRadius: 380 },
  ],
  sector_tethys_junction: [
    { id: 'f_tethys_1', center: { x: -520, z: 680 }, clusterRadius: 400 },
  ],
  sector_vesta_forge: [
    { id: 'f_vesta_1', center: { x: -540, z: -480 }, clusterRadius: 450 },
    { id: 'f_vesta_2', center: { x: 680, z: 320 }, clusterRadius: 420 },
    { id: 'f_vesta_3', center: { x: 120, z: 980 }, clusterRadius: 360 },
  ],
};

const POI_LAYOUT = {
  sector_helios_prime: [
    { id: 'poi_tutorial', pos: { x: 380, z: -120 } },
    { id: 'poi_memorial', pos: { x: 1680, z: -820 } },
  ],
  sector_ceres_belt: [
    { id: 'poi_driller', pos: { x: 240, z: -1180 } },
    { id: 'poi_survey', pos: { x: -1240, z: -320 } },
  ],
  sector_tethys_junction: [
    { id: 'poi_blackmkt', pos: { x: -1380, z: 420 } },
  ],
};

for (const sector of SECTORS) {
  const gates = (sector.neighbors || []).map((nb) => ({
    to: nb,
    pos: gatePos(sector, nb),
  }));
  console.log(`\n${sector.id}:`);
  console.log('  gates:', JSON.stringify(gates));
  const stations = STATION_LAYOUT[sector.id];
  if (stations) console.log('  stations:', JSON.stringify(stations));
  const fields = FIELD_LAYOUT[sector.id];
  if (fields) console.log('  fields:', JSON.stringify(fields));
  const pois = POI_LAYOUT[sector.id];
  if (pois) console.log('  pois:', JSON.stringify(pois));
}