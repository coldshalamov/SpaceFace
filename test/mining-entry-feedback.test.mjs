import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDrillField } from '../src/systems/drill.js';
import { resolveDrillControlMap } from '../src/ui/screens/drill.js';
import { firstTunnelControl } from '../src/ui/asteroid/miningEntryFeedback.js';
import { miningNextStep } from '../src/ui/asteroid/progressionGuide.js';
import { createPublishedDrillBoardGate } from '../src/ui/asteroid/asteroidScreen.js';

const controls = state => resolveDrillControlMap(state || { settings: {} });
const board = (col = 14, row = 0) => ({ field: generateDrillField(545),
  avatar: { col, row }, tilesCleared: 1, scan: { serial: 0 } });

test('surface guidance names the actual inward binding and advances after a block clears', () => {
  const drill = board();
  const choice = firstTunnelControl(drill, controls());
  assert.deepEqual(choice, { direction: 'down', label: 'S' });
  const step = miningNextStep({ drill, firstTunnel: choice });
  assert.match(step.detail, /Hold S to drive down and bore/);
  drill.tilesCleared = 2;
  assert.equal(miningNextStep({ drill, firstTunnel: choice }).id, 'survey');
  drill.scan.serial = 1;
  assert.equal(miningNextStep({ drill, firstTunnel: choice }).id, 'kit');
});

test('edge, blocked cell, tier and rebound or overlapping keys select a usable direction', () => {
  const drill = board(0, 44);
  drill.field[1][44] = { type: 'empty', structure: 'machine' };
  drill.field[0][43] = { type: 'rock', tierReq: 2 };
  assert.equal(firstTunnelControl(drill, controls(), 1), null);
  const rebound = controls({ settings: { controls: { bindings: { forward: ['KeyI'], reverse: ['KeyK'] } } } });
  assert.deepEqual(firstTunnelControl(drill, rebound, 2), { direction: 'up', label: 'I' });
  drill.avatar = { col: 14, row: 0 };
  drill.field[14][1] = { type: 'rock', tierReq: 1 };
  assert.deepEqual(firstTunnelControl(drill, rebound), { direction: 'down', label: 'K' });
  const overlap = { left: ['KeyK'], right: [], up: [], down: ['KeyK', 'ArrowDown'] };
  assert.deepEqual(firstTunnelControl(drill, overlap), { direction: 'down', label: 'Down' });
  const reserved = { left: [], right: [], up: [], down: ['KeyB', 'KeyZ', 'Digit1', 'KeyK'] };
  assert.deepEqual(firstTunnelControl(drill, reserved), { direction: 'down', label: 'K' });
  assert.match(miningNextStep({ drill, firstTunnel: null }).detail, /Open Controls/);
});

test('entry distinguishes waiting from target loss and an established session ending', () => {
  const entity = { id: 545, alive: true, occupantGeneration: 8 };
  let currentEntity = entity, drill = null, open = true, starts = 0;
  const gate = createPublishedDrillBoardGate({ readDrill: () => drill,
    readEntity: () => currentEntity, isOpen: () => open, begin: () => starts++ });
  gate.request(545);
  assert.equal(gate.poll(), false);
  assert.equal(gate.status(), 'pending');
  drill = { ...board(), active: true, asteroidId: 545, asteroidGeneration: 7 };
  assert.equal(gate.status(), 'pending', 'a stale session is not a refusal');
  entity.alive = false;
  assert.equal(gate.status(), 'target-lost');
  entity.alive = true;
  currentEntity = { ...entity, occupantGeneration: 9 };
  assert.equal(gate.status(), 'target-lost');
  currentEntity = entity;
  drill.asteroidGeneration = 8;
  assert.equal(gate.poll(), true);
  assert.equal(starts, 1);
  assert.equal(gate.ownsSession(), true);
  entity.occupantGeneration++;
  assert.equal(gate.status(), 'target-lost');
  entity.occupantGeneration--;
  drill = null;
  assert.equal(gate.status(), 'session-lost');
  drill = { ...board(), active: true, asteroidId: 999, asteroidGeneration: 8 };
  assert.equal(gate.status(), 'session-lost');
  assert.equal(gate.ownsSession(), false, 'leaving cannot end a different session');
  open = false;
  assert.equal(gate.status(), 'closed');
  gate.invalidate();
});
