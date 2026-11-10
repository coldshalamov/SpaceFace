import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_CONTRACT_VERSION } from '../src/ai/contracts.js';
import { AIInspectionEndpoint } from '../src/ai/inspection.js';
import { TacticalAIStack } from '../src/ai/stack.js';

function makeStack() {
  return new TacticalAIStack({
    seed: 47,
    ports: {
      sensors: { frameFor() { return null; } },
      actions: {
        list() { return []; },
        canStart() { return { ok: true }; },
        start() { return null; },
        status() { return null; },
        interrupt() {},
        forget() {},
      },
      maneuver: { request() {} },
      roster: { listSquads() { return []; } },
    },
    config: { trace: { enabled: true, layers: ['behavior'], capacity: 64 } },
  });
}

test('the inspection endpoint serves contract, inspect, and rejects unknown methods', () => {
  const stack = makeStack();
  const endpoint = new AIInspectionEndpoint(stack);

  const contract = endpoint.handle({ method: 'ai.contract' });
  assert.equal(contract.ok, true);
  assert.equal(contract.version, AI_CONTRACT_VERSION);
  assert.ok(contract.result.methods.includes('ai.inspect'));
  assert.ok(contract.result.methods.includes('ai.trace'));
  assert.deepEqual([...contract.result.layers], ['director', 'squad', 'utility', 'behavior', 'maneuver']);

  const inspect = endpoint.handle({ method: 'ai.inspect', params: {} });
  assert.equal(inspect.ok, true);
  assert.equal(inspect.result.version, AI_CONTRACT_VERSION);
  assert.equal(inspect.result.dependencyContract.actions, 'SG-03 ActionDef port only');
  assert.ok(inspect.result.director);

  const missing = endpoint.handle({ method: 'ai.hackWorld' });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'AI_METHOD_NOT_FOUND');
});

test('construction fails closed without a tactical stack inspect surface', () => {
  assert.throws(() => new AIInspectionEndpoint({}), /TacticalAIStack/);
});
