import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { createToasts } from '../src/ui/toasts.js';
import { rookPadPosition, rookDeliveryCheck } from '../src/characters/rookRules.js';
import { rookBoothSpec } from '../src/systems/rookBooth.js';
import { rookReceivingBrake, rookReceivingBrakeReadout, rookReceivingBrakeImpulse } from '../src/systems/rookReceivingBrake.js';
import { consumePhysicsCommand, writePhysicsBodyResponse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { partitionUpdateSystems, updateQueueForThisStep } from '../src/core/catchupPolicy.js';
import { PRODUCTION_UPDATE_ORDER, PRODUCTION_INIT_ORDER, getSystemClock, validateSystemClockDeclarations, validateSystemModeDeclarations } from '../src/runtime/authoritativeSystemManifest.js';
const DT=1/60, PAD=rookPadPosition();
function scene() {
 const s=createGameState(47),bus=createBus();s.tick=1;s.mode='flight';s.run={kind:'adventure'};s.world.currentSectorId='sector_charon_expanse';s.player.heat=0;s.input={brake:true};s.ui={};
 const body=(id,type,x,z,vx=0,vz=0)=>({id,occupantGeneration:id,type,alive:true,hull:100,hullMax:100,collides:true,radius:8,mass:16,pos:{x:PAD.x+x,z:PAD.z+z},vel:{x:vx,z:vz},rot:0,angVel:0,data:{},physicsBody:{schemaVersion:1,dynamic:true,ccd:true,shape:'ball',radius:8,mass:16,inertiaY:512,revision:0}});
 const player=body(1,'ship',190,100),hull=body(2,'wreck',190,0,0,40),beacon={...rookBoothSpec(),id:3,alive:true,occupantGeneration:3};
 s.playerId=1;s.entities=new Map([[1,player],[2,hull],[3,beacon]]);s.entityList=[player,hull,beacon];
 const a={id:'a',defId:'tether_standard',state:'active',ownerId:1,targetId:2,ownerGeneration:1,targetGeneration:2};
 s.player.tether={active:true,attachmentId:'a',targetId:2};s.combat={entities:{},attachments:{byId:{a}}};
 const owner={...rookReceivingBrake};owner.init({bus});return {s,bus,player,hull,beacon,a,owner,body};
}
function impulse(f){f.owner.update(DT,f.s);return consumePhysicsCommand(f.hull);}
test('receiving brake is a table owner before the existing deck/physics pair',()=>{
 assert.ok(PRODUCTION_INIT_ORDER.includes('rookReceivingBrake'));
 assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('rookReceivingBrake')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
 assert.equal(getSystemClock('rookReceivingBrake'),'table');assert.deepEqual(validateSystemClockDeclarations(),[]);assert.deepEqual(validateSystemModeDeclarations(),[]);
});
test('explicit brake queues bounded opposing impulse, never motion, money or damage',()=>{
 const f=scene(),before={pos:{...f.hull.pos},vel:{...f.hull.vel},hp:f.hull.hull,credits:f.s.player.credits};
 assert.equal(rookReceivingBrakeReadout(f.s).status,'braking');const c=impulse(f);assert.ok(c?.impulses.length);const j=c.impulses[0];assert.ok(j.x===0);assert.equal(j.z,-8);
 assert.deepEqual({pos:f.hull.pos,vel:f.hull.vel,hp:f.hull.hull,credits:f.s.player.credits},before);
 assert.equal(rookDeliveryCheck(f.hull).arrived,false);assert.equal(impulse(f),null,'one impulse per fixed tick');
});
test('ready does not brake until held and release stops immediately',()=>{
 const f=scene();f.s.input.brake=false;assert.equal(rookReceivingBrakeReadout(f.s).status,'ready');assert.equal(impulse(f),null);
 f.s.input.brake=true;f.s.tick++;assert.ok(impulse(f));f.s.input.brake=false;f.s.tick++;assert.equal(impulse(f),null);
});
test('life, custody, physical, mode, range, restore and WANTED gates fail closed',()=>{
 const changes=[f=>f.hull.alive=false,f=>f.hull.hull=0,f=>f.a.targetGeneration++,f=>f.a.ownerGeneration++,f=>f.a.state='broken',f=>f.s.player.tether.active=false,f=>f.hull.data.rookClaimed=true,f=>f.hull.data.missionId='other',f=>f.a.controllerId=8,f=>f.hull.physicsBody.dynamic=false,f=>f.hull.pos.x+=400,f=>f.player.pos.x+=800,f=>f.beacon.alive=false,f=>f.s.mode='menu',f=>f.s.ui.docked=true,f=>f.s.save={restoring:true},f=>f.s.run.kind='swarm',f=>f.s.physicsVenue={active:true},f=>f.s.world.currentSectorId='sector_ceres_belt',f=>f.s.player.heat=.2];
 for(const change of changes){const f=scene();change(f);assert.equal(impulse(f),null,String(change));}
});
test('nearby terrain, solid dressing and crossing traffic block without moving or removing them',()=>{
 for(const type of ['asteroid','wreck','station','ship','fx']){
  const f=scene(),blocker=f.body(4,type,95,0);f.s.entities.set(4,blocker);f.s.entityList.push(blocker);
  assert.equal(rookReceivingBrakeReadout(f.s).status,'blocked',type);assert.equal(impulse(f),null);assert.equal(blocker.alive,true);
 }
 const f=scene(),crossing=f.body(4,'ship',95,40,0,-80);f.s.entities.set(4,crossing);f.s.entityList.push(crossing);assert.equal(impulse(f),null);
});
test('brake math follows current mass, force cap and never reverses a slow hull',()=>{
 for(const mass of [1,16,1000])for(const scale of [.25,1,8])for(const speed of [.001,5,100]){
  const f=scene();f.hull.physicsBody.mass=mass;f.hull.vel={x:speed*.6,z:speed*.8};f.s.combat.entities[2]={physicsResponse:{massScale:scale}};
  const j=rookReceivingBrakeImpulse(f.s,f.hull,DT),effective=mass*scale;
  assert.ok(Math.hypot(j.x,j.z)<=1200*DT+1e-9);assert.ok(Math.hypot(j.x,j.z)<=speed*effective+1e-9);
  assert.ok(j.x*f.hull.vel.x+j.z*f.hull.vel.z<=0);
 }
});
async function nativeBrake(batch){
 const f=scene(),n=await createSg02DynamicBodyOwner(),states=[];
 // Staged native brake fixture: a real 40 WU/s transverse approach, not an earned tow.
 const systems=[{name:'rookReceivingBrake',update(dt){f.owner.update(dt,f.s);}},{name:'physics',update(dt){n.syncFromEntities([f.hull]);n.step(dt,f.s.tick);}}];
 const p=partitionUpdateSystems(systems);try{
  for(let i=0;i<180;i++){
   f.s.tick=i+1;f.s.simCatchupIndex=i%batch;
   for(const system of updateQueueForThisStep(p,f.s))system.update(DT,f.s);
   states.push([f.hull.pos.x,f.hull.pos.z,f.hull.vel.x,f.hull.vel.z]);
  }
  assert.ok(Math.hypot(f.hull.vel.x,f.hull.vel.z)<.01);assert.equal(f.hull.hull,100);assert.equal(rookDeliveryCheck(f.hull).arrived,false,'braking outside cannot manufacture a sale');
  assert.ok(f.hull.pos.z>PAD.z+20&&f.hull.pos.z<PAD.z+40,'stopping takes real distance');return states;
 }finally{n.dispose();}
}
test('native transverse brake is identical for 1–4 catch-up steps and cannot sell outside',async()=>{
 const first=await nativeBrake(1);for(const n of [2,3,4])assert.deepEqual(await nativeBrake(n),first);
});

test('readout is a pure observer even with deserialized or absent dressing tables',()=>{
 for(const dressing of [undefined,{schema:'spaceface.dressingTable.v1',rows:[],byId:{},dirtyPoseIds:[]}]){
  const f=scene();if(dressing)f.s.world.dressing=dressing;else delete f.s.world.dressing;
  const before=JSON.stringify(f.s);rookReceivingBrakeReadout(f.s);assert.equal(JSON.stringify(f.s),before);
 }
});
test('malformed mass cannot claim engaged and synchronous feedback cannot queue stale custody',()=>{
 for(const value of [undefined,0,-1,NaN,Infinity]){const f=scene();f.hull.physicsBody.mass=value;assert.equal(rookReceivingBrakeReadout(f.s),null);assert.equal(impulse(f),null);}
 for(const change of [f=>f.hull.alive=false,f=>f.s.player.tether.active=false,f=>f.s.mode='menu',f=>f.s.input.brake=false,f=>f.a.targetGeneration++]){
  const f=scene();f.bus.on('toast',()=>change(f));assert.equal(impulse(f),null);
 }
});


// Minimal DOM host, with the real toast presenter/admission and actual bus emission.
// This proves the card/live-region path, not browser pixels or layout geometry.
function receiptDom() {
 const previous={document:globalThis.document,raf:globalThis.requestAnimationFrame};
 class Element {
  constructor(){this.children=[];this.style={setProperty(){}};this.dataset={};this.attrs={};this.classList={add(){},remove(){}};this.isConnected=true;this.textContent='';}
  append(...nodes){for(const n of nodes){n.parentNode=this;n.isConnected=true;this.children.push(n);}}
  appendChild(n){this.append(n);return n;}
  removeChild(n){this.children=this.children.filter(x=>x!==n);n.parentNode=null;n.isConnected=false;return n;}
  prepend(n){n.parentNode=this;n.isConnected=true;this.children.unshift(n);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){}
  removeEventListener(){}
  contains(n){return this===n||this.children.includes(n);}
  querySelector(){return null;}
 }
 const body=new Element(),hud=new Element(),root=new Element(),live=new Element();body.append(hud);hud.append(root);root.append(live);
 const nodes={hud,toasts:root,'toast-live':live};
 globalThis.document={body,activeElement:body,createElement:()=>new Element(),getElementById:id=>nodes[id]||null};
 globalThis.requestAnimationFrame=fn=>{fn();return 0;};
 return {body,root,live,restore(){
  if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
  if(previous.raf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previous.raf;
 }};
}

test('all receiving state cues reach the real receipt card and live region in Adventure and campaign',()=>{
 for(const kind of ['adventure','campaign'])for(const status of ['ready','braking','blocked','wanted']){
  const f=scene(),dom=receiptDom();f.s.run.kind=kind;
  if(status==='ready')f.s.input.brake=false;
  if(status==='wanted')f.s.player.heat=.2;
  if(status==='blocked'){const blocker=f.body(4,'ship',95,0);f.s.entities.set(4,blocker);f.s.entityList.push(blocker);}
  const emitted=[];f.bus.on('toast',p=>emitted.push(p));const ui=createToasts({bus:f.bus,state:f.s});
  try{
   const before=rookReceivingBrakeReadout(f.s);assert.equal(before.status,status);
   const command=impulse(f);assert.equal(!!command,status==='braking');
   assert.equal(emitted.length,1);const cue=emitted[0];
   assert.equal(admitReceipt({...cue,state:f.s}).admit,true,`${kind}/${status}`);
   if(status==='braking'){
    assert.equal(cue.text,'Receiving brake engaged');assert.equal(cue.kind,'info');
    assert.match(before.text,/Keep the Line long/,'detailed objective instruction remains');
   }
   const card=dom.root.children.find(n=>n.className?.startsWith('sf-toast '));assert.ok(card,`${kind}/${status} card`);
   assert.equal(card.children.find(n=>n.className==='sf-toast__text')?.textContent,cue.text);
   assert.equal(card.attrs['aria-label'],cue.text+' (dismiss)');assert.equal(dom.live.textContent,cue.text);
   assert.equal(globalThis.document.activeElement,dom.body,'receipt never steals focus');
   f.s.tick++;impulse(f);assert.equal(emitted.length,1,'same state has no per-tick toast');
  }finally{ui.destroy();dom.restore();}
 }
});

test('short engaged receipt fixes Adventure prose rejection without weakening combat quieting',()=>{
 for(const kind of ['adventure','campaign']){
  const f=scene(),dom=receiptDom();f.s.run.kind=kind;dom.body.dataset.sfHudJob='fight';
  const before=rookReceivingBrakeReadout(f.s);
  assert.deepEqual(admitReceipt({text:before.text,kind:'info',channel:'objective',state:f.s}),{admit:false,reason:'adventure-glass'},'long objective remains off the receipt lane');
  const emitted=[];f.bus.on('toast',p=>emitted.push(p));const ui=createToasts({bus:f.bus,state:f.s});
  try{
   assert.ok(impulse(f),'presentation cannot cancel the physical command');
   assert.equal(emitted[0].text,'Receiving brake engaged');
   assert.deepEqual(admitReceipt({...emitted[0],state:f.s,combat:true}),{admit:false,reason:'combat-quiet'});
   assert.equal(dom.live.textContent,'');assert.equal(dom.root.children.length,1,'only the empty live region remains');
  }finally{ui.destroy();dom.restore();}
 }
});
