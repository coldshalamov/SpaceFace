import { admitCapturedVessel } from '../src/systems/shipControlTransfer.js';
import { AI_CONTRACT_VERSION } from '../src/ai/contracts.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
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
function setup({ playerHull = false } = {}) {
  const sim = createSimulation({
    seed: 47,
    systems: [spawnBudget, encounterDirector, combat, economy, createTacticalAISystem({
      config: {
        enemyMind: PRODUCTION_ENEMY_MIND_CONFIG
      }
    }), playerHull ? flightV3 : flight, aiPorts, physics, save]
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = 'sector_ceres_belt';
  s.playerId = sim.spawn(playerHull ? makeShipEntitySpec('ship_kestrel', {
    team: 0, isPlayer: true, pos: { x: 9380, z: 9380 }, rot: Math.PI / 4, player: s.player,
  }) : {
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

test('native Line extraction carries the original living captive out, cuts once and survives Continue without a destruction payout', async () => {
  const h = setup({ playerHull: true }), phys = h.sim.registry.get('physics');
  try {
    assert.equal(await phys.prepareBackend(h.s), true);
    h.sim.runTicks(1);
    const player = h.s.entities.get(h.s.playerId);
    const attachments = h.sim.registry.get('combat').kernel.attachments;
    const created = attachments.create({ defId: 'tether_standard', ownerId: player.id, targetId: h.captive.id });
    assert.equal(created.ok, true, JSON.stringify(created));
    const line = created.attachment;
    const start = { ...h.captive.pos };
    const camp = h.live.data.camp;
    h.s.input.moveZ = 1;
    h.s.input.turnIntent = 0;
    let ticks = 0;
    while (Math.hypot(h.captive.pos.x - camp.x, h.captive.pos.z - camp.z) < 365 && ticks < 1800) {
      // Raw forward input drives the stock Kestrel through the default FlightV3
      // owner. No pose/velocity writes, collider edits, damage immunity or stronger Line.
      h.sim.runTicks(1);
      ticks++;
      if (!h.captive.alive || !player.alive || line.state !== 'active') break;
    }
    const range = Math.hypot(h.captive.pos.x - camp.x, h.captive.pos.z - camp.z);
    const moved = Math.hypot(h.captive.pos.x - start.x, h.captive.pos.z - start.z);
    console.log('NATIVE_CAMP_EXTRACTION_TOW', JSON.stringify({ ticks, range, moved,
      playerAlive: player.alive, captiveAlive: h.captive.alive, line: line.state,
      lineReason: line.breakReason, captive: h.captive.pos, player: player.pos }));
    assert.ok(range >= 360, 'the actual standard Line must carry its original captive out of the patrol perimeter');
    assert.ok(moved >= 300);
    assert.equal(line.state, 'active');
    assert.equal(h.captive.alive, true);
    assert.equal(h.base.alive, true);
    assert.ok(h.guards.every(g => g.alive));
    assert.equal(h.outcomes.length, 0, 'being clear while held is not a completed liberation');
    const cut = attachments.cut(line.id, player.id, 'tether_cut');
    assert.equal(cut.ok, true, JSON.stringify(cut));
    h.s.input.moveZ = 0;
    h.sim.runTicks(1);
    assert.deepEqual(h.outcomes, ['captive_extracted']);
    assert.equal(h.captive.data.ai.activity.reason, 'press_camp:released');
    assert.equal(h.grants.length, 0);
    assert.deepEqual(h.reps, [['faction_free', 2, 'press_camp_captive_extracted']]);
    const cutRange = Math.hypot(h.captive.pos.x - camp.x, h.captive.pos.z - camp.z);
    let poweredSteps = 0;
    const owner = phys._sg02, applyCommand = owner._applyCommand;
    owner._applyCommand = function (record, command, ...args) {
      const result = applyCommand.call(this, record, command, ...args);
      if (record.entity === h.captive && command?.control?.force
        && Math.hypot(command.control.force.x, command.control.force.z) > 0) poweredSteps++;
      return result;
    };
    try { h.sim.runTicks(120); } finally { owner._applyCommand = applyCommand; }
    const escapedRange = Math.hypot(h.captive.pos.x - camp.x, h.captive.pos.z - camp.z);
    assert.ok(escapedRange > cutRange + 30, 'the freed Mule continues out under the shipping helm');
    assert.ok(poweredSteps > 0, 'the actual native owner consumed its released-crew engine commands');
    assert.equal(h.captive.alive, true);
    assert.equal(h.base.alive, true);
    assert.ok(h.guards.every(g => g.alive));
    console.log('NATIVE_CAMP_POWERED_ESCAPE', JSON.stringify({ cutRange, escapedRange, poweredSteps }));
    const credits = h.s.player.credits;
    const saver = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saver.serialize('camp-extracted')));
    assert.equal(saver.loadEnvelope(envelope), true);
    assert.equal(await phys.prepareBackend(h.s), true);
    h.sim.runTicks(2);
    assert.equal(h.s.player.credits, credits);
    assert.equal(h.s.encounterDirector.live.camp_test, undefined);
    assert.equal(h.grants.length, 0);
  } finally {
    phys._sg02?.dispose();
    h.sim.dispose();
  }
});
