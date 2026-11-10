// WORLD-33 and PIC-30. Seed 4242. Loud mining raises the danger field through the
// existing impulse cap, and that raise decays. The fielded tanker and inspection cutter
// wear existing job lights — heavy burn / clean burn, and the pin sweep — not a new
// profile per hull.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  FIELD_JOB_SIGNATURE_CRAFT,
  OCCUPATIONAL_TRAFFIC_CRAFT,
} from '../src/data/occupationalTrafficCraft.js';
import {
  NPC_JOB_REACTION,
  NPC_JOB_SIGNATURE_PROFILES,
  resolveFieldedCraftSignature,
  resolveNpcJobReaction,
  resolveNpcJobSignature,
} from '../src/render/npcJobSignatureVfx.js';
import { MINING_NOISE_DANGER_IMPULSE, mining } from '../src/systems/mining.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import {
  SECTOR_IMPULSE_DANGER_CAP,
  effectiveDangerFor,
  sectorSignalFor,
  sectorSim,
} from '../src/systems/sectorSim.js';
import { traffic } from '../src/systems/traffic.js';

const SEED = 4242;
const SECTOR_ID = 'sector_helios_prime';
const DECAY_DAYS = 4;

function bootField(seed = SEED) {
  const sim = createSimulation({ seed, systems: [mining, sectorSim] });
  sim.state.world.currentSectorId = SECTOR_ID;
  sim.state.simTime = 100;
  return sim;
}

function crossMiningNoise(sim) {
  const miningSys = sim.registry.get('mining');
  sim.state.player.miningNoise = 69;
  miningSys._updateMiningNoise(true, 0.25, sim.state);
}

test('WORLD-33 loud mining applies one capped danger impulse and the field decays it', () => {
  assert.equal(MINING_NOISE_DANGER_IMPULSE, 0.05);
  assert.equal(SECTOR_IMPULSE_DANGER_CAP, 0.35);
  assert.ok(MINING_NOISE_DANGER_IMPULSE <= SECTOR_IMPULSE_DANGER_CAP);

  const noisy = bootField();
  const quiet = bootField();
  try {
    const beforeShips = noisy.state.entityList.length;
    const dangerEvents = [];
    const impulses = [];
    noisy.bus.on('danger:miningNoise', (payload) => dangerEvents.push(payload));
    noisy.bus.on('sectorsim:impulse', (payload) => impulses.push(payload));

    const baseline = effectiveDangerFor(noisy.state, SECTOR_ID);
    assert.equal(effectiveDangerFor(quiet.state, SECTOR_ID), baseline);

    crossMiningNoise(noisy);
    crossMiningNoise(noisy);

    assert.equal(dangerEvents.length, 2, 'the meter still reports every crossing');
    assert.equal(impulses.length, 1, 'one crossing pays the field once inside the cooldown');
    assert.equal(impulses[0].kind, 'mining_noise');
    assert.equal(impulses[0].sectorId, SECTOR_ID);
    assert.equal(impulses[0].danger, MINING_NOISE_DANGER_IMPULSE);
    assert.ok(impulses[0].danger <= SECTOR_IMPULSE_DANGER_CAP);
    assert.equal(noisy.state.entityList.length, beforeShips, 'noise must not spawn a pirate');

    const queued = noisy.state.sectorSim.impulses;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].danger, MINING_NOISE_DANGER_IMPULSE);
    assert.ok(Math.abs(queued[0].danger) <= SECTOR_IMPULSE_DANGER_CAP);

    noisy.registry.get('sectorSim')._advanceModel(0, 'mining_noise');
    const raised = effectiveDangerFor(noisy.state, SECTOR_ID);
    const excess = raised - baseline;
    assert.ok(excess > 0, 'the sector danger field rose');
    assert.ok(excess <= SECTOR_IMPULSE_DANGER_CAP, 'the rise stays inside the impulse cap');
    assert.ok(excess <= MINING_NOISE_DANGER_IMPULSE + 1e-9, 'the field does not amplify the impulse');
    assert.equal(sectorSignalFor(noisy.state, SECTOR_ID).driver.danger, 'interdiction_wave');
    assert.equal(noisy.state.sectorSim.impulses.length, 0, 'the one impulse was consumed');

    noisy.registry.get('sectorSim')._advanceModel(DECAY_DAYS, 'decay');
    quiet.registry.get('sectorSim')._advanceModel(DECAY_DAYS, 'decay');
    const excessLater = effectiveDangerFor(noisy.state, SECTOR_ID) - effectiveDangerFor(quiet.state, SECTOR_ID);
    assert.ok(excessLater < excess, 'the mining impulse decays');
    assert.ok(excessLater > 0, 'decay does not erase the mark in one step');

    const clampSim = bootField();
    try {
      const accepted = clampSim.registry.get('sectorSim').injectImpulse({
        kind: 'mining_noise',
        sectorId: SECTOR_ID,
        danger: 9,
      });
      assert.equal(accepted, true);
      const stored = clampSim.state.sectorSim.impulses.at(-1);
      assert.equal(stored.danger, SECTOR_IMPULSE_DANGER_CAP);
      const before = effectiveDangerFor(clampSim.state, SECTOR_ID);
      clampSim.registry.get('sectorSim')._advanceModel(0, 'cap');
      const moved = effectiveDangerFor(clampSim.state, SECTOR_ID) - before;
      assert.ok(moved <= SECTOR_IMPULSE_DANGER_CAP);
      assert.ok(moved <= 0.35);
    } finally {
      clampSim.dispose();
    }
  } finally {
    noisy.bus.clear();
    quiet.bus.clear();
    noisy.dispose();
    quiet.dispose();
  }
});

