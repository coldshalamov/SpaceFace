import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRecoveryWire, restore, capture, pose } from './ceres-reacquire-harness.mjs';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { stepCeresWorkfleet, ceresWorkfleetWorldPose, restoreCeresWorkfleetJob } from '../src/systems/ceresWorkfleet.js';
import { ceresPlayerWinchApproach, ceresPlayerWinchReady } from '../src/systems/ceresPlayerWinching.js';
import { ceresWorkfleetYardCall, stepCeresWorkfleetStagecraft } from '../src/systems/ceresWorkfleetStagecraft.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const DT = 1 / 60, clone = v => JSON.parse(JSON.stringify(v));
const prior = snapshotFeatureMaps();
test.before(() => applyFeatureConfigToMaps(PRODUCTION_FEATURES));
test.after(() => restoreFeatureMaps(prior));
const CRADLE = ceresWorkfleetWorldPose(C.route.receiverPose);
function handoverWire(offset = -20) {
  const wire = initialRecoveryWire();
  wire.jobs.ceresWorkfleet.phase = 'player-retained';
  wire.jobs.ceresWorkfleet.towId = null;
  delete wire.combat.attachments.byId.att_000005;
  wire.sites.worldById[C.siteId].payloads.long_plate.motion = {
    pos: { x: CRADLE.x, z: CRADLE.z + offset }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0 };
  return wire;
}
async function fixture(offset = -20) {
  return restore(handoverWire(offset), { playerPosition: { x: CRADLE.x, z: CRADLE.z - 250 } });
}
function offer(h) {
  const player = h.state.entities.get(h.state.playerId), section = h.b.section;
  h.physics._sg02.syncFromEntities(h.state.entityList);
  const result = h.service.create({ defId: 'tether_standard', ownerId: player.id, targetId: section.id,
    sourceSocketId: 'socket_tether_spool', targetSocketId: 'socket_tether_anchor' });
  assert.ok(result.ok, result.reason);
  h.state.tick++; stepCeresWorkfleet(h.owner, DT);
  return result.attachment;
}
function handover(h) {
  const line = offer(h);
  h.service.cut(line.id, h.state.playerId, 'tether_cut');
  h.state.tick++; stepCeresWorkfleet(h.owner, DT);
  return line;
}

test('winch accepts only a slow aligned original through the open side', () => {
  const c = { pos: { x: 10, z: 20 }, rot: 0 };
  const good = { pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0 };
  assert.equal(ceresPlayerWinchApproach(c, good), true);
  for (const change of [e => e.pos.z = -151, e => e.pos.z = 21, e => e.pos.x += 5,
    e => e.rot = .03, e => e.vel.z = .36, e => e.angVel = .016]) {
    const bad = clone(good); change(bad); assert.equal(ceresPlayerWinchApproach(c, bad), false);
  }
});

test('deliberate player handover reels the original with native clamp and pads, retaining through typed Save', async () => {
  let h = await fixture();
  try {
    const original = h.b.section, before = clone(pose(original)), mass = original.mass;
    handover(h);
    assert.equal(h.job().playerWinching, true);
    assert.equal(h.job().phase, 'pads');
    assert.deepEqual(clone(pose(original)), before, 'handover never repairs position or momentum');
    const receiverId = h.job().receiverId;
    assert.match(ceresWorkfleetYardCall(h.sites.getWorldSite(C.siteId), h.job()), /player_winch/);
    const startLength = h.service.get(receiverId).restLength;
    assert.ok(startLength >= 27.9 && startLength <= 28.1, String(startLength));
    for (let i = 0; i < 7200 && h.job().phase !== 'secured'; i++) {
      const old = h.service.get(receiverId).restLength;
      h.sim.step();
      assert.ok(old - h.service.get(receiverId).restLength <= DT + 1e-10);
      if (i === 180) {
        const snapshot = clone(pose(h.b.section)), length = h.service.get(receiverId).restLength;
        const wire = capture(h); h.close(); h = await restore(wire);
        assert.equal(h.job().playerWinching, true);
        assert.deepEqual(clone(pose(h.b.section)), snapshot);
        assert.equal(h.service.get(receiverId).restLength, length);
      }
    }
    assert.equal(h.job().phase, 'secured', JSON.stringify({ job: h.job(), pose: pose(h.b.section), cradle: h.b.cradle.data }));
    assert.equal(h.b.section.mass, mass); assert.equal(mass, 1800);
    assert.equal(h.service.get(receiverId).targetId, h.b.section.id);
    assert.equal(h.physics._sg02.records.get(h.b.section.id).colliders.length, 5);
    assert.equal(h.sites.getWorldSite(C.siteId).payloads.long_plate.retained.receiverWorldRecordId, C.identities.cradle);
    assert.ok(h.b.section.pos.z > before.pos.z + 18, 'native winch moved the real heavy original');
    const continued = capture(h); h.close(); h = await restore(continued);
    for (let i = 0; i < 180; i++) h.sim.step();
    assert.equal(h.job().phase, 'secured');
    assert.equal(h.service.get(receiverId).state, 'active');
  } finally { h.close(); }
});

