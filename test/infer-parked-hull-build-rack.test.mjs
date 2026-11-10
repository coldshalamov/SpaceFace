import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ships } from '../src/systems/ships.js';
import { bombs } from '../src/systems/bombs.js';
import { loadoutRejectionSpeech } from '../src/ui/ship/loadoutPresets.js';

function harness() {
  const state = createGameState(4710);
  state.mode = 'flight';
  state.playerId = 1;
  state.player.credits = 10000;
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [0, 1].map(() => ({ defId: 'ship_kestrel', fittings: Array(7).fill(null) }));
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  bus.on('economy:chargeCredits', req => {
    if (req.amount > state.player.credits) { req.result = false; return; }
    req.commit?.(); state.player.credits -= Math.max(0, req.amount || 0); req.result = true;
  });
  const owner = Object.create(ships);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  const rackOwner = Object.create(bombs);
  rackOwner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  state.bombs.rack = { sockets: 2, cells: [{ id: 'bomb_frag', count: 3 }, { id: 'bomb_emp', count: 1 }] };
  state.bombs.stock = {};
  return { state, bus, owner, rackOwner };
}

test('banking a parked hull keeps the active ship bomb rack out of its build', () => {
  const { state, owner } = harness();
  assert.equal(owner.saveLoadoutPreset({ shipIndex: 1, presetId: 'parked' }), true);
  const preset = state.player.loadoutPresets.find(row => row.id === 'parked');
  assert.equal(Object.hasOwn(preset, 'rackPayloadIds'), false);
  assert.equal(Object.hasOwn(preset, 'rackSockets'), false);
});

test('a rack-bearing build on a parked hull refuses before spending or preparing another hull', () => {
  const { state, bus, owner } = harness();
  owner.saveLoadoutPreset({ shipIndex: 0, presetId: 'armed' });
  const before = JSON.stringify({ rack: state.bombs, ships: state.player.ownedShips, credits: state.player.credits });
  let previews = 0;
  let rejection;
  bus.on('ui:previewBombRackPreparation', () => previews++);
  bus.on('ship:loadoutPresetApplyRejected', p => { rejection = p; });
  assert.equal(owner.applyLoadoutPreset({ shipIndex: 1, presetId: 'armed' }), false);
  assert.equal(previews, 0);
  assert.equal(JSON.stringify({ rack: state.bombs, ships: state.player.ownedShips, credits: state.player.credits }), before);
  assert.equal(rejection.reason, 'rack_inactive_hull');
  assert.equal(loadoutRejectionSpeech(rejection.reason), 'Switch to this hull before preparing its bomb rack');
});

test('a module-only parked build and an active rack build still apply', () => {
  const { state, owner } = harness();
  owner.saveLoadoutPreset({ shipIndex: 1, presetId: 'parked' });
  owner.saveLoadoutPreset({ shipIndex: 0, presetId: 'armed' });
  assert.equal(owner.applyLoadoutPreset({ shipIndex: 1, presetId: 'parked' }), true);
  assert.equal(owner.applyLoadoutPreset({ shipIndex: 0, presetId: 'armed' }), true);
});
