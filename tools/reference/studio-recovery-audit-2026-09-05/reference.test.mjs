import test from 'node:test';
import assert from 'node:assert/strict';
import {ropeEnvelope, reducedMass} from './ropeEnvelope.mjs';
import {maneuverEnvelope, segmentSeconds} from './maneuverEnvelope.mjs';
import {planTrade, TradeError} from './transferPlan.mjs';
import {quantile, analyzeTrace, compareManifests} from './frameAudit.mjs';

const near = (actual, expected, tol = 1e-9) => assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const rope = {massA: 18, massB: 630, speed: 200, length: 100, stiffness: 170};
test('rope: reduced mass and fixed anchor', () => { near(reducedMass(18, 630), 17.5); near(reducedMass(18, Infinity), 18); });
test('rope: zero speed has zero load and stretch', () => { const x = ropeEnvelope({...rope, speed: 0}); assert.equal(x.extension, 0); assert.equal(x.requiredStiffness, 0); });
test('rope: equilibrium satisfies K*x*(L+x)=mu*v^2', () => {
  const x = ropeEnvelope(rope); near(rope.stiffness * x.extension * (rope.length + x.extension), x.reducedMass * rope.speed ** 2);
  assert.ok(x.extensionRatio < x.firstOrderExtensionRatio);
});
test('rope: target-derived stiffness produces target extension', () => {
  const x = ropeEnvelope(rope); near(ropeEnvelope({...rope, stiffness: x.requiredStiffness}).extensionRatio, .05);
});
test('rope: short high-speed line exceeds scalar envelope', () => {
  assert.equal(ropeEnvelope(rope).targetFitsScalarEnvelope, true);
  assert.equal(ropeEnvelope({...rope, length: 8}).targetFitsScalarEnvelope, false);
});
test('rope: halving timestep quadruples scalar stiffness ceiling', () => {
  near(ropeEnvelope({...rope, dt: 1 / 120}).scalarStabilityCeiling, 4 * ropeEnvelope(rope).scalarStabilityCeiling);
});
test('rope: invalid and double-fixed pairs reject', () => {
  for (const massA of [0, -1, NaN]) assert.throws(() => ropeEnvelope({...rope, massA}), RangeError);
  assert.throws(() => reducedMass(Infinity, Infinity), RangeError);
  assert.throws(() => ropeEnvelope({...rope, length: 0}), RangeError);
});
test('rope: no input mutation and monotonic speed response', () => {
  const before = structuredClone(rope); const a = ropeEnvelope(rope), b = ropeEnvelope({...rope, speed: 220});
  assert.deepEqual(rope, before); assert.ok(b.extension > a.extension);
});

const maneuver = {samples: [{s: 0, curvature: 0}, {s: 1000, curvature: 0}], maxSpeed: 100, lateralAccel: 100, accel: 100, brake: 100};
test('maneuver: straight capped acceleration-cruise-brake timing', () => { near(maneuverEnvelope(maneuver).seconds, 11); });
test('maneuver: short zero-endpoint segment has finite triangular timing', () => {
  const m = maneuverEnvelope({...maneuver, samples: [{s: 0, curvature: 0}, {s: 1, curvature: 0}]});
  near(m.seconds, .2); near(m.averageSpeed, 5); assert.ok(m.averageSpeed < .7 * maneuver.maxSpeed);
});
test('maneuver: intermediate straight samples preserve timing', () => {
  const samples = [0, 50, 100, 500, 950, 1000].map(s => ({s, curvature: 0}));
  near(maneuverEnvelope({...maneuver, samples}).seconds, 11);
});
test('maneuver: curvature sets lateral-acceleration ceiling', () => {
  const m = maneuverEnvelope({...maneuver, samples: [{s: 0, curvature: .04}, {s: 1000, curvature: .04}]});
  near(m.segmentCaps[0], 50); assert.ok(m.segments[0].peakSpeed <= 50);
});
test('maneuver: overspeed entry is flagged rather than silently accepted', () => {
  const m = maneuverEnvelope({...maneuver, entrySpeed: 120}); assert.equal(m.entryFeasible, false); assert.equal(m.requestedEntrySpeed, 120);
});
test('maneuver: unreachable desired exit is flagged', () => {
  const m = maneuverEnvelope({...maneuver, samples: [{s: 0, curvature: 0}, {s: 1, curvature: 0}], exitSpeed: 100});
  assert.equal(m.exitFeasible, false);
});
test('maneuver: invalid path and infeasible segment reject', () => {
  assert.throws(() => maneuverEnvelope({...maneuver, samples: [{s: 0, curvature: 0}, {s: 0, curvature: 0}]}), RangeError);
  assert.throws(() => maneuverEnvelope({...maneuver, samples: [{s: 0, curvature: Infinity}, {s: 2, curvature: 0}]}), RangeError);
  assert.throws(() => segmentSeconds(1, 80, 0, 10, 10, 100), RangeError);
});
test('maneuver: input is not mutated', () => { const before = structuredClone(maneuver); maneuverEnvelope(maneuver); assert.deepEqual(maneuver, before); });

