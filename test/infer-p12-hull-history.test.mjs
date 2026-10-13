// SFQ-I048 — the ship-history page reads the hull that is flying.
// Hull A's damage stays on A. Hull B's page does not wear it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { livingHullWithScar } from '../src/core/livingHull.js';
import { ships } from '../src/systems/ships.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';

function scar(spec) {
  return livingHullWithScar(null, spec, spec.atT || 0);
}

function pageText(state) {
  return buildShipLedger(state).entries.map((entry) => entry.text).join('\n');
}

test('switching hulls shows each hull its own damage and keeps the other intact', () => {
  const hullA = scar({
    cause: 'weapon', band: 'crushing', facing: 'port beam', surface: 'weapon', tick: 3, atT: 3,
  });
  const hullB = scar({
    cause: 'slam', band: 'graze', facing: 'stern', surface: 'terrain', tick: 9, atT: 9,
  });
  const state = {
    meta: { seed: 4242 },
    tick: 10,
    simTime: 10,
    playerId: 1,
    entities: new Map(),
    player: {
      credits: 0,
      activeShipIndex: 0,
      cargo: { usedVolume: 0, items: {} },
      ownedShips: [
        { defId: 'ship_kestrel', name: 'Keel', livingHull: hullA },
        { defId: 'ship_mule', name: 'Mio', livingHull: hullB },
      ],
    },
  };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, hull: 100, shield: 0, cap: 0,
    data: { defId: 'ship_kestrel', livingHull: hullA },
  });
  ships.init({ state, bus: createBus(), helpers: {} });

  const onA = pageText(state);
  assert.match(onA, /crushing/);
  assert.match(onA, /port beam/);
  assert.match(onA, /gunfire/);
  assert.doesNotMatch(onA, /rock/);

  assert.equal(ships.setActiveShip(1), true);
  const onB = pageText(state);
  assert.match(onB, /grazing/);
  assert.match(onB, /stern/);
  assert.match(onB, /rock/);
  assert.doesNotMatch(onB, /crushing/);
  assert.doesNotMatch(onB, /gunfire/);
  assert.equal(state.entities.get(1).data.livingHull.scars[0].band, 'graze');

  assert.equal(ships.setActiveShip(0), true);
  const back = pageText(state);
  assert.match(back, /crushing/);
  assert.match(back, /port beam/);
  assert.doesNotMatch(back, /rock/);
  assert.equal(state.player.ownedShips[0].livingHull.scars[0].band, 'crushing');
  assert.equal(state.player.ownedShips[1].livingHull.scars[0].band, 'graze');
  assert.equal(state.entities.get(1).data.livingHull.scars[0].band, 'crushing');
});
