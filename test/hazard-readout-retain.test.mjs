// Nested same-type hazard discs: a machine mouth sits inside an authored sector field.
// Leaving the mouth while the field still holds the player must NOT drop the HUD readout -
// the exit event names only a zoneType, so hazardHints scans the live sector zones before
// clearing (the same law alerts.js already obeys for its pill).
import test from 'node:test';
import assert from 'node:assert/strict';

import { hazardHints } from '../src/data/hazardLanguage.js';

function fakeBus() {
  const handlers = new Map();
  return {
    on(ev, fn) {
      let list = handlers.get(ev);
      if (!list) handlers.set(ev, (list = []));
      list.push(fn);
    },
    off() {},
    emit(ev, payload) {
      for (const fn of handlers.get(ev) || []) fn(payload);
    },
  };
}

function makeState(playerPos, hazards) {
  const entities = new Map();
  entities.set('player', { id: 'player', pos: playerPos });
  return {
    playerId: 'player',
    simTime: 10,
    entities,
    ui: {},
    world: { activeSector: { hazards } },
  };
}

// Ashfall geometry: the scarecrow mouth disc nested inside the authored 800 WU debris field.
const ASHFALL_DISCS = [
  { id: null, type: 'debris', center: { x: 400, z: 300 }, radius: 800 },
  { id: 'ashfall_claim_scarecrow', type: 'debris', center: { x: 480, z: 410 }, radius: 260 },
];

test('hazard readout survives exiting a nested same-type disc', () => {
  const bus = fakeBus();
  const state = makeState({ x: 480, z: 410 }, ASHFALL_DISCS);
  hazardHints.init({ bus, state });
  try {
    bus.emit('hazard:enter', { entityId: 'player', zoneType: 'debris' });
    assert.ok(state.ui.hazardRead, 'hazard:enter raises the readout');
    assert.equal(state.ui.hazardRead.type, 'debris');

    // Exiting the machine mouth while the authored field still holds the player.
    bus.emit('hazard:exit', { entityId: 'player', zoneType: 'debris' });
    assert.ok(state.ui.hazardRead, 'a same-type disc still holds the player - readout stays');

    // A different hazard type leaving never touches the live readout.
    bus.emit('hazard:exit', { entityId: 'player', zoneType: 'radiation' });
    assert.ok(state.ui.hazardRead, 'untyped exit leaves the debris readout alone');

    // Truly leaving every debris zone clears it.
    state.entities.get('player').pos.x += 2000;
    bus.emit('hazard:exit', { entityId: 'player', zoneType: 'debris' });
    assert.equal(state.ui.hazardRead, null, 'the last same-type zone clears the readout');
  } finally {
    hazardHints.destroy();
  }
});

test('the once-per-type counterplay hint speaks on a channel that can win the floor', () => {
  const bus = fakeBus();
  const state = makeState({ x: 480, z: 410 }, ASHFALL_DISCS);
  const said = [];
  hazardHints.init({ bus, state, helpers: { voice: { say: (m) => { said.push(m); return true; } } } });
  try {
    bus.emit('hazard:enter', { entityId: 'player', zoneType: 'debris' });
    assert.equal(said.length, 1, 'first entry speaks the counterplay hint');
    // 'warn' was never an arbiter channel — it fell to info priority (10) and the hint lost
    // the floor to barks/news exactly when first contact made it matter. Teaching rides
    // 'tutorial' (70): preempts chatter/objective and can hold during onboarding protection.
    assert.equal(said[0].channel, 'tutorial');
    assert.match(said[0].text, /tether|route|speed|time/i);
    bus.emit('hazard:enter', { entityId: 'player', zoneType: 'debris' });
    assert.equal(said.length, 1, 'same type stays silent after the first hint');
  } finally {
    hazardHints.destroy();
  }
});

test('machinery boundary exits (zoneId, no entityId) obey the same retain law', () => {
  const bus = fakeBus();
  const state = makeState({ x: 480, z: 410 }, ASHFALL_DISCS);
  hazardHints.init({ bus, state });
  try {
    bus.emit('hazard:enter', { zoneType: 'debris', zoneId: 'ashfall_claim_scarecrow', siteId: 'ashfall_claim_scarecrow' });
    assert.ok(state.ui.hazardRead, 'machine enter raises the readout');

    // The mouth-field exit while the authored debris disc still wraps the player.
    bus.emit('hazard:exit', { zoneType: 'debris', zoneId: 'ashfall_claim_scarecrow', siteId: 'ashfall_claim_scarecrow' });
    assert.ok(state.ui.hazardRead, 'the authored disc still holds - readout stays');

    // Clearing happens once nothing of that type contains the player.
    state.entities.get('player').pos.x += 2000;
    bus.emit('hazard:exit', { zoneType: 'debris', zoneId: 'ashfall_claim_scarecrow', siteId: 'ashfall_claim_scarecrow' });
    assert.equal(state.ui.hazardRead, null);
  } finally {
    hazardHints.destroy();
  }
});
