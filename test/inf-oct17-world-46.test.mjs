// WORLD-46 — a hauler whose raiders you killed remembers you at the next crossing.
//
// Seed 4242. Clearing a live ambient raid on a lane hauler stamps one memory.
// The next time you come within hailing distance, that hauler speaks one
// thank-you. A second crossing stays quiet. No pay, no side quest.
// A raid you did not end (someone else kills the raiders, or the raid times out)
// leaves no memory and no thank-you.

import assert from 'node:assert/strict';
import test from 'node:test';

import { updateAmbientPredation, ambientRaiderDestroyed } from '../src/ai/ambientPredation.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { createSimulation } from '../src/core/sim.js';
import { nextMoralDebt } from '../src/systems/moralMemory.js';
import { barkDirector } from '../src/systems/barkDirector.js';

const SEED = 4242;
const SECTOR_ID = 'sector_pallas_drift';
const MANIFEST_ID = 'ambient_test_manifest';
const HAULER_NAME = 'Marrow Lane';
const LANE = Object.freeze({ x: 1420, z: 760 });

const THANK_YOU_LINES = Object.freeze([
  `${HAULER_NAME}: Thank you. You killed those raiders. This hull remembers.`,
  `${HAULER_NAME}: Thank you. The lane is clear — we saw who ended that raid.`,
  `${HAULER_NAME}: Thank you. Those raiders are gone, and this hull will not forget it.`,
]);

function lanePoint(dx, dz) {
  return sectorLocalToGlobalForSector(
    { x: LANE.x + dx, z: LANE.z + dz },
    SECTOR_ID,
  );
}

function rescueDebts(state) {
  const debts = state.story && state.story.moralMemory && state.story.moralMemory.debts;
  if (!debts) return [];
  return Object.values(debts).filter((debt) => debt && debt.cause === 'lane_hauler_rescued');
}

function thankYous(said) {
  return said.filter((entry) => entry
    && entry.channel === 'bark'
    && entry.kind === 'haulerRescue'
    && THANK_YOU_LINES.includes(entry.text));
}

function boot() {
  const said = [];
  const missions = [];
  const voice = {
    say(entry) {
      said.push(entry);
      return true;
    },
  };
  const sim = createSimulation({
    seed: SEED,
    systems: [barkDirector],
    helpers: { voice },
  });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR_ID;
  sim.bus.on('mission:offered', (payload) => missions.push(payload));
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: lanePoint(5000, 5000),
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 8,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  const voices = [];
  sim.bus.on('barkDirector:voice', (payload) => voices.push(payload));
  return { sim, said, missions, voices, player };
}

function raiderSpec(pos) {
  return {
    type: 'ship',
    team: 1,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    hull: 120,
    hullMax: 120,
    shield: 50,
    radius: 18,
    data: {
      intent: {},
      weapons: [{ id: 'wpn_autocannon_s' }],
      ai: {
        archetype: 'pirate',
        lawful: false,
        combatDoctrineId: 'interceptor_flyby',
        motive: 'assigned_interdiction',
        engagementTrigger: 'authorized_hostile_spawn',
        zoneId: 'zone_pallas_ambush',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 2,
        activity: {
          kind: 'attack_run',
          reason: 'zone_hostile:hunt',
          anchor: { ...pos },
          leashRadius: 2600,
          startedTick: 0,
          targetId: null,
        },
        roe: 'weapons_free',
      },
    },
  };
}

function haulerSpec(pos) {
  return {
    type: 'ship',
    team: 2,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    hull: 80,
    hullMax: 80,
    shield: 0,
    radius: 14,
    data: {
      intent: {},
      name: HAULER_NAME,
      trafficRole: 'hauler',
      role: 'hauler',
      cargoManifest: {
        manifestId: MANIFEST_ID,
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 24 }],
        totalQty: 24,
      },
      ai: { passive: true },
    },
  };
}

function predationCtx(sim) {
  return {
    emit: (name, payload) => sim.bus.emit(name, payload),
    docked: false,
  };
}

/** Real ambient binder: one live raid on the lane hauler, or the test stops. */
function bindRaid(sim) {
  const raider = sim.spawn(raiderSpec(lanePoint(-200, -100)));
  const hauler = sim.spawn(haulerSpec(lanePoint(150, 60)));
  const telegraphs = [];
  sim.bus.on('encounter:ambientPredationTelegraph', (payload) => telegraphs.push(payload));
  updateAmbientPredation(sim.state, predationCtx(sim));
  assert.equal(telegraphs.length, 1, 'seed 4242 binds one live raid on the lane hauler');
  assert.equal(telegraphs[0].targetId, hauler.id);
  assert.equal(telegraphs[0].raiderId, raider.id);
  assert.equal(String(telegraphs[0].raidId).startsWith('ambient:raid:'), true);
  return { raider, hauler, telegraph: telegraphs[0] };
}

