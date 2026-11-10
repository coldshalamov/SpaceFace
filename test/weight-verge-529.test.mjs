// weight-verge-529 — W-VERGE (build_map §34.5 row 529, bible 02 §14).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/vergelayers.js  machine bodies, one-word glass directives, the
//                               Appeal table, the Sleeping Jury, the Line trial
//   systems/faction_verge.js    directives issue and violate (E-30 court convenes);
//                               weighed evidence grants or denies the appeal; one
//                               weighed testimony wakes one juror (E-34); a weighed
//                               Measure fragment on the Line records a Class
//
// Run: node --test test/weight-verge-529.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { vergeCourt, ensureVergeState } from '../src/systems/faction_verge.js';
import faction, {
  VERGE_MACHINE_BODIES,
  VERGE_DIRECTIVE_WORDS,
  VERGE_APPEAL,
  VERGE_SLEEPING_JURY,
  VERGE_LINE_TRIAL,
} from '../src/data/factions/vergelayers.js';
import { MACHINE_KINDS, MACHINE_DIRECTIVES } from '../src/data/precursorMachines.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [vergeCourt] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_veil_nebula';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const machine = (sim, kind, x, z, extra = {}) => sim.spawn({
  type: 'machine', team: 1, factionId: 'faction_verge_layers',
  pos: { x, z }, radius: VERGE_MACHINE_BODIES[kind].radius, mass: 400,
  hull: VERGE_MACHINE_BODIES[kind].hull, hullMax: VERGE_MACHINE_BODIES[kind].hull,
  collides: true, data: { machineKind: kind, ...extra },
});

test('data: bodies for the row’s roster; every directive is one capitalized word', () => {
  for (const kind of ['surveyor_prism', 'auditor', 'measure', 'debris_sorter',
    'executor', 'appeals_clerk', 'witness', 'sleeping_jury']) {
    assert.ok(VERGE_MACHINE_BODIES[kind], `a body for ${kind}`);
    assert.ok(MACHINE_KINDS[kind], `the kind exists in precursorMachines (${kind})`);
  }
  for (const id of Object.keys(MACHINE_DIRECTIVES)) {
    const word = VERGE_DIRECTIVE_WORDS[id];
    assert.ok(word, `a glass word for ${id}`);
    assert.match(word, /^[A-Z]+\.$/, `one capitalized word on the glass: ${word}`);
  }
  assert.equal(VERGE_APPEAL.id, 'E-30');
  assert.equal(VERGE_SLEEPING_JURY.jurorCount, 12, 'twelve dormant jurors');
  assert.equal(VERGE_LINE_TRIAL.fragmentKind, 'measure');
  assert.equal(faction.custom.weaponsDisableNotDestroy, true, 'they disable, never destroy');
});

test('a VACATE directive lands on the glass; linger past the window and the court convenes', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'appeals_clerk', 5000, 0);
    machine(sim, 'executor', 0, 0, {
      vergeDirective: 'VACATE', directiveRadius: 500, directiveWindowS: 2,
    });
    const words = [];
    bus.on('verge:directive', (p) => words.push(p));
    sim.step();
    assert.equal(words.length, 1, 'the directive was issued');
    assert.equal(words[0].word, 'VACATE.', 'one capitalized word on the glass');

    sim.runTicks(2 * 60 + 2); // still inside — the window runs out
    const v = ensureVergeState(state);
    assert.equal(v.violations.length, 1, 'the violation is on the record');
    assert.equal(v.violations[0].directive, 'VACATE');
    assert.equal(player.data.directiveViolated, true);
    assert.ok(v.court && v.court.convened, 'a Verge court convened');
  } finally {
    sim.dispose();
  }
});

test('leave inside the window and the directive is honored — no record', () => {
  const { sim, state, player } = boot();
  try {
    machine(sim, 'executor', 0, 0, {
      vergeDirective: 'VACATE', directiveRadius: 500, directiveWindowS: 2,
    });
    sim.step();
    player.pos.x = 800; // out of the radius before the window closes
    sim.runTicks(3 * 60);
    assert.equal(ensureVergeState(state).violations.length, 0, 'no violation recorded');
    assert.equal(player.data.directiveViolated, undefined);
  } finally {
    sim.dispose();
  }
});

