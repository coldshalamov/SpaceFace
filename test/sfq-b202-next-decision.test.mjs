// SFQ-B202 — the flight cluster answers the next decision, and stays quiet when it should.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readClusterModel } from '../src/ui/orrery/hudAdapter.js';
import { nextFlightDecision } from '../src/ui/orrery/nextDecision.js';

const QUIET = Object.freeze({
  hull: 80, hullMax: 100, shield: 40, shieldMax: 50, heat: 0.2,
  ordnance: { 1: { state: 'ready' } }, speed: 90, speedRef: 100,
});

test('SFQ-B202 a quiet cluster says nothing and a critical hull says break off', () => {
  assert.equal(nextFlightDecision(QUIET), '');
  assert.equal(nextFlightDecision(null), '');
  assert.equal(nextFlightDecision({ ...QUIET, hull: 29 }), 'Hull critical — disengage and repair at a station');
  assert.equal(nextFlightDecision({ ...QUIET, hull: 30 }), '');
  assert.equal(
    nextFlightDecision({ ...QUIET, hull: 20, shield: 0, heat: 0.9, ordnance: { 1: { state: 'empty' } }, speed: 200 }),
    'Hull critical — disengage and repair at a station',
  );
});

test('SFQ-B202 shield, heat, empty ordnance, and the governed mark speak in that order', () => {
  assert.equal(nextFlightDecision({ ...QUIET, shield: 0 }), 'Shield is down — keep the next hit off the hull');
  assert.equal(nextFlightDecision({ ...QUIET, shield: 1 }), '');
  assert.equal(nextFlightDecision({ ...QUIET, shieldMax: 0, shield: 0, heat: 0.76 }), 'Ease fire — the gun is hot');
  assert.equal(nextFlightDecision({ ...QUIET, heat: 0.75 }), '');
  assert.equal(
    nextFlightDecision({ ...QUIET, ordnance: { beam: { state: 'ready' }, rack: { state: 'empty', consumable: true } } }),
    'Ordnance is empty — restock at a station',
  );
  assert.equal(nextFlightDecision({ ...QUIET, speed: 103, speedRef: 100 }), '');
  assert.equal(nextFlightDecision({ ...QUIET, speed: 102, speedRef: 100 }), '');
});


test('a loaded production rail stays quiet when the detonate command has no deployed target', () => {
  const player = { id: 1, alive: true, hull: 80, hullMax: 100, shield: 40, shieldMax: 50,
    vel: { x: 200, z: 0 }, data: {}, flags: {}, pos: { x: 0, z: 0 }, maxSpeed: 100 };
  const state = { mode: 'flight', simTime: 0, playerId: 1, entities: new Map([[1, player]]),
    entityList: [player], player: { cargo: { items: { cmdty_impulse_charge: 3 } } }, fields: {},
    bombs: { rack: { cells: [{ id: 'bomb_frag', count: 2 }] }, selectedId: 'bomb_frag' } };
  const model = readClusterModel(state, player);
  assert.equal(model.ordnance['2'].state, 'empty');
  assert.equal(model.ordnance['2'].consumable, undefined);
  assert.equal(nextFlightDecision(model), '');
  state.player.cargo.items.cmdty_impulse_charge = 0;
  state.bombs.rack.cells[0].count = 0;
  assert.match(nextFlightDecision(readClusterModel(state, player)), /restock/);
});
