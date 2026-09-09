import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { scenarioRuntime } from '../src/systems/scenarioRuntime.js';

const contract = JSON.parse(await readFile(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

function entity(id, type, pos, data = {}) {
  return { id, type, alive: true, team: 0, factionId: 'faction_free', pos: { ...pos }, data };
}

function harness() {
  const state = createGameState(47);
  const bus = createBus();
  state.mode = 'flight';
  state.simTime = 100;
  state.world.currentSectorId = 'sector_helios_prime';
  state.story.beatIndex = 0;
  const player = entity(1, 'ship', { x: 0, z: 0 }, { scenarioActorId: 'player_kestrel' });
  const station = entity(2, 'station', { x: 0, z: 0 }, { stationId: 'station_helios' });
  const spindle = entity(3, 'payload', { x: 92, z: 0 }, { scenarioActorId: 'evidence_spindle_47a' });
  const scavenger = entity(4, 'ship', { x: 1900, z: 760 }, {
    scenarioActorId: 'scavenger_harasser',
    combat: { targetId: null },
    ai: {
      liveColdStartSafe: true, dormantUntilBeat: 'scavenger_arrival',
      activationTeam: 1, activationFactionId: 'faction_reavers', passive: true,
    },
  });
  state.playerId = player.id;
  state.entities = new Map([[1, player], [2, station], [3, spindle], [4, scavenger]]);
  state.entityList = [player, station, spindle, scavenger];
  const demands = [];
  bus.on('scenario:safeOpeningDemand', (payload) => demands.push(payload));
  scenarioRuntime.init({
    state, bus,
    helpers: { scenarioContract: contract, scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: 'fixture' },
  });
  return { state, bus, player, spindle, scavenger, demands };
}

function assertDormant(h, message) {
  assert.equal(h.scavenger.team, 0, message);
  assert.equal(h.scavenger.factionId, 'faction_free', message);
  assert.equal(h.scavenger.data.ai.passive, true, message);
  assert.equal(h.scavenger.data.combat.targetId, null, message);
}

const h = harness();
scenarioRuntime.update();
assertDormant(h, 'time-based beat entry cannot arm the starter scavengers');

h.bus.emit('tether:attached', { actorId: h.player.id, targetId: h.spindle.id, attachmentId: 'a1' });
h.state.simTime = 1000;
scenarioRuntime.update();
assertDormant(h, 'tether-only remains safe indefinitely while story progress is B0');
assert.equal(h.demands.length, 0);

h.state.story.beatIndex = 1;
h.state.simTime = 2000;
scenarioRuntime.update();
assertDormant(h, 'authored progress plus tether remains safe inside Helios protection');
assert.equal(h.demands.length, 0);

h.player.pos.x = 1300;
scenarioRuntime.update();
assert.equal(h.demands.length, 1, 'leaving protection after authored progress surfaces one motive and demand');
assertDormant(h, 'demand and ignored response remain no-fire');
h.state.simTime += 600;
scenarioRuntime.update();
assertDormant(h, 'ignoring the demand never becomes an elapsed-time hostility trigger');

h.bus.emit('scenario:scavengerResponse', { choice: 'refuse' });
scenarioRuntime.update();
assertDormant(h, 'explicit refusal preserves the twelve-second escape window');
h.state.simTime += 13;
scenarioRuntime.update();
assert.equal(h.scavenger.team, 1, 'explicit refusal outside protection authorizes the encounter after warning');
assert.equal(h.scavenger.data.ai.passive, false);
assert.equal(h.scavenger.data.combat.targetId, h.player.id);
assert.equal(h.scavenger.data.ai.engagementTrigger, 'explicit_refusal');
assert.equal(h.scavenger.data.ai.motive, 'screen_recovery_claim');
assert.equal(h.scavenger.data.ai.zoneId, 'zone_47a_wreck_field');
assert.equal(h.scavenger.data.ai.combatDoctrineId, 'ranged_disengager');
assert.equal(h.scavenger.data.ai.roe, 'weapons_free');
assert.equal(h.scavenger.data.ai.activity.targetId, h.player.id);

console.log('story-safe-opening: deterministic action/radius/response gate passed');
