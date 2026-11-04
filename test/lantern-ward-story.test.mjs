import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLanternWardReward, settleLanternWard, selectLanternWardDialogue } from '../src/missions/lanternWardStory.js';

const STORY = 'lw_helios_empty_plinth';
const DISTRICT = 'district_helios_lantern_ward';
const SECTOR = 'sector_helios_prime';
const RECEIPT = 'lantern-ward:venn-family-lamp:service:01';
const receipt = () => ({
  receiptId: RECEIPT, storyId: STORY, districtId: DISTRICT, sectorId: SECTOR,
  lampRecordId: 'lantern-ward:lamp', lampSerial: 'venn-family-lamp:01',
  receiverRecordId: 'lantern-ward:receiver', committed: true,
  committedTick: 4522, committedAtS: 75.3666666667,
  playerHelped: true, method: 'native_service', recovered: false, count: 1,
});
const savedReward = (status = 'settled') => ({
  version: 1, status, storyId: STORY, receiptId: RECEIPT,
  credited: 180, committedTick: 4522, committedAtS: 75.3666666667,
});

function harness(options = {}) {
  const r = receipt();
  const state = {
    tick: r.committedTick, simTime: r.committedAtS,
    world: { currentSectorId: SECTOR },
    player: { credits: 1000 }, missions: { lanternWardReward: null },
  };
  const events = [], cash = [], completions = [], reentries = [];
  const work = { lanternWardReceipt: id => id === RECEIPT ? { ...r } : null };
  const economy = { grantCredits(amount, reason) {
    state.player.credits += amount;
    cash.push({ amount, reason });
    return state.player.credits;
  } };
  const owner = {
    state,
    registry: { get: name => name === 'npcJobsRuntime' ? work : name === 'economy' ? economy : null },
    _logCompletion: (...args) => completions.push(args),
    bus: { emit(name, payload) {
      events.push({ name, payload });
      if (name === 'economy:grantCredits') {
        if (options.throwBefore) throw new Error('before dispatch');
        if (options.reentrant) reentries.push(settleLanternWard(owner, RECEIPT));
        if (!options.noCreditListener) economy.grantCredits(payload.amount, payload.reason);
        if (options.throwAfter) throw new Error('after dispatch');
      }
      if (name === 'mission:completed' && options.throwCompletion) throw new Error('presentation listener');
    } },
  };
  return { owner, state, r, work, economy, events, cash, completions, reentries };
}

test('optional ambient service settles through canonical world sector and economy event once', () => {
  const h = harness();
  assert.equal(h.state.currentSectorId, undefined);
  const result = settleLanternWard(h.owner, RECEIPT);
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(h.state.player.credits, 1180);
  assert.deepEqual(h.cash, [{ amount: 180, reason: STORY }]);
  assert.deepEqual(h.completions, [[STORY, 180, true]]);
  assert.deepEqual(h.state.missions.lanternWardReward, savedReward());
  assert.equal(h.events.filter(e => e.name === 'mission:completed').length, 1);
  assert.equal(settleLanternWard(h.owner, RECEIPT).duplicate, true);
  assert.equal(h.cash.length, 1);
  result.journal.status = 'reserved';
  assert.equal(h.state.missions.lanternWardReward.status, 'settled');
});

test('only a stable receipt ID is accepted, never a caller-provided receipt object', () => {
  const h = harness();
  assert.equal(settleLanternWard(h.owner, receipt()).reason, 'invalid_request');
  assert.equal(settleLanternWard(h.owner, 'fabricated').reason, 'unverified_receipt');
  h.work.lanternWardReceipt = () => null;
  h.state.npcJobs = { lanternWard: { phase: 'installed', firstCompletionReceipt: receipt() } };
  assert.equal(settleLanternWard(h.owner, RECEIPT).reason, 'unverified_receipt');
  assert.equal(h.cash.length, 0);
});

test('receipt identity, cardinality, commitment and player contribution are strict', () => {
  const invalid = [
    ['receiptId', 'other'], ['storyId', 'other'], ['districtId', 'other'], ['sectorId', 'other'],
    ['lampRecordId', 'other'], ['lampSerial', 'venn-family-lamp:02'], ['receiverRecordId', 'other'],
    ['committed', false], ['committed', 'true'], ['count', 2], ['count', '1'],
    ['committedTick', -1], ['committedTick', 1.5], ['committedTick', '4522'],
    ['committedAtS', NaN], ['committedAtS', -1], ['committedAtS', '75.3666666667'],
    ['playerHelped', false], ['playerHelped', 'true'],
  ];
  for (const [key, value] of invalid) {
    const h = harness(); h.r[key] = value;
    assert.equal(settleLanternWard(h.owner, RECEIPT).reason, 'unverified_receipt', key);
    assert.equal(h.state.missions.lanternWardReward, null, key);
    assert.equal(h.cash.length, 0, key);
  }
});

