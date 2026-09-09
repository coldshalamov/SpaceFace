// scripts/build-bundle.mjs — production bundle for the Electron/web release (P2-18).
//
// The dev path (node server.js → browser) is ZERO-BUILD: raw ES modules + an importmap resolve
// three/rapier from vendor/. That path stays exactly as-is. This script adds a SEPARATE production
// build: esbuild bundles src/main.js + every dynamically-imported screen into a tree-shaken,
// minified output in build/web/, resolving three/rapier/addons from node_modules. The Electron
// builder ships build/web/ instead of the raw src/ tree, cutting load size substantially.
//
// Dynamic imports: src/ui/uiRoot.js imports screens through literal import() call sites,
// and src/core/* + src/render/assetLoader.js conditionally import
// rapier/three-addons. esbuild code-splits these into separate chunks automatically (each dynamic
// import becomes its own file loaded on demand).
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, rename, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acquireReleaseBuildLock,
  assertReleasePathSafe,
  copyReleaseRuntimeTrees,
  validateReleaseBuildReceipt,
  writeReleaseBuildReceipt,
} from './lib/releasePackaging.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
// Build outside the final tree, validate it completely, then swap it into build/web. Electron
// Builder globs only build/web, so an interrupted build cannot package a partial candidate.
const FINAL_OUT = join(ROOT, 'build', 'web');
const OUT = join(ROOT, 'build', 'web.__building');
const PREVIOUS_OUT = join(ROOT, 'build', 'web.__previous');

// Count screen modules for the build log. They are imported from uiRoot.js through literal dynamic
// import call sites, so main.js is the only entry point; adding screens here as independent entries
// would duplicate shared chunks.
async function screenEntries() {
  const dir = join(SRC, 'ui', 'screens');
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith('.js')).map((f) => join(dir, f));
}

// Total size of a directory tree.
async function dirSize(dir) {
  let total = 0;
  if (!existsSync(dir)) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const s = join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(s);
    else total += (await stat(s)).size;
  }
  return total;
}

// Total size of only the JS files in a directory tree. JS compression/tree-shaking and the
// separately receipted render-package source projection are reported as independent savings.
async function jsSize(dir) {
  let total = 0;
  if (!existsSync(dir)) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const s = join(dir, e.name);
    if (e.isDirectory()) total += await jsSize(s);
    else if (/\.(m?js)$/i.test(e.name)) total += (await stat(s)).size;
  }
  return total;
}

async function build() {
  await recoverPublishedOutput();
  const screens = await screenEntries();
  const entryPoints = [join(SRC, 'main.js')];

  console.log('[bundle] entry points:', entryPoints.length, '(main.js; ' + screens.length + ' screens via dynamic imports)');
  await cleanOutputDir();

  const result = await esbuild.build({
    entryPoints,
    bundle: true,
    format: 'esm',
    splitting: true,          // code-split dynamic imports into separate chunks
    outdir: OUT,
    minify: true,             // minify JS
    treeShaking: true,
    dropLabels: ['SF_DEBUG_ONLY'], // raw source keeps dev tools; production removes the statements
    sourcemap: false,         // ship without sourcemaps (smaller; dev uses raw modules)
    target: ['chrome110'],    // Electron 31 = Chromium 126; chrome110 is a safe floor
    platform: 'browser',
    // Resolve bare specifiers to the npm packages (three/rapier ship ESM in node_modules).
    // The vendor/ copies are only for the zero-build dev path; the bundle uses node_modules.
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import'],
    logLevel: 'info',
    // Treat dynamic imports of literal strings as code-splittable chunks (default).
    legalComments: 'none',
    define: {
      // Define the browser-facing process object too: guards test `typeof process` first.
      process: JSON.stringify({ env: { NODE_ENV: 'production' }, versions: {}, argv: [] }),
      __SPACEFACE_PRODUCTION__: 'true',
    },
  });

  // Copy every URL-fetched runtime root from one canonical map. Ship authoring sources, Blender
  // files, evidence, rejected candidates, and previous exports are intentionally excluded: normal
  // play is release-authored and reads only assets/ships/release/. This preserves visual quality
  // byte-for-byte while preventing gigabytes of non-runtime production files from entering retail.
  await mkdir(OUT, { recursive: true });
  await copyReleaseRuntimeTrees({ root: ROOT, webRoot: OUT });
  await runNodeGate('scripts/check-render-package-instance-plan.mjs', [
    '--package-dir', join(OUT, 'assets', 'ships', 'release', 'render-packages'),
  ]);

  // Write a bundled index.html (no importmap — the bundle resolves everything).
  const bundledHtml = await buildBundledHtml();
  await writeFile(join(OUT, 'index.html'), bundledHtml, 'utf8');

  // Deterministic, hash-bound receipt: no timestamps, sorted file records, exact declared
  // projection parity for every copied runtime root. Identical inputs reproduce the same digest.
  const releaseReceipt = await writeReleaseBuildReceipt({
    root: ROOT,
    webRoot: OUT,
  });

  // Report JS savings independently from the receipt's render-package source projection. Raw JS =
  // src/ + vendor/three+rapier+addons; bundled JS is minified, tree-shaken, and code-split. Asset
  // byte savings are recorded separately because they remove only package-covered source GLBs.
  const rawJsSize = (await jsSize(SRC)) + (await jsSize(join(ROOT, 'vendor')));
  const outJsSize = await jsSize(OUT);
  const saving = rawJsSize > 0 ? ((1 - outJsSize / rawJsSize) * 100) : 0;
  console.log('[bundle] raw JS (src + vendor/three+rapier): ' + (rawJsSize / 1024 / 1024).toFixed(2) + ' MB');
  console.log('[bundle] bundled JS (minified + tree-shaken): ' + (outJsSize / 1024 / 1024).toFixed(2) + ' MB (' +
    saving.toFixed(0) + '% smaller)');

  if (result.errors.length) throw new Error(`[bundle] esbuild returned ${result.errors.length} errors`);
  if (result.warnings.length) console.warn('[bundle] warnings:', result.warnings.length);
  // Re-read every staged byte at the final publication boundary. Nothing asynchronous may inspect
  // or transform OUT after this point; a mismatched source/output generation never reaches the
  // atomic rename into build/web.
  const releaseValidation = await validateReleaseBuildReceipt({
    root: ROOT,
    webRoot: OUT,
    receipt: releaseReceipt,
  });
  if (!releaseValidation.pass) {
    throw new Error(`[bundle] invalid release receipt: ${releaseValidation.failures.join('; ')}`);
  }
  console.log(`[bundle] receipt ${releaseReceipt.output.digest} (${releaseReceipt.output.fileCount} files)`);
  await publishOutputDir();
  console.log('[bundle] OK → build/web/');
  return { outJsSize, rawJsSize };
}

