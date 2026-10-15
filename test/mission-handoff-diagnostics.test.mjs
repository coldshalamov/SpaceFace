import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../scripts/check-mission-accept-handoff-runtime.mjs', import.meta.url), 'utf8');
const helperStart = source.indexOf('async function reportDockHandoffFailure(');
const snapshotStart = source.indexOf('function collectDockHandoffSnapshot(');
const acceptSnapshotStart = source.indexOf('function collectAcceptHandoffSnapshot(');
const helperEnd = source.indexOf('async function domClick(');
assert.ok(helperStart >= 0, 'dock failure observer source marker must exist');
assert.ok(snapshotStart > helperStart, 'dock snapshot collector source marker must follow the observer');
assert.ok(acceptSnapshotStart > snapshotStart, 'acceptance snapshot marker must follow the dock collector');
assert.ok(helperEnd > acceptSnapshotStart, 'observer source boundary must follow both complete snapshot collectors');
const helperSource = source.slice(helperStart, helperEnd);
function helpers(overrides = {}) {
  const logs = [];
  const context = { setTimeout, clearTimeout, console: { error: (...args) => logs.push(args) },
    window: {}, document: { querySelector: () => null }, ...overrides };
  return { ...runInNewContext(helperSource + '\n({ reportDockHandoffFailure, collectDockHandoffSnapshot, reportAcceptHandoffFailure, attemptSeededMissionAccept, collectAcceptHandoffSnapshot, reportMarketHandoffFailure, collectMarketHandoffSnapshot })', context), logs };
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
  const state = { missions: { active: [instance] }, ui: { trackedMissionId: instance.id } };
  const settled = () => acceptancePredicates(state, 0).final;
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

test('the accept actor sends one intent and distinguishes a pending worker request from readiness denial', () => {
  let clicks = 0;
  const key = { disabled: false, isConnected: true, textContent: 'Accept',
    getAttribute: name => { assert.equal(name, 'aria-label'); return 'Accept Probe and bind its route. Ship and account ready.'; },
    click() { clicks++; this.disabled = true; } };
  const h = helpers({ document: { querySelector: selector => selector.endsWith('.k-bad') ? null : key } });
  const first = h.attemptSeededMissionAccept();
  assert.equal(first.activated, true);
  assert.equal(first.readinessBlocked, false);
  assert.equal(clicks, 1);
  const pending = h.attemptSeededMissionAccept();
  assert.equal(pending.disabled, true);
  assert.equal(pending.pending, true, 'the controller retains its ready explanation while awaiting the RPC');
  assert.equal(pending.readinessBlocked, false);
  assert.equal(pending.activated, undefined);
  assert.equal(clicks, 1, 'a pending intent is never clicked again');
});

test('the accept actor preserves actual readiness reasons and unknown disabled controls fail closed', () => {
  const reason = 'Need 400 cr collateral';
  const key = { disabled: true, textContent: 'Resolve Readiness',
    getAttribute: () => `Cannot accept Probe. ${reason}.`,
    click() { assert.fail('a blocked control must not be activated'); } };
  const gate = { textContent: reason + 'x'.repeat(1000) };
  const h = helpers({ document: { querySelector: selector => selector.endsWith('.k-bad') ? gate : key } });
  const blocked = h.attemptSeededMissionAccept();
  assert.equal(blocked.readinessBlocked, true);
  assert.equal(blocked.pending, false);
  assert.ok(blocked.reason.startsWith(reason));
  assert.equal(blocked.reason.length, 600, 'the actual displayed blocker is bounded');
  const unknown = helpers({ document: { querySelector: selector => selector.endsWith('.k-bad')
    ? null : { ...key, getAttribute: () => '' } } }).attemptSeededMissionAccept();
  assert.equal(unknown.disabled, true);
  assert.equal(unknown.pending, false, 'unknown disabled state cannot masquerade as a pending request');
});

test('acceptance observer includes actor evidence and bounded issues, preserving the exact timeout', async () => {
  const h = helpers(), error = new Error('original 10s acceptance timeout');
  const attempt = { before: 2, seeded: { stationId: 'station_ceres' },
    commit: { found: true, disabled: false, connected: true }, consumed: { grew: false, tracked: false } };
  await assert.rejects(h.reportAcceptHandoffFailure({ evaluate: async fn => ({ collector: fn.name }) },
    attempt, { errorIssues: () => [], warningIssues: () => Array.from({ length: 10 }, () => ({ text: 'x'.repeat(2000) })) },
    error), candidate => candidate === error);
  const snapshot = JSON.parse(h.logs[0][1]);
  assert.match(h.logs[0][0], /Accept & Track continuity snapshot/);
  assert.equal(snapshot.collector, 'collectAcceptHandoffSnapshot');
  assert.deepEqual(snapshot.attempt, attempt);
  assert.equal(snapshot.pageWarnings.length, 8);
  assert.equal(snapshot.pageWarnings[0].text.length, 1200);
});

for (const failure of ['async evaluation', 'sync evaluation', 'hung evaluation', 'serialization', 'logger']) {
  test(`acceptance ${failure} failure cannot replace the original timeout`, async () => {
    const armed = [], cleared = [];
    const h = helpers({ setTimeout: (fn, ms) => { armed.push(ms); queueMicrotask(fn); return 19; },
      clearTimeout: id => cleared.push(id),
      ...(failure === 'logger' ? { console: { error: () => { throw new Error('logger failed'); } } } : {}) });
    const page = { evaluate: () => {
      if (failure === 'sync evaluation') throw new Error('page closed');
      if (failure === 'async evaluation') return Promise.reject(new Error('page closed'));
      if (failure === 'hung evaluation') return new Promise(() => {});
      return Promise.resolve(failure === 'serialization' ? { unsupported: 1n } : {});
    } };
    const original = new Error('original 10s acceptance timeout');
    await assert.rejects(h.reportAcceptHandoffFailure(page, {}, emptyIssues, original), candidate => candidate === original);
    if (failure !== 'sync evaluation') {
      assert.deepEqual(armed, [2000]);
      assert.deepEqual(cleared, [19]);
    }
  });
}

test('acceptance snapshot observes current board, selection, receipt and hold progress without mutation', () => {
  const offer = { id: 'handoff_probe_bulk_trade', type: 'bulk_trade', reward: 1200, destStationId: 'station_depot' };
  const state = { mode: 'docked', tick: 91, simTime: 1.5,
    ui: { docked: true, dockedStationId: 'station_ceres', trackedMissionId: 'm_2' },
    missions: { boards: { station_ceres: { slots: [offer] } },
      active: [{ id: 'm_2', sourceOfferId: 'previous_offer', status: 'active' }] } };
  const before = JSON.stringify(state);
  const key = { isConnected: true, disabled: false, textContent: 'Accept + Bind Route',
    getAttribute: name => {
      if (name === 'aria-label') return 'Accept Probe and bind its route. Ship and account ready.';
      assert.equal(name, 'data-accept'); return offer.id;
    },
    classList: { contains: name => name === 'is-holding' },
    querySelector: selector => { assert.equal(selector, '.dp-holdring'); return {
      style: { getPropertyValue: name => { assert.equal(name, '--sf-hold-p'); return '0.375'; } },
    }; } };
  const h = helpers({ window: { SF: { state } }, document: { querySelector: selector =>
    selector.includes('aria-selected') ? { getAttribute: () => offer.id } : key } });
  const snapshot = JSON.parse(JSON.stringify(h.collectAcceptHandoffSnapshot()));
  assert.equal(snapshot.activeCount, 1);
  assert.deepEqual(snapshot.active, [{ id: 'm_2', status: 'active', sourceOfferId: 'previous_offer' }]);
  assert.equal(snapshot.boardPresent, true);
  assert.deepEqual(snapshot.postedIds, [offer.id]);
  assert.equal(snapshot.offer.reward, 1200);
  assert.equal(snapshot.selectedOfferId, offer.id);
  assert.equal(snapshot.acceptKey.missionId, offer.id);
  assert.match(snapshot.acceptKey.ariaLabel, /^Accept Probe/);
  assert.equal(snapshot.acceptKey.holding, true);
  assert.equal(snapshot.acceptKey.holdProgress, '0.375');
  assert.equal(JSON.stringify(state), before);
  state.missions.boards.station_ceres.slots = [];
  key.disabled = true;
  assert.equal(h.collectAcceptHandoffSnapshot().offer, null);
  assert.equal(h.collectAcceptHandoffSnapshot().acceptKey.disabled, true);
});

test('acceptance snapshot distinguishes missing runtime and caps board and instance rows', () => {
  const h = helpers();
  const missing = h.collectAcceptHandoffSnapshot();
  assert.equal(missing.boardPresent, false);
  assert.equal(missing.offer, null);
  assert.equal(missing.acceptKey, null);
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `m_${i}`, status: 'active' }));
  const populated = helpers({ window: { SF: { state: { ui: { dockedStationId: 's' },
    missions: { active: rows, boards: { s: { slots: rows } } } } } } }).collectAcceptHandoffSnapshot();
  assert.equal(populated.activeCount, 50);
  assert.equal(populated.boardCount, 50);
  assert.equal(populated.active.length, 32);
  assert.equal(populated.postedIds.length, 32);
});

