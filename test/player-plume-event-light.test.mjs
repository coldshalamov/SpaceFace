import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { EVENT_LIGHT_POOL_SIZE, vfx } from '../src/render/vfx.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';
import { EventLightPool } from '../src/render/thruster/systems/eventLight.js';
import { resolveVfxAccessibilityProfile } from '../src/render/vfxAccessibility.js';

const DT = 1 / 60;
const PLAYER_ID = 11;
const NPC_ID = 22;
const PLAYER_PLUME_KEY = 'player-plume';

function near(actual, expected, epsilon = 1e-6, message = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${message || 'values differ'}: ${actual} vs ${expected}`);
}

function ship(id, {
  x = 0,
  z = 0,
  rot = 0,
  throttle = 0,
  boosting = false,
  isPlayer = false,
} = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot,
    radius: 4,
    maxSpeed: 120,
    flags: { boosting },
    data: { defId: 'ship_kestrel' },
    _flightFrame: { throttle, maxSpeed: 120 },
    ...(isPlayer ? { presentation: {} } : null),
  };
}

function makeHarness({
  playerThrottle = 0.62,
  playerBoost = false,
  npcThrottle = 1,
  npcBoost = true,
  motionReduce = false,
  flashReduce = false,
} = {}) {
  const scene = new THREE.Scene();
  const player = ship(PLAYER_ID, {
    x: 120,
    z: -45,
    rot: 0.35,
    throttle: playerThrottle,
    boosting: playerBoost,
    isPlayer: true,
  });
  const npc = ship(NPC_ID, {
    x: -360,
    z: 215,
    rot: -1.1,
    throttle: npcThrottle,
    boosting: npcBoost,
  });
  const entities = new Map([[PLAYER_ID, player], [NPC_ID, npc]]);
  const state = {
    playerId: PLAYER_ID,
    player: { cruise: { phase: 'idle' } },
    entities,
    entityList: [player, npc],
    input: { moveZ: playerThrottle, turnIntent: 0 },
    settings: {
      video: {
        particleQuality: 'medium',
        engineTrails: true,
        energyMaterials: false,
        motionReduce,
        bloom: false,
      },
      accessibility: { flashReduce },
    },
    // NPC sits ~546 WU from the player; the table draw radius at the default
    // 144 zoom is ~363 WU, so pin the harness to max-zoom to keep it admitted.
    camera: { zoom: 330 },
    render: { scene },
    combat: { attachments: { byId: {} } },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  system._initEnergy();
  return { system, state, bus, player, npc, scene };
}

function playerPlumeSlot(system) {
  return system._lights.find((slot) => slot.sustainedKey === PLAYER_PLUME_KEY) || null;
}

// The player hero light is driven by the plasma stream's own eventLightSource(),
// not the family plume's shared lights[0] (aggregate writes land there last).
// Mirrors the single application in vfx._syncPlayerPlasmaStreamLight.
function plasmaLightExpectation(src, system) {
  const a11y = resolveVfxAccessibilityProfile(system.state && system.state.settings);
  const peakScale = a11y && Number.isFinite(a11y.eventLightPeakScale)
    ? a11y.eventLightPeakScale : 1;
  const drive = Math.max(0, Math.min(1.4, src.drive || 0));
  const norm = Math.max(0, Math.min(1, (drive - 0.06) / 0.94));
  const boost = Math.max(0, Math.min(1, src.boost || 0));
  const flashGate = (system._productionThrusterA11y && system._productionThrusterA11y.reducedFlash)
    ? 0.25 : 1;
  const lightRamp = Number.isFinite(src.ramp) ? Math.max(0, Math.min(1, src.ramp)) : 1;
  return {
    intensity: Math.min(2.6,
      2.6 * (0.24 + 0.76 * norm) * (1 + boost * 0.28) * flashGate * peakScale * lightRamp),
    range: 10.5 * (0.5 + 0.5 * norm),
  };
}

function warmPlayerPlume(harness, frames = 90) {
  for (let i = 0; i < frames; i++) harness.system._updateEnergyPlume(DT);
  return playerPlumeSlot(harness.system);
}

test('main EventLightPool preserves bounded ordinary-to-boost headroom', () => {
  const pool = new EventLightPool(KESTREL_MAIN_PLUME_RECIPE, { maxLights: 4 });
  const nozzle = { x: 3, y: 1.5, z: -7 };
  const allocationCount = pool.allocationCount;

  const ordinaryResult = pool.updateMain(1, nozzle, 1, 0);
  const ordinary = { ...ordinaryResult.lights[0] };
  const boostedResult = pool.updateMain(1, nozzle, 1, 1);
  const boosted = { ...boostedResult.lights[0] };
  const reducedResult = pool.updateMain(1, nozzle, 0.25, 1);
  const reduced = { ...reducedResult.lights[0] };

  const maxIntensity = KESTREL_MAIN_PLUME_RECIPE.eventLight.maxIntensity;
  const maxRange = KESTREL_MAIN_PLUME_RECIPE.eventLight.maxRange;
  near(ordinary.intensity, maxIntensity / 1.35, 1e-9, 'ordinary headroom');
  near(boosted.intensity, maxIntensity, 1e-9, 'boost reaches authored cap');
  near(reduced.intensity, maxIntensity * 0.25, 1e-9, 'reduced flash applies once');
  assert.ok(ordinary.intensity < boosted.intensity);
  assert.ok(reduced.intensity < ordinary.intensity);
  assert.equal(ordinary.range, boosted.range, 'boost cannot enlarge the light radius');
  assert.ok(boosted.intensity <= maxIntensity && boosted.range <= maxRange);
  assert.ok(reduced.intensity <= maxIntensity && reduced.range <= maxRange);
  assert.equal(pool.allocationCount, allocationCount);
  assert.equal(pool.frameAllocations, 0);
});

test('live bridge samples only the retained exact player after the fleet frame', () => {
  const harness = makeHarness();
  const { system, player, npc, scene } = harness;
  const slot = warmPlayerPlume(harness);

  assert.ok(slot, 'active exact-player plume claims one sustained PointLight');
  assert.equal(scene.children.filter((child) => child.isPointLight).length, EVENT_LIGHT_POOL_SIZE);
  assert.equal(system._activeLightCount, 1);
  assert.equal(system._freeLightCount, EVENT_LIGHT_POOL_SIZE - 1);

  const fleet = system._energy.fleet;
  const playerRecord = fleet.findShip(player.id);
  const npcRecord = fleet.findShip(npc.id);
  assert.ok(playerRecord?.alive && playerRecord.isPlayer);
  assert.ok(npcRecord?.alive && !npcRecord.isPlayer);
  assert.ok(npcRecord.driveState.boostBlend > playerRecord.driveState.boostBlend + 0.5,
    'same-family NPC is deliberately the hotter aggregate contributor');

  // Player hero exhaust runs the unified plasma stream: its fleet record keeps zero continuous
  // sockets (RCS ownership only), so the light's source of truth is stream.eventLightSource().
  // The family plume's shared lights[0] carries the last aggregate write — the hotter NPC's.
  const src = system._energy.plasmaStream.eventLightSource();
  assert.ok(src && src.on === true, 'exact-player plasma source publishes a live light frame');
  assert.ok(npcRecord.socketCount >= 1, 'admitted NPC wrote real sockets into the family aggregate');
  const expected = plasmaLightExpectation(src, system);
  near(slot.obj.position.x, src.x, 1e-6, 'exact player nozzle x');
  near(slot.obj.position.y, src.y + 1.0, 1e-6, 'exact player nozzle y lifted to the hull deck');
  near(slot.obj.position.z, src.z, 1e-6, 'exact player nozzle z');
  near(slot.intensity, expected.intensity, 1e-9, 'pre-scaled source intensity copied once');
  near(slot.obj.distance, expected.range, 1e-9, 'bounded source range copied once');
  assert.ok(Math.abs(slot.obj.position.x - npcRecord.sockets[0].x) > 100,
    'NPC/family fallback nozzle cannot contaminate the player resident');

  const stableObject = slot.obj;
  const stableSerial = slot.admissionSerial;
  const stableFreeCount = system._freeLightCount;
  for (let i = 0; i < 240; i++) system._updateEnergyPlume(DT);
  const updated = playerPlumeSlot(system);
  assert.equal(updated.obj, stableObject);
  assert.equal(updated.admissionSerial, stableSerial, 'same-key writes cannot churn admission age');
  assert.equal(system._freeLightCount, stableFreeCount);
  assert.equal(system._activeLightCount, 1);
  assert.equal(system._energy.fleetDiag.frameAllocations, 0);

  system._disposeEnergy();
});

test('keyed plume resident shares the fixed six-light pool without transient eviction', () => {
  const harness = makeHarness();
  const { system, player } = harness;
  const plume = warmPlayerPlume(harness);
  assert.ok(plume);
  const plumeSlotIndex = plume.slot;
  const plumeSerial = plume.admissionSerial;

  for (let i = 0; i < EVENT_LIGHT_POOL_SIZE - 1; i++) {
    assert.equal(system._flashLight(
      { x: player.pos.x + i, z: player.pos.z }, '#ffffff', 2, 8, 80, 0.1,
    ), true);
  }
  assert.equal(system._freeLightCount, 0);
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  assert.equal(system._flashLight(player.pos, '#ff8844', 8, 8, 120, 0.95), true,
    'hero transient may evict a weaker transient');
  assert.equal(playerPlumeSlot(system)?.slot, plumeSlotIndex,
    'transient admission must never evict the keyed plume resident');
  assert.equal(playerPlumeSlot(system)?.admissionSerial, plumeSerial);

  system._releasePlayerPlumeEventLight();
  assert.equal(playerPlumeSlot(system), null);
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE - 1);
  assert.equal(system._freeLightCount, 1);
  assert.equal(system._lights[plumeSlotIndex].obj.intensity, 0);
  assert.equal(system._lights[plumeSlotIndex].active, false);
  system._releasePlayerPlumeEventLight();
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE - 1,
    'idempotent release cannot decrement twice');
  assert.equal(system._freeLightCount, 1, 'idempotent release cannot duplicate the free slot');

  assert.equal(system._flashLight(player.pos, '#ffffff', 3, 8, 90, 0.2), true);
  assert.equal(system._freeLightCount, 0);
  assert.equal(new Set(Array.from(system._freeLights.slice(0, system._freeLightCount))).size,
    system._freeLightCount);

  system._disposeEnergy();
});

test('accessibility and all presentation boundaries release or retain the steady cue truthfully', () => {
  const normal = makeHarness({ playerThrottle: 1, playerBoost: true });
  const normalSlot = warmPlayerPlume(normal);
  const normalIntensity = normalSlot.intensity;

  const reducedFlash = makeHarness({ playerThrottle: 1, playerBoost: true, flashReduce: true });
  const reducedFlashSlot = warmPlayerPlume(reducedFlash);
  assert.ok(reducedFlashSlot.intensity < normalIntensity * 0.4,
    'reduced-flash recipe remains materially dimmer without a second VFX scale');
  near(reducedFlashSlot.intensity,
    plasmaLightExpectation(
      reducedFlash.system._energy.plasmaStream.eventLightSource(),
      reducedFlash.system,
    ).intensity,
    1e-9, 'reduced source copied exactly once');

  const reducedMotion = makeHarness({ playerThrottle: 1, playerBoost: true, motionReduce: true });
  const reducedMotionSlot = warmPlayerPlume(reducedMotion);
  assert.ok(reducedMotionSlot && reducedMotionSlot.intensity > 0,
    'reduced motion retains the steady directional propulsion light');

  const boundaries = [
    ['sector:enter', {}],
    ['save:loaded', {}],
    ['game:newGame', {}],
  ];
  for (const [event, payload] of boundaries) {
    const harness = makeHarness({ playerThrottle: 1 });
    assert.ok(warmPlayerPlume(harness));
    harness.bus.emit(event, payload);
    assert.equal(playerPlumeSlot(harness.system), null, `${event} clears the resident`);
    assert.equal(harness.system._freeLightCount, EVENT_LIGHT_POOL_SIZE);
    harness.system._disposeEnergy();
  }

  const inactive = makeHarness({ playerThrottle: 1 });
  assert.ok(warmPlayerPlume(inactive));
  inactive.player.alive = false;
  inactive.system._updateEnergyPlume(DT);
  assert.equal(playerPlumeSlot(inactive.system), null, 'player loss clears the resident immediately');
  inactive.system._disposeEnergy();

  normal.system._disposeEnergy();
  reducedFlash.system._disposeEnergy();
  reducedMotion.system._disposeEnergy();
  assert.equal(playerPlumeSlot(normal.system), null);
  assert.equal(playerPlumeSlot(reducedFlash.system), null);
  assert.equal(playerPlumeSlot(reducedMotion.system), null);
});
