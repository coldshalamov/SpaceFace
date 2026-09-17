import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENCOUNTERS, barkText, receiptText,
} from '../src/data/encounters.js';
import { ENCOUNTER_SCRIPTS, createEncounterShapeMeter } from '../src/systems/encounterScripts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const CURTAIN = 'curtain_convoy';
const WARDEN = 'vael_warden_convoy';

// A director with real methods (offerChoices) over a fake state.
function directorOver(state, emitted) {
  const d = Object.create(encounterDirector);
  d.state = state;
  d.emit = (name, payload) => { emitted.push({ name, payload }); };
  return d;
}

function makeState() {
  return {
    simTime: 100,
    tick: 6000,
    encounterShapeMeter: createEncounterShapeMeter(),
    player: {
      credits: 500,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      cargo: { items: {}, usedVolume: 0, usedMass: 0 },
    },
    world: {},
    entities: new Map(),
  };
}

// Script delegate: real director behavior where it matters, scripted world elsewhere.
function scriptDelegate(state, emitted) {
  const dir = directorOver(state, emitted);
  return {
    now: () => state.simTime,
    player: () => state.player,
    stream: () => () => 0.5,
    stationsInSector: () => [],
    spawnShips: (live, ships) => ships.map((s, i) => {
      const id = `ent-${i}`;
      live.roles[id] = s.role;
      state.entities.set(id, {
        id,
        alive: true,
        pos: { ...s.pos },
        vel: { x: 0, z: 0 },
        rot: 0,
        team: s.team,
        data: { ai: {}, lootTableId: s.archetype || s.role },
      });
      return id;
    }),
    entsOf: (live, role) => Object.entries(live.roles || {})
      .filter(([, r]) => !role || r === role)
      .map(([id]) => state.entities.get(id))
      .filter((e) => e && e.alive !== false),
    aliveCount: (live, role) => Object.entries(live.roles || {})
      .filter(([, r]) => !role || r === role)
      .map(([id]) => state.entities.get(id))
      .filter((e) => e && e.alive !== false).length,
    setPassive: (live, passive, role) => { emitted.push({ name: 'setPassive', payload: { passive, role } }); },
    say: (live, channel, textOrId, vars, o) => {
      emitted.push({ name: `say:${channel}`, payload: { textOrId, vars, o } });
    },
    offerChoices: (live, ids, timeout, deadline) => dir.offerChoices(live, ids, timeout, deadline),
    despawnAll: (live, r) => { emitted.push({ name: 'despawnAll', payload: { r } }); },
    resolve: (live, outcome, o) => {
      emitted.push({ name: 'resolved', payload: { outcome, vars: (o && o.vars) || live.vars } });
      return outcome;
    },
    abort: (live, reason) => { emitted.push({ name: 'aborted', payload: { reason } }); return 'aborted'; },
    rep: (faction, delta, reason) => { emitted.push({ name: 'rep', payload: { faction, delta, reason } }); },
    grant: (amount, reason) => { emitted.push({ name: 'grant', payload: { amount, reason } }); },
    tradePressure: (stationId, cargoId, units) => {
      emitted.push({ name: 'tradePressure', payload: { stationId, cargoId, units } });
    },
    freightLoss: (live, o) => { emitted.push({ name: 'freightLoss', payload: o }); return true; },
    clearPredation: (live, reason) => { emitted.push({ name: 'clearPredation', payload: { reason } }); },
    dangerImpulse: () => {},
    emit: (name, payload) => { emitted.push({ name, payload }); },
  };
}

function liveFor(shapeId, { predation = false } = {}) {
  const shape = ENCOUNTERS[shapeId];
  return {
    id: 'live-convoy-1',
    shapeId,
    shape,
    plan: {
      zoneType: 'trade_lane',
      ships: [
        { role: 'hauler', archetype: 'mule_trader' },
        { role: 'raider', archetype: 'pd_screen_escort' },
        { role: 'raider', archetype: 'reaver_pirate' },
      ],
      predation: predation ? shape.predation : undefined,
    },
    vars: {},
    data: {},
    roles: {},
    phase: 'telegraph',
    factionId: shape.factionId,
    sectorId: 'sector_test',
    zoneId: 'zone_test',
    anchor: { x: 0, z: 0 },
    zoneRadius: 800,
  };
}

function haulerOf(d, live) {
  return d.entsOf(live, 'hauler')[0];
}

