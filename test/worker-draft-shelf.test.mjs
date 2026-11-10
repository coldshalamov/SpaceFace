import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { createBus } from '../src/core/eventBus.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';

test('native draft stock mirrors real purchase, refusal and held-card custody', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const bus = createBus(); let opts;
    bus.on('game:new', value => { opts = structuredClone(value); });
    const setup = crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'swarm', seed: 4242 }).value;
    requestSandboxGame(bus, crucibleLaunchConfig(setup, 'swarm'));
    const mirror = createGameState(4242);
    const domains = new Map();
    Object.defineProperty(mirror, 'survivalDraftPublic', { get: () => domains.get('survivalDraftPublic'), configurable: true });
    const facade = createRegistry({ state: mirror, bus: createBus(), helpers: {}, simLane: 'worker' }).get('survivalDraft');
    assert.ok(facade, 'the real worker registry exposes its native-backed draft read surface');
    let tick = 0;
    const send = async (...descriptors) => {
      const ring = createSimCommandRing();
      for (const d of descriptors) pushLaneCommand(ring, d);
      const reply = await lane.tick({ tick: ++tick, steps: 0,
        ackEnd: init.initRebuild?.end ?? 0, commands: structuredClone(ring.drain()) });
      for (const u of reply.domainUpdates) applyDomainPathUpdate(domains, u, new WeakSet());
      return reply;
    };
    await send({ kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'arena', op: 'newGameBoot', args: { opts } });
    const state = lane.host.state;
    const native = lane.host.registry.get('survivalDraft');
    assert.equal(state.run.phase, 'draft');
    assert.ok(native.currentOffers().length > 0);
    assert.deepEqual(facade.currentOffers(), native.currentOffers(), 'main shows native stock, not an invented catalogue');
    const stableSnapshot = state.survivalDraftPublic;
    await send();
    assert.equal(state.survivalDraftPublic, stableSnapshot, 'paused frames reuse unchanged native stock');
    const buy = facade.currentOffers().find(row => row.available && Number.isInteger(row.slotIndex) && row.price > 0);
    assert.ok(buy, 'the actual opening stock offers a legal purchase');
    const held = facade.currentOffers().find(row => row.id !== buy.id && Number.isInteger(row.slotIndex) && !row.purchased);
    assert.ok(held);
    await send({ kind: 'busEmit', emit: 'run:draftLockRequested', payload: { offerId: held.id } });
    assert.equal(facade.currentOffers().find(row => row.id === held.id).held, true,
      JSON.stringify({ held: held.id, native: native.currentOffers().find(row => row.id === held.id)?.held,
        published: state.survivalDraftPublic?.offers.find(row => row.id === held.id)?.held, lock: native._locked?.id }));
    const detached = facade.currentOffers();
    detached.find(row => row.id === held.id).held = false;
    assert.equal(facade.currentOffers().find(row => row.id === held.id).held, true, 'UI reads cannot mutate native custody');

    const credits = state.run.credits;
    await send({ kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: buy.id } });
    assert.equal(state.run.credits, credits - buy.price);
    assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittings[buy.slotIndex], buy.defId);
    const boughtRow = facade.currentOffers().find(row => row.id === buy.id);
    assert.ok(!boughtRow || boughtRow.purchased, 'settled stock removes or marks the purchased row');
    assert.deepEqual(facade.currentOffers(), native.currentOffers());
    assert.equal(facade.preparationReceipt().outcome, 'accepted');
    assert.equal(facade.preparationGeneration(), native.preparationGeneration());
    assert.deepEqual(facade.refitRows(), native.refitRows());

    const fittings = JSON.stringify(state.player.ownedShips);
    const settledCredits = state.run.credits;
    await send({ kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: buy.id } });
    assert.equal(state.run.credits, settledCredits, 'a repeated/refused purchase never spends twice');
    assert.equal(JSON.stringify(state.player.ownedShips), fittings);
    assert.equal(facade.preparationReceipt().outcome, 'denied');
    assert.equal(facade.lastNotice(), native.lastNotice());
    await send({ kind: 'busEmit', emit: 'run:draftLockRequested', payload: { offerId: buy.id } });
    assert.equal(facade.currentOffers().find(row => row.id === held.id).held, true,
      'holding a spent card is refused without displacing the existing held card');
    await send({ kind: 'busEmit', emit: 'run:draftRerollRequested', payload: {} });
    assert.equal(state.run.credits, settledCredits, 'the full-stock armory refuses a reroll without charging');
    assert.ok(facade.currentOffers().some(row => row.id === held.id && row.held),
      'a refused reroll preserves actual native held-card custody');
    assert.deepEqual(facade.rerollState(), native.rerollState());

    await send({ kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    await send({ kind: 'rpc', id: 'ordinary-game', op: 'newGameBoot', args: { opts: { seed: 4242 } } });
    assert.equal(state.run.phase, 'inactive');
    assert.equal(state.survivalDraftPublic, null);
    assert.deepEqual(facade.currentOffers(), []);
    assert.equal(facade.preparationReceipt(), null, 'closed-run receipts are not campaign or next-run state');
  } finally {
    lane.shutdown();
    assert.equal(lane.host.draftReadUnsubscribe, null, 'the ephemeral stock listener releases at host shutdown');
  }
});
