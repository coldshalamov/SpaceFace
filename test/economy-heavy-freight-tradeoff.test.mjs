// SFQ-B084 — heavy freight trades maneuver and escape for money, and the manifest says so.
//
// The staged run is an ordinary opening-sector route measured on this seed (seed 4242):
// station_helios (trade hub) -> station_coalition (military) in cmdty_provisions on the starter
// Hitch, sold in 25-u tranches with the market relaxing between them. Measured nets through the
// real trade owners: full 250-u hold (175 t aboard) nets +2,207 cr at -69% thrust; the 50-u
// manifest nets +1,354 cr at -28% thrust. Heavy buys money and loses the escape window — the
// packet's outcome, pinned. Every clause runs through the live owners:
//   * money      — economy.execute buy/sell (credits writer + cargo single writer addCargo)
//   * mass       — cargo.usedMass -> ships.getDerivedStats -> MASS_LOAD_LAW (the one carrier)
//   * flown      — the production propulsion kernel, fixed-step scripted integration
//   * preflight  — computeBestTrades/formatRouteCard, the market's route card print
// Deterministic: seed 4242, state.simTime clock, no Math.random, no wall time.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  createPropulsionRuntime,
  stepPropulsion,
} from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SHIPS } from '../src/data/ships.js';
import { economy } from '../src/systems/economy.js';
import { addCargo } from '../src/systems/cargo.js';
import { getDerivedStats, makeShipEntitySpec } from '../src/systems/ships.js';
import { computeBestTrades, formatRouteCard } from '../src/ui/market/tradeLogic.js';

const SEED = 4242;
const DT = 1 / 60;
const HERE = 'station_helios';
const THERE = 'station_coalition';
const RUN_GOOD = 'cmdty_food';
const HEAVY_UNITS = 250;   // the volume-bound full hold (volPerU 1.0, cap 250) — the staged heavy run
const LIGHT_UNITS = 50;    // the lighter manifest of the same run: less money, more ship left
const TRANCHE = 25;        // units per sale tranche (the dump-the-lot pricing is not the run)
const RELAX_MIN = 30;      // econ minutes between tranches (stock drifts back toward demand)
const KESTREL = SHIPS.find((s) => s.id === 'ship_kestrel');
const NPC_STATE = { playerId: -1, player: {} };

/** A minimal flight state whose player hold is the cargo single-writer's store. */
function bootState() {
  const state = {
    mode: 'flight',
    meta: { seed: SEED },
    simTime: 600,
    tick: 0,
    playerId: 'player',
    player: {
      credits: 200000,
      stats: {},
      cargo: { items: {}, capVolume: KESTREL.cargo, usedVolume: 0, usedMass: 0 },
    },
    entities: new Map(),
  };
  refreshPlayerEntity(state);
  return state;
}

/** The live ship record the preflight forecast and the flight route both read (ships owns the refresh). */
function refreshPlayerEntity(state) {
  state.entities.set(state.playerId, {
    id: state.playerId,
    type: 'ship',
    alive: true,
    data: { defId: KESTREL.id, derived: getDerivedStats(KESTREL.id, [], state.player) },
  });
}

function bootEconomy(state) {
  const inst = Object.create(economy);
  inst.init({ state, bus: createBus(), helpers: {}, registry: null });
  for (const stationId of [HERE, THERE]) inst.ensureMarket(stationId);
  inst.snapshotIntel(HERE);
  inst.snapshotIntel(THERE);
  return inst;
}

/** The real spawned hull spec over a loaded hold (makeShipEntitySpec -> getDerivedStats -> cargo.usedMass). */
function loadedShip(state) {
  const spec = makeShipEntitySpec(KESTREL.id, { team: 1, player: state.player });
  return {
    spec,
    derived: spec.data ? spec.data.derived : null,
    profile: resolvePropulsionProfile(
      { ...spec, id: 'runner', vel: { x: 0, z: 0 }, angVel: 0 },
      NPC_STATE,
    ),
    mass: spec.mass,
    inertia: (spec.flightModel && spec.flightModel.inertia) || spec.mass * 4,
  };
}

/** Fixed-step scripted sprint: full throttle from rest, distance covered in `seconds`. */
function sprintDistance(ship, seconds) {
  const body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: ship.mass, inertia: ship.inertia };
  let runtime = createPropulsionRuntime(ship.profile);
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    const result = stepPropulsion({
      dt: DT, body,
      input: { moveZ: 1, moveX: 0, turnIntent: 0, boost: false, brake: false },
      profile: ship.profile, runtime, environment: {},
    });
    runtime = result.runtime;
    body.vel.x += (result.force.x / body.mass) * DT;
    body.vel.z += (result.force.z / body.mass) * DT;
    body.pos.x += body.vel.x * DT;
    body.pos.z += body.vel.z * DT;
  }
  return Math.hypot(body.pos.x, body.pos.z);
}

