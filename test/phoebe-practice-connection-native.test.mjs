import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { domKeyEvent } from '../src/systems/input.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { STRUCK_BELL_ID, STRUCK_BELL_SITE as S, struckBellAdmission, struckBellPlacementClear } from '../src/systems/struckBellRuntime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { BELLHOP } from '../src/data/bellhop.js';

test('production world puts the existing chime floor at Phoebe, not the galactic origin', {skip:!!process.env.PHOEBE_RESUME_FAILED}, async () => {
 const rt=createAuthoritativeRuntime({profileId:'production',seed:113,nodeSafeOnly:true}),state=rt.state;
 const withFeatures=fn=>{const old=snapshotFeatureMaps();applyFeatureConfigToMaps(rt.config.features);try{return fn()}finally{restoreFeatureMaps(old)}};
 try {
  state.mode='flight';state.ui.screenStack=[];state.settings.gameplay.controlScheme='classic';state.settings.gameplay.physicsBackend='rapier-dynamic';state.settings.gameplay.flightBackend='v3';state.settings.gameplay.aiBackend='sg06-tactical';
  const post=sectorLocalToGlobalForSector(BELLHOP.post,BELLHOP.sectorId);
  const player=rt.spawn(makeShipEntitySpec('ship_wasp',{isPlayer:true,player:state.player,pos:{x:post.x,z:post.z-400},fittings:[],team:0}));state.playerId=player.id;
  const phy=rt.getSystem('physics');const old=snapshotFeatureMaps();applyFeatureConfigToMaps(rt.config.features);try{await phy.prepareBackend(state,{reset:true})}finally{restoreFeatureMaps(old)}
  const w=rt.getSystem('world');withFeatures(()=>w.enterSector(BELLHOP.sectorId));
  withFeatures(()=>w.relocatePlayerInSector({x:post.x,z:post.z-400,heading:0},{reason:'test-configured-chime-arrival'}));
  for(let i=0;i<2;i++)rt.step(1/60);
  const robot=state.entityList.find(e=>e.alive&&e.data?.bellhop);
  const crystals=state.entityList.filter(e=>e.alive&&e.data?.bellhopCrystal);
  console.log('CHIME_WORLD',JSON.stringify({post,robot:robot&&{id:robot.id,pos:robot.pos,flags:robot.flags},crystals:crystals.map(e=>({id:e.id,pos:e.pos,flags:e.flags})),backend:phy._diag.backend,entities:state.entityList.length}));
  assert.ok(robot);assert.equal(crystals.length,5);
  assert.ok(Math.hypot(robot.pos.x-post.x,robot.pos.z-post.z)<20,'CB-9 must stand at the actual Phoebe post');
  for(const entity of [robot,...crystals]) {
   const record=phy._sg02.records.get(entity.id);
   assert.equal(record?.entity,entity);assert.equal(record.body.isValid(),true);
  }
 } finally {rt.dispose();}
});

// Full production owners are the shipping gate; reduced-system diagnosis is explicit opt-in.
const POPULATED = !process.env.BELL_ISOLATED;

