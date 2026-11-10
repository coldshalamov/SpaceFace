import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime, resolveSimLaneFlags } from '../src/core/simLaneMain.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { missions } from '../src/systems/missions.js';
import { buildEncounterCausality, causalAftermath } from '../src/world/encounterCausality.js';
import { kesslerFreightChoice, kesslerFreightReply } from '../src/ui/station/heliosFreightConversation.js';
import {
  applyDomainPathUpdate, configureDomainMirroring, createDomainDiffer,
  createDomainMirroringProfile, createDomainProbeChecker, DOMAIN_COLD_TICKS,
} from '../scripts/lib/simReadModel.mjs';

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const CAUSE_FIELDS = ['commodityId', 'createdTick', 'fingerprint', 'manifestId', 'outcome', 'sectorId', 'shapeId'];

function incident(index = 0) {
  const cause = buildEncounterCausality({ seed: 4242, encounterId: `raid-${index}`,
    shapeId: 'opening_hauler_raid', sectorId: SECTOR, zoneId: 'lane' });
  Object.assign(cause, { manifestId: `ore-${index}`, commodityId: 'cmdty_ore_iron', totalQty: 7 });
  return causalAftermath(cause, 'robbed', { tick: index + 10, t: 5 });
}

test('production worker transport exposes only cause facts and follows resume/profile replacement', async (t) => {
  const cause = incident();
  const authority = {
    ui: { docked: true, dockedStationId: STATION }, player: {}, meta: { seed: 4242 },
    missions: { active: [], receipts: [], boards: { [STATION]: { slots: [] } } },
    aftermathWrecks: { causes: { [cause.fingerprint]: cause }, bySector: { [SECTOR]: 'wreck payload'.repeat(10000) } },
  };
  const bus = createBus(), custody = Object.create(custodyConsequences);
  custody.init({ state: authority, bus, helpers: {} });
  t.after(() => custody.destroy());
  const boardOwner = Object.create(missions);
  Object.assign(boardOwner, { state: authority, bus, _epoch: () => 0,
    ensureBoard: () => authority.missions.boards[STATION] });
  bus.on('mission:offered', offer => boardOwner._onExternalBoardOffer(offer));
  bus.emit('aftermath:custodyFreight', { fingerprint: cause.fingerprint, sectorId: SECTOR,
    manifestId: cause.manifestId, commodityId: cause.commodityId, scatteredQty: 3 });
  bus.emit('dock:docked', { stationId: STATION });
  const facade = { entities: new Map(), entityList: [], settings: {}, meta: { seed: 4242 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 0, ui: { screenStack: [] } };
  const posts = [];
  let receive;
  const lane = createSimLaneRuntime({ state: facade, registry: {}, bus: createBus(),
    flags: resolveSimLaneFlags('?simLane=worker'), clockMode: 'worker-local',
    channelFactory: () => ({ post(message) { posts.push(message); },
      onMessage(handler) { receive = handler; }, terminate() {} }),
  });
  t.after(() => { lane.close(); configureDomainMirroring({}); });
  let differ, mirror, checker, tick = 0;
  function resetDiffer(profile) {
    configureDomainMirroring(createDomainMirroringProfile(profile));
    differ = createDomainDiffer({ probe: true });
    mirror = new Map();
    checker = createDomainProbeChecker(mirror);
  }
  function send(kind = 'clockTick') {
    const result = differ.diff(authority, tick++);
    // Exercise both the wire/probe contract and the real main-side dotted-path graft.
    const wire = structuredClone(result.updates);
    for (const update of wire) applyDomainPathUpdate(mirror, update, new WeakSet());
    assert.deepEqual(checker.consume(result.probe).events, []);
    receive({ kind, seq: posts[0].seq, stateTick: tick, simTime: tick / 60, domainUpdates: wire });
    return result;
  }
  function flush() { for (let i = 0; i <= DOMAIN_COLD_TICKS; i++) send(); }

  resetDiffer('station');
  const before = JSON.stringify(authority);
  send('ready');
  await lane.readyPromise;
  assert.ok(kesslerFreightChoice(facade, STATION));
  const choice = kesslerFreightChoice(facade, STATION);
  assert.equal(kesslerFreightReply(facade, STATION, choice.id).text,
    kesslerFreightReply(authority, STATION, choice.id).text);
  assert.equal(kesslerFreightReply(facade, STATION, choice.id).missionOffer,
    facade.missions.boards[STATION].slots[0], 'the transported conversation returns the actual mirrored posting');
  assert.deepEqual(Object.keys(facade.aftermathWrecks), ['causes']);
  assert.deepEqual(Object.keys(facade.aftermathWrecks.causes[cause.fingerprint]).sort(), CAUSE_FIELDS);
  assert.equal(JSON.stringify(authority), before, 'projection and conversation never write authority');
  const root = facade.aftermathWrecks;
  const causes = root.causes;

  // An owner update and a newly resolved incident both cross the retained differ.
  authority.aftermathWrecks.causes[cause.fingerprint].outcome = 'defended';
  flush();
  assert.match(kesslerFreightReply(facade, STATION, choice.id).text, /hauler survived/);
  const later = incident(1);
  authority.aftermathWrecks.causes[later.fingerprint] = later;
  flush();
  assert.notEqual(kesslerFreightChoice(facade, STATION).id, choice.id);
  delete authority.aftermathWrecks.causes[later.fingerprint];
  flush();
  assert.equal(kesslerFreightChoice(facade, STATION).id, choice.id);
  assert.equal(facade.aftermathWrecks, root);
  assert.equal(facade.aftermathWrecks.causes, causes);

  // A fresh differ models the snapshot boundary on restore/profile reinitialization.
  for (const profile of ['commodity', 'commodity-nohist', 'station']) {
    authority.aftermathWrecks.causes = {};
    resetDiffer(profile); send();
    assert.equal(kesslerFreightChoice(facade, STATION), null);
    authority.aftermathWrecks.causes = JSON.parse(JSON.stringify({ [later.fingerprint]: later }));
    flush();
    assert.ok(kesslerFreightChoice(facade, STATION));
    assert.equal(Object.hasOwn(facade.aftermathWrecks.causes, cause.fingerprint), false);
  }
  delete authority.aftermathWrecks.causes;
  resetDiffer('station'); send();
  assert.equal(kesslerFreightChoice(facade, STATION), null, 'an absent resumed ledger clears stale causes');
});

test('24 causes stay atomic and bounded even with diagnostic root expansion', () => {
  configureDomainMirroring({ expandPaths: [{ segs: [], depth: 5 }] });
  try {
    const causes = Object.fromEntries(Array.from({ length: 24 }, (_, i) => {
      const cause = { ...incident(i), evidence: 'not a conversation field'.repeat(10000) };
      return [cause.fingerprint, cause];
    }));
    const state = { aftermathWrecks: { causes, bySector: { giant: 'wreck'.repeat(100000) } } };
    const before = JSON.stringify(state);
    const differ = createDomainDiffer();
    const updates = differ.diff(state, 0).updates.filter(update => update.segs[0].startsWith('aftermathWrecks'));
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].segs, ['aftermathWrecks.causes']);
    assert.equal(Object.keys(updates[0].v).length, 24);
    assert.ok(updates[0].bytes < 8192, 'large private cause fields and wreck payload never enter the wire budget');
    assert.deepEqual(Object.keys(Object.values(updates[0].v)[0]).sort(), CAUSE_FIELDS);
    assert.equal(differ.diff(state, 1).updates.some(update => update.segs[0].startsWith('aftermathWrecks')), false);
    assert.equal(JSON.stringify(state), before);
  } finally { configureDomainMirroring({}); }
});
