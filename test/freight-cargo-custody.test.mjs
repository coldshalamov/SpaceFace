// PQ-047 physical freight-custody production-route regressions.

import test from 'node:test';
import assert from 'node:assert/strict';

import { physics } from '../src/core/physics.js';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { save } from '../src/save/saveSystem.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { createMarketNews } from '../src/ui/marketNews.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });

function boot(seed = 47501, { withSave = false, withMotion = false, withLaw = false } = {}) {
  // Production listener order is material here: combat registers first, civilian recovery sees a
  // kill before the later encounter observer, and cargo owns player acceptance before custody.
  const tactical = withMotion ? createTacticalAISystem() : null;
  const lawSystems = withLaw ? [lawSecurity, heat] : [];
  const systems = withMotion
    ? [...lawSystems, tactical, physics, aiPorts, actions, combat, surrenderRecovery, cargo, spawnBudget, encounterDirector]
    : [...lawSystems, combat, surrenderRecovery, cargo, spawnBudget, encounterDirector];
  if (withSave) systems.push(save);
  const updateOrder = withMotion
    ? [tactical, actions, aiPorts, physics, combat, surrenderRecovery, cargo, encounterDirector]
    : undefined;
  const voices = [];
  const helpers = {
    voice: {
      say(payload) {
        voices.push(structuredClone(payload));
        return true;
      },
    },
  };
  const sim = createSimulation({ seed, helpers, systems, ...(updateOrder ? { updateOrder } : {}) });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, name: 'Tethys Hub' }],
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 200, hullMax: 200,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  // Production sectors materialize their authored station as an entity. Civilian recovery now
  // admits only a lawful destination reachable inside its physical tow window, so the composed
  // B/C fixture must expose that same world fact rather than metadata alone.
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts',
    pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, radius: 42,
    data: { stationId: STATION_ID, factionId: 'faction_mts', sectorId: SECTOR_ID, dockRadius: 72 },
  });
  const names = [
    'freight:cargoSpilled', 'freight:custodyChanged', 'freight:manifestRemaining',
    'freight:custodyReceipt', 'freight:raiderEscaped', 'freight:custodyRebound',
    'pickup:collected',
    'economy:applyTradePressure', 'economy:grantCredits', 'loot:drop',
    'freight:loss', 'news:headline', 'toast', 'encounter:resolved',
    'law:reportIncidentReceipt', 'law:incidentReceipt', 'heat:changed',
  ];
  const events = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => events[name].push(structuredClone(payload)));
  // uiRoot installs marketNews after the sim registry; preserve that production listener order.
  const marketNews = createMarketNews({ bus, state, helpers });
  return {
    sim,
    state,
    bus,
    player,
    events,
    voices,
    marketNews,
    director: sim.registry.get('encounterDirector'),
  };
}

async function bootMotion(seed = 47517) {
  const h = boot(seed, { withMotion: true });
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  h.player.pos.set(ANCHOR.x - 5000, 0, ANCHOR.z - 5000);
  h.player.prevPos.copy(h.player.pos);
  assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state, { reset: true }), true);
  return h;
}

function fire(h, suffix = '') {
  const encounterId = `pq047:cargo-custody${suffix}`;
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId });
  const live = h.state.encounterDirector.live[encounterId];
  assert.ok(live);
  return live;
}

function actors(h, live) {
  return {
    carrier: h.state.entities.get(live.data.predationTargetId),
    raider: h.state.entities.get(live.data.predationRaiderId),
  };
}

function disable(h, live) {
  const { carrier, raider } = actors(h, live);
  h.state.combat = h.state.combat || {};
  h.state.combat.entities = h.state.combat.entities || {};
  h.state.combat.entities[String(carrier.id)] = {
    entityId: carrier.id,
    capabilities: { drive: false, weapon: true },
    subsystems: { subsystem_drive: { id: 'subsystem_drive', destroyed: true, effectiveDisabled: true } },
  };
  h.bus.emit('combat:subsystemDisabled', {
    attackerId: raider.id,
    targetId: carrier.id,
    subsystemId: 'subsystem_drive',
    dependencyDisabled: false,
  });
  return actors(h, live);
}

function kill(h, entity, killerId) {
  h.sim.registry.get('combat').kill(entity, killerId);
}

function pods(h, live) {
  return live.ids
    .filter((id) => live.roles[id] === 'freight_pod')
    .map((id) => h.state.entities.get(id))
    .filter(Boolean);
}

function collectByPlayer(h, pod) {
  const payload = {
    pickupId: pod.id,
    collectorId: h.state.playerId,
    kind: pod.data.kind,
    amount: pod.data.amount,
    commodityId: pod.data.commodityId,
    pos: { x: pod.pos.x, z: pod.pos.z },
  };
  h.bus.emit('pickup:collected', payload);
  if (payload.rejectedAmount <= 0) pod.alive = false;
  else if (payload.acceptedAmount > 0) pod.data.amount = payload.rejectedAmount;
  return payload;
}

function collectByRaider(h, live, pod) {
  const raider = actors(h, live).raider;
  const payload = {
    pickupId: pod.id,
    collectorId: raider.id,
    kind: pod.data.kind,
    amount: pod.data.amount,
    commodityId: pod.data.commodityId,
    pos: { x: pod.pos.x, z: pod.pos.z },
  };
  h.bus.emit('pickup:collected', payload);
  if (payload.rejectedAmount <= 0) pod.alive = false;
  return payload;
}

function addLawStation(h, pos, distance = 100, suffix = '') {
  return h.sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x + distance, z: pos.z }, radius: 42,
    data: {
      stationId: `station_freight_witness${suffix}`,
      factionId: 'faction_scn',
      sectorId: SECTOR_ID,
      dockRadius: 72,
    },
  });
}

function commodityVolume(commodityId) {
  return COMMODITIES.find((commodity) => commodity.id === commodityId)?.volPerU || 1;
}

function assertConserved(record) {
  const livePodQty = record.pods.reduce((sum, pod) => sum + (pod.status === 'live' ? pod.qty : 0), 0);
  assert.equal(
    record.carrierQty + livePodQty + record.playerCollectedQty + record.raiderSecuredQty
      + record.stationRecoveredQty + record.deliveredQty + record.lostQty,
    record.initialQty,
  );
}

