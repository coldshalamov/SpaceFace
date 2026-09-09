#!/usr/bin/env node
// Wire city/landmark/NPC concept index entries to rendered place_* IDs from sector anchors.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = resolve(ROOT, 'assets/concept/index.json');

const CITY_WIRING = {
  concept_helios_city: { blender_part_id: 'place_station_trade_hub', sector_placement_id: 'station_helios' },
  concept_ceres_city: { blender_part_id: 'place_station_refinery', sector_placement_id: 'station_ceres' },
  concept_tethys_city: { blender_part_id: 'place_station_trade_hub', sector_placement_id: 'station_tethys' },
  concept_vesta_city: { blender_part_id: 'place_station_fab', sector_placement_id: 'station_forge' },
  concept_pallas_city: { blender_part_id: 'place_station_blackmarket', sector_placement_id: 'station_smuggler' },
  concept_io_city: { blender_part_id: 'place_station_trade_hub', sector_placement_id: 'station_reach' },
  concept_charon_city: { blender_part_id: 'place_station_refinery', sector_placement_id: 'station_expanse' },
  concept_sker_city: { blender_part_id: 'place_station_blackmarket', sector_placement_id: 'station_sker' },
  concept_veil_city: { blender_part_id: 'place_station_research', sector_placement_id: 'station_veil' },
  concept_ashfall_city: { blender_part_id: 'place_station_blackmarket', sector_placement_id: 'station_ashcache' },
};

const LANDMARK_WIRING = {
  concept_landmark_tethys: { blender_part_id: 'place_nav_buoy', sector_placement_id: 'poi_blackmkt' },
  concept_landmark_vesta: { blender_part_id: 'place_dead_hulk', sector_placement_id: 'poi_freighter' },
  concept_landmark_pallas: { blender_part_id: 'place_dead_hulk', sector_placement_id: 'poi_pwreck' },
  concept_landmark_io: { blender_part_id: 'place_dead_hulk', sector_placement_id: 'poi_cruiser' },
  concept_landmark_charon: { blender_part_id: 'place_conveyor_barge', sector_placement_id: 'poi_colony' },
  concept_landmark_sker: { blender_part_id: 'place_dead_hulk', sector_placement_id: 'poi_bounty' },
  concept_landmark_veil: { blender_part_id: 'place_asteroid_seamed', sector_placement_id: 'poi_anomaly' },
  concept_landmark_ashfall: { blender_part_id: 'place_nav_buoy', sector_placement_id: 'poi_boss' },
};

const NPC_WIRING = {
  concept_npc_dock_worker: { sector_placement_id: 'station_helios' },
  concept_npc_belt_foreman: { sector_placement_id: 'station_ceres' },
  concept_npc_fringe_smuggler: { sector_placement_id: 'station_smuggler' },
};

const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
let wired = 0;
for (const entry of idx.entries) {
  const patch = CITY_WIRING[entry.concept_id]
    || LANDMARK_WIRING[entry.concept_id]
    || NPC_WIRING[entry.concept_id];
  if (!patch) continue;
  Object.assign(entry, patch);
  if (CITY_WIRING[entry.concept_id]) {
    entry.renderable_tier = 'concept_only';
    entry.renderable_proxy_note = 'city silhouette refs proxy to station archetype GLB until dedicated city mesh ships';
  }
  wired++;
}
writeFileSync(INDEX, `${JSON.stringify(idx, null, 2)}\n`);
console.log(`wired ${wired} concept entries to renderable place IDs`);