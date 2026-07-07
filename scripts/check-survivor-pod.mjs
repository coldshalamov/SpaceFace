// BP-01.1 packet SURVIVOR_POD_TRIAGE.
//
// Contract:
//   - src/systems/survivorPod.js promotes one existing salvage point into a survivor pod.
//   - The promoted pod reuses shipped wm_survivor_pod exactly, including its binary choice.
//   - Rescue routes through a passenger_transport-shaped offer with Concord goodwill.
//   - Strip pays now by emitting economy/faction intents; it never writes credits or rep directly.
//   - The oxygen timer is a visible soft timer: rewards decay, the pod does not instantly die.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { wreckMissionById } from '../src/data/wreckMissions.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/survivorPod.js', import.meta.url)),
  'src/systems/survivorPod.js exists');

const sysMod = await import('../src/systems/survivorPod.js');
const survivorPod = sysMod.survivorPod || sysMod.default;
const template = wreckMissionById('wm_survivor_pod');

assert.ok(template, 'shipped wm_survivor_pod template exists');
assert.ok(survivorPod && survivorPod.name === 'survivorPod',
  'survivorPod system exports the registry object');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in survivor-pod path'); };
  Date.now = () => { throw new Error('Date.now in survivor-pod path'); };
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

function wreckEntity(id, pointId, pos = { x: 100, z: 0 }) {
  return {
    id,
    type: 'wreck',
    alive: true,
    pos,
    radius: 8,
    data: {
      parentType: 'debris',
      salvagePointId: pointId,
      salvagePool: { cmdty_scrap_metal: 2 },
      scanLabel: 'Wreck Debris',
    },
  };
}

function makeState() {
  const a = wreckEntity(501, 'zone_tethys_derelict:sal0');
  const b = wreckEntity(502, 'zone_tethys_derelict:sal1', { x: 160, z: 40 });
  return {
    meta: { seed: 991 },
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 1000,
      tether: { active: false, targetId: null },
    },
    factions: { faction_scn: { rep: 0 } },
    ui: {},
    world: {
      currentSectorId: 'sector_tethys_junction',
      sectors: {
        sector_tethys_junction: { id: 'sector_tethys_junction', name: 'Tethys Junction' },
      },
    },
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 100 }],
      [a.id, a],
      [b.id, b],
    ]),
    salvage: {
      plannedSectorId: 'sector_tethys_junction',
      points: [
        {
          id: 'zone_tethys_derelict:sal0',
          sectorId: 'sector_tethys_junction',
          zoneId: 'zone_tethys_derelict',
          pos: { x: a.pos.x, z: a.pos.z },
          entityId: a.id,
          isCommunicator: false,
          wreckMissionId: null,
          offered: false,
        },
        {
          id: 'zone_tethys_derelict:sal1',
          sectorId: 'sector_tethys_junction',
          zoneId: 'zone_tethys_derelict',
          pos: { x: b.pos.x, z: b.pos.z },
          entityId: b.id,
          isCommunicator: false,
          wreckMissionId: null,
          offered: false,
        },
      ],
    },
  };
}

function initSystem(state, bus) {
  const sys = { ...survivorPod };
  sys.init({ state, bus, helpers: {} });
  return sys;
}

function promote(state, bus) {
  bus.emit('salvage:placed', { sectorId: 'sector_tethys_junction', count: 2, communicators: 0 });
  const promoted = state.salvage.points.filter((p) => p && p.survivorPod);
  assert.equal(promoted.length, 1, 'exactly one existing salvage point is promoted');
  return promoted[0];
}

function makeOffer(point) {
  return {
    source: 'salvage',
    offerId: `salvage_${point.id}`,
    salvagePointId: point.id,
    sectorId: point.sectorId,
    zoneId: point.zoneId,
    type: 'salvage_retrieval',
    title: 'Generic Salvage',
    summary: 'Generic summary',
    giver: 'Derelict',
    log: 'Generic log',
    reward_cr: 50,
    choice: null,
    tag: 'wreck_salvage',
    wreckMissionId: point.wreckMissionId,
    pos: { x: point.pos.x, z: point.pos.z },
  };
}

