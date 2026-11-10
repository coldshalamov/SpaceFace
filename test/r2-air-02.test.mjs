// AIR-02 first slice: Quiet Numbers stays noise until the hull sits in the radar
// shadow of the Resonant Cathedral, and the shadow is the cathedral's measured
// skin — the same range beside the hull is still noise.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { playerBearingHyphen } from '../src/core/playerCompass.js';
import { createSimulation } from '../src/core/sim.js';
import { primitiveBlocksSegment } from '../src/combat/lineOfSight.js';
import { skinContains } from '../src/data/modelTruthMath.js';
import { modelTruthSkinPrimitives } from '../src/data/modelTruth.js';
import { bandRadio, numbersBearingDue } from '../src/systems/bandRadio.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';
import { hullInSolidRadarShadow } from '../src/world/solidDressing.js';
import { NUMBERS_SHADOW_STATION } from '../src/data/numbersShadow.js';

const NOISE = '···· the count breaks ····';

function bootWorld() {
  const sim = createSimulation({
    seed: 4242,
    systems: [spawnBudget, world, bandRadio],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.ui = state.ui || {};
  state.ui.docked = false;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 100,
    hullMax: 100,
    radius: 6,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(NUMBERS_SHADOW_STATION.sectorId);
  const messages = [];
  const radio = sim.registry.get('bandRadio');
  radio.helpers = {
    ...radio.helpers,
    voice: {
      say(payload) {
        messages.push(payload);
        return true;
      },
    },
  };
  return { sim, state, bus, player, messages, radio };
}

function poiPos(state, poiId) {
  const pois = state.world.activeSector && state.world.activeSector.pois || [];
  return pois.find((row) => row && row.poiId === poiId && Number.isFinite(row.pos && row.pos.x)) || null;
}

function poiEntity(state, poiId) {
  for (const entity of state.entities.values()) {
    if (entity && entity.alive !== false && entity.data && entity.data.poiId === poiId) return entity;
  }
  return null;
}

function skinBlocks(primitives, from, to) {
  if (skinContains(to.x, to.z, primitives)) return false;
  for (const primitive of primitives) {
    if (primitiveBlocksSegment(from, to, primitive)) return true;
  }
  return false;
}

function speak(state, radio, player, messages, point) {
  player.pos.x = point.x;
  player.pos.z = point.z;
  state.bandRadio.identPending = false;
  state.bandRadio.nextLineAtS = 0;
  state.simTime = (Number(state.simTime) || 0) + 1;
  const before = messages.length;
  radio.update(1, state);
  assert.ok(messages.length > before, 'Quiet Numbers must speak while the hull is in Vesta Forge');
  return messages[messages.length - 1];
}

test('Quiet Numbers is noise outside the cathedral shadow and names the freighter inside it', () => {
  const { state, bus, player, messages, radio } = bootWorld();
  const station = NUMBERS_SHADOW_STATION;
  const occluder = poiEntity(state, station.occluderPoiId);
  const reward = poiEntity(state, station.rewardPoiId);
  const yard = poiPos(state, station.broadcasterPoiId);
  assert.ok(occluder && occluder.data.collisionProxy && occluder.data.collisionProxy.startsWith('skin:'),
    'the occluder must be a live solid-dressing landmark');
  assert.equal(occluder.data.name, 'The Resonant Cathedral');
  assert.ok(reward && reward.data.name === 'Derelict Freighter');
  assert.ok(yard, 'the anomaly that broadcasts the count must be in the sector');

  const primitives = modelTruthSkinPrimitives(occluder);
  assert.ok(primitives && primitives.length > 1, 'the shadow has to come from the measured skin');
  const transmitter = { x: yard.pos.x, z: yard.pos.z };
  const ox = occluder.pos.x;
  const oz = occluder.pos.z;
  const dx = ox - transmitter.x;
  const dz = oz - transmitter.z;
  const span = Math.hypot(dx, dz);
  const ux = dx / span;
  const uz = dz / span;
  const px = -uz;
  const pz = ux;
  const pose = (along, lateral) => ({
    x: ox + ux * along + px * lateral,
    z: oz + uz * along + pz * lateral,
  });

  const lee = pose(220, 0);
  const beside = pose(0, 220);
  const nearer = pose(-200, 0);
  const deepLee = pose(600, 0);
  const deepBeside = pose(0, 600);
  const leeDist = Math.hypot(lee.x - ox, lee.z - oz);
  const besideDist = Math.hypot(beside.x - ox, beside.z - oz);
  assert.ok(Math.abs(leeDist - besideDist) < 1e-6, 'the clear point must sit at the same range as the lee');
  assert.ok(Math.hypot(nearer.x - ox, nearer.z - oz) < leeDist);
  assert.ok(Math.hypot(deepLee.x - ox, deepLee.z - oz) > leeDist);
  assert.equal(skinBlocks(primitives, transmitter, lee), true);
  assert.equal(skinBlocks(primitives, transmitter, beside), false);
  assert.equal(skinBlocks(primitives, transmitter, nearer), false);
  assert.equal(skinBlocks(primitives, transmitter, deepLee), true);
  assert.equal(skinBlocks(primitives, transmitter, deepBeside), false);
  assert.equal(skinContains(ox, oz, primitives), true);

  assert.equal(hullInSolidRadarShadow(occluder, transmitter, lee), true);
  assert.equal(hullInSolidRadarShadow(occluder, transmitter, beside), false);
  assert.equal(hullInSolidRadarShadow(occluder, transmitter, nearer), false);
  assert.equal(hullInSolidRadarShadow(occluder, transmitter, deepLee), true);
  assert.equal(hullInSolidRadarShadow(occluder, transmitter, deepBeside), false);
  assert.equal(hullInSolidRadarShadow(occluder, transmitter, { x: ox, z: oz }), false);

  const fact = `${reward.data.name} lies ${playerBearingHyphen(
    reward.pos.x - ox,
    reward.pos.z - oz,
  )} of ${occluder.data.name}.`;
  assert.equal(fact, 'Derelict Freighter lies south-east of The Resonant Cathedral.');
  assert.doesNotMatch(fact, /[a-z]+_[a-z0-9_]+/);
  assert.doesNotMatch(NOISE, /Derelict Freighter|south-east/);

  bus.emit('band:tune', { channelId: 'numbers_station' });
  state.simTime = 1;
  radio.update(1, state);
  assert.ok(messages.length >= 1);
  assert.doesNotMatch(messages[messages.length - 1].text, /Derelict Freighter/);

  assert.equal(speak(state, radio, player, messages, beside).text, NOISE);
  assert.equal(speak(state, radio, player, messages, nearer).text, NOISE);
  assert.equal(speak(state, radio, player, messages, deepBeside).text, NOISE);
  assert.equal(speak(state, radio, player, messages, { x: ox, z: oz }).text, NOISE);
  assert.equal(speak(state, radio, player, messages, lee).text, fact);
  assert.equal(speak(state, radio, player, messages, deepLee).text, fact);
  assert.equal(speak(state, radio, player, messages, lee).text, fact);
});

test('Quiet Numbers outside that sector is not the cathedral count', () => {
  const bus = createBus();
  const messages = [];
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    mode: 'flight',
    ui: { docked: false },
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime', factionId: 'faction_scn', tier: 0, security: 0.98,
          stations: [{ factionId: 'faction_scn' }],
        },
      },
    },
    factions: { faction_reach: { rep: 0 } },
  };
  const system = Object.create(bandRadio);
  system.init({
    state,
    bus,
    helpers: { voice: { say(payload) { messages.push(payload); return true; } } },
    registry: { get() { return null; } },
  });
  system.newGame();
  bus.emit('band:tune', { channelId: 'numbers_station' });
  let sequence = 0;
  while (numbersBearingDue(4242, sequence) && sequence < 40) sequence += 1;
  state.bandRadio.sequence = sequence;
  state.bandRadio.identPending = false;
  state.bandRadio.nextLineAtS = 0;
  state.simTime = 5;
  system.update(5, state);
  assert.equal(messages.length, 1);
  assert.notEqual(messages[0].text, NOISE);
  assert.doesNotMatch(messages[0].text, /Derelict Freighter|Resonant Cathedral/);
});