for (const kind of ['no-line', 'snap', 'stale-player', 'stale-load', 'too-far-forward', 'fast-load', 'player-in-mouth'])
  test(`receiver refuses ${kind} without minting a clamp or changing motion`, async () => {
    const h = await fixture(kind === 'too-far-forward' ? -171 : -20);
    try {
      let line;
      if (kind !== 'no-line') {
        line = offer(h);
        h.service.cut(line.id, h.state.playerId, kind === 'snap' ? 'overload' : 'tether_cut');
      }
      if (kind === 'stale-player') h.state.entities.get(h.state.playerId).occupantGeneration++;
      if (kind === 'stale-load') h.b.section.occupantGeneration++;
      if (kind === 'fast-load') h.b.section.vel.z = 2;
      if (kind === 'player-in-mouth') h.state.entities.get(h.state.playerId).pos.z = CRADLE.z - 120;
      const before = clone(pose(h.b.section)), rows = Object.keys(h.state.combat.attachments.byId);
      h.state.tick++; stepCeresWorkfleet(h.owner, DT);
      assert.equal(h.job().playerWinching, undefined);
      assert.deepEqual(Object.keys(h.state.combat.attachments.byId), rows);
      assert.deepEqual(clone(pose(h.b.section)), before);
      assert.equal(h.sites.getWorldSite(C.siteId).payloads.long_plate.retained, undefined);
    } finally { h.close(); }
  });

test('the pilot can reclaim the same original during winching, without another reward or forced motion', async () => {
  const h = await fixture();
  try {
    handover(h); const receiverId = h.job().receiverId;
    assert.equal(h.job().phase, 'pads');
    const before = clone(pose(h.b.section)), credit = h.state.player.credits;
    const playerLine = offer(h);
    assert.equal(h.job().phase, 'player-retained'); assert.equal(h.job().playerWinching, undefined);
    assert.equal(h.service.get(receiverId).state, 'broken');
    assert.equal(playerLine.state, 'active');
    assert.deepEqual(clone(pose(h.b.section)), before);
    assert.equal(h.state.player.credits, credit);
  } finally { h.close(); }
});

test('job restore preserves actual receiving state but refuses a marker on unrelated phases', () => {
  const job = handoverWire().jobs.ceresWorkfleet;
  assert.equal(restoreCeresWorkfleetJob({ ...job, playerWinching: true }).playerWinching, undefined);
  assert.equal(restoreCeresWorkfleetJob({ ...job, phase: 'pads', playerWinching: true }).playerWinching, true);
});

