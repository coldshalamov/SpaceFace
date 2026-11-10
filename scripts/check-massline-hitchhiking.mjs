#!/usr/bin/env node
// Behavioral acceptance for MASSLINE Physics Identity §5.1 (traffic hitchhiking).

import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { SECTORS } from '../src/data/sectors.js';
import { traffic } from '../src/systems/traffic.js';
import { onboarding } from '../src/systems/onboarding.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';

const HELIOS_ID = 'sector_helios_prime';
const HELIOS = SECTORS.find((sector) => sector.id === HELIOS_ID);
assert(HELIOS, 'Helios sector fixture exists');

const savedFlags = {
  enabled: MASSLINE2_FLAGS.enabled,
  hitchhiking: MASSLINE2_FLAGS.hitchhiking,
  throw: MASSLINE2_FLAGS.throw,
  jettisonImpulse: MASSLINE2_FLAGS.jettisonImpulse,
};

function boot({ seed = 47, hitchhiking = true, withTraffic = true } = {}) {
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.hitchhiking = hitchhiking;
  MASSLINE2_FLAGS.throw = false;
  const sim = createSimulation({ seed, systems: withTraffic ? [traffic, onboarding] : [onboarding] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS_ID;
  state.onboarding = { active: false, finished: true };
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  // One-shot tutorial hints ride hud:firstUse (verbId + text), not toast — capture both.
  const firstUse = [];
  bus.on('hud:firstUse', (payload) => firstUse.push(payload));

  const stationA = sim.spawn({
    type: 'station', team: 2, pos: { x: 600, z: 0 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  const stationB = sim.spawn({
    type: 'station', team: 2, pos: { x: -600, z: 0 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_coalition', name: 'Coalition Yard' },
  });
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    team: 0, isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  if (withTraffic) {
    bus.emit('sector:enter', { sectorId: HELIOS_ID, sector: HELIOS });
    // Ambient traffic planning is phase-gated (AMBIENT_ACTIVE_PERIOD 2): one tick can land on the
    // express's off phase and leave data.intent null. Three ticks cover every phase slot.
    sim.runTicks(3);
  }
  return { sim, state, bus, toasts, firstUse, player, stationA, stationB };
}

function expressOf(state) {
  const rec = (state.traffic.freighters || []).find((item) => item.role === 'express');
  return rec ? { rec, entity: state.entities.get(rec.id) } : null;
}

try {
  // Flag-on default play: a core route always exposes one rare, readable express hitch target.
  const live = boot({ hitchhiking: true });
  const express = expressOf(live.state);
  assert(express && express.entity && express.entity.alive, 'Helios exposes an express traffic role');
  assert.equal(express.entity.team, 2, 'express remains neutral team 2');
  assert.equal(express.entity.data.ai.passive, true, 'express remains passive traffic');
  assert.equal(express.entity.data.ai.spawnContext, 'convoy_civilian', 'express is civilian, not an enemy power');
  assert.equal(express.entity.data.intent.moveZ, 1, 'express follows the ordinary V3 forward-intent path');
  assert.equal(express.entity.data.intent.boost, true, 'express requests live V3 NPC boost in transit');

  const expressProfile = resolvePropulsionProfile(express.entity, live.state);
  const starterProfile = resolvePropulsionProfile(live.player, live.state);
  const expressEnvelope = expressProfile.combatSpeed * expressProfile.boostSpeedMult;
  assert(expressEnvelope > starterProfile.combatSpeed,
    `express boost envelope ${expressEnvelope} exceeds starter cruise ${starterProfile.combatSpeed}`);

  const itinerary = express.entity.data.itinerary;
  assert(itinerary && itinerary.kind === 'express_hitch_route', 'express carries a typed route itinerary');
  assert.equal(itinerary.hitchable, true, 'itinerary explicitly advertises hitching');
  assert(itinerary.routeId && itinerary.originStationId && itinerary.destinationStationId,
    'itinerary exposes a stable route with endpoints');
  // The one scheduled express can wear a named-contact callsign (Cinder Run Courier) — either
  // face still visibly identifies the express service to the player.
  if (!express.entity.data.namedLaneContactId) {
    assert.match(express.entity.data.trafficLabel, /EXPRESS|LINER/i, 'target label visibly identifies express service');
  } else {
    assert.ok(express.entity.data.trafficLabel, 'named express carries her callsign on the lane');
  }
  assert.match(express.entity.data.scanLabel, /HITCH/i, 'scanner label teaches the hitch affordance');
  assert(express.rec.manifest && express.rec.manifest.lines.length > 0,
    'express remains embodied freight rather than a decorative route-only ship');

  // Durable record capture/rematerialize keeps the role, label, and route contract.
  const captured = captureEntityRecord(express.entity, {
    seed: live.state.meta.seed,
    sectorId: HELIOS_ID,
    tick: live.state.tick,
  });
  const rematerialized = spawnSpecFromRecord(captured);
  assert.equal(rematerialized.data.trafficRole, 'express', 'express role survives rematerialize');
  assert.equal(rematerialized.data.trafficLabel, express.entity.data.trafficLabel,
    'express label survives rematerialize');
  assert.deepEqual(rematerialized.data.itinerary, itinerary, 'hitch route metadata survives rematerialize');

  // The contextual lesson fires only for the express target, and once per save.
  const ordinary = (live.state.traffic.freighters || []).find((item) => item.role !== 'express');
  assert(ordinary, 'ordinary traffic fixture exists beside express role');
  live.bus.emit('tether:latched', { targetId: ordinary.id });
  assert.equal(live.state.player.hints.masslineHitchhiking, undefined,
    'ordinary traffic latch does not consume the hitch lesson');
  live.bus.emit('tether:latched', { targetId: express.entity.id });
  assert.equal(live.state.player.hints.masslineHitchhiking, true, 'express latch records one-shot hitch lesson');
  const hitchLessons = live.firstUse.filter((hint) => hint.verbId === 'masslineHitchhiking');
  assert.equal(hitchLessons.length, 1, 'express latch emits one terse hitch lesson');
  live.bus.emit('tether:latched', { targetId: express.entity.id });
  assert.equal(live.firstUse.filter((hint) => hint.verbId === 'masslineHitchhiking').length, 1,
    'repeat latches do not repeat the lesson');

  // The express latch owns the hitch lesson; the retired first-latch 'masslineThrow' bark (INF-062)
  // must stay dead, and an ordinary follow-up latch emits no hitch repeat. Other once-per-profile
  // lessons (e.g. masslineBrace on a heavy hull) may share the event — each is its own lesson.
  {
    const h = boot({ hitchhiking: true });
    MASSLINE2_FLAGS.throw = true;
    const ex = expressOf(h.state);
    const normal = h.state.traffic.freighters.find((item) => item.role !== 'express');
    h.bus.emit('tether:latched', { targetId: ex.entity.id });
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineHitchhiking').length, 1,
      'first express latch emits the hitch voice once');
    assert.equal(h.state.player.hints.masslineThrow, undefined, 'no retired throw bark on any latch');
    h.bus.emit('tether:latched', { targetId: normal.id });
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineHitchhiking').length, 1,
      'ordinary follow-up latch does not repeat the hitch lesson');
  }

  // Same seed => same reachable service and route metadata.
  const repeat = boot({ hitchhiking: true });
  const repeatExpress = expressOf(repeat.state);
  assert(repeatExpress, 'repeat boot exposes express traffic');
  assert.equal(repeatExpress.entity.data.worldRecordId, express.entity.data.worldRecordId,
    'express durable identity is deterministic');
  assert.deepEqual(repeatExpress.entity.data.itinerary, itinerary, 'express route is deterministic');

  // Flag-off is inert at call time: ambient picks mint no express, the authored courier still
  // sails as an ordinary named courier (her presence is fiction, not the mechanic), and no hull
  // carries the hitch affordance, boosted transit, or hint.
  const dark = boot({ hitchhiking: false });
  const ambientExpress = (dark.state.traffic.freighters || [])
    .filter((item) => item.role === 'express')
    .map((item) => ({ rec: item, entity: dark.state.entities.get(item.id) }));
  assert.ok(ambientExpress.length <= 1, 'flag-off traffic mix has at most the authored courier');
  for (const { entity } of ambientExpress) {
    assert.notEqual(entity.data.hitchable, true, 'flag-off express carries no hitchable mark');
    assert.notEqual(entity.data.itinerary && entity.data.itinerary.kind, 'express_hitch_route',
      'flag-off express carries no hitch route itinerary');
    assert.doesNotMatch(String(entity.data.scanLabel || ''), /HITCH/i,
      'flag-off express label does not advertise hitching');
  }
  const fallback = dark.state.traffic.freighters[0];
  const fallbackEntity = dark.state.entities.get(fallback.id);
  fallback.role = 'express';
  fallbackEntity.data.trafficRole = 'express';
  fallbackEntity.data.itinerary = itinerary;
  dark.sim.runTicks(3);
  assert.equal(fallbackEntity.data.intent.boost, false, 'flag-off saved express uses ordinary non-boost transit');
  dark.bus.emit('tether:latched', { targetId: fallbackEntity.id });
  assert.equal(dark.state.player.hints.masslineHitchhiking, undefined, 'flag-off express latch has no hint');

  // INF-062 — the latch lesson is taught by failure, not by the retired first-latch bark:
  // three consecutive genuine latch denials earn ONE contextual hint naming the block, a
  // clean latch resets the streak, player.hints keeps it once-only, and the flag gates it.
  {
    const h = boot({ withTraffic: false });
    MASSLINE2_FLAGS.throw = true;
    h.bus.emit('tether:latchDenied', { reason: 'protected' });
    h.bus.emit('tether:latchDenied', { reason: 'protected' });
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineLatchDenied').length, 0,
      'two denials stay silent');
    h.bus.emit('tether:latchDenied', { reason: 'protected' });
    const denialLessons = h.firstUse.filter((hint) => hint.verbId === 'masslineLatchDenied');
    assert.equal(denialLessons.length, 1, 'third consecutive denial earns the latch lesson');
    assert.match(String(denialLessons[0].text || ''), /protected|latch something else/i,
      'denial lesson names the real block');
    assert.equal(h.state.player.hints.masslineLatchDenied, true, 'denial lesson persists once-only');
    h.bus.emit('tether:latchDenied', { reason: 'protected' });
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineLatchDenied').length, 1,
      'repeat denials do not repeat the lesson');
  }
  {
    const h = boot({ withTraffic: false });
    MASSLINE2_FLAGS.throw = true;
    h.bus.emit('tether:latchDenied', { reason: 'cooldown' });
    h.bus.emit('tether:latchDenied', { reason: 'cooldown' });
    h.bus.emit('tether:latched', { targetId: h.stationA.id });
    h.bus.emit('tether:latchDenied', { reason: 'cooldown' });
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineLatchDenied').length, 0,
      'a clean latch resets the denial streak');
  }
  {
    const h = boot({ withTraffic: false });
    for (let i = 0; i < 4; i++) h.bus.emit('tether:latchDenied', { reason: 'blocked' });
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineLatchDenied').length, 0,
      'flag-off latch denials earn no lesson');
  }

  // Advanced physics verbs each get one terse, flag-gated, persistent lesson.
  {
    const h = boot({ withTraffic: false });
    MASSLINE2_FLAGS.throw = true;
    MASSLINE2_FLAGS.jettisonImpulse = true;
    h.bus.emit('massline:selfSling', { anchorId: 77, bonusDv: 32 });
    h.bus.emit('massline:selfSling', { anchorId: 77, bonusDv: 32 });
    // TEACH-01 — the drop-kick lesson must be earned at cruise speed: a parked dump teaches
    // nothing about reaction mass and cannot spend the once-per-profile line.
    h.bus.emit('cargo:jettisoned', { commodityId: 'ore_iron', qty: 2 });
    assert.equal(h.state.player.hints.masslineJettisonImpulse, undefined,
      'parked jettison does not spend the lesson');
    const playerEntity = h.state.entities.get(h.state.playerId);
    playerEntity.vel.x = 120; // above DROP_KICK_CRUISE_SPEED (95)
    h.bus.emit('cargo:jettisoned', { commodityId: 'ore_iron', qty: 2 });
    h.bus.emit('cargo:jettisoned', { commodityId: 'ore_iron', qty: 2 });
    assert.equal(h.state.player.hints.masslineSelfSling, true, 'self-sling lesson persists after first event');
    assert.equal(h.state.player.hints.masslineJettisonImpulse, true, 'jettison-impulse lesson persists after first event');
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineSelfSling').length, 1,
      'self-sling event emits one lesson');
    assert.equal(h.firstUse.filter((hint) => hint.verbId === 'masslineJettisonImpulse').length, 1,
      'jettison event emits one lesson');
  }
  {
    const h = boot({ withTraffic: false });
    MASSLINE2_FLAGS.throw = false;
    MASSLINE2_FLAGS.jettisonImpulse = false;
    h.bus.emit('massline:selfSling', {});
    h.bus.emit('cargo:jettisoned', {});
    assert.equal(h.state.player.hints.masslineSelfSling, undefined, 'flag-off self-sling stays silent');
    assert.equal(h.state.player.hints.masslineJettisonImpulse, undefined, 'flag-off jettison stays silent');
  }

  console.log('[check-massline-hitchhiking] PASS — express route is fast, neutral, durable, deterministic, flag-safe, and taught once');
} finally {
  MASSLINE2_FLAGS.enabled = savedFlags.enabled;
  MASSLINE2_FLAGS.hitchhiking = savedFlags.hitchhiking;
  MASSLINE2_FLAGS.throw = savedFlags.throw;
  MASSLINE2_FLAGS.jettisonImpulse = savedFlags.jettisonImpulse;
}