function acceptancePredicates(state, before) {
  const extract = (startMarker, endMarker, callMarker = startMarker) => {
    const section = source.indexOf(startMarker);
    const start = source.indexOf(callMarker, section);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, 'actual acceptance predicate must exist');
    return runInNewContext(`(${source.slice(start + callMarker.length, end)})(${before})`,
      { window: { SF: { state } } });
  };
  return {
    final: extract('// Accept + Track continuity:', ', before, { timeout: 10000 })', 'await page.waitForFunction('),
    consumed: extract('const consumed = !(commit && commit.found) ? await page.evaluate(', ', before) : { grew: false'),
  };
}

test('final acceptance and consumed-offer fallback require the seeded receipt and exact tracked instance', async () => {
  const { missions } = await import('../src/systems/missions.js');
  const owner = Object.create(missions);
  owner.state = { meta: { seed: 47 }, simTime: 120, tick: 7200, missions: { nextId: 8 } };
  const accepted = owner._instanceFromOffer({ id: 'handoff_probe_bulk_trade', type: 'bulk_trade',
    params: { cmdtyId: 'cmdty_ore_iron', qty: 6 } });
  const unrelated = { id: 'm_other', sourceOfferId: 'other_offer', status: 'active' };
  const state = { missions: { active: [unrelated] }, ui: { trackedMissionId: unrelated.id } };
  const check = (expected, before = 0) => {
    const result = acceptancePredicates(state, before);
    assert.equal(result.final, expected);
    assert.equal(result.consumed.grew && result.consumed.tracked, expected);
  };
  check(false); // Unrelated active-count growth used to pass both predicates.
  state.missions.active.push(accepted);
  check(false); // A receipt alone cannot substitute for tracking its instance.
  state.ui.trackedMissionId = accepted.id;
  assert.equal(accepted.id, 'm_8');
  check(true);
  check(false, 2); // Preserve the original growth assertion too.
  state.ui.trackedMissionId = accepted.sourceOfferId;
  check(false);
  state.ui.trackedMissionId = accepted.id;
  delete accepted.sourceOfferId;
  for (let attempt = 0; attempt < 4; attempt++) check(false); // Repeated accepts cannot invent a receipt.
  accepted.sourceOfferId = 'handoff_probe_bulk_trade';
  check(true); // A delayed real receipt may finally satisfy continuity.
  accepted.status = 'completed';
  check(false);
});

