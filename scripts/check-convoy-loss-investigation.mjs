// BP-12 packet CONVOY_LOSS_INVESTIGATION ("Convoy-Loss Salvage & Investigation POI").
//
// Contract (src/systems/lossInvestigation.js):
//   - The system is event-sourced from the BP-01.1 loss ledger. No recorded loss in sector S means
//     strict no-op: no promoted communicator, no offer rewrite, and no invented loss.
//   - When salvage places derelict-field points in a sector with a real recorded loss, exactly ONE
//     existing salvage point is promoted into a communicator. It does not spawn any extra entities;
//     it annotates the point/entity metadata so salvage.js's existing communicator loop offers it.
//   - The mission offer remains a normal salvage offer, but its log/summary are overlaid with
//     provenance that names the lost asset/faction/sector. It reuses wreckMissions templates
//     (wm_manifest_run / wm_blackbox_attacker) and the existing mission:offered loop.
//   - Deterministic and golden-sim safe: seeded by (seed, sectorId, lossId), no Math.random/Date.now.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { lossLedger } from '../src/systems/lossLedger.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/lossInvestigation.js', import.meta.url)),
  'src/systems/lossInvestigation.js exists');

const mod = await import('../src/systems/lossInvestigation.js');
const lossInvestigation = mod.lossInvestigation || mod.default;

assert.ok(lossInvestigation && lossInvestigation.name === 'lossInvestigation',
  'lossInvestigation system exports the registry object');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in loss-investigation path'); };
  Date.now = () => { throw new Error('Date.now in loss-investigation path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  return { bus, emitted };
}

function makeState() {
  const entity = {
    id: 101,
    type: 'wreck',
    data: {
      parentType: 'debris',
      salvagePointId: 'zone_ceres_derelict:sal0',
      salvagePool: { cmdty_scrap_metal: 3 },
      scanLabel: 'Wreck Debris',
    },
  };
  const entity2 = {
    id: 102,
    type: 'wreck',
    data: {
      parentType: 'debris',
      salvagePointId: 'zone_ceres_derelict:sal1',
      salvagePool: { cmdty_scrap_metal: 2 },
      scanLabel: 'Wreck Debris',
    },
  };
  return {
    meta: { seed: 77 },
    simTime: 1200,
    world: {
      currentSectorId: 'sector_tethys',
      sectors: {
        sector_tethys: { id: 'sector_tethys', name: 'Tethys Junction', owner: 'faction_drift' },
        sector_empty: { id: 'sector_empty', name: 'Empty Reach', owner: 'faction_concord' },
      },
    },
    entities: new Map([[101, entity], [102, entity2]]),
    salvage: {
      plannedSectorId: 'sector_tethys',
      points: [
        {
          id: 'zone_ceres_derelict:sal0',
          sectorId: 'sector_tethys',
          zoneId: 'zone_ceres_derelict',
          pos: { x: 10, z: 20 },
          entityId: 101,
          isCommunicator: false,
          wreckMissionId: null,
          offered: false,
        },
        {
          id: 'zone_ceres_derelict:sal1',
          sectorId: 'sector_tethys',
          zoneId: 'zone_ceres_derelict',
          pos: { x: 40, z: 50 },
          entityId: 102,
          isCommunicator: false,
          wreckMissionId: null,
          offered: false,
        },
      ],
    },
  };
}

function fakeVoice() {
  return { say() { return true; } };
}

function initSystems(state, bus) {
  const ledger = { ...lossLedger };
  ledger.init({ state, bus, helpers: { voice: fakeVoice() } });
  const inv = { ...lossInvestigation };
  inv.init({ state, bus, helpers: {} });
  return { ledger, inv };
}

function recordLoss(bus) {
  bus.emit('automation:assetLost', {
    kind: 'trader',
    id: 'MTS-9',
    value: 1600,
    sectorId: 'sector_tethys',
  });
}

testNoRecordedLossIsStrictNoop();
guarded(testRecordedLossPromotesExactlyOneExistingPoint);
guarded(testMissionOfferIsProvenanceStamped);
guarded(testPromotionIsDeterministicAndDeduped);

console.log('Convoy-loss investigation checks OK');

function testNoRecordedLossIsStrictNoop() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const { ledger, inv } = initSystems(state, bus);

  bus.emit('salvage:placed', { sectorId: 'sector_tethys', count: 2, communicators: 0 });

  assert.equal(state.salvage.points.some((p) => p.isCommunicator), false,
    'no recorded loss -> no communicator promotion');
  assert.equal(emitted.some((e) => e.evt === 'lossInvestigation:promoted'), false,
    'no recorded loss -> no promotion event');

  const offer = {
    source: 'salvage',
    offerId: 'salvage_zone_ceres_derelict:sal0',
    salvagePointId: 'zone_ceres_derelict:sal0',
    sectorId: 'sector_tethys',
    title: 'Generic Salvage',
    summary: 'Generic summary',
    log: 'Generic log',
    wreckMissionId: 'wm_manifest_run',
  };
  bus.emit('mission:offered', offer);
  assert.equal(offer.summary, 'Generic summary', 'offer is untouched with no recorded loss');
  assert.equal(offer.lossInvestigation, undefined, 'no provenance metadata without a real loss');

  inv.destroy();
  ledger.destroy();
}

