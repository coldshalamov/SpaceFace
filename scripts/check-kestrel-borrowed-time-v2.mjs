#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v2');
const PACKET = 'PROFESSIONAL-KESTREL-BORROWED-TIME-V2-CODEX-001';
const CANDIDATE = resolve(FAMILY, 'release_candidates/wholeships/kestrel_borrowed_time_v2.glb');
const LIVE = resolve(ROOT, 'assets/ships/release/parts/wholeships/kestrel.glb');
const REQUIRED = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Trail_Main', 'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus', 'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
];
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
function glb(path) {
  const buffer = readFileSync(path); let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4); offset += 8;
    if (type === 0x4e4f534a) return JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').replace(/\0+$/, '').trim());
    offset += length;
  }
  throw new Error('GLB JSON missing');
}
function triangles(doc) {
  const lod = { lod0: 0, lod1: 0, lod2: 0 };
  for (const node of doc.nodes || []) {
    const key = /lod0/i.test(node.name || '') ? 'lod0' : /lod1/i.test(node.name || '') ? 'lod1' : /lod2/i.test(node.name || '') ? 'lod2' : null;
    if (!key || node.mesh == null) continue;
    for (const primitive of doc.meshes?.[node.mesh]?.primitives || []) {
      const accessor = primitive.indices ?? primitive.attributes?.POSITION;
      lod[key] += Math.floor((doc.accessors?.[accessor]?.count || 0) / 3);
    }
  }
  return lod;
}

assert.ok(existsSync(CANDIDATE), 'candidate exists');
assert.ok(statSync(CANDIDATE).size < 100 * 1024 * 1024, 'candidate below GitHub 100MiB');
const report = json(resolve(FAMILY, 'evidence/finalize_report.json'));
assert.equal(report.packet, PACKET);
assert.equal(report.ok, true);
assert.equal(report.candidateOnly, true);
assert.equal(report.livePromotion, false);
assert.equal(report.acceptanceClaim, false);
assert.deepEqual(report.errors, []);

const doc = glb(CANDIDATE), names = (doc.nodes || []).map((node) => node.name || '');
assert.ok((doc.extensionsUsed || []).includes('EXT_meshopt_compression'), 'Meshopt present');
assert.ok((doc.extensionsUsed || []).includes('KHR_texture_basisu'), 'KTX2 present');
assert.equal((doc.images || []).filter((image) => /ktx|basis/i.test(image.mimeType || '')).length, (doc.images || []).length, 'every image KTX2');
for (const socket of REQUIRED) assert.ok(names.includes(socket), `socket ${socket}`);
assert.ok(names.includes('COLLISION_HULL'), 'collision proxy');
assert.equal(names.some((name) => /plume/i.test(name)), false, 'no embedded plume');
const lod = triangles(doc);
assert.deepEqual(lod, { lod0: 28672, lod1: 12034, lod2: 1822 });
assert.ok(lod.lod0 > lod.lod1 && lod.lod1 > lod.lod2 && lod.lod2 > 0, 'monotonic LODs');
assert.ok(lod.lod0 > 19050, 'near tier retains more authored geometry than live baseline');
assert.equal(sha(LIVE), '633C6A26C384832D2D870198C5A39D4F209EC6B9E4096F9A8DAC0EBB3940AB3F', 'live Kestrel unchanged');

assert.equal(report.shots.length, 4, 'four Three.js proof distances');
for (const shot of report.shots) {
  const path = resolve(ROOT, shot.path);
  assert.ok(existsSync(path) && statSync(path).size > 0, `${shot.name} proof exists`);
  const image = PNG.sync.read(readFileSync(path));
  assert.equal(image.width, shot.w); assert.equal(image.height, shot.h);
}
const taste = json(resolve(FAMILY, 'evidence/TASTE_REVIEW.json'));
assert.equal(taste.disposition, 'PASS');
assert.equal(taste.reviewCount, 1);
assert.equal(taste.repairCount, 1);
assert.equal(taste.livePromotion, false);
const failure = json(resolve(FAMILY, 'evidence/FAILURE_REFERENCE.json'));
assert.equal(failure.baselineSha256, sha(LIVE));
assert.ok(failure.rejectedPatterns.length >= 6);

console.log(`check-kestrel-borrowed-time-v2: PASS (${lod.lod0}/${lod.lod1}/${lod.lod2}, ${(statSync(CANDIDATE).size / 1048576).toFixed(2)} MiB)`);
