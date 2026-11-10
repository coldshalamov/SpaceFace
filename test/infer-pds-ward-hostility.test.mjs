import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePdCharge } from '../src/ai/pdScreen.js';

function encounter(binding) {
  const escort = { id: 2, type: 'ship', alive: true, team: 1, mass: 30,
    pos: { x: 0, z: 0 }, data: { ai: { ...binding, retaliationTargetId: 3 } } };
  const attacker = { id: 3, type: 'ship', alive: true, team: 1, mass: 700,
    pos: { x: 100, z: 0 }, data: { ai: { squadId: 'screen', encounterRole: 'leader' } } };
  const ally = { id: 4, type: 'ship', alive: true, team: 1, mass: 80,
    pos: { x: -100, z: 0 }, data: { ai: { squadId: 'screen' } } };
  const entities = [escort, attacker, ally];
  const state = { playerId: 1, entities: new Map(entities.map(e => [e.id, e])), entityList: entities };
  return { state, escort, attacker, ally };
}

for (const [name, binding] of [
  ['explicit escort binding', { escortTargetId: 3 }],
  ['squad leader', { squadId: 'screen' }],
  ['highest-mass teammate fallback', {}],
]) {
  test(`a hostile incident target cannot remain the PD ward through ${name}`, () => {
    const h = encounter(binding);
    assert.equal(resolvePdCharge(h.escort, h.state), h.ally);
    delete h.escort.data.ai.retaliationTargetId;
    assert.equal(resolvePdCharge(h.escort, h.state), h.attacker, 'clearing the incident restores the authored ward priority');
  });
}

test('an explicit neutral civilian ward remains escortable across team numbers', () => {
  const h = encounter({ escortTargetId: 3 });
  h.attacker.team = 2;
  h.attacker.data.ai.passive = true;
  delete h.escort.data.ai.retaliationTargetId;
  assert.equal(resolvePdCharge(h.escort, h.state), h.attacker);
});
