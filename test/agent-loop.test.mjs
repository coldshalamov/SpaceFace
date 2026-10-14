// Fast, dependency-free regressions. Browser doubles prove lifecycle/reporting, NOT visual quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { parseOptions, planForFiles, failureKey, insideRoot, aggregateRows } from '../scripts/lib/agentLoopPlan.mjs';
import { summarizeTrace, compareHandling, handlingHtml } from '../scripts/lib/labTraceReport.mjs';
import { parseBenchArgs, runUiBenchBatch } from '../scripts/lib/uiBenchBatch.mjs';

function temp(t) { const dir = mkdtempSync(join(tmpdir(), 'sf-loop-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
const sample = (tick, x = tick, vx = 1, rot = 0) => ({ tick, playerX: x, playerZ: 0, playerVelX: vx, playerVelZ: 0, playerRot: rot });
const traced = trace => ({ trace, scenarioId: 'test', seed: 47, scenarioDigest: 'scenario', inputDigest: 'input', evidenceClass: 'focused-fixture' });

for (const args of [['--bad'], ['--runs'], ['--runs', '--trace'], ['--trace=true'], ['--runs=1', '--runs=2']]) {
  test(`reject malformed options ${args.join(' ')}`, () => assert.throws(() => parseOptions(args, { runs: 'value', trace: 'boolean' })));
}
test('options support equals, whitespace, positional and declared repeatable arguments', () => {
  const p = parseOptions(['--runs=3', 'flight', '--shot', 'pause', '--shot=settings'], { runs: 'value', shot: 'list' });
  assert.equal(p.options.runs, '3'); assert.deepEqual(p.options.shot, ['pause', 'settings']); assert.deepEqual(p.positional, ['flight']);
});
test('planner names unmapped paths instead of claiming coverage', () => {
  const p = planForFiles(['src/data/novel.js', 'styles/pause.css']);
  assert.deepEqual(p.unmapped, ['src/data/novel.js']); assert.equal(p.gameBoots, 0); assert.equal(p.nonPromoting, true);
  assert.match(p.unresolved.join(' '), /not silently covered/);
});
test('empty/doc plans never request a game boot', () => {
  assert.equal(planForFiles([]).advice.length, 0);
  assert.deepEqual(planForFiles(['docs/A.md']).advice.map(a => a.command), ['git diff --check']);
});
test('runtime and asset changes retain a public-route obligation', () => {
  for (const path of ['src/runtime/createAuthoritativeRuntime.js', 'assets/ships/render.glb', 'electron/main.cjs']) {
    assert.match(planForFiles([path]).unresolved.join(' '), /public-route/);
  }
});
test('file boundary rejects traversal and symlink escape', t => {
  const root = temp(t), external = temp(t); writeFileSync(join(external, 'x'), 'x');
  assert.throws(() => insideRoot(root, join(external, 'x')));
  try { symlinkSync(join(external, 'x'), join(root, 'escape')); } catch (e) { if (e.code === 'EPERM') return; throw e; }
  assert.throws(() => insideRoot(root, 'escape'));
});
test('failure key tracks bytes, missing files, invocation and environment', t => {
  const root = temp(t); writeFileSync(join(root, 'x'), 'abc');
  const k = () => failureKey(root, ['x'], { command: 'sim' });
  const before = k(); writeFileSync(join(root, 'x'), 'def'); assert.notEqual(k(), before);
  assert.notEqual(k(), failureKey(root, ['x'], { command: 'ui' }));
  assert.notEqual(k(), failureKey(root, ['x'], { command: 'sim' }, { browser: 'changed' }));
  rmSync(join(root, 'x')); assert.doesNotThrow(k); assert.notEqual(k(), before);
});
test('partial/empty batches and internal arms cannot pass', () => {
  const ok = { ok: true, exitClass: 0, nonPromoting: false };
  assert.equal(aggregateRows([ok], 2).ok, false); assert.equal(aggregateRows([], 0).ok, false);
  assert.equal(aggregateRows([{ ...ok, nonPromoting: true }], 1).ok, false);
  assert.equal(aggregateRows([ok, ok], 2).status, 'focused-checks-passed');
  assert.equal(aggregateRows([ok, ok], 2).nonPromoting, true);
});
test('diagnostic capture cannot hide a failed oracle', () => {
  const row = { diagnostic: true, captureOk: true, exitClass: 4 };
  assert.equal(aggregateRows([row], 1).status, 'diagnostic-complete');
  assert.notEqual(aggregateRows([{ ...row, exitClass: 1 }], 1).status, 'diagnostic-complete');
  assert.notEqual(aggregateRows([{ ...row, captureOk: false }], 1).status, 'diagnostic-complete');
});
test('trace summary uses tick deltas, not wall time or sample indices', () => {
  const r = summarizeTrace(traced([sample(0, 0, 0), sample(2, 1, 2), sample(4, 4, 4)]), { dt: .5 });
  assert.equal(r.available, true); assert.equal(r.metrics.observedSeconds, 2);
  assert.equal(r.metrics.sampledPathLength, 4); assert.equal(r.metrics.peakVectorAcceleration, 2);
  assert.equal(r.metrics.maxSampleGapTicks, 2); assert.match(r.warnings.join(' '), /decimated/);
});
test('wrapped yaw does not invent a full turn at the branch cut', () => {
  const r = summarizeTrace(traced([sample(0, 0, 1, Math.PI - .1), sample(1, 1, 1, -Math.PI + .1)]), { dt: 1 });
  assert.ok(Math.abs(r.metrics.peakAbsoluteYawRate - .2) < 1e-12);
});
for (const invalid of [[], [sample(1), sample(0)], [sample(0), sample(0)], [sample(-1)], [{ ...sample(0), playerX: null }], [{ ...sample(0), playerVelZ: NaN }]]) {
  test(`missing/nonfinite/unordered observations are not zero-valued success ${JSON.stringify(invalid)}`, () => {
    assert.equal(summarizeTrace(traced(invalid)).available, false);
  });
}
test('one sample measures no derivative or elapsed interval', () => {
  const r = summarizeTrace(traced([sample(0)])); assert.equal(r.metrics.observedSeconds, 0);
  assert.equal(r.metrics.peakVectorAcceleration, null); assert.equal(r.metrics.peakAbsoluteYawRate, null);
});
test('large traces do not overflow the JS argument stack', () => {
  const r = summarizeTrace(traced(Array.from({ length: 150000 }, (_, i) => sample(i))));
  assert.equal(r.metrics.sampleCount, 150000); assert.equal(r.metrics.peakSpeed, 1);
});
test('handling comparison refuses different or unknown scenario/input identity', () => {
  const a = summarizeTrace(traced([sample(0), sample(1)]));
  assert.equal(compareHandling(a, a).comparable, true);
  assert.equal(compareHandling(a, { ...a, inputDigest: 'different' }).comparable, false);
  assert.equal(compareHandling(a, { ...a, scenarioDigest: null }).comparable, false);
  assert.equal(compareHandling(a, { ...a, dt: 1 }).comparable, false);
});
test('static HTML escapes hostile labels and embeds no external runtime', () => {
  const r = summarizeTrace({ ...traced([sample(0), sample(1)]), scenarioId: '<script>alert(1)</script>' });
  const html = handlingHtml(r, [sample(0), sample(1)], [{ tick: 0, key: '<img onerror=alert(1)>' }]);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('src=')); assert.match(html, /Recorded XZ trajectory/);
});
test('viewport parser preserves phone/default/single and adds a deduplicated matrix', () => {
  assert.deepEqual(parseBenchArgs(['--phone']).viewport, { width: 390, height: 844 });
  const a = parseBenchArgs(['--shot=pause', '--shot=settings', '--viewports=960x540,1920x1080,960x540']);
  assert.equal(a.viewports.length, 2); assert.deepEqual(a.shots, ['pause', 'settings']);
  assert.throws(() => parseBenchArgs(['--viewport=0x600']));
  assert.throws(() => parseBenchArgs(['--viewport=960x540', '--viewports=1920x1080']));
  assert.throws(() => parseBenchArgs(['--timeout-ms=Infinity']));
});

function rig(t, { launchError = false, closeError = false, cancelOnClose = false } = {}) {
  const root = temp(t), events = [], pages = [];
  const browser = {
    async newContext() {
      const page = new EventEmitter(); page.setDefaultTimeout = () => {}; pages.push(page);
      events.push('context');
      return { async newPage() { return page; }, async close() {
        events.push('context-close');
        if (cancelOnClose) page.emit('requestfailed', { url: () => '/pending.glb', failure: () => ({ errorText: 'cancelled' }) });
      } };
    },
    async close() { events.push('browser-close'); if (closeError) throw new Error('close failure'); },
  };
  const options = { root, args: parseBenchArgs(['--shot=pause,settings', '--viewports=960x540,1920x1080', '--timeout-ms=1000']),
    startServer: async () => { events.push('server'); return { baseUrl: 'http://127.0.0.1:9000/', close: async () => events.push('server-close') }; },
    loadPlaywright: async () => ({ chromium: { launch: async () => { events.push('browser'); if (launchError) throw new Error('launch failure'); return browser; } } }),
    shoot: async () => ({ ok: true }) };
  return { root, events, pages, options };
}
test('UI matrix launches one browser, isolates all cells, and closes owned resources', async t => {
  const r = rig(t), result = await runUiBenchBatch(r.options);
  assert.equal(result.ok, true); assert.equal(result.browserLaunches, 1); assert.equal(result.gameBoots, 0);
  assert.equal(new Set(r.pages).size, 4); assert.equal(r.events.filter(e => e === 'context-close').length, 4);
  assert.equal(r.events.filter(e => e === 'browser').length, 1); assert.deepEqual(r.events.slice(-2), ['browser-close', 'server-close']);
  assert.equal(JSON.parse(readFileSync(join(r.root, '.devshots/ui-bench/report.json'))).cells.length, 4);
});
test('browser launch failure closes server and produces a red report', async t => {
  const r = rig(t, { launchError: true }), result = await runUiBenchBatch(r.options);
  assert.equal(result.ok, false); assert.equal(result.browserLaunches, 0); assert.equal(r.events.at(-1), 'server-close');
});
test('one broken UI cell does not hide independent remaining cells', async t => {
  const r = rig(t); let n = 0;
  r.options.shoot = async () => { if (++n === 1) throw new Error('broken screen'); return { ok: true }; };
  const result = await runUiBenchBatch(r.options);
  assert.equal(result.ok, false); assert.equal(result.cells.length, 4); assert.equal(result.cells[1].ok, true);
});
test('page/HTTP errors cannot be reported as successful capture', async t => {
  const r = rig(t);
  r.options.shoot = async page => { page.emit('pageerror', new Error('render failed')); page.emit('response', { url: () => '/screen.js', status: () => 404 }); return { ok: true }; };
  const result = await runUiBenchBatch(r.options);
  assert.equal(result.ok, false); assert.equal(result.cells[0].errors.length, 2);
});
test('expected cancellation during context teardown is not a product failure', async t => {
  const r = rig(t, { cancelOnClose: true }); assert.equal((await runUiBenchBatch(r.options)).ok, true);
});
test('incomplete walks and failed cleanup are not green', async t => {
  const r = rig(t, { closeError: true }); r.options.shoot = async () => ({ ok: false, walk: { complete: false, untried: 10 } });
  const result = await runUiBenchBatch(r.options);
  assert.equal(result.ok, false); assert.match(result.errors.join(' '), /close failure/);
});
test('cell deadline closes context and keeps completed/remaining evidence', async t => {
  const r = rig(t); r.options.args.timeoutMs = 10; let n = 0;
  r.options.shoot = () => ++n === 1 ? new Promise(() => {}) : Promise.resolve({ ok: true });
  const result = await runUiBenchBatch(r.options);
  assert.equal(result.cells.length, 4); assert.equal(result.cells[0].ok, false); assert.equal(result.cells[1].ok, true);
  assert.match(result.cells[0].errors[0].message, /exceeded/);
});
test('only exact optional metadata/favicon requests are exempt from HTTP and console failures', async t => {
  const r = rig(t);
  r.options.shoot = async page => {
    page.emit('response', { url: () => 'http://bench/spaceface-release-build.json', status: () => 404 });
    page.emit('console', { type: () => 'error', text: () => '404', location: () => ({ url: 'http://bench/spaceface-release-build.json' }) });
    return { ok: true };
  };
  assert.equal((await runUiBenchBatch(r.options)).ok, true);
  r.options.shoot = async page => {
    page.emit('response', { url: () => 'http://bench/broken-spaceface-release-build.json', status: () => 404 });
    return { ok: true };
  };
  assert.equal((await runUiBenchBatch(r.options)).ok, false);
});
