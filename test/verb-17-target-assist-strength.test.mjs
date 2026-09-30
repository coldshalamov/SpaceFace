// VERB-17: auto-target assist has an off and a strength in Gameplay settings.
// Full is today's authored correction (the default — nothing already flying changes);
// off yields zero aim correction; light/standard converge lazily on the same solution.
// The key persists with the rest of gameplay settings; the contextual targetAssistDisabled
// kill-switch keeps its own semantics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  createAutoTargetRuntime,
  projectLockedReticle,
  targetAssistScale,
  tickAutoTarget,
} from '../src/combat/autoTargetMode.js';

function boot(strength) {
  const state = createGameState(4242);
  state.mode = 'flight';
  if (strength !== undefined) state.settings.gameplay.targetAssistStrength = strength;
  state.entities.clear();
  state.entityList.length = 0;
  const player = {
    id: 1, type: 'ship', alive: true, flags: {}, team: 0, radius: 14,
    pos: { x: 0, z: 0 }, vel: { x: 152, z: 0 }, rot: 0, mass: 1,
    data: { weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 320 }] },
  };
  const target = {
    id: 2, type: 'ship', alive: true, flags: {}, team: 1, radius: 6,
    pos: { x: -180, z: 90 }, vel: { x: 35, z: 65 }, rot: 0, mass: 1,
    data: { combat: { targetId: 1 } },
  };
  state.entities.set(1, player);
  state.entities.set(2, target);
  state.entityList.push(player, target);
  state.playerId = 1;
  state.player.targetId = 2;
  state.input.autoFire = false;
  const RAW = 0.7;
  state.input.aimAngle = RAW;
  const bus = createBus();
  const retargets = [];
  bus.on('ui:targetNearestHostileToPlayer', (p) => retargets.push(p));
  return { state, bus, retargets, RAW };
}

function tick(harness) {
  tickAutoTarget(harness.state, 1 / 60, harness.bus, createAutoTargetRuntime());
}

test('full is the default and applies the authored correction', () => {
  const def = boot();
  assert.equal(def.state.settings.gameplay.targetAssistStrength, 'full');
  assert.equal(targetAssistScale(def.state), 1);
  tick(def);
  const fullAngle = def.state.input.aimAngle;
  assert.notEqual(fullAngle, def.RAW, 'the assist corrects raw aim');
  assert.ok(def.state.input.autoAim && def.state.input.autoAim.targetId === 2, 'the provenance marker names the target');

  const explicit = boot('full');
  tick(explicit);
  assert.equal(explicit.state.input.aimAngle, fullAngle, 'explicit full matches the default');
});

test('off yields zero aim correction and stays quiet', () => {
  const harness = boot('off');
  assert.equal(targetAssistScale(harness.state), 0);
  tick(harness);
  assert.equal(harness.state.input.aimAngle, harness.RAW, 'raw aim untouched, exactly');
  assert.ok(!harness.state.input.autoAim, 'no provenance marker');
  assert.equal(harness.retargets.length, 0, 'no re-arm emit');
  assert.equal(projectLockedReticle(harness.state, () => ({ x: 1, y: 1 })), null, 'no lead pip');
});

test('light converges partway to the same solution', () => {
  const full = boot('full');
  tick(full);
  const light = boot('light');
  tick(light);
  const a = light.state.input.aimAngle;
  assert.ok(a !== light.RAW && a !== full.state.input.aimAngle, 'between raw and full');
  // A second tick converges further toward the full solution.
  tick(light);
  const b = light.state.input.aimAngle;
  const dist = (v) => Math.abs(v - full.state.input.aimAngle);
  assert.ok(dist(b) < dist(a), 'lazy tracking converges');
});

test('unknown values fail to full, never to off', () => {
  assert.equal(targetAssistScale(boot('turbo').state), 1);
  assert.equal(targetAssistScale(boot(null).state), 1);
});

test('the key persists and a runtime reset does not clear it', () => {
  const harness = boot('light');
  const roundTripped = JSON.parse(JSON.stringify(harness.state.settings));
  assert.equal(roundTripped.gameplay.targetAssistStrength, 'light');
  // reset() rebuilds runtime input fields only; the setting is not runtime state.
  harness.state.input.autoFire = true;
  harness.state.input.autoAim = { targetId: 2, leadSpeed: 320 };
  harness.state.input.autoFire = false;
  harness.state.input.autoAim = null;
  assert.equal(harness.state.settings.gameplay.targetAssistStrength, 'light');
});
