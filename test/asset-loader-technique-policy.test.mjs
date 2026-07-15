import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ASSET_AUTHORING_CONTRACT,
  hasNonEmptyWholeShipHullBody,
  isAuthoredTextureSizeValid,
} from '../src/render/assetLoader.js';

const source = await readFile(new URL('../src/render/assetLoader.js', import.meta.url), 'utf8');

assert.equal(Object.hasOwn(ASSET_AUTHORING_CONTRACT.rootExtras.required, 'chamfered'), false,
  'runtime metadata must not require one edge-modeling technique');
assert.equal(Object.hasOwn(ASSET_AUTHORING_CONTRACT.textures, 'minResolution'), false,
  'runtime contract must not publish a universal minimum texture resolution');
assert.equal(Object.hasOwn(ASSET_AUTHORING_CONTRACT.textures, 'maxResolution'), false,
  'runtime contract must not publish a universal maximum texture resolution');
assert.match(ASSET_AUTHORING_CONTRACT.topology.edgeTreatment, /asset-specific/i,
  'runtime contract keeps edge treatment asset-specific');

assert.equal(hasNonEmptyWholeShipHullBody(0), false);
assert.equal(hasNonEmptyWholeShipHullBody(Number.NaN), false);
assert.equal(hasNonEmptyWholeShipHullBody(1), true,
  'one real hull triangle proves body presence without imposing an arbitrary complexity floor');
assert.equal(hasNonEmptyWholeShipHullBody(799), true,
  'the retired 800-triangle taste floor must not return');
assert.equal(isAuthoredTextureSizeValid({ width: 4096, height: 4096 }), true,
  'higher-resolution authored textures are not rejected by a universal cap');
assert.equal(isAuthoredTextureSizeValid({ width: 128, height: 64 }), true,
  'specialized authored textures are not rejected by a universal floor');
assert.equal(isAuthoredTextureSizeValid({ width: 0, height: 64 }), false,
  'empty texture dimensions remain structurally invalid');

assert.doesNotMatch(source, /lacks a chamfer\/bevel assertion/i,
  'runtime compilation must not reject otherwise valid assets for missing a technique token');
assert.doesNotMatch(source, /WHOLE_SHIP_BODY_MIN_TRIS/,
  'whole-ship body validation must stay presence-based unless an asset opts into a reviewed floor');

console.log('PASS asset loader technique policy: structural validity without universal quality ceilings');
