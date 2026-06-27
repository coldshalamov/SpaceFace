// scripts/build-bundle.mjs — production bundle for the Electron/web release (P2-18).
//
// The dev path (node server.js → browser) is ZERO-BUILD: raw ES modules + an importmap resolve
// three/rapier from vendor/. That path stays exactly as-is. This script adds a SEPARATE production
// build: esbuild bundles src/main.js + every dynamically-imported screen into a tree-shaken,
// minified output in dist/web/, resolving three/rapier/addons from node_modules. The Electron
// builder ships dist/web/ instead of the raw src/ tree, cutting load size substantially.
//
// Dynamic imports: src/ui/uiRoot.js imports screens through literal import() call sites,
// and src/core/* + src/render/assetLoader.js conditionally import
// rapier/three-addons. esbuild code-splits these into separate chunks automatically (each dynamic
// import becomes its own file loaded on demand).
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir, copyFile, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
// Output to build/web/ (NOT dist/) so electron-builder's output dir (dist/) doesn't collide with the
// bundled web assets it needs to ship. electron-builder globs are relative to project root.
const OUT = join(ROOT, 'build', 'web');
const RELEASE_ASSET_DIRS = ['cinematics', 'ui', 'ships'];

// Count screen modules for the build log. They are imported from uiRoot.js through literal dynamic
// import call sites, so main.js is the only entry point; adding screens here as independent entries
// would duplicate shared chunks.
async function screenEntries() {
  const dir = join(SRC, 'ui', 'screens');
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith('.js')).map((f) => join(dir, f));
}

// Recursively copy a directory (assets/styles that aren't JS — CSS, images, GLBs).
async function copyDir(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const s = join(srcDir, e.name);
    const d = join(destDir, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
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

// Total size of only the JS files in a directory tree (the bundle's actual win — binary assets
// like GLBs/KTX2/MP4s ship identically whether bundled or not).
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
      // Production bundles strip debug surfaces while keeping the same player-facing launch URL.
      'process.env.NODE_ENV': '"production"',
    },
  });

  // Copy the non-JS assets the bundle references by URL (CSS, cinematics, UI atlas, ships, decoder libs).
  await mkdir(OUT, { recursive: true });
  await copyDir(join(ROOT, 'styles'), join(OUT, 'styles'));
  // Runtime-authored asset dirs. Keep this list mirrored by package.json + check-launch-policy.
  if (existsSync(join(ROOT, 'assets'))) {
    await mkdir(join(OUT, 'assets'), { recursive: true });
    for (const name of RELEASE_ASSET_DIRS) {
      const srcDir = join(ROOT, 'assets', name);
      if (existsSync(srcDir)) await copyDir(srcDir, join(OUT, 'assets', name));
    }
  }
  // Scenario contracts are fetched by URL at runtime so designers can inspect the exact authored
  // JSON that powered a run. They are not part of the JS graph, so esbuild will not copy them.
  if (existsSync(join(ROOT, 'src', 'data', 'scenarios'))) {
    await copyDir(join(ROOT, 'src', 'data', 'scenarios'), join(OUT, 'data', 'scenarios'));
  }
  // Runtime decoder libs (basis/draco/meshopt) are loaded dynamically by the bundled loaders at
  // URLs matching ASSET_RUNTIME_DECODER_CONTRACT paths. Keep them at the same relative location
  // inside the bundle so the runtime URLs resolve identically.
  if (existsSync(join(ROOT, 'vendor', 'addons', 'libs'))) {
    await mkdir(join(OUT, 'vendor', 'addons', 'libs'), { recursive: true });
    await copyDir(join(ROOT, 'vendor', 'addons', 'libs'), join(OUT, 'vendor', 'addons', 'libs'));
  }

  // Write a bundled index.html (no importmap — the bundle resolves everything).
  const bundledHtml = await buildBundledHtml();
  await writeFile(join(OUT, 'index.html'), bundledHtml, 'utf8');

  // Report size savings. The binding comparison is JS-to-JS: binary assets (GLBs, KTX2, MP4s) ship
  // identically whether bundled or not, so only the JS footprint is affected by minification +
  // tree-shaking. Raw JS = src/ (3.0M) + vendor/ three+rapier+addons (5.2M). Bundled JS = dist/web
  // minified + tree-shaken + code-split.
  const rawJsSize = (await jsSize(SRC)) + (await jsSize(join(ROOT, 'vendor')));
  const outJsSize = await jsSize(OUT);
  const saving = rawJsSize > 0 ? ((1 - outJsSize / rawJsSize) * 100) : 0;
  console.log('[bundle] raw JS (src + vendor/three+rapier): ' + (rawJsSize / 1024 / 1024).toFixed(2) + ' MB');
  console.log('[bundle] bundled JS (minified + tree-shaken): ' + (outJsSize / 1024 / 1024).toFixed(2) + ' MB (' +
    saving.toFixed(0) + '% smaller)');

  if (result.errors.length) { console.error('[bundle] errors:', result.errors); process.exit(1); }
  if (result.warnings.length) console.warn('[bundle] warnings:', result.warnings.length);
  console.log('[bundle] OK → build/web/');
  return { outJsSize, rawJsSize };
}

async function cleanOutputDir() {
  const expected = resolve(ROOT, 'build', 'web');
  const actual = resolve(OUT);
  if (actual !== expected) throw new Error(`[bundle] refused to clean unexpected output dir: ${actual}`);
  await rm(actual, { recursive: true, force: true });
  await mkdir(actual, { recursive: true });
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

build().catch((err) => { console.error('[bundle] FAILED', err); process.exit(1); });
