import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { domKeyEvent } from '../src/systems/input.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps } from '../src/data/featureFlags.js';
import { STRUCK_BELL_ID, STRUCK_BELL_SITE as S, struckBellAdmission, struckBellPlacementClear } from '../src/systems/struckBellRuntime.js';

// Full production owners are the shipping gate; reduced-system diagnosis is explicit opt-in.
const POPULATED = !process.env.BELL_ISOLATED;

test(process.env.BELL_RESTORE ? 'populated Save/Continue interrupts an unpaid offered lesson' : 'native player latch, gentle propulsion, release and original rock impact earn the lesson', async () => {
 const h=POPULATED ? await populated() : await bootRealPath({seed:113,systems:['tacticalAI','flightV3','aiPorts',combat,tetherGameplay,encounterDirector,'physics'],
  bounds:{center:S.anchor,radius:4000,hardRadius:4500},
  hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:S.anchor.x-30,z:S.anchor.z},rot:0}],
  prepareState({state}){state.world.currentSectorId='sector_phoebe_echo';state.story={flags:{}};}
 });
 try{
  const d=h.runtime.getSystem('encounterDirector'), events=[],impacts=[],samples=[];
  for(const name of ['tether:latched','tether:releaseRated','economy:grantCredits','faction:repDelta','encounter:resolved'])h.bus.on(name,p=>events.push({name,at:h.state.simTime,p:structuredClone(p)}));
  h.bus.on('physics:impact',p=>impacts.push({...p,pos:{...p.pos},normal:{...p.normal}}));
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
   assert.equal(h.state.player.credits,creditsBefore+30);
   const choirAfter=structuredClone(h.state.factions.faction_choir);
   assert.equal(choirAfter.rep,(choirBefore?.rep ?? 0)+2);
   assert.deepEqual(choirAfter.history.filter(e=>e.reason===STRUCK_BELL_ID).map(e=>e.value),[2]);
   const save=h.runtime.getSystem('save'), before=h.state.player.credits;
   const env=h.withFeatures(()=>save.serialize('bell-native-success'));
   assert.equal(h.withFeatures(()=>save.loadEnvelope(env,'bell-native-success')),true);
   h.withFeatures(()=>d._onChoose({encounterId:live.id,choiceId:'a'}));h.step(120);
   assert.deepEqual(h.state.factions.faction_choir,choirAfter);
   assert.equal(h.state.player.credits,before);assert.equal(h.state.encounterDirector.stats.livedSeen?.[STRUCK_BELL_ID],'a');
   assert.equal(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason===STRUCK_BELL_ID).length,1);
   assert.equal(Object.values(h.state.encounterDirector.live).some(l=>l.shapeId===STRUCK_BELL_ID),false);
   console.log('SUCCESS_RESTORE_PASS',JSON.stringify({creditsBefore,credits:before,choirBefore,choirAfter,choirRestored:h.state.factions.faction_choir,seen:h.state.encounterDirector.stats.livedSeen?.[STRUCK_BELL_ID],proof:h.proof()}));
  }
 }finally{h.dispose();}
});

async function populated(){
 const rt=createAuthoritativeRuntime({profileId:'production',seed:113,nodeSafeOnly:true}),state=rt.state;
 state.mode='flight';state.ui.screenStack=[];state.settings.gameplay.controlScheme='classic';state.settings.gameplay.physicsBackend='rapier-dynamic';state.settings.gameplay.flightBackend='v3';state.settings.gameplay.aiBackend='sg06-tactical';
 const withFeatures=fn=>{const old=snapshotFeatureMaps();applyFeatureConfigToMaps(rt.config.features);try{return fn()}finally{restoreFeatureMaps(old)}};
 const player=rt.spawn(makeShipEntitySpec('ship_wasp',{isPlayer:true,player:state.player,pos:{x:S.anchor.x-30,z:S.anchor.z},fittings:[],team:0}));state.playerId=player.id;
 const phy=rt.getSystem('physics');const old=snapshotFeatureMaps();applyFeatureConfigToMaps(rt.config.features);try{await phy.prepareBackend(state,{reset:true})}finally{restoreFeatureMaps(old)}
 const w=rt.getSystem('world');withFeatures(()=>w.enterSector('sector_phoebe_echo'));
 // Configured arrival in the authored practice clearing; no in-flight teleport.
 const selected = {x:S.anchor.x,z:S.anchor.z};
 withFeatures(()=>w.relocatePlayerInSector({x:selected.x,z:selected.z,heading:0},{reason:'test-configured-bell-arrival'}));
 const h={runtime:rt,state,bus:rt.bus,player,withFeatures,step(n){for(let i=0;i<n;i++)rt.step(1/60)},dispose(){rt.dispose()},
 assertBodies(es){for(const e of es){const r=phy._sg02.records.get(e.id);assert.equal(r?.entity,e);assert.equal(r.body.isValid(),true);}},
 proof(){return {backend:phy._diag.backend,manifest:rt.fingerprint,entities:state.entityList.length,fieldRows:state.world.asteroidField?.rocks?.length,dressingRows:state.world.dressing?.rows?.length,nativeBodies:phy._sg02.records.size}}};
 h.step(2);return h;
}
