// BP-11 packet A6 acceptance check: Station Side-Events (seeded director).
//
// Contract (src/data/stationSideEvents.js + src/systems/stationSideEventDirector.js):
//   - PURE planner: same (seed, sectorId, dayIndex, stationId) → identical schedule; delays ascend;
//     station-type affinity respected; 3 seeded floats per item in fixed order.
//   - Director: fires ≤1 side-event per MIN_SPACING at the nearest VISIBLE station only; cosmetic
//     events (budget 0) emit a `station:sideEvent` seam with NO spawnBudget and NO entity; a
//     launching patrol (budget 1) requests exactly one slot and releases it when the ship is gone.
//   - Budget request/release is BALANCED across every path; total held never exceeds the cap; the
//     release is idempotent (a duplicate entity:destroyed never double-frees). Voice: NONE.
//   - No visible station → strict no-op (planning is anchor-lazy). No Math.random / no wall clock.
import assert from 'node:assert/strict';

import {
  stationSideEventDirector as DIR, pathPoints, ensureState,
} from '../src/systems/stationSideEventDirector.js';
import { planStationSideEvents, SIDE_EVENTS, SIDE_EVENT_IDS } from '../src/data/stationSideEvents.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

testPlannerDeterminismAndShape();
testAffinity();
testCosmeticPath();
testBudgetedHappyPathAndIdempotentRelease();
testSilentDeathSweepReleasesBudget();
testSpawnShortfall();
testCapOneConcurrent();
testVisibleStationGating();
testGrantZeroContention();
testSectorExitNoDoubleRelease();
testDirectorDeterminism();

console.log('Station side-event checks OK');

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, payload) { emitLog.push({ evt, payload }); for (const fn of (handlers.get(evt) || []).slice()) fn(payload); },
  };
}

