// AL-HF-01 second look: the npc_grudge hold must die with the activity that armed it. A victim
// whose grudge is replaced — another offender, or no grudge at all — cannot stay parked dormant
// on the old armed tick. Exercised on the pure CombatDoctrineRuntime (no sim stack) so the law
// is proven even while unrelated sim systems are mid-flight.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { ContactKind } from '../src/ai/contracts.js';

const DOCTRINE = CombatDoctrineId.INTERCEPTOR_FLYBY || 'interceptor_flyby';

function hostile(id) {
  return {
    kind: ContactKind.SHIP, hostile: true, alive: true, valid: true, visible: true,
    confidence: 1, id, pos: { x: 400, z: 0 },
  };
}

function selfWith(activity) {
  return {
    roe: 'weapons_free',
    pos: { x: 0, z: 0 },
    factionBehavior: null,
    noFireResponseWindowS: 2,
    ai: {},
    activity,
  };
}

function tick(runtime, t, entityId, perception) {
  return runtime.update({ tick: t, entityId, doctrineId: DOCTRINE, perception });
}

test('the hold arms on a live matching grudge, then clears when the grudge is replaced', () => {
  const rt = new CombatDoctrineRuntime({ seed: 7 });
  const grudge = { kind: 'attack_run', reason: 'npc_grudge:42', targetId: 42, startedTick: 10 };
  const perception = { self: selfWith(grudge), contacts: [hostile(42)] };

  tick(rt, 20, 9, perception);
  const armed = rt.byEntity.get(9).holdUntilTick;
  assert.equal(armed, 10 + Math.ceil(2 * 60), 'the hold arms to startedTick + window');

  // Same doctrine target, different assignment: the grudge moved on — the old hold cannot stay.
  perception.self = selfWith({ kind: 'attack_run', reason: 'squad_call', targetId: 42, startedTick: 21 });
  tick(rt, 21, 9, perception);
  assert.equal(rt.byEntity.get(9).holdUntilTick, null,
    'a non-grudge activity on the same record clears the stale hold immediately');
});

test('the hold clears when the grudge retargets but the doctrine target is unchanged', () => {
  const rt = new CombatDoctrineRuntime({ seed: 7 });
  const grudgeA = { kind: 'attack_run', reason: 'npc_grudge:42', targetId: 42, startedTick: 10 };
  const perception = { self: selfWith(grudgeA), contacts: [hostile(42)] };
  tick(rt, 20, 9, perception);
  assert.ok(rt.byEntity.get(9).holdUntilTick != null);

  // The grudge now names offender 99; the doctrine still closes on 42 — no stale hold.
  perception.self = selfWith({ kind: 'attack_run', reason: 'npc_grudge:99', targetId: 99, startedTick: 21 });
  tick(rt, 21, 9, perception);
  assert.equal(rt.byEntity.get(9).holdUntilTick, null,
    'a grudge aimed elsewhere releases the hull at once');
});

test('a fresh grudge on a remade record re-arms with the new window', () => {
  const rt = new CombatDoctrineRuntime({ seed: 7 });
  const perception = {
    self: selfWith({ kind: 'attack_run', reason: 'npc_grudge:42', targetId: 42, startedTick: 10 }),
    contacts: [hostile(42)],
  };
  tick(rt, 20, 9, perception);
  const first = rt.byEntity.get(9).holdUntilTick;
  assert.equal(first, 130);

  // Doctrine target flips to the new offender — record is remade and re-arms from 99's start.
  perception.contacts = [hostile(99)];
  perception.self = selfWith({ kind: 'attack_run', reason: 'npc_grudge:99', targetId: 99, startedTick: 25 });
  tick(rt, 30, 9, perception);
  assert.equal(rt.byEntity.get(9).holdUntilTick, 25 + Math.ceil(2 * 60),
    'the retargeted grudge arms its own window on the remade record');
});

test('the hold never sets on a non-grudge activity in the first place', () => {
  const rt = new CombatDoctrineRuntime({ seed: 7 });
  const perception = {
    self: selfWith({ kind: 'attack_run', reason: 'squad_call', targetId: 42, startedTick: 10 }),
    contacts: [hostile(42)],
  };
  tick(rt, 20, 9, perception);
  assert.equal(rt.byEntity.get(9).holdUntilTick, null);
});
