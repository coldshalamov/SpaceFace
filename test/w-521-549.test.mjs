// W-521/W-522/W-523/W-549 — Gate Audits, the Slow Gray, the chart receipt, save budget
// (build_map §34 rows 521–523, 549)
//
// 521: one gate per Book welds shut behind a wreckable scaffold; wrecking it delays
//      the weld; a sealed road never strands a sector (drive always flies).
// 522: the Slow Gray index falls once per Book and never recovers.
// 523: the chart keeps the receipt — persisted facts become map marks, gated on charting.
// 549: worldPressure round-trips the save envelope; journals stay inside their caps.

import test from 'node:test';
import assert from 'node:assert/strict';
import { worldPressure } from '../src/systems/worldPressure.js';
import {
  GATE_AUDITS, auditEdgeKey, gateTransitClosed, reachableSectorIds,
  emptyWorldPressure, normalizeWorldPressure, WORLD_PRESSURE_CAPS,
  WORLD_BOOK_SECONDS, SLOW_GRAY,
} from '../src/data/worldPressure.js';
import { SECTORS } from '../src/data/sectors.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';
import { buildWorldReceiptMarks } from '../src/ui/galaxyMap.js';

function makeBus() {
  const emitted = [];
  return {
    emitted,
    emit(event, payload) { emitted.push({ event, payload }); },
    on() { return () => {}; },
    off() {},
  };
}

function makeState(simTime = 0) {
  return {
    simTime,
    tick: 0,
    playerId: 'player_1',
    world: {
      currentSectorId: 'sector_sker_haven',
      discovery: Object.fromEntries(SECTORS.map((s) => [s.id, { discovered: true }])),
      sectors: {},
    },
    entities: new Map(),
    entityList: [],
    aftermathWrecks: { bySector: {} },
    understory: { gardens: {}, compost: {}, tidePushback: {} },
    claims: { bodies: [], legendaryHeads: { heads: [] } },
    frontier: { homesteads: [] },
  };
}

function makeSystem(state, bus = makeBus()) {
  const sys = Object.create(worldPressure);
  const spawned = [];
  sys.init({ state, bus, helpers: { spawnEntity: (spec) => { spawned.push(spec); return { id: 'spawned' }; } } });
  sys._spawned = spawned;
  sys.newGame();
  return sys;
}

function runDays(sys, state, days) {
  for (let i = 0; i < days; i++) {
    state.simTime += CAL_DAY_S;
    sys.update(1 / 60, state);
  }
}

const FIRST_AUDIT = GATE_AUDITS.slice().sort((a, b) => a.book - b.book)[0];
const FIRST_KEY = auditEdgeKey(FIRST_AUDIT.a, FIRST_AUDIT.b);

test('w-521: an audit announces when its Book opens, welds daily, and seals the road', () => {
  const state = makeState();
  const sys = makeSystem(state);
  // Before the book opens there is no filing.
  runDays(sys, state, FIRST_AUDIT.book * 5 - 1);
  assert.equal(state.worldPressure.gates[FIRST_KEY], undefined, 'no filing before the book');
  runDays(sys, state, 1);
  const rec = state.worldPressure.gates[FIRST_KEY];
  assert.ok(rec, 'the docket files when the book opens');
  assert.equal(rec.status, 'welding');
  assert.ok(rec.weld > 0, 'the weld has begun');
  // ~3 days at weldProgressPerDay≈0.34 closes the road.
  runDays(sys, state, 4);
  assert.equal(state.worldPressure.gates[FIRST_KEY].status, 'closed');
  assert.equal(gateTransitClosed(state, FIRST_AUDIT.a, FIRST_AUDIT.b), true);
});

test('w-521: wrecking the scaffold delays the weld but never cancels the audit', () => {
  const state = makeState();
  const sys = makeSystem(state);
  runDays(sys, state, FIRST_AUDIT.book * 5 + 1);
  const rec = state.worldPressure.gates[FIRST_KEY];
  const weldAtWreck = rec.weld;
  // _onEntityKilled resolves the scaffold via state.entities; plant one flagged as scaffold.
  state.entities.set('scaf2', { id: 'scaf2', data: { gateAuditScaffold: true, auditKey: FIRST_KEY } });
  sys._onEntityKilled({ id: 'scaf2' });
  assert.equal(rec.status, 'delayed', 'a wrecked scaffold delays the weld');
  assert.ok(rec.delayedUntil > state.simTime, 'the delay is a future date');
  assert.equal(rec.weld, weldAtWreck, 'the weld does not regress while wrecked');
  runDays(sys, state, Math.ceil((rec.delayedUntil - state.simTime) / CAL_DAY_S) + 5);
  assert.equal(state.worldPressure.gates[FIRST_KEY].status, 'closed',
    'the filing stands — a fresh scaffold finishes the weld');
});

