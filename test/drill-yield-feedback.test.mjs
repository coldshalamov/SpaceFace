// Deep-core yield: real silicate veins must enter the hold; played-out rocks must say so.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeDeepCoreBudget,
  DEEP_CORE_YIELD_MULT,
  DRILL_GEOMETRY_RECOVERY_PER_S,
  drill,
  drillTierReqForOre,
  recoverClearedGeometry,
  tileIndex,
} from '../src/systems/drill.js';
import { directLawReceiptText } from '../src/ui/sectorLawPresenter.js';
import { tileLensModel } from '../src/ui/asteroid/inspector.js';
import { unitsPerSlotFor } from '../src/systems/cargo.js';
import { world } from '../src/systems/world.js';
import { applyResourceBodyToEntity, deserializeResourceBodyBag } from '../src/world/resourceBodyRecords.js';

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
      [1, { id: 1, type: 'ship', data: {} }],
      [42, asteroid],
    ]),
    world: { currentSectorId: 'sector_test' },
    fieldDepletion: {
      schemaVersion: 1,
      fields: {
        // Fully depleted field → richnessMult ≈ 0.45 (the floor-to-zero trap).
        field_a: { fieldId: 'field_a', depletion: 1, richnessMult: 0.45, extractedU: 99, destroyedCount: 9, lastChangedT: 0 },
      },
      receipts: [],
    },
    rng: () => 0.5,
  };
  const bus = {
    on() { return () => {}; },
    emit(type, payload) { events.push({ type, payload }); },
  };
  drill.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, cargo, asteroid, events, bus };
}

function breakVeinBelow(state, ore = 'cmdty_silicate', yieldU = 3) {
  const d = state.drill;
  const col = d.avatar.col;
  const row = d.avatar.row + 1;
  d.field[col][row] = {
    type: 'vein', hp: 0.01, maxHp: 5, ore, yieldU,
    hazard: false, tierReq: 1, hardness: 1,
  };
  for (let i = 0; i < 40; i++) {
    drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
  }
  return { col, row };
}

test('nickel ore requires MK2 drill head (BASIC MK1 cannot extract it)', () => {
  assert.equal(drillTierReqForOre('cmdty_ore_bronzium'), 2);
  assert.equal(drillTierReqForOre('cmdty_silicate'), 1);
  assert.equal(drillTierReqForOre('cmdty_ore_iron'), 1);
});

test('budget math never floors a still-bearing rock to zero under thin-field richness', () => {
  assert.ok(DEEP_CORE_YIELD_MULT >= 3);
  // Old bug: floor(2 * 1 * 0.45) === 0 → every real vein paid nothing.
  const thin = computeDeepCoreBudget({
    surfaceYieldU: 2,
    drillDepletion: 0,
    richnessMult: 0.45,
  });
  assert.ok(thin.max >= 2 * DEEP_CORE_YIELD_MULT, 'deep-core pool is larger than surface yieldU');
  assert.ok(thin.budget >= 1, 'fresh rock on a thin field still has deep-core budget');

  const empty = computeDeepCoreBudget({
    surfaceYieldU: 20,
    drillYieldMax: 80,
    drillDepletion: 1,
    richnessMult: 0.45,
  });
  assert.equal(empty.budget, 0, 'fully depleted rock is empty');
  assert.equal(empty.remaining, 0);
});

test('fresh silicate veins enter the hold at 60% cargo (not blocked by combat/field thinness)', () => {
  const { state, cargo, events } = harness({
    yieldU: 12,
    drillDepletion: 0,
    lastDrillT: 100,
  });
  // 60% full hold — the exact player report. Must still accept silicate.
  cargo.usedVolume = 60;
  cargo.capVolume = 100;

  assert.equal(drill.begin(42), true);
  assert.ok(state.drill.rockBudget > 0, `session budget must be positive (got ${state.drill.rockBudget})`);
  assert.equal(events.some((e) => e.type === 'drill:rockDepleted'), false);

  breakVeinBelow(state, 'cmdty_silicate', 3);
  assert.ok((state.drill.yieldLog.cmdty_silicate || 0) >= 1, 'yield log records silicate');
  assert.ok((cargo.items.cmdty_silicate || 0) >= 1, 'silicate units land in the hold');
  assert.ok(cargo.usedVolume > 60, 'used volume increases');
  assert.ok(events.some((e) => e.type === 'drill:yield'), 'drill:yield fires for HUD floaters');
  drill.end();
});

