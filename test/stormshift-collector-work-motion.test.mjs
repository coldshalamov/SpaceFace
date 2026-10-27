import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadMotionBank, bindInstanceMotion, attachAuthoredMotionDriver } from '../src/render/authoredMotion.js';
import { evaluateMotionClip } from '../src/contracts/motionBank.js';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { ANVIL_WORK, anvilBandExitTarget, anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { captureEntityRecord, spawnSpecFromRecord, RECORD_KIND } from '../src/world/worldRecords.js';
import { ANVIL_ORCHARD, createOrchardRecord } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec } from '../src/data/anvilOrchardBody.js';
import { ANVIL_ORCHARD_GUST_PROFILE, anvilOrchardGustGeometry } from '../src/data/environmentalMachinery.js';
import { orchardWorkerWeather } from '../src/world/anvilOrchardWorkWeather.js';
import { productionContinueFixture } from './fixtures/production-continue-finalizer.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const pkg = JSON.parse(read('assets/ships/release/render-packages/stormshift-collector/render-package.json'));
const bytes = read(pkg.runtime.url);
const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const motion = await loadMotionBank(pkg.runtime.motionBank, async () => ({ ok: true,
  arrayBuffer: async () => read(pkg.runtime.motionBank.uri) }));
const fans = motion.bank.bindings.filter(b => b.id.startsWith('stormshift_fan_'));
const cheeks = motion.bank.bindings.filter(b => b.id.startsWith('stormshift_cheek_'));
const snapshots = [];
function capture(label, m, entity, time) {
  snapshots.push({ label, phase: entity.data.itinerary.phase, simTime: time,
    nodes: motion.bank.bindings.map(b => { const o = m.root.getObjectByName(b.node);
      return { name: b.node, translation: o.position.toArray(), rotation: o.quaternion.toArray(), scale: o.scale.toArray() }; }) });
}
test.after(() => { if (process.env.STORMSHIFT_POSE_SNAPSHOTS) writeFileSync(process.env.STORMSHIFT_POSE_SNAPSHOTS,
  JSON.stringify({ label: 'OFFLINE production controller poses on the actual released hierarchy. Work-owner fixtures, not live gameplay or visual acceptance.', snapshots }, null, 2)); });

// Exact exported hierarchy/transforms, retaining real mesh presence and LOD visibility.
// GPU materials are not exercised; this is production motion-owner proof, not a game frame.
function mount(entity) {
  const root = new THREE.Group();
  const nodes = glb.nodes.map(n => {
    const o = n.mesh == null ? new THREE.Group() : new THREE.Mesh(new THREE.BufferGeometry());
    o.name = n.name || '';
    if (n.matrix) o.applyMatrix4(new THREE.Matrix4().fromArray(n.matrix));
    else {
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
    }
    o.visible = !/^(LOD[12]_|COLLISION_)/.test(o.name);
    return o;
  });
  glb.nodes.forEach((n, i) => { for (const child of n.children || []) nodes[i].add(nodes[child]); });
  for (const i of glb.scenes[glb.scene || 0].nodes) root.add(nodes[i]);
  const controller = bindInstanceMotion(root, motion, { sourceAssetId: 'SF_STORMSHIFT_COLLECTOR_V01' });
  assert.ok(controller);
  const detach = attachAuthoredMotionDriver(root, entity, [controller]);
  let dispatches = 0;
  const setState = controller.setState;
  controller.setState = function (options) { dispatches++; return setState.call(this, options); };
  return { root, controller, detach, dispatches: () => dispatches,
    update(e, time, a11y) { root.userData.updateAuthoredMotion(e, time, a11y); },
    angles() { return fans.map(b => root.getObjectByName(b.node).quaternion.angleTo(new THREE.Quaternion(...b.restPose.rotation))); },
    assertCheeks() { for (const b of cheeks) {
      assert.deepEqual(root.getObjectByName(b.node).position.toArray(), b.restPose.translation);
      assert.deepEqual(root.getObjectByName(b.node).quaternion.toArray(), b.restPose.rotation);
    } },
  };
}
function boot() {
  const sim = createSimulation({ seed: 424214, systems: [{ ...world, update() {} }, { ...traffic, update() {} }] });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = PLANET_SITE.sectorId;
  const owner = sim.registry.get('traffic');
  const collector = owner.ensureAnvilWorker(sim.state, sim.spawn, { x: 12000, z: 6000 });
  return { sim, owner, collector };
}
function assertPose(m, deployed) {
  assert.equal(m.angles().length, 6);
  assert.ok(m.angles().every(angle => deployed ? angle < 1e-7 : angle > .1), `six fans ${deployed ? 'deployed' : 'stowed'}: ${m.angles()}`);
  m.assertCheeks();
}

