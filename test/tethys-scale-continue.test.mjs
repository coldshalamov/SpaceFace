import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { save } from '../src/save/saveSystem.js';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition } from '../src/systems/kesslerScaleWorksite.js';
import { mainMenuScreen } from '../src/ui/screens/mainMenu.js';
import { kesslerDeckDampingImpulse, tickKesslerDeckDamping } from '../src/systems/kesslerDeckDamping.js';
import { fieldBodyProfile } from '../src/core/fields/fieldReadModel.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';

test('powered deck dissipates real cargo motion, bounded under fast steps and actual Anvil acceleration', () => {
  const center=kesslerPadPosition(),state={entities:new Map(),combat:{entities:{}}};
  const planet=normalizeField({id:'anvil',kind:'well',center:{x:14288,z:5992},radius:2600,
    strength:240,innerRadius:900,innerSoft:250,falloff:1.4,durationS:Infinity});
  for(const mass of [20,60,200])for(const offset of [-70,0,70]){
    const pod={id:1,alive:true,type:'payload',mass,radius:3,pos:{x:center.x+offset,z:center.z},vel:{x:-2,z:0},
      physicsBody:{mass},data:{jettisonedCargo:true}};state.entities.set(1,pod);
    const before={...pod.pos};
    for(let i=0;i<120;i++){
      const impulse=kesslerDeckDampingImpulse(state,pod,1/60);
      const gravity=sampleFieldAcceleration(pod.pos,null,[planet],10,fieldBodyProfile(pod,state));
      assert.ok(impulse.x*pod.vel.x+impulse.z*pod.vel.z<=0);
      pod.vel.x+=impulse.x/mass+gravity.ax/60;pod.vel.z+=impulse.z/mass+gravity.az/60;
      pod.pos.x+=pod.vel.x/60;pod.pos.z+=pod.vel.z/60;
    }
    assert.ok(Math.hypot(pod.vel.x,pod.vel.z)<8);assert.notDeepEqual(pod.pos,before);
    for(const dt of [1/60,.5,5]){
      pod.vel={x:250,z:-100};const old={...pod.vel},j=kesslerDeckDampingImpulse(state,pod,dt);
      assert.deepEqual(pod.vel,old,'impulse calculation never assigns velocity');
      assert.ok(Math.hypot(pod.vel.x+j.x/mass,pod.vel.z+j.z/mass)<=Math.hypot(old.x,old.z));
    }
    for(const type of ['ship','drone','asteroid','pickup']){pod.type=type;assert.equal(kesslerDeckDampingImpulse(state,pod,1/60),null);}
    pod.type='payload';pod.data.physicalCustodyOnly=true;assert.equal(kesslerDeckDampingImpulse(state,pod,1/60),null);
    pod.data.physicalCustodyOnly=false;pod.pos.x=center.x+91;assert.equal(kesslerDeckDampingImpulse(state,pod,1/60),null);
  }
});

test('deck uses solver mass rather than hitch bookkeeping and stops outside current live worksite', () => {
  const pod={id:1,alive:true,type:'payload',mass:20,radius:3,pos:kesslerPadPosition(),vel:{x:5,z:0},physicsBody:{mass:20},data:{jettisonedCargo:true,hitchMass:100}};
  const beacon={id:2,alive:true,physicsBody:false,data:{kesslerScale:true,kesslerWorksiteVersion:1}};
  const state={tick:1,mode:'flight',run:{kind:'adventure'},ui:{},player:{flags:{}},world:{currentSectorId:'sector_tethys_junction'},entities:new Map([[1,pod],[2,beacon]]),entityList:[pod,beacon],combat:{entities:{}}};
  for(const scale of [.25,1,6,8]){
    state.combat.entities['1']={physicsResponse:{massScale:scale}};
    const impulse=kesslerDeckDampingImpulse(state,pod,1/60);
    assert.equal(impulse.x,-40*scale);assert.equal(5+impulse.x/(20*scale),3);
  }
  tickKesslerDeckDamping(state,1/60);assert.equal(consumePhysicsCommand(pod).impulses.length,1);
  const toggles=[()=>{state.mode='menu';},()=>{state.world.currentSectorId='sector_ceres_belt';},()=>{state.ui.docked=true;},()=>{state.player.flags.docked=true;},()=>{state.run.kind='survival';},()=>{state.physicsVenue={active:true};},()=>{beacon.alive=false;},()=>{pod.data.physicalCustodyOnly=true;},()=>{pod.data.anchored=true;}];
  for(const change of toggles){
    state.mode='flight';state.world.currentSectorId='sector_tethys_junction';state.ui.docked=false;state.player.flags.docked=false;state.run.kind='adventure';state.physicsVenue=null;beacon.alive=true;pod.data.physicalCustodyOnly=false;pod.data.anchored=false;
    change();tickKesslerDeckDamping(state,1/60);assert.equal(consumePhysicsCommand(pod),null);
  }
});