test('played-out rock emits rockDepleted on begin and pays nothing on vein break', () => {
  const { state, cargo, events } = harness({
    yieldU: 20,
    drillYieldMax: 20,
    drillDepletion: 1,
    lastDrillT: 100,
  });

  assert.equal(drill.begin(42), true);
  assert.ok(events.some((e) => e.type === 'drill:rockDepleted'), 'session start flags played-out rock');
  assert.equal(state.drill.rockBudget, 0);

  breakVeinBelow(state, 'cmdty_silicate', 3);
  assert.equal(state.drill.yieldLog.cmdty_silicate, undefined, 'played-out rock pays no ore');
  assert.equal(cargo.usedVolume, 30, 'hold volume unchanged');
  assert.ok(
    events.some((e) => e.type === 'drill:warn' && e.payload && e.payload.reason === 'depleted'),
    'vein break on empty rock must warn with reason depleted',
  );
  drill.end();
});

test('authority self-defense receipt text is the sticky card the drill UI was covering', () => {
  const text = directLawReceiptText({
    outcome: 'retaliation_authorized',
    cause: 'player_attack',
    text: 'PLAYER FIRED FIRST — self-defense authorized; break contact to disengage.',
  });
  assert.match(text, /SELF-DEFENSE AUTHORIZED/i);
});

test('exit and re-enter resumes cleared tunnels — does not replenish the whole cross-section', () => {
  const { state, asteroid } = harness({
    yieldU: 20,
    drillDepletion: 0,
    lastDrillT: 100,
  });

  assert.equal(drill.begin(42), true);
  const col = state.drill.avatar.col;
  // Dig a short shaft of empties below the entry.
  for (let row = 1; row <= 4; row++) {
    state.drill.field[col][row] = {
      type: 'dirt', hp: 0.01, maxHp: 4, ore: null, hazard: false, tierReq: 1, hardness: 0.7,
    };
    for (let i = 0; i < 40; i++) {
      drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
    }
  }
  assert.ok((asteroid.data.drillCleared || []).length >= 4, 'cleared tiles recorded during dig');
  const clearedBefore = [...asteroid.data.drillCleared];
  drill.end();

  // Re-enter same rock — seeded layout would rebuild dirt at those cells without the mask.
  assert.equal(drill.begin(42), true);
  for (const idx of clearedBefore) {
    const c = idx % 28;
    const r = Math.floor(idx / 28);
    assert.equal(
      state.drill.field[c][r].type,
      'empty',
      `tile ${c},${r} must stay empty on re-entry (got ${state.drill.field[c][r].type})`,
    );
  }
  assert.ok(
    (asteroid.data.drillCleared || []).length >= clearedBefore.length,
    'cleared set survives session end',
  );
  // Avatar should resume inside the existing tunnel, not snap to a virgin surface only.
  assert.ok(state.drill.avatar.row >= 1 || state.drill.field[state.drill.avatar.col][state.drill.avatar.row].type === 'empty');
  drill.end();
});

test('tunnel geometry recovery is cheap and gradual (5 min still mostly scarred)', () => {
  const cleared = [];
  for (let r = 0; r < 20; r++) cleared.push(tileIndex(14, r));
  const after5m = recoverClearedGeometry(cleared, 300); // 5 minutes
  const after30m = recoverClearedGeometry(cleared, 1800); // 30 minutes
  assert.ok(DRILL_GEOMETRY_RECOVERY_PER_S > 0);
  assert.ok(after5m.length >= cleared.length * 0.7,
    `5 min should leave most holes (kept ${after5m.length}/${cleared.length})`);
  assert.ok(after30m.length <= 2,
    `~30 min should fully settle tunnels (kept ${after30m.length})`);
  // Immediate re-entry: no time away → full scar list.
  assert.equal(recoverClearedGeometry(cleared, 0).length, cleared.length);
});

