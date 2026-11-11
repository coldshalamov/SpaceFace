import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/systems/nestVisit.js';
import * as D from '../src/data/nestVisit.js';
import * as N from '../src/data/encounters/705-the-nest.js';
import * as C from '../src/story/campaign47a/campaignTransitions.js';
const plain=x=>JSON.parse(JSON.stringify(x));
function harness(){
 let next=1;const requests=[],events=[];
 const state={mode:'flight',run:{kind:'adventure'},simTime:1000,tick:1,world:{currentSectorId:D.NEST_VISIT.sectorId},story:{beatIndex:2,flags:{}},player:{flags:{}},entities:new Map(),entityList:[],encounterDirector:{live:{}}};
 C.initCampaignSidecar(state,1000);state.story.campaign47a.stepProgress['2']={completed:['cinder_board','compost'],updatedAtS:999};
 const add=spec=>{const e={id:next++,alive:true,hull:460,hullMax:460,armorHp:110,armorMax:110,shield:0,shieldMax:0,cap:100,capMax:100,rot:0,angVel:0,vel:{x:0,z:0},data:{},flags:{},...spec};e.data||={};state.entities.set(e.id,e);state.entityList.push(e);return e;};
 const player=add({type:'ship',radius:10,mass:12,pos:D.nestApproach()});state.playerId=player.id;
 const d={state,helpers:{removeEntity(id){state.entities.delete(id);state.entityList=state.entityList.filter(e=>e.id!==id);}},now:()=>state.simTime,player:()=>state.entities.get(state.playerId),emit:(name,payload)=>events.push({name,payload}),say(){},
  adoptNestActor(live,e,role){if(state.entities.get(e.id)!==e||e.data?.nestEncounterId!==live.id)return false;if(!live.ids.includes(e.id))live.ids.push(e.id);live.roles[e.id]=role;(live.data.nestAdoptedIds||=[]).push(e.id);return true;},
  releaseNestActor(live,e){live.ids=live.ids.filter(id=>id!==e.id);delete live.roles[e.id];return true;},
  canSpawnNestActor(pos,radius){return R.nestSiteClear(state,pos,radius);},
  spawnShips(live,specs){return specs.map(spec=>{let spawn={type:'ship',radius:spec.role==='wasp'?12:30,mass:spec.role==='wasp'?16:520,pos:{...spec.pos},data:{ai:{}},armorHp:110,armorMax:110,shield:0,shieldMax:0,cap:100,capMax:100,hull:spec.role==='wasp'?55:460,hullMax:spec.role==='wasp'?55:460};if(N.applyNestBroodSpawnSpec)N.applyNestBroodSpawnSpec(spawn,live,spec.role==='wasp'?spec.nestActorSlot:'carrier');if(spec.nestSavedActor&&N.applyNestSavedSpawnSpec)spawn=N.applyNestSavedSpawnSpec(spawn,spec.nestSavedActor)||spawn;const e=add(spawn);live.ids.push(e.id);live.roles[e.id]=spec.role;return e.id;});},
  spawnProp(live,opts){let spawn={type:'beacon',pos:{...opts.pos},radius:12,mass:400,data:{storyPropKind:'nest_door'},hull:1,hullMax:1};if(opts.nestSavedActor&&N.applyNestSavedSpawnSpec)spawn=N.applyNestSavedSpawnSpec(spawn,opts.nestSavedActor)||spawn;return add(spawn);},
  entsOf(live,role){return live.ids.map(id=>state.entities.get(id)).filter(e=>e&&(!role||live.roles[e.id]===role));},
  abort(live,reason){live.phase='done';live.outcome='aborted:'+reason;delete state.encounterDirector.live[live.id];events.push({name:'abort',payload:reason});},
  resolve(live,outcome){R.recordNestOutcome(d,live,outcome);live.phase='done';live.outcome=outcome;delete state.encounterDirector.live[live.id];events.push({name:'resolved',payload:outcome});},
  requestAuthoredEncounter(payload){requests.push(plain(payload));if(d.block)return{ok:false,reason:d.block};const live={id:payload.encounterId,shapeId:'the_nest',sectorId:payload.sectorId,anchor:{...payload.anchor},plan:{zoneCenter:{...payload.anchor}},data:{...payload.data},ids:[],roles:{},phase:'new'};state.encounterDirector.live[live.id]=live;N.runtime.fire(d,live,state);return live.phase==='done'?{ok:false,reason:'resolved_on_fire'}:{ok:true,encounterId:live.id};},
 };return{state,d,player,add,requests,events};
}

