// A surrendered pirate crew's yield offer is producer-owned: the deck display-expires
// the card, but the system owns the deterministic resolution. Before this test, an
// unanswered offer stayed 'offered' forever — neglect never read as "let them go",
// and a crew murdered mid-offer left the card hanging over corpses until the deck's
// stale-card grace. Regression coverage for both halves plus the verdict-on-corpse
// race and the untouched accept path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  pirateDisengage,
  setPirateDisengageEmptyQuietLatchForBench,
} from '../src/systems/pirateDisengage.js';

const SURRENDER_OFFER_WINDOW_S = 12.0;

function boot() {
  const state = createGameState(9017);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      return raw.emit(event, payload);
    },
  };
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const ships = [player];
  const squad = [];
  for (let i = 0; i < 2; i++) {
    const ship = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 260 + i * 30, z: 120 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 8, hullMax: 100, collides: true, team: 1,
      data: { ai: { role: 'pirate', squadId: 'sq:yield' }, role: 'pirate' },
    });
    ships.push(ship);
    squad.push(ship);
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = 1;
  }
  pirateDisengage.init({ state, bus, helpers, registry: null });
  return { state, helpers, bus, emitted, player, squad };
}

function step(ctx, seconds) {
  const dt = 1 / 60;
  const n = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < n; i++) {
    ctx.state.tick += 1;
    ctx.state.simTime += dt;
    pirateDisengage.update(dt, ctx.state);
  }
}

function forceSurrender(ctx) {
  // NERVE_DELAY_S = 1.0 — run a little past it and confirm the offer opened.
  step(ctx, 1.4);
  const offer = ctx.emitted.find((e) => e.event === 'pirateDisengage:surrenderOffer');
  assert.ok(offer, 'expected pirateDisengage:surrenderOffer');
  const rec = ctx.state.pirateDisengage.squads['sq:yield'];
  assert.equal(rec.yieldState, 'offered');
  for (const ship of ctx.squad) assert.equal(ship.data.ai.fsm, 'surrender');
  return { offer: offer.payload, rec };
}

function yieldResolved(ctx) {
  return ctx.emitted.filter((e) => e.event === 'pirateDisengage:yieldResolved')
    .map((e) => e.payload);
}

test('an unanswered yield offer resolves on the window — neglect reads as let them go', () => {
  setPirateDisengageEmptyQuietLatchForBench(false);
  const ctx = boot();
  const { rec } = forceSurrender(ctx);
  // Expire the 12 s window without a verdict, then tick once more.
  ctx.state.simTime += SURRENDER_OFFER_WINDOW_S + 0.05;
  step(ctx, 0.1);
  assert.equal(rec.yieldState, 'refused');
  const resolved = yieldResolved(ctx);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].accepted, false);
  assert.equal(resolved[0].reason, 'expired');
  // They keep their take: no pods, and the surrenderRecovery custody window still
  // owns their exit — the crew stays surrendered, not force-fled.
  assert.equal(resolved[0].pods, 0);
  for (const ship of ctx.squad) {
    assert.equal(ship.data.pirateDisengage.phase, 'surrender');
  }
});

test('a refused verdict resolves the offer without touching the crew state', () => {
  setPirateDisengageEmptyQuietLatchForBench(false);
  const ctx = boot();
  const { rec } = forceSurrender(ctx);
  ctx.bus.emit('pirateDisengage:verdict', { squadId: 'sq:yield', accept: false, source: 'deck' });
  assert.equal(rec.yieldState, 'refused');
  const resolved = yieldResolved(ctx);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].accepted, false);
  assert.equal(resolved[0].reason, 'refused');
});

test('killing the yielding crew closes the offer at the kill', () => {
  setPirateDisengageEmptyQuietLatchForBench(false);
  const ctx = boot();
  const { rec } = forceSurrender(ctx);
  // One death leaves the offer standing on the survivor.
  ctx.squad[0].alive = false;
  ctx.bus.emit('entity:killed', { id: ctx.squad[0].id, type: 'ship' });
  assert.equal(rec.yieldState, 'offered');
  assert.equal(yieldResolved(ctx).length, 0);
  // The last death is the receipt — the card does not linger over corpses.
  ctx.squad[1].alive = false;
  ctx.bus.emit('entity:killed', { id: ctx.squad[1].id, type: 'ship' });
  assert.equal(rec.yieldState, 'killed');
  const resolved = yieldResolved(ctx);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].accepted, false);
  assert.equal(resolved[0].reason, 'killed');
  assert.equal(resolved[0].pods, 0);
});

test('a verdict landing on a dead crew resolves killed, never accepted', () => {
  setPirateDisengageEmptyQuietLatchForBench(false);
  const ctx = boot();
  const { rec } = forceSurrender(ctx);
  for (const ship of ctx.squad) ship.alive = false;
  ctx.bus.emit('pirateDisengage:verdict', { squadId: 'sq:yield', accept: true, source: 'deck' });
  assert.equal(rec.yieldState, 'killed');
  const resolved = yieldResolved(ctx);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].reason, 'killed');
  assert.equal(resolved[0].pods, 0);
});

test('an accepted verdict still dumps pods and runs the crew clean', () => {
  setPirateDisengageEmptyQuietLatchForBench(false);
  const ctx = boot();
  const { rec } = forceSurrender(ctx);
  const before = ctx.state.entityList.length;
  ctx.bus.emit('pirateDisengage:verdict', { squadId: 'sq:yield', accept: true, source: 'deck' });
  assert.equal(rec.yieldState, 'accepted');
  const resolved = yieldResolved(ctx);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].accepted, true);
  assert.equal(resolved[0].pods, 2);
  assert.equal(ctx.state.entityList.length, before + 2);
  for (const ship of ctx.squad) {
    assert.equal(ship.data.ai.fsm, 'flee');
    assert.equal(ship.data.pirateDisengage.phase, 'flee');
  }
});
