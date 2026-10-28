// Public Rook owner modules plus the CURRENT aftermath retirement and renderer consumers.
// Sparse overlays must explicitly name pinned auxiliary roots; defaults read this repo.
// Geometry constructors are recording adapters, not a browser/native-render claim.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.ROOK_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url)));
const dataRoot = path.resolve(process.env.ROOK_DATA_SOURCE_ROOT || root);
const renderRoot = path.resolve(process.env.ROOK_RENDER_SOURCE_ROOT || root);
const read = (name, base = root) => fs.readFileSync(path.join(base, name), 'utf8');
const context = vm.createContext({ console });
const modules = new Map();
const add = (name, source) => modules.set(name, new vm.SourceTextModule(source, { identifier: name, context }));
add('src/systems/rookBooth.js', read('src/systems/rookBooth.js'));
add('src/characters/rookRules.js', read('src/characters/rookRules.js'));
add('src/data/rook.js', read('src/data/rook.js', dataRoot));
add('src/data/sectorCoordinates.js', read('src/data/sectorCoordinates.js', dataRoot));
add('src/core/coordinates.js', read('src/core/coordinates.js', renderRoot));
// Charon is a canonical core-sector origin, not a frontier-region fixture.
add('src/data/frontierRegions/index.js', 'export const FRONTIER_ORIGINS = {}, FRONTIER_SECTOR_IDS = [];');
add('src/core/sectorEnterDefer.js', 'export function deferSectorEnterMaterialization() { return false; }');
add('src/world/activityClassification.js', read('src/world/activityClassification.js', renderRoot));

function method(source, name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `Current owner is missing ${name}`);
  const end = source.indexOf('\n  },', start);
  assert.ok(end > start, `Current owner method boundary changed: ${name}`);
  return source.slice(start, end + 5);
}
function fn(source, name, exported = false) {
  const prefix = `${exported ? 'export ' : ''}function ${name}(`;
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, `Current owner is missing ${name}`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `Current owner function boundary changed: ${name}`);
  return source.slice(start, end + 2).replace(/^export /, '');
}
const aftermathRoot = path.resolve(process.env.ROOK_AFTERMATH_SOURCE_ROOT || root);
const aftermathSource = read('src/systems/aftermathWrecks.js', aftermathRoot);
add('src/systems/aftermathRetirementProbe.js', `
const STATE_VERSION = 3;
${['seedOf', 'entityFor', 'isBoundWreck'].map(name => fn(aftermathSource, name)).join('\n')}
${fn(aftermathSource, 'ensureAftermathState', true)}
export const ops = {
${['_resolveBoundWreck', '_markerById', '_bindLiveMarker', '_completeByEntity'].map(name => method(aftermathSource, name)).join('\n')}
};`);
const cullSource = read('src/render/visualCullRadius.js', renderRoot);
add('src/render/rookCullProbe.js', `
import { entityPresenceRadius } from '../world/activityClassification.js';
// No mesh is passed in this beacon-envelope test; neither visual-bound branch runs.
const motionTravelPadFor = () => 0;
const drawnCullRadiusForMesh = () => { throw Error('Unexpected authored mesh branch'); };
export ${fn(cullSource, 'entityVisualCullRadius', true)}
`);
const resolve = (name, ref) => {
  const id = path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier), name));
  const mod = modules.get(id);
  assert.ok(mod, `Undeclared adapter: ${id}`);
  return mod;
};
for (const mod of modules.values()) if (mod.status === 'unlinked') await mod.link(resolve);
for (const mod of modules.values()) if (mod.status === 'linked') await mod.evaluate();
const { createRookBooth, rookBoothSpec } = modules.get('src/systems/rookBooth.js').namespace;
const rules = modules.get('src/characters/rookRules.js').namespace;
const { ROOK_BOOTH } = modules.get('src/data/rook.js').namespace;
const retirement = modules.get('src/systems/aftermathRetirementProbe.js').namespace.ops;
let count = 0;
const test = (name, check) => { check(); console.log(`PASS ${++count} ${name}`); };
const plain = value => JSON.parse(JSON.stringify(value));
const pad = { x: 9232, z: 28132 };

