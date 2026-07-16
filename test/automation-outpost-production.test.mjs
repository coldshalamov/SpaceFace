// Phase B1 — coarse outpost production must consume same-sector automation feedstock.
// This suite deliberately exercises the live automation owner rather than duplicating recipe math.
import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { OUTPOSTS } from '../src/data/automation.js';

const OUTPOST_BY_ID = new Map(OUTPOSTS.map((def) => [def.id, def]));

function makeBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    },
    off() {},
    emit(event, payload) {
      for (const fn of (handlers.get(event) || []).slice()) fn(payload);
    },
  };
}

function boot(seed = 0xB1) {
  const state = {
    simTime: 120,
    meta: { seed },
    playerId: 1,
    mode: 'flight',
    player: {
      credits: 100_000,
      droneTierCap: 1,
      stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200 },
      ownedShips: [],
    },
    world: { currentSectorId: 'sector_helios_prime', activeSector: null },
    entities: new Map(),
    entityList: [],
    automation: null,
  };
  const inst = Object.create(automation);
  inst.init({ state, bus: makeBus(), helpers: {}, registry: null });
  inst.newGame();
  inst._orePrice = () => 28;
  return { state, inst };
}

function addFeed(state, {
  id,
  oreType,
  buffer,
  sectorId = 'sector_helios_prime',
}) {
  const feed = {
    id,
    defId: 'drone_mk1',
    count: 1,
    sectorId,
    oreType,
    buffer,
    bufferCap: Math.max(60, buffer),
    fuel: 240,
    fuelMax: 240,
    durability: 40,
    status: 'mining',
    entityIds: [],
  };
  state.automation.drones.push(feed);
  return feed;
}

function addOutpost(state, {
  id = 'outpost_test',
  defId = 'outpost_refinery',
  sectorId = 'sector_helios_prime',
  storage = 0,
  ...overrides
} = {}) {
  const def = OUTPOST_BY_ID.get(defId) || overrides;
  const outpost = {
    id,
    defId,
    level: 1,
    sectorId,
    storage,
    storageCap: def.storageCap || 300,
    defense: def.defense || 0,
    upkeepPerMin: def.upkeepPerMin || 0,
    autoSell: false,
    raidCooldown: 0,
    status: 'producing',
    ratePerMin: 0,
    ...overrides,
  };
  state.automation.outposts.push(outpost);
  return outpost;
}

function runProduction(inst, state, dt) {
  inst._updateOutposts(dt, state.automation);
}

test('refinery with no matching input produces nothing and reports starvation', () => {
  const { state, inst } = boot();
  const outpost = addOutpost(state);

  runProduction(inst, state, 4);

  assert.equal(outpost.storage, 0, 'an empty refinery must not create alloys from nothing');
  assert.equal(outpost.status, 'starved');
  assert.equal(outpost.ratePerMin, 0, 'the displayed actual rate must agree with zero production');
});

test('refinery consumes four iron to produce two alloys at its authored 2:1 ratio', () => {
  const { state, inst } = boot();
  const iron = addFeed(state, { id: 'feed_iron', oreType: 'cmdty_ore_iron', buffer: 4 });
  const outpost = addOutpost(state);

  runProduction(inst, state, 4);

  assert.equal(outpost.storage, 2);
  assert.equal(iron.buffer, 0, 'production must debit its real automation feed source');
  assert.equal(outpost.status, 'producing');
  assert.ok(outpost.ratePerMin > 0);
});