guarded(testPromotesExistingPodWithOxygenReadout);
guarded(testOfferUsesShippedChoiceAndPassengerRoute);
guarded(testOxygenTimerIsSoftAndDecaysReward);
guarded(testRescueChoiceRequiresTowAndRoutesPassenger);
guarded(testStripChoicePaysViaIntentsAndRepConsequence);
guarded(testPromotionIsDeterministicAndDeduped);

console.log('Survivor-pod checks OK');

function testPromotesExistingPodWithOxygenReadout() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const sys = initSystem(state, bus);
  const point = promote(state, bus);
  const ent = state.entities.get(point.entityId);

  assert.equal(point.isCommunicator, true, 'pod becomes a communicator for salvage.js reach/scan');
  assert.equal(point.wreckMissionId, 'wm_survivor_pod', 'pod reuses shipped survivor mission id');
  assert.ok(point.survivorPod.oxygenDueAt > state.simTime, 'point carries a future oxygen deadline');
  assert.equal(ent.data.parentType, 'survivor_pod', 'existing wreck entity is typed as a survivor pod');
  assert.equal(ent.data.isCommunicator, true, 'entity stays on the salvage communicator path');
  assert.equal(ent.data.wreckMissionId, 'wm_survivor_pod', 'entity mission id matches point');
  assert.match(ent.data.scanLabel, /Survivor|Oxygen|Pod/i, 'scan label surfaces survivor-pod state');
  assert.ok(ent.data.survivorPod && ent.data.survivorPod.oxygenDueAt === point.survivorPod.oxygenDueAt,
    'entity mirrors survivor-pod metadata');
  assert.equal(emitted.filter((e) => e.evt === 'survivorPod:promoted').length, 1,
    'one promotion receipt emitted');
  assert.equal(emitted.some((e) => e.evt === 'entity:spawned' || e.evt === 'spawn:entity'), false,
    'promotion does not spawn extra entities');

  sys.update(1, state);
  assert.equal(state.ui.survivorPod.salvagePointId, point.id, 'UI readout names the pod point');
  assert.ok(state.ui.survivorPod.oxygenRemaining_s > 0, 'UI readout has visible oxygen countdown');
  assert.match(state.ui.survivorPod.label, /oxygen/i, 'UI readout label calls out oxygen');
  sys.destroy();
}

function testOfferUsesShippedChoiceAndPassengerRoute() {
  const { bus } = makeBus();
  const state = makeState();
  const sys = initSystem(state, bus);
  const point = promote(state, bus);
  const offer = makeOffer(point);

  bus.emit('mission:offered', offer);

  assert.equal(offer.source, 'salvage', 'offer remains on the shipped salvage event path');
  assert.equal(offer.wreckMissionId, 'wm_survivor_pod', 'offer keeps shipped survivor template id');
  assert.equal(offer.type, 'passenger_transport', 'rescue offer routes to passenger_transport');
  assert.equal(offer.factionId, 'faction_scn', 'rescue goodwill routes to the shipped Concord faction');
  assert.equal(offer.destStationId, 'station_customs', 'pod has a concrete rescue destination');
  assert.equal(offer.destSectorId, 'sector_tethys_junction', 'destination sector is concrete');
  assert.ok(offer.id, 'offer is board-shaped enough for missions.js instance creation');
  assert.deepEqual(offer.choice, template.choice, 'offer reuses shipped wm_survivor_pod choice exactly');
  assert.equal(offer.params.cmdtyId, null, 'passenger transport carries no commodity');
  assert.equal(offer.params.passengers, 1, 'passenger route carries one survivor');
  assert.ok(offer.survivorPod.oxygenRemaining_s > 0, 'offer exposes visible oxygen countdown metadata');
  assert.match(offer.summary, /oxygen|survivor|pod/i, 'offer copy surfaces the triage state');
  sys.destroy();
}

