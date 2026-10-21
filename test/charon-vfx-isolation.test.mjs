import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { captureCharonVfxIsolation, charonVfxIsolationPageOperation } from '../scripts/lib/charonVfxIsolation.mjs';

function fixture({ missing = false, active = false, hideThrows = false, restoreThrows = false,
  screenshotThrows = false, exhaustOnScreenshot = false, restoreTimeout = false, restoredCaptureThrows = false, advanceFrames = true } = {}) {
  let clock = 10000, count = 10, hides = 0, restores = 0;
  const files = [], actions = [];
  const api = { inspect: () => ({ active }), hideAll() { hides++; active = true;
    if (hideThrows) throw new Error('partial hide failure'); },
    restore() { restores++; if (restoreThrows) throw new Error('restore failure'); active = false; } };
  const render = { get presentCount() { return count; }, perfVfxIsolation: missing ? undefined : api };
  const context = vm.createContext({ window: { SF: { state: { render } } }, Date: { now: () => clock } });
  const page = {
    async evaluate(fn, arg) {
      actions.push(arg.action);
      if (restoreTimeout && arg.action === 'restore') return new Promise(() => {});
      if (arg.action === 'sample' && advanceFrames) count++;
      context.arg = arg;
      return vm.runInContext(`(${fn.toString()})(arg)`, context);
    },
    async screenshot(options) {
      if (restoreTimeout) clock = 19999;
      if (restoredCaptureThrows && files.length) throw new Error('restored capture failure');
      if (exhaustOnScreenshot) { clock = 30000; throw new Error('capture exceeded deadline'); }
      if (screenshotThrows) throw new Error('capture failure');
      files.push(options.path);
    },
  };
  const options = { deadline: 20000, now: () => clock, sleep: async ms => { clock += ms; }, mkdirFn: async () => {} };
  return { page, options, context, files, actions, api, state: () => ({ active, hides, restores }) };
}

test('captures isolated and restored diagnostic views after real count advancement, never acceptance', async () => {
  const f = fixture(); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'diagnostic-pair-captured');
  assert.equal(r.visualAcceptance, false); assert.equal(r.readinessEvidence, false);
  assert.match(r.label, /never visual readiness or acceptance/);
  assert.equal(r.screenshots.length, 2);
  assert.match(r.screenshots[0].path, /vfx-isolated-diagnostic\.png$/);
  assert.match(r.screenshots[1].path, /vfx-restored-diagnostic\.png$/);
  assert.ok(r.restoredPresentCount > r.isolatedPresentCount);
  assert.ok(r.screenshots.every(s => s.diagnosticOnly && s.visualAcceptance === false));
  assert.deepEqual(f.state(), { active: false, hides: 1, restores: 1 });
});

test('no work when deadline is absent, exhausted, or too short', async () => {
  for (const deadline of [undefined, 9000, 10500]) {
    const f = fixture(); const r = await captureCharonVfxIsolation(f.page, { ...f.options, deadline });
    assert.equal(r.status, 'skipped'); assert.equal(f.actions.length, 0);
    assert.equal(f.state().hides, 0);
  }
});

test('missing API and preexisting active isolation are untouched', async () => {
  for (const options of [{ missing: true }, { active: true }]) {
    const f = fixture(options); const r = await captureCharonVfxIsolation(f.page, f.options);
    assert.equal(r.status, 'skipped'); assert.equal(f.files.length, 0);
    assert.equal(f.state().hides, 0); assert.equal(f.state().restores, 0);
    assert.equal(f.state().active, options.active === true);
  }
});

