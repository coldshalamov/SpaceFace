// Row 394 AL-RACE-1 — the line is contested (seed 4242). Real rivals use the Massline's own
// verbs: they take physical anchors through canonical kernel attachments. Faster anchored
// laps remain an open tuning clause; these tests cover qualified use and exclusive ropes.
// Native bodies + the real combat-physics port throughout — no pose teleports.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { RACE_LEVELS, RACE_CONTRACTS, racingSeedFor } from '../src/data/raceLevels.js';
import { configureRacingCorridorSession } from '../src/world/racingCorridor.js';
import { createRacingOpponents } from '../src/missions/racingOpponents.js';
import { createRacingSetPieces } from '../src/missions/racingSetPieces.js';

const DT = 1 / 60;

function levelById(id) { return RACE_LEVELS.find((l) => l.course.courseId === id); }

async function raceFixture(levelId, { laps = 2, difficulty = 'expert', stripAnchorCues = false } = {}) {
  const level = levelById(levelId);
  const contract = RACE_CONTRACTS.find((r) => r.levelId === level.id);
  const state = createGameState(racingSeedFor(contract.id));
  const bus = createBus();
  const helpers = {};
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  Object.create(core).init(ctx);
  const world = Object.create(worldSystem); world.init(ctx);
  configureRacingCorridorSession(state, true);
  const player = helpers.spawnEntity({ type: 'ship', isPlayer: true, pos: { x: 50000, z: 50000 }, radius: 32 });
  state.playerId = player.id;
  world.enterSector(level.sectorId);
  const mission = { id: 'al-race-1', type: 'race', status: 'active', params: {
    racingContractId: contract.id, raceMode: 'race', raceDifficulty: difficulty, raceOpponents: 3,
    courseId: level.course.courseId, courseSectorId: level.sectorId, gates: level.course.gates,
    gateRadiusWU: level.course.gateRadiusWU, courseLengthWU: level.course.courseLengthWU,
    closedCircuit: true, laps, nextGate: 0, gridUntilSimS: 0.5, raceStartSimS: 0.5,
  } };
  state.missions.active = [mission];
  const pack = createRacingOpponents(ctx);
  const pieces = createRacingSetPieces(ctx);
  const flight = Object.create(flightV3); flight.init(ctx);
  const ports = Object.create(aiPorts); ports.init(ctx);
  const tactical = createTacticalAISystem(); tactical.init(ctx);
  pack.update(mission); pieces.update(mission);
  const rivalIds = pack.inspect().rivals.map((r) => r.entityId);
  const rivalIdSet = new Set(rivalIds);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  helpers.combatPhysics = createSg02CombatPhysicsPort(owner);
  // The kernel the opponents owner resolves through kernelFor() — driven each tick so live
  // tension telemetry reaches the loaded-tick counter, exactly as combat's postPhysics does.
  const kernel = getCombatKernel({ state, bus, helpers });
  if (stripAnchorCues) {
    // Control: same bodies, same course — the planner simply never sees the anchor cues.
    // update() re-points params.raceSetPieces at the owner's live cue array every tick, so the
    // anchors must leave that array itself, not a filtered copy.
    const cues = mission.params.raceSetPieces || [];
    for (let i = cues.length - 1; i >= 0; i--) if (cues[i].kind === 'anchor') cues.splice(i, 1);
  }
  const takedowns = [];
  const anchorUsed = [];
  bus.on('race:takedown', (p) => takedowns.push(p));
  bus.on('race:rivalAnchorUsed', (p) => anchorUsed.push(p));

  function syncActors() {
    const actors = [];
    for (const e of state.entityList) if (e && e.pos) actors.push(e);
    owner.syncFromEntities(actors);
  }

  function stepRace(maxTicks, stopWhen) {
    const lapTimes = Object.fromEntries(pack.inspect().rivals.map((r) => [r.id, { lap: 0, crossedAt: [] }]));
    for (let tick = 0; tick < maxTicks; tick++) {
      state.tick = tick; state.simTime = tick * DT;
      syncActors();
      tactical.update(DT, state);
      flight.update(DT, state);
      ports.update(DT, state);
      owner.step(DT, tick);
      const hits = owner.drainContactImpacts().filter((h) =>
        rivalIdSet.has(h.aId) || rivalIdSet.has(h.bId) || h.aId === state.playerId || h.bId === state.playerId);
      for (const hit of hits) {
        bus.emit('physics:impact', { aId: hit.aId, bId: hit.bId, tick, pos: hit.pos, normal: hit.normal,
          preSolveClosingSpeed: hit.closingSpeed, consequenceKernelVersion: 1 });
      }
      pack.update(mission);
      pieces.update(mission);
      kernel.attachments.updateTelemetryAndBreak();
      const rows = pack.inspect().rivals;
      const liveAnchors = rows.filter((row) => row.anchor);
      assert.equal(new Set(liveAnchors.map((row) => row.anchor.anchorId)).size, liveAnchors.length,
        'two rivals cannot hold the same anchor');
      for (const row of rows) {
        const ropes = Object.values(state.combat.attachments.byId)
          .filter((a) => a.state === 'active' && a.ownerId === row.entityId);
        assert.ok(ropes.length <= 1, `${row.id} carries at most one live rope`);
        if (row.anchor) {
          assert.equal(ropes.length, 1, `${row.id} anchor has a live canonical attachment`);
          assert.equal(ropes[0].id, row.anchor.attachmentId);
        }
        const t = lapTimes[row.id];
        if (t && row.lap > t.lap) { t.crossedAt.push({ lap: t.lap, simS: state.simTime }); t.lap = row.lap; }
      }
      if (stopWhen && stopWhen()) break;
    }
    return lapTimes;
  }

  function dispose() { try { owner.dispose?.(); } catch {} }

  return { state, bus, mission, pack, pieces, owner, takedowns, anchorUsed, stepRace, dispose, rivalIds };
}

