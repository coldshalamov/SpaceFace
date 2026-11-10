// Black-box CLI contract tests with tiny executor doubles. These do NOT prove gameplay physics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
function fixture(t, executors = true) {
  const root = mkdtempSync(join(tmpdir(), 'sf-cli-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  for (const path of ['scripts/sf-lab.mjs', 'scripts/agent-loop.mjs', 'scripts/lib/agentLoopPlan.mjs',
    'scripts/lib/labExecution.mjs', 'scripts/lib/labTraceReport.mjs']) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); copyFileSync(join(ROOT, path), join(root, path));
  }
  put('package.json', '{"type":"module"}');
  put('src/testing/scenarios/example.scenario.json', JSON.stringify({ id: 'example', dt: 1 / 60 }));
  if (executors) {
    put('src/testing/lab/runScenario.js', `
      const trace = [{tick:0,playerX:0,playerZ:0,playerVelX:1,playerVelZ:0,playerRot:0},
        {tick:1,playerX:1,playerZ:0,playerVelX:1,playerVelZ:0,playerRot:0}];
      export async function runLabScenario(doc) {
        return {ok:true,exitClass:0,status:'pass',certifying:true,nonPromoting:false,arity:arguments.length};
      }
      export async function runLabScenarioInternal(doc, options) {
        return {ok:true,exitClass:0,status:'pass',scenarioId:doc.id,seed:47,scenarioDigest:'s',inputDigest:'i',
          evidenceClass:'internal-test',executionEvidenceClass:'focused-fixture',nonPromoting:true,certifying:false,
          trace:options.verbosity>=3?trace:undefined,inputLog:options.verbosity>=4?[{tick:0,keys:['ArrowUp']}]:undefined,options};
      }`);
    put('src/testing/lab/repeat.js', `export async function repeatScenario(doc,options) {
      return {ok:true,exitClass:0,status:'pass',certifying:true,nonPromoting:false,options};
    }`);
    put('src/testing/lab/saveLoadCompare.js', `export async function compareSaveLoad(doc,options) {
      return {ok:true,exitClass:0,status:'pass',certifying:true,nonPromoting:false,options};
    }`);
    put('src/testing/lab/equivalenceOwnership.js', `
      export function collectDeclaredEquivalences(doc) { return doc.claims || []; }
      export function executorOwnsEquivalence(executor,claim) { return executor===claim; }
    `);
  }
  return { root, put, run(script, ...args) {
    return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  } };
}
function payload(child, code) {
  assert.equal(child.status, code, child.stderr || child.stdout);
  return JSON.parse(child.stdout);
}

test('help works with simulation and browser modules absent', t => {
  const f = fixture(t, false);
  for (const file of ['scripts/sf-lab.mjs', 'scripts/agent-loop.mjs']) {
    const child = f.run(file, '--help'); assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /scenario/);
  }
});
test('bad options fail without loading the simulation', t => {
  const f = fixture(t, false);
  assert.equal(payload(f.run('scripts/sf-lab.mjs', 'run', 'example', '--unknown'), 4).ok, false);
  assert.equal(payload(f.run('scripts/sf-lab.mjs', 'compare', 'example', '--runtimes=node'), 4).ok, false);
});
test('public run receives only the document and retains authority flags', t => {
  const f = fixture(t), result = payload(f.run('scripts/sf-lab.mjs', 'run', 'example'), 0);
  assert.equal(result.result.arity, 1); assert.equal(result.result.certifying, true);
  assert.equal(result.result.nonPromoting, false);
});
test('trace actually retains poses/input and never exits acceptance-green', t => {
  const f = fixture(t), result = payload(f.run('scripts/sf-lab.mjs', 'trace', '--verbosity=0', 'example'), 4);
  assert.equal(result.captureOk, true); assert.equal(result.nonPromoting, true); assert.equal(result.certifying, false);
  assert.equal(result.result.trace.length, 2); assert.equal(result.result.inputLog.length, 1);
  assert.equal(result.result.options.verbosity, 4);
});
test('observer diagnostic keeps the internal-arm exit class', t => {
  const f = fixture(t), result = payload(f.run('scripts/sf-lab.mjs', 'run', 'example', '--observer-on'), 4);
  assert.equal(result.nonPromoting, true); assert.equal(result.result.options.observerEnabled, true);
});
test('repeat parses equals and whitespace flags before scenario without losing it', t => {
  const f = fixture(t), result = payload(f.run('scripts/sf-lab.mjs', 'repeat', '--runs=3', '--verbosity', '2', 'example'), 0);
  assert.equal(result.result.options.runs, 3); assert.equal(result.result.options.verbosity, 2);
});
test('worker selects parent per scenario and keeps independent failure visible', t => {
  const f = fixture(t);
  f.put('src/testing/scenarios/repeat.scenario.json', JSON.stringify({ claims: ['repeat'] }));
  f.put('src/testing/scenarios/save.scenario.json', JSON.stringify({ claims: ['save-load'] }));
  f.put('src/testing/scenarios/browser.scenario.json', JSON.stringify({ claims: ['browser-parity'] }));
  const out = '.devshots/agent-loop/contract';
  f.put(`${out}/job.json`, JSON.stringify({ out, scenarios: [
    'src/testing/scenarios/repeat.scenario.json', 'src/testing/scenarios/browser.scenario.json', 'src/testing/scenarios/save.scenario.json',
  ] }));
  const child = f.run('scripts/agent-loop.mjs', '_worker', `--job=${out}/job.json`);
  assert.equal(child.status, 4, child.stderr);
  const result = JSON.parse(readFileSync(join(f.root, out, 'batch.json')));
  assert.equal(result.ok, false); assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map(r => r.action), ['repeat', 'auto', 'compare']);
  assert.equal(result.rows[2].ok, true); assert.equal(result.gameBoots, 0);
});
test('trace batch exports static handling report and distinct diagnostic completion', t => {
  const f = fixture(t), out = '.devshots/agent-loop/trace';
  f.put(`${out}/job.json`, JSON.stringify({ out, trace: true, scenarios: ['src/testing/scenarios/example.scenario.json'] }));
  const child = f.run('scripts/agent-loop.mjs', '_worker', `--job=${out}/job.json`);
  assert.equal(child.status, 4, child.stderr);
  const result = JSON.parse(readFileSync(join(f.root, out, 'batch.json')));
  assert.equal(result.status, 'diagnostic-complete'); assert.equal(result.ok, false);
  assert.match(readFileSync(join(f.root, out, '001-handling.html'), 'utf8'), /Recorded XZ trajectory/);
  const compared = payload(f.run('scripts/agent-loop.mjs', 'compare', `${out}/001-handling.json`, `${out}/001-handling.json`), 0);
  assert.equal(compared.comparable, true); assert.equal(compared.nonPromoting, true); assert.equal(compared.deltas.peakSpeed, 0);
});