test('late, future and off-sector evidence cannot settle', () => {
  for (const mutate of [
    h => { h.state.tick++; }, h => { h.state.tick--; },
    h => { h.state.simTime += 1; }, h => { h.state.simTime -= 1; },
    h => { h.state.world.currentSectorId = 'sector_elsewhere'; },
    h => { delete h.state.world; h.state.currentSectorId = SECTOR; },
  ]) {
    const h = harness(); mutate(h);
    assert.equal(settleLanternWard(h.owner, RECEIPT).reason, 'stale_receipt');
    assert.equal(h.cash.length, 0);
  }
});

test('work authority denial of a replaced generation is honored even with a saved completion', () => {
  const h = harness();
  const boundGeneration = 7, liveGeneration = 8;
  h.state.npcJobs = { lanternWard: { firstCompletionReceipt: receipt() } };
  h.work.lanternWardReceipt = () => liveGeneration === boundGeneration ? receipt() : null;
  assert.equal(settleLanternWard(h.owner, RECEIPT).reason, 'unverified_receipt');
  assert.equal(h.cash.length, 0);
});

test('work receipt lookup failures are closed without reserving or paying', () => {
  const h = harness();
  h.work.lanternWardReceipt = () => { throw new Error('binding unavailable'); };
  assert.equal(settleLanternWard(h.owner, RECEIPT).reason, 'unverified_receipt');
  assert.equal(h.state.missions.lanternWardReward, null);
  assert.equal(h.cash.length, 0);
});

test('reentrant dispatch cannot pay twice and leaves the saved journal settled', () => {
  const h = harness({ reentrant: true });
  assert.equal(settleLanternWard(h.owner, RECEIPT).ok, true);
  assert.equal(h.reentries.length, 1);
  assert.equal(h.reentries[0].reason, 'reward_closed');
  assert.equal(h.cash.length, 1);
  assert.equal(h.state.missions.lanternWardReward.status, 'settled');
});

test('Continue preserves both settled and uncertain reserved journals without repayment', () => {
  for (const status of ['settled', 'reserved']) {
    const h = harness();
    h.state.missions.lanternWardReward = normalizeLanternWardReward(JSON.parse(JSON.stringify(savedReward(status))));
    const result = settleLanternWard(h.owner, RECEIPT);
    assert.equal(result.ok, status === 'settled');
    assert.equal(h.state.player.credits, 1000);
    assert.equal(h.cash.length, 0);
    assert.equal(h.state.missions.lanternWardReward.status, status);
  }
});

test('normalization is additive, typed, whitelisted, idempotent and nonmutating', () => {
  assert.equal(normalizeLanternWardReward(undefined), null);
  assert.equal(normalizeLanternWardReward(null), null);
  const value = Object.freeze({ ...savedReward(), callerExtra: { credits: 999999 } });
  const normalized = normalizeLanternWardReward(value);
  assert.deepEqual(normalized, savedReward());
  assert.notEqual(normalized, value);
  assert.deepEqual(normalizeLanternWardReward(normalized), normalized);
  for (const malformed of [false, 0, '', [], {}, { ...savedReward(), version: 2 },
    { ...savedReward(), storyId: 'other' }, { ...savedReward(), status: 'unpaid' },
    { ...savedReward(), receiptId: 'other' }, { ...savedReward(), credited: '180' },
    { ...savedReward(), credited: 181 }, { ...savedReward(), credited: -1 },
    { ...savedReward(), credited: 1.5 }, { ...savedReward(), committedTick: Infinity },
    { ...savedReward(), committedAtS: -1 }]) {
    const closed = normalizeLanternWardReward(malformed);
    assert.deepEqual(closed, { version: 1, status: 'blocked', storyId: STORY });
    const h = harness(); h.state.missions.lanternWardReward = malformed;
    assert.equal(settleLanternWard(h.owner, RECEIPT).reason, 'reward_closed');
    assert.equal(h.cash.length, 0);
  }
});

test('authority capability and valid balance are required before reserving', () => {
  const noEconomy = harness(); noEconomy.owner.registry.get = () => noEconomy.work;
  assert.equal(settleLanternWard(noEconomy.owner, RECEIPT).reason, 'credit_owner_pending');
  const noBus = harness(); noBus.owner.bus = {};
  assert.equal(settleLanternWard(noBus.owner, RECEIPT).reason, 'credit_owner_pending');
  for (const credits of [-1, NaN, Infinity, 1.5, '1000', Number.MAX_SAFE_INTEGER + 1]) {
    const h = harness(); h.state.player.credits = credits;
    assert.equal(settleLanternWard(h.owner, RECEIPT).reason, 'invalid_balance');
    assert.equal(h.state.missions.lanternWardReward, null);
  }
});

