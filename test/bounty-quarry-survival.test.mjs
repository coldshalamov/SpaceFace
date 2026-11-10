import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import {
  QUARRY_TUNING as QT,
  quarryManifestForContract,
} from '../src/data/bountyHunters.js';
import {
  bountyHunt,
  bountyHunterOutcomeForContract,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../src/systems/bountyHunt.js';

function place(state, spec, id) {
  const entity = {
    id, alive: true, ...spec,
    pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
    vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
    rot: 0,
  };
  if (!entity.data) entity.data = spec.data;
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

function bootHunt() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 8;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const said = [];
  let nextId = 100;
  const helpers = {
    voice: { say: (line) => said.push(line) },
    spawnEntity(spec) {
      const id = nextId++;
      const entity = {
        id,
        alive: true,
        type: spec.type || 'ship',
        team: spec.team ?? 2,
        factionId: spec.factionId || null,
        pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
        vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
        rot: 0,
        radius: spec.radius || 6,
        mass: spec.mass || 1,
        hull: spec.hull ?? 10,
        hullMax: spec.hullMax ?? 10,
        data: spec.data || {},
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const system = Object.create(bountyHunt);
  system.init({ state, bus, helpers });
  return { state, bus, system, player, helpers, said };
}

function chasePair(state, contractId = 'c-chase', gap = 400) {
  const quarry = place(state, makeBountyQuarrySpec({ contractId, pos: { x: 1200, z: 0 } }), 20);
  const hunter = place(state, makeBountyHunterSpec({
    contractId,
    contractTargetId: quarry.id,
    pos: { x: 1200 - gap, z: 0 },
  }), 21);
  return { quarry, hunter };
}

function teardown(system, bus) {
  system.destroy?.();
  bus.clear();
}

test('a staged chase crosses the player view with the hunter trailing the quarry', () => {
  const { state, bus, system } = bootHunt();
  try {
    const staged = [];
    bus.on('bountyHunt:staged', (p) => staged.push(p));
    system.update(1 / 60, state);
    assert.equal(staged.length, 0);
    state.simTime += QT.firstStageDelayS + 1;
    system.update(1 / 60, state);
    assert.equal(staged.length, 1);
    const { contractId, quarryId, hunterId } = staged[0];
    assert.match(contractId, /^bounty:staged:1$/);
    const quarry = state.entities.get(quarryId);
    const hunter = state.entities.get(hunterId);
    assert.ok(quarry && hunter);
    const dq = Math.hypot(quarry.pos.x, quarry.pos.z);
    assert.ok(Math.abs(dq - QT.stageRange) < 1, `quarry staged at ${dq}`);
    const gap = Math.hypot(hunter.pos.x - quarry.pos.x, hunter.pos.z - quarry.pos.z);
    assert.ok(Math.abs(gap - QT.stageTrailGap) < 1, `trail gap ${gap}`);
    assert.equal(hunter.data.contractTargetId, quarry.id);
    assert.ok(quarry.data.name);
  } finally {
    teardown(system, bus);
  }
});

test('staging is deterministic per seed and gated out of scenarios', () => {
  const first = bootHunt();
  const second = bootHunt();
  try {
    for (const ctx of [first, second]) {
      ctx.system.update(1 / 60, ctx.state);
      ctx.state.simTime += QT.firstStageDelayS + 1;
      ctx.system.update(1 / 60, ctx.state);
    }
    const qa = first.state.entities.get(100);
    const qb = second.state.entities.get(100);
    assert.equal(qa.pos.x, qb.pos.x);
    assert.equal(qa.pos.z, qb.pos.z);
    assert.equal(qa.data.name, qb.data.name);

    const gated = bootHunt();
    try {
      gated.state.scenario = { active: true, scenarioId: '47a' };
      gated.state.simTime += QT.firstStageDelayS + 1;
      gated.system.update(1 / 60, gated.state);
      assert.equal(gated.state.entityList.length, 1);
    } finally {
      teardown(gated.system, gated.bus);
    }
  } finally {
    teardown(first.system, first.bus);
    teardown(second.system, second.bus);
  }
});

test('the quarry flees away from its hunter and squawks distress exactly once', () => {
  const { state, bus, system, said } = bootHunt();
  try {
    const { quarry, hunter } = chasePair(state, 'c-flee', 400);
    const distress = [];
    bus.on('bountyHunt:quarryDistress', (p) => distress.push(p));
    system.update(1 / 60, state);
    assert.equal(quarry.data.ai.passive, false);
    assert.equal(quarry.data.intent.mode, 'bounty_quarry_flee');
    // Hunter sits at -x of the quarry with no refuge: flight aims +x.
    assert.ok(Math.cos(quarry.data.intent.aimAngle) > 0.9);
    assert.equal(distress.length, 1);
    assert.equal(distress[0].quarryId, quarry.id);
    assert.ok(said.some((line) => line.kind === 'bounty_quarry_distress'));
    system.update(1 / 60, state);
    assert.equal(distress.length, 1);
    assert.equal(hunter.data.bountyHunt.pursuing, true);
  } finally {
    teardown(system, bus);
  }
});

test('the quarry runs for a station refuge when one is in range', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry } = chasePair(state, 'c-refuge', 400);
    place(state, {
      type: 'station', team: 0, factionId: 'faction_scn',
      pos: { x: 1200, z: 1500 }, radius: 60, mass: 1e6, hull: 500, hullMax: 500,
      data: { stationId: 'station_test', stationName: 'Test Dock' },
    }, 40);
    system.update(1 / 60, state);
    // Refuge sits +z of the quarry: flight aims +z, not away from the hunter.
    assert.ok(Math.sin(quarry.data.intent.aimAngle) > 0.9);
  } finally {
    teardown(system, bus);
  }
});

test('a pressed quarry dumps its manifest as scoopable pods', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry } = chasePair(state, 'c-dump', 300);
    const dumps = [];
    bus.on('bountyHunt:quarryDump', (p) => dumps.push(p));
    system.update(1 / 60, state);
    assert.equal(dumps.length, 1);
    const manifest = quarryManifestForContract('c-dump', state.meta.seed);
    assert.equal(dumps[0].lots, manifest.length);
    const pods = state.entityList.filter((e) => e.type === 'pickup');
    assert.equal(pods.length, manifest.length);
    for (let i = 0; i < pods.length; i++) {
      assert.equal(pods[i].data.kind, 'cargo');
      assert.equal(pods[i].data.commodityId, manifest[i].commodityId);
      assert.equal(pods[i].data.amount, manifest[i].amount);
      assert.equal(pods[i].data.quarryDump, 'c-dump');
      assert.ok(pods[i].data.despawnAt > state.simTime);
    }
    system.update(1 / 60, state);
    assert.equal(dumps.length, 1);
  } finally {
    teardown(system, bus);
  }
});

