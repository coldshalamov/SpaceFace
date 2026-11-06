// RC-47 — passing the Ceres sling ring is an event with a receipt.
// Two traversals (one aligned ride, one off-axis throw) post exactly two
// `travelLanes:slingRingPass` events, and the receipt lane voices both.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CERES_SLING_RING, travelLanes } from '../src/systems/travelLanes.js';
import { bindSlingPassReceipts } from '../src/ui/toasts.js';

function fakeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn);
      handlers.set(name, list);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function makeState() {
  return {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    input: { travelDrive: { state: 'off', cap: 0, ceiling: 0, rampMult: 1 } },
    world: { currentSectorId: 'sector_ceres_belt' },
    simTime: 0,
    meta: { seed: 4242 },
  };
}

function makePlayer(state, vel) {
  const player = {
    id: 1,
    alive: true,
    pos: { x: CERES_SLING_RING.globalPos.x, z: CERES_SLING_RING.globalPos.z },
    vel,
  };
  state.entities.set(1, player);
  state.entityList.length = 0;
  state.entityList.push(player);
  return player;
}

function stepOutside(player) {
  player.pos.x = CERES_SLING_RING.globalPos.x + CERES_SLING_RING.axis.x * (CERES_SLING_RING.length + 10);
  player.pos.z = CERES_SLING_RING.globalPos.z + CERES_SLING_RING.axis.z * (CERES_SLING_RING.length + 10);
}

test('two sling traversals post two pass events and two receipts', () => {
  const bus = fakeBus();
  const state = makeState();
  travelLanes.init({ state, bus });
  bindSlingPassReceipts(bus);

  // Traversal 1 — aligned ride: inside one tick, then past the exit face.
  const { axis } = CERES_SLING_RING;
  const player = makePlayer(state, { x: axis.x * 60, z: axis.z * 60 });
  travelLanes._applySlingRing(0.05, state, player);
  stepOutside(player);
  travelLanes._applySlingRing(0.05, state, player);

  // Traversal 2 — off-axis entry: the ring throws the hull wide.
  const perp = CERES_SLING_RING.throwPerp;
  player.pos.x = CERES_SLING_RING.globalPos.x;
  player.pos.z = CERES_SLING_RING.globalPos.z;
  player.vel = { x: perp.x * 50, z: perp.z * 50 };
  travelLanes._applySlingRing(0.05, state, player);
  stepOutside(player);
  travelLanes._applySlingRing(0.05, state, player);

  const passes = bus.emitted.filter((e) => e.name === 'travelLanes:slingRingPass');
  assert.equal(passes.length, 2, `expected 2 pass events, got ${passes.length}`);
  assert.equal(passes[0].payload.aligned, true, 'the aligned ride reports its boost line');
  assert.equal(passes[0].payload.ringId, CERES_SLING_RING.id);
  assert.equal(passes[0].payload.sectorId, CERES_SLING_RING.sectorId);
  assert.equal(passes[1].payload.aligned, false, 'the off-axis entry reports the throw');

  const receipts = bus.emitted.filter(
    (e) => e.name === 'toast' && /Sling ring/.test(e.payload.text),
  );
  assert.equal(receipts.length, 2, `expected 2 receipts, got ${receipts.length}`);
  assert.match(receipts[0].payload.text, /slung forward at \d+ u\/s/);
  assert.match(receipts[1].payload.text, /thrown wide at \d+ u\/s/);
});
