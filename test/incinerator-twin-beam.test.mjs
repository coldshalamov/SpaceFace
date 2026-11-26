import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { packCombatTable } from '../src/core/combatTable.js';
import { weapons, incineratorBeamOrigins } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { resolveMuzzleProfile } from '../src/render/vfxProfiles.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, fits, buildWeaponList } from '../src/systems/ships.js';
import { offerDraft } from '../src/data/survivalDraft.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import * as THREE from 'three';
import { PersistentCombatBeamPool, BEAM_COOLING_S } from '../src/render/combat/persistentBeams.js';
import { vfx } from '../src/render/vfx.js';

const ID = 'wpn_incinerator_m', DT = 1/60;
const def = WEAPONS.find(w => w.id === ID);

function world() {
  const state = createGameState(9032), bus = createBus(), helpers = {};
  state.mode = 'flight';
  const ctx = {state, bus, helpers, registry: {get() {return null;}}};
  core.init(ctx);
  const gun = Object.create(weapons), fight = Object.create(combat);
  gun.init(ctx); fight.init(ctx);
  const ship = helpers.spawnEntity({ type: 'ship', pos: {x:0,z:0}, radius:6, mass:12,
    hull:400, hullMax:400, cap:4000, capMax:4000, capRegen:0, collides:true, team:0, rot:0,
    data:{weapons:[{defId:ID,slotIndex:0,heatPerSec:0}]} });
  state.playerId=ship.id; ship.isPlayer=true;
  function target(x,z,shield=0) {
    return helpers.spawnEntity({type:'ship',pos:{x,z},radius:1.4,mass:12,team:1,
      hull:5000,hullMax:5000,shield,shieldMax:shield,shieldRegen:0,armorFlat:0,
      cap:0,capMax:0,collides:true,rot:0,data:{}});
  }
  function tick(fire=true) {
    packCombatTable(state);
    state.input.fire=fire;
    state.input.aimAngle=Math.PI/2; // the battery must not follow mouse aim
    fight.kernel.prePhysics(DT);
    gun.update(DT,state);
    fight.update(DT,state);
    state.simTime+=DT; state.tick++;
  }
  return {state,bus,ship,target,tick};
}
test('Incinerator is a late-run, continuous thermal battery with its own red presentation',()=>{
  assert.equal(def.rof,0); assert.equal(def.continuous,true); assert.equal(def.damageType,'thermal');
  assert.ok(SWARM_DRAFT_OFFERS.some(o=>o.defId===ID&&o.fromWave===10));
  const profile=resolveMuzzleProfile(ID,null);
  assert.equal(profile.variant,'incinerator-beam'); assert.equal(profile.accentColor,'#ff150c');
  assert.ok(profile.beamRadiance>1);
});
test('parallel apertures rotate with the nose and ignore a lateral mount offset',()=>{
  const p=incineratorBeamOrigins({pos:{x:10,z:20},rot:Math.PI/2,radius:6},{x:100,z:24,y:0});
  assert.ok(Math.abs(p[0].z-24)<1e-8 && Math.abs(p[1].z-24)<1e-8);
  assert.ok(Math.abs((p[0].x+p[1].x)/2-10)<1e-8);
  assert.ok(p[0].x>p[1].x);
});
test('rays independently hit and clip; one battery spends and releases once per mount',()=>{
  const w=world(); const a=w.target(40,-1.92), b=w.target(70,1.92);
  const events=[], stops=[];
  w.bus.on('combat:fire',p=>{if(p.weaponId===ID)events.push({...p,to:{...p.to}})});
  w.bus.on('combat:beamStop',p=>{if(p.weaponId===ID)stops.push(p.beamKey)});
  const cap=w.ship.cap;
  w.tick();
  const rays=w.state.combat.beams;
  assert.equal(rays.length,2); assert.notEqual(rays[0].beamKey,rays[1].beamKey);
  assert.ok(Math.abs(rays.reduce((n,r)=>n+r.dpsThisTick,0)-def.dps*DT)<1e-8);
  assert.ok(rays.every(r=>Math.abs(r.from.z-r.to.z)<1e-8));
  assert.ok(a.hull<a.hullMax && b.hull<b.hullMax);
  assert.equal(events.length,2); assert.ok(events[0].to.x<events[1].to.x);
  assert.ok(Math.abs(cap-w.ship.cap-def.energyCost*DT)<1e-6);
  w.tick(false); assert.equal(w.state.combat.beams.length,0); assert.equal(new Set(stops).size,2);
});
test('a bare hull burns after release; shield-only contact never ignites',()=>{
  const w=world(); const a=w.target(40,-1.92), shielded=w.target(70,1.92,1000);
  for(let i=0;i<10;i++)w.tick();
  w.tick(false);
  const burn=()=>w.state.combat.entities[String(a.id)]?.statuses?.status_burning;
  assert.equal(burn()?.stacks,3);
  assert.equal(burn()?.expiresTick, 250, 'last exposure at tick 9 expires 240 ticks after next-tick application');
  assert.ok(!w.state.combat.entities[String(shielded.id)]?.statuses?.status_burning);
  const after=a.hull;
  for(let i=0;i<90;i++)w.tick(false);
  assert.ok(a.hull<after,'periodic damage after trigger release');
  for(let i=0;i<240;i++)w.tick(false);
  assert.equal(burn(),undefined,'fire expires');
  const expired=a.hull;
  for(let i=0;i<60;i++)w.tick(false);
  assert.equal(a.hull,expired,'expired fire stops damaging');
});