function heliosStations(sim) {
  sim.spawn({
    type: 'station', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 40, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  sim.spawn({
    type: 'station', team: 2, pos: { x: 900, z: 120 }, vel: { x: 0, z: 0 },
    radius: 34, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios_yard', name: 'Helios Yard' },
  });
}

function jobFor(sim, entity) {
  const jobId = entity && entity.data && entity.data.jobId;
  if (!jobId) return null;
  const bag = sim.state.npcJobs && sim.state.npcJobs.byId;
  return bag && bag[jobId] && bag[jobId].job || null;
}

test('PIC-30 tanker and cutter resolve existing job signatures and seed 4242 spawns carry them', () => {
  const tankerCraft = FIELD_JOB_SIGNATURE_CRAFT.find((row) => row.role === 'tanker');
  const cutterCraft = FIELD_JOB_SIGNATURE_CRAFT.find((row) => row.role === 'customs');
  assert.ok(tankerCraft && cutterCraft);
  assert.equal(OCCUPATIONAL_TRAFFIC_CRAFT.some((row) => row.craftId === 'volatiles_tanker'), false);
  assert.equal(OCCUPATIONAL_TRAFFIC_CRAFT.some((row) => row.craftId === 'inspection_cutter'), false);
  for (const key of ['tanker', 'cutter', 'customs', 'volatiles_tanker', 'inspection_cutter']) {
    assert.equal(NPC_JOB_SIGNATURE_PROFILES[key], undefined, `no per-hull profile ${key}`);
  }

  const heavy = resolveNpcJobSignature('tanker', 'transit', true);
  const clean = resolveNpcJobSignature('tanker', 'transit', false);
  assert.equal(heavy, NPC_JOB_SIGNATURE_PROFILES.heavy_burn);
  assert.equal(heavy, NPC_JOB_SIGNATURE_PROFILES[tankerCraft.loadedProfileId]);
  assert.equal(heavy.id, 'heavy_burn');
  assert.equal(heavy.rhythm, 'load-heartbeat');
  assert.equal(clean, NPC_JOB_SIGNATURE_PROFILES.clean_burn);
  assert.equal(clean, NPC_JOB_SIGNATURE_PROFILES[tankerCraft.emptyProfileId]);
  assert.equal(clean.id, 'clean_burn');
  assert.equal(clean.rhythm, 'empty-bar');
  assert.notEqual(heavy, clean);
  assert.equal(resolveFieldedCraftSignature('tanker', 'transit', true), heavy);
  assert.equal(resolveFieldedCraftSignature('tanker', 'return', false), clean);

  const onPin = resolveNpcJobSignature('cutter', 'hold', false);
  assert.equal(onPin, NPC_JOB_SIGNATURE_PROFILES.on_the_pin);
  assert.equal(onPin, NPC_JOB_SIGNATURE_PROFILES[cutterCraft.profileId]);
  assert.equal(onPin.id, 'on_the_pin');
  assert.equal(onPin.codeName, 'On the pin');
  assert.equal(onPin.rhythm, 'pin-sweep');
  assert.equal(onPin.link, 'sweep-lamp');
  assert.equal(resolveNpcJobSignature('cutter', 'transit', true), onPin, 'a loaded cutter still sweeps');
  assert.equal(resolveNpcJobSignature('customs', 'approach', false), onPin);
  assert.equal(resolveFieldedCraftSignature('customs', 'hold', false), onPin);
  assert.equal(resolveFieldedCraftSignature('cutter', 'transit', true), onPin);

  assert.equal(resolveNpcJobReaction('hauler', 0, 'transit').id, NPC_JOB_REACTION.BRIGHTEN);
  assert.equal(resolveNpcJobReaction('patrol', 0, 'hold').id, NPC_JOB_REACTION.PAINT);
  assert.equal(resolveNpcJobReaction('cutter', 0, 'hold').id, NPC_JOB_REACTION.NONE);

  const sim = createSimulation({ seed: SEED, systems: [npcJobsRuntime, traffic] });
  try {
    sim.state.mode = 'flight';
    sim.state.world.currentSectorId = SECTOR_ID;
    heliosStations(sim);
    sim.bus.emit('sector:enter', {
      sectorId: SECTOR_ID,
      sector: { id: SECTOR_ID, security: 0.95, trafficPerMin: 18, factionId: 'faction_scn' },
    });

    const tankerRec = (sim.state.traffic.freighters || []).find((rec) => rec && rec.role === 'tanker');
    const cutterRec = (sim.state.traffic.freighters || []).find((rec) => rec && rec.role === 'customs');
    assert.ok(tankerRec, 'seed 4242 Helios spawns the tanker');
    assert.ok(cutterRec, 'seed 4242 Helios spawns the inspection cutter');
    const tanker = sim.state.entities.get(tankerRec.id);
    const cutter = sim.state.entities.get(cutterRec.id);
    assert.equal(tanker.data.trafficRole, 'tanker');
    assert.equal(cutter.data.trafficRole, 'customs');

    let tankerJob = null;
    let cutterJob = null;
    for (let second = 0; second < 40; second++) {
      tankerJob = jobFor(sim, tanker);
      cutterJob = jobFor(sim, cutter);
      const tankerReady = tankerJob && tankerJob.phase === 'transit';
      const cutterReady = cutterJob && (cutterJob.phase === 'transit' || cutterJob.phase === 'approach' || cutterJob.phase === 'hold');
      if (tankerReady && cutterReady) break;
      sim.step(1);
    }

    tankerJob = jobFor(sim, tanker);
    cutterJob = jobFor(sim, cutter);
    assert.ok(tankerJob, 'the tanker spawn carries a job');
    assert.equal(tankerJob.kind, 'hauler');
    assert.equal(tankerJob.phase, 'transit');
    assert.equal(
      resolveNpcJobSignature(tankerJob.kind, tankerJob.phase, true),
      NPC_JOB_SIGNATURE_PROFILES.heavy_burn,
    );
    assert.equal(resolveFieldedCraftSignature(tanker.data.trafficRole, tankerJob.phase, true), heavy);
    assert.equal(resolveFieldedCraftSignature(tanker.data.trafficRole, tankerJob.phase, false), clean);

    assert.ok(cutterJob, 'the cutter spawn carries a job');
    assert.equal(cutterJob.kind, 'patrol');
    assert.ok(['transit', 'approach', 'hold'].includes(cutterJob.phase), cutterJob.phase);
    const carried = resolveNpcJobSignature(cutterJob.kind, cutterJob.phase, false);
    assert.equal(carried, onPin);
    assert.equal(resolveFieldedCraftSignature(cutter.data.trafficRole, cutterJob.phase, false), onPin);
    assert.equal(carried.rhythm, 'pin-sweep');
    assert.equal(carried.link, 'sweep-lamp');
  } finally {
    sim.dispose();
  }
});
