import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('a completed compile releases its captured request state while its regrade token remains alive', () => {
  const moduleUrl = new URL('../src/render/decodeTaskBudget.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.requestAnimationFrame = fn => queueMicrotask(() => fn(performance.now()));
    const { scheduleGltfCompile } = await import(${JSON.stringify(moduleUrl)});
    const tokens = [];
    const refs = [];
    async function compileOne() {
      const token = {};
      const request = { payload: new Uint8Array(256 * 1024), value: 47 };
      tokens.push(token);
      const ref = new WeakRef(request);
      assert.equal(await scheduleGltfCompile(() => request.value, 'ambient', token), 47);
      return ref;
    }
    for (let i = 0; i < 32; i++) refs.push(await compileOne());
    await new Promise(resolve => setImmediate(resolve));
    globalThis.gc();
    const retained = refs.filter(ref => ref.deref() !== undefined).length;
    assert.equal(retained, 0, 'settled compile entries must not retain captured request state');
    assert.equal(tokens.length, 32, 'live cache tokens must remain available for later loads');
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
});
