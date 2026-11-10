import assert from 'node:assert/strict';
import test from 'node:test';

import {
  preloadAuthoredAssetsForEntity,
  preloadAuthoredPartLibrary,
} from '../src/render/partsLibrary.js';

test('ship-preview library scope loads only the displayed entity plan, never the Helios boot asset', async () => {
  const renderer = {};
  const loaded = [];
  const options = {
    libraryScope: 'ship-preview',
    bootstrapPlan: {},
    requiredWholeShip: true,
    loadAuthoredPart: async (url, { slot }) => {
      loaded.push({ url, slot });
      return { url, slot, primitives: [] };
    },
  };

  const bootstrap = await preloadAuthoredPartLibrary(renderer, options);
  assert.equal(bootstrap instanceof Map, true);
  assert.deepEqual(loaded, [], 'an entity-scoped preview must not decode canonical world assets');

  await preloadAuthoredAssetsForEntity(renderer, {
    id: 1,
    type: 'ship',
    isPlayer: true,
    data: { defId: 'ship_kestrel', fittings: [], weapons: [] },
  }, options);

  assert.deepEqual(loaded, [{
    url: 'assets/ships/release/parts/wholeships/kestrel.glb',
    slot: 'hull',
  }]);
});
