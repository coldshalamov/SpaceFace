// Arena phase-cycle ownership (crucible iteration 24).
//
// SWARM_ARENA_PHASE_CYCLE in src/data/swarmMode.js is one shared wave→room-state-TOKEN
// schedule, written in the canonical SURVIVAL_ARENA_PHASES vocabulary. It is deliberately
// arena-blind: the planner never reads arenaId, so every arena is dealt the same token on the
// same wave. Ownership of WHAT the token builds lives one seam later — survivalArena's
// planArenaInstallBody dispatches on `run.arenaId`, and each law arena's own module
// (lagrangeCrucible, cinderSluiceArena, cryoDriftArena, stormLatticeArena, asteroidMillArena,
// theHiveArena) translates the token into its own machinery. Helios Core and the catalog's
// law-less rooms (ceres_belt, tethys_hub) read the generic phase table — the documented
// fallback, not an override.
//
// This file pins that contract end to end:
//   (a) every law arena resolves every vocabulary token into its own non-inert machinery;
//   (b) the same wave deals the same token everywhere but installs different rooms;
//   (c) the shutter_alternating mutator still overrides the cycle token;
//   (d) the LAW_PHASE_VOICE announces the installed arena's own machinery and nothing else's.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { CINDER_SLUICE_CYCLES } from '../src/data/environmentalMachinery.js';
import { listArenaToys, SHUTTER_CYCLE } from '../src/data/arenaModuleLibrary.js';
import { SURVIVAL_ARENA_PHASES } from '../src/data/survivalWaves.js';
import {
  SWARM_ARENA_PHASE_CYCLE,
  SWARM_RULESET,
  swarmActFor,
  swarmArenaPhase,
} from '../src/data/swarmMode.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  LAW_ARENA_IDS,
  planArenaInstall,
  survivalArena,
} from '../src/systems/survivalArena.js';
import { FOUNDRY_ARENA_ID, swarmArena } from '../src/systems/swarmArena.js';
import { LAGRANGE_ARENA_ID, LAGRANGE_PYLON_SEP } from '../src/systems/lagrangeCrucible.js';
import { CINDER_ARENA_ID } from '../src/systems/cinderSluiceArena.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { STORM_ARENA_ID } from '../src/systems/stormLatticeArena.js';
import { MILL_ARENA_ID } from '../src/systems/asteroidMillArena.js';
import { HIVE_ARENA_ID } from '../src/systems/theHiveArena.js';

const SEED = 4242;
const CINDER_CYCLE = CINDER_SLUICE_CYCLES.unregulated;
const LAW_LESS_ARENAS = COMBAT_LAB_ARENAS
  .map((arena) => arena.id)
  .filter((id) => !LAW_ARENA_IDS.includes(id));

function planFor(arenaId, wave, mutators) {
  return planWave({ seed: SEED, arenaId, wave, ruleset: SWARM_RULESET, mutators });
}

function installFor(arenaId, arenaPhase, wave = 1) {
  return planArenaInstall({
    arenaId,
    arenaPhase,
    seed: SEED,
    wave,
    anchor: { x: 0, z: 0 },
    laneGate: 'front',
  });
}

function machineryCount(install) {
  return install.fields.length
    + install.mines.length
    + (install.cover ? 1 : 0)
    + listArenaToys(install).length;
}

// ── (a) the shared schedule feeds each arena's own law ───────────────────────

test('every arena is dealt the same token on the same wave — the schedule is shared', () => {
  for (const arena of COMBAT_LAB_ARENAS) {
    for (let wave = 1; wave <= 30; wave++) {
      const plan = planFor(arena.id, wave);
      assert.notEqual(plan.ok, false, `${arena.id} wave ${wave} plans`);
      const act = swarmActFor(wave);
      // The chain: authored act token beats the cycle, mutators wrap both. The act's authored
      // rounds (25-27) deliberately ride the same teaching slots the cycle would pick.
      const expected = act ? act.arenaPhase : swarmArenaPhase(wave);
      assert.equal(plan.arenaPhase, expected, `${arena.id} wave ${wave} token`);
      assert.notEqual(plan.arenaPhase, 'idle', `${arena.id} wave ${wave} room is doing something`);
    }
  }
});

