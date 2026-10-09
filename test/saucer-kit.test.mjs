import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeShipEntitySpec, ships, buildWeaponList, getDerivedStats, buildSlotList, dryRunLoadoutPresetApply } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { SAUCER_WEAPON_SLOTS, SAUCER_WEAPONS } from '../src/data/saucer.js';
import { isArmoryStock } from '../src/data/swarmCatalog.js';
import { resolveHullBurst } from '../src/data/hullBurst.js';
import { hullBurst, hullBurstWedgeHit } from '../src/systems/hullBurst.js';
import { hullBurstFieldRecord, shapeOfFieldKind } from '../src/render/forceLanguage/hullBurstField.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { economy } from '../src/systems/economy.js';
import { refitRowLines } from '../src/ui/screens/crucibleDraft.js';
import { crucibleCombatLines } from '../src/ui/crucibleCombatReadout.js';
const saucer = SHIPS.find(s=>s.id==='ship_saucer');
const emitters = e => e.data.weapons.map(w=>w.defId);

function shop(cash=1000) {
  const state=createGameState(4242), bus=createBus();
  const registry={get:name=>({ships,economy,survivalDraft})[name]};
  const ctx={state,bus,registry,helpers:{}};
  economy.init(ctx);ships.init(ctx);economy.newGame();ships.newGame();
  const player={ ...makeShipEntitySpec('ship_kestrel',{isPlayer:true}),
    id:1,alive:true,vel:{x:0,z:0},flags:{},angVel:0 };
  state.playerId=1;state.entities.set(1,player);state.entityList=[player];state.mode='flight';
  runSession.init(ctx);survivalDraft.init(ctx);
  bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed:4242,arenaId:'helios_core'});
  let phase='loadout';
  for(const next of ['arena_intro','wave_intro','active','cleanup']) {
    bus.emit('run:transitionRequested',{expectedPhase:phase,nextPhase:next});phase=next;
  }
  state.run.wave=1;bus.emit('run:awardRequested',{credits:cash,reason:'round_loot'});
  bus.emit('run:transitionRequested',{expectedPhase:'cleanup',nextPhase:'draft'});
  return {state,bus,player};
}