function assertLossPresented(h, expected = 1) {
  const losses = h.events['freight:loss'];
  assert.equal(losses.length, expected, 'freight owner emits the expected stable loss count');
  for (const loss of losses) {
    const headlines = h.events['news:headline'].filter((entry) => entry.intentId === loss.intentId);
    const records = h.marketNews.getLog().filter((entry) => entry.intentId === loss.intentId);
    const voices = h.voices.filter((entry) => entry.intentId === loss.intentId);
    const toasts = h.events.toast.filter((entry) => entry.intentId === loss.intentId);
    assert.equal(headlines.length, 1, 'marketNews relays one resolved freight headline');
    assert.equal(records.length, 1, 'marketNews commits one visible freight headline');
    assert.equal(voices.length + toasts.length, 1, 'one voice-or-toast surface owns the headline');
    assert.equal(typeof headlines[0].headline, 'string');
    assert.ok(headlines[0].headline.length > 0);
    assert.equal(records[0].text, headlines[0].headline);
    for (const entry of [headlines[0], records[0], voices[0] || toasts[0]]) {
      assert.equal(entry.intentId, loss.intentId);
      assert.equal(entry.encounterId, loss.encounterId);
      assert.equal(entry.stationId, loss.stationId);
      assert.equal(entry.commodityId, loss.primaryCommodityId);
    }
  }
}

test('authored carrier keeps its visual archetype, forms a close readable curtain, and combat.kill cannot mint generic loot', () => {
  const h = boot(47500);
  const live = fire(h, ':combat-kill');
  const { carrier } = actors(h, live);
  const raiders = h.director.entsOf(live, 'raider');

  assert.equal(carrier.data.lootTableId, 'mule_trader', 'render identity remains the authored hull archetype');
  for (const raider of raiders) {
    const distance = Math.hypot(raider.pos.x - carrier.pos.x, raider.pos.z - carrier.pos.z);
    assert.ok(distance >= 95 && distance <= 165, `raider ${raider.id} is ${distance} WU from the carrier`);
  }
  for (let i = 0; i < raiders.length; i++) {
    for (let j = i + 1; j < raiders.length; j++) {
      assert.ok(Math.hypot(
        raiders[i].pos.x - raiders[j].pos.x,
        raiders[i].pos.z - raiders[j].pos.z,
      ) >= 45, 'curtain actors remain visibly separated');
    }
  }

  kill(h, carrier, h.player.id);
  assert.equal(carrier.alive, false);
  assert.equal(h.events['economy:grantCredits'].length, 0);
  assert.equal(h.events['loot:drop'].length, 0,
    'manifest cargo is represented only by custody pods, never the archetype loot roll');
  assert.ok(live.data.freightCargoCustody.pods.length > 0);
  assertConserved(live.data.freightCargoCustody);
});

test('drive disable ejects one deterministic subset and death ejects the conserved remainder into at most three pods', () => {
  const h = boot(47515);
  const live = fire(h, ':spill');
  const { carrier, raider } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const initial = record.initialQty;

  assert.equal(initial, 7, 'fixture pins the reviewed 7 = 3 disabled spill + 4 death remainder');
  assert.equal(record.pods.length, 1);
  assert.equal(record.pods[0].qty, 3);
  assert.equal(record.carrierQty, initial - record.pods[0].qty);
  assert.equal(carrier.data.cargoManifest.totalQty, record.carrierQty);
  assert.equal(carrier.data.freightCustody.status, 'carrier');
  assertConserved(record);

  h.bus.emit('combat:subsystemDisabled', {
    attackerId: raider.id, targetId: carrier.id, subsystemId: 'subsystem_drive', dependencyDisabled: false,
  });
  assert.equal(record.pods.length, 1, 'duplicate subsystem events cannot spill twice');

  kill(h, carrier, raider.id);
  assert.equal(record.pods.length, 3, 'death uses only the two remaining physical slots');
  assert.equal(record.carrierQty, 0);
  assert.equal(carrier.data.cargoManifest.totalQty, 0);
  assert.equal(new Set(record.pods.map((pod) => pod.podIdentity)).size, record.pods.length);
  assert.equal(record.pods.reduce((sum, pod) => sum + pod.qty, 0), initial);
  assert.equal(record.pods.slice(1).reduce((sum, pod) => sum + pod.qty, 0), 4,
    'production-ordered recovery abandonment defers the four-unit remainder to squadKill spill');
  assertConserved(record);

  h.bus.emit('entity:killed', { id: carrier.id, killerId: raider.id, pos: { ...carrier.pos } });
  assert.equal(record.pods.length, 3, 'duplicate kill events cannot add a fourth pod');
  assert.equal(h.events['economy:grantCredits'].length, 0);
  assert.equal(h.events['loot:drop'].length, 0);
  for (const snapshot of h.events['freight:custodyChanged']) {
    assert.equal(snapshot.accountedQty, snapshot.initialQty, snapshot.reason);
    assert.ok(snapshot.podCount <= 3);
  }
});

test('the real player pickup seam moves only that pod to player custody and wins the raider race', () => {
  const h = boot(47502);
  const live = fire(h, ':player');
  const { raider } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  const before = h.state.player.cargo.items[pod.data.commodityId] || 0;
  raider.pos.copy(pod.pos);

  const payload = collectByPlayer(h, pod);
  assert.equal(h.state.player.cargo.items[pod.data.commodityId], before + pod.data.amount,
    'cargo owner, not the encounter, consumes the physical pickup event');
  assert.equal(record.playerCollectedQty, pod.data.amount);
  assert.equal(record.raiderSecuredQty, 0);
  assert.equal(record.pods[0].status, 'player_collected');
  assertConserved(record);

  h.director._routeToScript('convoy', 'pickupCollected', payload);
  h.sim.runTicks(61);
  assert.equal(record.playerCollectedQty, pod.data.amount, 'duplicate delivery to the observer is idempotent');
  assert.equal(record.raiderSecuredQty, 0, 'the raider cannot steal an already collected pod');
  assert.equal(h.state.player.cargo.items[pod.data.commodityId], before + pod.data.amount,
    'the observer never performs a second cargo write');
  assert.equal(h.events['economy:grantCredits'].length, 0);
  assert.equal(h.events['loot:drop'].length, 0);
});

