import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

// Execute only declarations and pure emitters. The filesystem discovery, order allocation,
// stale-file pruning, roster and index pipeline are deliberately NOT executed by this test.
// Ambient slots begin at the existing 902 slot; this is not a claim about a full rebuild.
export function captureVignettes(source, shapeSource = read('src/data/encounters/shape.js')) {
  const boundary = source.indexOf('const existingIds = new Set();');
  assert.ok(boundary > 0, 'generator declaration boundary must exist');
  const declarations = source.slice(0, boundary)
    .replace(/^#!.*\r?\n/, '')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^const ROOT = .*;\r?\n/m, '')
    .replace(/^const DIR = .*;\r?\n/m, '');
  const output = new Map();
  const context = vm.createContext({
    DIR: '',
    join: (...parts) => parts.filter(Boolean).join('/'),
    writeFileSync: (path, text) => {
      assert.equal(typeof text, 'string');
      assert.ok(!output.has(path), `duplicate emission: ${path}`);
      output.set(path, text);
    },
  });
  vm.runInContext(shapeSource.replace(/^export /gm, '') + '\n' + declarations + `
    assertScenes(HAND);
    const used = new Set(HAND.map(row => \`\${row.situation}|\${row.place}|\${row.twist}|\${row.actor}\`));
    for (const row of AMBIENT) {
      validateEncounterShape(row, row.id);
      used.add(\`\${row.situation}|\${row.place}|\${row.twist}|\${row.actor}\`);
    }
    const all = [...HAND, ...moreScenes(HAND[HAND.length - 1].order + 1, used)];
    assertScenes(all);
    for (const row of all) emit(row);
    AMBIENT.forEach((row, i) => emitAmbient({ ...row, order: 902 + i,
      file: \`\${902 + i}-scene-\${row.id.replace(/_/g, '-')}.js\` }));
  `, context, { timeout: 5000 });
  return output;
}

test('pure emitter exactly preserves the specialized Sweep Window module', () => {
  const output = captureVignettes(read('scripts/build-lived-vignettes.mjs'));
  assert.equal(output.get('922-scene-sweep-window.js'), read('src/data/encounters/922-scene-sweep-window.js'));
});

test('Sweep Window emission keeps its earned receipt and runtime binding', () => {
  const source = captureVignettes(read('scripts/build-lived-vignettes.mjs')).get('922-scene-sweep-window.js');
  assert.match(source, /import \{ createSweepWindowRuntime \} from '\.\.\/\.\.\/systems\/sweepWindowRuntime\.js';/);
  assert.match(source, /export const runtime = createSweepWindowRuntime\(spec\);/);
  assert.equal(source.split('The runner reached the far marker on your count. Crossing filed.').length - 1, 2);
  assert.ok(!source.includes('The sweep read an empty lane.'));
});

test('Sweep Window helper has one low-priority preload in canonical order', () => {
  const html = read('index.html');
  const links = [...html.matchAll(/<link\s+[^>]*rel="modulepreload"[^>]*>/g)].map(match => match[0]);
  const index = links.findIndex(link => link.includes('href="./src/systems/sweepWindowRuntime.js"'));
  assert.ok(index > 0);
  assert.equal(links.filter(link => link.includes('href="./src/systems/sweepWindowRuntime.js"')).length, 1);
  assert.match(links[index], /fetchpriority="low"/);
  const href = link => link.match(/href="([^"]+)"/)[1];
  assert.ok(href(links[index - 1]) < href(links[index]));
  assert.ok(href(links[index]) < href(links[index + 1]));
  assert.ok(read('src/systems/sweepWindowRuntime.js').includes('export function createSweepWindowRuntime'));
});
