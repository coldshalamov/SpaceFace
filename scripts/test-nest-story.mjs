// Actual campaign recorder and Nest owner reader. Thin-overlay auxiliary roots are
// explicit review inputs; the default always reads the checked-out production source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const auxiliaries = process.argv.flatMap((value, index, args) => value === '--aux-root' ? [path.resolve(args[index + 1])] : []);
const coreOnly = process.argv.includes('--core-sector-only');
const sources = [];
const context = vm.createContext({ console, structuredClone, Map, Set, Object, Number, Math, Array });
const modules = new Map();
function moduleFor(relative) {
  if (modules.has(relative)) return modules.get(relative);
  if (relative === 'src/data/frontierRegions/index.js' && coreOnly) {
    const module = new vm.SyntheticModule(['FRONTIER_ORIGINS', 'FRONTIER_SECTOR_IDS'], function () {
      this.setExport('FRONTIER_ORIGINS', {}); this.setExport('FRONTIER_SECTOR_IDS', []);
    }, { context, identifier: relative });
    modules.set(relative, module); return module;
  }
  const filename = [root, ...auxiliaries].map(base => path.join(base, relative)).find(fs.existsSync);
  assert(filename, `Missing actual source ${relative}`);
  const source = fs.readFileSync(filename, 'utf8');
  sources.push({ path: relative, filename, sha256: createHash('sha256').update(source).digest('hex') });
  const module = new vm.SourceTextModule(source, { context, identifier: relative });
  modules.set(relative, module); return module;
}
const entry = moduleFor('src/story/campaign47a/campaignTransitions.js');
await entry.link((specifier, ref) => moduleFor(path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier), specifier))));
await entry.evaluate();
const C = entry.namespace;
const plain = value => JSON.parse(JSON.stringify(value));
function state(completed = ['cinder_board', 'compost']) {
  const s = { simTime: 10, story: { beatIndex: 2, branch: null, flags: {} }, entities: new Map() };
  C.initCampaignSidecar(s, 10);
  // This is a preexisting checkpoint, not a fabricated positive encounter producer.
  s.story.campaign47a.stepProgress['2'] = { completed: [...completed], updatedAtS: 9 };
  return s;
}
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
for (const outcome of [undefined, 'aborted:no_cast', 'aborted:sector_exit', 'aborted:script_error', 'subject_gone', 'carrier_down', 'carrier_gutted', 'nest_emptied', 'carrier_escapes']) {
  test(`unowned ${String(outcome)} does not open Registry Writ`, () => {
    const s = state(); const before = plain(s.story);
    const result = C.recordBeatStep(s, 'encounter:resolved', { shape: 'the_nest', encounterId: 'invented', sectorId: 'sector_charon_expanse', outcome, authenticated: true }, 10);
    assert.equal(result.ok, false); assert.equal(result.reason, 'unverified_nest_outcome');
    assert.deepEqual(plain(s.story), before, 'rejected event cannot rewrite progress or create a receipt');
  });
}
test('legacy completed Nest remains completed without demanding a new receipt', () => {
  const s = state(['cinder_board', 'compost', 'nest']);
  C.syncObservedBeat(s, 11);
  assert.deepEqual(plain(C.getBeatStepStatus(s, 2).completed), ['cinder_board', 'compost', 'nest']);
  const result = C.recordBeatStep(s, 'mission:completed', { storyTag: 'campaign47a:b2:elroy' }, 12);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(C.getBeatStepStatus(s, 2).completed), ['cinder_board', 'compost', 'nest', 'elroy']);
});
test('unrelated encounter still uses ordinary ordered-step matching', () => {
  const s = state();
  const result = C.recordBeatStep(s, 'encounter:resolved', { shape: 'some_other_fight', outcome: 'carrier_down' }, 10);
  assert.equal(result.ok, false); assert.notEqual(result.reason, 'unverified_nest_outcome');
  assert.deepEqual(plain(C.getBeatStepStatus(s, 2).completed), ['cinder_board', 'compost']);
});
console.log(JSON.stringify({ passed: count, sources }, null, 2));
console.log('Source-level campaign authentication only; positive real runtime route is covered by w533 and the Nest route suite. Not native physics/browser acceptance.');
