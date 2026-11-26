// A cloaked player is lost, searched for, and found again — one rule for every enemy brain
// (src/ai/playerAwareness.js, read by the pack brain, fodder cohorts and the tactical stack's
// forced pilot track). Owner/director 2026-11-20: going dark must actually lose the horde.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AWARENESS_REACTION_S, AWARENESS_REVEAL_HOLD_S, SWARM_CLOAK_ESCAPE_S,
  bindPlayerAwareness, playerFixFor, updatePlayerAwareness,
} from '../src/ai/playerAwareness.js';
import { PackBrain } from '../src/ai/pack/packBrain.js';
import { createBus } from '../src/core/eventBus.js';

function world({ swarm = false } = {}) {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, data: {} };
  const entities = new Map([[1, player]]);
  const state = {
    playerId: 1, tick: 600, simTime: 10, entities, entityList: [player], input: { actions: {} },
    runtime: { features: { massline2: { enabled: true, cloak: true } } },
    massline2: {},
    ...(swarm ? { run: { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 3 } } : {}),
  };
  const observer = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 600, z: 0 }, vel: { x: 0, z: 0 } };
  entities.set(2, observer);
  return { state, player, observer };
}
const step = (state, seconds) => {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) { state.tick += 1; state.simTime += 1 / 60; updatePlayerAwareness(state); }
};
const cloak = (state) => { state.massline2.cloak = { active: true, radius: 200 }; };

test('uncloaked: the fix is the live player and no awareness state is written', () => {
  const { state, observer } = world();
  updatePlayerAwareness(state);
  const fix = playerFixFor(state, observer, {});
  assert.equal(fix.seen, true);
  assert.equal(state.aiAwareness, undefined, 'a fight that never cloaks keeps byte-identical state');
});

test('a cloaked player is dropped as a target after the reaction window, held at the last known position', () => {
  const { state, player, observer } = world();
  updatePlayerAwareness(state);
  cloak(state);
  updatePlayerAwareness(state);
  step(state, AWARENESS_REACTION_S * 0.5);
  assert.equal(playerFixFor(state, observer, {}).seen, true, 'inside the reaction window the hull still has it');
  const lastX = player.pos.x;
  step(state, AWARENESS_REACTION_S);
  player.pos.x = -900; // the pilot slips away dark
  const fix = playerFixFor(state, observer, {});
  assert.equal(fix.seen, false, 'dropped within the reaction window');
  assert.equal(fix.x, lastX, 'the search goes to the last known position, not the live one');
  // Inside the detection ring the cloak hides nothing.
  observer.pos.x = player.pos.x + 50;
  assert.equal(playerFixFor(state, observer, {}).seen, true);
});

test('a shot, a power or a collision reveals the cloaked player for a moment', () => {
  const { state, observer } = world();
  const bus = createBus();
  bindPlayerAwareness(bus, () => state);
  cloak(state); updatePlayerAwareness(state); step(state, 1);
  assert.equal(playerFixFor(state, observer, {}).seen, false);
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(playerFixFor(state, observer, {}).seen, true, 'a shot reveals');
  step(state, AWARENESS_REVEAL_HOLD_S + 0.1);
  assert.equal(playerFixFor(state, observer, {}).seen, false, 'the reveal is a moment, not the cloak ending');
  state.input.actions.deployRepulsor = true; step(state, 1 / 60); state.input.actions.deployRepulsor = false;
  assert.equal(playerFixFor(state, observer, {}).seen, true, 'a power reveals');
  step(state, AWARENESS_REVEAL_HOLD_S + 0.1);
  bus.emit('physics:impact', { playerInvolved: true });
  assert.equal(playerFixFor(state, observer, {}).seen, true, 'a collision on the hull reveals');
});

test('in Swarm the arena-wide awareness closes in after the escape window', () => {
  const { state, observer } = world({ swarm: true });
  cloak(state); updatePlayerAwareness(state);
  step(state, SWARM_CLOAK_ESCAPE_S - 0.5);
  assert.equal(playerFixFor(state, observer, {}).seen, false, 'a short escape');
  step(state, 1);
  assert.equal(playerFixFor(state, observer, {}).seen, true, 'not invisibility for a round');
  const adventure = world();
  cloak(adventure.state); updatePlayerAwareness(adventure.state); step(adventure.state, SWARM_CLOAK_ESCAPE_S + 2);
  assert.equal(playerFixFor(adventure.state, adventure.observer, {}).seen, false, 'Adventure has no arena timeout');
});

test('pack-brain hulls stop attacking, converge on the last known position and search there', () => {
  const { state, player } = world({ swarm: true });
  state.entities.delete(2);
  const ships = [player];
  for (let i = 0; i < 4; i++) {
    const e = { id: 10 + i, type: 'ship', alive: true, team: 1, radius: 12, rot: 0,
      pos: { x: 700 + i * 40, z: 300 }, vel: { x: 0, z: 0 },
      data: { runCohort: 'survival', lootTableId: 'wasp_swarmer', ai: { wingId: 'w', activity: { kind: 'attack_run' } } } };
    state.entities.set(e.id, e); ships.push(e);
  }
  const requests = new Map();
  const events = [];
  const ctx = { bus: { emit: (n, p) => events.push({ n, p }) }, maneuverPort: { request: (r) => requests.set(r.entityId, r) } };
  const brain = new PackBrain({ seed: 7 });
  brain.step(state, ctx, ships, state.tick);
  cloak(state);
  for (let i = 0; i < 90; i++) { state.tick += 1; state.simTime += 1 / 60; updatePlayerAwareness(state); brain.step(state, ctx, ships, state.tick); }
  player.pos.x = 1600; player.pos.z = 1600; // gone dark, the far side of the pack
  for (let i = 0; i < 30; i++) { state.tick += 1; state.simTime += 1 / 60; updatePlayerAwareness(state); brain.step(state, ctx, ships, state.tick); }
  const lost = events.filter((e) => e.n === 'ai:targetLost');
  assert.equal(lost.length, 4, 'every hull that was tracking announces it lost the target');
  for (const e of ships.slice(1)) {
    const r = brain.records.get(e.id);
    assert.ok(r.searching, `hull ${e.id} is searching`);
    assert.notEqual(r.phase, 1, 'no tell while searching'); assert.notEqual(r.phase, 2, 'no strike while searching');
    const req = requests.get(e.id);
    // Steering toward the last known position near the origin, not toward the hidden pilot.
    const toFix = Math.atan2(0 - e.pos.z, 0 - e.pos.x);
    const toHidden = Math.atan2(1600 - e.pos.z, 1600 - e.pos.x);
    const d = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    assert.ok(d(req.targetHeading, toFix) < 1.2, `hull ${e.id} heads for the last known position`);
    assert.ok(d(req.targetHeading, toFix) < d(req.targetHeading, toHidden), `hull ${e.id} does not chase the hidden pilot`);
    assert.ok(Math.abs(req.forceLocal.forward) + Math.abs(req.forceLocal.right) > 0, 'a search moves; it never freezes');
  }
});
