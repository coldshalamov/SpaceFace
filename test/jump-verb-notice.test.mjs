// WF-14 — the jump verb answers when the world refuses it.
//
// Four seams, one loop:
//   1. the pure refusal line (src/ui/jumpNotice.js) — reason + the world's numbers → one sentence;
//   2. the receipt binder (src/ui/toasts.js bindJumpDenialToasts) — one voice, deduped, unfiled excluded;
//   3. the world's numbers (src/systems/world.js) — a real rejection carries fuelNeeded /
//      creditsNeeded / cooldownS so the line can say the fix, not just the fault;
//   4. the chart seam (src/ui/galaxyMap.js emitGalaxyMapPrimaryAction) — the success toast asks
//      the world first and names the sector, never a raw id over a refusal.
//
// Run: node --test test/jump-verb-notice.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { world as worldPrototype } from '../src/systems/world.js';
import {
  jumpAbortText,
  jumpAbortNotice,
  jumpAbortReceipt,
} from '../src/ui/jumpNotice.js';
import { bindJumpDenialToasts } from '../src/ui/toasts.js';
import { emitGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';

// ---------------------------------------------------------------------------------------
// 1. The pure refusal line
// ---------------------------------------------------------------------------------------

test('refusal lines name the cause and the fix with the world numbers', () => {
  assert.equal(
    jumpAbortText({ reason: 'low_fuel', fuelNeeded: 16, fuelHeld: 5 }),
    'Jump needs 16 fuel — tank holds 5',
  );
  assert.equal(
    jumpAbortText({ reason: 'credits', creditsNeeded: 230, creditsHeld: 45 }),
    'Gate toll 230 cr — purse holds 45 cr',
  );
  assert.equal(jumpAbortText({ reason: 'cooldown', cooldownS: 8.4 }), 'Drive cooling — 9s');
});

test('refusal lines degrade honestly when the payload has no numbers', () => {
  assert.equal(jumpAbortText({ reason: 'low_fuel' }), 'Not enough fuel to make that jump');
  assert.equal(jumpAbortText({ reason: 'low_fuel', fuelHeld: 3 }), 'Jump needs more fuel — tank holds 3');
  assert.equal(jumpAbortText({ reason: 'credits' }), 'Not enough credits for the gate toll');
  assert.equal(jumpAbortText({ reason: 'cooldown' }), 'Drive still cooling');
});

test('every fixed reason reads as a sentence; an unknown reason never invents detail', () => {
  assert.equal(jumpAbortText({ reason: 'combat_lock' }), 'Jump held — break contact first');
  assert.equal(jumpAbortText({ reason: 'busy' }), 'Drive is already charging');
  assert.equal(jumpAbortText({ reason: 'docked' }), 'Undock to jump');
  assert.equal(jumpAbortText({ reason: 'no_drive' }), 'No travel drive fitted');
  assert.equal(jumpAbortText({ reason: 'wormhole_locked' }), 'The wormhole is sealed');
  assert.equal(jumpAbortText({ reason: 'not_a_neighbor' }), 'No direct lane there — plot a course instead');
  assert.equal(jumpAbortText({ reason: 'unknown_target' }), 'No such destination on the chart');
  assert.equal(jumpAbortText({ reason: 'story_beat_lock' }), 'Jump refused — story beat lock');
  assert.equal(jumpAbortText({}), '');
  assert.equal(jumpAbortText(null), '');
});

test('jumpAbortNotice returns the receipt shape; empty payload returns null', () => {
  assert.deepEqual(jumpAbortNotice({ reason: 'busy' }), {
    text: 'Drive is already charging',
    kind: 'warn',
    ttl: 3.5,
  });
  assert.equal(jumpAbortNotice({}), null);
});

// ---------------------------------------------------------------------------------------
// 2. The receipt binder — one voice, deduped, unfiled excluded
// ---------------------------------------------------------------------------------------

test('binder voices one refusal and collapses the same shape inside the sim window', () => {
  const bus = createBus();
  const state = { simTime: 100 };
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  bindJumpDenialToasts(bus, () => state);

  bus.emit('jump:chargeAbort', { reason: 'combat_lock' });
  bus.emit('jump:chargeAbort', { reason: 'combat_lock' });
  assert.equal(toasts.length, 1, 'same reason in one window is ONE refusal');
  assert.deepEqual(toasts[0], {
    text: 'Jump held — break contact first',
    kind: 'warn',
    ttl: 3.5,
    channel: 'jump',
  });

  state.simTime = 103; // next 2s bucket
  bus.emit('jump:chargeAbort', { reason: 'combat_lock' });
  assert.equal(toasts.length, 2, 'a later refusal speaks again');

  bus.emit('jump:chargeAbort', { reason: 'low_fuel', fuelNeeded: 16, fuelHeld: 5 });
  assert.equal(toasts.length, 3, 'a different reason speaks immediately');
  assert.equal(toasts[2].text, 'Jump needs 16 fuel — tank holds 5');
});

test('binder stays silent for the Choice-C unfiled charge and for empty payloads', () => {
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  bindJumpDenialToasts(bus, () => ({ simTime: 10 }));

  bus.emit('jump:chargeAbort', { reason: 'low_fuel', unfiled: true });
  bus.emit('jump:chargeAbort', {});
  bus.emit('jump:chargeAbort', null);
  assert.equal(toasts.length, 0, 'the staged door owns its moment; nothing says nothing');
});

test('binder without a bus or without getState still constructs safely', () => {
  bindJumpDenialToasts(null, () => ({}));
  const bus = createBus();
  bindJumpDenialToasts(bus, null); // getState null → state null → dedupe bucket 0, still speaks
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  bus.emit('jump:chargeAbort', { reason: 'docked' });
  assert.equal(toasts.length, 1);
});

// ---------------------------------------------------------------------------------------
// 3. The world's numbers — a real system, real rejections (seed 4242)
// ---------------------------------------------------------------------------------------

function makeWorldHarness(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  if (state.ui) state.ui.docked = false;
  state.jump.state = 'IDLE';
  state.jump.cooldownT = 0;
  state.world.currentSectorId = 'sector_test_a';
  state.world.sectors = {
    sector_test_a: {
      id: 'sector_test_a',
      name: 'Test Anchor',
      neighbors: ['sector_test_b'],
      security: 0.9,
    },
    sector_test_b: {
      id: 'sector_test_b',
      name: 'Test Toll Gate',
      neighbors: ['sector_test_a'],
      security: 0.9,
    },
  };
  const bus = createBus();
  const world = Object.assign({}, worldPrototype);
  const registry = { get: () => null };
  world.init({ state, bus, registry, helpers: { voice: { say: () => true } } });
  return { state, bus, world };
}

test('a cooldown rejection carries the seconds remaining', () => {
  const h = makeWorldHarness();
  h.state.jump.cooldownT = 7.4;
  const aborts = [];
  h.bus.on('jump:chargeAbort', (p) => aborts.push(p));
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_test_b', via: 'gate' });
  assert.equal(aborts.length, 1);
  assert.equal(aborts[0].reason, 'cooldown');
  assert.equal(aborts[0].cooldownS, 8);
});

test('a gate-toll rejection carries the toll and the purse', () => {
  const h = makeWorldHarness();
  h.state.player.credits = 45;
  const aborts = [];
  h.bus.on('jump:chargeAbort', (p) => aborts.push(p));
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_test_b', via: 'gate' });
  assert.equal(aborts.length, 1);
  assert.equal(aborts[0].reason, 'credits');
  assert.equal(aborts[0].creditsNeeded, 230, 'security 0.9 toll = round(50 + 200 * 0.9)');
  assert.equal(aborts[0].creditsHeld, 45);
  assert.equal(h.state.player.credits, 45, 'a refused toll never charges');
});

test('a drive-jump fuel rejection carries the cost and the tank', () => {
  const h = makeWorldHarness();
  h.state.fuel.current = 5;
  const aborts = [];
  h.bus.on('jump:chargeAbort', (p) => aborts.push(p));
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_test_b', via: 'drive' });
  assert.equal(aborts.length, 1);
  assert.equal(aborts[0].reason, 'low_fuel');
  assert.equal(aborts[0].fuelNeeded, 16, 'default edge 4 at tier-1: ceil(4 fuel/ly * 4 ly * 1.0)');
  assert.equal(aborts[0].fuelHeld, 5);
  assert.equal(h.state.fuel.current, 5, 'a refused jump never spends fuel');
});

// ---------------------------------------------------------------------------------------
// 4. The chart seam — success asks the world first, and names the sector
// ---------------------------------------------------------------------------------------

test('chart jump: a synchronous refusal suppresses the success toast but still sets course', () => {
  const log = [];
  const bus = createBus();
  // Mirror the real world: the refusal fires DURING the world:requestJump emit.
  bus.on('world:requestJump', () => {
    bus.emit('jump:chargeAbort', { reason: 'credits', creditsNeeded: 230, creditsHeld: 45 });
  });
  bus.on('toast', (t) => log.push(['toast', t]));
  bus.on('ui:setCourse', (c) => log.push(['ui:setCourse', c]));
  bus.on('world:requestJump', (p) => log.push(['world:requestJump', p]));

  const ok = emitGalaxyMapPrimaryAction(bus, {
    kind: 'jump',
    targetSectorId: 'sector_ceres_belt',
    coursePayload: { type: 'sector', sectorId: 'sector_ceres_belt', path: null, label: 'Ceres Belt' },
  });

  assert.equal(ok, true);
  assert.ok(log.some(([t]) => t === 'ui:setCourse'), 'the plot stays — only the claim is withdrawn');
  assert.equal(log.some(([t]) => t === 'toast'), false, 'no success line over a refusal');
});

test('chart jump: acceptance toasts the sector name, not the raw id', () => {
  const log = [];
  const bus = createBus();
  bus.on('world:requestJump', () => {
    bus.emit('jump:chargeStart', { targetSectorId: 'sector_ceres_belt', via: 'gate' });
  });
  bus.on('toast', (t) => log.push(['toast', t]));

  emitGalaxyMapPrimaryAction(bus, {
    kind: 'jump',
    targetSectorId: 'sector_ceres_belt',
    coursePayload: { type: 'sector', sectorId: 'sector_ceres_belt', path: null, label: 'Ceres Belt' },
  });

  const toast = log.find(([t]) => t === 'toast');
  assert.ok(toast, 'an accepted jump still announces itself');
  assert.equal(toast[1].text, 'Course set: jump to Ceres Belt');
  assert.notEqual(toast[1].text, 'Course set: jump to sector_ceres_belt');
});

test('chart jump: a bus without listeners keeps the shipped shape (toast always fires)', () => {
  const log = [];
  const bus = { emit(type, payload) { log.push([type, payload]); } };
  const ok = emitGalaxyMapPrimaryAction(bus, {
    kind: 'jump',
    targetSectorId: 'sector_ceres_belt',
    coursePayload: { type: 'sector', sectorId: 'sector_ceres_belt', path: null, label: 'Ceres Belt' },
  });
  assert.equal(ok, true);
  assert.deepEqual(log.map(([t]) => t), ['world:requestJump', 'ui:setCourse', 'toast']);
});

// ---------------------------------------------------------------------------------------
// 5. End to end on the real bus — world refusal → binder receipt → chart silence
// ---------------------------------------------------------------------------------------

test('end to end: refusing a broke purser voices one toll line and no chart success toast', () => {
  const h = makeWorldHarness();
  h.state.player.credits = 5;
  const toasts = [];
  h.bus.on('toast', (t) => toasts.push(t));
  bindJumpDenialToasts(h.bus, () => h.state); // the production wiring createToasts performs
  const ok = emitGalaxyMapPrimaryAction(h.bus, {
    kind: 'jump',
    targetSectorId: 'sector_test_b',
    coursePayload: { type: 'sector', sectorId: 'sector_test_b', path: null, label: 'Test Toll Gate' },
  });
  assert.equal(ok, true);
  assert.deepEqual(toasts.map((t) => t.text), ['Gate toll 230 cr — purse holds 5 cr'],
    'exactly one player-visible line: the refusal, with the fix');
});
