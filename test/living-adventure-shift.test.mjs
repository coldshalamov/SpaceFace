import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { save } from '../src/save/saveSystem.js';

// VISION: a miner extracts -> cargo accumulates -> a hauler receives it -> a real delivery.
// These focused checks place actors at the interaction boundaries; the production run checks flight.
function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [world, traffic, npcJobsRuntime, mining] });
  sim.state.mode = 'flight';
  sim.state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    radius: 12, hull: 100, hullMax: 100 }).id;
  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(1 / 60);
  const miner = sim.state.entityList.find((e) => e.data?.minerShiftRockId != null);
  const rec = sim.state.traffic.freighters.find((r) => r.role === 'ore_carrier');
  const barge = sim.state.entities.get(rec.id);
  const refinery = sim.state.entityList.find((e) => e.data?.stationId === 'station_helios');
  const rock = sim.state.entities.get(miner.data.minerShiftRockId);
  return { sim, miner, rock, rec, barge, refinery, owner: sim.registry.get('traffic'),
    jobs: sim.registry.get('npcJobsRuntime') };
}

function extract(h) {
  h.sim.registry.get('mining').applyMining(h.rock.id, 10000, 1, h.miner.id);
  return h.sim.state.entityList.find((e) => e.alive !== false && e.data?.npcMiningSource);
}

test('the cutter starts on the field-facing berth without a refinery wall across its first leg', () => {
  for (const seed of [4242, 8008]) {
    const { miner, rock, refinery } = boot(seed);
    const mx = miner.pos.x - refinery.pos.x, mz = miner.pos.z - refinery.pos.z;
    const rx = rock.pos.x - refinery.pos.x, rz = rock.pos.z - refinery.pos.z;
    const berthDistance = Math.hypot(mx, mz);
    assert.ok(berthDistance > refinery.radius + miner.radius, 'the spawn clears both hulls');
    assert.ok(berthDistance <= refinery.data.dockRadius, 'commissioning starts inside the actual dock envelope');
    assert.ok((mx * rx + mz * rz) / (berthDistance * Math.hypot(rx, rz)) > 0.98,
      'the first work leg points away from the refinery');
  }
});

test('both opening seeds carry actual loose ore into the refinery exactly once', () => {
  for (const seed of [4242, 8008]) {
    const h = boot(seed);
    assert.equal(h.rec.manifest.totalQty, 0, 'the ore collector starts empty');
    const pickup = extract(h);
    assert.ok(pickup, 'the existing mining owner emits physical ore with provenance');
    const qty = pickup.data.amount;
    const commodityId = pickup.data.commodityId;
    h.barge.pos = { ...pickup.pos };
    const arrivals = [];
    h.sim.bus.on('freight:arrival', (p) => arrivals.push(p));
    h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
    assert.equal(pickup.alive, false);
    assert.equal(pickup.data.amount, 0);
    assert.deepEqual(h.rec.manifest.lines, [{ commodityId, qty }]);
    h.barge.pos = { ...h.refinery.pos };
    h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
    assert.equal(arrivals.length, 1);
    assert.equal(h.rec.manifest.totalQty, 0, 'delivery cannot reroll a fresh magic load');
    h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
    assert.equal(arrivals.length, 1, 'remaining near the station cannot repeat delivery');
  }
});

test('a player towing or taking the ore leaves the barge empty', () => {
  const h = boot();
  const pickup = extract(h);
  for (const body of h.sim.state.entityList) {
    if (body.data?.npcMiningSource && body !== pickup) body.alive = false;
  }
  h.barge.pos = { ...pickup.pos };
  h.sim.state.player.tether = { active: true, targetId: pickup.id };
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  assert.equal(pickup.alive, true, 'a rope owns its load until released');
  assert.equal(h.rec.manifest.totalQty, 0);
  h.sim.state.player.tether = null;
  pickup.alive = false;
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  assert.equal(h.rec.manifest.totalQty, 0, 'missing cargo is not replaced');
});

test('the same miner takes a fresh face after exhaustion without a new job or reload', () => {
  const h = boot();
  const entry = h.sim.state.npcJobs.byId[h.miner.data.jobId];
  const job = entry.job;
  extract(h);
  entry.heliosShiftStopped = true;
  job.phase = 'unload';
  job.routeIndex = 0;
  h.jobs._ensureHeliosStarterMiner();
  assert.equal(entry.job, job, 'the ongoing job survives');
  assert.notEqual(h.miner.data.minerShiftRockId, h.rock.id);
  assert.equal(entry.heliosShiftStopped, false);
  assert.ok(h.sim.state.entities.get(h.miner.data.minerShiftRockId)?.alive);
});

test('a cutter cannot mine remotely or manufacture a second load on its work/unload timers', () => {
  const h = boot();
  const entry = h.sim.state.npcJobs.byId[h.miner.data.jobId];
  entry.job.phase = 'work';
  entry.job.progress = 0;
  h.miner.pos = { x: h.rock.pos.x + 10000, z: h.rock.pos.z };
  const before = h.rock.data.oreHP;
  h.jobs._holdHeliosStarterMinerBeam(entry, h.miner, 1);
  assert.equal(h.rock.data.oreHP, before);
  h.sim.bus.emit('npcjobs:work', { jobId: h.miner.data.jobId, kind: 'miner', completed: true,
    seq: 3, field: `field:${h.rock.id}` });
  h.sim.bus.emit('npcjobs:unload', { jobId: h.miner.data.jobId, kind: 'miner', completed: true,
    seq: 4, destination: 'home:station_helios' });
  assert.equal(h.miner.data.cargoManifest.totalQty, 0);
});

test('loose ore and a loaded barge preserve custody in the ordinary save payload', () => {
  const h = boot();
  const pickup = extract(h);
  const capture = () => JSON.parse(JSON.stringify(save._serializeEntities.call({ state: h.sim.state })));
  const saved = capture().persistent.find((e) => e.id === pickup.id);
  assert.ok(saved, 'Continue must retain ore already removed from the rock');
  assert.equal(saved.data.amount, pickup.data.amount);
  assert.equal(saved.data.despawnAt, pickup.data.despawnAt, 'Continue cannot renew the expiry clock');
  assert.deepEqual(saved.data.npcMiningSource, pickup.data.npcMiningSource);
  h.barge.pos = { ...pickup.pos };
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  const loaded = capture();
  assert.ok(!loaded.persistent.some((e) => e.id === pickup.id), 'collected ore cannot reappear');
  const savedBarge = loaded.persistent.find((e) => e.id === h.barge.id);
  assert.deepEqual(savedBarge.data.cargoManifest, h.barge.data.cargoManifest);
});

test('losing the loaded barge removes that lot from supply exactly once', () => {
  const h = boot();
  const pickup = extract(h);
  h.barge.pos = { ...pickup.pos };
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  const manifestId = h.rec.manifest.manifestId;
  const losses = [], arrivals = [];
  h.sim.bus.on('freight:loss', (p) => losses.push(p));
  h.sim.bus.on('freight:arrival', (p) => arrivals.push(p));
  h.barge.alive = false;
  h.sim.bus.emit('entity:killed', { id: h.barge.id, killerId: h.sim.state.playerId });
  h.sim.bus.emit('entity:killed', { id: h.barge.id, killerId: h.sim.state.playerId });
  assert.equal(losses.length, 1);
  assert.equal(losses[0].manifestId, manifestId);
  assert.equal(arrivals.length, 0);
  assert.ok(!h.sim.state.traffic.freighters.some((r) => r.id === h.barge.id));
});
