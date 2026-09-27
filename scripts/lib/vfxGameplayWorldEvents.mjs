// Isolated receipts for the shipping presentation owners. This module draws nothing.
import { presentationOrchestrator } from '../../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../../src/systems/presentationAdapters.js';
import { createSurfaceContactReceipt } from '../../src/core/surfaceContact.js';
import { resolveCollisionConsequence } from '../../src/combat/impulseKernel.js';
import { THRESHOLD as WANTED_THRESHOLD, heatLevelFor, wantedTierInfo } from '../../src/systems/heat.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../../src/data/sectorActivityPockets.js';
import { CERES_JOB_ACTION_VFX_CONTRACTS } from '../../src/render/ceresJobActionVfx.js';
import { NPC_JOB_SCHEMA } from '../../src/systems/npcJobs.js';
import { RECORD_KIND, stableRecordId } from '../../src/world/worldRecords.js';

const STATION_KINDS = ['hauler_dock','patrol_launch','repair_drone','cargo_tractor','sensor_sweep','quiet_dock'];
const JOB_NAMES = ['refinery-hauler','miner','surveyor','crossing-hauler','escort','salvor','patrol'];
export const GAMEPLAY_WORLD_EVENT_SCENARIOS = Object.freeze({
  'world-cruise':3.2, 'world-jump':4.2, 'world-jump-abort':2.6, 'world-interdiction':2.6,
  'world-collision-contact':1.8, 'world-collision-consequence':2.2,
  'world-shield-contact':1.8, 'world-shield-collapse':2.3, 'world-weak-point':1.8,
  'world-subsystem-disable':2, 'world-subsystem-restore':2,
  'world-bank-stone':1.8, 'world-ricochet-mirror':1.8,
  'world-mining-seam':2, 'world-mining-vent':1.8, 'world-mining-exposure':2.2,
  'world-mining-charge':1.8, 'world-mining-chunk':2.3, 'world-mining-yield':2.2,
  'world-mining-bulk':2, 'world-salvage-cut':2, 'world-salvage-complete':2.5,
  'world-pickup':1.8, 'world-ai-flyby':2.6, 'world-ai-tether':2.6,
  'world-ai-charge':2.6, 'world-ai-flee':2, 'world-ai-formation':2,
  'world-law-scan':2.2, 'world-law-wanted':2.3,
  'world-survey':2.6, 'world-signal-classified':2.1, 'world-signal-tracked':2,
  'world-signal-investigated':2, 'world-drill-scan':2, 'world-drill-contact':2,
  'world-drill-break':2, 'world-drill-yield':2, 'world-drill-gas':2.2,
  'world-drill-cargo-full':2, 'world-drill-warn':2, 'world-drill-abort':2, 'world-drill-retry':2,
  ...Object.fromEntries(STATION_KINDS.map(kind=>[`world-station-${kind.replaceAll('_','-')}`,5])),
  ...Object.fromEntries(JOB_NAMES.map(kind=>[`world-job-${kind}`,2.4])),
});

export function gameplayWorldTargetKind(id) {
  if(id.startsWith('world-station-')||id==='world-job-refinery-hauler')return 'station';
  if(id.startsWith('world-ai-')||id.startsWith('world-salvage-')||id.startsWith('world-shield-')
    ||id.startsWith('world-subsystem-')||id==='world-weak-point'||id==='world-job-escort'||id==='world-job-salvor')return 'ship';
  if(id==='world-pickup')return 'cargo';
  return 'asteroid';
}

// Both production systems are event driven. Their bus is private to this lab; in particular,
// orchestrator.init binds the combat causal tap, so never install this alongside a real game.
export function installGameplayWorldPresentation({state,bus,helpers}) {
  const orchestrator=Object.create(presentationOrchestrator),adapters=Object.create(presentationAdapters);
  orchestrator.init({state,bus,helpers});
  adapters.init({state,bus,helpers});
  let disposed=false;
  return {
    update() {},
    clear(){if(!disposed){orchestrator._resetRuntime();adapters._resetRuntime();}},
    inspect:()=>({orchestrator:orchestrator.inspect(),adapters:adapters.inspect()}),
    dispose(){if(!disposed){adapters.dispose();orchestrator.dispose();disposed=true;}},
  };
}