test('an icy-field drone supplies a local Fuel Synth through the coarse off-screen network', () => {
  const { state, inst } = boot();
  const remoteSector = 'sector_frontier_remote';
  state.world.currentSectorId = remoteSector;
  state.world.activeSector = {
    fields: [{ id: 'field_remote_ice', type: 'ast_icy', center: { x: 0, z: 0 } }],
  };
  const fuelSynth = addOutpost(state, {
    id: 'outpost_remote_fuel_synth',
    defId: 'outpost_fuelsynth',
    sectorId: remoteSector,
  });

  assert.equal(inst.buyDrone('drone_mk1'), true);
  const drone = state.automation.drones[0];
  assert.equal(drone.fieldId, 'field_remote_ice');
  assert.equal(drone.oreType, 'cmdty_volatiles',
    'deployment should select the local recipe input that the authored icy field can yield');

  state.world.currentSectorId = 'sector_helios_prime';
  state.world.activeSector = null;
  inst.update(60, state);

  assert.equal(fuelSynth.storage, 42,
    'one coarse minute converts 42 of the drone\'s 48 volatile units into fuel cells');
  assert.equal(drone.buffer, 6, 'unconsumed volatiles remain in the physical drone buffer');
  assert.equal(fuelSynth.production.limitingGoodId, null);
  assert.equal(fuelSynth.status, 'producing');
});

test('common-rock deployment keeps its established iron output without a local outpost', () => {
  const { state, inst } = boot();
  state.world.activeSector = {
    fields: [{ id: 'field_common', type: 'ast_common_rock', center: { x: 0, z: 0 } }],
  };

  assert.equal(inst.buyDrone('drone_mk1'), true);
  assert.equal(state.automation.drones[0].oreType, 'cmdty_ore_iron',
    'the new resource selector must preserve the established common-rock drone behavior');
});

test('production is limited by available input and never drives a feed buffer negative', () => {
  const { state, inst } = boot();
  const iron = addFeed(state, { id: 'feed_iron', oreType: 'cmdty_ore_iron', buffer: 1 });
  const outpost = addOutpost(state);

  runProduction(inst, state, 20);

  assert.equal(outpost.storage, 0.5, 'one iron can satisfy only half of a 2:1 alloy batch');
  assert.equal(iron.buffer, 0);
  assert.ok(iron.buffer >= 0, 'input debits must clamp at zero');
});

test('an outpost never consumes matching feedstock from another sector', () => {
  const { state, inst } = boot();
  const remoteIron = addFeed(state, {
    id: 'feed_remote',
    oreType: 'cmdty_ore_iron',
    buffer: 40,
    sectorId: 'sector_frontier_remote',
  });
  const outpost = addOutpost(state, { sectorId: 'sector_helios_prime' });

  runProduction(inst, state, 4);

  assert.equal(outpost.storage, 0);
  assert.equal(outpost.status, 'starved');
  assert.equal(remoteIron.buffer, 40, 'off-sector buffers are not a teleporting inventory');
});

test('a multi-input recipe is bounded by its limiting reagent', () => {
  const { state, inst } = boot();
  const iron = addFeed(state, { id: 'feed_iron', oreType: 'cmdty_ore_iron', buffer: 8 });
  const copper = addFeed(state, { id: 'feed_copper', oreType: 'cmdty_ore_copper', buffer: 1 });
  const outpost = addOutpost(state, {
    id: 'outpost_composite',
    defId: 'outpost_composite_test',
    recipe: {
      inputs: { cmdty_ore_iron: 2, cmdty_ore_copper: 1 },
      output: { cmdty_composite_test: 1 },
    },
    outRate: 0.5,
    storageCap: 100,
  });

  runProduction(inst, state, 4);

  assert.equal(outpost.storage, 1, 'copper limits the requested two-unit output step to one');
  assert.equal(iron.buffer, 6);
  assert.equal(copper.buffer, 0);
});

test('input-free hab hub keeps its authored passive production behavior', () => {
  const { state, inst } = boot();
  const hub = addOutpost(state, { id: 'outpost_hab', defId: 'outpost_habhub' });

  runProduction(inst, state, 2);

  assert.equal(hub.storage, 24);
  assert.equal(hub.status, 'producing');
  assert.ok(hub.ratePerMin > 0);
});

test('a missing recipe fails closed instead of becoming an implicit passive generator', () => {
  const { state, inst } = boot();
  const malformed = addOutpost(state, {
    id: 'outpost_missing_recipe',
    defId: 'outpost_missing_recipe',
    outRate: 1,
    storageCap: 100,
  });

  runProduction(inst, state, 10);

  assert.equal(malformed.storage, 0);
  assert.equal(malformed.status, 'invalid_recipe');
  assert.equal(malformed.ratePerMin, 0);
});