test('same-tick duplicate and recursive reel callbacks cannot accelerate the winch', async () => {
  const h = await fixture();
  try {
    handover(h); const id = h.job().receiverId, before = h.service.get(id).restLength;
    let reentered = 0;
    const off = h.sim.bus.on('tether:reel', e => {
      if (e.attachmentId === id && reentered++ < 20) stepCeresWorkfleet(h.owner, DT);
    });
    h.state.tick++; stepCeresWorkfleet(h.owner, DT);
    for (let i = 0; i < 10; i++) stepCeresWorkfleet(h.owner, DT);
    off();
    assert.equal(reentered, 1);
    assert.ok(before - h.service.get(id).restLength <= DT + 1e-10);
  } finally { h.close(); }
});

test('a Save in tether:attached preserves the just-committed receiver and its owning job', async () => {
  let h = await fixture();
  try {
    let saved;
    const off = h.sim.bus.on('tether:attached', e => { if (e.actorId === h.b.cradle.id) saved = capture(h); });
    handover(h); off();
    assert.ok(saved); const id = h.job().receiverId;
    assert.equal(saved.jobs.ceresWorkfleet.receiverId, id);
    assert.equal(saved.jobs.ceresWorkfleet.phase, 'pads');
    assert.ok(saved.combat.attachments.byId[id]);
    h.close(); h = await restore(saved);
    assert.equal(h.service.get(id).state, 'active');
    for (let i = 0; i < 3600 && h.job().phase !== 'secured'; i++) h.sim.step();
    assert.equal(h.job().phase, 'secured');
  } finally { h.close(); }
});

test('a receiver cut in its creation callback cannot be claimed as accepted', async () => {
  const h = await fixture();
  try {
    const off = h.sim.bus.on('tether:attached', e => {
      if (e.actorId === h.b.cradle.id) {
        h.service.cut(e.attachmentId, e.actorId, 'external-cut');
        stepCeresWorkfleet(h.owner, DT);
      }
    });
    handover(h); off();
    assert.equal(h.job().playerWinching, undefined);
    assert.equal(h.job().phase, 'recovery-interrupted');
    assert.equal(h.sites.getWorldSite(C.siteId).payloads.long_plate.retained, undefined);
  } finally { h.close(); }
});

test('taking actual ownership yields the receiver without changing original motion', async () => {
  const h = await fixture();
  try {
    handover(h); const id = h.job().receiverId, before = clone(pose(h.b.section));
    h.b.section.data.playerOwned = true;
    h.state.tick++; stepCeresWorkfleet(h.owner, DT);
    assert.equal(h.job().phase, 'player-retained');
    assert.equal(h.service.get(id).state, 'broken');
    assert.equal(h.b.cradle.data.ceresWorkfleetSlideTarget, 0);
    assert.deepEqual(clone(pose(h.b.section)), before);
  } finally { h.close(); }
});

test('the fixed winch actually pulls from the outer apron into the original cradle', async () => {
  const h = await fixture(-160);
  try {
    handover(h);
    assert.equal(h.job().playerWinching, true);
    const start = clone(pose(h.b.section)), id = h.job().receiverId;
    let ticks = 0;
    for (; ticks < 15000 && h.job().phase !== 'secured'; ticks++) h.sim.step();
    assert.equal(h.job().phase, 'secured', JSON.stringify({job:h.job(),section:pose(h.b.section)}));
    assert.ok(h.b.section.pos.z > start.pos.z + 158);
    assert.equal(h.service.get(id).targetId, h.b.section.id);
    console.log(JSON.stringify({evidence:'native-apron-winch',ticks,seconds:ticks/60,mass:h.b.section.mass,travelWU:h.b.section.pos.z-start.pos.z}));
  } finally { h.close(); }
});


