// Terminal garden handoff against the current canonical wreck owner.
// Defaults are production paths. Explicit --*-source overrides are only sparse review ports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadClearanceGeometry } from './compost-clearance-geometry.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const auxRoots = process.argv.flatMap((arg, i, args) => arg === '--aux-root' ? [path.resolve(args[i + 1])] : []);
const clearanceGeometry = await loadClearanceGeometry({ root, auxRoots });
const arg = (flag, relative) => {
  const i = process.argv.indexOf(flag);
  return path.resolve(i < 0 ? path.join(root, relative) : process.argv[i + 1]);
};
const harnessPath = arg('--lifecycle-harness-source', 'scripts/test-aftermath-lifecycle.mjs');
const dataPath = arg('--understory-data-source', 'src/data/factions/understory.js');
const gardenData = await import(pathToFileURL(dataPath));
const coordinateCore = await import(pathToFileURL(arg('--coordinate-core-source', 'src/core/coordinates.js')));
const { UNDERSTORY_GARDENS } = gardenData;
const receiverText = fs.readFileSync(arg('--receiver-source', 'src/data/understoryReceiver.js'), 'utf8');
const radiusStart = receiverText.indexOf('export function gardenGrowthRadius(');
const radiusEnd = receiverText.indexOf('\nexport function', radiusStart + 1);
assert(radiusStart >= 0 && radiusEnd > radiusStart);
const radiusSource = receiverText.slice(radiusStart, radiusEnd).replace('export ', '');
const whole = fs.readFileSync(harnessPath, 'utf8');
const end = whole.indexOf('\nlet passed = 0;');
assert(end > 0, 'compose the current lifecycle fixture ports, not copied positive records');
const prefix = whole.slice(0, end)
  .replace("const root = fileURLToPath(new URL('../', import.meta.url));", `const root = ${JSON.stringify(root)};`)
  .replace('  const context = {', '  const context = { UNDERSTORY_GARDENS, gardenGrowthRadius,');