function testRecordedLossPromotesExactlyOneExistingPoint() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const { ledger, inv } = initSystems(state, bus);
  recordLoss(bus);
  emitted.length = 0;

  bus.emit('salvage:placed', { sectorId: 'sector_tethys', count: 2, communicators: 0 });

  const promoted = state.salvage.points.filter((p) => p.isCommunicator);
  assert.equal(promoted.length, 1, 'exactly one existing salvage point promoted');
  const p = promoted[0];
  assert.ok(['wm_manifest_run', 'wm_blackbox_attacker'].includes(p.wreckMissionId),
    'promoted point reuses one of the investigation-capable wreckMissions templates');
  assert.ok(p.lossInvestigation && p.lossInvestigation.lossId, 'point carries provenance metadata');
  assert.equal(p.lossInvestigation.assetId, 'MTS-9', 'provenance names the recorded lost asset');

  const entity = state.entities.get(p.entityId);
  assert.equal(entity.data.parentType, 'communicator', 'existing entity is promoted to communicator');
  assert.equal(entity.data.isCommunicator, true, 'entity communicator flag set for salvage.js scan path');
  assert.equal(entity.data.wreckMissionId, p.wreckMissionId, 'entity mission id matches point');
  assert.match(entity.data.scanLabel, /Investigation|Communicator/i, 'scan label reads as an investigation communicator');

  assert.equal(emitted.filter((e) => e.evt === 'lossInvestigation:promoted').length, 1,
    'one promotion intent emitted');
  assert.equal(emitted.some((e) => e.evt === 'entity:spawned' || e.evt === 'spawn:entity'), false,
    'promotion does not spawn extra entities');

  inv.destroy();
  ledger.destroy();
}

function testMissionOfferIsProvenanceStamped() {
  const { bus } = makeBus();
  const state = makeState();
  const { ledger, inv } = initSystems(state, bus);
  recordLoss(bus);
  bus.emit('salvage:placed', { sectorId: 'sector_tethys', count: 2, communicators: 0 });
  const promoted = state.salvage.points.find((p) => p.isCommunicator);

  const offer = {
    source: 'salvage',
    offerId: `salvage_${promoted.id}`,
    salvagePointId: promoted.id,
    sectorId: promoted.sectorId,
    zoneId: promoted.zoneId,
    type: 'salvage_retrieval',
    title: 'Generic Salvage',
    summary: 'Generic summary',
    giver: 'Derelict',
    log: 'Generic log',
    reward_cr: 820,
    choice: null,
    tag: 'wreck_salvage',
    wreckMissionId: promoted.wreckMissionId,
    pos: { x: promoted.pos.x, z: promoted.pos.z },
  };
  bus.emit('mission:offered', offer);

  assert.equal(offer.source, 'salvage', 'offer remains on the shipped salvage path');
  assert.equal(offer.tag, 'wreck_salvage', 'offer remains a wreck-salvage mission');
  assert.ok(offer.lossInvestigation, 'offer carries additive provenance metadata');
  assert.equal(offer.lossInvestigation.assetId, 'MTS-9', 'offer metadata names the lost asset');
  assert.match(offer.summary, /MTS-9|Tethys Junction|Drift/i,
    'offer summary names the lost asset, sector, or faction');
  assert.match(offer.log, /MTS-9|Tethys Junction|Drift/i,
    'offer log line is provenance-stamped');
  assert.ok(['wm_manifest_run', 'wm_blackbox_attacker'].includes(offer.wreckMissionId),
    'offer still reuses an investigation-capable wreckMissions template');

  assert.equal(state.player, undefined, 'system never writes player/credits');
  assert.equal(state.factions, undefined, 'system never writes faction rep');
  assert.ok(!state.cargo, 'system never writes cargo');

  inv.destroy();
  ledger.destroy();
}

function testPromotionIsDeterministicAndDeduped() {
  const run = () => {
    const { bus, emitted } = makeBus();
    const state = makeState();
    const { ledger, inv } = initSystems(state, bus);
    recordLoss(bus);
    emitted.length = 0;
    bus.emit('salvage:placed', { sectorId: 'sector_tethys', count: 2, communicators: 0 });
    bus.emit('salvage:placed', { sectorId: 'sector_tethys', count: 2, communicators: 1 });
    const promoted = state.salvage.points.filter((p) => p.isCommunicator);
    const result = {
      id: promoted[0] && promoted[0].id,
      events: emitted.filter((e) => e.evt === 'lossInvestigation:promoted').length,
    };
    inv.destroy();
    ledger.destroy();
    return result;
  };

  const a = run();
  const b = run();
  assert.deepEqual(a, b, 'same seed/loss/sector -> same promoted salvage point');
  assert.equal(a.events, 1, 'repeated salvage:placed cues do not spam promotions');
}
