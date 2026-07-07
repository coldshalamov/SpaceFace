// BP-01.1 packet GHOST_CONVOY_RUMOR.
//
// Contract:
//   - lossLedger emits a ghost-convoy rumor only after >=3 losses in the same sector/faction lane.
//   - The sector must currently read as reach_pressure through sectorSignalFor.
//   - The rumor fires once per lane threshold and carries a real bounty/patrol-shaped offer.
//   - Rumor time is offer-only: no spawn at rumor, no direct credits/cargo/rep writes.
import assert from 'node:assert/strict';

import { lossLedger, lossesFor } from '../src/systems/lossLedger.js';
import { wreckMissionById } from '../src/data/wreckMissions.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(wreckMissionById('wm_reach_bounty'), 'shipped wm_reach_bounty template exists');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in ghost-convoy path'); };
  Date.now = () => { throw new Error('Date.now in ghost-convoy path'); };
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

function fakeVoice() {
  return { said: [], say(msg) { this.said.push(msg); return true; } };
}

function makeState(driver = 'reach_pressure') {
  return {
    meta: { seed: 404 },
    simTime: 0,
    player: { credits: 1200, cargo: { items: {} } },
    factions: {
      faction_mts: { rep: 0 },
      faction_scn: { rep: 0 },
    },
    world: {
      currentSectorId: 'sector_tethys_junction',
      sectors: {
        sector_tethys_junction: {
          id: 'sector_tethys_junction',
          name: 'Tethys Junction',
          owner: 'faction_mts',
        },
        sector_ceres_belt: {
          id: 'sector_ceres_belt',
          name: 'Ceres Belt',
          owner: 'faction_dmc',
        },
      },
    },
    sectorSim: {
      field: {
        nodes: {
          sector_tethys_junction: {
            danger: 0.72,
            pricePressure: 0.12,
            influence: { faction_mts: 0.62, faction_reach: 0.30, faction_scn: 0.08 },
            dominantFactionId: 'faction_mts',
            dominantInfluence: 0.62,
            contestMargin: 0.32,
            trend: { danger: 0.08, pricePressure: 0, influence: 0 },
            driver: { danger: driver, pricePressure: 'market_balance', influence: 'territorial_anchor' },
          },
          sector_ceres_belt: {
            danger: 0.28,
            pricePressure: 0,
            influence: { faction_dmc: 1 },
            dominantFactionId: 'faction_dmc',
            dominantInfluence: 1,
            contestMargin: 1,
            trend: { danger: 0, pricePressure: 0, influence: 0 },
            driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' },
          },
        },
      },
    },
  };
}

function init(state, bus, voice) {
  const sys = { ...lossLedger };
  sys.init({ state, bus, helpers: { voice } });
  return sys;
}

function recordLoss(state, bus, id, sectorId = 'sector_tethys_junction') {
  state.simTime += 60;
  bus.emit('automation:assetLost', {
    kind: 'trader',
    id,
    value: 1200,
    sectorId,
  });
}

guarded(testFewerThanThreeLossesIsSilent);
guarded(testThirdReachPressureLossEmitsRumorAndOffer);
guarded(testRumorRequiresReachPressure);
guarded(testRumorRequiresSameFactionLane);
guarded(testRumorIsOncePerLaneAndSerialized);

console.log('Ghost-convoy rumor checks OK');

function testFewerThanThreeLossesIsSilent() {
  const { bus, emitted } = makeBus();
  const voice = fakeVoice();
  const state = makeState();
  const sys = init(state, bus, voice);

  recordLoss(state, bus, 'MTS-GC-1');
  recordLoss(state, bus, 'MTS-GC-2');

  assert.equal(lossesFor(state, 'sector_tethys_junction').length, 2, 'two losses recorded');
  assert.equal(emitted.some((e) => e.evt === 'rumor:ghostConvoy'), false,
    'fewer than three losses does not emit a rumor');
  assert.equal(emitted.some((e) => e.evt === 'mission:offered'), false,
    'fewer than three losses does not emit a mission offer');
  sys.destroy();
}

