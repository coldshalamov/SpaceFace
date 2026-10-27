// SFQ-M M09 The salvage dispute: a Pitborn claim on a rich wreck, a tender that witnesses, and a
// survivor pod with failing air on the far side of the field. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncountersDay } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { mining } from '../src/systems/mining.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { runtime as disputeRuntime } from '../src/data/encounters/1101-salvage-dispute.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';

const SEED = 4242;
const SECTOR = 'sector_io_reach';
const ANCHOR = Object.freeze({ x: 3000, z: -2500 });
const SHAPE = 'salvage_dispute';

function makeHarness(seed = SEED) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x + 150, z: ANCHOR.z + 250 }, vel: { x: 0, z: 0 },
    hull: 400, hullMax: 400, radius: 6, mass: 35,
  });
  state.playerId = player.id;
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'rep', payload: p }));
  bus.on('encounter:voice', (p) => events.push({ name: 'voice', payload: p }));
  return { sim, state, bus, player, events };
}

function fire(h) {
  const res = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_m09', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'derelict_field', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  return Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
}

const mOf = (live) => live.data.dispute;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const reps = (h) => h.events.filter((e) => e.name === 'rep').map((e) => [e.payload.factionId, e.payload.delta]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function towPodTo(h, live, target) {
  const pod = ent(h, mOf(live).podId);
  const tender = ent(h, mOf(live).tenderId);
  pod.pos.x = target.x + tender.radius + pod.radius + 25; pod.pos.z = target.z;
  h.state.combat ||= {}; h.state.combat.attachments = { byId: {
    rescue: { id: 'rescue', state: 'active', ownerId: h.player.id, targetId: pod.id, ownerGeneration: h.player.occupantGeneration, targetGeneration: pod.occupantGeneration }
  } };
  pod.vel = { ...tender.vel };
  h.sim.runTicks(120);
}

test('salvage_dispute is a registered derelict-field claim minor off the Helios corridor', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual(
    { tier: enc.tier, zones: [...enc.zoneTypes], script: enc.script, situation: enc.shape.situation },
    { tier: 'minor', zones: ['derelict_field'], script: 'selfRegistered', situation: 'claim' });
  assert.ok(!enc.gates.sectorIds.includes('sector_helios_prime'));
});

test('fire stakes a real claim: wreck stamped to the tender, pod and tender on opposite sides', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  const wreck = ent(h, m.wreckId);
  const pod = ent(h, m.podId);
  const tender = ent(h, m.tenderId);
  assert.equal(wreck.data.salvorClaimedBy, m.claimId);
  assert.equal(tender.data.salvorClaimId, m.claimId, 'the claim resolves to a live witness hull');
  assert.equal(tender.data.ai.passive, true);
  assert.ok(Object.values(wreck.data.salvagePool).reduce((a, b) => a + b, 0) === 13);
  assert.equal(isAttachable(pod, h.state.playerId, h.state), true);
  assert.equal(ensurePhysicsBodySpec(pod).dynamic, true);
  assert.ok(dist(pod.pos, tender.pos) > 1100, 'the rescue is a real tow across the field');
  assert.ok(dist(pod.pos, wreck.pos) > 500 && dist(tender.pos, wreck.pos) > 500);
  assert.match(h.events.find((e) => e.name === 'voice').payload.text, /Bring the pod to us and the wreck is yours/);
});

test('lawful: towing the pod to the tender pays, earns standing and releases the claim for honest salvage', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  towPodTo(h, live, ent(h, m.tenderId).pos);
  assert.deepEqual(resolved(h), ['rescued']);
  assert.deepEqual(grants(h), [260]);
  assert.deepEqual(reps(h), [['faction_pitborn', 4]]);
  const wreck = ent(h, m.wreckId);
  assert.equal(wreck.data.salvorClaimedBy, undefined, 'the claim is released');
  assert.equal(ent(h,m.tenderId).data.scanLabel, 'PITBORN TENDER — SURVIVOR ABOARD');
  assert.equal(wreck.data.scanLabel, 'RELEASED WRECK — PITBORN SIGNED IT OVER');
  assert.equal(Object.values(wreck.data.salvagePool).reduce((a, b) => a + b, 0), 13, 'the salvage is left for you');
});

