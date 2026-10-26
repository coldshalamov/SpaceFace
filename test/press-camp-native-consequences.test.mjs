import { admitCapturedVessel } from '../src/systems/shipControlTransfer.js';
import { AI_CONTRACT_VERSION } from '../src/ai/contracts.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { runtime } from '../src/data/encounters/358-the-press-camp.js';
import { createTacticalAISystem, PRODUCTION_ENEMY_MIND_CONFIG } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { flight } from '../src/systems/flight.js';
import { physics } from '../src/core/physics.js';
import { economy } from '../src/systems/economy.js';
import { save } from '../src/save/saveSystem.js';
function setup() {
  const sim = createSimulation({
    seed: 47,
    systems: [spawnBudget, encounterDirector, combat, economy, createTacticalAISystem({
      config: {
        enemyMind: PRODUCTION_ENEMY_MIND_CONFIG
      }
    }), flight, aiPorts, physics, save]
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = 'sector_ceres_belt';
  s.playerId = sim.spawn({
    type: 'ship',
    team: 0,
    pos: {
      x: 9380,
      z: 9380
    },
    hull: 200,
    radius: 6
  }).id;
  const d = sim.registry.get('encounterDirector');
  assert.equal(d.requestAuthoredEncounter({
    shapeId: 'press_camp_raid',
    encounterId: 'camp_test',
    sectorId: 'sector_ceres_belt',
    anchor: {
      x: 9200,
      z: 9200
    },
    zoneType: 'ambush_lane',
    zoneRadius: 500,
    force: true
  }).ok, true);
  const live = s.encounterDirector.live.camp_test;
  const base = s.entities.get(live.data.baseId),
    captive = s.entities.get(live.data.captiveId),
    guards = d.entsOf(live, 'raider');
  const grants = [],
    reps = [],
    outcomes = [];
  const originalGrant = d.grant.bind(d),
    originalRep = d.rep.bind(d);
  d.grant = (...args) => {
    grants.push(args);
    return originalGrant(...args);
  };
  d.rep = (...args) => {
    reps.push(args);
    return originalRep(...args);
  };
  sim.bus.on('encounter:resolved', p => outcomes.push(p.outcome));
  const tick = () => runtime.tick(d, live, s, s.simTime);
  return {
    sim,
    s,
    d,
    live,
    base,
    captive,
    guards,
    grants,
    reps,
    outcomes,
    tick
  };
}
test('native defeated garrison preserves base; completed save cannot replay scene pay', async () => {
  const h = setup();
  const phys = h.sim.registry.get('physics');
  try {
    assert.equal(await phys.prepareBackend(h.s), true);
    h.sim.runTicks(60);
    const heldActivity = h.captive.data.ai.activity;
    const pos = {
      x: h.captive.pos.x,
      z: h.captive.pos.z
    };
    for (const g of h.guards) h.sim.registry.get('combat').kill(g, h.s.playerId);
    h.sim.runTicks(1);
    assert.deepEqual(h.outcomes, ['garrison_broken']);
    assert.equal(h.captive.data.ai.forceFlee, true);
    assert.equal(h.base.alive, true);
    assert.equal(h.grants.length, 0);
    h.sim.runTicks(600);
    const moved = Math.hypot(h.captive.pos.x - pos.x, h.captive.pos.z - pos.z);
    console.log(JSON.stringify({
      beforeContinue: {
        moved,
        alive: h.captive.alive,
        ai: h.captive.data.ai.activity,
        intent: h.captive.data.intent,
        forceFlee: h.captive.data.ai.forceFlee
      }
    }));
    assert.ok(moved > 30, 'original captive physically leaves the cleared camp');
    assert.equal(h.captive.alive, true);
    assert.equal(h.base.alive, true);
    const credits = h.s.player.credits;
    const saves = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saves.serialize('press-camp-completed')));
    assert.equal(saves.loadEnvelope(envelope), true);
    assert.equal(await phys.prepareBackend(h.s), true);
    h.sim.runTicks(2);
    assert.equal(h.s.player.credits, credits);
    assert.equal(h.s.encounterDirector.live.camp_test, undefined);
    console.log(JSON.stringify({
      kind: 'press_camp_native',
      moved,
      heldActivity: heldActivity.reason,
      outcomes: h.outcomes,
      grants: h.grants,
      credits,
      afterContinueCredits: h.s.player.credits,
      simTime: h.s.simTime,
      claim: 'forced component admission, actual combat.kill, actual AI/flight/Rapier, unchanged-envelope Save/load; not human play or full current graph'
    }));
  } finally {
    phys._sg02?.dispose();
    h.sim.dispose();
  }
});
test('native original base kill survives body removal and Continue without replay', async () => {
  const h = setup();
  const phys = h.sim.registry.get('physics');
  try {
    assert.equal(await phys.prepareBackend(h.s), true);
    h.sim.runTicks(60);
    h.sim.registry.get('combat').kill(h.base, h.s.playerId);
    h.s.entities.delete(h.base.id);
    h.sim.runTicks(1);
    assert.deepEqual(h.grants, [[120, 'press_camp:base_burned']]);
    assert.deepEqual(h.outcomes, ['base_destroyed']);
    const credits = h.s.player.credits;
    assert.equal(credits, 640);
    const saves = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saves.serialize('camp-burned')));
    assert.equal(saves.loadEnvelope(envelope), true);
    assert.equal(await phys.prepareBackend(h.s), true);
    h.sim.runTicks(2);
    assert.equal(h.s.player.credits, credits);
    assert.equal(h.grants.length, 1);
    console.log(JSON.stringify({
      kind: 'camp_burned_continue',
      credits,
      afterContinue: h.s.player.credits,
      grants: h.grants,
      outcomes: h.outcomes
    }));
  } finally {
    phys._sg02?.dispose();
    h.sim.dispose();
  }
});
test('capture subscriber cannot flush or save released captive helm, pending and held', async () => {
  for (const held of [false, true]) {
    const h = setup(),
      phys = h.sim.registry.get('physics');
    try {
      await phys.prepareBackend(h.s);
      h.sim.runTicks(60);
      const ports = h.sim.registry.get('aiPorts'),
        saves = h.sim.registry.get('save');
      let envelope, early;
      h.sim.bus.on('ship:captured', () => {
        envelope = JSON.parse(JSON.stringify(saves.serialize('camp-capture')));
        ports.update(1 / 60, h.s);
        const c = consumePhysicsCommand(h.captive);
        early = {
          force: Math.hypot(c?.control?.force?.x || 0, c?.control?.force?.z || 0),
          activity: h.captive.data.ai.activity,
          flee: h.captive.data.ai.forceFlee,
          permit: h.captive.data.ai.allowPassiveManeuver
        };
      });
      for (const g of h.guards) h.sim.registry.get('combat').kill(g, h.s.playerId);
      h.sim.runTicks(1);
      assert.equal(h.captive.data.ai.activity.reason, 'press_camp:released');
      h.captive.data.vesselId = 'probe:camp:captive';
      h.captive.data.shipjackGeneration = 1;
      h.s.run = {
        kind: 'adventure'
      };
      assert.equal(ports.helpers.aiManeuver.request({
        version: AI_CONTRACT_VERSION,
        entityId: h.captive.id,
        tick: h.s.tick,
        kind: 'transit',
        forceLocal: {
          forward: 1,
          right: 0
        },
        torqueYaw: 0,
        reason: 'press_camp:released'
      }), true);
      if (held) ports.update(1 / 60, h.s);
      const owner = {
        state: h.s,
        bus: h.sim.bus,
        helpers: ports.helpers,
        validateTransferFittings: () => true,
        nextInstanceId: () => 'probe:instance'
      };
      const result = admitCapturedVessel(owner, {
        targetId: h.captive.id,
        targetGeneration: 1,
        vesselId: h.captive.data.vesselId,
        operationId: 'probe:capture'
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.deepEqual(early, {
        force: 0,
        activity: null,
        flee: false,
        permit: false
      });
      assert.equal(JSON.stringify(envelope).includes('press_camp:released'), false);
      assert.equal(saves.loadEnvelope(envelope), true);
      await phys.prepareBackend(h.s);
      h.sim.runTicks(2);
      const restored = [...h.s.entities.values()].find(e => e.data?.vesselId === 'probe:camp:captive');
      assert.ok(restored);
      assert.equal(restored.data.ai.activity, null);
      assert.equal(restored.data.ai.forceFlee, false);
      assert.equal(restored.data.ai.allowPassiveManeuver, false);
      assert.ok(h.s.player.ownedShips.some(e => e.vesselId === restored.data.vesselId));
      console.log(JSON.stringify({
        kind: 'camp_capture_continue',
        held,
        early,
        restoredId: restored.id
      }));
    } finally {
      phys._sg02?.dispose();
      h.sim.dispose();
    }
  }
});
