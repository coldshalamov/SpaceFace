import test from 'node:test';
import assert from 'node:assert/strict';
import { firstSwarmIntermission, crucibleDraftScreen, swarmNextLine, swarmForecastForRun } from '../src/ui/screens/crucibleDraft.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

function run() {
  return { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'draft', wave: 1, credits: 40, arenaId: 'helios_core', arenaMutators: [], modifiers: [] };
}
const weld = { id: 'svc_weld', kind: 'service', service: 'weld', name: 'Hull weld', price: 30, available: true };
const patch = { id: 'svc_hull_patch', kind: 'service', service: 'hull_patch', name: 'Hull patch', price: 8, available: true };

test('canonical draft owner supplies actual live repair quote and sound-hull refusal', () => {
  const state = createGameState(4242), bus = createBus(); state.run = run();
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }]; state.playerId = 1;
  const ship = { id: 1, hull: 75, hullMax: 100, armorHp: 0, armorMax: 0 };
  state.entities.set(1, ship);
  const owner = Object.create(survivalDraft); owner.init({ state, bus });
  try {
    bus.emit('run:transitioned', { phase: 'draft' });
    const offers = owner.currentOffers();
    const quoted = offers.find(o => o.service === 'hull_patch');
    assert.equal(quoted.price, 25); assert.equal(quoted.available, true);
    assert.match(firstSwarmIntermission(state.run, offers), /Hull patch \(25 cr\)/);
    ship.hull = 100;
    const repaired = owner.currentOffers();
    assert.equal(repaired.find(o => o.service === 'hull_patch').unavailableReason, 'Hull already sound');
    assert.doesNotMatch(firstSwarmIntermission(state.run, repaired), /Service:/);
    ship.hull = 75; state.run.credits = 0;
    assert.equal(owner.currentOffers().find(o => o.service === 'hull_patch').available, false);
    assert.doesNotMatch(firstSwarmIntermission(state.run, owner.currentOffers()), /Service:/);
  } finally { owner.destroy(); }
});

test('first intermission points to the actual cheapest available repair and existing routes', () => {
  const r = run(), offers = [weld, patch]; const before = structuredClone({ r, offers });
  const line = firstSwarmIntermission(r, offers);
  assert.match(line, /Service: Hull patch \(8 cr\)/);
  assert.match(line, /Rearrange loadout for spares/); assert.match(line, /Fortify the field/);
  assert.match(line, /Launch round 2/); assert.doesNotMatch(line, /earned|paid|bonus/i);
  assert.deepEqual({ r, offers }, before);
});

test('repaired, purchased, unaffordable or invalid quotes do not recommend a repair', () => {
  for (const offer of [{ ...patch, available: false }, { ...patch, purchased: true },
    { ...patch, price: 41 }, { ...patch, price: NaN }, { ...patch, price: -1 }]) {
    assert.doesNotMatch(firstSwarmIntermission(run(), [offer]), /Service:/);
  }
  assert.match(firstSwarmIntermission({ ...run(), credits: 0 }, [patch]), /no purchase is available/);
  assert.match(firstSwarmIntermission(run(), [{ ...patch, kind: 'fitting' }]), /Buy for round 2/);
});

test('no-stock opening does not invent a cleared wave; checkpoint and Circuit copy stay with owners', () => {
  assert.match(firstSwarmIntermission({ ...run(), wave: 0 }, []), /Before round 1/);
  assert.doesNotMatch(firstSwarmIntermission({ ...run(), wave: 0 }, []), /cleared/);
  for (const r of [{ ...run(), wave: 2 }, { ...run(), phase: 'active' }, { ...run(), ruleset: 'gauntlet' },
    { ...run(), telemetry: { startWave: 2 } }, { ...run(), telemetry: { circuit: {} } }]) {
    assert.equal(firstSwarmIntermission(r, [patch]), null);
  }
  assert.equal(firstSwarmIntermission({ ...run(), wave: 0 }, [patch]), null);
});

function screenHarness(r) {
  const bus = createBus();
  let rows = [];
  const owner = { currentOffers: () => rows, currentWave: () => r.wave, lastNotice: () => null,
    rerollState: () => ({ open: false }), recommendedOffers: () => [] };
  const ctx = { state: { run: r }, bus, registry: { get: () => owner } };
  const button = () => ({ dataset: {}, childNodes: [], style: {}, classList: { toggle() {} },
    setAttribute() {}, querySelector: () => null, appendChild(n) { this.childNodes.push(n); } });
  const screen = Object.assign(Object.create(crucibleDraftScreen), {
    _ctx: ctx, _root: { classList: { toggle() {} }, contains: () => false },
    _cards: { innerHTML: '', querySelectorAll: () => [], querySelector: () => null },
    _title: {}, _filters: { children: [] }, _refitBtn: {}, _sub: {}, _preview: {},
    _skip: button(), _rerollBtn: button(), _wallet: {}, _hint: {}, _note: {},
    _category: 'unmatched-filter', _query: '', _clipRailToWholeRows() {}, _claimFocus() {},
  });
  return { screen, ctx, bus, publish(next) { rows = next; } };
}

test('real Armory refresh reads delayed offer receipts, then withdraws the repaired offer', async () => {
  const previous = globalThis.document;
  globalThis.document = { activeElement: null, createElement: () => ({ classList: { add() {} },
    setAttribute() {}, appendChild() {}, style: {}, dataset: {} }) };
  try {
    const h = screenHarness(run());
    h.screen.onShow(h.ctx); assert.match(h.screen._sub.textContent, /no purchase is available/);
    // The existing production refresh is invoked after the canonical owner reply, not a click-time quote.
    h.publish([weld, patch]); h.bus.emit('run:draftOffered', { wave: 1 });
    await new Promise(resolve => queueMicrotask(resolve));
    assert.match(h.screen._sub.textContent, /Hull patch \(8 cr\)/);
    h.ctx.state.run.credits = 32; h.publish([{ ...patch, available: false, purchased: true }, { ...weld, available: false }]);
    h.bus.emit('run:shopPurchased', { offerId: patch.id });
    await new Promise(resolve => queueMicrotask(resolve));
    assert.doesNotMatch(h.screen._sub.textContent, /Service:/);
    h.ctx.state.run.wave = 0; h.publish([]); h.screen.refresh(h.ctx);
    assert.match(h.screen._sub.textContent, /Before round 1/);
    h.ctx.state.run.wave = 3; h.publish([weld]); h.screen.refresh(h.ctx);
    assert.equal(h.screen._sub.textContent, 'Round 3 cleared. Buy a new toy, or save for something bigger.');
    h.screen.onHide();
  } finally { globalThis.document = previous; }
});

test('newer upstream specialist warning survives the candidate factual forecast renderer', () => {
  const forecast = swarmForecastForRun(run(), 2);
  assert.ok(forecast);
  assert.doesNotMatch(swarmNextLine({ ...forecast, specialistBrief: null }), /prepare:/);
  const brief = { threat: 'A specialist approaches.', counter: 'Break its line of sight.' };
  assert.match(swarmNextLine({ ...forecast, specialistBrief: brief }), /prepare: A specialist approaches\. Break its line of sight\./);
});
