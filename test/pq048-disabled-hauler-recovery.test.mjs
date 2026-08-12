import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureCombatState } from '../src/combat/runtime.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { fnv1a } from '../src/save/checksum.js';
import { save } from '../src/save/saveSystem.js';
import {
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
} from '../src/data/contactHail.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../src/data/sectorActivityPockets.js';
import { actions } from '../src/systems/actions.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { SURRENDER_SECURE_REEL_WU, surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { targetIntelReadout } from '../src/ui/targetPanel.js';

const SEED = 0x4805;
const MINER_SLOT_ID = 'ceres_seam_miner';
const HAULER_SLOT_ID = 'ceres_refinery_hauler';
const TENDER_SLOT_ID = 'ceres_refinery_tender';
const OBSERVED = Object.freeze([
  'combat:subsystemDisabled',
  'surrender:option',
  'freight:recovery',
  'freight:recoveryAbandoned',
  'freight:loss',
  'economy:grantCredits',
  'economy:applyTradePressure',
  'faction:repDelta',
  'law:reportIncidentReceipt',
  'entity:killed',
  'aftermathWreck:recorded',
]);

function liveActor(state, slotId) {
  const entity = state.entityList.find((candidate) => candidate && candidate.alive !== false
    && candidate.data && candidate.data.activityActorSlotId === slotId);
  assert.ok(entity, `missing live ${slotId}`);
  return entity;
}

function driveRuntime(state, entity) {
  const drive = state.combat && state.combat.entities && state.combat.entities[String(entity.id)]
    && state.combat.entities[String(entity.id)].subsystems
    && state.combat.entities[String(entity.id)].subsystems.subsystem_drive;
  assert.ok(drive, `missing combat drive for ${entity.id}`);
  return drive;
}

function boot(seed = SEED, { withSave = false } = {}) {
  const sim = createSimulation({
    seed,
    systems: [
      lawSecurity,
      actions,
      combat,
      aftermathWrecks,
      surrenderRecovery,
      cargo,
      economy,
      factionPresence,
      world,
      factions,
      npcJobsRuntime,
      heat,
      traffic,
      ...(withSave ? [save] : []),
    ],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 7, flags: { persistent: true },
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID, { placePlayer: false });
  const station = state.entityList.find((entity) => entity && entity.data && entity.data.stationId === 'station_ceres');
  assert.ok(station);
  player.pos = { x: station.pos.x + 100, z: station.pos.z };
  const events = Object.fromEntries(OBSERVED.map((event) => [event, []]));
  for (const event of OBSERVED) bus.on(event, (payload) => events[event].push(structuredClone(payload)));
  return {
    sim,
    state,
    bus,
    player,
    events,
    traffic: sim.registry.get('traffic'),
    combat: sim.registry.get('combat'),
    miner: liveActor(state, MINER_SLOT_ID),
    hauler: liveActor(state, HAULER_SLOT_ID),
    tender: liveActor(state, TENDER_SLOT_ID),
    station,
  };
}

function transferOneRealLot(ctx, suffix = 'default') {
  const { state, traffic: trafficSystem, miner, hauler, station } = ctx;
  assert.ok(station, 'Ceres lawful refinery is materialized');
  const minerSlot = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots)
    .find((slot) => slot.id === MINER_SLOT_ID);
  const minerRec = state.traffic.freighters.find((row) => row && row.id === miner.id);
  const haulerRec = state.traffic.freighters.find((row) => row && row.id === hauler.id);
  assert.ok(minerSlot && minerRec && haulerRec);
  miner.pos = { x: station.pos.x + 220, z: station.pos.z };
  hauler.pos = { ...miner.pos };
  miner.vel = { x: 0, z: 0 };
  hauler.vel = { x: 0, z: 0 };
  const manifest = trafficSystem._buildMinerManifest(
    miner, 1, 'cmdty_ore_iron', 8, 'ore_carrier', { rootLotId: `disabled-hauler-root:${suffix}` },
  );
  trafficSystem._setTrafficManifest(miner, minerRec, manifest);
  const handoff = trafficSystem._requestCeresMinerHaulerHandoff({
    entity: miner,
    rec: minerRec,
    slot: minerSlot,
    worldRecordId: miner.data.worldRecordId,
  }, manifest);
  assert.ok(handoff);
  assert.equal(trafficSystem._transferCeresMinerHaulerHandoff(
    handoff,
    { entity: miner, rec: minerRec, worldRecordId: miner.data.worldRecordId },
    { entity: hauler, rec: haulerRec, worldRecordId: hauler.data.worldRecordId },
    0,
  ), true);
  assert.equal(handoff.state, 'in_transit');
  assert.equal(hauler.data.cargoManifest.custody.handoffId, handoff.handoffId);
  return handoff;
}