function clearByKill(sim, raider, killerId) {
  raider.alive = false;
  // Production order when the encounter director hears the kill first: the raid
  // releases (binding stripped) before the bark listener sees entity:killed.
  ambientRaiderDestroyed(sim.state, raider, predationCtx(sim));
  sim.bus.emit('entity:killed', {
    id: raider.id,
    killerId,
    type: 'ship',
    pos: { x: raider.pos.x, z: raider.pos.z },
  });
}

function meet(sim, hauler) {
  const player = sim.state.entities.get(sim.state.playerId);
  player.pos.x = hauler.pos.x + 80;
  player.pos.z = hauler.pos.z;
  const bark = sim.registry.get('barkDirector');
  bark.noteBarkWake();
  for (let i = 0; i < 4; i++) {
    sim.state.tick += 1;
    sim.state.simTime += 1 / 60;
    bark.update(1 / 60, sim.state);
  }
}

test('WORLD-46 [4242] clearing a live lane-hauler raid stamps one memory and the next meeting thanks you once', () => {
  const { sim, said, missions, voices, player } = boot();
  try {
    const creditsBefore = sim.state.player.credits;
    const { raider, hauler } = bindRaid(sim);
    clearByKill(sim, raider, player.id);

    const debts = rescueDebts(sim.state);
    assert.equal(debts.length, 1, 'one memory for the hauler whose raiders you killed');
    assert.equal(debts[0].name, HAULER_NAME);
    assert.equal(debts[0].thankedAt == null, true, 'the thanks is still unsaid');
    assert.equal(nextMoralDebt(sim.state), null, 'the memory is not a side quest');
    assert.equal(sim.state.story.moralMemory.mercyCount || 0, 0, 'a rescue is not a mercy tally');
    assert.equal(sim.state.player.credits, creditsBefore, 'clearing the raid pays nothing');
    assert.equal(missions.length, 0, 'clearing the raid offers no contract');

    sim.bus.emit('entity:killed', {
      id: raider.id,
      killerId: player.id,
      type: 'ship',
      pos: { x: raider.pos.x, z: raider.pos.z },
    });
    assert.equal(rescueDebts(sim.state).length, 1, 'the same rescue never stamps a second memory');

    meet(sim, hauler);
    const thanks = thankYous(said);
    assert.equal(thanks.length, 1, 'the next crossing speaks one thank-you');
    assert.equal(thanks[0].text.includes(MANIFEST_ID), false, 'the line never speaks a manifest id');
    assert.equal(thanks[0].text.includes(String(hauler.id)), false, 'the line never speaks a hull id');
    const rescueVoices = voices.filter((entry) => entry && entry.situation === 'hauler-rescue');
    assert.equal(rescueVoices.length, 1);
    assert.equal(rescueVoices[0].entityId, hauler.id, 'the saved hauler owns the voice');
    assert.equal(rescueVoices[0].register, 'hauler');
    assert.ok(debts[0].thankedAt != null || rescueDebts(sim.state)[0].thankedAt != null,
      'the spoken thanks is marked so it cannot repeat');

    said.length = 0;
    voices.length = 0;
    const playerEntity = sim.state.entities.get(player.id);
    playerEntity.pos.x = hauler.pos.x + 4000;
    playerEntity.pos.z = hauler.pos.z;
    meet(sim, hauler);
    assert.equal(thankYous(said).length, 0, 'the second crossing does not thank you again');
    assert.equal(rescueDebts(sim.state).length, 1);
    assert.equal(sim.state.player.credits, creditsBefore);
    assert.equal(missions.length, 0);
  } finally {
    sim.dispose();
  }
});

test('WORLD-46 [4242] a raid you did not end stays quiet', () => {
  const other = boot();
  try {
    const { raider, hauler } = bindRaid(other.sim);
    clearByKill(other.sim, raider, hauler.id);
    assert.equal(rescueDebts(other.sim.state).length, 0, 'someone else killing the raiders leaves no memory');
    meet(other.sim, hauler);
    assert.equal(thankYous(other.said).length, 0, 'the next crossing does not thank a pilot who did not end the raid');
    assert.equal(other.sim.state.player.credits, 0);
    assert.equal(other.missions.length, 0);
  } finally {
    other.sim.dispose();
  }

  const timed = boot();
  try {
    const { raider, hauler } = bindRaid(timed.sim);
    raider.data.ai.predationObjective.deadlineAt = 0;
    raider.data.ai.predationObjective.deadlineTick = 0;
    timed.sim.state.simTime = 5;
    timed.sim.state.tick = 300;
    updateAmbientPredation(timed.sim.state, predationCtx(timed.sim));
    assert.equal(raider.data.predationRole, undefined, 'the raid released on its own clock');
    assert.equal(rescueDebts(timed.sim.state).length, 0, 'a raid that times out stamps nothing');
    meet(timed.sim, hauler);
    assert.equal(thankYous(timed.said).length, 0, 'a hauler you did not save does not thank you');
    assert.equal(nextMoralDebt(timed.sim.state), null);
  } finally {
    timed.sim.dispose();
  }
});
