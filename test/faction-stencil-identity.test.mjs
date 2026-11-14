import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultShipAppearance } from '../src/core/shipAppearance.js';
import { FACTION_META } from '../src/data/factions.js';
import { PAINT_PROFILES } from '../src/data/palettes.js';
import { buildPaintAppearance, SHIP_DECAL_STOCK } from '../src/data/shipPaints.js';
import { authoredCompositionFingerprintForEntity, flightRootTemplateKey, paletteFor } from '../src/render/partsLibrary.js';
import { createVisualFactory, invalidateVisualFactoryCaches, resolvePalette } from '../src/render/visualFactory.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stockShipPreviewContext } from '../src/ui/station/screens/shipworks.js';

const routes = [
  ['authored', paletteFor],
  ['procedural', resolvePalette],
];

function expectDecal(entity, expected, description) {
  for (const [name, route] of routes) {
    assert.equal(route(entity).decalId, expected, `${name}: ${description}`);
  }
}

test('generic Reach and Free Frontier ships do not inherit Borrowed Time', () => {
  const reaver = makeEnemySpawnSpec('reaver_pirate', 2, { x: 0, z: 0 });
  assert.equal(reaver.factionId, 'faction_reach');
  assert.equal(reaver.isPlayer, false);
  expectDecal(reaver, undefined, 'Reaver has no personal player stencil');

  const frontier = makeShipEntitySpec('ship_drifter', { team: 0, factionId: 'faction_free' });
  expectDecal(frontier, undefined, 'allied Frontier NPC has no personal stencil');
  const otherKestrel = makeShipEntitySpec('ship_kestrel', { team: 0, factionId: 'faction_free' });
  expectDecal(otherKestrel, undefined, 'another Kestrel is not identified as the player by team');
  assert.equal(resolvePalette(otherKestrel).isPlayer, false);
});

test('new and legacy player Kestrels keep their own default', () => {
  const player = makeShipEntitySpec('ship_kestrel', {
    team: 0, factionId: 'faction_free', isPlayer: true,
    appearance: defaultShipAppearance('ship_kestrel'),
  });
  expectDecal(player, 'borrowed_time', 'new player appearance');
  assert.equal(resolvePalette(player).isPlayer, true);

  const legacy = { ...player, data: { ...player.data } };
  delete legacy.data.appearance;
  expectDecal(legacy, 'borrowed_time', 'legacy player without an appearance record');
  assert.equal(legacy.data.appearance, undefined, 'resolving a legacy appearance does not mutate it');
  const otherPlayerShip = makeShipEntitySpec('ship_drifter', {
    team: 0, factionId: 'faction_free', isPlayer: true,
  });
  expectDecal(otherPlayerShip, undefined, 'other player hulls do not inherit the Kestrel mark');
});

test('saved and paint-rack decal selections take precedence, including bare deck', () => {
  for (const decalId of ['none', 'frontier', 'borrowed_time']) {
    assert.ok(SHIP_DECAL_STOCK.some((row) => row.decalId === decalId));
    const appearance = buildPaintAppearance(defaultShipAppearance('ship_kestrel'), { decalId });
    const player = makeShipEntitySpec('ship_kestrel', {
      team: 0, factionId: 'faction_free', isPlayer: true, appearance,
    });
    expectDecal(player, decalId, `saved paint-rack choice ${decalId}`);
  }
});

test('the stock Hitch preview keeps hero selection but uses the purchased hull appearance', () => {
  const preview = stockShipPreviewContext('ship_kestrel', { cargo: { usedMass: 23 } });
  assert.equal(preview.isPlayer, true);
  assert.equal(preview.stock, true);
  assert.equal(preview.player.cargo.usedMass, 23);
  assert.equal(preview.appearance.decalId, 'none');
  const entity = makeShipEntitySpec(preview.defId, {
    factionId: 'faction_free', isPlayer: preview.isPlayer, appearance: preview.appearance,
  });
  expectDecal(entity, 'none', 'stock hero preview');
  assert.equal(stockShipPreviewContext('not_a_ship', null), null);
});

