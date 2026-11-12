import test from 'node:test';
import assert from 'node:assert/strict';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {createRunState} from '../src/core/runState.js';
import {createBroodEngine} from '../src/systems/swarmBrood.js';
function fixture(t) {
 const state=createGameState(4242),bus=createBus(),events=[];
 state.playerId=1;const player={id:1,alive:true,type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:6,mass:400,hull:200,hullMax:200};state.entities.set(1,player);state.entityList.push(player);
 state.entityIndex={__spacefaceEntityIndexV1:true,ready:true,shipLike:[player],asteroids:[]};state.mode='flight';state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),phase:'active',wave:17};
 bus.on('swarm:broodKills',p=>events.push(p));
 const engine=createBroodEngine({bus,getState:()=>state,fieldList:()=>null});t.after(()=>engine.clear());engine.prepareWave(state.run,17);engine.spawnWave(state);
 const b=engine._bodies;let bell=-1,mite=-1;
 for(let i=0;i<b.alive.length;i++)if(b.alive[i]){const f=b.liveFamilyId[b.family[i]];if(f==='bellows'&&bell<0)bell=i;if(f==='mite'&&mite<0)mite=i;b.px[i]=10000+i*50;b.pz[i]=10000;b.vx[i]=b.vz[i]=0;}
 assert.ok(bell>=0&&mite>=0);b.px[bell]=1000;b.pz[bell]=1000;b.px[mite]=1030;b.pz[mite]=1000;
 state.simTime=1;state.tick=60;engine.step(state);
 const strike=ownerId=>engine.damageSegment({from:{x:b.px[bell]-1,z:b.pz[bell]},to:{x:b.px[bell]+1,z:b.pz[bell]},radius:0,damage:999,ownerId});
 const popMite=()=>{const start=events.length;engine.onExplosion({pos:{x:b.px[mite],z:b.pz[mite]},radius:1,ownerId:999});return events.slice(start).find(x=>x.cause==='explosive');};
 return {state,engine,b,bell,mite,strike,popMite,events};
}
for(const credited of [true,false])for(const fuse of [true,false])test(`${credited?'pilot':'environment'} ${fuse?'fuse':'finished'} Bellows carries only genuine shove credit`,t=>{
 const h=fixture(t);assert.equal(h.strike(credited?1:999).hits,1);assert.equal(h.b.alive[h.bell],1);
 if(fuse){h.state.simTime+=2.61;h.state.tick+=157;h.engine.step(h.state);}else assert.equal(h.strike(credited?1:999).hits,1);
 assert.equal(h.b.alive[h.bell],0);assert.ok(Math.hypot(h.b.vx[h.mite],h.b.vz[h.mite])>1);
 const receipt=h.popMite();assert.ok(receipt);assert.equal(receipt.count,credited?1:0);assert.equal(receipt.environmentalCount,credited?0:1);assert.equal(receipt.credits,credited?1:0);
 const before=h.events.length;h.engine.onExplosion({pos:{x:h.b.px[h.mite],z:h.b.pz[h.mite]},radius:1,ownerId:999});assert.equal(h.events.length,before,'dead neighbor cannot pay twice');
});
for(const distance of [110,111])test(`edge or out-of-range Bellows shove (${distance}) cannot claim a neighbor`,t=>{
 const h=fixture(t);h.b.px[h.mite]=h.b.px[h.bell]+distance;h.b.pz[h.mite]=h.b.pz[h.bell];h.engine.onExplosion({pos:{x:h.b.px[h.bell],z:h.b.pz[h.bell]},radius:1,ownerId:1});
 const receipt=h.popMite();assert.ok(receipt);assert.equal(receipt.count,0);
});
test('the normal five-second shove window expires rather than granting permanent ownership',t=>{
 const h=fixture(t);h.strike(1);h.strike(1);h.state.simTime+=5;h.state.tick+=300;const receipt=h.popMite();assert.ok(receipt);assert.equal(receipt.count,0);assert.equal(receipt.environmentalCount,1);
});
test('a coincident neighbor receives no directional impulse and no new credit',t=>{
 const h=fixture(t);h.b.px[h.mite]=h.b.px[h.bell];h.b.pz[h.mite]=h.b.pz[h.bell];h.b.vx[h.mite]=h.b.vz[h.mite]=0;
 h.engine._killDirectForTest(h.bell,'direct');h.engine._killDirectForTest(h.bell,'direct');
 assert.equal(h.b.vx[h.mite],0);assert.equal(h.b.vz[h.mite],0);assert.equal(h.popMite().count,0);
});
