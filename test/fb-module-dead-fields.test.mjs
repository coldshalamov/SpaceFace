import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import { MODULES } from '../src/data/modules.js';
import { automation } from '../src/systems/automation.js';
import { flightV3 } from '../src/systems/flightV3.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
  resetDerivedStatsCache,
} from '../src/systems/ships.js';
import {
  fittedWholeWreckTractor,
  uniqueLootAbilities,
} from '../src/systems/uniqueLootAbilities.js';

const DT = 1 / 60;
const BASTION = 'ship_bastion'; // three M utility slots — a legal home for all three modules
const HELIOS = 'sector_helios_prime';

function moduleDef(id) {
  const def = MODULES.find((m) => m.id === id);
  assert.ok(def, `catalog module ${id}`);
  return def;
}

function closeTo(actual, expected, message, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`);
}

// ---- afterburner: boostTopSpeedPct / boostDurS / boostCdS -----------------------------

test('a fitted afterburner writes its authored envelope onto derived.boost', () => {
  const bare = getDerivedStats(BASTION, fittingsFromDefaultModules(BASTION, []));
  assert.equal(bare.boost.topSpeedPct, 0);
  assert.equal(bare.boost.burnDurS, 0);
  assert.equal(bare.boost.burnCdS, 0);

  const fitted = getDerivedStats(BASTION, fittingsFromDefaultModules(BASTION, ['mod_afterburner_m']));
  closeTo(fitted.boost.topSpeedPct, 0.40, 'boostTopSpeedPct folds through');
  closeTo(fitted.boost.burnDurS, 4, 'boostDurS folds through');
  closeTo(fitted.boost.burnCdS, 12, 'boostCdS folds through');
});

function boostEntity(overrides = {}) {
  return {
    id: 7,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    boost: {
      energy: 100, max: 100,
      drainRate: 10, regenRate: 0,
      dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0,
      topSpeedPct: 0.40, burnDurS: 4, burnCdS: 12,
      ...overrides,
    },
    data: {},
    flags: {},
  };
}

function boostHost() {
  const host = Object.create(flightV3);
  host.state = { simTime: 0, ui: { screenStack: [] }, input: {} };
  host.bus = { emit() {} };
  host._prevBoost = false;
  host._suppressBoostUntilRelease = false;
  return host;
}

test('a fitted burner bounds a boost run by boostDurS and gates the next by boostCdS', () => {
  const host = boostHost();
  const e = boostEntity();
  const step = (held) => host._stepPlayerBoost(e, held, DT, host.state);

  // Light the burner: the run lasts ~burnDurS (240 ticks at 60 Hz; allow one tick of float slop
  // at the boundary).
  let firstFalse = -1;
  for (let i = 0; i < 400; i += 1) {
    if (step(true)) {
      assert.equal(e.boost._burnActive, true, 'afterburner window is marked while lit');
    } else { firstFalse = i; break; }
  }
  assert.ok(firstFalse >= 239 && firstFalse <= 242,
    `one lit window lasts the authored 4 s; died at tick ${firstFalse}`);
  assert.ok(e.boost._burnCdT > 11.9 && e.boost._burnCdT <= 12,
    `burnCdS cooldown armed on exhaustion, got ${e.boost._burnCdT}`);

  // Held through the cooldown: no boost until the authored 12 s has elapsed.
  for (let i = 0; i < 716; i += 1) {
    assert.equal(step(true), false, `cooldown tick ${i}`);
  }
  let relit = false;
  for (let i = 0; i < 8 && !relit; i += 1) relit = step(true);
  assert.ok(relit, 'boost relights once boostCdS has elapsed');
});

test('without a fitted burner the capacitor alone still governs boost', () => {
  const host = boostHost();
  const e = boostEntity({ topSpeedPct: 0, burnDurS: 0, burnCdS: 0 });
  const step = (held) => host._stepPlayerBoost(e, held, DT, host.state);
  for (let i = 0; i < 300; i += 1) assert.equal(step(true), true, `capacitor tick ${i}`);
  assert.equal(e.boost._burnActive, false, 'no burner fitted means no burn window');
  // Energy still binds: an empty capacitor cuts boost even with the key held.
  const drained = boostEntity({ energy: 0.5, topSpeedPct: 0.4, burnDurS: 4, burnCdS: 12 });
  assert.equal(step.call ? host._stepPlayerBoost(drained, true, DT, host.state) : false, false,
    'a dead capacitor cannot light the burner');
});

test('flightV3 applies topSpeedPct to the boost speed cap while the run is live', () => {
  const src = readFileSync(new URL('../src/systems/flightV3.js', import.meta.url), 'utf8');
  assert.match(src, /boostSpeedMult:\s*positive\(profile\.boostSpeedMult, 1\)\s*\*\s*\(1 \+ burnerTopSpeedPct\)/,
    'the derived topSpeedPct must reach the propulsion profile');
});

// ---- tractorWholeWrecks: the flag, not the unique id -----------------------------------

function bootAbilities(fittings = []) {
  const sim = createSimulation({ seed: 47022, systems: [uniqueLootAbilities] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 10, mass: 20, hull: 100, hullMax: 100, cap: 100, capMax: 100,
    data: { fittings: fittings.slice(), defId: BASTION },
  });
  state.playerId = player.id;
  return { sim, state, player, dispose: () => sim.dispose() };
}

function spawnSmallWreck(sim, x = 500) {
  return sim.spawn({
    type: 'wreck', pos: { x, z: 0 }, vel: { x: 0, z: 0 }, radius: 9, mass: 100,
    data: { parentType: 'ship', salvagePool: { cmdty_scrap_metal: 2 } },
  });
}

test('whole-wreck tractoring follows the tractorWholeWrecks flag, not the Tideline id', () => {
  const t = bootAbilities(['mod_tractor_beam_m']);
  try {
    // A plain tractor beam lacks the flag: nothing pulls.
    assert.equal(fittedWholeWreckTractor(t.state), null);
    const wreck = spawnSmallWreck(t.sim);
    t.sim.step(0.5);
    assert.equal(consumePhysicsCommand(wreck), null,
      'a tractor without tractorWholeWrecks cannot lift a whole wreck');
  } finally {
    t.dispose();
  }

  // In-place catalog patch is the sanctioned fixture seam (see resetDerivedStatsCache contract):
  // give the ORDINARY tractor beam the flag — never the Tideline id — and the verb appears.
  const tractor = moduleDef('mod_tractor_beam_m');
  assert.equal(tractor.mods.tractorWholeWrecks, undefined, 'fixture precondition: flag absent');
  tractor.mods.tractorWholeWrecks = true;
  try {
    const t2 = bootAbilities(['mod_tractor_beam_m']);
    try {
      const carrier = fittedWholeWreckTractor(t2.state);
      assert.equal(carrier && carrier.id, 'mod_tractor_beam_m',
        'the flag carrier — not the unique id — is the verb');
      const wreck = spawnSmallWreck(t2.sim);
      t2.sim.step(0.5);
      const cmd = consumePhysicsCommand(wreck);
      assert.ok(cmd && cmd.impulses && cmd.impulses.length > 0,
        'a flagged non-unique module lifts a whole wreck');
      assert.ok(cmd.impulses[0].x < 0, 'the pull runs toward the ship');
    } finally {
      t2.dispose();
    }
  } finally {
    delete tractor.mods.tractorWholeWrecks;
    resetDerivedStatsCache();
  }
});

test('the Tideline still lifts whole wrecks after the flag gate', () => {
  const t = bootAbilities(['unique_tideline_tractor']);
  try {
    const carrier = fittedWholeWreckTractor(t.state);
    assert.equal(carrier && carrier.id, 'unique_tideline_tractor');
    const wreck = spawnSmallWreck(t.sim);
    t.sim.step(0.5);
    assert.ok(consumePhysicsCommand(wreck)?.impulses?.length > 0,
      'Tideline behaviour is unchanged');
  } finally {
    t.dispose();
  }
});

// ---- repairDockedDrones: parked groups knit at the carrier's authored tempo --------------

function bootAutomation(fittings) {
  const entities = new Map();
  const player = {
    id: 7, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { fittings: fittings.slice() },
  };
  entities.set(player.id, player);
  const drone = {
    id: 41, type: 'drone', alive: true,
    pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { kind: 'mining_drone', groupId: 'g1', intent: { boost: true } },
  };
  entities.set(drone.id, drone);
  const state = {
    simTime: 10,
    playerId: player.id,
    entities,
    entityList: [...entities.values()],
    world: { currentSectorId: HELIOS },
  };
  const inst = Object.create(automation);
  Object.assign(inst, {
    state,
    bus: { emit() {} },
    helpers: { getEntity: (id) => entities.get(id) },
  });
  const group = {
    id: 'g1', defId: 'drone_mk1', count: 1, sectorId: HELIOS,
    originPos: { x: 0, z: 0 }, entityIds: [drone.id],
    durability: 10, durabilityMax: 40,
  };
  return { state, inst, group, drone };
}

test('parked drones regain durability only when the bay carries repairDockedDrones', () => {
  const bare = bootAutomation(['mod_repair_nanobots_m']); // repairs hull, not drones
  bare.inst._parkDroneEntities(bare.group, DT * 60);
  assert.equal(bare.group.durability, 10, 'no flag, no repair');
  assert.equal(bare.drone.data.intent.brake, true, 'the drone is still parked');

  const fitted = bootAutomation(['unique_knitbots']);
  fitted.inst._parkDroneEntities(fitted.group, DT * 60); // one sim-second parked
  closeTo(fitted.group.durability, 10 + 4.4, 'one parked second knits at hullRepairOOC', 1e-6);
  fitted.inst._parkDroneEntities(fitted.group, DT * 60 * 10);
  assert.equal(fitted.group.durability, 40, 'repair clamps at durabilityMax');
  assert.equal(fitted.drone.data.intent.brake, true, 'parking still drives the brake intent');

  // A parked group with no live hulls loaded still knits — the record, not the entity, repairs.
  const away = bootAutomation(['unique_knitbots']);
  away.group.entityIds = [];
  away.inst._parkDroneEntities(away.group, DT * 60);
  closeTo(away.group.durability, 14.4, 'entity-less parked groups still repair', 1e-6);
});
