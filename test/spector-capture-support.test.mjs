import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';

import {
  resolveSpectorBundlePath,
  summarizeSpectorCapture,
} from '../scripts/lib/spectorCapture.mjs';

test('the repeatable visual-acceptance pipeline ships a local Spector bundle', () => {
  const bundle = resolveSpectorBundlePath();
  assert.equal(existsSync(bundle), true);
  assert.match(bundle.replaceAll('\\', '/'), /spectorjs\/dist\/spector\.bundle\.js$/);
});

test('Spector summaries retain named draw-call and context evidence', () => {
  const summary = summarizeSpectorCapture({
    context: { version: 'WebGL 2.0' },
    commands: [
      { name: 'clear' },
      { name: 'drawElements', program: 'SpaceFaceBolt:pulse-core', texture: 'rock_normal.png' },
      { commandName: 'drawArrays' },
      { command: { name: 'drawElementsInstanced' } },
    ],
  });
  assert.equal(summary.commandCount, 4);
  assert.equal(summary.drawCallCount, 3);
  assert.deepEqual(summary.drawCallsByName, { drawElements: 1, drawArrays: 1, drawElementsInstanced: 1 });
  assert.equal(summary.context.version, 'WebGL 2.0');
});
