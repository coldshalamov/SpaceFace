import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENCOUNTERS, barkText, receiptText, tollAmountFor,
} from '../src/data/encounters.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ENCOUNTER_SCRIPTS, createEncounterShapeMeter } from '../src/systems/encounterScripts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const WAKE = 'minefield_wake';

// A director with real methods (offerChoices, takeTithe, cargoValue) over a fake state.
function directorOver(state, emitted) {
  const d = Object.create(encounterDirector);
  d.state = state;
  d.emit = (name, payload) => { emitted.push({ name, payload }); };
  return d;
}

function makeState(items) {
  const state = {
    simTime: 100,
    encounterShapeMeter: createEncounterShapeMeter(),
    player: {
      credits: 500,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      cargo: { items: { ...items }, usedVolume: 10, usedMass: 10 },
    },
    world: {},
    entities: new Map(),
  };
  state.entities.set('jackal-1', {
    id: 'jackal-1', alive: true, pos: { x: 600, z: 0 }, data: { lootTableId: 'mine_layer_jackal' },
  });
  return state;
}

// Script delegate: real director behavior where it matters, scripted world elsewhere.
function scriptDelegate(state, emitted, opts = {}) {
  const dir = directorOver(state, emitted);
  return {
    now: () => state.simTime,
    player: () => state.player,
    cargoValue: () => dir.cargoValue(),
    takeTithe: (amount) => dir.takeTithe(amount),
    stream: () => () => 0.5,
    spawnShips: (live, ships) => ships.map((s, i) => `spawn-${i}`),
    setPassive: (live, passive) => { emitted.push({ name: 'setPassive', payload: { passive } }); },
    say: (live, channel, textOrId, vars, o) => {
      emitted.push({ name: channel === 'bark' || channel === 'alert' ? `say:${channel}` : 'say', payload: { textOrId, vars, o } });
    },
    offerChoices: (live, ids, timeout, deadline) => dir.offerChoices(live, ids, timeout, deadline),
    despawnAll: (live, r) => { emitted.push({ name: 'despawnAll', payload: { r } }); },
    resolve: (live, outcome, o) => {
      emitted.push({ name: 'resolved', payload: { outcome, vars: (o && o.vars) || live.vars } });
      return outcome;
    },
    abort: (live, reason) => { emitted.push({ name: 'aborted', payload: { reason } }); return 'aborted'; },
    rep: () => {},
    dangerImpulse: () => {},
    minDist2ToSquad: () => (opts.close ? 100 * 100 : 5000 * 5000),
    aliveCount: () => (opts.dead ? 0 : 2),
    playerNearZone: () => false,
    entsOf: () => [state.entities.get('jackal-1')],
    emit: (name, payload) => { emitted.push({ name, payload }); },
    charge: () => {},
  };
}

function liveFor(shapeId, playerPos = { x: 0, z: 0 }) {
  return {
    id: 'live-wake-1',
    shapeId,
    shape: ENCOUNTERS[shapeId],
    plan: { zoneType: 'trade_lane', ships: [{ archetype: 'mine_layer_jackal' }, { archetype: 'pd_screen_escort' }] },
    vars: {},
    data: {},
    ids: ['jackal-1'],
    phase: 'telegraph',
    factionId: 'faction_reach',
    sectorId: 'sector_test',
    zoneId: 'zone_test',
    anchor: { x: 600, z: 0 },
    playerPos,
  };
}

const RICH_HOLD = { cmdty_ore_iron: 10, cmdty_stolen_goods: 4 };
const priceOf = (id) => COMMODITIES.find((c) => c.id === id).basePrice;
const RICH_HOLD_VALUE = Object.entries(RICH_HOLD)
  .reduce((sum, [id, n]) => sum + n * priceOf(id), 0);

test('minefield wake opens a demand: own bark, three options, 12 s window', () => {
  const emitted = [];
  const state = makeState(RICH_HOLD);
  const d = scriptDelegate(state, emitted);
  const live = liveFor(WAKE);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  assert.equal(live.phase, 'offer');
  assert.equal(live.deadlineAt, 112, 'declared offerS 12 honored as the decision window');
  assert.equal(live.vars.amount, tollAmountFor(RICH_HOLD_VALUE));
  const bark = emitted.find((e) => e.name === 'say:bark');
  assert.equal(bark.payload.textOrId, 'wake_tithe_demand');
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  assert.ok(offer, 'choices are offered — the recovered contract');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['pay', 'refuse', 'run']);
  assert.ok(offer.payload.options.every((o) => o.available), 'rich hold can pay');
  assert.equal(offer.payload.timeoutChoice, 'refuse');
});

test('paying the tithe takes the best goods first and resolves paid', () => {
  const emitted = [];
  const state = makeState(RICH_HOLD);
  const d = scriptDelegate(state, emitted);
  const live = liveFor(WAKE);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'pay');
  // Tithe from the hold: one stolen good covers it — best first.
  assert.deepEqual(state.player.cargo.items, { cmdty_ore_iron: 10, cmdty_stolen_goods: 3 });
  assert.ok(emitted.some((e) => e.name === 'despawnAll'), 'crew peels off with the take');
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'paid');
  const receipt = receiptText(WAKE, 'paid', resolved.payload.vars);
  assert.match(receipt, /1× Stolen Goods/);
  assert.match(receipt, /peels off to scoop/);
});