test('every law arena resolves every vocabulary token into its own machinery — never inert', () => {
  for (const arenaId of LAW_ARENA_IDS) {
    for (const token of SURVIVAL_ARENA_PHASES) {
      const install = installFor(arenaId, token);
      assert.equal(install.phase, token, `${arenaId} echoes the dealt token`);
      assert.notEqual(
        install.note, 'inert room',
        `${arenaId} must own a reading of '${token}' — a law module that drops a token ships silent dead rooms`,
      );
      assert.ok(install.note.length > 0, `${arenaId} '${token}' names its own room`);
      assert.ok(
        machineryCount(install) > 0,
        `${arenaId} '${token}' installs real machinery, not a label`,
      );
    }
  }
});

test('the documented fallback: law-less arenas read the generic table — and idle stays honest', () => {
  for (const arenaId of LAW_LESS_ARENAS) {
    for (const token of SWARM_ARENA_PHASE_CYCLE) {
      const install = installFor(arenaId, token);
      assert.notEqual(install.note, 'inert room', `${arenaId} reads the generic grammar`);
      assert.ok(machineryCount(install) > 0);
    }
  }
  // No law module means no idle law to keep: a law-less room's idle is the honest nothing.
  // The Foundry is the one authored exception — its idle is the bank room itself.
  for (const arenaId of LAW_LESS_ARENAS.filter((id) => id !== FOUNDRY_ARENA_ID)) {
    assert.equal(installFor(arenaId, 'idle').note, 'inert room', `${arenaId} idle is honestly empty`);
  }
  const foundryIdle = installFor(FOUNDRY_ARENA_ID, 'idle');
  assert.notEqual(foundryIdle.note, 'inert room');
  assert.ok(listArenaToys(foundryIdle).length > 0, 'the Foundry banks stand at idle');
  // And every law arena's idle keeps the law itself — 'idle' is a live state there.
  for (const arenaId of LAW_ARENA_IDS) {
    assert.notEqual(installFor(arenaId, 'idle').note, 'inert room', `${arenaId} keeps its law at idle`);
  }
});

test('a token outside the vocabulary fails closed on a law arena — never guessed machinery', () => {
  for (const arenaId of LAW_ARENA_IDS) {
    const install = installFor(arenaId, 'plasma_flood');
    assert.equal(install.note, 'inert room', `${arenaId} refuses an unknown state`);
    assert.equal(install.fields.length, 0);
  }
});

// ── (b) same wave, different room ───────────────────────────────────────────

