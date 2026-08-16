// PR95 Plan 19 — physical Ion Storm pocket acceptance.
//
// The route boots the production anomaly, Flight V3, Rapier, Combat, radar-jamming, and SaveSystem
// owners. It crosses the canonical Blind Nebula volume under ordinary thrust, observes Combat's
// exact shield-recharge delta, and Continues from inside without persisting or duplicating the
// transient environmental marker.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import {
  ION_STORM_POCKET,
  ionStormForSector,
} from '../src/data/anomalySites.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import {
  collectActiveRadarJammers,
  writeRadarJammedContactPosition,
} from '../src/presentation/radarJamming.js';
import { save } from '../src/save/saveSystem.js';
import {
  ION_STORM_LIGHTNING_CAPACITY,
} from '../src/render/anomalies/ionStorm.js';
import { vfx } from '../src/render/vfx.js';
import { anomalyRuntime } from '../src/systems/anomalyRuntime.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';

const STORM = ION_STORM_POCKET;

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalVolume() {
  const zone = (SECTOR_ZONES[STORM.sectorId] || [])
    .find((candidate) => candidate && candidate.id === STORM.zoneId);
  assert.ok(zone && zone.center && zone.radius > 0, 'canonical Blind Nebula zone exists');
  const center = sectorLocalToGlobalForSector(zone.center, STORM.sectorId);
  return { x: center.x, z: center.z, radius: zone.radius };
}

function liveMarkers(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'fx' && entity.data
    && entity.data.anomalyStableId === STORM.markerStableId);
}

async function boot(seed = 1901901, { dummyBeforePlayer = false } = {}) {
  const bus = createBus();
  const sim = createSimulation({
    seed,
    bus,
    systems: [anomalyRuntime, flightV3, physics, combat, save],
    updateOrder: [anomalyRuntime, flightV3, physics, combat, save],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = STORM.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.controls.flightMode = 'newtonian';
  state.input.actions = state.input.actions || {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  if (dummyBeforePlayer) {
    sim.spawn({
      type: 'fx', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, collides: false,
      flags: { persistent: false }, data: { kind: 'numeric-id-offset-control' },
    });
  }

  const volume = canonicalVolume();
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const spec = makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    player: state.player,
    fittings,
    pos: { x: volume.x - volume.radius - 150, z: volume.z },
    rot: 0,
  });
  spec.shield = 0;
  spec.shieldMax = 1000;
  spec.shieldRegenRate = 12;
  spec.shieldRegenDelay = 0;
  spec.lastDamageT = -1e9;
  spec.flags = { ...(spec.flags || {}), persistent: true };
  const player = sim.spawn(spec);
  state.playerId = player.id;

  const events = { lightning: [], rewards: [] };
  bus.on('anomaly:ionStormLightning', (payload) => events.lightning.push(deepCopy(payload)));
  for (const event of ['loot:drop', 'economy:grantCredits', 'lootShards:spawn']) {
    bus.on(event, (payload) => events.rewards.push({ event, payload: deepCopy(payload) }));
  }

  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true,
    'real rapier-dynamic authority starts');
  sim.runTicks(3);
  return { sim, bus, state, player, events, physicsOwner, volume };
}

function dispose(route) {
  if (route.physicsOwner && typeof route.physicsOwner._disableSg02DynamicAuthority === 'function') {
    route.physicsOwner._disableSg02DynamicAuthority();
  }
  route.sim.dispose();
}

function inside(volume, pos) {
  return Math.hypot(pos.x - volume.x, pos.z - volume.z) <= volume.radius;
}

test('one rare canonical marker drives the existing radar-jamming policy without rewards', async () => {
  const admitted = SECTORS.filter((sector) => ionStormForSector(sector.id));
  assert.deepEqual(admitted.map((sector) => sector.id), [STORM.sectorId]);
  assert.ok(admitted.length < SECTORS.length / 2, 'storm is a minority-sector anomaly');
  assert.equal(ionStormForSector('sector_helios_prime'), null);

  const route = await boot();
  try {
    const markers = liveMarkers(route.state);
    assert.equal(markers.length, 1, 'exactly one transient environmental marker materializes');
    const marker = markers[0];
    assert.equal(marker.collides, false);
    assert.equal(marker.flags.persistent, false);
    assert.equal(marker.data.anomalyStableId, STORM.markerStableId);
    assert.equal(marker.data.worldSiteTargetable, false);
    assert.equal(marker.data.noOrdinaryRewards, true);

    const contact = route.sim.spawn({
      type: 'wreck', team: 2, pos: { x: route.volume.x + 70, z: route.volume.z + 40 },
      vel: { x: 0, z: 0 }, radius: 4, collides: false,
      data: { kind: 'radar-contact-control' },
    });
    route.player.pos.set(route.volume.x - route.volume.radius * 0.55, 0, route.volume.z);
    route.player.prevPos.copy(route.player.pos);
    const sources = collectActiveRadarJammers(route.state.entityList, []);
    assert.equal(sources.includes(marker), true, 'existing radar owner admits the live storm marker');
    const jammed = writeRadarJammedContactPosition(
      {}, contact, route.player, sources, route.state.tick, false,
    );
    assert.equal(jammed.jammed, true);
    assert.equal(jammed.jammerId, STORM.markerStableId,
      'presentation hashes the stable environmental identity, not numeric spawn timing');
    assert.ok(Math.hypot(jammed.offsetX, jammed.offsetZ) > 0);
    assert.ok(Math.hypot(jammed.offsetX, jammed.offsetZ) <= STORM.radar.maxSmearWU + 1e-9);
    assert.deepEqual(route.events.rewards, [], 'observation produces no wallet/loot reward route');
  } finally {
    dispose(route);
  }
});

