// INF-world — the default route's authored character survives her own boot.
//
// The Cinder Run Courier is authored as a deterministic fixture of the start sector
// (traffic.js _ensureCinderRunCourierFixture: "the default route always has its
// far-too-fast courier"). On a fresh boot the sector entry point sits ~1,500 wu from the
// Helios pocket, so the far-actor sweep shelves her the same tick she mints; the enter's
// roster rebuilds drop her record, and the lean far row keeps only data.ai. Before this
// fix she promoted as an anonymous, recordless, motionless hull — the home lane's one
// authored face, crossed as nobody.
//
// Pins, on seed 4242 through the real enter → step → shelve → promote path:
//   1. The fixture mints her named at enter (pre-condition).
//   2. The boot race is real: she shelves on the first far-actor ticks (regression context).
//   3. After the record drop + player approach, she promotes NAMED
//      (namedLaneContactId / name / callsign re-stamped from the durable ai record).
//   4. She promotes TRACKED (a live roster record) and FLIES again (the stepper owns her).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { fields } from '../src/systems/fields.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';

const SEED = 4242;
const HELIOS = 'sector_helios_prime';
const COURIER_CONTACT_ID = 'lane_cinder_run_courier';

function boot() {
  const sim = createSimulation({
    seed: SEED,
    systems: [world, npcJobsRuntime, traffic, fields, flightV3, physics],
    helpers: {},
  });
  const state = sim.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  // Production boot order (main.js bootstrapScene): player spawns, then enterSector places
  // them at the sector entry point — in flight, far from the Helios pocket.
  const player = sim.spawn({
    type: 'ship', isPlayer: true, team: 0,
    pos: { x: 1220, z: -380 }, radius: 6, hull: 100, hullMax: 100,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(HELIOS);
  return { sim, state, player };
}

function step(h, seconds) {
  const steps = Math.ceil(seconds / SIM_DT);
  for (let i = 0; i < steps; i += 1) h.sim.step();
}

function liveExpress(h) {
  return h.state.entityList.find((e) => e && e.alive && e.type === 'ship' && !e.isPlayer
    && e.data && e.data.trafficRole === 'express') || null;
}

function expressContactEntity(h) {
  return h.state.entityList.find((e) => e && e.alive && e.type === 'ship' && !e.isPlayer
    && e.data && e.data.namedLaneContactId === COURIER_CONTACT_ID) || null;
}

test('Cinder Run Courier: fixture mints her named, the boot shelves her, promote restores name, record and motion', async () => {
  const h = boot();
  const shelved = [];
  h.sim.bus.on('world:farActorShelved', (p) => { if (p && p.trafficRole === 'express') shelved.push({ ...p }); });
  let restored = null;
  h.sim.bus.on('world:farActorRestored', (p) => { if (p && p.trafficRole === 'express') restored = { ...p }; });

  // 1. Fixture pre-condition: she mints on the default route, already carrying her name.
  const minted = expressContactEntity(h) || liveExpress(h);
  assert.ok(minted, 'the courier fixture must mint an express hull at Helios enter');
  assert.equal(minted.data.namedLaneContactId, COURIER_CONTACT_ID,
    'fixture stamps the authored contact before any shelving');
  assert.equal(minted.data.name, 'The Cinder Run Courier');
  const mintedId = minted.id;
  const mintedPos = { x: minted.pos.x, z: minted.pos.z };

  await h.sim.registry.get('physics').prepareBackend(h.state);

  // 2. The boot race: player sits at the entry point, she is pocket-side — the first
  //    far-actor ticks shelve her (production flow, not a forced call).
  step(h, 2);
  const rowAfterBoot = h.state.world.farActors && h.state.world.farActors.rows
    ? h.state.world.farActors.rows.find((r) => r.trafficRole === 'express') : null;
  assert.ok(shelved.length >= 1 || rowAfterBoot,
    'boot must shelve the pocket-side courier while the pilot is at the entry point');
  assert.ok(!expressContactEntity(h) && !liveExpress(h),
    'she is not live right after the boot shelve');

  // 3. The enter race drops her roster record (observed on the live route); model it
  //    deterministically so the promote path is exercised whatever raced it this boot.
  const list = h.state.traffic.freighters;
  const hadRecord = list.some((r) => r && (r.id === mintedId || r.farActorId === mintedId));
  h.state.traffic.freighters = list.filter((r) => !(r && (r.id === mintedId || r.farActorId === mintedId)));

  // 4. The player flies the corridor toward the pocket — the standard first flight.
  const dx = mintedPos.x - h.player.pos.x;
  const dz = mintedPos.z - h.player.pos.z;
  const dist = Math.max(1, Math.hypot(dx, dz));
  // Close to scanner range of her shelved position: the promote-on-approach window.
  const stopAt = 0.9;
  h.player.pos.x += dx * stopAt;
  h.player.pos.z += dz * stopAt;
  for (let s = 0; s < Math.ceil(10 / SIM_DT) && !liveExpress(h); s += 1) h.sim.step();

  // 5. She promoted — named, tracked, and moving again.
  const promoted = liveExpress(h);
  assert.ok(promoted, 'approach must promote the shelved courier');
  assert.equal(promoted.data.namedLaneContactId, COURIER_CONTACT_ID,
    'promote re-stamps the contact identity from the durable ai record');
  assert.equal(expressContactEntity(h), promoted, 'the named contact IS the promoted hull');
  assert.equal(promoted.data.name, 'The Cinder Run Courier', 'name restored on promote');
  assert.equal(promoted.data.callsign, 'CINDER-RUN', 'callsign restored on promote');
  assert.ok(h.state.traffic.freighters.some((r) => r && r.id === promoted.id),
    'promote re-tracks her with a live roster record (motion/freight owner)');
  assert.ok(!hadRecord || restored, 'the restore event fired for the recordless promote');

  const promotePos = { x: promoted.pos.x, z: promoted.pos.z };
  step(h, 8);
  const flown = Math.hypot(promoted.pos.x - promotePos.x, promoted.pos.z - promotePos.z);
  const speed = Math.hypot(promoted.vel ? promoted.vel.x : 0, promoted.vel ? promoted.vel.z : 0);
  assert.ok(flown > 10 || speed > 3,
    `a re-tracked courier must fly her route again (flown=${flown.toFixed(1)}wu v=${speed.toFixed(1)})`);
});

test('Cinder Run Courier: a shelved row and a re-minted fixture promote into ONE named courier', async () => {
  const h = boot();
  await h.sim.registry.get('physics').prepareBackend(h.state);

  // Boot race: she shelves pocket-side while the pilot sits at the entry point.
  step(h, 2);
  assert.ok(!liveExpress(h), 'pre-condition: the first courier shelved at boot');

  // Leave WITHOUT approaching the pocket — the far row persists (resetFarActors is a
  // fresh-run-reset seam only), so she crosses the switch as a shelved identity.
  h.sim.registry.get('world').enterSector('sector_ceres_belt');
  step(h, 1);
  h.sim.registry.get('world').enterSector(HELIOS);
  step(h, 2);
  const table = h.state.world.farActors;
  const expressRows = table && Array.isArray(table.rows)
    ? table.rows.filter((r) => r && r.alive !== false && r.trafficRole === 'express') : [];
  assert.ok(!liveExpress(h) && !expressContactEntity(h),
    'pre-condition: re-enter re-mints her pocket-side and the boot geometry shelves her again');
  assert.ok(expressRows.length >= 2,
    `the round trip must leave two shelved express rows (got ${expressRows.length})`);

  // Approach the pocket — both rows promote in the same pass.
  h.player.pos.x = 1280; h.player.pos.z = -420;
  for (let s = 0; s < Math.ceil(10 / SIM_DT); s += 1) {
    h.sim.step();
    const live = h.state.entityList.filter((e) => e && e.alive && e.type === 'ship' && !e.isPlayer
      && e.data && e.data.trafficRole === 'express');
    if (live.length >= 2) break;
  }
  const promotedExpress = h.state.entityList.filter((e) => e && e.alive && e.type === 'ship'
    && !e.isPlayer && e.data && e.data.trafficRole === 'express');
  assert.ok(promotedExpress.length >= 2,
    `both shelved rows must promote on approach (got ${promotedExpress.length})`);

  // The pin: exactly one live hull wears the contact's face.
  const holders = h.state.entityList.filter((e) => e && e.alive && e.type === 'ship' && !e.isPlayer
    && e.data && e.data.namedLaneContactId === COURIER_CONTACT_ID);
  assert.equal(holders.length, 1,
    `exactly one live courier may hold ${COURIER_CONTACT_ID} (got ${holders.length})`);
  assert.equal(holders[0].data.name, 'The Cinder Run Courier');
  assert.ok(h.state.traffic.freighters.some((r) => r && promotedExpress.some((e) => e.id === r.id)),
    'every promoted courier is re-tracked with a live roster record');
});
