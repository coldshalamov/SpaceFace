import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTROL_PROMPTS,
  controlPrompt,
  setPromptScheme,
} from '../src/ui/controlPrompts.js';

// The keyboard families teach the live bindings. The Line phrase is exactly "Line: hook, swing, throw"
// (director 2026-11-23). Unbound verbs are omitted, so the strings follow the keys that are bound now.
const CLASSIC_KBM = Object.freeze({
  flight: 'W/Up thrust  •  X or S/Down brake  •  A D steer  •  Mouse aim  •  LMB fire  •  F Line: hook, swing, throw  •  2 shove  •  3 pin  •  G select · hold to use  •  Shift boost  •  Tab target  •  M local map  •  N star map  •  J log  •  K codex  •  I cargo  •  L comms',
  mining: 'G select · hold to mine  •  Release to cool  •  Fly through cargo drift  •  F tether, then B enter asteroid  •  Tab next signal',
  combat: 'LMB fire  •  F Line: hook, swing, throw  •  2 shove  •  Mouse aim at target  •  Tab cycle hostiles  •  4 bomb  •  Shift boost to dodge',
  station: 'E dock  •  Hub: arrow keys change tabs  •  Enter/Space act  •  E/Esc undock',
  gate: 'N open Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. W / Up thrusts, A D steer, and the mouse aims.',
  tutorialMine: 'The Hitch is armed: LMB fires the Pulse Laser S. Hold G on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Press E at the dock prompt. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'W thrusts. A D steer. Mouse aims.',
  firstCombat: 'Fire with LMB. F Line: hook, swing, throw. 2 shove.',
  firstStation: 'Review Departure Check before E or Escape undocks.',
  firstGate: 'Open the Star Map (N). Plot a gate route.',
});

const SCHEME_OVERRIDES = Object.freeze({
  classic: Object.freeze({}),
  'helm-assist': Object.freeze({
    flight: 'Mouse steer+aim  •  W thrust  •  X or S/Down brake  •  A D strafe  •  LMB fire  •  G select · hold to use  •  Shift boost  •  F Line: hook, swing, throw  •  2 shove  •  3 pin  •  Draw with pointer to fly; pause to clutch  •  Tab target  •  M map  •  N chart',
    combat: 'Draw with pointer to fly; pause to clutch  •  F Line: hook, swing, throw  •  2 shove  •  LMB fire  •  X or S/Down brake  •  4 bomb',
    tutorialFlight: 'Follow the yellow nav arrow. Nose follows the mouse — W thrusts, X or S/Down brakes, F Line: hook, swing, throw.',
    firstFlight: 'Nose follows the mouse. W thrusts. X or S/Down brakes to a stop.',
    firstCombat: 'F Line: hook, swing, throw. 2 shove. Guns track lock.',
  }),
  pilot: Object.freeze({
    flight: 'W thrust  •  X or S/Down brake  •  A D turn  •  Mouse aim  •  LMB fire  •  G select · hold to use  •  Draw with pointer to fly; pause to clutch  •  F Line: hook, swing, throw  •  2 shove  •  3 pin  •  Shift boost  •  Tab target  •  M map  •  N chart',
    combat: 'Draw with pointer to fly; pause to clutch  •  F Line: hook, swing, throw  •  2 shove  •  LMB fire  •  4 bomb',
    tutorialFlight: 'Follow the yellow nav arrow. W thrusts; X or S/Down brakes; A/D turns; mouse aims; F Line: hook, swing, throw.',
    firstFlight: 'W thrusts. X or S/Down brakes to a stop. A D turn. Mouse aims.',
    firstCombat: 'F Line: hook, swing, throw. 2 shove. Guns track lock.',
  }),
});

