import { save } from '../src/save/saveSystem.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKesslerScale, kesslerScaleSpec } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition, kesslerWorksiteSpecs, KESSLER_WORKSITE } from '../src/systems/kesslerScaleWorksite.js';
import { KESSLER_SCALE } from '../src/data/kessler.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { makeEntity } from '../src/core/entity.js';
import { insertDressingRow } from '../src/world/dressingTable.js';

function fixture(over = {}) {
  const listeners = new Map(), events = [];
  const bus = {
    on(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); return () => set.delete(fn); },
    emit(name, payload) { events.push([name, payload]); for (const fn of listeners.get(name) || []) fn(payload); },
  };
  const state = { world: { currentSectorId: KESSLER_SCALE.sectorId }, story: { flags: {} }, run: { kind: 'adventure' }, entityList: [], entities: new Map(), nextEntityId: 1, ...over };
  const helpers = {
    spawnEntity(spec) { const entity = makeEntity({ ...spec, id: state.nextEntityId++ }); state.entityList.push(entity); state.entities.set(entity.id, entity); return entity; },
    removeEntity(id) { const entity = state.entities.get(id); if (entity) entity.alive = false; },
  };
  const system = createKesslerScale();
  const init = () => system.init({ state, bus, helpers });
  const pod = (spec = {}) => helpers.spawnEntity({ type: 'payload', mass: 40, pos: kesslerPadPosition(), vel: { x: 0, z: 0 }, data: { payloadType: 'jettisoned_cargo', commodityId: 'cmdty_ore_iron', scanLabel: 'Iron freight' }, ...spec });
  const rows = () => (state.world.dressing?.rows || []).filter((r) => r.alive && r.data.kesslerWorksite);
  const ticks = () => system.update(0.5, state);
  const reads = () => events.filter(([name]) => name === 'kesslerPod:weighed');
  state.mode='flight';state.simTime=0;const player=helpers.spawnEntity({type:'ship',pos:kesslerPadPosition(),vel:{x:0,z:0}});state.playerId=player.id;
  init();
  return { state, bus, events, helpers, system, init, pod, rows, ticks, reads };
}