test('deck refuses malformed or overflowing authored solver mass until physics normalizes it', () => {
  const pod = { id: 1, alive: true, type: 'payload', pos: kesslerPadPosition(),
    vel: { x: 5, z: 0 }, mass: 20, data: { jettisonedCargo: true } };
  const state = { entities: new Map([[1, pod]]), combat: { entities: {} } };
  for (const mass of [undefined, NaN, Infinity, -1, 0]) {
    pod.physicsBody = { mass };
    assert.equal(kesslerDeckDampingImpulse(state, pod, 1 / 60), null);
  }
  pod.physicsBody = { mass: Number.MAX_VALUE };
  state.combat.entities[1] = { physicsResponse: { massScale: 8 } };
  assert.equal(kesslerDeckDampingImpulse(state, pod, 1 / 60), null);
  pod.physicsBody = { mass: 20 };
  assert.equal(kesslerDeckDampingImpulse(state, pod, 1 / 60).x, -320);
});

function storage() {
  const rows = new Map();
  return { getItem: key => rows.get(String(key)) ?? null, setItem: (key, value) => rows.set(String(key), String(value)),
    removeItem: key => rows.delete(String(key)), clear: () => rows.clear(), key: n => [...rows.keys()][n] ?? null,
    get length() { return rows.size; }, rows };
}

test('real save slot and production Continue action preserve measured original and partial remainder without paying or cloning', () => {
  const previous = globalThis.localStorage; globalThis.localStorage = storage();
  const sim = createSimulation({ seed: 8128, systems: [cargo, mining, createKesslerScale(), save], updateOrder: [] });
  try {
    const s = sim.state; s.mode = 'flight'; s.simTime = 10; s.run.kind = 'adventure';
    s.world.currentSectorId = 'sector_tethys_junction';
    s.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }]; s.player.activeShipIndex = 0;
    const p = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: kesslerPadPosition(), vel: { x: 0, z: 0 }, radius: 10, mass: 30, hull: 100, data: { shipId: 'ship_kestrel' } });
    s.playerId = p.id; s.player.flags = { docked: false }; s.ui.docked = false; s.ui.screenStack = [];
    s.player.cargo.capVolume = 100; addCargo(s, 'cmdty_silicate', 3);
    const credits = s.player.credits, scale = sim.registry.get('kesslerScale'); scale._sync();
    assert.equal(sim.registry.get('cargo').jettison('cmdty_silicate', 3), 3);
    let pod = s.entityList.find(e => e.alive && e.data?.playerJettisonOrigin); scale.update(.5, s);
    const receipt = { ...pod.data.kesslerReceipt }; assert.ok(receipt.trueRead > receipt.plateRead);
    s.player.cargo.capVolume = 1; sim.registry.get('mining')._collectPayload(pod, p);
    assert.equal(pod.data.amount, 2); assert.equal(s.player.cargo.items.cmdty_silicate, 1);
    const saver = sim.registry.get('save'); assert.equal(saver.save('quick'), true);
    const persisted = JSON.stringify([...globalThis.localStorage.rows]);
    globalThis.localStorage = storage(); for (const [k, v] of JSON.parse(persisted)) globalThis.localStorage.setItem(k, v);
    const loads = []; sim.bus.on('game:load', e => loads.push(e));
    s.mode = 'menu'; mainMenuScreen._pick.call({ _render() {}, _showContinueFade() {} }, { state: s, bus: sim.bus, registry: sim.registry }, 'continue');
    assert.equal(loads.length, 1); assert.equal(loads[0].slot, 'quick'); assert.equal(s.mode, 'flight');
    const originals = s.entityList.filter(e => e.alive && e.data?.playerJettisonOrigin && e.data.commodityId === 'cmdty_silicate');
    assert.equal(originals.length, 1); pod = originals[0];
    assert.deepEqual(pod.data.kesslerReceipt, receipt); assert.equal(pod.data.amount, 2); assert.equal(pod.data.salvagePool.cmdty_silicate, 2);
    assert.equal(s.player.cargo.items.cmdty_silicate, 1); assert.equal(s.player.credits, credits);
    scale.update(.5, s); assert.equal(s.story.flags.kessler_reads_counted, 1, 'restoring does not reweigh');
    s.player.cargo.capVolume = 3; sim.registry.get('mining')._collectPayload(pod, s.entities.get(s.playerId));
    assert.equal(pod.alive, false); assert.equal(s.player.cargo.items.cmdty_silicate, 3); assert.equal(s.player.credits, credits);
    assert.equal(saver.save('quick'), true); assert.equal(saver.load('quick'), true);
    assert.equal(s.entityList.filter(e => e.alive && e.data?.playerJettisonOrigin).length, 0);
    assert.equal(s.player.cargo.items.cmdty_silicate, 3); assert.equal(s.player.credits, credits);
  } finally { sim.dispose(); if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
