import test from 'node:test';
import assert from 'node:assert/strict';
import { CERES_SHIPBREAK_MANIFEST as site } from '../src/data/ceresShipbreak.js';
import { CERES_WORKFLEET_CONTRACT as work } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetYardCall, stepCeresWorkfleetStagecraft } from '../src/systems/ceresWorkfleetStagecraft.js';
import * as THREE from 'three';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { recordCeresWorkfleetActuation } from '../src/core/ceresWorkfleetActuation.js';
import { bindMachineryPresentation, markMachineryEffective, recordCeresWorkfleetAuthoredSource } from '../src/core/machineryPresentation.js';
import { createCeresWorkfleetPropulsionDriver } from '../src/render/ceresWorkfleetVisuals.js';
import { syncCeresWorkfleetHardware, stepCeresWorkfleet } from '../src/systems/ceresWorkfleet.js';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics as physicsSystem } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

const record = () => ({ completedOperations: {}, payloads: { long_plate: {} } });
function harness() {
  const player = { id: 1, alive: true, pos: { ...site.mapAnnotation.coursePos }, flags: {} };
  const state = { mode: 'flight', simTime: 0, playerId: player.id, entities: new Map([[player.id, player]]),
    world: { currentSectorId: work.sectorId }, npcJobs: {} };
  const events = [];
  const owner = { state, bus: { emit: (name, payload) => events.push({ name, payload }) } };
  return { player, state, events, owner, site: record() };
}

test('yard calls follow the voluntary brace and real custody, without changing the job or site', () => {
  const h = harness();
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.equal(h.events[0].name, 'comms:message');
  assert.equal(h.events[0].payload.channel, 'machine');
  assert.match(h.events[0].payload.text, /site beam.*brace/i);
  assert.deepEqual(h.site, record());
  assert.equal(h.state.npcJobs.ceresWorkfleet, undefined, 'a radio call never starts the job');
  h.site.completedOperations.brace_long_plate = true;
  h.state.npcJobs.ceresWorkfleet = { phase: 'head_out' };
  h.state.simTime = 9;
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.match(h.events.at(-1).payload.text, /seam.*clamp.*sooner/i);
  h.state.npcJobs.ceresWorkfleet.phase = 'extract';
  h.state.simTime = 18;
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.match(h.events.at(-1).payload.text, /breaker.*plate.*line/i);
  h.state.npcJobs.ceresWorkfleet.phase = 'secured';
  h.state.simTime = 27;
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.match(h.events.at(-1).payload.text, /secured.*cradle/i);
  for (let n = 0; n < 10; n++) { h.state.simTime++; stepCeresWorkfleetStagecraft(h.owner, h.site); }
  assert.equal(h.events.length, 4, 'no repeated per-tick calls');
  h.state.npcJobs.ceresWorkfleet.phase = 'player-retained';
  h.state.simTime = 45;
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.match(h.events.at(-1).payload.text, /custody/i);
});

test('the original yard bodies stage on approach without starting the unbraced job or duplicating on return', () => {
  const h = harness();
  h.player.radius = 10;
  h.state.sites = { worldById: { [work.siteId]: h.site } };
  h.state.world.records = { byId: {} };
  h.state.tick = 1;
  const records = h.state.world.records.byId;
  const world = { upsertWorldRecord(e) { records[e.data.worldRecordId] = { recordId: e.data.worldRecordId, alive: true }; } };
  h.owner.registry = { get: name => name === 'world' ? world : null };
  let id = 10;
  h.owner.helpers = { spawnEntity(spec) { const e = { id: id++, occupantGeneration: 1, ...spec };
    h.state.entities.set(e.id, e); return e; } };
  h.player.pos = { x: work.sitePlacement.pos.x + 1000, z: work.sitePlacement.pos.z };
  assert.equal(syncCeresWorkfleetHardware(h.owner), false);
  assert.equal(h.state.entities.size, 1);
  h.player.pos = { ...site.mapAnnotation.coursePos };
  assert.equal(syncCeresWorkfleetHardware(h.owner), true);
  assert.equal(h.state.entities.size, 4, 'one each breaker, cradle and cutter');
  stepCeresWorkfleet(h.owner, 1 / 60);
  assert.equal(h.state.npcJobs.ceresWorkfleet, undefined, 'parking never grants the brace or starts the job');
  assert.deepEqual(h.site.completedOperations, {});
  syncCeresWorkfleetHardware(h.owner);
  assert.equal(h.state.entities.size, 4);
});