function testOxygenTimerIsSoftAndDecaysReward() {
  const { bus } = makeBus();
  const state = makeState();
  const sys = initSystem(state, bus);
  const point = promote(state, bus);
  const ent = state.entities.get(point.entityId);

  state.simTime = point.survivorPod.oxygenDueAt + 90;
  sys.update(1, state);

  assert.notEqual(ent.alive, false, 'oxygen expiry does not instantly kill the pod');
  assert.equal(point.survivorPod.oxygenExpired, true, 'soft expiry is recorded');
  assert.ok(point.survivorPod.rewardMultiplier < 1, 'expired oxygen decays reward');
  assert.ok(point.survivorPod.rewardMultiplier >= point.survivorPod.minRewardMultiplier,
    'decay is floored instead of collapsing to zero');
  assert.equal(state.ui.survivorPod.oxygenRemaining_s, 0, 'UI countdown bottoms at zero');

  const offer = makeOffer(point);
  bus.emit('mission:offered', offer);
  assert.ok(offer.reward_cr < template.reward_cr, 'late rescue offer pays less after soft oxygen expiry');
  assert.ok(offer.reward_cr >= Math.round(template.reward_cr * point.survivorPod.minRewardMultiplier),
    'late rescue offer keeps a reward floor');
  sys.destroy();
}

function testRescueChoiceRequiresTowAndRoutesPassenger() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const sys = initSystem(state, bus);
  const point = promote(state, bus);
  state.player.tether = { active: true, targetId: point.entityId };

  bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });

  const receipt = emitted.find((e) => e.evt === 'survivorPod:rescueSelected');
  assert.ok(receipt, 'rescue emits a tow/passenger receipt');
  assert.equal(receipt.p.missionType, 'passenger_transport', 'rescue receipt names the passenger route');
  assert.equal(receipt.p.factionId, 'faction_scn', 'rescue receipt names Concord goodwill faction');
  assert.equal(receipt.p.destStationId, 'station_customs', 'rescue receipt carries destination');
  assert.equal(point.survivorPod.rescueSelected, true, 'point records the rescue choice');
  assert.equal(emitted.some((e) => e.evt === 'economy:grantCredits'), false,
    'rescue does not pay immediately; mission completion owns payout');
  assert.equal(emitted.some((e) => e.evt === 'faction:repDelta'), false,
    'rescue does not grant immediate rep; mission completion owns goodwill');
  sys.destroy();
}

function testStripChoicePaysViaIntentsAndRepConsequence() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const sys = initSystem(state, bus);
  const point = promote(state, bus);
  const creditsBefore = state.player.credits;
  const repBefore = state.factions.faction_scn.rep;

  bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'strip' });

  const grant = emitted.find((e) => e.evt === 'economy:grantCredits');
  const rep = emitted.find((e) => e.evt === 'faction:repDelta');
  const receipt = emitted.find((e) => e.evt === 'survivorPod:stripped');
  assert.ok(grant, 'strip emits economy grant intent');
  assert.equal(grant.p.reason, 'survivorPod:strip', 'strip payout uses a distinct reason');
  assert.ok(grant.p.amount > 0, 'strip pays immediate credits');
  assert.deepEqual(grant.p.salvagePool, point.survivorPod.stripPool,
    'strip payout names the salvage pool it cashed out');
  assert.ok(rep && rep.p.factionId === 'faction_scn' && rep.p.delta < 0,
    'strip emits the no-witnesses Concord rep consequence');
  assert.ok(receipt && receipt.p.salvagePointId === point.id, 'strip emits a resolved receipt');
  assert.equal(point.offered, true, 'strip resolves the pod so salvage cannot offer rescue afterward');
  assert.equal(state.entities.get(point.entityId).alive, false, 'strip consumes the pod entity');
  assert.equal(state.player.credits, creditsBefore, 'system never writes credits directly');
  assert.equal(state.factions.faction_scn.rep, repBefore, 'system never writes rep directly');
  sys.destroy();
}

function testPromotionIsDeterministicAndDeduped() {
  const run = () => {
    const { bus, emitted } = makeBus();
    const state = makeState();
    const sys = initSystem(state, bus);
    bus.emit('salvage:placed', { sectorId: 'sector_tethys_junction', count: 2, communicators: 0 });
    bus.emit('salvage:placed', { sectorId: 'sector_tethys_junction', count: 2, communicators: 1 });
    const promoted = state.salvage.points.filter((p) => p.survivorPod);
    const result = {
      id: promoted[0] && promoted[0].id,
      events: emitted.filter((e) => e.evt === 'survivorPod:promoted').length,
    };
    sys.destroy();
    return result;
  };

  const a = run();
  const b = run();
  assert.deepEqual(a, b, 'same seed/sector -> same survivor-pod point');
  assert.equal(a.events, 1, 'repeated cues do not duplicate survivor-pod promotion');
}
