import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPipSpannerCrew } from '../src/ui/orrery/pipSpannerCrew.js';
import { crucibleDraftScreen } from '../src/ui/screens/crucibleDraft.js';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { TECH_NODES } from '../src/data/tech.js';

// Fake-DOM presenter contract, not browser, layout, GLB or accessibility acceptance.
// No defaultView means the real renderer is not created in these tests.

class Node {
  constructor(doc) { this.ownerDocument = doc; this.children = []; this.dataset = {}; this.attrs = {}; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  remove() { this.removed = true; }
}
function crew() {
  const doc = { createElement:() => new Node(doc), createElementNS:() => new Node(doc) };
  return createPipSpannerCrew({ host:new Node(doc), doc });
}
const offer = { id:'gun', name:'Rail gun', slotIndex:2 };
const accepted = { generation:4, sequence:1, outcome:'accepted', offerId:'gun', name:'Rail gun', text:'Rail gun fitted.', charged:true, price:76 };

test('crew inspect and pending never claim a fit; only the owner receipt closes the jaws', () => {
  const view = crew(); view.inspect(offer);
  assert.match(view.status.textContent, /Mount 3/); assert.equal(view.root.dataset.state, 'inspect');
  view.pending(offer); assert.equal(view.root.dataset.state, 'pending');
  view.receipt(accepted); assert.equal(view.root.dataset.state, 'accepted');
  assert.match(view.status.textContent, /76 run credits spent/);
  view.receipt({ ...accepted, sequence:2, outcome:'denied', text:'Not enough run credits.' });
  assert.equal(view.root.dataset.state, 'denied'); assert.match(view.status.textContent, /Not enough run credits/);
});

test('hide during pending rereads the receipt without motion, and reopen cannot replay it', () => {
  const view = crew(); view.inspect(offer); view.pending(offer); view.setActive(false);
  view.receipt(accepted);
  assert.equal(view.root.dataset.animate, 'false'); assert.equal(view.root.hidden, true);
  view.setActive(true); view.receipt(accepted);
  assert.equal(view.root.dataset.animate, 'false'); assert.equal(view.root.hidden, false);
  assert.equal(view.root.dataset.state, 'accepted');
  view.dispose(); assert.equal(view.root.removed, true);
});

test('a completed receipt cannot seat the new automatically selected item, or leak into another armory', () => {
  const view = crew(); view.scope(4); view.inspect({ id:'next', name:'Shield', slotIndex:3 });
  view.receipt(accepted);
  assert.equal(view.root.dataset.state, 'inspect'); assert.equal(view.root.dataset.animate, 'false');
  assert.match(view.status.textContent, /Rail gun/);
  view.scope(5); view.inspect(offer); view.receipt(null);
  assert.equal(view.root.dataset.state, 'inspect'); assert.doesNotMatch(view.status.textContent, /credits spent/);
});

test('double confirmation cannot buy the refreshed next selection until explicit inspection re-arms it', () => {
  let emits = 0;
  const screen = Object.create(crucibleDraftScreen), next = { id:'next', available:true };
  screen._reading = { offerId:'gun' };
  const owner = { currentOffers:() => [ { ...offer, available:true }, next ] };
  const ctx = { state:{run:{phase:'draft'}}, registry:{get:() => owner}, bus:{emit:() => {
    emits++;
    screen._purchaseSelected(ctx); // A synchronous event observer cannot recurse either.
    screen._reading.offerId = next.id;
  }} };
  screen._offersById = new Map([[next.id, next]]); screen._paintReading = () => {};
  const nextFocus = { target:{ closest:() => ({ dataset:{offerId:next.id} }) } };
  screen.refresh = () => screen._readFrom(nextFocus); screen._ctx = ctx;
  screen._purchaseSelected(ctx); screen._purchaseSelected(ctx);
  assert.equal(emits, 1); assert.equal(screen._flash, undefined);
  screen._restoringInspection = true; screen._readFrom(nextFocus);
  screen._purchaseSelected(ctx); assert.equal(emits, 1, 'focus restoration is not an explicit inspection');
  screen._restoringInspection = false; screen._readFrom(nextFocus);
  screen._purchaseSelected(ctx); assert.equal(emits, 2);
});

test('receipt-driven cosmetic motion uses no simulation time and does not schedule delayed gameplay', () => {
  const view = crew();
  view.inspect(offer); view.receipt(accepted);
  assert.equal(view.root.dataset.animate, 'true');
  assert.equal(view.status.attrs['aria-live'], 'polite');
  assert.equal(view.root.children[0].attrs['aria-hidden'], 'true');
  assert.equal(view.root.children[0].attrs.focusable, 'false');
});

test('accepted repair receipt states exact committed deltas, including zero and fractional components', () => {
  for (const [restoredHull, restoredArmor] of [[40, 20], [0, 20], [40, 0], [0.125, 2.75]]) {
    const view = crew();
    view.receipt({ ...accepted, kind:'service', offerId:'svc_weld', name:'Hull weld', text:'Welded to full.',
      restoredHull, restoredArmor, price:12.5 });
    assert.equal(view.status.textContent,
      `Spanner: Hull weld ready. Welded to full. Restored ${restoredHull} hull · ${restoredArmor} armor. 12.5 run credits spent.`);
  }
});

test('legacy, invalid, non-repair and uncommitted receipts never invent restoration', () => {
  for (const fields of [
    {}, { restoredHull:40 }, { restoredArmor:20 },
    { restoredHull:0, restoredArmor:0 },
    ...[undefined, null, NaN, Infinity, -Infinity, -1, '20'].flatMap(invalid => [
      { restoredHull:invalid, restoredArmor:20 }, { restoredHull:40, restoredArmor:invalid },
    ]),
    { kind:'module', restoredHull:40, restoredArmor:20 },
    { offerId:'svc_ordnance', restoredHull:40, restoredArmor:20 },
  ]) {
    const view = crew();
    view.receipt({ ...accepted, kind:'service', offerId:'svc_weld', ...fields });
    assert.equal(view.status.textContent, 'Spanner: Rail gun ready. Rail gun fitted. 76 run credits spent.');
  }
  const free = crew();
  free.receipt({ ...accepted, kind:'service', offerId:'svc_weld', restoredHull:0.5, restoredArmor:0, charged:false, price:0 });
  assert.match(free.status.textContent, /Restored 0.5 hull · 0 armor\. No run credits spent\./);
  for (const outcome of ['pending', 'denied']) {
    const view = crew();
    view.receipt({ ...accepted, kind:'service', offerId:'svc_weld', outcome, restoredHull:40, restoredArmor:20 });
    assert.doesNotMatch(view.status.textContent, /Restored|credits spent/);
  }
});

for (const [hull, armorHp, restoredHull, restoredArmor] of [[60, 30, 40, 20], [99.875, 47.25, 0.125, 2.75]]) {
test(`real milestone weld (${restoredHull} hull, ${restoredArmor} armor) reaches the presenter once and survives reopen`, () => {
  // Same real owner/wallet/fitting setup as pip-spanner-purchase-receipts.test.mjs.
  // Only the presenter uses fake DOM: no mocked repair, payment or receipt.
  const state = createGameState(4242), bus = createBus(), spent = [];
  const registry = { get:name => ({ ships, economy, survivalDraft, runSession })[name] };
  const ctx = { state, bus, registry, helpers:{} };
  const view = crew();
  try {
    economy.init(ctx); ships.init(ctx); economy.newGame(); ships.newGame();
    state.player.researchedNodes = TECH_NODES.map(node => node.id);
    ships.buyShip({ defId:'ship_hornet', grant:true, setActive:true });
    const entity = { id:9001, hull, hullMax:100, armorHp, armorMax:50 };
    state.entities.set(entity.id, entity); state.playerId = entity.id;
    runSession.init(ctx); survivalDraft.init(ctx);
    bus.on('run:spent', payload => spent.push(payload));
    bus.emit('run:beginRequested', { kind:'survival', ruleset:'swarm', seed:4242, arenaId:'helios_core' });
    let phase = 'loadout';
    for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup']) {
      bus.emit('run:transitionRequested', { expectedPhase:phase, nextPhase:next }); phase = next;
    }
    state.run.wave = 1;
    bus.emit('run:awardRequested', { credits:1000, reason:'round_loot' });
    bus.emit('run:transitionRequested', { expectedPhase:'cleanup', nextPhase:'draft' });
    const weld = survivalDraft.currentOffers().find(row => row.service === 'weld');
    assert.ok(weld?.available);
    const campaignCredits = state.player.credits;
    view.scope(survivalDraft.preparationGeneration()); view.inspect(weld); view.pending(weld);
    assert.doesNotMatch(view.status.textContent, /Restored/);
    assert.equal(survivalDraft.resolvePick({ offerId:weld.id }), true);
    const receipt = survivalDraft.preparationReceipt();
    assert.equal(receipt.outcome, 'accepted');
    assert.equal(receipt.restoredHull, restoredHull); assert.equal(receipt.restoredArmor, restoredArmor);
    assert.equal(receipt.price, weld.price); assert.equal(receipt.charged, true);
    assert.equal(entity.hull, 100); assert.equal(entity.armorHp, 50);
    assert.equal(state.run.credits, 1000 - weld.price);
    assert.equal(state.player.credits, campaignCredits);
    // A later health change cannot rewrite what this purchase actually repaired.
    entity.hull = 91; entity.armorHp = 45;
    view.receipt(receipt);
    assert.ok(view.status.textContent.includes(`Restored ${restoredHull} hull · ${restoredArmor} armor.`));
    assert.ok(view.status.textContent.endsWith(`${weld.price} run credits spent.`));
    const text = view.status.textContent;
    view.setActive(false); view.setActive(true); view.receipt(receipt);
    assert.equal(view.status.textContent, text); assert.equal(view.root.dataset.animate, 'false');
    assert.equal(survivalDraft.resolvePick({ offerId:weld.id }), false);
    assert.equal(spent.length, 1);
    assert.equal(survivalDraft.resolvePick({ offerId:null }), true);
    assert.equal(survivalDraft.preparationReceipt(), null);
    view.scope(survivalDraft.preparationGeneration() + 1); view.inspect(weld); view.receipt(receipt);
    assert.doesNotMatch(view.status.textContent, /Restored/);
  } finally {
    view.dispose(); survivalDraft.destroy(); runSession.destroy(); ships.destroy?.(); economy.destroy?.();
  }
});
}