function harness() {
  const state = { run: { kind: 'adventure' }, world: { currentSectorId: ROOK_BOOTH.sectorId },
    story: { flags: {} }, entities: new Map(), entityList: [], aftermathWrecks: { bySector: {} } };
  const events = [], handlers = new Map();
  const bus = {
    on(name, handler) { const row = handlers.get(name) || []; row.push(handler); handlers.set(name, row); return () => handlers.set(name, row.filter(h => h !== handler)); },
    emit(name, payload) { events.push([name, payload]); for (const h of handlers.get(name) || []) h(payload); },
  };
  let nextId = 10;
  const helpers = {
    spawnEntity(spec) { const e = { ...structuredClone(spec), id: nextId++, alive: true }; state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; state.entities.delete(id); events.push(['remove', { id }]); },
  };
  const owner = { ...retirement, state, bus, _spawned: new Map(), _retireMarkerShard() {} };
  bus.on('salvage:completed', p => owner._completeByEntity(p));
  const booth = createRookBooth();
  const ctx = { state, bus, helpers, registry: { get: name => name === 'aftermathWrecks' ? owner : null } };
  booth.init(ctx);
  const spawn = (data = {}, pos = pad, vel = { x: 0, z: 0 }) => helpers.spawnEntity({
    type: 'wreck', pos: { ...pos }, vel: { ...vel }, radius: 9, mass: 1800, hull: 1, data,
  });
  const bound = (id = 'aft-real') => {
    const e = spawn({ persistenceOwner: 'aftermathWrecks', markerId: id,
      provenance: { markerId: id, source: 'battle-aftermath', sectorId: ROOK_BOOTH.sectorId } });
    const marker = { markerId: id, sectorId: ROOK_BOOTH.sectorId, source: 'entity:killed', victimId: 7 };
    (state.aftermathWrecks.bySector[ROOK_BOOTH.sectorId] ||= []).push(marker);
    assert.equal(owner._bindLiveMarker(marker, e), true);
    return e;
  };
  return { state, events, bus, helpers, owner, booth, ctx, spawn, bound };
}

test('authored local data transforms once to the exact global pad', () => {
  assert.deepEqual(plain(ROOK_BOOTH.pad), { x: 1040, z: -540 });
  assert.deepEqual(plain(rules.rookPadPosition()), pad);
  assert.deepEqual(plain(rookBoothSpec().pos), pad);
  assert.equal(rules.rookDeliveryCheck({ pos: pad, vel: { x: 0, z: 0 } }).arrived, true);
  assert.equal(rules.rookDeliveryCheck({ pos: ROOK_BOOTH.pad, vel: { x: 0, z: 0 } }).arrived, false);
});
test('circle boundary and resting speed are physical, not swept/flyby credit', () => {
  const e = { pos: { x: pad.x + 100, z: pad.z }, vel: { x: 8, z: 0 } };
  assert.equal(rules.rookDeliveryCheck(e).arrived, true);
  e.pos.x += 0.001; assert.equal(rules.rookDeliveryCheck(e).arrived, false);
  e.pos = pad; e.vel.x = 8.001; assert.equal(rules.rookDeliveryCheck(e).arrived, false);
  e.vel = { x: NaN, z: 0 }; assert.equal(rules.rookDeliveryCheck(e).arrived, false);
});
test('ordinary unowned debris still sells once through economy intent only', () => {
  const h = harness(), e = h.spawn();
  h.booth.update(); h.booth.update();
  assert.equal(e.data.rookClaimed, true);
  assert.equal(h.events.filter(([k]) => k === 'economy:grantCredits').length, 1);
  assert.equal(h.events.find(([k]) => k === 'economy:grantCredits')[1].amount, 324);
  assert.equal(h.state.player, undefined);
});
test('real owner binding retires before removal; receipt proves exact claimed live hull', () => {
  const h = harness(), e = h.bound();
  h.bus.on('rookWreck:delivered', p => {
    assert.equal(e.data.rookClaimed, true);
    assert.equal(h.owner._resolveBoundWreck(p.markerId), e);
    assert.equal(h.owner._markerById(p.markerId).victimId, 7);
    assert.equal(p.entityId, e.id); assert.equal(p.source, 'rook:booth');
    assert.equal(p.sectorId, ROOK_BOOTH.sectorId); assert.deepEqual(plain(p.pos), pad);
    assert.equal(p.speed, 0); assert.deepEqual(plain(p.vel), { x: 0, z: 0 });
  });
  h.booth.update(); h.booth.update();
  assert.equal(h.owner._markerById('aft-real'), null);
  assert.equal(h.owner._spawned.size, 0);
  assert.equal(h.state.entities.has(e.id), false);
  assert.deepEqual(h.events.filter(([k]) => ['economy:grantCredits', 'rookWreck:delivered', 'salvage:completed', 'aftermathWreck:completed', 'remove'].includes(k)).map(([k]) => k),
    ['economy:grantCredits', 'rookWreck:delivered', 'salvage:completed', 'aftermathWreck:completed', 'remove']);
});
test('forged, orphaned, mismatched and duplicated aftermath bodies cannot mint money', () => {
  for (const variant of ['missing-marker', 'wrong-provenance', 'duplicate-body', 'missing-owner', 'retired']) {
    const h = harness(), e = h.bound();
    if (variant === 'missing-marker') h.state.aftermathWrecks.bySector = {};
    if (variant === 'wrong-provenance') e.data.provenance.markerId = 'foreign';
    if (variant === 'missing-owner') h.booth.registry = null;
    if (variant === 'retired') { h.owner._completeByEntity({ markerId: 'aft-real', wreckId: e.id }); }
    if (variant === 'duplicate-body') { const copy = h.spawn(structuredClone(e.data)); e.pos = { x: 0, z: 0 }; assert.equal(h.booth._canRetireWreck(copy), false); }
    h.booth.update();
    assert.equal(h.events.filter(([k]) => k === 'economy:grantCredits').length, 0, variant);
  }
});
test('sold marker replay and save/enter/re-init do not repay or duplicate the beacon', () => {
  const h = harness(), e = h.bound(); h.booth.update();
  h.spawn({ ...e.data, rookClaimed: false, provenance: { ...e.data.provenance } });
  h.bus.emit('salvage:completed', { markerId: 'aft-real', wreckId: e.id });
  for (const event of ['save:loaded', 'sector:enter', 'save:loaded']) h.bus.emit(event, {});
  h.booth.init(h.ctx); h.booth.update();
  assert.equal(h.events.filter(([k]) => k === 'economy:grantCredits').length, 1);
  assert.equal(h.state.entityList.filter(e => e.alive && e.data?.rookBooth).length, 1);
  assert.equal(h.helpers.sectorCookProviders.length, 1);
});
test('legacy local mast is replaced once at the canonical pad', () => {
  const h = harness(); const old = h.booth._beacon();
  old.pos = { ...ROOK_BOOTH.pad }; old.data.circuitMark = false;
  h.bus.emit('save:loaded', {}); h.bus.emit('save:loaded', {});
  assert.equal(old.alive, false);
  assert.deepEqual(plain(h.booth._beacon().pos), pad);
  assert.equal(h.state.entityList.filter(e => e.alive && e.data?.rookBooth).length, 1);
});
test('wrong sector, raw-local pad, fast pass and foreign-owned material do not sell', () => {
  for (const change of [h => { h.state.world.currentSectorId = 'sector_ceres_belt'; }, h => { h.e.pos = { ...ROOK_BOOTH.pad }; }, h => { h.e.vel.x = 10; },
    ...['missionId', 'missionTag', 'missionPinned', 'worldRecordId', 'uniqueWreckId', 'salvorClaimedBy', 'runtimeOwner', 'durable'].map(key => h => { h.e.data[key] = true; }),
    h => { h.e.data.persistenceOwner = 'anotherStory'; }, h => { h.e.flags = { missionPinned: true }; }]) {
    const h = harness(); h.e = h.bound(); change(h); h.booth.update();
    assert.equal(h.events.filter(([k]) => k === 'economy:grantCredits').length, 0);
  }
});