function beginAndDisable(ctx, suffix = 'default') {
  const handoff = transferOneRealLot(ctx, suffix);
  const incident = ctx.traffic._beginCeresDisabledHaulerIncident();
  assert.ok(incident, 'the incident adopts the real in-transit handoff and existing faction tender');
  assert.equal(incident.handoffId, handoff.handoffId);
  assert.equal(incident.manifestId, ctx.hauler.data.cargoManifest.manifestId);
  assert.equal(incident.haulerWorldRecordId, ctx.hauler.data.worldRecordId);
  assert.equal(incident.responderWorldRecordId, ctx.tender.data.worldRecordId);

  ctx.sim.step(SIM_DT);
  let drive = driveRuntime(ctx.state, ctx.hauler);
  assert.equal(drive.effectiveDisabled, false);
  assert.equal(drive.pendingTransition && drive.pendingTransition.destroyed, true, JSON.stringify({
    incident,
    handoff: ctx.state.traffic.ceresMinerHaulerHandoff,
    drive,
    mode: ctx.state.mode,
    sectorId: ctx.state.world.currentSectorId,
    freighters: ctx.state.traffic.freighters.length,
    stations: ctx.traffic._sectorStations().length,
    haulerBound: !!ctx.traffic._ceresDisabledHaulerActor(incident, 'hauler'),
    responderBound: !!ctx.traffic._ceresDisabledHaulerActor(incident, 'responder'),
  }));
  assert.equal(ctx.hauler.hull, ctx.hauler.hullMax, 'drive impairment is component-only');
  ctx.sim.step(SIM_DT);
  drive = driveRuntime(ctx.state, ctx.hauler);
  assert.equal(drive.effectiveDisabled, true, 'combat owns the actual disabled transition');
  assert.equal(incident.state, 'distress');
  assert.equal(ctx.events['combat:subsystemDisabled'].length, 1);
  assert.equal(Object.values(ctx.state.surrenderRecovery.records).length, 1,
    'existing civilian recovery adopts the same manifest-bearing hull');
  return incident;
}

function hailChoice(ctx, choice) {
  ctx.player.pos = { x: ctx.hauler.pos.x - 80, z: ctx.hauler.pos.z };
  ctx.state.player.targetId = ctx.hauler.id;
  const available = contactHailAvailability(ctx.state);
  assert.equal(available.enabled, true);
  assert.equal(available.kind, 'worker');
  const offer = createContactHailOffer(ctx.state, available, `hail:${choice}`, ctx.state.simTime + 8);
  assert.deepEqual(offer.actions.map((action) => action.id), ['recover', 'steal', 'abandon']);
  const response = createContactHailResponse(ctx.state, offer, choice);
  assert.ok(response);
  ctx.bus.emit('contactHail:response', response);
  return { available, offer, response };
}

