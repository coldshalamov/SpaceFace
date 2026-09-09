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
    sim.runTicks(1);
  }
  return { sim, state, bus, toasts, player, stationA, stationB };
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
  assert.match(express.entity.data.trafficLabel, /EXPRESS|LINER/i, 'target label visibly identifies express service');
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
  const hitchToasts = live.toasts.filter((toast) => /express|liner|hitch/i.test(String(toast.text || '')));
  assert.equal(hitchToasts.length, 1, 'express latch emits one terse hitch lesson');
  live.bus.emit('tether:latched', { targetId: express.entity.id });
  assert.equal(live.toasts.filter((toast) => /express|liner|hitch/i.test(String(toast.text || ''))).length, 1,
    'repeat latches do not repeat the lesson');

  // One event cannot spend two tutorial voices: express owns its first latch, then the general
  // throw lesson remains available for the next ordinary massline target.
  {
    const h = boot({ hitchhiking: true });
    MASSLINE2_FLAGS.throw = true;
    const ex = expressOf(h.state);
    const normal = h.state.traffic.freighters.find((item) => item.role !== 'express');
    h.bus.emit('tether:latched', { targetId: ex.entity.id });
    assert.equal(h.toasts.length, 1, 'first express latch emits one tutorial voice');
    assert.equal(h.state.player.hints.masslineThrow, undefined, 'express latch leaves general throw lesson available');
    h.bus.emit('tether:latched', { targetId: normal.id });
    assert.equal(h.state.player.hints.masslineThrow, true, 'ordinary follow-up latch teaches throwing');
    assert.equal(h.toasts.length, 2, 'ordinary follow-up adds exactly one voice');
  }

  // Same seed => same reachable service and route metadata.
  const repeat = boot({ hitchhiking: true });
  const repeatExpress = expressOf(repeat.state);
  assert(repeatExpress, 'repeat boot exposes express traffic');
  assert.equal(repeatExpress.entity.data.worldRecordId, express.entity.data.worldRecordId,
    'express durable identity is deterministic');
  assert.deepEqual(repeatExpress.entity.data.itinerary, itinerary, 'express route is deterministic');

  // Flag-off is inert at call time: no express spawn, no boosted saved express, no hint.
  const dark = boot({ hitchhiking: false });
  assert.equal(expressOf(dark.state), null, 'flag-off traffic mix has no express role');
  const fallback = dark.state.traffic.freighters[0];
  const fallbackEntity = dark.state.entities.get(fallback.id);
  fallback.role = 'express';
  fallbackEntity.data.trafficRole = 'express';
  fallbackEntity.data.itinerary = itinerary;
  dark.sim.runTicks(1);
  assert.equal(fallbackEntity.data.intent.boost, false, 'flag-off saved express uses ordinary non-boost transit');
  dark.bus.emit('tether:latched', { targetId: fallbackEntity.id });
  assert.equal(dark.state.player.hints.masslineHitchhiking, undefined, 'flag-off express latch has no hint');

  // Throw lesson must match all three player-facing assist modes.
  const throwCopies = {
    arm: /hold right mouse.*white diamond/i,
    snap: /tap right mouse.*white diamond/i,
    off: /tap right mouse.*current vector/i,
  };
  for (const [mode, pattern] of Object.entries(throwCopies)) {
    const h = boot({ withTraffic: false });
    MASSLINE2_FLAGS.throw = true;
    h.state.settings.gameplay.masslineReleaseAssist = mode;
    h.bus.emit('tether:latched', { targetId: h.stationA.id });
    const copy = h.toasts.map((toast) => toast.text).find((text) => /right mouse/i.test(String(text || '')));
    assert.match(String(copy || ''), pattern, `${mode} release-assist hint describes its real input semantics`);
  }

  // Advanced physics verbs each get one terse, flag-gated, persistent lesson.
  {
    const h = boot({ withTraffic: false });
    MASSLINE2_FLAGS.throw = true;
    MASSLINE2_FLAGS.jettisonImpulse = true;
    h.bus.emit('massline:selfSling', { anchorId: 77, bonusDv: 32 });
    h.bus.emit('massline:selfSling', { anchorId: 77, bonusDv: 32 });
    h.bus.emit('cargo:jettisoned', { commodityId: 'ore_iron', qty: 2 });
    h.bus.emit('cargo:jettisoned', { commodityId: 'ore_iron', qty: 2 });
    assert.equal(h.state.player.hints.masslineSelfSling, true, 'self-sling lesson persists after first event');
    assert.equal(h.state.player.hints.masslineJettisonImpulse, true, 'jettison-impulse lesson persists after first event');
    assert.equal(h.toasts.filter((toast) => /anchor.*momentum|slingshot/i.test(String(toast.text || ''))).length, 1,
      'self-sling event emits one lesson');
    assert.equal(h.toasts.filter((toast) => /reaction mass|jettison.*push/i.test(String(toast.text || ''))).length, 1,
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
