// O12: a catch-up frame runs N fixed steps, but near-clock owners only run on the first. Physics
// consumes a control / impulse once per step, so the AI maneuver port and the planet runtime (which
// both feed that step) lost their input on every extra step: at a steady 30 fps NPCs got about half
// their thrust and planetary heat/drag accrued at half rate. Both are table owners now, and the
// maneuver port replays the frame's last maneuver on extra steps.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { shouldSkipSystemThisStep } from '../src/core/catchupPolicy.js';
import { SYSTEM_CLOCK, getSystemClock } from '../src/runtime/authoritativeSystemManifest.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { fields } from '../src/systems/fields.js';
import { world } from '../src/systems/world.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';

test('physical-integration owners are table clocks; the AI decision stays a near clock', () => {
  assert.equal(getSystemClock('aiPorts'), SYSTEM_CLOCK.TABLE);
  assert.equal(getSystemClock('planetRuntime'), SYSTEM_CLOCK.TABLE);
  assert.equal(getSystemClock('aiSlot'), SYSTEM_CLOCK.NEAR, 'decisions still run once per frame');
  const state = { runtime: { profileId: 'production' }, tick: 5, simCatchupIndex: 1 };
  assert.equal(shouldSkipSystemThisStep('aiPorts', state), false);
  assert.equal(shouldSkipSystemThisStep('planetRuntime', state), false);
  assert.equal(shouldSkipSystemThisStep('aiSlot', state), true);
});

// ── NPC thrust ────────────────────────────────────────────────────────────────────────────────
function aiFixture() {
  const helpers = {};
  const log = [];
  const brain = {
    // Stands in for the tactical AI stack: asks for full forward thrust once per decision step.
    name: 'aiSlot',
    request: true,
    init(ctx) { this.helpers = ctx.helpers; this.state = ctx.state; },
    update() {
      if (!this.request || !this.npc) return;
      this.helpers.aiManeuver.request({
        version: 1, entityId: this.npc.id, tick: this.state.tick, kind: 'pursue',
        forceLocal: { forward: 1, right: 0 }, torqueYaw: 0, reason: 'test',
      });
    },
  };
  const physicsProbe = {
    // Stands in for the physics owner: consumes whatever control is pending, once per step.
    name: 'physics',
    init(ctx) { this.state = ctx.state; },
    update() {
      const npc = brain.npc;
      const command = npc && consumePhysicsCommand(npc);
      const force = command && command.control ? command.control.force : null;
      log.push({ tick: this.state.tick, index: this.state.simCatchupIndex | 0, thrust: force ? Math.hypot(force.x, force.z) : 0 });
    },
  };
  const sim = createSimulation({ seed: 77, helpers, systems: [brain, aiPorts, physicsProbe] });
  const state = sim.state;
  state.runtime = { profileId: 'production' };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.physicsRuntime = { diagnostics: { backend: 'rapier-dynamic', sg02Ready: true } };
  state.mode = 'flight';
  brain.npc = helpers.spawnEntity({
    type: 'ship', team: 2, pos: { x: 500, z: 500 }, vel: { x: 0, z: 0 }, rot: 0, radius: 10,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  // Boot ticks (<=1) run every owner; start the measured frames past them.
  state.tick = 10;
  return { sim, state, brain, log };
}

function frame(sim, state, steps) {
  state.simCatchupIndex = 0;
  for (let i = 0; i < steps; i++) {
    sim.step(1 / 60);
    state.simCatchupIndex = (state.simCatchupIndex | 0) + 1;
  }
}

test('a two-step frame applies the NPC thrust on both physics steps', () => {
  const f = aiFixture();
  frame(f.sim, f.state, 1);
  frame(f.sim, f.state, 2);
  const [single, first, second] = f.log;
  assert.ok(single.thrust > 0, 'a one-step frame thrusts (unchanged behaviour)');
  assert.equal(first.index, 0);
  assert.equal(second.index, 1);
  assert.ok(first.thrust > 0, 'decision step thrusts');
  assert.ok(second.thrust > 0, 'the extra catch-up step used to lose the thrust entirely');
  assert.ok(Math.abs(second.thrust - first.thrust) < first.thrust * 0.05, 'same order, same thrust');
  f.sim.dispose();
});

test('a three-step frame thrusts on all three; a replay never outlives its frame', () => {
  const f = aiFixture();
  frame(f.sim, f.state, 3);
  assert.deepEqual(f.log.map((row) => row.thrust > 0), [true, true, true]);

  // Next frame the AI says nothing (e.g. the hull went quiet): no stale order may keep thrusting.
  f.brain.request = false;
  frame(f.sim, f.state, 2);
  assert.deepEqual(f.log.slice(3).map((row) => row.thrust), [0, 0]);
  f.sim.dispose();
});

test('single-step frames never replay: no request means no thrust', () => {
  const f = aiFixture();
  frame(f.sim, f.state, 1);
  f.brain.request = false;
  frame(f.sim, f.state, 1);
  frame(f.sim, f.state, 1);
  assert.deepEqual(f.log.map((row) => row.thrust > 0), [true, false, false]);
  f.sim.dispose();
});

test('a destroyed hull is not thrust after the frame that killed it', () => {
  const f = aiFixture();
  frame(f.sim, f.state, 1);
  f.brain.npc.alive = false;
  frame(f.sim, f.state, 2);
  assert.deepEqual(f.log.slice(1).map((row) => row.thrust), [0, 0]);
  f.sim.dispose();
});

// ── Planet effects ────────────────────────────────────────────────────────────────────────────
function planetHeatAfter(steps) {
  PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
  const helpers = {};
  const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const sim = createSimulation({ seed: 424213, helpers, systems: [worldRecords, fields, planetRuntime] });
  const state = sim.state;
  state.runtime = { profileId: 'production' };
  state.mode = 'flight';
  state.world.currentSectorId = PLANET_SITE.sectorId;
  sim.step(1 / 60);                       // registers the planet
  const rt = state.planet;
  const ship = helpers.spawnEntity({
    type: 'ship', isPlayer: true, pos: { x: rt.center.x + 760, z: rt.center.z }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, mass: 50,
  });
  state.playerId = ship.id;
  state.tick = 10;
  frame(sim, state, steps);
  const heat = rt.player.heat;
  sim.dispose();
  return heat;
}

test('planet heat accrues on every fixed step of a catch-up frame', () => {
  const one = planetHeatAfter(1);
  const two = planetHeatAfter(2);
  assert.ok(one > 0, 'the ship is inside the re-entry band and heats');
  assert.ok(Math.abs(two - 2 * one) < one * 0.01, `two steps heat twice as much (one ${one}, two ${two})`);
});