test('late materialization does not spawn a solid on a player, and existing tombstones are not replaced', () => {
  const h = harness(); h.player.radius = 10;
  h.state.sites = { worldById: { [work.siteId]: h.site } }; h.state.tick = 1;
  h.state.world.records = { byId: { [work.identities.cradle]: { alive: false, outcome: 'destroyed' } } };
  h.player.pos = { x: work.sitePlacement.pos.x + work.route.breakerWorkPose.x,
    z: work.sitePlacement.pos.z + work.route.breakerWorkPose.z };
  const world = { upsertWorldRecord() {} };
  h.owner.registry = { get: name => name === 'world' ? world : null };
  let id = 10;
  h.owner.helpers = { spawnEntity(spec) { const e = { id: id++, occupantGeneration: 1, ...spec };
    h.state.entities.set(e.id, e); return e; } };
  syncCeresWorkfleetHardware(h.owner);
  assert.equal([...h.state.entities.values()].some(e => e.data?.ceresWorkfleetRole === 'breaker'), false);
  assert.equal([...h.state.entities.values()].some(e => e.data?.ceresWorkfleetRole === 'cradle'), false);
});

test('calls are local, re-entry reports current state, and a brief alignment delay is not an obstruction', () => {
  const h = harness();
  h.player.pos.x += 1000;
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.equal(h.events.length, 0);
  h.site.completedOperations.brace_long_plate = true;
  h.state.npcJobs.ceresWorkfleet = { phase: 'head_cut', blockedReason: 'physical-cutter-not-ready' };
  h.player.pos = { ...site.mapAnnotation.coursePos };
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.match(h.events[0].payload.text, /seam.*clamp.*sooner/i);
  h.state.simTime = 4; stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.equal(h.events.length, 1);
  h.state.simTime = 9; stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.match(h.events.at(-1).payload.text, /not lined up/i);
  h.player.pos.x += 1000; stepCeresWorkfleetStagecraft(h.owner, h.site);
  h.state.npcJobs.ceresWorkfleet.phase = 'secured';
  h.player.pos = { ...site.mapAnnotation.coursePos }; h.state.simTime = 10;
  stepCeresWorkfleetStagecraft(h.owner, h.site);
  assert.match(h.events.at(-1).payload.text, /secured.*cradle/i);
  assert.equal(ceresWorkfleetYardCall({ completedOperations: { cut_long_plate_seam: true } }, null), null,
    'never call a previously cut plate clamped');
});

test('a pilot flying past does not spend the arrival call before slowing at the yard', () => {
  const h=harness();h.player.vel={x:220,z:0};
  stepCeresWorkfleetStagecraft(h.owner,h.site);assert.equal(h.events.length,0);
  h.player.vel.x=0;h.state.simTime=2;stepCeresWorkfleetStagecraft(h.owner,h.site);
  assert.match(h.events[0].payload.text,/site beam.*brace/i);
});

// Clearance uses the existing physical boxes and a conservative arrival disc that includes a
// small ship. This covers the shell, receiver and every sampled moving-carrier route pose.
function distanceToBox(point, pose, box) {
  const c = Math.cos(pose.rot || 0), s = Math.sin(pose.rot || 0);
  const dx = point.x - pose.x, dz = point.z - pose.z;
  const x = c * dx + s * dz - box.center.x, z = -s * dx + c * dz - box.center.z;
  return Math.hypot(Math.max(Math.abs(x) - box.size.x / 2, 0), Math.max(Math.abs(z) - box.size.z / 2, 0));
}
test('charted approach is clear of the real work geometry while making the brace easier to aim', () => {
  const p = { x: site.mapAnnotation.coursePos.x - site.placement.pos.x, z: site.mapAnnotation.coursePos.z - site.placement.pos.z };
  const margin = site.mapAnnotation.courseArrivalRadius + 10;
  for (const box of work.existing.shellBoxes) assert.ok(distanceToBox(p, { x: 0, z: 0, rot: 0 }, box) > margin, box.id);
  for (const box of work.existing.section.boxes) assert.ok(distanceToBox(p, work.existing.section.mountedPose, box) > margin, box.id);
  for (const section of work.existing.otherSections) for (const box of section.boxes) {
    assert.ok(distanceToBox(p, section.pose, box) > margin, box.id);
  }
  for (const box of work.assets.cradle.states.open.boxes) assert.ok(distanceToBox(p, work.route.receiverPose, box) > margin, box.id);
  const legs = [
    { from: work.route.breakerWorkPose, to: work.route.extraction.breakerTo },
    ...work.route.loadedLegs,
    { from: work.route.loadedLegs.at(-1).to, to: work.route.carrierWithdrawalTo },
  ];
  for (const leg of legs) for (let n = 0; n <= 20; n++) {
    const t = n / 20, pose = { x: leg.from.x + (leg.to.x - leg.from.x) * t,
      z: leg.from.z + (leg.to.z - leg.from.z) * t, rot: leg.from.rot + (leg.to.rot - leg.from.rot) * t };
    for (const box of work.assets.breaker.states.open.boxes) assert.ok(distanceToBox(p, pose, box) > margin, `carrier ${box.id}`);
  }
  const brace = site.proxies.find(x => x.componentId === 'long_plate_clamp');
  assert.equal(brace.radius, 6);
  assert.equal(brace.bodyType, 'sensor');
  assert.equal(work.existing.section.mass, 1800);
});

