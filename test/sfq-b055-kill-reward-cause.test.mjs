// SFQ-B055: Keep ordinary kills fairly paid (physical kill causes on seed 4242)
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { earnLine } from '../src/ui/survivalHud.js';
import { WEAPONS } from '../src/data/weapons.js';

function createVictim(id, lifeId, level = 1) {
  return {
    id,
    alive: false,
    pos: { x: 10, z: 20 },
    vel: { x: 0, z: 0 },
    data: {
      level,
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

function setupSwarmHarness(seed = 4242) {
  const state = createGameState(seed);
  const bus = createBus();
  state.playerId = 1;
  state.tick = 60;
  runSession.init({ state, bus });
  survivalRewards.init({ state, bus });

  bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'swarm',
    seed,
    arenaId: 'helios_core',
  });
  for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
  }
  noteSwarmPilotAction(state);

  const awards = [];
  bus.on('run:awarded', (award) => {
    Object.defineProperty(state.run, 'lastEarned', {
      value: {
        reason: award.causePhrase,
        score: award.score,
        xp: award.xp,
        credits: award.credits,
        line: earnLine(award),
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
    awards.push(award);
  });

  return {
    state,
    bus,
    awards,
    destroy() {
      survivalRewards.destroy();
      runSession.destroy();
    },
  };
}

test('SFQ-B055: physical kill causes write authored names into lastEarned.reason and earnLine', () => {
  const h = setupSwarmHarness(4242);
  try {
    const vThrow = createVictim(101, 'life-throw');
    const vWhip = createVictim(102, 'life-whip');
    const vRam = createVictim(103, 'life-ram');
    h.state.entities.set(vThrow.id, vThrow);
    h.state.entities.set(vWhip.id, vWhip);
    h.state.entities.set(vRam.id, vRam);

    // 1. Thrown mass via cause: 'massline_throw'
    h.bus.emit('entity:killed', {
      id: vThrow.id,
      killerId: h.state.playerId,
      cause: 'massline_throw',
    });
    assert.equal(h.state.run.lastEarned.reason, 'Thrown mass');
    assert.match(h.state.run.lastEarned.line, /Thrown mass/);
    assert.doesNotMatch(h.state.run.lastEarned.line, /A weapon/);

    // 2. Massline whip via tag: 'massline_whip'
    h.bus.emit('entity:killed', {
      id: vWhip.id,
      killerId: h.state.playerId,
      tag: 'massline_whip',
    });
    assert.equal(h.state.run.lastEarned.reason, 'Massline whip');
    assert.match(h.state.run.lastEarned.line, /Massline whip/);
    assert.doesNotMatch(h.state.run.lastEarned.line, /A weapon/);

    // 3. Ram plate via weaponId: 'mod_ram_plate'
    h.bus.emit('entity:killed', {
      id: vRam.id,
      killerId: h.state.playerId,
      weaponId: 'mod_ram_plate',
    });
    assert.equal(h.state.run.lastEarned.reason, 'Ram Plate');
    assert.match(h.state.run.lastEarned.line, /Ram Plate/);
    assert.doesNotMatch(h.state.run.lastEarned.line, /A weapon/);
  } finally {
    h.destroy();
  }
});

test('SFQ-B055: negative/quiet case — ordinary gun kills still write gun authored name', () => {
  const h = setupSwarmHarness(4242);
  try {
    const vGun = createVictim(104, 'life-gun');
    h.state.entities.set(vGun.id, vGun);

    const gunDef = WEAPONS.find((w) => w.id === 'wpn_autocannon_s');
    assert.ok(gunDef && gunDef.name, 'Autocannon exists in WEAPONS');

    h.bus.emit('entity:killed', {
      id: vGun.id,
      killerId: h.state.playerId,
      provenance: {
        actorId: h.state.playerId,
        weaponId: 'wpn_autocannon_s',
        tag: 'small_autocannon_slug',
      },
    });

    assert.equal(h.state.run.lastEarned.reason, gunDef.name);
    assert.match(h.state.run.lastEarned.line, new RegExp(gunDef.name));
    assert.doesNotMatch(h.state.run.lastEarned.line, /A weapon/);
  } finally {
    h.destroy();
  }
});

test('SFQ-B055: once-only idempotence — re-emitting entity:killed for the same lifeId does not double-grant', () => {
  const h = setupSwarmHarness(4242);
  try {
    const vIdemp = createVictim(105, 'life-idemp');
    h.state.entities.set(vIdemp.id, vIdemp);

    h.bus.emit('entity:killed', {
      id: vIdemp.id,
      killerId: h.state.playerId,
      cause: 'massline_throw',
    });

    const initialAwardsCount = h.awards.length;
    const initialScore = h.state.run.score;
    const initialXp = h.state.run.xp;
    const initialCredits = h.state.run.credits;

    assert.equal(initialAwardsCount, 1);
    assert.ok(initialScore > 0, 'Score granted on first kill');
    assert.ok(initialXp > 0, 'XP granted on first kill');

    // Re-emit for the same victim / lifeId
    h.bus.emit('entity:killed', {
      id: vIdemp.id,
      killerId: h.state.playerId,
      cause: 'massline_throw',
    });

    assert.equal(h.awards.length, initialAwardsCount, 'No duplicate awards emitted');
    assert.equal(h.state.run.score, initialScore, 'Score unchanged on duplicate kill');
    assert.equal(h.state.run.xp, initialXp, 'XP unchanged on duplicate kill');
    assert.equal(h.state.run.credits, initialCredits, 'Credits unchanged on duplicate kill');
  } finally {
    h.destroy();
  }
});

test('SFQ-B055: physical kill causes from presentation and modules resolve correctly', () => {
  const h = setupSwarmHarness(4242);
  try {
    const vFlail = createVictim(106, 'life-flail');
    const vArena = createVictim(107, 'life-arena');
    const vChain = createVictim(108, 'life-chain');
    h.state.entities.set(vFlail.id, vFlail);
    h.state.entities.set(vArena.id, vArena);
    h.state.entities.set(vChain.id, vChain);

    // Tow flail via weaponId: 'mod_mass_flail_rig'
    h.bus.emit('entity:killed', {
      id: vFlail.id,
      killerId: h.state.playerId,
      weaponId: 'mod_mass_flail_rig',
    });
    assert.equal(h.state.run.lastEarned.reason, 'Tow Flail');

    // Arena collision via presentation.impactLink
    h.bus.emit('entity:killed', {
      id: vArena.id,
      killerId: h.state.playerId,
      presentation: {
        impactLink: { tag: 'terrain_collision' },
      },
    });
    assert.equal(h.state.run.lastEarned.reason, 'The arena');

    // Chain detonation via presentation.cause
    h.bus.emit('entity:killed', {
      id: vChain.id,
      killerId: h.state.playerId,
      presentation: {
        cause: 'chain_detonation',
      },
    });
    assert.equal(h.state.run.lastEarned.reason, 'Chain blast');
  } finally {
    h.destroy();
  }
});