test('Combat alone applies the exact bounded shield-recharge delta inside the pocket', async () => {
  const route = await boot(1901902);
  try {
    route.state.input.moveZ = 0;
    route.player.vel.set(0, 0, 0);
    route.player.pos.set(route.volume.x - route.volume.radius - 40, 0, route.volume.z);
    route.player.prevPos.copy(route.player.pos);
    route.player.shield = 0;
    route.sim.runTicks(60);
    const outsideGain = route.player.shield;
    assert.ok(Math.abs(outsideGain - route.player.shieldRegenRate) < 1e-6,
      `outside recharge is the unmodified Combat rate (${outsideGain})`);

    route.player.vel.set(0, 0, 0);
    route.player.pos.set(route.volume.x, 0, route.volume.z);
    route.player.prevPos.copy(route.player.pos);
    route.player.shield = 0;
    route.sim.runTicks(60);
    const insideGain = route.player.shield;
    const expected = route.player.shieldRegenRate * STORM.shieldRechargeMultiplier;
    assert.ok(Math.abs(insideGain - expected) < 1e-6,
      `inside recharge is the authored Combat multiplier (${insideGain} vs ${expected})`);
    assert.equal(
      route.state.combatRuntime.diagnostics.playerShieldRechargeMultiplier,
      STORM.shieldRechargeMultiplier,
    );
  } finally {
    dispose(route);
  }
});

test('ordinary Flight V3 and Rapier cross the pocket, then Continue rematerializes one stable marker', async () => {
  const route = await boot(1901903);
  try {
    const start = { x: route.player.pos.x, z: route.player.pos.z };
    route.state.input.moveZ = 1;
    let enteredAt = -1;
    for (let tick = 0; tick < 720; tick++) {
      route.sim.step(SIM_DT);
      if (inside(route.volume, route.player.pos)) {
        enteredAt = tick;
        break;
      }
    }
    assert.ok(enteredAt >= 0, 'ordinary thrust carries the real player body into the pocket');
    assert.ok(route.player.pos.x > start.x + 100, 'the player advances materially through Rapier');
    assert.ok(route.player._flightFrame?.driveId,
      'production Flight V3 publishes the live propulsion frame during the crossing');
    assert.equal(readPhysicsTelemetry(route.player)?.dynamic, true,
      'Rapier publishes dynamic-body telemetry for the crossing player');
    assert.equal(await route.physicsOwner.prepareBackend(route.state), true,
      'the crossing remains owned by rapier-dynamic');

    route.state.input.moveZ = 0;
    for (let tick = 0; tick < 240 && route.events.lightning.length === 0; tick++) {
      route.sim.step(SIM_DT);
    }
    assert.ok(route.events.lightning.length > 0, 'production fixed-window lightning receipt fires inside');
    const firstReceipt = route.events.lightning[0];
    assert.equal(firstReceipt.markerStableId, STORM.markerStableId);

    const beforeContinue = {
      pos: { x: route.player.pos.x, z: route.player.pos.z },
      marker: {
        stableId: liveMarkers(route.state)[0].data.anomalyStableId,
        x: liveMarkers(route.state)[0].pos.x,
        z: liveMarkers(route.state)[0].pos.z,
      },
    };
    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan19-ion-storm');
    assert.equal(envelope.data.entities.persistent.some((entity) => entity.data
      && entity.data.anomalyStableId === STORM.markerStableId), false,
    'the environmental marker is transient, not serialized');
    assert.equal(saveOwner.loadEnvelope(deepCopy(envelope), 'plan19-ion-storm'), true,
      'real Continue succeeds from inside the pocket');
    const resumedPlayer = route.state.entities.get(route.state.playerId);
    assert.ok(resumedPlayer);
    assert.ok(Math.hypot(
      resumedPlayer.pos.x - beforeContinue.pos.x,
      resumedPlayer.pos.z - beforeContinue.pos.z,
    ) < 1e-9, 'Continue restores the same physical player payload inside the pocket');
    assert.equal(await route.physicsOwner.prepareBackend(route.state), true,
      'Continue re-establishes Rapier authority');
    route.sim.runTicks(2);

    assert.equal(liveMarkers(route.state).length, 1, 'Continue rematerializes one marker, not a duplicate');
    assert.deepEqual({
      stableId: liveMarkers(route.state)[0].data.anomalyStableId,
      x: liveMarkers(route.state)[0].pos.x,
      z: liveMarkers(route.state)[0].pos.z,
    }, beforeContinue.marker, 'stable marker identity and canonical pose survive Continue');

    route.state.world.currentSectorId = 'sector_helios_prime';
    route.sim.runTicks(2);
    assert.equal(liveMarkers(route.state).length, 0, 'leaving the sector tears down the transient marker');
    route.state.world.currentSectorId = STORM.sectorId;
    route.sim.runTicks(2);
    assert.equal(liveMarkers(route.state).length, 1, 're-entry rematerializes exactly one marker');
    assert.equal(liveMarkers(route.state)[0].data.anomalyStableId, STORM.markerStableId);
  } finally {
    dispose(route);
  }
});