test('new and legacy-empty saucers have a complete, independent, non-stock alien arsenal',()=>{
  const a=makeShipEntitySpec('ship_saucer',{isPlayer:true}),b=makeShipEntitySpec('ship_saucer',{isPlayer:true});
  assert.deepEqual(emitters(a),SAUCER_WEAPON_SLOTS);
  assert.ok(a.data.weapons.every(w=>w.intrinsic&&w.facing==='turret'&&w.gimbalArc>=Math.PI));
  a.data.weapons[0]._heat=17;assert.equal(b.data.weapons[0]._heat,0);
  for(const def of SAUCER_WEAPONS) assert.equal(isArmoryStock(def),false);
  assert.equal(a.data.derived.hullBurstKind,'saucer_horizon');
  assert.ok(a.data.derived.lootMagnetRange>=300);
  assert.deepEqual(emitters(makeShipEntitySpec('ship_saucer',{isPlayer:false})),[]);
  assert.ok(emitters(makeShipEntitySpec('ship_kestrel',{isPlayer:true})).every(id=>!id.includes('saucer')));
});
test('optional equipment replaces only its mount; emptying it restores the intrinsic emitter',()=>{
  let weapons=buildWeaponList(saucer,['wpn_pulse_laser_s'],true);
  assert.equal(weapons.length,3);assert.equal(weapons[0].defId,'wpn_pulse_laser_s');
  assert.equal(weapons[1].defId,'wpn_saucer_death_ray');
  weapons=buildWeaponList(saucer,[],true);
  assert.deepEqual(weapons.map(w=>w.defId),SAUCER_WEAPON_SLOTS);
  assert.equal(getDerivedStats('ship_kestrel',[]).hullBurstKind,null);
});
test('real Crucible buy, repeated switch and old-save rebuild keep equipment without minting inventory',()=>{
  const h=shop(),p=h.state.player;
  const previousIndex=p.activeShipIndex, previous=p.ownedShips[previousIndex];
  const oldFit=JSON.stringify(previous.fittings), inventory=JSON.stringify(p.moduleInventory);
  const campaignCash=p.credits;
  const offer=survivalDraft.currentOffers().find(o=>o.defId==='ship_saucer');
  assert.ok(offer?.available);assert.equal(offer.category,'Ships');assert.equal(offer.verb,'Buy ship');
  assert.match(offer.blurb,/twin Death Rays/);
  assert.equal(survivalDraft.resolvePick({offerId:offer.id}),true);
  const purchased=p.activeShipIndex, credits=h.state.run.credits, count=p.ownedShips.length;
  assert.equal(credits,1000-offer.price);assert.deepEqual(emitters(h.player),SAUCER_WEAPON_SLOTS);
  assert.match(survivalDraft.lastNotice(),/Previous ship kept/);
  assert.equal(JSON.stringify(previous.fittings),oldFit);
  for(let i=0;i<6;i++) {
    const back=survivalDraft.currentOffers().find(o=>o._ownedIndex===previousIndex);
    assert.equal(survivalDraft.resolvePick({offerId:back.id}),true);
    assert.ok(emitters(h.player).every(id=>!id.includes('saucer')));
    const again=survivalDraft.currentOffers().find(o=>o._ownedIndex===purchased);
    assert.equal(again.price,0);assert.equal(survivalDraft.resolvePick({offerId:again.id}),true);
    assert.deepEqual(emitters(h.player),SAUCER_WEAPON_SLOTS);
  }
  assert.equal(p.ownedShips.length,count);assert.equal(h.state.run.credits,credits);
  assert.equal(p.credits,campaignCash);assert.equal(JSON.stringify(p.moduleInventory),inventory);
  const restored=JSON.parse(JSON.stringify(p.ownedShips[purchased]));
  assert.deepEqual(emitters(makeShipEntitySpec(restored.defId,{fittings:restored.fittings,isPlayer:true})),SAUCER_WEAPON_SLOTS);
  assert.equal(ships.buyModule({defId:'wpn_saucer_death_ray'}),false);
  assert.equal(JSON.stringify(p.moduleInventory),inventory);
  const rows=survivalDraft.refitRows().filter(r=>r.intrinsicDefId);
  assert.equal(rows.length,3);
  for(const row of rows) {
    assert.equal(row.defId,null);assert.match(refitRowLines(row).value,/built in/);
    assert.notEqual(refitRowLines(row).action,'Strip');
    assert.equal(survivalDraft.refitSell({slotIndex:row.slotIndex}),false);
  }
  assert.equal(h.state.run.credits,credits);
  h.state.run.phase='active';h.state.ui.screenStack=[];
  assert.equal(crucibleCombatLines(h.state).filter(r=>r.id.startsWith('saucer-')).length,3);
  h.bus.emit('save:loaded',{});ships.recomputeActiveShip();
  assert.deepEqual(emitters(h.player),SAUCER_WEAPON_SLOTS);
});
test('unaffordable purchase does not grant a saucer or its kit',()=>{
  const h=shop(0),p=h.state.player;
  const count=p.ownedShips.length;
  const offer=survivalDraft.currentOffers().find(o=>o.defId==='ship_saucer');
  assert.equal(survivalDraft.resolvePick({offerId:offer.id}),false);
  assert.equal(p.ownedShips.length,count);assert.equal(h.state.run.credits,0);
  assert.ok(emitters(h.player).every(id=>!id.includes('saucer')));
});

