import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { combat } from '../src/systems/combat.js';
import { actions } from '../src/systems/actions.js';
import { ships } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { save } from '../src/save/saveSystem.js';

const WRECK = 'wreck_choir_tender';

function boot(seed = 4242, rumor = true) {
  const sim = createSimulation({ seed, systems: [combat, actions, uniqueWrecks, npcJobsRuntime, ships, cargo, economy, factions] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
    radius: 10, data: { defId: 'ship_kestrel' } }).id;
  sim.spawn({ type: 'station', pos: { x: 0, z: 0 }, radius: 70, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios' } });
  const owner = sim.registry.get('uniqueWrecks');
  const kernel = sim.registry.get('combat').ensureKernel();
  const actors = () => state.entityList.filter((e) => e.alive && e.data?.choirReliefRole);
  const actor = (role) => actors().find((e) => e.data.choirReliefRole === role);
  if (rumor) bus.emit('game:started', {});
  sim.step(1 / 60);
  return { sim, state, bus, owner, kernel, actors, actor,
    part: (id) => kernel.inspect({ entityId: actor('patient').id }).entity.combat.subsystems[id] };
}

function choose(h, choiceId) {
  const record = h.state.player.uniqueWrecks.bearings[WRECK];
  h.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
  const wreck = h.state.entityList.find((e) => e.data?.uniqueWreckId === WRECK);
  h.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  h.bus.emit('uniqueWreck:choose', { wreckId: WRECK, choiceId });
}

function service(h) {
  const tender = h.actor('attendant'), patient = h.actor('patient');
  assert.ok(tender.data.jobId, 'the producer must have commissioned a real NPC job');
  // Place the ships at the work boundary; propulsion is exercised separately by the route test.
  tender.pos = { x: patient.pos.x + patient.radius + tender.radius + 14, z: patient.pos.z };
  h.bus.emit('npcjobs:work', { jobId: tender.data.jobId, completed: true });
  h.sim.step(1 / 60);
}

test('the default Choir rumor brings two lawful working hulls and actual damage', () => {
  const h = boot();
  try {
    assert.equal(h.actors().length, 2);
    assert.equal(h.actor('attendant').factionId, 'faction_choir');
    assert.equal(h.actor('patient').team, 2);
    assert.equal(h.sim.helpers.npcJobs.get(h.actor('attendant').data.jobId)?.job.kind, 'tender');
    assert.equal(h.part('subsystem_drive').health, 0);
    assert.equal(h.part('subsystem_drive').effectiveDisabled, true);
    const before = h.part('subsystem_power').health;
    service(h);
    assert.ok(h.part('subsystem_power').health > before, 'hand tools do real stabilization work before a choice');
    assert.equal(h.part('subsystem_drive').health, 0, 'the missing repair swarm matters');
    h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    h.bus.emit('save:loaded', {});
    assert.equal(h.actors().length, 2, 'reentry and Continue adopt the same hulls');
  } finally { h.sim.dispose(); }
});

test('returning the Knitbots repairs Mercy and commissions a real homeward route once', () => {
  const h = boot();
  try {
    const grants = [];
    h.bus.on('economy:grantCredits', (p) => grants.push(p));
    choose(h, 'authority_handover');
    service(h);
    assert.ok(h.part('subsystem_drive').health > 0);
    assert.equal(h.part('subsystem_drive').effectiveDisabled, false);
    h.sim.runTicks(300, 1 / 60);
    const patient = h.actor('patient');
    assert.ok(patient.data.jobId, 'the next economy tick commissions Mercy for departure');
    assert.ok(h.actor('attendant').data.jobId, 'the attendant also receives a return job');
    assert.equal(h.sim.helpers.npcJobs.get(h.actor('attendant').data.jobId).job.kind, 'hauler');
    const job = h.sim.helpers.npcJobs.get(patient.data.jobId).job;
    assert.equal(job.kind, 'hauler');
    assert.equal(job.route.at(-1).id, 'dest:station_helios');
    const jobs = h.sim.registry.get('npcJobsRuntime');
    const centerRoute = [job.route[0], { id: 'home:station_helios', pos: { x: 0, z: 0 } }];
    const arrival = jobs._livingAdventureWorkTarget({ job: { ...job, route: centerRoute, phase: 'unload', routeIndex: 1 } }, patient);
    assert.ok(arrival.reach >= 70 + patient.radius, 'station arrival never requires intersecting the station hull');
    const lot = { lotId: 'unclaimed-ore', postedBy: 'working-miner' };
    h.state.npcJobs.lots.sector_helios_prime = lot;
    h.sim.registry.get('npcJobsRuntime')._noteHandoffIntent({
      event: 'npcjobs:load', kind: 'hauler', jobId: patient.data.jobId,
    });
    assert.equal(h.state.npcJobs.lots.sector_helios_prime, lot, 'a medical shuttle cannot claim the ore shift cargo');
    assert.equal(h.state.player.uniqueWrecks.choirRelief.driveRestored, true);
    h.bus.emit('uniqueWreck:choose', { wreckId: WRECK, choiceId: 'authority_handover' });
    h.bus.emit('economy:tick', {});
    assert.equal(grants.length, 1);
    assert.equal(h.state.player.moduleInventory.some((m) => m.defId === 'unique_knitbots'), false);
    patient.pos = { ...job.route.at(-1).pos };
    const arrivals = [];
    h.bus.on('news:publish', (p) => { if (p.sourceRef === 'followup.choir_relief_evacuated') arrivals.push(p); });
    h.bus.emit('npcjobs:complete', { jobId: patient.data.jobId });
    h.bus.emit('npcjobs:complete', { jobId: patient.data.jobId });
    assert.equal(h.state.player.uniqueWrecks.choirRelief.evacuated, true);
    assert.equal(arrivals.length, 1);
  } finally { h.sim.dispose(); }
});

test('taking the swarm keeps the patient stranded, with no repair across a tow gap', () => {
  const h = boot();
  try {
    choose(h, 'claim_hardware');
    service(h);
    assert.equal(h.part('subsystem_drive').health, 0);
    assert.equal(h.actor('patient').data.jobId, undefined);
    assert.equal(h.state.player.moduleInventory.filter((m) => m.defId === 'unique_knitbots').length, 1);
    const before = h.part('subsystem_power').health;
    h.actor('attendant').pos.x += 1000;
    h.bus.emit('npcjobs:work', { jobId: h.actor('attendant').data.jobId, completed: true });
    assert.equal(h.part('subsystem_power').health, before);
  } finally { h.sim.dispose(); }
});

test('normal save payload retains both crew bodies and the choice; lost crew never respawn', () => {
  const h = boot();
  try {
    choose(h, 'claim_hardware');
    const persistent = save._serializeEntities.call({ state: h.state }).persistent;
    assert.equal(persistent.filter((e) => e.data?.choirReliefRole).length, 2);
    const dead = h.actor('attendant');
    dead.alive = false;
    h.bus.emit('entity:killed', { id: dead.id, killerId: h.state.playerId });
    const payload = JSON.parse(JSON.stringify(save._serializePlayer.call({ state: h.state })));
    const b = boot(4242, false);
    try {
      save._restorePlayer.call({ state: b.state }, payload);
      b.bus.emit('save:loaded', {});
      assert.equal(b.state.player.uniqueWrecks.bearings[WRECK].outcome, 'claimed');
      assert.equal(b.state.player.uniqueWrecks.choirRelief.attendantLost, true);
      assert.equal(b.actor('attendant'), undefined);
      assert.equal(b.actors().length, 1);
      b.bus.emit('economy:tick', {});
      assert.equal(b.actors().length, 1);
    } finally { b.sim.dispose(); }
  } finally { h.sim.dispose(); }
});
