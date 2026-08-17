import assert from 'node:assert/strict';
import test from 'node:test';

import {
  paletteWithShipAppearance,
  shipAppearanceSignature,
} from '../src/core/shipAppearance.js';
import {
  paintSchemesForShip,
  selectedPaintSchemeId,
  shipPaintAppearance,
} from '../src/data/shipCustomization.js';
import { SHIPS } from '../src/data/ships.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { makeShipPreviewEntitySpec } from '../src/ui/shipPreviewMount.js';

test('every flyable hull has a bounded authored paint set with an original coating', () => {
  for (const ship of SHIPS) {
    const schemes = paintSchemesForShip(ship.id);
    assert.equal(schemes.length, 3, `${ship.id} has original plus two authored commission coats`);
    assert.equal(schemes[0].id, 'original');
    assert.equal(new Set(schemes.map((scheme) => scheme.id)).size, schemes.length);
    for (const scheme of schemes) {
      assert.equal(Object.isFrozen(scheme), true);
      assert.ok(scheme.label.length >= 4);
      assert.ok(scheme.story.length >= 12);
    }
  }
});

test('the real Shipworks intent is berth-gated, persists through Continue, and reaches the render payload', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 0x44a11 });
  try {
    const { state, bus } = runtime;
    const ships = runtime.getSystem('ships');
    ships.newGame();
    const owned = state.player.ownedShips[0];
    const player = runtime.spawn(makeShipEntitySpec(owned.defId, {
      isPlayer: true,
      team: 0,
      factionId: 'faction_free',
      fittings: owned.fittings,
      appearance: owned.appearance,
      pos: { x: 0, z: 0 },
    }));
    player.flags = { ...(player.flags || {}), persistent: true };
    state.playerId = player.id;

    const changed = [];
    const saved = [];
    const toasts = [];
    bus.on('ship:appearanceChanged', (payload) => changed.push(structuredClone(payload)));
    bus.on('ship:appearanceSaved', (payload) => saved.push(structuredClone(payload)));
    bus.on('toast', (payload) => toasts.push(structuredClone(payload)));

    const commissioned = shipPaintAppearance(owned.defId, 'dockyard_bone', owned.appearance);
    const before = shipAppearanceSignature(owned.appearance, owned.defId);
    state.mode = 'flight';
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    bus.emit('ui:setShipAppearance', {
      shipIndex: 0,
      appearance: commissioned,
      source: 'shipworks_paint_booth',
    });
    assert.equal(shipAppearanceSignature(owned.appearance, owned.defId), before,
      'a forged off-berth paint intent cannot mutate the owned hull');
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].text, /dock|outfitting|Shipworks/i);

    state.mode = 'station';
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    const creditsBefore = state.player.credits;
    bus.emit('ui:setShipAppearance', {
      shipIndex: 0,
      appearance: commissioned,
      source: 'shipworks_paint_booth',
    });
    assert.equal(selectedPaintSchemeId(owned.defId, owned.appearance), 'dockyard_bone');
    assert.equal(state.player.credits, creditsBefore, 'commission coats are included with hull ownership');
    assert.equal(changed.length, 1);
    assert.equal(changed[0].id, player.id);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].shipIndex, 0);
    assert.deepEqual(player.data.appearance, commissioned);

    const preview = makeShipPreviewEntitySpec(owned.defId, 44, {
      isPlayer: true,
      fittings: owned.fittings,
      appearance: owned.appearance,
    });
    assert.deepEqual(preview.data.appearance, commissioned,
      'the real Shipworks turntable consumes the same normalized owned appearance');
    const palette = paletteWithShipAppearance(preview, {
      hull: '#777777', accent: '#999999', thruster: '#70d9ee', dark: '#20262a',
    });
    assert.equal(palette.hull, '#efe5c8');
    assert.equal(palette.accent, '#182b31');

    const save = runtime.getSystem('save');
    const envelope = save.serialize('plan44-paint-booth');
    assert.equal(save.loadEnvelope(structuredClone(envelope), 'plan44-paint-booth'), true);
    const restored = state.player.ownedShips[state.player.activeShipIndex];
    assert.equal(shipAppearanceSignature(restored.appearance, restored.defId),
      shipAppearanceSignature(commissioned, owned.defId));
  } finally {
    runtime.dispose();
  }
});
