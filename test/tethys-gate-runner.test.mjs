// Tethys Customs Gate cast (INF WF-01 unit #3). Seed 4242.
// The gate works the lane: an authored cutter holds crossing freight for a real manifest read,
// and an authored Quiet Runner carries a sealed contraband consignment across the checkpoint
// cone, dumping it as real pickups when the cutter closes. Run:
//   node --test test/tethys-gate-runner.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { TETHYS_CUSTOMS_WEIR, pointInsideCustomsWeir } from '../src/world/customsWeir.js';
import { buildCargoManifest } from '../src/economy/freightCausality.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const DT = 1 / 60;
const SECTOR = 'sector_tethys_junction';
const CUTTER_SLOT = 'tethys_gate_cutter';
const RUNNER_SLOT = 'tethys_quiet_runner';

function boot() {
  const sim = createSimulation({
    seed: 4242,
    // flightV3 + physics integrate the traffic hulls' data.intent — without the movement
    // membrane the gate cast would hold its pose forever in a bare sim boot.
    systems: [world, flightV3, physics, traffic, npcJobsRuntime, barkDirector],
  });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, hull: 100, hullMax: 100,
  });
  sim.state.playerId = player.id;
  sim.registry.get('world').enterSector(SECTOR);
  return sim;
}

function stepUntil(sim, pred, maxSimSeconds) {
  const maxSteps = Math.round(maxSimSeconds * 60);
  for (let i = 0; i < maxSteps; i++) {
    sim.step(DT);
    if (pred()) return true;
  }
  return false;
}

function findBySlot(sim, slotId) {
  for (const entity of sim.state.entities.values()) {
    if (entity && entity.alive !== false && entity.data
      && entity.data.activityActorSlotId === slotId) return entity;
  }
  return null;
}

const legalityOf = (commodityId) => {
  const def = COMMODITIES.find((row) => row && row.id === commodityId);
  return def ? def.legality : null;
};

test('seed 4242: the Tethys gate fields a working cutter and a loaded Quiet Runner', () => {
  const sim = boot();
  const castReady = () => findBySlot(sim, CUTTER_SLOT) && findBySlot(sim, RUNNER_SLOT);
  assert.equal(stepUntil(sim, castReady, 60), true, 'gate cast did not spawn');

  const cutter = findBySlot(sim, CUTTER_SLOT);
  assert.equal(cutter.data.trafficRole, 'customs');
  assert.equal(cutter.data.ai.lawful, true, 'gate cutter must read as lawful');
  assert.match(String(cutter.data.scanLabel), /INSPECTION CUTTER/);

  const runner = findBySlot(sim, RUNNER_SLOT);
  assert.equal(runner.data.trafficRole, 'smuggler');
  const manifest = runner.data.cargoManifest;
  assert.ok(manifest && manifest.totalQty > 0, 'runner spawned without its consignment');
  for (const line of manifest.lines) {
    assert.notEqual(legalityOf(line.commodityId), 'legal',
      `consignment line ${line.commodityId} is not contraband — the run has no reason to exist`);
  }

  // The runner's inbound leg crosses the gate cone — the run exists because the goods must
  // pass the checkpoint. Watch one leg: the runner enters the weir on its own steering.
  const runnerInsideCone = () => runner.alive !== false
    && pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, runner.pos);
  assert.equal(stepUntil(sim, runnerInsideCone, 60), true, 'runner never crossed the gate cone');
});

test('seed 4242: the cutter holds crossing freight and releases a clean read', () => {
  const sim = boot();
  assert.equal(stepUntil(sim, () => findBySlot(sim, CUTTER_SLOT), 60), true, 'cutter missing');

  // Stage a lawful freighter inside the cone, the way ambient haulers cross it.
  const weir = TETHYS_CUSTOMS_WEIR;
  const dirX = Math.cos(weir.heading), dirZ = Math.sin(weir.heading);
  const inCone = {
    x: weir.origin.x + dirX * 160,
    z: weir.origin.z + dirZ * 160,
  };
  assert.equal(pointInsideCustomsWeir(weir, inCone), true, 'test staging point is not in the cone');
  const manifest = buildCargoManifest({
    seed: 4242, freighterKey: 'gate-read-probe', role: 'hauler',
    market: undefined, marketKeys: undefined,
  });
  assert.ok(manifest.totalQty > 0, 'probe manifest came back empty');
  const hauler = sim.spawn(makeShipEntitySpec('ship_mule', {
    team: 2, factionId: 'faction_mts', pos: inCone,
    ai: { archetype: 'passive', passive: true, spawnContext: 'convoy_civilian' },
  }));
  hauler.data.cargoManifest = manifest;
  sim.state.traffic.freighters.push({
    id: hauler.id, role: 'hauler', targetId: null, waitT: 0, nextTradeT: 0,
    orbitPhase: 0, dockSeq: 0, manifest,
  });

  const incidents = [];
  sim.bus.on('customs:gateIncident', (p) => incidents.push(p));
  const cleanRead = () => incidents.some((p) => p.kind === 'release' && p.subjectId === hauler.id);
  assert.equal(stepUntil(sim, cleanRead, 90), true, 'cutter never released a clean read');

  const hold = incidents.find((p) => p.kind === 'hold' && p.subjectId === hauler.id);
  assert.ok(hold, 'no hold incident preceded the release');
  assert.match(String(hold.subjectName), /./);
  // The read has to be a real hold: the cutter closes and stands off the subject.
  const cutter = findBySlot(sim, CUTTER_SLOT);
  assert.ok(cutter, 'cutter vanished during the read');
  const separation = Math.hypot(cutter.pos.x - hauler.pos.x, cutter.pos.z - hauler.pos.z);
  assert.ok(separation < 200, `cutter read from ${separation.toFixed(0)} WU away — no visible hold`);
});

