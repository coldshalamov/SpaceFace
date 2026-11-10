import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeEntity } from '../src/core/entity.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';

import {
  P,
  TEMPLATES,
  REACTION_TOKENS,
  assignTemplate,
  assignReaction,
  clearReaction,
  tickProgram,
} from '../src/systems/alphabet.js';
import {
  hasMachineProtocol,
  isReactionSlotUnlocked,
} from '../src/data/alienEcology.js';

function makeFixture({
  machineProtocol = 'observed',
  templateId = 'mine_to_depot',
  reaction = null,
  threatNear = false,
  cargoFull = false,
  seed = 4242,
} = {}) {
  const player = makeEntity({ ...makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, pos: { x: 0, z: 0 },
  }), id: 1 });
  const rock = {
    id: 2,
    alive: true,
    type: 'asteroid',
    pos: { x: 50, z: 0 },
    hull: 200,
    hullMax: 200,
    data: { oreHP: 200, oreHPMax: 200 },
  };
  const station = {
    id: 3,
    alive: true,
    type: 'station',
    pos: { x: -200, z: 0 },
    data: { stationId: 'station_prime' },
  };
  const pirate = makeEntity({
    ...makeEnemySpawnSpec('reaver_pirate', 1, { x: 60, z: 10 }), id: 4,
  });

  const entities = new Map([
    [1, player],
    [2, rock],
    [3, station],
  ]);
  const entityList = [player, rock, station];

  if (threatNear) {
    entities.set(4, pirate);
    entityList.push(pirate);
  }

  const state = {
    mode: 'flight',
    simTime: 0,
    meta: { seed },
    playerId: 1,
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: cargoFull ? 40 : 0, capVolume: 40, usedMass: 0 },
    },
    world: {
      currentSectorId: 'sector_helios_prime',
      alienEcology: {
        machineProtocol,
      },
    },
    entities,
    entityList,
  };

  const group = {
    id: 'drone-alpha-1',
    originPos: { x: 0, z: 0 },
    deployRange: 500,
    bufferCap: 20,
    oreType: 'cmdty_ore_iron',
  };

  assignTemplate(group, templateId);
  if (reaction) {
    assignReaction(group, reaction);
  }

  let minedCount = 0;
  let soldAtStation = null;
  let hailedStation = null;
  let steerTarget = null;
  let steerCalls = [];

  const ctx = {
    state,
    group,
    steerTo: (beacon, dt) => {
      steerTarget = beacon;
      steerCalls.push({ beacon, dt });
      // In tests, return true to simulate immediate arrival at target
      return true;
    },
    mineIntoCargo: (dt, entity) => {
      minedCount += 1;
    },
    sellMinedCargo: (stationId) => {
      soldAtStation = stationId;
      return { ok: true };
    },
    hailStation: (stationId) => {
      hailedStation = stationId;
    },
    operationFull: () => cargoFull,
  };

  return {
    state,
    group,
    ctx,
    getMinedCount: () => minedCount,
    getSoldAtStation: () => soldAtStation,
    getHailedStation: () => hailedStation,
    getSteerTarget: () => steerTarget,
    getSteerCalls: () => steerCalls,
  };
}

test('FLT-01: precursor machine protocol gate in alienEcology unlocks reaction slot', () => {
  const stateUnknown = { world: { alienEcology: { machineProtocol: 'unknown' } } };
  assert.equal(hasMachineProtocol(stateUnknown), false, 'unknown protocol is not unlocked');
  assert.equal(isReactionSlotUnlocked(stateUnknown), false);

  const stateObserved = { world: { alienEcology: { machineProtocol: 'observed' } } };
  assert.equal(hasMachineProtocol(stateObserved), true, 'observed protocol is unlocked');
  assert.equal(isReactionSlotUnlocked(stateObserved), true);

  const stateWitnessed = { world: { alienEcology: { machineProtocol: 'witnessed' } } };
  assert.equal(hasMachineProtocol(stateWitnessed), true, 'witnessed protocol is unlocked');

  const stateException = { world: { alienEcology: { machineProtocol: 'exception' } } };
  assert.equal(hasMachineProtocol(stateException), true, 'exception protocol is unlocked');

  const stateViolation = { world: { alienEcology: { machineProtocol: 'violation' } } };
  assert.equal(hasMachineProtocol(stateViolation), false, 'violation fault locks reaction slot');

  const stateRevoked = { world: { alienEcology: { machineProtocol: 'revoked' } } };
  assert.equal(hasMachineProtocol(stateRevoked), false, 'revoked fault locks reaction slot');

  assert.equal(hasMachineProtocol(null), false);
  assert.equal(hasMachineProtocol({}), false);
});

