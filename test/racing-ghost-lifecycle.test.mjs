import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';
import { racingOfferFor, raceGateGlobals } from '../src/data/raceLevels.js';
import { raceRecordKey } from '../src/systems/racingSteer.js';
import { RACING_GHOST_STORAGE_KEY, readRacingGhost, getRacingGhostPlayback,
  validateRacingGhost, listRacingGhosts, sampleRacingGhost } from '../src/systems/racingGhosts.js';

function fixture(t) {
  const rows = new Map(), storage = {
    getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)),
    removeItem: key => rows.delete(key),
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  const state = createGameState(4127), bus = createBus(), host = Object.create(missions);
  const player = { id: 1, kind: 'ship', team: 1, alive: true,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 100, z: 0 }, rot: 0, mass: 10,
    data: { shipDefId: 'ship_kestrel' } };
  state.mode = 'flight'; state.playerId = player.id; state.entities.set(player.id, player);
  host.init({ state, bus, helpers: {} });
  const events = [];
  bus.on('mission:gateCleared', event => events.push(event));
  let serial = 0;
  function launch(raceMode = 'time_trial', raceDifficulty = 'club') {
    const offer = racingOfferFor('contract_textile_qual');
    // Short straight geometry isolates the mission/recorder seam. Positions remain continuous;
    // the real owner finds every ordered plane crossing and interpolates its timestamp.
    const params = { ...offer.params, raceMode, raceDifficulty, gridHoldS: 0,
      gridUntilSimS: state.simTime, closedCircuit: false, laps: 1, nextGate: 0, lap: 0,
      gates: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }] };
    const mission = { ...offer, id: `ghost_heat_${++serial}`, status: 'active', params };
    state.world.currentSectorId = params.courseSectorId;
    state.missions.active = [mission];
    const first = raceGateGlobals(params)[0], start = state.simTime;
    player.pos.x = first.x - 10; player.pos.z = first.z;
    host._driveAuthoredRace(mission, 0, state);
    let tick = 0;
    function step() {
      tick++;
      state.tick++; state.simTime = start + tick / 60;
      player.pos.x = first.x - 10 + 100 * tick / 60;
      host._driveAuthoredRace(mission, 0, state);
    }
    function finish() { while (params.nextGate < params.gates.length && tick < 140) step(); }
    return { mission, params, step, finish, first, start };
  }
  return { state, bus, host, player, storage, launch, events };
}

test('mission-owned 60 Hz traces persist and replay compatible time-trial and pack ghosts', async t => {
  for (const mode of ['time_trial', 'race', 'cup']) await t.test(mode, t => {
    const h = fixture(t), run = h.launch(mode);
    run.finish();
    assert.equal(run.mission.status, 'completed');
    assert.equal(run.params.raceClean, true);
    assert.equal(run.params.raceGhostSaved, true);
    const tape = readRacingGhost(h.storage, run.params, h.state);
    assert.ok(validateRacingGhost(tape));
    assert.equal(tape.meta.key, raceRecordKey(run.params));
    assert.deepEqual(tape.gates.map(gate => gate.slice(0, 2)), [[0, 0], [0, 1], [0, 2]]);
    assert.ok(Math.abs(tape.duration - 2.1) < 1e-6);
    assert.ok(Math.abs(sampleRacingGhost(tape, 1).x - (run.first.x + 90)) < 1e-6);
    assert.equal(listRacingGhosts(h.storage).length, 1);
    const saved = h.storage.getItem(RACING_GHOST_STORAGE_KEY);

    const next = h.launch(mode);
    assert.deepEqual(getRacingGhostPlayback(h.state, next.params), tape);
    h.state.world.frameOrigin = { x: next.first.x + 800, z: next.first.z - 400 };
    for (let i = 0; i < 12; i++) next.step();
    assert.ok(Math.abs(h.events.at(-1).ghostDeltaS) < 1e-6,
      'the next launch compares a real gate event with the saved crossing, independent of render origin');
    if (mode !== 'time_trial') {
      assert.equal(getRacingGhostPlayback(h.state, { ...next.params, raceDifficulty: 'expert' }), null);
      assert.equal(getRacingGhostPlayback(h.state, { ...next.params, raceMode: 'time_trial' }), null);
      assert.deepEqual(getRacingGhostPlayback(h.state, { ...next.params,
        raceMode: mode === 'race' ? 'cup' : 'race' }), tape,
      'race and cup share the same pack difficulty category');
    }
    assert.equal(h.storage.getItem(RACING_GHOST_STORAGE_KEY), saved);
  });
});

test('abort, load and expiry discard the mission recording before a stale run can finish', async t => {
  for (const terminal of ['abort', 'load', 'expiry']) await t.test(terminal, t => {
    const h = fixture(t), run = h.launch();
    for (let i = 0; i < 30; i++) run.step();
    assert.equal(run.params.nextGate, 1);
    assert.equal(h.storage.getItem(RACING_GHOST_STORAGE_KEY), null);
    if (terminal === 'abort') {
      h.bus.emit('race:abort');
      assert.equal(run.mission.status, 'failed');
      assert.equal(h.state.missions.active.some(m => m.id === run.mission.id), false);
    } else if (terminal === 'expiry') {
      h.host._expireMission(run.mission, 0);
      assert.equal(run.mission.status, 'expired');
      assert.equal(h.state.missions.active.some(m => m.id === run.mission.id), false);
    } else {
      h.bus.emit('save:restoring');
      h.host.deserialize(h.host.serialize());
      assert.notEqual(h.state.missions.active[0], run.mission);
    }
    // Deliberately drain the old reference through the same owner after disposal. Without
    // lifecycle cleanup its private observer would still hold the first half of this trace.
    run.finish();
    assert.equal(run.params.raceGhostSaved, false);
    assert.equal(h.storage.getItem(RACING_GHOST_STORAGE_KEY), null);

    const fresh = h.launch();
    fresh.finish();
    assert.equal(fresh.params.raceGhostSaved, true, 'cleanup must also permit a fresh complete recording');
    assert.ok(validateRacingGhost(readRacingGhost(h.storage, fresh.params, h.state)));
  });
});
