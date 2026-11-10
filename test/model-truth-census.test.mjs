// The committed census is a fresh measurement. A hand edit, or a loader path that
// drifted from the script, fails this test. Screenshots are not the proof.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CENSUS_PATH = resolve(ROOT, 'src/data/modelTruthCensus.json');

const check = spawnSync(process.execPath, ['scripts/model-truth-census.mjs', '--check'], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 30 * 60 * 1000,
});
if (check.status !== 0) {
  console.error(check.stdout);
  console.error(check.stderr);
  console.error('model-truth census does not match a fresh run');
  process.exit(1);
}

const census = JSON.parse(readFileSync(CENSUS_PATH, 'utf8'));
let failures = 0;
function fail(message) {
  failures += 1;
  console.error(message);
}

if (census.schema !== 'spaceface.modelTruthCensus.v1') fail(`schema ${census.schema}`);
if (!Array.isArray(census.rows) || census.rows.length < 20) fail('census has too few rows');

const byId = new Map(census.rows.map((row) => [row.id, row]));
const stations = census.rows.filter((row) => row.family === 'station');
if (stations.length < 7) fail(`expected the authored station families, got ${stations.length}`);
for (const station of stations) {
  const sizes = station.gameplay && station.gameplay.sizes || [];
  const radii = new Set(sizes.map((size) => size.entityRadius));
  const docks = new Set(sizes.map((size) => size.dockRadius));
  for (const radius of [26, 34, 42]) {
    if (!radii.has(radius)) fail(`${station.id} lost gameplay radius ${radius}`);
  }
  for (const dock of [60, 72, 90]) {
    if (!docks.has(dock)) fail(`${station.id} lost dock radius ${dock}`);
  }
  if (!(station.gameplay.entityRadius < station.gameplay.dockRadius)) {
    fail(`${station.id} entity.radius was collapsed onto the visual/dock size`);
  }
  const hoop = station.gameplay.colliderId === 'station_ring_hub'
    || station.gameplay.colliderId === 'helios_trade_hub';
  if (hoop && station.collider && station.collider.overTolerance !== true) {
    fail(`${station.id} still wears the hoop but the census does not show the gap`);
  }
  if (!hoop && station.collider && station.collider.overTolerance === true) {
    fail(`${station.id} skin is outside the flight-plane tolerance`);
  }
  if (station.url && station.url.includes('procedural')) fail(`${station.id} resolved a procedural station`);
}

const gate = byId.get('place_gate_jump_ring');
if (!gate) fail('gate row missing');
else {
  if (gate.collider && gate.collider.throatSealed) fail('gate throat is sealed');
  if (gate.gameplay && gate.gameplay.colliderKind !== 'proxy') fail('gate collider is not a proxy');
  if (gate.gameplay && !String(gate.gameplay.colliderId || '').includes('gate') && !String(gate.gameplay.colliderId || '').startsWith('skin')) {
    fail(`gate proxy changed shape class: ${gate.gameplay.colliderId}`);
  }
}

const gas = byId.get('ast_gas_cloud');
if (!gas) fail('gas cloud row missing');
else if (gas.status !== 'green' || gas.opening !== 'gas-soft') fail('gas cloud is not a soft enterable');

const hitch = byId.get('ship_kestrel');
if (!hitch) fail('Hitch row missing');
else {
  if (hitch.frozenMesh !== true) fail('Hitch is not marked frozen');
  if (!/^[a-f0-9]{64}$/.test(String(hitch.meshHash || ''))) fail('Hitch mesh hash missing');
  if (hitch.gameplay && hitch.gameplay.colliderKind !== 'capsule' && hitch.gameplay.colliderKind !== 'proxy') {
    fail('Hitch has no craft collider record');
  }
}

const redOutsideTaste = census.rows.filter((row) => row.status === 'red' && !row.tasteBudget);
if (process.env.MODEL_TRUTH_REQUIRE_CLEAN === '1' && redOutsideTaste.length) {
  fail(`${redOutsideTaste.length} red census rows remain`);
  for (const row of redOutsideTaste.slice(0, 12)) {
    console.error(`  ${row.id}: ${(row.reasons || []).join(',')}`);
  }
}

if (failures) {
  console.error(`[model-truth] ${failures} invariant failure(s)`);
  process.exit(1);
}
console.log(`[model-truth] census invariants held (${census.rows.length} rows)`);
