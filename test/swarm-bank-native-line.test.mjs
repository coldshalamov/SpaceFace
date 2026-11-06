import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { BROOD_PHASE_DASH, BROOD_PHASE_RECOVER } from '../src/systems/swarmBrood.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

test('stock Line input can move and release the admitted stone during the first pass', async () => {
  const sim = createSimulation({ seed: 4242, systems: [actions, flightV3, physics, combat, tetherGameplay, swarmArena] });
  const { state, bus } = sim;
  try {
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3';
    state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
    Object.assign(state.run, { phase: 'active', wave: 7, arenaId: 'helios_core', arenaMutators: [] });
    const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      isPlayer: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
    }));
    state.playerId = player.id;
    assert.equal(await sim.registry.get('physics').prepareBackend(state, {}), true);
    bus.emit('run:wavePlanned', { wave: 7 });
    bus.emit('run:waveStarted', { wave: 7 });
    const rock = state.entityList.find(e => e.alive && e.data?.bankOpportunity);
    assert.ok(rock);
    const start = { ...rock.pos };
    const distance = Math.hypot(start.x - player.pos.x, start.z - player.pos.z);
    assert.ok(distance >= 80 && distance <= 95);
    let attached = false, cut = false, dash = false, recovery = false;
    bus.on('tether:attached', p => { if (p.targetId === rock.id) attached = true; });
    bus.on('tether:cut', p => { if (p.targetId === rock.id) cut = true; });
    state.input.aimWorld = { ...rock.pos };
    state.input.aimIntentActive = true;
    state.input.pointerScreen = { active: true, x: 0, y: 0 };
    state.input.actions = {};
    state.input.actions.tetherFire = true;
    sim.step(1 / 60);
    state.input.actions.tetherFire = false;
    for (let i = 0; i < 180; i++) {
      state.input.moveX = i > 60 ? 1 : 0;
      state.input.moveZ = 0;
      if (i === 170) state.input.actions.tetherCut = true;
      if (i === 171) state.input.actions.tetherCut = false;
      sim.step(1 / 60);
      const phase = sim.registry.get('swarmArena')._brood._bodies.phase[0];
      dash ||= phase === BROOD_PHASE_DASH;
      recovery ||= phase === BROOD_PHASE_RECOVER;
    }
    assert.ok(attached, 'ordinary Line input acquired the real arena rock');
    assert.ok(dash && recovery, 'the selected Charger completed its first pass');
    assert.ok(cut, 'ordinary Line input released the rock');
    assert.ok(Math.hypot(rock.pos.x - start.x, rock.pos.z - start.z) > 5,
      'native forces moved the rock during the pass without fixture repositioning');
    const releasedAt = { ...rock.pos };
    for (let i = 0; i < 20; i++) sim.step(1 / 60);
    assert.ok(Math.hypot(rock.pos.x - releasedAt.x, rock.pos.z - releasedAt.z) > 1,
      'the released rock retains useful motion');
  } finally { sim.dispose(); }
});
