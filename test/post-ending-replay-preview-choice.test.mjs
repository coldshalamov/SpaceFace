import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { postEndingReplay } from '../src/systems/postEndingReplay.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { SECTORS } from '../src/data/sectors.js';
import { createPostEndingContinuity, normalizePostEndingContinuity } from '../src/story/endings/resolve.js';

function setup(t) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return storage.size; },
    key(i) { return [...storage.keys()][i] ?? null; },
    getItem(k) { return storage.get(k) ?? null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); },
  } });
  const sim = createSimulation({ seed: 47, systems: [cargo, economy, factions, missions, postEndingReplay, world, save] });
  t.after(() => {
    sim.dispose();
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
  const { state, bus } = sim;
  const owner = sim.registry.get('missions');
  const replay = sim.registry.get('postEndingReplay');
  const events = [];
  for (const name of ['mission:accepted', 'mission:completed', 'save:loaded', 'economy:grantCredits']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  state.mode = 'flight';
  state.simTime = 1200;
  state.player.credits = 500000;
  for (const id of ['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']) {
    state.factions[id] = { ...state.factions[id], rep: 500 };
  }
  // Fixture: finished ending continuity, NOT replay progress, receipts or payouts.
  const rec = createPostEndingContinuity('SANDBOX', 1200, 47);
  state.story = {
    beatIndex: 7, branch: 'free', flags: { endgame: true }, chainProgress: 0,
    endgameChoice: null, endgameResolved: true,
    postEnding: normalizePostEndingContinuity({ ...rec,
      seenKeys: Array.from({ length: rec.target }, (_, i) => `sector:sector_test_${i}`), completedAtS: 1230 }),
  };
  state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 140, hullMax: 140, radius: 6 }).id;
  // Accelerated travel through the real world owner and docking input; not flown/browser evidence.
  function dock(id) {
    if (state.ui.dockedStationId) bus.emit('dock:undocked', { stationId: state.ui.dockedStationId });
    const sector = SECTORS.find(s => s.stations?.some(station => station.id === id));
    sim.registry.get('world').enterSector(sector.id);
    state.ui.docked = true;
    state.ui.dockedStationId = id;
    bus.emit('dock:docked', { stationId: id });
  }
  const offers = id => (state.missions.boards[id]?.slots || []).filter(o => o.source === 'postEndingReplay');
  dock('station_helios');
  const opening = offers('station_helios')[0];
  assert.ok(opening);
  assert.equal(owner.acceptMission(opening.id), true);
  dock('station_tethys');
  assert.equal(state.missions.postEndingReplay.stageIndex, 1);
  assert.equal(state.missions.postEndingReplay.receipts.length, 1);
  assert.equal(state.player.credits, 500793, 'real opening owner payout');
  assert.equal(events.filter(e => e.name === 'mission:completed' && e.payload.source === 'postEndingReplay').length, 1);
  return { sim, state, bus, owner, replay, events, dock, offers };
}

for (const [first, second] of [['station_dione', 'station_veil'], ['station_veil', 'station_dione']]) {
  test(`unaccepted preview follows either branch station: ${first} first`, async t => {
    const { sim, state, bus, owner, replay, events, dock, offers } = setup(t);
    dock(first);
    const initial = offers(first)[0];
    assert.ok(initial);
    const before = JSON.stringify(state.missions.postEndingReplay);
    dock(first);
    dock('station_helios');
    assert.equal(JSON.stringify(state.missions.postEndingReplay), before, 'same/unrelated visits are no-ops');
    assert.equal(offers(first).length, 1);
    // Exercise synchronous owner notifications: nested preview attempts must not clear pending state.
    let callbacks = 0;
    bus.on('mission:updated', () => {
      callbacks++;
      replay._offerAtStation(first);
      replay._offerAtStation(second);
    });
    dock(second);
    assert.equal(offers(second).length, 1, 'visiting the alternative must board its preview');
    assert.equal(offers(first).length, 0, 'the old singleton preview is retired by missions');
    assert.ok(callbacks > 0);
    assert.equal(owner.acceptMission(initial.id), false, 'stale previous offer cannot be accepted');
    assert.equal(state.missions.postEndingReplay.branchId, null);
    for (const id of [first, second, first]) {
      dock(id);
      assert.equal(offers(id).length, 1);
      assert.equal(offers(id === first ? second : first).length, 0);
      assert.equal(state.missions.postEndingReplay.fingerprint, offers(id)[0].cause.fingerprint);
      assert.equal(state.missions.postEndingReplay.branchId, null);
    }
    const saver = sim.registry.get('save');
    assert.ok(saver.save('quick'));
    // Prove actual restoration, not untouched live data. No progress is fabricated.
    state.missions.boards = {};
    state.missions.postEndingReplay.status = 'ready';
    await saver.load('quick');
    assert.ok(events.some(e => e.name === 'save:loaded'));
    assert.equal(state.missions.postEndingReplay.status, 'offered');
    assert.equal(offers(first).length, 1);
    dock(second);
    assert.equal(offers(second).length, 1);
    assert.equal(offers(first).length, 0);
    const chosen = offers(second)[0];
    assert.equal(owner.acceptMission(chosen.id), true);
    const locked = JSON.stringify(state.missions.postEndingReplay);
    const active = state.missions.active.filter(m => m.source === 'postEndingReplay');
    assert.equal(active.length, 1);
    assert.equal(state.missions.postEndingReplay.branchId, chosen.cause.branchId);
    for (const id of [first, second, first]) dock(id);
    assert.equal(JSON.stringify(state.missions.postEndingReplay), locked, 'acceptance locks the branch');
    assert.equal(state.missions.active.filter(m => m.source === 'postEndingReplay').length, 1);
    assert.equal(offers(first).length + offers(second).length, 0);
    assert.equal(state.missions.postEndingReplay.receipts.length, 1, 'previews do not settle missions');
  });
}