test('w-521: a sealed road never strands a sector — the drive always flies', () => {
  const state = makeState();
  // Seal every authored audit edge outright.
  for (const cat of GATE_AUDITS) {
    const key = auditEdgeKey(cat.a, cat.b);
    state.worldPressure = state.worldPressure || emptyWorldPressure();
    state.worldPressure.gates[key] = {
      key, a: cat.a, b: cat.b, book: cat.book, docket: cat.docket,
      gateName: cat.gateName, status: 'closed', weld: 1,
      announcedAt: 0, delayedUntil: 0, closedAt: 0, vergeLaw: true,
    };
  }
  // The row's invariant, walked from Helios: every closed gate's sector stays
  // reachable by drive even with every authored weld shut at once.
  const drive = reachableSectorIds(state, 'sector_helios_prime', { mode: 'drive' });
  const gate = reachableSectorIds(state, 'sector_helios_prime', { mode: 'gate' });
  for (const cat of GATE_AUDITS) {
    for (const end of [cat.a, cat.b]) {
      assert.ok(drive.has(end), `drive still reaches ${end} behind ${cat.docket}`);
      assert.ok(drive.has(end) || gate.has(end), `${end} reachable by some mode`);
    }
  }
  // Gate-mode reachability is a subset of drive-mode; every sector survives by drive.
  for (const id of gate) assert.ok(drive.has(id), `gate-reachable ${id} also drive-reachable`);
  for (const s of SECTORS) {
    assert.ok(drive.has(s.id), `drive still reaches ${s.id}`);
  }
  assert.ok(!gateTransitClosed(state, FIRST_AUDIT.a, FIRST_AUDIT.b) === false,
    'the welded edge reads closed to gate-mode transit');
});

test('w-522: the Slow Gray falls once per Book and never recovers', () => {
  const state = makeState();
  const bus = makeBus();
  const sys = makeSystem(state, bus);
  const seen = [state.worldPressure.slowGray.index];
  for (let book = 1; book <= 4; book++) {
    state.simTime = book * WORLD_BOOK_SECONDS + 1;
    sys.update(1 / 60, state);
    seen.push(state.worldPressure.slowGray.index);
  }
  // The first observed Book seeds the ledger (no headline for the book you were
  // born into); every book after that only ever falls.
  assert.equal(seen[1], seen[0], 'the first book seeds, it does not fall');
  for (let i = 2; i < seen.length; i++) {
    assert.ok(seen[i] < seen[i - 1], `index falls book ${i}: ${seen[i - 1]} -> ${seen[i]}`);
  }
  assert.equal(seen[seen.length - 1],
    Math.max(SLOW_GRAY.floorIndex, SLOW_GRAY.startIndex - 3 * SLOW_GRAY.dropPerBook));
  // It never recovers: a book with gardens, clears and quiet still only falls.
  const events = bus.emitted.filter((e) => e.event === 'worldPressure:slowGray');
  assert.equal(events.length, 3, 'one ticker line per book, no bounce');
});

