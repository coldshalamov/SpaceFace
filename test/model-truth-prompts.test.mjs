import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PILOT_BINDINGS } from '../src/systems/input.js';
import { GAMEPAD_DEFAULT_BINDINGS } from '../src/systems/gamepad.js';
import { controlPrompt, CONTROL_PROMPTS } from '../src/ui/controlPrompts.js';
import { promptLabel } from '../src/ui/bindings.js';

const ROOT = resolve(import.meta.dirname, '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name.endsWith('.js')) out.push(path);
    else if (!name.includes('.')) {
      try { walk(path, out); } catch { /* file */ }
    }
  }
  return out;
}

test('default controls are the live tables and six pad verbs do not share a button', () => {
  assert.deepEqual(PILOT_BINDINGS.forward, ['KeyW', 'ArrowUp']);
  assert.deepEqual(PILOT_BINDINGS.brake, ['Digit0']);
  assert.deepEqual(PILOT_BINDINGS.fire, []);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.fire, ['r2']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.brake, ['l1']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.massline, ['accept']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.accept, ['accept']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.deployRepulsor, ['alt']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.dock, ['cancel']);
  const six = {
    thrust: 'stick',
    brake: GAMEPAD_DEFAULT_BINDINGS.brake[0],
    rope: GAMEPAD_DEFAULT_BINDINGS.massline[0],
    shove: GAMEPAD_DEFAULT_BINDINGS.deployRepulsor[0],
    fire: GAMEPAD_DEFAULT_BINDINGS.fire[0],
    dock: GAMEPAD_DEFAULT_BINDINGS.dock[0],
  };
  const buttons = Object.values(six).filter((value) => value !== 'stick');
  assert.equal(new Set(buttons).size, buttons.length);
  assert.equal(promptLabel('dock').includes('E') || promptLabel('dock').includes('['), true);
});

test('live prompt strings do not hardcode Press E, W, A, or Y', () => {
  const files = walk(resolve(ROOT, 'src/ui'));
  const banned = /Press (E|W|A|Y)\b/;
  for (const file of files) {
    if (file.endsWith('bindings.js')) continue;
    const text = readFileSync(file, 'utf8');
    assert.equal(banned.test(text), false, file);
  }
  const strings = [];
  for (const key of Object.keys(CONTROL_PROMPTS.gamepad)) strings.push(controlPrompt(key, 'gamepad'));
  for (const key of Object.keys(CONTROL_PROMPTS.kbm)) strings.push(controlPrompt(key, 'kbm'));
  for (const line of strings) {
    const pressed = line.match(/Press ([EWAY])\b/);
    if (!pressed) continue;
    assert.equal(pressed[1], 'E', line);
  }
  const input = readFileSync(resolve(ROOT, 'src/systems/input.js'), 'utf8');
  assert.equal(input.includes("tether:         ['Space', 'KeyF', 'Digit3']"), true);
  assert.equal(input.includes("chargeThrow: ['KeyY', 'Digit1']"), true);
});