/**
 * The escape window: an unloaded pursuer (same hull, empty hold — the pirate) starts `gap0`
 * behind a runner already at speed s0, both at full throttle. Gap after `seconds` is the
 * window the manifest bought.
 */
function escapeGapAfter(runner, pursuer, s0, gap0, seconds) {
  const r = { pos: { x: 0, z: 0 }, vel: { x: s0, z: 0 }, rot: 0, angVel: 0, mass: runner.mass, inertia: runner.inertia };
  const p = { pos: { x: -gap0, z: 0 }, vel: { x: s0, z: 0 }, rot: 0, angVel: 0, mass: pursuer.mass, inertia: pursuer.inertia };
  let runnerRt = createPropulsionRuntime(runner.profile);
  let pursuerRt = createPropulsionRuntime(pursuer.profile);
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    const inFlight = { moveZ: 1, moveX: 0, turnIntent: 0, boost: false, brake: false };
    const rr = stepPropulsion({ dt: DT, body: r, input: inFlight, profile: runner.profile, runtime: runnerRt, environment: {} });
    runnerRt = rr.runtime;
    const pr = stepPropulsion({ dt: DT, body: p, input: inFlight, profile: pursuer.profile, runtime: pursuerRt, environment: {} });
    pursuerRt = pr.runtime;
    r.vel.x += (rr.force.x / r.mass) * DT; r.vel.z += (rr.force.z / r.mass) * DT;
    p.vel.x += (pr.force.x / p.mass) * DT; p.vel.z += (pr.force.z / p.mass) * DT;
    r.pos.x += r.vel.x * DT; r.pos.z += r.vel.z * DT;
    p.pos.x += p.vel.x * DT; p.pos.z += p.vel.z * DT;
  }
  return (r.pos.x - p.pos.x) - gap0;
}

/**
 * One staged run through the real trade owners: buy the manifest at HERE, sell it at THERE in
 * tranches while the market relaxes between them (the way a trader actually lands a load).
 * Returns the actual net credits and the load the hold really carried.
 */
function stagedRun(inst, state, units) {
  const creditsBefore = state.player.credits;
  const bought = inst.execute(HERE, RUN_GOOD, 'buy', units);
  assert.equal(bought.ok, true, `staged buy must settle: ${bought.reason || ''}`);
  let sold = 0;
  while (sold < bought.qty) {
    const sale = inst.execute(THERE, RUN_GOOD, 'sell', Math.min(TRANCHE, bought.qty - sold));
    assert.equal(sale.ok, true, `staged tranche must settle: ${sale.reason || ''}`);
    sold += sale.qty;
    for (let step = 0; step < RELAX_MIN / 10; step += 1) {
      state.simTime += 600;
      state.tick += 36000;
      inst.update(600, state);
    }
  }
  const def = COMMODITIES.find((c) => c.id === RUN_GOOD);
  return {
    net: state.player.credits - creditsBefore,
    sold,
    loadMassT: sold * def.massPerU,
    thrustPct: Math.round((1 - makeShipEntitySpec(KESTREL.id, { player: {
      ...state.player,
      cargo: { items: { [RUN_GOOD]: sold }, capVolume: KESTREL.cargo,
        usedVolume: sold * def.volPerU, usedMass: sold * def.massPerU },
    } }).data.derived.propulsion.massLoadFactor) * 100),
  };
}

test('the route preflight prints the load mass and the thrust the mass law takes at that load', () => {
  const state = bootState();
  bootEconomy(state);
  const trades = computeBestTrades(state, HERE);
  const heavy = trades.find((t) => t.cmdtyId === RUN_GOOD && t.destStation === THERE);
  assert.ok(heavy, 'the measured heavy run must be among the routes the market preflights');
  // Measured on this seed: 250 u of provisions = 175 t over the 18 t hull -> -69% thrust.
  assert.equal(heavy.loadUnits, HEAVY_UNITS);
  assert.equal(heavy.loadMassT, 175);
  assert.equal(heavy.loadThrustPct, 69);
  const card = formatRouteCard(heavy);
  assert.match(card.sub, /\+175 t → -69% thrust/);
  // The printed number is the flown number: the same load factor the loaded hull flies with.
  const loaded = makeShipEntitySpec(KESTREL.id, { player: {
    ...state.player,
    cargo: { items: { [RUN_GOOD]: HEAVY_UNITS }, capVolume: KESTREL.cargo,
      usedVolume: HEAVY_UNITS, usedMass: HEAVY_UNITS * 0.7 },
  } });
  const flownLoad = loaded.data.derived.propulsion.massLoadFactor;
  assert.ok(flownLoad < 1, 'a 175 t load must bend the hull');
  assert.equal(heavy.loadThrustPct, Math.round((1 - flownLoad) * 100),
    'preflight print and flown mass law must be one number');
});

