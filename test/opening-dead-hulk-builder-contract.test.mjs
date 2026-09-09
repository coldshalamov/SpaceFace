import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const builderPath = new URL(
  '../tools/blender/remaster_opening_dead_hulk_v1.py',
  import.meta.url,
);
const sourceGlbPath = new URL(
  '../assets/ships/parts/places/place_dead_hulk.glb',
  import.meta.url,
);
const partsManifestPath = new URL(
  '../assets/ships/parts/parts_manifest.json',
  import.meta.url,
);
const source = readFileSync(builderPath, 'utf8');

function parseGlbJson(filePath) {
  const bytes = readFileSync(filePath);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'not a GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'not GLB v2');
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) {
      return JSON.parse(payload.toString('utf8').replace(/[\u0000 ]+$/u, ''));
    }
    offset += 8 + length;
  }
  throw new Error('GLB has no JSON chunk');
}

test('dead-hulk method reset is an explicit non-promoting deterministic builder', () => {
  for (const flag of [
    '--maps-root',
    '--output-blend',
    '--output-glb',
    '--report',
  ]) {
    assert.match(source, new RegExp(`parser\\.add_argument\\("${flag}"`));
  }

  assert.doesNotMatch(source, /Documents[\\/]GitHub[\\/]SpaceFace/i);
  assert.doesNotMatch(source, /\bshutil\b|\bcopy2?\s*\(/);
  assert.doesNotMatch(source, /^\s*(?:import random|from random import|from mathutils import .*noise)/m);
  assert.doesNotMatch(source, /\b(?:random|noise)\s*\.\s*[A-Za-z_]+\s*\(|\bhash\s*\(/);
  assert.doesNotMatch(source, /place_dead_hulk_iter[_\d]|form_pass_hulk/i);
  assert.match(source, /export_scene\.gltf\(/);
  assert.match(source, /save_as_mainfile\(/);
});

test('dead-hulk builder restores the canonical root, marker, axis, and pivot contract', () => {
  assert.match(source, /ASSET_ID = "place_dead_hulk"/);
  assert.match(source, /FORWARD_AXIS = "\+X"/);
  assert.match(source, /BEAM_AXIS = "\+Y"/);
  assert.match(source, /UP_AXIS = "\+Z"/);
  assert.doesNotMatch(source, /"HOOK_Emissive": \{/);
  assert.match(source, /"SOCKET_Hazard_Core": \{/);
  assert.match(source, /"SOCKET_Salvage_Core": \{/);
  assert.match(source, /"pivot": \{"mode": "centered"/);
  assert.match(source, /root = make_empty\(ROOT_NAME\)/);
});

test('dead-hulk LODs share one macro recipe and one causal rupture', () => {
  assert.match(source, /for lod in range\(3\):\s*\n\s*build_lod\(lod, materials, root\)/);
  assert.match(source, /build_shell\(lod, mats\["Material_Hull"\], parent\)/);
  assert.match(source, /build_load_path\(lod, mats, parent\)/);
  assert.match(source, /build_drive_mass\(lod, mats, parent\)/);
  assert.match(source, /build_command_house\(lod, mats, parent\)/);
  assert.match(source, /build_rupture\(lod, mats, parent\)/);
  assert.match(source, /RUPTURE_X = \(-4\.1, 7\.3\)/);
  assert.match(source, /"single 11\.4m starboard-dorsal rupture/);
  assert.match(source, /"continuous_primary_keel"/);
  assert.match(source, /"broad_aft_engine_ring"/);
  assert.match(source, /"offset_command_house"/);
  assert.match(source, /"rooted_rupture_insulation"/);
  assert.match(source, /"severed_service_trunk"/);
});

test('dead-hulk source materials bind explicit base-color, normal, and ORM maps', () => {
  for (const role of [
    'hulk_painted_hull',
    'hulk_armor_dark',
    'hulk_structural_alloy',
    'hulk_rupture_insulation',
    'hulk_service_trunks',
    'hulk_dead_glass',
    'hulk_heat_affected',
  ]) {
    assert.match(source, new RegExp(`"${role}"`));
  }
  assert.match(source, /f"\{role\}_basecolor\.png"/);
  assert.match(source, /f"\{role\}_normal\.png"/);
  assert.match(source, /f"\{role\}_orm\.png"/);
  assert.match(source, /"R=AO,G=Roughness,B=Metallic"/);
  assert.match(source, /"OpenGL tangent space"/);
});

test('dead-hulk canonical source matches its manifest and production-source contract', () => {
  const gltf = parseGlbJson(sourceGlbPath);
  const manifest = JSON.parse(readFileSync(partsManifestPath, 'utf8'));
  const row = manifest.parts.find((part) => part.id === 'place_dead_hulk');
  assert.ok(row, 'missing place_dead_hulk manifest row');

  const extras = gltf.asset?.extras;
  const contract = extras?.spacefaceAsset;
  assert.ok(contract, 'missing asset-level SpaceFace contract');
  assert.equal(extras.partId, row.id);
  assert.equal(extras.category, row.category);
  assert.equal(extras.priority, row.priority);
  assert.equal(extras.triangleCount, row.tris);
  assert.equal(extras.textureSize, row.textureSize);
  assert.deepEqual(extras.boundsDimensionsM, row.bounds.dimensionsM);
  assert.equal(extras.forwardAxis, '+X');
  assert.equal(extras.upAxis, '+Y');
  assert.equal(extras.starboardAxis, '+Z');
  assert.equal(extras.unit, 'metre');
  assert.deepEqual(extras.sourceProvenance, {
    textureRoleContractVersion: 1,
    textureRoleMode: 'bound-base-normal-orm',
    sourceBlend: 'assets/ships/parts/blender/place_dead_hulk_authored.blend',
    geometryPipeline: 'tools/blender/remaster_opening_dead_hulk_v1.py',
    texturePipeline: 'tools/art/build_opening_infrastructure_maps.py',
    packedEditableTextures: true,
  });
  assert.equal(contract.deliverableRole, 'production_source_checkpoint');
  assert.equal(contract.wiringStatus, 'source_checkpoint_release_pending');
  assert.equal(contract.damage?.kind, 'starboard-dorsal rupture');
  assert.equal(contract.damage?.spanM, 11.4);
  assert.deepEqual(contract.hooks, []);
  assert.deepEqual(contract.sockets, ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core']);
  assert.deepEqual(row.hooks, contract.hooks);
  assert.deepEqual(row.sockets, contract.sockets);

  const root = gltf.nodes.find((node) => node.name === 'place_dead_hulk');
  assert.deepEqual(root?.extras?.spacefaceAsset, contract);
  for (const marker of ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core']) {
    assert.ok(gltf.nodes.some((node) => node.name === marker), `missing ${marker}`);
  }
  assert.ok(!gltf.nodes.some((node) => node.name === 'HOOK_Emissive'));
  assert.ok(contract.lods.lod0.triangles > contract.lods.lod1.triangles);
  assert.ok(contract.lods.lod1.triangles > contract.lods.lod2.triangles);
});
