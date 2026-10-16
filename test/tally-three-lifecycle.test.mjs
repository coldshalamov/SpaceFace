import test from 'node:test';
import assert from 'node:assert/strict';
import {physics} from '../src/core/physics.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
let originalFeatures;test.before(()=>{originalFeatures=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});test.after(()=>restoreFeatureMaps(originalFeatures));
import {createSimulation} from '../src/core/sim.js';
import {createGameState} from '../src/core/gameState.js';
import {salvage} from '../src/systems/salvage.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {tallyThree} from '../src/systems/tallyThree.js';
import {TALLY_THREE as T,tallyThreeBody} from '../src/data/tallyThree.js';
import {insertFarActor,promoteFarActor} from '../src/world/farActorTable.js';
function boot(){const state=createGameState(503);state.mode='flight';state.world.currentSectorId=T.sectorId;
 const sim=createSimulation({state,seed:503,systems:[physics,salvage,spawnBudget,tallyThree]});
 sim.bus.emit('sector:enter',{sectorId:T.sectorId});const owner=sim.registry.get('tallyThree');owner.update(1/60,state);
 const actor=tallyThreeBody(state,T.assessorId);assert.ok(actor);return {state,sim,owner,actor};}
test('actual live assessor shelf suppresses replacement on next owner cadence',()=>{const h=boot();try{
 const row=insertFarActor(h.state,h.actor,0,h.sim.helpers);h.sim.helpers.removeEntity(h.actor.id,{immediate:true,reason:'virtualize'});
 assert.equal(tallyThreeBody(h.state,T.assessorId),null);h.state.tick=60;h.owner.update(1/60,h.state);
 assert.equal(tallyThreeBody(h.state,T.assessorId),null,'shelved assessor is resident, not absent');
 assert.equal(h.state.world.farActors.rows.length,1);assert.equal(h.state.world.farActors.rows[0],row);
 }finally{h.sim.dispose();}});
test('actual shelf promotion retains authored assessor body and presentation',()=>{const h=boot();try{
 const expected=structuredClone(h.actor.physicsBody);const row=insertFarActor(h.state,h.actor,0,h.sim.helpers);
 h.sim.helpers.removeEntity(h.actor.id,{immediate:true,reason:'virtualize'});
 const restored=promoteFarActor(h.state,row.id,h.sim.helpers);assert.ok(restored);
 assert.equal(restored.data.placeId,'place_tally_three');assert.deepEqual(restored.physicsBody,expected);
 assert.equal(restored.data.cargoManifest,undefined);
 }finally{h.sim.dispose();}});
import {resolvePhysicsBodySpec} from '../src/core/physicsAuthority.js';
import {combat} from '../src/systems/combat.js';
import {traffic} from '../src/systems/traffic.js';
import {world} from '../src/systems/world.js';
import {save} from '../src/save/saveSystem.js';
import {captureEntityRecord,ensureWorldRecords} from '../src/world/worldRecords.js';
import {tallyThreeSource} from '../src/data/tallyThree.js';
import {serializeFarActorTable,restoreFarActorTable} from '../src/world/farActorTable.js';
import {tallyAssessorOccupancy} from '../src/world/tallyThreeIdentity.js';
const copy=v=>JSON.parse(JSON.stringify(v));
function shelf(h){const row=insertFarActor(h.state,h.actor,h.state.simTime,h.sim.helpers);h.sim.helpers.removeEntity(h.actor.id,{immediate:true,reason:'virtualize'});return row;}
for(const fault of ['duplicate-live','duplicate-far','wrong-def','wrong-shape','wrong-mass','wrong-phase','wrong-sector','lost','job-mirror'])test(`refuses ${fault} without replacing a claimed resident`,()=>{
 const h=boot();try{const row=shelf(h);
 if(fault==='duplicate-live')h.sim.spawn({type:'ship',data:{worldRecordId:T.assessorId}});
 if(fault==='duplicate-far'){const other=copy(row);other.id+=10000;h.state.world.farActors.rows.push(other);h.state.world.farActors.byId.set(other.id,other);}
 if(fault==='wrong-def')row.data.defId='ship_kestrel';
 if(fault==='wrong-shape')row.physicsBody.radius+=1;
 if(fault==='wrong-mass')row.mass+=1;
 if(fault==='wrong-phase')row.data.tallyThree={phase:'receipt',tick:0};
 if(fault==='wrong-sector')h.state.world.currentSectorId='sector_helios_prime';
 if(fault==='lost')h.sim.helpers.salvage.noteTally('assessorLost');
 if(fault==='job-mirror')row.jobId='foreign-job';
 const before=copy(row);assert.equal(promoteFarActor(h.state,row.id,h.sim.helpers),null);
 delete before.restoreRefusal;const after=copy(row);delete after.restoreRefusal;assert.deepEqual(after,before);
 h.state.tick+=60;const n=h.state.entityList.filter(e=>e.alive!==false).length;h.owner.update(1/60,h.state);
 assert.equal(h.state.entityList.filter(e=>e.alive!==false).length,n);
 }finally{h.sim.dispose();}});
