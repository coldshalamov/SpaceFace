import { createSimulation, SIM_DT } from './src/core/sim.js';
import { createBus } from './src/core/eventBus.js';
import { physics } from './src/core/physics.js';
import { world } from './src/systems/world.js';
import { flightV3 } from './src/systems/flightV3.js';
import { combat } from './src/systems/combat.js';
import { weapons } from './src/systems/weapons.js';
import { tetherGameplay } from './src/systems/tetherGameplay.js';
import { mining } from './src/systems/mining.js';
import { cargo } from './src/systems/cargo.js';
import { heistFacilities } from './src/systems/heistFacilities.js';
import { lawSecurity } from './src/systems/lawSecurity.js';
import { heat } from './src/systems/heat.js';
import { npcJobsRuntime } from './src/systems/npcJobsRuntime.js';
import { aftermathWrecks } from './src/systems/aftermathWrecks.js';
import { spawnBudget } from './src/systems/spawnBudget.js';
import { createTacticalAISystem } from './src/systems/tacticalAI.js';
import { aiPorts } from './src/systems/aiPorts.js';
import { missions } from './src/systems/missions.js';
import { makeShipEntitySpec } from './src/systems/ships.js';
import { BREAKAWAY_SP07, PQ019_HEIST_SECTOR_ID } from './src/data/heistFacilities.js';
import { BREAKAWAY_RECOVERY_TYPE, PQ019C_HEIST_STATION_ID } from './src/data/heistMission.js';
import { forkReceiverWorld } from './src/ui/forkInstrument.js';

const SYSTEMS=[physics,world,heistFacilities,flightV3,combat,weapons,tetherGameplay,mining,cargo,lawSecurity,heat,npcJobsRuntime,aftermathWrecks,spawnBudget,createTacticalAISystem(),aiPorts,missions];
function wrapAngle(a){while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;}
function neutral(input){input.moveX=0;input.moveZ=0;input.turnIntent=0;input.boost=false;input.brake=false;input.fire=false;input.fireGroup=0;input.aimIntentActive=true;if(input.actions){input.actions.tetherFire=false;input.actions.tetherCut=false;input.actions.reelDelta=0;}}
function speedOf(e){return Math.hypot(e.vel.x,e.vel.z);}
function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function aimAt(state,pos){const p=state.entities.get(state.playerId);state.input.aimWorld.x=pos.x;state.input.aimWorld.z=pos.z;state.input.aimAngle=Math.atan2(pos.z-p.pos.z,pos.x-p.pos.x);return wrapAngle(state.input.aimAngle-(p.rot||0));}
function steerTo(state,tp,{arrive=40}={}){const p=state.entities.get(state.playerId);const input=state.input;const d=dist(p.pos,tp);const speed=speedOf(p);const err=aimAt(state,tp);input.turnIntent=Math.max(-1,Math.min(1,err/0.6));const stopBand=arrive+speed*1.4;if(d<=stopBand){input.moveZ=0;input.brake=speed>3;return d;}const facing=Math.abs(err)<0.45;input.moveZ=facing?1:0;input.boost=facing&&d>900;return d;}
function interceptPoint(p,tgt,sp=75){let tt=dist(p.pos,tgt.pos)/sp;for(let i=0;i<10;i++){const px=tgt.pos.x+tgt.vel.x*tt,pz=tgt.pos.z+tgt.vel.z*tt;tt=Math.hypot(px-p.pos.x,pz-p.pos.z)/sp;}return{x:tgt.pos.x+tgt.vel.x*tt,z:tgt.pos.z+tgt.vel.z*tt};}

