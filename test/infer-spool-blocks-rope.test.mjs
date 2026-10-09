// A dead Massline spool refuses a new latch and a reel. A hull with no spool still may latch.
import test from 'node:test';
import assert from 'node:assert/strict';

import { playerTetherSpoolOut, tetherGameplay } from '../src/systems/tetherGameplay.js';
import { denialNextAction, resolveMasslineBracketRead } from '../src/ui/masslineHud.js';

function playerState(disabled) {
  return {
    playerId: 1,
    combat: {
      entities: {
        1: { subsystems: { subsystem_tether_spool: { effectiveDisabled: disabled } } },
      },
    },
  };
}

test('only a disabled spool on this hull blocks the rope', () => {
  const player = { id: 1 };
  assert.equal(playerTetherSpoolOut(playerState(true), player), true);
  assert.equal(playerTetherSpoolOut(playerState(false), player), false);
  assert.equal(playerTetherSpoolOut({ playerId: 1, combat: { entities: { 1: { subsystems: {} } } } }, player), false);
  assert.equal(playerTetherSpoolOut(playerState(true), { id: 9 }), false);
});

test('a latch press on a dead spool is refused before a line is made', () => {
  const events = [];
  const player = { id: 1, pos: { x: 0, z: 0 }, alive: true };
  const state = playerState(true);
  state.mode = 'flight';
  state.simTime = 3;
  state.input = { actions: { tetherFire: true } };
  state.entities = new Map([[1, player]]);
  const sys = Object.assign(Object.create(tetherGameplay), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    registry: {
      get(name) {
        return name === 'actions' ? { kernel: { attachments: { get() { return null; } } } } : null;
      },
    },
    _active: null,
    _tickSlingshotState() {},
    _reconcileActive() {},
    _adoptExisting() {},
    _cutNpcLinesWithMonofilament() {},
    _staggerLightsWithMonofilament() {},
    _cutPlayerLinesWithHostileSweep() {},
    _startPendingDrillApproach() {},
    _reconcileTwinBridle() {},
    _adoptTwinBridle() {},
    _ensureCadenceRuntime() { return { winch: {}, phase: 'coast' }; },
    _resetPhaseMirror() {},
    _mirror() {},
    _clearAcquisitionPreview() {},
  });
  sys._updateTetherGameplay(1 / 60, state);
  assert.equal(events.some((event) => event.name === 'tether:latched'), false);
  assert.equal(events.find((event) => event.name === 'tether:latchDenied').payload.reason, 'spool_out');
});

test('reeling a line that is still up names the dead spool once', () => {
  const events = [];
  const sys = Object.assign(Object.create(tetherGameplay), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _lastLineControlDenial: null,
  });
  const state = { playerId: 1 };
  sys._emitLineControlDenied(state, 'spool_out', -1, { id: 'line-1' });
  sys._emitLineControlDenied(state, 'spool_out', -1, { id: 'line-1' });
  const toasts = events.filter((event) => event.name === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Massline reel-in blocked: the spool is out');
});

test('the latch mark says the spool is out', () => {
  assert.equal(denialNextAction('invalid', 'spool_out'), 'REPAIR THE SPOOL');
  assert.equal(resolveMasslineBracketRead('invalid', 'spool_out').reason, 'SPOOL IS OUT');
});