test('witnessed player collection of civilian manifest cargo reports one law-owned theft incident', () => {
  const h = boot(47521, { withLaw: true });
  const live = fire(h, ':witnessed-theft');
  disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  addLawStation(h, pod.pos, 100, ':witnessed');
  const heatBefore = h.state.player.heat;

  const payload = collectByPlayer(h, pod);

  const accepted = h.events['law:reportIncidentReceipt'].filter((receipt) => receipt.accepted === true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].kind, 'payload_theft');
  assert.equal(accepted[0].offenderEntityId, h.state.playerId);
  assert.equal(accepted[0].payloadStableId, record.manifestId);
  assert.equal(accepted[0].validatedWitnessedTheft, true);
  assert.ok(h.state.player.heat > heatBefore, 'only heat consumes the signed law receipt');

  h.director._routeToScript('convoy', 'pickupCollected', payload);
  assert.equal(
    h.events['law:reportIncidentReceipt'].filter((receipt) => receipt.accepted === true).length,
    1,
    'a duplicate observer delivery cannot report or apply the theft twice',
  );
});

test('partial then complete witnessed collection remains one manifest-theft incident', () => {
  const h = boot(47527, { withLaw: true });
  const live = fire(h, ':partial-theft');
  disable(h, live);
  const [pod] = pods(h, live);
  const originalQty = pod.data.amount;
  addLawStation(h, pod.pos, 100, ':partial');
  h.state.player.cargo.capVolume = h.state.player.cargo.usedVolume
    + commodityVolume(pod.data.commodityId) + 1e-6;

  const partial = collectByPlayer(h, pod);
  assert.equal(partial.acceptedAmount, 1);
  assert.equal(partial.rejectedAmount, originalQty - 1);
  const heatAfterFirst = h.state.player.heat;
  h.state.player.cargo.capVolume = 999;
  collectByPlayer(h, pod);

  assert.equal(
    h.events['law:reportIncidentReceipt'].filter((receipt) => receipt.accepted === true).length,
    1,
  );
  assert.equal(h.events['law:incidentReceipt'].length, 1);
  assert.equal(h.state.player.heat, heatAfterFirst);
  assert.equal(live.data.freightCargoCustody.playerCollectedQty, originalQty);
  assertConserved(live.data.freightCargoCustody);
});

test('an unseen manifest seizure is denied by law and never becomes a heat write', () => {
  const h = boot(47522, { withLaw: true });
  const live = fire(h, ':unseen-theft');
  disable(h, live);
  const [pod] = pods(h, live);
  addLawStation(h, pod.pos, 525, ':unseen');
  const heatBefore = h.state.player.heat;

  collectByPlayer(h, pod);

  assert.equal(h.events['law:reportIncidentReceipt'].length, 1, 'law explicitly answers the report');
  assert.equal(h.events['law:reportIncidentReceipt'][0].accepted, false);
  assert.equal(h.events['law:reportIncidentReceipt'][0].reason, 'no_witness');
  assert.equal(h.events['law:incidentReceipt'].length, 0, 'a denial never enters the incident ledger');
  assert.equal(h.state.player.heat, heatBefore);
  assert.equal(live.data.freightCargoCustody.lawTheftIncidentReceiptId, null);
});

test('lawful recovery authorization makes later manifest pickup noncriminal', () => {
  const h = boot(47523, { withLaw: true });
  const live = fire(h, ':lawful-recovery-pickup');
  const { carrier } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  addLawStation(h, pod.pos, 100, ':recovery');
  h.bus.emit('freight:recovery', {
    id: `civilian-recovery:${record.manifestId}:recovered`,
    outcome: 'recovered',
    entityId: carrier.id,
    stationId: STATION_ID,
    manifestId: record.manifestId,
    freighterKey: record.freighterKey,
    remainingQty: record.carrierQty,
    manifest: structuredClone(carrier.data.cargoManifest),
  });
  assert.equal(record.carrierRecovered, true);
  const heatBefore = h.state.player.heat;

  collectByPlayer(h, pod);

  assert.equal(record.playerCollectedQty, pod.data.amount);
  assert.equal(h.events['law:reportIncidentReceipt'].length, 0);
  assert.equal(h.events['law:incidentReceipt'].length, 0);
  assert.equal(h.state.player.heat, heatBefore);
});

test('cargo respilled from the hostile raider keeps civilian title but is not a player theft', () => {
  const h = boot(47524, { withLaw: true });
  const live = fire(h, ':hostile-respill');
  const { raider } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const [initialPod] = pods(h, live);
  collectByRaider(h, live, initialPod);
  h.state.player.tether = { active: true, targetId: raider.id, attachmentId: 'test-hostile-respill' };
  h.sim.runTicks(61);
  const respilled = pods(h, live).find((entity) => entity.alive !== false);
  assert.ok(respilled);
  const respilledRecord = record.pods.find((pod) => pod.entityId === respilled.id);
  assert.equal(respilledRecord.custodySourceKind, 'hostile_raider');
  assert.equal(respilledRecord.sourceCustodianStableId, record.raiderIdentityKey);
  assert.equal(respilled.data.freightCustodyPod.legalOwnerStableId, record.legalOwnerStableId);
  addLawStation(h, respilled.pos, 100, ':hostile');
  const heatBefore = h.state.player.heat;

  collectByPlayer(h, respilled);

  assert.equal(h.events['law:reportIncidentReceipt'].length, 0);
  assert.equal(h.events['law:incidentReceipt'].length, 0);
  assert.equal(h.state.player.heat, heatBefore);
  assertConserved(record);
});

