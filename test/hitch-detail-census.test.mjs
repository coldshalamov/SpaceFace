import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function jsonMeshStats(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const names = report.polish?.objectNames || report.polish?.prior?.objectNames || [];
  const added = Number(report.polish?.objectsAdded) || names.length;
  const triangles = Number(report.lods?.[0]?.triangles) || 0;
  return { added, triangles, names, fingerprint: report.generationFingerprint };
}

const hitch = jsonMeshStats(resolve(
  ROOT,
  'assets/ships/kestrel_borrowed_time_v4/evidence/hitch/cycles/cycle_18/build_report.json',
));
const liveTest = resolve(ROOT, 'test/hitch-v8-live-polish.test.mjs');
assert.ok(existsSync(liveTest), 'live wiring test still exists');

// Hornet plate-skin remaster is the current second-best live flyable body.
const hornetGlb = resolve(
  ROOT,
  'assets/ships/fleet_player_bodies_v1/hornet/source/wholeships/hornet_production_v1_lod0.glb',
);
assert.ok(existsSync(hornetGlb), 'Hornet remaster LOD0 missing');
const hornetBytes = readFileSync(hornetGlb).byteLength;
const hitchCand = resolve(
  ROOT,
  'assets/ships/kestrel_borrowed_time_v4/source_candidates/hitch_hero_v27/wholeships/kestrel_borrowed_time_v4_lod0.glb',
);
assert.ok(existsSync(hitchCand), 'Hitch cycle-18 candidate missing');
const hitchBytes = readFileSync(hitchCand).byteLength;

assert.ok(hitch.added >= 36, 'cycle 18 must add hull-bay interiors');
assert.ok(hitch.triangles > 35000, 'Hitch candidate keeps a dense LOD0');
assert.ok(hitchBytes > hornetBytes, 'Hitch candidate carries more authored payload than Hornet loft');
assert.match(readFileSync(liveTest, 'utf8'), /wholeships\/kestrel\.glb/, 'live starter still V9 until keep');

console.log(JSON.stringify({
  hitchAdded: hitch.added,
  hitchTris: hitch.triangles,
  hitchBytes,
  hornetBytes,
  payloadRatio: Number((hitchBytes / hornetBytes).toFixed(2)),
}, null, 2));
