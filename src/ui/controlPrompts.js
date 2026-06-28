import { BINDINGS } from './bindings.js';

const KBM_PROMPTS = Object.freeze({
  flight: `W/Up thrust  •  A D steer  •  Mouse aim  •  LMB/Space fire  •  RMB mine  •  Shift boost  •  Tab target  •  ${BINDINGS.localmap.label} local map  •  ${BINDINGS.starmap.label} star map  •  ${BINDINGS.codex.label} codex  •  I cargo  •  L comms`,
  mining: 'RMB hold to mine  •  Release to cool  •  Fly through cargo drift  •  B drill view  •  Tab next signal',
  combat: 'LMB/Space fire  •  Mouse aim at target  •  Tab cycle targets  •  F auto-fire  •  Shift boost to dodge',
  station: `${BINDINGS.dock.label} dock  •  Market: audit cargo  •  Shipyard: buy ships  •  Missions: take contracts`,
  gate: `${BINDINGS.starmap.label} open Star Map  •  Select destination  •  Jump to travel between systems`,
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. W / Up thrusts, A D / arrows steer, and the mouse aims.',
  tutorialMine: 'The Kestrel is armed: LMB or Space fires the Pulse Laser S. Hold RMB on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: `Follow the cyan station arrow. Press ${BINDINGS.dock.label} at the dock prompt. Bring the discrepancy back before someone edits it out.`,
  firstFlight: `W/Up to thrust, A D/arrows to steer, Mouse to aim, LMB/Space fires the Pulse Laser S, RMB mines marked rocks, Shift boosts, ${BINDINGS.localmap.label} opens the local map, ${BINDINGS.starmap.label} opens the star map, ${BINDINGS.codex.label} opens the codex, ${BINDINGS.dock.label} docks.`,
  firstCombat: 'Hostile detected! LMB or Space to fire. Hold aim on a target to lock on. F toggles auto-fire.',
  firstStation: `Stations offer repairs, trading, upgrades, and mission boards. Press ${BINDINGS.dock.label} to dock.`,
  firstGate: `Jump gates connect star systems. Open the Star Map (${BINDINGS.starmap.label}) to plot a jump route.`,
});

const GAMEPAD_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  RT fire  •  LT mine  •  RB boost  •  LB brake  •  A dock  •  X target  •  Y codex  •  View star map  •  Start pause',
  mining: 'LT hold to mine  •  Release to cool  •  Fly through cargo drift  •  X next signal',
  combat: 'RT fire  •  Right stick aim at target  •  X cycle targets  •  RB boost to dodge  •  Start pause',
  station: 'A dock  •  Market: audit cargo  •  Shipyard: buy ships  •  Missions: take contracts',
  gate: 'View open Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Kestrel is armed: RT fires the Pulse Laser S. Hold LT on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Press A at the dock prompt. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'Left stick flies, right stick aims, RT fires the Pulse Laser S, LT mines marked rocks, RB boosts, Y opens the codex, View opens the star map, and A docks.',
  firstCombat: 'Hostile detected! RT to fire. Hold right-stick aim on a target to lock on. X cycles targets.',
  firstStation: 'Stations offer repairs, trading, upgrades, and mission boards. Press A to dock.',
  firstGate: 'Jump gates connect star systems. Press View to open the Star Map and plot a jump route.',
});

const TOUCH_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  Fire button  •  Mine button  •  Boost button  •  Touch UI buttons for menus',
  mining: 'Mine button hold to mine  •  Release to cool  •  Fly through cargo drift  •  Touch target controls for signals',
  combat: 'Fire button  •  Right stick aim at target  •  Boost button to dodge',
  station: `${BINDINGS.dock.label} dock  •  Market: audit cargo  •  Shipyard: buy ships  •  Missions: take contracts`,
  gate: `${BINDINGS.starmap.label} open Star Map  •  Select destination  •  Jump to travel between systems`,
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Kestrel is armed: Fire shoots the Pulse Laser S. Hold Mine on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: `Follow the cyan station arrow. Press ${BINDINGS.dock.label} at the dock prompt. Bring the discrepancy back before someone edits it out.`,
  firstFlight: `Left stick flies, right stick aims, Fire shoots, Mine mines marked rocks, Boost dashes, ${BINDINGS.localmap.label} opens the local map, ${BINDINGS.starmap.label} opens the star map, ${BINDINGS.dock.label} docks.`,
  firstCombat: 'Hostile detected! Fire to shoot. Hold right-stick aim on a target to lock on.',
  firstStation: `Stations offer repairs, trading, upgrades, and mission boards. Press ${BINDINGS.dock.label} to dock.`,
  firstGate: `Jump gates connect star systems. Open the Star Map (${BINDINGS.starmap.label}) to plot a jump route.`,
});

export const CONTROL_PROMPTS = Object.freeze({
  kbm: KBM_PROMPTS,
  gamepad: GAMEPAD_PROMPTS,
  touch: TOUCH_PROMPTS,
});

export function currentPromptModality(ctx = {}) {
  const touchConnected = !!(ctx.touch && typeof ctx.touch.isConnected === 'function' && ctx.touch.isConnected());
  const gamepadConnected = !!(ctx.gamepad && typeof ctx.gamepad.isConnected === 'function' && ctx.gamepad.isConnected());
  if (touchConnected && gamepadConnected) {
    return ((ctx.gamepad.lastActiveMs || 0) >= (ctx.touch.lastActiveMs || 0)) ? 'gamepad' : 'touch';
  }
  if (gamepadConnected) return 'gamepad';
  if (touchConnected) return 'touch';
  return 'kbm';
}

export function controlPrompt(key, modality = 'kbm') {
  const prompts = CONTROL_PROMPTS[modality] || CONTROL_PROMPTS.kbm;
  return prompts[key] || CONTROL_PROMPTS.kbm[key] || '';
}
