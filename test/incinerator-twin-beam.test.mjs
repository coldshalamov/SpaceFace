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
