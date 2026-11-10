// RC-CRUCIBLE-DOOR (row 481) — the Crucible door opens both ways:
// Run What Killed You (a seeded drill of the last Adventure death, practice law: nothing
// carries back), Call the Champion early, Wreck Ballast, Case Files of beaten champions,
// and the Grudge Ledger of top causes of death. (Per-arena kill words landed separately
// in c133f8670.)
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { SURVIVAL_MUTATOR_BY_ID } from '../src/data/survivalMutators.js';
import { SURVIVAL_UNLOCK_BY_ID } from '../src/data/survivalUnlocks.js';
import {
  CIRCUIT_BOSS_SEQUENCE,
  CIRCUIT_STAGE_COUNT,
  circuitChoicesFor,
  circuitFor,
  circuitRoundFor,
} from '../src/systems/survivalCircuit.js';
import {
  caseFilesFor,
  emptyCrucibleProfile,
  grudgeLedgerFor,
  loadCrucibleMeta,
  noteAdventureDeath,
  normalizeAdventureDeath,
  recordRulesFor,
  runWhatKilledYouOffer,
  settleCrucibleRun,
} from '../src/systems/survivalRecords.js';

const SEED = 4242;
const ARENA = 'helios_core';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test('an Adventure death files the note, and the drill it seeds is the same room every time', () => {
  const storage = memoryStorage();
  const receipt = {
    attacker: 'Corsair Reaver',
    weaponId: 'wpn_rail_lance',
    weapon: 'Rail Lance',
    factionId: 'corsairs',
    context: 'combat',
  };
  const note = noteAdventureDeath(receipt, { sectorId: 'sector_kol', storage });
  assert.ok(note, 'a named defeat is filed');
  assert.equal(note.attacker, 'Corsair Reaver');
  assert.equal(note.sectorId, 'sector_kol');

  const profile = loadCrucibleMeta(storage);
  assert.equal(profile.lastAdventureDeath.attacker, 'Corsair Reaver',
    'the note survives the load/migrate round trip');

  const offer = runWhatKilledYouOffer(profile);
  assert.ok(offer, 'the door offers the drill');
  assert.ok(Number.isInteger(offer.seed) && offer.seed > 0, 'a real run seed');
  assert.equal(offer.attacker, 'Corsair Reaver');
  assert.equal(runWhatKilledYouOffer(profile).seed, offer.seed, 'same receipt, same drill');

  noteAdventureDeath({ ...receipt, attacker: 'Brood Queen' }, { sectorId: 'sector_kol', storage });
  const second = runWhatKilledYouOffer(loadCrucibleMeta(storage));
  assert.equal(second.attacker, 'Brood Queen', 'the newest death owns the offer');
  assert.notEqual(second.seed, offer.seed, 'a different killer seeds a different drill');

  // The drill rides the practice flag — record law says a practice run files nothing and pays
  // nothing, so nothing from the drill carries back into the record.
  assert.equal(recordRulesFor({}, { practice: true }).mode, 'practice');
  assert.equal(runWhatKilledYouOffer(emptyCrucibleProfile()), null, 'no death on file, no drill');
  assert.equal(normalizeAdventureDeath({}), null, 'an empty receipt files nothing');
});

test('the Grudge Ledger counts the filed causes of defeat, most frequent first', () => {
  const storage = memoryStorage();
  const kill = (deathBy, seed) => settleCrucibleRun({
    result: {
      outcome: 'defeat', seed, arenaId: ARENA, ruleset: 'swarm',
      wave: 3, deepestWave: 3, wavesCleared: 2, kills: 9,
      score: 40 + seed % 97, credits: 5, xp: 10, picks: [],
      deathBy,
    },
    run: { seed, arenaId: ARENA, ruleset: 'swarm' },
    storage,
  });
  kill({ attacker: 'Mirrorjaw Foreman', weapon: 'Prow Ram' }, SEED);
  kill({ attacker: 'Mirrorjaw Foreman', weapon: 'Prow Ram' }, SEED + 1);
  kill({ attacker: 'Corsair Wing', weapon: 'Rail Lance' }, SEED + 2);
  kill(null, SEED + 3);

  const ledger = grudgeLedgerFor(loadCrucibleMeta(storage));
  assert.equal(ledger[0].attacker, 'Mirrorjaw Foreman');
  assert.equal(ledger[0].weapon, 'Prow Ram');
  assert.equal(ledger[0].count, 2, 'repeat killers climb the ledger');
  assert.equal(ledger[1].attacker, 'Corsair Wing');
  assert.equal(ledger.length, 3, 'a causeless defeat still counts — as unidentified');
  assert.equal(ledger[2].attacker, 'unidentified');

  // A victory never files a cause, even if a stale receipt tries to ride it.
  settleCrucibleRun({
    result: {
      outcome: 'victory', seed: SEED + 9, arenaId: ARENA, ruleset: 'swarm',
      wave: 16, deepestWave: 16, wavesCleared: 16, kills: 60,
      score: 900, credits: 90, xp: 200, picks: [],
      deathBy: { attacker: 'Nobody', weapon: 'Nothing' },
    },
    run: { seed: SEED + 9, arenaId: ARENA, ruleset: 'swarm' },
    storage,
  });
  assert.equal(grudgeLedgerFor(loadCrucibleMeta(storage)).length, 3, 'victories never accuse');
});