function horizonScene() {
  const player={...makeShipEntitySpec('ship_saucer',{isPlayer:true}),id:1,alive:true,team:1,
    flags:{boosting:true},vel:{x:0,z:0},rot:0};
  const targets=[[70,0],[-70,0],[0,70],[0,-70],[1000,0]].map(([x,z],i)=>({
    id:i+2,type:'ship',alive:true,team:3,pos:{x,z},vel:{x:0,z:0},rot:0,radius:9,mass:16,
    hull:1000,shield:500,armorHp:0,data:{encounter:true},
  }));
  const neutral={...targets[0],id:9,team:2,data:{},pos:{x:30,z:30}};
  const list=[player,...targets,neutral];const bus=createBus();
  const state={playerId:1,mode:'flight',tick:1,simTime:0,entities:new Map(list.map(e=>[e.id,e])),
    entityList:list,ui:{screenStack:[]}};
  const damage=[],impulses=[];
  const sys=Object.create(hullBurst);
  sys.init({state,bus,helpers:{routeCombatDamage:p=>damage.push(p),
    combatPhysics:{applyImpulse:p=>{impulses.push(p);return true;}}}});
  return {player,targets,neutral,state,sys,bus,damage,impulses};
}
test('Event Horizon hits all four directions, uses combat/physics owners, excludes neutrals and latches per gesture',()=>{
  const h=horizonScene();
  h.sys.update();assert.equal(h.damage.length,4);assert.equal(h.impulses.length,4);
  assert.deepEqual(h.damage.map(d=>d.targetId).sort(),[2,3,4,5]);
  assert.ok(h.damage.every(d=>d.attackerId===1));
  h.sys.update();assert.equal(h.damage.length,4,'no damage every simulation tick');
  const def=resolveHullBurst('saucer_horizon');
  assert.equal(h.player.boost.energy,h.player.boost.max-def.activationCost);
  const visual=hullBurstFieldRecord(h.state);
  assert.equal(shapeOfFieldKind(visual.kind),'repulsor');
  assert.equal(visual.center.x,h.player.pos.x);assert.equal(visual.center.z,h.player.pos.z);
  assert.equal(visual.radius,def.reachWu);
  h.player.flags.boosting=false;h.sys.update();
  h.player.flags.boosting=true;h.sys.update();assert.equal(h.damage.length,4,'tap-spam does not bypass cooldown');
  h.state.simTime=2;h.sys.update();assert.equal(h.damage.length,8,'held input rearms when cooldown expires');
  h.state.ui.screenStack=['pause'];h.sys.update();assert.equal(h.state.hullBurst.phase,'ready');
  h.sys.destroy();
});
test('Horizon is bounded, has a resource gate, and ordinary Gravity Bumper remains a front cone',()=>{
  const h=horizonScene();h.player.boost.energy=0;h.sys.update();assert.equal(h.damage.length,0);
  assert.equal(h.state.hullBurst.phase,'ready');
  assert.equal(hullBurstWedgeHit(resolveHullBurst('gravity'),h.player,h.targets[1]),null);
  assert.ok(hullBurstWedgeHit(resolveHullBurst('saucer_horizon'),h.player,h.targets[1]));
  h.sys.destroy();
});

test('Crucible refuses inert engines and competing boost powers before charging',()=>{
  const h=shop();
  const offer=survivalDraft.currentOffers().find(o=>o.defId==='ship_saucer');
  assert.equal(survivalDraft.resolvePick({offerId:offer.id}),true);
  const balance=h.state.run.credits,owned=h.state.player.ownedShips[h.state.player.activeShipIndex];
  const fittings=JSON.stringify(owned.fittings),slots=buildSlotList(saucer);
  for(const id of ['mod_engine_ion_m','mod_thruster_vernier_m','mod_veil_step','mod_gravity_bumper_s','mod_swing_drive_s']) {
    const def=MODULES.find(d=>d.id===id),slotIndex=slots.findIndex(s=>s.type===def.slotType);
    assert.ok(slotIndex>=0);
    const blocked=ships.moduleFitBlocker({slotIndex,def});
    assert.equal(blocked?.reason,'intrinsic_saucer_drive');
    assert.match(blocked.text,/built-in inertialess drive/);
    const row=survivalDraft.currentOffers().find(o=>o.defId===id);
    if(row) {assert.equal(row.available,false);assert.equal(survivalDraft.resolvePick({offerId:row.id}),false);}
  }
  const targetFittings=slots.map(()=>null);
  targetFittings[slots.findIndex(s=>s.type==='engine')]='mod_engine_ion_m';
  const preset=dryRunLoadoutPresetApply({shipDefId:'ship_saucer',targetFittings,
    moduleInventory:[{defId:'mod_engine_ion_m'}],isUnlockedFn:()=>true});
  assert.equal(preset.ok,false);assert.equal(preset.reason,'intrinsic_saucer_drive');
  assert.equal(h.state.run.credits,balance);assert.equal(JSON.stringify(owned.fittings),fittings);
});
test('a paused saucer cannot spend Horizon energy or fire its field',()=>{
  const h=horizonScene(),energy=h.player.boost.energy;
  h.state.ui.screenStack=['pause'];h.sys.update();
  assert.equal(h.player.boost.energy,energy);assert.equal(h.damage.length,0);
  assert.equal(h.state.hullBurst.phase,'ready');h.sys.destroy();
});