test('the staged heavy run beats the light manifest on credits through the real trade owners', () => {
  const heavyState = bootState();
  const heavyRun = stagedRun(bootEconomy(heavyState), heavyState, HEAVY_UNITS);
  const lightState = bootState();
  const lightRun = stagedRun(bootEconomy(lightState), lightState, LIGHT_UNITS);
  assert.equal(heavyRun.sold, HEAVY_UNITS, 'the full manifest sells out');
  assert.ok(heavyRun.net > 0, `the heavy run must be profitable (net ${heavyRun.net})`);
  assert.ok(lightRun.net > 0, `the light run must be profitable (net ${lightRun.net})`);
  assert.ok(heavyRun.net > lightRun.net,
    `full hold must out-earn the lighter manifest of the same run: ${heavyRun.net} vs ${lightRun.net}`);
  assert.equal(heavyRun.thrustPct, 69, 'the heavy money rides the heavy load');
  // The heavy hold really rode the honest carrier: cargo's mass cache holds 175 t.
  const reloaded = bootState();
  const inst = bootEconomy(reloaded);
  inst.execute(HERE, RUN_GOOD, 'buy', HEAVY_UNITS);
  const def = COMMODITIES.find((c) => c.id === RUN_GOOD);
  assert.ok(Math.abs(reloaded.player.cargo.usedMass - HEAVY_UNITS * def.massPerU) < 1e-6,
    `buy must land its mass in the cargo writer: ${reloaded.player.cargo.usedMass}`);
});

test('the heavy manifest measurably changes the flown outcome: slower sprint, smaller escape window', () => {
  const heavyHold = bootState();
  assert.equal(addCargo(heavyHold, RUN_GOOD, HEAVY_UNITS), HEAVY_UNITS, 'the hold accepts the volume-fit load');
  const lightHold = bootState();
  assert.equal(addCargo(lightHold, RUN_GOOD, LIGHT_UNITS), LIGHT_UNITS);
  const emptyHold = bootState();

  const heavy = loadedShip(heavyHold);
  const light = loadedShip(lightHold);
  const pursuer = loadedShip(emptyHold);

  // Mass, not volume, is what separates the two flights: same hull, same fittings.
  assert.ok(heavy.derived.operationalMass > light.derived.operationalMass);
  assert.ok(light.derived.propulsion.massLoadFactor < 1, 'even the light manifest bends the hull');
  assert.equal(pursuer.derived.propulsion.massLoadFactor, 1, 'the empty pursuer keeps full thrust');
  assert.ok(heavy.derived.propulsion.massLoadFactor < light.derived.propulsion.massLoadFactor,
    `load law must rank the manifests: ${heavy.derived.propulsion.massLoadFactor} < ${light.derived.propulsion.massLoadFactor}`);

  // Sprint (how fast the hull answers): heavy covers measurably less ground in the same 10 s.
  const heavySprint = sprintDistance(heavy, 10);
  const lightSprint = sprintDistance(light, 10);
  assert.ok(heavySprint < lightSprint * 0.85,
    `heavy sprint must measurably lose: ${heavySprint.toFixed(1)} vs ${lightSprint.toFixed(1)} WU`);

  // Escape (how long the window stays open): the unloaded pursuer closes on the heavy runner
  // strictly faster than on the light one over the same 15 s.
  const s0 = 0.5 * pursuer.profile.combatSpeed;
  const gap0 = 250;
  const heavyGap = escapeGapAfter(heavy, pursuer, s0, gap0, 15);
  const lightGap = escapeGapAfter(light, pursuer, s0, gap0, 15);
  assert.ok(heavyGap < lightGap,
    `the heavy manifest must buy the smaller escape window: ${heavyGap.toFixed(1)} vs ${lightGap.toFixed(1)} WU`);
  assert.ok(heavyGap < 0,
    `the unloaded pursuer must be gaining on the heavy runner (gap delta ${heavyGap.toFixed(1)} WU)`);
});

test('mass never becomes a second capacity: the hold gates on volume alone', () => {
  const state = bootState();
  // Weapon Systems: volPerU 0.9 fits 277 u in the 250 u hold; at massPerU 1.5 that is ~416 t
  // on an 18 t hull — absurdly overweight, and the hold must still accept every volume-fit unit.
  const accepted = addCargo(state, 'cmdty_weapons', 400);
  assert.ok(accepted > 0, 'an overweight-but-volume-fit load is not refused');
  assert.ok(state.player.cargo.usedVolume <= state.player.cargo.capVolume + 1e-6);
  assert.ok(state.player.cargo.usedMass > KESTREL.designMass, 'the accepted load is far past design mass');
  // The preflight names the cost instead of gating it.
  refreshPlayerEntity(state);
  const trades = computeBestTrades(state, HERE);
  const heavy = trades.find((t) => t.cmdtyId === RUN_GOOD);
  if (heavy && Number.isFinite(heavy.loadThrustPct)) {
    assert.ok(heavy.loadUnits > 0, 'the route still stages a load under volume-only capacity');
  }
});
