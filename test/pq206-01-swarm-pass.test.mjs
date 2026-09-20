import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateCrucibleDuel } from '../scripts/lib/bench/crucibleBench.mjs';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';

test('swarm lines up during its full warning, then leaves a bounded firing window', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 4242 });
  const perception = {
    self: { id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0,
      activity: { kind: 'attack_run', anchor: { x: 0, z: 0 }, leashRadius: 2200 },
      roe: 'weapons_free' },
    contacts: [{ id: 1, kind: 'ship', hostile: true, alive: true, valid: true,
      visible: true, confidence: 1, pos: { x: 330, z: 0 }, vel: { x: -140, z: 0 } }],
    events: [],
  };
  const step = tick => runtime.update({ tick, entityId: 2, doctrineId: 'swarm_pack', perception });
  const cue = step(0);
  assert.equal(cue.phase, 'engine_flare', 'announce the attack before the close firing band');
  assert.equal(cue.faceTarget, true, 'the nose tracks the target while the warning plays');
  for (let tick = 0; tick < 30; tick++) {
    const warning = step(tick);
    assert.equal(warning.fireWindow, false, 'all thirty warning ticks remain safe');
    assert.equal(warning.allowedActionId, null);
  }
  assert.equal(step(30).fireWindow, true);
  const recovery = step(150);
  assert.equal(recovery.phase, 'extend', 'a missed pass still ends, giving the player a counterattack');
  assert.equal(recovery.fireWindow, false);
});

// VISION: fast physics combat requires enemies worth responding to. A fragile attacker
// must land a real burst before the starter gun kills it, without buying that burst with HP.
for (const seed of [4242, 8008, 13502, 47, 90210]) {
  test(`swarm opening pass threatens the armed, moving starter (seed ${seed})`, async () => {
    const { duel } = await simulateCrucibleDuel({
      archetypeId: 'wasp_swarmer', seed, tickCap: 600,
    });
    console.log(JSON.stringify({ seed, hits: duel.enemyHitsOnPlayer,
      damage: duel.playerDamageTaken, seconds: duel.fightSeconds,
      firstFire: duel.timeToFirstEnemyFireS }));
    assert.ok(duel.enemyHitsOnPlayer >= 2, 'a burst must land, not a single token hit');
    assert.ok(duel.playerDamageTaken >= 6, 'the opening burst must inflict more than token damage');
    assert.ok(duel.timeToFirstPlayerDamageS < 3, 'the damage arrives on approach, not a later lucky pass');
    assert.equal(duel.doctrinePhaseTransitions['swarm_pack:strike'], 1, 'one attack pass supplies the burst');
    assert.equal(duel.stopReason, 'wing_dead', 'the starter still defeats a lone fragile swarmer');
    assert.ok(duel.fightSeconds < 8, 'a light attacker must not become a damage sponge');
    assert.ok(duel.telegraphKinds.engine_flare >= 1, 'the strike keeps its visible warning');
  });
}