test(process.env.BELL_RESTORE ? 'populated Save/Continue interrupts an unpaid offered lesson' : 'earned practice reaches the existing chime floor through native player flight', {skip:!!process.env.BELL_BEARING_ONLY||!!process.env.PHOEBE_RESUME_FAILED}, async () => {
 const h=POPULATED ? await populated() : await bootRealPath({seed:113,systems:['tacticalAI','flightV3','aiPorts',combat,tetherGameplay,encounterDirector,'physics'],
  bounds:{center:S.anchor,radius:4000,hardRadius:4500},
  hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:S.anchor.x-30,z:S.anchor.z},rot:0}],
  prepareState({state}){state.world.currentSectorId='sector_phoebe_echo';state.story={flags:{}};}
 });
 try{
  const d=h.runtime.getSystem('encounterDirector'), events=[],impacts=[],samples=[];
  for(const name of ['tether:latched','tether:releaseRated','economy:grantCredits','faction:repDelta','encounter:resolved','encounter:voice','comms:popup'])h.bus.on(name,p=>events.push({name,at:h.state.simTime,p:structuredClone(p)}));
  const offPracticeImpacts=h.bus.on('physics:impact',p=>impacts.push({...p,pos:{...p.pos},normal:{...p.normal}}));
  let request,live;
  if(POPULATED){
    for(let i=0;i<30*60;i++){h.step(1);live=Object.values(h.state.encounterDirector.live).find(l=>l.shapeId===STRUCK_BELL_ID);if(live)break;}
    request={ok:!!live,encounterId:live?.id};
    if(!live)console.log('NO_ADMISSION',JSON.stringify({proof:h.proof(),admit:struckBellAdmission(h.state,d.registry,h.player),clear:struckBellPlacementClear(h.state),mode:h.state.mode,timeScale:h.state.timeScale,world:h.state.world.currentSectorId,player:{id:h.player.id,pos:h.player.pos,alive:h.player.alive},onboarding:h.state.onboarding,dir:h.state.encounterDirector,near:h.state.entityList.filter(e=>Math.hypot(e.pos.x-S.anchor.x,e.pos.z-S.anchor.z)<500).map(e=>({id:e.id,type:e.type,r:e.radius,pos:e.pos,data:e.data}))}));
  }else request=h.withFeatures(()=>d.requestAuthoredEncounter({shapeId:STRUCK_BELL_ID,encounterId:'native-bell',sectorId:'sector_phoebe_echo',anchor:{...S.anchor},zoneType:'mining_belt',zoneName:'practice lesson',force:true}));
  assert.equal(request.ok,true,JSON.stringify(request));
  live ||= h.state.encounterDirector.live['native-bell'];assert.ok(live);
  const get=role=>h.state.entities.get(live.ids.find(id=>live.roles[id]===role));
  const stone=get('stone'),bell=get('bell');assert.ok(stone&&bell);
  h.step(2);h.assertBodies([h.player,stone,bell]);
  if(process.env.BELL_RESTORE){
    const save=h.runtime.getSystem('save');const env=h.withFeatures(()=>save.serialize('bell-native-private'));
    const restored=h.withFeatures(()=>save.loadEnvelope(env,'bell-native-private'));assert.equal(restored,true);h.step(120);
    assert.equal(h.state.encounterDirector.live[live.id],undefined);assert.equal(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason===STRUCK_BELL_ID).length,0);
    assert.notEqual(h.state.encounterDirector.stats.livedSeen?.[STRUCK_BELL_ID],'a');console.log('RESTORE_PASS',JSON.stringify({restored,events,proof:h.proof()}));return;
  }
  const creditsBefore=h.state.player.credits;
  const choirBefore=structuredClone(h.state.factions?.faction_choir ?? null);
  h.withFeatures(()=>d._onChoose({encounterId:live.id,choiceId:'a'}));
  h.state.player.targetId=stone.id;
  const key=(code,pressed)=>domKeyEvent(h.runtime.getSystem('input'),{code,pressed});
  if(POPULATED){key('ControlLeft',true);key('Space',true);h.step(1);key('Space',false);key('ControlLeft',false);h.step(2);}
  else {h.state.input.tetherMode='nearest';h.state.input.aimWorld={...stone.pos};h.state.input.actions.tetherFire=true;h.step(1);h.state.input.actions.tetherFire=false;h.step(2);}
  console.log('LATCH',JSON.stringify({anchor:live.anchor,player:h.player.pos,stone:stone.pos,bell:bell.pos,tether:h.state.player.tether,denial:tetherGameplay._lastLatchDenial,events}));
  assert.ok(events.some(e=>e.name==='tether:latched'&&e.p.targetId===stone.id),'actual player latch');
  let cut=false;
  for(let i=0;i<30*60;i++){
   const x=h.player.pos.x-live.anchor.x;
   if(POPULATED){key('KeyW',!cut);key('KeyQ',cut&&h.player.pos.z>live.anchor.z-100);key('Digit0',cut&&h.player.pos.z<=live.anchor.z-100);}
   else {h.state.input.moveZ=cut?0:1;h.state.input.moveX=cut?1:0;h.state.input.turnIntent=0;h.state.input.actions.brake=cut;}
   if(!cut&&x>(POPULATED ? 10 : 35)){if(POPULATED)key('Space',true);else h.state.input.actions.massline={cut:true};cut=true;}
   h.step(1);if(POPULATED)key('Space',false);else h.state.input.actions.massline=null;
   if(i%30===0)samples.push({t:h.state.simTime,p:{x:h.player.pos.x-live.anchor.x,z:h.player.pos.z-live.anchor.z},s:{x:stone.pos.x-live.anchor.x,z:stone.pos.z-live.anchor.z},v:{...stone.vel},cut});
   if(!h.state.encounterDirector.live[live.id])break;
  }
  console.log('NATIVE_BELL',JSON.stringify({request,subjects:[h.player,stone,bell,...live.ids.map(id=>h.state.entities.get(id)).filter(Boolean)].map(e=>({id:e.id,alive:e.alive,hull:e.hull,pos:e.pos,generation:e.occupantGeneration})),events,impacts:impacts.filter(p=>[p.aId,p.bId].includes(stone.id)),samples,proof:h.proof()}));
  assert.ok(events.some(e=>e.name==='tether:releaseRated'&&e.p.targetId===stone.id&&e.p.deliberate));
  assert.ok(impacts.some(p=>p.backend==='rapier-dynamic'&&[p.aId,p.bId].includes(stone.id)&&[p.aId,p.bId].includes(bell.id)),'native original rock hits bell');
  assert.deepEqual(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason===STRUCK_BELL_ID).map(e=>e.p.amount),[30]);
  assert.equal(h.state.encounterDirector.stats.livedSeen?.[STRUCK_BELL_ID],'a');
  if(POPULATED){
   assert.ok(events.some(e=>e.name==='encounter:voice'&&e.p.text?.includes('BELLHOP / CB-9')),'earned lesson supplies the actual next activity');
   offPracticeImpacts(); // The short lesson witness must not retain every later world contact.
   await reachChime(h,events,stone);
   assert.equal(h.state.player.credits,creditsBefore+30+(process.env.PHOEBE_CARRY_STONE?0:BELLHOP.payCr));
   const choirAfter=structuredClone(h.state.factions.faction_choir);
   assert.equal(choirAfter.rep,(choirBefore?.rep ?? 0)+2);
   assert.deepEqual(choirAfter.history.filter(e=>e.reason===STRUCK_BELL_ID).map(e=>e.value),[2]);
   const save=h.runtime.getSystem('save'), before=h.state.player.credits;
   const env=h.withFeatures(()=>save.serialize('bell-native-success'));
   assert.equal(h.withFeatures(()=>save.loadEnvelope(env,'bell-native-success')),true);
   h.withFeatures(()=>d._onChoose({encounterId:live.id,choiceId:'a'}));h.step(120);
   assert.deepEqual(h.state.factions.faction_choir,choirAfter);
   assert.equal(h.state.player.credits,before);assert.equal(h.state.encounterDirector.stats.livedSeen?.[STRUCK_BELL_ID],'a');
   if(!process.env.PHOEBE_CARRY_STONE){assert.equal(h.state.story.flags.bellhop_progress,5);assert.equal(h.state.story.flags.bellhop_sung,true);assert.equal(h.state.story.flags.bellhop_paid,true);assert.deepEqual(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason==='bellhop:song').map(e=>e.p.amount),[300]);}
   assert.equal(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason===STRUCK_BELL_ID).length,1);
   assert.equal(Object.values(h.state.encounterDirector.live).some(l=>l.shapeId===STRUCK_BELL_ID),false);
   if(process.env.PHOEBE_SUCCESS_PATH)writeFileSync(process.env.PHOEBE_SUCCESS_PATH,gzipSync(JSON.stringify(h.withFeatures(()=>save.serialize('phoebe-connected-success')))));
   console.log('SUCCESS_RESTORE_PASS',JSON.stringify({creditsBefore,credits:before,choirBefore,choirAfter,choirRestored:h.state.factions.faction_choir,seen:h.state.encounterDirector.stats.livedSeen?.[STRUCK_BELL_ID],proof:h.proof()}));
  }
 }catch(error){
  if(process.env.PHOEBE_FAILURE_PATH){const saved=h.withFeatures(()=>h.runtime.getSystem('save').serialize('phoebe-failed-route'));writeFileSync(process.env.PHOEBE_FAILURE_PATH,gzipSync(JSON.stringify(saved)));}
  throw error;
 }finally{h.dispose();}
});