test('wave 2 deals furnace_active everywhere — and installs seven different rooms', () => {
  const wave = 2;
  assert.equal(swarmArenaPhase(wave), 'furnace_active', 'the audit premise: the shared token');
  const installs = {};
  for (const arena of COMBAT_LAB_ARENAS) {
    const plan = planFor(arena.id, wave);
    assert.equal(plan.arenaPhase, 'furnace_active', `${arena.id} is dealt the same token`);
    installs[arena.id] = installFor(arena.id, plan.arenaPhase, wave);
    assert.notEqual(installs[arena.id].note, 'inert room');
  }

  // The owners' voices differ — the token is one beat, each law speaks it natively.
  const owners = [...LAW_ARENA_IDS, FOUNDRY_ARENA_ID];
  const notes = new Set(owners.map((id) => installs[id].note));
  assert.equal(notes.size, owners.length, 'every owner renders the beat in its own words');
  // The law-less arenas share Helios' generic grammar — same reading, minus the authored furniture.
  for (const arenaId of LAW_LESS_ARENAS.filter((id) => id !== FOUNDRY_ARENA_ID)) {
    assert.equal(installs[arenaId].note, installs[FOUNDRY_ARENA_ID].note);
    assert.equal(listArenaToys(installs[arenaId]).length, 0, 'no Foundry furniture off Foundry');
  }

  // Foundry: the centre shove plus the furnace and the bank plates.
  const foundry = installs[FOUNDRY_ARENA_ID];
  assert.equal(foundry.fields.length, 1);
  assert.equal(foundry.fields[0].kind, 'repulsor');
  assert.ok(listArenaToys(foundry).some((t) => t.kind === 'furnace'));
  assert.ok(listArenaToys(foundry).some((t) => t.kind === 'plate'));

  // Crucible: the pylon pair repulses — two fields, opposed across the saddle.
  const lagrange = installs[LAGRANGE_ARENA_ID];
  assert.equal(lagrange.fields.length, 2);
  assert.ok(lagrange.fields.every((f) => f.kind === 'repulsor'));
  const spread = Math.hypot(
    lagrange.fields[0].center.x - lagrange.fields[1].center.x,
    lagrange.fields[0].center.z - lagrange.fields[1].center.z,
  );
  assert.ok(Math.abs(spread - LAGRANGE_PYLON_SEP * 2) < 1e-6, 'the two pylons stand opposed');

  // Sluice: one cone current at full push — the room's law is a direction, not a shove.
  const cinder = installs[CINDER_ARENA_ID];
  assert.equal(cinder.fields.length, 1);
  assert.equal(cinder.fields[0].kind, 'cone');
  assert.ok(cinder.fields[0].strength > 0);

  // Drift: occupancy fields only (strength 0) — the law is the thermal map, three hot quadrants.
  const cryo = installs[CRYO_ARENA_ID];
  assert.ok(cryo.fields.length > 0 && cryo.fields.every((f) => f.strength === 0));
  assert.equal(cryo.thermal.ne, 'hot');
  assert.equal(cryo.thermal.sw, 'hot');
  assert.equal(cryo.thermal.nw, 'cold');

  // Lattice: relays carry the room; fields are occupancy marks too.
  const storm = installs[STORM_ARENA_ID];
  assert.equal(storm.relays.length, 2, 'the lattice\'s relays are the movable machinery');
  assert.ok(storm.fields.every((f) => f.strength === 0));

  // Mill: the seam stays up — a grind flank plus the lit crusher plate in the middle.
  const mill = installs[MILL_ARENA_ID];
  assert.equal(mill.cover, true);
  assert.ok(mill.fields.some((f) => f.kind === 'cone'), 'the grind keeps turning');
  assert.ok(mill.fields.some((f) => f.kind === 'repulsor'), 'the crusher plate is lit');

  // Hive: the heart chamber seethes — a repulsor where the breath would be, no pull.
  const hive = installs[HIVE_ARENA_ID];
  assert.ok(hive.fields.some((f) => f.kind === 'repulsor'));
  assert.ok(!hive.fields.some((f) => f.kind === 'well'), 'no breath while the heart seethes');
});

test('boss waves deal the boss token — each law arena authors its own champion room', () => {
  const wave = 10;
  assert.equal(swarmArenaPhase(wave), 'boss');
  const notes = new Set();
  for (const arenaId of LAW_ARENA_IDS) {
    const plan = planFor(arenaId, wave);
    assert.equal(plan.arenaPhase, 'boss', `${arenaId} wave 10 is the boss beat`);
    const install = installFor(arenaId, plan.arenaPhase, wave);
    assert.notEqual(install.note, 'inert room');
    notes.add(install.note);
  }
  assert.equal(notes.size, LAW_ARENA_IDS.length, 'six arenas, six boss rooms');
});

// ── (c) the mutator seam is intact ──────────────────────────────────────────

test('shutter_alternating still overrides the dealt token — cycle, act and arena alike', () => {
  for (const arenaId of [FOUNDRY_ARENA_ID, CINDER_ARENA_ID, HIVE_ARENA_ID]) {
    for (const wave of [1, 2, 6, 25]) {
      const plan = planFor(arenaId, wave, ['shutter_alternating']);
      assert.notEqual(plan.ok, false, `${arenaId} wave ${wave} plans under the pact`);
      assert.equal(
        plan.arenaPhase, 'shutter_alternating',
        `${arenaId} wave ${wave}: the pact owns the room (25 is an authored act round)`,
      );
    }
  }
  // And the mutator's token still installs through each arena's own law — never bypassed.
  for (const arenaId of LAW_ARENA_IDS) {
    const install = installFor(arenaId, 'shutter_alternating');
    assert.notEqual(install.note, 'inert room', `${arenaId} reads the pact's token natively`);
  }
});

// ── (d) the law voice reads back the installed arena's own machinery ─────────

