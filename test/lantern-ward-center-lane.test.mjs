import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';
import { lanternWardCompletionReceipt, lanternWardStatus, restoreLanternWard } from '../src/systems/lanternWardWork.js';
import {
  LANTERN_WARD_RECORD_IDS as IDS, LANTERN_WARD_LAMP_SERIAL as SERIAL, lanternWardHardwareSpec,
} from '../src/data/lanternWardHardware.js';
import { LANTERN_WARD_BODY_CONTRACTS as C, lanternWardPoint } from '../src/data/lanternWardLayout.js';
import { lanternWardSceneryProxy } from '../src/world/lanternWardDressing.js';
import { lanternWardActorSpec } from '../src/world/lanternWardActors.js';

const SECTOR = 'sector_helios_prime', anchor = { x: 1680, z: -820 };

async function nativeHarness(seed, mastPose, resumed = false) {
  const state = createGameState(seed); state.mode = 'flight'; state.world.currentSectorId = SECTOR;
  const recordOwner = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const modules = { flightSlot: flightV3, physics, combat, npcJobsRuntime, spawnBudget, world: recordOwner };
  const sim = createSimulation({ state, seed,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]),
  });
  const player = sim.spawn({ type: 'ship', team: 0, alive: true, isPlayer: true,
    pos: { x: 1590, z: -520 }, vel: { x: 0, z: 0 }, radius: 12, mass: 100,
    hull: 100, hullMax: 100, flags: { persistent: true }, data: {} });
  state.playerId = player.id;
  // Arrange an already displaced ORIGINAL before native admission. No job phase,
  // claim of player help, collision rule or service result is changed by the fixture.
  const mast = sim.spawn({ ...lanternWardHardwareSpec('obstruction'), ...mastPose });
  if (resumed) {
    sim.spawn({ ...lanternWardHardwareSpec('cradle'), pos: { x: 1769, z: -650 }, rot: 0 });
    sim.spawn({ ...lanternWardHardwareSpec('lamp'), pos: { x: 1769, z: -650 }, rot: 0 });
    sim.spawn({ ...lanternWardActorSpec('tug', anchor), pos: { x: 1795, z: -644 }, rot: 1.217 });
  }
  for (const key of ['serviceCutNorth', 'serviceCutSouth']) {
    sim.spawn({ type: 'payload', alive: true, team: 2, pos: lanternWardPoint(anchor, key),
      vel: { x: 0, z: 0 }, radius: C.service_cheek.radius, mass: 1e6, hull: 1e6,
      collides: true, physicsBody: { schemaVersion: 1, dynamic: false,
        mass: 1e6, radius: C.service_cheek.radius, shape: 'compound', material: 'prop',
        collisionProxyManifest: lanternWardSceneryProxy('service_cheek') }, data: {} });
  }
  await sim.registry.get('physics').prepareBackend(state);
  const owner = sim.registry.get('npcJobsRuntime'), events = [];
  if (resumed) restoreLanternWard(owner, { version: 1, initialized: true,
    objects: Object.fromEntries(Object.entries(IDS).map(([role, recordId]) => [role,
      { recordId, spawned: ['cradle', 'lamp', 'tug', 'obstruction'].includes(role), lost: false }])),
    clearanceLane: 0, tugRouteMode: 'cut', tugRouteStage: 2, cradleRouteStage: 1 });
  sim.bus.on('lanternWard:serviceCommitted', e => events.push(e));
  const actor = role => state.entityList.find(e => e.alive && e.data?.worldRecordId === IDS[role]);
  const run = count => { for (let i = 0; i < count; i++) sim.step(); };
  run(10);
  return { sim, state, owner, player, mast, actor, events, run };
}