async function populated(arrivalOffset={x:0,z:0}){
 const rt=createAuthoritativeRuntime({profileId:'production',seed:113,nodeSafeOnly:true}),state=rt.state;
 state.mode='flight';state.ui.screenStack=[];state.settings.gameplay.controlScheme='classic';state.settings.gameplay.physicsBackend='rapier-dynamic';state.settings.gameplay.flightBackend='v3';state.settings.gameplay.aiBackend='sg06-tactical';
 const withFeatures=fn=>{const old=snapshotFeatureMaps();applyFeatureConfigToMaps(rt.config.features);try{return fn()}finally{restoreFeatureMaps(old)}};
 const player=rt.spawn(makeShipEntitySpec('ship_wasp',{isPlayer:true,player:state.player,pos:{x:S.anchor.x-30,z:S.anchor.z},fittings:[],team:0}));state.playerId=player.id;
 const phy=rt.getSystem('physics');const old=snapshotFeatureMaps();applyFeatureConfigToMaps(rt.config.features);try{await phy.prepareBackend(state,{reset:true})}finally{restoreFeatureMaps(old)}
 const w=rt.getSystem('world');withFeatures(()=>w.enterSector('sector_phoebe_echo'));
 // Configured arrival in the authored practice clearing; no in-flight teleport.
 const selected = {x:S.anchor.x+arrivalOffset.x,z:S.anchor.z+arrivalOffset.z};
 withFeatures(()=>w.relocatePlayerInSector({x:selected.x,z:selected.z,heading:0},{reason:'test-configured-bell-arrival'}));
 const h={runtime:rt,state,bus:rt.bus,player,withFeatures,step(n){for(let i=0;i<n;i++)rt.step(1/60)},dispose(){rt.dispose()},
 assertBodies(es){for(const e of es){const r=phy._sg02.records.get(e.id);assert.equal(r?.entity,e);assert.equal(r.body.isValid(),true);}},
 proof(){return {backend:phy._diag.backend,manifest:rt.fingerprint,entities:state.entityList.length,fieldRows:state.world.asteroidField?.rocks?.length,dressingRows:state.world.dressing?.rows?.length,nativeBodies:phy._sg02.records.size}}};
 Object.defineProperty(h,'player',{get(){return state.entities.get(state.playerId);}});
 h.step(2);return h;
}