function partial(){const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];h.state.simTime+=5;N.runtime.tick(h.d,live,h.state,h.state.simTime);const saved=plain(R.captureNestVisit(h.d));const body=plain(h.state.entities.get(live.data.nest.waspIds[0]));return {h,live,saved,body};}
function restore(){const x=partial(),r=harness();r.state.encounterDirector.nestVisit=x.saved;const body=r.add({...x.body,id:500,pos:{x:x.body.pos.x+15,z:x.body.pos.z+100},rot:.5,vel:{x:6,z:4},angVel:.2,physicsBody:{dynamic:true,mass:16,radius:9}});Object.assign(body.data,{defId:'ship_wasp',encounterFingerprint:'nest-fingerprint',encounterCausality:{fingerprint:'nest-fingerprint',encounterId:x.live.id,shapeId:'the_nest',sectorId:D.NEST_VISIT.sectorId}});return {...x,r,body};}

function carrierRestore(dx=.2,dz=.2){const x=partial(),r=harness();r.state.encounterDirector.nestVisit=x.saved;const c=plain(x.h.state.entities.get(x.live.data.nest.carrierId));const body=r.add({...c,id:500,pos:{x:c.pos.x+dx,z:c.pos.z+dz},vel:{x:.01,z:-.234},physicsBody:{dynamic:true,mass:520,radius:30}});Object.assign(body.data,{defId:'ship_atlas',encounterFingerprint:'nest-fingerprint',encounterCausality:{fingerprint:'nest-fingerprint',encounterId:x.live.id,shapeId:'the_nest',sectorId:D.NEST_VISIT.sectorId}});return {...x,r,body};}
test('validated struck carrier sub-unit drift resumes the actual body without rewinding or cloning',()=>{
 const {r,body}=carrierRestore();const pose=plain({pos:body.pos,vel:body.vel,rot:body.rot,angVel:body.angVel});assert.equal(R.tickNestVisit(r.d).ok,true);const live=Object.values(r.state.encounterDirector.live)[0];assert.equal(live.data.nest.carrierId,body.id);assert.equal(r.state.entities.get(body.id),body);assert.deepEqual(plain({pos:body.pos,vel:body.vel,rot:body.rot,angVel:body.angVel}),pose);assert.equal(live.data.nest.returnHits,0);assert.equal(live.data.nest.remaining,5);
});
for(const mode of ['cause','fingerprint','shape','sector','model','mass','radius','body','velocity','angular','rotation','position'])test(`unsafe restored carrier ${mode} fails closed`,()=>{const {r,body}=carrierRestore();if(mode==='cause')delete body.data.encounterCausality;if(mode==='fingerprint')body.data.encounterFingerprint='foreign';if(mode==='shape')body.data.encounterCausality.shapeId='other';if(mode==='sector')body.data.encounterCausality.sectorId='other';if(mode==='model')body.data.defId='ship_kestrel';if(mode==='mass')body.mass=42;if(mode==='radius')body.radius=10;if(mode==='body')delete body.physicsBody;if(mode==='velocity')body.vel.x=NaN;if(mode==='angular')body.angVel=NaN;if(mode==='rotation')body.rot=NaN;if(mode==='position')body.pos.x=NaN;const before=structuredClone(body);assert.equal(R.tickNestVisit(r.d).ok,false);assert.equal(r.requests.length,0);assert.deepEqual(body,before);});
test('larger proven carrier motion cannot hide collision at a missing baffle site',()=>{
 const {r,body}=carrierRestore(5,0);assert.equal(R.tickNestVisit(r.d).reason,'occupied');assert.equal(r.requests.length,0);body.pos.x+=500;r.state.simTime+=2.1;assert.equal(R.tickNestVisit(r.d).ok,true);assert.equal(r.state.entities.get(body.id),body);
});
test('rotated moving carrier cannot use the close-assembly exemption',()=>{
 const {r,body}=carrierRestore(.1,0);body.rot=.2;assert.equal(R.tickNestVisit(r.d).reason,'occupied');assert.equal(r.requests.length,0);
});

test('nominal clearance cannot exempt a moved carrier from an already displaced missing baffle',()=>{
 const {r,saved}=carrierRestore(.8,0);saved.snapshot.doors[0].pos.x-=2.5;assert.equal(R.tickNestVisit(r.d).reason,'occupied');assert.equal(r.requests.length,0);
});
test('a far missing baffle uses actual clearance rather than the close-assembly exception',()=>{
 const {r,saved}=carrierRestore(.2,0);saved.snapshot.doors[1].pos.x+=200;assert.equal(R.tickNestVisit(r.d).ok,true);
});
test('a missing Wasp still sees a nearby proven moving carrier',()=>{
 const {r,saved}=carrierRestore(.2,0);saved.snapshot.wasps[0].pos={...saved.snapshot.carrier.pos};assert.equal(R.tickNestVisit(r.d).reason,'occupied');assert.equal(r.requests.length,0);
});
