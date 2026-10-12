import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLegacyFireIntentMutation } from '../scripts/lib/aiIntentOwnership.mjs';

test('firing ownership guard permits reads and all equality comparisons', () => {
  for (const source of ['data.intent.fire === true', 'intent.fire == false', 'intent.fire !== true', 'intent.fire != null', 'data.intent.fireGroup === 1', 'result.fire.authorized = data.intent.fire === true']) {
    assert.equal(hasLegacyFireIntentMutation(source), false, source);
  }
});
test('firing ownership guard rejects direct and compound mutations, including disarm', () => {
  for (const field of ['fire', 'fireGroup']) {
    for (const op of ['=', '+=', '-=', '*=', '/=', '%=', '**=', '&&=', '||=', '??=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '++', '--']) {
      const source = `data.intent . ${field} ${op}${['++', '--'].includes(op) ? '' : ' false'}`;
      assert.equal(hasLegacyFireIntentMutation(source), true, source);
    }
    for (const source of [`++data.intent.${field}`, `--intent.${field}`]) assert.equal(hasLegacyFireIntentMutation(source), true, source);
  }
});