test('cutter contact follows actual work in the current tick and retires with its mounted asset', () => {
  const head = { id: 7, occupantGeneration: 1, ...ceresWorkfleetHardwareSpec('cutterHead') };
  const root = new THREE.Group(); root.userData.authoredAssetState = 'authored'; head.mesh = root;
  const socket = new THREE.Group(); socket.name = 'SOCKET_Cut'; root.add(socket);
  for (const channel of work.assets.cutterHead.propulsion.channels) {
    const throat = new THREE.Group(); throat.name = channel.socket; root.add(throat);
    for (const name of channel.coreMeshes) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshStandardMaterial());
      mesh.name = name; root.add(mesh);
    }
  }
  const scene = new THREE.Scene(); scene.add(root);
  const state = { tick: 40, simTime: 1, playerId: 1, entities: new Map([[head.id, head]]),
    npcJobs: { ceresWorkfleet: { phase: 'head_cut' } },
    render: { scene, renderer: {}, admissionRunGeneration: 1, contextRecovery: { pending: false, generation: 1 } } };
  recordCeresWorkfleetAuthoredSource(root, work.assets.cutterHead);
  bindMachineryPresentation(head, root, state); markMachineryEffective(head, state, work.assets.cutterHead.id);
  const driver = createCeresWorkfleetPropulsionDriver(root, head);
  const contact = root.getObjectByName('CeresWorkfleetCutContact');
  assert.ok(contact); assert.equal(contact.visible, false);
  const drive = () => recordCeresWorkfleetActuation(state, head,
    { force: { x: 0, z: 0 }, torque: { y: 0 } }, { accel: 8, angularAccel: .6 });
  assert.ok(drive()); driver.update(head); assert.equal(contact.visible, false, 'intent alone is not work');
  head.data.ceresWorkfleetCutTick = state.tick;
  driver.update(head); assert.equal(contact.visible, true);
  state.tick++; state.simTime += 1 / 60; assert.ok(drive()); driver.update(head);
  assert.equal(contact.visible, false, 'a blocked or stopped cut cannot keep glowing');
  head.data.ceresWorkfleetCutTick = state.tick; state.npcJobs.ceresWorkfleet.phase = 'player-retained';
  driver.update(head); assert.equal(contact.visible, false);
  driver.dispose(); assert.equal(root.getObjectByName('CeresWorkfleetCutContact'), undefined);
});

async function assistedYard() {
  const state = createGameState(47); state.mode = 'flight'; state.world.currentSectorId = work.sectorId;
  const recordOwner = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const modules = { flightSlot: flightV3, physics: physicsSystem, combat, asteroidSites, npcJobsRuntime, traffic, world: recordOwner };
  const sim = createSimulation({ state, seed: 47,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]) });
  const player = sim.spawn({ type: 'ship', team: 0, alive: true,
    pos: { x: work.sitePlacement.pos.x + 500, z: work.sitePlacement.pos.z - 500 }, radius: 6, mass: 100,
    hull: 100, hullMax: 100, flags: { persistent: true }, data: {} });
  state.playerId = player.id; world._tickFrameOrigin.call({ bus: sim.bus }, state);
  const sites = sim.registry.get('asteroidSites'); sites._syncWorldSites(work.sectorId);
  await sim.registry.get('physics').prepareBackend(state);
  const operation = (componentId, verb, amount) => sites.applyWorldSiteBeamOperation({ siteId: work.siteId,
    componentId, verb, amount, requestStreamId: 'player-industrial-beam', requestSequence: state.tick, tick: state.tick });
  return { state, sim, sites, operation, close: () => sim.dispose() };
}