test('extraction: working the claimed wreck past half settles stripped and costs Pitborn standing, no pay', () => {
  const h = makeHarness();
  const live = fire(h);
  const wreck = ent(h, mOf(live).wreckId);
  wreck.data.salvagePool = { cmdty_electronics: 0, cmdty_alloys: 1, cmdty_scrap_metal: 5 };
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h), ['stripped']);
  assert.deepEqual(reps(h), [['faction_pitborn', -5]]);
  assert.deepEqual(grants(h), []);
  assert.equal(wreck.data.salvorClaimedBy, mOf(live).claimId, 'the claim still stands for the law');
});

test('the claim stamp drives the existing mining protest: the tender is named as the witnessed victim', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  const reports = [];
  const mine = Object.create(mining);
  mine.init({
    state: h.state, bus: h.bus, helpers: { spawnEntity: () => null },
    registry: { get: (id) => (id === 'lawSecurity' ? { reportIncident(r) { reports.push(r); return { accepted: true, incidentReceiptId: 'law:test:1' }; } } : null) },
  });
  mine._protestClaimJump(ent(h, h.state.playerId), ent(h, m.wreckId), { cmdty_electronics: 2 });
  assert.equal(reports.length, 1, 'the law owner receives the claim-jump report');
  assert.equal(reports[0].victimEntityId, m.tenderId);
});

test('late: the tender begins physical recovery, leaving the original pod available and full wreck claimed', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  h.state.simTime = m.airEndsAt + 1;
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h), []);
  assert.equal(live.phase, 'recovering');
  assert.deepEqual(grants(h), []);
  const pod = ent(h, m.podId);
  assert.ok(pod && pod.alive !== false);
  assert.equal(pod.data.masslineTetherable, true);
  assert.equal(ent(h, m.tenderId).data.intent.assistMode, 'assisted');
  assert.equal(Object.values(ent(h, m.wreckId).data.salvagePool).reduce((a,b)=>a+b,0),13);
  assert.equal(ent(h, m.wreckId).data.salvorClaimedBy, m.claimId);
});

test('destroying the pod is the worst outcome and costs the most standing', () => {
  const h = makeHarness();
  const live = fire(h);
  ent(h, mOf(live).podId).alive = false;
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h), ['pod_lost']);
  assert.deepEqual(reps(h), [['faction_pitborn', -6]]);
});

test('same seed, same field', () => {
  const a = makeHarness(); const la = fire(a);
  const b = makeHarness(); const lb = fire(b);
  assert.deepEqual(ent(a, mOf(la).podId).pos, ent(b, mOf(lb).podId).pos);
  assert.deepEqual(ent(a, mOf(la).tenderId).pos, ent(b, mOf(lb).tenderId).pos);
});

test('the ordinary sector-day roll (seed 4242) draws it off the starter corridor and it fires there without force', () => {
  const zones = zonesForSector(SECTOR);
  let planned = null;
  for (let day = 0; day < 60 && !planned; day++) {
    planned = planEncountersDay(SEED, SECTOR, day, zones).find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(planned, `${SHAPE} is drawn by the ordinary roll in ${SECTOR}`);
  assert.ok(ENCOUNTERS[SHAPE].zoneTypes.includes(planned.zoneType), 'it lands on one of its authored zone types');
  const helios = zonesForSector('sector_helios_prime');
  for (let day = 0; day < 60; day++) {
    assert.equal(planEncountersDay(SEED, 'sector_helios_prime', day, helios).some((item) => item.shapeId === SHAPE), false,
      'the starter corridor never draws it');
  }
  const h = makeHarness();
  const director = h.sim.registry.get('encounterDirector');
  const request = () => director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: planned.encounterId, sectorId: SECTOR, anchor: { ...planned.zoneCenter },
    zoneType: planned.zoneType, zoneRadius: planned.zoneRadius, respectPacing: true,
  });
  // No force: the deck's tension pool must accrue through ordinary flight time before it can fire.
  let res = request();
  for (let s = 0; s < 900 && !res.ok; s++) {
    assert.equal(res.reason, 'pressure', `only the pressure budget may hold it back: ${JSON.stringify(res)}`);
    h.sim.runTicks(60);
    res = request();
  }
  assert.equal(res.ok, true, `the planned item passes the fire-time gates and pacing: ${JSON.stringify(res)}`);
  assert.ok(Object.values(h.state.encounterDirector.live).some((l) => l.shapeId === SHAPE));
});

