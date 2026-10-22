import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { SECTORS, dangerIndex } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { sectorSim, effectiveDangerFor } from '../src/systems/sectorSim.js';
import { materializeEndingWorldPresence } from '../src/systems/endingWorldPresence.js';
import { traffic } from '../src/systems/traffic.js';
import { ENDING_WORLD_FACTS, replayStandingLines } from '../src/story/endings/worldAfter.js';
import { createPostEndingContinuity, normalizePostEndingContinuity } from '../src/story/endings/resolve.js';
import { postEndingReplayChain } from '../src/data/postEndingReplayChains.js';
import { postEndingReplay, ensurePostEndingReplayState, buildPostEndingReplayOffer } from '../src/systems/postEndingReplay.js';

function bus() {
  const handlers = new Map();
  return { on(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list);
    return () => handlers.set(name, list.filter(item => item !== fn)); },
  emit(name, payload) { for (const fn of [...(handlers.get(name) || [])]) fn(payload); } };
}

function stateFor(choice) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.story.endgameChoice = choice;
  state.story.endgameResolved = true;
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.entities = new Map(); state.entityList = [];
  return state;
}

function materialize(state, stationId = 'station_ashcache') {
  const station = { id: 100, type: 'station', alive: true, pos: { x: 2000, z: -1000 }, data: { stationId } };
  state.entities.set(station.id, station); state.entityList.push(station);
  let nextId = 101;
  return { active: [], helpers: { spawnEntity(spec) {
    const entity = { ...spec, id: nextId++, alive: true };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } }, station };
}

test('4242: all five filed endings put a distinct faction watch and traffic body within one minute of Ash Cache, including after reload', () => {
  for (const choice of Object.keys(ENDING_WORLD_FACTS)) {
    const state = stateFor(choice);
    const cast = materialize(state);
    const bodies = materializeEndingWorldPresence(state, cast.helpers, cast.active);
    assert.equal(bodies.filter(e => e.type === 'ship').length, 2);
    assert.ok(bodies.every(e => e.data.factionId === ENDING_WORLD_FACTS[choice].factionId));
    assert.ok(bodies.every(e => Math.hypot(e.pos.x - cast.station.pos.x, e.pos.z - cast.station.pos.z) < 600));
    assert.equal(materializeEndingWorldPresence(state, cast.helpers, cast.active).length, bodies.length);
    assert.equal(state.entityList.length, 1 + bodies.length, 'duplicate enter/load does not mint another cast');
    if (choice === 'A') assert.match(bodies[0].data.scanLabel, /Concord.*picket/);
    if (choice === 'B') assert.equal(bodies.filter(e => e.type === 'beacon').length, 2);

    const restored = stateFor(null);
    restored.story = JSON.parse(JSON.stringify(state.story));
    const reloadCast = materialize(restored);
    assert.deepEqual(materializeEndingWorldPresence(restored, reloadCast.helpers).map(e => e.data.endingWorldKey),
      bodies.map(e => e.data.endingWorldKey));
  }
});

test('4242: Quiet beacons also mark the Sker quiet route; no ending leaks into a fresh life', () => {
  const state = stateFor('B'); state.world.currentSectorId = 'sector_sker_haven';
  const cast = materialize(state, 'station_sker');
  assert.equal(materializeEndingWorldPresence(state, cast.helpers).filter(e => e.type === 'beacon').length, 2);
  state.story.endgameChoice = null;
  assert.deepEqual(materializeEndingWorldPresence(state, cast.helpers), []);
});

test('4242: the default traffic owner materializes the filed ending on chosen and save-loaded events', () => {
  const state = stateFor(null), eventBus = bus(), cast = materialize(state);
  const sys = { ...traffic };
  sys.init({ state, bus: eventBus, helpers: cast.helpers, registry: { get: () => null } });
  state.story.endgameChoice = 'A';
  eventBus.emit('endgame:chosen', { choice: 'A' });
  assert.equal(state.entityList.filter(e => e.data?.endingWorldKey).length, 2);
  eventBus.emit('save:loaded', {});
  assert.equal(state.entityList.filter(e => e.data?.endingWorldKey).length, 2);
  assert.equal(sys._active.filter(id => state.entities.get(id)?.data?.endingWorldKey).length, 2);
  sys.destroy();
});