test('accepted freight theft remains exactly once across process-restart Continue', () => {
  const before = boot(47525, { withLaw: true, withSave: true });
  const live = fire(before, ':law-save-once');
  const { carrier, raider } = disable(before, live);
  kill(before, carrier, raider.id);
  const record = live.data.freightCargoCustody;
  const livePods = pods(before, live).filter((entity) => entity.alive !== false);
  assert.ok(livePods.length > 1);
  addLawStation(before, livePods[0].pos, 100, ':save');
  collectByPlayer(before, livePods[0]);
  assert.ok(record.lawTheftIncidentReceiptId);
  const appliedHeat = before.state.player.heat;
  const envelope = before.sim.registry.get('save').serialize('freight-theft-once');

  const after = boot(47526, { withLaw: true, withSave: true });
  assert.equal(after.sim.registry.get('save').loadEnvelope(
    JSON.parse(JSON.stringify(envelope)), 'freight-theft-once',
  ), true);
  const resumed = after.state.encounterDirector.live[live.id];
  assert.ok(resumed);
  const resumedRecord = resumed.data.freightCargoCustody;
  assert.equal(resumedRecord.lawTheftIncidentReceiptId, record.lawTheftIncidentReceiptId);
  assert.equal(resumedRecord.lawTheftReportId, record.lawTheftReportId);
  assert.equal(resumedRecord.lawTheftCausalTick, record.lawTheftCausalTick);
  assert.equal(after.state.player.heat, appliedHeat);
  const [remaining] = pods(after, resumed).filter((entity) => entity.alive !== false);
  assert.ok(remaining);

  collectByPlayer(after, remaining);

  assert.equal(after.events['law:reportIncidentReceipt'].length, 0,
    'the restored custody receipt blocks a second law report even though law session state is fresh');
  assert.equal(after.events['law:incidentReceipt'].length, 0);
  assert.equal(after.state.player.heat, appliedHeat);
  assertConserved(resumedRecord);
});

test('zero and partial cargo acceptance retain or reduce the same physical pod without ledger drift', () => {
  const h = boot(47507);
  const live = fire(h, ':capacity');
  disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  const originalQty = pod.data.amount;
  const originalMass = pod.mass;
  const originalRadius = pod.radius;

  h.state.player.cargo.capVolume = h.state.player.cargo.usedVolume;
  const rejected = collectByPlayer(h, pod);
  assert.equal(rejected.acceptedAmount, 0);
  assert.equal(rejected.rejectedAmount, originalQty);
  assert.equal(pod.alive, true);
  assert.equal(pod.data.amount, originalQty);
  assert.equal(record.pods[0].qty, originalQty);
  assert.equal(record.pods[0].status, 'live');
  assert.equal(record.playerCollectedQty, 0);
  assertConserved(record);

  h.state.player.cargo.capVolume = h.state.player.cargo.usedVolume
    + commodityVolume(pod.data.commodityId) + 1e-6;
  const partial = collectByPlayer(h, pod);
  assert.equal(partial.acceptedAmount, 1);
  assert.equal(partial.rejectedAmount, originalQty - 1);
  assert.equal(pod.alive, true);
  assert.equal(pod.data.amount, originalQty - 1);
  assert.equal(record.pods[0].qty, originalQty - 1);
  assert.equal(record.pods[0].status, 'live');
  assert.equal(record.playerCollectedQty, 1);
  assert.equal(pod.data.freightCargoPhysics.qty, originalQty - 1);
  assert.equal(pod.data.freightCargoPhysics.bodyMass, pod.mass);
  assert.equal(pod.data.freightCargoPhysics.radius, pod.radius);
  assert.ok(pod.mass <= originalMass);
  assert.ok(pod.radius <= originalRadius);
  assertConserved(record);
});

test('the selected raider receives doctrine only and escapes only after the same operational hull crosses the leash', () => {
  const h = boot(47503);
  const live = fire(h, ':raider');
  const { carrier, raider } = disable(h, live);
  kill(h, carrier, raider.id);
  const record = live.data.freightCargoCustody;
  const intentBefore = structuredClone(raider.data.intent);
  for (const pod of pods(h, live)) collectByRaider(h, live, pod);
  h.sim.runTicks(61);
  assert.equal(record.raiderSecuredQty, record.initialQty);
  assert.equal(record.playerCollectedQty, 0);
  assert.equal(record.pods.every((pod) => pod.status === 'raider_secured'), true);
  assert.equal(raider.data.ai.passive, false, 'HOLD_FIRE doctrine remains rostered for AI-owned movement');
  assert.equal(raider.data.ai.roe, 'hold_fire');
  assert.equal(raider.data.ai.activity.kind, 'flee');
  assert.deepEqual(raider.data.intent, intentBefore, 'the director never writes movement or fire intent');
  assertConserved(record);

  const leash = record.escapeRadius;
  raider.pos.set(record.escapeOrigin.x + leash + 1, 0, record.escapeOrigin.z);
  h.sim.runTicks(61);
  assert.equal(record.raiderEscaped, true);
  assert.equal(record.terminal, true);
  assert.ok(raider.data.despawnAt <= h.state.simTime + 10,
    'terminal encounter cleanup keeps the escaped raider on a bounded despawn');
  assert.equal(h.events['freight:raiderEscaped'].length, 1);
  assert.equal(h.events['freight:custodyReceipt'].length, 1);
  assertLossPresented(h);
  assert.equal(h.events['economy:applyTradePressure'].filter((event) => event.cause === 'freight_loss').length, 1);
});

