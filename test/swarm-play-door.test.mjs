// The Swarm front's PLAY (04_SWARM.md §1, §5, §7): one press reaches round 1 in flight with the
// chosen hull, its free starting gun fitted, zero Scrap and the room's Course seed — through the
// ordinary New Game route the setup screen uses, never a side channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBus } from '../src/core/eventBus.js';
import {
  buildSwarmAgainRequest, clearCrucibleSetup, crucibleHullChoices, lastSwarmDoorPick, rememberSwarmDoorPick,
  requestCrucibleRun, swarmDoorGunFor, swarmOpeningGuns, swarmPlaySetup, swarmQuickStartSetup,
  SWARM_OPENING_GUN_LINES,
} from '../src/ui/crucibleLaunch.js';
import { swarmArcadeSeedFor } from '../src/data/swarmLadder.js';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test('every hull the front offers has the three free starting guns, in one stable order with one line each', () => {
  for (const choice of crucibleHullChoices().filter((c) => c.earned)) {
    const guns = swarmOpeningGuns(choice.hullId);
    assert.deepEqual(guns.map((g) => g.defId), Object.keys(SWARM_OPENING_GUN_LINES), choice.hullId);
    for (const gun of guns) {
      assert.ok(gun.offerId && Number.isInteger(gun.slotIndex), `${choice.hullId} ${gun.defId}`);
      assert.ok(gun.line.split(/\s+/).length <= 8, `one short line: ${gun.line}`);
    }
  }
  assert.deepEqual(swarmOpeningGuns('no_such_hull'), []);
});

test('the front remembers room, hull and the gun per hull; unknown ids fall back', () => {
  const prior = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    assert.deepEqual(lastSwarmDoorPick(), { arenaId: null, hullId: null, guns: {} });
    rememberSwarmDoorPick({ arenaId: 'ceres_belt', hullId: 'ship_atlas', gunDefId: 'wpn_concussion_cannon_s' });
    rememberSwarmDoorPick({ hullId: 'ship_wasp', gunDefId: 'wpn_pulse_laser_s' });
    const pick = lastSwarmDoorPick();
    assert.equal(pick.arenaId, 'ceres_belt');
    assert.equal(pick.hullId, 'ship_wasp');
    assert.equal(swarmDoorGunFor('ship_atlas', pick).defId, 'wpn_concussion_cannon_s');
    assert.equal(swarmDoorGunFor('ship_wasp', pick).defId, 'wpn_pulse_laser_s');
    assert.equal(swarmDoorGunFor('ship_hornet', pick).defId, 'wpn_autocannon_s', 'a hull never flown gets the default');
    globalThis.localStorage.setItem('sf.swarm.doorPick.v1', JSON.stringify({ arenaId: 'nowhere', hullId: 'ship_saucer' }));
    assert.deepEqual(lastSwarmDoorPick(), { arenaId: null, hullId: null, guns: {} }, 'an unearned hull is not remembered');
    // The title press and PLAY fly the same run.
    rememberSwarmDoorPick({ arenaId: 'helios_core', hullId: 'ship_mule', gunDefId: 'wpn_pulse_laser_s' });
    const quick = swarmQuickStartSetup({ previous: null, stake: 'veteran' });
    assert.equal(quick.hullId, 'ship_mule');
    assert.deepEqual(quick.loadout, []);
    assert.equal(quick.zeroScrapOpening, true);
    assert.equal(quick.retryOpeningEquipment.gun.defId, 'wpn_pulse_laser_s');
    assert.equal(quick.swarmStake, 'veteran');
    assert.equal(quick.seed, swarmArcadeSeedFor('helios_core'), 'a ladder room plays its Course');
  } finally { globalThis.localStorage = prior; }
});

test('Again replays the Course on a ladder run and deals a fresh layout off it', () => {
  clearCrucibleSetup();
  const bus = createBus();
  const ladder = swarmPlaySetup({ arenaId: 'helios_core', hullId: 'ship_hornet' });
  assert.equal(requestCrucibleRun(bus, ladder, 'swarm'), true);
  const course = buildSwarmAgainRequest(null);
  assert.equal(course.setup.seed, ladder.seed);
  assert.equal(course.sameSeed, null, 'the Course has nothing to offer as a second seed');
  const side = swarmPlaySetup({ arenaId: 'ceres_belt', hullId: 'ship_hornet' });
  assert.equal(swarmArcadeSeedFor('ceres_belt'), null);
  assert.equal(requestCrucibleRun(bus, side, 'swarm'), true);
  const fresh = buildSwarmAgainRequest(null);
  assert.notEqual(fresh.setup.seed, side.seed, 'a side room deals a fresh layout');
  assert.equal(fresh.sameSeed.setup.seed, side.seed, 'and still offers the exact replay');
  clearCrucibleSetup();
});

test('PLAY boots round 1 in flight: chosen hull, its free gun fitted, zero Scrap, no armory', async () => {
  for (const [hullId, gunDefId] of [['ship_hornet', 'wpn_concussion_cannon_s'], ['ship_colossus', 'wpn_pulse_laser_s']]) {
    const bus = createBus(); let opts;
    bus.on('game:new', (value) => { opts = structuredClone(value); });
    const setup = swarmPlaySetup({ arenaId: 'helios_core', hullId, gunDefId, stake: 'contender' });
    assert.ok(setup, hullId);
    assert.equal(setup.seed, swarmArcadeSeedFor('helios_core'));
    assert.equal(requestCrucibleRun(bus, setup, 'swarm'), true);
    assert.equal(opts.crucibleSetup.zeroScrapOpening, true);
    const lane = createSimHost();
    try {
      const init = await lane.init({ profile: 'production', seed: 4242,
        scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
      const { state } = lane.host;
      const ring = createSimCommandRing();
      pushLaneCommand(ring, { kind: 'mode', mode: 'loading' });
      pushLaneCommand(ring, { kind: 'rpc', id: 'play', op: 'newGameBoot', args: { opts } });
      const reply = await lane.tick({ tick: 1, steps: 0, ackEnd: init.initRebuild?.end ?? 0, commands: structuredClone(ring.drain()) });
      const ack = reply.rpcAcks.find((row) => row.id === 'play');
      assert.equal(ack.ok, true, JSON.stringify(ack));
      assert.notEqual(state.run.phase, 'draft', `${hullId}: PLAY never stops in the armory`);
      assert.ok(['arena_intro', 'wave_intro', 'active'].includes(state.run.phase), `${hullId}: ${state.run.phase}`);
      assert.equal(state.run.credits, 0, 'every run starts at zero Scrap');
      assert.equal(state.run.telemetry.zeroScrapOpening, true, 'rounds pay the floor budget');
      const hull = state.player.ownedShips[state.player.activeShipIndex];
      assert.equal(hull.defId, hullId);
      assert.deepEqual(hull.fittings.filter(Boolean), [gunDefId], 'exactly the chosen gun, fitted before round 1');
      assert.equal(state.entities.get(state.playerId).data.weapons.length, 1);
      assert.ok(state.run.modifiers.some((row) => row.startingEquipment && row.defId === gunDefId));
    } finally { lane.shutdown(); }
  }
});