test('4242: every ending changes the executable Ash Cache quote, and terms survive story reload', () => {
  for (const choice of Object.keys(ENDING_WORLD_FACTS)) {
    const state = stateFor(null);
    state.player.credits = 100000;
    state.player.cargo.capVolume = 1000;
    const sys = { ...economy };
    sys.init({ state, bus: bus(), helpers: {}, registry: { get: () => null } }); sys.newGame();
    const before = sys.quote('station_ashcache', 'cmdty_food', 'buy', 2);
    assert.equal(before.ok, true);
    state.story.endgameChoice = choice;
    const after = sys.quote('station_ashcache', 'cmdty_food', 'buy', 2);
    assert.equal(after.ok, true); assert.notEqual(after.total, before.total, choice);
    state.story = JSON.parse(JSON.stringify(state.story));
    const executable = sys.quote('station_ashcache', 'cmdty_food', 'buy', 2);
    assert.equal(executable.total, after.total);
    const credits = state.player.credits;
    const bought = sys.execute('station_ashcache', 'cmdty_food', 'buy', 2);
    assert.equal(bought.ok, true); assert.equal(credits - state.player.credits, executable.total);
  }
  economy._instance = null;
});

function unlock(state, choice) {
  const rec = createPostEndingContinuity(choice, 0, 4242);
  const prefix = rec.signal === 'economy:tradeCompleted' ? 'trade:station_test_:cmdty_test_' : 'mission:test_';
  state.story.postEnding = normalizePostEndingContinuity({ ...rec,
    seenKeys: Array.from({ length: rec.target }, (_, index) => prefix + index), completedAtS: 30 });
}

function finishChain(state, branchId, eventBus) {
  const sys = { ...postEndingReplay }; sys.init({ state, bus: eventBus });
  const chain = postEndingReplayChain(state.story.endgameChoice);
  const branch = chain.branches.find(row => row.id === branchId);
  let offered;
  eventBus.on('mission:offered', offer => { offered = offer; eventBus.emit('mission:offerBoarded', {
    offerId: offer.id, source: offer.source, causeFingerprint: offer.cause.fingerprint }); });
  for (const [index, stationId] of [chain.opening.boardStationId, branch.mission.boardStationId, branch.finale.boardStationId].entries()) {
    eventBus.emit('dock:docked', { stationId });
    const payload = { missionId: `ending-4242-${index}`, source: offered.source, causeFingerprint: offered.cause.fingerprint };
    eventBus.emit('mission:accepted', payload); eventBus.emit('mission:completed', payload);
  }
  assert.equal(ensurePostEndingReplayState(state).status, 'completed');
  return sys;
}

test('4242: completed protection and black-channel routes retain signed danger and standing board copy after ten days and reload', () => {
  for (const [choice, branchId] of [['A', 'shield'], ['B', 'black_channel']]) {
    const state = stateFor(choice); unlock(state, choice);
    const eventBus = bus();
    const sim = { ...sectorSim }; sim.init({ state, bus: eventBus, helpers: {}, registry: { get: () => null } });
    const replay = finishChain(state, branchId, eventBus);
    const consequence = postEndingReplayChain(choice).branches.find(row => row.id === branchId).consequence;
    const target = Math.max(0, Math.min(1, dangerIndex(SECTORS.find(row => row.id === consequence.sectorId)) + consequence.danger));
    for (let day = 0; day < 10; day++) { state.simTime += 600; sim._advanceModel(1, 'ending-route-test'); }
    const assertBound = () => consequence.danger > 0
      ? assert.ok(effectiveDangerFor(state, consequence.sectorId) >= target)
      : assert.ok(effectiveDangerFor(state, consequence.sectorId) <= target);
    assertBound(); assert.equal(replayStandingLines(state).length, 1);
    if (choice === 'A') assert.match(replayStandingLines(state)[0], /You shielded this route/);
    const savedSim = JSON.parse(JSON.stringify(sim.serialize()));
    const savedReplay = JSON.parse(JSON.stringify(replay.serialize()));
    sim.deserialize(savedSim); replay.deserialize(savedReplay); eventBus.emit('save:loaded', {});
    assertBound();
    state.simTime += 600;
    eventBus.emit('dock:docked', { stationId: postEndingReplayChain(choice).opening.boardStationId });
    assert.match(buildPostEndingReplayOffer(state).summary, /Standing order:/);
  }
});