test('reward respects integer capacity including a full credit balance', () => {
  for (const remaining of [0, 10, 180]) {
    const h = harness(); h.state.player.credits = Number.MAX_SAFE_INTEGER - remaining;
    const result = settleLanternWard(h.owner, RECEIPT);
    assert.equal(result.ok, true);
    assert.equal(result.journal.credited, remaining);
    assert.equal(h.state.player.credits, Number.MAX_SAFE_INTEGER);
    assert.equal(h.cash.length, remaining ? 1 : 0);
  }
});

test('throwing or missing credit listeners preserve a closed reservation across Continue', () => {
  for (const options of [{ throwBefore: true }, { throwAfter: true }, { noCreditListener: true }]) {
    const h = harness(options);
    const result = settleLanternWard(h.owner, RECEIPT);
    assert.equal(result.reason, 'credit_dispatch_uncertain');
    assert.equal(h.state.missions.lanternWardReward.status, 'reserved');
    result.journal.status = 'settled';
    assert.equal(h.state.missions.lanternWardReward.status, 'reserved');
    const resumed = harness();
    resumed.state.missions.lanternWardReward = normalizeLanternWardReward(JSON.parse(JSON.stringify(h.state.missions.lanternWardReward)));
    assert.equal(settleLanternWard(resumed.owner, RECEIPT).reason, 'reward_closed');
    assert.equal(resumed.cash.length, 0);
  }
});

test('completion presentation failures cannot reopen a paid reward', () => {
  const h = harness({ throwCompletion: true });
  h.owner._logCompletion = () => { throw new Error('log unavailable'); };
  assert.equal(settleLanternWard(h.owner, RECEIPT).ok, true);
  assert.equal(h.state.missions.lanternWardReward.status, 'settled');
  assert.equal(settleLanternWard(h.owner, RECEIPT).duplicate, true);
  assert.equal(h.cash.length, 1);
});

test('dialogue remains a deterministic pure projection with distinct household consequences', () => {
  const status = Object.freeze({ districtId: DISTRICT, installed: true, playerHelped: true, history: Object.freeze({}) });
  const first = selectLanternWardDialogue(status, { speaker: 'household' });
  assert.deepEqual(selectLanternWardDialogue(status, { speaker: 'household' }), first);
  assert.match(first.id, /:household:installedHelp$/);
  const theft = selectLanternWardDialogue({ districtId: DISTRICT, cradleStolen: true }, { speaker: 'household' });
  assert.match(theft.id, /:household:theft$/);
  assert.notEqual(theft.text, first.text);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, blocked: true }).id, /:blockage$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, playerHelped: true }).id, /:help$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, damaged: true }).id, /:repair$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, phase: 'injured' }).id, /:injury$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, cradleMissing: true }).id, /:shortage$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, missingLamp: true }).id, /:missingLamp$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, installed: true, history: { recovered: true } }).id, /:recovery$/);
});

test('saved causal revisits require an explicit player revisit, never commuter departures', () => {
  const helped = { districtId: DISTRICT, installed: true, playerHelped: true, history: { departures: 40 } };
  assert.match(selectLanternWardDialogue(helped).id, /:installedHelp$/);
  assert.match(selectLanternWardDialogue(helped, { revisit: true }).id, /:revisitHelp$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, cradleStolen: true }, { revisit: true }).id, /:revisitTheft$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, installed: true, history: { recovered: true } }, { revisit: true }).id, /:revisitRecovery$/);
  const ignored = { districtId: DISTRICT, installed: true, history: { ignored: true } };
  assert.match(selectLanternWardDialogue(ignored, { revisit: true }).id, /:revisitIgnored$/);
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, ignored: true }).text, /clearing crew/i);
});

test('unknown status stays neutral and the canonical memorial stays dark', () => {
  for (const status of [undefined, [], { districtId: 'elsewhere', cradleStolen: true }, { districtId: DISTRICT, phase: 'fabricated' }]) {
    const result = selectLanternWardDialogue(status);
    assert.match(result.id, /:neutral$/);
    assert.match(result.text, /twenty-fifth memorial stays dark/);
  }
  assert.match(selectLanternWardDialogue({ districtId: DISTRICT, installed: true }).text, /dark memorial stays dark/);
});
