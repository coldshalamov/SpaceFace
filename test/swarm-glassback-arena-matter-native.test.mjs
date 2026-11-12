import test from 'node:test';
import assert from 'node:assert/strict';
import {bootRealPath} from '../scripts/lib/bench/realPath.mjs';
import {input} from '../src/systems/input.js';
import {runSession} from '../src/systems/runSession.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {survivalWave} from '../src/systems/survivalWave.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {survivalArena} from '../src/systems/survivalArena.js';
import {combat} from '../src/systems/combat.js';
import {tetherGameplay} from '../src/systems/tetherGameplay.js';
import {masslineThrow} from '../src/systems/masslineThrow.js';
import {createRunState} from '../src/core/runState.js';
import {planWave} from '../src/systems/survivalWavePlanner.js';
import {COMBAT_LAB_STARTER_PACKAGES} from '../src/data/combatLabSetups.js';
import {resolvePhysicsBodySpec} from '../src/core/physicsAuthority.js';
const seed=4242,kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='ricochet_runner'),fittings=Array(13).fill(null);for(const r of kit.loadout)fittings[r.slotIndex]=r.defId;
for(const {mode,size,mass} of [...['shoot','ram','hold','cut'].map(mode=>({mode,size:6,mass:84})),{mode:'hold',size:7.75,mass:182},{mode:'hold',size:7.75,mass:220}])test(`native round thirteen: ${mode}, mass ${mass} preserves contact, stock and award owners`,async t=>{
 const h=await bootRealPath({seed,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,survivalArena,combat,tetherGameplay,masslineThrow,'tacticalAI','actions','weapons','flightV3','aiPorts','physics'],hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
 try{
 const s=h.state,p=h.player;s.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave:13,phase:'wave_intro'};s.input.autoFire=false;
 const arena=h.runtime.getSystem('swarmArena');
 const rock=mass===220?h.runtime.spawn({type:'asteroid',pos:{x:70,z:0},vel:{x:0,z:0},radius:size,mass,hull:500,collides:true,physicsBody:{schemaVersion:1,mass,inertiaY:mass*8.99*8.99/2,radius:8.99,dynamic:true,shape:'ball',material:'rock'},data:{swarmArenaDebris:true}}):arena._spawnDebrisRock(70,0,size,()=>0.5,s.simTime||0,{material:'rock'},true);
 h.bus.emit('run:wavePlanned',{wave:13,plan:planWave({seed,wave:13,arenaId:'helios_core',ruleset:'swarm'})});s.run.phase='active';h.bus.emit('run:waveStarted',{wave:13});
 const e=h.runtime.getSystem('swarmArena')._brood,b=e._bodies,inp=h.runtime.getSystem('input'),actions=[],kills=[],lines=[],shots=[];
 for(const event of ['tether:latched','tether:released','tether:latchDenied'])h.bus.on(event,x=>lines.push({event,tick:s.tick,...x}));h.bus.on('swarm:broodKills',x=>kills.push({tick:s.tick,...x}));h.bus.on('swarm:broodProjectileHit',x=>shots.push({tick:s.tick,...x}));
 const event=d=>{actions.push({tick:s.tick,...d});inp.ingestLaneDomEvent(d);},key=(code,pressed)=>event({type:pressed?'keydown':'keyup',code,pressed,blocked:false});
 key('Digit0',true);h.step(1);key('Digit0',false);h.step(480);
 const slot=b.alive.findIndex(Boolean),snap=()=>({tick:s.tick,pos:{...p.pos},hull:p.hull,rock:{pos:{...rock.pos},vel:{...rock.vel}},shell:{alive:b.alive[slot],family:b.liveFamilyId[b.family[slot]],pos:{x:b.px[slot],z:b.pz[slot]},hp:b.hp[slot]},wallet:s.run.credits,score:s.run.score});
 const before=snap();event({type:'pointermove',clientX:600,clientY:400});event({type:'cursorProjection',x:['hold','cut'].includes(mode)?rock.pos.x:b.px[slot],z:['hold','cut'].includes(mode)?rock.pos.z:b.pz[slot]});
 if(mode==='shoot')event({type:'mousedown',button:0,clientX:600,clientY:400,blocked:false,offCanvas:false});
 if(mode==='ram')key('KeyW',true);
 if(['hold','cut'].includes(mode)){event({type:'mousedown',button:2,clientX:600,clientY:400,blocked:false,offCanvas:false});h.step(1);event({type:'mouseup',button:2});key('KeyW',true);}
 for(let i=0;i<180;i++){
  if(mode==='cut'&&i===40)event({type:'mousedown',button:2,clientX:600,clientY:400,blocked:false,offCanvas:false});
  if(mode==='cut'&&i===41)event({type:'mouseup',button:2});h.step(1);
 }
 const after=snap();assert.equal(before.shell.family,'glassback');assert.equal(before.shell.hp,60);assert.equal(resolvePhysicsBodySpec(rock).mass,mass);assert.equal(s.entities.get(rock.id),rock);assert.equal(e.view.pendingCount,279);
 if(mode==='shoot'){assert.equal(after.shell.alive,1);assert.equal(after.shell.hp,60);assert.equal(kills.length,0);}
 else {assert.equal(after.shell.alive,0);assert.equal(kills.length,1);assert.equal(kills[0].cause,'collision');assert.equal(kills[0].credits,mode==='hold'?4:0);assert.equal(kills[0].score,mode==='hold'?42:0);assert.equal(s.run.credits,mode==='hold'?4:0);assert.equal(s.run.score,mode==='hold'?42:0);}
 if(['hold','cut'].includes(mode)){assert.equal(lines.find(x=>x.event==='tether:latched').targetId,rock.id);assert.equal(lines.filter(x=>x.event==='tether:latchDenied').length,0);}
 if(mode==='cut')assert.ok(lines.find(x=>x.event==='tether:released').tick<kills[0].tick);
 t.diagnostic(JSON.stringify({mode,before,after,kills,lines,body:resolvePhysicsBodySpec(rock),actions,limit:'Staged round and kit. Mass84/182 use normal arena-owned geology stone at authored position; mass220 is an explicit native-spec upper-bound diagnostic, not proof of ordinary stock. Ordinary input/native motion follow. The gun-only tape has no proven projectile contact; direct contact rejection is separately tested. A bare RMB cut has no fresh impulse provenance and earns zero under the existing reward law.'}));
 }finally{h.dispose();}
});
