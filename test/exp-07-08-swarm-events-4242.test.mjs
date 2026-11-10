// EXP-07 / EXP-08: six swarm cards, copied from named donors, played by the live director.
// Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SWARM_EVENT_BY_ID,
  SWARM_EVENT_TABLES,
  swarmEventFor,
  validateSwarmEvents,
} from '../src/data/swarmEvents.js';
import {
  createSwarmEventDirector,
  swarmEventFrame,
} from '../src/systems/swarmEvents.js';
import { planArenaInstall } from '../src/systems/survivalArena.js';

const SEED = 4242;

function keyset(value) {
  return Object.keys(value || {}).sort();
}

function waveFor(arenaId, eventId) {
  for (let wave = 1; wave <= 400; wave++) {
    const draw = swarmEventFor({ arenaId, wave, seed: SEED });
    if (draw && draw.id === eventId) return wave;
  }
  return null;
}

function play(arenaId, eventId) {
  const wave = waveFor(arenaId, eventId);
  assert.ok(wave, `${eventId} is drawn for seed ${SEED} in ${arenaId}`);
  const alerts = [];
  const mineRequests = [];
  const bus = {
    on(event, handler) {
      bus._subs.push([event, handler]);
      return () => {};
    },
    emit(event, payload) {
      if (event === 'alert') alerts.push(payload);
      if (event === 'mines:placeRequest') mineRequests.push(payload);
    },
    _subs: [],
  };
  const registered = [];
  const writes = [];
  const spawned = [];
  const fields = {
    updateExternal(id, patch) {
      writes.push({ id, ...patch });
      return { id };
    },
    unregisterExternal() { return true; },
    registerEnvironmental(spec) {
      registered.push(spec);
      return spec;
    },
  };
  const state = {
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, { id: 1, team: 1, pos: { x: 40, z: -15 } }]]),
    run: {
      kind: 'survival',
      ruleset: 'swarm',
      phase: 'active',
      arenaId,
      wave,
      seed: SEED,
    },
  };
  const director = createSwarmEventDirector({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        spawned.push(spec);
        return { id: 'pod-1' };
      },
    },
    registry: { get: (name) => (name === 'fields' ? fields : null) },
  });
  director.init();
  director.setFrame(swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: 'front', seed: SEED, wave }));
  director.setInstalledFields([{ id: 'room_field', strength: 40 }]);
  bus.emit('run:waveStarted', { wave });
  for (const [event, handler] of bus._subs) {
    if (event === 'run:waveStarted') handler({ wave });
  }
  const card = SWARM_EVENT_BY_ID[eventId];
  state.simTime = card.windupS + 0.5;
  director.update(0.016, state);
  return { alerts, mineRequests, registered, writes, spawned, card };
}

