// Unit test: station archetype IDs resolve through the render wiring contract.
import { SECTORS } from '../src/data/sectors.js';
import { STATION_ARCHETYPE_PLACE_IDS, resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldSrc = readFileSync(resolve(ROOT, 'src/systems/world.js'), 'utf8');

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

if (failures) {
  console.error(`station-archetype-wiring.test: ${failures} failures`);
  process.exit(1);
}
console.log('station-archetype-wiring.test: ok');
process.exit(0);