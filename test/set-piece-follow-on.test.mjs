// §22 B7 — convoy loss becomes salvage, a heist becomes an escape,
// a disabled ship becomes a tow. Each ends in a contract. None fails the run.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { AUTHORED_SET_PIECES } from '../src/data/missions.js';
import { setPieceFollowOnOffer } from '../src/data/sandboxSetPieceFollowOns.js';
import { missions } from '../src/systems/missions.js';

const EXPECTED = Object.freeze({
  convoy_defence: Object.freeze({ type: 'salvage_retrieval', title: 'Recover the stripped pods' }),
  loud_heist: Object.freeze({ type: 'smuggling_run', title: 'Run the take to the den' }),
  station_door_jam: Object.freeze({ type: 'tow_recovery', title: 'Tow the dead frigate clear' }),
});

function boot(seed) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const failed = [];
  sim.bus.on('mission:failed', (payload) => failed.push(payload));
  return { sim, state, failed, missionsSys: sim.registry.get('missions') };
}

function finishPiece(seed, pieceId) {
  const h = boot(seed);
  const definition = AUTHORED_SET_PIECES.find((row) => row && row.id === pieceId);
  assert.ok(definition, pieceId);
  const board = h.missionsSys.ensureBoard(definition.startStationId);
  const offer = (board.slots || []).find((row) => (
    row && row.params && row.params.authoredSetPieceId === pieceId
  ));
  assert.ok(offer, `${pieceId} posts on ${definition.startStationId}`);
  offer.collateral_cr = 0;
  assert.equal(h.missionsSys.acceptMission(offer.id), true, `${pieceId} accepts`);
  const index = h.state.missions.active.findIndex((row) => (
    row && row.params && row.params.authoredSetPieceId === pieceId && row.status === 'active'
  ));
  assert.ok(index >= 0, `${pieceId} is active`);
  const mission = h.state.missions.active[index];
  assert.equal(h.missionsSys._completePhysical(mission, index, definition.methods[0]), true);
  const nextBoard = h.missionsSys.ensureBoard(definition.destStationId);
  const next = (nextBoard.slots || []).find((row) => (
    row && row.source === 'setPieceFollowOn' && row.params && row.params.fromSetPieceId === pieceId
  ));
  return { h, next };
}

test('the three sandbox situations each end in a contract on seeds 4242 and 8008', () => {
  for (const seed of [4242, 8008]) {
    for (const [pieceId, expected] of Object.entries(EXPECTED)) {
      const { h, next } = finishPiece(seed, pieceId);
      assert.ok(next, `${pieceId} seed ${seed} boards a follow-on`);
      assert.equal(next.type, expected.type);
      assert.equal(next.title, expected.title);
      assert.equal(next.cause.failReload, false);
      assert.equal(next.params.failReload, false);
      assert.equal(h.failed.length, 0, `${pieceId} must not fail the run`);
      assert.equal(h.state.missions.active.some((row) => row && row.id === next.id), false,
        'the follow-on waits on the board');
      h.sim.dispose();
    }
  }
});

test('a board refresh keeps the follow-on until its epoch lifetime ends', () => {
  const { h, next } = finishPiece(4242, 'convoy_defence');
  const stationId = next.stationId;
  const epoch = h.missionsSys._epoch();
  h.state.simTime = (epoch + 1) * 600 + 1;
  const refreshed = h.missionsSys.ensureBoard(stationId);
  const kept = (refreshed.slots || []).find((row) => row && row.id === next.id);
  assert.ok(kept, 'the salvage contract survives the next board epoch');
  h.state.simTime = (next.expiresAtEpoch + 1) * 600;
  const expired = h.missionsSys.ensureBoard(stationId);
  assert.equal((expired.slots || []).some((row) => row && row.id === next.id), false,
    'the contract leaves when its lifetime ends');
  assert.equal(h.failed.length, 0);
  h.sim.dispose();
});

test('a finished heist can be accepted as the escape, and other pieces mint nothing', () => {
  const { h, next } = finishPiece(4242, 'loud_heist');
  assert.equal(h.missionsSys.acceptMission(next.id), true);
  const escape = h.state.missions.active.find((row) => row && row.type === 'smuggling_run');
  assert.ok(escape, 'the escape is a live contract');
  assert.equal(escape.destStationId, 'station_smuggler');
  assert.equal(h.failed.length, 0);
  h.sim.dispose();

  const unrelated = setPieceFollowOnOffer('wrecking_ball', {
    id: 'm-wreck',
    destStationId: 'station_forge',
  }, 2);
  assert.equal(unrelated, null);
});
