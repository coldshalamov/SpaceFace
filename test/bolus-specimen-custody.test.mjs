import test from 'node:test';
import assert from 'node:assert/strict';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { serializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { BOLUS_SECTOR_ID as SID, BOLUS_SPECIMEN_KEYS as KEYS, bolusSpecimenStateKey as stateKey,
  readBolusSpecimenState, planBolusLayout, commitBolusLatch } from '../src/data/theBolus.js';
import { materializeBolus, captureBolusSpecimens, captureBolusRib } from '../src/systems/theBolus.js';
import { runNewGameSimBoot } from '../src/core/newGameBoot.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
const origin = { x: 120000, z: -47000 };
const rows = (s, key) => s.entityList.filter(e => e.alive && e.data?.bolus?.key === key);
const near = (a,b,t=1e-5) => assert(Math.abs(a-b)<=t, `${a} != ${b}`);
const external = (r, fn) => { const old=snapshotFeatureMaps(); applyFeatureConfigToMaps(r.config.features); try{return fn();}finally{restoreFeatureMaps(old);} };
function fixture(flags={}) {
  const sim=createSimulation({seed:71,systems:[]}), s=sim.state; s.settings.gameplay.physicsBackend='legacy'; s.mode='flight'; s.world.currentSectorId=SID;
  Object.assign(ensureAlienEcologyState(s).sectorFlags,flags); const physics={};
  const world={state:s,bus:sim.bus,helpers:{spawnEntity:spec=>sim.spawn(spec)},registry:{get:k=>k==='physics'?physics:null},
    _toGlobal:p=>({x:p.x+origin.x,z:p.z+origin.z}),_sectorOrigin:()=>origin};
  const materialize=()=>materializeBolus(world,{id:SID},{dressing:[]});materialize();s.entityIndex.ready=false;
  return {sim,s,world,physics,materialize,get:k=>rows(s,k)[0],flags:()=>ensureAlienEcologyState(s).sectorFlags,close:()=>{physics._sg02?.dispose();sim.dispose();}};
}

test('five existing authored bodies keep layout, identity, geometry, rewards and legacy provenance',()=>{
 const h=fixture({'bolus:cyst':true,'bolus:bezoar:bolus_bezoar_0':true});try{
  for(const key of KEYS){const e=h.get(key), spec=planBolusLayout(71).find(x=>x.key===key);assert(e);near(e.pos.x-origin.x,spec.x);near(e.pos.z-origin.z,spec.z);assert.equal(e.mass,spec.mass);assert.equal(e.radius,spec.radius);assert.equal(e.hull,48);assert.equal(h.flags()[stateKey(key)].source,'authored');}
  h.materialize();for(const key of KEYS)assert.equal(rows(h.s,key).length,1);
  assert.equal(commitBolusLatch(h.flags(),'cyst','bolus_cyst',9,0),null);
  assert.equal(commitBolusLatch(h.flags(),'bezoar','bolus_bezoar_0',9,0),null);
  const reward=commitBolusLatch(h.flags(),'bezoar','bolus_bezoar_1',9,0);assert.equal(reward.qty,1);assert(h.get('bolus_bezoar_1'));
  assert.equal(readBolusSpecimenState(h.flags(),'bolus_drum_0'),null);
  assert.equal(h.flags()[stateKey('bolus_drum_0')],undefined);
  const returned=fixture(serializeAlienEcologyState(h.s).sectorFlags);try{assert(returned.get('bolus_bezoar_1'));assert.equal(commitBolusLatch(returned.flags(),'bezoar','bolus_bezoar_1',9,0),null);}finally{returned.close();}
 }finally{h.close();}
});

test('partial legacy state quarantines malformed named rows individually, never unknown keys',()=>{
 const key=KEYS[0],valid={version:1,key,status:'present',source:'native',x:321,z:-456,vx:2,vz:-3,rot:.2,spin:.4,hull:17};
 for(const bad of [null,{}, {version:2,key,status:'lost'}, {...valid,key:'bolus_cyst'}, {...valid,x:Infinity}, {...valid,vx:1e6}, {...valid,hull:0}, {...valid,source:'legacy-lodged'}]){
  const h=fixture({[stateKey(key)]:bad,[stateKey('foreign')]:valid});try{assert.equal(h.get(key),undefined);for(const other of KEYS.slice(1))assert(h.get(other));assert.equal(readBolusSpecimenState(h.flags(),'foreign'),null);}finally{h.close();}
 }
 const h=fixture({[stateKey(key)]:valid});try{near(h.get(key).pos.x-origin.x,321);assert.equal(h.get(key).hull,17);assert.equal(h.flags()[stateKey(KEYS[1])].source,'authored');}finally{h.close();}
});

test('native Massline displaces each existing specimen and capture is read-only, guarded and bounded',async()=>{
 for(const key of KEYS){const h=fixture();try{
  const e=h.get(key),tug=h.sim.spawn({type:'ship',hull:100,mass:1000,radius:10,pos:{x:e.pos.x+150,z:e.pos.z},collides:true,physicsBody:{dynamic:true,mass:1000,radius:10,shape:'ball'}});
  const n=h.physics._sg02=await createSg02DynamicBodyOwner({frameOrigin:origin});h.s.settings.gameplay.physicsBackend='rapier-dynamic';
  const step=()=>{h.s.tick++;n.syncFromEntities([e,tug]);n.step(1/60,h.s.tick);};step();
  assert(n.createAttachment({attachmentId:'specimen-line',defId:'attachment_massline',ownerId:tug.id,targetId:e.id,sourceWorld:{...tug.pos},targetWorld:{...e.pos},restLength:100,tick:h.s.tick}));
  const start=e.pos.x;for(let i=0;i<90;i++){queuePhysicsImpulse(tug,{x:100,y:0,z:0});step();}assert(e.pos.x>start+1);e.hull=21;
  captureBolusSpecimens(h.world);const row={...h.flags()[stateKey(key)]};assert.equal(row.source,'native');assert.equal(row.hull,21);
  const rec=n.records.get(e.id);near(row.x,rec.body.translation().x);near(row.vx,rec.body.linvel().x);
  e.pos.x+=500;e.vel.x+=500;
  const list=h.s.entityList;h.s.entityList=new Proxy(list,{get(){throw Error('whole-world scan');}});
  const setters=['setTranslation','setRotation','setLinvel','setAngvel'],old=setters.map(k=>rec.body[k]);setters.forEach(k=>rec.body[k]=()=>{throw Error('native mutation');});
  try{captureBolusSpecimens(h.world);assert.deepEqual(h.flags()[stateKey(key)],row);}finally{setters.forEach((k,i)=>rec.body[k]=old[i]);h.s.entityList=list;}
  for(const field of ['_nativeRestorePending','_nativeRestoreDeferred']){h.physics[field]=true;captureBolusSpecimens(h.world);assert.deepEqual(h.flags()[stateKey(key)],row);h.physics[field]=false;}
  rec._postStepReadTick--;captureBolusSpecimens(h.world);assert.deepEqual(h.flags()[stateKey(key)],row);rec._postStepReadTick++;
  const spec=e.physicsBody;e.physicsBody={...spec,mass:spec.mass+1};captureBolusSpecimens(h.world);assert.deepEqual(h.flags()[stateKey(key)],row);e.physicsBody=spec;
  const returned=fixture(serializeAlienEcologyState(h.s).sectorFlags);try{near(returned.get(key).pos.x-origin.x,row.x);near(returned.get(key).vel.x,row.vx);assert.equal(returned.get(key).hull,21);}finally{returned.close();}
 }finally{h.close();}}
});

test('unexplained missing, recycled, or retagged lives remain unavailable across reload',()=>{
 for(const mutate of [h=>h.s.entities.delete(h.get(KEYS[0]).id),h=>h.get(KEYS[0]).occupantGeneration++,h=>h.get(KEYS[0]).data={...h.get(KEYS[0]).data},h=>h.get(KEYS[0]).data.bolus.key='bolus_bezoar_1',h=>h.get(KEYS[0]).alive=false]){
  const h=fixture();try{mutate(h);captureBolusSpecimens(h.world);assert.equal(h.flags()[stateKey(KEYS[0])].status,'unavailable');
   const returned=fixture(serializeAlienEcologyState(h.s).sectorFlags);try{assert.equal(returned.get(KEYS[0]),undefined);for(const key of KEYS.slice(1))assert(returned.get(key));}finally{returned.close();}
  }finally{h.close();}
 }
});

test('exact death is terminal before event flush; stale death cannot take replacement custody',()=>{
 const h=fixture();try{const key=KEYS[0],e=h.get(key);e.hull=0;e.alive=false;captureBolusSpecimens(h.world);assert.equal(h.flags()[stateKey(key)].status,'lost');h.materialize();assert.equal(h.get(key),undefined);
 const returned=fixture(serializeAlienEcologyState(h.s).sectorFlags);try{assert.equal(returned.get(key),undefined);}finally{returned.close();}
 }finally{h.close();}
 const a=fixture();try{const key=KEYS[0],old=a.get(key);captureBolusSpecimens(a.world,SID,{reason:'evict'});old.alive=false;a.s.entities.delete(old.id);a.materialize();const replacement=a.get(key);assert(replacement);assert.notEqual(replacement,old);
 old.hull=0;a.sim.bus.emit('entity:destroyed',{entity:old,id:old.id});a.sim.bus.flush?.();assert.equal(a.flags()[stateKey(key)].status,'present');
 }finally{a.close();}
});

test('retirement eligibility, wrong-sector no-op and rib return contract stay separate',()=>{
 for(const opts of [{reason:'strip_full',despawnIds:new Set()},{reason:'evict',protected:true}]){const h=fixture();try{h.world._isProtectedFromResidency=()=>opts.protected===true;captureBolusSpecimens(h.world,SID,opts);const e=h.get(KEYS[0]);e.alive=false;h.s.entities.delete(e.id);h.materialize();assert.equal(h.get(KEYS[0]),undefined);captureBolusSpecimens(h.world);assert.equal(h.flags()[stateKey(KEYS[0])].status,'unavailable');}finally{h.close();}}
 const h=fixture();try{const before=JSON.stringify(h.flags());assert.equal(captureBolusRib(h.world,'other'),false);assert.equal(captureBolusSpecimens(h.world,'other'),false);assert.equal(JSON.stringify(h.flags()),before);assert.equal(captureBolusRib(h.world),true);}finally{h.close();}
});

test('ordinary production Save/Continue, actual sector retirement, death and New Game preserve finite specimens',async()=>{
 let r=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:71});try{
  let s=r.state;s.mode='flight';const player=r.spawn(makeShipEntitySpec('ship_hawser',{isPlayer:true,player:s.player,pos:{x:0,z:0},fittings:[]}));s.playerId=player.id;
  external(r,()=>r.getSystem('world').enterSector(SID,{continuous:false,noTeleport:true,placePlayer:false}));
  external(r,()=>r.getSystem('world').relocatePlayerInSector({...r.getSystem('world')._toGlobal({x:0,z:-300},SID),heading:0},{reason:'specimen-native-fixture'}));
  const physics=r.getSystem('physics');assert.equal(await physics.prepareBackend(s,{reset:true}),true);r.step(1/60);r.step(1/60);
  const initial=new Map(KEYS.map(k=>[k,rows(s,k)[0].pos.x]));
  for(const key of KEYS){const e=rows(s,key)[0];queuePhysicsImpulse(e,{x:1800,y:0,z:600});e.hull=19;}
  for(let i=0;i<12;i++)external(r,()=>physics.update(1/60,s));
  for(const key of KEYS)assert(rows(s,key)[0].pos.x>initial.get(key), `${key} native displacement`);
  const cargo=JSON.stringify(s.player.cargo.items),credits=s.player.credits;
  const envelope=r.getSystem('save').serialize('bolus-specimens');const saved=envelope.data.world.alienEcology.sectorFlags;
  for(const key of KEYS){assert.equal(saved[stateKey(key)].source,'native');assert.equal(saved[stateKey(key)].hull,19);}
  r.dispose();r=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:72});assert.equal(await r.getSystem('save').loadEnvelope(envelope,'bolus-specimens'),true);s=r.state;s.mode='flight';
  const w=r.getSystem('world'),o=w._sectorOrigin(SID);
  for(const key of KEYS){const e=rows(s,key)[0],row=saved[stateKey(key)];assert.equal(rows(s,key).length,1);near(e.pos.x-o.x,row.x);near(e.pos.z-o.z,row.z);near(e.vel.x,row.vx);assert.equal(e.hull,19);}
  assert.equal(JSON.stringify(s.player.cargo.items),cargo);assert.equal(s.player.credits,credits);
  assert.equal(await r.getSystem('physics').prepareBackend(s),true);
  const n=r.getSystem('physics')._sg02;for(const key of KEYS){const b=n.records.get(rows(s,key)[0].id).body;near(b.translation().x+n._frameOrigin.x-o.x,saved[stateKey(key)].x,.002);near(b.linvel().x,saved[stateKey(key)].vx);}
  r.step(1/60);r.step(1/60);
  external(r,()=>w.enterSector('sector_charon_expanse',{continuous:false,noTeleport:true,placePlayer:false}));external(r,()=>w._demoteSectorToRecordOnly(SID));
  const shelf=structuredClone(ensureAlienEcologyState(s).sectorFlags);for(const key of KEYS)assert.equal(rows(s,key).length,0);
  external(r,()=>w.enterSector(SID,{continuous:false,noTeleport:true,placePlayer:false}));
  for(const key of KEYS){assert.equal(rows(s,key).length,1);near(rows(s,key)[0].pos.x-o.x,shelf[stateKey(key)].x);assert.equal(rows(s,key)[0].hull,19);}
  assert.equal(await r.getSystem('physics').prepareBackend(s),true);r.step(1/60);r.step(1/60);
  // Fixture routes terminal damage through the combat owner with its explicit any-target option.
  // This does not assert that ordinary weapons accept fauna as damageable targets.
  for(const key of [KEYS[0],'bolus_cyst']){const e=rows(s,key)[0];external(r,()=>r.getHelpers().routeCombatDamage({attackerId:null,targetId:e.id,packet:{...scalarHitToDamagePacket({damage:1000,damageType:'thermal',source:{kind:'bolus-specimen-test'}}),flags:{allowAnyTarget:true}}}));assert.equal(e.alive,false);}
  const lost=r.getSystem('save').serialize('bolus-specimen-loss');for(const key of [KEYS[0],'bolus_cyst'])assert.equal(lost.data.world.alienEcology.sectorFlags[stateKey(key)].status,'lost');
  assert.equal(await r.getSystem('save').loadEnvelope(lost,'bolus-specimen-loss'),true);s=r.state;for(const key of [KEYS[0],'bolus_cyst'])assert.equal(rows(s,key).length,0);
  const oldMaps=snapshotFeatureMaps();applyFeatureConfigToMaps(r.config.features);
  try { assert.equal((await runNewGameSimBoot({state:s,helpers:r.getHelpers(),bus:r.bus,registry:{get:name=>r.getSystem(name)},opts:{seed:71},awaitPhysicsPrep:true})).ok,true); } finally { restoreFeatureMaps(oldMaps); }
  for(const key of KEYS)assert.equal(ensureAlienEcologyState(s).sectorFlags[stateKey(key)],undefined);
  external(r,()=>r.getSystem('world').enterSector(SID,{continuous:false,noTeleport:true,placePlayer:false}));for(const key of KEYS){assert.equal(rows(s,key).length,1);assert.equal(rows(s,key)[0].hull,48);}
  console.log(JSON.stringify({fixture:'production native API, not browser/gate flight acceptance',specimens:5,nativeSave:'present',continued:5,retiredReturned:5,terminalLoss:2,newGame:5}));
 }finally{r?.dispose();}
});