async function reachChime(h,events,stone){
 const key=(code,pressed)=>domKeyEvent(h.runtime.getSystem('input'),{code,pressed});
 const release=()=>{for(const code of ['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','Digit0','Space','ControlLeft'])key(code,false);};
 release();
 if(process.env.PHOEBE_CARRY_STONE){
 h.state.player.targetId=stone.id;key('ControlLeft',true);key('Space',true);h.step(1);key('Space',false);key('ControlLeft',false);h.step(2);
 console.log('CHIME_CARRY_LATCH',JSON.stringify({stone:{id:stone.id,alive:stone.alive,pos:stone.pos},tether:h.state.player.tether}));
 assert.equal(h.state.player.tether?.targetId,stone.id,'carry the original practice stone, not a new reward or fixture rock');
 }
 const {traces,fly}=createPilot(h,stone,key,release);
 const post=sectorLocalToGlobalForSector(BELLHOP.post,BELLHOP.sectorId);
 await fly({x:post.x-500,z:post.z-800});
 await fly({x:post.x-500,z:post.z});
 await fly({x:post.x-300,z:post.z});
 console.log('CHIME_FLIGHT',JSON.stringify({traces,events:events.filter(e=>e.name==='comms:popup'&&e.p.id?.startsWith('bellhop_practice')),proof:h.proof()}));
 assert.ok(events.some(e=>e.name==='comms:popup'&&e.p.id?.startsWith('bellhop_practice_a')),'nearby original tuner recognizes actual earned practice');
 if(!process.env.PHOEBE_CARRY_STONE){await playChimesWithHull(h,events,fly,key,release);return;}
 const crystal=h.state.entityList.find(e=>e.alive&&e.data?.bellhopCrystalIndex===BELLHOP.song[0]);
 assert.ok(crystal);const anchor={x:crystal.pos.x-110,z:crystal.pos.z};
 await fly({x:anchor.x-280,z:anchor.z});await fly(anchor);
 const hits=[];h.bus.on('physics:impact',p=>{if([p.aId,p.bId].includes(crystal.id))hits.push({...p,pos:{...p.pos},normal:{...p.normal}});});
 console.log('CHIME_THROW_START',JSON.stringify({player:{pos:h.player.pos,rot:h.player.rot},stone:{id:stone.id,alive:stone.alive,pos:stone.pos,vel:stone.vel},crystal:{id:crystal.id,pos:crystal.pos},tether:h.state.player.tether,anchor}));
 // Align through the ordinary turn keys, while braking, before the same learned release.
 for(let i=0;i<300;i++){const error=Math.atan2(Math.sin(-h.player.rot),Math.cos(-h.player.rot));key('KeyA',error<-.02);key('KeyD',error>.02);key('Digit0',true);h.step(1);if(Math.abs(error)<.02)break;}
 release();let cut=false;
 for(let i=0;i<60*30;i++){
  key('KeyW',!cut);key('KeyQ',cut&&h.player.pos.z>anchor.z-100);key('Digit0',cut&&h.player.pos.z<=anchor.z-100);
  if(!cut&&h.player.pos.x>anchor.x+10){key('Space',true);cut=true;}
  h.step(1);key('Space',false);
  if(h.state.story.flags.bellhop_progress===1)break;
 }
 release();console.log('CHIME_FIRST_STRIKE',JSON.stringify({progress:h.state.story.flags.bellhop_progress,stone:{id:stone.id,alive:stone.alive,pos:stone.pos,vel:stone.vel},crystal:{id:crystal.id,alive:crystal.alive,pos:crystal.pos,hull:crystal.hull},hits,proof:h.proof()}));
 assert.equal(h.state.story.flags.bellhop_progress,1,'original carried practice stone rings the first real chime');
 assert.ok(hits.some(p=>p.backend==='rapier-dynamic'&&[p.aId,p.bId].includes(stone.id)),'actual original-stone/native-crystal contact');

}

