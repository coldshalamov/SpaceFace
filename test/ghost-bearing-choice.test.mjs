// Ghost on the Bearing decision beat (INFERENCE-14).
//
// The Quiet ghost ambush used to be choiceless: one generic stalk bark, then a proximity
// spring or a silent despawn. Declaring choices on the shape opts the ambush script into
// demand mode — a priced contract demand with a timed fork: buy out the contract (credits),
// hold the bearing (fight), or burn off it (flee). Harness mirrors minefield-wake-choice.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENCOUNTERS, barkText, receiptText,
} from '../src/data/encounters.js';
import { ENCOUNTER_SCRIPTS, createEncounterShapeMeter } from '../src/systems/encounterScripts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const GHOST = 'ghost_on_the_bearing';

function directorOver(state, emitted) {
  const d = Object.create(encounterDirector);
  d.state = state;
  d.emit = (name, payload) => { emitted.push({ name, payload }); };
  return d;
}

function makeState(credits = 600) {
  const state = {
    simTime: 100,
    encounterShapeMeter: createEncounterShapeMeter(),
    player: {
      credits,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      cargo: { items: {}, usedVolume: 10, usedMass: 10 },
    },
    world: {},
    entities: new Map(),
  };
  state.entities.set('ghost-1', {
    id: 'ghost-1', alive: true, pos: { x: 600, z: 0 }, data: { lootTableId: 'quiet_ghost' },
  });
  return state;
}

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
    rep: (factionId, delta, reason) => { emitted.push({ name: 'faction:repDelta', payload: { factionId, delta, reason } }); },
    dangerImpulse: () => {},
    minDist2ToSquad: () => (opts.close ? 100 * 100 : 5000 * 5000),
    aliveCount: () => (opts.dead ? 0 : 2),
    playerNearZone: () => false,
    entsOf: () => [state.entities.get('ghost-1')],
    emit: (name, payload) => { emitted.push({ name, payload }); },
    charge: (amount, reason) => dir.charge(amount, reason),
  };
}

function liveFor(shapeId, playerPos = { x: 0, z: 0 }) {
  return {
    id: 'live-ghost-1',
    shapeId,
    shape: ENCOUNTERS[shapeId],
    plan: { zoneType: 'ambush_lane', ships: [{ archetype: 'quiet_ghost' }, { archetype: 'lancer_sniper' }] },
    vars: {},
    data: {},
    ids: ['ghost-1'],
    phase: 'telegraph',
    factionId: 'faction_quiet',
    sectorId: 'sector_test',
    zoneId: 'zone_test',
    anchor: { x: 600, z: 0 },
    playerPos,
  };
}

test('the ghost opens a priced contract demand: three options, 12 s window, 420 cr', () => {
  const emitted = [];
  const state = makeState(600);
  const d = scriptDelegate(state, emitted);
  const live = liveFor(GHOST);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  assert.equal(live.phase, 'offer');
  assert.equal(live.deadlineAt, 112, 'declared offerS 12 honored as the decision window');
  assert.equal(live.vars.amount, 420, 'flat contract price, not a cargo-scaled toll');
  const bark = emitted.find((e) => e.name === 'say:bark');
  assert.equal(bark.payload.textOrId, 'ghost_contract_demand');
  assert.equal(bark.payload.vars.amount, 420, 'the demand names the price');
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  assert.ok(offer, 'the decision is offered, not narrated');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['buyout', 'refuse', 'run']);
  assert.ok(offer.payload.options.every((o) => o.available), 'a funded pilot sees all three');
  assert.equal(offer.payload.timeoutChoice, 'refuse', 'silence reads as refusal, per the shape');
});

