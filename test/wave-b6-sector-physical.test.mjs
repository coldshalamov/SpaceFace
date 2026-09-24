// §22 B6 — six sectors each finish one job handoff with nobody accepting a mission,
// and each has one physical number that is not Helios's.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { authorityResponsePolicy } from '../src/law/authorityResponse.js';
import {
  B6_SECTOR_IDS,
  HELIOS_SECTOR_ID,
  asteroidMass,
  differingPhysical,
  scaleBySector,
  sectorPhysical,
} from '../src/data/sectorPhysical.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

const DT = 1 / 60;
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1 };

test('each of six sectors differs from Helios by exactly one physical ratio', () => {
  assert.deepEqual(differingPhysical(HELIOS_SECTOR_ID), []);
  assert.equal(asteroidMass(HELIOS_SECTOR_ID, 10), 600, 'Helios rock mass is the old 200+size*40');
  const seen = new Map();
  for (const id of B6_SECTOR_IDS) {
    const keys = differingPhysical(id);
    assert.equal(keys.length, 1, `${id} must differ on one key`);
    const key = keys[0];
    const ratio = sectorPhysical(id)[key];
    assert.notEqual(ratio, sectorPhysical(HELIOS_SECTOR_ID)[key], id);
    seen.set(id, { key, ratio });
    console.log(`${id} ${key} ${ratio}× Helios`);
  }
  assert.equal(asteroidMass('sector_ceres_belt', 10), 600);
  assert.equal(sectorPhysical('sector_ceres_belt').patrolResponse, 1.6);
  assert.equal(asteroidMass('sector_vesta_forge', 10), 1320);
  assert.equal(asteroidMass('sector_io_reach', 10), 390);
  const heliosDelay = authorityResponsePolicy(0.42).dispatchDelayS;
  assert.equal(scaleBySector('sector_pallas_drift', 'patrolResponse', heliosDelay), heliosDelay * 1.75);
  assert.equal(seen.size, 6);
});

test('a miner hands one lot to a hauler in each sector, and no mission is accepted', () => {
  for (const sectorId of B6_SECTOR_IDS) {
    const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime] });
    sim.state.mode = 'flight';
    sim.state.world.currentSectorId = sectorId;
    const claimed = [];
    sim.bus.on('npcjobs:lotClaimed', (payload) => claimed.push(payload));
    sim.bus.on('mission:accepted', () => { throw new Error(`${sectorId} accepted a mission`); });

    const miner = sim.spawn({
      type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 80, hullMax: 80, radius: 6,
    });
    miner.data = miner.data || {};
    miner.data.worldRecordId = `miner:${sectorId}`;
    miner.data.sectorId = sectorId;
    sim.helpers.npcJobs.assign(miner, {
      kind: NPC_JOB_KIND.MINER,
      sectorId,
      route: [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 400, z: 0 } }],
      ...SHORT,
    });
    for (let i = 0; i < 20 / DT; i++) sim.step(DT);

    const hauler = sim.spawn({
      type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 80, hullMax: 80, radius: 6,
    });
    hauler.data = hauler.data || {};
    hauler.data.worldRecordId = `hauler:${sectorId}`;
    hauler.data.sectorId = sectorId;
    sim.helpers.npcJobs.assign(hauler, {
      kind: NPC_JOB_KIND.HAULER,
      sectorId,
      route: [{ id: 'origin', pos: { x: 0, z: 0 } }, { id: 'dest', pos: { x: 400, z: 0 } }],
      ...SHORT,
    });
    for (let i = 0; i < 8 / DT; i++) sim.step(DT);

    assert.equal(claimed.length, 1, `${sectorId} hauler claims the miner's lot`);
    assert.equal(claimed[0].sectorId, sectorId);
    assert.equal(claimed[0].sourceJobId, `job:miner:${sectorId}`);
    sim.dispose();
  }
});
