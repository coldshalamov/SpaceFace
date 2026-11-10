// NXB-021 — the next deep-core commitment names only known facts.
// Unscanned cells stay out of the decision. A careful tap still bites once.
// Leaving and coming back does not refill the rock or the hold.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cargoFreeUnits,
  deriveDrillCommitment,
  drill,
  drillCellEvidence,
  drillEnergyLimitCopy,
  drillHeatLimitCopy,
  knownReturnPath,
  visibleCablePoints,
} from '../src/systems/drill.js';
import {
  drillTierBlockLabel,
  drillYieldGrantCopy,
  formatDrillCommitment,
} from '../src/ui/screens/drill.js';

const HIDDEN = 'cmdty_ore_goldium';
const IRON = 'cmdty_ore_iron';
const NICKEL = 'cmdty_ore_bronzium';

function rock() {
  return {
    type: 'rock', hp: 8, maxHp: 8, ore: null, hazard: false,
    tierReq: 1, hardness: 1, surveyed: false, risk: 'low',
  };
}

function empty() {
  return { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
}

function fieldOf(width, height) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => rock()));
}

function session(field, extra = {}) {
  return {
    field,
    avatar: { col: 3, row: 2, faceDir: 'down' },
    drillEnergy: 80,
    drillTemp: 10,
    overheated: false,
    energyDepleted: false,
    rockBudget: 20,
    rockBudgetMax: 40,
    ...extra,
  };
}

function decisionField() {
  const field = fieldOf(7, 8);
  field[3][0] = empty();
  field[3][1] = empty();
  field[3][2] = empty();
  field[3][3] = {
    type: 'vein', hp: 5, maxHp: 5, ore: IRON, yieldU: 4,
    hazard: false, tierReq: 1, hardness: 1, surveyed: true, risk: 'low',
  };
  field[4][1] = {
    type: 'vein', hp: 5, maxHp: 5, ore: NICKEL, yieldU: 6,
    hazard: false, tierReq: 2, hardness: 1.2, surveyed: true, risk: 'high',
  };
  field[2][2] = {
    type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true,
    tierReq: 1, hardness: 0.5, surveyed: false, risk: 'critical',
  };
  field[0][7] = {
    type: 'vein', hp: 5, maxHp: 5, ore: HIDDEN, yieldU: 9,
    hazard: false, tierReq: 2, hardness: 1.4, surveyed: false, risk: 'high',
  };
  field[6][6] = {
    type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true,
    tierReq: 1, hardness: 0.5, surveyed: false, risk: 'critical',
  };
  return field;
}

function harness(asteroidData, cargoOverrides = {}) {
  const events = [];
  const cargo = {
    items: {},
    usedVolume: 30,
    usedMass: 10,
    capVolume: 100,
    capMass: 200,
    ...cargoOverrides,
  };
  const asteroid = {
    id: 42,
    type: 'asteroid',
    data: { fieldId: 'field_a', lastDrillT: 100, ...asteroidData },
  };
  const state = {
    simTime: 100,
    playerId: 1,
    player: { cargo, miningBeam: { tierId: 'beam_mk1', dps: 18 } },
    entities: new Map([
      [1, { id: 1, type: 'ship', hullMax: 100, data: {} }],
      [42, asteroid],
    ]),
    world: { currentSectorId: 'sector_test' },
    fieldDepletion: { schemaVersion: 1, fields: {}, receipts: [] },
    rng: () => 0.5,
  };
  const bus = {
    on() { return () => {}; },
    emit(type, payload) { events.push({ type, payload }); },
  };
  drill.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, cargo, asteroid, events };
}

function boreDown(steps = 40) {
  for (let i = 0; i < steps; i++) {
    drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
  }
}

test('the decision names known ore, a gas tell, a blocked head, and the cleared way back', () => {
  const field = decisionField();
  const commitment = deriveDrillCommitment(session(field), { tier: 1, cargoFree: 10 });
  const text = formatDrillCommitment(commitment);
  const dumped = JSON.stringify(commitment);

  assert.equal(commitment.facing.evidence, 'known');
  assert.equal(commitment.facing.ore, IRON);
  assert.equal(commitment.facing.yieldU, 4);
  assert.equal(commitment.cargoGrant, true);
  assert.equal(commitment.nearby.ore, NICKEL);
  assert.equal(commitment.nearby.blocked, true);
  assert.equal(commitment.deeper.ore, IRON);
  assert.deepEqual(commitment.suspectedGas, [{ col: 2, row: 2 }]);
  assert.deepEqual(commitment.returnPath, [
    { col: 3, row: 2 },
    { col: 3, row: 1 },
    { col: 3, row: 0 },
  ]);
  for (const cell of commitment.returnPath) {
    assert.equal(field[cell.col][cell.row].type, 'empty');
  }

  assert.match(text, /Known ore Iron Ore/);
  assert.match(text, /Next bore can pay 4u/);
  assert.match(text, /Nearby known vein: Nickel Ore/);
  assert.match(text, /Blocked — needs Mining Beam M/);
  assert.match(text, /Suspected gas beside the tunnel \(1\)/);
  assert.match(text, /Way back: 3 cleared cells/);
  assert.equal(text.includes('6u'), false);
  assert.equal(dumped.includes(HIDDEN), false);
  assert.equal(dumped.includes('"yieldU":9'), false);
  assert.equal(text.includes(HIDDEN), false);
  assert.equal(text.includes('Gold'), false);
  assert.equal(text.includes('stamina'), false);

  const shallow = drillTierBlockLabel(NICKEL, 2);
  const deep = drillTierBlockLabel(NICKEL, 40);
  assert.equal(shallow, 'Mining Beam M');
  assert.equal(shallow, deep);
  assert.equal(drillTierBlockLabel('not-an-ore', 9), '');
  assert.equal(drillCellEvidence(field, 0, 7).kind, 'unrevealed');
  assert.equal(drillCellEvidence(field, 0, 7).ore, null);
  assert.equal(drillCellEvidence(field, 6, 6).kind, 'unrevealed');
});