test('repeated shelf serialize/restore promotes one same authored assessor with exact cargo job phase',()=>{const h=boot();try{
 h.actor.data.tallyThree={phase:'receipt',tick:12,receiptId:'accepted-claim'};
 h.actor.data.cargoManifest={manifestId:'retained-existing',lines:[{commodityId:'cmdty_electronics',qty:3}],totalQty:3};h.actor.data.jobId='retained-job';
 const phase=copy(h.actor.data.tallyThree),cargo=copy(h.actor.data.cargoManifest);
 for(let i=0;i<5;i++){const row=shelf(h);const wire=copy(serializeFarActorTable(h.state.world.farActors));restoreFarActorTable(h.state,wire);
 h.state.tick+=60;h.owner.update(1/60,h.state);assert.equal(tallyAssessorOccupancy(h.state).kind,'shelved');
 h.actor=promoteFarActor(h.state,row.id,h.sim.helpers);assert.ok(h.actor);assert.deepEqual(h.actor.data.tallyThree,phase);
 assert.deepEqual(h.actor.data.cargoManifest,cargo);assert.equal(h.actor.data.jobId,'retained-job');}
 }finally{h.sim.dispose();}});
test('actual combat death is terminal while virtualization is not; forged live receipt is ignored',async()=>{
 const h=boot();try{
 const player=h.sim.spawn({type:'ship',team:0,hull:100,pos:{x:h.actor.pos.x+100,z:h.actor.pos.z},data:{defId:'ship_kestrel'}});h.state.playerId=player.id;
 h.sim.bus.emit('entity:killed',{id:h.actor.id});assert.notEqual(tallyThreeSource(h.state).assessorLost,true);
 assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state),true);const row=shelf(h);assert.notEqual(tallyThreeSource(h.state).assessorLost,true);
 h.actor=promoteFarActor(h.state,row.id,h.sim.helpers);assert.ok(h.actor);
 assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state),true);
 h.sim.step();assert.equal(h.sim.registry.get('physics')._sg02.records.get(h.actor.id).colliders.length,1);
 // Registered production combat kill is exercised against the same current occupant.
 combat.kill.call({state:h.state,bus:h.sim.bus,helpers:h.sim.helpers},h.actor,null);
 assert.equal(tallyThreeSource(h.state).assessorLost,true);
 h.state.tick+=60;h.owner.update(1/60,h.state);assert.equal(tallyAssessorOccupancy(h.state).kind,'absent');
 }finally{h.sim.dispose();}});
