import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SCAN_REVEAL_CLASS_RADIUS } from '../src/data/scanReveal.js';
import { scanReveal } from '../src/systems/scanReveal.js';

function ship(id, x, extra = {}) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    factionId: 'faction_reach',
    data: {
      defId: 'ship_wasp',
      shipClass: 'fighter',
      weapons: [{ defId: 'wpn_pulse_laser_s', facing: 'front' }],
      ...extra,
    },
  };
}

test('a scan pulse writes a loadout reveal onto a nearby ship', () => {
  const state = createGameState(47);
  state.playerId = 1;
  state.simTime = 4;
  const player = ship(1, 0);
  const contact = ship(2, 400);
  state.entities.set(1, player);
  state.entities.set(2, contact);
  state.entityList = [player, contact];
  const bus = createBus();
  const revealed = [];
  bus.on('scan:shipRevealed', (p) => revealed.push(p));
  const system = Object.create(scanReveal);
  system.init({ state, bus, helpers: {} });
  try {
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
    assert.ok(contact.data.scanRevealed, 'scan must stamp entity.data.scanRevealed');
    assert.equal(contact.data.scanRevealed.entityId, 2);
    assert.equal(contact.data.scanRevealed.quality, 'full');
    assert.ok(contact.data.scanRevealed.loadout.some((w) => w.id === 'wpn_pulse_laser_s'));
    assert.equal(revealed.length, 1);
    assert.equal(player.data.scanRevealed, undefined, 'the scanning ship is not a contact');
  } finally {
    system.destroy?.();
    bus.clear();
  }
});

test('a ship beyond class radius is not revealed', () => {
  const state = createGameState(48);
  state.playerId = 1;
  const player = ship(1, 0);
  const far = ship(2, SCAN_REVEAL_CLASS_RADIUS + 50);
  state.entities.set(1, player);
  state.entities.set(2, far);
  state.entityList = [player, far];
  const bus = createBus();
  const system = Object.create(scanReveal);
  system.init({ state, bus, helpers: {} });
  try {
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
    assert.equal(far.data.scanRevealed, undefined);
  } finally {
    system.destroy?.();
    bus.clear();
  }
});