test('parked crew stays at rest without player contact before the brace', async () => {
  const h=await assistedYard();
  try {
    const player=h.state.entities.get(h.state.playerId);
    player.pos.x=work.sitePlacement.pos.x-600;player.pos.z=work.sitePlacement.pos.z-100;
    syncCeresWorkfleetHardware(h.sim.registry.get('traffic'));
    const bodies=[...h.state.entities.values()].filter(e=>e.data?.ceresWorkfleetRole);
    assert.equal(bodies.length,3);
    const start=bodies.map(e=>({id:e.id,role:e.data.ceresWorkfleetRole,x:e.pos.x,z:e.pos.z}));
    for(let n=0;n<900;n++)h.sim.step();
    for(const p of start){const e=h.state.entities.get(p.id);
      assert.ok(Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<1,
        `${p.role} moved before brace: ${JSON.stringify({start:p,pos:e.pos,vel:e.vel,intent:e.data.intent,ai:e.data.ai})}`);}
    assert.equal(h.state.npcJobs?.ceresWorkfleet,undefined);
  }finally{h.close();}
});

test('player preparation avoids an unnecessary cutter trip while preserving the original physical tow', async () => {
  const h = await assistedYard();
  try {
    assert.ok(h.operation('long_plate_clamp', 'repair', 24).ok); h.sim.step();
    assert.ok(h.operation('long_plate', 'cut', 54).ok); h.sim.step();
    assert.ok(h.operation('long_plate_clamp', 'cut', 18).ok);
    const seen = new Set();
    for (let n = 0; n < 500; n++) { h.sim.step(); seen.add(h.state.npcJobs?.ceresWorkfleet?.phase);
      if (seen.has('extract')) break; }
    assert.ok(!seen.has('head_out'), 'already finished work does not deploy a second cutter');
    assert.ok(seen.has('tow_attach') || seen.has('extract'), 'the real carrier enters ordinary tow admission');
    const original = [...h.state.entities.values()].find(e => e.data?.worldRecordId === work.identities.payload);
    assert.equal(original.mass, 1800); assert.equal(original.physicsBody.dynamic, true);
    const job = h.state.npcJobs.ceresWorkfleet;
    assert.ok(job.mountId, 'the original head stays physically mounted on the carrier');
    assert.equal(h.sites.getWorldSite(work.siteId).payloads.long_plate.worldObjectId, work.identities.payload);
  } finally { h.close(); }
});

test('finishing the preparation during deployment reverses the head instead of teleporting it', async () => {
  const h = await assistedYard();
  try {
    assert.ok(h.operation('long_plate_clamp', 'repair', 24).ok);
    for (let n = 0; n < 1200 && !(h.state.npcJobs?.ceresWorkfleet?.phase === 'head_out'
      && h.state.npcJobs.ceresWorkfleet.index >= 2); n++) h.sim.step();
    const job = h.state.npcJobs.ceresWorkfleet;
    assert.equal(job.phase, 'head_out'); assert.ok(job.index >= 2);
    assert.ok(h.operation('long_plate', 'cut', 54).ok); h.sim.step();
    assert.ok(h.operation('long_plate_clamp', 'cut', 18).ok);
    const head = [...h.state.entities.values()].find(e => e.data?.worldRecordId === work.identities.cutterHead);
    const before = { ...head.pos }; h.sim.step();
    assert.equal(job.phase, 'head_retract');
    assert.ok(Math.hypot(head.pos.x - before.x, head.pos.z - before.z) < 1, 'no head teleport');
    for (let n = 0; n < 3600 && job.phase === 'head_retract'; n++) h.sim.step();
    assert.equal(job.phase, 'tow_attach', 'real head returns through its guarded corridor');
    assert.equal(head.mass, 60);
    for (let n = 0; n < 1200 && job.phase === 'tow_attach'; n++) h.sim.step();
    assert.equal(job.phase, 'extract', 'the returned head mounts and the real tow begins');
    const service = h.sim.registry.get('combat').kernel.attachments;
    assert.equal(service.get(job.mountId)?.state, 'active');
    assert.equal(service.get(job.towId)?.state, 'active');
  } finally { h.close(); }
});