test('w-523: chart marks read persisted facts and hide what is not charted', () => {
  const state = makeState();
  state.worldPressure = emptyWorldPressure();
  state.worldPressure.tide['sector_kepler_scar'] = 0.5;
  const key = FIRST_KEY;
  state.worldPressure.gates[key] = {
    key, a: FIRST_AUDIT.a, b: FIRST_AUDIT.b, book: FIRST_AUDIT.book,
    docket: FIRST_AUDIT.docket, gateName: FIRST_AUDIT.gateName,
    status: 'closed', weld: 1, announcedAt: 0, delayedUntil: 0, closedAt: 9, vergeLaw: true,
  };
  state.worldPressure.colossusRemains.push({
    id: 'cr1', name: 'the Hollow King', sectorId: 'sector_kepler_scar', x: 0, z: 0, at: 5,
  });
  state.claims.bodies.push({
    id: 'body1', owned: true, sectorId: 'sector_kepler_scar', name: 'Kepler Yard',
    infrastructure: { id: 'infra1', from: { x: 0, z: 0 }, to: { x: 10, z: 0 }, operational: true },
  });
  state.claims.legendaryHeads.heads.push({ tier: 'gold', aceName: 'Voss' });
  state.understory.gardens['g1'] = { sectorId: 'sector_kepler_scar', stage: 2, fedMass: 4 };
  state.frontier.homesteads.push({ sectorId: 'sector_io_reach', entityId: 'hs1', modules: [] });

  const SECTOR_POS = new Map(SECTORS.map((s) => [s.id, s.position || { x: 0, y: 0 }]));
  const nodeById = new Map(SECTORS.map((s) => [s.id, {
    id: s.id, x: SECTOR_POS.get(s.id).x, y: SECTOR_POS.get(s.id).y,
    charted: s.id !== 'sector_io_reach', // Io stays a rumor: its marks must not paint
  }]));

  const marks = buildWorldReceiptMarks(state, nodeById);
  assert.equal(marks.tide.length, 1);
  assert.equal(marks.tide[0].sectorId, 'sector_kepler_scar');
  assert.equal(marks.tide[0].band, 'bloom');
  assert.equal(marks.gates.length, 1);
  assert.equal(marks.gates[0].closed, true);
  assert.equal(marks.gates[0].docket, FIRST_AUDIT.docket);
  // Kepler is charted: claim + lit path + garden + colossus + the wall all paint there.
  assert.ok(marks.structures.some((s) => s.kind === 'claim' && s.sectorId === 'sector_kepler_scar'));
  assert.ok(marks.litPaths.some((p) => p.sectorId === 'sector_kepler_scar' && p.operational));
  assert.ok(marks.gardens.some((g) => g.sectorId === 'sector_kepler_scar'));
  assert.ok(marks.colossus.some((c) => c.name === 'the Hollow King'));
  assert.ok(marks.trophyWall && marks.trophyWall.count === 1);
  assert.equal(marks.trophyWall.sectorId, 'sector_kepler_scar', 'the wall hangs at the yard');
  // Io is uncharted: the homestead stays off the chart.
  assert.ok(!marks.structures.some((s) => s.sectorId === 'sector_io_reach'),
    'uncharted facts do not leak onto the chart');
});

test('w-549: worldPressure survives the save envelope inside its caps', () => {
  const state = makeState();
  const sys = makeSystem(state);
  runDays(sys, state, 40);
  const snap = JSON.parse(JSON.stringify(sys.serialize()));
  // Flat growth: journals and remains capped, tide bounded to real sectors.
  assert.ok(snap.gateEvents.length <= WORLD_PRESSURE_CAPS.gateEvents);
  assert.ok(snap.tideNotices.length <= WORLD_PRESSURE_CAPS.tideNotices);
  assert.ok(snap.colossusRemains.length <= WORLD_PRESSURE_CAPS.colossusRemains);
  const restored = makeState(1000);
  const sys2 = makeSystem(restored);
  sys2.deserialize(snap);
  assert.deepEqual(restored.worldPressure.tide, state.worldPressure.tide);
  assert.deepEqual(restored.worldPressure.gates, state.worldPressure.gates);
  assert.equal(restored.worldPressure.lastDay, state.worldPressure.lastDay,
    'the day clock restores — no phantom catch-up step on load');
  // A hostile or ancient save converges to the same shape, never throws.
  const hostile = normalizeWorldPressure({
    tide: { not_a_sector: 9, sector_kepler_scar: 99 },
    gates: { 'a|b': { status: 'closed' }, [FIRST_KEY]: { status: 'welding', weld: 4 } },
    colossusRemains: [{ sectorId: 'nowhere' }],
  });
  assert.equal(hostile.tide.not_a_sector, undefined);
  assert.equal(hostile.tide.sector_kepler_scar <= 1, true);
  assert.equal(hostile.gates['a|b'], undefined, 'unknown edges rejected');
  assert.equal(hostile.gates[FIRST_KEY].weld <= 1, true);
  assert.equal(hostile.colossusRemains.length, 0);
});