// Done-when leg 1: on the Hard course every rival ropes at least one anchor per lap, through
// the canonical attachment path — no reservations collide and no rival carries two ropes.
test('every rival logs a qualified anchor use on each lap of the Hard course', async () => {
  const f = await raceFixture('circuit_helios_belt', { laps: 2 });
  try {
    f.stepRace(60 * 150, () => f.pack.inspect().rivals.every((r) => r.status === 'finished' || r.lap >= 2));
    const rows = f.pack.inspect().rivals;
    for (const row of rows) {
      const uses = row.anchorUses.filter((u) => u.qualified);
      const laps = new Set(uses.map((u) => u.lap));
      for (const lap of [0, 1]) {
        assert.ok(laps.has(lap), `${row.id} qualified anchor on lap ${lap + 1} (got ${JSON.stringify(row.anchorUses)})`);
      }
    }
    // The live checks above cover simultaneous exclusivity; the log also preserves ordering.
    for (const row of rows) {
      for (let i = 1; i < row.anchorUses.length; i++) {
        assert.ok(row.anchorUses[i - 1].releasedTick <= row.anchorUses[i].attachedTick,
          `${row.id} released before the next attach`);
      }
    }
    assert.ok(f.anchorUsed.length >= 6, 'race:rivalAnchorUsed fired per qualified use');
  } finally { f.dispose(); }
});

test('Mira ropes the Quarry Hook on at least two laps', async () => {
  const f = await raceFixture('circuit_helios_belt', { laps: 2 });
  try {
    f.stepRace(60 * 150, () => f.pack.inspect().rivals.find((r) => r.id === 'mira')?.lap >= 2);
    const mira = f.pack.inspect().rivals.find((r) => r.id === 'mira');
    const hooks = new Set(mira.anchorUses.filter((u) => u.qualified && u.anchorId === 'quarry_hook').map((u) => u.lap));
    for (const lap of [0, 1]) {
      assert.ok(hooks.has(lap), `mira qualified quarry_hook on lap ${lap + 1} (got ${JSON.stringify(mira.anchorUses)})`);
    }
  } finally { f.dispose(); }
});

// Matched fixtures — identical course/seed/hazards, only the anchor cues withheld in the
// control. The mechanism is causal: the control takes zero anchors, the anchored run's uses
// all ride canonical attachments. The remaining done-when (anchored mean ≥0.8 s faster) is
// the OPEN tuning clause on the board — the swing's steer/release geometry is not yet paying.
test('the anchor path is causal — control fixture takes none, anchored fixture qualifies them', async () => {
  const anchored = await raceFixture('circuit_helios_belt', { laps: 2 });
  const control = await raceFixture('circuit_helios_belt', { laps: 2, stripAnchorCues: true });
  try {
    const t1 = anchored.stepRace(60 * 150, () => anchored.pack.inspect().rivals.every((r) => r.lap >= 2 || r.status === 'finished'));
    control.stepRace(60 * 150, () => control.pack.inspect().rivals.every((r) => r.lap >= 2 || r.status === 'finished'));
    for (const row of control.pack.inspect().rivals) {
      assert.equal(row.anchorUses.length, 0, `${row.id} control took no anchors`);
    }
    for (const row of anchored.pack.inspect().rivals) {
      assert.ok(row.anchorUses.some((u) => u.qualified), `${row.id} anchored run has a qualified use`);
      const a = t1[row.id];
      assert.ok(a.crossedAt.length >= 1, `${row.id} completed a lap in the anchored run`);
    }
  } finally { anchored.dispose(); control.dispose(); }
});
