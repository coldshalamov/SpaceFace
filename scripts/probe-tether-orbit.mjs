// Orbital repro: continuously reel in (shorten line) while applying tangential thrust.
// This builds real orbital velocity -> real centripetal load on the line.
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { SIM_DT } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = SIM_DT;
const REEL = process.argv.includes('--reel');
const TANGENT = parseFloat(process.argv.find(a=>a.startsWith('--tan='))?.slice(5) || '0.4');
console.log(`\n=== orbit probe | reel=${REEL} tangent=${TANGENT} ===\n`);

const state = createGameState(0x57d1);
state.mode='flight'; state.settings.gameplay.physicsBackend='rapier-dynamic'; state.settings.gameplay.flightBackend='v3'; state.settings.controls.flightMode='newtonian';
state.entities.clear(); state.entityList.length=0; state.nextEntityId=1; state.freeIds.length=0;
const bus=createBus(); const helpers={};
const fork=(s)=>Object.assign(Object.create(Object.getPrototypeOf(s)),s);
const runtime={core:fork(core),physics:fork(physics),actions:fork(actions),flight:fork(flightV3),combat:fork(combat),tetherGameplay:fork(tetherGameplay)};
const byName=new Map([['core',runtime.core],['physics',runtime.physics],['actions',runtime.actions],['flight',runtime.flight],['combat',runtime.combat],['tetherGameplay',runtime.tetherGameplay]]);
const registry={get:(n)=>byName.get(n)||null};
const ctx={state,bus,helpers,registry};
const events={latched:[],broke:[],released:[]};
bus.on('tether:latched',p=>events.latched.push(p));
bus.on('tether:broke',p=>events.broke.push(p));
runtime.core.init(ctx); runtime.physics.init(ctx); runtime.actions.init(ctx); runtime.flight.init(ctx); runtime.combat.init(ctx); runtime.tetherGameplay.init(ctx);
runtime.physics.update(0,state); if(runtime.physics._sg02Init) await runtime.physics._sg02Init; runtime.physics.update(0,state);

const player=helpers.spawnEntity(makeShipEntitySpec('ship_wasp',{isPlayer:true,pos:{x:0,z:0},rot:0}));
state.playerId=player.id;
const asteroid=helpers.spawnEntity({type:'asteroid',pos:{x:120,z:0},radius:12,mass:640,hull:360,hullMax:360,collides:true,data:{typeId:'ast_common_rock'}});
state.input.aimWorld={x:asteroid.pos.x,z:asteroid.pos.z}; state.input.aimAngle=0;
state.input.actions={tetherFire:true,tetherCut:false,reelDelta:0};
const step=()=>{runtime.core.preStep(DT,state);runtime.actions.update(DT,state);runtime.flight.update(DT,state);runtime.physics.update(DT,state);runtime.combat.update(DT,state);runtime.tetherGameplay.update(DT,state);runtime.core.lifetimeSweep(DT,state);};
step();
state.input.actions.tetherFire=false;
console.log('latched:',events.latched.length===1);

function att(){return Object.values(state.combat.attachments.byId).find(a=>a.ownerId===player.id&&a.state==='active');}
function fmt(n,w=7,p=1){return Number(n).toFixed(p).padStart(w);}

console.log('tick tension impulse   yank  stretch  rest  dist   tenR   impR   yankR  overS  state   reason');
let last=null; let brokeTick=-1;
for(let i=0;i<300;i++){
  const dx=asteroid.pos.x-player.pos.x, dz=asteroid.pos.z-player.pos.z;
  const d=Math.hypot(dx,dz);
  const tx=-dz/d, tz=dx/d;
  state.input.moveX=tx*TANGENT; state.input.moveZ=tz*TANGENT;
  state.input.boost=false; state.input.turnIntent=0;
  state.input.actions.reelDelta = REEL ? (-46*DT) : 0;
  step();
  const a=att();
  if(!a){brokeTick=state.tick; console.log(`t${state.tick}: SNAPPED. lastReason=${last&&last.breakReason}`); break;}
  const tel=a.masslineTelemetry||{}; const rt=a.masslineRuntime||{};
  const brk=a.break||{};
  const yank=tel.yank||0;
  if(i%4===0||a.breakReason){
    console.log(
      String(state.tick).padStart(4),
      fmt(a.lastTension||0,7,0), fmt(a.lastImpulse||0,7,1), fmt(yank,7,0),
      fmt(Math.max(0,d-a.restLength),6,1), fmt(a.restLength,5,1), fmt(d,5,1),
      fmt((a.lastTension||0)/(brk.maxTension||1),6,4), fmt((a.lastImpulse||0)/(brk.maxImpulse||1),6,4),
      fmt(yank/(brk.maxYank||420),6,3), fmt(rt.overloadS||0,6,3), fmt(rt.state||'',8),
      (a.breakReason||'').padStart(8)
    );
  }
  last=a;
}
console.log('---');
console.log('broke at tick', brokeTick, 'events:', JSON.stringify(events.broke));
console.log('player angVel', player.angVel, 'speed', Math.hypot(player.vel.x,player.vel.z).toFixed(2));
console.log('--- attachment break policy on the SNAP tick ---');
if (last) {
  console.log('a.break =', JSON.stringify(last.break));
  console.log('a.lastTension =', last.lastTension, ' a.lastImpulse =', last.lastImpulse);
  console.log('a.breakReason =', last.breakReason);
  console.log('masslineRuntime =', JSON.stringify(last.masslineRuntime));
  console.log('masslineTelemetry =', JSON.stringify(last.masslineTelemetry));
}
// Also dump the very first tension spike (around tick 106 in observed output).
const firstSpike = Object.values(state.combat.attachments.byId)[0];
if (firstSpike) {
  console.log('first attachment in registry break =', JSON.stringify(firstSpike.break));
}