test('Case Files name the champions filed journeys beat — a service stop proves nothing', () => {
  const storage = memoryStorage();
  const circuit = {
    version: 1,
    startArenaId: ARENA,
    route: [
      { stage: 1, arenaId: ARENA, nodeId: ARENA },
      { stage: 2, arenaId: 'repair', nodeId: 'repair', nodeKind: 'service' },
      { stage: 3, arenaId: 'cryo_drift', nodeId: 'cryo_drift' },
    ],
    clearedStages: 3,
    revision: 4,
    // 'route' is the legal resting status here: the journey stands at a stage-four pick.
    status: 'route',
    wonAtWave: null,
  };
  settleCrucibleRun({
    result: {
      outcome: 'defeat', seed: SEED, arenaId: ARENA, ruleset: 'swarm',
      wave: 11, deepestWave: 11, wavesCleared: 10, kills: 30,
      score: 400, credits: 40, xp: 100, picks: [],
      circuit,
    },
    run: { seed: SEED, arenaId: ARENA, ruleset: 'swarm', telemetry: { circuit } },
    storage,
  });
  const files = caseFilesFor(loadCrucibleMeta(storage));
  assert.deepEqual(files.map((f) => f.championId), [CIRCUIT_BOSS_SEQUENCE[0], CIRCUIT_BOSS_SEQUENCE[2]],
    'stages 1 and 3 fought their champions; the repair dock never did');
  assert.equal(files[0].label, 'Mirrorjaw Foreman');
  assert.equal(files[0].count, 1);
  assert.equal(files[0].lastSeed, SEED);
});

// ── Call the Champion + Wreck Ballast need the live run harness ──────────────

function makeHarness() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  return { state, bus, emitted, spawned, ctx, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function choose(h, offerId) {
  h.bus.emit('run:circuitChoiceRequested', { offerId });
  const rows = named(h.emitted, 'run:circuitChoiceApplied');
  return rows[rows.length - 1].payload;
}

test('Call the Champion: the call is offered, commits, and one boss round settles the stage', () => {
  const h = makeHarness();
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  assert.equal(h.state.run.phase, 'loadout');
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  // runSession swaps in a cloned run on commit — always read state.run fresh.
  const run = h.state.run;
  assert.equal(run.phase, 'draft');

  // Begin the journey, then stand where a cleared stage one leaves the run: route phase,
  // stage two on offer.
  const applied = choose(h, 'circuit_start_w0_r1');
  assert.equal(applied.accepted, true, applied.reason);
  const circuit = circuitFor(h.state.run);
  const nextCircuit = { ...circuit, clearedStages: 1, status: 'route', revision: 2 };
  h.state.run.telemetry.circuit = nextCircuit;
  h.state.run.wave = 4;

  const choices = circuitChoicesFor(run);
  const calls = choices.filter((c) => c.kind === 'route' && c.fight === 'champion');
  assert.equal(calls.length, CIRCUIT_STAGE_COUNT >= 2 ? 2 : 0, 'every stage-2 destination offers the call');
  assert.match(calls[0].label, /^Champion · /);
  const call = calls[0];

  const committed = choose(h, call.id);
  assert.equal(committed.accepted, true, committed.reason);
  const entry = circuitFor(run).route.find((e) => e.stage === 2);
  assert.equal(entry.fight, 'champion');
  assert.equal(entry.arenaId, call.arenaId);

  // The champion answers at the door: stage two's first round IS the boss round, not the
  // authored special that slot would otherwise hold.
  const first = circuitRoundFor(run, 5);
  assert.equal(first.stage, 2);
  assert.equal(first.localRound, 1);
  assert.equal(first.kind, 'boss');
  assert.equal(first.bossId, CIRCUIT_BOSS_SEQUENCE[1]);
  // And no second champion waits at the stage's back wall if it ever replays that slot.
  assert.notEqual(circuitRoundFor(run, 8).kind, 'boss');

  // Killing it settles the whole stage: the clear advances like a stage boundary and the wave
  // index jumps to where the stage would have ended — the skipped rounds were never fought.
  run.wave = 5;
  survivalRun._advanceCircuitOnClear(run);
  const after = circuitFor(run);
  assert.equal(after.clearedStages, 2);
  assert.equal(after.status, 'route');
  assert.equal(run.wave, 8, 'the next planned round opens stage three');
});

test('Wreck Ballast: the mutator is earned, catalogued, and the room it fields is wreckage', () => {
  assert.equal(SURVIVAL_MUTATOR_BY_ID.wreck_ballast.label, 'Wreck Ballast');
  assert.equal(SURVIVAL_UNLOCK_BY_ID.unlock_mutator_wreck_ballast.grants.mutators[0], 'wreck_ballast');

  const h = makeHarness();
  const ballastRun = {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA, wave: 2,
    arenaMutators: ['wreck_ballast'],
  };
  h.state.run = ballastRun;
  swarmArena._topUp(ballastRun, 2);
  const wrecks = h.spawned.filter((e) => e.data && e.data.swarmArenaDebris === true);
  assert.ok(wrecks.length > 0, 'the ballast room still fields its debris');
  assert.ok(wrecks.every((e) => e.type === 'wreck'), 'every spawned body is a dead hull');

  // Same room, same seed, no mutator: ordinary rock.
  const h2 = makeHarness();
  const plainRun = { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA, wave: 2, arenaMutators: [] };
  h2.state.run = plainRun;
  swarmArena._topUp(plainRun, 2);
  const rocks = h2.spawned.filter((e) => e.data && e.data.swarmArenaDebris === true);
  assert.ok(rocks.length > 0, 'the control room fields debris too');
  // The family wheel already mixes some debris in — the mutator's law is "all of it".
  assert.ok(rocks.some((e) => e.type === 'asteroid'), 'without the mutator the field is mixed, not all ballast');
  assert.ok(rocks.some((e) => e.type === 'wreck' || e.type === 'asteroid'), 'only physics bodies');
});
