// The nemesis acceptance harness injects its own pacing fixture, so the live policy in
// core/coreSystem.js (canStartNemesisEncounter) was never exercised with the real engine and host.
// It vetoed any pending rival request — and the request under approval is always pending — so in
// the shipped game Orra never deployed, and because the engine announced before asking, every
// refusal re-armed the 15 s retry: COUNTEREXAMPLE INBOUND every ~21 s, nobody arriving, during
// onboarding and arena runs too. These drive the production helpers end to end.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createNemesisSystem } from '../src/systems/nemesis.js';
import { createNemesisEncounterHost } from '../src/nemesis/encounterHost.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

function boot({ onboarding = false, run = null } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.meta = { seed: 4242 };
  state.world = { ...(state.world || {}), currentSectorId: 'sector_helios_prime' };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: { intent: {} } });
  state.playerId = player.id;
  player.isPlayer = true;
  state.onboarding = { active: onboarding, finished: !onboarding };
  if (run) state.run = run;
  helpers.spawnBudget = { request: (n) => n, release() {}, releaseSome() {} };
  const events = [];
  for (const name of ['nemesis:announced', 'nemesis:encounterRejected', 'nemesis:engaged']) {
    bus.on(name, (p) => events.push({ name, t: state.simTime, reason: p && p.reason }));
  }
  const engine = createNemesisSystem();
  const host = createNemesisEncounterHost({ makeSpawnSpec: makeEnemySpawnSpec });
  const ctx = { state, bus, helpers,
    registry: { get: (n) => (n === 'nemesis' ? engine : n === 'nemesisEncounter' ? host : null) } };
  engine.init(ctx);
  host.init(ctx);
  const advanceTo = (seconds) => {
    while (state.simTime < seconds) {
      state.tick += 1;
      state.simTime = state.tick / 60;
      engine.update(1 / 60, state);
      host.update(1 / 60, state);
      if (typeof bus.flush === 'function') bus.flush();
    }
  };
  const count = (name) => events.filter((e) => e.name === name).length;
  return { state, helpers, events, advanceTo, count, close() { engine.destroy(); host.destroy(); } };
}

test('with the live pacing policy Orra arrives after one six-second warning', () => {
  const h = boot();
  try {
    h.advanceTo(200);
    assert.equal(h.count('nemesis:announced'), 1);
    assert.equal(h.count('nemesis:engaged'), 1, 'the rival actually deploys');
    assert.equal(h.events.filter((e) => e.reason === 'pacing refused').length, 0);
    const warned = h.events.find((e) => e.name === 'nemesis:announced').t;
    const engaged = h.events.find((e) => e.name === 'nemesis:engaged').t;
    assert.ok(engaged - warned >= 6, 'the warning still lands before the arrival');
    assert.ok(h.state.nemesis.active, 'the encounter is live');
  } finally { h.close(); }
});

test('protected onboarding holds the rival without a single false warning', () => {
  const h = boot({ onboarding: true });
  try {
    h.advanceTo(300);
    assert.equal(h.count('nemesis:announced'), 0, 'no COUNTEREXAMPLE INBOUND while the tutorial owns the floor');
    assert.equal(h.count('nemesis:encounterRejected'), 0);
    h.state.onboarding = { active: false, finished: true };
    h.advanceTo(330);
    assert.equal(h.count('nemesis:announced'), 1, 'the warning follows once the rail is done');
    assert.equal(h.count('nemesis:engaged'), 1);
  } finally { h.close(); }
});

test('an arena run holds the rival without warning every retry', () => {
  const h = boot({ run: { kind: 'survival', phase: 'wave' } });
  try {
    h.advanceTo(400);
    assert.equal(h.count('nemesis:announced'), 0);
    assert.equal(h.state.nemesis.active, null);
  } finally { h.close(); }
});

test('the live policy still vetoes a different pending or active rival beat', () => {
  const h = boot();
  try {
    h.advanceTo(181);
    const pending = h.state.nemesis.pending;
    assert.ok(pending, 'the announced request is pending');
    const sectorId = h.state.world.currentSectorId;
    assert.equal(h.helpers.canStartNemesisEncounter({ requestId: pending.id, sectorId }, h.state), true);
    assert.equal(h.helpers.canStartNemesisEncounter({ requestId: 'nemesis:other', sectorId }, h.state), false);
    h.advanceTo(190);
    assert.ok(h.state.nemesis.active);
    assert.equal(h.helpers.canStartNemesisEncounter({ requestId: 'nemesis:next', sectorId }, h.state), false);
  } finally { h.close(); }
});