test('seed 4242: rock rain, slag spill, and lantern drift use their donors and play', () => {
  assert.deepEqual(validateSwarmEvents(), []);
  const rock = SWARM_EVENT_BY_ID.rock_rain;
  const plate = SWARM_EVENT_BY_ID.plate_drift;
  assert.equal(rock.kind, 'surge');
  assert.equal(rock.telegraph, 'ROCK RAIN — catch what you can, throw what you catch');
  assert.deepEqual(keyset(rock.install), keyset(plate.install));
  assert.deepEqual(keyset(rock.install.fields[0]), keyset(plate.install.fields[0]));
  assert.ok(SWARM_EVENT_TABLES.asteroid_mill.includes('rock_rain'));

  const slag = SWARM_EVENT_BY_ID.slag_spill;
  const furnace = SWARM_EVENT_BY_ID.furnace_flare;
  assert.equal(slag.kind, 'surge');
  assert.equal(slag.telegraph, 'SLAG SPILL — the floor runs hot, and so does anything you throw through it');
  assert.deepEqual(keyset(slag.install), keyset(furnace.install));
  assert.deepEqual(keyset(slag.install.fields[0]), keyset(furnace.install.fields[0]));
  assert.ok(SWARM_EVENT_TABLES.cinder_sluice.includes('slag_spill'));

  const lantern = SWARM_EVENT_BY_ID.lantern_drift;
  const eggs = SWARM_EVENT_BY_ID.egg_drift;
  assert.equal(lantern.kind, 'mines');
  assert.equal(lantern.count, eggs.count);
  assert.equal(lantern.windowS, eggs.windowS);
  assert.equal(lantern.install, undefined);
  assert.equal(lantern.telegraph, "LANTERN DRIFT — they want your heat. Give them someone else's.");
  assert.ok(SWARM_EVENT_TABLES.the_hive.includes('lantern_drift'));

  // The mill's flood phase keeps one field slot free, so the rain's well actually lands.
  const rainArgs = {
    arenaId: 'asteroid_mill',
    arenaPhase: 'shutter_lane_close',
    wave: 5,
    seed: SEED,
    anchor: { x: 12, z: -8 },
    laneGate: 'front',
  };
  const plainMill = planArenaInstall(rainArgs);
  const rainRoom = planArenaInstall({ ...rainArgs, swarmEvent: rock });
  assert.equal(rainRoom.cover, true);
  assert.equal(rainRoom.fields.length, plainMill.fields.length + 1);
  assert.ok(rainRoom.fields.some((field) => field.kind === 'well' && field.strength === 70));

  const slagRoom = planArenaInstall({
    arenaId: 'cinder_sluice',
    arenaPhase: 'idle',
    wave: 5,
    seed: SEED,
    anchor: { x: 0, z: 0 },
    laneGate: 'front',
    swarmEvent: slag,
  });
  assert.ok(slagRoom.fields.some((field) => field.kind === 'repulsor' && field.strength === 170));

  const rain = play('asteroid_mill', 'rock_rain');
  assert.ok(rain.alerts.some((alert) => alert.text === rock.telegraph));
  assert.ok(rain.writes.some((write) => write.id === 'room_field' && write.strength === 40 * rock.factor));

  const spill = play('cinder_sluice', 'slag_spill');
  assert.ok(spill.alerts.some((alert) => alert.text === slag.telegraph));
  assert.ok(spill.writes.some((write) => write.strength === 40 * slag.factor));

  const drift = play('the_hive', 'lantern_drift');
  assert.ok(drift.alerts.some((alert) => alert.text === lantern.telegraph));
  assert.equal(drift.mineRequests.length, lantern.count);
});

test('seed 4242: reef surge, shepherd pulse, and Sprocket\'s crate use their donors and play', () => {
  const reef = SWARM_EVENT_BY_ID.reef_surge;
  const undertow = SWARM_EVENT_BY_ID.undertow_snap;
  assert.equal(reef.kind, 'pulse');
  assert.equal(reef.telegraph, 'REEF SURGE — the room moves. Let it throw for you.');
  assert.deepEqual(keyset(reef.field), keyset(undertow.field));
  assert.ok(SWARM_EVENT_TABLES.storm_lattice.includes('reef_surge'));

  const shepherd = SWARM_EVENT_BY_ID.shepherd_pulse;
  const relay = SWARM_EVENT_BY_ID.relay_arc;
  assert.equal(shepherd.kind, 'pulse');
  assert.equal(shepherd.telegraph, 'SHEPHERD PULSE — they fly as one. Break the one.');
  assert.deepEqual(keyset(shepherd.field), keyset(relay.field));
  assert.ok(SWARM_EVENT_TABLES.the_hive.includes('shepherd_pulse'));

  const crate = SWARM_EVENT_BY_ID.sprocket_crate;
  const drop = SWARM_EVENT_BY_ID.supply_drop;
  assert.equal(crate.kind, 'supply');
  assert.equal(crate.telegraph, 'MA SPROCKET SENDS A CRATE — catch it before they do.');
  assert.deepEqual(keyset(crate), keyset(drop));
  assert.ok(SWARM_EVENT_TABLES.helios_core.includes('sprocket_crate'));

  const reefPlay = play('storm_lattice', 'reef_surge');
  assert.ok(reefPlay.alerts.some((alert) => alert.text === reef.telegraph));
  assert.ok(reefPlay.registered.some((field) => field.kind === 'well' && field.strength === reef.field.strength));

  const pulse = play('the_hive', 'shepherd_pulse');
  assert.ok(pulse.registered.some((field) => field.kind === 'repulsor' && field.strength === shepherd.field.strength));

  const supply = play('helios_core', 'sprocket_crate');
  assert.equal(supply.spawned[0].data.amount, crate.credits);
  assert.equal(supply.spawned[0].data.kind, 'swarm_supply_pod');
});