test('Market observer includes seeded identity and bounded errors and rethrows the original failure', async () => {
  const h = helpers(), original = new Error('Market commodity flag timeout');
  const attempt = { seeded: { cmdtyId: 'cmdty_ore_iron' }, acceptedTrackedId: 'm_8' };
  await assert.rejects(h.reportMarketHandoffFailure({ evaluate: async fn => ({ collector: fn.name }) },
    attempt, { errorIssues: () => Array.from({ length: 20 }, () => ({ text: 'x'.repeat(2000) })),
      warningIssues: () => [] }, original), candidate => candidate === original);
  const snapshot = JSON.parse(h.logs[0][1]);
  assert.equal(snapshot.collector, 'collectMarketHandoffSnapshot');
  assert.deepEqual(snapshot.attempt, attempt);
  assert.equal(snapshot.pageErrors.length, 8);
  assert.equal(snapshot.pageErrors[0].text.length, 1200);
});

for (const failure of ['sync evaluation', 'async evaluation', 'hung evaluation', 'serialization', 'logger']) {
  test(`Market ${failure} failure preserves the original timeout`, async () => {
    const armed = [], cleared = [];
    const h = helpers({ setTimeout: (fn, ms) => { armed.push(ms); queueMicrotask(fn); return 23; },
      clearTimeout: id => cleared.push(id),
      ...(failure === 'logger' ? { console: { error: () => { throw new Error('logger'); } } } : {}) });
    const page = { evaluate: () => {
      if (failure === 'sync evaluation') throw new Error('closed');
      if (failure === 'async evaluation') return Promise.reject(new Error('closed'));
      if (failure === 'hung evaluation') return new Promise(() => {});
      return Promise.resolve(failure === 'serialization' ? { unsupported: 1n } : {});
    } };
    const original = new Error('Market flag timeout');
    await assert.rejects(h.reportMarketHandoffFailure(page, {}, emptyIssues, original), e => e === original);
    if (failure !== 'sync evaluation') {
      assert.deepEqual(armed, [2000]);
      assert.deepEqual(cleared, [23]);
    }
  });
}

