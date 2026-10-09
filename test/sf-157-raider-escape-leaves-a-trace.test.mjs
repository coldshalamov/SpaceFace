// SF-157 — a thief's escape leaves a trace instead of a reset.
// The scripted freight-raider custody path used to end a clean getaway by releasing the raider's
// persistence and stamping a 0.5 s despawn: the stolen take vanished with no world-side trail.
// The exit is now a handoff — the custody binding breaks, the thief stays a persistent free
// actor on its finite FLEE leg, and the take rides on the shared ambient `ai.stolenLoot` bag so
// later pressure or a kill respills it physically with provenance. `freight:raiderEscaped`
// carries the bounded clue (who, what, last-observed heading) without exposing a live tracker.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { createMarketNews } from '../src/ui/marketNews.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });

function boot(seed = 47531) {
  const voices = [];
  const helpers = {
    voice: {
      say(payload) {
        voices.push(structuredClone(payload));
        return true;
      },
    },
  };
  const sim = createSimulation({
    seed, helpers,
    systems: [combat, surrenderRecovery, cargo, spawnBudget, encounterDirector],
  });
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
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts',
    pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, radius: 42,
    data: { stationId: STATION_ID, factionId: 'faction_mts', sectorId: SECTOR_ID, dockRadius: 72 },
  });
  const names = [
    'freight:cargoSpilled', 'freight:custodyChanged', 'freight:manifestRemaining',
    'freight:custodyReceipt', 'freight:raiderEscaped', 'freight:custodyRebound',
    'pickup:collected', 'entity:killed', 'encounter:resolved',
  ];
  const events = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => events[name].push(structuredClone(payload)));
  createMarketNews({ bus, state, helpers });
  return { sim, state, bus, player, events, voices, director: sim.registry.get('encounterDirector') };
}