// The gamepad family reads live glyphs from the bindings (6ff452c31 / 2f0604176): the default pad names
// the pause button Menu and the Massline A; a connected PlayStation pad reads its own glyphs at runtime.
const PRESERVED_NON_KBM = Object.freeze({
  gamepad: Object.freeze({
    flight: 'Left stick fly  •  Right stick aim  •  RT fire  •  D-Pad Left mine / selected Site beam  •  RB boost  •  L3 brake  •  A shove  •  LT Line: hook, swing, throw  •  X dock when prompted  •  R3 target  •  View star map  •  Menu → Pause → Mission Log',
    mining: 'D-Pad Left hold to mine  •  Release to cool  •  Fly through cargo drift  •  R3 next signal',
    combat: 'RT fire  •  Right stick aim at target  •  R3 cycle targets  •  B bomb  •  RB boost to dodge  •  Menu pause',
    station: 'X dock when prompted  •  Hub: LB/RB tabs  •  D-pad/left stick focus  •  A act  •  B leave once aboard',
    gate: 'View open Star Map  •  Select destination  •  Jump to travel between systems',
    tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
    tutorialMine: 'The Hitch is armed: RT fires the Pulse Laser S. Hold D-Pad Left on the marked rock to mine the mass reading, then collect the drift.',
    tutorialDock: 'Follow the cyan station arrow. Press X at the dock prompt. Bring the discrepancy back before someone edits it out.',
    firstFlight: 'Left stick flies. Right stick aims.',
    firstCombat: 'Fire with RT. R3 cycles targets.',
    firstStation: 'Review Departure Check before X undocks.',
    firstGate: 'Open the Star Map with View. Plot a gate route.',
  }),
  touch: Object.freeze({
    flight: 'Left stick fly  •  Right stick aim  •  Fire button  •  Mine button  •  Boost button  •  Dock/Map/Log/Star/Pause buttons',
    mining: 'Mine button hold to mine  •  Release to cool  •  Fly through cargo drift  •  Touch target controls for signals',
    combat: 'Fire button  •  Right stick aim at target  •  Boost button to dodge',
    station: 'Dock button docks near stations  •  Hub: tap tabs/actions  •  Tap Undock when ready',
    gate: 'Star button opens Star Map  •  Select destination  •  Jump to travel between systems',
    tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
    tutorialMine: 'The Hitch is armed: Fire shoots the Pulse Laser S. Hold Mine on the marked rock to mine the mass reading, then collect the drift.',
    tutorialDock: 'Follow the cyan station arrow. Tap Dock when the station prompt appears. Bring the discrepancy back before someone edits it out.',
    firstFlight: 'Left stick flies. Right stick aims.',
    firstCombat: 'Tap Fire. Aim with the right stick.',
    firstStation: 'Review Departure Check, then tap Undock.',
    firstGate: 'Tap Star. Plot a gate route.',
  }),
});

function promptFamily(scheme) {
  setPromptScheme(scheme);
  return Object.fromEntries(
    Object.keys(CLASSIC_KBM).map((key) => [key, controlPrompt(key, 'kbm')]),
  );
}

test('all active keyboard prompt families teach the shipped control semantics', () => {
  for (const scheme of ['classic', 'helm-assist', 'pilot']) {
    assert.deepEqual(
      promptFamily(scheme),
      { ...CLASSIC_KBM, ...SCHEME_OVERRIDES[scheme] },
      `${scheme} keyboard prompts must remain complete and truthful`,
    );
  }
});

test('Pilot and Helm prompts contain no rejected pursuit-slot teaching', () => {
  const rejected = /MMB[^•]*(?:pursue|course)|pursue locked ship|flight keys break pursuit/i;
  for (const scheme of ['helm-assist', 'pilot']) {
    const prompts = promptFamily(scheme);
    for (const [key, prompt] of Object.entries(prompts)) {
      assert.doesNotMatch(prompt, rejected, `${scheme}.${key} resurrects rejected pursuit copy`);
    }
  }
});

test('classic, gamepad, and touch prompt families remain unchanged', () => {
  assert.deepEqual(CONTROL_PROMPTS.kbm, CLASSIC_KBM);
  assert.deepEqual(CONTROL_PROMPTS.gamepad, PRESERVED_NON_KBM.gamepad);
  assert.deepEqual(CONTROL_PROMPTS.touch, PRESERVED_NON_KBM.touch);
});
