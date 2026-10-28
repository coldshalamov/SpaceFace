import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(process.cwd());
const out = resolve(process.argv[2] || '.devshots/coherent-flight-opening-baseline.json');
const seconds = Number(process.argv[3] || 20);
const hash = p => createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const sourcePaths = ['scripts/lib/simWorkerHost.mjs','src/core/newGameBoot.js','src/systems/npcJobsRuntime.js','src/systems/trafficRoleOps.js','src/systems/laneErrands.js','src/ai/npcFieldDeploy.js','src/core/fields/fieldKernel.js','src/systems/fields.js','src/systems/traffic.js','src/core/physics.js','src/core/sg02DynamicBodyOwner.js','src/core/flight/propulsionKernel.js'];
const source = () => ({ head:process.env.PROBE_SOURCE_HEAD||null,
  files:sourcePaths.flatMap(p=>{try{return[{path:p,sha256:hash(p)}]}catch{return[]}}) });
const startSource = source();
const {createSimHost} = await import(pathToFileURL(resolve(root,'scripts/lib/simWorkerHost.mjs')));
const {createSimCommandRing,pushLaneCommand} = await import(pathToFileURL(resolve(root,'scripts/lib/simCommandChannel.mjs')));
const {registerStuntImpulseObserver} = await import(pathToFileURL(resolve(root,'src/combat/stuntEvidence.js')));
const lane=createSimHost();
const clone = v => {try{return structuredClone(v)}catch{return JSON.parse(JSON.stringify(v))}};
const stateNow = () => lane.host.state;
const point = p => p ? {x:Number(p.x)||0,z:Number(p.z)||0} : null;
const identity = e => e ? {id:e.id,generation:e.occupantGeneration,type:e.type,alive:e.alive,
  pos:point(e.pos),vel:point(e.vel),rot:e.rot,angVel:e.angVel,hull:e.hull,shield:e.shield,
  shipId:e.data?.shipId,defId:e.data?.defId,worldRecordId:e.data?.worldRecordId,
  jobId:e.data?.jobId,role:e.data?.role,aiRole:e.data?.ai?.role,name:e.data?.name,
  factionId:e.factionId,team:e.team} : null;
