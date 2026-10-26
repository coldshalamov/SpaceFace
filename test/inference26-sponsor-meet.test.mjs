import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import * as anomaly from '../src/data/encounters/403-lived-anomaly-deep-escort-none-logic.js';
import * as refinery from '../src/data/encounters/423-lived-refinery-approach-convoy-helix-k1.js';
import * as nebula from '../src/data/encounters/429-lived-nebula-fog-escort-verge-layers-none.js';

const scenes = [anomaly, refinery, nebula];

// Real compiled scene/interpreter; entity poses below exercise the physical predicate,
// not native-flight acceptance. The helm destinations verify that the paid handoff
// actually stops moving instead of asking a stopped player to shadow an orbit.
function fixture(scene, choice = 'b') {
  const state = createGameState(4242);
  state.player.credits = 500;
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  const live = { id: scene.spec.id, vars: {}, ids: [], roles: {}, anchor: { x: 200, z: 0 } };
  const calls = { charges: [], grants: [], reps: [], resolved: [], aborts: [], speech: [] };
  let now = 100, nextId = 10;
  const director = {
    now: () => now,
    player: () => player,
    say(_live, _channel, line) { calls.speech.push(line); },
    offerChoices() {},
    spawnShips(row, ships) {
      return ships.map(ship => {
        const id = nextId++;
        state.entities.set(id, { id, type: 'ship', alive: true,
          pos: { ...ship.pos }, vel: { x: 0, z: 0 }, data: {} });
        row.ids.push(id); row.roles[id] = ship.role;
        return id;
      });
    },
    entsOf: row => row.ids.map(id => state.entities.get(id)),
    charge(amount, reason) { calls.charges.push({ amount, reason }); state.player.credits -= amount; },
    grant(amount) { calls.grants.push(amount); },
    rep(factionId, delta) { calls.reps.push({ factionId, delta }); },
    resolve(row, outcome) { calls.resolved.push(outcome); row.phase = 'done'; },
    abort(row, reason) { calls.aborts.push(reason); row.phase = 'done'; },
  };
  scene.runtime.fire(director, live, state);
  for (let i = 0; live.phase !== 'offer' && i < 20; i++) {
    now = live.deadlineAt + 0.01;
    scene.runtime.tick(director, live, state, now);
  }
  assert.equal(live.phase, 'offer');
  // Read a genuine moving-orbit request before taking the branch.
  now += 0.1;
  scene.runtime.tick(director, live, state, now);
  const lead = state.entities.get(live.ids[0]);
  assert.equal(lead.data.ai.activity.kind, 'transit');
  scene.runtime.choose(director, live, state, choice);
  const tick = (seconds) => {
    now += seconds;
    scene.runtime.tick(director, live, state, now);
  };
  return { state, player, lead, live, calls, tick, director };
}

for (const scene of scenes) {
  test(`${scene.encounterOrder}: paid relief brakes for a reachable slow handoff and requires the full hold`, () => {
    const h = fixture(scene);
    const berth = { ...h.lead.pos };
    h.tick(0.01);
    assert.equal(h.lead.data.ai.activity.kind, 'loiter', 'the sponsor branch must leave orbit/ring choreography');
    assert.equal(h.lead.data.ai.activity.anchorVelocity, null, 'the handoff has a fixed berth');
    assert.deepEqual(h.lead.data.ai.activity.anchor, berth);
    assert.equal(h.state.player.credits, 476);
    assert.deepEqual(h.calls.reps, [], 'paying alone earns no physical handoff credit');

    h.player.pos = { x: berth.x + 45, z: berth.z };
    h.player.vel.x = 6;
    h.tick(3);
    assert.deepEqual(h.calls.resolved, [], 'a fast close pass does not complete the handoff');
    h.player.vel.x = 0;
    h.tick(0.01);
    h.tick(1.9);
    assert.deepEqual(h.calls.resolved, [], 'less than the two-count remains incomplete');
    h.player.pos.x = berth.x + 61;
    h.tick(0.01);
    h.player.pos.x = berth.x + 45;
    h.tick(0.01);
    h.tick(1.9);
    assert.deepEqual(h.calls.resolved, [], 'leaving the close ring resets the continuous hold');
    h.tick(0.11);
    assert.deepEqual(h.calls.resolved, ['b']);
    assert.deepEqual(h.calls.reps, [{ factionId: scene.spec.factionId, delta: 3 }]);
    assert.deepEqual(h.calls.grants, []);
    assert.deepEqual(h.calls.aborts, []);
    assert.equal(h.calls.charges.length, 1);
    assert.deepEqual(h.lead.data.ai.activity.anchor, berth, 'the berth stays fixed throughout the handoff');
  });

  test(`${scene.encounterOrder}: missed relief retains its one debit without paying success`, () => {
    const h = fixture(scene);
    scene.runtime.choose(h.director, h.live, h.state, 'b');
    h.tick(121);
    assert.deepEqual(h.calls.aborts, ['physical_timeout']);
    assert.equal(h.calls.charges.length, 1);
    assert.equal(h.state.player.credits, 476);
    assert.deepEqual(h.calls.grants, []);
    assert.deepEqual(h.calls.reps, []);
    assert.ok(h.calls.speech.some(line => line.includes('24 cr stays spent')));
  });

  test(`${scene.encounterOrder}: unpaid escort still keeps its moving lead`, () => {
    const h = fixture(scene, 'a');
    h.tick(0.1);
    assert.equal(h.lead.data.ai.activity.kind, 'transit');
    assert.ok(Math.hypot(h.lead.data.ai.activity.anchorVelocity.x,
      h.lead.data.ai.activity.anchorVelocity.z) > 70);
    assert.deepEqual(h.calls.charges, []);
  });
}
