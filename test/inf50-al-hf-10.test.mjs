// AL-HF-10 — shoving Rook into the customs shutter costs him two seconds and posts
// a receipt. A crash he makes himself posts nothing, and his pace stays his own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { racingOfferFor } from '../src/data/raceLevels.js';
import { configureRacingCorridorSession, isRacingCorridorSession } from '../src/world/racingCorridor.js';
import {
  createRacingOpponents, racingTakedownReceipts, clearRacingTakedownReceipts, RACING_TAKEDOWN_LOSS_S,
} from '../src/missions/racingOpponents.js';
import { renderRacingRecognition } from '../src/ui/racingRecognition.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const SEED = 4242;

function memoryStorage() {
  const rows = new Map();
  return {
    getItem(key) { return rows.has(key) ? rows.get(key) : null; },
    setItem(key, value) { rows.set(key, String(value)); },
  };
}

function harness() {
  const sector = { id: 'sector_tethys_junction' };
  const player = {
    id: 1, type: 'ship', alive: true, radius: 18, rot: 0, mass: 20,
    pos: { x: 1_000_000, z: 1_000_000 }, vel: { x: 0, z: 0 }, data: { name: 'You' },
  };
  const state = {
    mode: 'flight', simTime: 1, tick: 60, meta: { seed: SEED }, playerId: 1,
    entities: new Map([[1, player]]), entityList: [player],
    world: { currentSectorId: sector.id, sectors: { [sector.id]: sector } },
    missions: { active: [] }, settings: { gameplay: {} }, ui: {}, input: { actions: {} },
  };
  configureRacingCorridorSession(state, true);
  let nextId = 10;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec, id: nextId++, alive: true,
        pos: { x: spec.pos.x, z: spec.pos.z },
        vel: { x: 0, z: 0 },
        data: spec.data,
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      state.entities.delete(id);
      const index = state.entityList.findIndex((row) => row.id === id);
      if (index >= 0) state.entityList.splice(index, 1);
    },
  };
  const offer = racingOfferFor('practice_level_junction_return');
  const mission = {
    id: 'heat-takedown', type: 'race', status: 'active',
    params: {
      ...offer.params, raceMode: 'race', raceOpponents: 1, raceDifficulty: 'club',
      raceStartSimS: 0, gridUntilSimS: 0,
    },
  };
  const bus = createBus();
  const receipts = [];
  bus.on('race:takedown', (row) => receipts.push(row));
  const pack = createRacingOpponents({ state, bus, helpers });
  const shutter = {
    id: 'tally-shutter', alive: true, radius: 20, pos: { x: 2_000_000, z: 2_000_000 },
    data: { name: 'Tally customs shutter', raceSetPiece: { id: 'tally_customs_shutter', kind: 'shutter' } },
  };
  state.entityList.push(shutter);
  return { state, player, mission, pack, shutter, receipts };
}

function settle(pack, mission, state, ship) {
  state.simTime += 0.1;
  pack.update(mission);
  ship.pos.x = 2_000_012;
  ship.pos.z = 2_000_000;
  state.simTime += 0.1;
  pack.update(mission);
}

test('seed 4242: shoving Rook into the shutter costs 2s and posts one receipt', () => {
  clearRacingTakedownReceipts();
  const { state, player, mission, pack, receipts } = harness();
  assert.equal(isRacingCorridorSession(state), true);
  pack.update(mission);
  const row = pack.inspect().rivals[0];
  assert.equal(row.id, 'rook');
  assert.equal(row.pace, 1);
  const rook = state.entities.get(row.entityId);
  settle(pack, mission, state, rook);
  player.pos.x = rook.pos.x - 28;
  player.pos.z = rook.pos.z;
  player.vel.x = 50;
  player.vel.z = 0;
  const now = state.simTime + 0.1;
  state.simTime = now;
  pack.update(mission);
  const hit = pack.inspect().rivals[0];
  assert.ok(hit.lostS >= RACING_TAKEDOWN_LOSS_S);
  assert.ok(hit.resumeAt - now >= RACING_TAKEDOWN_LOSS_S - 1e-9);
  assert.equal(rook.data.intent.brake, true);
  assert.equal(rook.data.intent.moveZ, 0);
  assert.equal(hit.pace, 1);
  assert.equal(hit.difficulty, 'club');
  assert.equal(racingTakedownReceipts().length, 1);
  assert.equal(receipts.length, 1);
  for (let i = 0; i < 5; i++) {
    state.simTime += 0.05;
    pack.update(mission);
  }
  assert.equal(pack.inspect().rivals[0].lostS, RACING_TAKEDOWN_LOSS_S);
  assert.equal(racingTakedownReceipts().length, 1);
  state.simTime = hit.resumeAt + 0.02;
  pack.update(mission);
  const after = pack.inspect().rivals[0];
  assert.equal(after.pace, 1);
  assert.equal(after.difficulty, 'club');
  assert.equal(rook.data.intent.brake, false);
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  try {
    const lines = textLines(renderRacingRecognition(memoryStorage()));
    assert.ok(lines.some((line) => line === 'Takedown · Rook Six lost 2.00s in the Tally customs shutter.'));
  } finally {
    globalThis.document = previousDocument;
    clearRacingTakedownReceipts();
  }
});

test('seed 4242: Rook hitting the shutter by himself posts no receipt and loses no time', () => {
  clearRacingTakedownReceipts();
  const { state, player, mission, pack } = harness();
  pack.update(mission);
  const rook = state.entities.get(pack.inspect().rivals[0].entityId);
  player.pos.x = 1_000_000;
  player.pos.z = 1_000_000;
  player.vel.x = 0;
  player.vel.z = 0;
  settle(pack, mission, state, rook);
  rook.pos.x = 2_000_000;
  rook.pos.z = 2_000_000;
  state.simTime += 0.1;
  pack.update(mission);
  const row = pack.inspect().rivals[0];
  assert.equal(row.lostS, 0);
  assert.equal(row.resumeAt, null);
  assert.equal(row.pace, 1);
  assert.equal(racingTakedownReceipts().length, 0);
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  try {
    const lines = textLines(renderRacingRecognition(memoryStorage()));
    assert.equal(lines.some((line) => line.startsWith('Takedown')), false);
  } finally {
    globalThis.document = previousDocument;
    clearRacingTakedownReceipts();
  }
});