test('generic traffic adoption does not mint freight for named assessor',()=>{const h=boot();try{
 const ctx=Object.create(traffic);ctx.state=h.state;ctx._active=[];h.state.traffic={freighters:[]};let minted=0;
 ctx._assignManifest=()=>{minted++;throw Error('generic freight forbidden');};
 ctx._adoptRematerializedTraffic(T.sectorId,[]);assert.equal(minted,0);assert.equal(h.actor.data.cargoManifest,undefined);assert.deepEqual(h.state.traffic.freighters,[]);
 }finally{h.sim.dispose();}});
test('durable capture and actual world rematerialization retain phase and authored body',()=>{const h=boot();try{
 h.actor.data.tallyThree={phase:'receipt',tick:8,receiptId:'finite-receipt'};
 const rec=captureEntityRecord(h.actor,{sectorId:T.sectorId,tick:12,extra:{unrelated:'preserved'}});
 assert.deepEqual(rec.extra,{unrelated:'preserved',tallyThreeIdentityVersion:1,tallyThreeBody:h.actor.physicsBody,tallyThree:h.actor.data.tallyThree});
 ensureWorldRecords(h.state.world).byId[rec.recordId]=rec;h.sim.helpers.removeEntity(h.actor.id,{immediate:true,reason:'virtualize'});
 const ctx=Object.create(world);ctx.state=h.state;ctx.helpers=h.sim.helpers;ctx.bus=h.sim.bus;
 const restored=ctx._spawnFromDurableRecord(rec,T.sectorId);assert.ok(restored);assert.equal(restored.data.placeId,'place_tally_three');
 assert.deepEqual(restored.data.tallyThree,rec.extra.tallyThree);assert.equal(restored.physicsBody.mass,68);assert.equal(restored.data.cargoManifest,undefined);
 }finally{h.sim.dispose();}});
for(const shelved of [false,true])test(`real writer and Continue preserves ${shelved?'shelved':'durable live'} assessor phase without freight`,async()=>{
 const state=createGameState(503);state.mode='flight';state.world.currentSectorId=T.sectorId;
 const sim=createSimulation({state,seed:503,systems:[physics,world,salvage,spawnBudget,tallyThree,save]});
 try{
 const player=sim.spawn({type:'ship',team:0,pos:{x:T.pos.x,z:T.pos.z},hull:140,flags:{persistent:true},data:{defId:'ship_kestrel'}});state.playerId=player.id;
 sim.bus.emit('sector:enter',{sectorId:T.sectorId});sim.registry.get('tallyThree').update(1/60,state);
 const actor=tallyThreeBody(state,T.assessorId);assert.ok(actor);actor.data.tallyThree={phase:'disputed',tick:0};
 assert.equal(await sim.registry.get('physics').prepareBackend(state),true);
 actor.physicsBody.thrusters[0].health=0.4;actor.physicsBody.revision++;const expectedBody=copy(actor.physicsBody);
 if(shelved){insertFarActor(state,actor,state.simTime,sim.helpers);sim.helpers.removeEntity(actor.id,{immediate:true,reason:'virtualize'});}
 const saver=sim.registry.get('save'),envelope=copy(saver.serialize('tally-lifecycle'));
 assert.equal(saver.loadEnvelope(envelope,'tally-lifecycle'),true);state.mode='flight';
 let restored=tallyThreeBody(state,T.assessorId);
 if(shelved){const rows=state.world.farActors.rows.filter(r=>r.data?.worldRecordId===T.assessorId);assert.equal(rows.length,1);restored=promoteFarActor(state,rows[0].id,sim.helpers);}
 assert.ok(restored);assert.deepEqual(restored.data.tallyThree,{phase:'disputed',tick:0});assert.equal(restored.data.cargoManifest,undefined);
 assert.deepEqual(restored.physicsBody,expectedBody);
 assert.equal(await sim.registry.get('physics').prepareBackend(state),true);
 const native=sim.registry.get('physics')._sg02.records.get(restored.id);assert.ok(native);assert.equal(native.body.mass(),68);assert.equal(native.colliders.length,1);
 assert.equal(restored.physicsBody.mass,68);assert.equal(tallyAssessorOccupancy(state).kind,'live');
 }finally{sim.dispose();}
});