const ids=new Set();
const expectedWorldRecords=['wr_convoy_4541b265','wr_convoy_81bd39bf','wr_convoy_734f663c'];
const samples=[],events=[],impulseStreams=new Map(),stats=new Map();
let inputTick=0,ackJournalEnd=0;
const send=async(steps,...commands)=>{
  const ring=createSimCommandRing();
  for(const command of commands) pushLaneCommand(ring,command);
  const reply=await lane.tick({tick:++inputTick,steps,ackJournalEnd,commands:structuredClone(ring.drain())});
  ackJournalEnd=reply.completedTick?.journalEnd??reply.journalEnd??lane.host.committedJournalSequence;
  for(const ack of reply.rpcAcks||[]) if(!ack.ok)throw new Error(JSON.stringify(ack));
  return reply;
};
const record=(name,payload)=>{
  const state=stateNow();
  const references=[payload?.aId,payload?.bId,payload?.id,payload?.targetId,payload?.attackerId,payload?.sourceId,payload?.ownerId,payload?.impactorId]
    .filter(Number.isSafeInteger);
  events.push({name,tick:state.tick,simTime:state.simTime,payload:clone(payload),
    entities:[...new Set(references)].map(id=>identity(state.entities.get(id))).filter(Boolean)});
  if(name==='entity:killed'){
    const s=stats.get(payload?.id), e=state.entities.get(payload?.id);
    if(s&&e?.occupantGeneration===s.initial?.generation&&s.firstDeadAt==null)s.firstDeadAt=state.simTime;
  }
};
try {
  const init=await lane.init({profile:'production',seed:4242,viewport:{w:960,h:540},
    scenarioContract:JSON.parse(readFileSync(resolve(root,'src/data/scenarios/47a.scenario.json'),'utf8'))});
  ackJournalEnd=init.initRebuild?.end||0;
  for(const name of ['physics:impact','combat:damage','entity:killed','asteroid:destroyed','fields:deployed','npcjobs:phase','npcjobs:flee','npcjobs:resumed','npcjobs:errand'])
    lane.host.bus.on(name,payload=>record(name,payload));
  await send(0,{kind:'mode',mode:'loading'},
    {kind:'rpc',id:'boot',op:'newGameBoot',args:{opts:{seed:4242,name:'Pilot',shipId:'ship_kestrel',starter:'starter_hitch',difficulty:'normal',flownBefore:false}}});
  await send(0,{kind:'mode',mode:'flight'});
  const state=stateNow(),jobs=lane.host.registry.get('npcJobsRuntime');
  const initial=state.entityList.filter(e=>e.type==='ship').map(identity);
  for(const worldRecordId of expectedWorldRecords){
    const actor=initial.find(e=>e.worldRecordId===worldRecordId);
    if(!actor)throw new Error('Missing expected authored actor '+worldRecordId);
    ids.add(actor.id);
  }
  const initialJobs=[...ids].map(id=>{const e=state.entities.get(id);return{entity:identity(e),entry:clone(jobs._byId()[e.data.jobId])}});
  const impulseOff=registerStuntImpulseObserver(state,observation=>{
    const field=observation?.provenance?.field;
    if(observation?.kind!=='field'||field?.ownerId==null)return;
    const entity=observation.entity, key=[entity?.id,entity?.occupantGeneration,field.ownerId,field.id].join(':');
    let row=impulseStreams.get(key);
    if(!row){row={entity:identity(entity),fieldId:field.id,fieldOwnerId:field.ownerId,fieldKind:field.kind,
      count:0,firstTick:observation.tick,lastTick:observation.tick,deltaV:{x:0,z:0},maxDeltaV:0};impulseStreams.set(key,row)}
    const dx=observation.after.x-observation.before.x,dz=observation.after.z-observation.before.z;
    row.count++;row.lastTick=observation.tick;row.deltaV.x+=dx;row.deltaV.z+=dz;
    row.maxDeltaV=Math.max(row.maxDeltaV,Math.hypot(dx,dz));
  });
  const observe=()=>{
    const byId=jobs._byId();
    for(const id of ids){
      let e=state.entities.get(id);
      let s=stats.get(id);
      if(!s){s={initial:identity(e),maxSpeed:0,maxSpeedAt:0,maxSpeedFirst2s:0,
        minHull:e?.hull??null,minShield:e?.shield??null,firstAbsentAt:null,firstDeadAt:null,
        phaseTicks:{},boostTicks:0,errandIds:[],maxRendezvousSpeed:0};stats.set(id,s)}
      if(e&&e.occupantGeneration!==s.initial?.generation)e=null;
      const speed=e?Math.hypot(e.vel?.x||0,e.vel?.z||0):null;
      if(e){if(speed>s.maxSpeed){s.maxSpeed=speed;s.maxSpeedAt=state.simTime;s.atMaxSpeed=identity(e)}
        if(state.simTime<=2+1e-9)s.maxSpeedFirst2s=Math.max(s.maxSpeedFirst2s,speed);
        if(Number.isFinite(e.hull))s.minHull=Math.min(s.minHull??e.hull,e.hull);
        if(Number.isFinite(e.shield))s.minShield=Math.min(s.minShield??e.shield,e.shield);
        if(e.alive===false&&s.firstDeadAt==null)s.firstDeadAt=state.simTime;
        const entry=byId[e.data?.jobId], phase=entry?.job?.phase;
        if(phase)s.phaseTicks[phase]=(s.phaseTicks[phase]||0)+1;
        if(e.data?.intent?.boost)s.boostTicks++;
        if(entry?.errand?.id&&!s.errandIds.includes(entry.errand.id))s.errandIds.push(entry.errand.id);
        const rv=e.data?.intent?.rendezvous?.velocity;
        if(rv)s.maxRendezvousSpeed=Math.max(s.maxRendezvousSpeed,Math.hypot(rv.x,rv.z));
      }else if(s.firstAbsentAt==null)s.firstAbsentAt=state.simTime;
    }
    if(state.tick%6===0){
      samples.push({tick:state.tick,simTime:state.simTime,mode:state.mode,entities:[...ids].map(id=>{
        const e=state.entities.get(id),entry=e?.data?.jobId?byId[e.data.jobId]:null;
        return{...identity(e),observedId:id,intent:clone(e?.data?.intent??null),job:entry?{
          phase:entry.job?.phase,kind:entry.kind,speed:entry.job?.speed,
          threatId:entry.threatId,threat:identity(state.entities.get(entry.threatId)),
          violenceX:entry.violenceX,violenceZ:entry.violenceZ,violenceHold:entry.violenceHold,
          violenceSlow:entry.violenceSlow,routeHold:clone(entry.routeHold??null),errand:clone(entry.errand??null)}:null};
      })});
    }
  };
  observe();
  console.log(JSON.stringify({stage:'boot',source:startSource,initial:initial.filter(e=>ids.has(e.id)||e.id===551),settings:state.settings.gameplay}));
  for(let i=0;i<Math.ceil(seconds*60);i++){await send(1);observe();if((i+1)%300===0)console.log(JSON.stringify({stage:'progress',tick:state.tick,simTime:state.simTime,eventCount:events.length}));}
  impulseOff();
  const final=state.entityList.filter(e=>e.type==='ship').map(identity);
  const result={kind:'production-native-idle-diagnostic',seed:4242,seconds,input:'none',
    description:'Public production newGameBoot and flight-mode descriptors; one authoritative step per observation; no entity/controller writes; bus and actual impulse delivery observation only. No rendered acceptance claim.',
    startSource,endSource:source(),settings:clone(state.settings.gameplay),initial,initialJobs,final,
    stats:[...stats].map(([id,row])=>({id,...row,final:identity(state.entities.get(id))})),
    samples,events,impulseStreams:[...impulseStreams.values()],
    eventCounts:events.reduce((a,e)=>(a[e.name]=(a[e.name]||0)+1,a),{})};
  mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({stage:'complete',out,stats:result.stats,eventCounts:result.eventCounts,impulseStreams:result.impulseStreams.length}));
}finally{lane.shutdown()}
