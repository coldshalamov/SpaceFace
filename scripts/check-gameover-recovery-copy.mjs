#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(resolve(ROOT, 'src/ui/screens/gameOver.js'), 'utf8');

assert.match(source, /This is Ironman mode:/,
  'game over recovery copy should explicitly name Ironman mode');
assert.match(source, /Casual, Standard, and Veteran deaths use insurance respawn/,
  'game over recovery copy should explain why this screen has no retry button');
assert.match(source, /Main Menu \/ Load/,
  'game over screen should label the title-route as a load/recovery option');
assert.match(source, /aria-label', 'Return to title screen to continue or load another save'/,
  'Main Menu / Load button should have an accessible recovery label');
assert.match(source, /_defaultButton/,
  'game over screen should keep a default focus target for keyboard\/controller recovery');
assert.match(source, /focus\(\{ preventScroll: true \}\)/,
  'game over screen should focus the safe default action without scrolling');

console.log('Game Over recovery copy checks OK');