test('curtain convoy opens a stance offer while predation telegraphs', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor(CURTAIN, { predation: true });
  assert.ok(live.plan.predation && live.plan.predation.enabled, 'live 329 carries predation');
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  assert.equal(live.phase, 'offer');
  assert.equal(live.data.offerDeadlineAt, 112, 'declared offerS 12 is the decision window');
  assert.equal(live.deadlineAt, 300, 'transit deadline stays physical (default 200 s run)');
  const bark = emitted.find((e) => e.name === 'say:news');
  assert.equal(bark.payload.textOrId, 'curtain_convoy_alert');
  assert.equal(bark.payload.o && bark.payload.o.primary, true);
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  assert.ok(offer, 'choices are offered — the recovered contract');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['defend', 'raid', 'pass']);
  assert.equal(offer.payload.timeoutChoice, 'pass');
  assert.equal(offer.payload.deadlineAt, 112);
  assert.ok(emitted.some((e) => e.name === 'encounter:predationTelegraph'), 'predation still arms under the offer');
  assert.equal(live.data.convoyStance, undefined, 'no stance before the player answers');
});

test('defend pledges the screen: ack, rep, transit — escorted on an intact arrival', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor(CURTAIN);
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  ENCOUNTER_SCRIPTS.convoy.choose(d, live, state, 'defend');
  assert.equal(live.data.convoyStance, 'defend');
  assert.equal(live.vars.stance, 'defend');
  assert.equal(live.phase, 'transit');
  const ack = emitted.find((e) => e.name === 'say:bark');
  assert.equal(ack.payload.textOrId, 'convoy_guard_ack');
  assert.equal(ack.payload.vars.faction, 'MTS', 'the grateful carrier faction, not the raiders');
  assert.deepEqual(
    emitted.find((e) => e.name === 'rep').payload,
    { faction: 'faction_mts', delta: 1, reason: 'convoy_defend_pledge' },
  );
  // Show up in person and let the freight dock intact.
  const hauler = haulerOf(d, live);
  state.player.pos = { ...hauler.pos };
  ENCOUNTER_SCRIPTS.convoy.tick(d, live, state, state.simTime);
  assert.equal(live.data.noticed, true, 'closing with the hauler marks the convoy witnessed');
  hauler.pos = { ...live.data.end };
  ENCOUNTER_SCRIPTS.convoy.tick(d, live, state, state.simTime);
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'escorted');
  assert.ok(!emitted.some((e) => e.name === 'grant'), 'no pay without kills — the pledge is not a click reward');
  assert.deepEqual(
    emitted.filter((e) => e.name === 'rep').map((e) => e.payload),
    [
      { faction: 'faction_mts', delta: 1, reason: 'convoy_defend_pledge' },
      { faction: 'faction_mts', delta: 2, reason: 'convoy_escorted' },
    ],
    'pledge plus wingman note, nothing else',
  );
  assert.match(receiptText(CURTAIN, 'escorted', resolved.payload.vars), /under your wing/);
});

test('defend plus real kills pays guarded to the carrier faction', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor(CURTAIN);
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  ENCOUNTER_SCRIPTS.convoy.choose(d, live, state, 'defend');
  ENCOUNTER_SCRIPTS.convoy.event(d, live, state, 'squadKill', { role: 'raider', id: 'ent-2', byPlayer: true });
  assert.equal(live.data.guardKills, 1);
  haulerOf(d, live).pos = { ...live.data.end };
  ENCOUNTER_SCRIPTS.convoy.tick(d, live, state, state.simTime);
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'guarded');
  assert.deepEqual(
    emitted.find((e) => e.name === 'grant').payload,
    { amount: 200, reason: 'convoy:guard' },
  );
  assert.match(receiptText(CURTAIN, 'guarded', resolved.payload.vars), /MTS owes you/);
});

test('raid pledges the pack — killing the hauler flags robbed', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor(CURTAIN);
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  ENCOUNTER_SCRIPTS.convoy.choose(d, live, state, 'raid');
  assert.equal(live.data.convoyStance, 'raid');
  assert.equal(live.phase, 'transit');
  const ack = emitted.find((e) => e.name === 'say:bark');
  assert.equal(ack.payload.textOrId, 'convoy_raid_ack');
  assert.deepEqual(
    emitted.find((e) => e.name === 'rep').payload,
    { faction: 'faction_reach', delta: 1, reason: 'convoy_raid_pledge' },
  );
  ENCOUNTER_SCRIPTS.convoy.event(d, live, state, 'squadKill', {
    role: 'hauler', id: 'ent-0', byPlayer: true, killerId: 'player',
  });
  assert.equal(live.data.robbed, true);
  assert.ok(emitted.some((e) => e.name === 'setPassive' && e.payload.role === 'escort'), 'escorts go weapons-free');
  state.entities.get('ent-0').alive = false;
  ENCOUNTER_SCRIPTS.convoy.tick(d, live, state, state.simTime);
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'robbed');
  assert.match(receiptText(CURTAIN, 'robbed', {}), /RAIDED/);
});