const bus=createBus();
const sim=createSimulation({seed:19509,bus,systems:SYSTEMS});
const{state}=sim;
state.mode='flight';
state.settings.gameplay.physicsBackend='rapier-dynamic';
await sim.registry.get('physics').prepareBackend(state);
state.player.heat=0;state.player.credits=5000;state.player.miningBeam={tierId:'beam_mk1'};
if(!state.ui)state.ui={};if(!state.nav)state.nav={waypoint:null};
if(!state.input.aimWorld)state.input.aimWorld={x:0,z:0};
if(!state.input.actions)state.input.actions={};
const mouth=forkReceiverWorld();
const player=sim.spawn(makeShipEntitySpec('ship_hawser',{team:0,isPlayer:true,pos:{x:mouth.x+mouth.nx*500,z:mouth.z+mouth.nz*500}}));
state.playerId=player.id;
sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
const missionsSys=sim.registry.get('missions');
const row=missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots.find(o=>o&&o.type===BREAKAWAY_RECOVERY_TYPE);
bus.emit('ui:acceptMission',{missionId:row.id});
const load=()=>(state.entityList||[]).find(e=>e?.alive!==false&&e.type==='payload'&&e.data?.heistPayloadStableId===BREAKAWAY_SP07.stableId)||null;
const carrier=()=>(state.entityList||[]).find(e=>e?.alive!==false&&e.type==='ship'&&e.data?.heistFacilityRole==='transport_carrier')||null;
bus.on('entity:damaged',(p)=>{if(p&&(p.targetId===(load()||{}).id||p.entityId===(load()||{}).id))console.log('DMG',JSON.stringify(p));});
bus.on('entity:destroyed',(p)=>console.log('DESTROYED',JSON.stringify(p&&{id:p.id,type:p.type,cause:p.cause})));

for(let i=0;i<2600;i++){neutral(state.input);sim.step(SIM_DT);if(load())break;}
console.log('launch',state.tick);
for(let i=0;i<12000;i++){neutral(state.input);const c=carrier();if(c){const v=speedOf(c);if(v>=5){const dir={x:c.vel.x/v,z:c.vel.z/v};steerTo(state,{x:c.pos.x+dir.x*2600,z:c.pos.z+dir.z*2600},{arrive:150});}}sim.step(SIM_DT);if(state.heistFacilities.carrierReleased===true)break;}
console.log('released',state.tick,'p',player.pos.x.toFixed(0),player.pos.z.toFixed(0));
let lt=0;
for(let i=0;i<20000;i++){neutral(state.input);const l=load();if(!l)break;steerTo(state,interceptPoint(player,l),{arrive:25});const dl=dist(player.pos,l.pos);if(dl<800)aimAt(state,l.pos);lt++;if(dl<360&&lt%8===0)state.input.actions.tetherFire=true;sim.step(SIM_DT);if(state.player.tether&&state.player.tether.active){console.log('LATCHED',state.tick);break;}}
// arrest to <45
for(let i=0;i<20000;i++){neutral(state.input);const l=load();if(!l)break;state.input.actions.reelDelta=-1;const pv=speedOf(l);if(pv>14||speedOf(player)>14){const away=pv>1?{x:player.pos.x-(l.vel.x/pv)*200,z:player.pos.z-(l.vel.z/pv)*200}:player.pos;steerTo(state,away,{arrive:10});state.input.brake=false;state.input.moveZ=1;}sim.step(SIM_DT);const l2=load();if(l2&&speedOf(l2)<45){console.log('ARRESTED45',state.tick,'d',dist(player.pos,l2.pos).toFixed(0));break;}}
const l=load();
console.log('load state',l?`hull=${l.hull}/${l.hullMax} spd=${speedOf(l).toFixed(0)} d=${dist(player.pos,l.pos).toFixed(0)}`:'gone');
// fire
let gone=false;
for(let i=0;i<15000;i++){neutral(state.input);const l2=load();if(!l2){gone=true;console.log('load gone tick',state.tick);break;}const d=dist(player.pos,l2.pos);aimAt(state,l2.pos);state.input.actions.reelDelta=-1;if(d<500)state.input.fire=true;sim.step(SIM_DT);if(i%900===0)console.log(`t${state.tick} d=${d.toFixed(0)} hull=${l2.hull} pspd=${speedOf(player).toFixed(0)}`);}
console.log('gone',gone,'tick',state.tick);
for(let i=0;i<1200;i++){neutral(state.input);sim.step(SIM_DT);}
console.log('bySector keys',JSON.stringify(Object.keys(state.aftermathWrecks?.bySector||{})));
const list=(state.aftermathWrecks?.bySector?.[PQ019_HEIST_SECTOR_ID])||[];
console.log('markers',list.map(m=>({victimId:m.victimId,markerId:m.markerId,pos:m.pos,pool:m.salvagePool})));
const wrecks=(state.entityList||[]).filter(e=>e?.alive!==false&&e.type==='wreck');
console.log('wreck ents',wrecks.map(w=>({id:w.id,pos:w.pos,prov:w.data&&w.data.provenance})));
const m=(state.missions.active||[]).find(mm=>mm&&mm.heist);
console.log('mission?',!!m,'outcome',m&&m.heist&&m.heist.arbiter&&JSON.stringify(m.heist.arbiter.receipt||m.heist.outcome||null));
