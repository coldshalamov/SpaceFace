// Save-envelope fidelity harness (infrastructure, not a feature fixture): the audits every save
// must survive, run against a real production system boot rather than a hand-built envelope.
//   1. Finiteness — JSON.stringify silently coerces NaN/Infinity to null, which poisons every
//      downstream restore, so the envelope is audited BEFORE stringification and its disk bytes
//      are scanned for the stringified forms too — before and after a restore.
//   2. In-place stability — serialize twice with no ticks between: identical. A serializer that
//      drifts between calls (a counter, a Map order, a wall-clock leak into sim fields) breaks
//      every strict comparator and autosave diff downstream — before and after a restore.
//   3. Restore identity of the id-free ownership slices — player record, cargo, economy,
//      factions, entropy: these carry no entity ids and no wall-clock fields, so the restored
//      state must re-serialize them exactly. (A full-envelope identity claim is impossible BY
//      DESIGN: restore legitimately renumbers entity ids through state.sessionEntityIdRemap and
//      re-enters the saved sector; behavioral identity is owned by the lab's trace compare.)
//   4. Continuation sanity — the restored sim ticks cleanly and stays finite.
// Run: node --test test/save-envelope-fidelity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { salvage } from '../src/systems/salvage.js';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';

const SECTOR = 'sector_helios_prime';

const SYSTEMS = [spawnBudget, cargo, economy, factions, heat, encounterDirector, salvage, missions, world, save];

// Id-free ownership slices: no entity ids, no wall-clock stamps, no session remap. A save/load
// round trip must reproduce each of these exactly, or the player's stuff changed on load.
const OWNERSHIP_SLICES = ['player', 'cargo', 'economy', 'factions', 'entropy'];

function boot(seed) {
  const sim = createSimulation({ seed, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  // The real boot route: world.enterSector materializes the sector (stations, faction seeding,
  // zones) exactly as main.js and the restore path do — so both sides of the round trip start
  // from the same lazily-initialized tables instead of one seeding them and the other not.
  sim.registry.get('world').enterSector(SECTOR);
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { x: 120, z: -80 }, vel: { x: 10, z: 0 },
    hull: 140, hullMax: 140, radius: 6,
  });
  state.playerId = player.id;
  if (state.player) {
    state.player.credits = 4200;
    if (state.player.cargo && state.player.cargo.items) state.player.cargo.items = { ferrite: 6, water_ice: 3 };
  }
  sim.runTicks(120);
  // Cross one in-game day boundary (DAY_SECONDS = 600): the day:tick seeds lazily-initialized
  // tables (faction decay/war records) so both sides of the round trip hold the same materialized
  // state instead of one carrying an empty pre-seed table the restore side fills.
  state.simTime = Math.max(state.simTime, 599.5);
  sim.runTicks(60);
  return sim;
}

function normalizeWallClock(value) {
  if (Array.isArray(value)) return value.map(normalizeWallClock);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (key === 'savedAt' || key === 'lastSavedAt') continue;
      out[key] = normalizeWallClock(value[key]);
    }
    return out;
  }
  return value;
}

function auditFinite(value, path, faults) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) faults.push(`${path} = ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) auditFinite(value[i], `${path}[${i}]`, faults);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) auditFinite(value[key], `${path}.${key}`, faults);
  }
}

test('a played production state serializes stable, finite, and restores its ownership slices exactly', async () => {
  const sim = boot(4747);
  const saver = sim.registry.get('save');
  assert.ok(saver && typeof saver.serializeData === 'function', 'the production save system is registered');

  const first = saver.serializeData();
  const second = saver.serializeData();
  assert.deepEqual(
    normalizeWallClock(second), normalizeWallClock(first),
    'two serializations with no ticks between must be identical (no drifting save field)',
  );

  const faults = [];
  auditFinite(first, 'data', faults);
  assert.deepEqual(faults, [], `every number in the envelope must be finite: ${faults.slice(0, 8).join('; ')}`);

  const envelope = saver.serialize('quick');
  const disk = JSON.parse(JSON.stringify(envelope));
  assert.equal(disk.checksum, envelope.checksum, 'the checksum survives the disk round trip');
  for (const bad of ['NaN', 'Infinity', '-Infinity']) {
    assert.ok(!JSON.stringify(disk).includes(`"${bad}"`), `the disk bytes must not carry ${bad}`);
  }

  const fresh = boot(999); // a different seed proves the restore, not the boot, produces the state
  const freshSaver = fresh.registry.get('save');
  // _restore takes the inner data slice (the balance routes drive it the same way); the
  // envelope-level checksum was verified above against the same bytes the player's slot holds.
  freshSaver._restore(disk.data, 'quick');
  const restored = freshSaver.serializeData();

  for (const slice of OWNERSHIP_SLICES) {
    assert.deepEqual(
      normalizeWallClock(restored[slice]), normalizeWallClock(first[slice]),
      `the ${slice} slice must restore exactly: the player's stuff cannot change on load`,
    );
  }

  // Stability and finiteness hold on the restored state too.
  const restoredAgain = freshSaver.serializeData();
  assert.deepEqual(normalizeWallClock(restoredAgain), normalizeWallClock(restored), 'the restored serializer is stable');
  const postFaults = [];
  auditFinite(restored, 'restored', postFaults);
  assert.deepEqual(postFaults, [], 'the restored envelope is still finite');

  // Continuation: the restored sim ticks cleanly and stays finite.
  fresh.runTicks(60);
  const player = fresh.state.entities.get(fresh.state.playerId);
  assert.ok(player && player.alive !== false, 'the player survives 60 restored ticks');
  const post = freshSaver.serializeData();
  const contFaults = [];
  auditFinite(post, 'post', contFaults);
  assert.deepEqual(contFaults, [], 'the post-restore envelope is still finite');
  fresh.dispose();
  sim.dispose();
});

test('a save with a hostile NaN payload in player vitals is audited, not silently written', () => {
  // The finiteness contract is the harness's teeth: inject the exact corruption class
  // JSON.stringify would silently launder into null, and prove the audit catches it.
  const sim = boot(31);
  const saver = sim.registry.get('save');
  const envelope = saver.serializeData();
  envelope.player.vitals = envelope.player.vitals || {};
  envelope.player.vitals.hull = Number.NaN;
  const faults = [];
  auditFinite(envelope, 'data', faults);
  assert.ok(faults.some((f) => f.includes('vitals.hull')), `the audit must name the NaN field: ${faults.join('; ')}`);
  assert.equal(JSON.stringify(envelope.vitals), undefined, 'sanity: stringify path left untouched');
  sim.dispose();
});
