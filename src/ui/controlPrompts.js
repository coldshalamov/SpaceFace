import { BINDINGS } from './bindings.js';

const KBM_PROMPTS = Object.freeze({
  flight: `W/Up thrust  •  A D steer  •  Mouse aim  •  LMB/Space fire  •  RMB mine  •  Shift boost  •  X countermeasure  •  Tab target  •  ${BINDINGS.localmap.label} local map  •  ${BINDINGS.starmap.label} star map  •  ${BINDINGS.missionLog.label} log  •  ${BINDINGS.codex.label} codex  •  ${BINDINGS.cargo.label} cargo  •  ${BINDINGS.comms.label} comms`,
  mining: `RMB hold to mine  •  Release to cool  •  Fly through cargo drift  •  ${BINDINGS.drill.label} drill view  •  Tab next signal`,
  combat: 'LMB/Space fire  •  Mouse aim at target  •  Tab cycle hostiles  •  X countermeasure  •  G auto-target  •  Shift boost to dodge',
  station: `${BINDINGS.dock.label} dock  •  Hub: arrow keys change tabs  •  Enter/Space act  •  ${BINDINGS.dock.label}/Esc undock`,
  gate: `${BINDINGS.starmap.label} open Star Map  •  Select destination  •  Jump to travel between systems`,
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. W / Up thrusts, A D / arrows steer, and the mouse aims.',
  tutorialMine: 'The Kestrel is armed: LMB or Space fires the Pulse Laser S. Hold RMB on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: `Follow the cyan station arrow. Press ${BINDINGS.dock.label} at the dock prompt. Bring the discrepancy back before someone edits it out.`,
  firstFlight: 'W thrusts. A D steer. Mouse aims.',
  firstCombat: 'Fire with LMB or Space. G toggles auto-target.',
  firstStation: `Review Departure Check before ${BINDINGS.dock.label} or Escape undocks.`,
  firstGate: `Open the Star Map (${BINDINGS.starmap.label}). Plot a gate route.`,
});

const GAMEPAD_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  RT fire  •  LT mine  •  RB boost  •  LB brake  •  R3 countermeasure  •  A dock  •  X target  •  View star map  •  Y codex  •  Start → Pause → Mission Log',
  mining: 'LT hold to mine  •  Release to cool  •  Fly through cargo drift  •  X next signal',
  combat: 'RT fire  •  Right stick aim at target  •  X cycle targets  •  R3 countermeasure  •  RB boost to dodge  •  Start pause',
  station: 'A dock  •  Hub: LB/RB tabs  •  D-pad/left stick focus  •  A act  •  B undock',
  gate: 'View open Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Kestrel is armed: RT fires the Pulse Laser S. Hold LT on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Press A at the dock prompt. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'Left stick flies. Right stick aims.',
  firstCombat: 'Fire with RT. X cycles targets.',
  firstStation: 'Review Departure Check before B undocks.',
  firstGate: 'Open the Star Map with View. Plot a gate route.',
});

const TOUCH_PROMPTS = Object.freeze({
  flight: 'Left stick fly  •  Right stick aim  •  Fire button  •  Mine button  •  Boost button  •  Dock/Map/Log/Star/Pause buttons',
  mining: 'Mine button hold to mine  •  Release to cool  •  Fly through cargo drift  •  Touch target controls for signals',
  combat: 'Fire button  •  Right stick aim at target  •  Boost button to dodge',
  station: 'Dock button docks near stations  •  Hub: tap tabs/actions  •  Tap Undock when ready',
  gate: 'Star button opens Star Map  •  Select destination  •  Jump to travel between systems',
  tutorialFlight: 'Follow the yellow nav arrow to the bad reading. Left stick flies and right stick aims.',
  tutorialMine: 'The Kestrel is armed: Fire shoots the Pulse Laser S. Hold Mine on the marked rock to mine the mass reading, then collect the drift.',
  tutorialDock: 'Follow the cyan station arrow. Tap Dock when the station prompt appears. Bring the discrepancy back before someone edits it out.',
  firstFlight: 'Left stick flies. Right stick aims.',
  firstCombat: 'Tap Fire. Aim with the right stick.',
  firstStation: 'Review Departure Check, then tap Undock.',
  firstGate: 'Tap Star. Plot a gate route.',
});

// HELM ASSIST (GDD §4.1, the 2.0 default scheme) — kbm copy for "the nose follows the mouse".
// Only keys whose copy mentions movement are overridden; everything else falls through to the
// classic table. Keep verbs honest: don't promise mechanics that haven't shipped.
// Neutral massline/tether verbs only — no hard-coded F (rebindable; static prompts cannot resolve live labels).
const KBM_HELM_OVERRIDES = Object.freeze({
  flight: `Mouse steer+aim  •  W thrust  •  S reverse  •  A D strafe  •  Space brake  •  LMB fire  •  RMB mine  •  Shift boost  •  massline  •  MMB course/pursue  •  G auto-target  •  Tab target  •  ${BINDINGS.localmap.label} map  •  ${BINDINGS.starmap.label} chart`,
  combat: 'G auto-target (guns track lock)  •  MMB pursue locked ship  •  massline (soft latch; flyby focus expands it)  •  LMB fire  •  Space brake',
  tutorialFlight: 'Follow the yellow nav arrow. Nose follows the mouse — W thrusts, Space brakes. Massline latches soft targets.',
  firstFlight: 'Nose follows the mouse. W thrusts. Space brakes.',
  firstCombat: 'G toggles auto-target. Guns track lock.',
});

// PILOT (the default scheme) — keyboard flies, mouse fights. Same override-only policy as helm.
const KBM_PILOT_OVERRIDES = Object.freeze({
  flight: `W thrust  •  A D turn  •  Space brake  •  Mouse aim  •  LMB fire  •  MMB pursue/course  •  G auto-target  •  massline  •  Shift boost  •  Tab target  •  ${BINDINGS.localmap.label} map  •  ${BINDINGS.starmap.label} chart`,
  combat: 'MMB pursue locked ship  •  G auto-target  •  massline (flyby focus expands latch)  •  LMB fire  •  flight keys break pursuit',
  tutorialFlight: 'Follow the yellow nav arrow. W thrusts; A/D turn; Space brakes; mouse aims; massline latches soft targets.',
  firstFlight: 'W thrusts. A D turn. Space brakes. Mouse aims.',
  firstCombat: 'G toggles auto-target. Guns track lock.',
});

// Active kbm scheme — uiRoot keeps this current from settings (boot + settings:changed).
let _kbmScheme = 'pilot';
export function setPromptScheme(scheme) {
  _kbmScheme = (scheme === 'classic' || scheme === 'helm-assist' || scheme === 'pilot') ? scheme : 'pilot';
}

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
  if (modality === 'kbm' || !CONTROL_PROMPTS[modality]) {
    if (_kbmScheme === 'helm-assist' && KBM_HELM_OVERRIDES[key]) return KBM_HELM_OVERRIDES[key];
    if (_kbmScheme === 'pilot' && KBM_PILOT_OVERRIDES[key]) return KBM_PILOT_OVERRIDES[key];
  }
  const prompts = CONTROL_PROMPTS[modality] || CONTROL_PROMPTS.kbm;
  return prompts[key] || CONTROL_PROMPTS.kbm[key] || '';
}