test('terminal custody latches, bag replacement is idempotent, and inherited saves are not authority', () => {
  for (const status of ['lost', 'unavailable']) {
    const h = fixture();
    try {
      const key = KEYS[0], e = h.get(key);
      if (status === 'lost') e.hull = 0;
      else h.s.entities.delete(e.id);
      captureBolusSpecimens(h.world);
      assert.equal(h.flags()[stateKey(key)].status, status);
      e.hull = 48; h.s.entities.set(e.id, e);
      captureBolusSpecimens(h.world);
      assert.equal(h.flags()[stateKey(key)].status, status);
      ensureAlienEcologyState(h.s).sectorFlags = { ...h.flags() };
      h.materialize(); captureBolusSpecimens(h.world);
      assert.equal(h.flags()[stateKey(key)].status, status);
      for (const k of KEYS) assert.equal(rows(h.s, k).length, 1);
      const returned = fixture(serializeAlienEcologyState(h.s).sectorFlags);
      try { assert.equal(returned.get(key), undefined); } finally { returned.close(); }
    } finally { h.close(); }
  }
  const h = fixture();
  try {
    ensureAlienEcologyState(h.s).sectorFlags = { ...h.flags() };
    h.materialize();
    for (const key of KEYS) assert.equal(rows(h.s, key).length, 1);
    const key = KEYS[0], row = h.flags()[stateKey(key)];
    assert.equal(readBolusSpecimenState(Object.create({ [stateKey(key)]: row }), key), null);
    assert.equal(readBolusSpecimenState({ [stateKey(key)]: Object.create(row) }, key), null);
    assert.equal(readBolusSpecimenState({ [stateKey(key)]: Object.create({ version: 1, key, status: 'lost' }) }, key), null);
  } finally { h.close(); }
});


test('native warm-up preserves observed damage but never adopts scalar pose or velocity', () => {
  const h = fixture();
  try {
    const key = KEYS[0], e = h.get(key), initial = { ...h.flags()[stateKey(key)] };
    h.s.settings.gameplay.physicsBackend = 'rapier-dynamic';
    e.pos.x += 500; e.vel.x = 999; e.hull = 19;
    captureBolusSpecimens(h.world);
    assert.deepEqual(h.flags()[stateKey(key)], { ...initial, hull: 19 });
    const returned = fixture(serializeAlienEcologyState(h.s).sectorFlags);
    try { near(returned.get(key).pos.x - origin.x, initial.x); assert.equal(returned.get(key).hull, 19); }
    finally { returned.close(); }
  } finally { h.close(); }
});
