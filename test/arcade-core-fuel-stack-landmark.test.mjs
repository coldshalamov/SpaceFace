import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { FUEL_STACK } from '../src/data/fuelStackLandmark.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { save } from '../src/save/saveSystem.js';
import { combat } from '../src/systems/combat.js';
import { economy, SERVICE_PRICES } from '../src/systems/economy.js';
import { fuelStack } from '../src/systems/fuelStack.js';
import { world } from '../src/systems/world.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';
import { serviceQuote } from '../src/ui/screens/services.js';

// Intent: prove the ordinary Helios route exposes one physical Fuel Stack whose paid rumor resolves
// on arrival, whose cheaper fuel still crosses Economy's sole-writer path, and whose player-triggered
// cage loss becomes a real bounded SG-02 impulse cascade that Continue cannot remint.

const DT = 1 / 60;

function playerSpec() {
  return {
    type: 'ship', team: 0, factionId: 'player', collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 7, mass: 34, hull: 300, hullMax: 300,
    physicsBody: {
      schemaVersion: 1, radius: 7, mass: 34, inertiaY: 420,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    flags: { persistent: true },
    data: { kind: 'player', isPlayer: true },
  };
}

async function boot(seed = 0x25f5, realPhysics = false) {
  const systems = realPhysics
    ? [economy, world, physics, combat, fuelStack, save]
    : [economy, world, combat, fuelStack, save];
  const updateOrder = realPhysics
    ? [physics, combat, economy, world, fuelStack]
    : [combat, economy, world, fuelStack];
  const sim = createSimulation({ seed, systems, updateOrder });
  const worldOwner = sim.registry.get('world');
  const fuelOwner = sim.registry.get('fuelStack');
  worldOwner.newGame();
  fuelOwner.newGame();
  const player = sim.spawn(playerSpec());
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.ui.docked = false;
  sim.state.input.actions = {};
  sim.state.player.credits = 2_000;
  if (realPhysics) {
    sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await sim.registry.get('physics').prepareBackend(sim.state), true,
      'the shipped Rapier owner starts for the pressure event');
  }
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    player,
    world: worldOwner,
    fuelStack: fuelOwner,
    economy: sim.registry.get('economy'),
    save: sim.registry.get('save'),
    cleanup() {
      const owner = sim.registry.get('physics');
      owner?._disableSg02DynamicAuthority?.();
      sim.dispose();
    },
  };
}

function liveStation(state) {
  return (state.entityList || []).find((entity) => entity && entity.alive !== false
    && entity.type === 'station' && entity.data?.stationId === FUEL_STACK.stationId);
}

function liveComponents(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.data?.fuelStackLandmarkId === FUEL_STACK.id
    && Number.isInteger(entity.data.fuelStackComponentSlot));
}

function liveRuptureDebris(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.data?.kind === 'fuel_stack_rupture_debris');
}

test('Fuel Stack is charted, physically reached from its rumor, and sells the literal cheap berth rate', async () => {
  const route = await boot();
  try {
    const sector = SECTORS.find((entry) => entry.id === FUEL_STACK.sectorId);
    const catalog = sector?.stations.find((entry) => entry.id === FUEL_STACK.stationId);
    assert.ok(catalog && catalog.landmark === true && catalog.services.includes(FUEL_STACK.serviceId));
    assert.equal(buildSystemModel(route.state, FUEL_STACK.sectorId).points
      .some((point) => point.stationId === FUEL_STACK.stationId), true,
    'the ordinary system chart carries the named berth before physical arrival');
    assert.equal(Object.hasOwn(route.save.serialize('plan25-pristine').data, 'fuelStack'), false,
      'an untouched landmark adds no empty state to unrelated scenario/save hashes');

    const offer = frontierRumorOffer(route.state, FUEL_STACK.sourceStationId);
    assert.equal(offer?.id, FUEL_STACK.rumorId);
    assert.equal(offer?.targetId, FUEL_STACK.stationId);
    assert.equal(offer?.targetPlaceKind, 'station');
    assert.match(offer?.text || '', /cheap gas|flame-vent|pressure ring/i);
    route.bus.emit('ui:purchaseFrontierRumor', {
      rumorId: offer.id,
      stationId: FUEL_STACK.sourceStationId,
    });
    assert.equal(route.state.world.frontierRumors.byId[FUEL_STACK.rumorId]?.phase, 'rumored');

    route.world.enterSector(FUEL_STACK.sectorId, { placePlayer: false });
    const station = liveStation(route.state);
    assert.ok(station && station.collides === true && station.data.archetypeGlb === 'place_station_refinery');
    assert.equal(liveComponents(route.state).length, FUEL_STACK.components.length);
    assert.ok(liveComponents(route.state).every((component) => component.type === 'heavyPart'
      && component.collides === true && component.data.heavyPartState === 'mounted'
      && component.data.deathCookOff?.provenance === FUEL_STACK.cookOff.provenance),
    'four destructible flame cages are real combat components, not a station receipt');

    route.player.pos.set(station.pos.x + 220, 0, station.pos.z);
    route.sim.step(DT);
    assert.equal(route.state.fuelStack.discovered, true);
    assert.equal(route.state.world.frontierRumors.byId[FUEL_STACK.rumorId].phase, 'resolved');

    route.state.fuel = { current: 40, max: 100 };
    route.state.player.credits = 1_000;
    route.state.ui.docked = true;
    route.state.ui.dockedStationId = FUEL_STACK.stationId;
    route.bus.emit('dock:docked', { stationId: FUEL_STACK.stationId, shipId: route.player.id });
    const quote = serviceQuote(FUEL_STACK.serviceId, route.state, route.player);
    assert.equal(SERVICE_PRICES.fuelStackCrPerUnit, 2);
    assert.equal(quote.amount, 60);
    assert.equal(quote.cost, 120);
    assert.equal(quote.cost < 60 * SERVICE_PRICES.fuelCrPerUnit, true,
      'the landmark rate is materially cheaper than an ordinary berth');
    route.bus.emit('ui:service', { type: FUEL_STACK.serviceId, amount: quote.amount });
    assert.equal(route.state.fuel.current, 100);
    assert.equal(route.state.player.credits, 880);
    assert.equal(route.state.fuelStack.fuelPurchasedUnits, 60);
  } finally {
    route.cleanup();
  }
});

