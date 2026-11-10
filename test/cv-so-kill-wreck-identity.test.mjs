// CV-SO slice — "a wreck is often a kit, not the ship you killed". The aftermath marker already
// owns the victim's callsign (provenance.victimLabel); the scan pulse that resolves the hulk now
// names it on every scanLabel surface (target lock, comms, roster) instead of the kit tag.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { scanner } from '../src/systems/scanner.js';

function wreck(id, x, data = {}) {
  return {
    id, type: 'wreck', alive: true, team: 0,
    pos: { x, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 100, hull: 1, hullMax: 1,
    data: {
      wreckClass: 'battlefield',
      wreckClassLabel: 'Battlefield Wreck',
      scanLabel: 'Freight-Laced Hulk',
      salvagePool: { cmdty_scrap_metal: 3 },
      ...data,
    },
  };
}

function boot() {
  const state = createGameState(31);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 1300;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_a';
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const sys = Object.create(scanner);
  sys.init({ state, bus });
  return { state, bus, sys, player };
}

function addWreck(state, entity) {
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

function pulse(sys, state, player) {
  sys._pulse(state, player, state.simTime);
}

test('a scanned kill wreck names the ship it was, on first resolve only', () => {
  const { state, bus, sys, player } = boot();
  const resolved = [];
  bus.on('scan:wreckResolved', (p) => resolved.push(p));
  addWreck(state, wreck(10, 300, {
    markerId: 'aft_named',
    provenance: {
      source: 'battle-aftermath', markerId: 'aft_named', sectorId: 'sector_a',
      zoneName: 'Helios Anchorage', victimClass: 'hauler', victimLabel: 'MERIDIA SPOKE',
      killerId: 1,
    },
    markerId: 'aft_named',
  }));

  pulse(sys, state, player);

  const data = state.entities.get(10).data;
  assert.equal(data.scanned, true);
  assert.equal(data.scanLabel, 'Hulk of MERIDIA SPOKE');
  assert.ok(Array.isArray(data.manifest) && data.manifest.length > 0, 'manifest still resolves');
  assert.ok(data.weakPoint, 'weak point still resolves');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].markerId, 'aft_named', 'the law door keeps the marker key');

  // A second pulse is a no-op for the name and never re-fires the resolve.
  pulse(sys, state, player);
  assert.equal(state.entities.get(10).data.scanLabel, 'Hulk of MERIDIA SPOKE');
  assert.equal(resolved.length, 1);
});

test('a class-echo victim keeps the authored hulk label', () => {
  const { state, bus, sys, player } = boot();
  bus.on('scan:wreckResolved', () => {});
  addWreck(state, wreck(11, 300, {
    markerId: 'aft_generic',
    provenance: {
      source: 'battle-aftermath', markerId: 'aft_generic', sectorId: 'sector_a',
      victimClass: 'ship', victimLabel: 'ship', killerId: 9,
    },
  }));
  pulse(sys, state, player);
  assert.equal(state.entities.get(11).data.scanLabel, 'Freight-Laced Hulk');
});

test('the player wreck reads Your Hull, never the victim rewrite', () => {
  const { state, bus, sys, player } = boot();
  bus.on('scan:wreckResolved', () => {});
  addWreck(state, wreck(12, 300, {
    playerWreck: true,
    scanLabel: 'Your Hull',
    provenance: {
      source: 'player_wreck', markerId: 'pwreck_x', sectorId: 'sector_a',
      victimClass: 'ship', victimLabel: 'Your Hull', killerId: null,
    },
  }));
  pulse(sys, state, player);
  assert.equal(state.entities.get(12).data.scanLabel, 'Your Hull');
});

test('a wreck with no provenance keeps the generic resolve unchanged', () => {
  const { state, sys, player } = boot();
  addWreck(state, wreck(13, 300));
  pulse(sys, state, player);
  const data = state.entities.get(13).data;
  assert.equal(data.scanned, true);
  assert.equal(data.scanLabel, 'Freight-Laced Hulk');
});
