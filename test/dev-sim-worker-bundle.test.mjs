import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import esbuild from 'esbuild';
import { createDevSimWorkerBundleProvider } from '../scripts/lib/devSimWorkerBundle.mjs';
import { rewriteSourceModuleUrls } from '../scripts/lib/sourceModuleUrlRewrite.mjs';

async function writeFixture(root, audioSource = `export function workletUrl() {
  return new URL('./replayAudioWorklet.js', import.meta.url).href;
}
`) {
  await mkdir(join(root, 'src', 'core'), { recursive: true });
  await mkdir(join(root, 'src', 'audio'), { recursive: true });
  await mkdir(join(root, 'src', 'shared'), { recursive: true });
  await mkdir(join(root, 'src', 'prefix'), { recursive: true });
  await mkdir(join(root, 'vendor', 'rapier3d-compat'), { recursive: true });
  await writeFile(join(root, 'index.html'), `<script type="importmap">\n{
    "imports": {
      "fixture-alias": "./src/shared/alias.js",
      "fixture-prefix/": "./src/prefix/"
    }
  }\n</script>`);
  await writeFile(join(root, 'src', 'core', 'wholeSimBrowserWorker.js'), `
    import { rapierUrl, moduleUrl } from './rapierCompatRuntime.js';
    import { workletUrl } from '../audio/replayAudioTape.js';
    import { aliasValue } from 'fixture-alias';
    import { prefixValue } from 'fixture-prefix/value.js';
    SF_DEBUG_ONLY: { self.debugLabel = 'source-debug-kept'; }
    if (typeof __SPACEFACE_PRODUCTION__ === 'undefined') self.productionBranch = 'undefined';
    else self.productionBranch = __SPACEFACE_PRODUCTION__;
    self.guardedNodeImport = () => import('node:fs/promises');
    self.observed = {
      rapier: rapierUrl(),
      rapierSource: moduleUrl({ location: { href: 'https://wrong.test/' } }, () => {}),
      worklet: workletUrl(), aliasValue, prefixValue
    };
    export const ready = true;
  `);
  await writeFile(join(root, 'src', 'core', 'rapierCompatRuntime.js'), `
    export function rapierUrl() {
      return new URL('../../vendor/rapier3d-compat/rapier.mjs', import.meta.url).href;
    }
    export function moduleUrl(self, URL) { return import.meta.url; }
  `);
  await writeFile(join(root, 'src', 'audio', 'replayAudioTape.js'), audioSource);
  await writeFile(join(root, 'src', 'shared', 'alias.js'), `import data from './data.json';\nexport const aliasValue = data.value;\n`);
  await writeFile(join(root, 'src', 'shared', 'data.json'), `{"value":"importmap-resolved"}\n`);
  await writeFile(join(root, 'src', 'prefix', 'value.js'), `export const prefixValue = 'prefix-importmap-resolved';\n`);
  await writeFile(join(root, 'src', 'audio', 'replayAudioWorklet.js'), `/* fixture asset */\n`);
  await writeFile(join(root, 'src', 'audio', 'alternateWorklet.js'), `/* fixture asset */\n`);
  await writeFile(join(root, 'vendor', 'rapier3d-compat', 'rapier.mjs'), `/* fixture asset */\n`);
}