test('tacticalAI plus physics makes the exact raider collect by contact and cross the custody escape radius', async () => {
  const h = await bootMotion(47517);
  const live = fire(h, ':ordinary-motion');
  const { raider } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const raiderId = raider.id;
  const start = { x: raider.pos.x, z: raider.pos.z };

  for (let second = 0; second < 40 && !record.raiderEscaped; second++) h.sim.runTicks(60);

  assert.equal(record.raiderId, raiderId);
  assert.equal(record.raiderEscaped, true,
    `the bounded custody radius/window is reachable under shipped maneuver and physics owners: ${JSON.stringify({
      secured: record.raiderSecuredQty,
      livePods: record.pods.filter((pod) => pod.status === 'live').length,
      escapeStartedAt: record.escapeStartedAt,
      escapeDeadlineAt: record.escapeDeadlineAt,
      pos: { x: raider.pos.x, z: raider.pos.z },
      vel: { x: raider.vel.x, z: raider.vel.z },
      physicsControl: raider.physicsControl,
      physicsBody: raider.physicsBody,
      start,
      ai: raider.data.ai,
      aiPorts: h.sim.registry.get('aiPorts').inspect?.(),
      tactical: h.sim.registry.get('tacticalAI').inspect?.(),
      physics: h.state.physicsRuntime,
    })}`);
  assert.ok(Math.hypot(raider.pos.x - record.escapeOrigin.x, raider.pos.z - record.escapeOrigin.z)
    >= record.escapeRadius);
  assert.ok(Math.hypot(raider.pos.x - start.x, raider.pos.z - start.z) > 0,
    'the same selected hull moves only through tactical requests and physics integration');
  assert.ok(h.events['pickup:collected'].some((event) => (
    event.collectorId === raiderId && event.pickupId != null && event.acceptedAmount > 0
  )), 'ordinary physics contact publishes the exact raider collection');
  assert.notEqual(raider.flags.persistent, true, 'physical escape releases temporary custody persistence');
  assert.equal(h.events['freight:raiderEscaped'].length, 1);
  assertConserved(record);
});

test('an escape deadline without a physical leash crossing respills the cargo instead of inventing escape', () => {
  const h = boot(47508);
  const live = fire(h, ':no-crossing');
  const { carrier, raider } = disable(h, live);
  kill(h, carrier, raider.id);
  const record = live.data.freightCargoCustody;
  for (const pod of pods(h, live)) collectByRaider(h, live, pod);
  h.sim.runTicks(61);
  assert.equal(record.raiderSecuredQty, record.initialQty);

  h.sim.runTicks(21 * 60);
  assert.equal(record.raiderEscaped, false);
  assert.equal(record.raiderSecuredQty, 0);
  assert.equal(record.pods.filter((pod) => pod.status === 'live').length <= 3, true);
  assert.equal(pods(h, live).filter((pod) => pod.collides !== false).length <= 3, true);
  assertConserved(record);
});

test('disabled, tethered, and destroyed raiders physically respill secured cargo with at most three live pods', () => {
  const cases = ['disabled', 'tethered', 'destroyed'];
  for (let index = 0; index < cases.length; index++) {
    const kind = cases[index];
    const h = boot(47520 + index);
    const live = fire(h, `:${kind}`);
    const { carrier, raider } = disable(h, live);
    kill(h, carrier, raider.id);
    const record = live.data.freightCargoCustody;
    for (const pod of pods(h, live)) collectByRaider(h, live, pod);
    h.sim.runTicks(61);
    assert.equal(record.raiderSecuredQty, record.initialQty, kind);

    if (kind === 'disabled') {
      h.state.combat.entities[String(raider.id)] = {
        entityId: raider.id,
        capabilities: { drive: false, weapon: true },
        subsystems: { subsystem_drive: { id: 'subsystem_drive', effectiveDisabled: true } },
      };
      h.bus.emit('combat:subsystemDisabled', {
        attackerId: h.player.id, targetId: raider.id, subsystemId: 'subsystem_drive',
      });
    } else if (kind === 'tethered') {
      h.state.player.tether = { active: true, targetId: raider.id, attachmentId: 'test-line' };
    } else {
      kill(h, raider, -100);
    }
    h.sim.runTicks(61);

    assert.equal(record.raiderSecuredQty, 0, kind);
    assert.equal(record.raiderEscaped, false, kind);
    assert.ok(record.pods.filter((pod) => pod.status === 'live').length <= 3, kind);
    assert.ok(pods(h, live).filter((pod) => pod.collides !== false).length <= 3, kind);
    assertConserved(record);
  }
});

test('lawful civilian recovery leaves positive pressure to Unit C and accounts diverted cargo once as loss', () => {
  const h = boot(47504);
  const live = fire(h, ':lawful');
  const { carrier } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  collectByPlayer(h, pod);
  carrier.pos.set(live.data.end.x, 0, live.data.end.z);

  h.bus.emit('freight:recovery', {
    id: `civilian-recovery:${record.manifestId}:recovered`,
    outcome: 'recovered',
    entityId: carrier.id,
    stationId: STATION_ID,
    manifestId: record.manifestId,
    freighterKey: record.freighterKey,
    remainingQty: record.carrierQty,
    manifest: structuredClone(carrier.data.cargoManifest),
  });
  h.sim.runTicks(121);

  assert.equal(record.stationRecoveredQty + record.playerCollectedQty, record.initialQty);
  assert.equal(record.terminal, true);
  assertConserved(record);
  assert.equal(h.events['economy:applyTradePressure'].filter((event) => Number(event.vol) > 0).length, 0,
    'director does not duplicate Unit C positive settlement');
  assert.deepEqual(
    h.events['economy:applyTradePressure'].filter((event) => event.cause === 'freight_loss').map((event) => event.vol),
    [-record.playerCollectedQty],
  );
  assert.equal(h.events['freight:loss'].length, 1);
  assert.ok(h.events['encounter:resolved'].some((event) => event.encounterId === live.id && event.outcome === 'recovered'));
});

test('player-diverted cargo is one partial loss while the carrier remainder later arrives positively', () => {
  const h = boot(47509);
  const live = fire(h, ':split-arrival');
  const { carrier } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  collectByPlayer(h, pod);
  h.state.combat.entities[String(carrier.id)].capabilities.drive = true;
  h.state.combat.entities[String(carrier.id)].subsystems.subsystem_drive.effectiveDisabled = false;
  carrier.pos.set(live.data.end.x, 0, live.data.end.z);

  h.sim.runTicks(61);
  assert.equal(record.deliveredQty + record.playerCollectedQty, record.initialQty);
  assert.equal(record.terminal, true);
  assertConserved(record);
  assert.deepEqual(
    h.events['economy:applyTradePressure'].filter((event) => Number(event.vol) > 0).map((event) => event.vol),
    [record.deliveredQty],
  );
  assert.deepEqual(
    h.events['economy:applyTradePressure'].filter((event) => event.cause === 'freight_loss').map((event) => event.vol),
    [-record.playerCollectedQty],
  );
  assertLossPresented(h);
});

