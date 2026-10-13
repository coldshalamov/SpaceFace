import test from 'node:test';
import assert from 'node:assert/strict';
import { ContactKind, ManeuverKind, hashUnit } from '../src/ai/contracts.js';
import { createReflexEngine, emptyReflexState, REFLEX_KIND } from '../src/ai/reflexes.js';

const SEED = 4242;
const temperament = { verve: 0.8, poise: 0.5, weave: 0.7, dash: 0.9, aim: 0.3 };
const self = { id: 1, team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  rot: 0, radius: 12, hullFraction: 1, heatFraction: 0, operationalMassBand: 'light' };
const bodyIds = [];
for (let id = 1; bodyIds.length < 5; id++) {
  const name = `pod-${id}`;
  if (hashUnit(SEED, 1, name, 'body_dodge_notice') < 0.594) bodyIds.push(name);
}

function contactsAt(tick) {
  return [1, 0.9, 0.8, 0.7, 0.45].map((eta, index) => ({
    id: bodyIds[index], kind: ContactKind.OBJECTIVE, alive: true, radius: 14,
    pos: { x: 400 * (eta - tick / 60), z: 0 }, vel: { x: -400, z: 0 },
  }));
}

test('a crowded field gives the most imminent thrown body a finite reaction clock', () => {
  const engine = createReflexEngine({ seed: SEED });
  const rs = emptyReflexState();
  let first = null;
  for (let tick = 0; tick <= 16; tick += 2) {
    const reflex = engine.evaluate({ entityId: 1, tick, self, contacts: contactsAt(tick),
      intent: { kind: ManeuverKind.INTERCEPT }, temperament, reflexState: rs,
      bodyDodgeOnly: true });
    assert.ok(rs.bodyWatch.size <= 4, 'perception remains bounded');
    if (reflex && !first) first = { tick, reflex };
  }
  assert.ok(first, 'the fifth contact must not starve the most imminent threat');
  assert.equal(first.reflex.kind, REFLEX_KIND.BODY_DODGE);
  assert.equal(first.tick, 10, 'the existing reaction delay is retained');
});

test('reordering sensor contacts does not restart the imminent body reaction', () => {
  const engine = createReflexEngine({ seed: SEED });
  const rs = emptyReflexState();
  let reflex;
  for (let tick = 0; tick <= 10; tick += 2) {
    const contacts = contactsAt(tick);
    if (tick % 4 === 0) contacts.reverse();
    reflex = engine.evaluate({ entityId: 1, tick, self, contacts,
      intent: { kind: ManeuverKind.INTERCEPT }, temperament, reflexState: rs,
      bodyDodgeOnly: true });
  }
  assert.equal(reflex?.kind, REFLEX_KIND.BODY_DODGE);
});
