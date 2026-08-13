import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const JSON_CHUNK = 0x4e4f534a;
const SPECIAL_MATERIAL_ROLES = Object.freeze({
  Material_Emissive_Cyan: 'emissive',
  Material_Emissive_DriveCore: 'emissive',
  Material_Emissive_Orange: 'emissive',
  Material_Glass_Canopy: 'canopy',
  Material_V6_MarkingIvory: 'marking',
});

const FAMILY = Object.freeze([
  Object.freeze({
    lod: 0,
    candidate: 'assets/ships/kestrel_borrowed_time_v4/source_candidates/hitch_polish_v7/wholeships/kestrel_borrowed_time_v4_lod0.glb',
    live: 'assets/ships/parts/wholeships/kestrel.glb',
  }),
  Object.freeze({
    lod: 1,
    candidate: 'assets/ships/kestrel_borrowed_time_v4/source_candidates/hitch_polish_v7/wholeships/kestrel_borrowed_time_v4_lod1.glb',
    live: 'assets/ships/parts/wholeships/kestrel_lod1.glb',
  }),
  Object.freeze({
    lod: 2,
    candidate: 'assets/ships/kestrel_borrowed_time_v4/source_candidates/hitch_polish_v7/wholeships/kestrel_borrowed_time_v4_lod2.glb',
    live: 'assets/ships/parts/wholeships/kestrel_lod2.glb',
  }),
]);

function parseGlb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path}: GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${path}: GLB version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${path}: declared byte length`);

  let json = null;
  const payloadChunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    assert.ok(offset + 8 + length <= bytes.length, `${path}: chunk bounds`);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8').trim());
    else payloadChunks.push(Buffer.from(data));
    offset += 8 + length;
  }
  assert.ok(json, `${path}: JSON chunk`);
  return { json, payloadChunks };
}

test('promoted Hitch V7 source family declares its strict authored-material contract', () => {
  for (const member of FAMILY) {
    const { json } = parseGlb(member.live);
    const metadata = json.asset?.extras?.spacefaceAsset;
    const materialsByName = new Map((json.materials || []).map((material) => [material.name, material]));
    const expectedMaterials = Object.keys(SPECIAL_MATERIAL_ROLES)
      .filter((name) => materialsByName.has(name))
      .sort();
    assert.equal(metadata?.contractVersion, 2, `LOD${member.lod}: contract version`);
    assert.equal(metadata?.assetId, 'SF_K0_KESTREL_BORROWED_TIME_V4', `LOD${member.lod}: asset id`);
    assert.equal(metadata?.chamfered, true, `LOD${member.lod}: accepted hard-surface geometry has global chamfer evidence`);
    assert.equal(metadata?.polishPassId, 'kestrel-hitch-polish-v7', `LOD${member.lod}: V7 polish pass`);
    assert.deepEqual(
      [...(metadata?.factorOnlyMaterials || [])].sort(),
      expectedMaterials,
      `LOD${member.lod}: only semantic special-role materials bypass the full PBR map set`,
    );

    for (const [name, role] of Object.entries(SPECIAL_MATERIAL_ROLES)) {
      if (!materialsByName.has(name)) continue;
      const declaration = materialsByName.get(name)?.extras?.spaceface;
      assert.equal(declaration?.factorOnly, true, `LOD${member.lod}: ${name} factor-only declaration`);
      assert.equal(declaration?.materialRole, role, `LOD${member.lod}: ${name} semantic role`);
    }
  }
});

test('Hitch V7 promotion changes metadata only', () => {
  for (const member of FAMILY) {
    const candidate = parseGlb(member.candidate);
    const live = parseGlb(member.live);
    assert.equal(live.payloadChunks.length, candidate.payloadChunks.length, `LOD${member.lod}: payload chunk count`);
    for (let index = 0; index < candidate.payloadChunks.length; index += 1) {
      assert.deepEqual(live.payloadChunks[index], candidate.payloadChunks[index], `LOD${member.lod}: payload chunk ${index}`);
    }
  }
});