test('ordinary normalized body survives shelf promotion without healing thrusters',()=>{const h=boot();try{
 resolvePhysicsBodySpec(h.actor);h.actor.physicsBody.thrusters[0].health=0.4;h.actor.physicsBody.revision=2;
 const body=copy(h.actor.physicsBody),row=shelf(h);const e=promoteFarActor(h.state,row.id,h.sim.helpers);assert.ok(e);assert.deepEqual(e.physicsBody,body);
 }finally{h.sim.dispose();}});

for(const fault of ['negative-revision','negative-health','unknown-thruster','unknown-attachment','unknown-body'])test(`normalized contract refuses ${fault} unchanged`,()=>{const h=boot();try{
 resolvePhysicsBodySpec(h.actor);const row=shelf(h);
 if(fault==='negative-revision')row.physicsBody.revision=-5;
 if(fault==='negative-health')row.physicsBody.thrusters[0].health=-9;
 if(fault==='unknown-thruster')row.physicsBody.thrusters[0].hidden=true;
 if(fault==='unknown-attachment')row.physicsBody.attachmentPoints.hidden={x:0,y:0,z:0};
 if(fault==='unknown-body')row.physicsBody.hidden=true;
 const before=copy(row);assert.equal(promoteFarActor(h.state,row.id,h.sim.helpers),null);
 const after=copy(row);delete after.restoreRefusal;assert.deepEqual(after,before);
 }finally{h.sim.dispose();}});

test('durable-only existing assessor defers owner mint and preserves cargo job phase',()=>{const h=boot();try{
 h.actor.data.cargoManifest={manifestId:'retained',lines:[{commodityId:'cmdty_electronics',qty:3}],totalQty:3};h.actor.data.jobId='existing-job';h.actor.data.tallyThree={phase:'disputed',tick:0};
 const rec=captureEntityRecord(h.actor,{sectorId:T.sectorId,tick:0});ensureWorldRecords(h.state.world).byId[rec.recordId]=rec;
 h.sim.helpers.removeEntity(h.actor.id,{immediate:true,reason:'virtualize'});h.state.tick=60;h.owner.update(1/60,h.state);
 assert.equal(tallyThreeBody(h.state,T.assessorId),null);
 const ctx=Object.create(world);ctx.state=h.state;ctx.helpers=h.sim.helpers;ctx.bus=h.sim.bus;
 const restored=ctx._spawnFromDurableRecord(rec,T.sectorId);assert.ok(restored);assert.deepEqual(restored.data.cargoManifest,rec.cargoManifest);assert.equal(restored.data.jobId,rec.jobId);assert.deepEqual(restored.data.tallyThree,rec.extra.tallyThree);
 }finally{h.sim.dispose();}});
test('top-level far identity claim cannot be treated as absent or promoted generically',()=>{const h=boot();try{
 const row=shelf(h);row.worldRecordId=T.assessorId;row.data.worldRecordId='forged';h.state.tick=60;h.owner.update(1/60,h.state);
 assert.equal(tallyThreeBody(h.state,T.assessorId),null);assert.equal(promoteFarActor(h.state,row.id,h.sim.helpers),null);
 }finally{h.sim.dispose();}});

