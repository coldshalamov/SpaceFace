// The Long Berth yard card and the refusal name the goods the hold actually carries.
// Seed 4242. Prices and amounts stay on the authored stages.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { longBerth } from '../src/systems/longBerth.js';
import { LONG_BERTH_ONEOFF_ID } from '../src/data/longBerth.js';
import { createLongBerthPrompt } from '../src/ui/longBerthPrompt.js';

function boot(cargo = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 40;
  state.player.credits = 20000;
  state.player.cargo.items = { ...cargo };
  const tug = {
    id: 7, type: 'wreck', alive: true,
    pos: { x: 400, z: -120 }, vel: { x: 0, z: 0 }, radius: 22,
    data: {
      oneOffId: LONG_BERTH_ONEOFF_ID,
      worldRecordId: 'wr:tug:4242',
      name: 'The Long Berth — an abandoned yard tug',
    },
  };
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 410, z: -110 }, vel: { x: 0, z: 0 }, radius: 8,
  };
  state.playerId = player.id;
  state.entities.set(tug.id, tug);
  state.entities.set(player.id, player);
  state.entityList.push(tug, player);
  const emitted = [];
  const handlers = new Map();
  const bus = {
    emitted,
    emit(evt, p) {
      emitted.push({ evt, p });
      for (const fn of handlers.get(evt) || []) fn(p);
    },
    on(evt, fn) {
      const list = handlers.get(evt) || [];
      list.push(fn);
      handlers.set(evt, list);
      return () => {};
    },
  };
  const decisions = [];
  const deck = {
    offerDecision(spec) { decisions.push(spec); },
    updateDecision(_id, spec) { decisions.push(spec); },
    hasDecision() { return false; },
    resolveDecision() {},
  };
  createLongBerthPrompt({ bus, deck });
  const sys = Object.create(longBerth);
  sys.init({ state, bus, helpers: {} });
  bus.emit('tether:latched', { targetId: tug.id });
  bus.emit('longBerth:claim', {});
  return { state, bus, sys, decisions };
}

function toasts(bus) {
  return bus.emitted.filter((row) => row.evt === 'toast').map((row) => row.p.text);
}

function headlines(decisions) {
  return decisions.map((row) => row.headline);
}

test('a yard short of alloys names Composite Alloys on the card and the refusal', () => {
  const { state, bus, sys, decisions } = boot();
  assert.equal(state.meta.seed, 4242);
  bus.emit('longBerth:restore', {});
  assert.equal(state.longBerth.stage, 1);
  sys.update(1, state);
  const card = headlines(decisions).at(-1);
  assert.match(card, /Composite Alloys/);
  assert.equal(card.includes('alloys'), false);
  assert.equal(card.includes('cmdty_'), false);
  assert.match(card, /2400 cr/);
  bus.emit('longBerth:restore', {});
  assert.equal(state.longBerth.stage, 1);
  const refusal = toasts(bus).at(-1);
  assert.equal(refusal, 'The yard needs 2u Composite Alloys you don\'t carry.');
  assert.equal(state.player.credits, 20000);
});

test('a yard short of fuel cells names Fuel Cells, and the fitted card names both goods', () => {
  const { state, bus, sys, decisions } = boot({ cmdty_alloys: 6 });
  bus.emit('longBerth:restore', {});
  bus.emit('longBerth:restore', {});
  assert.equal(state.longBerth.stage, 2);
  assert.equal(state.player.cargo.items.cmdty_alloys, 4);
  sys.update(1, state);
  const card = headlines(decisions).at(-1);
  assert.match(card, /4u Composite Alloys/);
  assert.match(card, /2u Fuel Cells/);
  assert.equal(card.includes('fuel_cells'), false);
  assert.equal(card.includes('cmdty_'), false);
  assert.match(card, /5200 cr/);
  bus.emit('longBerth:restore', {});
  assert.equal(state.longBerth.stage, 2);
  assert.equal(toasts(bus).at(-1), 'The yard needs 2u Fuel Cells you don\'t carry.');
  assert.equal(state.player.cargo.items.cmdty_alloys, 4);
});