test('raw F handover through the full production factory survives its real Save/Continue envelope', async () => {
  const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');
  const { domKeyEvent } = await import('../src/systems/input.js');
  const { spawnSpecFromRecord } = await import('../src/world/worldRecords.js');
  const { reconcileCeresWorkfleetPresentation } = await import('../src/systems/ceresWorkfleet.js');
  const rt = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 47 });
  try {
    applyFeatureConfigToMaps(rt.config.features);
    const s = rt.state;
    s.mode = 'flight'; s.run.kind = 'adventure'; s.ui.screenStack = [];
    const wire = initialRecoveryWire();
    wire.jobs.ceresWorkfleet.phase = 'player-retained';
    wire.jobs.ceresWorkfleet.towId = null; wire.jobs.ceresWorkfleet.mountId = null;
    wire.sites.worldById[C.siteId].payloads.long_plate.motion = {
      pos: { x: CRADLE.x, z: CRADLE.z - 160 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0 };
    s.world.currentSectorId = C.sectorId; s.world.records = clone(wire.records);
    rt.getSystem('ships').newGame();
    const player = rt.spawn(makeShipEntitySpec('ship_pelican', { isPlayer: true, player: s.player,
      team: 0, pos: { x: CRADLE.x, z: CRADLE.z - 300 }, fittings: [] }));
    s.playerId = player.id;
    const sites = rt.getSystem('asteroidSites');
    sites.deserialize(clone(wire.sites)); sites._syncWorldSites();
    for (const record of Object.values(s.world.records.byId)) rt.spawn(spawnSpecFromRecord(record));
    rt.getSystem('npcJobsRuntime').deserialize(clone(wire.jobs));
    const physics = rt.getSystem('physics');
    await physics.prepareBackend(s); reconcileCeresWorkfleetPresentation({ state: s });
    const input = rt.getSystem('input');
    const step = n => { for (let i = 0; i < n; i++) rt.step(DT); };
    const plate = () => s.entityList.find(e => e.alive && e.data?.worldRecordId === C.identities.payload);
    const key = (code, pressed) => domKeyEvent(input, { code, pressed, blocked: false, repeat: false });
    input.ingestLaneDomEvent({ type: 'viewport', width: 640, height: 480 }); step(3);
    input.ingestLaneDomEvent({ type: 'mousemove', clientX: 320, clientY: 240, movementX: 1, movementY: 0 });
    input.ingestLaneDomEvent({ type: 'cursorProjection', x: plate().pos.x, z: plate().pos.z }); step(2);
    key('KeyF', true); step(1); key('KeyF', false); step(8);
    assert.equal(s.player.tether.active, true); assert.equal(s.player.tether.targetId, plate().id);
    key('KeyF', true); step(1); key('KeyF', false); step(2);
    assert.equal(s.npcJobs.ceresWorkfleet.playerWinching, true);
    const saver = rt.getSystem('save'), id = s.npcJobs.ceresWorkfleet.receiverId;
    step(120);
    const before = { x: plate().pos.x, z: plate().pos.z, vx: plate().vel.x, vz: plate().vel.z };
    const length = rt.getSystem('combat').kernel.attachments.get(id).restLength;
    const envelope = clone(saver.serialize('ceres-native-winch'));
    assert.equal(saver.loadEnvelope(envelope, 'ceres-native-winch'), true);
    s.mode = 'flight'; s.ui.docked = false; s.ui.screenStack = [];
    sites._syncWorldSites(C.sectorId); await physics.prepareBackend(s);
    reconcileCeresWorkfleetPresentation({ state: s });
    assert.equal(s.npcJobs.ceresWorkfleet.playerWinching, true);
    assert.equal(rt.getSystem('combat').kernel.attachments.get(id).restLength, length);
    assert.ok(Math.hypot(plate().pos.x - before.x, plate().pos.z - before.z) < 1e-5);
    assert.ok(Math.hypot(plate().vel.x - before.vx, plate().vel.z - before.vz) < 1e-5);
    console.log(JSON.stringify({ evidence: 'full-production-raw-F-full-save', mass: plate().mass,
      lineId: id, length, before, restoredLife: plate().occupantGeneration,
      systems: rt.manifest.authoritativeUpdateOrder.length }));
  } finally { rt.dispose(); }
});

