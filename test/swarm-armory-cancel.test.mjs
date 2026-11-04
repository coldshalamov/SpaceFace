import test from 'node:test';
import assert from 'node:assert/strict';
import { crucibleDraftScreen, affordableOfferCount } from '../src/ui/screens/crucibleDraft.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

function harness({ wave = 1, ruleset = 'swarm', offers = [] } = {}) {
  let current = offers;
  const bus = createBus();
  const owner = { currentOffers: () => current };
  const ctx = { bus, state: { run: { kind: 'survival', phase: 'draft', ruleset, wave } },
    registry: { get: id => id === 'survivalDraft' ? owner : null },
    screenManager: { top: () => 'crucibleDraft' } };
  let focused = 0, launched = 0;
  const screen = Object.assign(Object.create(crucibleDraftScreen), {
    _ctx: ctx, _drawnOffers: [], _note: {},
    _skip: { focus() { focused++; }, click() { launched++; } },
    refresh() {},
  });
  return { screen, ctx, bus, publish(rows) { current = rows; },
    get focused() { return focused; }, get launched() { return launched; } };
}
const fitting = { id: 'fitting', kind: 'weapon', available: true, price: 10 };

test('empty filtered shelves cannot bypass the first cancel in the opening or first intermission', () => {
  for (const wave of [0, 1]) {
    const h = harness({ wave, offers: [fitting] });
    assert.equal(h.screen._guardLaunch(h.ctx), true);
    assert.match(h.screen._note.textContent, /afford 1 card/);
    assert.equal(h.focused, 1);
    assert.equal(h.launched, 0);
    assert.equal(h.screen._guardLaunch(h.ctx), false, 'second cancel remains an intentional launch');
  }
});

test('cancel reads fresh owner availability rather than stale affordable visible cards', () => {
  const h = harness({ offers: [{ ...fitting, available: false }] });
  h.screen._drawnOffers = [fitting];
  assert.equal(h.screen._guardLaunch(h.ctx), false);
  h.publish([fitting]);
  h.screen._drawnOffers = [];
  assert.equal(h.screen._guardLaunch(h.ctx), true);
});

test('pad cancellation shares the guard, ignores another screen and unbinds on hide', () => {
  const h = harness({ offers: [fitting] });
  h.screen.onShow(h.ctx);
  try {
    h.bus.emit('ui:cancel', {});
    assert.equal(h.launched, 0);
    assert.equal(h.focused, 1);
    h.bus.emit('ui:cancel', {});
    assert.equal(h.launched, 1);
    h.ctx.screenManager.top = () => 'crucibleRefit';
    h.bus.emit('ui:cancel', {});
    assert.equal(h.launched, 1);
  } finally { h.screen.onHide(); }
  h.ctx.screenManager.top = () => 'crucibleDraft';
  h.bus.emit('ui:cancel', {});
  assert.equal(h.launched, 1);
});

test('non-Swarm cancellation and the existing Circuit choice gate keep priority', () => {
  const normal = harness({ ruleset: 'gauntlet', offers: [fitting] });
  assert.equal(normal.screen._guardLaunch(normal.ctx), false);
  const circuit = harness({ offers: [fitting] });
  let gated = 0;
  circuit.screen._circuitGate = () => { gated++; return true; };
  circuit.ctx.registry.get = () => { throw new Error('Circuit gate must run before shelf reads'); };
  assert.equal(circuit.screen._guardLaunch(circuit.ctx), true);
  assert.equal(gated, 1);
});

test('real draft owner supplies hull-switch exclusions and live repair affordability', () => {
  const state = createGameState(4242), bus = createBus();
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'draft', wave: 1, credits: 40 };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] },
    { defId: 'ship_mule', fittings: [] }];
  state.player.activeShipIndex = 0;
  state.playerId = 1;
  state.entities.set(1, { id: 1, hull: 75, hullMax: 100, armorHp: 0, armorMax: 0 });
  const owner = Object.create(survivalDraft);
  owner.init({ state, bus });
  try {
    bus.emit('run:transitioned', { phase: 'draft' });
    const h = harness();
    h.ctx.state = state;
    h.ctx.registry.get = id => id === 'survivalDraft' ? owner : null;
    const offers = owner.currentOffers();
    const flying = offers.find(o => o.kind === 'hull' && o._flying);
    const switchHull = offers.find(o => o.kind === 'hull' && o._ownedIndex === 1);
    assert.ok(flying, 'owner, not UI decoration, marks the current hull');
    assert.ok(switchHull, 'owner marks the other owned hull');
    assert.equal(switchHull.available, true);
    assert.equal(affordableOfferCount([flying, switchHull]), 0);
    assert.equal(offers.find(o => o.service === 'hull_patch').available, true);
    assert.equal(h.screen._guardLaunch(h.ctx), true);
    h.screen._launchWarned = false;
    state.run.credits = 0;
    const emptyWallet = owner.currentOffers();
    assert.equal(emptyWallet.find(o => o.service === 'hull_patch').available, false);
    // The owner's free pact is still an available decision even at zero credits. Preserve
    // that existing guard behavior, without accidentally counting free hull switches too.
    assert.equal(affordableOfferCount(emptyWallet), 1);
    assert.equal(h.screen._guardLaunch(h.ctx), true);
    assert.match(h.screen._note.textContent, /afford 1 card/);
  } finally { owner.destroy(); }
});
