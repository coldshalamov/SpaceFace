// Unit test: shipped SECTORS export has fixed anchors for all stations/gates/fields/POIs.
import { SECTORS } from '../src/data/sectors.js';

function hasPos(obj) {
  return obj && Number.isFinite(obj.pos?.x) && Number.isFinite(obj.pos?.z);
}
function hasCenter(obj) {
  return obj && Number.isFinite(obj.center?.x) && Number.isFinite(obj.center?.z)
    && Number.isFinite(obj.clusterRadius) && obj.clusterRadius > 0;
}

let failures = 0;
for (const sector of SECTORS) {
  for (const st of sector.stations || []) {
    if (!hasPos(st)) { console.error(`missing station pos: ${sector.id}/${st.id}`); failures++; }
  }
  if (!Array.isArray(sector.gates) || sector.gates.length === 0) {
    console.error(`missing gates: ${sector.id}`); failures++;
  }
  for (const g of sector.gates || []) {
    if (!hasPos(g)) { console.error(`missing gate pos: ${sector.id}/${g.to}`); failures++; }
  }
  for (const f of sector.fields || []) {
    if (!hasCenter(f)) { console.error(`missing field center: ${sector.id}/${f.id}`); failures++; }
  }
  for (const p of sector.pois || []) {
    if (!hasPos(p)) { console.error(`missing poi pos: ${sector.id}/${p.id}`); failures++; }
  }
}

if (failures) {
  console.error(`sector-geography.test: ${failures} failures`);
  process.exit(1);
}
console.log(`sector-geography.test: ok (${SECTORS.length} sectors)`);
process.exit(0);