test('silence keeps clear: timeout collapses to pass, arrival stays plain', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor(CURTAIN);
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  state.simTime = 112; // past the 12 s decision window, still far off the lane
  ENCOUNTER_SCRIPTS.convoy.tick(d, live, state, state.simTime);
  assert.equal(live.data.convoyStance, 'pass');
  assert.equal(live.phase, 'transit');
  assert.ok(!emitted.some((e) => e.name === 'rep'), 'no pledge, no rep');
  assert.ok(!emitted.some((e) => e.name === 'say:bark'), 'keeping clear is silent');
  haulerOf(d, live).pos = { ...live.data.end };
  ENCOUNTER_SCRIPTS.convoy.tick(d, live, state, state.simTime);
  const resolved = emitted.find((e) => e.name === 'resolved');
  assert.equal(resolved.payload.outcome, 'arrived');
  assert.match(receiptText(CURTAIN, 'arrived', resolved.payload.vars), /supply rises/);
});

test('violence is a choice: a player kill during the offer stamps the stance', () => {
  for (const [role, id, stance] of [['raider', 'ent-2', 'defend'], ['hauler', 'ent-0', 'raid']]) {
    const emitted = [];
    const state = makeState();
    const d = scriptDelegate(state, emitted);
    const live = liveFor(CURTAIN);
    ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
    assert.equal(live.phase, 'offer');
    ENCOUNTER_SCRIPTS.convoy.event(d, live, state, 'squadKill', { role, id, byPlayer: true, killerId: 'player' });
    assert.equal(live.phase, 'transit', `${role} kill collapses the offer`);
    assert.equal(live.data.convoyStance, stance);
    assert.ok(!emitted.some((e) => e.name === 'rep'), 'no pledge rep — physical consequences already apply');
    // The collapsed offer cannot be re-answered.
    ENCOUNTER_SCRIPTS.convoy.choose(d, live, state, 'defend');
    assert.equal(live.data.convoyStance, stance);
  }
});

test('choiceless convoys are untouched: 340 flies pure transit', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor(WARDEN);
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  assert.equal(live.phase, 'transit');
  assert.equal(live.deadlineAt, 300, '200 s run, no decision window');
  assert.ok(!emitted.some((e) => e.name === 'encounter:choiceOffered'), 'no offer without choices');
  assert.equal(live.data.offerDeadlineAt, undefined);
  // A stray choice against a choiceless convoy is a no-op, never a crash.
  ENCOUNTER_SCRIPTS.convoy.choose(d, live, state, 'defend');
  assert.equal(live.phase, 'transit');
  assert.equal(live.data.convoyStance, undefined);
});

test('choiceless trader runs are untouched: no offer on the lone-hauler script', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor('trader_run');
  ENCOUNTER_SCRIPTS.traderRun.fire(d, live, state);
  assert.equal(live.phase, 'transit');
  assert.ok(!emitted.some((e) => e.name === 'encounter:choiceOffered'), 'no offer without choices');
  ENCOUNTER_SCRIPTS.traderRun.choose(d, live, state, 'raid');
  assert.equal(live.phase, 'transit');
  assert.equal(live.data.convoyStance, undefined);
});

test('unknown choice ids never burn the convoy offer', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor(CURTAIN);
  ENCOUNTER_SCRIPTS.convoy.fire(d, live, state);
  ENCOUNTER_SCRIPTS.convoy.choose(d, live, state, 'attack');
  assert.equal(live.phase, 'offer', 'garbage input leaves the offer open');
  assert.equal(live.data.convoyStance, undefined);
  ENCOUNTER_SCRIPTS.convoy.choose(d, live, state, 'pass');
  assert.equal(live.data.convoyStance, 'pass');
});

test('convoy barks and curtain receipts read', () => {
  assert.match(barkText('convoy_guard_ack', { faction: 'MTS' }), /MTS remembers/);
  assert.match(barkText('convoy_raid_ack', {}), /pack watches your guns/);
  assert.match(receiptText(CURTAIN, 'guarded', { faction: 'MTS', pay: 200 }), /200 cr/);
  assert.match(receiptText(CURTAIN, 'lost', { dest: 'Ceres' }), /Ceres/);
});
