// SEED-SW-02 — a full chain opens one overdrive window. Fitted guns fire about
// three times as fast while that chain holds, and the window dies with the chain.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { runSession } from '../src/systems/runSession.js';
import { buildSlotList, makeShipEntitySpec } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import {
  SWARM_CHAIN_OVERDRIVE_RATE,
  SWARM_CHAIN_SCORE_CAP,
  SWARM_CHAIN_WINDOW_S,
  swarmChain,
  swarmChainFireRateScale,
} from '../src/systems/swarmChain.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { weapons } from '../src/systems/weapons.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const SEED = 4242;
const DT = 1 / 60;
const TICKS = 120;
const GUN = 'wpn_pulse_laser_s';

function rebuildIndex(state) {
  state.entityList = [...state.entities.values()];
  state.entityIndex = {
    ships: state.entityList.filter((entity) => entity.type === 'ship'),
    weaponShips: state.entityList.filter((entity) => entity.type === 'ship' && entity.data?.weapons),
  };
}

function boot() {
  const state = createGameState(SEED);
  assert.equal(state.meta.seed, SEED);
  assert.equal(typeof state.rng, 'function');
  state.simTime = 0;
  state.rng();
  state.runtime = Object.freeze({
    ...(state.runtime || {}),
    profileId: 'production',
    features: PRODUCTION_FEATURES,
  });
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;
  state.input.fire = true;
  state.input.aimAngle = 0;

  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity: (spec) => {
      const entity = {
        id: state.nextEntityId++,
        alive: true,
        flags: {},
        collides: true,
        vel: { x: 0, z: 0 },
        ...spec,
      };
      entity.pos ||= { x: 0, z: 0 };
      entity.data ||= {};
      state.entities.set(entity.id, entity);
      rebuildIndex(state);
      return entity;
    },
    despawnEntity: (id) => {
      state.entities.delete(id);
      rebuildIndex(state);
    },
    hash32,
    mulberry32,
  };

  const hull = SHIPS.find((ship) => ship.id === 'ship_kestrel');
  const fittings = new Array(buildSlotList(hull).length).fill(null);
  fittings[0] = GUN;
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings,
  }));
  state.playerId = player.id;
  const gun = player.data.weapons.find((mount) => mount.defId === GUN);
  gun.heatMax = 1e6;

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  swarmChain.init(ctx);
  const weaponSystem = { ...weapons };
  weaponSystem.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = 3;
  noteSwarmPilotAction(state);
  return { state, bus, emitted, player, gun, weaponSystem };
}

let victimTag = 0;
function kill(h) {
  const id = h.state.nextEntityId++;
  const victim = {
    id,
    alive: true,
    type: 'ship',
    pos: { x: 10, z: 10 },
    data: { runCohort: SURVIVAL_COHORT_TAG, tag: victimTag++ },
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id,
    killerId: h.state.playerId,
    type: 'ship',
    pos: { x: 10, z: 10 },
    presentation: { cause: 'direct' },
  });
}

function raise(h, count) {
  for (let i = 0; i < count; i++) {
    kill(h);
    h.state.simTime += 0.02;
  }
}

function overdriveOpens(h) {
  return h.emitted.filter((row) => row.event === 'swarm:overdrive' && row.payload && row.payload.active === true);
}

function tape(h) {
  // The combat kernel claims the hull on first service and syncs cap to capMax —
  // take that bound before the tape inflates the pool, not inside it.
  h.weaponSystem.update(DT, h.state);
  h.state.tick += 1;
  h.state.simTime += DT;
  h.gun._cooldown = 0;
  h.gun._heat = 0;
  h.gun.heatMax = 1e6;
  h.player.cap = 100000;
  if (h.player.data) h.player.data.weaponVentUntil = 0;
  const startCap = h.player.cap;
  let shots = 0;
  const onFire = (payload) => {
    if (payload && payload.ownerId === h.player.id && payload.weaponId === GUN) shots += 1;
  };
  h.bus.on('combat:fire', onFire);
  for (let i = 0; i < TICKS; i++) {
    rebuildIndex(h.state);
    h.weaponSystem.update(DT, h.state);
    h.state.tick += 1;
    h.state.simTime += DT;
  }
  h.bus.off('combat:fire', onFire);
  return {
    shots,
    capSpent: startCap - h.player.cap,
    heat: h.gun._heat,
  };
}

test('a full chain opens one overdrive window and fitted guns fire about three times as fast inside it', () => {
  const h = boot();
  try {
    assert.equal(swarmChainFireRateScale(), 1);
    const cold = tape(h);
    assert.ok(cold.shots >= 4, `the baseline tape fired (${cold.shots})`);

    raise(h, SWARM_CHAIN_SCORE_CAP - 1);
    assert.equal(swarmChain.chainState().chain, SWARM_CHAIN_SCORE_CAP - 1);
    assert.equal(swarmChain.chainState().overdrive, false);
    assert.equal(swarmChainFireRateScale(), 1);
    const below = tape(h);
    assert.equal(below.shots, cold.shots, 'one under the cap is not a rate buff');

    raise(h, 1);
    assert.equal(swarmChain.chainState().chain, SWARM_CHAIN_SCORE_CAP);
    assert.equal(swarmChain.chainState().overdrive, true);
    assert.equal(swarmChainFireRateScale(), SWARM_CHAIN_OVERDRIVE_RATE);
    assert.equal(overdriveOpens(h).length, 1, 'the window opens once when the chain first hits the cap');

    const hot = tape(h);
    assert.ok(
      hot.shots / cold.shots >= 2.5,
      `inside the window the gun fired ${hot.shots} times against ${cold.shots} outside`,
    );
    assert.equal(hot.capSpent / hot.shots, cold.capSpent / cold.shots, 'capacitor cost per shot is unchanged');
    assert.ok(hot.heat > cold.heat, 'heat is still charged for every extra shot');

    raise(h, 10);
    assert.equal(overdriveOpens(h).length, 1, 'climbing further does not open a second window');
    assert.equal(swarmChain.chainState().overdrive, true);

    // A kill that arrives after the window is a new chain of one. The fast guns die with the old chain.
    h.state.simTime += SWARM_CHAIN_WINDOW_S + 0.05;
    raise(h, 1);
    assert.equal(swarmChain.chainState().chain, 1);
    assert.equal(swarmChain.chainState().overdrive, false);
    assert.equal(swarmChainFireRateScale(), 1);

    h.state.simTime += SWARM_CHAIN_WINDOW_S + 0.25;
    swarmChain.update(DT, h.state);
    assert.equal(swarmChain.chainState().chain, 0);
    assert.equal(swarmChain.chainState().overdrive, false);
    assert.equal(swarmChainFireRateScale(), 1);
    const closed = h.emitted.filter((row) => row.event === 'swarm:overdrive' && row.payload && row.payload.active === false);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].payload.rate, 1);

    const after = tape(h);
    assert.equal(after.shots, cold.shots, 'a broken chain is back to the ordinary rate');

    raise(h, SWARM_CHAIN_SCORE_CAP);
    assert.equal(swarmChain.chainState().overdrive, true);
    assert.equal(overdriveOpens(h).length, 2, 'the next full chain opens its own window');
  } finally {
    swarmChain.destroy();
    h.weaponSystem.destroy();
  }
});