test('original work owner transitions automatically deploy and stow actual released fans', () => {
  const t = boot(), m = mount(t.collector);
  try {
    const e = t.collector, route = e.data.itinerary;
    assert.equal(route.phase, 'outbound');
    m.update(e, 10); assertPose(m, false); capture('outbound-stowed', m, e, 10);
    // Deliberate initial arrival fixture, not a native navigation claim. Only the
    // existing work owner changes phase and the real harvest owner accepts cargo.
    e.pos = { x: route.center.x + ANVIL_WORK.radius, z: route.center.z }; e.vel = { x: 0, z: 0 };
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(route.phase, 'collect');
    const before = JSON.stringify(e.data);
    m.update(e, 11); assertPose(m, false);
    m.update(e, 19); assertPose(m, true); capture('collect-deployed', m, e, 19);
    assert.equal(JSON.stringify(e.data), before, 'presentation cannot change itinerary, cargo or collision');
    assert.equal(t.owner.acceptAnvilHarvest(e, { siteId: PLANET_SITE.id,
      commodityId: PLANET_SITE.harvest.commodityShallow, qty: ANVIL_WORK.capacity }), ANVIL_WORK.capacity);
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(route.phase, 'clear_band');
    m.update(e, 20); assertPose(m, true);
    m.update(e, 28); assertPose(m, false);
    assert.equal(m.dispatches(), 3, 'one admission plus two actual work-state edges');
  } finally { m.detach(); t.sim.dispose(); }
});

test('interrupted work reverses existing curves immediately without reopening or a fan snap', () => {
  const t = boot(), e = t.collector, m = mount(e);
  try {
    m.update(e, 0);
    e.pos = { x: e.data.itinerary.center.x + ANVIL_WORK.radius, z: e.data.itinerary.center.z }; e.vel = { x: 0, z: 0 };
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(e.data.itinerary.phase, 'collect');
    m.update(e, 1); m.update(e, 1.4);
    const before = m.angles();
    e.hull = e.hullMax * .4; // actual work owner's damage-abort input
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(e.data.itinerary.phase, 'clear_band');
    m.update(e, 1.4);
    m.angles().forEach((angle, i) => assert.ok(Math.abs(angle - before[i]) < 1e-7));
    m.assertCheeks();
    m.update(e, 1.5);
    m.angles().forEach((angle, i) => assert.ok(angle >= before[i] - 1e-7, 'retreat cannot reopen a fan'));
    m.update(e, 10); assertPose(m, false);
  } finally { m.detach(); t.sim.dispose(); }
});

for (const phase of ['collect', 'return', 'berthed']) test(`durable ${phase} rematerialization adopts current pose without replaying an invented phase start`, () => {
  const t = boot(), e = t.collector;
  e.data.itinerary.phase = phase; // saved-state fixture; not work-transition proof
  const record = captureEntityRecord(e, { sectorId: PLANET_SITE.sectorId, kind: RECORD_KIND.CONVOY, tick: 720 });
  const restored = { ...spawnSpecFromRecord(JSON.parse(JSON.stringify(record))), id: e.id, alive: true };
  const m = mount(e);
  try {
    m.update(e, 12); assertPose(m, phase === 'collect');
    const before = JSON.stringify(restored);
    m.update(restored, 400); assertPose(m, phase === 'collect');
    assert.equal(JSON.stringify(restored), before);
    assert.equal(m.dispatches(), 2, 'same-id replacement gets one fresh admission, not the stale latch');
    const rebuilt = mount(restored);
    try { rebuilt.update(restored, 400); assertPose(rebuilt, phase === 'collect'); }
    finally { rebuilt.detach(); }
  } finally { m.detach(); t.sim.dispose(); }
});

