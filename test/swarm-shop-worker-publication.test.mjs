import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DOMAIN_COLD_BYTES,
  DOMAIN_COLD_TICKS,
  DOMAIN_WARM_BYTES,
  DOMAIN_WARM_TICKS,
  applyDomainPathUpdate,
  configureDomainMirroring,
  createDomainDiffer,
} from '../scripts/lib/simReadModel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createGameState } from '../src/core/gameState.js';

const RUN_SHOP_PATHS = Object.freeze([
  'run.kind', 'run.ruleset', 'run.arenaId', 'run.phase', 'run.wave',
  'run.credits', 'run.modifiers', 'run.telemetry',
]);
const COLD_RUN_PATHS = Object.freeze(['run.arenaId', 'run.credits', 'run.modifiers', 'run.telemetry']);

function updatePaths(updates) {
  return new Set((updates || []).map((update) => update.segs.join('.')));
}

function domainInterval(node) {
  const sizeInterval = node.bytes > DOMAIN_COLD_BYTES ? DOMAIN_COLD_TICKS
    : node.bytes > DOMAIN_WARM_BYTES ? DOMAIN_WARM_TICKS : 1;
  return Math.max(sizeInterval, Number.isFinite(node.cadence) ? node.cadence : 1, 1);
}

function dueOn(node, tick) {
  const interval = domainInterval(node);
  return interval > 1 && tick % interval === node.slot % interval;
}

function nextThreeOffTicks(start, nodes) {
  for (let tick = start; tick < start + 240; tick += 1) {
    if (nodes.every((node) => [tick, tick + 1, tick + 2].every((candidate) => !dueOn(node, candidate)))) {
      return tick;
    }
  }
  throw new Error('could not find three consecutive non-cadence run passes');
}

function pathsForRun(differ) {
  return RUN_SHOP_PATHS.map((path) => {
    const node = differ.paths.get(path);
    assert.ok(node?.leaf, `${path} must already be a registered run descendant`);
    return node;
  });
}

test('run-subtree invalidation opens all changed leaves once, then returns to normal cadence', () => {
  configureDomainMirroring({ staggerCold: true });
  const state = createGameState(4242);
  state.run.kind = 'survival';
  state.run.ruleset = 'swarm';
  state.run.phase = 'draft';
  state.run.arenaId = 'arena_helios_core';
  state.run.wave = 0;
  state.run.credits = 500;
  const differ = createDomainDiffer({ probe: false });
  differ.diff(state, 0);
  const nodes = pathsForRun(differ);

  state.run.credits = 214;
  state.run.modifiers = [{ kind: 'catalog', offerId: 'rig:flail', defId: 'mod_mass_flail_rig', wave: 1 }];
  state.run.telemetry = {
    swarmStake: 'exhibition',
    hangar: { hullId: 'ship_kestrel', fittings: ['mod_mass_flail_rig'], spares: [] },
  };
  const staleTick = nextThreeOffTicks(1, nodes);
  const stale = differ.diff(state, staleTick);
  assert.equal([...updatePaths(stale.updates)].some((path) => RUN_SHOP_PATHS.includes(path)), false,
    'without a result receipt the changed run leaves retain their staggered cadence');

  assert.ok(differ.invalidateSubtree('run') >= nodes.length);
  const resultTick = staleTick + 1;
  const fresh = differ.diff(state, resultTick);
  const freshPaths = updatePaths(fresh.updates);
  for (const path of ['run.credits', 'run.modifiers', 'run.telemetry']) {
    assert.ok(freshPaths.has(path), `${path} is published in the same result reply`);
  }
  const valueFor = (path) => fresh.updates.find((update) => update.segs.join('.') === path)?.v;
  assert.equal(valueFor('run.credits'), 214);
  assert.equal(valueFor('run.telemetry').swarmStake, 'exhibition');
  assert.equal(valueFor('run.telemetry').hangar.fittings[0], 'mod_mass_flail_rig');
  assert.equal(valueFor('run.modifiers')[0].defId, 'mod_mass_flail_rig');

  differ.invalidateSubtree('run');
  const duplicate = differ.diff(state, resultTick + 1);
  assert.equal([...updatePaths(duplicate.updates)].some((path) => path.startsWith('run.')), false,
    'repeated receipts do not resend unchanged run leaves');

  state.run.credits = 213;
  const creditNode = differ.paths.get('run.credits');
  const cadenceTick = Array.from({ length: domainInterval(creditNode) + 1 }, (_, index) => resultTick + 2 + index)
    .find((tick) => dueOn(creditNode, tick));
  assert.ok(Number.isInteger(cadenceTick), 'the original cadence slot remains available');
  for (let tick = resultTick + 2; tick < cadenceTick; tick += 1) {
    const reply = differ.diff(state, tick);
    assert.equal(updatePaths(reply.updates).has('run.credits'), false,
      'the urgent result sign does not turn into a per-tick run mirror');
  }
  const paced = differ.diff(state, cadenceTick);
  assert.equal(paced.updates.find((update) => update.segs.join('.') === 'run.credits')?.v, 213);
});