async function playChimesWithHull(h,events,fly,key,release){
 const post=sectorLocalToGlobalForSector(BELLHOP.post,BELLHOP.sectorId),strikes=[];
 const impacts=[];let targetId=null;
 const offChimeImpacts=h.bus.on('physics:impact',p=>{
  if(impacts.length<64&&p.impulse>=BELLHOP.minImpulse&&[p.aId,p.bId].includes(h.state.playerId)&&[p.aId,p.bId].includes(targetId))impacts.push({...p,pos:{...p.pos},normal:{...p.normal}});
 });
 let lastAngle=Math.atan2(h.player.pos.z-post.z,h.player.pos.x-post.x);
 for(let position=Number(h.state.story.flags.bellhop_progress)||0;position<BELLHOP.song.length;position++){
  const note=BELLHOP.song[position];
  const crystal=h.state.entityList.find(e=>e.alive&&e.data?.bellhopCrystalIndex===note);assert.ok(crystal);
  const angle=Math.atan2(crystal.pos.z-post.z,crystal.pos.x-post.x);
  await fly({x:post.x+Math.cos(lastAngle)*420,z:post.z+Math.sin(lastAngle)*420});
  const delta=Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle));
  const segments=Math.max(1,Math.ceil(Math.abs(delta)/.4));
  for(let i=1;i<=segments;i++){const a=lastAngle+delta*i/segments;await fly({x:post.x+Math.cos(a)*420,z:post.z+Math.sin(a)*420});}
  await fly({x:crystal.pos.x+Math.cos(angle)*100,z:crystal.pos.z+Math.sin(angle)*100});
  release();impacts.length=0;targetId=crystal.id;const start=0;
  for(let i=0;i<60*35;i++){
   const dx=crystal.pos.x-h.player.pos.x,dz=crystal.pos.z-h.player.pos.z;
   const desired=Math.atan2(dz,dx),error=Math.atan2(Math.sin(desired-h.player.rot),Math.cos(desired-h.player.rot));
   const speed=Math.hypot(h.player.vel.x,h.player.vel.z);
   key('KeyD',error>.025);key('KeyA',error<-.025);key('KeyW',Math.abs(error)<.12&&speed<6);key('Digit0',Math.abs(error)>.4||speed>8);
   h.step(1);
   if(h.state.story.flags.bellhop_progress===position+1)break;
   if(!h.player.alive||!crystal.alive)break;
  }
  release();key('Digit0',true);h.step(90);release();
  const hit=impacts.slice(start).find(p=>p.backend==='rapier-dynamic'&&[p.aId,p.bId].includes(h.player.id)&&[p.aId,p.bId].includes(crystal.id));
  const proof={note,progress:h.state.story.flags.bellhop_progress,hit,player:{id:h.player.id,generation:h.player.occupantGeneration,alive:h.player.alive,hull:h.player.hull,invuln:h.player.flags?.invuln,pos:{...h.player.pos}},crystal:{id:crystal.id,alive:crystal.alive,hull:crystal.hull,pos:{...crystal.pos}}};strikes.push(proof);console.log('CHIME_HULL_STRIKE',JSON.stringify(proof));
  assert.ok(hit,'a native original player/crystal contact, not an injected impact event');assert.equal(h.state.story.flags.bellhop_progress,position+1);assert.ok(h.player.alive);
  console.log('CHIME_MEMORY',JSON.stringify({position:position+1,memory:process.memoryUsage(),capturedNoteImpacts:impacts.length}));
  if(process.env.PHOEBE_CHECKPOINT_PREFIX){writeFileSync(process.env.PHOEBE_CHECKPOINT_PREFIX+'-note-'+(position+1)+'.json.gz',gzipSync(JSON.stringify(h.withFeatures(()=>h.runtime.getSystem('save').serialize('phoebe-note-'+(position+1))))));globalThis.flushQualifiedLedger?.();}
  lastAngle=angle;
  if(position===0){
   const save=h.runtime.getSystem('save'),env=h.withFeatures(()=>save.serialize('phoebe-partial-song'));
   const oldPlayer={id:h.player.id,generation:h.player.occupantGeneration};
   const restored=h.withFeatures(()=>save.loadEnvelope(env,'phoebe-partial-song'));assert.equal(restored,true);
   h.step(2);const currentPlayer=h.player;
   console.log('CHIME_PARTIAL_RESTORE',JSON.stringify({restored,progress:h.state.story.flags.bellhop_progress,credits:h.state.player.credits,sung:h.state.story.flags.bellhop_sung??false,oldPlayer,currentPlayer:{id:currentPlayer.id,generation:currentPlayer.occupantGeneration,alive:currentPlayer.alive,hull:currentPlayer.hull,invuln:currentPlayer.flags?.invuln},nativeSame:h.runtime.getSystem('physics')._sg02.records.get(currentPlayer.id)?.entity===currentPlayer}));
   assert.equal(h.state.story.flags.bellhop_progress,1);assert.notEqual(h.state.story.flags.bellhop_sung,true);
  }
 }
 offChimeImpacts();
 assert.equal(h.state.story.flags.bellhop_sung,true);assert.equal(h.state.story.flags.bellhop_paid,true);
 assert.deepEqual(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason==='bellhop:song').map(e=>e.p.amount),[BELLHOP.payCr]);
 console.log('CHIME_SEQUENCE_NATIVE',JSON.stringify({method:'actual gentle player-hull contacts; not a thrown-stone sequence',strikes,flags:h.state.story.flags,credits:h.state.player.credits,proof:h.proof()}));
 const credits=h.state.player.credits,flags={progress:h.state.story.flags.bellhop_progress,sung:h.state.story.flags.bellhop_sung,paid:h.state.story.flags.bellhop_paid};
 const world=h.runtime.getSystem('world');
 // Explicit sector transitions qualify residency/return; not a flown intersector journey.
 h.withFeatures(()=>world.enterSector('sector_eris_margin'));h.step(2);
 assert.equal(h.state.entityList.some(e=>e.alive&&(e.data?.bellhop||e.data?.bellhopCrystal)),false);
 h.withFeatures(()=>world.enterSector(BELLHOP.sectorId));h.step(2);
 const returned=h.state.entityList.filter(e=>e.alive&&e.data?.bellhopCrystal);
 assert.equal(returned.length,5);assert.ok(returned.every(e=>e.data.bellhopTuned===true));
 assert.equal(h.state.player.credits,credits);assert.equal(h.state.story.flags.bellhop_progress,flags.progress);assert.equal(h.state.story.flags.bellhop_sung,flags.sung);assert.equal(h.state.story.flags.bellhop_paid,flags.paid);
 assert.ok(events.some(e=>e.name==='comms:popup'&&e.p.id==='bellhop_announce'&&e.p.text===BELLHOP.repriseLine));
 console.log('CHIME_RETURN_NATIVE',JSON.stringify({credits,flags,returned:returned.map(e=>({id:e.id,pos:e.pos,tuned:e.data.bellhopTuned})),proof:h.proof()}));

}

