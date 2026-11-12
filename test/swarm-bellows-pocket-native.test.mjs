import test from 'node:test';
import assert from 'node:assert/strict';
import {bootRealPath} from '../scripts/lib/bench/realPath.mjs';
import {input} from '../src/systems/input.js';
import {combat} from '../src/systems/combat.js';
import {runSession} from '../src/systems/runSession.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {survivalWave} from '../src/systems/survivalWave.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {survivalArena} from '../src/systems/survivalArena.js';
import {createRunState} from '../src/core/runState.js';
import {planWave} from '../src/systems/survivalWavePlanner.js';
import {planSwarmBellowsPocket} from '../src/systems/swarmBellowsPocket.js';
import {COMBAT_LAB_STARTER_PACKAGES} from '../src/data/combatLabSetups.js';
const seed=73311, wave=17, kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='energy_baseline'),fittings=Array(13).fill(null);for(const row of kit.loadout)fittings[row.slotIndex]=row.defId;
test('ordinary laser fire turns the authored Bellows pocket into credited terrain collateral',async()=>{
const h=await bootRealPath({seed,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,survivalArena,combat,'tacticalAI','actions','weapons','flightV3','aiPorts','physics'],hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
try{
 const s=h.state,p=h.player,events=[];s.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave,phase:'wave_intro'};s.input.autoFire=false;
 h.bus.emit('run:wavePlanned',{wave,plan:planWave({seed,wave,arenaId:'helios_core',ruleset:'swarm'})});
 const scene=()=>planSwarmBellowsPocket(s,s.run,wave,[{id:'bellows',count:1},{id:'mite',count:3}],5.6,3);
 const original=scene();assert.ok(original);
 // The arena supplies this bank; round, hull, kit and initial pose are staged.
 const bank=s.entities.get(scene().bankId);
 s.run.phase='active';h.bus.emit('run:waveStarted',{wave});
 const ingress=h.runtime.getSystem('input'),e=h.runtime.getSystem('swarmArena')._brood;
 for(const type of ['swarm:broodTelegraph','swarm:broodBurst','swarm:broodKills','run:awardRequested'])h.bus.on(type,payload=>events.push({type,tick:s.tick,payload:structuredClone(payload)}));
 const dom=d=>ingress.ingestLaneDomEvent({...d,blocked:false,offCanvas:false});
 dom({type:'keydown',code:'Digit0',pressed:true});h.step(1);dom({type:'keyup',code:'Digit0',pressed:false});
 assert.equal(scene()?.bankId,original.bankId);
 let fire=false;const trace=[];
 for(let n=0;n<300;n++){
  const b=e._bodies,i=b.alive.findIndex((v,j)=>v&&b.liveFamilyId[b.family[j]]==='bellows');
  const target=i>=0?{x:b.px[i],z:b.pz[i]}:null;
  if(target){const desired=Math.atan2(target.z-p.pos.z,target.x-p.pos.x),err=Math.atan2(Math.sin(desired-p.rot),Math.cos(desired-p.rot));dom({type:'keydown',code:err>0?'KeyD':'KeyA',pressed:true});dom({type:'keyup',code:err>0?'KeyA':'KeyD',pressed:false});if(Math.abs(err)<0.04){dom({type:'keyup',code:'KeyA',pressed:false});dom({type:'keyup',code:'KeyD',pressed:false});}dom({type:'cursorProjection',...target});if(!fire){dom({type:'mousedown',button:0,clientX:600,clientY:400});fire=true;}}
  if((!target||false)&&fire){dom({type:'mouseup',button:0});fire=false;}
  h.step(1);
  if(n%15===0)trace.push({tick:s.tick,p:{...p.pos},hull:p.hull,bodies:Array.from(b.alive).flatMap((v,j)=>v?[{slot:j,life:b.serial?.[j],family:b.liveFamilyId[b.family[j]],x:b.px[j],z:b.pz[j],vx:b.vx[j],vz:b.vz[j],hp:b.hp[j]}]:[])});
 }
 assert.equal(h.proof().backend,'rapier-dynamic');assert.equal(h.proof().flightBackend,'v3');
 const tell=events.find(x=>x.type==='swarm:broodTelegraph'&&x.payload.familyId==='bellows');
 const burst=events.find(x=>x.type==='swarm:broodBurst'&&x.payload.familyId==='bellows');
 const slam=events.find(x=>x.type==='swarm:broodKills'&&x.payload.cause==='terrain');
 assert.ok(tell&&burst&&slam);assert.ok(tell.tick<burst.tick&&burst.tick<slam.tick);
 assert.deepEqual([slam.payload.count,slam.payload.environmentalCount,slam.payload.credits,slam.payload.score],[1,0,1,12]);
 assert.equal(events.filter(x=>x.type==='run:awardRequested'&&x.tick===slam.tick).length,1);
 assert.equal(s.entities.get(bank.id),bank);assert.equal(p.hull,140);assert.equal(s.run.credits,7);assert.equal(s.run.score,76);
 assert.ok(e.view.pendingCount>0,'this is not a whole-round clear');
}finally{h.dispose();}
});