for (const kind of ['cradle-owned', 'cradle-line', 'section-disabled', 'foreign-control']) test(`receiver handles ${kind} without inventing a delivery`, async () => {
  const h = await fixture();
  try {
    handover(h); const id = h.job().receiverId;
    if (kind === 'cradle-owned') h.b.cradle.data.playerOwned = true;
    if (kind === 'cradle-line') assert.ok(h.service.create({ defId: 'tether_standard', ownerId: h.state.playerId,
      targetId: h.b.cradle.id, sourceSocketId: 'socket_tether_spool', targetSocketId: 'socket_hull' }).ok);
    if (kind === 'section-disabled') h.b.section.data.disabled = true;
    if (kind === 'foreign-control') h.b.section.data.controlLease = { holder: 'other' };
    h.state.tick++; stepCeresWorkfleet(h.owner, DT);
    assert.equal(h.job().phase, kind.startsWith('cradle-') ? 'player-retained' : 'worker-disabled');
    assert.equal(h.service.get(id).state, kind.startsWith('cradle-') ? 'broken' : 'active');
    assert.equal(h.sites.getWorldSite(C.siteId).payloads.long_plate.retained, undefined);
  } finally { h.close(); }
});

test('the ready call reaches the actual apron outside the old yard-only hearing circle', async () => {
  const h = await fixture(-160);
  try {
    const calls = []; h.sim.bus.on('comms:message', e => calls.push(e.text));
    offer(h); assert.equal(ceresPlayerWinchReady(h.state), true);
    assert.ok(Math.hypot(h.state.entities.get(h.state.playerId).pos.x-C.sitePlacement.pos.x,
      h.state.entities.get(h.state.playerId).pos.z-C.sitePlacement.pos.z)>420);
    h.state.simTime += 9;
    stepCeresWorkfleetStagecraft(h.owner, h.sites.getWorldSite(C.siteId));
    assert.match(calls.at(-1), /Cradle winch ready.*Release your Line now/);
    h.b.section.vel.x = .031;
    assert.equal(ceresPlayerWinchReady(h.state), false);
  } finally { h.close(); }
});

test('native pad obstruction holds the same receiver and clears without a second handover', async () => {
  const h = await fixture(-4);
  try {
    handover(h); const id = h.job().receiverId;
    const obstacle = h.sim.spawn({ type:'wreck', team:0, pos:{x:CRADLE.x+50,z:CRADLE.z}, radius:5,mass:100,hull:100,collides:true,
      data:{worldRecordId:'test:player-winch-obstruction',missionPinned:true},
      physicsBody:{schemaVersion:1,dynamic:false,radius:5,mass:100,shape:'ball',useMeasuredSkin:false,material:'wreck'} });
    for(let i=0;i<900;i++)h.sim.step();
    assert.equal(h.job().phase,'pads');
    assert.equal(h.job().blockedReason,'receiver-seating-obstructed');
    assert.equal(ceresWorkfleetYardCall(h.sites.getWorldSite(C.siteId),h.job()),'player_winch_obstructed');
    const length=h.service.get(id).restLength;
    for(let i=0;i<120;i++)h.sim.step();
    assert.equal(h.service.get(id).restLength,length);
    obstacle.alive=false;
    for(let i=0;i<2400&&h.job().phase!=='secured';i++)h.sim.step();
    assert.equal(h.job().phase,'secured');assert.equal(h.job().receiverId,id);
  } finally { h.close(); }
});

test('a later physical drift can jam the plate honestly and the pilot can take the same original back', async () => {
  const {queuePhysicsImpulse}=await import('../src/core/physicsAuthority.js');
  const h=await fixture(-160);
  try {
    handover(h);const id=h.job().receiverId;
    queuePhysicsImpulse(h.b.section,{x:h.b.section.mass*.3,y:0,z:0},{source:'ceres-winch-late-disturbance-test'});
    for(let i=0;i<18000&&h.job().blockedReason!=='receiver-load-misaligned';i++)h.sim.step();
    assert.equal(h.job().phase,'pads');assert.equal(h.job().blockedReason,'receiver-load-misaligned',JSON.stringify({job:h.job(),section:pose(h.b.section),cradle:h.b.cradle.data,rest:h.service.get(id).restLength}));
    assert.equal(ceresWorkfleetYardCall(h.sites.getWorldSite(C.siteId),h.job()),'player_winch_jammed');
    assert.equal(h.sites.getWorldSite(C.siteId).payloads.long_plate.retained,undefined);
    const original=h.b.section,before=clone(pose(original));
    const playerLine=offer(h);
    assert.equal(h.job().phase,'player-retained');assert.equal(h.service.get(id).state,'broken');
    assert.equal(playerLine.targetId,original.id);assert.deepEqual(clone(pose(original)),before);
  } finally {h.close();}
});