test('a beaten quarry surrenders, cuts engines, and posts a payoff on the hunter', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry, hunter } = chasePair(state, 'c-surrender', 400);
    quarry.hull = 20;
    const surrenders = [];
    bus.on('bountyHunt:quarrySurrendered', (p) => surrenders.push(p));
    system.update(1 / 60, state);
    assert.equal(quarry.data.bountyHunt.surrendered, true);
    assert.equal(quarry.data.intent.mode, 'bounty_quarry_surrendered');
    assert.equal(quarry.data.intent.moveZ, 0);
    assert.equal(surrenders.length, 1);
    assert.equal(surrenders[0].payoff, QT.surrenderBountyCr);
    assert.equal(surrenders[0].hunterId, hunter.id);
  } finally {
    teardown(system, bus);
  }
});

test('the player killing the hunter earns the quarry gratitude through canonical writers', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry, hunter } = chasePair(state, 'c-save', 400);
    system.update(1 / 60, state);
    const grants = [];
    const reps = [];
    const saved = [];
    bus.on('economy:grantCredits', (p) => grants.push(p));
    bus.on('faction:repDelta', (p) => reps.push(p));
    bus.on('bountyHunt:quarrySaved', (p) => saved.push(p));
    hunter.alive = false;
    bus.emit('entity:killed', { id: hunter.id, killerId: state.playerId });
    assert.equal(bountyHunterOutcomeForContract(state, 'c-save').outcome, 'player_defended_quarry');
    assert.equal(grants.length, 1);
    assert.equal(grants[0].amount, QT.gratitudeCr);
    assert.equal(reps.length, 1);
    assert.equal(reps[0].delta, QT.gratitudeRep);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].paid, QT.gratitudeCr);
    assert.equal(quarry.data.bountyHunt.done, true);
    assert.equal(quarry.data.ai.passive, true);
  } finally {
    teardown(system, bus);
  }
});

test('saving a surrendered quarry pays the posted payoff, not the base gratitude', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry, hunter } = chasePair(state, 'c-save-big', 400);
    quarry.hull = 10;
    system.update(1 / 60, state);
    assert.equal(quarry.data.bountyHunt.surrendered, true);
    const saved = [];
    bus.on('bountyHunt:quarrySaved', (p) => saved.push(p));
    hunter.alive = false;
    bus.emit('entity:killed', { id: hunter.id, killerId: state.playerId });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].paid, QT.surrenderBountyCr);
  } finally {
    teardown(system, bus);
  }
});