test('other faction defaults still agree across both ship routes', () => {
  for (const faction of FACTION_META) {
    const entity = makeShipEntitySpec('ship_drifter', { team: 1, factionId: faction.id });
    const expected = PAINT_PROFILES[faction.personality]?.decal || undefined;
    expectDecal(entity, expected, faction.id);
  }
});

test('cached authored compositions distinguish a legacy player Kestrel from a matching NPC', () => {
  const npc = { id: 'ship', type: 'ship', team: 0, factionId: 'faction_free',
    radius: 5, isPlayer: false, data: { defId: 'ship_kestrel' } };
  const player = { ...npc, isPlayer: true };
  const keyFor = (entity) => flightRootTemplateKey({
    entity, entityPlan: null, palette: paletteFor(entity), releaseMode: false,
    visualSeed: 0, selected: new Map(), wholeShip: true, loadoutFingerprint: 'same',
  });
  assert.notEqual(keyFor(player), keyFor(npc), 'templates cannot transfer the personal stencil');
  assert.notEqual(authoredCompositionFingerprintForEntity(player), authoredCompositionFingerprintForEntity(npc),
    'a control transfer invalidates a staged composition when player status changes');
});

test('procedural nose art keeps the personal motto out of NPCs, stations, and bare-deck players', () => {
  const previousDocument = globalThis.document;
  const previousThrow = globalThis.__SF_VISUAL_FACTORY_THROW__;
  globalThis.document = {
    createElement() {
      const canvas = { width: 256, height: 256, style: {}, text: [], addEventListener() {} };
      const context = new Proxy({
        fillText(value) { canvas.text.push(value); },
        createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
        getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText() { return { width: 10 }; },
      }, { get(target, property) { return property in target ? target[property] : () => {}; } });
      canvas.getContext = () => context;
      return canvas;
    },
  };
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  try {
    const factory = createVisualFactory();
    const base = { team: 0, factionId: 'faction_free' };
    const npc = makeShipEntitySpec('ship_kestrel', base);
    const player = makeShipEntitySpec('ship_kestrel', { ...base, isPlayer: true });
    const bare = makeShipEntitySpec('ship_kestrel', { ...base, isPlayer: true, appearance: { decalId: 'none' } });
    const parked = makeShipEntitySpec('ship_kestrel', {
      ...base, isPlayer: false, appearance: defaultShipAppearance('ship_kestrel'),
    });
    const hasPersonalMotto = (root) => {
      let found = false;
      root.traverse((node) => {
        for (const material of [node.material].flat()) {
          if (material?.map?.image?.text?.includes('BORROWED TIME')) found = true;
        }
      });
      return found;
    };
    const npcRoot = factory.build(npc);
    assert.ok(npcRoot);
    assert.equal(hasPersonalMotto(npcRoot), false, 'NPC has no personal motto');
    const playerRoot = factory.build(player);
    assert.ok(playerRoot);
    assert.equal(hasPersonalMotto(playerRoot), true, 'player retains the personal motto');
    const bareRoot = factory.build(bare);
    assert.ok(bareRoot);
    assert.equal(hasPersonalMotto(bareRoot), false, 'bare-deck player does not reuse personal art');
    const parkedRoot = factory.build(parked);
    assert.ok(parkedRoot);
    assert.equal(hasPersonalMotto(parkedRoot), true, 'parked starter keeps its own personal art');
    const stationRoot = factory.build({ id: 'outpost', type: 'station', radius: 40, team: 0,
      factionId: 'faction_free', data: {} });
    assert.ok(stationRoot);
    assert.equal(hasPersonalMotto(stationRoot), false, 'Frontier stations do not inherit the ship motto');
  } finally {
    invalidateVisualFactoryCaches();
    globalThis.document = previousDocument;
    globalThis.__SF_VISUAL_FACTORY_THROW__ = previousThrow;
  }
});
