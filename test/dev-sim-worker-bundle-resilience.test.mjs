import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import esbuild from 'esbuild';
import { createDevSimWorkerBundleProvider } from '../scripts/lib/devSimWorkerBundle.mjs';

async function writeFixture(root) {
  await mkdir(join(root, 'src', 'core'), { recursive: true });
  await mkdir(join(root, 'src', 'shared'), { recursive: true });
  await writeFile(join(root, 'index.html'), `<script type="importmap">\n{
    "imports": {
      "fixture-alias": "./src/shared/alias.js"
    }
  }\n</script>`);
  await writeFile(join(root, 'src', 'core', 'wholeSimBrowserWorker.js'), `
    import { dep } from './dep.js';
    import { aliasValue } from 'fixture-alias';
    self.observed = { dep, aliasValue };
    export const ready = true;
  `);
  await writeFile(join(root, 'src', 'core', 'dep.js'), `export const dep = 'dep-v1';\n`);
  await writeFile(join(root, 'src', 'shared', 'alias.js'), `import data from './data.json';\nexport const aliasValue = data.value;\n`);
  await writeFile(join(root, 'src', 'shared', 'data.json'), `{"value":"v1"}\n`);
}

function collectWarnings(t) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  t.after(() => { console.warn = originalWarn; });
  return warnings;
}

test('a file rewritten during the first build retries and the second attempt succeeds', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-worker-bundle-retry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFixture(root);
  const dataFile = join(root, 'src', 'shared', 'data.json');
  let builds = 0;
  let mutated = false;
  const buildApi = {
    async build(options) {
      const result = await esbuild.build(options);
      builds += 1;
      if (!mutated) {
        mutated = true;
        await writeFile(dataFile, `{"value":"mid-build-write"}\n`);
      }
      return result;
    },
  };
  const provider = createDevSimWorkerBundleProvider({ root, buildApi, retryDelayMs: 1 });
  const bundle = await provider.getBundle();
  assert.equal(builds, 2, 'one mid-build change retries instead of failing the request');
  assert.match(bundle.code, /mid-build-write/, 'the retried bundle carries the settled source');
});

test('a file that keeps changing serves the last good bundle and logs a warning naming it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-worker-bundle-fallback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const warnings = collectWarnings(t);
  await writeFixture(root);
  const dataFile = join(root, 'src', 'shared', 'data.json');
  let builds = 0;
  let churn = false;
  const buildApi = {
    async build(options) {
      const result = await esbuild.build(options);
      builds += 1;
      if (churn) await writeFile(dataFile, `{"value":"churn-${builds}"}\n`);
      return result;
    },
  };
  const provider = createDevSimWorkerBundleProvider({ root, buildApi, maxAttempts: 5, retryDelayMs: 1 });
  const first = await provider.getBundle();
  await writeFile(dataFile, `{"value":"post-good"}\n`);
  churn = true;
  const buildsBefore = builds;
  const bundle = await provider.getBundle();
  assert.equal(builds - buildsBefore, 5, 'the build retries its bounded five attempts');
  assert.equal(bundle.stale, true);
  assert.equal(bundle.digest, first.digest, 'the last verified bundle is served, not a 503');
  assert.ok(warnings.some((line) => line.includes('data.json')),
    `warning must name the file that kept changing; saw: ${JSON.stringify(warnings)}`);
});

test('a syntax error with no prior bundle fails as one plain sentence naming the file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-worker-bundle-plain-fail-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFixture(root);
  await writeFile(join(root, 'src', 'core', 'dep.js'), 'export function {\n');
  const provider = createDevSimWorkerBundleProvider({ root, retryDelayMs: 1 });
  const error = await provider.getBundle().then(() => null, (err) => err);
  assert.ok(error, 'the request must still fail when no last good bundle exists');
  assert.match(error.message, /dep\.js/, 'the failure names the broken file');
  assert.ok(!error.message.includes('\n'), 'the failure is a single sentence, not a trace');
  assert.equal(error.stack, error.message, 'log surfaces printing error.stack get the same sentence');
});

test('unchanged inputs serve an identical bundle and digest', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-worker-bundle-stable-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFixture(root);
  const provider = createDevSimWorkerBundleProvider({ root });
  const first = await provider.getBundle();
  const second = await provider.getBundle();
  assert.equal(second.digest, first.digest);
  assert.deepEqual(second.bytes, first.bytes);
});
