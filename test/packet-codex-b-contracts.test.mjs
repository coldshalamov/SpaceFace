import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { scanner } from '../src/systems/scanner.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { v2FlavorRuntime } from '../src/systems/v2FlavorRuntime.js';
import { world } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

test('distant returning ace crews remain in the SG-06 roster while ordinary distant traffic sleeps', () => {
  const sim = createSimulation({
    seed: 0x53c017,
    systems: [spawnBudget, aceMemory, aiPorts],
  });
  const { state, bus, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  state.playerId = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 10,
  }).id;
  sim.spawn({
    type: 'ship', team: 1, pos: { x: 900, z: 0 }, hull: 50, hullMax: 50, radius: 8,
    data: { ai: { squadId: 'ordinary-distant-traffic', doctrine: 'patrol', passive: false } },
  });

  let returned = null;
  bus.on('aceMemory:returnSpawned', (payload) => { returned = payload; });
  bus.emit('namedAce:fled', {
    aceId: 'ace_maw_rake_veyra',
    sectorId: state.world.currentSectorId,
  });
  state.simTime = state.aceMemory.ace_maw_rake_veyra.returnAt;
  sim.runTicks(Math.ceil(0.55 / SIM_DT));

  assert.ok(returned);
  const squads = helpers.aiRoster.listSquads(state.tick);
  const aceSquad = squads.find((candidate) => candidate.id === returned.requestId);
  assert.deepEqual(
    aceSquad?.members.map((member) => member.id),
    returned.spawnedIds,
    'every returning crew member must remain available to SG-06 before closing range',
  );
  assert.equal(
    squads.some((candidate) => candidate.id === 'ordinary-distant-traffic'),
    false,
    'the named-ace exception must not wake generic distant traffic',
  );
});

test('the Candle Fleet uses stable POI scan identity and survives world serialize/deserialize', () => {
  const live = bootWorld(93);
  const messages = installVoice(live.sim);
  live.sim.registry.get('world').enterSector('sector_helios_prime');
  const memorial = [...live.state.entities.values()]
    .find((entity) => entity?.alive !== false && entity.data?.poiId === 'poi_memorial');
  assert.ok(memorial);

  live.player.pos.x = memorial.pos.x;
  live.player.pos.z = memorial.pos.z;
  live.state.simTime = 1;
  live.state.input.actions.scanPulse = true;
  live.sim.registry.get('scanner').update(1 / 60, live.state);

  const stableSignal = live.state.signalInvestigation.records['signal:poi:poi_memorial'];
  assert.equal(stableSignal?.sourceId, 'poi_memorial');
  assert.equal(stableSignal?.sourceKind, 'archive');
  assert.equal(stableSignal?.classification, 'ARCHIVE TELEMETRY');
  const candleFleet = FLAVOR_PACKS.landmark_lore.entries.find((entry) => entry.programSlot === 'C3');
  assert.ok(candleFleet.lines.some((line) => line.text === messages[0]?.text));

  live.sim.registry.get('world')._tickPOIScan(live.state);
  const before = explorationDiscoveryPlates(live.state)
    .find((entry) => entry.poiId === 'poi_memorial');
  assert.equal(before?.title, 'What Was the Pit?');
  assert.match(before?.body || '', /twenty-fifth plinth/i);
  assert.match(before?.body || '', /telemetry smear/i);

  const savedWorld = JSON.parse(JSON.stringify(live.sim.registry.get('world').serialize()));
  const restored = bootWorld(93);
  restored.sim.registry.get('world').deserialize(savedWorld);
  const after = explorationDiscoveryPlates(restored.state)
    .find((entry) => entry.poiId === 'poi_memorial');
  assert.deepEqual(after, before);
});

function bootWorld(seed) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, world, bandRadio, scanner, v2FlavorRuntime],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.ui = state.ui || {};
  state.ui.docked = false;
  state.input = state.input || {};
  state.input.actions = state.input.actions || {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 6,
  });
  state.playerId = player.id;
  return { sim, state, player };
}

function installVoice(sim) {
  const messages = [];
  const flavor = sim.registry.get('v2Flavor');
  flavor.helpers = {
    ...flavor.helpers,
    voice: {
      say(payload) {
        messages.push(payload);
        return true;
      },
    },
  };
  return messages;
}