function boot(arenaId) {
  const state = createGameState(SEED);
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const emitted = [];
  bus.on('alert', (p) => emitted.push(p));
  const receipts = [];
  bus.on('swarmArena:lawPhase', (p) => receipts.push(p));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalArena.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId });
  return { state, bus, helpers, player, emitted, receipts };
}

function installLawWave(h, wave, arenaId, at = 10) {
  h.state.simTime = at;
  h.bus.emit('run:wavePlanned', { wave, plan: planFor(arenaId, wave) });
  h.state.mode = 'flight';
  h.state.run.phase = 'active';
  h.state.run.wave = wave;
  return at;
}

function lawAlerts(h) {
  return h.emitted.filter((p) => typeof p.key === 'string' && p.key.startsWith('swarm-law-'));
}

test('cinder wave 2: the sluice machinery flips and the voice names it once', () => {
  const h = boot(CINDER_ARENA_ID);
  const at = installLawWave(h, 2, CINDER_ARENA_ID);
  const installs = h.receipts.filter((p) => p.verb === 'install');
  assert.equal(installs.length, 1, 'the install itself is receipted');
  assert.equal(installs[0].arenaId, CINDER_ARENA_ID);

  h.state.simTime = at + CINDER_CYCLE.warningS + 0.1; // warning -> surge
  swarmArena.update();
  const phases = h.receipts.filter((p) => p.verb === 'phase');
  // The sluice current, the lane shutter and the mouth crusher all bite on their own clocks —
  // three sources, one flip each, all this arena's own.
  for (const kind of ['sluice', 'shutter', 'crusher']) {
    assert.equal(
      phases.filter((p) => p.source === kind && p.phase === 'surge').length, 1,
      `${kind} surge announced exactly once`,
    );
  }
  assert.ok(phases.every((p) => p.arenaId === CINDER_ARENA_ID));
  assert.ok(lawAlerts(h).some((p) => /SLUICE FIRES/.test(p.text)), 'the sluice line speaks');
});

test('lagrange wave 2: same token, different machinery — no sluice voice on the pylon law', () => {
  const h = boot(LAGRANGE_ARENA_ID);
  const at = installLawWave(h, 2, LAGRANGE_ARENA_ID); // same wave, same furnace_active token
  // Sweep two whole machinery periods: the Crucible's ridge shutter is the only cycling source.
  for (let i = 1; i <= 20; i++) {
    h.state.simTime = at + i * (SHUTTER_CYCLE.warningS + SHUTTER_CYCLE.surgeS + SHUTTER_CYCLE.calmS) / 10;
    swarmArena.update();
  }
  const phases = h.receipts.filter((p) => p.verb === 'phase');
  assert.equal(
    phases.filter((p) => p.source === 'sluice').length, 0,
    'a furnace_active token on the Crucible must never hear the Sluice — the voice reads back the installed arena, not a global assumption',
  );
  const shutterSurges = phases.filter((p) => p.source === 'shutter' && p.phase === 'surge');
  assert.equal(shutterSurges.length, 1, 'the ridge shutter\'s own flip is named once');
  assert.equal(shutterSurges[0].arenaId, LAGRANGE_ARENA_ID);
});

test('the hive speaks its install and stays out of machinery it never installed', () => {
  const h = boot(HIVE_ARENA_ID);
  const at = installLawWave(h, 2, HIVE_ARENA_ID);
  // Wave 2's token is furnace_active — on the Hive that is the heart chamber, the room's own words.
  const installs = h.receipts.filter((p) => p.verb === 'install');
  assert.equal(installs.length, 1);
  assert.equal(installs[0].arenaId, HIVE_ARENA_ID);
  assert.ok(lawAlerts(h).some((p) => /heart chamber/.test(p.text)),
    'the room line is the Hive\'s own note, not a helios phase name');

  // The Hive's mid-wave life (wall growth, sac births) lives in its own machinery, not in
  // shutter/sluice/crusher clocks — the install carries no such toys, so the voice has nothing
  // to echo. A long sweep must produce zero machinery receipts: honesty is silence.
  for (let i = 1; i <= 20; i++) {
    h.state.simTime = at + i * 1.5;
    swarmArena.update();
  }
  assert.equal(h.receipts.filter((p) => p.verb === 'phase').length, 0);
});
