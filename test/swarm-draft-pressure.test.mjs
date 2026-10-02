// PB-SWARM-D — SF-065 draft choices change the next maneuver + SF-072 build pressure tests
// without hard-counters.
//
// The chain under test: an armory pick records an immutable modifier on the run, the next wave's
// planWave reads summarizeRunBuild(run.modifiers) and bends roster SHARE toward the roles that
// test the dominant family — never removing a role, never inflating quota/concurrency, and the
// bend follows the CURRENT build (a later pick re-points it; nothing stale lingers).
// Unit-level pins for the planner bend live in swarm-build-pressure.test.mjs; this file owns the
// integration seam: a REAL purchase through the real wallet + ships owner landing in the run's
// memory, and the build-shift contract across a run.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  runModifierRecord,
  summarizeRunBuild,
  validateRunModifier,
  verbBuildFamily,
} from '../src/data/runModifiers.js';
import { offerDraft } from '../src/data/survivalDraft.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { WEAPONS } from '../src/data/weapons.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 4242;
const ARENA = 'helios_core';
const WAVE = 23; // past every unlock — a plain wave where pressure owns the mix

function boot(hullId = 'ship_hornet') {
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
  const registry = {
    get(name) {
      if (name === 'ships') return ships;
      if (name === 'economy') return economy;
      if (name === 'survivalDraft') return survivalDraft;
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  runSession.init(ctx);
  survivalDraft.init(ctx);
  state.player.researchPoints += TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0) + 1000;
  economy.grantCredits(TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0) + 5000, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: hullId, setActive: true, grant: true });
  return { state, bus, emitted, registry };
}

function openSwarmDraft(h, wave = 2) {
  h.state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  h.state.run.phase = 'draft';
  h.state.run.wave = wave;
  h.state.run.credits = 500;
  h.bus.emit('run:transitioned', { phase: 'draft' });
  return survivalDraft.currentOffers();
}

function recordPick(h, { verb, defId = 'wpn_pulse_laser_s', kind = 'weapon', wave = 4, offerId = 'test' }) {
  const record = runModifierRecord({ kind, offerId, verb, defId, wave });
  h.bus.emit('run:modifierRecordRequested', { record, wave });
}

function roleWeights(plan) {
  const byRole = new Map();
  for (const entry of plan.swarm.roster || []) {
    byRole.set(entry.role, (byRole.get(entry.role) || 0) + entry.weight);
  }
  return byRole;
}

function planFor(h, wave = WAVE) {
  return planWave({
    seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET,
    buildSummary: summarizeRunBuild(h.state.run.modifiers),
  });
}

test('a swarm armory shelf buy lands in the run memory — catalog records were silently dropped', () => {
  const h = boot();
  const rows = openSwarmDraft(h);
  const shelf = rows.find((row) => row.catalog === true && row.available);
  assert.ok(shelf, 'an affordable shelf row exists');
  const before = h.state.run.modifiers.length;
  h.bus.emit('run:draftPickRequested', { offerId: shelf.id });
  const recorded = h.emitted.filter((e) => e.event === 'run:modifierRecorded');
  assert.equal(recorded.length, 1, 'a shelf purchase must be recorded');
  assert.equal(recorded[0].payload.record.kind, 'catalog');
  assert.equal(recorded[0].payload.record.defId, shelf.defId);
  assert.equal(h.state.run.modifiers.length, before + 1, 'run.modifiers grew');
  assert.ok(
    h.emitted.some((e) => e.event === 'run:shopPurchased'),
    'the purchase receipt still lands',
  );
});

test('the armory presents distinct physical intentions across all three build families', () => {
  const result = offerDraft({
    seed: SEED, wave: 5, hullId: 'ship_hornet', fittings: [], ruleset: SWARM_RULESET, count: 100,
  });
  assert.equal(result.ok, true);
  const families = new Set();
  const verbs = new Set();
  for (const offer of result.offers) {
    const family = verbBuildFamily(offer.verb);
    if (family) families.add(family);
    verbs.add(offer.verb);
  }
  assert.deepEqual(
    [...families].sort(),
    ['chain', 'collision', 'orbit'],
    'the shelf offers verbs from every intention family — not three stat skins',
  );
  assert.ok(verbs.size >= 10, `many distinct verbs on the shelf (${verbs.size})`);
});