function state() { return {version: 0, wallets: {pilot: 100, station: 7}, holds: {
  pilot: {capacity: 10, items: {ore: 1}}, station: {capacity: 20, items: {ore: 20}}}, receipts: {}}; }
const quote = {id: 'trade:1', buyer: 'pilot', seller: 'station', good: 'ore', quantity: 3, unitPrice: 5, expectedVersion: 0, expiresAtTick: 10};
const hasCode = code => error => error instanceof TradeError && error.code === code;
test('trade: money and goods conserved and source immutable', () => {
  const s = state(), before = structuredClone(s), result = planTrade(s, quote, 5);
  assert.deepEqual(s, before); assert.equal(result.state.wallets.pilot, 85); assert.equal(result.state.wallets.station, 22);
  assert.equal(result.state.holds.pilot.items.ore + result.state.holds.station.items.ore, 21);
  assert.equal(result.state.wallets.pilot + result.state.wallets.station, 107);
});
test('trade: duplicate exact retry after expiry and save round trip is idempotent', () => {
  const once = planTrade(state(), quote, 5); const restored = JSON.parse(JSON.stringify(once.state));
  const twice = planTrade(restored, quote, 100); assert.equal(twice.duplicate, true); assert.equal(twice.state, restored);
  assert.deepEqual(twice.receipt, once.receipt); assert.equal(restored.version, 1);
});
test('trade: reused receipt with different request rejects', () => {
  const once = planTrade(state(), quote, 5); assert.throws(() => planTrade(once.state, {...quote, quantity: 2}, 5), hasCode('receipt_id_collision'));
});
test('trade: stale and expired quotes reject without mutation', () => {
  const s = state(), before = structuredClone(s);
  assert.throws(() => planTrade(s, {...quote, expectedVersion: 1}, 5), hasCode('stale_quote'));
  assert.throws(() => planTrade(s, quote, 11), hasCode('expired_quote')); assert.deepEqual(s, before);
});
test('trade: capacity rejects atomically', () => {
  const s = state(), before = structuredClone(s); assert.throws(() => planTrade(s, {...quote, quantity: 10}, 5), hasCode('insufficient_capacity')); assert.deepEqual(s, before);
});
test('trade: insufficient money and stock reject atomically', () => {
  const s = state(), before = structuredClone(s);
  assert.throws(() => planTrade(s, {...quote, unitPrice: 40}, 5), hasCode('insufficient_funds'));
  assert.throws(() => planTrade(s, {...quote, quantity: 21}, 5), hasCode('insufficient_stock')); assert.deepEqual(s, before);
});
test('trade: integer product overflow is detected exactly', () => {
  const s = state(); s.holds.pilot = {capacity: Number.MAX_SAFE_INTEGER, items: {}};
  s.holds.station = {capacity: Number.MAX_SAFE_INTEGER, items: {ore: Number.MAX_SAFE_INTEGER}};
  s.wallets.pilot = Number.MAX_SAFE_INTEGER;
  assert.throws(() => planTrade(s, {...quote, quantity: Number.MAX_SAFE_INTEGER, unitPrice: 2}, 5), hasCode('integer_overflow'));
});
test('trade: recipient and version overflow reject', () => {
  const s = state(); s.wallets.station = Number.MAX_SAFE_INTEGER;
  assert.throws(() => planTrade(s, quote, 5), hasCode('integer_overflow'));
  const t = state(); t.version = Number.MAX_SAFE_INTEGER;
  assert.throws(() => planTrade(t, {...quote, expectedVersion: t.version}, 5), hasCode('integer_overflow'));
});
test('trade: receipt capacity requires explicit checkpoint, not unsafe eviction', () => {
  const once = planTrade(state(), quote, 5);
  assert.throws(() => planTrade(once.state, {...quote, id: 'trade:2', expectedVersion: 1}, 5, {receiptLimit: 1}), hasCode('receipt_capacity_requires_checkpoint'));
  assert.equal(planTrade(once.state, quote, 5, {receiptLimit: 1}).duplicate, true);
});
test('trade: invalid quantities, identifiers, and same-party trades reject', () => {
  for (const quantity of [-1, 0, NaN, 1.5]) assert.throws(() => planTrade(state(), {...quote, quantity}, 5), hasCode('invalid_integer'));
  assert.throws(() => planTrade(state(), {...quote, good: '__proto__'}, 5), hasCode('invalid_identifier'));
  assert.throws(() => planTrade(state(), {...quote, seller: 'pilot'}, 5), hasCode('same_party'));
});
test('trade: overfull initial hold is not laundered through a new trade', () => {
  const s = state(); s.holds.pilot.items.ore = 11; assert.throws(() => planTrade(s, quote, 5), hasCode('overfull_initial_hold'));
});
test('trade: bounded sequence of trades conserves quantities and money', () => {
  let s = state(); const walletTotal = 107;
  for (let i = 0; i < 7; i++) {
    s = planTrade(s, {...quote, id: `trade:${i}`, expectedVersion: s.version, quantity: 1, unitPrice: i + 1}, i).state;
    assert.equal(s.wallets.pilot + s.wallets.station, walletTotal);
    assert.equal(s.holds.pilot.items.ore + s.holds.station.items.ore, 21);
  }
});