test('same seed keeps storm smear and lightning stable when numeric entity ids differ', async () => {
  const a = await boot(1901904, { dummyBeforePlayer: false });
  const b = await boot(1901904, { dummyBeforePlayer: true });
  try {
    for (const route of [a, b]) {
      route.player.pos.set(route.volume.x, 0, route.volume.z);
      route.player.prevPos.copy(route.player.pos);
      route.player.vel.set(0, 0, 0);
      const contact = route.sim.spawn({
        type: 'wreck', pos: { x: route.volume.x + 100, z: route.volume.z + 80 },
        vel: { x: 0, z: 0 }, collides: false, data: { kind: 'stable-contact' },
      });
      contact.data.stableContactId = 'storm-contact-control';
      contact.id = 'storm-contact-control';
      const sources = collectActiveRadarJammers(route.state.entityList, []);
      route.smear = writeRadarJammedContactPosition({}, contact, route.player, sources, 180, false);
      for (let tick = 0; tick < 240 && route.events.lightning.length === 0; tick++) route.sim.step(SIM_DT);
    }
    assert.notEqual(liveMarkers(a.state)[0].id, liveMarkers(b.state)[0].id,
      'control actually changes timing-derived numeric ids');
    assert.deepEqual(a.smear, b.smear, 'stable source identity makes radar smear independent of numeric ids');
    assert.deepEqual(a.events.lightning[0], b.events.lightning[0],
      'same seed/window emits the same world-space lightning receipt');
  } finally {
    dispose(a);
    dispose(b);
  }
});

test('the production lightning receipt drives bounded hard LineSegments with reduced-flash adaptation', async () => {
  const route = await boot(1901905);
  const scene = new THREE.Scene();
  const renderBus = createBus();
  const renderState = {
    playerId: 1,
    player: {},
    entities: new Map(),
    entityList: [],
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene, frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
  };
  const renderSystem = Object.create(vfx);
  renderSystem.init({ state: renderState, bus: renderBus, helpers: {} });
  const presentation = renderSystem._ionStormLightning;
  try {
    route.player.pos.set(route.volume.x, 0, route.volume.z);
    route.player.prevPos.copy(route.player.pos);
    for (let tick = 0; tick < 240 && route.events.lightning.length === 0; tick++) route.sim.step(SIM_DT);
    const receipt = route.events.lightning[0];
    assert.ok(receipt, 'production anomalyRuntime emits the visual source receipt');
    renderBus.emit('anomaly:ionStormLightning', receipt);
    assert.equal(presentation.update(0.05), 1);
    assert.equal(scene.getObjectByName('IonStormLightningPool'), presentation.group);
    assert.equal(presentation.group.children.length, ION_STORM_LIGHTNING_CAPACITY * 2);
    assert.ok(presentation.group.children.every((child) => child.isLineSegments),
      'every visible channel is hard world-space line geometry');
    assert.ok(presentation.group.children.every((child) => child.isSprite !== true
      && child.isPoints !== true && child.material.transparent === false),
    'storm presentation owns no Sprite, Points, billboard, or alpha-card route');
    assert.ok(presentation.slots[0].coreGeometry.drawRange.count > 2,
      'the attack envelope grows real branch geometry rather than opacity');

    renderState.settings.accessibility.flashReduce = true;
    renderBus.emit('anomaly:ionStormLightning', receipt);
    presentation.update(0.05);
    const reducedSlot = presentation.slots[1];
    assert.equal(reducedSlot.reducedFlash, true);
    assert.ok(reducedSlot.attack > presentation.slots[0].attack,
      'reduced flash lengthens the attack instead of deleting the cue');
    assert.ok(reducedSlot.peak < presentation.slots[0].peak,
      'reduced flash lowers HDR peak energy');
    for (let i = 0; i < ION_STORM_LIGHTNING_CAPACITY * 3; i++) {
      presentation.strike({ ...receipt, sourceSeed: receipt.sourceSeed + i + 1 });
    }
    assert.equal(presentation.inspect().capacity, ION_STORM_LIGHTNING_CAPACITY);
    assert.ok(presentation.inspect().active <= ION_STORM_LIGHTNING_CAPACITY,
      'repeated storms reuse the fixed pool');
  } finally {
    renderSystem.destroy();
    dispose(route);
  }
});
