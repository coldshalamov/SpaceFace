// Focused native Choir service recovery: selected real production owners, not a full-world boot.
// Mercy’s prior evacuation history and one native-body displacement are deliberate test stimuli.
// The real producer creates the runner; subsequent return motion and treatment are autonomous.
// No player-operated tether, native Save/Continue, renderer, or full-flight acceptance is claimed.
import assert from 'node:assert/strict';
import { createSimulation } from '../../src/core/sim.js';
import { physics } from '../../src/core/physics.js';
import { combat } from '../../src/systems/combat.js';
import { npcJobsRuntime } from '../../src/systems/npcJobsRuntime.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { ships, makeShipEntitySpec } from '../../src/systems/ships.js';
import { createChoirReliefBerth, normalizeChoirRelief } from '../../src/systems/choirReliefBerth.js';
import { PRODUCTION_FEATURES } from '../../src/runtime/runtimeProfiles.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
const flags=snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES);
import { economy } from '../../src/systems/economy.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../../src/runtime/authoritativeSystemManifest.js';
const selected=new Map([['physics',physics],['combat',combat],['npcJobsRuntime',npcJobsRuntime],['flightSlot',flightV3],['ships',ships],['economy',economy]]);
const sim=createSimulation({seed:2027,systems:PRODUCTION_INIT_ORDER.map(id=>selected.get(id)).filter(Boolean),updateOrder:PRODUCTION_UPDATE_ORDER.map(id=>selected.get(id)).filter(Boolean),runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES}});
const s=sim.state; s.mode='flight';s.world.currentSectorId='sector_helios_prime';s.settings.gameplay.physicsBackend='rapier-dynamic';
const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{team:0,isPlayer:true,player:s.player,pos:{x:0,z:1000}}));s.playerId=player.id;
const home=sim.spawn({type:'station',pos:{x:0,z:0},radius:80,hull:1000,hullMax:1000,data:{stationId:'station_helios'}});
const wrecks={bearings:{wreck_choir_tender:{fixedPos:{x:-800,z:0}}},choirRelief:normalizeChoirRelief({evacuated:true,evacuatedAtS:0,driveRestored:true,nextArrivalAtS:0})};
const berth=createChoirReliefBerth({state:s,bus:sim.bus,helpers:sim.helpers,registry:sim.registry,_ensureState:()=>wrecks});
sim.bus.on('economy:tick',()=>berth.sync());
const p=sim.registry.get('physics');
const mark=label=>console.log(JSON.stringify({label,t:s.simTime,relief:wrecks.choirRelief,runner:s.entityList.filter(e=>e.data?.choirReliefRunner).map(e=>({id:e.id,pos:e.pos,vel:e.vel,job:e.data.jobId,phase:e.data.jobPhase,leg:e.data.choirReliefLeg}))}));
try{
 assert.equal(await p.prepareBackend(s),true);berth.sync();
 const r=s.entityList.find(e=>e.data?.choirReliefRunner===1); assert(r); const rid=r.data.worldRecordId;
 const step=()=>sim.step(1/60);
 let completedApproach=false;
 for(let i=0;i<180*60;i++){step();if(wrecks.choirRelief.runnerBedOrdinal===1&&!r.data.jobId){completedApproach=true;break;}}
 mark('completed_approach');assert(completedApproach,'real approach job must finish while runner admitted');
 const n=p._sg02,rec=n.records.get(r.id),o=n._frameOrigin||{x:0,z:0}; assert(rec?.body.isDynamic());
 // One deliberate native-body displacement; all subsequent return motion is owner-driven.
 r.pos.x=2000;r.pos.z=0;r.vel.x=0;r.vel.z=0;
 rec.body.setTranslation({x:2000-o.x,y:0,z:-o.z},true);rec.body.setLinvel({x:0,y:0,z:0},true);rec.body.setAngvel({x:0,y:0,z:0},true);
 berth.sync();assert.equal(wrecks.choirRelief.runnerAdmittedAtS,null);assert(r.data.jobId);mark('interrupted');
 let restarted=null,departed=null,minDistance=2000,maxRemoteDepartures=0;
 for(let i=0;i<240*60;i++){step();const d=Math.hypot(r.pos.x-home.pos.x,r.pos.z-home.pos.z);minDistance=Math.min(minDistance,d);if(d>320)maxRemoteDepartures=Math.max(maxRemoteDepartures,wrecks.choirRelief.runnersDeparted);if(restarted==null&&wrecks.choirRelief.runnerAdmittedAtS!=null)restarted= s.simTime;if(wrecks.choirRelief.runnersDeparted===1){departed=s.simTime;break;}}
 mark('end');console.log(JSON.stringify({minDistance,restarted,departed,maxRemoteDepartures,sameIdentity:r.data.worldRecordId===rid}));
 assert.equal(maxRemoteDepartures,0);assert.notEqual(restarted,null);assert.notEqual(departed,null);assert(departed-restarted>=45-1e-6);assert.equal(r.data.worldRecordId,rid);
 const successorAt=wrecks.choirRelief.nextArrivalAtS;for(let i=0;i<20*60;i++)step();assert.equal(wrecks.choirRelief.runnersDeparted,1);assert.equal(wrecks.choirRelief.nextArrivalAtS,successorAt);assert.equal(s.entityList.filter(e=>e.alive&&e.data?.worldRecordId===rid).length,1);console.log('NATIVE_ONCE_ONLY_20S_PASS');
}finally{p._disableSg02DynamicAuthority?.();sim.dispose();restoreFeatureMaps(flags);}