test('actual visualFactory draws an open 100-WU ring and actual cull owner sees it', () => {
  class Node { constructor(geometry = null, material = null) { this.geometry = geometry; this.material = material; this.children = []; this.userData = {}; this.rotation = {}; this.position = { set() {} }; this.scale = { setScalar() {} }; } add(child) { this.children.push(child); } }
  class Geometry { constructor(...args) { this.args = args; } }
  class Material { constructor(data) { Object.assign(this, data); } clone() { return new Material(this); } }
  const THREE = { Group: Node, Mesh: Node, RingGeometry: Geometry, CylinderGeometry: Geometry, BoxGeometry: Geometry, SphereGeometry: Geometry, MeshStandardMaterial: Material, DoubleSide: 2 };
  const factory = read('src/render/visualFactory.js', renderRoot);
  const build = new Function('THREE', 'getGeometry', 'getMaterial', 'emissiveMaterial', 'stampSharedMaterialRole', 'SHARED_MATERIAL_ROLE', 'hashId', 'animateStation',
    `${fn(factory, 'buildCircuitZone')}\n${fn(factory, 'buildBeacon')}\nreturn buildBeacon;`)(THREE, (key, create) => create(), (key, create) => create(), () => new Material({}), m => m, { HULL: 'hull' }, () => 0, () => {});
  const spec = rookBoothSpec(), visual = build(spec), ring = visual.children.find(c => c.name === 'circuit-zone');
  assert.ok(ring); assert.deepEqual(ring.geometry.args, [95.5, 100, 72]);
  assert.equal(ring.rotation.x, -Math.PI / 2); assert.equal(visual.userData.visualLanguage, 'circuit-zone');
  assert.equal(spec.physicsBody, false); assert.equal(spec.collides, false);
  const cull = modules.get('src/render/rookCullProbe.js').namespace.entityVisualCullRadius;
  assert.equal(cull(spec), 100);
  const absent = structuredClone(spec); delete absent.data.visualRadius;
  assert.equal(cull(absent), 12, 'Negative control proves radius metadata reaches the actual consumer');
  delete absent.data.circuitMark;
  assert.equal(build(absent).children.some(c => c.name === 'circuit-zone'), false, 'Negative control proves circuitMark is required');
});
console.log(`Rook pad: ${count} focused public-owner checks passed. No browser/native/physics-playtest claim.`);