test('fallback requires original pod attendance, then consumes it once without working the wreck', () => {
  const h=makeHarness(), live=fire(h), m=mOf(live), tender=ent(h,m.tenderId), pod=ent(h,m.podId);
  h.state.simTime=m.airEndsAt+1; h.sim.runTicks(120);
  assert.deepEqual(resolved(h),[]);
  // Focused boundary fixture only; native qualification must prove actual approach.
  tender.pos={x:pod.pos.x+tender.radius+pod.radius+25,z:pod.pos.z};
  tender.vel={x:0,z:0};pod.vel={x:0,z:0};h.sim.runTicks(120);
  assert.deepEqual(resolved(h),['claimed']);assert.deepEqual(grants(h),[]);
  assert.equal(ent(h,m.podId),undefined);
  const wreck=ent(h,m.wreckId);
  assert.equal(Object.values(wreck.data.salvagePool).reduce((a,b)=>a+b,0),13);
  assert.equal(wreck.data.salvorClaimedBy,m.claimId);
  assert.match(wreck.data.scanLabel,/CLAIM RETAINED/);
  h.sim.runTicks(10);assert.deepEqual(resolved(h),['claimed']);
});

test('player can still win the recovery race with an active tow',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live);
  h.state.simTime=m.airEndsAt+1;h.sim.runTicks(120);
  towPodTo(h,live,ent(h,m.tenderId).pos);
  assert.deepEqual(resolved(h),['rescued']);assert.deepEqual(grants(h),[260]);
});

test('missing original pod is interruption, not death or a replacement rescue',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),pod=ent(h,m.podId);
  h.state.entities.set(pod.id,{...pod,data:{...pod.data}});
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h),['lost']);assert.deepEqual(grants(h),[]);assert.deepEqual(reps(h),[]);
});

test('foreign helm ownership interrupts without erasing the successor or disabling pod',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),tender=ent(h,m.tenderId);
  h.state.simTime=m.airEndsAt+1;h.sim.runTicks(120);
  const foreign={moveX:.2};tender.data.intent=foreign;h.sim.runTicks(120);
  assert.deepEqual(resolved(h),['lost']);assert.equal(tender.data.intent,foreign);
  assert.equal(tender.data.despawnAt,undefined);assert.equal(ent(h,m.podId).data.masslineTetherable,true);
});

test('physical pickup admits only one terminal result through synchronous reentry',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),d=h.sim.registry.get('encounterDirector');
  const remove=d.helpers.removeEntity;let calls=0;
  d.helpers.removeEntity=(id,opts)=>{
    calls++;disputeRuntime.tick(d,live,h.state,h.state.simTime);
    const result=remove(id,opts);
    disputeRuntime.tick(d,live,h.state,h.state.simTime);
    disputeRuntime._settle(d,live,m,'claimed');
    return result;
  };
  towPodTo(h,live,ent(h,m.tenderId).pos);
  assert.equal(calls,1);assert.deepEqual(resolved(h),['rescued']);assert.deepEqual(grants(h),[260]);
});