function createPilot(h,stone,key,release){
 const traces=[];
 const fly=async(point)=>{
  const budget=Math.ceil(Math.hypot(point.x-h.player.pos.x,point.z-h.player.pos.z)/15+35)*60;
  for(let i=0;i<budget;i++){
   const p=h.player,d={x:point.x-p.pos.x,z:point.z-p.pos.z};
   const distance=Math.hypot(d.x,d.z), speed=Math.hypot(p.vel.x,p.vel.z);
   const angle=Math.atan2(d.z,d.x), error=Math.atan2(Math.sin(angle-p.rot),Math.cos(angle-p.rot));
   key('KeyD',error>.04&&distance>10);key('KeyA',error<-.04&&distance>10);
   key('KeyW',Math.abs(error)<.15&&speed<Math.min(process.env.PHOEBE_CARRY_STONE?20:70,distance*.65));key('KeyS',false);
   key('KeyE',false);key('KeyQ',false);
   key('Digit0',distance<20||speed>Math.min(process.env.PHOEBE_CARRY_STONE?25:75,distance*.8)||Math.abs(error)>.4);
   h.step(1);
   if(i%120===0)traces.push({at:h.state.simTime,pos:{...p.pos},vel:{...p.vel},rot:p.rot,hull:p.hull,stone:{alive:stone.alive,pos:{...stone.pos},hull:stone.hull},tether:h.state.player.tether?.active,target:point});
   if(!p.alive)break;
   if(Math.hypot(d.x,d.z)<25&&Math.hypot(p.vel.x,p.vel.z)<4){release();return;}
  }
  console.log('CHIME_FLIGHT_FAIL',JSON.stringify({traces,mode:h.state.mode,timeScale:h.state.timeScale,ui:h.state.ui,playerSame:h.player===h.state.entities.get(h.state.playerId),actualPlayer:h.state.entities.get(h.state.playerId),input:h.state.input,proof:h.proof()}));
  assert.fail('native player flight must reach the chime approach');
 };
 return {traces,fly};
}

