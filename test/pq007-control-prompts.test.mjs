import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTROL_PROMPTS,
  controlPrompt,
  setPromptScheme,
} from '../src/ui/controlPrompts.js';

const CLASSIC_KBM = Object.freeze({
  flight: 'W/Up thrust  •  0 or S/Down brake  •  A D steer  •  Mouse aim  •  LMB fire  •  Space/F Massline  •  4 anchor seed  •  RMB mine  •  B selected Site beam  •  Shift boost  •  X countermeasure  •  Tab target  •  M local map  •  N star map  •  J log  •  K codex  •  I cargo  •  L comms',
  mining: 'RMB hold to mine  •  B beam selected Site  •  Release to cool  •  Fly through cargo drift  •  B drill view  •  Tab next signal',
  combat: 'LMB fire  •  Space/F Massline  •  Mouse aim at target  •  Tab cycle hostiles  •  X countermeasure  •  G auto-target  •  Shift boost to dodge',
  station: 'E dock  •  Hub: arrow keys change tabs  •  Enter/Space act  •  E/Esc undock',
  gate: 'N open Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. W / Up thrusts, A D / arrows steer, and the mouse aims.',
  tutorialMine: 'The Hitch is armed: LMB fires the Pulse Laser S. Hold RMB on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Press E at the dock prompt. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'W thrusts. A D steer. Mouse aims.',
  firstCombat: 'Fire with LMB. Space/F controls the Massline. G toggles auto-target.',
  firstStation: 'Review Departure Check before E or Escape undocks.',
  firstGate: 'Open the Star Map (N). Plot a gate route.',
});

const SCHEME_OVERRIDES = Object.freeze({
  classic: Object.freeze({}),
  'helm-assist': Object.freeze({
    flight: 'Mouse steer+aim  •  W thrust  •  0 or S/Down brake  •  A D strafe  •  LMB fire  •  RMB mine  •  Shift boost  •  Space/F Massline  •  4 anchor seed  •  G auto-target  •  Draw with pointer to fly; pause to clutch  •  Tab target  •  M map  •  N chart',
    combat: 'G auto-target (guns track lock)  •  Draw with pointer to fly; pause to clutch  •  Space/F Massline  •  LMB fire  •  0 or S/Down brake',
    tutorialFlight: 'Follow the yellow nav arrow. Nose follows the mouse — W thrusts, 0 or S/Down brakes, Space/F controls the Massline.',
    firstFlight: 'Nose follows the mouse. W thrusts. 0 or S/Down brakes to a stop.',
    firstCombat: 'G toggles auto-target. Guns track lock.',
  }),
  pilot: Object.freeze({
    flight: 'W thrust  •  0 or S/Down brake  •  A D turn  •  Mouse aim  •  LMB fire  •  G auto-target  •  Draw with pointer to fly; pause to clutch  •  Space/F Massline  •  4 anchor seed  •  Shift boost  •  Tab target  •  M map  •  N chart',
    combat: 'G auto-target (guns track lock)  •  Draw with pointer to fly; pause to clutch  •  Space/F Massline  •  LMB fire',
    tutorialFlight: 'Follow the yellow nav arrow. W thrusts; 0 or S/Down brakes; A/D turns; mouse aims; Space/F controls the Massline.',
    firstFlight: 'W thrusts. 0 or S/Down brakes to a stop. A D turn. Mouse aims.',
    firstCombat: 'G toggles auto-target. Guns track lock.',
  }),
});

const PRESERVED_NON_KBM = Object.freeze({
  gamepad: Object.freeze({
    flight: 'Left stick fly  •  Right stick aim  •  RT fire  •  LT mine / selected Site beam  •  RB boost  •  LB brake  •  R3 countermeasure  •  A/Cross Massline (dock/accept when prompted)  •  X target  •  View star map  •  Y codex  •  Start → Pause → Mission Log',
    mining: 'LT hold to mine  •  Release to cool  •  Fly through cargo drift  •  X next signal',
    combat: 'RT fire  •  Right stick aim at target  •  X cycle targets  •  R3 countermeasure  •  RB boost to dodge  •  Start pause',
    station: 'A dock  •  Hub: LB/RB tabs  •  D-pad/left stick focus  •  A act  •  B undock',
    gate: 'View open Star Map  •  Select destination  •  Jump to travel between systems',
    tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
    tutorialMine: 'The Hitch is armed: RT fires the Pulse Laser S. Hold LT on the marked rock to mine the mass reading, then collect the drift.',
    tutorialDock: 'Follow the cyan station arrow. Press A at the dock prompt. Bring the discrepancy back before someone edits it out.',
    firstFlight: 'Left stick flies. Right stick aims.',
    firstCombat: 'Fire with RT. X cycles targets.',
    firstStation: 'Review Departure Check before B undocks.',
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