test('unavailable, stale or refusing retirement authority preserves the prior preview', t => {
  const { state, owner, replay, dock, offers } = setup(t);
  dock('station_dione');
  const before = JSON.stringify(state.missions.postEndingReplay);
  const prune = owner.pruneBoardOffers;
  for (const unavailable of [undefined, () => 0]) {
    owner.pruneBoardOffers = unavailable;
    dock('station_veil');
    assert.equal(JSON.stringify(state.missions.postEndingReplay), before);
    assert.equal(offers('station_dione').length, 1);
    assert.equal(offers('station_veil').length, 0);
  }
  owner.pruneBoardOffers = prune;
  for (const invalid of [null, { ...owner, state: {} }, { ...owner, bus: {} }]) {
    replay.missions = invalid;
    dock('station_veil');
    assert.equal(JSON.stringify(state.missions.postEndingReplay), before);
    assert.equal(offers('station_dione').length, 1);
    assert.equal(offers('station_veil').length, 0);
  }
  replay.missions = owner;
  dock('station_veil');
  assert.equal(offers('station_veil').length, 1);
});

test('failed replacement boarding remains recoverable without stale accepted rows', t => {
  const { state, owner, dock, offers } = setup(t);
  dock('station_dione');
  const previous = offers('station_dione')[0];
  const board = owner._onExternalBoardOffer;
  // Fault injection at the actual owner boundary, not a replacement missions implementation.
  owner._onExternalBoardOffer = () => false;
  dock('station_veil');
  assert.equal(offers('station_dione').length + offers('station_veil').length, 0);
  assert.equal(state.missions.postEndingReplay.status, 'recovering');
  assert.equal(state.missions.postEndingReplay.branchId, null);
  assert.equal(state.missions.postEndingReplay.fingerprint, null);
  assert.equal(owner.acceptMission(previous.id), false);
  owner._onExternalBoardOffer = board;
  dock('station_veil');
  assert.equal(offers('station_veil').length, 1);
});

test('retirement preserves unrelated board rows, including near-match causes', t => {
  const { state, owner, dock, offers } = setup(t);
  dock('station_dione');
  const previous = offers('station_dione')[0];
  // Explicit unrelated-board fixtures, posted through missions ownership, never replay progress.
  const sentinels = [
    { ...previous, id: 'other-source', source: 'salvage' },
    ...['fingerprint', 'choiceId', 'chainId', 'cycle', 'stageIndex'].map(key => ({
      ...previous, id: `other-${key}`, cause: { ...previous.cause, [key]: `other-${key}` },
    })),
  ];
  for (const row of sentinels) assert.equal(owner.postBoardOffer(row).ok, true);
  const prune = owner.pruneBoardOffers;
  owner.pruneBoardOffers = function (predicate) {
    assert.equal(predicate(previous), true);
    assert.equal(predicate({ ...previous, source: 'salvage' }), false);
    assert.equal(predicate({ ...previous, id: 'another-offer' }), false);
    for (const key of ['fingerprint', 'choiceId', 'chainId', 'cycle', 'stageIndex', 'phase']) {
      assert.equal(predicate({ ...previous, cause: { ...previous.cause, [key]: `other-${key}` } }), false, key);
    }
    return prune.call(this, predicate);
  };
  dock('station_veil');
  const retained = state.missions.boards.station_dione.slots;
  for (const row of sentinels) assert.deepEqual(retained.find(o => o.id === row.id), row);
  assert.equal(retained.some(o => o.id === previous.id), false);
  assert.equal(offers('station_veil').length, 1);
});
