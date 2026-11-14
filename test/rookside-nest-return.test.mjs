import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { NEST_VISIT } from '../src/data/nestVisit.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { lootShards } from '../src/systems/lootShards.js';
import { economy } from '../src/systems/economy.js';
import { understoryGardens, UNDERSTORY_QUIET } from '../src/systems/faction_understory.js';
import { UNDERSTORY_RECEIVER, receiverApproach } from '../src/data/understoryReceiver.js';

const IRON = 'cmdty_ore_iron';
const SECTOR = UNDERSTORY_RECEIVER.sectorId;

// Native owners and the real save envelope/restore driver. Staged physical admission:
// no browser, tow integrator, ordinary mining acquisition, or rendered Continue claim.
function boot(playerId = null) {
  const bus = createBus();
  const sim = createSimulation({ seed: 47, bus, systems: [cargo, lootShards, economy, understoryGardens] });
  const { state, registry } = sim;
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({ ...(playerId == null ? {} : { id: playerId }), type: 'ship', team: 1, isPlayer: true,
    pos: receiverApproach(), radius: 12, mass: 18, hull: 100, hullMax: 100,
    data: { derived: { mass: 18, operationalMass: 18, propulsion: { mainAccel: 100 } } } });
  state.playerId = player.id;
  const gardenOwner = registry.get('understoryGardens');
  gardenOwner.update(0, state);
  const saver = Object.create(save);
  saver.init({ state, bus, helpers: sim.helpers, registry });
  const grants = [];
  bus.on('credits:changed', row => { if (row.delta > 0) grants.push(structuredClone(row)); });
  const garden = () => state.entityList.find(e => e.alive && e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  function feed(body) {
    // Delivery, not creation: retain the producer's original body and occupant life.
    body.pos.copy(garden().pos);
    body.vel.set(0, 0, 0);
    state.player.tether = { active: true, targetId: body.id };
    gardenOwner.update(0, state);
    state.player.tether = null;
    assert.equal(body.alive, false);
  }
  function feedIron(qty) {
    assert.equal(addCargo(state, IRON, qty), qty);
    assert.equal(registry.get('cargo').jettison(IRON, qty), qty);
    const body = state.entityList.find(e => e.alive && e.data?.jettisonedCargo);
    assert.ok(body);
    feed(body);
  }
  return { sim, state, bus, registry, saver, gardenOwner, garden, feed, feedIron, grants };
}


function finishNest(h, outcome = 'carrier_escapes') {
  // Controlled encounter-owner receipt: this suite does not claim earned Nest combat.
  h.state.encounterDirector ||= {};
  h.state.encounterDirector.nestVisit = { version: 1, status: 'terminal',
    encounterId: NEST_VISIT.encounterId, sectorId: SECTOR,
    receipt: { encounterId: NEST_VISIT.encounterId, sectorId: SECTOR,
      shape: 'the_nest', outcome, t: 4 } };
}
function calls(h) {
  const rows = []; h.bus.on('comms:log', e => { if (e.speaker === 'Rookside Receiving Garden') rows.push(e.text); }); return rows;
}
test('native first-feed then post-Nest physical return gives one outcome-specific greeting without rewards', () => {
  for (const outcome of ['carrier_down', 'carrier_gutted', 'nest_emptied', 'carrier_escapes']) {
    const h = boot(); try {
      const rows = calls(h); h.feedIron(17); finishNest(h, outcome);
      const pilot = h.state.entities.get(h.state.playerId);
      pilot.pos.x = h.garden().pos.x + 900; pilot.pos.z = h.garden().pos.z;
      h.gardenOwner.update(0,h.state); assert.equal(rows.length,0);
      pilot.pos.x = h.garden().pos.x + 600;
      const before = h.state.player.credits; h.gardenOwner.update(0,h.state);
      assert.equal(rows.length,1); assert.equal(h.state.understory.rooksideNestReturn,outcome);
      assert.equal(h.state.player.credits,before); assert.match(rows[0],/paid haul is still optional/);
      for (let i=0;i<4;i++) h.gardenOwner.update(0,h.state);
      assert.equal(rows.length,1);
      if(outcome==='carrier_escapes') assert.match(rows[0],/carrier is still out there/);
      if(outcome==='nest_emptied') assert.match(rows[0],/does not mean the lane is clear/);
    } finally {h.sim.dispose();}
  }
});
test('no invented return from absent growth, malformed receipt, dead pilot, dock or foreign sector', () => {
  const h=boot();try {const rows=calls(h);finishNest(h);h.gardenOwner.update(0,h.state);assert.equal(rows.length,0);
    delete h.state.encounterDirector.nestVisit; h.feedIron(17); finishNest(h); h.state.encounterDirector.nestVisit.receipt.outcome='invented';h.gardenOwner.update(0,h.state);assert.equal(rows.length,0);
    finishNest(h);h.state.ui.docked=true;h.gardenOwner.update(0,h.state);assert.equal(rows.length,0);h.state.ui.docked=false;
    const p=h.state.entities.get(h.state.playerId);p.alive=false;h.gardenOwner.update(0,h.state);assert.equal(rows.length,0);p.alive=true;
    h.state.world.currentSectorId='sector_helios_prime';h.gardenOwner.update(0,h.state);assert.equal(rows.length,0);
  }finally{h.sim.dispose();}
});
test('receipt-time serialization and cold owner restore preserve once-only return across reentry', () => {
  const h=boot();try {h.feedIron(17);finishNest(h);let saved;const rows=calls(h);
    h.bus.on('comms:log',e=>{if(e.speaker==='Rookside Receiving Garden'){saved=JSON.parse(JSON.stringify(h.gardenOwner.serialize()));h.gardenOwner._rooksideReturn([h.garden()]);}});
    h.gardenOwner.update(0,h.state);assert.equal(rows.length,1);assert.equal(saved.rooksideNestReturn,'carrier_escapes');
    h.gardenOwner.deserialize(saved);h.bus.emit('save:loaded',{});h.gardenOwner.update(0,h.state);assert.equal(rows.length,1);
    assert.equal(h.gardenOwner.serialize().rooksideNestReturn,'carrier_escapes');
  }finally{h.sim.dispose();}
});

test('real save envelope cold Continue retains greeting suppression with restored live garden', () => {
  const a=boot();let envelope;try {a.feedIron(17);finishNest(a);a.gardenOwner.update(0,a.state);
    envelope=JSON.parse(JSON.stringify(a.saver.serialize('rookside-return')));
  }finally{a.sim.dispose();}
  const b=boot();try {const rows=calls(b);
    assert.equal(b.saver.loadEnvelope(envelope,'rookside-return'),true);
    assert.equal(b.state.understory.rooksideNestReturn,'carrier_escapes');
    // Receipt is injected again because this minimal native composition omits encounterDirector.
    finishNest(b);b.gardenOwner.update(0,b.state);b.bus.emit('save:loaded',{});b.gardenOwner.update(0,b.state);
    assert.equal(rows.length,0);assert.equal(b.state.understory.rooksideNestReturn,'carrier_escapes');
  }finally{b.sim.dispose();}
});
