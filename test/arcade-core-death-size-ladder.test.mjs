import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { PhasedExplosionLifecycle, explosionScheduleFor } from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';
import { combat } from '../src/systems/combat.js';

function ship(id, team, { radius, shipClass, hull = 1 } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: team === 0 ? 'faction_free' : 'faction_reach',
    pos: { x: id * 4, z: -id * 2 },
    prevPos: { x: id * 4, z: -id * 2 },
    vel: { x: 3, z: -1 },
    radius,
    mass: radius * 2,
    hull,
    hullMax: hull,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 0,
    flags: {},
    data: {
      shipClass,
      combatProfileId: 'combat_profile_standard_ship',
      bountyCr: 0,
      derived: { damageReductionMult: 1, ramDamageDealtMult: 0 },
    },
  };
}

function killThroughProduction({ radius, shipClass }) {
  const bus = createBus();
  const player = ship(1, 0, { radius: 12, shipClass: 'fighter', hull: 100 });
  const target = ship(2, 1, { radius, shipClass });
  const entities = new Map([[player.id, player], [target.id, target]]);
  const state = {
    tick: 60,
    simTime: 1,
    mode: 'flight',
    playerId: player.id,
    player: { targetId: target.id },
    meta: { seed: 31 },
    settings: {
      gameplay: { difficulty: 'standard' },
      video: { particleQuality: 'low', motionReduce: false },
      accessibility: { flashReduce: false },
    },
    content: {},
    combat: { entities: {}, beams: [] },
    entities,
    entityList: [...entities.values()],
  };

  const presenter = Object.create(vfx);
  presenter.state = state;
  presenter._scene = true;
  presenter._explosions = new PhasedExplosionLifecycle({ capacity: 4 });
  presenter._emitJuiceCue = () => {};

  const kills = [];
  bus.on('entity:killed', (payload) => {
    kills.push(payload);
    presenter._onKilled(payload);
  });

  const system = Object.create(combat);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  system.kill(target, player.id, null);

  const resident = presenter._explosions.entries.find((entry) => entry.active);
  assert.ok(resident, `${shipClass} kill must enter the production phased VFX pool`);
  return { kill: kills.at(-1), resident };
}

test('real Combat kills preserve physical radius and select the full Plan31 size ladder', () => {
  const light = killThroughProduction({ radius: 8, shipClass: 'fighter' });
  const medium = killThroughProduction({ radius: 18, shipClass: 'corvette' });
  const heavy = killThroughProduction({ radius: 31, shipClass: 'gunship' });
  const capital = killThroughProduction({ radius: 60, shipClass: 'capital' });

  assert.deepEqual(
    [light.kill.radius, medium.kill.radius, heavy.kill.radius, capital.kill.radius],
    [8, 18, 31, 60],
    'Combat publishes the authoritative collision footprint instead of a VFX-owned estimate',
  );
  assert.deepEqual(
    [light.resident.classId, medium.resident.classId, heavy.resident.classId, capital.resident.classId],
    ['small', 'ordinary', 'capital', 'capital'],
  );
  assert.deepEqual(
    [light.resident.radius, medium.resident.radius, heavy.resident.radius, capital.resident.radius],
    [8, 18, 31, 60],
  );
  assert.equal(explosionScheduleFor(light.resident.classId).duration, 0.82);
  assert.equal(explosionScheduleFor(medium.resident.classId).duration, 1.42);
  assert.equal(explosionScheduleFor(heavy.resident.classId).duration, 3.4,
    'Heavy receives the extended breakup beneath its physical cook-off/wreck route');
  assert.equal(explosionScheduleFor(capital.resident.classId).duration, 3.4,
    'Capital receives the extended breakup beneath its authored setpiece chain');
});

test('legacy semantic receipts fail closed without promoting every gunship to Capital', () => {
  const harness = Object.create(vfx);
  assert.equal(harness._destructionClassForKill({ victimClass: 'fighter' }), 'small');
  assert.equal(harness._destructionClassForKill({ victimClass: 'gunship' }), 'ordinary');
  assert.equal(harness._destructionClassForKill({ victimClass: 'heavy' }), 'capital');
  assert.equal(harness._destructionClassForKill({ victimClass: 'capital' }), 'capital');
  assert.equal(harness._destructionClassForKill({ victimClass: 'fighter', radius: 15 }), 'ordinary',
    'a physically medium fighter keeps its real footprint over its broad catalog label');
});
