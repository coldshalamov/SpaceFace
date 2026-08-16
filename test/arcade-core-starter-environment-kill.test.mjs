import assert from 'node:assert/strict';
import test from 'node:test';

import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { createBus } from '../src/core/eventBus.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { fittingsFromDefaultModules, getDerivedStats, makeShipEntitySpec } from '../src/systems/ships.js';

function targetShip(id) {
  return {
    id, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 8, mass: 20, hull: 70, hullMax: 70,
    armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    cap: 100, capMax: 100, capRegen: 0, lastDamageT: -1e9, flags: {},
    data: { combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 } },
  };
}

test('fresh Hitch can turn one first-contact fight into a credited terrain kill', () => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const bus = createBus();
  try {
    const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
    const player = makeShipEntitySpec(NEW_GAME.shipId, { id: 1, isPlayer: true, team: 0, fittings });
    player.id = 1;
    player.pos = { x: 0, z: 0 };
    player.vel = { x: 90, z: 0 };
    player.data.derived = getDerivedStats(NEW_GAME.shipId, fittings);
    const target = targetShip(2);
    const rock = {
      id: 90, type: 'asteroid', alive: true, collides: true,
      pos: { x: 70, z: 0 }, vel: { x: 0, z: 0 }, radius: 30, mass: 1e6, data: {},
    };
    const state = {
      tick: 120, simTime: 2, mode: 'flight', playerId: player.id,
      player: { targetId: target.id, stats: { kills: 0 } },
      meta: { seed: 47 }, settings: { gameplay: { difficulty: 'standard' } }, content: {},
      combat: { entities: {}, beams: [], threatTables: new Map() },
      entities: new Map([[player.id, player], [target.id, target], [rock.id, rock]]),
      entityList: [player, target, rock],
    };
    const kills = [];
    bus.on('entity:killed', (payload) => kills.push(payload));
    const liveCombat = Object.create(combat);
    liveCombat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
    const contacts = Object.create(collisionConsequences);
    contacts.init({ state, bus, registry: { get(name) { return name === 'combat' ? liveCombat : null; } } });

    assert.equal(fittings.includes('mod_ram_plate'), true);
    assert.ok(player.data.derived.ramDamageDealtMult > 1);

    bus.emit('physics:impact', {
      consequenceKernelVersion: 1, tick: state.tick,
      aId: target.id, bId: player.id, causalActorId: player.id,
      impulse: 400, pos: { x: 12, z: 0 }, normal: { x: -1, z: 0 },
    });
    assert.equal(target.alive, true, 'the plate creates a projectile instead of scripting the kill');
    assert.equal(readTumbleStatus(state, target)?.attackerId, player.id);

    state.tick += 30;
    state.simTime = state.tick / 60;
    target.pos = { x: 42, z: 0 };
    target.vel = { x: 80, z: 0 };
    bus.emit('physics:impact', {
      consequenceKernelVersion: 1, tick: state.tick,
      aId: target.id, bId: rock.id, impulse: 1000,
      pos: { x: 52, z: 0 }, normal: { x: -1, z: 0 },
    });

    assert.equal(kills.length, 1,
      `one encounter group is inside the three-fight starter window (hull=${target.hull}, alive=${target.alive})`);
    assert.equal(kills[0].killerId, player.id);
    assert.equal(kills[0].presentation.playerCaused, true);
    assert.equal(kills[0].presentation.style.id, 'terrain_smash');
    assert.equal(kills[0].presentation.cause, 'terrain_collision');

    contacts.destroy();
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = previous;
    bus.clear();
  }
});
