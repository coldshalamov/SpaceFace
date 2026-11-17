import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { crucibleSetupFor, lastCrucibleSetup, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';
import { emptyCrucibleProfile, loadCrucibleMeta } from '../src/systems/survivalRecords.js';

test('paused native cancellation discards purchased preparation without paying or recording and rebuilds the original setup', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const permanent = emptyCrucibleProfile();
    permanent.hangar.bounty = 680;
    permanent.hangar.ranks.war_chest = 2;
    globalThis.localStorage.setItem('sf.save.crucible_meta', JSON.stringify(permanent));
    const domains = new Map();
    for (const update of init.domainUpdates) applyDomainPathUpdate(domains, update, new WeakSet());
    let tick = 0;
    const send = async (...commands) => {
      const ring = createSimCommandRing();
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
        commands: structuredClone(ring.drain()) });
      for (const update of reply.domainUpdates) applyDomainPathUpdate(domains, update, new WeakSet());
      return reply;
    };
    const emit = (name, payload) => ({ kind: 'busEmit', emit: name, payload });
    let opts;
    const setup = crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'swarm', seed: 4242,
      swarmStake: 'exhibition' }).value;
    requestCrucibleRun({ emit(name, value) { if (name === 'game:new') opts = structuredClone(value); } }, setup, 'swarm');
    const originalChoice = lastCrucibleSetup();
    const boot = (id) => send({ kind: 'mode', mode: 'loading' },
      { kind: 'rpc', id, op: 'newGameBoot', args: { opts } });
    await boot('preparation-original');
    const { state, registry, bus } = lane.host;
    const draft = registry.get('survivalDraft');
    assert.equal(state.run.phase, 'draft');
    const token = state.run.retireToken;
    const initialCredits = state.run.credits;
    const initialShip = state.player.ownedShips[state.player.activeShipIndex];
    const initialFittings = [...initialShip.fittings];
    const buy = draft.currentOffers().find(row => row.available && row.price > 0
      && Number.isInteger(row.slotIndex) && !initialFittings.includes(row.defId));
    assert.ok(buy, 'the real opening stock offers a distinct fitted purchase');
    await send(emit('run:draftPickRequested', { offerId: buy.id }));
    assert.equal(state.run.credits, initialCredits - buy.price);
    assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittings[buy.slotIndex], buy.defId);
    assert.equal(draft.preparationReceipt().outcome, 'accepted');
    const permanentBefore = globalThis.localStorage.getItem('sf.save.crucible_meta');
    const savedCampaignBefore = globalThis.localStorage.getItem('sf.save.auto');
    const forbidden = [];
    for (const name of ['run:resultsReady', 'player:death', 'run:waveCleared']) bus.on(name, value => forbidden.push([name, value]));
    await send({ kind: 'mode', mode: 'paused' });

    const reply = await send(emit('run:retireRequested', { token, intent: 'cancel_preparation' }));
    const receipt = reply.events.find(event => event.t === 'run:preparationCancelResolved');
    assert.ok(receipt, 'the default production bridge transports the cancellation receipt');
    assert.deepEqual(receipt.p, { token, ok: true, reason: 'preparation_cancelled' });
    assert.equal(domains.get('run').retireToken, token);
    assert.equal(domains.get('run').phase, 'ended');
    assert.equal(domains.get('run').result.reason, 'preparation_cancelled', 'the complete run is mirrored in the receipt reply while paused');
    assert.equal(domains.get('survivalResultsPublic').result, null);
    assert.equal(registry.get('survivalResults').lastResult(), null);
    assert.equal(draft.preparationReceipt(), null);
    assert.deepEqual(draft.currentOffers(), []);
    assert.deepEqual(forbidden, []);
    assert.equal(globalThis.localStorage.getItem('sf.save.crucible_meta'), permanentBefore);
    assert.equal(loadCrucibleMeta().hangar.bounty, 680, 'the pre-existing permanent wallet is retained');
    assert.equal(globalThis.localStorage.getItem('sf.save.auto'), savedCampaignBefore);
    assert.equal((reply.storageOps || []).some(op => op.key === 'sf.save.crucible_meta'), false);
    assert.deepEqual(lastCrucibleSetup(), originalChoice, 'purchased equipment never replaces the remembered hangar choice');

    const exit = await send(emit('game:exitToMenu', { source: 'swarm_preparation_cancelled' }), { kind: 'mode', mode: 'menu' });
    assert.equal(state.run.phase, 'inactive');
    assert.deepEqual(forbidden, []);
    assert.equal((exit.storageOps || []).some(op => op.key === 'sf.save.crucible_meta'), false);
    const retry = await boot('preparation-retry');
    assert.equal(retry.rpcAcks.find(row => row.id === 'preparation-retry').ok, true);
    assert.equal(state.run.phase, 'draft');
    assert.notEqual(state.run.retireToken, token);
    assert.equal(state.run.credits, initialCredits, 'a new preparation receives its normal original allowance, not a refund');
    const retryShip = state.player.ownedShips[state.player.activeShipIndex];
    assert.equal(retryShip.defId, setup.hullId);
    assert.deepEqual(retryShip.fittings, initialFittings, 'the purchased fit is discarded with the old run');
    assert.equal(state.player.moduleInventory.some(item => item.defId === buy.defId), false,
      'discarded purchases cannot survive as free spare equipment');
    const successor = state.run.retireToken;
    const stale = await send(emit('run:retireRequested', { token, intent: 'cancel_preparation' }));
    assert.equal(stale.events.find(event => event.t === 'run:preparationCancelResolved').p.ok, false);
    assert.equal(state.run.retireToken, successor);
    assert.equal(state.run.phase, 'draft');
    assert.equal(globalThis.localStorage.getItem('sf.save.crucible_meta'), permanentBefore);
  } finally { lane.shutdown(); }
});
