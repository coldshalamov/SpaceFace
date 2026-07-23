import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { WORLD_SITE_ASSET_BINDINGS, validateWorldSiteAssetBinding } from '../src/data/worldSiteAssetBindings.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import {
  applyWorldSiteOperation,
  createWorldSiteRecord,
  planWorldSiteMaterialization,
  validateWorldSiteManifest,
} from '../src/systems/worldSiteKernel.js';

const JSON_CHUNK = 0x4e4f534a;
const SITE_ID = 'world_site_helios_relay';

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

test('every World Site stage binding is exact in source, release, and release manifest', () => {
  const releaseManifest = JSON.parse(readFileSync('assets/ships/release/release_manifest.json', 'utf8'));
  const released = new Map(releaseManifest.assets.map((entry) => [entry.id, entry]));
  const manifest = worldSiteManifestById(SITE_ID);
  assert.deepEqual([...new Set(manifest.stages.map((stage) => stage.placeId))].sort(), Object.keys(WORLD_SITE_ASSET_BINDINGS).sort());

  for (const binding of Object.values(WORLD_SITE_ASSET_BINDINGS)) {
    const releaseEntry = released.get(binding.partId);
    assert.ok(releaseEntry, `${binding.partId}: release manifest row`);
    for (const kind of ['source', 'release']) {
      const contract = binding[kind];
      const { bytes, json } = parseGlb(contract.path);
      assert.equal(bytes.length, contract.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), contract.sha256);
      assert.equal(json.asset?.extras?.assetId, binding.assetId);
      assert.equal(json.asset?.extras?.partId, binding.partId);
      assert.equal(releaseEntry[`${kind}Sha256`], contract.sha256);
      assert.equal(releaseEntry[`${kind}Bytes`], contract.bytes);
      const nodes = new Map(json.nodes.map((node) => [node.name, node]));
      for (const [name, socket] of Object.entries(binding.sockets)) {
        const node = nodes.get(name);
        assert.ok(node, `${binding.partId}/${kind}: ${name}`);
        assert.equal(node.extras?.['spaceface.socketRole'], socket.role);
        assert.deepEqual(nodeTransform(node), socket.transform);
      }
    }
  }
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
