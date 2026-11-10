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
  // Forge remaster provenance: the live GLB carries the contract block with identity-bound
  // partId/forge.ship — the old source-checkpoint extras were retired by the v2 hull plating pass.
  assert.equal(contract.partId, row.id);
  assert.equal(contract.assetId, row.id);
  assert.equal(contract.liveId, row.id);
  assert.equal(contract.category, row.category);
  assert.equal(contract.forward, '+X');
  assert.equal(contract.up, '+Y');
  assert.equal(contract.starboard, '+Z');
  assert.equal(contract.unit, 'metre');
  assert.equal(contract.normalConvention, 'OpenGL');
  assert.equal(contract.ormChannels, 'R=AO,G=Roughness,B=Metallic');
  assert.equal(contract.forge?.ship, row.id);
  assert.equal(contract.identitySource, 'tools/blender/forge');
  assert.equal(contract.integratedHardpoints, true);
  assert.equal(contract.spacefaceRemasterGeometry, true);
  // The manifest keeps the delivery-facing wiring fields; the rupture identity lives in its note.
  assert.deepEqual(row.hooks, []);
  assert.deepEqual(row.sockets, ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core']);
  assert.match(row.note || '', /starboard-dorsal rupture/);

  for (const marker of ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core']) {
    assert.ok(gltf.nodes.some((node) => node.name === marker), `missing ${marker}`);
  }
  assert.ok(!gltf.nodes.some((node) => node.name === 'HOOK_Emissive'));
  // Integrated hardpoints name their hook per LOD tier; all three tiers ship.
  for (const lod of ['LOD0', 'LOD1', 'LOD2']) {
    assert.ok(gltf.nodes.some((node) => node.name === `${lod}_HOOK_NAV_PORT`), `missing ${lod} hook`);
    assert.ok(gltf.nodes.some((node) => node.name?.startsWith(`${lod}_`) && !node.name.includes('HOOK')),
      `missing ${lod} geometry`);
  }
});