test('buyout charges the contract price, thanks the payer, resolves paid', () => {
  const emitted = [];
  const state = makeState(600);
  const d = scriptDelegate(state, emitted);
  const live = liveFor(GHOST);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'buyout');
  const charge = emitted.find((e) => e.name === 'economy:chargeCredits');
  assert.ok(charge, 'the buyout goes through the single-writer credit charge');
  assert.equal(charge.payload.amount, 420);
  assert.equal(charge.payload.reason, 'contract:quiet_buyout');
  assert.ok(emitted.some((e) => e.name === 'say:bark' && e.payload.textOrId === 'ghost_contract_bought_ack'));
  assert.ok(emitted.some((e) => e.name === 'despawnAll'), 'the lock releases: the ghost is gone');
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'paid');
  assert.equal(resolved.payload.vars.amount, 420);
  const receipt = receiptText(GHOST, 'paid', resolved.payload.vars);
  assert.match(receipt, /CONTRACT VOIDED/);
  assert.match(receipt, /420/, 'the receipt names the price paid');
});

test('buyout on empty pockets collapses to refusal: broke ack, then the spring', () => {
  const emitted = [];
  const state = makeState(50); // can't cover the 420 cr contract
  const d = scriptDelegate(state, emitted);
  const live = liveFor(GHOST);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'buyout');
  assert.ok(emitted.some((e) => e.name === 'say:bark' && e.payload.textOrId === 'ghost_broke_ack'));
  assert.ok(emitted.some((e) => e.name === 'say:bark' && e.payload.textOrId === 'ghost_refused_ack'));
  assert.equal(live.phase, 'conflict', 'a broke buyout is still a refusal');
  const ai = state.entities.get('ghost-1').data.ai;
  assert.equal(ai.engagementTrigger, 'explicit_refusal');
  assert.equal(ai.motive, 'assassination', 'the contract motive survives the spring');
});

test('refuse, timeout, and opening fire all spring with the assassination trigger', () => {
  const cases = [
    { via: 'refuse', trigger: 'explicit_refusal' },
    { via: 'timeout', trigger: 'ignored_demand' },
    { via: 'attack', trigger: 'player_attack' },
  ];
  for (const { via, trigger } of cases) {
    const emitted = [];
    const state = makeState(600);
    const d = scriptDelegate(state, emitted);
    const live = liveFor(GHOST);
    ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
    if (via === 'refuse') ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'refuse');
    else if (via === 'timeout') {
      state.simTime = 112;
      ENCOUNTER_SCRIPTS.ambush.tick(d, live, state, state.simTime);
    } else ENCOUNTER_SCRIPTS.ambush.event(d, live, state, 'playerHitSquad');
    assert.equal(live.phase, 'conflict', `${via} springs the ambush`);
    const ai = state.entities.get('ghost-1').data.ai;
    assert.equal(ai.engagementTrigger, trigger, `${via} stamps ${trigger}`);
    assert.equal(ai.motive, 'assassination');
    assert.ok(emitted.some((e) => e.name === 'say:alert' && e.payload.textOrId === 'ghost_spring'),
      `${via} voices the quiet spring bark, not the Reach ambush line`);
    const tele = emitted.find((e) => e.name === 'say:alert' && e.payload.o && e.payload.o.literal);
    assert.match(String(tele.payload.textOrId), /Trust the drive flare/, 'declared telegraph voiced');
  }
});

test('run burns off the bearing: flee ack, no spring, escaped', () => {
  const emitted = [];
  const state = makeState(600);
  const d = scriptDelegate(state, emitted);
  const live = liveFor(GHOST);
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, state);
  ENCOUNTER_SCRIPTS.ambush.choose(d, live, state, 'run');
  assert.ok(emitted.some((e) => e.name === 'say:bark' && e.payload.textOrId === 'ghost_flee_ack'));
  assert.ok(emitted.some((e) => e.name === 'despawnAll'));
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'escaped');
  assert.equal(emitted.filter((e) => e.name === 'say:alert' && e.payload.textOrId === 'ghost_spring').length, 0,
    'burning off never springs the trap');
});

test('ghost demand bark and receipts read', () => {
  assert.match(barkText('ghost_contract_demand', { amount: 420 }), /420/);
  assert.match(receiptText(GHOST, 'cleared', {}), /GHOST BROKEN/);
  assert.match(receiptText(GHOST, 'paid', { amount: 420 }), /420/);
});