test('full production Continue restores the original worker before current-state motion admission', { timeout: 20000 }, async () => {
  const h = await productionContinueFixture();
  let m;
  try {
    // The standard fixture initially shelves this distant worker. Reposition only
    // the test observer through the world owner, then let ordinary residency ticks
    // promote the original worker before saving; do not fabricate a live carrier.
    const recordId = anvilWorkerRecordId(h.state, 'collector');
    const carrier = [...h.state.entityList, ...(h.state.world.farActors?.rows || [])]
      .find(e => e.alive !== false && e.data?.worldRecordId === recordId);
    assert.ok(carrier);
    h.registry.get('world').relocatePlayerInSector({ x: carrier.pos.x + 100, z: carrier.pos.z + 100 }, { reason: 'test:collector-motion-admission' });
    for (let i = 0; i < 120 && !h.state.entityList.some(e => e.alive !== false && e.data?.worldRecordId === recordId); i++) h.runtime.step();
    const envelope = h.saves.serialize('collector-motion-continue');
    assert.equal(await h.load(envelope), true); await h.finalization();
    const e = h.state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === anvilWorkerRecordId(h.state, 'collector'));
    assert.ok(e, 'original collector is present after real save load/native adoption/finalizer');
    m = mount(e); m.update(e, h.state.simTime);
    assertPose(m, e.data.itinerary.phase === 'collect');
    assert.equal(m.dispatches(), 1); capture('production-Continue-admitted', m, e, h.state.simTime);
  } finally { m?.detach(); h.close(); }
});

test('steady phase does not re-dispatch, grow active clips or write sim state; detach releases callback', () => {
  const t = boot(), e = t.collector, m = mount(e);
  try {
    m.update(e, 1);
    const data = JSON.stringify(e.data), clips = m.controller.activeClipNames();
    for (let i = 0; i < 10000; i++) m.update(e, 1 + i / 60);
    assert.equal(m.dispatches(), 1);
    assert.deepEqual(m.controller.activeClipNames(), clips);
    assert.equal(JSON.stringify(e.data), data); assertPose(m, false);
    m.detach(); assert.equal(m.root.userData.updateAuthoredMotion, undefined);
  } finally { m.detach(); t.sim.dispose(); }
});

test('receiver and unrelated bank are not commandeered by collector presentation', () => {
  const t = boot();
  const receiver = t.sim.state.entityList.find(e => e.data?.itinerary?.role === 'receiver');
  const m = mount(receiver);
  try { m.update(receiver, 10); assert.equal(m.dispatches(), 0); }
  finally { m.detach(); t.sim.dispose(); }
});

// Interruption logic relies on the shipped pair, not arbitrary future bank curves.
test('pinned deploy and stow are exact time reverses across every bound channel', () => {
  const stow = motion.bank.clips.find(c => c.name === 'stormshift_stow');
  const deploy = motion.bank.clips.find(c => c.name === 'stormshift_deploy');
  assert.equal(stow.durationS, deploy.durationS);
  for (let i = 0; i <= 240; i++) {
    const at = stow.durationS * i / 240;
    const a = evaluateMotionClip(motion.bank, stow, at);
    const b = evaluateMotionClip(motion.bank, deploy, stow.durationS - at);
    for (const [group, pose] of a) for (const key of ['rotation', 'translation']) {
      if (!pose[key]) continue;
      pose[key].forEach((v, index) => assert.ok(Math.abs(v - b.get(group)[key][index]) < 1e-6,
        `${group} ${key} at ${at} must reverse without a teleport`));
    }
  }
});