async function runNodeGate(relativeScript, args = []) {
  const script = resolve(ROOT, ...relativeScript.split('/'));
  await new Promise((resolveGate, rejectGate) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' });
    child.once('error', rejectGate);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveGate();
      else rejectGate(new Error(
        `[bundle] prerequisite ${relativeScript} failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
      ));
    });
  });
}

async function recoverPublishedOutput() {
  await assertReleasePathSafe({ root: ROOT, path: FINAL_OUT, label: 'release output', allowMissing: true });
  await assertReleasePathSafe({ root: ROOT, path: PREVIOUS_OUT, label: 'release backup', allowMissing: true });
  if (!existsSync(FINAL_OUT) && existsSync(PREVIOUS_OUT)) await rename(PREVIOUS_OUT, FINAL_OUT);
  if (existsSync(FINAL_OUT) && existsSync(PREVIOUS_OUT)) {
    await rm(PREVIOUS_OUT, { recursive: true, force: true });
  }
}

async function cleanOutputDir() {
  const expected = resolve(ROOT, 'build', 'web.__building');
  const actual = resolve(OUT);
  if (actual !== expected) throw new Error(`[bundle] refused to clean unexpected output dir: ${actual}`);
  await assertReleasePathSafe({ root: ROOT, path: actual, label: 'release staging output', allowMissing: true });
  await rm(actual, { recursive: true, force: true });
  await mkdir(actual, { recursive: true });
}

async function publishOutputDir() {
  const expectedFinal = resolve(ROOT, 'build', 'web');
  const expectedStaging = resolve(ROOT, 'build', 'web.__building');
  const expectedPrevious = resolve(ROOT, 'build', 'web.__previous');
  if (resolve(FINAL_OUT) !== expectedFinal || resolve(OUT) !== expectedStaging
    || resolve(PREVIOUS_OUT) !== expectedPrevious) {
    throw new Error('[bundle] refused to publish unexpected output directories');
  }

  // Recover a prior interrupted swap before beginning a new one. The old validated tree remains
  // authoritative until the new staging tree has been fully built and receipt-validated.
  await recoverPublishedOutput();

  let previousMoved = false;
  try {
    if (existsSync(FINAL_OUT)) {
      await rename(FINAL_OUT, PREVIOUS_OUT);
      previousMoved = true;
    }
    await rename(OUT, FINAL_OUT);
  } catch (error) {
    if (previousMoved && !existsSync(FINAL_OUT) && existsSync(PREVIOUS_OUT)) {
      try { await rename(PREVIOUS_OUT, FINAL_OUT); }
      catch (restoreError) {
        throw new AggregateError([error, restoreError], '[bundle] publish failed and prior output restoration failed');
      }
    }
    throw error;
  }
  if (existsSync(PREVIOUS_OUT)) await rm(PREVIOUS_OUT, { recursive: true, force: true });
}

// Build the production index.html: same DOM shell as the dev index.html, but loads the bundled
// main.js (no importmap — the bundle inlines three/rapier) and the copied CSS.
async function buildBundledHtml() {
  const devHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
  // The dev html has an importmap script + a module script pointing at ./src/main.js. Replace both
  // with a single module script pointing at the bundled ./main.js (esbuild names it after the first
  // entry point). Keep the CSS links, the DOM shell, the meta, the icon.
  return devHtml
    // strip the importmap block (the bundle resolves bare specifiers itself)
    .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
    // point the module script at the bundled output
    .replace('<script type="module" src="./src/main.js"></script>', '<script type="module" src="./main.js"></script>');
}

async function runLockedBuild() {
  const lock = await acquireReleaseBuildLock({ projectRoot: ROOT, buildRoot: join(ROOT, 'build') });
  let result = null;
  let failure = null;
  try {
    result = await build();
  } catch (error) {
    failure = error;
    try {
      await assertReleasePathSafe({ root: ROOT, path: OUT, label: 'release staging output', allowMissing: true });
      await rm(OUT, { recursive: true, force: true });
    }
    catch (cleanupError) {
      failure = new AggregateError([error, cleanupError], '[bundle] build failed and staging cleanup failed');
    }
  }
  try {
    await lock.release();
  } catch (releaseError) {
    failure = failure
      ? new AggregateError([failure, releaseError], '[bundle] build failed and its lock could not be released')
      : releaseError;
  }
  if (failure) throw failure;
  return result;
}

runLockedBuild().catch((err) => {
  console.error('[bundle] FAILED:', err);
  process.exit(1);
});