test('known removal failure and throw leave an available pod and permit a later real handoff',()=>{
  for(const kind of ['false','throw']){
    const h=makeHarness(),live=fire(h),m=mOf(live),d=h.sim.registry.get('encounterDirector');
    const remove=d.helpers.removeEntity;
    d.helpers.removeEntity=()=>{if(kind==='throw')throw Error('fixture rejection');return false;};
    towPodTo(h,live,ent(h,m.tenderId).pos);
    assert.deepEqual(resolved(h),[]);assert.deepEqual(grants(h),[]);
    assert.equal(ent(h,m.podId).data.masslineTetherable,true);
    d.helpers.removeEntity=remove;h.sim.runTicks(120);
    assert.deepEqual(resolved(h),['rescued']);assert.deepEqual(grants(h),[260]);
  }
});

test('a callback throw after authoritative removal does not resurrect or double-pay the survivor',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),d=h.sim.registry.get('encounterDirector');
  const remove=d.helpers.removeEntity;
  d.helpers.removeEntity=(id,opts)=>{remove(id,opts);throw Error('downstream listener');};
  towPodTo(h,live,ent(h,m.tenderId).pos);
  assert.equal(ent(h,m.podId),undefined);assert.deepEqual(resolved(h),['rescued']);
  assert.deepEqual(grants(h),[260]);
});

test('committed capture releases only the current original claimant helm, leaving the pod available',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),tender=ent(h,m.tenderId);
  h.state.simTime=m.airEndsAt+1;h.sim.runTicks(120);
  const packet=tender.data.intent;
  h.bus.emit('ship:captured',{targetId:tender.id,vesselId:'other'});
  assert.equal(tender.data.intent,packet);
  tender.flags.persistent=true;tender.data.vesselId='fixture:claimant';
  h.bus.emit('ship:captured',{targetId:tender.id,vesselId:tender.data.vesselId});
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h),['lost']);assert.deepEqual(grants(h),[]);
  assert.equal(tender.data.intent,undefined);assert.equal(tender.data.despawnAt,undefined);
  assert.equal(ent(h,m.podId).data.masslineTetherable,true);
});

test('pre-burn foreign controller and role reassignment keep their hull out of scene retirement',()=>{
  for(const mode of ['intent','role']){
    const h=makeHarness(),live=fire(h),m=mOf(live),tender=ent(h,m.tenderId);
    const packet={moveZ:.4};
    if(mode==='intent')tender.data.intent=packet;
    else {tender.data.ai.encounterRole='successor';live.roles[tender.id]='successor';}
    h.sim.runTicks(120);
    assert.deepEqual(resolved(h),['lost']);assert.equal(tender.data.despawnAt,undefined);
    if(mode==='intent')assert.equal(tender.data.intent,packet);
    assert.equal(ent(h,m.podId).data.masslineTetherable,true);
  }
});

test('synchronous custody change during pod removal finalizes current scene neutrally',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),d=h.sim.registry.get('encounterDirector'),tender=ent(h,m.tenderId);
  const remove=d.helpers.removeEntity;
  d.helpers.removeEntity=(id,opts)=>{
    const result=remove(id,opts);
    tender.flags.persistent=true;tender.data.vesselId='fixture:handoff';
    h.bus.emit('ship:captured',{targetId:tender.id,vesselId:tender.data.vesselId});
    return result;
  };
  towPodTo(h,live,tender.pos);
  assert.deepEqual(resolved(h),['lost']);assert.deepEqual(grants(h),[]);
  assert.equal(h.state.encounterDirector.live[live.id],undefined);
  assert.equal(tender.data.despawnAt,undefined);
});

test('synchronous restore supersedes old removal without touching replacement-world pod or receipt',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),d=h.sim.registry.get('encounterDirector');
  const remove=d.helpers.removeEntity;let replacement;
  d.helpers.removeEntity=(id,opts)=>{
    const old=ent(h,id),result=remove(id,opts);
    h.bus.emit('save:restoring',{});
    replacement={...old,alive:true,data:{...old.data}};
    h.state.entities.set(id,replacement);
    h.state.encounterDirector.live={};
    return result;
  };
  towPodTo(h,live,ent(h,m.tenderId).pos);
  assert.deepEqual(resolved(h),[]);assert.deepEqual(grants(h),[]);
  assert.equal(ent(h,m.podId),replacement);assert.equal(replacement.alive,true);
});

