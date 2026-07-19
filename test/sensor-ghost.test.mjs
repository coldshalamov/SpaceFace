/**
 * W05 sensor-ghost — sim-truth path A (scanner owns isGhost / ghostConfidence / revealStage).
 * No HUD/map/uiRoot edits; no wall clock / DOM.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  scanner,
  markEntityGhost,
  advanceGhostReveal,
  tickGhostEscape,
  ghostStreamUnit,
  GHOST_REVEAL_STAGE_MAX,
} from '../src/systems/scanner.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';

function boot(seed = 9051) {
  const sim = createSimulation({ seed, systems: [scanner] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_test_ghost';
  state.world.activeSector = { id: 'sector_test_ghost', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const events = { revealed: [], escaped: [] };
  bus.on('scanner:ghostRevealed', (p) => events.revealed.push(p));
  bus.on('scanner:ghostEscaped', (p) => events.escaped.push(p));
  return { sim, state, bus, player, events };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function clearCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

test('known-vs-live: ghost flags diverge from fully-known live contact', () => {
  const t = boot();
  const ghost = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 200, z: 0 }, radius: 12, hull: 80, hullMax: 80,
    data: { lootTableId: 'quiet_ghost', ai: { archetype: 'sniper' } },
  });
  const known = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: -200, z: 0 }, radius: 12, hull: 80, hullMax: 80,
    data: { lootTableId: 'reaver_pirate', ai: { archetype: 'pirate' } },
  });
  markEntityGhost(ghost, { spawnedAt: t.state.simTime, revealStage: 0 });

  assert.equal(ghost.alive, true, 'live entity exists');
  assert.equal(ghost.data.isGhost, true, 'known state is uncertain');
  assert.ok(ghost.data.ghostConfidence >= 0 && ghost.data.ghostConfidence <= 1);
  assert.equal(ghost.data.revealStage, 0);
  assert.equal(!!known.data.isGhost, false, 'non-ghost stays known');
  assert.notEqual(ghost.data.kind, known.data.kind || 'ship');
});

test('reveal determinism: same seeds yield same stages across runs', () => {
  function runOnce(seed) {
    const t = boot(seed);
    const ghost = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: 180, z: 40 }, radius: 12, hull: 80, hullMax: 80,
      data: { lootTableId: 'quiet_ghost' },
    });
    markEntityGhost(ghost, { spawnedAt: 0, revealStage: 0 });
    const stages = [ghost.data.revealStage];
    for (let i = 0; i < GHOST_REVEAL_STAGE_MAX + 1; i++) {
      pulse(t);
      stages.push(ghost.data.revealStage | 0);
      if (ghost.data.ghostFullyRevealed) break;
      clearCooldown(t);
    }
    return {
      stages,
      confidence: ghost.data.ghostConfidence,
      revealed: t.events.revealed.length,
      isGhost: !!ghost.data.isGhost,
      units: [
        ghostStreamUnit(t.state, ghost.id, 'pulse:1'),
        ghostStreamUnit(t.state, ghost.id, 'pulse:2'),
      ],
    };
  }
  const a = runOnce(4242);
  const b = runOnce(4242);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'identical fixed-tick runs are byte-equal');
  // Different seed must be able to diverge (not a trivial constant).
  const c = runOnce(9991);
  assert.ok(
    JSON.stringify(a.units) !== JSON.stringify(c.units)
    || JSON.stringify(a.stages) !== JSON.stringify(c.stages),
    'different seeds produce distinct streams or stages',
  );
});

test('far reveal uses independent entity-keyed streams on both sides of stage thresholds', () => {
  const state = { meta: { seed: 4242 } };
  assert.equal(ghostStreamUnit(state, 2, 'pulse:1'), 0.6743);
  assert.equal(ghostStreamUnit(state, 3, 'pulse:1'), 0.782);
  assert.equal(ghostStreamUnit(state, 2, 'pulse:1'), 0.6743, 'same id and salt reproduce the same stream unit');
  assert.notEqual(
    ghostStreamUnit(state, 2, 'pulse:1'),
    ghostStreamUnit(state, 3, 'pulse:1'),
    'different entity ids own independent streams',
  );

  const stageZeroAdvance = ghostEntity(2, 0);
  const stageZeroHold = ghostEntity(3, 0);
  assert.equal(advanceGhostReveal(stageZeroAdvance, state, {
    distance: Number.MAX_VALUE, near: false, pulseIndex: 0,
  }).stage, 1, '0.6743 advances stage 0 even at extreme range');
  assert.equal(advanceGhostReveal(stageZeroHold, state, {
    distance: Number.MAX_VALUE, near: false, pulseIndex: 0,
  }).stage, 0, '0.782 holds stage 0 at extreme range');

  assert.equal(ghostStreamUnit(state, 11, 'pulse:3'), 0.7891);
  assert.equal(ghostStreamUnit(state, 'ghost_a', 'pulse:3'), 0.8604);
  const laterAdvance = ghostEntity(11, 1);
  const laterHold = ghostEntity('ghost_a', 1);
  assert.equal(advanceGhostReveal(laterAdvance, state, {
    distance: Number.MAX_VALUE, near: false, pulseIndex: 2,
  }).stage, 2, '0.7891 advances the later-stage far gate');
  assert.equal(advanceGhostReveal(laterHold, state, {
    distance: Number.MAX_VALUE, near: false, pulseIndex: 2,
  }).stage, 1, '0.8604 holds the later-stage far gate');

  const sameA = ghostEntity(2, 0);
  const sameB = ghostEntity(2, 0);
  assert.deepEqual(
    advanceGhostReveal(sameA, state, { distance: Number.MAX_VALUE, near: false, pulseIndex: 0 }),
    advanceGhostReveal(sameB, state, { distance: Number.MAX_VALUE, near: false, pulseIndex: 0 }),
    'separate ghosts with the same stable id consume the same keyed draw',
  );
});

test('full reveal clears isGhost and emits scanner:ghostRevealed', () => {
  const t = boot(77);
  const ghost = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 100, z: 0 }, radius: 12, hull: 80, hullMax: 80, data: {},
  });
  markEntityGhost(ghost, { revealStage: GHOST_REVEAL_STAGE_MAX - 1 });
  // Force near-range advance to full.
  const result = advanceGhostReveal(ghost, t.state, { distance: 50, near: true, pulseIndex: 9 });
  assert.equal(result.revealed, true);
  assert.equal(ghost.data.isGhost, false);
  assert.equal(ghost.data.ghostFullyRevealed, true);
  assert.equal(ghost.data.ghostConfidence, 1);

  // Pulse path also emits.
  const g2 = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 90, z: 10 }, radius: 12, hull: 80, hullMax: 80, data: {},
  });
  markEntityGhost(g2, { revealStage: GHOST_REVEAL_STAGE_MAX - 1 });
  pulse(t);
  assert.ok(t.events.revealed.some((e) => e.entityId === g2.id));
  assert.equal(g2.data.isGhost, false);
});

test('escape path: unrevealed ghost beyond range holds then despawns with event', () => {
  const t = boot(301);
  const ghost = t.sim.spawn({
    type: 'ship', team: 1,
    pos: { x: 2600, z: 0 },
    radius: 12, hull: 80, hullMax: 80, data: {},
  });
  markEntityGhost(ghost, { spawnedAt: 0 });
  assert.equal(ghost.data.ghostEscapeRange, 2400);
  assert.equal(ghost.data.ghostEscapeHoldS, 18);
  // First ticks: beyond range but hold not satisfied.
  t.sim.runTicks(Math.ceil(2 / SIM_DT));
  assert.equal(ghost.alive, true);
  assert.equal(t.events.escaped.length, 0);

  // Advance past hold.
  t.sim.runTicks(Math.ceil(19 / SIM_DT));
  assert.equal(ghost.alive, false);
  assert.equal(t.events.escaped.length, 1);
  assert.equal(t.events.escaped[0].entityId, ghost.id);
  assert.equal(t.events.escaped[0].reason, 'beyond_escape_range');
});

test('escape range is strict beyond with hard-coded 2399/2400/2401 sides', () => {
  const inspect = (distance) => {
    const t = boot(8);
    const ghost = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: distance, z: 0 }, radius: 12, hull: 50, hullMax: 50, data: {},
    });
    markEntityGhost(ghost, { escapeRange: 2400, escapeHoldS: 18 });
    const result = tickGhostEscape(ghost, t.state, 100);
    return { result, beyondSince: ghost.data.ghostBeyondSince, alive: ghost.alive };
  };

  assert.equal(inspect(2399).beyondSince, null);
  assert.equal(inspect(2400).beyondSince, null, 'at-bound is still inside; only beyond starts the hold');
  const beyond = inspect(2401);
  assert.equal(beyond.beyondSince, 100);
  assert.equal(beyond.result.escaped, false);
  assert.equal(beyond.alive, true);
});

test('escape hold is independently pinned just before, at, and after 18 seconds', () => {
  const elapsedResult = (elapsed) => {
    const t = boot(18);
    const ghost = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: 2401, z: 0 }, radius: 12, hull: 50, hullMax: 50, data: {},
    });
    markEntityGhost(ghost, { escapeRange: 2400, escapeHoldS: 18 });
    tickGhostEscape(ghost, t.state, 100);
    return tickGhostEscape(ghost, t.state, 100 + elapsed);
  };

  assert.equal(elapsedResult(17.999).escaped, false);
  assert.equal(elapsedResult(18).escaped, true);
  assert.equal(elapsedResult(18.001).escaped, true);
});

test('shape 327 wiring: ghost_on_the_bearing ambush marks quiet_ghost as ghost', () => {
  const ambush = ENCOUNTER_SCRIPTS.ambush;
  assert.ok(ambush && typeof ambush.fire === 'function');
  const t = boot(327);
  const spawned = [];
  const d = {
    now: () => t.state.simTime || 0,
    spawnShips(_live, ships) {
      const ids = [];
      for (const sh of ships) {
        const ent = t.sim.spawn({
          type: 'ship', team: 1, pos: sh.pos || { x: 300, z: 0 }, radius: 12,
          hull: 80, hullMax: 80,
          data: {
            lootTableId: sh.archetype,
            ai: { archetype: sh.archetype === 'quiet_ghost' ? 'sniper' : 'brawler', passive: true },
          },
        });
        ids.push(ent.id);
        spawned.push(ent);
      }
      return ids;
    },
    abort: () => {},
    say: () => {},
    playerNearZone: () => false,
  };
  const live = {
    shapeId: 'ghost_on_the_bearing',
    plan: {
      ships: [
        { archetype: 'quiet_ghost', pos: { x: 400, z: 0 } },
        { archetype: 'lancer_sniper', pos: { x: 450, z: 20 } },
      ],
    },
    data: {},
    deadlineAt: 0,
  };
  ambush.fire(d, live, t.state);
  assert.equal(spawned.length, 2);
  assert.equal(spawned[0].data.isGhost, true);
  assert.equal(spawned[0].data.revealStage, 0);
  assert.ok(spawned[0].data.ghostConfidence >= 0 && spawned[0].data.ghostConfidence <= 1);
  assert.equal(spawned[1].data.isGhost, true);
});

test('no wall clock or DOM in ghost path', () => {
  // Structural: helpers accept state/simTime only; suite never imports document/window.
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
  const t = boot(1);
  const ghost = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 50, z: 0 }, radius: 10, hull: 40, hullMax: 40, data: {},
  });
  markEntityGhost(ghost, { spawnedAt: t.state.simTime });
  advanceGhostReveal(ghost, t.state, { near: true, distance: 40 });
  tickGhostEscape(ghost, t.state, t.state.simTime);
  assert.ok(Number.isFinite(t.state.simTime));
});

function ghostEntity(id, revealStage) {
  const entity = {
    id,
    type: 'ship',
    alive: true,
    pos: { x: Number.MAX_VALUE, z: 0 },
    data: {},
  };
  markEntityGhost(entity, { revealStage });
  return entity;
}