test('shooting one cage walks four real pressure pulses through Rapier and Continue keeps the stack spent', async () => {
  const route = await boot(0x25f6, true);
  try {
    route.world.enterSector(FUEL_STACK.sectorId, { placePlayer: false });
    const first = liveComponents(route.state)[0];
    route.player.pos.set(first.pos.x + 44, 0, first.pos.z);
    route.player.vel.set(0, 0, 0);
    route.sim.step(DT);

    const blastReceipts = [];
    const pulses = [];
    route.bus.on('fuelStack:blown', (receipt) => blastReceipts.push(receipt));
    route.bus.on('combat:emberCookOff', (receipt) => {
      if (receipt.provenance === FUEL_STACK.cookOff.provenance) pulses.push(receipt);
    });
    const velocityBefore = Math.hypot(route.player.vel.x, route.player.vel.z);
    const damage = route.sim.registry.get('combat').onHit({
      targetId: first.id,
      ownerId: route.player.id,
      damage: FUEL_STACK.componentHull * 4,
      damageType: 'explosive',
      pos: { x: first.pos.x, z: first.pos.z },
      weaponId: 'wpn_railgun_m',
      origin: { kind: 'weapon', id: 'wpn_railgun_m', weaponId: 'wpn_railgun_m' },
    });
    assert.equal(damage?.ok, true, 'player fire crosses Combat instead of a test-only detonation hook');
    route.sim.step(DT);
    assert.equal(route.state.fuelStack.blown, true);
    assert.equal(pulses.length, FUEL_STACK.components.length,
      'one cage loss walks the authored four-component pressure ring exactly once');
    assert.equal(blastReceipts.length, 1);
    assert.equal(blastReceipts[0].pulseCount, FUEL_STACK.components.length);
    assert.equal(liveComponents(route.state).length, 0);
    assert.equal(liveRuptureDebris(route.state).length, FUEL_STACK.debrisCount);
    assert.ok(liveRuptureDebris(route.state).every((entity) => entity.physicsBody?.dynamic === true),
      'the cascade leaves ordinary dynamic wreck bodies for the impulses to throw');

    route.sim.step(DT);
    const velocityAfter = Math.hypot(route.player.vel.x, route.player.vel.z);
    assert.ok(velocityAfter > velocityBefore + 1,
      `the live player body must move, before=${velocityBefore} after=${velocityAfter}`);
    assert.ok(route.state.fuelStack.lastBlastAffected >= 1,
      'the aggregate receipt records at least one SG-02-accepted physical body');

    const envelope = route.save.serialize('plan25-fuel-stack');
    assert.equal(envelope.data.fuelStack.blown, true);
    assert.equal(route.save.loadEnvelope(structuredClone(envelope), 'plan25-fuel-stack'), true);
    assert.equal(route.state.fuelStack.blown, true);
    assert.equal(liveComponents(route.state).length, 0,
      'Continue restores the spent state before sector entry can remint a flame cage');
    assert.equal(serviceQuote(FUEL_STACK.serviceId, route.state, route.player).disabledReason, 'stack offline');
    const fuelBefore = route.state.fuel.current;
    const creditsBefore = route.state.player.credits;
    route.state.ui.docked = true;
    route.state.ui.dockedStationId = FUEL_STACK.stationId;
    route.bus.emit('dock:docked', { stationId: FUEL_STACK.stationId, shipId: route.state.playerId });
    route.bus.emit('ui:service', { type: FUEL_STACK.serviceId, amount: 20 });
    assert.equal(route.state.fuel.current, fuelBefore);
    assert.equal(route.state.player.credits, creditsBefore,
      'the destroyed stack cannot keep selling through stale UI or a forged service event');
  } finally {
    route.cleanup();
  }
});