test('an unscanned cell is omitted even while the works-board gate stays open', () => {
  const { state } = harness({ yieldU: 12, drillDepletion: 0, lastDrillT: 100 });
  assert.equal(drill.begin(42), true);
  const d = state.drill;
  d.field[1][8] = {
    type: 'vein', hp: 5, maxHp: 5, ore: HIDDEN, yieldU: 9,
    hazard: false, tierReq: 2, hardness: 1, surveyed: false,
  };
  assert.equal(drill.isTileSurveyed(1, 8), true);
  const view = drill.commitmentView();
  assert.equal(JSON.stringify(view).includes(HIDDEN), false);
  assert.equal(formatDrillCommitment(view).includes('Gold'), false);
  drill.end();
});

test('energy exhaustion and overheating stay separate sentences', () => {
  const field = decisionField();
  const hot = deriveDrillCommitment(session(field, { overheated: true, drillTemp: 100 }), { tier: 1, cargoFree: 10 });
  const dry = deriveDrillCommitment(session(field, { energyDepleted: true, drillEnergy: 0 }), { tier: 1, cargoFree: 10 });
  const both = deriveDrillCommitment(session(field, {
    overheated: true, drillTemp: 80, energyDepleted: true, drillEnergy: 4,
  }), { tier: 1, cargoFree: 10 });
  const hotText = formatDrillCommitment(hot);
  const dryText = formatDrillCommitment(dry);
  const bothText = formatDrillCommitment(both);

  assert.equal(hot.limit, 'heat');
  assert.equal(dry.limit, 'energy');
  assert.equal(both.limit, 'both');
  assert.equal(hot.cargoGrant, false);
  assert.equal(dry.cargoGrant, false);
  assert.equal(hotText.includes(drillHeatLimitCopy()), true);
  assert.equal(dryText.includes(drillEnergyLimitCopy()), true);
  assert.equal(hotText.includes('Wait for energy'), false);
  assert.equal(dryText.includes('cool the bit'), false);
  assert.equal(bothText.includes(drillHeatLimitCopy()), true);
  assert.equal(bothText.includes(drillEnergyLimitCopy()), true);
  assert.equal(hotText.includes('stamina'), false);
  assert.equal(dryText.includes('stamina'), false);
  assert.notEqual(drillHeatLimitCopy(), drillEnergyLimitCopy());
});

test('a second tap inside the bite does not add free rock, and a mash does not beat a hold', () => {
  const { state } = harness({ yieldU: 20, drillDepletion: 0, lastDrillT: 100 });
  assert.equal(drill.begin(42), true);
  const d = state.drill;
  const col = d.avatar.col;
  d.field[col][1] = {
    type: 'rock', hp: 500, maxHp: 500, hardness: 1, ore: null,
    hazard: false, tierReq: 1, risk: 'low',
  };
  const before = d.field[col][1].hp;
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60, { impulse: true });
  const afterBite = d.field[col][1].hp;
  assert.ok(afterBite < before, 'a careful tap cuts a visible bite');
  assert.equal(d.boreBites, 1);
  drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60, { impulse: true });
  assert.equal(d.field[col][1].hp, afterBite);
  assert.equal(d.boreBites, 1);
  drill.end();

  function removed(mode) {
    drill.begin(42);
    const live = state.drill;
    const c = live.avatar.col;
    live.field[c][1] = {
      type: 'rock', hp: 500, maxHp: 500, hardness: 1, ore: null,
      hazard: false, tierReq: 1, risk: 'low',
    };
    const start = live.field[c][1].hp;
    for (let i = 0; i < 45; i++) {
      const tapping = mode === 'mash' || i === 0;
      const held = mode !== 'tap' || i === 0;
      drill.tickInput(
        { left: false, right: false, up: false, down: held },
        1 / 60,
        tapping ? { impulse: true } : undefined,
      );
    }
    const loss = start - state.drill.field[c][1].hp;
    drill.end();
    return loss;
  }

  const tap = removed('tap');
  const mash = removed('mash');
  const hold = removed('hold');
  assert.ok(tap > 0);
  assert.ok(mash <= hold, `mash removed ${mash}, hold removed ${hold}`);
  assert.ok(tap < hold);
});

