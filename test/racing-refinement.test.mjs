import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE_LEVELS, courseForLevel, racingOfferFor, raceGateGlobals } from '../src/data/raceLevels.js';
import { advanceCircuit, gateApproach, planeCrossFraction, circuitProgress, circuitPacePoint } from '../src/systems/racingGeometry.js';
import { planeGateCross, raceObjectiveUnits, resetPoseLocal, readRaceTape, racingAssistIntents, raceRecordKey,
  readRaceRecords, rememberRaceRecord, resolveSteeringView, racingRigOf } from '../src/systems/racingSteer.js';
import { createRacingCameraBlend, stepRacingCameraBlend } from '../src/render/racingCameraBlend.js';
import { setSteeringView, toggleSteeringView } from '../src/ui/racingControls.js';
import { armRacingContract, stageRacingLaunch, noteRacingNewGame, takeRacingLaunch } from '../src/ui/racingLaunch.js';
import { missions } from '../src/systems/missions.js';
import { save } from '../src/save/saveSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';

const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ~= ${b}`);
const store=()=>{const map=new Map();return {map,getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const line=[{x:0,z:0},{x:100,z:0},{x:200,z:0}];
const crossing={prev:{x:-10,z:0},pos:{x:10,z:0},vel:{x:10,z:0},from:{x:-1,z:0},gate:{x:0,z:0},radius:10};

test('every circuit closes and its final approach aligns with the grid',()=>{
  for(const level of RACE_LEVELS){
    const c=courseForLevel(level.id),g=c.gates;
    assert.deepEqual(g.at(-1),g[0]);
    const a=gateApproach(g,0),b=gateApproach(g,g.length-1);
    near(a.nx*b.nx+a.nz*b.nz,1,1e-6);
    let length=0;
    for(let i=1;i<g.length;i++)length+=Math.hypot(g[i].x-g[i-1].x,g[i].z-g[i-1].z);
    near(length,c.courseLengthWU,0.011);
  }
});
test('global gate conversion is cached but invalidates on route replacement',()=>{
  const p=racingOfferFor('contract_textile_qual').params;
  const first=raceGateGlobals(p);assert.equal(raceGateGlobals(p),first);
  p.gates=p.gates.map(g=>({...g}));assert.notEqual(raceGateGlobals(p),first);
});
test('swept crossing uses the intersection, not the endpoint inside/outside the ring',()=>{
  assert.equal(planeGateCross({...crossing,prev:{x:-10,z:-100},pos:{x:90,z:900}}),true);
  assert.equal(planeGateCross({...crossing,prev:{x:-10,z:200},pos:{x:1,z:0}}),false);
});
test('arbitrarily slow forward crossing counts; early, reverse and nonfinite samples do not',()=>{
  assert.equal(planeGateCross({...crossing,prev:{x:-0.001,z:0},pos:{x:0.001,z:0},vel:{x:0.002,z:0}}),true);
  assert.equal(planeGateCross({...crossing,pos:{x:-0.01,z:0}}),false);
  assert.equal(planeGateCross({...crossing,vel:{x:-1,z:0}}),false);
  assert.equal(planeGateCross({...crossing,pos:{x:Infinity,z:0}}),false);
  assert.equal(planeGateCross({...crossing,radius:NaN}),false);
  assert.equal(planeCrossFraction(crossing),0.5);
});
test('one tick can score multiple ordered planes at interpolated simulation times',()=>{
  const p={nextGate:0,raceStartSimS:10,gateRadiusWU:10,laps:1};
  const e=advanceCircuit(p,{gates:line,prev:{x:-100,z:0},pos:{x:300,z:0},vel:{x:400,z:0},previousTime:10,now:11});
  assert.deepEqual(e.map(x=>x.gateIndex),[0,1,2]);
  assert.deepEqual(e.map(x=>x.elapsedS),[0.25,0.5,0.75]);
  assert.equal(e.at(-1).finished,true);
});
test('a missed required gate cannot be rescued by a later gate in the same sweep',()=>{
  const p={nextGate:0,raceStartSimS:0,gateRadiusWU:5};
  const e=advanceCircuit(p,{gates:line,prev:{x:-100,z:100},pos:{x:210,z:0},vel:{x:100,z:-30},previousTime:0,now:1});
  assert.equal(e.length,0);assert.equal(p.nextGate,0);
});
test('multi-lap courses skip the already-cleared start, and progress reaches the exact objective count',()=>{
  const p=racingOfferFor('contract_veil_laps').params;p.raceStartSimS=0;
  const gates=raceGateGlobals(p);let time=0,events=0,lapEnds=0,finished=false;
  for(let guard=0;guard<100&&!finished;guard++){
    const i=p.nextGate,g=gates[i],a=gateApproach(gates,i);time++;
    const e=advanceCircuit(p,{gates,prev:{x:g.x-a.nx*10,z:g.z-a.nz*10},pos:{x:g.x+a.nx*10,z:g.z+a.nz*10},
      vel:{x:a.nx*20,z:a.nz*20},previousTime:time-1,now:time});
    assert.equal(e.length,1);events++;if(e[0].lapCompleted){lapEnds++;if(!e[0].finished)assert.equal(p.nextGate,1);}
    finished=e[0].finished;
  }
  assert.equal(finished,true);assert.equal(lapEnds,3);assert.equal(events,raceObjectiveUnits(p));
});
test('recovery cannot teleport forward to the next uncleared checkpoint',()=>{
  const p={gates:line,nextGate:2};const r=resetPoseLocal(p);
  assert.ok(r.x<line[1].x);assert.ok(r.x<line[2].x-100);assert.equal(r.z,0);
  assert.equal(resetPoseLocal({...p,nextGate:0}),null);
});
test('the tape measures off-course distance against the current segment, not the next gate',()=>{
  const gates=[{x:0,z:0},{x:1000,z:0}];
  const p={nextGate:1,gateRadiusWU:90,recordS:100,raceStartSimS:0,laps:1};
  const player={pos:{x:500,z:0},vel:{x:100,z:0},rot:0};
  const tape=readRaceTape(p,player,gates,50);
  assert.equal(tape.offRibbon,false);near(tape.delta,0);assert.equal(tape.lap,1);
  assert.equal(readRaceTape({...p,gridUntilSimS:3,raceStartSimS:null},player,gates,0).lap,1);
});
test('a pace beacon wraps through the full course instead of parking at the last gate',()=>{
  const gates=[...line,{x:0,z:0}];
  assert.deepEqual(circuitPacePoint(gates,70),circuitPacePoint(gates,470));
  near(circuitProgress({nextGate:1,laps:1},{x:50,z:0},line).fraction,0.25);
});
test('burn rings award once per scored lap, never from proximity',()=>{
  const p={gateRadiusWU:90,nextGate:1,boostGateIndex:1};
  const player={pos:{x:100,z:0},vel:{x:100,z:0},rot:0,mass:10};
  const run=()=>racingAssistIntents({params:p,player,simTime:10,gatesGlobal:line});
  assert.equal(run().impulses.filter(x=>x.kind==='boost-ring').length,0);
  p.boostClearedLap=0;let x=run();assert.equal(x.impulses.length,1);Object.assign(p,x.patch);
  assert.equal(run().impulses.length,0);
  p.boostClearedLap=1;assert.equal(run().impulses.length,1);
});
test('record keys separate course revisions, contracts and lap counts',()=>{
  const p=racingOfferFor('contract_textile_qual').params;
  const key=raceRecordKey(p);
  for(const change of [{laps:3},{courseRevision:99},{racingContractId:'other'}])assert.notEqual(key,raceRecordKey({...p,...change}));
  const s=store();assert.equal(rememberRaceRecord(s,key,20),20);
  assert.equal(rememberRaceRecord(s,key,25),20);assert.equal(rememberRaceRecord(s,key,19),19);
  assert.equal(readRaceRecords(s)[key],19);
});
test('record storage rejects prototype, array, null and string poisoning',()=>{
  for(const raw of ['[]','null','{"__proto__":4,"constructor":8,"a":null,"b":"5","ok":9}','{broken']){
    const s={getItem:()=>raw};const bag=readRaceRecords(s);
    assert.equal(Object.hasOwn(bag,'__proto__'),false);assert.equal(Object.hasOwn(bag,'constructor'),false);
    assert.equal(Object.hasOwn(bag,'a'),false);assert.equal(Object.hasOwn(bag,'b'),false);
  }
  assert.equal(rememberRaceRecord(store(),'__proto__',10),null);
});
test('mission phase camera loans release without rewriting the preferred view',()=>{
  const mission={id:'phase',status:'active',type:'delivery',phase:'approach',params:{steerLock:'racing',steerLockPhases:['chase']}};
  const state={mode:'flight',settings:{gameplay:{steeringView:'overhead'}},missions:{active:[mission]}};
  assert.equal(resolveSteeringView(state),'overhead');mission.phase='chase';assert.equal(resolveSteeringView(state),'racing');
  assert.equal(toggleSteeringView(state,null),false);assert.equal(state.settings.gameplay.steeringView,'overhead');
  mission.phase='delivery';assert.equal(resolveSteeringView(state),'overhead');
  assert.equal(toggleSteeringView(state,null),true);assert.equal(resolveSteeringView(state),'racing');
  state.render={photoMode:{active:true}};assert.equal(toggleSteeringView(state,null),false);assert.equal(resolveSteeringView(state),'overhead');
});
test('the shared setting writer creates missing settings bags and emits the changed value',()=>{
  const state={},events=[];setSteeringView(state,{emit:(...args)=>events.push(args)},'racing');
  assert.equal(state.settings.gameplay.steeringView,'racing');assert.equal(events[0][1].value,'racing');
  assert.equal(racingRigOf({gameplay:{racingDistance:null}}).distance,58);
});

function launchHarness(){
  const calls=[];const p={id:1,alive:true,pos:{x:0,z:0}};
  const state={mode:'flight',playerId:1,entities:new Map([[1,p]]),world:{currentSectorId:'other'},missions:{active:[]},jump:{state:'idle'}};
  const world={enterSector:id=>{calls.push('enter');state.world.currentSectorId=id;},relocatePlayerInSector:()=>{calls.push('relocate');return true;}};
  const missions={postAndAcceptAuthoredOffer:()=>{calls.push('accept');return {ok:true,missionId:'new'};}};
  return {calls,state,world,missions,ctx:{state,bus:{emit:(name)=>calls.push(name)},registry:{get:name=>name==='world'?world:missions}}};
}
test('launch refuses missing player, relocation, capacity and active races before moving any world',()=>{
  const cases=[h=>h.state.entities.clear(),h=>delete h.world.relocatePlayerInSector,h=>h.state.missions.active=[{type:'race',status:'active'}],h=>h.state.missions.active=Array(8).fill({})];
  for(const change of cases){const h=launchHarness();change(h);assert.equal(armRacingContract(h.ctx,'contract_textile_qual',{allowEnterSector:true}).ok,false);assert.equal(h.calls.includes('enter'),false);assert.equal(h.calls.includes('accept'),false);}
});
test('accept failure has no sector side effect; successful fresh launch accepts before it moves',()=>{
  let h=launchHarness();h.missions.postAndAcceptAuthoredOffer=()=>({ok:false});
  assert.equal(armRacingContract(h.ctx,'contract_textile_qual',{allowEnterSector:true}).ok,false);assert.equal(h.calls.includes('enter'),false);
  h=launchHarness();assert.equal(armRacingContract(h.ctx,'contract_textile_qual',{allowEnterSector:true}).ok,true);
  assert.ok(h.calls.indexOf('accept')<h.calls.indexOf('enter'));assert.ok(h.calls.includes('relocate'));
});
test('failed relocation abandons through the mission owner; stale staged launches are cancelled',()=>{
  const h=launchHarness();h.world.relocatePlayerInSector=()=>false;
  assert.equal(armRacingContract(h.ctx,'contract_textile_qual',{allowEnterSector:true}).reason,'grid_failed');
  assert.ok(h.calls.includes('mission:abandon'));
  let p=stageRacingLaunch('contract_textile_qual');noteRacingNewGame({seed:p.seed});assert.equal(takeRacingLaunch(),null);
  p=stageRacingLaunch('contract_textile_qual');noteRacingNewGame({seed:p.seed,racingSession:true});assert.equal(takeRacingLaunch().contractId,p.contractId);
  assert.equal(stageRacingLaunch('unknown'),null);
});
test('circuit launch leaves a tethered campaign hull and its mission book untouched',()=>{
  const h=launchHarness();h.state.player={tether:{active:true,targetId:9}};
  assert.equal(armRacingContract(h.ctx,'contract_textile_qual',{allowEnterSector:true}).reason,'tether_active');
  assert.equal(h.calls.includes('accept'),false);assert.equal(h.calls.includes('relocate'),false);
});
test('recovery requires releasing the Massline instead of teleporting one end of its attachment',()=>{
  const h=missionHarness();h.state.player={tether:{active:true,targetId:9}};
  let moved=0;h.host.registry={get:()=>({relocatePlayerInSector:()=>{moved++;return true;}})};
  missions._resetAuthoredRace.call(h.host);
  assert.equal(moved,0);assert.equal(h.p.resetCount,undefined);
  assert.ok(h.emitted.some(([name,p])=>name==='toast'&&/Massline/.test(p.text)));
});
const overhead={eyeX:0,eyeY:160,eyeZ:180,lookX:0,lookZ:0};
const rig={distance:58,height:22,lookAhead:36};
function pose(memory,dt,enabled,anchor={x:0,z:0},yaw=0,reduced=false,top=overhead){
  return stepRacingCameraBlend(memory,dt,enabled,anchor,yaw,500,rig,top,reduced,{});
}
test('overhead defaults remain bit-exact, and transitions keep the eye outside the hull',()=>{
  const m=createRacingCameraBlend();assert.deepEqual(pose(m,1/60,false),overhead);
  const first=pose(m,1/60,true);assert.ok(first.eyeY>22&&first.eyeY<160);
  for(let i=0;i<180;i++){const p=pose(m,1/60,true);assert.ok(Math.hypot(p.eyeX,p.eyeZ)>=57.999);}
  near(pose(m,1/60,true).eyeX,-58,0.05);
});
test('camera easing is frame-rate independent for fixed targets, and yaw crosses the short arc',()=>{
  const results=[30,60,144].map(hz=>{const m=createRacingCameraBlend();let p;for(let i=0;i<hz;i++)p=pose(m,1/hz,true);return p;});
  near(results[0].eyeY,results[1].eyeY);near(results[1].eyeY,results[2].eyeY);
  const m=createRacingCameraBlend();m.mix=1;m.yaw=Math.PI-0.02;pose(m,1/60,true,{x:0,z:0},-Math.PI+0.02);
  assert.ok(m.yaw>Math.PI-0.02);assert.ok(m.yaw<Math.PI+0.02);
});
test('relative camera state survives a floating-origin shift, and reduced motion removes speed lead',()=>{
  const a=createRacingCameraBlend();a.mix=1;a.yaw=0;
  const p=pose(a,0,true,{x:0,z:0},0,true);near(p.lookX,36);
  const b={...a};const q=pose(b,0,true,{x:-10000,z:30000},0,true,
    {...overhead,eyeX:-10000,eyeZ:30180,lookX:-10000,lookZ:30000});
  near(q.eyeX-p.eyeX,-10000);near(q.eyeZ-p.eyeZ,30000);
  const forced=stepRacingCameraBlend(b,1/60,true,{x:0,z:0},0,500,rig,overhead,false,{},true);
  assert.deepEqual(forced,overhead);
});

function missionHarness(id='contract_textile_qual'){
  const offer=racingOfferFor(id),p=offer.params;p.gridUntilSimS=0;p.raceStartSimS=0;
  const player={id:1,alive:true,pos:{x:0,z:0},vel:{x:0,z:0},rot:0,mass:10};
  const m={...offer,id:'live',status:'active',params:p};
  const state={mode:'flight',simTime:0,playerId:1,entities:new Map([[1,player]]),world:{currentSectorId:p.courseSectorId},missions:{active:[m]}};
  const emitted=[];let completed=0,failed=0;
  const host={state,bus:{emit:(...args)=>emitted.push(args)},_refreshTrackedMissionNav:()=>{},_completeMission:()=>completed++, _failMission:()=>failed++};
  return {p,m,state,host,player,emitted,get completed(){return completed;},get failed(){return failed;}};
}
test('real mission driver completes all three laps once, publishes splits and stores a clean result',()=>{
  const h=missionHarness('contract_veil_laps');const s=store(),old=globalThis.localStorage;globalThis.localStorage=s;
  try{
    const gates=raceGateGlobals(h.p);
    for(let i=0;i<100&&!h.completed;i++){
      const next=h.p.nextGate,g=gates[next],a=gateApproach(gates,next);h.state.simTime++;
      h.p.planeSample={x:g.x-a.nx*10,z:g.z-a.nz*10};h.p.planeSampleSimS=h.state.simTime-1;
      h.player.pos={x:g.x+a.nx*10,z:g.z+a.nz*10};h.player.vel={x:a.nx*20,z:a.nz*20};
      missions._driveAuthoredRace.call(h.host,h.m,0,h.state);
    }
    assert.equal(h.completed,1);assert.equal(h.failed,0);assert.equal(h.p.raceClean,true);assert.equal(h.p.lapTimesS.length,3);
    assert.equal(h.m.objectiveProgress,raceObjectiveUnits(h.p));assert.equal(readRaceRecords(s)[raceRecordKey(h.p)],h.p.raceElapsedS);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('recovery finish does not write a clean best; lost player and wrong sector fail instead of hanging',()=>{
  const h=missionHarness();h.p.resetCount=1;const gates=raceGateGlobals(h.p);h.p.nextGate=gates.length-1;
  const g=gates.at(-1),a=gateApproach(gates,gates.length-1);h.state.simTime=30;
  h.p.planeSample={x:g.x-a.nx,z:g.z-a.nz};h.p.planeSampleSimS=29;
  h.player.pos={x:g.x+a.nx,z:g.z+a.nz};h.player.vel={x:a.nx,z:a.nz};
  const s=store(),old=globalThis.localStorage;globalThis.localStorage=s;
  try{missions._driveAuthoredRace.call(h.host,h.m,0,h.state);assert.equal(h.completed,1);assert.equal(h.p.raceClean,false);assert.equal(s.map.size,0);}
  finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
  for(const mutate of [h=>h.state.entities.clear(),h=>h.state.world.currentSectorId='other']){
    const x=missionHarness();mutate(x);missions._driveAuthoredRace.call(x.host,x.m,0,x.state);assert.equal(x.failed,1);
  }
});
test('the real save owner suppresses manual, direct, interval and exit writes throughout an ephemeral circuit',()=>{
  const state=createGameState(239),bus=createBus(),host={...save},s=store(),old=globalThis.localStorage;globalThis.localStorage=s;
  try{
    host.init({state,bus,helpers:{},registry:{get:()=>null}});
    s.setItem('campaign-proof','KEEP');const before=JSON.stringify([...s.map]);
    bus.emit('game:new',{racingSession:true});bus.emit('game:newGame',{racingSession:true});bus.emit('game:started',{});
    state.mode='flight';
    assert.equal(host._campaignSaveSuppressed(),true);assert.equal(host.save('quick'),false);
    assert.equal(host.requestAutosave('mission'),false);assert.equal(host.requestExitAutosave(),false);
    bus.emit('game:save',{slot:'quick'});bus.emit('mission:completed',{});bus.emit('game:exitToMenu',{});
    assert.equal(JSON.stringify([...s.map]),before);
    bus.emit('save:loaded',{});assert.equal(host._campaignSaveSuppressed(),false);
    bus.emit('game:new',{racingSession:true});assert.equal(host._campaignSaveSuppressed(),true);
    bus.emit('game:new',{});assert.equal(host._campaignSaveSuppressed(),false);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});

test('pre-green crossings and time-reversed samples do not advance the circuit',()=>{
  const p={nextGate:0,raceStartSimS:1,gateRadiusWU:10};
  assert.deepEqual(advanceCircuit(p,{gates:line,prev:{x:-10,z:0},pos:{x:100,z:0},vel:{x:110,z:0},previousTime:0,now:1.1}),[]);
  assert.equal(p.nextGate,0);
});
test('a failed local-record write is reported as failure rather than a persisted best',()=>{
  assert.equal(rememberRaceRecord({getItem:()=>null,setItem:()=>{throw new Error('Quota');}},'course:contract',20),null);
});
import { racingTouchDrive } from '../src/systems/racingGeometry.js';
test('chase touch axes steer independently of heading and brake instead of reversing down-screen',()=>{
  assert.deepEqual(racingTouchDrive({x:0,y:-1,magnitude:0.7}),{turn:0,thrust:0.7,brake:false});
  assert.deepEqual(racingTouchDrive({x:1,y:0,magnitude:1}),{turn:1,thrust:0,brake:false});
  assert.deepEqual(racingTouchDrive({x:0,y:1,magnitude:1}),{turn:0,thrust:0,brake:true});
  assert.deepEqual(racingTouchDrive({x:NaN,y:Infinity,magnitude:NaN}),{turn:0,thrust:0,brake:false});
});

test('public race dispatch reaches authored terminal cleanup before legacy out-of-sector guards',()=>{
  const h=missionHarness();h.host._driveAuthoredRace=missions._driveAuthoredRace;
  h.state.world.currentSectorId='elsewhere';
  missions._driveRace.call(h.host,h.m,0,h.state);
  assert.equal(h.failed,1);
});

import { flightV3 } from '../src/systems/flightV3.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
test('real flight owner holds the grid against raw thrust, yaw, boost and draw-flight',()=>{
  const state=createGameState(239),bus=createBus(),host={...flightV3};
  const p={id:1,type:'ship',alive:true,pos:{x:0,z:0},vel:{x:0,z:0},rot:0,angVel:0,radius:6,mass:24,
    flags:{},maxSpeed:320,hull:100,hullMax:100,energy:100,maxEnergy:100};
  state.mode='flight';state.simTime=0;state.playerId=1;state.entities.set(1,p);
  state.missions.active=[{type:'race',status:'active',params:{racingContractId:'test',gridUntilSimS:3}}];
  state.input.autoFire=true;
  host.init({state,bus});
  host._stepCraft(p,{thrust:1,turn:1,strafe:1,boost:true,drawFlight:{active:true}},1/60,state,true);
  const cmd=consumePhysicsCommand(p);
  assert.ok(cmd);assert.deepEqual(cmd.control.force,{x:0,y:0,z:0});
  assert.equal(Math.abs(cmd.control.torque.y),0);assert.equal(cmd.impulses.length,0);
});