test('dev worker bundle preserves source URLs, debug defaults, import-map resolution, and freshness', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-dev-worker-'));
  const previousSelf = globalThis.self;
  try {
    await writeFixture(root);
    const provider = createDevSimWorkerBundleProvider({ root });
    const warmed = await provider.prewarm();
    const first = await provider.getBundle();
    assert.equal(warmed.digest, first.digest);
    assert.match(first.code, /SF_DEBUG_ONLY/);
    assert.match(first.code, /node:fs\/promises/, 'guarded dynamic Node builtins remain external');

    globalThis.self = { location: { href: 'https://game.test/workers/wholeSimBrowserWorker.js' } };
    await import(`data:text/javascript;base64,${first.bytes.toString('base64')}#first`);
    assert.equal(globalThis.self.debugLabel, 'source-debug-kept');
    assert.equal(globalThis.self.productionBranch, 'undefined', 'source default keeps undefined production-flag semantics');
    assert.deepEqual(globalThis.self.observed, {
      rapier: 'https://game.test/vendor/rapier3d-compat/rapier.mjs',
      rapierSource: 'https://game.test/src/core/rapierCompatRuntime.js',
      worklet: 'https://game.test/src/audio/replayAudioWorklet.js',
      aliasValue: 'importmap-resolved',
      prefixValue: 'prefix-importmap-resolved',
    });

    const changedAudio = `export function workletUrl() {
      return new URL('./alternateWorklet.js', import.meta.url).href;
    }\n`;
    await writeFile(join(root, 'src', 'audio', 'replayAudioTape.js'), changedAudio);
    const second = await provider.getBundle();
    assert.notEqual(second.digest, first.digest, 'changed imported source must invalidate the in-memory artifact');
    await writeFile(join(root, 'src', 'shared', 'data.json'), `{"value":"changed-json-input"}\n`);
    const third = await provider.getBundle();
    assert.notEqual(third.digest, second.digest, 'changed bundled JSON input must invalidate the artifact');

    await writeFile(join(root, 'src', 'audio', 'replayAudioTape.js'), 'export function {\n');
    await assert.rejects(provider.getBundle(), /Build failed|Unexpected token|Expected/);
    await writeFile(join(root, 'src', 'audio', 'replayAudioTape.js'), changedAudio);
    const repaired = await provider.getBundle();
    assert.equal(repaired.digest, third.digest, 'repaired current inputs may reuse the matching rebuilt artifact');
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
    await rm(root, { recursive: true, force: true });
  }
});

test('dev worker bundle rejects an import map changed while its old resolution is building', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-dev-worker-map-race-'));
  let changed = false;
  try {
    await writeFixture(root);
    const importMapFile = join(root, 'index.html');
    const buildApi = {
      async build(options) {
        const result = await esbuild.build(options);
        if (!changed) {
          changed = true;
          const { readFile } = await import('node:fs/promises');
          const html = await readFile(importMapFile, 'utf8');
          await writeFile(importMapFile, html.replace('"imports": {', '"imports":  {'));
        }
        return result;
      },
    };
    const provider = createDevSimWorkerBundleProvider({ root, buildApi });
    await assert.rejects(provider.getBundle(), /import map changed during build/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dev worker bundle rejects a JSON input changed after esbuild consumed it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-dev-worker-input-race-'));
  let changed = false;
  try {
    await writeFixture(root);
    const jsonFile = join(root, 'src', 'shared', 'data.json');
    const buildApi = {
      async build(options) {
        const result = await esbuild.build(options);
        if (!changed) {
          changed = true;
          await writeFile(jsonFile, `{"value":"changed-during-build"}\n`);
        }
        return result;
      },
    };
    const provider = createDevSimWorkerBundleProvider({ root, buildApi });
    await assert.rejects(provider.getBundle(), /input changed during build/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source URL AST rewrite keeps a native import.meta.url branch for non-worker execution', async () => {
  const root = 'C:/fixture';
  const file = 'C:/fixture/src/example.js';
  assert.throws(() => rewriteSourceModuleUrls('export const url = import.meta.url;', 'D:/outside/example.js', root), /outside the served project root/);
  const rewritten = rewriteSourceModuleUrls('export const url = import.meta.url;', file, root);
  assert.equal(rewritten.changed, true);
  assert.match(rewritten.contents, /globalThis/);
  assert.match(rewritten.contents, /import\.meta\.url/);
  assert.match(rewritten.contents, /\/src\/example\.js/);
  const previousSelf = globalThis.self;
  try {
    delete globalThis.self;
    const loaded = await import(`data:text/javascript;base64,${Buffer.from(rewritten.contents).toString('base64')}#node-fallback`);
    assert.match(loaded.url, /^data:text\/javascript;base64,/);
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});
