import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../scripts/check-mission-accept-handoff-runtime.mjs', import.meta.url), 'utf8');
const helperStart = source.indexOf('async function reportDockHandoffFailure(');
const snapshotStart = source.indexOf('function collectDockHandoffSnapshot(');
const helperEnd = source.indexOf('async function domClick(');
assert.ok(helperStart >= 0, 'dock failure observer source marker must exist');
assert.ok(snapshotStart > helperStart, 'dock snapshot collector source marker must follow the observer');
assert.ok(helperEnd > snapshotStart, 'observer source boundary must follow the complete snapshot collector');
const helperSource = source.slice(helperStart, helperEnd);
function helpers(overrides = {}) {
  const logs = [];
  const context = { setTimeout, clearTimeout, console: { error: (...args) => logs.push(args) },
    window: {}, document: { querySelector: () => null }, ...overrides };
  return { ...runInNewContext(helperSource + '\n({ reportDockHandoffFailure, collectDockHandoffSnapshot })', context), logs };
}
const emptyIssues = { errorIssues: () => [], warningIssues: () => [] };
async function originalSurvives(report, page, issues = emptyIssues) {
  const error = new Error('original 15s dock wait failure');
  await assert.rejects(report(page, { stationId: 'station_ceres' }, issues, error), candidate => candidate === error);
}
test('successful snapshot includes target and bounded issues, then rethrows the identical failure', async () => {
  const h = helpers();
  await originalSurvives(h.reportDockHandoffFailure, { evaluate: async fn => ({ docked: false, collector: fn.name }) }, {
    errorIssues: () => Array.from({ length: 12 }, (_, i) => ({ type: 'error', text: `${i}:` + 'x'.repeat(1500) })),
    warningIssues: () => [{ type: 'warning', text: 'station not registered' }],
  });
  const result = JSON.parse(h.logs[0][1]);
  assert.equal(result.dockTarget.stationId, 'station_ceres');
  assert.equal(result.collector, 'collectDockHandoffSnapshot');
  assert.equal(result.docked, false);
  assert.equal(result.pageErrors.length, 8);
  assert.equal(result.pageErrors[0].text.length, 1200);
  assert.equal(result.pageWarnings[0].text, 'station not registered');
});
test('an asynchronous page inspection error cannot mask the original failure', async () => {
  const h = helpers();
  await originalSurvives(h.reportDockHandoffFailure, { evaluate: async () => { throw new Error('page closed'); } });
  assert.match(h.logs[0][0], /snapshot unavailable/);
});
test('a synchronous page inspection error cannot mask the original failure', async () => {
  const h = helpers();
  await originalSurvives(h.reportDockHandoffFailure, { evaluate: () => { throw new Error('no context'); } });
});
test('an unresponsive page snapshot is bounded and still preserves the original failure', async () => {
  const armed = [], cleared = [];
  const h = helpers({ setTimeout: (fn, ms) => { armed.push(ms); queueMicrotask(fn); return 17; },
    clearTimeout: id => cleared.push(id) });
  await originalSurvives(h.reportDockHandoffFailure, { evaluate: () => new Promise(() => {}) });
  assert.deepEqual(armed, [2000]);
  assert.deepEqual(cleared, [17]);
  assert.match(h.logs[0][1], /exceeded 2000ms/);
});
test('snapshot serialization errors cannot mask the original failure', async () => {
  const h = helpers();
  await originalSurvives(h.reportDockHandoffFailure, { evaluate: async () => ({ unsupported: 1n }) });
  assert.match(h.logs[0][0], /snapshot unavailable/);
});
test('diagnostic logger failure cannot mask the original failure', async () => {
  const h = helpers({ console: { error: () => { throw new Error('logger failed'); } } });
  await originalSurvives(h.reportDockHandoffFailure, { evaluate: async () => ({}) });
});
test('missing runtime and absent elements are represented honestly', () => {
  const { collectDockHandoffSnapshot } = helpers();
  const snapshot = JSON.parse(JSON.stringify(collectDockHandoffSnapshot()));
  assert.equal(snapshot.mode, null);
  assert.equal(snapshot.player, null);
  assert.equal(snapshot.stationRegistered, null);
  assert.deepEqual(snapshot.station, { present: false });
  assert.deepEqual(snapshot.dock, { present: false });
});
test('snapshot reads real state/screen/DOM surfaces without changing them', () => {
  const player = { id: 7, alive: true, hull: 42 };
  const state = { mode: 'paused', tick: 91, simTime: 1.5, playerId: 7,
    entities: new Map([[7, player]]), ui: { docked: true, dockedStationId: 'station_ceres', screenStack: ['station'] } };
  const before = JSON.stringify({ state, player });
  const station = { isConnected: true, hidden: false, getAttribute: () => 'true',
    getBoundingClientRect: () => ({ x: 3, y: 4, width: 0, height: 0 }) };
  const { collectDockHandoffSnapshot } = helpers({ window: { SF: { state, registry: { get: name => {
    assert.equal(name, 'ui'); return { screenManager: { top: () => 'station' }, _registeredScreens: new Set(['station']) };
  } } } }, document: { querySelector: selector => selector.endsWith('.sx-dock') ? null : station },
  getComputedStyle: el => { assert.equal(el, station); return { display: 'none', visibility: 'visible', opacity: '1' }; } });
  const snapshot = JSON.parse(JSON.stringify(collectDockHandoffSnapshot()));
  assert.equal(snapshot.docked, true);
  assert.equal(snapshot.dockedStationId, 'station_ceres');
  assert.equal(snapshot.topScreen, 'station');
  assert.equal(snapshot.stationRegistered, true);
  assert.equal(snapshot.station.display, 'none');
  assert.equal(snapshot.station.rect.width, 0);
  assert.deepEqual(snapshot.dock, { present: false });
  assert.equal(JSON.stringify({ state, player }), before);
});

test('probe settlement follows the accepted instance receipt and exact tracked identity', async () => {
  const { missions } = await import('../src/systems/missions.js');
  const owner = Object.create(missions);
  owner.state = { meta: { seed: 47 }, simTime: 120, tick: 7200, missions: { nextId: 3 } };
  const offer = { id: 'handoff_probe_bulk_trade', type: 'bulk_trade',
    params: { cmdtyId: 'cmdty_ore_iron', qty: 6 } };
  const instance = owner._instanceFromOffer(offer);
  assert.equal(instance.id, 'm_3');
  assert.equal(instance.sourceOfferId, offer.id);
  const marker = 'const settled = await page.evaluate(';
  const start = source.indexOf(marker);
  const end = source.indexOf(');\n    if (settled)', start);
  assert.ok(start >= 0 && end > start, 'the actual probe settlement predicate must exist');
  const predicate = source.slice(start + marker.length, end);
  const state = { missions: { active: [instance] }, ui: { trackedMissionId: instance.id } };
  const settled = () => runInNewContext(`(${predicate})()`, { window: { SF: { state } } });
  assert.equal(settled(), true, 'a successful acceptance uses the new instance ID');
  state.ui.trackedMissionId = offer.id;
  assert.equal(settled(), false, 'tracking the source offer is not tracking its instance');
  state.ui.trackedMissionId = instance.id;
  instance.sourceOfferId = 'unrelated_offer';
  assert.equal(settled(), false, 'an unrelated tracked contract cannot settle this probe');
  instance.sourceOfferId = offer.id;
  instance.status = 'completed';
  assert.equal(settled(), false, 'only an active instance settles the acceptance probe');
});
