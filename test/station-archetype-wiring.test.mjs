// Unit test: station archetype IDs resolve through the render wiring contract.
import { SECTORS } from '../src/data/sectors.js';
import { STATION_ARCHETYPE_PLACE_IDS, buildAuthoredStationArchetype, resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldSrc = readFileSync(resolve(ROOT, 'src/systems/world.js'), 'utf8');
const visualFactorySrc = readFileSync(resolve(ROOT, 'src/render/visualFactory.js'), 'utf8');

let failures = 0;
for (const sector of SECTORS) {
  for (const st of sector.stations || []) {
    if (!st.archetypeGlb) {
      console.error(`missing archetypeGlb: ${sector.id}/${st.id}`);
      failures++;
      continue;
    }
    if (!STATION_ARCHETYPE_PLACE_IDS.includes(st.archetypeGlb)) {
      console.error(`archetype not whitelisted: ${st.archetypeGlb}`);
      failures++;
    }
    const ent = {
      type: 'station', radius: 72, data: { archetypeGlb: st.archetypeGlb },
    };
    if (!resolvePlaceFileForEntity(ent)) {
      console.error(`resolvePlaceFile failed: ${st.archetypeGlb}`);
      failures++;
    }
  }
}

if (!worldSrc.includes('archetypeGlb: st.archetypeGlb')) {
  console.error('world.js does not forward archetypeGlb on station spawn');
  failures++;
}
if (!worldSrc.includes('landmarkGlb: poi.landmarkGlb')) {
  console.error('world.js does not forward landmarkGlb on POI spawn');
  failures++;
}
if (!worldSrc.includes('radius: collisionRadius') || !worldSrc.includes('placeScale: dockRadius / 14')) {
  console.error('world.js must keep station collision radius smaller than dock/visual scale');
  failures++;
}
if (/stat:(?:haze|chromeshell|grimeshell)/.test(visualFactorySrc)) {
  console.error('visualFactory station profile must not add global bubble shell meshes');
  failures++;
}

{
  const station = buildAuthoredStationArchetype({
    id: 'station_visual_contract',
    type: 'station',
    radius: 34,
    pos: { x: 0, z: 0 },
    data: { archetypeGlb: 'place_station_military', dockRadius: 72, placeScale: 72 / 14 },
  }, { releaseMode: true });
  station.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(station).getSize(new THREE.Vector3());
  if (size.x < 100 || size.z < 100) {
    console.error(`station fallback must size from dock/visual radius, not collision radius; got ${size.x.toFixed(1)} x ${size.z.toFixed(1)}`);
    failures++;
  }
}

if (failures) {
  console.error(`station-archetype-wiring.test: ${failures} failures`);
  process.exit(1);
}
console.log('station-archetype-wiring.test: ok');
process.exit(0);