test('a hold too poor to tithe falls through to refusal and the spring', () => {
  const emitted = [];
  const state = makeState(RICH_HOLD);
  const d = scriptDelegate(state, emitted);
  const live = liveFor(WAKE);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  state.player.cargo.items = { cmdty_scrap_metal: 1 }; // dumped after the demand: 8 cr
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'pay');
  assert.ok(emitted.some((e) => e.name === 'say:bark' && e.payload.textOrId === 'toll_broke_ack'));
  assert.equal(live.phase, 'conflict', 'broke tithe collapses into the spring');
  assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, 3, 'mines still seed');
  assert.equal(state.entities.get('jackal-1').data.ai.engagementTrigger, 'explicit_refusal');
});

test('every spring path stamps a robbery escalation trigger the guns accept', () => {
  const ESCALATION = new Set(['explicit_refusal', 'ignored_demand', 'player_attack']);
  const cases = [
    { via: 'refuse', trigger: 'explicit_refusal' },
    { via: 'timeout', trigger: 'ignored_demand' },
    { via: 'attack', trigger: 'player_attack' },
    { via: 'proximity', trigger: 'ignored_demand' },
  ];
  for (const { via, trigger } of cases) {
    const emitted = [];
    const state = makeState(RICH_HOLD);
    const d = scriptDelegate(state, emitted, { close: via === 'proximity' });
    const live = liveFor(WAKE);
    ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
    if (via === 'refuse') ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'refuse');
    else if (via === 'timeout') {
      state.simTime = 112;
      ENCOUNTER_SCRIPTS.ambush.tick(d, live, state, state.simTime);
    } else if (via === 'attack') ENCOUNTER_SCRIPTS.ambush.event(d, live, state, 'playerHitSquad');
    else {
      state.simTime = 104;
      ENCOUNTER_SCRIPTS.ambush.tick(d, live, state, state.simTime);
    }
    const ai = state.entities.get('jackal-1').data.ai;
    assert.ok(ESCALATION.has(ai.engagementTrigger), `${via} stamps ${ai.engagementTrigger}`);
    assert.equal(ai.engagementTrigger, trigger);
    assert.equal(ai.motiveSatisfied, false);
  }
});

test('conflict ends: cleared on wipe, escaped at range', () => {
  const emitted = [];
  const state = makeState(RICH_HOLD);
  const d = scriptDelegate(state, emitted, { dead: true });
  const live = liveFor(WAKE);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'refuse');
  ENCOUNTER_SCRIPTS.ambush.tick(d, live, state, state.simTime);
  const cleared = emitted.find((e) => e.name === 'resolved');
  assert.equal(cleared.payload.outcome, 'cleared');

  const emitted2 = [];
  const state2 = makeState(RICH_HOLD);
  const d2 = scriptDelegate(state2, emitted2); // far: minDist2 huge
  const live2 = liveFor(WAKE);
  ENCOUNTER_SCRIPTS.ambush.fire(d2, live2, state2);
  ENCOUNTER_SCRIPTS.ambush.choose(d2, live2, state2, 'refuse');
  ENCOUNTER_SCRIPTS.ambush.tick(d2, live2, state2, state2.simTime);
  const escaped = emitted2.find((e) => e.name === 'resolved');
  assert.equal(escaped.payload.outcome, 'escaped');
});

test('refuse and timeout spring the trap immediately, mines and all', () => {
  for (const via of ['refuse', 'timeout']) {
    const emitted = [];
    const state = makeState(RICH_HOLD);
    const d = scriptDelegate(state, emitted, { close: false });
    const live = liveFor(WAKE);
    ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
    if (via === 'refuse') {
      ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'refuse');
    } else {
      state.simTime = 112; // past the 12 s decision window, still far off
      ENCOUNTER_SCRIPTS.ambush.tick(d, live, state, state.simTime);
    }
    assert.equal(live.phase, 'conflict', `${via} springs without waiting for proximity`);
    assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, 3);
    assert.ok(emitted.some((e) => e.name === 'say:bark' && e.payload.textOrId === 'toll_refused_ack'));
    const tele = emitted.find((e) => e.name === 'say:alert' && e.payload.o && e.payload.o.literal);
    assert.match(String(tele.payload.textOrId), /Wake mines arming/, 'declared telegraph finally voiced');
  }
});

test('run burns off-axis before the trap shuts', () => {
  const emitted = [];
  const state = makeState(RICH_HOLD);
  const d = scriptDelegate(state, emitted);
  const live = liveFor(WAKE);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'run');
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'escaped');
  assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, 0, 'no spring, no mines');
  assert.match(receiptText(WAKE, 'escaped', {}), /did not hold you/);
});

test('choiceless ambushes are untouched: silent stalk, proximity spring', () => {
  const emitted = [];
  const state = makeState(RICH_HOLD);
  const d = scriptDelegate(state, emitted, { close: true });
  const live = liveFor('tether_control_raider_ambush');
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  assert.equal(live.deadlineAt, 400, '300 s stalk preserved');
  assert.ok(!emitted.some((e) => e.name === 'encounter:choiceOffered'), 'no offer without choices');
  const bark = emitted.find((e) => e.name === 'say:bark');
  assert.equal(bark.payload.textOrId, 'ambush_tele');
  state.simTime = 104; // past springAt, inside the spring radius
  ENCOUNTER_SCRIPTS.ambush.tick(d, live, state, state.simTime);
  assert.equal(live.phase, 'conflict');
  // A stray choice against a choiceless ambush is a no-op, never a crash.
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'pay');
  assert.equal(live.phase, 'conflict');
});

test('wake demand bark and cleared receipt read', () => {
  const tithe = tollAmountFor(RICH_HOLD_VALUE);
  assert.match(barkText('wake_tithe_demand', { amount: tithe }), new RegExp(String(tithe)));
  assert.match(receiptText(WAKE, 'cleared', {}), /weigh-slip/);
});
