// inf-wing-gap-press — a lost player wingman is felt, not toasted: the seat beside him says
// the name on the band, presses the hull that did it for one bounded window, and a lost
// mining watch is named instead of silently dying. The player's fresh order cancels the
// grief. Real system instance, real bus, no renderer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { wingmen } from '../src/systems/wingmen.js';

const PRESS_S = 14;

function wingmanEntity(id, name) {
  return {
    id, alive: true, type: 'ship', team: 0,
    pos: { x: 100, z: 0 },
    data: { isWingman: true, wingmanOf: 'fs-' + id, ai: {} },
    name,
  };
}

function makeHost({ rows, entities, simTime = 500 }) {
  const bus = createBus();
  const comms = [];
  const gaps = [];
  bus.on('comms:log', (p) => comms.push(p));
  bus.on('wingmen:gap', (p) => gaps.push(p));
  const state = {
    tick: 10, simTime, playerId: 'player',
    world: { currentSectorId: 'sector_test' },
    automation: { fleet: rows },
    entities,
  };
  const host = Object.create(wingmen);
  host.init({ state, bus, helpers: {}, registry: null });
  return { host, state, bus, comms, gaps };
}

function twoWingScene({ lostOrder = 'escort' } = {}) {
  const lost = wingmanEntity(101, 'Brant');
  const survivor = wingmanEntity(102, 'Ilya');
  const pirate = { id: 900, alive: true, type: 'ship', team: 1, pos: { x: 500, z: 0 }, data: { ai: {} } };
  const player = { id: 'player', alive: true, type: 'ship', team: 0, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([
    [101, lost], [102, survivor], [900, pirate], ['player', player],
  ]);
  const rows = [
    { id: 'fs-101', name: 'Brant', order: lostOrder, _liveId: 101, wingOrder: { kind: 'screen', commandId: 'c1' } },
    { id: 'fs-102', name: 'Ilya', order: 'escort', _liveId: 102, wingOrder: { kind: 'screen', commandId: 'c1' } },
  ];
  return { entities, rows, lost, survivor, pirate, player };
}

test('the seat beside him says the name and presses the killer', () => {
  const { entities, rows } = twoWingScene();
  const { host, state, comms, gaps } = makeHost({ rows, entities });
  const [lostRow, survivorRow] = rows;

  // The kill receipt is the witness.
  host._onWingmanEntityKilled({ id: 101, killerId: 900 });
  host._feelWingmanLoss(lostRow, rows, 'Brant');

  const ai = survivorRow._liveId && entities.get(102).data.ai;
  const press = ai.wingGapPress;
  assert.ok(press, 'the survivor carries the grief press');
  assert.equal(press.killerId, 900);
  assert.equal(press.until, state.simTime + PRESS_S);
  assert.equal(press.commandId, 'c1', 'a fresh player order can cancel it');

  const froms = comms.map((p) => p.from);
  assert.deepEqual(froms, ['Ilya']);
  assert.match(comms[0].text, /Brant is down/);
  assert.match(comms[0].text, /pressing the hull/);

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].survivorId, 102);
  assert.equal(gaps[0].killerId, 900);
  assert.equal(gaps[0].lostOrder, 'escort');
});

test('the press owns the hull: attack_run at the killer, weapons free, stamped once', () => {
  const { entities, rows, pirate, player } = twoWingScene();
  const { host, state } = makeHost({ rows, entities });
  const [lostRow, survivorRow] = rows;
  const survivor = entities.get(102);
  host._onWingmanEntityKilled({ id: 101, killerId: 900 });
  host._feelWingmanLoss(lostRow, rows, 'Brant');

  host._applyWingOrder(survivorRow, survivor, player, 1, 2);
  assert.equal(survivor.data.ai.activity.reason, 'wing_gap:press');
  assert.equal(survivor.data.ai.activity.targetId, 900);
  assert.equal(survivor.data.ai.activity.leashRadius > 0, true);
  assert.equal(survivor.data.ai.roe, 'weapons_free');
  const stampedActivity = survivor.data.ai.activity;

  state.simTime += 1;
  host._applyWingOrder(survivorRow, survivor, player, 1, 2);
  assert.equal(survivor.data.ai.activity, stampedActivity, 'the press is not re-stamped every tick');
  assert.equal(survivor.data.ai.wingGapPress.stamped, true);
});