function attachAndReel(ctx) {
  const attachmentId = `att_disabled_hauler_${ctx.hauler.id}`;
  const runtime = ensureCombatState(ctx.state);
  runtime.attachments.byId[attachmentId] = {
    id: attachmentId,
    defId: 'tether_standard',
    ownerId: ctx.player.id,
    targetId: ctx.hauler.id,
    state: 'active',
    restLength: SURRENDER_SECURE_REEL_WU,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  ctx.state.player.tether = {
    active: true,
    targetId: ctx.hauler.id,
    attachmentId,
    restLength: SURRENDER_SECURE_REEL_WU,
    strain: 0,
    phase: 'loaded',
  };
  ctx.bus.emit('tether:latched', {
    actorId: ctx.player.id,
    targetId: ctx.hauler.id,
    attachmentId,
  });
  ctx.bus.emit('tether:reel', {
    actorId: ctx.player.id,
    targetId: ctx.hauler.id,
    attachmentId,
    before: SURRENDER_SECURE_REEL_WU + 12,
    after: SURRENDER_SECURE_REEL_WU,
  });
}

test('PQ-048.05: real Ceres handoff hauler exposes the three-way distress and RECOVER settles once through existing owners', () => {
  const ctx = boot();
  try {
    const incident = beginAndDisable(ctx);
    const manifest = structuredClone(ctx.hauler.data.cargoManifest);
    const cargoBefore = structuredClone(ctx.state.player.cargo);
    const creditsBefore = ctx.state.player.credits;
    const intel = targetIntelReadout(ctx.hauler, ctx.player, ctx.state, 80);
    assert.equal(intel.workStatus, 'DISTRESS · DRIVE DISABLED');
    assert.equal(intel.recoveryPrompt, 'HAIL · RECOVER / STEAL / ABANDON');

    hailChoice(ctx, 'recover');
    assert.equal(incident.choice, 'recover');
    assert.equal(incident.state, 'player_recovery');
    attachAndReel(ctx);
    ctx.sim.step(SIM_DT);

    assert.equal(incident.state, 'recovered');
    assert.equal(ctx.state.traffic.ceresMinerHaulerHandoff.state, 'interrupted');
    assert.equal(ctx.state.traffic.ceresMinerHaulerHandoff.interruption, 'lawful_recovery');
    assert.equal(ctx.events['freight:recovery'].length, 1);
    assert.equal(ctx.events['freight:recovery'][0].manifestId, manifest.manifestId);
    assert.equal(ctx.events['freight:recovery'][0].freighterKey, manifest.freighterKey);
    assert.equal(ctx.events['economy:grantCredits'].length, 1);
    assert.equal(ctx.events['economy:applyTradePressure'].length, manifest.lines.length);
    assert.equal(ctx.events['faction:repDelta'].length, 1);
    assert.ok(ctx.state.player.credits > creditsBefore, 'economy is the actual reward writer');
    assert.deepEqual(ctx.state.player.cargo, cargoBefore, 'recovery does not mint the manifest into player cargo');
    assert.equal(ctx.events['freight:loss'].length, 0);
    assert.equal(ctx.events['freight:recoveryAbandoned'].length, 0);

    ctx.sim.runTicks(5, SIM_DT);
    ctx.bus.emit('contactHail:response', { targetId: ctx.hauler.id, kind: 'worker', choice: 'recover' });
    assert.equal(ctx.events['freight:recovery'].length, 1, 'replay cannot duplicate settlement');
    assert.equal(ctx.events['economy:grantCredits'].length, 1);
    assert.equal(ctx.events['faction:repDelta'].length, 1);
  } finally {
    ctx.sim.dispose();
  }
});

test('PQ-048.05: STEAL jettisons the conserved manifest as physical cargo and lets cargo, law, heat, and freight owners settle it', () => {
  const ctx = boot(SEED + 1);
  try {
    const incident = beginAndDisable(ctx, 'steal');
    const manifest = structuredClone(ctx.hauler.data.cargoManifest);
    const creditsBefore = ctx.state.player.credits;
    const repBefore = structuredClone(ctx.state.factions);
    const heatBefore = ctx.state.player.heat;
    hailChoice(ctx, 'steal');

    assert.equal(incident.state, 'stolen');
    assert.equal(incident.choice, 'steal');
    assert.equal(ctx.state.traffic.ceresMinerHaulerHandoff.state, 'interrupted');
    assert.equal(ctx.state.traffic.ceresMinerHaulerHandoff.interruption, 'manifest_stolen');
    assert.equal(ctx.hauler.data.cargoManifest.totalQty, 0);
    assert.equal(incident.pickupLines.reduce((sum, line) => sum + line.qty, 0), manifest.totalQty);
    const pickups = ctx.state.entityList.filter((entity) => entity && entity.alive !== false
      && entity.data && entity.data.ceresDisabledHaulerPickup
      && entity.data.ceresDisabledHaulerPickup.incidentId === incident.incidentId);
    assert.equal(pickups.length, manifest.lines.length);
    assert.ok(pickups.every((pickup) => pickup.collides === true && pickup.flags && pickup.flags.persistent === true));
    assert.ok(pickups.every((pickup) => pickup.data.lotSource
      && pickup.data.lotSource.provenanceId === manifest.manifestId
      && pickup.data.lotSource.recordId === incident.haulerWorldRecordId));
    assert.equal(ctx.events['freight:loss'].length, 1);
    assert.equal(ctx.events['freight:loss'][0].intentId, incident.lossIntentId);
    assert.equal(ctx.events['freight:loss'][0].manifestId, manifest.manifestId);
    assert.equal(ctx.events['freight:loss'][0].recoveryCause, 'disabled_hauler_theft');
    assert.equal(ctx.events['economy:grantCredits'].length, 0);
    assert.equal(ctx.events['faction:repDelta'].length, 0);
    assert.equal(ctx.state.player.credits, creditsBefore);
    assert.deepEqual(ctx.state.factions, repBefore);

    const pickup = pickups[0];
    const payload = {
      collectorId: ctx.player.id,
      pickupId: pickup.id,
      kind: pickup.data.kind,
      commodityId: pickup.data.commodityId,
      amount: pickup.data.amount,
    };
    ctx.bus.emit('pickup:collected', payload);
    assert.equal(payload.acceptedAmount, pickup.data.amount);
    assert.equal(incident.pickupLines[0].acceptedQty, pickup.data.amount);
    assert.equal(ctx.state.player.cargo.items[pickup.data.commodityId], pickup.data.amount);
    assert.ok(ctx.state.player.cargo.richLots.some((lot) => lot
      && lot.provenanceId === manifest.manifestId
      && lot.recordId === incident.haulerWorldRecordId
      && lot.qty === pickup.data.amount));
    assert.equal(ctx.events['law:reportIncidentReceipt'].length, 1);
    assert.equal(ctx.events['law:reportIncidentReceipt'][0].accepted, true);
    assert.equal(ctx.events['law:reportIncidentReceipt'][0].payloadStableId, manifest.manifestId);
    assert.equal(incident.lawIncidentReceiptId,
      ctx.events['law:reportIncidentReceipt'][0].incidentReceiptId);
    assert.ok(ctx.state.player.heat > heatBefore, 'heat is written only after law validates a witnessed theft');

    ctx.bus.emit('contactHail:response', { targetId: ctx.hauler.id, kind: 'worker', choice: 'steal' });
    ctx.sim.runTicks(3, SIM_DT);
    assert.equal(ctx.events['freight:loss'].length, 1);
    assert.equal(ctx.events['law:reportIncidentReceipt'].length, 1);
    assert.equal(ctx.events['economy:grantCredits'].length, 0);
  } finally {
    ctx.sim.dispose();
  }
});

test('PQ-048.05: ABANDON, player death, and sector exit each create one durable wreck/loss and never a reward', () => {
  const cases = [
    ['abandon', (ctx) => hailChoice(ctx, 'abandon'),
      (ctx) => ctx.bus.emit('contactHail:response', { targetId: ctx.hauler.id, kind: 'worker', choice: 'abandon' })],
    ['player_death', (ctx) => ctx.bus.emit('player:death', { recoverable: true }),
      (ctx) => ctx.bus.emit('player:death', { recoverable: true })],
    ['sector_exit', (ctx) => ctx.bus.emit('sector:exit', { sectorId: CERES_ACTIVITY_SECTOR_ID }),
      (ctx) => ctx.bus.emit('sector:exit', { sectorId: CERES_ACTIVITY_SECTOR_ID })],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [name, close, replay] = cases[index];
    const ctx = boot(SEED + 10 + index);
    try {
      const incident = beginAndDisable(ctx, name);
      const manifestId = ctx.hauler.data.cargoManifest.manifestId;
      const creditsBefore = ctx.state.player.credits;
      close(ctx);
      ctx.sim.step(SIM_DT);

      assert.equal(incident.state, 'abandoned', `${name} terminal state`);
      assert.equal(ctx.hauler.alive, false, `${name} destroys the unresolved disabled hull through combat`);
      assert.equal(ctx.events['entity:killed'].length, 1, `${name} kill`);
      assert.equal(ctx.events['freight:loss'].length, 1, `${name} freight loss`);
      assert.equal(ctx.events['freight:loss'][0].manifestId, manifestId);
      assert.equal(ctx.events['aftermathWreck:recorded'].length, 1, `${name} durable aftermath`);
      assert.equal(ctx.events['aftermathWreck:recorded'][0].freightIdentity.manifestId, manifestId);
      assert.equal(ctx.events['economy:grantCredits'].length, 0, `${name} reward`);
      assert.equal(ctx.events['faction:repDelta'].length, 0, `${name} reputation`);
      assert.equal(ctx.state.player.credits, creditsBefore);

      replay(ctx);
      ctx.sim.runTicks(2, SIM_DT);
      assert.equal(ctx.events['entity:killed'].length, 1, `${name} duplicate kill`);
      assert.equal(ctx.events['freight:loss'].length, 1, `${name} duplicate loss`);
      assert.equal(ctx.events['aftermathWreck:recorded'].length, 1, `${name} duplicate aftermath`);
    } finally {
      ctx.sim.dispose();
    }
  }
});

test('PQ-048.05: the existing faction tender wins only after the player window and repairs without settlement or loss', () => {
  const ctx = boot(SEED + 20);
  try {
    const incident = beginAndDisable(ctx, 'responder');
    const handoffId = incident.handoffId;
    const distance = Math.max(56, ctx.tender.radius + ctx.hauler.radius + 12);
    ctx.tender.pos = { x: ctx.hauler.pos.x + distance, z: ctx.hauler.pos.z };
    ctx.tender.vel = { x: 0, z: 0 };
    ctx.hauler.vel = { x: 0, z: 0 };
    incident.responseAtSimT = ctx.state.simTime;
    ctx.sim.runTicks(210, SIM_DT);

    assert.equal(incident.state, 'repaired');
    assert.equal(driveRuntime(ctx.state, ctx.hauler).effectiveDisabled, false);
    assert.equal(ctx.state.traffic.ceresMinerHaulerHandoff.handoffId, handoffId);
    assert.equal(ctx.state.traffic.ceresMinerHaulerHandoff.state, 'in_transit');
    assert.equal(ctx.events['freight:recovery'].length, 0);
    assert.equal(ctx.events['freight:loss'].length, 0);
    assert.equal(ctx.events['economy:grantCredits'].length, 0);
    assert.equal(ctx.events['faction:repDelta'].length, 0);
    assert.equal(ctx.events['entity:killed'].length, 0);
    assert.equal(ctx.sim.registry.get('npcJobsRuntime').activeControlClaimCount(), 0,
      'the existing responder returns both borrowed jobs');
  } finally {
    ctx.sim.dispose();
  }
});

test('PQ-048.05: Continue rebinds the same active incident, handoff, hull, and manifest without duplicating a terminal effect', () => {
  const original = boot(SEED + 30, { withSave: true });
  let continued = null;
  try {
    const incident = beginAndDisable(original, 'continue');
    const incidentId = incident.incidentId;
    const handoffId = incident.handoffId;
    const manifest = structuredClone(original.hauler.data.cargoManifest);
    const haulerWorldRecordId = original.hauler.data.worldRecordId;
    const oldHaulerId = original.hauler.id;
    const envelope = original.sim.registry.get('save').serialize('disabled-hauler-continue');
    assert.equal(envelope.data.traffic.ceresDisabledHaulerIncident.incidentId, incidentId);
    assert.equal(envelope.data.traffic.ceresMinerHaulerHandoff.handoffId, handoffId);

    continued = createSimulation({
      seed: SEED + 30,
      systems: [
        lawSecurity,
        actions,
        combat,
        aftermathWrecks,
        surrenderRecovery,
        cargo,
        economy,
        factionPresence,
        world,
        factions,
        npcJobsRuntime,
        heat,
        traffic,
        save,
      ],
    });
    const events = Object.fromEntries(OBSERVED.map((event) => [event, []]));
    for (const event of OBSERVED) {
      continued.bus.on(event, (payload) => events[event].push(structuredClone(payload)));
    }
    assert.equal(continued.registry.get('save').loadEnvelope(
      JSON.parse(JSON.stringify(envelope)), 'disabled-hauler-continue',
    ), true);
    continued.state.mode = 'flight';
    let restored = continued.state.traffic.ceresDisabledHaulerIncident;
    let restoredHauler = continued.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.data && entity.data.worldRecordId === haulerWorldRecordId);
    assert.ok(restoredHauler);
    assert.notEqual(restoredHauler.id, oldHaulerId, 'Continue rematerializes the numeric hull id');
    assert.equal(restored.incidentId, incidentId);
    assert.equal(restored.handoffId, handoffId);
    assert.equal(restored.manifestId, manifest.manifestId);
    assert.equal(restoredHauler.data.cargoManifest.manifestId, manifest.manifestId);
    assert.deepEqual(restoredHauler.data.cargoManifest.lines, manifest.lines);
    assert.equal(continued.state.entityList.filter((entity) => entity && entity.alive !== false
      && entity.data && entity.data.worldRecordId === haulerWorldRecordId).length, 1,
    'world-record persistence rematerializes one exact hull rather than a persistent clone');

    continued.step(SIM_DT);
    continued.step(SIM_DT);
    let drive = driveRuntime(continued.state, restoredHauler);
    assert.equal(drive.effectiveDisabled, true,
      'Continue reapplies the exact combat packet, then waits for the combat transition');
    continued.state.player.targetId = restoredHauler.id;
    const player = continued.state.entities.get(continued.state.playerId);
    player.pos = { x: restoredHauler.pos.x - 80, z: restoredHauler.pos.z };
    const available = contactHailAvailability(continued.state);
    assert.equal(available.enabled, true);
    const offer = createContactHailOffer(continued.state, available, 'continue:steal', continued.state.simTime + 8);
    const response = createContactHailResponse(continued.state, offer, 'steal');
    continued.bus.emit('contactHail:response', response);
    assert.equal(restored.state, 'stolen');
    assert.equal(events['freight:loss'].length, 1);
    assert.equal(events['freight:loss'][0].manifestId, manifest.manifestId);
    assert.equal(events['economy:grantCredits'].length, 0);
    assert.equal(events['faction:repDelta'].length, 0);
    const terminalEnvelope = continued.registry.get('save').serialize('disabled-hauler-terminal');

    const reloaded = createSimulation({
      seed: SEED + 30,
      systems: [
        lawSecurity, actions, combat, aftermathWrecks, surrenderRecovery, cargo, economy,
        factionPresence, world, factions, npcJobsRuntime, heat, traffic, save,
      ],
    });
    try {
      const replayEvents = { losses: [], credits: [], reps: [] };
      reloaded.bus.on('freight:loss', (payload) => replayEvents.losses.push(payload));
      reloaded.bus.on('economy:grantCredits', (payload) => replayEvents.credits.push(payload));
      reloaded.bus.on('faction:repDelta', (payload) => replayEvents.reps.push(payload));
      assert.equal(reloaded.registry.get('save').loadEnvelope(
        JSON.parse(JSON.stringify(terminalEnvelope)), 'disabled-hauler-terminal',
      ), true);
      reloaded.state.mode = 'flight';
      const terminal = reloaded.state.traffic.ceresDisabledHaulerIncident;
      assert.equal(terminal.incidentId, incidentId);
      assert.equal(terminal.state, 'stolen');
      reloaded.runTicks(3, SIM_DT);
      assert.equal(replayEvents.losses.length, 0, 'terminal Continue does not replay the freight loss');
      assert.equal(replayEvents.credits.length, 0);
      assert.equal(replayEvents.reps.length, 0);
    } finally {
      reloaded.dispose();
    }
    drive = driveRuntime(continued.state, restoredHauler);
    assert.equal(drive.effectiveDisabled, true);
  } finally {
    if (continued) continued.dispose();
    original.sim.dispose();
  }
});

