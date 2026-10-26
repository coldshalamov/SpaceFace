import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { validateEncounterShape } from '../src/data/encounters/shape.js';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = join(ROOT, 'src/data/encounters');
const AUTHORED_ORDERS = [391, 433, 448, 466, 495, 511, 540, 555, 566];

function specFromModule(source) {
  const match = source.match(/(?:export )?const spec = ([\s\S]*?);\s*export const encounterOrder/);
  assert.ok(match, 'generated encounter exposes the compiled JSON specification');
  return JSON.parse(match[1]);
}

function generateWithoutDiskWrites() {
  const generatorPath = join(ROOT, 'scripts/build-lived-vignettes.mjs');
  // Exercise the actual unscoped generator, including its ordinary emit loop, with
  // a filesystem sink. No production file is regenerated or deleted by this test.
  const source = readFileSync(generatorPath, 'utf8')
    .replace(/^#![^\n]*\n/, '')
    .replace(/^import [^\n]+\n/gm, '')
    .replace(/^const ROOT = [^\n]+\n/m, '');
  const outputs = new Map();
  runInNewContext(source, {
    ROOT, join, existsSync, readdirSync, readFileSync, validateEncounterShape,
    writeFileSync: (path, content) => outputs.set(path, content),
    unlinkSync() {}, mkdirSync() {},
    process: { argv: ['node', generatorPath] }, console: { log() {} },
  }, { filename: generatorPath, timeout: 15_000 });
  return outputs;
}

function spokenBeforeOffer(spec) {
  const entities = new Map(), lines = [];
  const state = { entities, player: { credits: 500 } };
  const live = { vars: {}, ids: [], roles: {}, anchor: { x: 0, z: 0 } };
  let now = 0, nextId = 1;
  const director = {
    now: () => now,
    player: () => ({ pos: { x: 400, z: 0 } }),
    say(_live, _channel, line) { lines.push(line); },
    offerChoices() {},
    spawnShips(row, ships) {
      return ships.map(ship => {
        const id = nextId++;
        entities.set(id, { id, type: 'ship', alive: true, pos: { ...ship.pos }, data: {} });
        row.ids.push(id); row.roles[id] = ship.role;
        return id;
      });
    },
    spawnProp() { return { id: nextId++, data: {} }; },
    entsOf: row => row.ids.map(id => entities.get(id)),
    abort(_live, reason) { assert.fail(`unexpected scene abort: ${reason}`); },
  };
  const runtime = compileVignette(spec);
  runtime.fire(director, live, state);
  for (let i = 0; live.phase !== 'offer' && i < 30; i++) {
    now = live.deadlineAt + 0.01;
    runtime.tick(director, live, state, now);
  }
  assert.equal(live.phase, 'offer', `${spec.id} reaches its ordinary choice point`);
  return lines;
}

test('unscoped lived generation preserves all nine authored interstitial lines on their live speech route', () => {
  const outputs = generateWithoutDiskWrites();
  for (const order of AUTHORED_ORDERS) {
    const name = readdirSync(DIR).find(file => file.startsWith(`${order}-`));
    const path = join(DIR, name);
    const shipped = specFromModule(readFileSync(path, 'utf8'));
    const generated = specFromModule(outputs.get(path));
    const authoredLine = shipped.phases.find(phase => phase.id === 'a2x')?.line;
    assert.ok(authoredLine, `${order} has an authored interstitial in the shipped scene`);
    assert.equal(generated.phases.find(phase => phase.id === 'a2x')?.line, authoredLine,
      `${order}: generation must not erase the authored line`);
    assert.equal(spokenBeforeOffer(generated).filter(line => line === authoredLine).length, 1,
      `${order}: the retained line must be reached exactly once before the choice`);
  }
});