test('paused native worker replies publish draft/refit receipts with coherent run state and clean up hooks', async () => {
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  const lane = createSimHost();
  let shutDown = false;
  try {
    const init = await lane.init({
      profile: 'production',
      seed: 4242,
      bridgeAll: true,
      scenarioContract,
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
    });
    assert.equal(init.profile, 'production');
    const mainDomains = new Map();
    for (const update of init.domainUpdates) applyDomainPathUpdate(mainDomains, update);
    const run = lane.host.state.run;
    const bus = lane.host.bus;
    lane.host.state.mode = 'paused';
    const watchedNodes = pathsForRun(lane.host.domainDiffer);

    function assertSameReplyHasRun(eventName, expected) {
      // This runs after the caller obtained the result reply; the event and all run deltas
      // must share that one paused host response.
      const reply = expected.reply;
      assert.ok(reply.events.some((event) => event.t === eventName), `${eventName} crosses the real bridge`);
      const changed = updatePaths(reply.domainUpdates);
      for (const path of expected.paths) assert.ok(changed.has(path), `${path} accompanies ${eventName}`);
      const published = mainDomains.get('run');
      assert.equal(published.phase, expected.phase);
      assert.equal(published.wave, expected.wave);
      assert.equal(published.credits, expected.credits);
      assert.equal(published.telemetry.hangar.fittings[0], expected.rig);
      assert.equal(published.modifiers[0].defId, expected.rig);
    }

    async function pausedReply() {
      const reply = await lane.tick({ tick: 0, steps: 0, commands: [] });
      assert.equal(reply.completedTick, null, 'steps:0 models a paused presentation reply');
      for (const update of reply.domainUpdates) applyDomainPathUpdate(mainDomains, update);
      return reply;
    }

    async function advancePausedTo(target) {
      while (lane.host.domainDiffSeq < target) await pausedReply();
    }

    // Opening edge: the first public stock event sees the run phase and purse in the same
    // response. A player must not open an Adventure/Swarm shop on the previous run envelope.
    const coldNodes = watchedNodes.filter((node) => COLD_RUN_PATHS.includes(node.path));
    const runRoot = lane.host.domainDiffer.paths.get('run');
    assert.ok(runRoot?.kids?.has('phase') && runRoot.kids.has('wave'),
      'phase and wave are existing children under the run subtree, not separate mirror roots');
    const openingTarget = nextThreeOffTicks(lane.host.domainDiffSeq, coldNodes);
    await advancePausedTo(openingTarget);
    run.kind = 'survival';
    run.ruleset = 'swarm';
    run.arenaId = 'arena_helios_core';
    run.phase = 'draft';
    run.wave = 1;
    run.credits = 214;
    run.modifiers = [{ kind: 'catalog', offerId: 'rig:flail', defId: 'mod_mass_flail_rig', wave: 1 }];
    run.telemetry = { swarmStake: 'exhibition', hangar: { hullId: 'ship_kestrel', fittings: ['mod_mass_flail_rig'], spares: [] } };
    // The event and source write deliberately share this zero-step reply, just as
    // a shop-opening result can arrive on a frozen worker with no timer ticks.
    bus.emit('run:draftOffered', { wave: 1, offers: [], rerolls: 0 });
    const opening = await pausedReply();
    assertSameReplyHasRun('run:draftOffered', {
      reply: opening, phase: 'draft', wave: 1, credits: 214,
      rig: 'mod_mass_flail_rig', paths: RUN_SHOP_PATHS,
    });
    bus.emit('run:draftOffered', { wave: 1, offers: [], rerolls: 0 });
    const unchanged = await pausedReply();
    assert.ok(unchanged.events.some((event) => event.t === 'run:draftOffered'));
    assert.equal([...updatePaths(unchanged.domainUpdates)].some((path) => path.startsWith('run.')), false,
      'an unchanged duplicate opening receipt carries no redundant run snapshot');

    // Purchase result: all canonical inputs move together, including the rig modifier and
    // the nested hangar inventory in telemetry. This is the exact ownership lane the forecast reads.
    const purchaseTarget = nextThreeOffTicks(lane.host.domainDiffSeq, coldNodes);
    await advancePausedTo(purchaseTarget);
    run.credits = 78;
    run.wave = 1;
    run.modifiers = [{ kind: 'catalog', offerId: 'rig:flail', defId: 'mod_mass_flail_rig', wave: 1 },
      { kind: 'weapon', offerId: 'cannon', defId: 'wpn_concussion_cannon_m', wave: 1 }];
    run.telemetry = { swarmStake: 'exhibition', hangar: { hullId: 'ship_kestrel', fittings: ['mod_mass_flail_rig'], spares: ['wpn_concussion_cannon_m'] } };
    const purchaseReceipt = { wave: 1, offerId: 'cannon', price: 136 };
    bus.emit('run:shopPurchased', purchaseReceipt);
    const purchase = await pausedReply();
    assert.ok(purchase.events.some((event) => event.t === 'run:shopPurchased'));
    const purchasePaths = updatePaths(purchase.domainUpdates);
    for (const path of ['run.credits', 'run.modifiers', 'run.telemetry']) {
      assert.ok(purchasePaths.has(path), `${path} accompanies the purchase receipt`);
    }
    assert.equal(mainDomains.get('run').credits, 78);
    assert.equal(mainDomains.get('run').modifiers[1].defId, 'wpn_concussion_cannon_m');
    assert.equal(mainDomains.get('run').telemetry.hangar.spares[0], 'wpn_concussion_cannon_m');

    // Refit-open and result events are bounded too; sell/refund receipts must not depend on a
    // future timer. The rig-shaped run record and wallet are read from one merged facade.
    const offTarget = nextThreeOffTicks(lane.host.domainDiffSeq, coldNodes);
    await advancePausedTo(offTarget);
    run.phase = 'refit';
    run.wave = 10;
    run.credits = 301;
    run.modifiers = [{ kind: 'catalog', offerId: 'rig:flail', defId: 'mod_mass_flail_rig', wave: 10 }];
    run.telemetry = { swarmStake: 'veteran', hangar: { hullId: 'ship_kestrel', fittings: ['mod_mass_flail_rig'], spares: [] } };
    bus.emit('run:refitOffered', { wave: 10, loadout: { hullId: 'ship_kestrel', fittings: [] } });
    const refitOpen = await pausedReply();
    assertSameReplyHasRun('run:refitOffered', {
      reply: refitOpen, phase: 'refit', wave: 10, credits: 301,
      rig: 'mod_mass_flail_rig', paths: ['run.phase', 'run.wave', 'run.credits', 'run.modifiers', 'run.telemetry'],
    });

    const resultTarget = nextThreeOffTicks(lane.host.domainDiffSeq, coldNodes);
    await advancePausedTo(resultTarget);
    run.credits = 351;
    run.telemetry.hangar.spares = ['mod_mass_flail_rig'];
    bus.emit('run:refitChanged', { wave: 10, slotIndex: 0, action: 'fit', ok: true, reason: null });
    const refitResult = await pausedReply();
    assertSameReplyHasRun('run:refitChanged', {
      reply: refitResult, phase: 'refit', wave: 10, credits: 351,
      rig: 'mod_mass_flail_rig', paths: ['run.credits', 'run.telemetry'],
    });

    // A combat award is not a shop signal. The narrowly filtered hook avoids a run walk,
    // while the exact purchase-refund receipt remains an urgent, event-bounded publication.
    const creditNode = lane.host.domainDiffer.paths.get('run.credits');
    assert.equal(creditNode.urgentSign, false);
    const combatTarget = nextThreeOffTicks(lane.host.domainDiffSeq, [creditNode]);
    await advancePausedTo(combatTarget);
    run.credits = 356;
    bus.emit('run:awarded', { credits: 5, reason: 'wave_cleared' });
    assert.equal(creditNode.urgentSign, false, 'ordinary combat awards do not invalidate run');
    const combatAward = await pausedReply();
    assert.ok(combatAward.events.some((event) => event.t === 'run:awarded'));
    assert.equal(combatAward.domainUpdates.find((update) => update.segs.join('.') === 'run.credits'), undefined,
      'combat award retains the ordinary off-cadence publication');
    assert.equal(mainDomains.get('run').credits, 351);
    const refundTarget = nextThreeOffTicks(lane.host.domainDiffSeq, [creditNode]);
    await advancePausedTo(refundTarget);
    run.credits = 366;
    bus.emit('run:awarded', { credits: 15, reason: 'crucible:purchaseRefund', totalCredits: 366 });
    const refund = await pausedReply();
    assert.ok(refund.events.some((event) => event.t === 'run:awarded'));
    assert.equal(refund.domainUpdates.find((update) => update.segs.join('.') === 'run.credits')?.v, 366);

    const partialTarget = nextThreeOffTicks(lane.host.domainDiffSeq, [creditNode]);
    await advancePausedTo(partialTarget);
    run.credits = 412;
    const partialStale = await pausedReply();
    assert.equal(updatePaths(partialStale.domainUpdates).has('run.credits'), false);
    bus.emit('run:partialBanked', { wave: 10, credits: 46, totalCredits: 412 });
    const partialBank = await pausedReply();
    assert.ok(partialBank.events.some((event) => event.t === 'run:partialBanked'));
    assert.equal(partialBank.domainUpdates.find((update) => update.segs.join('.') === 'run.credits')?.v, 412);

    const rejectedTarget = nextThreeOffTicks(lane.host.domainDiffSeq, [creditNode]);
    await advancePausedTo(rejectedTarget);
    assert.equal(creditNode.urgentSign, false);
    bus.emit('run:spendRejected', { reason: 'ordinary_spend' });
    assert.equal(creditNode.urgentSign, false, 'unrelated wallet rejections are not publication signals');
    bus.emit('run:spendRejected', { reason: 'partial_bank' });
    assert.equal(creditNode.urgentSign, true, 'the exact refit-bank rejection is bounded and observable');
    const rejected = await pausedReply();
    assert.equal(updatePaths(rejected.domainUpdates).has('run.credits'), false,
      'an unchanged rejection signs without resending the balance');
    assert.equal(creditNode.urgentSign, false);

    const busEvents = [
      'run:draftOffered', 'run:refitOffered', 'run:shopPurchased', 'run:draftRerolled',
      'run:draftResolved', 'run:partialBanked', 'run:draftPickRejected', 'run:draftRerollRejected',
      'run:refitChanged', 'run:spendRejected', 'run:awarded',
    ];
    const beforeCleanup = new Map(busEvents.map((event) => [event, bus._listeners.get(event)?.size || 0]));
    lane.host.runShopMirrorUnsubscribe();
    assert.equal(lane.host.runShopMirrorUnsubscribe, null);
    for (const event of busEvents) {
      assert.equal(bus._listeners.get(event)?.size || 0, beforeCleanup.get(event) - 1,
        `${event} host mirror subscription is released`);
    }
    // Reaching cleanup explicitly is safe; the public shutdown path also invokes it idempotently.
    lane.shutdown();
    shutDown = true;
  } finally {
    if (!shutDown) lane.shutdown();
  }
});