test('seed 4242: caught on the cone, the runner dumps real contraband and bolts flagged', () => {
  const sim = boot();
  const incidents = [];
  sim.bus.on('customs:gateIncident', (p) => incidents.push(p));

  const runner = (() => {
    const found = findBySlot(sim, RUNNER_SLOT);
    if (found) return found;
    assert.equal(stepUntil(sim, () => findBySlot(sim, RUNNER_SLOT), 60), true, 'runner missing');
    return findBySlot(sim, RUNNER_SLOT);
  })();

  const dump = () => incidents.some((p) => p.kind === 'dump' && p.subjectId === runner.id);
  assert.equal(stepUntil(sim, dump, 180), true, 'runner never dumped under the gate hold');

  // The dump is the runner's actual hold, as scannable contraband pods in the cone.
  const dumped = sim.state.entityList.filter((e) => e && e.alive !== false
    && e.type === 'pickup' && e.data && e.data.quietRunnerDump);
  assert.ok(dumped.length > 0, 'dump produced no pickups');
  for (const pod of dumped) {
    assert.notEqual(legalityOf(pod.data.commodityId), 'legal',
      'dumped pod is not contraband — the bust has no teeth');
    assert.ok(pod.data.amount > 0);
  }

  // The gate remembers: the runner is flagged, its hold is empty, and it is burning hard away.
  const now = sim.state.simTime;
  assert.ok((runner.data.gateFlagUntil || 0) > now, 'runner was not flagged after the dump');
  const rec = sim.state.traffic.freighters.find((r) => r && r.id === runner.id);
  assert.ok(rec, 'runner record missing');
  assert.equal((rec.manifest || runner.data.cargoManifest).totalQty, 0, 'runner kept its hold');
  const speed = Math.hypot(runner.vel.x, runner.vel.z);
  assert.ok(speed > 50, `runner bolted at only ${speed.toFixed(0)} wu/s — the escape does not read`);

  // The gate said so.
  assert.ok(incidents.some((p) => p.kind === 'hold' && p.subjectId === runner.id),
    'no hold incident before the dump');
});

test('seed 4242: the gate voice speaks the reads it makes', () => {
  const sim = boot();
  assert.equal(stepUntil(sim, () => findBySlot(sim, CUTTER_SLOT), 60), true, 'cutter missing');
  const weir = TETHYS_CUSTOMS_WEIR;
  const dirX = Math.cos(weir.heading), dirZ = Math.sin(weir.heading);
  const hauler = sim.spawn(makeShipEntitySpec('ship_mule', {
    team: 2, factionId: 'faction_mts',
    pos: { x: weir.origin.x + dirX * 150, z: weir.origin.z + dirZ * 150 },
    ai: { archetype: 'passive', passive: true, spawnContext: 'convoy_civilian' },
  }));
  const manifest = buildCargoManifest({ seed: 4242, freighterKey: 'gate-voice-probe', role: 'hauler' });
  hauler.data.cargoManifest = manifest;
  sim.state.traffic.freighters.push({
    id: hauler.id, role: 'hauler', targetId: null, waitT: 0, nextTradeT: 0,
    orbitPhase: 0, dockSeq: 0, manifest,
  });

  const voices = [];
  sim.bus.on('barkDirector:voice', (r) => { if (r && r.situation === 'gate-incident') voices.push(r); });
  const spoken = () => voices.some((v) => v.kind === 'release');
  assert.equal(stepUntil(sim, spoken, 90), true, 'gate never spoke a release');
  const line = voices.find((v) => v.kind === 'release');
  assert.match(String(line.text), /CUSTOMS GATE/);
  assert.match(String(line.text), /reads clean|reads true|logged/);
});
