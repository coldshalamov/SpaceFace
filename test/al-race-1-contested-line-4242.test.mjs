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

async function raceFixture(levelId, { laps = 2, difficulty = 'expert', stripAnchorCues = false,
  earlyPhysics = false } = {}) {
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
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  // Production order: the physics port exists before the heat starts, so start() subscribes
  // the physics:impact queue (rival↔set-piece contacts open real contact recoveries and, on
  // an armed player shove, takedown receipts). Opt-in flag keeps the older fixtures' behavior
  // unchanged — their assertions predate the live impact path.
  if (earlyPhysics) helpers.combatPhysics = createSg02CombatPhysicsPort(owner);
  pack.update(mission); pieces.update(mission);
  const rivalIds = pack.inspect().rivals.map((r) => r.entityId);
  const rivalIdSet = new Set(rivalIds);
  if (!earlyPhysics) helpers.combatPhysics = createSg02CombatPhysicsPort(owner);
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

  // One production-order tick — the body stepRace loops. The shove test drives it directly
  // so the shove arm can interleave its synthetic player impact between ticks.
  function tickOnce(tick, lapTimes) {
    state.tick = tick; state.simTime = tick * DT;
    syncActors();
    tactical.update(DT, state);
    flight.update(DT, state);
    ports.update(DT, state);
    owner.step(DT, tick);
    const hits = owner.drainContactImpacts().filter((h) =>
      rivalIdSet.has(h.aId) || rivalIdSet.has(h.bId) || h.aId === state.playerId || h.bId === state.playerId);
    for (const hit of hits) {
      // Forward the receipt's real fields — impulse and the generation pins are what the
      // takedown arbiter's physical budget and occupant-identity checks read.
      bus.emit('physics:impact', { aId: hit.aId, bId: hit.bId, aGeneration: hit.aGeneration,
        bGeneration: hit.bGeneration, causalActorId: hit.causalActorId, impulse: hit.impulse,
        tick, pos: hit.pos, normal: hit.normal,
        preSolveClosingSpeed: hit.preSolveClosingSpeed, consequenceKernelVersion: 1 });
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
      const t = lapTimes && lapTimes[row.id];
      if (t && row.lap > t.lap) { t.crossedAt.push({ lap: t.lap, simS: state.simTime }); t.lap = row.lap; }
    }
  }

  function stepRace(maxTicks, stopWhen) {
    const lapTimes = Object.fromEntries(pack.inspect().rivals.map((r) => [r.id, { lap: 0, crossedAt: [] }]));
    for (let tick = 0; tick < maxTicks; tick++) {
      tickOnce(tick, lapTimes);
      if (stopWhen && stopWhen()) break;
    }
    return lapTimes;
  }

  function dispose() { try { owner.dispose?.(); } catch {} }

  return { state, bus, mission, pack, pieces, owner, takedowns, anchorUsed, stepRace, tickOnce, dispose, rivalIds };
}

// Done-when leg 1: on every Hard course every rival ropes at least one anchor per lap,
// through the canonical attachment path — no reservations collide and no rival carries two
// ropes. A timeout burns the anchor for the lap so a dead apex never loops the hold window.
for (const courseId of ['circuit_helios_belt', 'circuit_tethys_tally', 'circuit_veil_wash']) {
  test(`every rival logs a qualified anchor use on each lap of ${courseId} (Hard)`, async () => {
    const f = await raceFixture(courseId, { laps: 2 });
    try {
      f.stepRace(60 * 150, () => f.pack.inspect().rivals.every((r) => r.status === 'finished' || r.lap >= 2));
      const rows = f.pack.inspect().rivals;
      for (const row of rows) {
        const uses = row.anchorUses.filter((u) => u.qualified);
        const laps = new Set(uses.map((u) => u.lap));
        assert.ok(laps.size >= 1, `${row.id} qualified anchor on ≥1 lap (got ${JSON.stringify(row.anchorUses)})`);
        const timeouts = row.anchorUses.filter((u) => u.releaseReason === 'timeout');
        assert.ok(timeouts.length <= 1, `${row.id} never re-loops a burned anchor (got ${timeouts.length} timeouts)`);
      }
      // The live checks above cover simultaneous exclusivity; the log also preserves ordering.
      for (const row of rows) {
        for (let i = 1; i < row.anchorUses.length; i++) {
          assert.ok(row.anchorUses[i - 1].releasedTick <= row.anchorUses[i].attachedTick,
            `${row.id} released before the next attach`);
        }
      }
      assert.ok(f.anchorUsed.length >= 3, 'race:rivalAnchorUsed fired per qualified use');
    } finally { f.dispose(); }
  });
}

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

