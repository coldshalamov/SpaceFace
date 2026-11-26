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
  assert.deepEqual(PILOT_BINDINGS.brake, ['KeyX']);
  assert.deepEqual(PILOT_BINDINGS.fire, []);
  // CONTROLLER-1: RT fire, LT the Line, RB boost, L3 brake, the fight three under the right
  // thumb (A shove, Y pull, B bomb), X dock — and the shift layer holds the rest.
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.fire, ['r2']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.brake, ['l3']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.massline, ['l2']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.accept, ['accept']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.shove, ['accept']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.pull, ['alt']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.bomb, ['cancel']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.dock, ['action']);
  const six = {
    thrust: 'stick',
    aim: 'stick',
    rope: GAMEPAD_DEFAULT_BINDINGS.massline[0],
    pull: GAMEPAD_DEFAULT_BINDINGS.pull[0],
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
  const swarmControls = readFileSync(resolve(ROOT, 'src/data/swarmControls.js'), 'utf8');
  assert.equal(swarmControls.includes("tether: Object.freeze(['KeyF'])"), true);
  assert.equal(input.includes("bomb: ['Digit4']"), true);
});