test('carrier arrival books only its remainder while an unescaped secured raider keeps the incident live', () => {
  const h = boot(47515);
  const live = fire(h, ':secured-before-arrival');
  const { carrier, raider } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  collectByRaider(h, live, pod);
  const securedQty = record.raiderSecuredQty;
  const carrierQty = record.carrierQty;
  h.state.combat.entities[String(carrier.id)].capabilities.drive = true;
  h.state.combat.entities[String(carrier.id)].subsystems.subsystem_drive.effectiveDisabled = false;
  carrier.pos.set(live.data.end.x, 0, live.data.end.z);

  h.sim.runTicks(61);
  assert.equal(record.deliveredQty, carrierQty);
  assert.equal(record.raiderSecuredQty, securedQty);
  assert.equal(record.carrierArrived, true);
  assert.equal(record.terminal, false, 'the physical raider escape or respill choice remains open');
  assert.equal(raider.alive, true);
  assert.equal(raider.data.despawnAt, undefined);
  assert.deepEqual(
    h.events['economy:applyTradePressure'].filter((event) => Number(event.vol) > 0).map((event) => event.vol),
    [carrierQty],
  );

  h.state.combat.entities[String(raider.id)] = {
    entityId: raider.id,
    capabilities: { drive: false, weapon: true },
    subsystems: { subsystem_drive: { id: 'subsystem_drive', effectiveDisabled: true } },
  };
  h.bus.emit('combat:subsystemDisabled', {
    attackerId: h.state.playerId, targetId: raider.id, subsystemId: 'subsystem_drive',
  });
  for (const respilled of pods(h, live).filter((entity) => entity.alive !== false)) collectByPlayer(h, respilled);
  h.sim.runTicks(61);

  assert.equal(record.terminal, true);
  assertConserved(record);
  assert.equal(h.events['freight:loss'].length, 1);
  assert.equal(h.events['freight:custodyReceipt'].length, 1);
  assert.ok(h.events['encounter:resolved'].some((event) => event.encounterId === live.id && event.outcome === 'arrived'));
});

test('an unmoved disabled carrier cannot arrive by transit deadline and times out as conserved loss', () => {
  const h = boot(47510);
  const live = fire(h, ':disabled-deadline');
  const { carrier } = disable(h, live);
  carrier.disabled = true;
  const record = live.data.freightCargoCustody;
  live.deadlineAt = h.state.simTime;
  record.deadlineAt = h.state.simTime;

  h.sim.runTicks(61);
  assert.deepEqual(h.events['economy:applyTradePressure'].filter((event) => Number(event.vol) > 0), []);
  assert.equal(h.events['encounter:resolved'].some((event) => event.outcome === 'arrived'), false);
  assert.equal(record.terminal, true);
  assert.equal(record.lostQty, record.initialQty);
  assertConserved(record);
  assertLossPresented(h);
});

test('a drive-capable carrier still requires endpoint geometry after its transit deadline', () => {
  const h = boot(47516);
  const live = fire(h, ':deadline-is-not-arrival');
  const { carrier } = actors(h, live);
  assert.ok(Math.hypot(carrier.pos.x - live.data.end.x, carrier.pos.z - live.data.end.z) > 240);
  live.deadlineAt = h.state.simTime;

  h.sim.runTicks(61);
  assert.equal(h.events['economy:applyTradePressure'].filter((event) => Number(event.vol) > 0).length, 0);
  assert.equal(h.events['encounter:resolved'].some((event) => event.outcome === 'arrived'), false);
  assert.equal(h.state.encounterDirector.live[live.id], live);
});

test('entity removal clears convoy membership before numeric ids can be reused', () => {
  const h = boot(47511);
  const live = fire(h, ':entity-gone');
  disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  const oldId = pod.id;

  pod.alive = false;
  h.state.entities.delete(oldId);
  h.bus.emit('entity:destroyed', { id: oldId, type: 'pickup', pos: { x: pod.pos.x, z: pod.pos.z } });

  assert.equal(live.ids.includes(oldId), false);
  assert.equal(live.roles[oldId], undefined);
  assert.equal(record.pods[0].status, 'lost');
  assertConserved(record);
});

test('run cleanup retires only the exact pod instance when its numeric id is actively reused', () => {
  const h = boot(47505);
  const live = fire(h, ':boundary');
  disable(h, live);
  const record = live.data.freightCargoCustody;
  const [pod] = pods(h, live);
  const oldId = pod.id;

  const recycled = h.sim.spawn({
    type: 'pickup', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 2,
    flags: structuredClone(pod.flags),
    collides: true,
    data: structuredClone(pod.data),
  });
  h.state.entities.delete(recycled.id);
  h.state.entities.delete(oldId);
  pod.alive = false;
  recycled.id = oldId;
  h.state.entities.set(oldId, recycled);
  const recycledDespawnAt = recycled.data.despawnAt;

  h.bus.emit('game:new', { seed: h.state.meta.seed });
  assert.equal(Object.keys(h.state.encounterDirector.live).length, 0);
  assert.equal(recycled.collides, true);
  assert.equal(recycled.data.despawnAt, recycledDespawnAt);
  assert.equal(recycled.flags.persistent, true);
  assert.equal(record.terminal, true);
  assert.equal(h.events['freight:custodyReceipt'].length, 1);

  h.director._routeToScript('convoy', 'pickupCollected', {
    pickupId: oldId, collectorId: h.player.id, kind: 'cargo',
    amount: pod.data.amount, acceptedAmount: pod.data.amount, rejectedAmount: 0,
    commodityId: pod.data.commodityId,
  });
  assert.equal(h.events['freight:custodyReceipt'].length, 1);
  assert.equal(record.playerCollectedQty, 0);
});

