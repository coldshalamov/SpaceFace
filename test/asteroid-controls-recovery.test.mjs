import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { drill, knownReturnPath, visibleCablePoints, DRILL_CONST } from '../src/systems/drill.js';
import { createAsteroidController, MODES } from '../src/ui/asteroid/asteroidController.js';

const STEP = 1 / 60;
const empty = () => ({ type: 'empty', hp: 0, maxHp: 0, tierReq: 1, ore: null });
const key = (code) => ({ code, repeat: false, preventDefault() {} });

function harness() {
  const state = createGameState(90130);
  const bus = { emit() {}, on() { return () => {}; } };
  drill.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  drill.begin(90130);
  const d = state.drill;
  for (let row = 0; row < DRILL_CONST.ROWS; row++) d.field[d.avatar.col][row] = empty();
  const controller = createAsteroidController({
    drillSys: drill,
    getDrillState: () => state.drill,
    controlMap: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], scan: ['KeyF'] },
    hooks: {},
  });
  return { state, d, controller };
}

function tick(controller, count = 60) {
  for (let i = 0; i < count; i++) controller.tick(STEP);
}

test('planning cools and recharges the parked rig and advances survey cooldown', () => {
  const { d, controller } = harness();
  d.drillTemp = 100;
  d.overheated = true;
  d.drillEnergy = 0;
  d.energyDepleted = true;
  d.scan.cooldown = 6;
  controller.setMode(MODES.BUILD);
  const row = d.avatar.row;
  tick(controller, 180);
  assert.equal(d.avatar.row, row, 'planning never drives the rig');
  assert.ok(d.drillTemp <= 1, 'three seconds of planning lets the hot drill cool');
  assert.equal(d.overheated, false);
  assert.ok(d.drillEnergy >= 80);
  assert.equal(d.energyDepleted, false);
  assert.ok(d.scan.cooldown <= 3.01);
});

for (const mode of [MODES.DRIVE, MODES.BUILD]) {
  test(`${mode}: releasing one directional alias preserves the other physically held key`, () => {
    const { d, controller } = harness();
    controller.setMode(mode);
    controller.onKeyDown(key('KeyS'));
    controller.onKeyDown(key('ArrowDown'));
    controller.onKeyUp(key('ArrowDown'));
    const before = mode === MODES.DRIVE ? d.avatar.row : controller.state.cursor.row;
    tick(controller, 40);
    const after = mode === MODES.DRIVE ? d.avatar.row : controller.state.cursor.row;
    assert.ok(after - before >= 2, 'the remaining held alias keeps cruising beyond any owed tap');
    controller.onKeyUp(key('KeyS'));
    tick(controller, 30);
    const stopped = mode === MODES.DRIVE ? d.avatar.row : controller.state.cursor.row;
    tick(controller, 30);
    assert.equal(mode === MODES.DRIVE ? d.avatar.row : controller.state.cursor.row, stopped);
  });
}

test('changing mode retires build holds before the rover can resume driving', () => {
  const { d, controller } = harness();
  controller.setMode(MODES.BUILD);
  controller.onKeyDown(key('KeyS'));
  controller.setMode(MODES.DRIVE);
  d.field[d.avatar.col - 1][0] = empty();
  controller.onKeyDown(key('KeyA'));
  controller.onKeyUp(key('KeyA'));
  tick(controller, 60);
  assert.equal(d.avatar.row, 0, 'the old build hold cannot hand off into movement');
});

test('the drill can excavate an upward face to route tunnels around preserved deposits', () => {
  const { d, controller } = harness();
  const col = d.avatar.col;
  d.avatar.row = 3;
  d.avatar.fromRow = 3;
  d.field[col][2] = { type: 'dirt', hp: 1, maxHp: 1, hardness: 0.7, tierReq: 1 };
  controller.onKeyDown(key('KeyW'));
  controller.onKeyUp(key('KeyW'));
  assert.equal(d.field[col][2].type, 'empty');
  assert.equal(d.avatar.row, 2);
});

for (const limit of ['heat', 'energy']) {
  test(`a held bore resumes after ${limit} recovery without requiring an unexplained second press`, () => {
    const { d, controller } = harness();
    const col = d.avatar.col;
    const face = { type: 'rock', hp: 100, maxHp: 100, hardness: 1, tierReq: 1 };
    d.field[col][1] = face;
    if (limit === 'heat') { d.drillTemp = 100; d.overheated = true; }
    else { d.drillEnergy = 0; d.energyDepleted = true; }
    controller.onKeyDown(key('KeyS'));
    assert.equal(face.hp, 100, 'the interlock prevents work until recovery');
    tick(controller, 180);
    assert.ok(face.hp < 100, 'the still-held bore resumes when its interlock clears');
    assert.equal(controller.drive.hasActiveIntent(), true);
  });
}

test('return route and cable exclude occupied machine housings', () => {
  const field = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ type: 'rock' })));
  for (let row = 0; row <= 3; row++) field[2][row] = empty();
  field[2][1].structure = { id: 'machine-1' };
  const blocked = knownReturnPath(field, 2, 3);
  assert.deepEqual(blocked, [{ col: 2, row: 3 }], 'a one-cell route is the existing no-path result');
  for (let row = 0; row <= 3; row++) field[1][row] = empty();
  const detour = knownReturnPath(field, 2, 3);
  assert.ok(detour.length > 4, 'the return path takes the dug detour');
  assert.ok(detour.every(({ col, row }) => !field[col][row].structure));
  assert.deepEqual(visibleCablePoints([{ col: 2, row: 0 }, { col: 2, row: 1 }], field), [{ col: 2, row: 0 }]);
});