test('retained failed-world continuation diagnosis', {skip:!process.env.PHOEBE_RESUME_FAILED}, async()=>{
 const h=await populated();
 try {
  const env=JSON.parse(gunzipSync(readFileSync(process.env.PHOEBE_RESUME_FAILED)));
  assert.equal(h.withFeatures(()=>h.runtime.getSystem('save').loadEnvelope(env,'phoebe-retained-diagnostic')),true);h.step(2);
  const p=h.player,r=h.runtime.getSystem('physics')._sg02.records.get(p.id);
  console.log('NEAR_NATIVE_SOLIDS',JSON.stringify([...h.runtime.getSystem('physics')._sg02.records.values()].filter(r=>r.entity?.pos&&Math.hypot(r.entity.pos.x-p.pos.x,r.entity.pos.z-p.pos.z)<200).map(r=>({id:r.entity.id,type:r.entity.type,pos:r.entity.pos,radius:r.entity.radius,data:r.entity.data}))));
  console.log('RESUMED_PLAYER_NATIVE',JSON.stringify({mode:h.state.mode,timeScale:h.state.timeScale,player:{id:p.id,generation:p.occupantGeneration,alive:p.alive,hull:p.hull,pos:p.pos,vel:p.vel,flags:p.flags},nativeSame:r?.entity===p,body:r?.body?.translation(),nativeVelocity:r?.body?.linvel(),input:h.state.input,ui:h.state.ui,flags:h.state.story.flags,credits:h.state.player.credits}));
  const events=[];for(const name of ['economy:grantCredits','comms:popup'])h.bus.on(name,p=>events.push({name,p:structuredClone(p)}));
  const key=(code,pressed)=>domKeyEvent(h.runtime.getSystem('input'),{code,pressed});
  const release=()=>{for(const code of ['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','Digit0','Space','ControlLeft'])key(code,false);};
  const {fly}=createPilot(h,{alive:false,pos:{},hull:0},key,release);
  await playChimesWithHull(h,events,fly,key,release);
  if(process.env.PHOEBE_SUCCESS_PATH)writeFileSync(process.env.PHOEBE_SUCCESS_PATH,gzipSync(JSON.stringify(h.withFeatures(()=>h.runtime.getSystem('save').serialize('phoebe-recovery-success')))));
 }catch(error){if(process.env.PHOEBE_FAILURE_PATH)writeFileSync(process.env.PHOEBE_FAILURE_PATH,gzipSync(JSON.stringify(h.withFeatures(()=>h.runtime.getSystem('save').serialize('phoebe-resume-failed')))));throw error;}finally{h.dispose();}
});