// A front-only fit is legal on real ships and appears through the actual Swarm armory,
 // not simply in the authored source table. Side/rear/ring sockets must refuse it.

test('real front-only fitting, runtime zero gimbal and late Swarm shelf admission',()=>{
  const hull=SHIPS.find(s=>s.id==='ship_hornet');
  const slots=buildSlotList(hull);
  const slot=slots.find(s=>s.type==='weapon'&&s.facing==='front');
  const fittings=Array(slots.length).fill(null);
  for(const facing of ['rear','left','right','turret']) assert.equal(fits({...slot,facing},def),false);
  assert.equal(fits(slot,def),true);
  const earlier=offerDraft({hullId:hull.id, fittings, seed:44, wave:9, count:1000, ruleset:SWARM_RULESET});
  assert.ok(earlier.ok && !earlier.offers.some(o=>o.defId===ID));
  const late=offerDraft({hullId:hull.id,fittings,seed:44,wave:10,count:1000,ruleset:SWARM_RULESET});
  const offer=late.offers.find(o=>o.defId===ID);
  assert.ok(offer,'real draft offers a fit that meets capacity');
  fittings[offer.slotIndex]=ID;
  assert.equal(buildWeaponList(hull,fittings,true)[0].gimbalArc,0);
});
test('a second fitted battery gets distinct, stable forward apertures',()=>{
  const s={pos:{x:0,z:0},rot:0,radius:10};
  const a=incineratorBeamOrigins(s,{x:8,z:0},0,2);
  const b=incineratorBeamOrigins(s,{x:8,z:0},1,2);
  assert.equal(new Set([...a,...b].map(p=>p.z)).size,4);
  assert.ok([...a,...b].every(p=>p.x===8));
  assert.ok(Math.abs([...a,...b].reduce((n,p)=>n+p.z,0))<1e-8);
});
test('two receipts survive bridge projection and own independent retained HDR geometry',()=>{
  const w=world(); w.target(40,-1.92); w.target(70,1.92);
  const receipts=[];
  w.bus.on('combat:fire', p=>{if(p.weaponId===ID)receipts.push(projectBridgeEvent('combat:fire',p));});
  w.tick();
  assert.equal(receipts.length,2);
  const pool=new PersistentCombatBeamPool(THREE);
  const profile=resolveMuzzleProfile(ID,null);
  try {
    for(const r of receipts){
      assert.ok(!r.dropped && r.flat.thermalContact==='material');
      pool.upsert(structuredClone(r.flat),0,profile);
    }
    pool.update(.1,null,null,3);
    const [a,b]=receipts.map(r=>pool._byKey.get(r.flat.beamKey));
    assert.ok(a.toX<b.toX && a.fromZ!==b.fromZ);
    assert.equal(pool.activeCount,2);
    assert.equal(pool.geometry.getAttribute('aSfThermal').getX(a.slot*4),3);
    assert.ok(pool.geometry.getAttribute('color').getX(a.slot*4)>1);
    const bright=pool.geometry.getAttribute('color').getX(a.slot*4);
    pool.update(.12,null,{flashOpacityScale:.3},3);
    assert.ok(pool.geometry.getAttribute('color').getX(a.slot*4)<bright*.5);
    assert.equal(pool.retarget({attackerId:w.ship.id,weaponId:ID,pos:{x:1,z:0}},.13),0);
    pool.stop(receipts[0].flat,.15);
    pool.upsert(receipts[1].flat,.3,profile);
    pool.update(.15+BEAM_COOLING_S+.001,null);
    assert.ok(pool._byKey.has(receipts[1].flat.beamKey));
    assert.equal(pool.activeCount,1);
    assert.equal(pool.geometry.getAttribute('aSfThermal').getX(a.slot*4),0);
  } finally {pool.dispose();}
});
test('occlusion on one ray does not let it damage a hull behind its first contact',()=>{
  const w=world();
  const cover=w.target(35,-1.92);
  const behind=w.target(80,-1.92);
  const other=w.target(65,1.92);
  for(let i=0;i<5;i++)w.tick();
  assert.ok(cover.hull<cover.hullMax && other.hull<other.hullMax);
  assert.equal(behind.hull,behind.hullMax);
});