test('an ambiently cleared center lane installs the original without parking its operator in the load path', async () => {
  const h = await nativeHarness(7407, { pos: { x: 2050, z: -550 }, rot: Math.PI / 2 });
  try {
    const cradle = h.actor('cradle'), lamp = h.actor('lamp'), tug = h.actor('tug');
    assert.equal(h.actor('obstruction'), h.mast);
    assert.equal(h.state.npcJobs.lanternWard.clearanceLane, 0);
    assert.equal(lanternWardStatus(h.owner).blocked, false);
    assert.equal(lamp.data.lanternWardCustody.holder, 'cradle');
    for (let i = 0; i < 10800 && !h.events.length; i++) h.sim.step();
    const status = lanternWardStatus(h.owner);
    console.log('LANTERN_CENTER_LANE', JSON.stringify({ tick: h.state.tick, simTime: h.state.simTime,
      phase: status.phase, lane: h.state.npcJobs.lanternWard.clearanceLane,
      cradle: { pos: cradle.pos, vel: cradle.vel }, tug: { pos: tug.pos, vel: tug.vel }, lamp: lamp.pos }));
    assert.equal(status.installed, true, 'a genuinely clear route must not deadlock on its own attending operator');
    assert.equal(h.actor('cradle'), cradle); assert.equal(h.actor('lamp'), lamp); assert.equal(h.actor('tug'), tug);
    assert.equal(lamp.data.lanternWardSerial, SERIAL);
    assert.equal(lamp.data.lanternWardCustody.holder, 'receiver');
    assert.equal(lamp.data.lanternWardLit, true);
    assert.equal(cradle.data.lanternWardClamp01, 0);
    assert.equal(cradle.data.lanternWardCustody.loadSerial, undefined);
    assert.equal(h.events.length, 1);
    const receipt = lanternWardCompletionReceipt(h.owner, h.events[0].receiptId);
    assert.equal(receipt.playerHelped, false, 'ambient clearance cannot claim a player service');
    assert.equal(receipt.method, 'crew_installation');
    assert.equal(receipt.lampSerial, SERIAL);
    const home = { x: 1670, z: -622 };
    for (let i = 0; i < 7200 && Math.hypot(tug.pos.x - home.x, tug.pos.z - home.z) >= 4; i++) h.sim.step();
    assert.ok(Math.hypot(tug.pos.x - home.x, tug.pos.z - home.z) < 4, 'Nessa returns empty through native flight');
    assert.equal(h.events.length, 1);
    assert.equal(lamp.data.lanternWardCustody.holder, 'receiver');
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === IDS.lamp).length, 1);
  } finally { h.sim.dispose(); }
});

test('a continued center-lane jam moves its already waiting operator clear and resumes the same load', async () => {
  const h = await nativeHarness(7417, { pos: { x: 2050, z: -550 }, rot: Math.PI / 2 }, true);
  try {
    const cradle = h.actor('cradle'), lamp = h.actor('lamp'), tug = h.actor('tug');
    for (let i = 0; i < 10800 && !h.events.length; i++) h.sim.step();
    const status = lanternWardStatus(h.owner);
    console.log('LANTERN_CONTINUED_CENTER_LANE', JSON.stringify({ tick: h.state.tick, simTime: h.state.simTime,
      phase: status.phase, lane: h.state.npcJobs.lanternWard.clearanceLane,
      cradle: { pos: cradle.pos, vel: cradle.vel }, tug: { pos: tug.pos, vel: tug.vel }, lamp: lamp.pos }));
    assert.equal(status.installed, true, 'the already parked original must release the actual load path');
    assert.equal(h.actor('cradle'), cradle); assert.equal(h.actor('lamp'), lamp); assert.equal(h.actor('tug'), tug);
    assert.equal(h.events.length, 1);
    assert.equal(lamp.data.lanternWardCustody.holder, 'receiver');
    assert.equal(lamp.data.lanternWardLit, true);
    assert.equal(cradle.data.lanternWardClamp01, 0);
    assert.equal(lanternWardCompletionReceipt(h.owner, h.events[0].receiptId).playerHelped, false);
  } finally { h.sim.dispose(); }
});

for (const lane of [-22, 22]) {
  test(`the ${lane} WU side lane keeps the service stand clear of its native loaded route`, async () => {
    // A horizontal fallen mast still crosses the center and the other side;
    // the only selected route passes its real 58 WU body with normal clearance.
    const mastPose = { pos: { x: 1775, z: -650 - Math.sign(lane) * 20 }, rot: 0 };
    const h = await nativeHarness(7420 + lane, mastPose);
    try {
      const lamp = h.actor('lamp'), cradle = h.actor('cradle');
      assert.equal(h.state.npcJobs.lanternWard.clearanceLane, lane);
      assert.equal(lanternWardStatus(h.owner).blocked, false);
      for (let i = 0; i < 10800 && !h.events.length; i++) h.sim.step();
      const status = lanternWardStatus(h.owner);
      console.log('LANTERN_SIDE_LANE', JSON.stringify({ lane, tick: h.state.tick, simTime: h.state.simTime,
        phase: status.phase, cradle: cradle.pos, tug: h.actor('tug').pos, mast: h.mast.pos, lamp: lamp.pos }));
      assert.equal(status.installed, true);
      assert.equal(h.actor('lamp'), lamp); assert.equal(h.actor('cradle'), cradle);
      assert.equal(h.events.length, 1);
      assert.equal(lamp.data.lanternWardCustody.holder, 'receiver');
      assert.equal(lamp.data.lanternWardLit, true);
      assert.equal(cradle.data.lanternWardClamp01, 0);
      assert.equal(lanternWardCompletionReceipt(h.owner, h.events[0].receiptId).playerHelped, false);
    } finally { h.sim.dispose(); }
  });
}
