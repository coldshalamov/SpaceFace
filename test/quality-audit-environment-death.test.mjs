// Quality audit 1: an environmental death never borrows a ship's tell or a phantom weapon.
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeathTelegraph } from '../src/systems/survivalResults.js';
import { killChainRows } from '../src/ui/screens/crucible.js';

const envReceipt = { killerId: null, source: { kind: 'environment', entityId: null, label: 'Environmental hazard' } };

test('environmental death does not adopt another ship\'s engine flare as its tell', () => {
  const t = resolveDeathTelegraph({
    receipt: envReceipt,
    telegraphTrail: [{ simTime: 9, attackerId: 42, kind: 'engine_flare' }],
    damageTrail: [{ simTime: 9.5, attackerId: 42, weaponId: 'wpn_x' }],
    deathSimTime: 10,
  });
  assert.equal(t.name, null);
  assert.equal(t.source, 'unrecorded');
});

test('an unknown (non-environment) killer still names the latest tell', () => {
  const t = resolveDeathTelegraph({
    receipt: { killerId: null, source: { kind: 'unknown' } },
    telegraphTrail: [{ simTime: 9, attackerId: 42, kind: 'engine_flare' }],
    deathSimTime: 10,
  });
  assert.equal(t.source, 'witnessed');
});

test('environmental kill chain reads Impact, not Unidentified weapon', () => {
  const rows = new Map(killChainRows({ attacker: 'Environmental hazard', source: envReceipt.source }));
  assert.equal(rows.get('Its weapon'), 'Impact');
  assert.equal(new Map(killChainRows({ attacker: 'Wasp' })).get('Its weapon'), 'Unidentified weapon');
});