function makeCtx({ stationTypeId = 'military', stationDist = 200, seed = 7 } = {}) {
  const bus = makeBus();
  const voiceCalls = [];
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } };
  const station = {
    id: 2, type: 'station', alive: true, size: 'L', factionId: 'faction_scn',
    pos: { x: stationDist, z: 0 }, dockRadius: 80,
    data: { stationId: 'st_helios', stationTypeId, factionId: 'faction_scn', dockRadius: 80 },
  };
  const state = {
    mode: 'flight', simTime: 100, playerId: 1, meta: { seed },
    world: { currentSectorId: 'sec_a' },
    entities: new Map([[1, player], [2, station]]),
    entityList: [player, station],
    player: { credits: 5000 },
  };
  const real = makeBudgetApi(state);
  const spy = { requests: [], releases: [] };
  const spawns = [];
  let spawnN = 0;
  const ctl = { spawnReturnsNull: false };
  const helpers = {
    voice: { say(m) { voiceCalls.push(m); return true; } },
    spawnBudget: {
      request(n, id) { spy.requests.push([n, id]); return real.request(n, id); },
      releaseSome(id, n) { spy.releases.push([id, n]); return real.releaseSome(id, n); },
      release(id) { spy.releases.push([id, 'all']); return real.release(id); },
      current: () => real.current(), available: () => real.available(), max: () => real.max(), reset: () => real.reset(),
    },
    spawnEntity(spec) {
      spawns.push(spec);
      if (ctl.spawnReturnsNull) return null;
      const entity = { ...spec, id: 'e' + (++spawnN), alive: true, data: { ...(spec.data || {}) } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const ctx = { bus, state, helpers };
  return { ctx, bus, state, station, player, voiceCalls, spy, spawns, ctl, real };
}

// Run body with Math.random / Date.now poisoned (any per-frame roll or wall-clock read throws).
function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in sim path'); };
  Date.now = () => { throw new Error('Date.now in sim path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

function drive(sys, state, beats) {
  for (let i = 0; i < beats; i++) { state.simTime += 1; sys.update(1, state); }
}

function freshDir() {
  // A fresh clone so parallel scenarios don't share the singleton's listener bindings.
  return { ...DIR };
}

// ── 1. planner determinism + shape ───────────────────────────────────────────────────────────
function testPlannerDeterminismAndShape() {
  guarded(() => {
    const a = planStationSideEvents(7, 'sec_a', 3, 'st_1', 'trade_hub');
    const b = planStationSideEvents(7, 'sec_a', 3, 'st_1', 'trade_hub');
    assert.deepStrictEqual(a, b, 'same inputs → identical schedule');
    assert.ok(a.length >= 3 && a.length <= 5, `3–5 events/day, got ${a.length}`);
    let prev = -1;
    for (let i = 0; i < a.length; i++) {
      const it = a[i];
      assert.ok(it.budget === 0 || it.budget === 1, 'budget is 0 or 1');
      assert.ok(Number.isFinite(it.delay) && it.delay >= 0, 'delay finite ≥ 0');
      assert.ok(it.delay >= prev, 'delays non-decreasing (built ascending, never sorted)'); prev = it.delay;
      assert.ok(it.durationS > 0, 'durationS positive');
      assert.equal(it.eventId, `sse:st_1#3#${i}`, 'eventId deterministic + indexed');
      assert.ok(it.bearing >= 0 && it.bearing <= Math.PI * 2 + 1e-6, 'bearing in [0,2π]');
      assert.ok(it.delay <= 400, 'a full day of events stays within the day window');
    }
    assert.ok(a[0].delay <= 90, 'first event lands within ~90s (a few minutes → ≥1 event)');
    // Missing key parts never fabricate a phantom schedule.
    assert.deepStrictEqual(planStationSideEvents(7, null, 3, 'st_1', 'trade_hub'), []);
    assert.deepStrictEqual(planStationSideEvents(7, 'sec_a', 3, null, 'trade_hub'), []);
  });
}

// ── 2. affinity ────────────────────────────────────────────────────────────────────────────────
function testAffinity() {
  guarded(() => {
    const mil = new Set(planStationSideEvents(7, 'sec_a', 1, 'st_m', 'military').map((i) => i.kind));
    for (const k of mil) {
      const aff = SIDE_EVENTS[k].affinity;
      assert.ok(aff == null || aff.includes('military'), `${k} may appear at a military station`);
    }
    // research is in no affinity list → only the universal repair_drone.
    const res = new Set(planStationSideEvents(7, 'sec_a', 1, 'st_r', 'research').map((i) => i.kind));
    assert.deepStrictEqual([...res], ['repair_drone'], 'typeless station gets only the universal drone');
    // trade_hub never yields a kind whose affinity excludes it.
    for (const it of planStationSideEvents(7, 'sec_a', 2, 'st_t', 'trade_hub')) {
      const aff = SIDE_EVENTS[it.kind].affinity;
      assert.ok(aff == null || aff.includes('trade_hub'), `${it.kind} may appear at a trade_hub`);
    }
  });
}

// ── 3. cosmetic path: seam only, zero budget, zero voice ────────────────────────────────────────
function testCosmeticPath() {
  guarded(() => {
    const { ctx, bus, state, station, spy, spawns, voiceCalls } = makeCtx();
    const sys = freshDir(); sys.init(ctx);
    const item = { eventId: 'x0', kind: 'repair_drone', budget: 0, path: 'hull-crawl', durationS: 30, bearing: 1, sectorId: 'sec_a', stationId: 'st_helios' };
    sys._fire(state, station, item, 100);
    const seams = bus.emitLog.filter((e) => e.evt === 'station:sideEvent');
    assert.equal(seams.length, 1, 'one seam emitted');
    assert.deepStrictEqual(seams[0].payload.entityIds, [], 'cosmetic seam carries no entity ids');
    assert.equal(spawns.length, 0, 'cosmetic path spawns nothing');
    assert.equal(spy.requests.length, 0, 'cosmetic path never touches spawnBudget');
    assert.equal(voiceCalls.length, 0, 'side-events are visual-only — zero voice');
  });
}

// ── 4. budgeted happy path + idempotent release ────────────────────────────────────────────────
function testBudgetedHappyPathAndIdempotentRelease() {
  guarded(() => {
    const { ctx, bus, state, station, spy, spawns, real } = makeCtx();
    const sys = freshDir(); sys.init(ctx);
    const item = { eventId: 'p1', kind: 'patrol_launch', budget: 1, path: 'outbound-past-traffic', durationS: 60, bearing: 0.5, sectorId: 'sec_a', stationId: 'st_helios' };
    sys._fire(state, station, item, 100);
    assert.deepStrictEqual(spy.requests, [[1, 'p1']], 'requested exactly one slot under the eventId');
    assert.equal(spawns.length, 1, 'one ship spawned');
    assert.equal(spawns[0].team, 2, 'launched patrol is team 2 (never hostile)');
    assert.equal(real.current(), 1, 'one slot held');
    const seam = bus.emitLog.filter((e) => e.evt === 'station:sideEvent').pop();
    assert.deepStrictEqual(seam.payload.entityIds, ['e1'], 'seam carries the real entity id for the graphics lane');

    // The ship leaves → release exactly once.
    bus.emit('entity:destroyed', { id: 'e1' });
    assert.equal(real.current(), 0, 'slot freed when the ship is gone');
    assert.equal(spy.releases.length, 1, 'released exactly once');
    // A duplicate destroy event must not double-free.
    bus.emit('entity:destroyed', { id: 'e1' });
    assert.equal(spy.releases.length, 1, 'duplicate destroy is a no-op (idempotent via active-map lookup)');
    assert.equal(real.current(), 0, 'still zero after the duplicate');
  });
}

function testSilentDeathSweepReleasesBudget() {
  guarded(() => {
    const { ctx, state, station, spy, real } = makeCtx();
    const sys = freshDir(); sys.init(ctx);
    const item = { eventId: 'p_silent', kind: 'patrol_launch', budget: 1, path: 'outbound-past-traffic', durationS: 60, bearing: 0, sectorId: 'sec_a', stationId: 'st_helios' };
    sys._fire(state, station, item, 100);
    const entity = state.entities.get('e1');
    assert.ok(entity);
    entity.alive = false; // no entity:destroyed event
    state.simTime += 1;
    sys.update(1, state);
    assert.equal(real.current(), 0, '1 Hz sweep releases a silently dead patrol reservation');
    assert.deepEqual(ensureState(state).active, {});
    assert.deepStrictEqual(spy.releases, [['p_silent', 1]]);
  });
}

// ── 5. spawn shortfall degrades to cosmetic, slot freed ─────────────────────────────────────────
function testSpawnShortfall() {
  guarded(() => {
    const { ctx, bus, state, station, spy, real, ctl } = makeCtx();
    const sys = freshDir(); sys.init(ctx);
    ctl.spawnReturnsNull = true;
    const item = { eventId: 'p2', kind: 'patrol_launch', budget: 1, path: 'outbound-past-traffic', durationS: 60, bearing: 0, sectorId: 'sec_a', stationId: 'st_helios' };
    sys._fire(state, station, item, 100);
    assert.deepStrictEqual(spy.requests, [[1, 'p2']], 'requested a slot');
    assert.deepStrictEqual(spy.releases, [['p2', 1]], 'freed the slot on spawn shortfall');
    assert.equal(real.current(), 0, 'net zero held after a failed spawn');
    const seam = bus.emitLog.filter((e) => e.evt === 'station:sideEvent').pop();
    assert.deepStrictEqual(seam.payload.entityIds, [], 'degrades to a cosmetic seam');
  });
}

// ── 6. cap: one concurrent budgeted side-event per sector ────────────────────────────────────────
function testCapOneConcurrent() {
  guarded(() => {
    const { ctx, state, station, spy } = makeCtx();
    const sys = freshDir(); sys.init(ctx);
    const s = ensureState(state);
    s.anchorId = 'st_helios';
    // First budgeted fires (occupies the single budgeted slot).
    sys._fire(state, station, { eventId: 'pa', kind: 'patrol_launch', budget: 1, path: 'outbound-past-traffic', durationS: 60, bearing: 0, sectorId: 'sec_a', stationId: 'st_helios' }, 100);
    assert.equal(spy.requests.length, 1, 'first budgeted requested');
    // A second budgeted item is due while one is active → pump must defer it, not request.
    s.pending = [{ eventId: 'pb', kind: 'patrol_launch', budget: 1, path: 'outbound-past-traffic', durationS: 60, bearing: 0, sectorId: 'sec_a', stationId: 'st_helios', dueAt: 100 }];
    s.nextFireAt = 0;
    sys._pump(state, station, 200);
    assert.equal(spy.requests.length, 1, 'second budgeted did NOT request while one is active (cap 1)');
    assert.ok(s.pending[0].dueAt > 200, 'the capped item is deferred, not dropped');
  });
}

// ── 7. no visible station → strict no-op, planning is anchor-lazy ───────────────────────────────
function testVisibleStationGating() {
  guarded(() => {
    const { ctx, bus, state, station } = makeCtx({ stationDist: 5000 });  // far out of anchor range
    const sys = freshDir(); sys.init(ctx);
    drive(sys, state, 300);
    const seams = bus.emitLog.filter((e) => e.evt === 'station:sideEvent');
    assert.equal(seams.length, 0, 'no visible station → no side-events');
    assert.deepStrictEqual(Object.keys(ensureState(state).plannedKeys), [], 'planning is anchor-lazy (nothing planned off-screen)');
    // Bring it into range → it now plans + eventually fires.
    station.pos.x = 200;
    drive(sys, state, 120);
    assert.ok(bus.emitLog.some((e) => e.evt === 'station:sideEvent'), 'once visible, side-events fire');
  });
}

// ── 8. budget contention (grant 0) → requeue, no spawn ──────────────────────────────────────────
function testGrantZeroContention() {
  guarded(() => {
    const { ctx, bus, state, station, spy, real } = makeCtx();
    const sys = freshDir(); sys.init(ctx);
    real.request(real.max(), 'other');   // exhaust the whole budget elsewhere
    const s = ensureState(state);
    const item = { eventId: 'pc', kind: 'patrol_launch', budget: 1, path: 'outbound-past-traffic', durationS: 60, bearing: 0, sectorId: 'sec_a', stationId: 'st_helios' };
    sys._fire(state, station, item, 100);
    assert.deepStrictEqual(spy.requests, [[1, 'pc']], 'attempted a request');
    assert.equal(real.current(), real.max(), 'no slot granted → nothing spawned or held beyond the pre-fill');
    assert.ok(s.pending.some((p) => p.eventId === 'pc'), 'contended item is requeued, not lost');
    assert.equal(bus.emitLog.filter((e) => e.evt === 'station:sideEvent').length, 0, 'no seam-with-ids on a failed grant');
  });
}

// ── 9. sector:exit clears tracking WITHOUT releasing (spawnBudget self-resets) ───────────────────
function testSectorExitNoDoubleRelease() {
  guarded(() => {
    const { ctx, bus, state, station, spy } = makeCtx();
    const sys = freshDir(); sys.init(ctx);
    sys._fire(state, station, { eventId: 'pd', kind: 'patrol_launch', budget: 1, path: 'outbound-past-traffic', durationS: 60, bearing: 0, sectorId: 'sec_a', stationId: 'st_helios' }, 100);
    const s = ensureState(state);
    s.pending.push({ eventId: 'pe', kind: 'hauler_dock', budget: 0, dueAt: 999, stationId: 'st_helios' });
    const releasesBefore = spy.releases.length;
    bus.emit('sector:exit', { sectorId: 'sec_a' });
    assert.deepStrictEqual(s.active, {}, 'active tracking cleared on sector:exit');
    assert.deepStrictEqual(s.pending, [], 'pending cleared on sector:exit');
    assert.equal(spy.releases.length, releasesBefore, 'sector:exit does NOT call releaseSome (budget self-resets)');
  });
}

// ── 10. director-level determinism (ordered fire log reproducible) ──────────────────────────────
function testDirectorDeterminism() {
  const run = () => guarded(() => {
    const { ctx, bus, state } = makeCtx({ stationTypeId: 'trade_hub' });
    const sys = freshDir(); sys.init(ctx);
    drive(sys, state, 400);
    // eventId encodes (station, day, index); the ordered list IS the reproducibility signature.
    return bus.emitLog.filter((e) => e.evt === 'station:sideEvent').map((e) => `${e.payload.eventId}|${e.payload.kind}`);
  });
  const a = run();
  const b = run();
  assert.ok(a.length >= 1, 'a busy station fires ≥1 side-event over the window');
  assert.deepStrictEqual(a, b, 'the ordered side-event log is reproducible for a fixed seed');
}
