import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { consumeStationTradeReceipt, tradeClearedReceipt, TRADE_EXPECTATION_KEY } from '../src/ui/station/tradeReceipt.js';

const GOOD = 'cmdty_ore_iron', STATION = 'station_helios';

test('worker delayed same-lot completion cannot consume a different pending confirmation', async () => {
  const worker = createSimHost();
  try {
    const init = await worker.init({profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)))});
    const {state, registry} = worker.host;
    state.ui.docked = true; state.ui.dockedStationId = STATION;
    state.player.credits = 10000; state.player.cargo.capVolume = 250;
    registry.get('economy').ensureMarket(STATION);
    const mirror = createGameState(4242);
    let tick = 0;
    const send = async intentId => {
      const ring = createSimCommandRing();
      pushLaneCommand(ring, {kind:'rpc', id:`rpc:${intentId}`, op:'economyTrade',
        args:{commodityId:GOOD, side:'buy', qty:2, sourceStationId:STATION, intentId}});
      const reply = await worker.tick({tick:++tick, steps:0, ackEnd:init.initRebuild?.end ?? 0, commands:ring.drain()});
      for (const update of reply.domainUpdates || []) {
        const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
        const holder = new Map([[segs[0], mirror[segs[0]]]]);
        applyDomainPathUpdate(holder, {...structuredClone(update), segs}, new Set());
        mirror[segs[0]] = holder.get(segs[0]);
      }
      const event = reply.events.find(e => e.t === 'economy:tradeCompleted');
      assert.ok(event, 'the real economy publishes a bridged completion');
      assert.equal(reply.rpcAcks[0].result.result.ok, true);
      return structuredClone(event.p);
    };
    const earlier = await send('market:earlier');
    const later = await send('market:later');
    await send('market:newest'); // The worker mirror may already contain a newer same-lot settlement.
    mirror.ui[TRADE_EXPECTATION_KEY] = {intentId:'market:later', commodityId:GOOD, side:'buy', qty:2,
      total:later.total, stationId:STATION, afterSequence:0, atSimTime:mirror.simTime || 0};
    const first = tradeClearedReceipt(mirror, earlier);
    assert.doesNotMatch(first.detail, /settled as confirmed/);
    assert.equal(mirror.ui[TRADE_EXPECTATION_KEY]?.intentId, 'market:later', 'late earlier receipt cannot consume the new confirmation');
    const second = tradeClearedReceipt(mirror, later);
    assert.match(second.detail, /settled as confirmed/);
    assert.equal(mirror.ui[TRADE_EXPECTATION_KEY], null);
    assert.equal(state.player.cargo.items[GOOD], 6, 'only the three real worker settlements move cargo');
  } finally { worker.shutdown(); }
});

test('worker partial receipt preserves six of ten confirmed before the warm ledger mirror arrives', async () => {
  const worker = createSimHost(), mirror = createGameState(4242);
  try {
    const init = await worker.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, registry } = worker.host, economy = registry.get('economy');
    state.ui.docked = true; state.ui.dockedStationId = STATION;
    state.player.credits = 100000; state.player.cargo.capVolume = 250;
    economy.ensureMarket(STATION);
    let tick = 0, ackEnd = init.initRebuild?.end ?? 0;
    function apply(updates) {
      for (const update of updates || []) {
        const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
        const holder = new Map([[segs[0], mirror[segs[0]]]]);
        applyDomainPathUpdate(holder, { ...structuredClone(update), segs }, new Set());
        mirror[segs[0]] = holder.get(segs[0]);
      }
    }
    apply(init.domainUpdates);
    async function transfer(commands = []) {
      const reply = await worker.tick({ tick: ++tick, steps: 0, commands, ackEnd });
      ackEnd = reply.journalEnd; apply(reply.domainUpdates);
      return reply;
    }
    async function trade(intentId, qty, expectedTotal) {
      const ring = createSimCommandRing();
      pushLaneCommand(ring, { kind: 'rpc', id: `rpc:${intentId}`, op: 'economyTrade',
        args: { intentId, commodityId: GOOD, side: 'buy', qty, sourceStationId: STATION, expectedTotal } });
      return transfer(ring.drain());
    }
    let earlier;
    for (let i = 0; i < 8; i++) {
      const reply = await trade(`market:prime-${i}`, 1);
      earlier = reply.events.find(e => e.t === 'economy:tradeCompleted').p;
    }
    const confirmed = economy.quote(STATION, GOOD, 'buy', 10);
    assert.equal(confirmed.ok, true); assert.equal(confirmed.qty, 10);
    const volume = state.player.cargo.usedVolume / state.player.cargo.items[GOOD];
    state.player.cargo.capVolume = state.player.cargo.usedVolume + 6 * volume;
    const intentId = 'market:partial-after-eight';
    const expectation = { intentId, stationId: STATION, commodityId: GOOD, side: 'buy', qty: 10,
      total: confirmed.total, atSimTime: mirror.simTime, afterSequence: mirror.player.tradeLedger[0]?.tradeSequence || 0 };
    mirror.ui[TRADE_EXPECTATION_KEY] = expectation;
    const reply = await trade(intentId, 10, confirmed.total);
    const event = reply.events.find(e => e.t === 'economy:tradeCompleted' && e.p.intentId === intentId)?.p;
    assert.equal(event?.qty, 6, 'the native economy actually accepts only six units');
    assert.equal(event.stationId, STATION); assert.equal(event.commodityId, GOOD); assert.equal(event.side, 'buy');
    assert.ok(state.player.tradeLedger.some(r => r.receiptId === event.receiptId), 'retain the native receipt identity');
    const ledgerArrived = () => mirror.player.tradeLedger.some(r => r.receiptId === event.receiptId);
    assert.equal(ledgerArrived(), false, 'the exact ledger leaf is between its real warm mirror cadences');
    const shownIntentIds = new Set(), options = { shownIntentIds };
    consumeStationTradeReceipt(mirror, earlier, options);
    assert.equal(mirror.ui[TRADE_EXPECTATION_KEY], expectation, 'an unrelated same-lot terminal receipt cannot consume these terms');
    const before = JSON.stringify({ player: mirror.player, economy: mirror.economy });
    const receipt = consumeStationTradeReceipt(mirror, event, options);
    assert.match(receipt.line, /BOUGHT 6 OF THE 10 CONFIRMED/);
    assert.ok(receipt.detail.includes(`${event.total} cr`), 'show the native settled total');
    assert.equal(mirror.ui[TRADE_EXPECTATION_KEY], null);
    assert.equal(shownIntentIds.has(intentId), true);
    assert.equal(JSON.stringify({ player: mirror.player, economy: mirror.economy }), before, 'receipt presentation is read-only over gameplay');
    assert.equal(mirror.player.cargo.items[GOOD], state.player.cargo.items[GOOD]);
    assert.equal(mirror.player.credits, state.player.credits);
    assert.equal(consumeStationTradeReceipt(mirror, event, options), null, 'the same terminal event presents once');
    for (let i = 0; i < 10 && !ledgerArrived(); i++) await transfer();
    assert.equal(ledgerArrived(), true, 'the exact ledger later arrives through its unchanged cadence');
    assert.equal(consumeStationTradeReceipt(mirror, event, options), null, 'late ledger availability does not present twice');
  } finally { worker.shutdown(); }
});
