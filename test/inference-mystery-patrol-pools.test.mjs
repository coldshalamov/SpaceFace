// Mystery/patrol pressure pools — the two authored decks that could never fund a beat.
// Done check: pools initialize alongside combat/civilian, accrue deterministically from zone
// state, and unblock the pacing gate's 'pressure' clause for real authored shapes.
import assert from 'node:assert/strict';
import test from 'node:test';

import { encounterDirector, encounterPacingBlockReason } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';

const IO = 'sector_io_reach';
const TETHYS = 'sector_tethys_junction';

function makeState(sectorId) {
  const entities = new Map();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, flags: {} };
  entities.set(1, player);
  return {
    playerId: 1,
    entities,
    simTime: 1000,
    tick: 0,
    player: { flags: {}, credits: 0, cargo: { items: {} }, bounty: 0, heat: 0 },
    onboarding: { active: false, finished: true },
    ui: {},
    world: { currentSectorId: sectorId },
    meta: { seed: 8008 },
    story: { beatIndex: 10 },
  };
}

function makeDirector(state) {
  const dir = Object.create(encounterDirector);
  dir.init({ state, bus: { on() {}, emit() {} }, helpers: {}, registry: null });
  return dir;
}

function parkAt(state, sectorId, local) {
  const player = state.entities.get(state.playerId);
  player.pos = sectorLocalToGlobalForSector({ x: local.x, z: local.z }, sectorId);
}

function dirHarness() {
  return {
    pending: [], active: {}, live: {}, plannedKey: null,
    pressure: { combat: 0, civilian: 0, mystery: 0, patrol: 0 },
    noise: { mining: 0 }, window: [], cooldowns: {},
    named: {}, externalNamed: {}, receipts: [],
    stats: { fired: 0, resolved: 0, fizzled: 0 },
    lastMeaningfulAt: -1e9, lastAmbientAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9,
    escalationSeeds: [], _accum: 0, proxStarve: {},
  };
}

test('the director initializes all four pressure pools, including legacy states', () => {
  const state = makeState(IO);
  makeDirector(state);
  const p = state.encounterDirector.pressure;
  for (const deck of ['combat', 'civilian', 'mystery', 'patrol']) {
    assert.ok(Number.isFinite(p[deck]), `pool ${deck} initialized`);
  }

  // A save from before the pools existed must normalize, not crash or NaN.
  const legacy = makeState(IO);
  legacy.encounterDirector = { pressure: { combat: 12 } };
  const dir = makeDirector(legacy);
  dir.update(1 / 60, legacy);
  const lp = legacy.encounterDirector.pressure;
  assert.equal(lp.combat, 12, 'existing pressure survives normalization');
  for (const deck of ['civilian', 'mystery', 'patrol']) {
    assert.ok(Number.isFinite(lp[deck]), `legacy state gains pool ${deck}`);
  }
});

test('mystery pressure accrues where its wrecks lie; patrol inside a cordon zone', () => {
  // zone_io_derelict is the only authored derelict_field in Io Reach — the mystery deck's home.
  const derelict = zonesForSector(IO).find((z) => z.type === 'derelict_field');
  assert.ok(derelict, 'Io Reach has a derelict field for the mystery deck');
  const inField = makeState(IO);
  parkAt(inField, IO, derelict.center);
  const dField = makeDirector(inField);
  dField._accrue(inField.encounterDirector, inField, 60);
  const mysteryInField = inField.encounterDirector.pressure.mystery;

  const open = makeState(IO);
  parkAt(open, IO, { x: 0, z: -4000 }); // deep empty space — no authored zone
  const dOpen = makeDirector(open);
  dOpen._accrue(open.encounterDirector, open, 60);
  const mysteryOpen = open.encounterDirector.pressure.mystery;

  assert.ok(mysteryInField > mysteryOpen,
    `standing in the derelict field banks mystery faster (${mysteryInField.toFixed(1)} > ${mysteryOpen.toFixed(1)})`);
  assert.ok(mysteryOpen > 0, 'mystery still drifts in open frontier');

  // Tethys customs checkpoint is the patrol deck's authored cordon.
  const checkpoint = zonesForSector(TETHYS).find((z) => z.type === 'border_checkpoint');
  assert.ok(checkpoint, 'Tethys has a border checkpoint for the patrol deck');
  const atGate = makeState(TETHYS);
  parkAt(atGate, TETHYS, checkpoint.center);
  const dGate = makeDirector(atGate);
  dGate._accrue(atGate.encounterDirector, atGate, 60);
  const patrolAtGate = atGate.encounterDirector.pressure.patrol;

  const openTethys = makeState(TETHYS);
  parkAt(openTethys, TETHYS, { x: -3800, z: 3800 });
  const dTethysOpen = makeDirector(openTethys);
  dTethysOpen._accrue(openTethys.encounterDirector, openTethys, 60);
  const patrolOpen = openTethys.encounterDirector.pressure.patrol;

  assert.ok(patrolAtGate > patrolOpen,
    `standing in the checkpoint banks patrol faster (${patrolAtGate.toFixed(1)} > ${patrolOpen.toFixed(1)})`);
});

test('the pacing gate funds authored mystery and patrol shapes', () => {
  const state = makeState(IO);

  const mysteryShape = ENCOUNTERS.side_botched_procedure;
  assert.ok(mysteryShape, 'the botched procedure is a live authored shape');
  assert.equal(mysteryShape.deck, 'mystery');
  const dMystery = dirHarness();
  assert.equal(encounterPacingBlockReason(dMystery, state, mysteryShape, 1000), 'pressure',
    'an unfunded mystery pool still blocks the beat');
  dMystery.pressure.mystery = mysteryShape.pressureCost;
  assert.equal(encounterPacingBlockReason(dMystery, state, mysteryShape, 1000), null,
    'a funded mystery pool lets the beat through the pressure gate');

  const patrolShape = ENCOUNTERS.customs_logic_net;
  assert.ok(patrolShape, 'the customs logic net is a live authored shape');
  assert.equal(patrolShape.deck, 'patrol');
  const dPatrol = dirHarness();
  assert.equal(encounterPacingBlockReason(dPatrol, state, patrolShape, 1000), 'pressure',
    'an unfunded patrol pool still blocks the scan');
  dPatrol.pressure.patrol = patrolShape.pressureCost;
  assert.equal(encounterPacingBlockReason(dPatrol, state, patrolShape, 1000), null,
    'a funded patrol pool lets the cordon through the pressure gate');
});
