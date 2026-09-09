import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { WORLD_SITE_ASSET_BINDINGS, validateWorldSiteAssetBinding } from '../src/data/worldSiteAssetBindings.js';
import { WORLD_SITE_MANIFESTS, worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import {
  applyWorldSiteOperation,
  createWorldSiteRecord,
  planWorldSiteMaterialization,
  validateWorldSiteManifest,
} from '../src/systems/worldSiteKernel.js';

const JSON_CHUNK = 0x4e4f534a;
const SITE_ID = 'world_site_helios_relay';
const CATHEDRAL_PART_ID = 'place_landmark_wreck_cathedral';
const CATHEDRAL_ASSET_ID = 'SF_LANDMARK_PLACE_LANDMARK_WRECK_CATHEDRAL';
// Refreshed 2026-08-18 to the rebuilt Cathedral. The prior pair (source f335935f/11155156,
// release dc5510f8/6160084) described a body that no longer exists on disk, so this test was the
// last stale authority of four: release_manifest.json, src/data/worldSiteAssetBindings.js and the
// PQ-018 admission test all pin the values below. Recomputed from the bytes, not copied.
const CATHEDRAL_CONTRACT = Object.freeze({
  source: Object.freeze({
    path: 'assets/ships/parts/places/place_landmark_wreck_cathedral.glb',
    sha256: '7c2f3fcd82235b8a44463320b83d3ee18d377049fe63995d8ebf7b896733ee0e',
    bytes: 18890576,
  }),
  release: Object.freeze({
    path: 'assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb',
    sha256: '32094bcd6df7671e9e2d93ae491a6aab33aa1ca9bd2a32cc3548cb7532eedcca',
    bytes: 7563260,
  }),
});
const CATHEDRAL_SEMANTIC_NODES = Object.freeze({
  INTERACTION_HangarCavity: Object.freeze({
    role: 'future_world_site_cavity',
    translation: Object.freeze([0, 5, 0]),
  }),
  SALVAGE_ConduitBank: Object.freeze({
    role: 'future_salvage_node',
    translation: Object.freeze([99.37923431396484, 24.087305068969727, -68.28560638427734]),
  }),
  SALVAGE_EngineMachinery: Object.freeze({
    role: 'future_salvage_node',
    translation: Object.freeze([-226.73182678222656, 12.388017654418945, 5.248732566833496]),
  }),
  SALVAGE_ServiceRack: Object.freeze({
    role: 'future_salvage_node',
    translation: Object.freeze([-125.59925842285156, -2.267620801925659, -50.781742095947266]),
  }),
  SOCKET_Flythrough_Entry: Object.freeze({
    role: 'flythrough_entry',
    translation: Object.freeze([-278.13482666015625, 0.10397624969482422, -31.204429626464844]),
  }),
  SOCKET_Flythrough_Exit: Object.freeze({
    role: 'flythrough_exit',
    translation: Object.freeze([303.7676086425781, 23.767391204833984, -45.19260787963867]),
  }),
  SOCKET_TheMarker: Object.freeze({
    role: 'the_marker',
    translation: Object.freeze([140.27813720703125, 141.1614532470703, -18.738412857055664]),
  }),
  ZONE_Bridge: Object.freeze({
    role: 'bridge_zone',
    translation: Object.freeze([187.67970275878906, 89.22998046875, -27.353229522705078]),
  }),
  ZONE_BrokenKeel: Object.freeze({
    role: 'broken_keel_zone',
    translation: Object.freeze([0, -58, 0]),
  }),
  ZONE_Propulsion: Object.freeze({
    role: 'propulsion_zone',
    translation: Object.freeze([-240.85142517089844, -1.089632511138916, -23.957263946533203]),
  }),
  ZONE_Service_Port: Object.freeze({
    role: 'service_zone',
    translation: Object.freeze([-124.28954315185547, 6.782212257385254, 48.83946228027344]),
  }),
  ZONE_Service_Starboard: Object.freeze({
    role: 'service_zone',
    translation: Object.freeze([110.7385025024414, 28.541553497314453, -73.49394989013672]),
  }),
});

function parseGlb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path}: GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${path}: GLB version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${path}: declared length`);
  let json = null;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length, `${path}: chunk bounds`);
    if (type === JSON_CHUNK) json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').trim());
    offset += 8 + length;
  }
  assert.ok(json, `${path}: JSON chunk`);
  return { bytes, json };
}

function nodeTransform(node = {}) {
  return {
    translation: node.translation || [0, 0, 0],
    rotation: node.rotation || [0, 0, 0, 1],
    scale: node.scale || [1, 1, 1],
  };
}

function assetMetadata(json = {}) {
  const extras = json.asset?.extras || {};
  return extras.spacefaceAsset && typeof extras.spacefaceAsset === 'object'
    ? extras.spacefaceAsset
    : extras;
}

function nodeSemanticRole(node = {}) {
  return node.extras?.['spaceface.socketRole']
    || node.extras?.spaceface?.semanticRole
    || node.extras?.['spaceface.semanticRole']
    || null;
}

test('every World Site manifest references an admitted immutable asset binding', () => {
  for (const manifest of WORLD_SITE_MANIFESTS) {
    const placeIds = new Set([
      manifest.visualRoot?.placeId,
      ...(manifest.stages || []).map((stage) => stage.placeId),
    ].filter(Boolean));
    assert.ok(placeIds.size > 0, `${manifest.id}: at least one visual place`);
    for (const placeId of [...placeIds].sort()) {
      assert.ok(WORLD_SITE_ASSET_BINDINGS[placeId], `${manifest.id}: ${placeId} asset binding`);
    }
  }
});

test('every World Site stage binding is exact in source, release, and release manifest', () => {
  const releaseManifest = JSON.parse(readFileSync('assets/ships/release/release_manifest.json', 'utf8'));
  const released = new Map(releaseManifest.assets.map((entry) => [entry.id, entry]));

  for (const binding of Object.values(WORLD_SITE_ASSET_BINDINGS)) {
    const releaseEntry = released.get(binding.partId);
    assert.ok(releaseEntry, `${binding.partId}: release manifest row`);
    for (const kind of ['source', 'release']) {
      const contract = binding[kind];
      const { bytes, json } = parseGlb(contract.path);
      assert.equal(bytes.length, contract.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), contract.sha256);
      const metadata = assetMetadata(json);
      assert.equal(metadata.assetId, binding.assetId);
      assert.equal(metadata.partId, binding.partId);
      if (binding.partId !== CATHEDRAL_PART_ID) {
        assert.equal(json.asset?.extras?.assetId, binding.assetId, `${binding.partId}/${kind}: legacy assetId`);
        assert.equal(json.asset?.extras?.partId, binding.partId, `${binding.partId}/${kind}: legacy partId`);
      }
      assert.equal(releaseEntry[`${kind}Sha256`], contract.sha256);
      assert.equal(releaseEntry[`${kind}Bytes`], contract.bytes);
      const nodes = new Map(json.nodes.map((node) => [node.name, node]));
      for (const [name, socket] of Object.entries(binding.sockets)) {
        const node = nodes.get(name);
        assert.ok(node, `${binding.partId}/${kind}: ${name}`);
        assert.equal(nodeSemanticRole(node), socket.role);
        assert.deepEqual(nodeTransform(node), socket.transform);
      }
    }
  }
});

test('Wreck Cathedral source and release preserve exact nested identity, semantics, and compression', () => {
  const binding = WORLD_SITE_ASSET_BINDINGS[CATHEDRAL_PART_ID];
  assert.ok(binding, 'Wreck Cathedral binding');
  assert.equal(binding.assetId, CATHEDRAL_ASSET_ID);
  assert.deepEqual(binding.source, CATHEDRAL_CONTRACT.source);
  assert.deepEqual(binding.release, CATHEDRAL_CONTRACT.release);
  assert.deepEqual(Object.keys(binding.sockets).sort(), Object.keys(CATHEDRAL_SEMANTIC_NODES).sort());
  for (const [name, expected] of Object.entries(CATHEDRAL_SEMANTIC_NODES)) {
    assert.equal(binding.sockets[name].role, expected.role, `binding: ${name} semantic role`);
    assert.deepEqual(binding.sockets[name].transform, {
      translation: expected.translation,
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    }, `binding: ${name} transform`);
  }

  const parsed = {};
  for (const kind of ['source', 'release']) {
    const contract = CATHEDRAL_CONTRACT[kind];
    const asset = parseGlb(contract.path);
    parsed[kind] = asset;
    assert.equal(asset.bytes.length, contract.bytes);
    assert.equal(createHash('sha256').update(asset.bytes).digest('hex'), contract.sha256);

    const nested = asset.json.asset?.extras?.spacefaceAsset;
    assert.ok(nested && typeof nested === 'object', `${kind}: nested spacefaceAsset metadata`);
    assert.equal(nested.contractVersion, 1);
    assert.equal(nested.assetId, CATHEDRAL_ASSET_ID);
    assert.equal(nested.partId, CATHEDRAL_PART_ID);
    assert.equal(nested.slot, 'place');
    assert.equal(nested.forward, '+X');
    assert.equal(nested.up, '+Y');
    assert.equal(nested.starboard, '+Z');
    assert.equal(nested.unit, 'metre');

    const nodes = new Map(asset.json.nodes.map((node) => [node.name, node]));
    for (const [name, expected] of Object.entries(CATHEDRAL_SEMANTIC_NODES)) {
      const node = nodes.get(name);
      assert.ok(node, `${kind}: ${name}`);
      assert.equal(nodeSemanticRole(node), expected.role, `${kind}: ${name} semantic role`);
      assert.deepEqual(nodeTransform(node), {
        translation: expected.translation,
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      }, `${kind}: ${name} transform`);
    }
  }

  const release = parsed.release.json;
  assert.ok(release.extensionsUsed?.includes('KHR_texture_basisu'));
  assert.ok(release.extensionsRequired?.includes('KHR_texture_basisu'));
  assert.equal(release.textures?.length, 26);
  assert.ok(release.textures.every((texture) => texture.extensions?.KHR_texture_basisu));
  assert.ok(release.extensionsUsed?.includes('EXT_meshopt_compression'));
  assert.ok(release.extensionsRequired?.includes('EXT_meshopt_compression'));
  assert.ok(release.bufferViews?.some((view) => view.extensions?.EXT_meshopt_compression));
});

test('manifest rejects absent assets, sockets, bindings, and malformed transforms', () => {
  const base = structuredClone(worldSiteManifestById(SITE_ID));
  base.stages[0].placeId = 'place_missing';
  assert.ok(validateWorldSiteManifest(base).errors.some((error) => error.code === 'stage-asset-binding-missing'));

  const socket = structuredClone(worldSiteManifestById(SITE_ID));
  socket.proxies[0].anchorId = 'SOCKET_Missing';
  socket.components[0].anchorId = 'SOCKET_Missing';
  assert.ok(validateWorldSiteManifest(socket).errors.some((error) => error.code === 'proxy-socket-binding-missing'));

  const malformed = structuredClone(WORLD_SITE_ASSET_BINDINGS.place_claim_outpost_relay);
  malformed.sockets.SOCKET_Structure_Core.transform.translation[0] = Number.NaN;
  assert.equal(validateWorldSiteAssetBinding(malformed), false);

  const duplicateFixture = structuredClone(worldSiteManifestById(SITE_ID));
  duplicateFixture.stages[0].presentation.fixtures[1].id = duplicateFixture.stages[0].presentation.fixtures[0].id;
  assert.ok(validateWorldSiteManifest(duplicateFixture).errors.some((error) => error.code === 'stage-presentation-fixture-id-duplicate'));

  const missingSocket = structuredClone(worldSiteManifestById(SITE_ID));
  missingSocket.stages[0].presentation.fixtures[0].socketId = 'SOCKET_Missing';
  assert.ok(validateWorldSiteManifest(missingSocket).errors.some((error) => error.code === 'stage-presentation-socket-missing'));

  const badAnimation = structuredClone(worldSiteManifestById(SITE_ID));
  badAnimation.stages[0].presentation.animations[0].targetId = 'ghost_fixture';
  assert.ok(validateWorldSiteManifest(badAnimation).errors.some((error) => error.code === 'stage-presentation-animation-target-missing'));
});

test('component centers resolve from verified sockets with center, scale, and rotation', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const record = createWorldSiteRecord(manifest, { tick: 0 });
  const plan = planWorldSiteMaterialization(manifest, record);
  const component = plan.components.find((entry) => entry.componentId === 'cargo_brace');
  const binding = WORLD_SITE_ASSET_BINDINGS[plan.root.placeId];
  const socket = binding.sockets.SOCKET_Module_Depot.transform.translation;
  const proxy = manifest.proxies.find((entry) => entry.componentId === 'cargo_brace');
  const scale = plan.root.scale;
  const localX = (socket[0] - binding.visualCenterXZ.x + proxy.offset.x) * scale;
  const localZ = (socket[2] - binding.visualCenterXZ.z + proxy.offset.z) * scale;
  const cos = Math.cos(manifest.placement.rot);
  const sin = Math.sin(manifest.placement.rot);
  assert.ok(Math.abs(component.pos.x - (manifest.placement.pos.x + localX * cos - localZ * sin)) < 1e-9);
  assert.ok(Math.abs(component.pos.z - (manifest.placement.pos.z + localX * sin + localZ * cos)) < 1e-9);
});

test('released payload snapshots the resulting visible-stage socket, not the dark-stage socket', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  let record = createWorldSiteRecord(manifest, { tick: 0 });
  for (const [operationId, requestSequence] of [
    ['repair_relay_core', 1],
    ['recover_safety_coupler', 2],
    ['cut_cargo_brace', 3],
  ]) {
    record = applyWorldSiteOperation(manifest, record, {
      operationId,
      requestStreamId: 'player-industrial-beam',
      requestSequence,
      amount: 10_000,
      tick: requestSequence,
    }).record;
  }

  assert.equal(record.stageId, 'powered');
  const payload = planWorldSiteMaterialization(manifest, record).payloads[0];
  const stage = manifest.stages.find((entry) => entry.id === 'powered');
  const binding = WORLD_SITE_ASSET_BINDINGS[stage.placeId];
  const proxy = manifest.proxies.find((entry) => entry.componentId === 'payload_cradle');
  const socket = binding.sockets[proxy.anchorId].transform.translation;
  const localX = (socket[0] - binding.visualCenterXZ.x + proxy.offset.x + 8) * stage.scale;
  const localZ = (socket[2] - binding.visualCenterXZ.z + proxy.offset.z + 4) * stage.scale;
  const cos = Math.cos(manifest.placement.rot);
  const sin = Math.sin(manifest.placement.rot);
  assert.ok(Math.abs(payload.pos.x - (manifest.placement.pos.x + localX * cos - localZ * sin)) < 1e-9);
  assert.ok(Math.abs(payload.pos.z - (manifest.placement.pos.z + localX * sin + localZ * cos)) < 1e-9);
});