test('cargo quantity deterministically increases bounded physical pod mass and radius', () => {
  const h = boot(47512);
  const live = fire(h, ':physical-scale');
  const commodityId = actors(h, live).carrier.data.cargoManifest.lines[0].commodityId;
  const small = h.director.spawnFreightPickup(live, {
    commodityId, qty: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    custody: { podIdentity: 'scale-small' },
  });
  const large = h.director.spawnFreightPickup(live, {
    commodityId, qty: 20, pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 },
    custody: { podIdentity: 'scale-large' },
  });

  assert.ok(large.mass >= small.mass);
  assert.ok(large.radius >= small.radius);
  assert.ok(small.mass >= 8 && large.mass <= 80);
  assert.ok(small.radius >= 2.2 && large.radius <= 5.5);
  assert.equal(small.flags.persistent, true);
  assert.equal(large.flags.persistent, true);
});

test('civilian recovery hands carrier persistence to open custody across drive restore and real save', () => {
  const h = boot(47518, { withSave: true });
  const live = fire(h, ':persistence-handoff');
  const { carrier } = disable(h, live);
  const record = live.data.freightCargoCustody;
  const recovery = carrier.data.surrenderRecovery;

  assert.equal(recovery.ownedPersistent, true,
    'production-first civilian recovery initially owns the save-retention flag');
  assert.equal(record.carrierPersistenceOwned, true,
    'later freight custody explicitly adopts C-owned persistence');
  assert.equal(carrier.data.freightCustodyPersistence.custodyId, record.custodyId);

  for (const pod of pods(h, live)) collectByPlayer(h, pod);
  h.state.combat.entities[String(carrier.id)].capabilities.drive = true;
  h.state.combat.entities[String(carrier.id)].subsystems.subsystem_drive.effectiveDisabled = false;
  h.bus.emit('combat:subsystemEnabled', {
    targetId: carrier.id,
    subsystemId: 'subsystem_drive',
  });

  assert.equal(carrier.data.surrenderRecovery.ownedPersistent, false,
    'drive restore releases C ownership');
  assert.equal(carrier.flags.persistent, true,
    'C leaves the shared flag in place for the still-open custody coordinator');
  assert.equal(carrier.data.freightCustodyPersistence.custodyId, record.custodyId);
  const envelope = h.sim.registry.get('save').serialize('freight-persistence-handoff');
  const savedCarriers = envelope.data.entities.persistent.filter((entity) => (
    entity.data?.freightCustodyCarrierIdentityKey === record.carrierIdentityKey
      && entity.data?.cargoManifest?.manifestId === record.manifestId
  ));
  assert.equal(savedCarriers.length, 1, 'real save retains the exact continuing carrier');

  carrier.pos.set(live.data.end.x, 0, live.data.end.z);
  h.sim.runTicks(61);

  assert.equal(record.terminal, true);
  assert.equal(carrier.data.freightCustodyPersistence, undefined,
    'terminal custody clears its handoff marker');
  assert.notEqual(carrier.flags.persistent, true,
    'terminal custody releases the adopted persistence flag exactly once');
});

test('freight custody never adopts an unrelated pre-existing carrier persistence owner', () => {
  const h = boot(47519);
  const live = fire(h, ':external-persistence');
  const { carrier } = actors(h, live);
  carrier.flags = { ...(carrier.flags || {}), persistent: true };
  disable(h, live);
  const record = live.data.freightCargoCustody;

  assert.equal(carrier.data.surrenderRecovery.ownedPersistent, false,
    'C correctly recognizes the earlier external persistence owner');
  assert.equal(record.carrierPersistenceOwned, false,
    'B does not adopt a flag that civilian recovery did not own');
  for (const pod of pods(h, live)) collectByPlayer(h, pod);
  h.state.combat.entities[String(carrier.id)].capabilities.drive = true;
  h.state.combat.entities[String(carrier.id)].subsystems.subsystem_drive.effectiveDisabled = false;
  h.bus.emit('combat:subsystemEnabled', { targetId: carrier.id, subsystemId: 'subsystem_drive' });
  carrier.pos.set(live.data.end.x, 0, live.data.end.z);
  h.sim.runTicks(61);

  assert.equal(record.terminal, true);
  assert.equal(carrier.data.freightCustodyPersistence, undefined);
  assert.equal(carrier.flags.persistent, true,
    'terminal cleanup preserves persistence owned outside C and B');
});

test('process-restart Continue reconstructs live-pod custody without settling restore and settles once afterward', () => {
  const before = boot(47513, { withSave: true });
  const live = fire(before, ':save-open');
  disable(before, live);
  const record = live.data.freightCargoCustody;
  const envelope = before.sim.registry.get('save').serialize('freight-custody-open');
  assert.equal(envelope.data.encounterDirector.live, undefined, 'transient runtime live map is not serialized');
  assert.equal(envelope.data.encounterDirector.stats.openFreightCustodies.length, 1);
  const savedPods = envelope.data.entities.persistent.filter((entity) => (
    entity.data?.freightCustodyPod?.status === 'live'
  ));
  const savedCarrier = envelope.data.entities.persistent.find((entity) => (
    entity.data?.cargoManifest?.manifestId === record.manifestId
  ));
  assert.ok(savedCarrier);
  assert.ok(savedPods.length > 0 && savedPods.length <= 3);
  assert.equal(savedCarrier.data.cargoManifest.totalQty
    + savedPods.reduce((sum, entity) => sum + entity.data.amount, 0), record.initialQty);

  before.bus.emit('save:restoring', { slot: 'freight-custody-open' });
  assert.equal(record.terminal, false, 'save transport never closes the outgoing custody record');
  assert.equal(before.events['freight:loss'].length, 0);
  assert.equal(before.events['news:headline'].length, 0);
  assert.equal(before.events['freight:custodyReceipt'].length, 0);

  const after = boot(47599, { withSave: true });
  const saveAfter = after.sim.registry.get('save');
  assert.equal(saveAfter.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'freight-custody-open'), true);
  assert.equal(after.events['freight:loss'].length, 0, 'load itself emits no loss');
  assert.equal(after.events['news:headline'].length, 0, 'load itself emits no news');
  assert.equal(after.events['freight:custodyReceipt'].length, 0, 'load itself emits no receipt');
  const resumed = after.state.encounterDirector.live[live.id];
  assert.ok(resumed, 'a fresh simulation reconstructs the omitted live coordinator');
  const resumedRecord = resumed.data.freightCargoCustody;
  assertConserved(resumedRecord);
  assert.ok(resumedRecord.pods.filter((pod) => pod.status === 'live').length <= 3);
  after.sim.runTicks(1); // Unit C re-adopts the persistent disabled carrier before its real death.
  const resumedCarrier = actors(after, resumed).carrier;
  kill(after, resumedCarrier, after.state.playerId);
  for (const pod of pods(after, resumed).filter((entity) => entity.alive !== false)) collectByPlayer(after, pod);
  after.sim.runTicks(61);

  assert.equal(resumedRecord.terminal, true);
  assertConserved(resumedRecord);
  assert.equal(after.events['freight:custodyReceipt'].length, 1);
  assertLossPresented(after);
  assert.deepEqual(after.state.encounterDirector.stats.openFreightCustodies, []);
});

