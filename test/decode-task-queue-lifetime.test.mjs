import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Isolate browser scheduling and ask Node to fail on orphaned rejection branches.
// The owner handles its rejection; accounting must not create a second one.
function runQueueCase(body) {
  const moduleUrl = new URL('../src/render/decodeTaskBudget.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.requestAnimationFrame = (fn) => queueMicrotask(() => fn(performance.now()));
    const { scheduleGltfCompile, scheduleGltfParse } = await import(${JSON.stringify(moduleUrl)});
    ${body}
    await new Promise((resolve) => setTimeout(resolve, 0));
  `], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
}

test('rejected asynchronous compile reaches its owner without orphaning accounting or later work', () => {
  runQueueCase(`
    const failure = new Error('compile cancelled');
    const failed = scheduleGltfCompile(() => Promise.reject(failure));
    const next = scheduleGltfCompile(() => 'next compile');
    await assert.rejects(failed, (error) => error === failure);
    assert.equal(await next, 'next compile');
  `);
});

test('a throwing parse lifetime predicate rejects that task and lets the queue drain', () => {
  runQueueCase(`
    const failure = new Error('owner detached');
    let parsed = false;
    const failed = scheduleGltfParse(() => { parsed = true; }, {}, () => { throw failure; });
    const next = scheduleGltfParse(() => 'next parse');
    await assert.rejects(failed, (error) => error === failure);
    assert.equal(await next, 'next parse');
    assert.equal(parsed, false);
  `);
});

test('departed parse owners skip construction and preserve following live work', () => {
  runQueueCase(`
    let parsed = false;
    const departed = scheduleGltfParse(() => { parsed = true; }, {}, () => false);
    const next = scheduleGltfParse(() => 'live parse');
    assert.equal(await departed, null);
    assert.equal(await next, 'live parse');
    assert.equal(parsed, false);
  `);
});