test('E-30: the right object at the right mass wins the appeal; the wrong mass grows law', () => {
  const { sim, state, bus, player } = boot();
  try {
    const clerk = machine(sim, 'appeals_clerk', 0, 0);
    machine(sim, 'executor', 3000, 0, {
      vergeDirective: 'VACATE', directiveRadius: 400, directiveWindowS: 1,
    });
    // Break the directive first so the court convenes.
    player.pos.x = 3000;
    sim.runTicks(60 + 2);
    assert.equal(ensureVergeState(state).violations.length, 1, 'the record exists');

    // Stand in the chamber with the wrong evidence — the directive holds, law grows.
    player.pos.x = clerk.pos.x + 100;
    const wrong = sim.spawn({
      type: 'payload', team: 0, pos: { x: clerk.pos.x - 100, z: 0 },
      radius: 8, mass: 200, hull: 10, hullMax: 10, collides: true, data: { evidence: true },
    });
    const denied = [];
    bus.on('verge:appealDenied', (p) => denied.push(p));
    sim.step();
    assert.equal(denied.length, 1, 'the clerk weighed it and found it wanting');
    assert.equal(denied[0].wanted, VERGE_APPEAL.evidenceMass);
    assert.equal(ensureVergeState(state).lawZones.length, 1, 'a law zone grew on the chart');
    assert.ok(ensureVergeState(state).court.convened, 'the directive still holds');

    // Bring the right object at the right mass — the appeal is granted.
    const right = sim.spawn({
      type: 'payload', team: 0, pos: { x: clerk.pos.x + 50, z: 60 },
      radius: 8, mass: VERGE_APPEAL.evidenceMass + 2, hull: 10, hullMax: 10,
      collides: true, data: { evidence: true },
    });
    const granted = [];
    bus.on('verge:appealGranted', (p) => granted.push(p));
    sim.step();
    assert.equal(granted.length, 1, 'APPEAL HEARD.');
    assert.equal(ensureVergeState(state).violations.length, 0, 'the charge is struck');
    assert.equal(ensureVergeState(state).court, null, 'the court adjourns');
    assert.equal(player.data.directiveViolated, false);
  } finally {
    sim.dispose();
  }
});

test('E-34: a Measure Engine weighs testimony — one weighed piece wakes one juror', () => {
  const { sim, state, bus } = boot();
  try {
    machine(sim, 'measure', 0, 0, { readR: 500 });
    const jury = machine(sim, 'sleeping_jury', 4000, 0);
    const testimony = sim.spawn({
      type: 'payload', team: 0, pos: { x: 200, z: 0 }, radius: 8, mass: 30,
      hull: 10, hullMax: 10, collides: true, data: { testimony: true },
    });
    sim.step();
    assert.equal(testimony.data.weighedMass, 30, 'the engine read its true mass');

    // Weighed testimony at the jury: one juror stands.
    testimony.pos.x = jury.pos.x - 100;
    const woke = [];
    bus.on('verge:jurorWoke', (p) => woke.push(p));
    sim.step();
    assert.equal(woke.length, 1, 'JUROR PRESENT.');
    assert.equal(ensureVergeState(state).jurorsAwake, 1);
    assert.equal(testimony.data.testimonyConsumed, true, 'spent — it cannot wake two');
    sim.runTicks(5);
    assert.equal(ensureVergeState(state).jurorsAwake, 1, 'still one');

    // Unweighed testimony is hearsay — no juror stands for it.
    const hearsay = sim.spawn({
      type: 'payload', team: 0, pos: { x: jury.pos.x + 100, z: 0 }, radius: 8,
      mass: 30, hull: 10, hullMax: 10, collides: true, data: { testimony: true },
    });
    sim.runTicks(5);
    assert.equal(ensureVergeState(state).jurorsAwake, 1, 'unweighed testimony wakes nobody');
    assert.equal(hearsay.data.testimonyConsumed, undefined);
  } finally {
    sim.dispose();
  }
});

test('the Line-site Class trial: a weighed Measure fragment on the Line records a Class', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'measure', 0, 0, { readR: 500 });
    const fragment = sim.spawn({
      type: 'payload', team: 0, pos: { x: 300, z: 0 }, radius: 6, mass: 12,
      hull: 10, hullMax: 10, collides: true,
      data: { typeId: VERGE_LINE_TRIAL.fragmentTypeId, name: 'Measure Engine Fragment' },
    });
    sim.step();
    assert.ok(Number.isFinite(fragment.data.weighedMass), 'the engine weighed the fragment');

    player.tether = { active: true, targetId: fragment.id };
    const trials = [];
    bus.on('verge:lineTrialPassed', (p) => trials.push(p));
    sim.step();
    assert.equal(trials.length, 1, 'CLASS RECORDED.');
    assert.equal(trials[0].grant, VERGE_LINE_TRIAL.trialClassStep);
    assert.equal(ensureVergeState(state).lineClassGrants, 1);
    sim.runTicks(5);
    assert.equal(trials.length, 1, 'a fragment tries you once');
  } finally {
    sim.dispose();
  }
});