test('PQ-048.05: tampered incident manifests fail closed against the authoritative live 8u handoff on Continue', () => {
  const original = boot(SEED + 31, { withSave: true });
  try {
    const incident = beginAndDisable(original, 'tampered-continue');
    const haulerWorldRecordId = incident.haulerWorldRecordId;
    const envelope = original.sim.registry.get('save').serialize('disabled-hauler-tamper-source');
    const cases = [
      ['quantity', (saved) => {
        saved.manifest.lines[0].qty = 99;
        saved.manifest.totalQty = 99;
      }],
      ['line commodity', (saved) => { saved.manifest.lines[0].commodityId = 'cmdty_ore_copper'; }],
      ['custody identity', (saved) => { saved.manifest.custody.holderId = 'wr_convoy_forged_holder'; }],
      ['root lot identity', (saved) => {
        saved.manifest.lotSource.rootLotId = 'forged-root-lot';
        saved.manifest.custody.rootLotId = 'forged-root-lot';
      }],
    ];
    for (const [label, tamper] of cases) {
      const candidate = JSON.parse(JSON.stringify(envelope));
      tamper(candidate.data.traffic.ceresDisabledHaulerIncident);
      candidate.checksum = fnv1a(JSON.stringify(candidate.data));
      const continued = createSimulation({
        seed: SEED + 31,
        systems: [
          lawSecurity, actions, combat, aftermathWrecks, surrenderRecovery, cargo, economy,
          factionPresence, world, factions, npcJobsRuntime, heat, traffic, save,
        ],
      });
      try {
        const effects = { losses: [], pressure: [], credits: [], reps: [] };
        continued.bus.on('freight:loss', (payload) => effects.losses.push(payload));
        continued.bus.on('economy:applyTradePressure', (payload) => effects.pressure.push(payload));
        continued.bus.on('economy:grantCredits', (payload) => effects.credits.push(payload));
        continued.bus.on('faction:repDelta', (payload) => effects.reps.push(payload));
        assert.equal(continued.registry.get('save').loadEnvelope(candidate, `tampered-${label}`), true, label);
        continued.state.mode = 'flight';
        const restored = continued.state.traffic.ceresDisabledHaulerIncident;
        const hauler = continued.state.entityList.find((entity) => entity && entity.alive !== false
          && entity.data && entity.data.worldRecordId === haulerWorldRecordId);
        assert.ok(restored && hauler, `${label}: incident and authoritative hull restore`);
        assert.equal(hauler.data.cargoManifest.totalQty, 8, `${label}: live custody quantity stays authoritative`);
        assert.deepEqual(hauler.data.cargoManifest.lines,
          [{ commodityId: 'cmdty_ore_iron', qty: 8 }], `${label}: live line stays authoritative`);
        assert.equal(hauler.data.cargoManifest.custody.handoffId,
          continued.state.traffic.ceresMinerHaulerHandoff.handoffId, `${label}: live custody remains bound`);

        const player = continued.state.entities.get(continued.state.playerId);
        player.pos = { x: hauler.pos.x - 80, z: hauler.pos.z };
        continued.state.player.targetId = hauler.id;
        const availability = contactHailAvailability(continued.state);
        assert.equal(availability.disabledHauler, null, `${label}: no recovery hail truth`);
        assert.equal(targetIntelReadout(hauler, player, continued.state, 80).recoveryPrompt, null,
          `${label}: no RECOVER/STEAL/ABANDON target readout`);
        for (const choice of ['recover', 'steal', 'abandon']) {
          continued.bus.emit('contactHail:response', { targetId: hauler.id, choice });
        }
        continued.bus.emit('freight:recovery', {
          manifestId: restored.manifestId,
          recoveryId: `civilian-recovery:${restored.manifestId}:forged`,
        });
        continued.bus.emit('freight:recoveryAbandoned', {
          manifestId: restored.manifestId,
          outcome: 'sector_exit',
        });
        assert.equal(restored.choice, null, `${label}: no action accepted`);
        assert.equal(continued.state.entityList.filter((entity) => entity && entity.data
          && entity.data.ceresDisabledHaulerPickup).length, 0, `${label}: no cargo minted`);
        assert.deepEqual(effects, { losses: [], pressure: [], credits: [], reps: [] },
          `${label}: no terminal or reward writer fires`);
        assert.equal(hauler.data.cargoManifest.totalQty, 8, `${label}: attempts preserve 8u custody`);
      } finally {
        continued.dispose();
      }
    }
  } finally {
    original.sim.dispose();
  }
});
