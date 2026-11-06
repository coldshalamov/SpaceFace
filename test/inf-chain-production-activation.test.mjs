import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';
import {PRODUCTION_INIT_ORDER,PRODUCTION_UPDATE_ORDER,TABLE_CLOCK_IDS} from '../src/runtime/authoritativeSystemManifest.js';
import {createNodeProductionSystemLookup} from '../src/runtime/nodeSystemFactoryTable.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {currentChainWreckWitness} from '../src/combat/killCausality.js';

test('production Node host activates event-only chain owner and bridges native wreck collision',async()=>{
 assert.equal(PRODUCTION_INIT_ORDER.filter(id=>id==='chainKills').length,1);
 assert.ok(PRODUCTION_INIT_ORDER.indexOf('killReplay')<PRODUCTION_INIT_ORDER.indexOf('chainKills'));
 assert.equal(PRODUCTION_UPDATE_ORDER.includes('chainKills'),false);assert.equal(TABLE_CLOCK_IDS.includes('chainKills'),false);
 assert.ok(createNodeProductionSystemLookup().get('chainKills'));
 const lane=createSimHost();let tick=0;
 try {
  const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  const {state,registry,runtime}=lane.host;const chain=registry.get('chainKills');assert.ok(chain,'real worker owner');
  for(const id of ['breakwaterSpur','counterweightCircuit','cinderglassJob'])assert.ok(registry.get(id));
  state.mode='flight';state.world.currentSectorId='sector_helios_prime';state.settings.gameplay.physicsBackend='rapier-dynamic';
  await registry.get('physics').prepareBackend(state);
  const player=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,team:0,pos:{x:-250,z:0},fittings:[]}));state.playerId=player.id;
  const ship=(x,vx)=>runtime.spawn({type:'ship',team:1,pos:{x,z:0},vel:{x:vx,z:0},radius:12,mass:25,hull:1,hullMax:100,shield:0,shieldMax:0,armorHp:0,armorMax:0,collides:true,
   physicsBody:{schemaVersion:1,radius:12,mass:25,inertiaY:40,dynamic:true,ccd:true,material:'ship',revision:0},data:{defId:'ship_wasp',shipClass:'fighter',combatProfileId:'combat_profile_standard_ship'}});
  const first=ship(0,75), second=ship(220,0), events=[];
  const step=async(n=1)=>{const reply=await lane.tick({tick:++tick,steps:n,ackEnd:init.initRebuild?.end??0,commands:[]});events.push(...reply.events);};
  await step();const combat=registry.get('combat');combat.kill(first,player.id,{origin:{kind:'weapon',id:'wpn_autocannon_s'},packet:{source:{kind:'weapon',weaponId:'wpn_autocannon_s'}}});
  const wreck=[...state.entities.values()].find(e=>e.type==='wreck'&&e.data?.markerId&&e.data?.aftermath?.victimId===first.id) || [...state.entities.values()].find(e=>e.type==='wreck'&&e.data?.markerId);
  assert.ok(wreck,'actual aftermath wreck');await step();assert.ok(currentChainWreckWitness(state,wreck));
  combat.onHit({targetId:wreck.id,ownerId:player.id,weaponId:'wpn_autocannon_s',damagePacket:{channels:{kinetic:0},impulse:{x:100,z:0},source:{kind:'weapon',weaponId:'wpn_autocannon_s',impulseProvenance:'weapon_hit'}}});
  for(let i=0;i<240 && second.alive;i++)await step();
  assert.equal(second.alive,false,'actual native collision killed the second original');
  const receipts=events.filter(e=>e.t==='combat:chainKill');assert.equal(receipts.length,1);
  assert.equal(receipts[0].p.firstId,first.id);assert.equal(receipts[0].p.secondId,second.id);
  assert.equal(events.filter(e=>e.t==='comms:log'&&e.p?.kind==='chainKill').length,1);
  lane.host.bus.emit('comms:log',{kind:'unrelated',speaker:'test',text:'not a chain'});await step(0);
  assert.equal(events.filter(e=>e.t==='comms:log'&&e.p?.kind==='unrelated').length,0);
  assert.equal(chain.chainRows().length>=2,true);lane.host.bus.emit('save:restoring');assert.equal(chain.chainRows().length,0);
 }finally{lane.shutdown();}
});