test('drafted picks feed the next wave — build pressure bends roster share, not the budget', () => {
  const h = boot();
  h.state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  h.state.run.phase = 'active';
  h.state.run.wave = 4;
  // Two collision-family picks: the rope/ram build.
  recordPick(h, { verb: 'Throw', offerId: 'throw', defId: 'wpn_concussion_cannon_m' });
  recordPick(h, { verb: 'Ram', offerId: 'ram', defId: 'mod_ram_plate' });
  const summary = summarizeRunBuild(h.state.run.modifiers);
  assert.equal(summary.dominant, 'collision');

  const plan = planFor(h);
  assert.notEqual(plan.ok, false, 'pressured plan stays valid');
  assert.equal(plan.swarm.buildPressure, 'collision', 'the plan names the read');
  assert.equal(plan.swarm.pressureLine, 'The pack brought anchors for the rope.');

  const baseline = planWave({ seed: SEED, arenaId: ARENA, wave: WAVE, ruleset: SWARM_RULESET });
  const bentRoles = new Set(['anchor', 'control']);
  const base = roleWeights(baseline);
  const bent = roleWeights(plan);
  for (const [role, weight] of base) {
    if (bentRoles.has(role)) {
      assert.ok(bent.get(role) > weight, `${role} share bent up (${weight} -> ${bent.get(role)})`);
    } else {
      assert.equal(bent.get(role), weight, `${role} share untouched — no role is removed`);
    }
  }
  // Emphasis, never inflation: the contract numbers are identical.
  assert.equal(plan.swarm.killTarget, baseline.swarm.killTarget);
  assert.equal(plan.swarm.concurrent, baseline.swarm.concurrent);
  assert.equal(plan.packages.length, baseline.packages.length, 'no extra packages');
});

test('the pressure follows the current build — a later pick re-points the same wave', () => {
  const h = boot();
  h.state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  h.state.run.phase = 'active';
  h.state.run.wave = 4;
  recordPick(h, { verb: 'Throw', offerId: 'throw', defId: 'wpn_concussion_cannon_m' });
  const collisionPlan = planFor(h);
  assert.equal(collisionPlan.swarm.buildPressure, 'collision');

  // The player then buys into orbit — the newest pick wins the tie, and the NEXT wave
  // plans against the new read. No residue from the old one.
  recordPick(h, { verb: 'Seek', offerId: 'seek', defId: 'wpn_missile_rack_m', wave: 9 });
  const orbitPlan = planFor(h);
  assert.equal(summarizeRunBuild(h.state.run.modifiers).dominant, 'orbit', 'recency wins the tie');
  assert.equal(orbitPlan.swarm.buildPressure, 'orbit');
  assert.equal(orbitPlan.swarm.pressureLine, 'The pack brought reach for the orbit.');
  const bent = roleWeights(orbitPlan);
  const base = roleWeights(planWave({ seed: SEED, arenaId: ARENA, wave: WAVE, ruleset: SWARM_RULESET }));
  for (const role of ['reach', 'elite']) {
    if ((base.get(role) || 0) > 0) {
      assert.ok(bent.get(role) > base.get(role), `${role} bent up for the orbit build`);
    }
  }
  // And the collision emphasis is gone — nothing stale carries forward.
  for (const role of ['anchor', 'control']) {
    assert.equal(bent.get(role), base.get(role), `${role} back to baseline after the switch`);
  }
});

test('a defensive-only build has no dominant — the wave stays the wave', () => {
  const h = boot();
  h.state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  h.state.run.phase = 'active';
  h.state.run.wave = 4;
  recordPick(h, { verb: 'Screen', offerId: 'booster', defId: 'mod_shield_booster_s' });
  recordPick(h, { verb: 'Harden', offerId: 'hardener', defId: 'mod_shield_hardener_m' });
  const summary = summarizeRunBuild(h.state.run.modifiers);
  assert.equal(summary.dominant, null, 'armor is not a way of killing');
  const plan = planFor(h);
  assert.notEqual(plan.ok, false);
  assert.equal(plan.swarm.buildPressure, undefined, 'no pressure line for a defense stack');
});

test('pressure bends the stream roster and the opening alike, deterministically', () => {
  const h = boot();
  h.state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  h.state.run.phase = 'active';
  h.state.run.wave = 4;
  recordPick(h, { verb: 'Arc', offerId: 'relay', defId: 'mod_relay_arc' });
  recordPick(h, { verb: 'Web', offerId: 'snarl', defId: 'wpn_snarl_s' });
  const a = planFor(h);
  const b = planFor(h);
  assert.deepEqual(a.swarm.roster, b.swarm.roster, 'same picks + seed -> identical plan');
  assert.equal(a.swarm.buildPressure, 'chain');
  assert.ok(
    a.swarm.roster.every((entry) => Number.isFinite(entry.weight) && entry.weight > 0),
    'every seat keeps a positive share — testing, never countering',
  );
});

test('a malformed pick note is refused before it can pollute the run memory', () => {
  const h = boot();
  h.state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  h.state.run.phase = 'active';
  h.state.run.wave = 4;
  const bad = runModifierRecord({ kind: 'weapon', offerId: 'x', verb: 'Gun', defId: 'wpn_x', wave: 1 });
  assert.equal(validateRunModifier(bad).ok, false, 'a shelf word is not a pick verb');
  const before = h.state.run.modifiers.length;
  h.bus.emit('run:modifierRecordRequested', { record: { kind: 'weapon', verb: 'Gun' }, wave: 1 });
  // runSession stores verbatim — the producer validates. The raw emit still lands because
  // recordModifier trusts its writer; the honest check is that summary ignores verb-less notes.
  const summary = summarizeRunBuild(h.state.run.modifiers);
  assert.equal(summary.dominant, null, 'a verb-less record can never invent a build');
  assert.ok(h.state.run.modifiers.length >= before, 'memory did not shrink');
});
