// Current-production owner graph by default. --aux-root and --core-sector-only are
// explicit sparse review ports; never invoke the latter for a full-game acceptance claim.
// node --experimental-vm-modules scripts/test-compost-story.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const auxiliaries = process.argv.flatMap((x, i, all) => x === '--aux-root' ? [path.resolve(all[i + 1])] : []);
const coreOnly = process.argv.includes('--core-sector-only');
const { loadClearanceGeometry } = await import(pathToFileURL(path.join(root, 'scripts/compost-clearance-geometry.mjs')).href);
const clearanceGeometry = await loadClearanceGeometry({ root, auxRoots: auxiliaries });
const read = relative => {
  const filename = [root, ...auxiliaries].map(dir => path.join(dir, relative)).find(file => fs.existsSync(file));
  assert(filename, `Missing current owner ${relative}; explicit --aux-root is review-only`);
  const source = fs.readFileSync(filename, 'utf8');
  console.log(JSON.stringify({ source: relative, filename, sha256: createHash('sha256').update(source).digest('hex') }));
  return { filename, source };
};
const context = vm.createContext({ console, structuredClone, Map, Set, Object, Number, Math, Array });
const modules = new Map();
function moduleFor(relative) {
  if (modules.has(relative)) return modules.get(relative);
  if (relative === 'src/data/frontierRegions/index.js' && coreOnly) {
    // These cases use canonical Charon/Tethys coordinates, never the separate frontier.
    const m = new vm.SyntheticModule(['FRONTIER_ORIGINS', 'FRONTIER_SECTOR_IDS'], function () {
      this.setExport('FRONTIER_ORIGINS', {}); this.setExport('FRONTIER_SECTOR_IDS', []);
    }, { context, identifier: relative });
    modules.set(relative, m); return m;
  }
  const geometryExports = {
    'src/data/collisionProxyManifests.js': ['hullEnvelopeWu', 'proxyOuterRadiusWu', 'COLLISION_PROXY_MANIFESTS'],
    'src/data/modelTruth.js': ['modelTruthProxyManifest'],
    'src/data/physicsMaterials.js': ['PHYSICS_MATERIALS'],
    'src/core/physicsAuthority.js': ['shouldSyncPhysicsBodyEntity', 'substanceFor'],
  }[relative];
  if (geometryExports) {
    const m = new vm.SyntheticModule(geometryExports, function () {
      for (const key of geometryExports) { assert.notEqual(clearanceGeometry[key], undefined, `Actual geometry export ${key}`); this.setExport(key, clearanceGeometry[key]); }
    }, { context, identifier: relative });
    modules.set(relative, m); return m;
  }
  const { source } = read(relative);
  const m = new vm.SourceTextModule(source, { context, identifier: relative });
  modules.set(relative, m); return m;
}
const entry = new vm.SourceTextModule(`
import * as garden from './src/systems/faction_understory.js';
import * as receiver from './src/data/understoryReceiver.js';
import * as campaign from './src/story/campaign47a/campaignTransitions.js';
import * as data from './src/story/campaign47a/campaignData.js';
import * as ecology from './src/data/factions/understory.js';
export { garden, receiver, campaign, data, ecology };`, { context, identifier: 'entry.mjs' });
await entry.link((specifier, ref) => moduleFor(path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier), specifier))));
await entry.evaluate();
const { garden: G, receiver: R, campaign: C, data: D, ecology: E } = entry.namespace;
const missionSource = read('src/systems/missions.js').source;
function method(name, endName) {
  const start = missionSource.indexOf(`  ${name}(`);
  const end = missionSource.indexOf(`\n  ${endName}(`, start);
  assert(start >= 0 && end > start, `extract actual missions.${name}, never a copied positive fixture`);
  return missionSource.slice(start, end).trim().replace(/,$/, '');
}
Object.assign(context, {
  getBeatStepStatus: C.getBeatStepStatus,
  firstPlayerGardenGrowth: R.firstPlayerGardenGrowth,
  UNDERSTORY_RECEIVER: R.UNDERSTORY_RECEIVER,
  receiverStatus: R.receiverStatus, receiverApproach: R.receiverApproach,
  UNDERSTORY_COMPOST_RUN: E.UNDERSTORY_COMPOST_RUN, UNDERSTORY_GARDENS: E.UNDERSTORY_GARDENS, UNDERSTORY_GARDEN_STAGES: E.UNDERSTORY_GARDEN_STAGES,
  SECTOR_BY_ID: new Map([['sector_charon_expanse', { name: 'Charon Expanse' }], ['sector_tethys_junction', { name: 'Tethys Junction' }]]),
  STATION_INFO: new Map([['station_tethys', { sectorId: 'sector_tethys_junction' }]]),
  getEmbodiedLocation: () => ({ stationId: 'station_tethys', sectorId: 'sector_tethys_junction' }),
  storyBeatTitle: beat => beat.title, BEAT_HINT: {},
});
const reconcile = vm.runInContext(`({${method('_reconcileCompostGrowth', '_storyWaypointForBeat')}})._reconcileCompostGrowth`, context);
const waypoint = vm.runInContext(`({${method('_storyWaypointForBeat', '_ensureStoryWaypoint')}})._storyWaypointForBeat`, context);
assert(missionSource.includes("bus.on('understory:playerGrowth', (p) => this._reconcileCompostGrowth(p))"), 'live listener uses the authenticated owner seam');
assert(!missionSource.includes("this._recordCampaignBookSignal('understory:gardenStage'"), 'ambient stage listener removed');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const plain = x => JSON.parse(JSON.stringify(x));
function harness({ cinder = true } = {}) {
  let nextId = 1;
  const state = { tick: 10, simTime: 10, rng: () => .5, mode: 'flight', run: { kind: 'adventure' },
    entities: new Map(), entityList: [], playerId: 999,
    world: { currentSectorId: R.UNDERSTORY_RECEIVER.sectorId }, player: {},
    story: { beatIndex: 2, branch: null, chainProgress: 0, flags: {} } };
  const subscribers = new Map(), events = [];
  const bus = { on(name, fn) { const a = subscribers.get(name) || []; a.push(fn); subscribers.set(name, a); return () => {}; },
    emit(name, payload) { events.push({ name, payload }); for (const fn of subscribers.get(name) || []) fn(payload); } };
  const helpers = { spawnEntity(spec) { const entity = { id: nextId++, alive: true, ...spec }; state.entities.set(entity.id, entity); state.entityList.push(entity); return entity; },
    removeEntity(id) { const entity = state.entities.get(id); if (entity) entity.alive = false; } };
  const missions = { state, _reconcileCompostGrowth: reconcile, _liveStation: () => null,
    _recordCampaignBookSignal: (signal, payload) => C.recordBeatStep(state, signal, payload, state.simTime).ok };
  bus.on('understory:playerGrowth', payload => reconcile.call(missions, payload));
  const owner = Object.create(G.understoryGardens); owner.init({ state, bus, helpers, registry: { get: () => null } });
  bus.emit('sector:enter', { sectorId: R.UNDERSTORY_RECEIVER.sectorId });
  owner.update(1 / 60, state);
  const receiver = R.receiverStatus(state).garden;
  assert(receiver, 'ordinary authored producer created receiver without a ship kill');
  if (cinder) C.recordBeatStep(state, 'mission:completed', { storyTag: 'campaign47a:b2:cinder' }, state.simTime);
  function feed(mass, byPlayer = true, target = receiver) {
    const prey = helpers.spawnEntity({ type: 'wreck', pos: { ...target.pos }, vel: { x: 0, z: 0 }, radius: 1, mass, hull: 10, data: {} });
    state.player.tether = byPlayer ? { active: true, targetId: prey.id } : null;
    owner.update(1 / 60, state); state.player.tether = null;
    return prey;
  }
  return { state, bus, events, helpers, owner, receiver, feed, missions };
}
const completed = h => plain(C.getBeatStepStatus(h.state, 2).completed);

