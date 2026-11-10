// NXI-082: A depleted rock does not animate a successful cargo grant.
// When rock deep-core budget is exhausted (budget <= 0), drilling a vein still breaks the cell
// (clears the tile), but does NOT emit `drill:yield` or grant cargo.

import assert from 'node:assert/strict';
import test from 'node:test';
import { drill } from '../src/systems/drill.js';

function harness(asteroidData = {}) {
  const events = [];
  const cargo = {
    items: {},
    usedVolume: 20,
    usedMass: 10,
    capVolume: 100,
    capMass: 200,
  };
  const asteroid = {
    id: 99,
    type: 'asteroid',
    data: {
      fieldId: 'field_test',
      yieldU: 10,
      drillYieldMax: 10,
      drillDepletion: 1, // depleted!
      lastDrillT: 100,
      ...asteroidData,
    },
  };
  const state = {
    simTime: 100,
    playerId: 1,
    player: { cargo, miningBeam: { tierId: 'beam_mk1', dps: 20 } },
    entities: new Map([
      [1, { id: 1, type: 'ship', data: {} }],
      [99, asteroid],
    ]),
    world: { currentSectorId: 'sector_test' },
    fieldDepletion: {
      schemaVersion: 1,
      fields: {},
      receipts: [],
    },
    rng: () => 0.5,
  };
  const bus = {
    on() { return () => {}; },
    emit(type, payload) { events.push({ type, payload }); },
  };
  drill.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, cargo, asteroid, events };
}

test('NXI-082: drilling a vein on a depleted rock clears the tile, emits warn/rockDepleted, and suppresses drill:yield and cargo', () => {
  const { state, cargo, events } = harness();

  assert.equal(drill.begin(99), true);
  assert.equal(state.drill.rockBudget, 0, 'session budget is zero on depleted rock');

  // Place a vein directly below the avatar
  const d = state.drill;
  const col = d.avatar.col;
  const row = d.avatar.row + 1;
  d.field[col][row] = {
    type: 'vein', hp: 0.01, maxHp: 5, ore: 'cmdty_silicate', yieldU: 3,
    hazard: false, tierReq: 1, hardness: 1,
  };

  // Drill down through the vein
  for (let i = 0; i < 40; i++) {
    drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
  }

  // Cell must be cleared (broken/empty), not remaining as a vein
  assert.equal(d.field[col][row].type, 'empty', 'tile is cleared/broken');

  // Must NOT emit drill:yield (which would trigger the cargo grant HUD animation)
  const yieldEvents = events.filter((e) => e.type === 'drill:yield');
  assert.equal(yieldEvents.length, 0, 'drill:yield must not be emitted on depleted rock');

  // Cargo must not be granted
  assert.equal(cargo.items.cmdty_silicate, undefined, 'no silicate granted to hold');
  assert.equal(cargo.usedVolume, 20, 'cargo volume unchanged');
  assert.equal(state.drill.yieldLog.cmdty_silicate, undefined, 'yield log has no silicate');

  // Must emit rockDepleted and warn
  assert.ok(events.some((e) => e.type === 'drill:rockDepleted'), 'drill:rockDepleted emitted');
  assert.ok(
    events.some((e) => e.type === 'drill:warn' && e.payload && e.payload.reason === 'depleted'),
    'drill:warn emitted with reason depleted',
  );

  drill.end();
});
