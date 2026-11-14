import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('a retried package can promote its own queued parse after a previous visible generation', () => {
  const assetLoaderUrl = new URL('../src/render/assetLoader.js', import.meta.url).href;
  const decodeBudgetUrl = new URL('../src/render/decodeTaskBudget.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { fileURLToPath, pathToFileURL } from 'node:url';
    import { sep } from 'node:path';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    const nativeTimeout = globalThis.setTimeout;
    const frames = [];
    globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    globalThis.setTimeout = (callback, ms, ...args) => ms === 48
      ? { fixtureFrameFallback: true }
      : nativeTimeout(callback, ms, ...args);
    globalThis.scheduler = { postTask: (callback) => Promise.resolve().then(callback) };
    const root = pathToFileURL(process.cwd() + sep);
    globalThis.fetch = async (url) => {
      const resolved = new URL(url, root);
      const bytes = readFileSync(fileURLToPath(resolved));
      return { ok: true, status: 200, url: resolved.href,
        json: async () => JSON.parse(bytes.toString('utf8')),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const events = [];
    GLTFLoader.prototype.parseAsync = async () => {
      events.push('asset');
      throw new Error('fixture decode failure forces a fresh package generation');
    };
    const { loadAuthoredPart, disposeAuthoredAssetRuntime } = await import(${JSON.stringify(assetLoaderUrl)});
    const { scheduleGltfParse, withVisibleDecodeClass } = await import(${JSON.stringify(decodeBudgetUrl)});
    const renderer = { extensions: { has: () => false } };
    const url = 'assets/ships/release/parts/places/place_47a_rescue_capsule.glb';
    const load = (options = {}) => loadAuthoredPart(url, { renderer, slot: 'place', optional: true, ...options });
    const tick = () => new Promise((resolve) => nativeTimeout(resolve, 0));
    async function waitFor(predicate, label) {
      for (let count = 0; count < 500; count++) { if (predicate()) return; await tick(); }
      throw new Error('timed out waiting for ' + label);
    }
    async function drainUntil(promise) {
      let done = false;
      promise.then(() => { done = true; }, () => { done = true; });
      for (let count = 0; count < 500 && !done; count++) {
        const frame = frames.shift();
        if (frame) frame(performance.now());
        await tick();
      }
      assert.equal(done, true, 'queued package work must settle');
      return promise;
    }
    try {
      const creator = load({ admissionVisible: true });
      await waitFor(() => frames.length > 0, 'first package parse');
      const firstPeer = withVisibleDecodeClass(() => scheduleGltfParse(() => events.push('peer'), {}));
      const deadlineJoin = load({ admissionDeadline: true });
      const visibleJoin = load({ admissionVisible: true });
      await tick();
      await drainUntil(Promise.all([creator, deadlineJoin, visibleJoin, firstPeer]));
      assert.deepEqual(events.splice(0), ['asset', 'peer'], 'deadline join keeps the visible creator ahead');
      await tick();
      assert.equal(frames.length, 0, 'the first generation left no pending parse drain');

      const retry = load();
      await waitFor(() => frames.length > 0, 'retry package parse');
      const retryPeer = withVisibleDecodeClass(() => scheduleGltfParse(() => events.push('peer'), {}));
      const retryJoin = load({ admissionVisible: true });
      await tick();
      await drainUntil(Promise.all([retry, retryJoin, retryPeer]));
      assert.deepEqual(events, ['asset', 'peer'], 'a visible join promotes the fresh ambient retry');
    } finally { await disposeAuthoredAssetRuntime(renderer); }
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
});
