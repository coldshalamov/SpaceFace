import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/probe-sector-arrival-admission.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function installArrivalTransitionTrace()');
const end = source.indexOf('const diagnoseScript =', start);
const installer = source.slice(start, end);
function fixture(resume = function () { return this; }) {
  const render = { openingGraphPublicationFrozen: false, sectorShellAdmission: false,
    firstFlightDeferredHoldUntil: null, resumeDeferredPipelineAdmissions: resume };
  const owner = { _firstFlightDeferredHold: false, _liveSectorCookGeneration: 1 };
  const state = { render, tick: 1, simTime: 25, mode: 'flight', world: { currentSectorId: 'origin', enterSerial: 1 } };
  const window = { SF: { state, registry: { get: () => owner } } };
  const context = vm.createContext({ window });
  vm.runInContext(installer, context);
  return { render, owner, state, window, install: () => vm.runInContext('installArrivalTransitionTrace()', context) };
}
test('trace preserves writes, descriptor flags, receiver and exact returned promise', () => {
  const promise = Promise.resolve(3);
  let receiver;
  const f = fixture(function () { receiver = this; return promise; });
  const original = Object.getOwnPropertyDescriptor(f.render, 'openingGraphPublicationFrozen');
  f.install(); f.render.openingGraphPublicationFrozen = true;
  assert.equal(f.render.openingGraphPublicationFrozen, true);
  assert.equal(f.render.resumeDeferredPipelineAdmissions(), promise);
  assert.equal(receiver, f.render);
  f.window.__sfArrivalTransitionTrace.cleanup();
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.render, 'openingGraphPublicationFrozen'), { ...original, value: true });
});
test('trace preserves original exception and never reads hostile argument/error getters', () => {
  const error = Object.defineProperty({}, 'message', { get() { throw new Error('observer read'); } });
  const args = Object.defineProperty({}, 'force', { get() { throw new Error('observer read'); } });
  const f = fixture(() => { throw error; }); f.install();
  assert.throws(() => f.render.resumeDeferredPipelineAdmissions(args), (actual) => actual === error);
});
test('unsupported descriptors are refused without reading or altering them', () => {
  const f = fixture(); let reads = 0;
  Object.defineProperty(f.render, 'openingGraphPublicationFrozen', { configurable: true, get() { reads++; return false; } });
  Object.defineProperty(f.render, 'sectorShellAdmission', { value: false, writable: false, configurable: false });
  const before = Object.getOwnPropertyDescriptors(f.render); f.install();
  assert.equal(reads, 0);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.render, 'openingGraphPublicationFrozen'), before.openingGraphPublicationFrozen);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.render, 'sectorShellAdmission'), before.sectorShellAdmission);
});
test('ring and serialized output are bounded with explicit omissions', () => {
  const f = fixture(); f.install();
  for (let i = 0; i < 300; i++) f.owner._liveSectorCookGeneration = i;
  const snapshot = f.window.__sfArrivalTransitionTrace.snapshot('final');
  assert.ok(snapshot.rows.length <= 96); assert.ok(snapshot.omitted > 0);
  assert.ok(JSON.stringify(snapshot).length <= 24000);
  assert.equal(snapshot.current.cookGeneration, 299);
});
test('replacement owners are identified and cleanup does not overwrite replacement fields', () => {
  const f = fixture(); f.install(); const trace = f.window.__sfArrivalTransitionTrace;
  const before = trace.snapshot('before'); f.state.world = { currentSectorId: 'arrival', enterSerial: 2 }; f.state.render = {};
  const after = trace.snapshot('after');
  assert.notEqual(before.current.world, after.current.world);
  assert.notEqual(before.current.render, after.current.render);
  Object.defineProperty(f.render, 'openingGraphPublicationFrozen', { value: 'replacement', configurable: true });
  trace.cleanup(); assert.equal(f.render.openingGraphPublicationFrozen, 'replacement');
});
test('original arrival assertion and sample budget remain present and unweakened', () => {
  assert.ok(source.includes('assert.equal(\n    stranded.length,\n    0,'));
  assert.ok(source.includes('const SAMPLE_SECONDS = [5, 20, 45, 60, 90, 120];'));
  assert.ok(source.includes('Math.max(ARRIVE_BUDGET_S, SOFTWARE_GPU_RE.test(String(gpuString ||'));
});
