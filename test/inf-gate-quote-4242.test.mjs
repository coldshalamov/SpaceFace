// A plotted gate hop quotes no fuel and the three seconds the gate takes to open. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS } from '../src/data/sectors.js';
import { createGameState } from '../src/core/gameState.js';
import { world } from '../src/systems/world.js';
import {
  computeDiscoveredRoute,
  routeEdgeDist,
  DRIVE_TIERS,
  ROUTE_BASE_FUEL,
  ROUTE_GATE_CHARGE,
} from '../src/systems/routePlanner.js';
import { resolveRouteRibbon } from '../src/ui/map/mapRouteRibbon.js';

const SEED = 4242;
const BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function chartFrom(fromId) {
  const discovery = {};
  for (const sector of SECTORS) discovery[sector.id] = { discovered: true };
  return {
    meta: { seed: SEED },
    world: { currentSectorId: fromId, sectors: {}, discovery },
  };
}

function plotted(fromId, toId, mode, wormholeGate) {
  return computeDiscoveredRoute(chartFrom(fromId), toId, mode, { wormholeGate });
}

test('4242: the chart quotes a gate hop as no fuel and a three-second align', () => {
  const helios = chartFrom('sector_helios_prime');
  assert.equal(helios.meta.seed, SEED);
  const gate = computeDiscoveredRoute(helios, 'sector_ceres_belt', 'gate', { wormholeGate: () => 'closed' });
  assert.equal(gate.legs.length, 1);
  assert.equal(gate.legs[0].from, 'sector_helios_prime');
  assert.equal(gate.legs[0].to, 'sector_ceres_belt');
  assert.equal(gate.legs[0].via, 'gate');
  assert.equal(gate.legs[0].fuel, 0);
  assert.equal(gate.totalFuel, 0);
  assert.equal(gate.totalToll, 194);
  assert.equal(ROUTE_GATE_CHARGE, 3);
  assert.equal(gate.legs[0].charge, ROUTE_GATE_CHARGE);

  const ribbon = resolveRouteRibbon({ route: gate });
  assert.equal(ribbon.totals.fuel, 0);
  assert.equal(ribbon.totals.chargeLabel, '3s');

  const state = createGameState(SEED);
  state.mode = 'flight';
  state.player.credits = 5000;
  state.world.currentSectorId = 'sector_helios_prime';
  const events = [];
  const host = {
    state,
    _driveTierId: 'jump_t1',
    _combatLock: false,
    _activeDrive: world._activeDrive,
    _hasDrive: world._hasDrive,
    _edgeDist: world._edgeDist,
    _gateToll: world._gateToll,
    bus: { emit(type, payload) { events.push({ type, payload }); } },
  };
  world._onRequestJump.call(host, { targetSectorId: 'sector_ceres_belt', via: 'gate' });
  assert.equal(state.jump.state, 'CHARGING');
  assert.equal(state.jump.via, 'gate');
  assert.equal(state.jump._fuelCost, 0);
  assert.equal(state.jump.chargeNeeded, gate.legs[0].charge);
  const started = events.find((event) => event.type === 'jump:chargeStart');
  assert.equal(started.payload.chargeNeeded, ROUTE_GATE_CHARGE);
  assert.equal(started.payload.via, 'gate');

  const throat = plotted('sector_veil_nebula', 'sector_ashfall_reach', 'fuel', () => 'open');
  assert.equal(throat.totalHops, 1);
  assert.equal(throat.legs[0].via, 'gate');
  assert.equal(throat.legs[0].to, 'sector_ashfall_reach');
  assert.equal(throat.legs[0].fuel, 0);
  assert.equal(throat.totalFuel, 0);
  assert.equal(throat.legs[0].charge, ROUTE_GATE_CHARGE);
  const throatRibbon = resolveRouteRibbon({ route: throat });
  assert.equal(throatRibbon.totals.fuel, 0);
  assert.equal(throatRibbon.totals.chargeLabel, '3s');

  const drive = plotted('sector_helios_prime', 'sector_ceres_belt', 'fuel', () => 'closed');
  const edge = routeEdgeDist(BY_ID.get('sector_helios_prime'), BY_ID.get('sector_ceres_belt'));
  const tier = DRIVE_TIERS.jump_t1;
  assert.equal(drive.legs[0].via, 'drive');
  assert.equal(drive.totalFuel, Math.ceil(ROUTE_BASE_FUEL * edge * tier.tierFuelMult));
  assert.equal(drive.legs[0].charge, tier.baseCharge * (edge / 4));
  assert.equal(resolveRouteRibbon({ route: drive }).totals.chargeLabel, '13s');

  const closed = plotted('sector_veil_nebula', 'sector_ashfall_reach', 'fuel', () => 'closed');
  assert.deepEqual(closed.legs.map((leg) => leg.to), [
    'sector_io_reach',
    'sector_charon_expanse',
    'sector_ashfall_reach',
  ]);
  assert.ok(closed.legs.every((leg) => leg.via === 'drive' && leg.fuel > 0));
  assert.equal(closed.totalFuel, 91);
});