test('ambient feeds/stages, unverified player feeds and forged growth cannot open the Nest', () => {
  const h = harness();
  const ambient = h.feed(100, false);
  assert.equal(ambient.alive, true, 'authored receiver reserves its growth for actual delivery');
  for (const signal of ['understory:gardenFed', 'understory:gardenStage', 'understory:compostRunComplete', 'understory:playerGrowth']) {
    const result = C.recordBeatStep(h.state, signal, { gardenId: h.receiver.data.gardenId, entityId: h.receiver.id, byPlayer: true, authenticated: true, fromStage: 1, stage: 2, fedMass: 100 }, 10);
    assert.equal(result.ok, false, signal);
  }
  assert.deepEqual(completed(h), ['cinder_board']);
});
test('real16t delivery grows retained52 to61.6 and records Compost, without a payment', () => {
  const h = harness(); const prey = h.feed(16);
  assert.equal(prey.alive, false); assert.equal(h.receiver.data.gardenStage, 2);
  assert.equal(h.receiver.data.gardenBiomass, 61.6); assert.equal(h.receiver.data.compostFedMass, 16);
  assert.deepEqual(completed(h), ['cinder_board', 'compost']);
  assert.equal(h.events.filter(e => e.name === 'economy:grantCredits').length, 0);
  assert.equal(h.state.story.beatIndex, 2, 'Compost does not skip Nest or Elroy');
  const wp = waypoint.call(h.missions, D.CAMPAIGN_BEATS.find(b => b.beat === 2));
  assert.equal(wp.label, 'The Nest — Charon'); assert.equal(wp.pos, null, 'no invented Nest coordinates');
  assert.equal(wp.sectorId, 'sector_charon_expanse');
});
test('real growth before Cinder filing reconciles later without new mass or payment', () => {
  const h = harness({ cinder: false }); h.feed(16);
  assert.deepEqual(completed(h), []);
  C.recordBeatStep(h.state, 'mission:completed', { storyTag: 'campaign47a:b2:cinder' }, 11);
  assert.equal(reconcile.call(h.missions), true);
  assert.deepEqual(completed(h), ['cinder_board', 'compost']);
  assert.equal(h.receiver.data.compostFedMass, 16);
  assert.equal(h.events.filter(e => e.name === 'economy:grantCredits').length, 0);
  assert.equal(reconcile.call(h.missions), false, 'no duplicate completion');
});
test('Continue rebinds a persisted real receipt to the same garden, not its recycled entity id', () => {
  const h = harness({ cinder: false }); h.feed(16);
  const saved = plain(h.receiver); const oldId = saved.id; saved.id += 1000;
  h.state.entities.delete(oldId); h.state.entities.set(saved.id, saved);
  h.state.entityList = h.state.entityList.filter(e => e !== h.receiver).concat(saved);
  h.state.understory = { gardens: {}, compost: {}, tidePushback: {} };
  const receipt = R.firstPlayerGardenGrowth(h.state);
  assert.equal(receipt.entityId, saved.id);
  C.recordBeatStep(h.state, 'mission:completed', { storyTag: 'campaign47a:b2:cinder' }, 11);
  assert.equal(reconcile.call(h.missions), true);
  assert.deepEqual(completed(h), ['cinder_board', 'compost']);
  assert.equal(saved.data.compostFedMass, 16);
});
test('corrupt or payload-only receipts cannot impersonate authoritative biomass/player totals', () => {
  const h = harness({ cinder: false }); h.feed(16);
  const fields = ['gardenBiomass', 'gardenFedByPlayer'];
  for (const key of fields) {
    const saved = h.receiver.data[key]; delete h.receiver.data[key];
    assert.equal(R.firstPlayerGardenGrowth(h.state), null, key);
    h.receiver.data[key] = saved;
  }
  const receipt = R.firstPlayerGardenGrowth(h.state);
  assert.equal(C.recordBeatStep(h.state, 'understory:playerGrowth', { ...receipt, fedMass: 240 }, 11).ok, false);
  h.state.entities.set(h.receiver.id, { id: h.receiver.id, alive: true, type: 'ship', data: {} });
  assert.equal(R.firstPlayerGardenGrowth(h.state), null, 'stale list row cannot authenticate after live ID reuse');
});
test('saved genuinely completed and old legacy book outcomes remain complete', () => {
  const h = harness(); h.feed(16); const before = completed(h);
  assert.equal(reconcile.call(h.missions), false); assert.deepEqual(completed(h), before);
  const legacy = harness({ cinder: false });
  C.completeBeatStepsForLegacy(legacy.state, 2, 10, 'legacy_contract');
  assert.deepEqual(completed(legacy), ['cinder_board', 'compost', 'nest', 'elroy']);
  assert.equal(reconcile.call(legacy.missions), false);
  assert.deepEqual(completed(legacy), ['cinder_board', 'compost', 'nest', 'elroy']);
});
test('destroyed receiver navigation retains run mass but promises no replacement 52 biomass', () => {
  const h = harness(); h.feed(8);
  // Owner-level lethal boundary, not a native damage/physics assertion. Absence alone is not loss.
  h.receiver.hull = 0; h.receiver.alive = false;
  h.bus.emit('entity:killed', { id: h.receiver.id, entity: h.receiver });
  const wp = waypoint.call(h.missions, D.CAMPAIGN_BEATS.find(b => b.beat === 2));
  assert(wp.reason.includes('100t from zero')); assert(wp.reason.includes('Retained growth 0 biomass'));
  assert(wp.reason.includes('8/240t')); assert(wp.reason.includes('no replacement 52 biomass'));
  assert.deepEqual(plain(wp.pos), plain(R.receiverApproach()));
  assert.deepEqual(completed(h), ['cinder_board']);
});
test('real growth survives later receiver death and reconciles after Cinder without a second feed', () => {
  const h = harness({ cinder: false }); h.feed(16);
  h.receiver.hull = 0; h.receiver.alive = false;
  h.bus.emit('entity:killed', { id: h.receiver.id, entity: h.receiver });
  assert(R.firstPlayerGardenGrowth(h.state), 'actual owner retains the historic receipt on terminal state');
  C.recordBeatStep(h.state, 'mission:completed', { storyTag: 'campaign47a:b2:cinder' }, 11);
  assert.equal(reconcile.call(h.missions), true);
  assert.deepEqual(completed(h), ['cinder_board', 'compost']);
  assert.equal(h.events.filter(e => e.name === 'economy:grantCredits').length, 0);
});
test('navigation names actual receiver and keeps approach outside mature mouth with honest run totals', () => {
  const h = harness(); const beat = D.CAMPAIGN_BEATS.find(b => b.beat === 2);
  const wp = waypoint.call(h.missions, beat);
  assert.equal(wp.sectorId, R.UNDERSTORY_RECEIVER.sectorId);
  assert(wp.label.includes(R.UNDERSTORY_RECEIVER.name));
  assert(wp.reason.includes('from Rook on the west side'));
  assert(wp.reason.includes('keep the load close and steer around loose clutter before the final approach'));
  assert.equal(wp.targetEntityId, null, 'location is not rebound to receiving hull centre');
  assert(Math.hypot(wp.pos.x - h.receiver.pos.x, wp.pos.z - h.receiver.pos.z) > 380 * E.UNDERSTORY_GARDENS.absorbPadding + 100);
  assert(wp.reason.includes('52 biomass')); assert(wp.reason.includes('0/240t'));
  assert(wp.reason.includes('13.4t feed')); assert(wp.reason.includes('13.6t contents')); assert(wp.reason.includes('No cargo is provided'));
  assert(wp.reason.includes('No pay before 240t')); assert(wp.reason.includes('12cr/t of actual run mass'));
  // Partial real feed does not cross a threshold; progress remains visible and no book credit.
  h.feed(8); const partial = waypoint.call(h.missions, beat);
  assert(partial.reason.includes('56.8 biomass')); assert(partial.reason.includes('8/240t'));
  assert(partial.reason.includes('232t remain')); assert.deepEqual(completed(h), ['cinder_board']);
});
console.log(`Compost story: ${passed} focused owner groups passed. Sparse core-only adapter: ${coreOnly}. No browser/native physics/full-save claim.`);