function popup(f,id){return f.events.filter(([name,p])=>name==='comms:popup'&&p.id===id);}
function advance(f,t){f.state.simTime=t;f.ticks();}
test('actual scale owner retains first and different second loads; LOG speaks delayed, local and once',()=>{const f=fixture();f.ticks();assert.equal(popup(f,'kessler_comparison_arrival').length,1);const first=f.pod();advance(f,1);assert.equal(f.reads().length,1);assert.equal(popup(f,'kessler_first_comparison').length,0);advance(f,5);assert.equal(popup(f,'kessler_first_comparison').length,1);const second=f.pod({mass:60});advance(f,6);advance(f,10);assert.equal(popup(f,'kessler_second_load').length,1);assert.match(popup(f,'kessler_second_load')[0][1].text,/40.0t stamped, 37.6t.*60.0t stamped, 56.4t/);advance(f,20);f.init();advance(f,30);assert.equal(popup(f,'kessler_second_load').length,1);assert.equal(first.mass,40);assert.equal(second.mass,60);assert.equal(first.alive,true);assert.equal(f.reads().length,2);});
test('same-sized loads do not corroborate; fast or out-of-ring load cannot enter retained comparison',()=>{const f=fixture();f.pod({vel:{x:9,z:0}});advance(f,1);assert.equal(f.state.story.flags.kessler_comparison_watch,undefined);f.pod({pos:{x:0,z:0}});advance(f,2);assert.equal(f.state.story.flags.kessler_comparison_watch,undefined);f.pod();advance(f,3);f.pod();advance(f,4);advance(f,10);assert.equal(popup(f,'kessler_second_load').length,0);assert.equal(f.state.story.flags.kessler_comparison_watch.second,null);});
test('remote weighing stays legal but voice waits for live nearby pilot and flight',()=>{const f=fixture();const p=f.state.entities.get(f.state.playerId);p.pos={x:0,z:0};f.pod();advance(f,1);advance(f,8);assert.equal(f.reads().length,1);assert.equal(popup(f,'kessler_first_comparison').length,0);p.pos=kesslerPadPosition();f.state.mode='docked';advance(f,9);assert.equal(popup(f,'kessler_first_comparison').length,0);f.state.mode='flight';f.state.ui={docked:true};advance(f,9.5);assert.equal(popup(f,'kessler_first_comparison').length,0);f.state.ui.docked=false;p.alive=false;advance(f,10);assert.equal(popup(f,'kessler_first_comparison').length,0);p.alive=true;advance(f,11);assert.equal(popup(f,'kessler_first_comparison').length,1);});
test('saved story flags resume unheard paired-slip response, never resurrect cargo or repay',()=>{const f=fixture();f.pod();advance(f,1);f.pod({mass:60});advance(f,2);const serialized=save._serializeMissions.call({state:f.state});const flags=JSON.parse(JSON.stringify(serialized.story.flags));const g=fixture({story:{flags}});advance(g,6);assert.equal(popup(g,'kessler_second_load').length,1);assert.equal(g.reads().length,0);const done=JSON.parse(JSON.stringify(g.state.story.flags));const j=fixture({story:{flags:done}});advance(j,20);assert.equal(popup(j,'kessler_second_load').length,0);assert.equal(j.events.some(([n])=>n==='economy:grantCredits'||n==='faction:repDelta'),false);});
test('other modes and sector departure do not consume pending voice',()=>{for(const key of ['sector','swarm']){const f=fixture();f.pod();advance(f,1);if(key==='sector')f.state.world.currentSectorId='sector_helios_prime';else f.state.run.kind='swarm';advance(f,8);assert.equal(popup(f,'kessler_first_comparison').length,0);assert.equal(f.state.story.flags.kessler_comparison_watch.firstSpoken,false);}});
test('native cargo-owner bay releases remain real freight while Scale 4 compares both masses',{timeout:120000},async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');const {cargo,addCargo}=await import('../src/systems/cargo.js');const pad=kesslerPadPosition();
 const h=await bootRealPath({seed:4404,systems:[cargo,createKesslerScale(),'tacticalAI','flightV3','aiPorts','physics'],hulls:[{hullId:'ship_pelican',isPlayer:true,pos:{x:pad.x,z:pad.z-65},rot:0}]});
 try{const s=h.state;s.world.currentSectorId=KESSLER_SCALE.sectorId;s.mode='flight';s.run.kind='adventure';h.bus.emit('sector:enter',{sectorId:KESSLER_SCALE.sectorId});const out=[];h.bus.on('comms:popup',p=>out.push(p));Object.assign(s.player.cargo,{capVolume:100,capMass:100});addCargo(s,'cmdty_ore_iron',61);const owner=h.runtime.getSystem('cargo');assert.equal(owner.jettison('cmdty_ore_iron',30,{bay:true,slot:0}),30);h.step(360);
 async function fly(target){for(let i=0;i<7200;i++){const p=h.player,dx=target.x-p.pos.x,dz=target.z-p.pos.z;if(Math.hypot(dx,dz)<2&&Math.hypot(p.vel.x,p.vel.z)<1)return;const scale=Math.min(.5,20/Math.max(1,Math.hypot(dx,dz))),ax=(dx*scale-p.vel.x)*.12,az=(dz*scale-p.vel.z)*.12,c=Math.cos(p.rot),sn=Math.sin(p.rot);writeRealPathInput(s,{moveZ:ax*c+az*sn,moveX:-ax*sn+az*c,turnIntent:0});h.step(1);}assert.fail('physical return timed out');}
 await fly({x:pad.x-400,z:pad.z-65});assert.ok(Math.hypot(h.player.pos.x-pad.x,h.player.pos.z-pad.z)>350);await fly({x:pad.x,z:pad.z-65});writeRealPathInput(s,{moveZ:0,moveX:0,turnIntent:0});assert.equal(owner.jettison('cmdty_ore_iron',31,{bay:true,slot:2}),31);h.step(360);
 const watch=s.story.flags.kessler_comparison_watch;assert.ok(watch?.secondSpoken,JSON.stringify({watch,pods:s.entityList.filter(e=>e.data?.jettisonedCargo).map(e=>({pos:e.pos,mass:e.mass,vel:e.vel,data:e.data}))}));const pods=s.entityList.filter(e=>e.alive&&e.data?.kesslerRead);assert.equal(pods.length,2);assert.deepEqual(pods.map(e=>e.data.kesslerReceipt.trueRead),[24,24.8],'adjacent real cargo quantities produce distinct displayed stamps below one tonne apart');assert.equal(out.filter(p=>p.id==='kessler_second_load').length,1);assert.ok(pods.every(e=>e.physicsBody&&e.data.commodityId==='cmdty_ore_iron'));assert.equal(s.player.cargo.items.cmdty_ore_iron||0,0);assert.equal(h.proof().backend,'rapier-dynamic');console.log('KESSLER_COMPARISON_NATIVE',JSON.stringify({time:s.simTime,masses:pods.map(e=>e.mass),readings:watch}));
 }finally{h.dispose();}
});
test('comparison equality follows the displayed tenth, not a hidden one-tonne threshold',async()=>{
 const {recordKesslerComparison}=await import('../src/systems/kesslerComparisonContact.js');const f=fixture();const record=(stamp,count)=>recordKesslerComparison(f.state,{plateRead:22,trueRead:stamp,variance:true,count});record(24,1);record(24.04,2);assert.equal(f.state.story.flags.kessler_comparison_watch.second,null);record(24.1,3);assert.equal(f.state.story.flags.kessler_comparison_watch.second.stamp,24.1);
});
