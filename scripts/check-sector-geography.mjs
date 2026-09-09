#!/usr/bin/env node
// Validates fixed authored geography for all sectors — stations, gates, fields, POIs.
import { SECTORS } from '../src/data/sectors.js';

let ok = 0;
let fail = 0;

function check(label, cond, detail = '') {
  if (cond) { ok++; }
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

function hasPos(obj) {
  return obj && Number.isFinite(obj.pos?.x) && Number.isFinite(obj.pos?.z);
}
function hasCenter(obj) {
  return obj && Number.isFinite(obj.center?.x) && Number.isFinite(obj.center?.z)
    && Number.isFinite(obj.clusterRadius) && obj.clusterRadius > 0;
}

for (const sector of SECTORS) {
  const label = sector.id;
  check(`${label}: has stations array`, Array.isArray(sector.stations) && sector.stations.length > 0);
  for (const st of sector.stations || []) {
    check(`${label}/${st.id}: station pos`, hasPos(st), JSON.stringify(st.pos));
  }
  check(`${label}: has authored gates`, Array.isArray(sector.gates) && sector.gates.length > 0,
    `count=${sector.gates?.length}`);
  for (const g of sector.gates || []) {
    check(`${label}/gate→${g.to}: gate pos`, hasPos(g), JSON.stringify(g.pos));
  }
  for (const f of sector.fields || []) {
    check(`${label}/${f.id}: field center`, hasCenter(f), JSON.stringify(f));
  }
  for (const p of sector.pois || []) {
    check(`${label}/${p.id}: poi pos`, hasPos(p), JSON.stringify(p.pos));
  }
}

check('sector count is 24', SECTORS.length === 24, `got ${SECTORS.length}`);

console.log(`\nsector-geography: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