test('forecast retreat folds immediately through the original weather and work owners', () => {
  const t = boot(), e = t.collector, m = mount(e);
  try {
    e.pos = { x: e.data.itinerary.center.x + ANVIL_WORK.radius, z: e.data.itinerary.center.z };
    e.vel = { x: 0, z: 0 };
    const frame = t.sim.spawn({ type: 'wreck', pos: {
      x: e.pos.x - 180 - ANVIL_ORCHARD_GUST_PROFILE.localCenter.x,
      z: e.pos.z - ANVIL_ORCHARD_GUST_PROFILE.localCenter.z }, rot: 0, radius: G.radius,
      hull: 300, flags: { persistent: true }, physicsBody: orchardFrameBodySpec(),
      data: { orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame', worldRecordId: G.worldRecordId,
        placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId,
        authoredPayloadAssetId: G.assetId, masslineTetherable: false } });
    t.sim.state.sites ||= {};
    t.sim.state.sites.anvilOrchard = createOrchardRecord(0);
    t.sim.state.tick = 0;
    m.update(e, 0);
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(e.data.itinerary.phase, 'collect');
    m.update(e, 1); m.update(e, 3);
    capture('collect-deploying-before-forecast', m, e, 3);
    // Authored clock advances to its real forecast. No direct work-phase write.
    t.sim.state.tick = 600;
    assert.equal(orchardWorkerWeather(t.sim.state, e, e.pos)?.phase, 'forecast');
    assert.ok(anvilOrchardGustGeometry(frame));
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(e.data.itinerary.phase, 'clear_band');
    const angles = m.angles(); m.update(e, 3); m.update(e, 3.5);
    m.angles().forEach((angle, i) => assert.ok(angle >= angles[i] - 1e-7));
    capture('forecast-retreat-folding', m, e, 3.5);
    m.update(e, 12); assertPose(m, false);
    // Near home, clear-band ends at the inner forecourt, not the tender's occupied
    // berth center. Keep this an explicit arrival fixture, not a navigation proof.
    const exit = anvilBandExitTarget(e);
    assert.ok(exit);
    assert.ok(Math.abs(Math.hypot(exit.x - e.data.itinerary.center.x,
      exit.z - e.data.itinerary.center.z) - (ANVIL_WORK.berthRadius - 160)) < 1e-8);
    e.pos = { x: e.data.itinerary.center.x + ANVIL_WORK.berthRadius, z: e.data.itinerary.center.z };
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(e.data.itinerary.phase, 'clear_band', 'the occupied berth center is not forecourt arrival');
    e.pos = { ...exit };
    t.owner._stepAnvilWork(1 / 60, t.sim.state);
    assert.equal(e.data.itinerary.phase, 'return');
    m.update(e, 13); assertPose(m, false); capture('return-stowed', m, e, 13);
    assert.equal(m.dispatches(), 3, 'clear-band to return retains the same stowed target');
  } finally { m.detach(); t.sim.dispose(); }
});

test('rapid reversals, LOD visibility and same-object life replacement retain truthful pose', () => {
  const t = boot(), e = t.collector, m = mount(e);
  try {
    m.update(e, 0);
    e.data.itinerary.phase = 'collect'; m.update(e, 1); m.update(e, 3);
    const before = m.angles();
    e.data.itinerary.phase = 'clear_band'; m.update(e, 3); m.update(e, 3.2);
    const folded = m.angles();
    assert.ok(folded.every((v, i) => v >= before[i] - 1e-7));
    e.data.itinerary.phase = 'collect'; m.update(e, 3.2);
    m.angles().forEach((v, i) => assert.ok(Math.abs(v - folded[i]) < 1e-7));
    m.update(e, 4);
    assert.ok(m.angles().every((v, i) => v <= folded[i] + 1e-7));
    for (let lod = 0; lod < 3; lod++) {
      const pose = m.angles();
      m.root.traverse(o => { const match = /^LOD([012])_/.exec(o.name); if (match) o.visible = Number(match[1]) === lod; });
      m.update(e, 4);
      m.angles().forEach((v, i) => assert.ok(Math.abs(v - pose[i]) < 1e-7));
      m.assertCheeks();
    }
    m.update(e, 20); assertPose(m, true);
    assert.equal(m.controller.clipElapsed('stormshift_deploy', 20), null, 'completed rest clip drains');
    e.data.itinerary.phase = 'clear_band'; m.update(e, 21); assertPose(m, true);
    m.update(e, 29); assertPose(m, false);
    e.data.itinerary.phase = 'collect'; e.occupantGeneration = (e.occupantGeneration || 0) + 1;
    m.update(e, 30); assertPose(m, true);
  } finally { m.detach(); t.sim.dispose(); }
});