export function createGameplayWorldEvents({state,owner,shipMesh,targetMesh}) {
  let scenario='idle',events=[],fired=new Set(),restores=[];
  const save=(object,key,value)=>{
    const present=Object.hasOwn(object,key),prior=object[key];
    restores.push(()=>{if(present)object[key]=prior;else delete object[key];});object[key]=value;
  };
  const point=p=>({x:p.x,z:p.z});
  const auxiliary=(id,entity)=>{
    if(state.entities.has(id))throw new Error(`World VFX fixture entity collision: ${id}`);
    state.entities.set(id,{...entity,id});restores.push(()=>state.entities.delete(id));
    return id;
  };
  const emit=(name,payload)=>{
    owner.fireEvent(name,payload);
    events.push({name,at:state.simTime,payload});
  };
  function reset(id='idle') {
    for(let i=restores.length-1;i>=0;i--)restores[i]();
    restores=[];scenario=id;events=[];fired=new Set();
    if(!Object.hasOwn(GAMEPLAY_WORLD_EVENT_SCENARIOS,id))return;
    const ship=state.entities.get(state.playerId),target=state.entities.get(2);
    if(!ship?.pos||!target?.pos)throw new Error('World VFX fixtures require player and entity 2');
    save(ship,'view',{root:ship.view?.root||shipMesh});save(target,'view',{root:target.view?.root||targetMesh});
    save(state,'world',{...state.world,currentSectorId:CERES_ACTIVITY_SECTOR_ID});
    save(state,'player',{...state.player,heat:0,mining:{...state.player?.mining}});
    save(state,'drill',{asteroidId:target.id,scan:{serial:1}});
    save(state,'jump',{state:'IDLE',targetSectorId:'sector_outer_rim',via:'drive',chargeNeeded:1.4});
    save(state,'traffic',{...state.traffic,labJobs:Object.create(null)});
    save(state,'meta',{...state.meta,seed:state.meta?.seed||17});
    save(state,'tick',state.tick||0);
    if(id.startsWith('world-ai-')){
      save(target,'data',{...target.data,squadId:'lab-wing'});
    }
  }
  function once(key,at,fn){if(state.simTime>=at&&!fired.has(key)){fn();fired.add(key);}}
  function jobReceipt(index,ship,target) {
    const c=CERES_JOB_ACTION_VFX_CONTRACTS[index],sectorId=CERES_ACTIVITY_SECTOR_ID;
    const worldRecordId=stableRecordId(state.meta.seed,sectorId,RECORD_KIND.CONVOY,c.worldRecordSlotId);
    const jobId=`job:${worldRecordId}`;
    // The real job consumer validates all authority against npcJobs.get, including its exact
    // completion waypoint. Merely stamping the public event name cannot admit these effects.
    save(ship,'homeSectorId',sectorId);
    save(ship,'data',{...ship.data,homeSectorId:sectorId,sectorId,worldRecordId,jobId,
      activityActorSlotId:c.slotId,ceresActivityCast:true,ceresActivityJobOwned:true});
    let targetId=null;
    if(c.targetMatch!=='activity'){
      targetId=target.id;save(target,'homeSectorId',sectorId);
      const data={...target.data,homeSectorId:sectorId,sectorId};
      if(c.targetMatch==='station')data.stationId=c.targetValue;
      if(c.targetMatch==='field-slot')data.activityObjectSlotId=c.targetValue;
      if(c.targetMatch==='world-site'){data.worldRecordId=c.targetValue;save(target,'type','fx');}
      if(c.targetMatch==='actor-slot'){
        const other=CERES_JOB_ACTION_VFX_CONTRACTS.find(row=>row.slotId===c.targetValue);
        data.worldRecordId=stableRecordId(state.meta.seed,sectorId,RECORD_KIND.CONVOY,other.worldRecordSlotId);
        data.activityActorSlotId=c.targetValue;data.ceresActivityCast=true;data.ceresActivityJobOwned=true;
        delete data.jobId;
      }
      save(target,'data',data);
    }
    const sequence=1,simTime=state.simTime;
    state.traffic.labJobs[jobId]={kind:c.jobKind,sectorId,worldRecordId,entityId:ship.id,
      job:{schema:NPC_JOB_SCHEMA,id:jobId,kind:c.jobKind,phase:c.action,progress:1,
        sequence,simTime,routeIndex:c.waypointIndex,materialized:true,corrupt:false,
        payload:c.jobKind==='hauler'?{activityRunSeq:sequence}:null,
        route:[{id:'lab-start',pos:point(ship.pos)},
          {id:c.waypointId,targetRef:c.targetRef,pos:point(target.pos)}]}};
    const receiptId=`ceres-job-action:${jobId}:${c.action}:${sequence}:${c.targetRef}`;
    return {schema:'spaceface.trafficJobActionReceipt.v1',receiptId,actionId:receiptId,
      sectorId,routeId:c.routeId,jobId,jobKind:c.jobKind,action:c.action,sequence,
      kernelSequence:sequence,actorSlotId:c.slotId,actorId:ship.id,targetRef:c.targetRef,
      targetKind:c.targetKind,targetId,effectType:c.effectType,effectApplied:c.effectApplied,simTime};
  }
  function update() {
    if(!Object.hasOwn(GAMEPLAY_WORLD_EVENT_SCENARIOS,scenario))return;
    const ship=state.entities.get(state.playerId),target=state.entities.get(2);
    if(!ship?.pos||!target?.pos)throw new Error('World VFX fixture lost its live anchors');
    state.tick=Math.floor(state.simTime*60);
    const s=ship.pos,t=target.pos;
    const toward=Math.atan2(s.z-t.z,s.x-t.x),normal={x:Math.cos(toward),z:Math.sin(toward)};
    const contact={x:t.x+normal.x*target.radius,z:t.z+normal.z*target.radius};
    const shipContact={x:s.x-normal.x*ship.radius,z:s.z-normal.z*ship.radius};
    const targetId=target.id,playerId=ship.id;
    if(scenario==='world-cruise'){
      once('charge',.2,()=>emit('cruise:charging',{playerId}));
      once('engage',1,()=>emit('cruise:engaged',{playerId}));
      once('drop',2.1,()=>emit('cruise:dropped',{reason:'manual',was:'engaged',playerId,snare:false}));return;
    }
    if(scenario==='world-jump'||scenario==='world-jump-abort'){
      once('charge',.2,()=>{state.jump.state='CHARGING';emit('jump:chargeStart',{targetSectorId:state.jump.targetSectorId,via:'drive',chargeNeeded:1.4,playerId});});
      once('commit-window',.9,()=>emit('jump:chargeTick',{progress:.75,playerId}));
      once('commit',1.5,()=>{
        if(scenario.endsWith('abort')){state.jump.state='IDLE';emit('jump:chargeAbort',{reason:'combat_lock'});}
        else{state.jump.state='JUMPING';emit('jump:start',{from:CERES_ACTIVITY_SECTOR_ID,to:state.jump.targetSectorId,via:'drive',fromPos:point(s),playerId});}
      });
      if(scenario==='world-jump')once('arrive',2.5,()=>{
        state.jump.state='COOLDOWN';emit('jump:arrive',{sectorId:state.jump.targetSectorId,interdicted:false,ambushCount:0,toPos:point(s),playerId});
      });return;
    }
    if(scenario==='world-survey'){
      once('pulse',.2,()=>emit('scan:pulse',{pos:point(s)}));
      once('return',1,()=>emit('scan:completed',{targetId:null,sectorId:CERES_ACTIVITY_SECTOR_ID,found:{asteroids:1},signalCount:0}));return;
    }
    once('main',.2,()=>{
      if(scenario.startsWith('world-station-')){
        const kind=scenario.slice(14).replaceAll('-','_');
        emit('station:sideEvent',{eventId:`lab-${kind}`,kind,stationId:targetId,path:kind,
          durationS:3.8,budget:0,bearing:toward,from:{x:t.x+normal.x*28,z:t.z+normal.z*28},
          to:{x:t.x-normal.x*14,z:t.z-normal.z*14},entityIds:[]});return;
      }
      if(scenario.startsWith('world-job-')){
        emit('traffic:jobActionReceipt',jobReceipt(JOB_NAMES.indexOf(scenario.slice(10)),ship,target));return;
      }
      if(scenario.startsWith('world-ai-')){
        const kind=scenario.slice(9);
        if(kind==='flee')emit('ai:flee',{entityId:targetId,squadId:'lab-wing',reason:'wingMorale:leaderDown',until:2,destructionCause:'generic',shockMultiplier:1,auraTitleId:null});
        else if(kind==='formation')emit('ai:formationBroken',{groupId:'lab-wing',squadId:'lab-wing',leaderId:'lab-absent-leader',reason:'leaderDown',destruction:null,shockMultiplier:1});
        else{
          const row={flyby:['engine_flare','interceptor_flyby'],tether:['attach_spool','tether_control_raider'],charge:['weapon_charge','ranged_disengager']}[kind];
          emit('ai:telegraph',{entityId:targetId,targetId:playerId,doctrineId:row[1],phase:'telegraph',kind:row[0],durationTicks:90,attackLine:null,tick:state.tick});
        }return;
      }
      if(scenario.startsWith('world-drill-')){
        const kind=scenario.slice(12),pos={col:3,row:4};
        const rows={scan:['scanPulse',{...pos,radius:5,cooldown:3,contacts:3,serial:1}],
          contact:['spark',{...pos,type:'rock',ore:null,hpFrac:.65,bore:.35,bite:true,hardness:1.4,energy:60}],
          break:['break',{...pos,type:'rock',ore:null,wasVein:false,wasGas:false}],
          yield:['yield',{commodityId:'cmdty_ore_iron',qty:3,pos}],gas:['gasHit',{dmg:8,pos}],
          'cargo-full':['cargoFull',{commodityId:'cmdty_ore_iron',qty:3,pos}],
          warn:['warn',{text:'Drill cooling down — release the bore.',reason:'overheat'}],
          abort:['end',{reason:'aborted',asteroidId:targetId,yieldLog:{},tilesCleared:4,maxDepth:4}],
          retry:['retry',{asteroidId:targetId,previous:{reason:'aborted'}}]};
        const [event,payload]=rows[kind];emit(`drill:${event}`,payload);return;
      }
      switch(scenario){
        case 'world-interdiction':emit('interdiction:triggered',{sectorId:CERES_ACTIVITY_SECTOR_ID,ambushCount:1,spawnPos:point(s),entityIds:[targetId],refId:null,tags:[]});break;
        case 'world-collision-contact':emit('physics:impact',{consequenceKernelVersion:1,backend:'rapier-dynamic',tick:state.tick,aId:playerId,bId:targetId,dp:22,trauma:.12,impulse:22,playerInvolved:true,playerDeltaV:3,causalActorId:playerId,pos:shipContact,normal,preSolveClosingSpeed:14});break;
        case 'world-collision-consequence':{
          const receipt=resolveCollisionConsequence({target:ship,other:target,exchangedMomentum:(ship.mass||10)*18,preSolveClosingSpeed:34,tick:state.tick,pos:shipContact,normal});
          if(!receipt)throw new Error('Collision fixture did not produce a native consequence');
          emit('combat:collisionConsequence',{...receipt,targetType:ship.type,otherType:target.type,targetMass:ship.mass,victimLife:{dead:false},targetHostile:false});break;
        }
        case 'world-shield-contact':case 'world-shield-collapse':{
          const brokeShield=scenario==='world-shield-collapse';
          emit('combat:damage',{targetId:playerId,attackerId:targetId,amount:18,rawTotal:18,applied:18,type:'energy',damageType:null,emp:false,channels:{energy:18},shieldDamage:18,armorDamage:0,hullDamage:0,subsystemDamage:0,before:{shield:brokeShield?18:50,hull:80},after:{shield:brokeShield?0:32,hull:80},shieldHit:true,armorHit:false,hullHit:false,dominantLayer:'shield',brokeShield,shieldAbsorbed:true,isPlayer:true,pos:shipContact,approach:normal,normal:{x:-normal.x,z:-normal.z},factionId:null,subsystemId:null,origin:'projectile',weaponId:'wpn_plasma_cannon_m'});break;
        }
        case 'world-weak-point':emit('combat:weakPointHit',{targetId,ownerId:playerId,label:'DRIVE',mult:1.5,critical:true,criticalLabel:'CRIT',pos:contact});break;
        case 'world-subsystem-disable':case 'world-subsystem-restore':{
          const disabled=scenario.endsWith('disable');emit(disabled?'combat:subsystemDisabled':'combat:subsystemEnabled',{attackerId:disabled?targetId:null,targetId:playerId,subsystemId:'drive',dependencyDisabled:false,cueId:disabled?'combat.subsystem.drive_disabled':'combat.subsystem.restored'});break;
        }
        case 'world-bank-stone':case 'world-ricochet-mirror':{
          const material=scenario==='world-bank-stone'?'bank_stone':'mirror';
          const incoming={x:-normal.x*90-normal.z*35,z:-normal.z*90+normal.x*35};
          const outgoing={x:normal.x*90-normal.z*35,z:normal.z*90+normal.x*35};
          const receipt=createSurfaceContactReceipt({point:contact,normal,material,velocity:incoming,projectileId:'lab-bounce',surfaceId:targetId,tick:state.tick});
          emit('combat:bounceContinued',{projectileId:'lab-bounce',ownerId:playerId,targetId,surfaceId:targetId,material,tick:state.tick,receipt,incoming,outgoing});break;
        }
        case 'world-mining-seam':emit('mining:seamHit',{asteroidId:targetId});break;
        case 'world-mining-vent':emit('mining:ventReady',{minerId:playerId,heat:78,heatMax:100,pct:.78,bandLo:.75});break;
        case 'world-mining-exposure':emit('mining:richCoreExposed',{asteroidId:targetId,commodityId:'cmdty_ore_iron',multiplier:3,windowPct:.25,durationS:2,minerId:playerId});break;
        case 'world-mining-charge':emit('mining:richCoreChargeStart',{asteroidId:targetId});break;
        case 'world-mining-chunk':{
          const chunkId=auxiliary('lab-world-chunk',{...target,pos:contact,prevPos:contact,radius:3,data:{...target.data,isChunk:true}});
          emit('asteroid:chunked',{parentId:targetId,chunkId,minerId:playerId,massU:8,bulkCore:false,commodityId:'cmdty_ore_iron'});break;
        }
        case 'world-mining-yield':emit('mining:yield',{commodityId:'cmdty_ore_iron',qty:3,pos:contact,minerId:playerId});break;
        case 'world-mining-bulk':emit('mining:bulkRequiresTether',{asteroidId:targetId,massU:45,commodityId:'cmdty_ore_iron'});break;
        case 'world-salvage-cut':{
          const payloadId=auxiliary('lab-world-plate',{...target,type:'cargo',pos:contact,prevPos:contact,radius:2});
          emit('salvage:cutComplete',{targetId,payloadId});break;
        }
        case 'world-salvage-complete':emit('salvage:completed',{wreckId:targetId,markerId:null,loot:{cmdty_ore_iron:2},pos:point(t),radius:target.radius});break;
        case 'world-pickup':emit('pickup:collected',{pickupId:targetId,collectorId:playerId,kind:'ore',amount:3,commodityId:'cmdty_ore_iron',pos:point(t)});break;
        case 'world-law-scan':emit('player:scannedByPatrol',{hasContraband:false,source:'patrol'});break;
        case 'world-law-wanted':{
          state.player.heat=WANTED_THRESHOLD+.04;
          const tier=wantedTierInfo(state.player.heat);
          emit('heat:changed',{value:state.player.heat,previousValue:WANTED_THRESHOLD-.01,level:heatLevelFor(state.player.heat),tier:tier.id,escape:tier.escape,zone:null,reason:'assault',wanted:true,wantedCrossed:true,incident:null,suspicion:1,threshold:WANTED_THRESHOLD});break;
        }
        case 'world-signal-classified':case 'world-signal-tracked':case 'world-signal-investigated':{
          const record={id:'lab-signal',sectorId:CERES_ACTIVITY_SECTOR_ID,classification:'mineral_signature',sourceKind:'asteroid',sourceId:targetId,entityId:targetId,pos:contact,status:'detected',trackable:true};
          if(scenario.endsWith('classified'))emit('signal:scanResults',{sectorId:CERES_ACTIVITY_SECTOR_ID,scannedAt:state.simTime,primary:record,signals:[record],total:1});
          else if(scenario.endsWith('tracked'))emit('signal:tracked',{...record,course:{pos:contact,targetEntityId:targetId}});
          else emit('signal:investigated',{...record,id:'signal-receipt:lab-signal',signalId:record.id,outcome:'investigated',completedAt:state.simTime});break;
        }
      }
    });
  }
  return {reset,update,inspect:()=>({scenario,targetKind:gameplayWorldTargetKind(scenario),events})};
}