test('frame: interpolated quantiles and empty data', () => { near(quantile([1, 2, 3, 4], .95), 3.85); assert.equal(quantile([], .95), null); });
test('frame: foreground hitches retained, lifecycle exclusions counted', () => {
  const r = analyzeTrace({frames: [{lifecycle: 'foreground', frameMs: 16}, {lifecycle: 'foreground', frameMs: 17},
    {lifecycle: 'foreground', frameMs: 100}, {lifecycle: 'hidden', frameMs: 1000}, {lifecycle: 'foreground', frameMs: NaN}]});
  assert.deepEqual(r.coverage, {total: 5, invalid: 1, excludedLifecycle: 1, foreground: 3, gpuValidSamples: 0, shedCounterSamples: 0});
  assert.equal(r.frameMs.max, 100); assert.equal(r.overBudgetFrames, 2); near(r.throughputFps, 3000 / 133);
});
test('frame: invalid GPU samples are unknown, not zero', () => {
  const r = analyzeTrace({frames: [{lifecycle: 'foreground', frameMs: 16, gpuMs: 8, gpuValid: false}]});
  assert.equal(r.phases.gpuMs.mean, null); assert.equal(r.phases.gpuMs.samples, 0);
});
test('frame: valid GPU and shed simulation time are separately reported', () => {
  const r = analyzeTrace({frames: [{lifecycle: 'foreground', frameMs: 50, gpuMs: 2, gpuValid: true, shedTicks: 3}]});
  assert.equal(r.phases.gpuMs.mean, 2); near(r.shedSimulationMs, 50);
});
test('frame: comparable manifests require all controlled fields, but not equal commit', () => {
  const a = Object.fromEntries(['route','scenarioRevision','inputTapeHash','seed','hull','device','resolution','quality','profile','physicsBackend','cacheState','displayHz'].map(k => [k, 'same']));
  const b = {...a, commit: 'new'}; assert.equal(compareManifests(a, b).comparable, true);
  assert.equal(compareManifests(a, {...b, profile: 'legacy47a'}).comparable, false);
  assert.equal(compareManifests({}, {}).comparable, false);
});
