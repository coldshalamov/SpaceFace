import test from 'node:test';
import assert from 'node:assert/strict';
import { charonSupplyPresentation } from '../src/world/charonSupplyReadout.js';

function fixture({ loose = 0, aboard = 6 } = {}) {
  const actor = (id, slot) => ({ id, alive: true, hull: 100, occupantGeneration: 1, data: {
    activityActorSlotId: slot, worldRecordId: `record-${id}`, durable: true,
    identityKey: `charon:activity:${slot}`,
  } });
  const h = actor('hauler', 'charon_colony_hauler'), r = actor('cutter', 'charon_colony_salvor');
  const state = { entities: new Map([[h.id, h], [r.id, r]]), entityList: [h,r],
    world: { currentSectorId: 'sector_charon_expanse', records: { byId: {} } },
    traffic: { charonSalvageSupply: { schema: 1, original: 6, phase: 'collect',
      haulerId: h.data.worldRecordId, salvorId: r.data.worldRecordId,
      haulerReady: true, salvorReady: true,
      pods: [{ id: 'charon_colony_air_pod', original: 6, loose, aboard,
        delivered: 0, consumed: 0, player: 0, other: 0, lost: 0 }] } } };
  for (const e of [h,r]) state.world.records.byId[e.data.worldRecordId] = {
    recordId: e.data.worldRecordId, identityKey: e.data.identityKey, alive: true,
    outcome: 'active', homeSectorId: 'sector_charon_expanse',
  };
  return { state, h, r, book: state.traffic.charonSalvageSupply };
}

test('full aboard reserve gives handoff guidance instead of an impossible loose-pod errand', () => {
  const { state, h, r, book } = fixture();
  const before = JSON.stringify(book);
  for (const e of [h,r]) {
    const view = charonSupplyPresentation(state, e);
    assert.match(view.compact[1], /6 KITS ABOARD/);
    assert.match(view.route[1], /handoff.*original cutter.*low relative speed/i);
    assert.doesNotMatch(view.route.join(' '), /Bring the original loose|Taking any cancels|slow it and release your tether/);
    assert.match(view.route[1], /No loose reserve remains/);
  }
  assert.equal(JSON.stringify(book), before);
});

test('remaining loose stock names its real receiver, not the barge or cutter', () => {
  for (const loose of [6, 3]) {
    const { state, r } = fixture({ loose, aboard: 6-loose });
    const view = charonSupplyPresentation(state, r);
    assert.match(view.route[1], /Bring the original loose supply pod within reach of the original hauler/);
    assert.match(view.route[1], /slow it and release your tether/);
    assert.doesNotMatch(view.route[1], /No loose reserve remains/);
  }
});

test('restored aboard book and rematerialized original workers retain handoff guidance', () => {
  const { state, h, r } = fixture();
  charonSupplyPresentation(state, r);
  state.traffic.charonSalvageSupply = JSON.parse(JSON.stringify(state.traffic.charonSalvageSupply));
  assert.match(charonSupplyPresentation(state, h).route[1], /handoff/i);
  for (const e of [h,r]) {
    const next = structuredClone(e); next.id += '-returned'; next.occupantGeneration++;
    e.alive = false; state.entities.delete(e.id);
    state.entities.set(next.id, next);
    state.entityList = state.entityList.filter(x => x !== e); state.entityList.push(next);
  }
  for (const e of state.entityList) assert.match(charonSupplyPresentation(state, e).route[1], /handoff/i);
});

test('shortfall and missing original override handoff directions without inventing new stock', () => {
  const { state, h, r, book } = fixture({ loose: 0, aboard: 5 });
  book.pods[0].player = 1;
  assert.match(charonSupplyPresentation(state, r).route[1], /cannot start with this shortfall/);
  assert.doesNotMatch(charonSupplyPresentation(state, r).route[1], /handoff/);
  book.pods[0].player = 0; book.pods[0].aboard = 6; h.alive = false;
  assert.match(charonSupplyPresentation(state, r).route[1], /crew is missing/);
  assert.doesNotMatch(charonSupplyPresentation(state, r).route[1], /handoff/);
});

test('delivered and consumed reserves retain their distinct truthful outcomes', () => {
  for (const [phase, field, expected] of [
    ['delivered', 'delivered', /physically aboard the cutter, awaiting next-round admission/],
    ['working', 'consumed', /used.*start its next cutting round/],
  ]) {
    const { state, r, book } = fixture();
    book.phase = phase; book.pods[0].aboard = 0; book.pods[0][field] = 6;
    const before = JSON.stringify(state.traffic);
    const view = charonSupplyPresentation(state, r);
    assert.equal(view.route.length, 2);
    assert.match(view.route[1], expected);
    assert.doesNotMatch(view.route.join(' '), /Bring the original loose|handoff requires|Taking any cancels/);
    assert.equal(JSON.stringify(state.traffic), before);
  }
});

test('loss after partial carriage keeps disposition, not normal handoff or collection advice', () => {
  const { state, r, book } = fixture({ loose: 2, aboard: 3 });
  book.phase = 'lost'; book.pods[0].lost = 1;
  const view = charonSupplyPresentation(state, r);
  assert.match(view.route[1], /2 kits loose, 3 aboard.*1 lost/);
  assert.match(view.route[1], /No replacement load/);
  assert.doesNotMatch(view.route[1], /Bring the original loose|handoff requires/);
});

test('compact consumers remain identical and detail reads never mint persistent state', () => {
  const { state, h, book } = fixture();
  const before = JSON.stringify(book);
  const compact = charonSupplyPresentation(state, h, { detailed: false });
  for (let i = 0; i < 4; i++) {
    const detailed = charonSupplyPresentation(state, h);
    assert.deepEqual(detailed.compact, compact.compact);
    assert.equal(detailed.status, compact.status);
    assert.equal(detailed.route.length, 2);
  }
  assert.deepEqual(compact.compact, ['VISITING SALVAGE · NO RESIDENTS', '6 KITS ABOARD HAULER']);
  assert.equal(compact.route, undefined);
  assert.equal(JSON.stringify(book), before);
});
