// I024 — a ram and an environmental death both carry the same weapon id.
// The reward line has to name the receipt's cause, not that weapon.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { earnLine } from '../src/ui/survivalHud.js';

function victim(id, lifeId) {
  return {
    id,
    alive: false,
    pos: { x: 4, z: 8 },
    vel: { x: 0, z: 0 },
    data: {
      runCohort: 'survival',
      rewardEligible: true,
      threatClass: 'fodder',
      bodyLifeId: lifeId,
      stuntThreat: {
        lifeId,
        threatClass: 'fodder',
        baseScore: 100,
        styleBudget: 100,
        credits: 10,
      },
    },
  };
}

test('two kills name their own receipt causes and not the weapon riding along', () => {
  const state = createGameState(4242);
  const bus = createBus();
  state.playerId = 7;
  state.tick = 30;
  runSession.init({ state, bus });
  survivalRewards.init({ state, bus });
  const lines = [];
  bus.on('run:awarded', (award) => lines.push(earnLine(award)));
  try {
    bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
    for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
      bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
    }
    noteSwarmPilotAction(state);

    const ram = victim(21, 'life-ram');
    const rock = victim(22, 'life-rock');
    state.entities.set(ram.id, ram);
    state.entities.set(rock.id, rock);
    recordImpulseProvenance(ram, {
      actorId: state.playerId,
      weaponId: 'wpn_autocannon_s',
      tag: 'direct_contact',
      appliedTick: state.tick,
    });
    recordImpulseProvenance(rock, {
      actorId: null,
      weaponId: 'wpn_autocannon_s',
      tag: 'environment',
      appliedTick: state.tick,
    });
    const misleading = {
      killerId: state.playerId,
      presentation: { cause: 'kinetic', weaponId: 'wpn_autocannon_s' },
      provenance: { actorId: state.playerId, weaponId: 'wpn_autocannon_s', tag: 'small_autocannon_slug' },
    };
    bus.emit('entity:killed', { id: ram.id, ...misleading });
    bus.emit('entity:killed', { id: rock.id, ...misleading });

    assert.equal(lines.length, 2);
    assert.match(lines[0], /Ram/);
    assert.match(lines[1], /The environment/);
    assert.notEqual(lines[0], lines[1]);
    for (const line of lines) {
      assert.doesNotMatch(line, /wpn_|direct_contact|small_autocannon|Autocannon/);
    }
  } finally {
    survivalRewards.destroy();
    runSession.destroy();
  }
});