function testThirdReachPressureLossEmitsRumorAndOffer() {
  const { bus, emitted } = makeBus();
  const voice = fakeVoice();
  const state = makeState('reach_pressure');
  const sys = init(state, bus, voice);
  const creditsBefore = state.player.credits;
  const repBefore = state.factions.faction_mts.rep;

  recordLoss(state, bus, 'MTS-GC-1');
  recordLoss(state, bus, 'MTS-GC-2');
  recordLoss(state, bus, 'MTS-GC-3');

  const rumors = emitted.filter((e) => e.evt === 'rumor:ghostConvoy');
  const offers = emitted.filter((e) => e.evt === 'mission:offered');
  assert.equal(rumors.length, 1, 'third matching loss emits exactly one ghost-convoy rumor');
  assert.equal(offers.length, 1, 'third matching loss emits exactly one mission offer');
  const rumor = rumors[0].p;
  const offer = offers[0].p;

  assert.equal(rumor.sectorId, 'sector_tethys_junction', 'rumor names the hot sector');
  assert.equal(rumor.factionId, 'faction_mts', 'rumor groups the same victim faction/lane');
  assert.equal(rumor.lossCount, 3, 'rumor records the threshold loss count');
  assert.equal(rumor.driver, 'reach_pressure', 'rumor is gated by reach_pressure');
  assert.deepEqual(rumor.offer, offer, 'rumor carries the same offer emitted to mission:offered');
  assert.match(rumor.line, /raider|Reach|convoy|nest/i, 'rumor line names the raider-nest fantasy');

  assert.equal(offer.source, 'ghostConvoyRumor', 'offer source is explicit');
  assert.equal(offer.wreckMissionId, 'wm_reach_bounty', 'offer reuses shipped wm_reach_bounty');
  assert.equal(offer.type, 'bounty_hunt', 'offer resolves as the shipped bounty pipeline');
  assert.equal(offer.destSectorId, 'sector_tethys_junction', 'offer targets the hot sector');
  assert.equal(offer.destStationId, 'station_tethys', 'offer has a concrete station anchor');
  assert.equal(offer.factionId, 'faction_mts', 'offer rep routes to the affected lane faction');
  assert.ok(offer.params.targetStrength > 0, 'offer carries targetStrength for mission spawning');
  assert.equal(offer.params.clearCount, 1, 'bounty offer has one target to clear');
  assert.equal(offer.budgetedEncounter.spawnOnAccept, true, 'hostiles are deferred to mission accept');
  assert.equal(offer.budgetedEncounter.spawnBudgetClient, 'missions', 'spawn budget owner is existing missions path');
  assert.ok(offer.reward_cr > 0 && offer.time_limit_s > 0, 'offer is board-shaped with reward and time');
  assert.equal(offer.rumor.lossIds.length, 3, 'offer carries the threshold loss ids');

  assert.equal(voice.said.filter((m) => m.kind === 'ghostConvoy').length, 1,
    'one news-channel rumor line is spoken');
  assert.equal(emitted.some((e) => e.evt === 'entity:spawned' || e.evt === 'spawn:entity'), false,
    'rumor does not spawn hostiles immediately');
  assert.equal(emitted.some((e) => e.evt === 'economy:grantCredits' || e.evt === 'faction:repDelta'), false,
    'rumor does not pay or change rep directly');
  assert.equal(state.player.credits, creditsBefore, 'credits are not written directly');
  assert.equal(state.factions.faction_mts.rep, repBefore, 'rep is not written directly');
  sys.destroy();
}

function testRumorRequiresReachPressure() {
  const { bus, emitted } = makeBus();
  const state = makeState('structural_baseline');
  const sys = init(state, bus, fakeVoice());

  recordLoss(state, bus, 'MTS-CALM-1');
  recordLoss(state, bus, 'MTS-CALM-2');
  recordLoss(state, bus, 'MTS-CALM-3');

  assert.equal(emitted.some((e) => e.evt === 'rumor:ghostConvoy'), false,
    'three losses without reach_pressure do not mint a ghost-convoy rumor');
  assert.equal(emitted.some((e) => e.evt === 'mission:offered'), false,
    'three calm losses do not mint a bounty offer');
  sys.destroy();
}

function testRumorRequiresSameFactionLane() {
  const { bus, emitted } = makeBus();
  const state = makeState('reach_pressure');
  const sys = init(state, bus, fakeVoice());

  recordLoss(state, bus, 'MTS-SPLIT-1');
  recordLoss(state, bus, 'MTS-SPLIT-2');
  state.world.sectors.sector_tethys_junction.owner = 'faction_dmc';
  recordLoss(state, bus, 'DMC-SPLIT-3');

  assert.equal(emitted.some((e) => e.evt === 'rumor:ghostConvoy'), false,
    'losses split across victim factions do not meet the same-lane threshold');
  sys.destroy();
}

function testRumorIsOncePerLaneAndSerialized() {
  const { bus, emitted } = makeBus();
  const voice = fakeVoice();
  const state = makeState('reach_pressure');
  const sys = init(state, bus, voice);

  recordLoss(state, bus, 'MTS-ONCE-1');
  recordLoss(state, bus, 'MTS-ONCE-2');
  recordLoss(state, bus, 'MTS-ONCE-3');
  recordLoss(state, bus, 'MTS-ONCE-4');
  assert.equal(emitted.filter((e) => e.evt === 'rumor:ghostConvoy').length, 1,
    'additional same-lane losses do not spam the rumor');

  const snapshot = sys.serialize();
  sys.destroy();

  const { bus: bus2, emitted: emitted2 } = makeBus();
  const state2 = makeState('reach_pressure');
  const sys2 = init(state2, bus2, fakeVoice());
  sys2.deserialize(snapshot);
  recordLoss(state2, bus2, 'MTS-ONCE-5');

  assert.equal(emitted2.some((e) => e.evt === 'rumor:ghostConvoy'), false,
    'serialized fired-lane memory prevents rumor spam after load');
  sys2.destroy();
}