test('stationary player hook does not earn NPC-work pay or permit NPC theft; meaningful transport wins',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),pod=ent(h,m.podId),tender=ent(h,m.tenderId);
  const start={...pod.pos};
  h.state.simTime=m.airEndsAt+1;h.sim.runTicks(120);
  // Boundary placement only. Separate native route proves real player flight and kernel tow.
  tender.pos={x:pod.pos.x+tender.radius+pod.radius+25,z:pod.pos.z};
  tender.vel={...pod.vel};
  h.state.combat||={};h.state.combat.attachments={byId:{
    rescue:{state:'active',ownerId:h.player.id,targetId:pod.id,ownerGeneration:h.player.occupantGeneration,targetGeneration:pod.occupantGeneration}
  }};
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h),[]);assert.deepEqual(grants(h),[]);assert.equal(ent(h,m.podId),pod);
  for(const travel of [99,101]){
    pod.pos={x:start.x+travel,z:start.z};
    tender.pos={x:pod.pos.x+tender.radius+pod.radius+25,z:pod.pos.z};
    h.sim.runTicks(120);
    assert.deepEqual(grants(h),travel===99?[]:[260]);
  }
  assert.deepEqual(resolved(h),['rescued']);
});

test('releasing an unmoved hooked pod permits attended NPC recovery without player pay',()=>{
  const h=makeHarness(),live=fire(h),m=mOf(live),pod=ent(h,m.podId),tender=ent(h,m.tenderId);
  h.state.simTime=m.airEndsAt+1;h.sim.runTicks(120);
  tender.pos={x:pod.pos.x+tender.radius+pod.radius+25,z:pod.pos.z};tender.vel={...pod.vel};
  h.state.combat||={};h.state.combat.attachments={byId:{
    rescue:{state:'active',ownerId:h.player.id,targetId:pod.id,ownerGeneration:h.player.occupantGeneration,targetGeneration:pod.occupantGeneration}
  }};
  h.sim.runTicks(120);assert.deepEqual(resolved(h),[]);
  h.state.combat.attachments.byId.rescue.state='released';h.sim.runTicks(120);
  assert.deepEqual(resolved(h),['claimed']);assert.deepEqual(grants(h),[]);
});

test('stale owner, pod and controller generations cannot turn an old active line into a rescue',()=>{
  for(const mode of ['owner','pod','controller']){
    const h=makeHarness(),live=fire(h),m=mOf(live),pod=ent(h,m.podId),tender=ent(h,m.tenderId);
    pod.pos={x:tender.pos.x+tender.radius+pod.radius+25,z:tender.pos.z};pod.vel={...tender.vel};
    const line={state:'active',ownerId:h.player.id,targetId:pod.id,
      ownerGeneration:h.player.occupantGeneration,targetGeneration:pod.occupantGeneration};
    if(mode==='owner')line.ownerGeneration++;
    if(mode==='pod')line.targetGeneration++;
    if(mode==='controller'){
      line.ownerId=tender.id;line.ownerGeneration=tender.occupantGeneration;
      line.controllerId=h.player.id;line.controllerGeneration=h.player.occupantGeneration+1;
    }
    h.state.combat||={};h.state.combat.attachments={byId:{rescue:line}};
    h.sim.runTicks(120);
    assert.deepEqual(resolved(h),[]);assert.deepEqual(grants(h),[]);assert.equal(ent(h,m.podId),pod);
    line.ownerGeneration=ent(h,line.ownerId).occupantGeneration;
    line.targetGeneration=pod.occupantGeneration;
    if(line.controllerId!=null)line.controllerGeneration=h.player.occupantGeneration;
    h.sim.runTicks(120);assert.deepEqual(resolved(h),['rescued']);assert.deepEqual(grants(h),[260]);
  }
});