test('a played-out rock does not grant cargo, and a restart does not refill the haul', () => {
  const played = harness({
    yieldU: 20,
    drillYieldMax: 80,
    drillDepletion: 1,
    lastDrillT: 100,
  });
  assert.equal(drill.begin(42), true);
  const playedDrill = played.state.drill;
  const playedCol = playedDrill.avatar.col;
  playedDrill.field[playedCol][1] = {
    type: 'vein', hp: 0.01, maxHp: 5, ore: IRON, yieldU: 4,
    hazard: false, tierReq: 1, hardness: 1, surveyed: true, risk: 'low',
  };
  playedDrill.avatar.faceDir = 'down';
  const playedView = deriveDrillCommitment(playedDrill, { tier: 1, cargoFree: cargoFreeUnits(played.cargo) });
  const playedText = formatDrillCommitment(playedView);
  assert.equal(playedView.depleted, true);
  assert.equal(playedView.cargoGrant, false);
  assert.match(playedText, /played out/);
  assert.equal(/extracted|\+\d/.test(playedText), false);
  assert.equal(drillYieldGrantCopy(0, 'Iron Ore'), '');
  assert.match(drillYieldGrantCopy(2, 'Iron Ore'), /extracted/);
  boreDown();
  assert.equal(played.events.some((event) => event.type === 'drill:yield'), false);
  assert.equal(played.cargo.items[IRON], undefined);
  assert.equal(played.cargo.usedVolume, 30);
  drill.end();

  const live = harness({ yieldU: 20, drillDepletion: 0, lastDrillT: 100 });
  assert.equal(drill.begin(42), true);
  const budgetBefore = live.state.drill.rockBudget;
  const col = live.state.drill.avatar.col;
  live.state.drill.field[col][1] = {
    type: 'vein', hp: 0.01, maxHp: 5, ore: IRON, yieldU: 3,
    hazard: false, tierReq: 1, hardness: 1, surveyed: true, risk: 'low',
  };
  boreDown();
  const gained = live.cargo.items[IRON] || 0;
  assert.ok(gained >= 1);
  const budgetAfter = live.state.drill.rockBudget;
  assert.ok(budgetAfter < budgetBefore);
  drill.begin(42);
  assert.equal(live.cargo.items[IRON], gained);
  assert.ok(live.state.drill.rockBudget < budgetBefore);
  assert.equal(live.state.drill.yieldLog[IRON], undefined);
  assert.equal(live.state.drill.field[col][1].type, 'empty');
  drill.end();
});

test('a full hold keeps the vein yield, and the way back does not cross that cell', () => {
  const { state, cargo, events } = harness({ yieldU: 20, drillDepletion: 0, lastDrillT: 100 });
  cargo.usedVolume = cargo.capVolume;
  assert.equal(drill.begin(42), true);
  let vein = null;
  for (let c = 0; c < state.drill.field.length && !vein; c++) {
    for (let r = 1; r < state.drill.field[c].length; r++) {
      const tile = state.drill.field[c][r];
      if (tile && tile.type === 'vein' && tile.ore === IRON) {
        vein = { c, r, yieldU: tile.yieldU };
        break;
      }
    }
  }
  assert.ok(vein, 'the seeded rock has a known iron seam');
  const original = vein.yieldU;
  state.drill.field[vein.c][vein.r - 1] = empty();
  state.drill.avatar.col = vein.c;
  state.drill.avatar.row = vein.r - 1;
  state.drill.avatar.fromCol = vein.c;
  state.drill.avatar.fromRow = vein.r - 1;
  state.drill.avatar.faceDir = 'down';
  state.drill.moveCooldown = 0;
  state.drill.field[vein.c][vein.r].hp = 0.01;
  boreDown();
  assert.equal(state.drill.field[vein.c][vein.r].type, 'vein');
  assert.equal(state.drill.field[vein.c][vein.r].yieldU, original);
  assert.equal(events.some((event) => event.type === 'drill:yield'), false);
  assert.equal(drill.retry(), true);
  assert.equal(state.drill.field[vein.c][vein.r].type, 'vein');
  assert.ok(state.drill.field[vein.c][vein.r].yieldU <= original);
  assert.equal(state.drill.field[vein.c][vein.r].yieldU, original);
  assert.equal(cargo.items[IRON], undefined);
  drill.end();

  const blocked = fieldOf(7, 4);
  blocked[3][2] = empty();
  blocked[3][0] = empty();
  blocked[3][1] = {
    type: 'vein', hp: 5, maxHp: 5, ore: HIDDEN, yieldU: 9,
    hazard: false, tierReq: 2, hardness: 1, surveyed: false,
  };
  const path = knownReturnPath(blocked, 3, 2);
  assert.deepEqual(path, [{ col: 3, row: 2 }]);
  assert.equal(JSON.stringify(path).includes(HIDDEN), false);
  const cable = visibleCablePoints([
    { col: 3, row: 2 },
    { col: 3, row: 1 },
    { col: 0, row: 7 },
  ], blocked);
  assert.deepEqual(cable, [{ col: 3, row: 2 }]);
});