function fire(h, suffix = '') {
  const encounterId = `sf157:cargo-custody${suffix}`;
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

function livePods(h, live) {
  return live.ids
    .filter((id) => live.roles[id] === 'freight_pod')
    .map((id) => h.state.entities.get(id))
    .filter(Boolean);
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

function stolenPodEntities(h, encounterId) {
  return [...h.state.entities.values()].filter((entity) => (
    entity && entity.data && entity.data.spillCause === 'raider_destroyed'
      && entity.data.manifestId
      && h.state.entities.get(entity.id) === entity
  ));
}

function assertConserved(record) {
  const livePodQty = record.pods.reduce((sum, pod) => sum + (pod.status === 'live' ? pod.qty : 0), 0);
  assert.equal(
    record.carrierQty + livePodQty + record.playerCollectedQty + record.raiderSecuredQty
      + record.stationRecoveredQty + record.deliveredQty + record.lostQty,
    record.initialQty,
  );
}

function takeAndFlee(h, live) {
  const { carrier, raider } = disable(h, live);
  kill(h, carrier, raider.id);
  const record = live.data.freightCargoCustody;
  for (const pod of livePods(h, live)) collectByRaider(h, live, pod);
  h.sim.runTicks(61);
  assert.equal(record.raiderSecuredQty, record.initialQty);
  raider.pos.set(record.escapeOrigin.x + record.escapeRadius + 1, 0, record.escapeOrigin.z);
  h.sim.runTicks(61);
  return { carrier, raider, record };
}

test('a clean getaway keeps the thief a persistent free actor carrying the take as stolen loot', () => {
  const h = boot(47531);
  const live = fire(h);
  const { raider, record } = takeAndFlee(h, live);

  assert.equal(record.raiderEscaped, true);
  assert.equal(record.terminal, true, 'carrier dead: the custody ledger closes on the theft');
  const [escaped] = h.events['freight:raiderEscaped'];
  assert.ok(escaped, 'the theft publishes the clue');
  assert.equal(escaped.encounterId, live.id);
  assert.equal(escaped.raiderId, raider.id);
  assert.equal(escaped.qty, record.raiderSecuredQty);
  // The clue is bounded provenance — who took what, and where they were last seen headed.
  // It never carries a live tracker: no subscription can reveal where the thief is *now*.
  assert.equal(escaped.manifestId, record.manifestId);
  assert.equal(escaped.commodityId, record.commodityId);
  assert.equal(escaped.freighterKey, record.freighterKey);
  assert.equal(escaped.raiderIdentityKey, record.raiderIdentityKey);
  assert.equal(escaped.sectorId, SECTOR_ID);
  assert.ok(escaped.escapeTarget && typeof escaped.escapeTarget.x === 'number',
    'the clue names the last-observed escape bearing, not a live position');
  assert.ok(escaped.lastObservedPos && typeof escaped.lastObservedPos.x === 'number');
  assert.equal('pos' in escaped, false, 'the clue is a last-observed snapshot, not a live feed');

  // The thief stays a real durable body on its finite flee leg — no despawn stamp, no custody
  // binding, off the roster so terminal encounter sweeps cannot retire it.
  assert.equal(h.state.entities.get(raider.id) === raider, true);
  assert.equal(raider.alive !== false, true);
  assert.equal(raider.flags.persistent, true);
  assert.equal(raider.data.despawnAt == null, true);
  assert.equal(raider.data.predationEncounterId, undefined);
  assert.equal(raider.data.predationRole, undefined);
  assert.equal(raider.data.freightCustodyRaiderIdentityKey, undefined);
  assert.equal(live.ids.includes(raider.id), false);
  assert.equal(live.roles[raider.id], undefined);
  assert.equal(raider.data.ai.activity.kind, 'flee', 'the thief keeps running its bounded escape leg');
  assert.equal(raider.data.ai.predationStatus, 'cleared');
  assert.equal(raider.data.ai.predationEndReason, 'escaped');

  // The take leaves on the shared ambient stolenLoot bag — the same shape a player-pressured
  // ambient raider jettisons or drops on death — not a parallel SF-157 ledger.
  const loot = raider.data.ai.stolenLoot;
  assert.ok(loot && Array.isArray(loot.lines));
  assert.equal(loot.lines.reduce((sum, line) => sum + line.qty, 0), record.raiderSecuredQty);
  assert.equal(loot.lines[0].commodityId, record.commodityId);
  assert.equal(loot.manifestId, record.manifestId);
  assert.equal(loot.victimId, record.carrierId);
  assertConserved(record);

  // Time passes: the body persists, no ghost respawn of the shipment.
  h.sim.runTicks(5 * 60);
  assert.equal(h.state.entities.get(raider.id) === raider, true);
  assert.equal(h.events['freight:raiderEscaped'].length, 1);
  assert.equal(h.events['freight:custodyReceipt'].length, 1);
  assertConserved(record);
});

test('killing the escaped thief spills the take physically with custody provenance, once', () => {
  const h = boot(47532);
  const live = fire(h);
  const { raider, record } = takeAndFlee(h, live);
  const secured = record.raiderSecuredQty;

  kill(h, raider, h.state.playerId);
  h.sim.runTicks(61);

  assert.equal(h.events['entity:killed'].filter((e) => e.id === raider.id || e.entityId === raider.id).length, 1);
  const recovered = stolenPodEntities(h, live.id);
  const recoveredQty = recovered.reduce((sum, pod) => sum + Math.floor(Number(pod.data.amount) || 0), 0);
  assert.ok(recovered.length > 0, 'the take respills as real world pods at the kill site');
  assert.equal(recoveredQty, secured, 'the world recovery equals the take — value conserved, no minting');
  for (const pod of recovered) {
    assert.equal(pod.data.manifestId, record.manifestId, 'recovered pods keep custody provenance');
    assert.equal(pod.data.stolenFromId, record.carrierId);
    assert.equal(pod.alive !== false, true);
    assert.equal(pod.flags.persistent, true);
  }
  // Idempotency: the death cannot mint the shipment twice, and custody does not rebook it.
  assert.equal(h.events['freight:raiderEscaped'].length, 1);
  assert.equal(h.events['freight:custodyReceipt'].length, 1);
  assert.equal((raider.data.ai.stolenLoot ? raider.data.ai.stolenLoot.lines.reduce((s, l) => s + l.qty, 0) : 0), 0,
    'the stolenLoot bag drains on respill so a second kill cannot double-mint');
  assertConserved(record);
});

test('no leash crossing means no trail — the thief does not get credited an escape it never made', () => {
  const h = boot(47533);
  const live = fire(h);
  const { raider } = disable(h, live);
  kill(h, actors(h, live).carrier, raider.id);
  const record = live.data.freightCargoCustody;
  for (const pod of livePods(h, live)) collectByRaider(h, live, pod);
  h.sim.runTicks(61);
  assert.equal(record.raiderSecuredQty, record.initialQty);

  // Park the raider well inside the leash and run past the escape deadline: the custody path
  // stalls and respills — it must not mint stolenLoot or emit the escape clue for a thief
  // that never physically got away.
  const deadline = record.escapeDeadlineAt;
  const advance = Math.max(0, deadline - h.state.simTime) + 2;
  h.sim.runTicks(Math.ceil(advance * 60));
  assert.equal(record.raiderEscaped, false, 'no physical crossing, no escape credit');
  assert.equal(h.events['freight:raiderEscaped'].length, 0);
  assert.equal(raider.data.ai.stolenLoot == null, true, 'a stalled thief holds no stolen-loot trail');
  assertConserved(record);
});

test('a kill before the leash crossing still resolves inside custody — no trail leaks out of a loss', () => {
  const h = boot(47534);
  const live = fire(h);
  const { raider } = disable(h, live);
  kill(h, actors(h, live).carrier, raider.id);
  const record = live.data.freightCargoCustody;
  for (const pod of livePods(h, live)) collectByRaider(h, live, pod);
  h.sim.runTicks(61);
  assert.equal(record.raiderSecuredQty, record.initialQty);

  kill(h, raider, h.state.playerId);
  h.sim.runTicks(61);

  assert.equal(record.raiderEscaped, false, 'a killed raider never got away — no escape clue');
  assert.equal(h.events['freight:raiderEscaped'].length, 0);
  // The custody respill keeps the take inside the same ledger the player saw spill.
  assert.equal(record.raiderSecuredQty, 0);
  assert.equal(record.pods.filter((pod) => pod.status === 'live').length <= 3, true);
  assertConserved(record);
});