test('shared feed allocation is deterministic for the same coarse state', () => {
  function once() {
    const { state, inst } = boot(0xD37);
    addFeed(state, { id: 'feed_iron', oreType: 'cmdty_ore_iron', buffer: 4 });
    addOutpost(state, { id: 'outpost_a' });
    addOutpost(state, { id: 'outpost_b' });
    runProduction(inst, state, 4);
    return {
      feeds: state.automation.drones.map(({ id, buffer }) => ({ id, buffer })),
      outposts: state.automation.outposts.map(({ id, storage, status }) => ({ id, storage, status })),
    };
  }

  const first = once();
  const second = once();

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    feeds: [{ id: 'feed_iron', buffer: 0 }],
    outposts: [
      { id: 'outpost_a', storage: 2, status: 'producing' },
      { id: 'outpost_b', storage: 0, status: 'starved' },
    ],
  });
});

test('off-screen drone-to-outpost throughput advances on a coarse minute cadence', () => {
  const { state, inst } = boot();
  const remoteSector = 'sector_frontier_remote';
  addFeed(state, {
    id: 'feed_remote_stream',
    oreType: 'cmdty_ore_iron',
    buffer: 0,
    sectorId: remoteSector,
  });
  const outpost = addOutpost(state, {
    id: 'outpost_remote_refinery',
    sectorId: remoteSector,
  });

  for (let second = 0; second < 59; second++) inst.update(1, state);
  assert.equal(outpost.storage, 0,
    'off-screen network nodes stay averaged between minute-cadence settlements');

  inst.update(1, state);
  assert.equal(outpost.storage, 24,
    'one coarse minute converts the streamed 48 iron into 24 alloys at the 2:1 recipe');
});

test('an off-screen drone delivers its final fuel-bounded batch before retirement', () => {
  const { state, inst } = boot();
  const remoteSector = 'sector_frontier_remote';
  const remote = addFeed(state, {
    id: 'feed_final_fuel_batch',
    oreType: 'cmdty_ore_iron',
    buffer: 0,
    sectorId: remoteSector,
  });
  remote.fuel = 60;
  const outpost = addOutpost(state, {
    id: 'outpost_final_fuel_batch',
    sectorId: remoteSector,
  });

  inst.update(60, state);

  assert.equal(outpost.storage, 24,
    'the refinery receives 48 final iron and converts it to 24 alloys before drone retirement');
  assert.equal(state.automation.drones.length, 0);
});

test('a remote outpost produces for the remainder of a cadence after raid recovery', () => {
  const { state, inst } = boot();
  const hub = addOutpost(state, {
    id: 'hub_remote_recovery',
    defId: 'outpost_habhub',
    sectorId: 'sector_frontier_remote',
    status: 'raided',
    raidCooldown: 30,
  });

  inst.update(60, state);

  assert.equal(hub.raidCooldown, 0);
  assert.equal(hub.status, 'producing');
  assert.equal(hub.storage, 360,
    'a 12/s hub blocked for 30s produces during the remaining 30s of the coarse minute');
});