const { harness, routeContext, coordinateContext } = await import('data:text/javascript;base64,' + Buffer.from(
  `const UNDERSTORY_GARDENS = ${JSON.stringify(UNDERSTORY_GARDENS)};\nconst UNDERSTORY_GARDEN_STAGES = ${JSON.stringify(gardenData.UNDERSTORY_GARDEN_STAGES)};\n${radiusSource}\n` + prefix + '\nexport { harness, routeContext, coordinateContext };',
).toString('base64'));
coordinateContext.sectorLocalToGlobal = coordinateCore.sectorLocalToGlobal;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function setup() {
  const h = harness(), { marker, wreck } = h.createWreck();
  // This suite tests the material-owner seam. The garden integration suite runs spawnGarden.
  const garden = h.helpers.spawnEntity({ type: 'garden', factionId: 'faction_understory',
    pos: { ...wreck.pos }, radius: 90, hull: 100,
    data: { understoryGarden: true, gardenId: 'compost-material-probe' } });
  return { ...h, marker, wreck, garden };
}
test('read-only canonical preflight needs no garden and neither mutates nor retires its live body', () => {
  const h = setup(), before = JSON.stringify(h.owner.serialize());
  assert.equal(h.owner.gardenFeedMass(h.wreck), h.wreck.mass);
  assert.equal(h.owner.gardenFeedMass(h.wreck), h.wreck.mass);
  assert.equal(JSON.stringify(h.owner.serialize()), before);
  assert.equal(h.count('aftermathWreck:retired'), 0); assert.equal(h.wreck.alive, true);
});
test('one exact live hull retires before removal and remains absent through owner Continue twice', () => {
  const h = setup(); let witnessed = false;
  h.bus.on('aftermathWreck:retired', p => {
    assert.equal(p.reason, 'understory_garden'); assert.equal(p.markerId, h.marker.markerId);
    assert.equal(h.wreck.alive, true, 'retirement precedes physical removal');
    assert.equal(h.state.entities.get(h.wreck.id), h.wreck);
    assert.equal(h.state.aftermathWrecks.bySector[h.marker.sectorId].length, 0);
    witnessed = true;
  });
  assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), true);
  assert.equal(witnessed, true);
  assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), false, 'same body cannot be eaten twice');
  h.helpers.removeEntity(h.wreck.id);
  h.bus.emit('salvage:completed', { wreckId: h.wreck.id, markerId: h.marker.markerId });
  assert.equal(h.count('aftermathWreck:completed'), 0, 'late sale cannot settle the eaten marker');
  assert.equal(h.count('economy:grantCredits'), 0); assert.equal(h.count('faction:repDelta'), 0);
  assert.equal(h.restore().length, 0); assert.equal(h.restore().length, 0);
});
test('actual core remove/sweep does not resurrect terminally eaten material', () => {
  const h = setup(); h.state.freeIds = [];
  const corePath = arg('--core-source', 'src/core/coreSystem.js');
  const core = fs.readFileSync(corePath, 'utf8');
  const begin = core.indexOf('    const removeEntity = (id, opts) => {');
  const finish = core.indexOf('\n    // Multi-corpse removal', begin);
  assert(begin >= 0 && finish > begin);
  const port = { state: h.state }; vm.createContext(port);
  vm.runInContext(core.slice(begin, finish).replace('    const removeEntity =', 'this.removeEntity ='), port);
  h.helpers.removeEntity = port.removeEntity;
  assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), true);
  port.removeEntity(h.wreck.id, { reason: 'understory_garden' });
  assert.equal(h.wreck.alive, false);
  const start = core.indexOf('  _removeEntityAtIndex(i, state, opts) {');
  const end = core.indexOf('\n  // Batch twin', start); assert(start >= 0 && end > start);
  const ports = { clearEntityRuntime() {}, markDirty() {}, DIRTY: { MEMBERSHIP: 1 },
    removeEntityIndex() {}, worldLedgerHoldsId: () => false,
    clearRecycledEntityPointers() {}, markEntityIndexSourceSynced() {} };
  vm.createContext(ports);
  const sweep = vm.runInContext('({' + core.slice(start, end).trim().replace(/,$/, '') + '})._removeEntityAtIndex', ports);
  sweep.call({ bus: { queue: (name, payload) => h.bus.emit(name, payload) } },
    h.state.entityList.indexOf(h.wreck), h.state);
  assert.equal(h.state.entities.has(h.wreck.id), false);
  assert.equal(h.count('aftermathWreck:retired'), 1);
  assert.equal(h.count('aftermathWreck:completed'), 0);
  assert.equal(h.restore().length, 0);
  assert.equal(h.restore().length, 0);
});
test('actual garden owner consumes one actual canonical hull and preserves growth through core sweep/owner restore', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  h.state.rng = () => 0.25; h.state.freeIds = [];
  // Current source projections, with real data/coordinates and explicit minimal entity/bus ports.
  // This closes the scout's reproduced resurrection path; it is not a native full-save run.
  const strip = source => source.replace(/\r\n/g, '\n').replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/\bexport\s+(?=(const|function|class))/g, '').replace(/^export default .+;$/gm, '');
  const receiverPath = arg('--receiver-source', 'src/data/understoryReceiver.js');
  const gardenPath = arg('--garden-source', 'src/systems/faction_understory.js');
  const helperContext = { ...gardenData,
    sectorLocalToGlobalForSector: coordinateContext.sectorLocalToGlobalForSector };
  vm.createContext(helperContext);
  vm.runInContext(strip(fs.readFileSync(receiverPath, 'utf8'))
    + ';this.receiverDefinition = UNDERSTORY_RECEIVER;this.massEpsilon = UNDERSTORY_MASS_EPSILON;', helperContext, { filename: receiverPath });
  const context = { ...gardenData, ...clearanceGeometry, UNDERSTORY_RECEIVER: helperContext.receiverDefinition,
    UNDERSTORY_MASS_EPSILON: helperContext.massEpsilon,
    receiverPosition: helperContext.receiverPosition, firstPlayerGardenGrowth: helperContext.firstPlayerGardenGrowth,
    gardenGrowthRadius: helperContext.gardenGrowthRadius,
    normalizePlayerGardenGrowth: helperContext.normalizePlayerGardenGrowth,
    hasUnderstoryGardenVisualIdentity: helperContext.hasUnderstoryGardenVisualIdentity };
  vm.createContext(context);
  vm.runInContext(strip(fs.readFileSync(gardenPath, 'utf8'))
    + ';this.gardenOwner = understoryGardens;', context, { filename: gardenPath });
  const corePath = arg('--core-source', 'src/core/coreSystem.js');
  const core = fs.readFileSync(corePath, 'utf8');
  const begin = core.indexOf('    const removeEntity = (id, opts) => {');
  const finish = core.indexOf('\n    // Multi-corpse removal', begin);
  const corePorts = { state: h.state }; vm.createContext(corePorts);
  vm.runInContext(core.slice(begin, finish).replace('    const removeEntity =', 'this.removeEntity ='), corePorts);
  h.helpers.removeEntity = corePorts.removeEntity;
  const garden = context.spawnGarden(h.state, h.helpers, { x: wreck.pos.x, z: wreck.pos.z,
    biomass: 52, gardenId: 'probe-canonical-garden', sectorId: marker.sectorId });
  // The actual death producer used a 10t Wasp fixture. Keep its actual mass; two ordinary feeds
  // cross the real60-biomass stage floor without changing production thresholds.
  const second = h.createWreck().wreck; second.pos = { ...wreck.pos };
  for (const body of h.state.entityList) {
    if (body !== garden && body !== wreck && body !== second && body.alive !== false) body.pos = { x: -5000, z: -5000 };
  }
  const owner = Object.create(context.gardenOwner);
  owner.init({ state: h.state, bus: h.bus, helpers: h.helpers,
    registry: { get: name => name === 'aftermathWrecks' ? h.owner : null } });
  h.state.player.tether = { active: true, targetId: wreck.id };
  second.pos.x += 1000;
  owner.update(1 / 60, h.state);
  assert.equal(wreck.alive, false);
  assert.equal(garden.data.gardenBiomass, 58);
  assert.equal(garden.data.compostFedMass, 10);
  assert.equal(h.events.filter(e => e.name === 'understory:gardenFed' && e.payload.eatenId === wreck.id).length, 1);
  assert.equal(h.state.aftermathWrecks.bySector[marker.sectorId].some(row => row.markerId === marker.markerId), false);
  h.state.understory = {};
  second.pos = { ...garden.pos };
  h.state.player.tether = { active: true, targetId: second.id };
  owner.update(1 / 60, h.state);
  assert.equal(second.alive, false); assert.equal(garden.data.gardenStage, 2);
  assert.equal(garden.data.gardenBiomass, 64); assert.equal(garden.data.compostFedMass, 20);
  assert.equal(garden.data.gardenFirstPlayerGrowth.eatenId, second.id);
  assert.equal(h.count('economy:grantCredits'), 0); assert.equal(h.count('aftermathWreck:completed'), 0);
  const start = core.indexOf('  _removeEntityAtIndex(i, state, opts) {');
  const end = core.indexOf('\n  // Batch twin', start);
  const ports = { clearEntityRuntime() {}, markDirty() {}, DIRTY: { MEMBERSHIP: 1 }, removeEntityIndex() {},
    worldLedgerHoldsId: () => false, clearRecycledEntityPointers() {}, markEntityIndexSourceSynced() {} };
  vm.createContext(ports);
  const sweep = vm.runInContext('({' + core.slice(start, end).trim().replace(/,$/, '') + '})._removeEntityAtIndex', ports);
  for (const body of [wreck, second]) sweep.call({ bus: { queue: (name, payload) => h.bus.emit(name, payload) } },
    h.state.entityList.indexOf(body), h.state);
  const savedGarden = JSON.parse(JSON.stringify(garden));
  const snapshot = h.owner.serialize();
  h.state.entityList = [savedGarden]; h.state.entities = new Map([[savedGarden.id, savedGarden]]);
  h.state.understory = {};
  h.owner.deserialize(snapshot); h.bus.emit('save:loaded', {});
  assert.equal(h.state.entityList.some(e => e.alive && e.data?.markerId === marker.markerId), false);
  assert.equal(savedGarden.data.gardenBiomass, 64); assert.equal(savedGarden.data.compostFedMass, 20);
  assert.equal(savedGarden.data.gardenFirstPlayerGrowth.eatenId, second.id);
  owner.update(1 / 60, h.state);
  assert.equal(savedGarden.data.compostFedMass, 20); assert.equal(h.count('economy:grantCredits'), 0);
});
test('a completed sale cannot subsequently feed the garden', () => {
  const h = setup();
  h.bus.emit('salvage:completed', { wreckId: h.wreck.id, markerId: h.marker.markerId });
  assert.equal(h.count('aftermathWreck:completed'), 1);
  assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), false);
  assert.equal(h.count('aftermathWreck:retired'), 0);
});
test('malformed duplicate durable rows retire with the exact canonical body once', () => {
  const h = setup();
  h.state.aftermathWrecks.bySector.foreign = [{ ...h.marker, sectorId: 'foreign' }];
  h.state.aftermathWrecks.bySector[h.marker.sectorId].push({ ...h.marker });
  assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), true);
  assert.equal(Object.values(h.state.aftermathWrecks.bySector).flat().length, 0);
  assert.equal(h.count('aftermathWreck:retired'), 1);
});
for (const key of ['missionId', 'missionPinned', 'missionTag', 'wreckMissionId', 'runtimeOwner',
  'worldRecordId', 'identityKey', 'durable', 'uniqueWreckId', 'authoredWreckId', 'worldSiteStructural',
  'poiId', 'authored', 'authoredCharacter', 'storyPropKind', 'contractClaimSiteOf', 'salvorClaimedBy',
  'recoveryEncounterId', 'survivorPod', 'interventionId', 'onboarding', 'worldOneOff', 'oneOffId',
  'berthConsign', 'rookClaimed', 'arenaShardOf', 'reefMineId', 'reefMine',
  'physicalCustodyOnly', 'orchardId', 'alienSiteId', 'fieldId', 'resourceBodyId', 'worldSiteId',
  'worldSitePayloadId', 'worldObjectId', 'siteId', 'activityObjectSlotId', 'claimId', 'claimedBy',
  'custodyOwner', 'freightCustodyPod', 'freightCustody', 'caughtByNet', 'claimable', 'protected',
  'anchored', 'living', 'playerOwned', 'persistent', 'originId', 'destinationId', 'originStationId',
  'destStationId', 'cargoIdentity', 'ownership']) {
  test(`protected ${key} keeps its body and canonical owner`, () => {
    const h = setup(); h.wreck.data[key] = true;
    assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), false);
    assert.equal(h.wreck.alive, true); assert.equal(h.count('aftermathWreck:retired'), 0);
    assert.equal(h.state.aftermathWrecks.bySector[h.marker.sectorId].length, 1);
  });
}
for (const key of ['persistent', 'durable', 'missionPinned', 'invuln', 'protected']) {
  test(`body flag ${key} cannot be bypassed by a canonical marker`, () => {
    const h = setup(); h.wreck.flags = { [key]: true };
    assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), false);
  });
}
for (const [name, mutate] of [
  ['pinned canonical record', h => { h.marker.pinWreck = true; }],
  ['foreign persistence owner', h => { h.wreck.data.persistenceOwner = 'foreign'; }],
  ['foreign body owner', h => { h.wreck.ownerId = 101; }],
  ['foreign data owner', h => { h.wreck.data.ownerId = 101; }],
  ['wrong marker provenance', h => { h.wreck.data.provenance.markerId = 'foreign'; }],
  ['wrong provenance sector', h => { h.wreck.data.provenance.sectorId = 'foreign'; }],
  ['dead hull', h => { h.wreck.alive = false; }],
  ['zero integrity', h => { h.wreck.hull = 0; }],
  ['invalid integrity', h => { h.wreck.hull = NaN; }],
  ['invalid mass', h => { h.wreck.mass = Infinity; }],
  ['zero mass', h => { h.wreck.mass = 0; }],
  ['outside mouth', h => { h.wreck.pos.x += h.garden.radius * UNDERSTORY_GARDENS.absorbPadding + h.wreck.radius + 1; }],
  ['invalid pose', h => { h.wreck.pos.x = NaN; }],
  ['invalid intake radius', h => { h.wreck.radius = Infinity; }],
  ['dead receiver', h => { h.garden.alive = false; }],
  ['lethal receiver integrity', h => { h.garden.hull = 0; }],
  ['retired receiver', h => { h.garden.data.gardenRetired = true; }],
  ['foreign receiver', h => { h.garden.factionId = 'faction_dmc'; }],
]) test(`${name} rejects without terminal receipt`, () => {
  const h = setup(); mutate(h); assert.equal(h.owner.consumeByGarden(h.wreck, h.garden), false);
  assert.equal(h.count('aftermathWreck:retired'), 0);
});
test('cloned object and recycled numeric id are not the bound lifetime', () => {
  const h = setup();
  assert.equal(h.owner.consumeByGarden({ ...h.wreck }, h.garden), false);
  const replacement = { ...h.wreck, data: { ...h.wreck.data } };
  h.state.entities.set(h.wreck.id, replacement);
  assert.equal(h.owner.consumeByGarden(replacement, h.garden), false);
  assert.equal(h.count('aftermathWreck:retired'), 0);
});
for (const bucket of ['active', '_swarmParkedActive', 'cinderRetry']) {
  test(`unresolved ${bucket} Cinder material is protected until genuine completion`, () => {
    const h = harness();
    const mission = { id: 'cinder-compost', storyTag: 'campaign47a:b2:cinder', status: 'active',
      completedTargetSlots: [], params: { cinderRouteVersion: 1, cinderTargetOwnerId: 'cinder-compost',
        cinderIssuedSlots: [], cinderMarkedWrecks: [] } };
    h.state.missions = { active: [mission] };
    h.bus.on('aftermathWreck:recorded', payload => routeContext.observeMarker({ state: h.state }, payload));
    const { marker, wreck } = h.createWreck({ missionId: mission.id, missionTargetSlot: 0 });
    if (bucket !== 'active') {
      h.state.missions.active = [];
      h.state.missions[bucket] = bucket === 'cinderRetry' ? mission : [mission];
      if (bucket === 'cinderRetry') mission.status = 'suspended';
    }
    assert.equal(mission.params.cinderMarkedWrecks[0].markerId, marker.markerId);
    const garden = h.helpers.spawnEntity({ type: 'garden', factionId: 'faction_understory',
      pos: { ...wreck.pos }, radius: 90, hull: 100, data: { understoryGarden: true, gardenId: 'probe' } });
    assert.equal(h.owner.gardenFeedMass(wreck), null);
    assert.equal(h.owner.consumeByGarden(wreck, garden), false);
    assert.equal(h.count('aftermathWreck:retired'), 0);
    assert.equal(wreck.alive, true);
    mission.status = 'completed';
    assert.equal(h.owner.gardenFeedMass(wreck), wreck.mass);
    assert.equal(h.owner.consumeByGarden(wreck, garden), true, 'same unsold survivor is released, not recreated');
    assert.equal(h.count('aftermathWreck:retired'), 1);
  });
}
test('generic disappearance is not proof of digestion', () => {
  const h = setup();
  h.bus.emit('entity:destroyed', { id: h.wreck.id, type: 'wreck', entity: h.wreck });
  assert.equal(h.state.aftermathWrecks.bySector[h.marker.sectorId].length, 1);
  assert.equal(h.count('aftermathWreck:retired'), 0);
});
console.log(`Compost canonical material handoff: ${passed}/${passed} passed. Owner-seam composition; not native full-save/physics.`);