test('Market snapshot distinguishes tracked/accepted identities, waypoint and current surface without mutation', () => {
  const accepted = { id: 'm_8', sourceOfferId: 'handoff_probe_bulk_trade', status: 'active',
    params: { cmdtyId: 'cmdty_ore_iron' } };
  const state = { ui: { docked: true, dockedStationId: 'station_ceres', trackedMissionId: 'm_other' },
    missions: { active: [accepted, { id: 'm_other', sourceOfferId: 'other_offer', status: 'active' }] },
    nav: { waypoint: { kind: 'story', stationId: 'station_depot' } }, privateUnrelated: 'do not collect' };
  const before = JSON.stringify(state);
  const element = (attrs, tracked = false) => ({ getAttribute: name => attrs[name] ?? null,
    classList: { contains: name => name === 'is-tracked' && tracked } });
  const rows = Array.from({ length: 80 }, (_, i) => element({ 'data-cmdty': `cmdty_${i}`,
    'aria-selected': String(i === 3) }, i === 70));
  const root = { getAttribute: name => ({ 'data-operation': 'market', 'data-view': 'trade' })[name],
    querySelectorAll: selector => selector === '.sx-mkt-row' ? rows : [element({ 'data-market-filter': 'hold' })],
    querySelector: selector => ({ '.sx-mkt': {}, '.sx-mkt-row[aria-selected="true"]': rows[3],
      '[data-market-search]': { value: 'ore' } })[selector] || null };
  const h = helpers({ window: { SF: { state } }, document: { querySelector: () => root } });
  const snapshot = JSON.parse(JSON.stringify(h.collectMarketHandoffSnapshot()));
  assert.equal(snapshot.trackedInstance.sourceOfferId, 'other_offer');
  assert.equal(snapshot.acceptedInstances[0].id, accepted.id);
  assert.equal(snapshot.acceptedInstances[0].cmdtyId, 'cmdty_ore_iron');
  assert.equal(snapshot.waypoint.kind, 'story');
  assert.equal(snapshot.waypoint.commodityId, null);
  assert.equal(snapshot.dockedStationId, 'station_ceres');
  assert.equal(snapshot.operation, 'market');
  assert.equal(snapshot.view, 'trade');
  assert.equal(snapshot.rowCount, 80);
  assert.equal(snapshot.rows.length, 64);
  assert.deepEqual(snapshot.flaggedCommodityIds, ['cmdty_70']);
  assert.equal(snapshot.selectedCommodityId, 'cmdty_3');
  assert.deepEqual(snapshot.filters, ['hold']);
  assert.equal(snapshot.search, 'ore');
  assert.equal(snapshot.callout, null);
  assert.equal(JSON.stringify(snapshot).includes('do not collect'), false);
  assert.equal(JSON.stringify(state), before);
  const absent = helpers().collectMarketHandoffSnapshot();
  assert.equal(absent.marketPresent, false);
  assert.equal(absent.trackedInstance, null);
  assert.equal(absent.rowCount, 0);
});