test('FLT-01: negative branch — reaction slot does not fire when machine protocol is unknown', () => {
  const fixture = makeFixture({
    machineProtocol: 'unknown',
    reaction: REACTION_TOKENS.flee_to_station_on_threat,
    threatNear: true,
  });

  const { group, ctx, getMinedCount } = fixture;
  assert.equal(group.programState.pc, 0, 'starts at step 0 (mine)');

  // Tick the program
  tickProgram(group, ctx, 1 / 60);

  // Since protocol is unknown, interrupt must NOT trigger; continues mining
  assert.equal(group.programState.interrupt, null, 'no interrupt when protocol is unknown');
  assert.equal(getMinedCount(), 1, 'mined rock instead of fleeing');
});

test('FLT-01: positive branch — ON threat-near interrupts loop, flees to station, and resumes when threat clears', () => {
  const fixture = makeFixture({
    machineProtocol: 'observed',
    reaction: REACTION_TOKENS.flee_to_station_on_threat,
    threatNear: true,
  });

  const { group, ctx, getMinedCount, getSteerTarget } = fixture;
  assert.equal(group.programState.pc, 0, 'starts at step 0 (mine)');

  assert.equal(isHostileForAI(ctx.state, ctx.state.entities.get(1), ctx.state.entities.get(4)), true);
  // 1. Tick with a production Reaver near: interrupt triggers and steers to the depot.
  tickProgram(group, ctx, 1 / 60);

  assert.ok(group.programState.interrupt, 'interrupt is active');
  assert.equal(group.programState.interrupt.savedPc, 0, 'saved pc 0');
  assert.equal(getMinedCount(), 0, 'did not mine while fleeing');
  assert.ok(getSteerTarget(), 'steered toward a beacon');
  assert.equal(getSteerTarget().stationId, 'station_prime', 'fled to depot station');

  // 2. Clear threat
  ctx.state.entities.delete(4);
  const pirateIdx = ctx.state.entityList.findIndex((e) => e.id === 4);
  if (pirateIdx >= 0) ctx.state.entityList.splice(pirateIdx, 1);

  // Tick again with threat cleared: interrupt finishes and resumes main loop
  tickProgram(group, ctx, 1 / 60);
  assert.equal(group.programState.interrupt, null, 'interrupt cleared after threat gone');
  assert.equal(group.programState.pc, 0, 'resumed loop at saved pc');
});

test('FLT-01: positive branch — exit mode token aborts program after reaction executes', () => {
  const fixture = makeFixture({
    machineProtocol: 'observed',
    reaction: REACTION_TOKENS.evacuate_on_threat,
    threatNear: true,
  });

  const { group, ctx } = fixture;
  tickProgram(group, ctx, 1 / 60);

  // Since evacuate_on_threat is exit mode and arrival is immediate in test ctx:
  // It should clear the program
  assert.equal(group.program, null, 'program exited on evacuate');
  assert.equal(group.programState, null, 'programState cleared');
});

test('FLT-01: positive branch — ON cargo-full drops beacon and hails depot, then resumes loop', () => {
  const fixture = makeFixture({
    machineProtocol: 'compliant',
    reaction: REACTION_TOKENS.drop_beacon_and_hail_on_cargo_full,
    cargoFull: true,
  });

  const { group, ctx, getHailedStation } = fixture;
  tickProgram(group, ctx, 1 / 60);

  assert.equal(getHailedStation(), 'station_prime', 'hailed depot station');
  // Resumes loop
  assert.ok(group.program, 'program remains active after hail');
});

test('FLT-01: determinism — program without reaction slot produces byte-identical state hash on seed 4242', () => {
  function runSimulation(ticks = 60) {
    const fixture = makeFixture({
      machineProtocol: 'observed',
      reaction: null,
      threatNear: false,
      cargoFull: false,
      seed: 4242,
    });
    const { group, ctx } = fixture;
    for (let t = 0; t < ticks; t++) {
      tickProgram(group, ctx, 1 / 60);
    }
    const snap = {
      pc: group.programState.pc,
      waitT: group.programState.waitT,
      cargoWasFull: group.programState.cargoWasFull,
      mined: fixture.getMinedCount(),
      sold: fixture.getSoldAtStation(),
    };
    return crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex');
  }

  const hash1 = runSimulation(60);
  const hash2 = runSimulation(60);
  assert.equal(hash1, hash2, 'runs are deterministic on seed 4242');

  // Baseline verification: pc and values match expected straight-line template execution
  const f = makeFixture({ seed: 4242, reaction: null });
  for (let t = 0; t < 10; t++) tickProgram(f.group, f.ctx, 1 / 60);
  assert.equal(f.group.programState.pc, 0);
  assert.equal(f.getMinedCount(), 10);
});
