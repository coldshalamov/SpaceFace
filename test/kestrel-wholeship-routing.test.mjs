import assert from 'node:assert/strict';

import {
  ASSET_AUTHORING_CONTRACT,
  isAuthoredTextureSizeValid,
} from '../src/render/assetLoader.js';
import {
  authoredBootstrapPreloadPlan,
  resolveRequiredWholeShipRecord,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { isPlayerKestrel } from '../src/render/visualOverrides.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const player = makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0 });
const courier = makeShipEntitySpec('ship_kestrel', { isPlayer: false, team: 0 });
const validRecord = {
  url: '/assets/ships/release/parts/wholeships/kestrel.glb',
  assetId: 'SF_K0_KESTREL_BORROWED_TIME_V4',
};

assert.equal(ASSET_AUTHORING_CONTRACT.version, 2, 'V4 promotion requires the truthful v2 authoring contract');
assert.deepEqual(ASSET_AUTHORING_CONTRACT.supportedVersions, [1, 2],
  'the v2 loader must remain backward-compatible with the existing v1 authored library');
assert.match(ASSET_AUTHORING_CONTRACT.rootExtras.required.textureCompression, /KTX2\/BasisU\+mips/,
  'the loader contract must name the mipmapped V4 release token');
assert.equal(isAuthoredTextureSizeValid({ width: 1024, height: 256 }, { factorOnly: true }), true,
  'semantic decal strips preserve their authored aspect ratio');
assert.equal(isAuthoredTextureSizeValid({ width: 4096, height: 4096 }), true,
  'the runtime contract does not reject higher-resolution authored textures');
assert.equal(isAuthoredTextureSizeValid({ width: 512, height: 256 }), true,
  'the runtime contract does not invent a universal texture-resolution floor');
assert.equal(isAuthoredTextureSizeValid({ width: 0, height: 256 }), false,
  'empty texture dimensions remain invalid');

assert.equal(player.isPlayer, true, 'new/load player construction must preserve the explicit player marker');
assert.equal(courier.isPlayer, false, 'same-team NPC construction must not inherit player identity');
assert.equal(isPlayerKestrel(player), true, 'the player Kestrel should activate the production whole ship');
assert.equal(isPlayerKestrel(courier), false, 'an NPC Kestrel must remain on the modular authored path');
const liveVisual = wholeShipVisualForEntity(player, { requiredWholeShip: true });
assert.equal(liveVisual.assetId, 'SF_K0_KESTREL_BORROWED_TIME_V4', 'the live player seam must require V4');
assert.deepEqual(liveVisual.lodFamily, {
  lod0: 'wholeships/kestrel.glb',
  lod1: 'wholeships/kestrel_lod1.glb',
  lod2: 'wholeships/kestrel_lod2.glb',
}, 'all accepted V4 family members must remain catalogued for distance residency');
assert.deepEqual(authoredBootstrapPreloadPlan().hull, ['wholeships/kestrel.glb'],
  'boot must decode only canonical LOD0 rather than pinning all three V4 levels');
assert.equal(
  resolveRequiredWholeShipRecord(player, [validRecord], { releaseMode: true, requiredWholeShip: true }),
  validRecord,
  'a validated player record should resolve',
);
assert.equal(
  resolveRequiredWholeShipRecord(courier, [validRecord], { releaseMode: true, requiredWholeShip: false }),
  null,
  'an NPC must not request the whole ship even when the record is loaded for the player',
);
assert.throws(
  () => resolveRequiredWholeShipRecord(player, [], { releaseMode: true, requiredWholeShip: true }),
  /did not pass the live authored-asset loader/,
  'a missing player GLB must fail readiness instead of selecting a modular hull',
);
assert.throws(
  () => resolveRequiredWholeShipRecord(player, [{ ...validRecord, assetId: 'CORRUPT_FIXTURE' }], {
    releaseMode: true,
    requiredWholeShip: true,
  }),
  /did not pass the live authored-asset loader/,
  'a contract-invalid player GLB record must fail readiness instead of selecting a modular hull',
);

console.log('Kestrel whole-ship player routing: PASS');