test('budget remaining after a session is lower on the next begin (depletion persists)', () => {
  const { state, asteroid } = harness({
    yieldU: 16,
    drillDepletion: 0,
    lastDrillT: 100,
  });
  assert.equal(drill.begin(42), true);
  const budgetStart = state.drill.rockBudget;
  assert.ok(budgetStart > 5, 'setup needs a meaningful pool');

  // Pay out several units so depletion moves.
  breakVeinBelow(state, 'cmdty_silicate', 5);
  breakVeinBelow(state, 'cmdty_silicate', 5);
  const budgetMid = state.drill.rockBudget;
  assert.ok(budgetMid < budgetStart, 'session spending reduces remaining budget');
  drill.end();
  assert.ok(asteroid.data.drillDepletion > 0, 'depletion fraction written to entity');

  assert.equal(drill.begin(42), true);
  assert.equal(state.drill.rockBudget, budgetMid, 're-entry at the same time and richness restores the remaining stock');
  assert.ok(state.drill.rockBudget > 0, 'a rock that still had budget must not read empty');
  drill.end();
});

test('the face quotes the hold and the drill refuses a vein the bag has no room for, before cutting it', () => {
  // The hold is a slot bag (stacks, then a new slot). Room is open stack space plus free slots;
  // volume is a readout. One slot, one full stack of the same ore: no room at all.
  const ore = 'cmdty_silicate';
  const { state, cargo, events } = harness({ yieldU: 20 });
  const stack = unitsPerSlotFor(state, ore);
  cargo.slotCount = 1;
  cargo.slots = [{ commodityId: ore, qty: stack }];
  cargo.items[ore] = stack;
  const setHeld = (qty) => { cargo.slots[0].qty = qty; cargo.items[ore] = qty; };
  drill.begin(42);
  const d = state.drill;
  const { col } = d.avatar;
  const tile = { type: 'vein', ore, yieldU: 6, hp: 4, maxHp: 4, tierReq: 1, hardness: 1 };
  d.field[col][1] = tile;
  const aim = { down: true };
  const quote = () => drill.getTargetTelemetry(col, 1);
  const labels = () => tileLensModel({ tile, telemetry: quote() }).chips.map(chip => chip.text);

  assert.deepEqual(quote().cut, { bank: 0, kept: 6, spent: 0 });
  assert.ok(labels().includes('No hold space'));
  drill.tickInput(aim, 1 / 60, { impulse: true });
  assert.equal(tile.hp, 4);
  assert.equal(d.drillTemp, 0);
  assert.equal(events.filter(e => e.type === 'drill:cargoFull').length, 1);

  setHeld(stack - 2);
  assert.deepEqual(quote().cut, { bank: 2, kept: 4, spent: 0 }, 'two units of stack room: two bank, four stay');
  drill.tickInput(aim, 0.25);
  assert.equal(cargo.items[ore], stack);
  assert.equal(tile.yieldU, 4);
  assert.equal(tile.hp, 0);
  setHeld(stack - 4);
  assert.deepEqual(quote().cut.bank, 4, 'room for the rest: it is collected');
  drill.tickInput(aim, 1 / 60, { impulse: true });
  assert.equal(cargo.items[ore], stack);
  assert.equal(d.field[col][1].type, 'empty');
  drill.end();
});

test('an unclaimed bore follows the rock through save data and rematerialization', () => {
  const { state, asteroid } = harness({ yieldU: 16, activityObjectSlotId: 'starter-rock' });
  asteroid.pos = { x: 20, z: 0 };
  const worldSys = Object.create(world);
  worldSys.state = state;
  drill.registry = new Map([['world', worldSys]]);
  drill.begin(42);
  const spot = breakVeinBelow(state, 'cmdty_silicate', 3);
  const budget = state.drill.rockBudget;
  drill.end();

  const serialized = JSON.parse(JSON.stringify(state.world.resourceBodies));
  const bag = deserializeResourceBodyBag(serialized);
  const record = bag.byId[asteroid.data.resourceBodyId];
  assert.equal(record.retentionClass, 'protected');
  const returned = {
    id: 43, type: 'asteroid', alive: true, data: { fieldId: 'field_a', activityObjectSlotId: 'starter-rock' },
  };
  state.entities.delete(42);
  state.entities.set(43, returned);
  applyResourceBodyToEntity(returned, record);
  drill.begin(43);
  assert.equal(returned.data.boreSeed, 42);
  assert.equal(state.drill.field[spot.col][spot.row].type, 'empty');
  assert.equal(state.drill.rockBudget, budget);
  drill.end();
});