test('process-restart Continue restores the exact secured raider, respills it, and settles once', () => {
  const before = boot(47514, { withSave: true });
  const live = fire(before, ':save-secured');
  const { raider } = disable(before, live);
  const [pod] = pods(before, live);
  collectByRaider(before, live, pod);
  const record = live.data.freightCargoCustody;
  assert.ok(record.raiderSecuredQty > 0);
  assert.equal(raider.flags.persistent, true);
  const envelope = before.sim.registry.get('save').serialize('freight-custody-secured');
  assert.ok(envelope.data.entities.persistent.some((entity) => (
    entity.data?.freightCustodyRaiderIdentityKey === record.raiderIdentityKey
  )), 'the exact secured hull is durable while it owns manifest quantity');

  const after = boot(47600, { withSave: true });
  assert.equal(after.sim.registry.get('save').loadEnvelope(
    JSON.parse(JSON.stringify(envelope)), 'freight-custody-secured',
  ), true);
  const resumed = after.state.encounterDirector.live[live.id];
  assert.ok(resumed);
  const resumedRecord = resumed.data.freightCargoCustody;
  const resumedActors = actors(after, resumed);
  assert.ok(resumedActors.raider);
  assert.equal(resumedRecord.raiderSecuredQty, record.raiderSecuredQty);
  assert.equal(resumedActors.raider.flags.persistent, true);
  assert.equal(after.events['freight:loss'].length, 0);
  assert.equal(after.events['news:headline'].length, 0);
  assert.equal(after.events['freight:custodyReceipt'].length, 0);

  after.state.combat.entities[String(resumedActors.raider.id)] = {
    entityId: resumedActors.raider.id,
    capabilities: { drive: false, weapon: true },
    subsystems: { subsystem_drive: { id: 'subsystem_drive', effectiveDisabled: true } },
  };
  after.bus.emit('combat:subsystemDisabled', {
    attackerId: after.state.playerId,
    targetId: resumedActors.raider.id,
    subsystemId: 'subsystem_drive',
  });
  assert.equal(resumedRecord.raiderSecuredQty, 0);
  assert.notEqual(resumedActors.raider.flags.persistent, true,
    'respill releases the temporary secured-raider persistence owner');
  for (const restoredPod of pods(after, resumed).filter((entity) => entity.alive !== false)) {
    collectByPlayer(after, restoredPod);
  }
  const carrierRuntime = after.state.combat.entities[String(resumedActors.carrier.id)];
  carrierRuntime.capabilities.drive = true;
  carrierRuntime.subsystems.subsystem_drive.effectiveDisabled = false;
  after.bus.emit('combat:subsystemEnabled', {
    targetId: resumedActors.carrier.id,
    subsystemId: 'subsystem_drive',
  });
  resumedActors.carrier.pos.set(resumed.data.end.x, 0, resumed.data.end.z);
  after.sim.runTicks(61);

  assert.equal(resumedRecord.terminal, true);
  assertConserved(resumedRecord);
  assert.equal(after.events['freight:custodyReceipt'].length, 1);
  assertLossPresented(after);
  assert.deepEqual(after.state.encounterDirector.stats.openFreightCustodies, []);
});

test('Continue rebinds only a valid persisted carrier record to its rematerialized numeric id', () => {
  const h = boot(47506);
  const live = fire(h, ':continue');
  const { carrier } = actors(h, live);
  const oldId = carrier.id;
  const stableKey = carrier.data.predationIdentityKey;
  const manifestId = carrier.data.cargoManifest.manifestId;

  h.bus.emit('save:restoring', {});
  assert.equal(carrier.data.predationIdentityKey, stableKey,
    'valid carrier custody retains only the stable key while predation authority is revoked');
  const savedData = structuredClone(carrier.data);
  h.state.entities.delete(oldId);
  const rematerialized = h.sim.spawn({
    type: 'ship', team: 2, factionId: carrier.factionId,
    pos: { x: carrier.pos.x, z: carrier.pos.z }, vel: { x: carrier.vel.x, z: carrier.vel.z },
    radius: carrier.radius, hull: carrier.hull, hullMax: carrier.hullMax,
    data: savedData,
  });
  assert.notEqual(rematerialized.id, oldId);
  assert.equal(rematerialized.data.freightCustody.carrierId, oldId);

  const rejected = h.sim.spawn({
    type: 'ship', team: 2, pos: { x: carrier.pos.x + 40, z: carrier.pos.z },
    vel: { x: 0, z: 0 }, radius: carrier.radius, hull: 20, hullMax: 20,
    data: structuredClone(savedData),
  });
  rejected.data.freightCustody.status = 'spilled';
  rejected.data.freightCustody.carrierId = 999999;

  h.state.encounterDirector = JSON.parse(JSON.stringify({
    named: h.state.encounterDirector.named,
    receipts: h.state.encounterDirector.receipts,
    cooldowns: h.state.encounterDirector.cooldowns,
    stats: h.state.encounterDirector.stats,
  }));
  h.bus.emit('save:loaded', {});

  assert.equal(rematerialized.data.freightCustody.carrierId, rematerialized.id);
  assert.equal(rematerialized.data.freightCustody.manifestId, manifestId);
  assert.equal(rematerialized.data.predationIdentityKey, stableKey);
  assert.equal(rejected.data.freightCustody.carrierId, 999999,
    'spilled custody never rebinds or revives carrier authority');
  assert.equal(h.events['freight:custodyRebound'].length, 1);
});