test('a fresh player order cancels the grief and the standing order re-derives', () => {
  const { entities, rows, pirate, player } = twoWingScene();
  const { host, state } = makeHost({ rows, entities });
  const [lostRow, survivorRow] = rows;
  const survivor = entities.get(102);
  host._onWingmanEntityKilled({ id: 101, killerId: 900 });
  host._feelWingmanLoss(lostRow, rows, 'Brant');
  host._applyWingOrder(survivorRow, survivor, player, 1, 2);
  assert.equal(survivor.data.ai.activity.reason, 'wing_gap:press');

  survivorRow.wingOrder = { kind: 'screen', commandId: 'c2' }; // the player speaks
  host._applyWingOrder(survivorRow, survivor, player, 1, 2);
  assert.equal(survivor.data.ai.wingGapPress, undefined);
  assert.notEqual(survivor.data.ai.activity.reason, 'wing_gap:press');
});

test('the window expires on its own clock; the killer dying ends it', () => {
  const { entities, rows, pirate, player } = twoWingScene();
  const { host, state } = makeHost({ rows, entities });
  const [lostRow, survivorRow] = rows;
  const survivor = entities.get(102);
  host._onWingmanEntityKilled({ id: 101, killerId: 900 });
  host._feelWingmanLoss(lostRow, rows, 'Brant');
  host._applyWingOrder(survivorRow, survivor, player, 1, 2);

  state.simTime += PRESS_S + 1;
  host._applyWingOrder(survivorRow, survivor, player, 1, 2);
  assert.equal(survivor.data.ai.wingGapPress, undefined);
  assert.notEqual(survivor.data.ai.activity.reason, 'wing_gap:press');
});

test('a dead killer ends the press', () => {
  const { entities, rows, pirate, player } = twoWingScene();
  const { host } = makeHost({ rows, entities });
  const [lostRow, survivorRow] = rows;
  const survivor = entities.get(102);
  host._onWingmanEntityKilled({ id: 101, killerId: 900 });
  host._feelWingmanLoss(lostRow, rows, 'Brant');
  host._applyWingOrder(survivorRow, survivor, player, 1, 2);
  assert.ok(survivor.data.ai.wingGapPress);

  pirate.alive = false;
  host._applyWingOrder(survivorRow, survivor, player, 1, 2);
  assert.equal(survivor.data.ai.wingGapPress, undefined);
  assert.notEqual(survivor.data.ai.activity.reason, 'wing_gap:press');
});

test('a lost mining watch is named, not dropped in silence', () => {
  const { entities, rows } = twoWingScene({ lostOrder: 'mine' });
  const { host, comms, gaps } = makeHost({ rows, entities });
  const [lostRow] = rows;
  host._onWingmanEntityKilled({ id: 101, killerId: 900 });
  host._feelWingmanLoss(lostRow, rows, 'Brant');
  assert.equal(comms.length, 2, 'press line plus the watch line');
  assert.match(comms[1].text, /Nobody is cutting Brant's seam/);
  assert.equal(gaps[0].lostOrder, 'mine');
});

test('no survivor: the loss is the toast alone — no band, no press, no receipt', () => {
  const lost = wingmanEntity(101, 'Brant');
  const player = { id: 'player', alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[101, lost], ['player', player]]);
  const rows = [{ id: 'fs-101', name: 'Brant', order: 'escort', _liveId: 101 }];
  const { host, comms, gaps } = makeHost({ rows, entities });
  host._onWingmanEntityKilled({ id: 101, killerId: 900 });
  host._feelWingmanLoss(rows[0], rows, 'Brant');
  assert.equal(comms.length, 0);
  assert.equal(gaps.length, 0);
});

test('an environment death names the loss without a press; the player as killer shames, not presses', () => {
  const { entities, rows } = twoWingScene();
  const { host, comms, gaps } = makeHost({ rows, entities });
  const [lostRow] = rows;
  host._onWingmanEntityKilled({ id: 101, killerId: null });
  host._feelWingmanLoss(lostRow, rows, 'Brant');
  assert.equal(comms.length, 1);
  assert.match(comms[0].text, /gone quiet/);
  assert.equal(gaps[0].killerId, null);
  assert.equal(gaps[0].pressUntil, 0);

  const { entities: e2, rows: r2 } = twoWingScene();
  const { host: h2, comms: c2, gaps: g2 } = makeHost({ rows: r2, entities: e2 });
  h2._onWingmanEntityKilled({ id: 101, killerId: 'player' });
  h2._feelWingmanLoss(r2[0], r2, 'Brant');
  assert.equal(g2[0].pressUntil, 0);
  const survivorAi = e2.get(102).data.ai;
  assert.equal(survivorAi.wingGapPress, undefined, 'the survivor never presses the captain');
});
