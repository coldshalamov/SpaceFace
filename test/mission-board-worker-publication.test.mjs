import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import {
  applyDomainPathUpdate, configureDomainMirroring, createDomainDiffer,
  DOMAIN_COLD_BYTES, DOMAIN_COLD_TICKS,
} from '../scripts/lib/simReadModel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

test('the handoff seed requires the actual posting verdict and never fabricates a facade row', async () => {
  const source = readFileSync(new URL('../scripts/check-mission-accept-handoff-runtime.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async () => {', source.indexOf('const seeded = await page.evaluate('));
  const end = source.indexOf('\n  });', start);
  assert.ok(start >= 0 && end > start);
  const successful = { ok: true, result: { ok: true,
    result: { ok: true, offerId: 'handoff_probe_bulk_trade' } } };
  for (const [label, response, expected] of [
    ['accepted', successful, true],
    ['owner refusal', { ok: true, result: { ok: true, result: { ok: false, reason: 'bad_offer' } } }, false],
    ['method refusal', { ok: true, result: { ok: false, reason: 'unknown-missions-method' } }, false],
    ['transport refusal', { ok: false, error: 'unhandled-rpc-op' }, false],
    ['RPC exception', new Error('worker closed'), false],
  ]) {
    const boards = Object.freeze({});
    const sf = { state: { ui: { dockedStationId: 'station_helios' },
      missions: { boards }, economy: { markets: { station_helios: { cmdty_ore_iron: {} } } } },
    laneRpc: async (op, args) => {
      assert.equal(op, 'missionsCall');
      assert.equal(args.method, 'postBoardOffer');
      assert.equal(args.offer.stationId, 'station_helios');
      if (response instanceof Error) throw response;
      return response;
    }, simLaneDiag() { throw new Error('optional diagnostic unavailable'); },
    bus: { emit() { assert.fail('the seed cannot announce a fabricated facade mutation'); } } };
    const seed = runInNewContext(`(${source.slice(start, end)}\n})`, { window: { SF: sf } });
    const result = await seed();
    assert.equal(result.ok, expected, label);
    assert.equal(result.posted, expected, label);
    assert.equal(result.rpc.args.method, 'postBoardOffer');
    assert.deepEqual(Object.keys(boards), [], `${label} leaves the read-only board untouched`);
    if (response instanceof Error) assert.match(result.rpc.error, /worker closed/);
  }
});

test('the handoff seed uses the canonical main owner after worker fallback', async () => {
  const source = readFileSync(new URL('../scripts/check-mission-accept-handoff-runtime.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async () => {', source.indexOf('const seeded = await page.evaluate('));
  const end = source.indexOf('\n  });', start);
  assert.ok(start >= 0 && end > start);
  for (const accepted of [true, false]) {
    const boards = Object.freeze({});
    let posted = 0;
    const owner = { postBoardOffer(offer) {
      posted++;
      assert.equal(offer.stationId, 'station_helios');
      return accepted ? { ok: true, offerId: offer.id } : { ok: false, reason: 'bad_offer' };
    } };
    const sf = { ctx: { simLane: 'main' },
      state: { ui: { dockedStationId: 'station_helios' }, missions: { boards },
        economy: { markets: { station_helios: { cmdty_ore_iron: {} } } } },
      registry: { get(name) { assert.equal(name, 'missions'); return owner; } },
      laneRpc() { assert.fail('main fallback must use its real owner instead of a worker-only RPC'); },
      bus: { emit() { assert.fail('the seed cannot fabricate facade publication'); } },
    };
    const seed = runInNewContext(`(${source.slice(start, end)}\n})`, { window: { SF: sf } });
    const result = await seed();
    assert.equal(posted, 1);
    assert.equal(result.ok, accepted);
    assert.equal(result.rpc, null);
    assert.deepEqual(Object.keys(boards), []);
  }
});

test('a leaf invalidation is lazy, one-shot, and preserves signature equality', () => {
  configureDomainMirroring({});
  const differ = createDomainDiffer();
  const state = { missions: { history: 'x'.repeat(DOMAIN_COLD_BYTES + 1), boards: {} } };
  assert.equal(differ.invalidateLeaf('missions'), false, 'an uncreated root is already eager');
  assert.ok(differ.diff(state, 0).updates.some(u => u.segs[0] === 'missions'));
  const node = differ.paths.get('missions');
  const tick = node.slot % DOMAIN_COLD_TICKS === 1 ? 2 : 1;
  differ.invalidateLeaf('missions');
  differ.invalidateLeaf('missions');
  assert.equal(differ.diff(state, tick).updates.some(u => u.segs[0] === 'missions'), false,
    'a repeated owner signal cannot manufacture changed wire content');
  assert.equal(node.lastSign, tick, 'the urgent check happened outside the cold slot');
  const next = (tick + 1) % DOMAIN_COLD_TICKS === node.slot % DOMAIN_COLD_TICKS ? tick + 2 : tick + 1;
  differ.diff(state, next);
  assert.equal(node.lastSign, tick, 'an unchanged later reply does not re-sign the root');
});

test('paused mission settlement publishes receipts and reputation in its next reply', async () => {
  const lane = createSimHost();
  let directive = 0;
  const tick = async () => lane.tick({ tick: ++directive, steps: 0, commands: [] });
  try {
    await lane.init({ profile: 'production', seed: 47,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const state = lane.host.state;
    const missions = lane.host.registry.get('missions');
    lane.host.registry.get('factions').newGame();
    state.timeScale = 0;
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
    state.player.cargo.capVolume = 100;
    const offer = { id: 'paused-settlement-probe', type: 'bulk_trade', stationId: 'station_helios',
      factionId: 'faction_mts', title: 'Settlement probe', reward: 1200, risk: 0,
      cargo: { commodityId: 'cmdty_ore_iron', qty: 6 }, params: { cmdtyId: 'cmdty_ore_iron', qty: 6 } };
    assert.equal(missions.postBoardOffer(offer).ok, true);
    assert.equal(missions.acceptMission(offer.id), true);
    const mission = state.missions.active.find(row => row.sourceOfferId === offer.id);
    assert.ok(mission);
    await tick();
    const missionNode = lane.host.domainDiffer.paths.get('missions');
    const factionNode = lane.host.domainDiffer.paths.get('factions');
    while ([missionNode, factionNode].some(node =>
      (node.slot - lane.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 5)) await tick();
    const oldRep = state.factions.faction_mts.rep;
    missions._completeMission(mission, state.missions.active.indexOf(mission));
    assert.ok(state.missions.receipts.some(row => row.missionId === mission.id && row.outcome === 'completed'));
    assert.notEqual(state.factions.faction_mts.rep, oldRep);
    const reply = await tick();
    const missionUpdate = reply.domainUpdates.find(update => update.segs[0] === 'missions');
    const factionUpdate = reply.domainUpdates.find(update => update.segs[0] === 'factions');
    assert.ok(missionUpdate?.v?.receipts?.some(row => row.missionId === mission.id && row.outcome === 'completed'),
      'the completed receipt publishes in the paused reply');
    assert.equal(factionUpdate?.v?.faction_mts?.rep, state.factions.faction_mts.rep,
      'the faction award publishes in the paused reply');
    for (const [outcome, method] of [['failed', '_failMission'], ['expired', '_expireMission']]) {
      const nextOffer = { ...offer, id: `paused-${outcome}-probe` };
      assert.equal(missions.postBoardOffer(nextOffer).ok, true);
      assert.equal(missions.acceptMission(nextOffer.id), true);
      const next = state.missions.active.find(row => row.sourceOfferId === nextOffer.id);
      assert.ok(next);
      await tick();
      while ((missionNode.slot - lane.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 5) await tick();
      missions[method](next, state.missions.active.indexOf(next), 'failed');
      assert.ok(state.missions.receipts.some(row => row.missionId === next.id && row.outcome === outcome));
      const terminal = await tick();
      const published = terminal.domainUpdates.find(update => update.segs[0] === 'missions');
      assert.ok(published?.v?.receipts?.some(row => row.missionId === next.id && row.outcome === outcome),
        `${outcome} receipt publishes`);
    }
  } finally { lane.shutdown(); }
});

test('paused production board posts, external offers, and acceptance publish in their own reply', async () => {
  const lane = createSimHost();
  let directive = 0;
  const domains = new Map();
  const touched = new Set();
  const apply = (reply) => {
    for (const update of reply.domainUpdates || []) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.')
        ? update.segs[0].split('.') : update.segs;
      touched.clear();
      applyDomainPathUpdate(domains, { ...update, segs }, touched);
    }
    return reply;
  };
  const tick = async (commands = []) => apply(await lane.tick({ tick: ++directive, steps: 0, commands }));
  const rpc = async (method, args) => {
    const ring = createSimCommandRing();
    ring.pushRpc(`mission-${directive}`, 'missionsCall', { method, ...args });
    return tick(ring.drain());
  };
  const emit = async (event, payload) => {
    const ring = createSimCommandRing();
    ring.pushBus({ emit: event, payload });
    return tick(ring.drain());
  };
  const ids = () => domains.get('missions').boards.station_helios.slots.map(offer => offer.id);
  const missionUpdate = reply => reply.domainUpdates.find(u => u.segs[0] === 'missions');
  try {
    apply(await lane.init({ profile: 'production', seed: 47,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) }));
    const state = lane.host.state;
    const missions = lane.host.registry.get('missions');
    state.timeScale = 0;
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    state.player.cargo.capVolume = 100;
    missions.ensureBoard('station_helios');
    await tick();
    const node = lane.host.domainDiffer.paths.get('missions');
    assert.ok(node.bytes > DOMAIN_COLD_BYTES, 'the real authored board exercises the cold tier');
    // Put this short sequence away from the natural cold slot, so an event's own reply is decisive.
    while ((node.slot - lane.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 10) await tick();
    const before = { tick: state.tick, simTime: state.simTime,
      cargo: JSON.stringify(state.player.cargo), credits: state.player.credits };
    const offer = { id: 'handoff_probe_bulk_trade', type: 'bulk_trade', stationId: 'station_helios',
      factionId: 'faction_mts', title: 'Probe tracked cargo loop', reward: 1200, risk: 0,
      cargo: { commodityId: 'cmdty_ore_iron', qty: 6 }, params: { cmdtyId: 'cmdty_ore_iron', qty: 6 } };

    const posted = await rpc('postBoardOffer', { offer });
    assert.deepEqual(posted.rpcAcks[0].result.result, { ok: true, offerId: offer.id });
    assert.ok(missions.boardSlots(offer.stationId).includes(offer.id), 'the real missions owner took it');
    assert.ok(missionUpdate(posted), 'the posting acknowledgement also publishes the cold board');
    assert.ok(ids().includes(offer.id), 'the normal facade fold contains the posted row immediately');

    const postedSign = node.lastSign;
    assert.equal(missionUpdate(await tick()), undefined);
    assert.equal(node.lastSign, postedSign, 'unchanged paused replies retain the cold schedule');

    const external = { ...offer, id: 'external-board-offer', source: 'encounterAftermath' };
    const externalReply = await emit('mission:offered', external);
    assert.ok(missions.boardSlots(offer.stationId).includes(external.id));
    assert.ok(missionUpdate(externalReply), 'the real external-offer owner emits a null-id board update');
    assert.ok(ids().includes(external.id));

    const accepted = await rpc('acceptMission', { missionId: offer.id });
    assert.equal(accepted.rpcAcks[0].result.result, true);
    const instance = state.missions.active.find(m => m.sourceOfferId === offer.id);
    assert.ok(instance && instance.status === 'active');
    assert.ok(missionUpdate(accepted), 'accepted row withdrawal publishes in the accept reply');
    assert.equal(ids().includes(offer.id), false);
    assert.equal(domains.get('ui').trackedMissionId, instance.id);
    assert.ok(domains.get('missions').active.some(m => m.id === instance.id));

    const acceptedSign = node.lastSign;
    instance.objectiveProgress = 1;
    const progress = await emit('mission:updated', { missionId: instance.id, objectiveProgress: 1 });
    assert.equal(missionUpdate(progress), undefined, 'non-null progress events do not force the whole history');
    assert.equal(node.lastSign, acceptedSign);
    assert.equal(domains.get('missions').active.find(m => m.id === instance.id).objectiveProgress, 1,
      'progress still arrives through the existing hot active-mission leaf');

    state.missions.boards.station_helios.slots.push({ ...offer, id: 'ordinary-cold-change' });
    let published = false;
    for (let i = 0; i < DOMAIN_COLD_TICKS; i++) {
      const sequence = lane.host.domainDiffSeq;
      const reply = await tick();
      if (!missionUpdate(reply)) continue;
      assert.equal(sequence % DOMAIN_COLD_TICKS, node.slot % DOMAIN_COLD_TICKS,
        'ordinary changes still use the original staggered cold slot');
      published = true;
      break;
    }
    assert.equal(published, true, 'normal cold publication remains bounded');
    assert.ok(ids().includes('ordinary-cold-change'));
    assert.deepEqual({ tick: state.tick, simTime: state.simTime,
      cargo: JSON.stringify(state.player.cargo), credits: state.player.credits }, before,
    'zero-step handoffs preserve the paused clock, cargo, and wallet');
  } finally {
    lane.shutdown();
    assert.equal(lane.host.missionBoardMirrorUnsubscribe, null, 'host teardown releases board listeners');
  }
});
