// Seed 4242. The after-action loss line names the killer hull when that ship has a
// name. A death with no hull name still reads the ship class. Coordinates never print.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTelemetry } from '../src/systems/telemetry.js';
import { deathCauseLabel } from '../src/ui/screens/gameOver.js';

const SEED = 4242;

test('seed 4242: deathCauseLabel names the killer hull', () => {
  const named = {
    cause: 'ship:fighter',
    killerType: 'fighter',
    killerName: 'Marrow Kite',
    killerFaction: 'faction_raiders',
    pos: { x: 8801, z: 8802 },
  };
  const label = deathCauseLabel(named);
  const classOnly = deathCauseLabel({
    cause: 'ship:fighter',
    killerType: 'fighter',
    killerFaction: 'faction_raiders',
  });
  assert.equal(label, 'Destroyed by Marrow Kite (Raiders)');
  assert.match(label, /Marrow Kite/);
  assert.doesNotMatch(label, /8801|8802/);
  assert.notEqual(label, classOnly);
  assert.equal(classOnly, 'Destroyed by Fighter (Raiders)');
  assert.match(classOnly, /Fighter/);
  assert.doesNotMatch(classOnly, /Marrow Kite/);
});

test('seed 4242: the death log copies the spawned hull name', () => {
  const state = createGameState(SEED);
  state.playerId = 1;
  state.simTime = 40;
  // Named lane contacts and scripted ships write data.name on the live hull.
  state.entities.set(9, {
    id: 9,
    type: 'ship',
    factionId: 'faction_raiders',
    data: { shipClass: 'fighter', name: 'Marrow Kite' },
  });
  state.entities.set(10, {
    id: 10,
    type: 'ship',
    factionId: 'faction_raiders',
    data: { shipClass: 'fighter' },
  });
  const bus = createBus();
  const telemetry = createTelemetry(bus, state);
  try {
    bus.emit('player:death', { killerId: 9, pos: { x: 3, z: 4 } });
    bus.emit('player:death', { killerId: 10, pos: { x: 5, z: 6 } });
    const log = telemetry.getSessionStats().deathLog;
    const named = log[log.length - 2];
    const unnamed = log[log.length - 1];
    assert.equal(named.killerName, 'Marrow Kite');
    assert.equal(named.cause, 'ship:fighter');
    assert.match(deathCauseLabel(named), /Marrow Kite/);
    assert.doesNotMatch(deathCauseLabel(named), /Fighter/);
    assert.equal(unnamed.killerName, null);
    assert.match(deathCauseLabel(unnamed), /Fighter/);
    assert.doesNotMatch(deathCauseLabel(unnamed), /Marrow Kite/);
  } finally {
    telemetry.dispose();
  }
});
