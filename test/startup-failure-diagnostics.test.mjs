import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { captureStartupFailureDiagnostics as capture, observeStartupFailureEvents as observe } from '../scripts/lib/startup-failure-diagnostics.mjs';

function busFixture() {
  const listeners = new Map();
  return {
    listeners,
    on(event, callback) { listeners.set(event, callback); return () => listeners.delete(event); },
    emit(event, payload) { listeners.get(event)?.(payload); },
  };
}

test('missing state yields bounded JSON with explicit unavailable fields', () => {
  for (const sf of [undefined, null, {}, { state: null }]) {
    const snapshot = capture(sf);
    assert.equal(snapshot.firstPicturePhase.stage, null);
    assert.deepEqual(snapshot.cookLedger, []);
    assert.doesNotThrow(() => JSON.stringify(snapshot));
  }
});

test('capture retains actual gate ownership, phase and ledger scalar timing', () => {
  const phase = Object.freeze({ stage: 'current-sector', outcome: 'pending', startedAt: 200, budgetMs: 120000 });
  const row = Object.freeze({ step: 'exact.mesh-staging', outcome: 'resolved', t: 55, ms: 12 });
  const sf = { state: { mode: 'loading', tick: 0, contextRestoreSeq: 3,
    world: { enterSerial: 9, currentSectorId: 'helios' },
    render: { admissionRunGeneration: 4, openingFirstPicturePhase: phase,
      openingCookLedger: Object.freeze([row]), requiredPackageAdmission: { status: 'pending' } } } };
  const result = capture(sf);
  assert.equal(result.firstPicturePhase.stage, 'current-sector');
  assert.equal(result.firstPicturePhase.budgetMs, 120000);
  assert.equal(result.cookLedger[0].t, 55);
  assert.equal(result.world.enterSerial, 9);
  assert.equal(result.render.admissionRunGeneration, 4);
  assert.equal(result.requiredPackageAdmission.status, 'pending');
  assert.equal(sf.state.render.openingFirstPicturePhase, phase);
  assert.equal(sf.state.render.openingCookLedger[0], row);
});

test('capture never invokes getters, thenables or renderer controls and ignores cyclic graphs', () => {
  const fail = () => { throw Error('must not execute'); };
  const render = { openingFirstPicturePhase: { stage: 'seal' }, openingLiveSectorReady: { then: fail },
    prepareOpeningFirstPicture: fail, renderer: { token: 'secret-do-not-copy' } };
  Object.defineProperty(render, 'openingFirstPictureReady', { get: fail });
  const sf = { state: { render } }; sf.state.entityList = [sf];
  const result = capture(sf);
  assert.equal(result.render.openingFirstPictureReady, null);
  assert.equal(JSON.stringify(result).includes('secret-do-not-copy'), false);
  assert.equal(result.firstPicturePhase.stage, 'seal');
});

test('ledger, event count and strings are capped; nonfinite values never enter JSON', () => {
  const long = 'x'.repeat(5000);
  const rows = Array.from({ length: 200 }, (_, i) => ({ step: long, ms: i, reason: long }));
  const result = capture({ state: { tick: Infinity, render: { openingCookLedger: rows } } },
    { events: Array.from({ length: 100 }, () => ({ event: long, detail: long })) });
  assert.equal(result.cookLedger.length, 24);
  assert.equal(result.cookLedger[0].ms, 176);
  assert.equal(result.cookLedger[0].step.length, 512);
  assert.equal(result.events.length, 12);
  assert.equal(result.state.tick, null);
  assert.ok(JSON.stringify(result).length < 50000);
});

test('array index accessors and overridden methods never execute during capture', () => {
  const fail = () => { throw Error('must not execute array behavior'); };
  const ledger = [{ step: 'safe', t: 4 }, null];
  Object.defineProperty(ledger, '1', { get: fail });
  Object.defineProperty(ledger, 'constructor', { get: fail });
  ledger.slice = fail;
  ledger.map = fail;
  const result = capture({ state: { render: { openingCookLedger: ledger } } }, { events: ledger });
  assert.equal(result.cookLedger[0].step, 'safe');
  assert.equal(result.cookLedger[1].step, null);
  assert.equal(result.events.length, 2);
});

test('observer isolates malformed diagnostic payloads from dispatch', () => {
  const bus = busFixture();
  const observer = observe({ bus });
  const broken = new Proxy({}, { getOwnPropertyDescriptor() { throw Error('bad diagnostic'); } });
  assert.doesNotThrow(() => bus.emit('game:loadingProgress', broken));
  bus.emit('game:loadingProgress', { id: 'current-stage' });
  assert.equal(observer.events.at(-1).id, 'current-stage');
  observer.dispose();
  assert.equal(bus.listeners.size, 0);
});

test('observer keeps stage/failure evidence and releases listeners idempotently', () => {
  const bus = busFixture();
  const observer = observe({ bus });
  for (let i = 0; i < 20; i++) bus.emit('game:loadingProgress', { id: 'render-pipelines', progress: i });
  bus.emit('game:startFailed', { code: 'GPU_RESIDENCY_UNAVAILABLE', stage: 'gpu-resources', error: 'superseded', secret: 'omit' });
  assert.equal(observer.events.length, 12);
  assert.equal(observer.events.at(-2).id, 'render-pipelines');
  assert.equal(observer.events.at(-1).stage, 'gpu-resources');
  assert.equal(observer.events.at(-1).secret, undefined);
  observer.dispose(); observer.dispose();
  assert.equal(bus.listeners.size, 0);
  bus.emit('game:startFailed', { error: 'after-disposal' });
  assert.equal(observer.events.at(-1).error, 'superseded');
});

test('functions execute serialized in browser-like context without module dependencies', () => {
  const bus = busFixture();
  const context = vm.createContext({ performance: { now: () => 123 }, sf: { bus, state: { mode: 'loading' } } });
  const json = vm.runInContext(`const observer = (${observe.toString()})(sf);
    sf.bus.emit('game:loadingProgress', {id:'render-pipelines'});
    const result = (${capture.toString()})(sf, observer);
    observer.dispose(); JSON.stringify(result);`, context);
  assert.equal(JSON.parse(json).events[0].id, 'render-pipelines');
  assert.equal(JSON.parse(json).capturedAtMs, 123);
  assert.equal(bus.listeners.size, 0);
});

test('both probes preserve acceptance deadlines and collect failure evidence with cleanup', () => {
  const cold = readFileSync(new URL('../scripts/check-47a-live-cold-open.mjs', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');
  assert.match(cold, /const AUTHORED_START_TIMEOUT_MS = 90000;/);
  assert.match(assets, /SF_ASSETS_LIVE_TIMEOUT_MS\) \|\| 90000/);
  for (const source of [cold, assets]) {
    assert.match(source, /captureStartupFailureDiagnostics\.toString\(\)/);
    assert.match(source, /observeStartupFailureEvents\.toString\(\)/);
    assert.match(source, /__SF_STARTUP_FAILURE_OBSERVER__\?\.dispose\(\)/);
    assert.match(source, /delete window\.__SF_STARTUP_FAILURE_OBSERVER__/);
  }
  assert.ok(assets.indexOf('const gateDiagnostics = await') < assets.indexOf('const startupReport = await'));
  assert.match(assets, /gateDiagnostics: report && report\.gateDiagnostics/);
  assert.match(cold, /throw error;/);
});
