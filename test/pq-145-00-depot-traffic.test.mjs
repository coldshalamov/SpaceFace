import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { claims } from '../src/systems/claims.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { save } from '../src/save/saveSystem.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { careersForSector } from '../src/ui/map/careersReadout.js';
import { buildClaimOwnershipMarkers } from '../src/ui/galaxyMap.js';

const SEED = 14500;
const SECTOR = 'sector_ceres_belt';

function boot({ pirates = true } = {}) {
  const sim = createSimulation({ seed: SEED, systems: [
    world, npcJobsRuntime, traffic, claims, ...(pirates ? [encounterDirector] : []), save,
  ] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 30000;
  state.onboarding = { active: false, finished: true };
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', {
    team: 0, pos: sectorLocalToGlobalForSector({ x: -1100, z: 620 }, SECTOR),
  }));
  player.isPlayer = true;
  state.playerId = player.id;
  sim.registry.get('world').enterSector(SECTOR);
  return sim;
}

function depotJobs(sim, body) {
  return Object.values(sim.state.npcJobs.byId).filter(({ job }) =>
    job.kind === 'hauler' && job.payload?.claimDepot?.bodyId === body.id);
}

test('PQ-145.00 default Ceres claim dispatches a real persistent hauler service', () => {
  const sim = boot();
  try {
    const { state } = sim;
    const owner = sim.registry.get('claims');
    const poi = SECTORS.find((sector) => sector.id === SECTOR).pois.find((p) => p.claimable);
    assert.ok(poi, 'the shipped Ceres pocket has a claimable body');
    assert.equal(owner.claim({ ...poi, pos: sectorLocalToGlobalForSector(poi.pos, SECTOR) }), true);
    const body = owner.list()[0];
    Object.assign(state.entities.get(state.playerId).pos, { x: body.x, z: body.z });
    sim.runTicks(120);
    const jobs = depotJobs(sim, body);
    console.log(JSON.stringify({ seed: SEED, claim: body.name, inSessionJobs: jobs.length }));
    assert.equal(jobs.length, 1, 'one physical service job, dispatched by traffic after claiming');
    const entity = state.entities.get(jobs[0].entityId);
    assert.ok(entity?.alive && entity.collides, 'the hauler is a real colliding ship');
    assert.ok(entity.data.cargoManifest.totalQty > 0, 'the inbound hull carries robbable supplies');
    assert.ok(entity.flags.persistent, 'Continue includes the service hull');
    const names = careersForSector(state, SECTOR).rows.filter((r) => r.jobId === jobs[0].job.id);
    assert.equal(names.length, 1, 'the existing Chart Careers surface sees the job');
    assert.match(names[0].siteLabel, /Rookery/);
    const drawnRoute = buildClaimOwnershipMarkers(state, SECTOR, owner)
      .some((marker) => marker.travelRoute?.claimId === body.id);
    console.log(JSON.stringify({ seed: SEED, chartCareerRoutePresent: true, mapRoutePresent: drawnRoute }));
    sim.runTicks(900);
    const watch = state.encounterDirector?.live?.[`depot-watch:${body.id}`];
    console.log(JSON.stringify({ pirateWatch: !!watch, pirateShips: watch?.ids,
      watchPhase: watch?.phase, planShips: watch?.plan?.ships?.length }));
    assert.ok(watch, 'real encounter director watches the depot route');
    assert.ok(watch.ids.filter((id) => state.entities.get(id)?.alive).length > 0,
      'the watch has actual pirate ships');
    const snapshot = JSON.parse(JSON.stringify(sim.registry.get('save').serialize('quick')));
    const beforeIds = depotJobs(sim, body).map((entry) => entry.worldRecordId);
    const cold = boot();
    try {
      assert.equal(cold.registry.get('save').loadEnvelope(snapshot, 'quick'), true);
      cold.runTicks(120);
      const continued = depotJobs(cold, body);
      console.log(JSON.stringify({ seed: SEED, afterContinueJobs: continued.length }));
      assert.deepEqual(continued.map((entry) => entry.worldRecordId), beforeIds,
        'Continue resumes the same freight identity rather than creating a replacement');
      assert.ok(cold.state.entities.get(continued[0].entityId)?.alive);
      assert.equal(watch.phase, 'conflict', 'entering the watched route springs the existing ambush');
      assert.deepEqual(continued[0].job.payload.claimDepot, jobs[0].job.payload.claimDepot,
        'the restored job keeps its exact service leg');
    } finally { cold.dispose(); }
  } finally {
    sim.dispose();
  }
});

test('PQ-145.00 an uncontested supply run unloads once and takes the return job', () => {
  const sim = boot({ pirates: false });
  try {
    const owner = sim.registry.get('claims');
    const poi = SECTORS.find((sector) => sector.id === SECTOR).pois.find((p) => p.claimable);
    owner.claim({ ...poi, pos: sectorLocalToGlobalForSector(poi.pos, SECTOR) });
    const body = owner.list()[0];
    const unloads = [];
    sim.bus.on('npcjobs:unload', (event) => {
      if (event.completed && event.payload?.claimDepot) unloads.push(structuredClone(event));
    });
    let returnJobs = 0;
    for (let second = 0; second < 100; second += 1) {
      sim.runTicks(60);
      const jobs = depotJobs(sim, body);
      if (jobs.some((entry) => entry.job.route[0].id === `depot:${body.id}`)) returnJobs = 1;
    }
    const service = sim.state.traffic.depotServices[0];
    console.log(JSON.stringify({ seed: SEED, returnJobs, completedLegs: service.legSeq,
      deliveredU: service.deliveredU }));
    assert.equal(returnJobs, 1);
    assert.ok(service.legSeq >= 2, 'the supply and return legs finish through the existing job owner');
    assert.ok(service.deliveredU > 0);
    const beforeReplay = JSON.stringify(service);
    for (const event of unloads.slice()) sim.bus.emit('npcjobs:unload', event);
    assert.equal(JSON.stringify(service), beforeReplay, 'old unloads cannot replay supplies');
    assert.ok(depotJobs(sim, body).length <= 1, 'one recurring hauler, no spawn fountain');
  } finally { sim.dispose(); }
});
