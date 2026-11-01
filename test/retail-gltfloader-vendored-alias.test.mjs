// #170: the retail bundle (scripts/build-bundle.mjs) must parse GLBs with the same GLTFLoader the
// zero-build path loads through the importmap (vendor/addons/loaders/GLTFLoader.js), not the stock
// node_modules copy. Bundles only the loader with the retail resolution options — no asset copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import { retailBundleAliases, retailThreeCorePlugin } from '../scripts/lib/retailBundleAliases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

async function bundleRetail(contents) {
  const result = await esbuild.build({
    stdin: { contents, resolveDir: ROOT, sourcefile: 'retail-probe.js' },
    bundle: true,
    format: 'esm',
    write: false,
    metafile: true,
    minify: true,
    platform: 'browser',
    target: ['chrome110'],
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import'],
    alias: retailBundleAliases(ROOT),
    plugins: [retailThreeCorePlugin(ROOT)],
    logLevel: 'silent',
  });
  return { inputs: Object.keys(result.metafile.inputs), text: result.outputFiles.map((f) => f.text).join('\n') };
}

test('build-bundle.mjs applies the retail alias map', () => {
  const src = readFileSync(join(ROOT, 'scripts/build-bundle.mjs'), 'utf8');
  assert.match(src, /import\s*\{\s*retailBundleAliases\s*,\s*retailThreeCorePlugin\s*\}\s*from\s*'\.\/lib\/retailBundleAliases\.mjs'/);
  assert.match(src, /alias:\s*retailBundleAliases\(ROOT\)/);
  assert.match(src, /plugins:\s*\[retailThreeCorePlugin\(ROOT\)\]/);
});

test('the importmap and the retail alias point three/addons GLTFLoader at the same vendor file', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.equal(map['three/addons/'], './vendor/addons/');
  assert.equal(rel(retailBundleAliases(ROOT)['three/addons/loaders/GLTFLoader.js']), 'vendor/addons/loaders/GLTFLoader.js');
});

test('retail resolves the vendored core and GLTFLoader while other addons stay on npm', async () => {
  const { inputs, text } = await bundleRetail(
    "export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\n"
    + "export { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';\n",
  );
  assert.ok(inputs.includes('vendor/addons/loaders/GLTFLoader.js'), inputs.join(', '));
  assert.ok(!inputs.some((p) => p.endsWith('examples/jsm/loaders/GLTFLoader.js')), 'stock GLTFLoader must not be bundled');
  // The loader and app share the same vendored core; its relative three.core import stays intact.
  assert.ok(inputs.includes('vendor/three.module.js'), inputs.join(', '));
  assert.ok(inputs.includes('vendor/three.core.js'), inputs.join(', '));
  assert.ok(!inputs.some((p) => p.startsWith('node_modules/three/build/')), 'npm Three core must not be bundled');
  // Other addons keep resolving from node_modules.
  assert.ok(inputs.some((p) => p.endsWith('node_modules/three/examples/jsm/libs/meshopt_decoder.module.js')));
  // #168 in-place GLB body reads survive minification (property names are not mangled).
  for (const marker of ['glbBodyRange', 'glbBodySliceRange', 'bodyRange', 'bodyByteOffset']) {
    assert.ok(text.includes(marker), `bundle must contain ${marker}`);
  }
});
