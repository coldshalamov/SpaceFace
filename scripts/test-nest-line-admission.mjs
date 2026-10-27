// Actual combat kernel +705 runtime composition. Spawn/input ports do not claim a
// native solver, full flight, firing cadence, heat, aim, or renderer acceptance.
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { combat as combatProto, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { WEAPONS } from '../src/data/weapons.js';
import { runtime, applyNestBroodSpawnSpec, default as definition } from '../src/data/encounters/705-the-nest.js';
import { recordNestOutcome } from '../src/systems/nestVisit.js';
import { initCampaignSidecar, recordBeatStep, getBeatStepStatus } from '../src/story/campaign47a/campaignTransitions.js';
import fs from 'node:fs';
import vm from 'node:vm';
function harness({authored=false}={}) {
  const state = createGameState(705); state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.simTime = 10; state.playerId = 1; state.player.flags = {}; state.player.credits = 0;
  state.entities = new Map(); state.entityList = [];
  let next = 2;
  const spawn = spec => { const e = { id: next++, alive: true, ...spec, data: structuredClone(spec.data || {}) }; state.entities.set(e.id,e); state.entityList.push(e); return e; };
  const player = { id: 1, type: 'ship', isPlayer: true, alive: true, team: 'player', hull: 100, hullMax: 100,
    pos: { x: 650, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 55, data: {}, flags: {} };
  state.entities.set(1,player); state.entityList.push(player);
  state.story.beatIndex=2; initCampaignSidecar(state,10);
  // Preexisting checkpoint only: the positive Nest outcome still comes from its runtime.
  state.story.campaign47a.stepProgress['2']={completed:['cinder_board','compost'],updatedAtS:9};
  const bus = createBus(), events = [];
  bus.on('encounter:resolved',p=>recordBeatStep(state,'encounter:resolved',p,state.simTime));
  bus.on('entity:killed', p=>events.push(p));
  const helpers = { spawnEntity: spawn, removeEntity(id) { const e=state.entities.get(id); if(e)e.alive=false;state.entities.delete(id); } };
  const combat = Object.assign({},combatProto,{state,bus,helpers});
  bus.on('projectile:hit',p=>combat.onHit(p));
  const live={id:authored?'campaign47a:charon:nest:v1':'nest-combat-proof',shapeId:'the_nest',squadId:'nest-combat-proof',sectorId:'sector_charon_expanse',
    phase:'pending',anchor:{x:0,z:0},plan:{zoneCenter:{x:0,z:0},ships:[]},data:{authoredNestVisit:authored},ids:[],roles:{},shape:definition};
  const d={state,bus,helpers,now:()=>state.simTime,player:()=>player,say:()=>{},emit:(n,p)=>bus.emit(n,p),
    spawnShips(lv,specs){return specs.map(sh=>{const spec=makeEnemySpawnSpec(sh.archetype,sh.level,sh.pos,{factionId:sh.factionId,startedTick:state.tick});
      applyNestBroodSpawnSpec(spec,lv,sh.nestActorSlot);const e=spawn(spec);lv.ids.push(e.id);lv.roles[e.id]=sh.role;return e.id;});},
    spawnProp(lv,o){return spawn({type:'beacon',pos:{...o.pos},vel:{x:0,z:0},radius:o.radius,mass:o.mass,hull:1,hullMax:1,data:{storyPropKind:o.storyPropKind,tetherable:true,encounterId:lv.id}});},
    resolve(lv,outcome){assert.equal(recordNestOutcome(d,lv,outcome),true,'actual owner accepts only runtime terminal proof');lv.phase='done';lv.outcome=outcome;bus.emit('encounter:resolved',{shape:'the_nest',encounterId:lv.id,outcome,sectorId:lv.sectorId});},abort(lv,why){lv.phase='done';lv.outcome='aborted:'+why;}};
  state.encounterDirector={live:{[live.id]:live}};
  bus.on('entity:killed',p=>runtime.event(d,live,state,'squadKill',p));
  bus.on('physics:impact',p=>runtime.event(d,live,state,'physicsImpact',p));
  runtime.fire(d,live,state); assert.equal(live.phase,'conflict');
  return {state,player,d,live,combat,bus,events,carrier:state.entities.get(live.data.nest.carrierId)};
}
import { getCombatKernel } from '../src/combat/kernel.js';
import { ROCK_SIZE_CLASSES } from '../src/data/rockSubstances.js';
import { modelTruthRopeEnd } from '../src/data/modelTruth.js';
import { isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
const tether=fs.readFileSync(process.env.NEST_TETHER_SOURCE || new URL('../src/systems/tetherGameplay.js',import.meta.url),'utf8');
const rating=fs.readFileSync(process.env.NEST_LINE_RATING_SOURCE || new URL('../src/data/lineRating.js',import.meta.url),'utf8');
function fn(s,n){const a=s.search(new RegExp('(?:export )?function '+n+'\\(')),b=s.indexOf('\n}',a);assert(a>=0&&b>a,n);return s.slice(a,b+2).replace(/^export /,'');}
function method(s,n){const a=s.indexOf('\n  '+n+'('),b=s.indexOf('\n  },',a);assert(a>=0&&b>a,n);return s.slice(a+3,b+4);}
const no=n=>()=>{throw Error('Unexercised port '+n)};
const ctx=vm.createContext({console,ROCK_SIZE_CLASSES,modelTruthRopeEnd,isDynamicPhysicsBodyEntity,
 isBlackFlagAdventure:()=>true,vesselForEntity:no('drive-disabled vessel'),peekShipjack:no('drive-disabled parley'),hasRecoveryTowConsent:no('drive-disabled consent'),isSurrenderedContact:no('surrender'),
 occupantGenerationOf:e=>e?.occupantGeneration,survivalRoundWreckLatchLegal:()=>false,isMassSeedTetherEligible:no('MassSeed'),
 commandAcquireCandidates:(state,player,max,scratch)=>[...state.entities.values()].filter(e=>e.id!==player.id&&e.data?.candidate===true),
 collectAcquisitionObstacles:()=>[],masslineObstructed:()=>false,compareEntityIds:(a,b)=>String(a.id).localeCompare(String(b?.id)),acquisitionCursorActive:()=>false,
 promoteAsteroidFieldRock:no('field-rock'),TETHER_DEF_ID:'tether_standard',TRANSIENT_NON_TETHERABLE_TYPES:new Set(['projectile','fx']),TOW_TARGET_COM_TYPES:new Set(['wreck','ship','drone','payload','pickup'])});
vm.runInContext(rating.replace(/^import[^;]+;/m,'').replace(/^export /gm,'')+'\n'+['recoveryTowRequiredTier','positive','finite','surfacePointToward','isAttachable','validateAcquisitionTarget','acquisitionAttachmentEndpoints','contextualAttachmentWorlds','towAnchorAtCenterOfMass','invalidateAcquisitionReceipt','statusForReason','bodyMassOf','attachmentDef'].map(n=>fn(tether,n)).join('\n'),ctx);
const tailStart=tether.indexOf('    const def = attachmentDef(kernel, TETHER_DEF_ID);',tether.indexOf('  _updateTetherGameplay('));
const tailEnd=tether.indexOf('\n  },',tailStart);
vm.runInContext('this.hostMethods={'+['_consumeAcquisitionReceipt','_acquireCommandTarget','_clearAcquisitionPreview'].map(n=>method(tether,n)).join(',')+'};\nthis.press=function(kernel,state,player,now){const attachments=kernel.attachments,wantsLatch=true;'+tether.slice(tailStart,tailEnd)+'\n};this.required=recoveryTowRequiredTier;',ctx);
export function ordinaryNestLatch(h,w,mode) {
 h.state.rockCore={tier:0,rating:0};h.state.player.lineProgression={classIndex:1};h.state.input={tetherMode:mode==='nearest'?'nearest':null};w.data.candidate=true;
 const events=[];h.bus.on('tether:attached',p=>{events.push(p);runtime.event(h.d,h.live,h.state,'tetherAttached',p);});h.bus.on('tether:latchDenied',p=>events.push({denial:p.reason}));
 // Explicit physical constraint-creation port: actual attachment authority owns records/event;
 // this admission proof does not claim a native rope solve.
 h.d.helpers.combatPhysics={createAttachment:()=>({id:'bounded-constraint'}),cutAttachment:()=>true};
 const kernel=getCombatKernel({state:h.state,bus:h.bus,helpers:h.d.helpers});
 const host=Object.assign({_noRelatchUntil:-Infinity,_lastPreviewTick:h.state.tick-1,_resetPhaseMirror(){},_refreshAcquisitionPreview(){throw Error('Unexpected preview rebuild');},bus:h.bus},ctx.hostMethods);
 h.state.masslineAcquisition={id:'standing-input-receipt',validUntil:h.state.simTime+1,selected:{targetId:w.id,status:'ready'}};
 ctx.press.call(host,kernel,h.state,h.player,h.state.simTime);return {events,host,kernel};

}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
let passed=0;
for(const mode of ['nearest','preview'])for(const radius of [12,9]){
 const h=harness({authored:radius===9});h.state.simTime=h.live.data.nest.nextLaunchS+.1;runtime.tick(h.d,h.live,h.state,h.state.simTime);
 const w=h.state.entities.get(h.live.data.nest.waspIds[0]);assert.equal(w.radius,radius);w.pos={x:h.player.pos.x+80,z:h.player.pos.z};w.data.candidate=true;
 h.state.rockCore={tier:0,rating:0};h.state.player.lineProgression={classIndex:1};h.state.input={tetherMode:mode==='nearest'?'nearest':null};
 const {events,host,kernel}=ordinaryNestLatch(h,w,mode);
 if(radius===12){assert.equal(events.filter(e=>e.attachmentId).length,0);assert.equal(events.at(-1).denial,'line tier 1 required');assert.notEqual(w.data.thrownBy,'player');}
 else {assert.equal(events.filter(e=>e.attachmentId).length,1);assert.equal(w.data.thrownBy,'player');assert(host._active);assert.equal(kernel.attachments.get(host._active.attachmentId).targetId,w.id);}
 assert.equal(w.mass,16);assert.equal(h.state.rockCore.tier,0);assert.equal(h.state.player.lineProgression.classIndex,1);
 passed++;console.log(JSON.stringify({mode,radius,mass:w.mass,requiredTier:ctx.required(h.state,w),events,accepted:!!host._active}));
}
const progressionSource=fs.readFileSync(process.env.NEST_LINE_PROGRESSION_SOURCE || new URL('../src/data/lineProgression.js',import.meta.url),'utf8');
const progression=vm.runInNewContext(progressionSource.replace(/^export /gm,'')+'\n({lineClassForIndex,defaultLineProgression});');
assert.equal(progression.lineClassForIndex(1).fullControlMassT,20);assert.equal(progression.lineClassForIndex(3).fullControlMassT,400);
const baffle={id:99,type:'beacon',alive:true,hull:1,mass:400,radius:12,pos:{x:0,z:0},data:{}};
assert.equal(ctx.required({rockCore:{tier:0},entities:new Map([[99,baffle]])},baffle),1);
console.log('PASS actual Class I20t capacity admits16t, Class III400t capacity fits baffle mass but baffle radius12 still requires current rating Tier1. No grant changes that separate gate.');passed++;
console.log(`PASS ${passed} actual ordinary admission + actual attachment-service producer cases; standing receipt/input and unobstructed spatial query are ports; native constraint solve unclaimed.`);

}
