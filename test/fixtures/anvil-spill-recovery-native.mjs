// Focused native handoff, not a second full Orchard shift or live renderer proof.
// The ordinary spill producer creates the source. Only initial actors/cargo are
// fixture setup; after admission no position, velocity or attachment is injected.
import assert from 'node:assert/strict';
import { createSimulation } from '../../src/core/sim.js';
import { physics } from '../../src/core/physics.js';
import { world } from '../../src/systems/world.js';
import { traffic } from '../../src/systems/traffic.js';
import { input, domKeyEvent } from '../../src/systems/input.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { combat } from '../../src/systems/combat.js';
import { tetherGameplay } from '../../src/systems/tetherGameplay.js';
import { ships, makeShipEntitySpec } from '../../src/systems/ships.js';
import { economy } from '../../src/systems/economy.js';
import { cargo } from '../../src/systems/cargo.js';
import { scanner } from '../../src/systems/scanner.js';
import { save } from '../../src/save/saveSystem.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../../src/runtime/authoritativeSystemManifest.js';
import { PRODUCTION_FEATURES } from '../../src/runtime/runtimeProfiles.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
import { anvilWorkerRecordId } from '../../src/systems/anvilWork.js';
import { anvilSpillReturnFacts, anvilSpillReturnQuote } from '../../src/world/anvilSpillRecovery.js';
import { PLANET_SITE } from '../../src/data/planets.js';
const flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);
const selected=new Map([['world',{...world,update(){}}],['traffic',{...traffic,update(){}}],['input',input],['flightSlot',flightV3],['physics',physics],['combat',combat],['tetherGameplay',tetherGameplay],['ships',ships],['economy',economy],['cargo',cargo],['scanner',scanner],['save',save]]);
const sim=createSimulation({seed:47,runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES},systems:PRODUCTION_INIT_ORDER.map(id=>selected.get(id)).filter(Boolean),updateOrder:PRODUCTION_UPDATE_ORDER.map(id=>selected.get(id)).filter(Boolean)});
const s=sim.state;s.mode='flight';s.ui.screenStack=[];s.world.currentSectorId=PLANET_SITE.sectorId;s.settings.gameplay.physicsBackend='rapier-dynamic';
const owner=sim.registry.get('traffic'),phys=sim.registry.get('physics'),keys=sim.registry.get('input');
owner.ensureAnvilWorker(s,sim.spawn,{x:0,z:0});
const receiver=s.entityList.find(e=>e.data?.worldRecordId===anvilWorkerRecordId(s,'receiver'));
const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,team:0,pos:{x:receiver.pos.x-180,z:receiver.pos.z},rot:0}));s.playerId=player.id;
owner._setTrafficManifest(receiver,s.traffic.freighters.find(r=>r.id===receiver.id),owner._buildMinerManifest(receiver,0,PLANET_SITE.harvest.commodityShallow,12));
receiver.data.itinerary.phase='delivery';
const pod=owner._spillHaulerCargoFromViolence(receiver,null,'panic_jettison');assert.ok(pod);
const step=(n=1)=>{for(let i=0;i<n;i++)sim.step(1/60);};
const key=(code,pressed)=>domKeyEvent(keys,{code,pressed,blocked:false,repeat:false});
try{
 assert.equal(await phys.prepareBackend(s),true);step(3);
 const start={...pod.pos};
 keys.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
 keys.ingestLaneDomEvent({type:'cursorProjection',x:pod.pos.x,z:pod.pos.z});step(2);
 key('KeyF',true);step();key('KeyF',false);step(2);
 assert.equal(s.player.tether?.targetId,pod.id,'ordinary Massline key acquires original spill');
 key('Digit0',true);key('KeyF',true);step(12);key('BracketLeft',true);step(8);key('BracketLeft',false);key('KeyF',false);
 let ready=null;
 for(let i=0;i<600;i++){
  step();
  const distance=Math.hypot(pod.pos.x-receiver.pos.x+60,pod.pos.z-receiver.pos.z);
  if(distance<21){key('BracketLeft',false);key('KeyF',false);}
  ready=anvilSpillReturnQuote(s,receiver);if(ready && Math.hypot(pod.pos.x-start.x,pod.pos.z-start.z)>20)break;ready=null;
 }
 assert.ok(ready,JSON.stringify({reason:'native service approach',player:player.pos,pod:pod.pos,receiver:receiver.pos,velocity:pod.vel,tether:s.player.tether,facts:anvilSpillReturnFacts(s,receiver)?.ready}));
 const displacement=Math.hypot(pod.pos.x-start.x,pod.pos.z-start.z);assert.ok(displacement>20,'real line transports original payload');
 let offer, response;
 sim.bus.on('contactHail:offer',p=>{offer=p;});sim.bus.on('contactHail:response',p=>{response=p;});
 s.player.targetId=receiver.id;
 for(const unavailable of ['unsupported','not-ready']){
  if(unavailable==='unsupported')s.settings.gameplay.physicsBackend='custom';else phys._diag.sg02Ready=false;
  sim.bus.emit('contactHail:request',{targetId:receiver.id});assert.ok(offer);
  assert.ok(!offer.actions.some(a=>a.id==='return_gas'));assert.match(offer.lines.join(' '),/Return unavailable/);
  s.settings.gameplay.physicsBackend='rapier-dynamic';phys._diag.sg02Ready=true;
 }
 sim.bus.emit('contactHail:request',{targetId:receiver.id});assert.ok(offer);
 assert.ok(offer.actions.some(a=>a.id==='return_gas'),'RETURN GAS reaches public three-action receipt');
 assert.ok(offer.actions.length<=3);assert.ok(offer.lines.length<=2);assert.match(offer.lines.join(' '),/No payment/);assert.match(offer.lines.join(' '),/law/i);
 sim.bus.emit('contactHail:choice',{requestId:offer.requestId,targetId:receiver.id,choice:'return_gas'});assert.ok(response);
 assert.match(response.lines.join(' '),/3u BACK ABOARD FOR TETHYS/);
 const result={qty:3};
 assert.equal(receiver.data.cargoManifest.totalQty,12);assert.equal(pod.data.amount,0);
 step(2);assert.equal(s.player.tether.active,false,'normal entity retirement releases the used line');
 console.log(JSON.stringify({ok:true,kind:'focused native original spill transport and explicit return',displacement,simTime:s.simTime,returned:result.qty,receiverHull:receiver.hull,playerHull:player.hull}));
}finally{phys._disableSg02DynamicAuthority();sim.dispose();restoreFeatureMaps(flags);}