test('survivor capsule is bound before spawn publication and survives worker presentation', async (t) => {
  const { packagedPropSpec } = await import('../src/render/visualOverrides.js');
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { createReadModel, applySpawnInfos } = await import('../scripts/lib/simReadModel.mjs');
  const h = makeHarness();
  let eventPod = null, journalPod = null;
  const snapshot = entity => structuredClone({ id: entity.id, type: entity.type,
    alive: entity.alive, radius: entity.radius, data: entity.data });
  const core = h.sim.registry.get('core');
  const { createPresentationJournal } = await import('../src/core/presentationJournal.js');
  const journal = core.presentationJournal = createPresentationJournal();
  const recordSpawn = journal.recordSpawn;
  journal.recordSpawn = function (tick, entity) {
    if (entity.data?.storyPropKind === 'm09_escape_pod') journalPod = snapshot(entity);
    return recordSpawn.call(this, tick, entity);
  };
  h.bus.on('entity:spawned', ({ entity }) => {
    if (entity.data?.storyPropKind === 'm09_escape_pod') eventPod = snapshot(entity);
  });
  const live = fire(h);
  journal.recordSpawn = recordSpawn;
  assert.ok(journalPod, 'first recordSpawn carries the lifeboat identity');
  assert.ok(eventPod, 'first entity:spawned carries the lifeboat identity');
  // Exercise the public worker API, which owns the private entity-info serializer.
  const oldStorage = globalThis.localStorage;
  const worker = createSimHost();
  t.after(() => {
    worker.shutdown();
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
  });
  const { readFileSync } = await import('node:fs');
  const scenarioContract = JSON.parse(readFileSync(
    new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  await worker.init({ profile: 'production', seed: SEED, scenarioContract });
  const originalPod = ent(h, mOf(live).podId);
  const workerPod = worker.host.runtime.spawn({
    type: eventPod.type, pos: { ...originalPod.pos }, radius: eventPod.radius,
    mass: originalPod.mass, physicsBody: structuredClone(originalPod.physicsBody),
    data: structuredClone(eventPod.data),
  });
  const reply = structuredClone(await worker.tick({ steps: 0, dt: 1 / 60, seq: 1 }));
  const spawnInfo = reply.spawnInfos.find(info => info.entityId === workerPod.id);
  assert.ok(spawnInfo, 'actual worker spawn reply carries the survivor');
  const model = createReadModel();
  applySpawnInfos(model, [spawnInfo]);
  for (const pod of [originalPod, journalPod, eventPod, spawnInfo, model.entities.get(workerPod.id)]) {
    assert.equal(pod.data.assetRef, 'asset.slice.civilian_pod');
    assert.equal(pod.radius, 5);
    assert.equal(pod.data.distressBeacon, undefined);
    assert.equal(pod.data.rescuePriority, undefined);
    assert.deepEqual(packagedPropSpec(pod), {
      file: 'places/place_47a_rescue_capsule.glb', slot: 'place',
      radius: undefined, hideImmediately: true,
    });
  }
  const pod = ent(h, mOf(live).podId);
  const baseline = makeHarness();
  const baselineDirector = baseline.sim.registry.get('encounterDirector');
  const baselineSpawn = baselineDirector.spawnProp;
  baselineDirector.spawnProp = function (live, opts) {
    if (opts.storyPropKind === 'm09_escape_pod') {
      const { assetRef, ...priorSpec } = opts;
      return baselineSpawn.call(this, live, priorSpec);
    }
    return baselineSpawn.call(this, live, opts);
  };
  const prior = ent(baseline, mOf(fire(baseline)).podId);
  const physical = e => ({ type: e.type, radius: e.radius, mass: e.mass,
    physicsBody: structuredClone(e.physicsBody), tetherable: e.data.tetherable,
    masslineTetherable: e.data.masslineTetherable });
  assert.deepEqual(physical(pod), physical(prior), 'visual identity cannot change normalized native body');
  assert.equal(pod.physicsBody.mass, 10);
  assert.equal(pod.physicsBody.shape, 'ball');
  assert.equal(pod.data.masslineTetherable, true);
  assert.equal(packagedPropSpec({ type: 'payload', radius: 5, data: {} }).file,
    'pods/pod_cargo_container.glb', 'ordinary freight keeps its freight model');
});
