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

test('pure emitter exactly preserves the specialized Struck Bell module', () => {
  const output = captureVignettes(read('scripts/build-lived-vignettes.mjs'));
  assert.equal(output.get('925-scene-struck-bell.js'), read('src/data/encounters/925-scene-struck-bell.js'));
});

test('Struck Bell emission binds the dedicated runtime rather than free choice settlement', () => {
  const source = captureVignettes(read('scripts/build-lived-vignettes.mjs')).get('925-scene-struck-bell.js');
  assert.match(source, /import \{ createStruckBellRuntime \} from '\.\.\/\.\.\/systems\/struckBellRuntime\.js';/);
  assert.match(source, /export const runtime = createStruckBellRuntime\(spec\);/);
  assert.ok(!source.includes('compileVignette'));
});

test('Struck Bell helper has exactly one low-priority canonical preload and a real export', () => {
  const html = read('index.html');
  const links = [...html.matchAll(/<link\s+[^>]*rel="modulepreload"[^>]*>/g)].map(match => match[0]);
  const index = links.findIndex(link => link.includes('href="./src/systems/struckBellRuntime.js"'));
  assert.ok(index > 0);
  assert.equal(links.filter(link => link.includes('href="./src/systems/struckBellRuntime.js"')).length, 1);
  assert.match(links[index], /fetchpriority="low"/);
  const href = link => link.match(/href="([^"]+)"/)[1];
  assert.ok(href(links[index - 1]) < href(links[index]));
  assert.ok(href(links[index]) < href(links[index + 1]));
  assert.match(read('src/systems/struckBellRuntime.js'), /export function createStruckBellRuntime/);
});

test('Struck Bell runtime and generation gates remain separately reachable from check', () => {
  const { scripts } = JSON.parse(read('package.json'));
  const reached = new Set();
  function visit(name) {
    if (reached.has(name)) return;
    assert.equal(typeof scripts[name], 'string', `missing script ${name}`);
    reached.add(name);
    for (const [, child] of scripts[name].matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) visit(child);
  }
  visit('check');
  assert.ok(reached.has('check:struck-bell'));
  assert.ok(reached.has('check:struck-bell-generation'));
  assert.equal(scripts['check:struck-bell'], 'BELL_POPULATED=1 node --test test/struck-bell-runtime.test.mjs test/struck-bell-native.test.mjs');
  assert.equal(scripts['check:struck-bell-generation'], 'node --test test/struck-bell-generation.test.mjs');
});