test('partially failed hide still restores the exact owner port', async () => {
  const f = fixture({ hideThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(r.restoration.verified, true);
  assert.equal(f.state().restores, 1); assert.equal(f.state().active, false);
  assert.equal(f.files.length, 0);
});

test('screenshot failure restores in finally and reports incomplete, not acceptance', async () => {
  const f = fixture({ screenshotThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(r.restoration.verified, true);
  assert.equal(f.state().restores, 1); assert.equal(r.visualAcceptance, false);
});

test('restoration failure is explicit and never marked verified', async () => {
  const f = fixture({ restoreThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'restoration-unverified'); assert.equal(r.restoration.attempted, true);
  assert.equal(r.restoration.verified, false); assert.equal(f.state().restores, 1);
  assert.equal(f.files.length, 1);
});

test('deadline exhaustion still dispatches restoration but does not assert its outcome', async () => {
  const f = fixture({ exhaustOnScreenshot: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'restoration-unverified'); assert.equal(r.restoration.attempted, true);
  assert.equal(r.restoration.verified, false); assert.equal(f.state().restores, 1);
  assert.match(r.errors.join(' '), /outcome unverified/);
});

test('no fabricated frame: a stalled presentation skips image and restores', async () => {
  const f = fixture({ advanceFrames: false }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(f.files.length, 0);
  assert.equal(f.state().restores, 1); assert.equal(r.restoration.verified, true);
});

test('cleanup fences a delayed begin and never restores somebody else’s active isolation', async () => {
  const f = fixture();
  const args = { token: 'late-operation', deadline: 20000 };
  await f.page.evaluate(charonVfxIsolationPageOperation, { ...args, action: 'restore' });
  const result = await f.page.evaluate(charonVfxIsolationPageOperation, { ...args, action: 'begin' });
  assert.equal(result.skipped, 'begin-cancelled'); assert.equal(f.state().hides, 0);
  await f.page.evaluate(charonVfxIsolationPageOperation, { token: 'other', deadline: 20000, action: 'begin' });
  await f.page.evaluate(charonVfxIsolationPageOperation, { ...args, action: 'restore' });
  assert.equal(f.state().active, true); assert.equal(f.state().restores, 0);
});


test('restore transport timeout is reported as unverified rather than success', async () => {
  const f = fixture({ restoreTimeout: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'restoration-unverified'); assert.equal(r.restoration.attempted, true);
  assert.equal(r.restoration.verified, false); assert.ok(f.actions.includes('restore'));
  assert.match(r.errors.join(' '), /timed out/);
});

test('restored screenshot failure does not erase verified restoration', async () => {
  const f = fixture({ restoredCaptureThrows: true }); const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'incomplete'); assert.equal(r.restoration.verified, true);
  assert.equal(f.state().active, false); assert.equal(r.screenshots.length, 1);
});

function addPropulsion(f) {
  vm.runInContext(`
    const geometry = { drawRange: { start: 0, count: 18 }, attributes: {
      position: { count: 4000, array: new Float32Array(12000).fill(7) } } };
    const mesh = { visible: true, geometry };
    const makeTrail = () => ({ samples: 384, _live: 384, _head: 0,
      _path: Float32Array.from({ length: 1536 }, (_, i) => i % 4 === 0 ? i / 4 : 0),
      _state: Float32Array.from({ length: 1536 }, (_, i) => i % 4 === 3 && i > 767 ? 1 : 0),
      _pathTex: { version: 4 }, _dirty: true, mesh });
    const stream = { _prevNx: 1, _prevNz: 2, _hasNozzle: true, group: { visible: true },
      _ribbons: { mesh }, _centerCount: 5000, _centerData: new Float32Array(20000).fill(2),
      _trails: Array.from({ length: 20 }, makeTrail) };
    const owner = { _energy: { plasmaStream: stream }, _ribbonTrails: new Map(
      Array.from({ length: 30 }, (_, i) => ['npc-' + i, { getMesh: () => mesh }])) };
    window.propulsionOwner = owner;
    window.SF.registry = { get: name => name === 'vfx' ? owner : null };
    window.SF.state.playerId = 1;
    window.SF.state.render.cameraCtrl = { obj: { position: { x: 4, y: 5, z: 6 } } };
    window.beforePropulsion = JSON.stringify({ stream, mesh });
  `, f.context);
}

test('propulsion observations are bounded ASCII summaries and leave owners untouched', async () => {
  const f = fixture(); addPropulsion(f);
  const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.status, 'diagnostic-pair-captured');
  for (const p of [r.propulsionBefore, r.propulsionRestored]) {
    assert.equal(p.status, 'observed'); assert.equal(p.player.trails.length, 4);
    assert.equal(p.npc.length, 8); assert.equal(p.npcOwnerCount, 30);
    assert.equal(p.player.lag.read, 128);
    assert.ok(p.player.trails.every(t => t.read === 384 && t.segmentBreaks === 1 && t.maxSameSegmentWU === 1));
    assert.ok(p.npc.every(n => n.descriptorBounds.read === 256));
    assert.match(p.coordinateSpace, /frame-local/); assert.match(p.evidence, /not GPU pixels/);
    assert.ok(Buffer.byteLength(JSON.stringify(p), 'utf8') <= p.limits.snapshotAsciiBytes);
    assert.ok(!JSON.stringify(p).includes('"_path"'));
  }
  assert.equal(vm.runInContext('JSON.stringify({ stream, mesh }) === window.beforePropulsion', f.context), true);
  assert.equal(f.actions.filter(a => a === 'sample').length, 2);
  assert.deepEqual(f.state(), { active: false, hides: 1, restores: 1 });
});

test('propulsion getter failure is contained and never suppresses exact restoration', async () => {
  const f = fixture(); addPropulsion(f);
  vm.runInContext(`Object.defineProperty(window.propulsionOwner, '_energy', {
    get() { throw new Error('private internal text must not escape'); } });`, f.context);
  const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.propulsionBefore.status, 'inspection-failed');
  assert.equal(r.propulsionRestored.status, 'inspection-failed');
  assert.equal(r.status, 'diagnostic-pair-captured'); assert.equal(r.restoration.verified, true);
  assert.ok(!JSON.stringify(r).includes('private internal text'));
  assert.deepEqual(f.state(), { active: false, hides: 1, restores: 1 });
});

test('propulsion metadata is not accumulated by stalled-frame polling', async () => {
  const f = fixture({ advanceFrames: false }); addPropulsion(f);
  const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.ok(f.actions.filter(a => a === 'sample').length > 2);
  assert.equal(Object.keys(r).filter(k => k.startsWith('propulsion')).length, 2);
  assert.equal(r.restoration.verified, true);
});

test('observation cannot dispatch a hide after its original deadline', async () => {
  const f = fixture(); addPropulsion(f);
  vm.runInContext(`const getOwner = window.SF.registry.get;
    window.SF.registry.get = name => { Date.now = () => 30000; return getOwner(name); };`, f.context);
  const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.reason, 'deadline-exhausted'); assert.equal(r.status, 'skipped');
  assert.deepEqual(f.state(), { active: false, hides: 0, restores: 0 });
});

test('identifiers are bounded sanitized ASCII and no owner callbacks serialize', async () => {
  const f = fixture(); addPropulsion(f);
  vm.runInContext(`window.SF.state.playerId = '☃'.repeat(50000);
    window.propulsionOwner._ribbonTrails = new Map([['☃'.repeat(50000), { getMesh: () => mesh }]]);`, f.context);
  const r = await captureCharonVfxIsolation(f.page, f.options);
  assert.equal(r.propulsionBefore.playerId, '?'.repeat(64));
  assert.equal(r.propulsionBefore.npc[0].entityId, '?'.repeat(64));
  assert.ok(Buffer.byteLength(JSON.stringify(r.propulsionBefore)) <= 12000);
});

test('sample cap never replaces physical ring capacity', async () => {
  const f = fixture(); addPropulsion(f);
  vm.runInContext(`const trail = stream._trails[0];
    trail.samples = 512; trail._live = 512; trail._head = 500;
    trail._path = new Float32Array(512 * 4); trail._state = new Float32Array(512 * 4);
    for (let i = 0; i < 512; i++) trail._path[((500 + i) % 512) * 4] = i;
  `, f.context);
  const r = await captureCharonVfxIsolation(f.page, f.options);
  const t = r.propulsionBefore.player.trails[0];
  assert.equal(t.physicalCapacity, 512); assert.equal(t.live, 512); assert.equal(t.read, 384);
  assert.equal(t.maxSameSegmentWU, 1); assert.equal(t.segmentBreaks, 0);
  assert.match(t.coverage, /not full trail coverage/);
});