for (const transition of [
  { label: 'hard', payload: { continuous: false, noTeleport: false } },
  { label: 'continuous', payload: { continuous: true, noTeleport: false } },
]) {
  test(`${transition.label} sector handoff settles the partial off-screen window against the old sector set`, () => {
    const { state, inst } = boot();
    const oldSector = 'sector_helios_prime';
    const nextSector = 'sector_frontier_remote';
    const oldHub = addOutpost(state, {
      id: `hub_old_${transition.label}`,
      defId: 'outpost_habhub',
      sectorId: oldSector,
    });
    const nextHub = addOutpost(state, {
      id: `hub_next_${transition.label}`,
      defId: 'outpost_habhub',
      sectorId: nextSector,
    });

    for (let second = 0; second < 59; second++) inst.update(1, state);
    assert.equal(oldHub.storage, 708, 'the current hub advances continuously for the first 59 seconds');
    assert.equal(nextHub.storage, 0, 'the remote hub remains averaged before the cadence boundary');
    assert.equal(state.automation.accumulators.offscreenNetworkS, 59);

    inst.bus.emit('sector:exit', { sectorId: oldSector, ...transition.payload });
    assert.equal(nextHub.storage, 708,
      'handoff flushes the old remote set instead of carrying its elapsed time into the next sector');
    assert.equal(state.automation.accumulators.offscreenNetworkS, 0);

    state.world.currentSectorId = nextSector;
    inst.bus.emit('sector:enter', { sectorId: nextSector, ...transition.payload });
    inst.update(1, state);
    assert.equal(oldHub.storage, 708,
      'one newly remote second remains pending under the coarse-minute model');
    assert.equal(nextHub.storage, 720,
      'the new current hub advances live after receiving its pre-handoff remote time');
    assert.equal(state.automation.accumulators.offscreenNetworkS, 1);

    for (let second = 0; second < 59; second++) inst.update(1, state);

    assert.equal(oldHub.storage, 1428,
      'the newly remote hub receives only the minute accumulated after the handoff');
    assert.equal(nextHub.storage, 1428,
      'the newly current hub combines its flushed remote time with one live minute');
    assert.equal(state.automation.accumulators.offscreenNetworkS, 0);
  });
}

test('an invalid saved program falls back to legacy off-screen mining and still respects its buffer cap', () => {
  const { state, inst } = boot();
  const remote = addFeed(state, {
    id: 'feed_invalid_program',
    oreType: 'cmdty_ore_iron',
    buffer: 0,
    sectorId: 'sector_frontier_remote',
  });
  remote.program = { templateId: 'missing_template_from_old_save' };

  inst.update(60, state);
  assert.equal(remote.buffer, 48);
  inst.update(60, state);
  assert.equal(remote.buffer, 60,
    'truthy but invalid program data must not bypass the authored physical buffer cap');
  assert.equal(remote.status, 'idle');
});

test('an invalid saved program remains eligible as a legacy outpost feeder', () => {
  const { state, inst } = boot();
  const remoteSector = 'sector_frontier_remote';
  const remote = addFeed(state, {
    id: 'feed_invalid_program_to_refinery',
    oreType: 'cmdty_ore_iron',
    buffer: 0,
    sectorId: remoteSector,
  });
  remote.program = { templateId: 'missing_template_from_old_save' };
  const outpost = addOutpost(state, {
    id: 'outpost_invalid_program_refinery',
    sectorId: remoteSector,
  });

  inst.update(60, state);

  assert.equal(outpost.storage, 24,
    'invalid legacy program data falls back consistently for mining and recipe feed selection');
  assert.equal(remote.buffer, 0);
  assert.equal(outpost.production.localFeeders, 1);
});

test('a valid programmed drone never runs entity-dependent alphabet steps while off-screen', () => {
  const { state, inst } = boot();
  const remote = addFeed(state, {
    id: 'feed_remote_programmed',
    oreType: 'cmdty_ore_iron',
    buffer: 7,
    sectorId: 'sector_frontier_remote',
  });
  remote.program = { templateId: 'mine_to_depot' };
  remote.programState = { pc: 0, waitT: 0, cargoWasFull: false };
  const before = {
    fuel: remote.fuel,
    buffer: remote.buffer,
    programState: structuredClone(remote.programState),
    cargo: structuredClone(state.player.cargo),
  };

  inst.update(60, state);

  assert.equal(remote.status, 'program');
  assert.equal(remote.fuel, before.fuel,
    'remote visual steering must not burn fuel without a program-aware averaged route model');
  assert.equal(remote.buffer, before.buffer);
  assert.deepEqual(remote.programState, before.programState,
    'off-screen settlement must not advance a state machine that depends on live beacons/entities');
  assert.deepEqual(state.player.cargo, before.cargo,
    'remote programs cannot mutate the current-sector player cargo as a stand-in for logistics');
});
