#!/usr/bin/env node
import assert from 'node:assert/strict';

import { controlPrompt } from '../src/ui/controlPrompts.js';

const firstStationPrompts = [
  ['kbm', 'keyboard/mouse'],
  ['gamepad', 'gamepad'],
  ['touch', 'touch'],
];

for (const [modality, label] of firstStationPrompts) {
  const prompt = controlPrompt('firstStation', modality);
  assert.match(prompt, /Departure Check/, `${label} first-station prompt should teach the pre-undock Departure Check`);
  assert.match(prompt, /undock/i, `${label} first-station prompt should pair Departure Check with undocking`);
}

assert.match(
  controlPrompt('firstStation', 'kbm'),
  /Departure Check shows what needs attention before .*\/Escape undocks/,
  'keyboard/mouse prompt should point to the readiness gate before E/Escape undock',
);
assert.match(
  controlPrompt('firstStation', 'gamepad'),
  /Departure Check shows what needs attention before B undocks/,
  'gamepad prompt should point to the readiness gate before B undocks',
);
assert.match(
  controlPrompt('firstStation', 'touch'),
  /Departure Check looks safe/,
  'touch prompt should keep the existing Departure Check safety language',
);

console.log('Departure Check prompt parity OK');