test('ready is immediate after arrival and repeats once for a new real Line in the same visit', async () => {
  const h = await fixture(-160);
  try {
    const calls = []; h.sim.bus.on('comms:message', e => calls.push(e.text));
    const stage = () => stepCeresWorkfleetStagecraft(h.owner, h.sites.getWorldSite(C.siteId));
    stage();
    assert.match(calls.at(-1), /Work stopped/);
    const first = offer(h); stage();
    assert.match(calls.at(-1), /Cradle winch ready/);
    for (let i = 0; i < 10; i++) stage();
    assert.equal(calls.filter(text => text.startsWith('Cradle winch ready')).length, 1);
    h.service.cut(first.id, h.state.playerId, 'tether_cut');
    h.state.tick++; stepCeresWorkfleet(h.owner, DT);
    assert.equal(h.job().playerWinching, true);
    const next = offer(h);
    assert.notEqual(first.id, next.id);
    assert.equal(h.job().phase, 'player-retained');
    h.state.tick++; stepCeresWorkfleet(h.owner, DT); stage();
    assert.equal(calls.filter(text => text.startsWith('Cradle winch ready')).length, 2);
    stage();
    assert.equal(calls.filter(text => text.startsWith('Cradle winch ready')).length, 2);
  } finally { h.close(); }
});


test('the ready cue withdraws immediately when receiver admission or attachment exclusivity changes', async () => {
  const h = await fixture(-160);
  try {
    offer(h); assert.equal(ceresPlayerWinchReady(h.state), true);
    h.b.section.data.disabled = true;
    assert.equal(ceresPlayerWinchReady(h.state), false);
    delete h.b.section.data.disabled;
    h.b.section.data.controlLease = { holder: 'other' };
    assert.equal(ceresPlayerWinchReady(h.state), false);
    delete h.b.section.data.controlLease;
    assert.equal(ceresPlayerWinchReady(h.state), true);
    const second = h.service.create({ defId: 'attachment_transport_clamp', ownerId: h.b.cradle.id,
      targetId: h.b.breaker.id, sourceSocketId: 'SOCKET_Service_Head' });
    assert.ok(second.ok, second.reason);
    assert.equal(ceresPlayerWinchReady(h.state), false);
  } finally { h.close(); }
});


for (const event of ['tether:broken', 'ceresWorkfleet:interrupted'])
  test(`a cradle life replaced during ${event} cannot receive stale custody writes`, async () => {
    const h = await fixture();
    try {
      handover(h); const id = h.job().receiverId, oldCradle = h.b.cradle;
      oldCradle.data.playerOwned = true;
      let fresh;
      const off = h.sim.bus.on(event, e => {
        if (event === 'tether:broken' && e.attachmentId !== id) return;
        fresh = { ...oldCradle, occupantGeneration: oldCradle.occupantGeneration + 1,
          data: { ...oldCradle.data, playerOwned: false, ceresWorkfleetSlideDisabled: false,
            ceresWorkfleetSlideTarget: .7 } };
        h.state.entities.set(fresh.id, fresh);
        h.state.entityList[h.state.entityList.indexOf(oldCradle)] = fresh;
      });
      h.state.tick++; stepCeresWorkfleet(h.owner, DT); off();
      assert.ok(fresh);
      assert.equal(fresh.data.ceresWorkfleetSlideDisabled, false);
      assert.equal(fresh.data.ceresWorkfleetSlideTarget, .7);
      assert.equal(h.service.get(id).state, 'broken');
    } finally { h.close(); }
  });