test('shooting the quarry voids gratitude but the save still records', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { hunter } = chasePair(state, 'c-void', 400);
    system.update(1 / 60, state);
    bus.emit('combat:damage', { attackerId: state.playerId, targetId: 20, amount: 5 });
    const grants = [];
    const saved = [];
    bus.on('economy:grantCredits', (p) => grants.push(p));
    bus.on('bountyHunt:quarrySaved', (p) => saved.push(p));
    hunter.alive = false;
    bus.emit('entity:killed', { id: hunter.id, killerId: state.playerId });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].paid, 0);
    assert.equal(grants.length, 0);
  } finally {
    teardown(system, bus);
  }
});

test('the player killing the quarry earns the guild cut for the assist', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry, hunter } = chasePair(state, 'c-cut', 400);
    system.update(1 / 60, state);
    const cuts = [];
    bus.on('bountyHunt:cutPaid', (p) => cuts.push(p));
    quarry.alive = false;
    bus.emit('entity:killed', { id: quarry.id, killerId: state.playerId });
    assert.equal(bountyHunterOutcomeForContract(state, 'c-cut').outcome, 'player_helped_hunter');
    assert.equal(cuts.length, 1);
    assert.equal(cuts[0].paid, QT.hunterCutCr);
    assert.equal(hunter.data.contractTargetId, null);
  } finally {
    teardown(system, bus);
  }
});

test('a hunter executing a surrendered mark records an execution, not a clean kill', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry, hunter } = chasePair(state, 'c-execute', 400);
    quarry.hull = 10;
    system.update(1 / 60, state);
    assert.equal(quarry.data.bountyHunt.surrendered, true);
    const reps = [];
    bus.on('faction:repDelta', (p) => reps.push(p));
    quarry.alive = false;
    bus.emit('entity:killed', { id: quarry.id, killerId: hunter.id });
    assert.equal(bountyHunterOutcomeForContract(state, 'c-execute').outcome, 'quarry_executed_surrendered');
    assert.equal(reps.length, 1);
    assert.equal(reps[0].delta, QT.executionRep);
  } finally {
    teardown(system, bus);
  }
});

test('a quarry that reaches refuge ends the contract and the hunter breaks off', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry, hunter } = chasePair(state, 'c-escape', 400);
    quarry.pos.x = 1200;
    quarry.pos.z = 1400;
    place(state, {
      type: 'station', team: 0, factionId: 'faction_scn',
      pos: { x: 1200, z: 1500 }, radius: 60, mass: 1e6, hull: 500, hullMax: 500,
      data: { stationId: 'station_test', stationName: 'Test Dock' },
    }, 40);
    const escapes = [];
    bus.on('bountyHunt:quarryEscaped', (p) => escapes.push(p));
    system.update(1 / 60, state);
    assert.equal(escapes.length, 1);
    assert.equal(bountyHunterOutcomeForContract(state, 'c-escape').outcome, 'quarry_escaped');
    assert.equal(hunter.data.contractTargetId, null);
    assert.equal(hunter.data.bountyHunt.pursuing, false);
    assert.equal(quarry.data.bountyHunt.done, true);
  } finally {
    teardown(system, bus);
  }
});

test('staging works through the real core spawner, not just the stub', () => {
  const state = createGameState(913);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const system = Object.create(bountyHunt);
  system.init({ state, bus, helpers });
  try {
    const staged = [];
    bus.on('bountyHunt:staged', (p) => staged.push(p));
    system.update(1 / 60, state);
    assert.equal(staged.length, 0);
    state.simTime += QT.firstStageDelayS + 1;
    system.update(1 / 60, state);
    assert.equal(staged.length, 1);
    const quarry = state.entities.get(staged[0].quarryId);
    const hunter = state.entities.get(staged[0].hunterId);
    assert.ok(quarry && hunter);
    assert.equal(quarry.type, 'ship');
    assert.equal(quarry.data.bountyHunt.role, 'quarry');
    assert.equal(hunter.data.contractTargetId, quarry.id);
    // The very next tick the live pair is already mid-chase.
    system.update(1 / 60, state);
    assert.equal(quarry.data.intent.mode, 'bounty_quarry_flee');
    assert.equal(hunter.data.bountyHunt.pursuing, true);
  } finally {
    system.destroy?.();
    bus.clear();
  }
});

test('a quarry whose hunter is gone stands down instead of fleeing forever', () => {
  const { state, bus, system } = bootHunt();
  try {
    const { quarry } = chasePair(state, 'c-cold', 400);
    system.update(1 / 60, state);
    assert.equal(quarry.data.intent.mode, 'bounty_quarry_flee');
    const hunter = state.entities.get(21);
    hunter.alive = false;
    bus.emit('entity:killed', { id: hunter.id, killerId: 999 });
    assert.equal(quarry.data.bountyHunt.done, true);
    system.update(1 / 60, state);
    assert.equal(quarry.data.ai.passive, true);
  } finally {
    teardown(system, bus);
  }
});