// Exercise the native receipt consumer, not a parallel test-only VFX recipe.
test('two thermal work faces ignite independently without per-tick flashing; shield/miss emit no flames',()=>{
  const system=Object.create(vfx), pool=new PersistentCombatBeamPool(THREE);
  const sprites=[], streaks=[], lights=[];
  system._scene={}; system._combatBeams=pool; system._beamDamageCueNext=new Map();
  system.state={simTime:0,settings:{video:{},accessibility:{}}};
  system._t=0; system.helpers={}; system._ent=()=>null; system._dirAngle=()=>0;
  system._muzzleProfile=()=>resolveMuzzleProfile(ID,null);
  system._spawnMuzzleBeam=()=>{};
  system._spawnSprite=(...args)=>sprites.push(args);
  system._spawnProjectileTrailStreak=(...args)=>streaks.push(args);
  system._eventLight=(...args)=>lights.push(args);
  const receipt=(side,contact)=>({beamKey:'1:incinerator:'+side,ownerId:1,weaponId:ID,
    continuous:true,from:{x:0,z:side*6},to:{x:30+side*10,z:side*6},dir:0,thermalContact:contact});
  const a=receipt(0,'material'),b=receipt(1,'material');
  try {
    system._onFire(a);system._onFire(b);
    assert.equal(sprites.length,6);assert.equal(streaks.length,10);assert.equal(lights.length,2);
    assert.ok(sprites.some(s=>s[1]===30)&&sprites.some(s=>s[1]===40),'distinct contact points');
    for(let i=1;i<=5;i++){system.state.simTime=i/60;system._t=i/60;system._onFire(a);system._onFire(b);}
    assert.equal(sprites.length,6,'do not emit at simulation rate');
    system.state.simTime=.2;system._t=.2;system._onFire({...a,thermalContact:'shield'});system._onFire({...b,thermalContact:null});
    assert.equal(sprites.length,6);
    system.state.settings.accessibility.flashReduce=true;
    system._onFire(a);system._onFire(b);
    assert.equal(sprites.length,10,'reduced mode retains dim flame and smoke');
    assert.equal(streaks.length,10);assert.equal(lights.length,2);
    system._onBeamStop(a);
    assert.ok(!system._beamDamageCueNext.has('1:thermal-seat:'+a.beamKey));
    assert.ok(system._beamDamageCueNext.has('1:thermal-seat:'+b.beamKey));
  }finally{pool.dispose();}
});
