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
import {COMBAT_LAB_STARTER_PACKAGES} from '../src/data/combatLabSetups.js';
import {capitalBossEncounters} from '../src/systems/capitalBossRuntime.js';
test('native Regent exposes crown and furnace before the ordinary crowd',async t=>{
const seed=73311,wave=25,kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='energy_baseline'),fittings=Array(13).fill(null);for(const row of kit.loadout)fittings[row.slotIndex]=row.defId;
const h=await bootRealPath({seed,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,survivalArena,combat,capitalBossEncounters,'tacticalAI','actions','weapons','flightV3','aiPorts','physics'],hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
try {const s=h.state,p=h.player;s.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),arenaId:'helios_core',wave,phase:'wave_intro'};s.input.autoFire=false;const events=[],allEvents=[],snapshots=[];for(const name of ['capitalBoss:telegraph','capitalBoss:attack','capitalBoss:voice','capitalBoss:actChanged'])h.bus.on(name,e=>{events.push({name,tick:s.tick,...e});allEvents.push({name,tick:s.tick,...e});});
const plan=planWave({seed,wave,arenaId:'helios_core',ruleset:'swarm'});h.bus.emit('run:wavePlanned',{wave,plan});s.run.phase='active';h.bus.emit('run:waveStarted',{wave});
const ingress=h.runtime.getSystem('input');ingress.ingestLaneDomEvent({type:'keydown',code:'Digit0',pressed:true,blocked:false});h.step(1);ingress.ingestLaneDomEvent({type:'keyup',code:'Digit0',pressed:false,blocked:false});
for(let i=0;i<1200&&p.alive;i++){h.step(1);if(s.tick%120===0)snapshots.push({tick:s.tick,hull:p.hull,ships:h.runtime.getSystem('survivalWave')._admittedTotal,brood:h.runtime.getSystem('swarmArena')._brood.view.aliveCount,events:events.splice(0)});}
assert.equal(s.tick,1201);assert.equal(p.alive,true);
assert.ok(snapshots.filter(x=>x.tick<1200).every(x=>x.ships===1&&x.brood===0));
assert.ok(snapshots.find(x=>x.tick===1200).ships>1);
assert.deepEqual(allEvents.filter(x=>x.name==='capitalBoss:attack').map(x=>x.beatId),['crown_check','furnace_beam']);
t.diagnostic(JSON.stringify({snapshots,proof:h.proof(),limit:'Staged round25 energy kit and stationary actor after ordinary weapon-group input. Native boss/physics execute; not earned, rendered, dodge or balance acceptance.'}));
}finally{h.dispose();}
});
