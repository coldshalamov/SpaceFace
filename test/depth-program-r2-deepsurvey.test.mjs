import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { RUMOR_EVENT_BY_CHANNEL, uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { scanner } from '../src/systems/scanner.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';

const BASE_SCAN_RADIUS = 1200;
const BASE_PING_PERSIST_S = 45;

function spawnPlayer(sim, pos = { x: 0, z: 0 }) {
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    radius: 10,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_kestrel' },
  });
  sim.state.playerId = player.id;
  return player;
}

function scanFixture({ fittings = [], inventory = [], now = 100 } = {}) {
  const sim = createSimulation({ seed: 83211, systems: [scanner] });
  const { state } = sim;
  state.mode = 'flight';
  state.simTime = now;
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [...fittings] }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = inventory.map((defId, index) => ({
    instanceId: `inventory:${index}:${defId}`,
    defId,
  }));
  const player = spawnPlayer(sim);
  player.data.fittings = [...fittings];
  return {
    sim,
    state,
    player,
    system: sim.registry.get('scanner'),
    dispose: () => sim.dispose(),
  };
}

function spawnWreck(t, distance, label) {
  return t.sim.spawn({
    type: 'wreck',
    pos: { x: distance, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 5,
    hull: 1,
    hullMax: 1,
    data: { salvage: true, scanLabel: label },
  });
}

function pulseScanner(t) {
  t.system._pulse(t.state, t.player, t.state.simTime);
}

test('only active Survey fittings scale the exact scan radius and ping persistence', () => {
  const cases = [
    {
      label: 'inventory-only Deepsurvey',
      fittings: [],
      inventory: ['unique_deepsurvey_suite'],
      radiusMult: 1,
      persistMult: 1,
    },
    {
      label: 'inventory-only Truesight',
      fittings: [],
      inventory: ['unique_truesight_scanner'],
      radiusMult: 1,
      persistMult: 1,
    },
    {
      label: 'fitted Truesight Scanner',
      fittings: ['unique_truesight_scanner'],
      inventory: [],
      radiusMult: 1.5,
      persistMult: 1,
    },
    {
      label: 'fitted Survey Suite',
      fittings: ['mod_survey_suite'],
      inventory: [],
      radiusMult: 1.5,
      persistMult: 2,
    },
    {
      label: 'fitted Deepsurvey Suite',
      fittings: ['unique_deepsurvey_suite'],
      inventory: [],
      radiusMult: 2.25,
      persistMult: 4,
    },
  ];

  for (const row of cases) {
    const t = scanFixture(row);
    try {
      const inside = spawnWreck(t, BASE_SCAN_RADIUS * row.radiusMult - 0.01, `${row.label}:inside`);
      const outside = spawnWreck(t, BASE_SCAN_RADIUS * row.radiusMult + 0.01, `${row.label}:outside`);
      pulseScanner(t);

      assert.equal(
        inside.data.pingedUntil,
        t.state.simTime + BASE_PING_PERSIST_S * row.persistMult,
        `${row.label} applies its authored persistence multiplier`,
      );
      assert.equal(outside.data.pingedUntil, undefined, `${row.label} stops at its exact authored radius`);
    } finally {
      t.dispose();
    }
  }
});

function r2Fixture(seed = 83212) {
  const def = uniqueWreckById('wreck_deepsurvey');
  const sim = createSimulation({ seed, systems: [encounterDirector, uniqueWrecks, cargo, ships] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = def.sectorId;
  state.player.cargo.capVolume = 1000;
  state.player.cargo.capMass = 1e9;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  const player = spawnPlayer(sim);
  const requests = [];
  bus.on('uniqueWreck:encounterRequested', (payload) => requests.push(payload));
  return {
    def,
    sim,
    state,
    bus,
    player,
    requests,
    system: sim.registry.get('uniqueWrecks'),
    dispose: () => sim.dispose(),
  };
}

function hearDeepsurvey(t) {
  const source = t.def.rumorSources.find((entry) => entry.sourceRef === t.def.bearingSourceRef);
  t.bus.emit(RUMOR_EVENT_BY_CHANNEL[source.channelId], {
    wreckId: t.def.id,
    sourceRef: source.sourceRef,
    channelId: source.channelId,
    authoredWreckId: t.def.id,
  });
  return t.state.player.uniqueWrecks.bearings[t.def.id];
}

function claimDeepsurvey(t) {
  const record = hearDeepsurvey(t);
  t.state.player.moduleInventory.push({ instanceId: 'scan-gate', defId: t.def.scanRequirement });
  t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
  assert.equal(record.phase, 'fixed');
  const wreck = t.state.entityList.find((entity) => entity.alive !== false
    && entity.data?.uniqueWreckId === t.def.id);
  assert.ok(wreck);
  t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  const claim = t.def.decision.choices.find((choice) => choice.uniqueDrop);
  assert.ok(claim);
  t.bus.emit('uniqueWreck:choose', { wreckId: t.def.id, choiceId: claim.id });
  assert.equal(record.phase, 'salvaged');
  assert.ok(t.state.player.uniqueWrecks.grants.unique_deepsurvey_suite);
  assert.equal(
    t.state.player.moduleInventory.some((item) => item.defId === 'unique_deepsurvey_suite'),
    true,
  );
  return record;
}

function fitDeepsurvey(t) {
  t.state.player.moduleInventory = t.state.player.moduleInventory
    .filter((item) => item.defId !== 'unique_deepsurvey_suite');
  t.state.player.ownedShips[t.state.player.activeShipIndex].fittings = ['unique_deepsurvey_suite'];
  t.player.data.fittings = ['unique_deepsurvey_suite'];
}

function emitPulses(t, count) {
  for (let index = 0; index < count; index += 1) {
    t.bus.emit('scan:pulse', { pos: { x: -999999, z: 999999 } });
  }
}

test('Deepsurvey over-use begins after claim+fit, survives save, and summons once at the live player', () => {
  const first = r2Fixture();
  try {
    claimDeepsurvey(first);
    first.state.world.currentSectorId = 'sector_helios_prime';
    first.player.pos.x = 18420;
    first.player.pos.z = -7730;
    first.state.simTime = 400;

    emitPulses(first, 6);
    assert.equal(first.requests.length, 0, 'inventory ownership never activates Deepsurvey risk');

    fitDeepsurvey(first);
    emitPulses(first, 2);
    assert.equal(first.requests.length, 0, 'two fitted pulses remain below the authored threshold');
    const checkpoint = first.system.serialize();
    assert.equal(checkpoint.pingRisks.wreck_deepsurvey.count, 2, 'the fitted pulse count is save data');

    const restored = r2Fixture();
    try {
      restored.system.deserialize(checkpoint);
      fitDeepsurvey(restored);
      restored.state.world.currentSectorId = 'sector_helios_prime';
      restored.player.pos.x = 18420;
      restored.player.pos.z = -7730;
      restored.state.simTime = 400;

      emitPulses(restored, 1);
      assert.equal(restored.requests.length, 1);
      assert.deepEqual({
        sectorId: restored.requests[0].sectorId,
        pos: restored.requests[0].pos,
        encounterId: restored.requests[0].encounterId,
      }, {
        sectorId: 'sector_helios_prime',
        pos: { x: 18420, z: -7730 },
        encounterId: 'unique_wreck_deepsurvey_ping_elite',
      });

      const instanceId = 'unique-wreck:wreck_deepsurvey:unique_wreck_deepsurvey_ping_elite';
      const live = restored.state.encounterDirector.live[instanceId];
      assert.ok(live, 'the direct-only elite reaches the live director');
      assert.deepEqual(live.anchor, { x: 18420, z: -7730 }, 'the physical encounter uses global_v1 player truth');
      assert.equal(live.ids.length, 1, 'the request materializes the authored one-ship elite immediately');
      const elite = restored.state.entities.get(live.ids[0]);
      assert.ok(elite?.alive, 'the elite is a live physical entity, not encounter metadata only');
      assert.equal(Math.hypot(elite.pos.x - 18420, elite.pos.z + 7730) <= live.zoneRadius, true);

      const triggered = restored.system.serialize().pingRisks.wreck_deepsurvey;
      assert.equal(triggered.count, 0);
      assert.equal(triggered.cooldownUntil > restored.state.simTime, true);
      const cooldownCheckpoint = restored.system.serialize();

      emitPulses(restored, 12);
      assert.equal(restored.requests.length, 1, 'cooldown pulses cannot duplicate the elite');

      const continued = r2Fixture();
      try {
        continued.system.deserialize(cooldownCheckpoint);
        fitDeepsurvey(continued);
        continued.state.world.currentSectorId = 'sector_helios_prime';
        continued.player.pos.x = 18420;
        continued.player.pos.z = -7730;
        continued.state.simTime = restored.state.simTime;
        emitPulses(continued, 12);
        assert.equal(continued.requests.length, 0, 'the saved cooldown also prevents duplicates after Continue');
        assert.deepEqual(
          continued.system.serialize().pingRisks.wreck_deepsurvey,
          cooldownCheckpoint.pingRisks.wreck_deepsurvey,
        );
      } finally {
        continued.dispose();
      }
    } finally {
      restored.dispose();
    }
  } finally {
    first.dispose();
  }
});
