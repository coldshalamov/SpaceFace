import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { collectStationHandoffSnapshot, reportStationHandoffFailure } from '../scripts/lib/stationHandoffDiagnostics.mjs';

function collector(overrides = {}) {
  return runInNewContext(`(${collectStationHandoffSnapshot.toString()})()`, {
    window: {}, document: { querySelectorAll: () => [] }, ...overrides,
  });
}
function element(attrs = {}, options = {}) {
  return { isConnected: true, hidden: false, inert: false,
    getAttribute: (name) => attrs[name] ?? null,
    getBoundingClientRect: () => ({ x: 1, y: 2, width: 300, height: 150 }),
    querySelector: () => null, querySelectorAll: () => [], ...options };
}
test('missing runtime and missing station are distinct JSON-safe evidence', () => {
  const s = JSON.parse(JSON.stringify(collector()));
  assert.equal(s.lane, null);
  assert.equal(s.dockedStationId, null);
  assert.equal(s.stationRootCount, 0);
  assert.deepEqual(s.dock, { present: false });
  assert.equal(s.boardPresent, false);
});
test('collector records stale rendered rows, real lane counters and duplicate mounts without mutation', () => {
  const state = { mode: 'flight', tick: 30, simTime: .5, playerId: 1,
    entities: new Map([[1, { id: 1, alive: true, hull: 60 }]]),
    ui: { docked: true, dockedStationId: 'station_helios', screenStack: ['station'] },
    missions: { boards: { station_helios: { slots: [{ id: 'new_offer' }, { id: 'old_offer' }] } } } };
  const before = structuredClone(state);
  const rows = [element({ 'data-mid': 'old_offer' })];
  const contracts = element();
  const root = element({ 'data-operation': 'contracts' }, {
    querySelector: (selector) => selector === '.sx-ct' ? contracts : null,
    querySelectorAll: () => rows,
  });
  const snapshot = collector({
    window: { __SF_LANE_APPLIED: ['mission:updated', 'dock:docked'], SF: { state,
      ctx: { simLane: 'worker' }, simLaneDiag: () => ({ lane: 'worker', laneReady: true,
        replyCount: 12, pendingRpcs: 0, closed: false,
        domainAppliedKeys: { 'missions.boards.station_helios': 3, 'ui.docked': 2, 'player.credits': 99 },
        credentials: 'must not be copied', journal: { fullState: 'must not be copied' } }),
      registry: { get: () => ({ _fe: 2, _registeredScreens: new Set(['station']),
        screenManager: { top: () => 'station' } }) } } },
    document: { querySelectorAll: () => [root, element()] },
    getComputedStyle: () => ({ display: 'grid', visibility: 'visible', opacity: '1' }),
  });
  const s = JSON.parse(JSON.stringify(snapshot));
  assert.equal(s.stationRootCount, 2);
  assert.equal(s.contracts.rect.width, 300);
  assert.deepEqual(s.postedIds, ['new_offer', 'old_offer']);
  assert.deepEqual(s.renderedRows.map((r) => r.missionId), ['old_offer']);
  assert.deepEqual(s.recentLaneEvents, ['mission:updated', 'dock:docked']);
  assert.equal(s.lane.domainAppliedKeys['missions.boards.station_helios'], 3);
  assert.equal(s.lane.domainAppliedKeys['player.credits'], undefined);
  assert.equal(s.frameErrors, 2);
  assert.ok(!JSON.stringify(s).includes('must not be copied'));
  assert.deepEqual(state, before);
});
test('non-finite and unsupported diagnostic values cannot break JSON serialization', () => {
  const s = collector({ window: { SF: { state: { tick: 1n, simTime: Infinity,
    ui: { screenStack: [Symbol('bad'), undefined] } },
    simLaneDiag: () => ({ lane: 'worker', replyCount: NaN, domainAppliedKeys: { missions: 1n } }) } } });
  assert.equal(s.tick, null);
  assert.equal(s.lane.domainAppliedKeys.missions, null);
  assert.doesNotThrow(() => JSON.stringify(s));
});
test('lane diagnostic failure retains DOM and board evidence', () => {
  const s = collector({ window: { SF: { simLaneDiag: () => { throw new Error('observer failed'); } } } });
  assert.equal(s.lane, null);
  assert.equal(s.laneDiagnosticError, 'observer failed');
  assert.equal(s.stationRootCount, 0);
});

const issues = { errorIssues: () => [], warningIssues: () => [] };
test('report caps issues, excludes request bodies and throws the identical original error', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const original = new Error('original actor timeout');
  await assert.rejects(reportStationHandoffFailure({ evaluate: async (fn) => {
    assert.equal(fn, collectStationHandoffSnapshot); return { boardCount: 3 };
  } }, { boundary: 'posted mission row' }, {
    errorIssues: () => Array.from({ length: 20 }, () => ({ text: 'x'.repeat(2000), body: 'secret' })),
    warningIssues: () => [],
  }, original), (e) => e === original);
  const s = JSON.parse(logs[0][1]);
  assert.equal(s.boundary, 'posted mission row');
  assert.equal(s.pageErrors.length, 8);
  assert.equal(s.pageErrors[0].text.length, 1200);
  assert.equal(s.pageErrors[0].body, undefined);
});
test('stuck evaluation is bounded at 2000ms and cannot replace original failure', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = new Error('actor failed');
  const pending = assert.rejects(reportStationHandoffFailure({ evaluate: () => new Promise(() => {}) }, {}, issues, original), (e) => e === original);
  t.mock.timers.tick(2000);
  await pending;
  assert.match(logs[0][1], /exceeded 2000ms/);
});
test('closed page, unserializable snapshot and failing logger preserve original error', async (t) => {
  t.mock.method(console, 'error', () => { throw new Error('logger unavailable'); });
  for (const evaluate of [() => { throw new Error('page closed'); }, async () => ({ bad: 1n })]) {
    const original = new Error('actor failed');
    await assert.rejects(reportStationHandoffFailure({ evaluate }, {}, issues, original), (e) => e === original);
  }
});
test('runtime probes retain actor deadlines and instrument each observed boundary', () => {
  const mission = readFileSync(new URL('../scripts/check-mission-accept-handoff-runtime.mjs', import.meta.url), 'utf8');
  const market = readFileSync(new URL('../scripts/check-market-first-loop-runtime.mjs', import.meta.url), 'utf8');
  assert.match(mission, /timeout: 6000.*\)\.catch/);
  assert.match(mission, /boundary: 'posted mission row'/);
  assert.match(mission, /boundary: 'mission dock identity'/);
  assert.match(market, /boundary: 'market dock visibility'/);
  for (const s of [mission, market]) assert.match(s, /DOCK_TIMEOUT_MS = 15000/);
});