// The named-owner exclusion must not suppress ordinary freight adoption.
test('ordinary unrelated freighter still adopts once and retains its manifest',()=>{const h=boot();try{
 const other=h.sim.spawn({type:'ship',team:2,pos:{x:T.pos.x+500,z:T.pos.z},hull:100,
   data:{worldRecordId:'ordinary:freighter',trafficRole:'hauler',homeSectorId:T.sectorId}});
 const ctx=Object.create(traffic);ctx.state=h.state;ctx._active=[];ctx._rng=()=>0.5;h.state.traffic={freighters:[]};
 let minted=0;const manifest={manifestId:'ordinary-lot',lines:[{commodityId:'cmdty_scrap_metal',qty:2}],totalQty:2};
 ctx._assignManifest=(entity)=>{assert.equal(entity,other);minted++;entity.data.cargoManifest=manifest;return manifest;};
 ctx._adoptRematerializedTraffic(T.sectorId,[]);ctx._adoptRematerializedTraffic(T.sectorId,[]);
 assert.equal(minted,1);assert.equal(h.state.traffic.freighters.length,1);assert.equal(h.state.traffic.freighters[0].id,other.id);
 assert.equal(h.state.traffic.freighters[0].manifest,manifest);assert.equal(other.data.cargoManifest,manifest);
 assert.equal(h.actor.data.cargoManifest,undefined);
 }finally{h.sim.dispose();}});

test('legacy durable assessor restores finite state with canonical body and truthful patrol fallback', () => {
  const h = boot();
  try {
    const expectedBody = copy(h.actor.physicsBody);
    h.actor.pos.x += 17;
    h.actor.pos.z -= 9;
    h.actor.hull = 53;
    h.actor.data.cargoManifest = {manifestId: 'legacy-lot', lines: [{commodityId: 'cmdty_electronics', qty: 2}], totalQty: 2};
    h.actor.data.jobId = 'legacy-job';
    const record = captureEntityRecord(h.actor, {sectorId: T.sectorId, tick: 12});
    delete record.extra.tallyThreeIdentityVersion;
    delete record.extra.tallyThreeBody;
    delete record.extra.tallyThree;
    ensureWorldRecords(h.state.world).byId[record.recordId] = record;
    h.sim.helpers.removeEntity(h.actor.id, {immediate: true, reason: 'virtualize'});
    h.state.tick = 42;
    const context = Object.assign(Object.create(world), {state: h.state, helpers: h.sim.helpers, bus: h.sim.bus});
    const restored = context._spawnFromDurableRecord(record, T.sectorId);
    assert.ok(restored);
    assert.equal(restored.pos.x, record.pos.x);
    assert.equal(restored.pos.z, record.pos.z);
    assert.equal(restored.hull, 53);
    assert.deepEqual(restored.data.cargoManifest, record.cargoManifest);
    assert.equal(restored.data.jobId, 'legacy-job');
    assert.deepEqual(restored.physicsBody, expectedBody);
    assert.deepEqual(restored.data.tallyThree, {phase: 'patrol', tick: 42});
    assert.equal(tallyAssessorOccupancy(h.state).kind, 'live');
  } finally {
    h.sim.dispose();
  }
});

test('damaged durable assessor restores body revision and thruster health without healing', () => {
  const h = boot();
  try {
    resolvePhysicsBodySpec(h.actor);
    h.actor.physicsBody.thrusters[0].health = 0.35;
    h.actor.physicsBody.revision = 7;
    h.actor.hull = 51;
    h.actor.data.tallyThree = {phase: 'disputed', tick: 14};
    const expectedBody = copy(h.actor.physicsBody);
    const record = captureEntityRecord(h.actor, {sectorId: T.sectorId, tick: 15});
    ensureWorldRecords(h.state.world).byId[record.recordId] = record;
    h.sim.helpers.removeEntity(h.actor.id, {immediate: true, reason: 'virtualize'});
    const context = Object.assign(Object.create(world), {state: h.state, helpers: h.sim.helpers, bus: h.sim.bus});
    const restored = context._spawnFromDurableRecord(record, T.sectorId);
    assert.ok(restored);
    assert.deepEqual(restored.physicsBody, expectedBody);
    assert.equal(restored.hull, 51);
    assert.deepEqual(restored.data.tallyThree, {phase: 'disputed', tick: 14});
  } finally {
    h.sim.dispose();
  }
});