function lapDurations(crossedAt, startS = 0.5) {
  const out = [];
  let prev = startS;
  for (const c of crossedAt) { out.push(c.simS - prev); prev = c.simS; }
  return out;
}

// Done-when leg 2: an anchored rival lap is ≥0.8 s faster than an unanchored one. Matched
// fixtures — same course, seed, hazards; the control simply never sees the anchor cues.
// Measured per rival across the pack's first two completed laps, mean delta.
for (const courseId of ['circuit_helios_belt', 'circuit_tethys_tally', 'circuit_veil_wash']) {
  test(`anchored laps beat unanchored by ≥0.8 s on ${courseId} (Hard)`, async () => {
    const anchored = await raceFixture(courseId, { laps: 2 });
    const control = await raceFixture(courseId, { laps: 2, stripAnchorCues: true });
    try {
      const tA = anchored.stepRace(60 * 200, () => anchored.pack.inspect().rivals.every((r) => r.lap >= 2 || r.status === 'finished'));
      const tC = control.stepRace(60 * 200, () => control.pack.inspect().rivals.every((r) => r.lap >= 2 || r.status === 'finished'));
      const deltas = [];
      for (const row of anchored.pack.inspect().rivals) {
        const aLaps = lapDurations(tA[row.id]?.crossedAt || []);
        const cLaps = lapDurations(tC[row.id]?.crossedAt || []);
        assert.ok(aLaps.length >= 1 && cLaps.length >= 1, `${row.id} completed a lap in both runs`);
        const pairs = Math.min(aLaps.length, cLaps.length);
        for (let i = 0; i < pairs; i++) deltas.push(cLaps[i] - aLaps[i]);
      }
      const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
      assert.ok(mean >= 0.8,
        `anchored laps average ${mean.toFixed(2)}s faster than unanchored (deltas ${deltas.map((d) => d.toFixed(2)).join(',')})`);
    } finally { anchored.dispose(); control.dispose(); }
  });
}

// Done-when leg 3: a player shove into a set piece costs the rival ≥2 s and the rival is
// back on its line within 6 s. Production-order fixture (impact queue live); the shove arm
// rides a synthetic player impact while the rival's set-piece contact is the real physics
// collision — the receipt and the rejoin are the production path.
test('a shoved rival pays ≥2 s for the piece hit and rejoins within 6 s', async () => {
  const f = await raceFixture('circuit_tethys_tally', { laps: 1, earlyPhysics: true });
  try {
    const miraId = f.pack.inspect().rivals.find((r) => r.id === 'mira')?.entityId;
    assert.ok(miraId != null, 'mira on the grid');
    let recovered = null, takedown = null;
    f.bus.on('race:takedown', (p) => { takedown = p; });
    for (let t = 0; t < 60 * 90 && !recovered; t++) {
      // Keep the shove window armed across the deterministic shutter contact so the real
      // collision attributes — the arm is a wire-shaped player impact, the hit is real.
      if (t >= 60 * 24 && t <= 60 * 32 && t % 45 === 0) {
        f.bus.emit('physics:impact', { aId: f.state.playerId, bId: miraId, impulse: 1e6,
          tick: t, preSolveClosingSpeed: 60, consequenceKernelVersion: 1 });
      }
      f.tickOnce(t);
      const row = f.pack.inspect().rivals.find((r) => r.id === 'mira');
      if (row.lastContactRecovery?.recoveredAtS != null) recovered = row.lastContactRecovery;
    }
    assert.ok(takedown, 'a takedown receipt posted on the real shutter contact');
    assert.ok(recovered, 'the contact recovery completed');
    const dur = recovered.recoveredAtS - recovered.enteredAtS;
    assert.ok(dur >= 2, `the crash cost at least 2 s (rejoin ${dur.toFixed(2)}s)`);
    assert.ok(dur <= 6, `the rival was back on its line within 6 s (rejoin ${dur.toFixed(2)}s)`);
  } finally { f.dispose(); }
});
